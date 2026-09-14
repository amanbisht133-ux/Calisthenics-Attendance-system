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
