-- Add competition boundaries before introducing World Cup data.
-- Existing rows remain March Madness rows.

alter table public.pools
  add column if not exists competition_slug text not null default 'march-madness';

alter table public.saved_drafts
  add column if not exists competition_slug text not null default 'march-madness';

alter table public.teams
  add column if not exists competition_slug text not null default 'march-madness';

alter table public.games
  add column if not exists competition_slug text not null default 'march-madness';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pools_competition_slug_check') then
    alter table public.pools add constraint pools_competition_slug_check
      check (competition_slug in ('march-madness', 'world-cup')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'saved_drafts_competition_slug_check') then
    alter table public.saved_drafts add constraint saved_drafts_competition_slug_check
      check (competition_slug in ('march-madness', 'world-cup')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_competition_slug_check') then
    alter table public.teams add constraint teams_competition_slug_check
      check (competition_slug in ('march-madness', 'world-cup')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'games_competition_slug_check') then
    alter table public.games add constraint games_competition_slug_check
      check (competition_slug in ('march-madness', 'world-cup')) not valid;
  end if;
end
$$;

create index if not exists pools_competition_slug_idx on public.pools (competition_slug);
create index if not exists saved_drafts_user_competition_idx
  on public.saved_drafts (user_id, competition_slug, updated_at desc);
create index if not exists teams_competition_slug_idx on public.teams (competition_slug);
create index if not exists games_competition_slug_round_idx on public.games (competition_slug, round);

create or replace function public.competition_draft_lock(p_competition_slug text)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_competition_slug = 'world-cup' then '2026-06-11T19:00:00+00'::timestamptz
    else '2026-03-19T16:15:00+00'::timestamptz
  end;
$$;

create or replace function public.saved_draft_write_lock_active(p_draft_id uuid default null)
returns boolean
language sql
stable
as $$
  select now() >= public.competition_draft_lock(
    coalesce(
      (select competition_slug from public.saved_drafts where id = p_draft_id),
      'march-madness'
    )
  );
$$;

create or replace function public.enforce_saved_draft_write_lock()
returns trigger
language plpgsql
as $$
declare
  v_competition_slug text;
begin
  v_competition_slug := case
    when TG_OP = 'DELETE' then OLD.competition_slug
    else NEW.competition_slug
  end;

  if now() >= public.competition_draft_lock(v_competition_slug) then
    raise exception 'Draft library is locked after first tip.'
      using errcode = 'P0001';
  end if;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

create or replace function public.enforce_saved_draft_pick_write_lock()
returns trigger
language plpgsql
as $$
declare
  v_draft_id uuid;
begin
  v_draft_id := case when TG_OP = 'DELETE' then OLD.draft_id else NEW.draft_id end;
  if public.saved_draft_write_lock_active(v_draft_id) then
    raise exception 'Draft library is locked after first tip.'
      using errcode = 'P0001';
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

drop trigger if exists trg_saved_draft_picks_lock_writes on public.saved_draft_picks;
create trigger trg_saved_draft_picks_lock_writes
before insert or update or delete on public.saved_draft_picks
for each row execute function public.enforce_saved_draft_pick_write_lock();

create or replace function public.entry_write_lock_active(p_pool_id uuid)
returns boolean
language sql
stable
as $$
  select now() >= greatest(
    coalesce(
      (select lock_time from public.pools where id = p_pool_id),
      public.competition_draft_lock(
        coalesce((select competition_slug from public.pools where id = p_pool_id), 'march-madness')
      )
    ),
    public.competition_draft_lock(
      coalesce((select competition_slug from public.pools where id = p_pool_id), 'march-madness')
    )
  );
$$;

create or replace function public.enforce_competition_pick_match()
returns trigger
language plpgsql
as $$
declare
  v_draft_competition text;
  v_team_competition text;
begin
  select competition_slug into v_draft_competition
  from public.saved_drafts where id = NEW.draft_id;
  select competition_slug into v_team_competition
  from public.teams where id = NEW.team_id;

  if v_draft_competition is distinct from v_team_competition then
    raise exception 'Draft picks must belong to the same competition as the draft.'
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_saved_draft_pick_competition_match on public.saved_draft_picks;
create trigger trg_saved_draft_pick_competition_match
before insert or update on public.saved_draft_picks
for each row execute function public.enforce_competition_pick_match();

create or replace function public.enforce_entry_pick_competition_match()
returns trigger
language plpgsql
as $$
declare
  v_pool_competition text;
  v_team_competition text;
begin
  select p.competition_slug into v_pool_competition
  from public.entries e
  join public.pools p on p.id = e.pool_id
  where e.id = NEW.entry_id;

  select competition_slug into v_team_competition
  from public.teams where id = NEW.team_id;

  if v_pool_competition is distinct from v_team_competition then
    raise exception 'Entry picks must belong to the same competition as the pool.'
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_entry_pick_competition_match on public.entry_picks;
create trigger trg_entry_pick_competition_match
before insert or update on public.entry_picks
for each row execute function public.enforce_entry_pick_competition_match();

-- Pot-like seed values and costs support the existing value-draft UI.
-- region stores the official World Cup group.
insert into public.teams (name, seed, seed_in_region, region, cost, competition_slug)
select values_table.*
from (values
  ('Mexico', 1, 1, 'Group A', 19, 'world-cup'), ('South Africa', 3, 3, 'Group A', 8, 'world-cup'), ('Korea Republic', 3, 3, 'Group A', 9, 'world-cup'), ('Czechia', 2, 2, 'Group A', 12, 'world-cup'),
  ('Canada', 2, 2, 'Group B', 13, 'world-cup'), ('Bosnia and Herzegovina', 3, 3, 'Group B', 8, 'world-cup'), ('Qatar', 4, 4, 'Group B', 6, 'world-cup'), ('Switzerland', 2, 2, 'Group B', 15, 'world-cup'),
  ('Brazil', 1, 1, 'Group C', 24, 'world-cup'), ('Morocco', 2, 2, 'Group C', 17, 'world-cup'), ('Haiti', 4, 4, 'Group C', 5, 'world-cup'), ('Scotland', 3, 3, 'Group C', 10, 'world-cup'),
  ('USA', 2, 2, 'Group D', 16, 'world-cup'), ('Paraguay', 3, 3, 'Group D', 10, 'world-cup'), ('Australia', 3, 3, 'Group D', 9, 'world-cup'), ('Türkiye', 2, 2, 'Group D', 13, 'world-cup'),
  ('Germany', 1, 1, 'Group E', 22, 'world-cup'), ('Curaçao', 4, 4, 'Group E', 5, 'world-cup'), ('Côte d''Ivoire', 3, 3, 'Group E', 11, 'world-cup'), ('Ecuador', 2, 2, 'Group E', 14, 'world-cup'),
  ('Netherlands', 1, 1, 'Group F', 21, 'world-cup'), ('Japan', 2, 2, 'Group F', 15, 'world-cup'), ('Sweden', 3, 3, 'Group F', 11, 'world-cup'), ('Tunisia', 4, 4, 'Group F', 7, 'world-cup'),
  ('Belgium', 1, 1, 'Group G', 20, 'world-cup'), ('Egypt', 3, 3, 'Group G', 10, 'world-cup'), ('IR Iran', 3, 3, 'Group G', 9, 'world-cup'), ('New Zealand', 4, 4, 'Group G', 5, 'world-cup'),
  ('Spain', 1, 1, 'Group H', 24, 'world-cup'), ('Cabo Verde', 4, 4, 'Group H', 6, 'world-cup'), ('Saudi Arabia', 4, 4, 'Group H', 7, 'world-cup'), ('Uruguay', 2, 2, 'Group H', 17, 'world-cup'),
  ('France', 1, 1, 'Group I', 24, 'world-cup'), ('Senegal', 2, 2, 'Group I', 15, 'world-cup'), ('Iraq', 4, 4, 'Group I', 6, 'world-cup'), ('Norway', 2, 2, 'Group I', 16, 'world-cup'),
  ('Argentina', 1, 1, 'Group J', 24, 'world-cup'), ('Algeria', 3, 3, 'Group J', 10, 'world-cup'), ('Austria', 2, 2, 'Group J', 14, 'world-cup'), ('Jordan', 4, 4, 'Group J', 6, 'world-cup'),
  ('Portugal', 1, 1, 'Group K', 21, 'world-cup'), ('Colombia', 2, 2, 'Group K', 15, 'world-cup'), ('Uzbekistan', 4, 4, 'Group K', 7, 'world-cup'), ('Congo DR', 3, 3, 'Group K', 9, 'world-cup'),
  ('England', 1, 1, 'Group L', 22, 'world-cup'), ('Croatia', 2, 2, 'Group L', 14, 'world-cup'), ('Ghana', 3, 3, 'Group L', 10, 'world-cup'), ('Panama', 4, 4, 'Group L', 7, 'world-cup')
) as values_table(name, seed, seed_in_region, region, cost, competition_slug)
where not exists (
  select 1 from public.teams t
  where t.competition_slug = 'world-cup' and t.name = values_table.name
);

with group_teams as (
  select
    id,
    region,
    row_number() over (partition by region order by seed_in_region, name) as position
  from public.teams
  where competition_slug = 'world-cup'
),
pairings as (
  select * from (values
    (1, 1, 2), (2, 3, 4), (3, 1, 3),
    (4, 2, 4), (5, 1, 4), (6, 2, 3)
  ) as values_table(pair_slot, team1_position, team2_position)
),
group_games as (
  select
    team1.region,
    pairings.pair_slot,
    team1.id as team1_id,
    team2.id as team2_id,
    (ascii(right(team1.region, 1)) - ascii('A')) * 6 + pairings.pair_slot as slot
  from pairings
  join group_teams team1 on team1.position = pairings.team1_position
  join group_teams team2
    on team2.region = team1.region
   and team2.position = pairings.team2_position
)
insert into public.games (round, region, slot, team1_id, team2_id, competition_slug)
select 'GROUP', region, slot, team1_id, team2_id, 'world-cup'
from group_games incoming
where not exists (
  select 1 from public.games existing
  where existing.competition_slug = 'world-cup'
    and existing.round = 'GROUP'
    and existing.region = incoming.region
    and existing.slot = incoming.slot
);

do $$
declare
  round_name text;
  slot_count integer;
  slot_number integer;
begin
  for round_name, slot_count in
    select * from (values
      ('R32', 16),
      ('S16', 8),
      ('E8', 4),
      ('F4', 2),
      ('CHIP', 1)
    ) as rounds(round_name, slot_count)
  loop
    for slot_number in 1..slot_count loop
      if not exists (
        select 1 from public.games
        where competition_slug = 'world-cup'
          and round = round_name
          and slot = slot_number
      ) then
        insert into public.games (round, slot, competition_slug)
        values (round_name, slot_number, 'world-cup');
      end if;
    end loop;
  end loop;
end
$$;
