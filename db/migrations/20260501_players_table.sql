create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team text,
  position text,
  age integer,
  year text,
  coach text,
  system text,
  role text,
  previous_ppg numeric,
  previous_rpg numeric,
  previous_apg numeric,
  previous_3p numeric,
  previous_fg numeric,
  previous_ft numeric,
  previous_bpg numeric,
  previous_spg numeric,
  previous_mpg numeric,
  prior_ppg numeric,
  prior_rpg numeric,
  prior_apg numeric,
  prior_3p numeric,
  prior_fg numeric,
  prior_ft numeric,
  prior_bpg numeric,
  prior_spg numeric,
  coach_success numeric,
  system_fit numeric,
  role_opportunity numeric,
  baseline_momentum numeric,
  improvement_score numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists players_name_key on public.players (name);
create index if not exists players_team_idx on public.players (team);
create index if not exists players_lower_name_idx on public.players (lower(name));

alter table public.players enable row level security;
