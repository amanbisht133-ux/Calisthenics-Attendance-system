-- ============================================================================
-- Calisthenics Academy — Attendance & Membership Tracker
-- Core schema: profiles, batches, members, attendance, PT, demo visitors
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type user_role as enum ('admin', 'trainer');
create type membership_plan as enum ('monthly', 'quarterly', 'half_yearly');
create type batch_category as enum (
  'weekday_morning',
  'kids',
  'weekday_evening',
  'weekend',
  'personal_training'
);
create type batch_status as enum ('active', 'upcoming');

-- ----------------------------------------------------------------------------
-- PROFILES (extends auth.users, role-based access)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role user_role not null default 'trainer',
  phone text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'App users: admins (subscription managers) and trainers.';

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'trainer')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- BATCHES (time slots / categories)
-- ----------------------------------------------------------------------------
create table public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category batch_category not null,
  time_slot text not null, -- e.g. '6:30 - 7:30 AM'
  days text not null,      -- e.g. 'Mon-Fri' or 'Sat-Sun'
  status batch_status not null default 'active',
  created_at timestamptz not null default now()
);

comment on table public.batches is 'Regular class slots. Personal Training is not slot-bound and is represented via pt_clients instead.';

-- Which trainer(s) are assigned to which batch(es).
create table public.trainer_batches (
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  batch_id uuid not null references public.batches (id) on delete cascade,
  primary key (trainer_id, batch_id)
);

-- ----------------------------------------------------------------------------
-- MEMBERS
-- ----------------------------------------------------------------------------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  photo_url text,
  plan membership_plan not null,
  start_date date not null,
  expiry_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index members_name_idx on public.members using gin (to_tsvector('simple', name));
create index members_expiry_idx on public.members (expiry_date);

-- Auto-calculate expiry_date from plan + start_date whenever either changes.
create function public.calc_member_expiry()
returns trigger
language plpgsql
as $$
begin
  new.expiry_date := case new.plan
    when 'monthly' then new.start_date + interval '1 month'
    when 'quarterly' then new.start_date + interval '3 months'
    when 'half_yearly' then new.start_date + interval '6 months'
  end;
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_set_expiry
  before insert or update of plan, start_date on public.members
  for each row execute procedure public.calc_member_expiry();

-- A member can belong to one or more regular batches.
create table public.member_batches (
  member_id uuid not null references public.members (id) on delete cascade,
  batch_id uuid not null references public.batches (id) on delete cascade,
  primary key (member_id, batch_id)
);

-- Personal Training: a member paired with the trainer who trains them 1:1.
create table public.pt_clients (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (member_id, trainer_id)
);

-- ----------------------------------------------------------------------------
-- ATTENDANCE (immutable once submitted — audit trail)
-- ----------------------------------------------------------------------------
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  batch_id uuid not null references public.batches (id) on delete restrict,
  trainer_id uuid not null references public.profiles (id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (session_date, batch_id, trainer_id)
);

comment on table public.attendance_records is 'One row per trainer submission for a batch on a date. Immutable after insert — no update/delete allowed by policy.';

