-- Update the saved-draft write lock to be competition-aware.
-- The original trigger hardcoded the march-madness tip time for all rows,
-- which blocked world-cup draft writes even before the world cup starts.

create or replace function public.saved_draft_write_lock_active(competition text)
returns boolean
language sql
stable
as $$
  select case competition
    when 'world-cup' then now() >= '2026-06-11T19:00:00+00'::timestamptz
    else now() >= '2026-03-19T16:15:00+00'::timestamptz  -- march-madness default
  end;
$$;

create or replace function public.enforce_saved_draft_write_lock()
returns trigger
language plpgsql
as $$
declare
  slug text;
begin
  -- For DELETE use OLD row; for INSERT/UPDATE use NEW row.
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
