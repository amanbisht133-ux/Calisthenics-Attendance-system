-- ============================================================================
-- Multi-branch support.
--
-- Adds a `branches` table, a trainer <-> branch assignment table, and a
-- required branch_id on batches and members (each batch and each member
-- belongs to exactly one branch). Existing batches/members/trainers are
-- backfilled into a placeholder "Branch 1" so nothing breaks; rename and
-- reassign individual rows afterward via Admin > Branches.
--
-- Visibility model: RLS scopes a trainer to the UNION of branches they are
-- assigned to (via trainer_branches). The app additionally lets a trainer
-- pick a single "current" branch client-side when they're assigned to more
-- than one, to keep the UI focused on one branch at a time.
-- ============================================================================

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.trainer_branches (
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  primary key (trainer_id, branch_id)
);

insert into public.branches (name) values ('Branch 1'), ('Branch 2');

alter table public.batches add column branch_id uuid references public.branches (id);
alter table public.members add column branch_id uuid references public.branches (id);

update public.batches set branch_id = (select id from public.branches where name = 'Branch 1');
update public.members set branch_id = (select id from public.branches where name = 'Branch 1');

alter table public.batches alter column branch_id set not null;
alter table public.members alter column branch_id set not null;

create index batches_branch_idx on public.batches (branch_id);
create index members_branch_idx on public.members (branch_id);

-- Every existing trainer starts assigned to Branch 1 so they aren't locked
-- out post-migration; admin can add/change branch assignments afterward.
insert into public.trainer_branches (trainer_id, branch_id)
select p.id, (select id from public.branches where name = 'Branch 1')
from public.profiles p
where p.role = 'trainer'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.branches enable row level security;
alter table public.trainer_branches enable row level security;

create function public.trainer_branch_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select branch_id from public.trainer_branches where trainer_id = auth.uid();
$$;

create policy "branches_select"
  on public.branches for select
  using (public.is_admin() or id in (select public.trainer_branch_ids()));

create policy "branches_admin_insert" on public.branches for insert with check (public.is_admin());
create policy "branches_admin_update" on public.branches for update using (public.is_admin());
create policy "branches_admin_delete" on public.branches for delete using (public.is_admin());

create policy "trainer_branches_select"
  on public.trainer_branches for select
  using (public.is_admin() or trainer_id = auth.uid());

create policy "trainer_branches_admin_insert" on public.trainer_branches for insert with check (public.is_admin());
create policy "trainer_branches_admin_delete" on public.trainer_branches for delete using (public.is_admin());

-- Replace the fully-open members/batches select policies (0007) with
-- branch-scoped ones: a trainer only sees rows in a branch they're assigned to.
drop policy if exists "members_select_all" on public.members;
create policy "members_select_scoped"
  on public.members for select
  using (public.is_admin() or branch_id in (select public.trainer_branch_ids()));

drop policy if exists "batches_select_all" on public.batches;
create policy "batches_select_scoped"
  on public.batches for select
  using (public.is_admin() or branch_id in (select public.trainer_branch_ids()));

-- A trainer may only open an attendance session for a batch in one of their
-- assigned branches (defense in depth — the UI already only offers those).
drop policy if exists "attendance_records_trainer_insert" on public.attendance_records;
create policy "attendance_records_trainer_insert"
  on public.attendance_records for insert
  with check (
    trainer_id = auth.uid()
    and exists (
      select 1 from public.batches b
      where b.id = attendance_records.batch_id
        and b.branch_id in (select public.trainer_branch_ids())
    )
  );
