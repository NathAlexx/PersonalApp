-- 001_notes.sql
-- Cria tabela de notas com RLS (cada usuário acessa só as próprias linhas)

-- Extensão para gerar UUID (geralmente já habilitada no Supabase)
create extension if not exists "uuid-ossp";

create table if not exists public.notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Atualiza updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at on public.notes;
create trigger trg_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

-- Habilitar Row Level Security
alter table public.notes enable row level security;

-- Policies (CRUD por usuário)
-- SELECT
drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own"
  on public.notes
  for select
  to authenticated
  using (auth.uid() = user_id);

-- INSERT
drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own"
  on public.notes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- UPDATE
drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
  on public.notes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE
drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own"
  on public.notes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Realtime (opcional): permite ouvir mudanças via websocket
alter publication supabase_realtime add table public.notes;
