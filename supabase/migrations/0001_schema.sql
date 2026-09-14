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
