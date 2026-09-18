-- ============================================================================
-- Optional email field on members, for bulk membership-reminder emails.
-- Existing members start with no email; admin fills it in over time.
-- ============================================================================

alter table public.members add column email text;
