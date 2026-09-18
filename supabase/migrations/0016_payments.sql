-- ============================================================================
-- Fee tracking: a member's total_fee plus a payments ledger (one row per
-- payment received). Paid/partial/unpaid status is derived from
-- sum(payments.amount) vs members.total_fee rather than stored, so it can
-- never drift out of sync. Payments are admin-only — trainers don't need
-- visibility into member finances.
-- ============================================================================

alter table public.members add column total_fee numeric(10, 2);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  paid_date date not null,
  created_at timestamptz not null default now()
);

create index payments_member_idx on public.payments (member_id);

alter table public.payments enable row level security;

create policy "payments_admin_all"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());
