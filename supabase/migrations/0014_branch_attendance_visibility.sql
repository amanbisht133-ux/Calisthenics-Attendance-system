-- ============================================================================
-- Broaden trainer read access to attendance_records/attendance_entries from
-- "only what I personally marked" to "anything within my assigned branch(es)".
-- Needed for the monthly leaderboard: a member's total session count has to
-- include sessions marked by every trainer at that branch, not just the one
-- viewing the ranking. Insert/delete stay scoped to same-day + own records —
-- this only widens what a trainer can SELECT.
-- ============================================================================

drop policy if exists "attendance_records_select" on public.attendance_records;
create policy "attendance_records_select"
  on public.attendance_records for select
  using (
    public.is_admin()
    or trainer_id = auth.uid()
    or exists (
      select 1 from public.batches b
      where b.id = attendance_records.batch_id
        and b.branch_id in (select public.trainer_branch_ids())
    )
  );

drop policy if exists "attendance_entries_select" on public.attendance_entries;
create policy "attendance_entries_select"
  on public.attendance_entries for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id and ar.trainer_id = auth.uid()
    )
    or exists (
      select 1 from public.attendance_records ar
      join public.batches b on b.id = ar.batch_id
      where ar.id = attendance_entries.attendance_record_id
        and b.branch_id in (select public.trainer_branch_ids())
    )
  );
