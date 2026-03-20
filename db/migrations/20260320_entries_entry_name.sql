-- Persist a display name per pool entry.
alter table public.entries
  add column if not exists entry_name text;
