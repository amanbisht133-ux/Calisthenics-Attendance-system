-- ============================================================================
-- Row Level Security — Admin has full access, Trainers are scoped to their
-- own assigned batches / PT clients, and attendance is append-only (no
-- update/delete policies exist for anyone => immutable audit trail).
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.batches enable row level security;
alter table public.trainer_batches enable row level security;
alter table public.members enable row level security;
alter table public.member_batches enable row level security;
alter table public.pt_clients enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_entries enable row level security;
alter table public.demo_visitors enable row level security;
alter table public.pt_sessions enable row level security;

-- Helper: is the current user an admin?
create function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- PROFILES
-- ----------------------------------------------------------------------------
create policy "profiles_select_all_authenticated"
  on public.profiles for select
  using (auth.uid() is not null);

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_insert"
  on public.profiles for insert
  with check (public.is_admin());

create policy "profiles_admin_delete"
  on public.profiles for delete
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- BATCHES — everyone authenticated can read; only admin manages.
-- ----------------------------------------------------------------------------
create policy "batches_select_all" on public.batches for select using (auth.uid() is not null);
create policy "batches_admin_write" on public.batches for insert with check (public.is_admin());
create policy "batches_admin_update" on public.batches for update using (public.is_admin());
create policy "batches_admin_delete" on public.batches for delete using (public.is_admin());

create policy "trainer_batches_select_all" on public.trainer_batches for select using (auth.uid() is not null);
create policy "trainer_batches_admin_write" on public.trainer_batches for insert with check (public.is_admin());
create policy "trainer_batches_admin_delete" on public.trainer_batches for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- MEMBERS — admin: full CRUD. Trainer: read-only, only members in their own
-- batches or PT roster.
-- ----------------------------------------------------------------------------
create policy "members_admin_all"
  on public.members for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "members_trainer_select"
  on public.members for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.member_batches mb
      join public.trainer_batches tb on tb.batch_id = mb.batch_id
      where mb.member_id = members.id and tb.trainer_id = auth.uid()
    )
    or exists (
      select 1 from public.pt_clients pc
      where pc.member_id = members.id and pc.trainer_id = auth.uid()
    )
  );

create policy "member_batches_select"
  on public.member_batches for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.trainer_batches tb
      where tb.batch_id = member_batches.batch_id and tb.trainer_id = auth.uid()
    )
  );
create policy "member_batches_admin_write" on public.member_batches for insert with check (public.is_admin());
create policy "member_batches_admin_delete" on public.member_batches for delete using (public.is_admin());

create policy "pt_clients_select"
  on public.pt_clients for select
  using (public.is_admin() or trainer_id = auth.uid());
create policy "pt_clients_admin_write" on public.pt_clients for insert with check (public.is_admin());
create policy "pt_clients_admin_delete" on public.pt_clients for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- ATTENDANCE — append-only (insert + select only, never update/delete).
-- Trainers may only insert records for batches they're assigned to, using
-- their own trainer_id (enforces the audit trail: who marked it).
-- ----------------------------------------------------------------------------
create policy "attendance_records_select"
  on public.attendance_records for select
  using (
    public.is_admin() or trainer_id = auth.uid()
  );

create policy "attendance_records_trainer_insert"
  on public.attendance_records for insert
  with check (
    trainer_id = auth.uid()
    and exists (
      select 1 from public.trainer_batches tb
      where tb.batch_id = attendance_records.batch_id and tb.trainer_id = auth.uid()
    )
  );

create policy "attendance_entries_select"
  on public.attendance_entries for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id and ar.trainer_id = auth.uid()
    )
  );

create policy "attendance_entries_insert"
  on public.attendance_entries for insert
  with check (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = attendance_entries.attendance_record_id and ar.trainer_id = auth.uid()
    )
  );

create policy "demo_visitors_select"
  on public.demo_visitors for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.attendance_records ar
      where ar.id = demo_visitors.attendance_record_id and ar.trainer_id = auth.uid()
    )
  );

create policy "demo_visitors_insert"
  on public.demo_visitors for insert
  with check (
    exists (
      select 1 from public.attendance_records ar
      where ar.id = demo_visitors.attendance_record_id and ar.trainer_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- PT SESSIONS — append-only, scoped to the trainer's own clients.
-- ----------------------------------------------------------------------------
create policy "pt_sessions_select"
  on public.pt_sessions for select
  using (public.is_admin() or trainer_id = auth.uid());

create policy "pt_sessions_insert"
  on public.pt_sessions for insert
  with check (
    trainer_id = auth.uid()
    and exists (
      select 1 from public.pt_clients pc
      where pc.id = pt_sessions.pt_client_id and pc.trainer_id = auth.uid()
    )
  );
