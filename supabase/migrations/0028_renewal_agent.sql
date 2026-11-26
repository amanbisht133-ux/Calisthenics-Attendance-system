-- ============================================================================
-- Renewal Agent (Phase 1)
--
-- Every Monday Claude reads each academy's Accounts & Revenue Tracker and
-- writes one renewal_dues row per member who needs to pay: package ending in
-- the next 3 days, already expired, or an installment due. Each due has a short
-- random token that powers the member's personal UPI page:
--   CLI -> https://www.calisthenicslabindia.club/pay/<token>
--   ICS -> https://www.indiancalisthenicsschool.com/pay/<token>
--
-- CLI (branch "Cali") and ICS (branch "ICS") never mix: every row carries its
-- branch, and every screen filters on one branch at a time.
--
-- Flow:  open -> (member taps "I've paid") claimed  -> admin Confirm -> confirmed
--        open -> (trainer marks at desk)    desk_paid -> admin Confirm -> confirmed
--        open -> (member promised a date)   promised  (reminders paused till then)
--        open -> renewed per tracker / no longer due -> closed
-- Follow-up: reminder 1 on day 0, one gentle repeat on day 3, then stop and
-- show the member on the trainers' "Needs a personal nudge" list.
-- ============================================================================

create table if not exists public.academy_settings (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  code text not null unique check (code in ('CLI', 'ICS')),
  academy_name text not null,
  upi_id text,
  site_url text not null
);

alter table public.academy_settings enable row level security;
create policy "academy_settings_read" on public.academy_settings for select using (auth.uid() is not null);
create policy "academy_settings_admin_write" on public.academy_settings for all using (public.is_admin()) with check (public.is_admin());

insert into public.academy_settings (branch_id, code, academy_name, site_url)
select id, 'CLI', 'Calisthenics Lab India', 'https://www.calisthenicslabindia.club' from public.branches where name = 'Cali'
on conflict (branch_id) do nothing;
insert into public.academy_settings (branch_id, code, academy_name, site_url)
select id, 'ICS', 'Indian Calisthenics School', 'https://www.indiancalisthenicsschool.com' from public.branches where name = 'ICS'
on conflict (branch_id) do nothing;

