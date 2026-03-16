create table if not exists public.pool_archives (
  pool_id uuid not null references public.pools(id) on delete cascade,
  season integer not null check (season >= 2000 and season <= 2100),
  snapshot jsonb not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pool_id, season)
);

create index if not exists pool_archives_pool_updated_idx
  on public.pool_archives (pool_id, updated_at desc);

alter table public.pool_archives enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pool_archives'
      and policyname = 'pool_archives_select_members'
  ) then
    create policy pool_archives_select_members
      on public.pool_archives
      for select
      using (
        exists (
          select 1
          from public.pool_members pm
          where pm.pool_id = public.pool_archives.pool_id
            and pm.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pool_archives'
      and policyname = 'pool_archives_insert_owner'
  ) then
    create policy pool_archives_insert_owner
      on public.pool_archives
      for insert
      with check (
        exists (
          select 1
          from public.pools p
          where p.id = public.pool_archives.pool_id
            and p.created_by = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pool_archives'
      and policyname = 'pool_archives_update_owner'
  ) then
    create policy pool_archives_update_owner
      on public.pool_archives
      for update
      using (
        exists (
          select 1
          from public.pools p
          where p.id = public.pool_archives.pool_id
            and p.created_by = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.pools p
          where p.id = public.pool_archives.pool_id
            and p.created_by = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pool_archives'
      and policyname = 'pool_archives_delete_owner'
  ) then
    create policy pool_archives_delete_owner
      on public.pool_archives
      for delete
      using (
        exists (
          select 1
          from public.pools p
          where p.id = public.pool_archives.pool_id
            and p.created_by = auth.uid()
        )
      );
  end if;
end
$$;
