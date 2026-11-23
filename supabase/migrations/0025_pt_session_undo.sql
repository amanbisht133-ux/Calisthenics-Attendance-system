-- ============================================================================
-- Let a trainer undo a "Session done" tick they made by mistake, for their
-- own clients, within the same 7-day correction window as group attendance.
-- Admins can remove any PT session.
-- ============================================================================

create policy "pt_sessions_delete"
  on public.pt_sessions for delete
  using (
    public.is_admin()
    or (trainer_id = auth.uid() and session_date >= current_date - 6)
  );
