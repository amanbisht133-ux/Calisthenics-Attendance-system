-- ============================================================================
-- Balance due per member, for the trainer attendance screen.
-- Trainers can't read the payments table (admin only), but they should know
-- when someone in front of them still owes money on their current package so
-- they can nudge them offline. This returns only the balance number, never the
-- individual payments, and only for branches the caller is assigned to.
--
-- Current package = payments dated from 10 days before the package start
-- (people often pay a few days early) up to today.
-- ============================================================================

create or replace function public.member_dues(p_branch_id uuid)
returns table (member_id uuid, balance_due numeric)
language sql
security definer
stable
set search_path = public
as $$
  select m.id,
         greatest(
           coalesce(m.total_fee, 0)
           - coalesce(sum(p.amount) filter (where p.paid_date >= m.start_date - 10), 0),
           0
         ) as balance_due
  from public.members m
  left join public.payments p on p.member_id = m.id
  where m.branch_id = p_branch_id
    and (public.is_admin() or p_branch_id in (select public.trainer_branch_ids()))
  group by m.id;
$$;

revoke all on function public.member_dues(uuid) from public;
grant execute on function public.member_dues(uuid) to authenticated;
