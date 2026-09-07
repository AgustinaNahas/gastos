-- Pegá este script en el SQL Editor de tu proyecto Supabase y ejecutalo una vez.
-- Dashboard → SQL Editor → New query → Run

create table if not exists public.expenses (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  dedupe_key text not null,
  saved_at timestamptz not null default now(),
  source_file text not null default '',
  date text not null default '',
  description text not null default '',
  raw_id text not null default '',
  category text not null default 'Otros',
  bank text not null default '',
  card_brand text,
  card_type text,
  card_last4 text,
  amount numeric(14, 2) not null default 0,
  month_key text not null default '',
  is_unknown boolean not null default false,
  shared_with_santi boolean not null default false,
  paid_by text not null default 'me',
  category_manual boolean not null default false,
  constraint expenses_paid_by_check check (paid_by in ('me', 'santi')),
  constraint expenses_user_dedupe_unique unique (user_id, dedupe_key)
);

create index if not exists expenses_user_month_idx on public.expenses (user_id, month_key);
create index if not exists expenses_user_saved_idx on public.expenses (user_id, saved_at desc);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  knowledge_base jsonb not null default '{}'::jsonb,
  categories jsonb not null default '[]'::jsonb,
  category_colors jsonb not null default '{}'::jsonb,
  auto_rules jsonb not null default '{"keywordRules":[],"transferRules":[]}'::jsonb,
  visible_columns jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.expenses enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists expenses_select_own on public.expenses;
drop policy if exists expenses_insert_own on public.expenses;
drop policy if exists expenses_update_own on public.expenses;
drop policy if exists expenses_delete_own on public.expenses;
drop policy if exists settings_select_own on public.user_settings;
drop policy if exists settings_insert_own on public.user_settings;
drop policy if exists settings_update_own on public.user_settings;
drop policy if exists settings_delete_own on public.user_settings;

create policy expenses_select_own
  on public.expenses for select to authenticated
  using (auth.uid() = user_id);

create policy expenses_insert_own
  on public.expenses for insert to authenticated
  with check (auth.uid() = user_id);

create policy expenses_update_own
  on public.expenses for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy expenses_delete_own
  on public.expenses for delete to authenticated
  using (auth.uid() = user_id);

create policy settings_select_own
  on public.user_settings for select to authenticated
  using (auth.uid() = user_id);

create policy settings_insert_own
  on public.user_settings for insert to authenticated
  with check (auth.uid() = user_id);

create policy settings_update_own
  on public.user_settings for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy settings_delete_own
  on public.user_settings for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.expenses from anon, public;
revoke all on public.user_settings from anon, public;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
