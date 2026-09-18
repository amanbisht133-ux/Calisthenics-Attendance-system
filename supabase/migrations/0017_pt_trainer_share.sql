-- ============================================================================
-- Trainer's revenue share for a PT arrangement, as a percentage of the
-- member's total_fee (matches the "Cali %" / trainer split tracked in the
-- admin's spreadsheet). Lives on pt_clients since that's the row representing
-- the current PT pairing — it gets replaced on renewal, so the share can
-- change term to term along with everything else about the arrangement.
-- ============================================================================

alter table public.pt_clients add column trainer_share_percent numeric(5, 2) check (trainer_share_percent between 0 and 100);