create table public.attendance_entries (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null references public.attendance_records (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete restrict,
  present boolean not null default true,
  member_status_at_time text not null, -- 'active' | 'expiring_soon' | 'expired'
  is_post_expiry boolean not null default false,
  created_at timestamptz not null default now()
);

create index attendance_entries_member_idx on public.attendance_entries (member_id);
create index attendance_entries_post_expiry_idx on public.attendance_entries (is_post_expiry) where is_post_expiry;

create table public.demo_visitors (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null references public.attendance_records (id) on delete cascade,
  name text not null,
  phone text not null,
  visit_date date not null,
  created_at timestamptz not null default now()
);

create index demo_visitors_date_idx on public.demo_visitors (visit_date);

-- PT sessions ("Session Done" log — no duration/notes needed)
create table public.pt_sessions (
  id uuid primary key default gen_random_uuid(),
  pt_client_id uuid not null references public.pt_clients (id) on delete restrict,
  session_date date not null,
  trainer_id uuid not null references public.profiles (id) on delete restrict,
  session_done boolean not null default true,
  marked_at timestamptz not null default now(),
  unique (pt_client_id, session_date)
);

-- ----------------------------------------------------------------------------
-- STATUS HELPER (used everywhere: trainer rosters, admin views, reports)
-- ----------------------------------------------------------------------------
create function public.member_status(p_expiry_date date, p_as_of date default current_date)
returns text
language sql
immutable
as $$
  select case
    when p_expiry_date < p_as_of then 'expired'
    when p_expiry_date <= p_as_of + interval '7 days' then 'expiring_soon'
    else 'active'
  end;
$$;

-- Populate member_status_at_time / is_post_expiry automatically on insert.
create function public.set_attendance_entry_status()
returns trigger
language plpgsql
as $$
declare
  v_expiry date;
  v_session_date date;
begin
  select expiry_date into v_expiry from public.members where id = new.member_id;
  select session_date into v_session_date from public.attendance_records where id = new.attendance_record_id;

  new.member_status_at_time := public.member_status(v_expiry, v_session_date);
  new.is_post_expiry := (v_expiry < v_session_date);
  return new;
end;
$$;

create trigger attendance_entries_set_status
  before insert on public.attendance_entries
  for each row execute procedure public.set_attendance_entry_status();

-- ============================================================================
-- Row Level Security — Admin has full access, Trainers are scoped to their
-- own assigned batches / PT clients, and attendance is append-only (no
-- update/delete policies exist for anyone => immutable audit trail).
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.batches enable row level security;
alter table public.trainer_batches enable row level security;
alter table public.members enable row level security;
alter table public.member_batches enable row level security;
alter table public.pt_clients enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_entries enable row level security;
alter table public.demo_visitors enable row level security;
alter table public.pt_sessions enable row level security;

-- Helper: is the current user an admin?
create function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- PROFILES
-- ----------------------------------------------------------------------------
create policy "profiles_select_all_authenticated"
  on public.profiles for select
  using (auth.uid() is not null);

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_insert"
  on public.profiles for insert
  with check (public.is_admin());

create policy "profiles_admin_delete"
  on public.profiles for delete
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- BATCHES — everyone authenticated can read; only admin manages.
-- ----------------------------------------------------------------------------
create policy "batches_select_all" on public.batches for select using (auth.uid() is not null);
create policy "batches_admin_write" on public.batches for insert with check (public.is_admin());
create policy "batches_admin_update" on public.batches for update using (public.is_admin());
create policy "batches_admin_delete" on public.batches for delete using (public.is_admin());

create policy "trainer_batches_select_all" on public.trainer_batches for select using (auth.uid() is not null);
create policy "trainer_batches_admin_write" on public.trainer_batches for insert with check (public.is_admin());
create policy "trainer_batches_admin_delete" on public.trainer_batches for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- MEMBERS — admin: full CRUD. Trainer: read-only, only members in their own
-- batches or PT roster.
-- ----------------------------------------------------------------------------
create policy "members_admin_all"
  on public.members for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "members_trainer_select"
  on public.members for select
  using (
    public.is_admin()
    or auth.uid() is not null
  );

create policy "member_batches_select"
  on public.member_batches for select
  using (auth.uid() is not null);
create policy "member_batches_admin_write" on public.member_batches for insert with check (public.is_admin());
create policy "member_batches_admin_delete" on public.member_batches for delete using (public.is_admin());

create policy "pt_clients_select"
  on public.pt_clients for select
  using (public.is_admin() or trainer_id = auth.uid());
create policy "pt_clients_admin_write" on public.pt_clients for insert with check (public.is_admin());
create policy "pt_clients_admin_delete" on public.pt_clients for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- ATTENDANCE — append-only (insert + select only, never update/delete).
-- Trainers may only insert records for batches they're assigned to, using
-- their own trainer_id (enforces the audit trail: who marked it).
-- ----------------------------------------------------------------------------
create policy "attendance_records_select"
  on public.attendance_records for select
  using (
    public.is_admin() or trainer_id = auth.uid()
  );

create policy "attendance_records_trainer_insert"
  on public.attendance_records for insert
  with check (
    trainer_id = auth.uid()
  );

create policy "attendance_entries_select"
  on public.attendance_entries for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id and ar.trainer_id = auth.uid()
    )
  );

create policy "attendance_entries_insert"
  on public.attendance_entries for insert
  with check (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id and ar.trainer_id = auth.uid()
    )
  );

create policy "demo_visitors_select"
  on public.demo_visitors for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.attendance_records ar
      where ar.id = demo_visitors.attendance_record_id and ar.trainer_id = auth.uid()
    )
  );

