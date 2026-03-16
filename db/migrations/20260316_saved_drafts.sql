-- Reusable user-owned drafts that can be applied to different pools.
create extension if not exists pgcrypto;

create table if not exists public.saved_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_drafts_user_updated_idx
  on public.saved_drafts (user_id, updated_at desc);

create table if not exists public.saved_draft_picks (
  draft_id uuid not null references public.saved_drafts(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (draft_id, team_id)
);

create index if not exists saved_draft_picks_draft_idx
  on public.saved_draft_picks (draft_id);

create index if not exists saved_draft_picks_team_idx
  on public.saved_draft_picks (team_id);

create or replace function public.set_saved_draft_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists saved_drafts_touch_updated_at on public.saved_drafts;

create trigger saved_drafts_touch_updated_at
before update on public.saved_drafts
for each row
execute function public.set_saved_draft_updated_at();

alter table public.saved_drafts enable row level security;
alter table public.saved_draft_picks enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_drafts'
      and policyname = 'saved_drafts_select_own'
  ) then
    create policy saved_drafts_select_own
      on public.saved_drafts
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_drafts'
      and policyname = 'saved_drafts_insert_own'
  ) then
    create policy saved_drafts_insert_own
      on public.saved_drafts
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_drafts'
      and policyname = 'saved_drafts_update_own'
  ) then
    create policy saved_drafts_update_own
      on public.saved_drafts
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_drafts'
      and policyname = 'saved_drafts_delete_own'
  ) then
    create policy saved_drafts_delete_own
      on public.saved_drafts
      for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_draft_picks'
      and policyname = 'saved_draft_picks_select_own'
  ) then
    create policy saved_draft_picks_select_own
      on public.saved_draft_picks
      for select
      using (
        exists (
          select 1
          from public.saved_drafts d
          where d.id = draft_id
            and d.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_draft_picks'
      and policyname = 'saved_draft_picks_insert_own'
  ) then
    create policy saved_draft_picks_insert_own
      on public.saved_draft_picks
      for insert
      with check (
        exists (
          select 1
          from public.saved_drafts d
          where d.id = draft_id
            and d.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_draft_picks'
      and policyname = 'saved_draft_picks_update_own'
  ) then
    create policy saved_draft_picks_update_own
      on public.saved_draft_picks
      for update
      using (
        exists (
          select 1
          from public.saved_drafts d
          where d.id = draft_id
            and d.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.saved_drafts d
          where d.id = draft_id
            and d.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_draft_picks'
      and policyname = 'saved_draft_picks_delete_own'
  ) then
    create policy saved_draft_picks_delete_own
      on public.saved_draft_picks
      for delete
      using (
        exists (
          select 1
          from public.saved_drafts d
          where d.id = draft_id
            and d.user_id = auth.uid()
        )
      );
  end if;
end
$$;
