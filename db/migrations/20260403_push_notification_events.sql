create extension if not exists pgcrypto;

create table if not exists public.push_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  user_id uuid,
  pool_id uuid,
  device_installation_id text,
  channel text not null default 'apns',
  status text not null default 'sent',
  error_message text,
  created_at timestamptz not null default now()
);

create unique index if not exists push_notification_events_event_key_key
  on public.push_notification_events (event_key);

create index if not exists push_notification_events_pool_id_idx
  on public.push_notification_events (pool_id);

create index if not exists push_notification_events_user_id_idx
  on public.push_notification_events (user_id);

alter table public.push_notification_events enable row level security;

