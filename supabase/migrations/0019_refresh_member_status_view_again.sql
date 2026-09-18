-- ============================================================================
-- Same issue as 0013: v_member_status (select m.*) was recreated there, but
-- total_fee, cali_percent, sheet_person_no/renewal_no updates, and
-- invoice_shared were all added afterward (0016, 0018) and are still missing
-- from the view's frozen column list. Refresh again.
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
