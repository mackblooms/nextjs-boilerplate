-- Enforce World Cup draft economics at the database layer.
-- UI validation remains useful feedback, but direct writes cannot bypass these caps.

create or replace function public.enforce_world_cup_saved_draft_limits()
returns trigger
language plpgsql
as $$
declare
  v_competition_slug text;
  v_total_cost integer;
  v_elite_count integer;
begin
  select competition_slug
  into v_competition_slug
  from public.saved_drafts
  where id = NEW.draft_id;

  if v_competition_slug <> 'world-cup' then
    return NEW;
  end if;

  perform pg_advisory_xact_lock(hashtext(NEW.draft_id::text));

  select
    coalesce(sum(t.cost), 0) + incoming.cost,
    count(*) filter (where t.cost >= 20) + case when incoming.cost >= 20 then 1 else 0 end
  into v_total_cost, v_elite_count
  from public.saved_draft_picks pick
  join public.teams t on t.id = pick.team_id
  cross join (select cost from public.teams where id = NEW.team_id) incoming
  where pick.draft_id = NEW.draft_id
    and (
      TG_OP = 'INSERT'
      or pick.draft_id <> OLD.draft_id
      or pick.team_id <> OLD.team_id
    );

  if v_total_cost > 100 then
    raise exception 'World Cup draft exceeds the 100-point budget.'
      using errcode = 'P0001';
  end if;

  if v_elite_count > 3 then
    raise exception 'World Cup drafts can include at most 3 teams priced 20 or higher.'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_world_cup_saved_draft_limits on public.saved_draft_picks;
create trigger trg_world_cup_saved_draft_limits
before insert or update on public.saved_draft_picks
for each row execute function public.enforce_world_cup_saved_draft_limits();

create or replace function public.enforce_world_cup_entry_limits()
returns trigger
language plpgsql
as $$
declare
  v_competition_slug text;
  v_total_cost integer;
  v_elite_count integer;
begin
  select p.competition_slug
  into v_competition_slug
  from public.entries e
  join public.pools p on p.id = e.pool_id
  where e.id = NEW.entry_id;

  if v_competition_slug <> 'world-cup' then
    return NEW;
  end if;

  perform pg_advisory_xact_lock(hashtext(NEW.entry_id::text));

  select
    coalesce(sum(t.cost), 0) + incoming.cost,
    count(*) filter (where t.cost >= 20) + case when incoming.cost >= 20 then 1 else 0 end
  into v_total_cost, v_elite_count
  from public.entry_picks pick
  join public.teams t on t.id = pick.team_id
  cross join (select cost from public.teams where id = NEW.team_id) incoming
  where pick.entry_id = NEW.entry_id
    and (
      TG_OP = 'INSERT'
      or pick.entry_id <> OLD.entry_id
      or pick.team_id <> OLD.team_id
    );

  if v_total_cost > 100 then
    raise exception 'World Cup entry exceeds the 100-point budget.'
      using errcode = 'P0001';
  end if;

  if v_elite_count > 3 then
    raise exception 'World Cup entries can include at most 3 teams priced 20 or higher.'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_world_cup_entry_limits on public.entry_picks;
create trigger trg_world_cup_entry_limits
before insert or update on public.entry_picks
for each row execute function public.enforce_world_cup_entry_limits();
