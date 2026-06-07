-- Backfill competition_slug for rows that predate the column addition.
-- These rows belong to the original March Madness tournament data.

update public.games
  set competition_slug = 'march-madness'
  where competition_slug is null;

update public.teams
  set competition_slug = 'march-madness'
  where competition_slug is null;

update public.pools
  set competition_slug = 'march-madness'
  where competition_slug is null;

update public.saved_drafts
  set competition_slug = 'march-madness'
  where competition_slug is null;
