-- ============================================================================
-- Replace placeholder batch data with the real Cali/ICS schedule. Existing
-- batches that already have attendance history are relabeled in place
-- (rather than deleted + recreated) so no attendance records are lost —
-- attendance_records.batch_id is ON DELETE RESTRICT, and several of these
-- already have real entries against them.
--
-- PT is intentionally NOT represented here: this app models Personal
-- Training via pt_clients (member <-> trainer pairing), not batches, per the
-- original schema design ("Personal Training is not slot-bound").
-- ============================================================================

-- ---- Cali (5252d13d-f786-4870-8ee0-a5dceb328e32) ----------------------------

-- Repurpose the extra weekday_morning slot into the missing 6:30-7:30 AM one.
update public.batches
set name = 'Weekday Morning — 6:30-7:30 AM', time_slot = '6:30 - 7:30 AM', status = 'active'
where id = '392b54cd-0c6f-4656-924e-1c45e20901e9';

-- Existing 7:30-8:30 AM already matches the real schedule.
update public.batches set status = 'active' where id = '8ad2febf-80ee-411b-8aeb-bfebd58149ed';

-- Repurpose the old kids slot into the real weekday kids time.
update public.batches
set name = 'Kids Batch — 5-6 PM', time_slot = '5:00 - 6:00 PM', days = 'Mon-Fri', status = 'active'
where id = '2deb95ad-0080-4535-9ef9-5d956084c47b';

-- Weekday evening 7-8 PM and 8-9 PM already match; just activate.
update public.batches set status = 'active' where id = '0f607e2b-4202-4b2d-bade-e4736612ac3b';
update public.batches set status = 'active' where id = 'fde2b0be-0480-4f7a-88f9-84ed593768fd';

-- Repurpose the extra weekday_evening slot into the missing 6-7 PM one.
update public.batches
set name = 'Weekday Evening — 6-7 PM', time_slot = '6:00 - 7:00 PM', status = 'active'
where id = '3ba32802-2554-43b6-8fb0-995f748fd00e';

-- Weekend 8:30-10 AM already matches.
update public.batches set status = 'active' where id = '6ee09968-3aa9-49a1-b97c-2586895e7ec4';

-- Missing slots for Cali: insert fresh.
insert into public.batches (name, category, branch_id, time_slot, days, status) values
  ('Weekday Morning — 8:30-9:30 AM', 'weekday_morning', '5252d13d-f786-4870-8ee0-a5dceb328e32', '8:30 - 9:30 AM', 'Mon-Fri', 'active'),
  ('Weekend Kids — 9-10 AM', 'kids', '5252d13d-f786-4870-8ee0-a5dceb328e32', '9:00 - 10:00 AM', 'Sat-Sun', 'active');

-- ---- ICS (bd3461d7-1ca6-419f-8d31-7b6024cf751b) ------------------------------

-- Existing 6:30-7:30 AM, 8:30-9:30 AM, 6-7 PM already match the real schedule.
update public.batches set status = 'active' where id = '636978cd-bce7-4626-bc4e-dcdc94d69d41';
update public.batches set status = 'active' where id = '51cc4160-89b5-4f50-8d1c-65ee762d68e9';
update public.batches set status = 'active' where id = 'a3c0aac2-07c0-48e0-938b-49d37d70e204';

-- Missing slots for ICS: insert fresh.
insert into public.batches (name, category, branch_id, time_slot, days, status) values
  ('Weekday Morning — 7:30-8:30 AM', 'weekday_morning', 'bd3461d7-1ca6-419f-8d31-7b6024cf751b', '7:30 - 8:30 AM', 'Mon-Fri', 'active'),
  ('Weekday Evening — 7-8 PM', 'weekday_evening', 'bd3461d7-1ca6-419f-8d31-7b6024cf751b', '7:00 - 8:00 PM', 'Mon-Fri', 'active'),
  ('Weekday Evening — 8-9 PM', 'weekday_evening', 'bd3461d7-1ca6-419f-8d31-7b6024cf751b', '8:00 - 9:00 PM', 'Mon-Fri', 'active'),
  ('Weekend Adults — 8-9 AM', 'weekend', 'bd3461d7-1ca6-419f-8d31-7b6024cf751b', '8:00 - 9:00 AM', 'Sat-Sun', 'active'),
  ('Weekend Kids — 9-10 AM', 'kids', 'bd3461d7-1ca6-419f-8d31-7b6024cf751b', '9:00 - 10:00 AM', 'Sat-Sun', 'active'),
  ('Kids Batch — 5-6 PM', 'kids', 'bd3461d7-1ca6-419f-8d31-7b6024cf751b', '5:00 - 6:00 PM', 'Mon-Fri', 'active');
