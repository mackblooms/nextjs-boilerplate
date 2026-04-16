create extension if not exists pgcrypto;

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text,
  enabled boolean not null default true,
  permission_state text not null default 'unknown',
  last_registered_at timestamptz,
  last_seen_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_devices_installation_id_key
  on public.push_devices (installation_id);

create unique index if not exists push_devices_token_key
  on public.push_devices (token)
  where token is not null;

create index if not exists push_devices_user_id_idx
  on public.push_devices (user_id);

alter table public.push_devices enable row level security;

