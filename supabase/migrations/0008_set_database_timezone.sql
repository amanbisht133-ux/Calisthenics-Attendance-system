-- ============================================================================
-- Align the database's default session timezone with the gym's actual
-- timezone (India). Postgres defaulted to UTC, so current_date-based checks
-- (the same-day attendance edit/delete RLS policies, and member_status()'s
-- default as-of-date) disagreed with the app's browser-local "today" for
-- roughly 5.5 hours every night (00:00-05:29 IST), causing attendance
-- inserts/deletes to be rejected by RLS during that window.
-- ============================================================================

alter database postgres set timezone to 'Asia/Kolkata';