create table if not exists public.renewal_dues (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  branch_id uuid not null references public.branches(id),
  member_id uuid references public.members(id) on delete set null,
  member_name text not null,
  phone text,
  due_kind text not null check (due_kind in ('ending_soon', 'expired', 'installment')),
  -- Current package, exactly as in the tracker
  package_label text,               -- e.g. "Group 7-8 pm" / "PT- Shiva"
  package_months numeric not null,
  package_fee numeric not null,
  package_start date not null,
  package_end date not null,
  paid_so_far numeric not null default 0,
  -- What is being asked for now
  amount_due numeric not null check (amount_due > 0),
  due_date date not null,           -- installment due date, or package end date
  installment_label text,           -- e.g. "2 of 3"
  renewal_months numeric,           -- renewals: the next period
  renewal_start date,
  renewal_end date,
  sheet_sno text,                   -- tracker SNo of the row this came from
  -- Workflow
  status text not null default 'open'
    check (status in ('open', 'claimed', 'desk_paid', 'promised', 'confirmed', 'closed')),
  promise_date date,
  reminder1_at timestamptz,
  reminder2_at timestamptz,
  claimed_at timestamptz,
  desk_method text check (desk_method in ('cash', 'upi')),
  desk_marked_by uuid references public.profiles(id),
  desk_marked_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id),
  thanked_at timestamptz,
  tracker_logged_at timestamptz,    -- set by Claude after writing the tracker
  closed_reason text,               -- 'renewed_in_tracker' | 'not_due' | 'not_received' ...
  is_test boolean not null default false,
  week_of date not null default (date_trunc('week', (now() at time zone 'Asia/Kolkata'))::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists renewal_dues_one_live_per_due
  on public.renewal_dues (branch_id, lower(member_name), due_kind, due_date)
  where status <> 'closed';
create index if not exists renewal_dues_branch_status on public.renewal_dues (branch_id, status);

alter table public.renewal_dues enable row level security;
-- Admin sees and edits everything. Trainers can read their academies' dues
-- (for the nudge list); all their writes go through the functions below.
create policy "renewal_dues_admin_all" on public.renewal_dues for all using (public.is_admin()) with check (public.is_admin());
create policy "renewal_dues_trainer_read" on public.renewal_dues for select
  using (branch_id in (select public.trainer_branch_ids()));

-- ----------------------------------------------------------------------------
-- Stage of each due, computed in IST so day 0 / day 3 roll over correctly.
-- ----------------------------------------------------------------------------
create or replace view public.v_renewal_queue
with (security_invoker = true) as
select d.*,
  s.code as academy_code,
  s.academy_name,
  s.site_url || '/pay/' || d.token as pay_url,
  case
    when d.status in ('claimed', 'desk_paid') then 'confirm'
    when d.status = 'confirmed' then 'renewed'
    when d.status = 'closed' then 'closed'
    when d.status = 'promised' and d.promise_date > t.today then 'promised'
    when d.reminder1_at is null then 'send_day0'
    when d.reminder2_at is null and t.today >= (d.reminder1_at at time zone 'Asia/Kolkata')::date + 3 then 'send_day3'
    when d.reminder2_at is null then 'waiting'
    else 'needs_nudge'
  end as stage,
  case when d.reminder1_at is not null
       then (d.reminder1_at at time zone 'Asia/Kolkata')::date + 3 end as repeat_on,
  (d.due_kind = 'expired' and d.package_end < t.today - 14 and d.reminder2_at is not null) as possibly_leaving
from public.renewal_dues d
join public.academy_settings s on s.branch_id = d.branch_id
cross join (select (now() at time zone 'Asia/Kolkata')::date as today) t;

revoke all on public.v_renewal_queue from anon;
grant select on public.v_renewal_queue to authenticated;

-- ----------------------------------------------------------------------------
-- PUBLIC (anon) functions for the pay page. Only safe fields, only by token.
-- ----------------------------------------------------------------------------
create or replace function public.get_pay_page(p_token text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'academy_code', s.code,
    'academy_name', s.academy_name,
    'upi_id', s.upi_id,
    'first_name', split_part(trim(regexp_replace(d.member_name, '\(.*?\)', '', 'g')), ' ', 1),
    'due_kind', d.due_kind,
    'package_label', d.package_label,
    'package_months', d.package_months,
    'package_fee', d.package_fee,
    'package_start', d.package_start,
    'package_end', d.package_end,
    'paid_so_far', d.paid_so_far,
    'amount_due', d.amount_due,
    'due_date', d.due_date,
    'installment_label', d.installment_label,
    'renewal_months', d.renewal_months,
    'renewal_start', d.renewal_start,
    'renewal_end', d.renewal_end,
    'status', d.status
  )
  from public.renewal_dues d
  join public.academy_settings s on s.branch_id = d.branch_id
  where d.token = lower(trim(p_token)) and d.status <> 'closed';
$$;

create or replace function public.claim_payment(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  update public.renewal_dues
     set status = 'claimed', claimed_at = now(), updated_at = now()
   where token = lower(trim(p_token)) and status in ('open', 'promised')
  returning status into v_status;
  if v_status is null then
    select status into v_status from public.renewal_dues where token = lower(trim(p_token));
  end if;
  return coalesce(v_status, 'not_found');
end;
$$;

revoke all on function public.get_pay_page(text) from public;
revoke all on function public.claim_payment(text) from public;
grant execute on function public.get_pay_page(text) to anon, authenticated;
grant execute on function public.claim_payment(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Staff functions
-- ----------------------------------------------------------------------------
create or replace function public.can_act_on_due(p_due_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.renewal_dues d
    where d.id = p_due_id and d.branch_id in (select public.trainer_branch_ids())
  );
$$;

-- Admin taps the WhatsApp button: record reminder 1 (day 0) or 2 (day 3).
create or replace function public.mark_reminder_sent(p_due_id uuid, p_which int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_which = 1 then
    update public.renewal_dues set reminder1_at = coalesce(reminder1_at, now()), updated_at = now() where id = p_due_id;
  elsif p_which = 2 then
    update public.renewal_dues set reminder2_at = coalesce(reminder2_at, now()), updated_at = now() where id = p_due_id;
  end if;
end;
$$;

-- Member said "I'll pay on <date>": pause reminders till then (null = resume).
create or replace function public.set_promise_date(p_due_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_act_on_due(p_due_id) then raise exception 'Not allowed'; end if;
  update public.renewal_dues
     set promise_date = p_date,
         status = case when p_date is null then 'open' else 'promised' end,
         updated_at = now()
   where id = p_due_id and status in ('open', 'promised');
end;
$$;

-- Trainer took the money at the desk: reminders stop now, admin confirms later.
create or replace function public.mark_desk_paid(p_due_id uuid, p_method text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_act_on_due(p_due_id) then raise exception 'Not allowed'; end if;
  if p_method not in ('cash', 'upi') then raise exception 'Method must be cash or upi'; end if;
  update public.renewal_dues
     set status = 'desk_paid', desk_method = p_method, desk_marked_by = auth.uid(),
         desk_marked_at = now(), updated_at = now()
   where id = p_due_id and status in ('open', 'promised', 'claimed');
end;
$$;

-- Admin Confirm: payment row, package extension for renewals, status.
-- The tracker row is written by Claude afterwards (tracker_logged_at).
create or replace function public.confirm_due_payment(p_due_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare d public.renewal_dues;
declare v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into d from public.renewal_dues where id = p_due_id for update;
  if d.id is null then raise exception 'Not found'; end if;
  if d.status = 'confirmed' then return row_to_json(d); end if;

  if d.member_id is not null and not d.is_test then
    insert into public.payments (member_id, amount, paid_date) values (d.member_id, d.amount_due, v_today);
    if d.due_kind in ('ending_soon', 'expired') and d.renewal_start is not null then
      update public.members
         set plan = (case when d.renewal_months <= 1 then 'monthly'
                          when d.renewal_months <= 3 then 'quarterly'
                          else 'half_yearly' end)::membership_plan,
             start_date = d.renewal_start,
             total_fee = d.amount_due
       where id = d.member_id;
      -- separate statement: the expiry trigger recalculates on start_date change
      update public.members set expiry_date = d.renewal_end where id = d.member_id;
    end if;
  end if;

  update public.renewal_dues
     set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(), updated_at = now()
   where id = p_due_id
  returning * into d;
  return row_to_json(d);
end;
$$;

-- Admin: the member tapped "I've paid" but no money arrived.
create or replace function public.reject_due_claim(p_due_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.renewal_dues
     set status = 'open', claimed_at = null, desk_method = null, desk_marked_by = null,
         desk_marked_at = null, updated_at = now()
   where id = p_due_id and status in ('claimed', 'desk_paid');
end;
$$;

create or replace function public.mark_thanked(p_due_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.renewal_dues set thanked_at = coalesce(thanked_at, now()), updated_at = now()
  where id = p_due_id and public.is_admin();
$$;

revoke all on function public.can_act_on_due(uuid) from public, anon;
revoke all on function public.mark_reminder_sent(uuid, int) from public, anon;
revoke all on function public.set_promise_date(uuid, date) from public, anon;
revoke all on function public.mark_desk_paid(uuid, text) from public, anon;
revoke all on function public.confirm_due_payment(uuid) from public, anon;
revoke all on function public.reject_due_claim(uuid) from public, anon;
revoke all on function public.mark_thanked(uuid) from public, anon;
grant execute on function public.can_act_on_due(uuid) to authenticated;
grant execute on function public.mark_reminder_sent(uuid, int) to authenticated;
grant execute on function public.set_promise_date(uuid, date) to authenticated;
grant execute on function public.mark_desk_paid(uuid, text) to authenticated;
grant execute on function public.confirm_due_payment(uuid) to authenticated;
grant execute on function public.reject_due_claim(uuid) to authenticated;
grant execute on function public.mark_thanked(uuid) to authenticated;
