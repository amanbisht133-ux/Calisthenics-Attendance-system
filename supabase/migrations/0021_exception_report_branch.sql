-- ============================================================================
-- Add branch_id to v_exception_report so the admin Exception Report page can
-- filter by branch. CREATE OR REPLACE VIEW is safe here since we're only
-- appending a trailing column, not changing/removing existing ones.
-- ============================================================================

create or replace view public.v_exception_report as
select
  m.id as member_id,
  m.name as member_name,
  m.phone,
  m.expiry_date,
  count(ae.id) as post_expiry_count,
  array_agg(ar.session_date order by ar.session_date desc) as offense_dates,
  array_agg(b.name order by ar.session_date desc) as batch_names,
  m.branch_id
from public.attendance_entries ae
join public.attendance_records ar on ar.id = ae.attendance_record_id
join public.members m on m.id = ae.member_id
join public.batches b on b.id = ar.batch_id
where ae.is_post_expiry
group by m.id, m.name, m.phone, m.expiry_date, m.branch_id
order by post_expiry_count desc;

alter view public.v_exception_report set (security_invoker = on);
