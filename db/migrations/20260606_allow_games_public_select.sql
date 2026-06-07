-- Games are public tournament facts. Client pages need them for brackets,
-- leaderboards, and scoring previews.

grant select on table public.games to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'games'
      and policyname = 'games_select_public'
  ) then
    create policy games_select_public
      on public.games
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;
