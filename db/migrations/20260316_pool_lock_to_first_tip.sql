-- Lock all pools at first tip: Thu Mar 19, 2026 12:15 PM ET (16:15 UTC)
alter table public.pools
  alter column lock_time
  set default '2026-03-19T16:15:00+00'::timestamptz;

-- Keep any intentionally earlier locks; clamp null/later values to official first tip.
update public.pools
set lock_time = '2026-03-19T16:15:00+00'::timestamptz
where lock_time is null
   or lock_time > '2026-03-19T16:15:00+00'::timestamptz;
