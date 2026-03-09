-- Add private-pool metadata and password hash storage.
alter table public.pools
  add column if not exists is_private boolean not null default true;

alter table public.pools
  add column if not exists join_password_hash text;

-- Ensure existing rows are private unless you explicitly update them later.
update public.pools
set is_private = true
where is_private is null;
