-- AICS PADEL CHAMPIONSHIP V9.7.1
-- PERMESSI CAPITANO / SEGRETARIO SU SQUADRA E GIOCATORI

begin;

-- Squadra: il capitano/segretario attivo può leggere e aggiornare la propria squadra.
drop policy if exists teams_captain_read on public.teams;
create policy teams_captain_read
on public.teams
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.team_user_roles tur
    where tur.team_id=teams.id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
  )
);

drop policy if exists teams_captain_update on public.teams;
create policy teams_captain_update
on public.teams
for update
to authenticated
using (
  public.is_admin()
  or (
    captain_access_enabled=true
    and exists (
      select 1
      from public.team_user_roles tur
      where tur.team_id=teams.id
        and tur.user_id=auth.uid()
        and tur.active=true
        and tur.role in ('captain','secretary')
    )
  )
)
with check (
  public.is_admin()
  or (
    captain_access_enabled=true
    and exists (
      select 1
      from public.team_user_roles tur
      where tur.team_id=teams.id
        and tur.user_id=auth.uid()
        and tur.active=true
        and tur.role in ('captain','secretary')
    )
  )
);

-- Giocatori: capitano/segretario può gestire i giocatori della propria squadra.
drop policy if exists players_captain_select on public.players;
create policy players_captain_select
on public.players
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.team_user_roles tur
    where tur.team_id=players.team_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
  )
);

drop policy if exists players_captain_insert on public.players;
create policy players_captain_insert
on public.players
for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1
    from public.team_user_roles tur
    join public.teams t on t.id=tur.team_id
    where tur.team_id=players.team_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
      and t.captain_access_enabled=true
  )
);

drop policy if exists players_captain_update on public.players;
create policy players_captain_update
on public.players
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.team_user_roles tur
    join public.teams t on t.id=tur.team_id
    where tur.team_id=players.team_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
      and t.captain_access_enabled=true
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.team_user_roles tur
    join public.teams t on t.id=tur.team_id
    where tur.team_id=players.team_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
      and t.captain_access_enabled=true
  )
);

drop policy if exists players_captain_delete on public.players;
create policy players_captain_delete
on public.players
for delete
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.team_user_roles tur
    join public.teams t on t.id=tur.team_id
    where tur.team_id=players.team_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
      and t.captain_access_enabled=true
  )
);

grant select,insert,update,delete on public.players to authenticated;
grant select,update on public.teams to authenticated;

commit;
notify pgrst,'reload schema';
