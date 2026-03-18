-- Prevent creating/editing/deleting saved drafts after first tip.
-- This applies globally, including users' personal draft libraries.

create or replace function public.saved_draft_write_lock_active()
returns boolean
language sql
stable
as $$
  select now() >= '2026-03-19T16:15:00+00'::timestamptz;
$$;

create or replace function public.enforce_saved_draft_write_lock()
returns trigger
language plpgsql
as $$
begin
  if public.saved_draft_write_lock_active() then
    raise exception 'Draft library is locked after first tip.'
      using errcode = 'P0001';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_saved_drafts_lock_writes on public.saved_drafts;
create trigger trg_saved_drafts_lock_writes
before insert or update or delete on public.saved_drafts
for each row
execute function public.enforce_saved_draft_write_lock();

drop trigger if exists trg_saved_draft_picks_lock_writes on public.saved_draft_picks;
create trigger trg_saved_draft_picks_lock_writes
before insert or update or delete on public.saved_draft_picks
for each row
execute function public.enforce_saved_draft_write_lock();