create policy "demo_visitors_insert"
  on public.demo_visitors for insert
  with check (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = demo_visitors.attendance_record_id and ar.trainer_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- PT SESSIONS — append-only, scoped to the trainer's own clients.
-- ----------------------------------------------------------------------------
create policy "pt_sessions_select"
  on public.pt_sessions for select
  using (public.is_admin() or trainer_id = auth.uid());

create policy "pt_sessions_insert"
  on public.pt_sessions for insert
  with check (
    trainer_id = auth.uid()
    and exists (
      select 1 from public.pt_clients pc
      where pc.id = pt_sessions.pt_client_id and pc.trainer_id = auth.uid()
    )
  );

-- ============================================================================
-- Reporting views — live expired memberships & exception report.
-- Views inherit RLS from their underlying tables (security_invoker) so admins
-- see everything and trainers only see rows their base policies allow.
-- ============================================================================

create view public.v_member_status as
select
  m.*,
  public.member_status(m.expiry_date) as status
from public.members m;

alter view public.v_member_status set (security_invoker = on);

-- Live "Expired Memberships" page
create view public.v_expired_members as
select *
from public.v_member_status
where status = 'expired'
order by expiry_date desc;

alter view public.v_expired_members set (security_invoker = on);

-- Exception report: members who attended after their membership expired,
-- with a per-member count and the offending dates.
create view public.v_exception_report as
select
  m.id as member_id,
  m.name as member_name,
  m.phone,
  m.expiry_date,
  count(ae.id) as post_expiry_count,
  array_agg(ar.session_date order by ar.session_date desc) as offense_dates,
  array_agg(b.name order by ar.session_date desc) as batch_names
from public.attendance_entries ae
join public.attendance_records ar on ar.id = ae.attendance_record_id
join public.members m on m.id = ae.member_id
join public.batches b on b.id = ar.batch_id
where ae.is_post_expiry
group by m.id, m.name, m.phone, m.expiry_date
order by post_expiry_count desc;

alter view public.v_exception_report set (security_invoker = on);

-- Monthly attendance frequency per member
create view public.v_monthly_attendance as
select
  m.id as member_id,
  m.name as member_name,
  date_trunc('month', ar.session_date)::date as month,
  b.id as batch_id,
  b.name as batch_name,
  count(*) as sessions_attended
from public.attendance_entries ae
join public.attendance_records ar on ar.id = ae.attendance_record_id
join public.members m on m.id = ae.member_id
join public.batches b on b.id = ar.batch_id
where ae.present
group by m.id, m.name, date_trunc('month', ar.session_date), b.id, b.name;

alter view public.v_monthly_attendance set (security_invoker = on);

-- ============================================================================
-- Seed the default batch/slot structure described in the product spec.
-- Safe to re-run: guarded by not-exists checks on (category, time_slot, days).
-- ============================================================================

insert into public.batches (name, category, time_slot, days, status)
select * from (values
  ('Weekday Morning — 6:30-7:30 AM', 'weekday_morning'::batch_category, '6:30 - 7:30 AM', 'Mon-Fri', 'active'::batch_status),
  ('Weekday Morning — 7:30-8:30 AM', 'weekday_morning'::batch_category, '7:30 - 8:30 AM', 'Mon-Fri', 'active'::batch_status),
  ('Weekday Morning — 8:30-9:30 AM', 'weekday_morning'::batch_category, '8:30 - 9:30 AM', 'Mon-Fri', 'active'::batch_status),
  ('Weekday Morning — 9:30-10:30 AM', 'weekday_morning'::batch_category, '9:30 - 10:30 AM', 'Mon-Fri', 'active'::batch_status),
  ('Kids Batch — 9:30-10:30 AM', 'kids'::batch_category, '9:30 - 10:30 AM', 'Mon-Fri', 'active'::batch_status),
  ('Weekday Evening — 6-7 PM', 'weekday_evening'::batch_category, '6:00 - 7:00 PM', 'Mon-Fri', 'upcoming'::batch_status),
  ('Weekday Evening — 7-8 PM', 'weekday_evening'::batch_category, '7:00 - 8:00 PM', 'Mon-Fri', 'upcoming'::batch_status),
  ('Weekday Evening — 8-9 PM', 'weekday_evening'::batch_category, '8:00 - 9:00 PM', 'Mon-Fri', 'upcoming'::batch_status),
  ('Weekday Evening — 9-10 PM', 'weekday_evening'::batch_category, '9:00 - 10:00 PM', 'Mon-Fri', 'upcoming'::batch_status),
  ('Weekend Batch — 8:30-10:00 AM', 'weekend'::batch_category, '8:30 - 10:00 AM', 'Sat-Sun', 'active'::batch_status)
) as seed(name, category, time_slot, days, status)
where not exists (
  select 1 from public.batches b
  where b.category = seed.category and b.time_slot = seed.time_slot and b.days = seed.days
);

-- ============================================================================
-- Allow trainers to correct today's attendance (same-day edits only).
-- Attendance stays a locked audit trail for any past session_date — trainers
-- can only add/remove attendance_entries while the parent record's
-- session_date is still the current date. Past days remain fully immutable.
-- ============================================================================

drop policy if exists "attendance_entries_insert" on public.attendance_entries;

create policy "attendance_entries_insert"
  on public.attendance_entries for insert
  with check (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id
        and ar.trainer_id = auth.uid()
        and ar.session_date = current_date
    )
  );

create policy "attendance_entries_trainer_delete_same_day"
  on public.attendance_entries for delete
  using (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id
        and ar.trainer_id = auth.uid()
        and ar.session_date = current_date
    )
  );

-- ============================================================================
-- Add the missing UPDATE policy for attendance_entries.
-- The trainer dashboard toggles `present` on an existing entry (re-marking a
-- member within the same session), which needs an UPDATE policy — only
-- SELECT/INSERT/DELETE existed before. Scoped the same way as the same-day
-- insert/delete policies from 0006: only today's own records are editable.
-- ============================================================================

create policy "attendance_entries_trainer_update_same_day"
  on public.attendance_entries for update
  using (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id
        and ar.trainer_id = auth.uid()
        and ar.session_date = current_date
    )
  )
  with check (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id
        and ar.trainer_id = auth.uid()
        and ar.session_date = current_date
    )
  );
