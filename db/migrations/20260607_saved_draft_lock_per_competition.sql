-- Replace the single hardcoded march-madness lock with a competition-aware check.
-- Also drop the lock trigger on saved_draft_picks: that table has no competition_slug
-- column, so the trigger crashed on cascaded deletes. The saved_drafts trigger is
-- sufficient since picks can only be written via a draft row.

-- Drop triggers first so we can safely replace the functions.
drop trigger if exists trg_saved_drafts_lock_writes on public.saved_drafts;
drop trigger if exists trg_saved_draft_picks_lock_writes on public.saved_draft_picks;

-- Competition-aware lock check: takes the row's competition_slug.
create or replace function public.saved_draft_write_lock_active(competition text)
returns boolean
language sql
stable
as $$
  select case competition
    when 'world-cup' then now() >= '2026-06-11T19:00:00+00'::timestamptz
    else now() >= '2026-03-19T16:15:00+00'::timestamptz
  end;
$$;

-- Updated trigger function: uses the draft row's own competition_slug.
create or replace function public.enforce_saved_draft_write_lock()
returns trigger
language plpgsql
as $$
declare
  slug text;
begin
  if TG_OP = 'DELETE' then
    slug := OLD.competition_slug;
  else
    slug := NEW.competition_slug;
  end if;

  if public.saved_draft_write_lock_active(coalesce(slug, 'march-madness')) then
    raise exception 'Draft library is locked after first tip.'
      using errcode = 'P0001';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- Recreate trigger on saved_drafts only (not saved_draft_picks).
create trigger trg_saved_drafts_lock_writes
before insert or update or delete on public.saved_drafts
for each row
execute function public.enforce_saved_draft_write_lock();
