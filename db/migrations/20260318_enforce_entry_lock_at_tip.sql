-- Enforce pool entry lock at the database layer once first tip hits.
-- This blocks entry add/remove even if someone bypasses UI/API checks.

create or replace function public.entry_write_lock_active(p_pool_id uuid)
returns boolean
language sql
stable
as $$
  select now() >= greatest(
    coalesce(
      (select lock_time from public.pools where id = p_pool_id),
      '2026-03-19T16:15:00+00'::timestamptz
    ),
    '2026-03-19T16:15:00+00'::timestamptz
  );
$$;

create or replace function public.enforce_entry_lock_on_entries()
returns trigger
language plpgsql
as $$
declare
  v_pool_id uuid;
begin
  v_pool_id := case when TG_OP = 'DELETE' then OLD.pool_id else NEW.pool_id end;

  if v_pool_id is not null and public.entry_write_lock_active(v_pool_id) then
    raise exception 'Draft entries are locked for this pool.'
      using errcode = 'P0001';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create or replace function public.enforce_entry_lock_on_entry_picks()
returns trigger
language plpgsql
as $$
declare
  v_entry_id uuid;
  v_pool_id uuid;
begin
  v_entry_id := case when TG_OP = 'DELETE' then OLD.entry_id else NEW.entry_id end;

  select e.pool_id
  into v_pool_id
  from public.entries e
  where e.id = v_entry_id;

  if v_pool_id is not null and public.entry_write_lock_active(v_pool_id) then
    raise exception 'Draft entries are locked for this pool.'
      using errcode = 'P0001';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_entries_lock_writes on public.entries;
create trigger trg_entries_lock_writes
before insert or delete on public.entries
for each row
execute function public.enforce_entry_lock_on_entries();

drop trigger if exists trg_entry_picks_lock_writes on public.entry_picks;
create trigger trg_entry_picks_lock_writes
before insert or update or delete on public.entry_picks
for each row
execute function public.enforce_entry_lock_on_entry_picks();
