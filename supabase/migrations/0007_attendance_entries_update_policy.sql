-- ============================================================================
-- Add the missing UPDATE policy for attendance_entries.
-- The trainer dashboard toggles `present` on an existing entry (re-marking a
-- member within the same session), which needs an UPDATE policy — only
-- SELECT/INSERT/DELETE existed before. Scoped the same way as the same-day
-- insert/delete policies from 0006: only today's own records are editable.
-- ============================================================================

create policy "attendance_entries_trainer_update_same_day"
  on public.attendance_entries for update
  using (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id
        and ar.trainer_id = auth.uid()
        and ar.session_date = current_date
    )
  )
  with check (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id
        and ar.trainer_id = auth.uid()
        and ar.session_date = current_date
    )
  );
