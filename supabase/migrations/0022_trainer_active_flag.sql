-- ============================================================================
-- Trainers can't always be hard-deleted — attendance_records.trainer_id and
-- pt_sessions.trainer_id are "on delete restrict", so a trainer with any
-- attendance/PT history can't be removed from auth.users without breaking
-- that history. is_active lets the UI "delete" such a trainer by deactivating
-- (hidden from new-assignment pickers, login banned) instead of destroying
-- records. A trainer with zero history can still be hard-deleted.
-- ============================================================================

alter table public.profiles add column is_active boolean not null default true;
