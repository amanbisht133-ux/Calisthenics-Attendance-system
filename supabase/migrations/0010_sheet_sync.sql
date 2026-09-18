-- ============================================================================
-- Google Sheet sync — mirrors new signups/renewals into the admin's existing
-- tracking spreadsheet via a Google Apps Script Web App (configured by the
-- admin from the UI, not hardcoded). Only the fields the app already tracks
-- are synced (ID, Name, Phone, Start/End date, Status, Membership months) —
-- everything else in the sheet (fees, collection status, training type,
-- revenue splits, the monthly breakdown) stays manual.
--
-- Sheet's "SNo" column format: a person's first signup gets a plain integer
-- (e.g. "3"); each renewal appends ".2", ".3", ... (e.g. "3.2", "3.3").
-- sheet_person_no is that integer, sheet_renewal_no is the next suffix.
-- ============================================================================

alter table public.members add column sheet_person_no integer;
alter table public.members add column sheet_renewal_no integer not null default 1;

-- Singleton settings row: the Apps Script Web App URL/token, and the next
-- free person number to hand out (since the app's own member list doesn't
-- start from 1 — the real sheet already has existing rows the admin numbers
-- manually until they set this counter to continue from).
create table public.sheet_sync_settings (
  id text primary key default 'singleton',
  apps_script_url text,
  apps_script_token text,
  next_person_no integer not null default 1,
  constraint sheet_sync_settings_singleton check (id = 'singleton')
);

insert into public.sheet_sync_settings (id) values ('singleton');

alter table public.sheet_sync_settings enable row level security;

create policy "sheet_sync_settings_admin_all"
  on public.sheet_sync_settings for all
  using (public.is_admin())
  with check (public.is_admin());
