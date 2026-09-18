-- ============================================================================
-- Admins can correct attendance_entries for any date (not just same-day, and
-- not just their own records like trainers are limited to) — needed for the
-- Admin Attendance Log's per-member edit capability.
-- ============================================================================

create policy "attendance_entries_admin_all"
  on public.attendance_entries for all
  using (public.is_admin())
  with check (public.is_admin());
