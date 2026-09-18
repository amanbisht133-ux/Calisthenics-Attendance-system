-- ============================================================================
-- Two more fields to match the admin's tracking spreadsheet: a revenue-share
-- percentage on every member (not just PT — Group members are typically
-- 100%), and an "invoice shared" flag.
-- ============================================================================

alter table public.members add column cali_percent numeric(5, 2) check (cali_percent between 0 and 100) default 100;
alter table public.members add column invoice_shared boolean not null default false;
