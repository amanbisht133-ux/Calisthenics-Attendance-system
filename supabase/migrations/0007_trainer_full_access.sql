-- ============================================================================
-- Guarantee trainers have unrestricted read access to all batches, members,
-- and member_batches — no per-trainer batch assignment should ever gate
-- visibility. This drops any select policy on these tables that isn't the
-- known-good permissive one (covers policies added by hand outside the
-- migration history) and re-asserts the intended, unrestricted policy.
-- ============================================================================

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'batches' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.batches', pol.policyname);
  end loop;

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'members' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.members', pol.policyname);
  end loop;

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'member_batches' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.member_batches', pol.policyname);
  end loop;

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'trainer_batches' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.trainer_batches', pol.policyname);
  end loop;
end $$;

create policy "batches_select_all"
  on public.batches for select
  using (auth.uid() is not null);

create policy "members_select_all"
  on public.members for select
  using (auth.uid() is not null);

create policy "member_batches_select_all"
  on public.member_batches for select
  using (auth.uid() is not null);

create policy "trainer_batches_select_all"
  on public.trainer_batches for select
  using (auth.uid() is not null);
