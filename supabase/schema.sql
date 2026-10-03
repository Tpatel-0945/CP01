-- Pocket Ledger database schema for Supabase.
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again.

create table if not exists public.ledger_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  currency    text not null default 'INR',
  goal_name   text not null default '',
  goal_amount numeric(14, 2) not null default 0 check (goal_amount >= 0),
  categories  jsonb not null default '[]'::jsonb,
  limits      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.ledger_months (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month         text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  allowance     numeric(14, 2) not null default 0 check (allowance >= 0),
  saving_target numeric(14, 2) not null default 0 check (saving_target >= 0),
  extras        jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (user_id, month)
);

create table if not exists public.ledger_expenses (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  date       date not null,
  amount     numeric(14, 2) not null check (amount > 0),
  category   text not null,
  reason     text not null default '',
  type       text not null check (type in ('need', 'want')),
  method     text not null default 'Cash',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists ledger_expenses_user_date on public.ledger_expenses (user_id, date);

-- Keep updated_at current on every change
create or replace function public.ledger_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ledger_settings_touch on public.ledger_settings;
create trigger ledger_settings_touch before update on public.ledger_settings
  for each row execute function public.ledger_touch();
drop trigger if exists ledger_months_touch on public.ledger_months;
create trigger ledger_months_touch before update on public.ledger_months
  for each row execute function public.ledger_touch();
drop trigger if exists ledger_expenses_touch on public.ledger_expenses;
create trigger ledger_expenses_touch before update on public.ledger_expenses
  for each row execute function public.ledger_touch();

-- Row-level security: each signed-in person can only see and change their own rows
alter table public.ledger_settings enable row level security;
alter table public.ledger_months   enable row level security;
alter table public.ledger_expenses enable row level security;

drop policy if exists "Own settings" on public.ledger_settings;
create policy "Own settings" on public.ledger_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Own months" on public.ledger_months;
create policy "Own months" on public.ledger_months for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Own expenses" on public.ledger_expenses;
create policy "Own expenses" on public.ledger_expenses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.ledger_settings, public.ledger_months, public.ledger_expenses to authenticated;
