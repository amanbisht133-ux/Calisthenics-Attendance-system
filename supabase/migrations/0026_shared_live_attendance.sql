-- ============================================================================
-- One shared attendance sheet per class per day: any trainer of the academy can
-- tick / untick anyone on it, everyone sees it live, and admins see it too.
-- ============================================================================

-- A member can only appear once on a class's sheet (remove the odd duplicate first).
delete from public.attendance_entries a
using public.attendance_entries b
where a.attendance_record_id = b.attendance_record_id
  and a.member_id = b.member_id
  and (a.created_at, a.id) > (b.created_at, b.id);

create unique index if not exists attendance_entries_record_member_uniq
  on public.attendance_entries (attendance_record_id, member_id);

-- Any trainer of the academy may add/remove entries on any trainer's sheet for that academy
-- (same 7-day correction window as before).
create policy "attendance_entries_branch_insert"
  on public.attendance_entries for insert
  with check (
    exists (
      select 1 from public.attendance_records ar
      join public.batches b on b.id = ar.batch_id
      where ar.id = attendance_entries.attendance_record_id
        and b.branch_id in (select public.trainer_branch_ids())
        and ar.session_date between current_date - 6 and current_date
    )
  );

create policy "attendance_entries_branch_delete"
  on public.attendance_entries for delete
  using (
    exists (
      select 1 from public.attendance_records ar
      join public.batches b on b.id = ar.batch_id
      where ar.id = attendance_entries.attendance_record_id
        and b.branch_id in (select public.trainer_branch_ids())
        and ar.session_date between current_date - 6 and current_date
    )
  );

-- Demo visitors added by one trainer are visible to / addable by the whole academy.
create policy "demo_visitors_branch_select"
  on public.demo_visitors for select
  using (
    exists (
      select 1 from public.attendance_records ar
      join public.batches b on b.id = ar.batch_id
      where ar.id = demo_visitors.attendance_record_id
        and b.branch_id in (select public.trainer_branch_ids())
    )
  );

create policy "demo_visitors_branch_insert"
  on public.demo_visitors for insert
  with check (
    exists (
      select 1 from public.attendance_records ar
      join public.batches b on b.id = ar.batch_id
      where ar.id = demo_visitors.attendance_record_id
        and b.branch_id in (select public.trainer_branch_ids())
    )
  );

-- Live updates: broadcast attendance changes to every signed-in phone.
alter publication supabase_realtime add table public.attendance_entries;
alter publication supabase_realtime add table public.attendance_records;
alter publication supabase_realtime add table public.demo_visitors;
