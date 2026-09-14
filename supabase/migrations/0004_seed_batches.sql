-- ============================================================================
-- Seed the default batch/slot structure described in the product spec.
-- Safe to re-run: guarded by not-exists checks on (category, time_slot, days).
-- ============================================================================

insert into public.batches (name, category, time_slot, days, status)
select * from (values
  ('Weekday Morning — 6:30-7:30 AM', 'weekday_morning'::batch_category, '6:30 - 7:30 AM', 'Mon-Fri', 'active'::batch_status),
  ('Weekday Morning — 7:30-8:30 AM', 'weekday_morning'::batch_category, '7:30 - 8:30 AM', 'Mon-Fri', 'active'::batch_status),
  ('Weekday Morning — 8:30-9:30 AM', 'weekday_morning'::batch_category, '8:30 - 9:30 AM', 'Mon-Fri', 'active'::batch_status),
  ('Weekday Morning — 9:30-10:30 AM', 'weekday_morning'::batch_category, '9:30 - 10:30 AM', 'Mon-Fri', 'active'::batch_status),
  ('Kids Batch — 9:30-10:30 AM', 'kids'::batch_category, '9:30 - 10:30 AM', 'Mon-Fri', 'active'::batch_status),
  ('Weekday Evening — 6-7 PM', 'weekday_evening'::batch_category, '6:00 - 7:00 PM', 'Mon-Fri', 'upcoming'::batch_status),
  ('Weekday Evening — 7-8 PM', 'weekday_evening'::batch_category, '7:00 - 8:00 PM', 'Mon-Fri', 'upcoming'::batch_status),
  ('Weekday Evening — 8-9 PM', 'weekday_evening'::batch_category, '8:00 - 9:00 PM', 'Mon-Fri', 'upcoming'::batch_status),
  ('Weekday Evening — 9-10 PM', 'weekday_evening'::batch_category, '9:00 - 10:00 PM', 'Mon-Fri', 'upcoming'::batch_status),
  ('Weekend Batch — 8:30-10:00 AM', 'weekend'::batch_category, '8:30 - 10:00 AM', 'Sat-Sun', 'active'::batch_status)
) as seed(name, category, time_slot, days, status)
where not exists (
  select 1 from public.batches b
  where b.category = seed.category and b.time_slot = seed.time_slot and b.days = seed.days
);
