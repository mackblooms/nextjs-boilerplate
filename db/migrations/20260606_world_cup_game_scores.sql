alter table public.games
  add column if not exists team1_score integer,
  add column if not exists team2_score integer;

create index if not exists games_world_cup_group_status_idx
  on public.games (competition_slug, round, region, status)
  where competition_slug = 'world-cup' and round = 'GROUP';
