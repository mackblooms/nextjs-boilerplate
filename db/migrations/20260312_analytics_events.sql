create table if not exists public.analytics_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event_name text not null,
  event_source text not null default 'web',
  path text,
  session_id text,
  user_id uuid,
  pool_id uuid,
  entry_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_event_name_idx
  on public.analytics_events (event_name);

create index if not exists analytics_events_user_id_idx
  on public.analytics_events (user_id);
