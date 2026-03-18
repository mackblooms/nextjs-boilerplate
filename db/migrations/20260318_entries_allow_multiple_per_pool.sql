-- Allow users to create multiple entries in the same pool.
alter table if exists public.entries
  drop constraint if exists entries_pool_id_user_id_key;

drop index if exists public.entries_pool_id_user_id_key;

create index if not exists entries_pool_user_idx
  on public.entries (pool_id, user_id);
