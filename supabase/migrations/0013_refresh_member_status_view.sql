-- ============================================================================
-- v_member_status was defined with `select m.*`, but Postgres freezes a
-- view's column list at CREATE time -- it does not pick up columns added to
-- the underlying table afterward. branch_id, sheet_person_no,
-- sheet_renewal_no and email were all added to members since this view was
-- first created, so none of them were ever visible through it. Drop and
-- recreate (and its dependent view) so `select m.*` re-expands against the
-- table's current columns.
-- ============================================================================

drop view if exists public.v_expired_members;
drop view if exists public.v_member_status;

create view public.v_member_status as
select
  m.*,
  public.member_status(m.expiry_date) as status
from public.members m;

alter view public.v_member_status set (security_invoker = on);

create view public.v_expired_members as
select *
from public.v_member_status
where status = 'expired'
order by expiry_date desc;

alter view public.v_expired_members set (security_invoker = on);
