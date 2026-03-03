-- FINANCE TAGS
create table if not exists public.finance_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  color_hex text not null default '#3B82F6',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- COMMITMENTS (o “contrato”)
create table if not exists public.finance_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  type text not null check (type in ('one_time','installment','recurring')),
  amount numeric not null check (amount >= 0),
  start_date date not null,
  installments_count int null check (installments_count is null or installments_count > 0),
  day_of_month int null check (day_of_month is null or (day_of_month >= 1 and day_of_month <= 31)),
  notes text null,
  created_at timestamptz not null default now()
);

-- OCCURRENCES (parcelas / contas geradas)
create table if not exists public.finance_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  commitment_id uuid not null references public.finance_commitments(id) on delete cascade,
  due_date date not null,
  amount numeric not null check (amount >= 0),
  status text not null default 'planned' check (status in ('planned','paid','skipped')),
  paid_at timestamptz null,
  created_at timestamptz not null default now()
);

-- COMMITMENT <-> TAGS (N:N)
create table if not exists public.finance_commitment_tags (
  commitment_id uuid not null references public.finance_commitments(id) on delete cascade,
  tag_id uuid not null references public.finance_tags(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (commitment_id, tag_id)
);

-- Índices úteis
create index if not exists finance_occ_user_due_idx on public.finance_occurrences(user_id, due_date);
create index if not exists finance_commit_user_idx on public.finance_commitments(user_id);
create index if not exists finance_tags_user_idx on public.finance_tags(user_id);

-- RLS
alter table public.finance_tags enable row level security;
alter table public.finance_commitments enable row level security;
alter table public.finance_occurrences enable row level security;
alter table public.finance_commitment_tags enable row level security;

-- Policies (ajuste se seu app usa auth.uid() como padrão)
create policy "finance_tags_select_own" on public.finance_tags
for select using (user_id = auth.uid());
create policy "finance_tags_write_own" on public.finance_tags
for insert with check (user_id = auth.uid());
create policy "finance_tags_update_own" on public.finance_tags
for update using (user_id = auth.uid());
create policy "finance_tags_delete_own" on public.finance_tags
for delete using (user_id = auth.uid());

create policy "finance_commit_select_own" on public.finance_commitments
for select using (user_id = auth.uid());
create policy "finance_commit_write_own" on public.finance_commitments
for insert with check (user_id = auth.uid());
create policy "finance_commit_update_own" on public.finance_commitments
for update using (user_id = auth.uid());
create policy "finance_commit_delete_own" on public.finance_commitments
for delete using (user_id = auth.uid());

create policy "finance_occ_select_own" on public.finance_occurrences
for select using (user_id = auth.uid());
create policy "finance_occ_write_own" on public.finance_occurrences
for insert with check (user_id = auth.uid());
create policy "finance_occ_update_own" on public.finance_occurrences
for update using (user_id = auth.uid());
create policy "finance_occ_delete_own" on public.finance_occurrences
for delete using (user_id = auth.uid());

create policy "finance_ct_select_own" on public.finance_commitment_tags
for select using (user_id = auth.uid());
create policy "finance_ct_write_own" on public.finance_commitment_tags
for insert with check (user_id = auth.uid());
create policy "finance_ct_delete_own" on public.finance_commitment_tags
for delete using (user_id = auth.uid());