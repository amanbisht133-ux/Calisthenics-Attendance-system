-- ============================================================================
-- Widen trainer attendance corrections from "today only" to a rolling 7-day
-- window (today and the 6 days before it). Admins already have unrestricted
-- edit access on any date via attendance_entries_admin_all (0011) — this
-- migration only changes the trainer-scoped policies.
-- ============================================================================

drop policy if exists "attendance_entries_insert" on public.attendance_entries;
drop policy if exists "attendance_entries_trainer_delete_same_day" on public.attendance_entries;

create policy "attendance_entries_trainer_insert_recent"
  on public.attendance_entries for insert
  with check (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id
        and ar.trainer_id = auth.uid()
        and ar.session_date between current_date - interval '6 days' and current_date
    )
  );

create policy "attendance_entries_trainer_delete_recent"
  on public.attendance_entries for delete
  using (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id
        and ar.trainer_id = auth.uid()
        and ar.session_date between current_date - interval '6 days' and current_date
    )
  );
