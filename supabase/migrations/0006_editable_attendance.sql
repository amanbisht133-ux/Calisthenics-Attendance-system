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
