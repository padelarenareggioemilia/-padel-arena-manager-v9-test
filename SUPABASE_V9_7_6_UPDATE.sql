-- AICS PADEL CHAMPIONSHIP V9.7.6
-- PUBBLICAZIONE CALENDARIO, PRIMA FORMAZIONE E OPERATIVITA CAPITANO

begin;

-- Consente all'amministratore di pubblicare una competizione e avviare
-- la prima formazione di ogni squadra in modo verificabile.
create or replace function public.publish_competition_calendar(p_competition_code text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  fixture_row record;
  first_home uuid[];
  first_away uuid[];
  opened_count integer := 0;
  activated_count integer := 0;
  open_now timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata all amministratore';
  end if;

  first_home := array[]::uuid[];
  first_away := array[]::uuid[];

  for fixture_row in
    select *
    from public.fixtures
    where competition_code=p_competition_code
      and home_team_id is not null
      and away_team_id is not null
      and scheduled_at is not null
    order by scheduled_at, id
  loop
    open_now := null;

    if not (fixture_row.home_team_id = any(first_home))
       and not (fixture_row.home_team_id = any(first_away)) then
      open_now := now();
      first_home := array_append(first_home,fixture_row.home_team_id);
    end if;

    if not (fixture_row.away_team_id = any(first_home))
       and not (fixture_row.away_team_id = any(first_away)) then
      open_now := coalesce(open_now,now());
      first_away := array_append(first_away,fixture_row.away_team_id);
    end if;

    insert into public.match_workflows(
      fixture_id,
      formation_open_at,
      selection_lock_at,
      lineup_lock_at,
      result_edit_until,
      created_at,
      updated_at
    )
    values(
      fixture_row.id,
      open_now,
      fixture_row.scheduled_at - interval '120 minutes',
      fixture_row.scheduled_at - interval '5 minutes',
      fixture_row.scheduled_at + interval '26 hours',
      now(),
      now()
    )
    on conflict(fixture_id) do update set
      formation_open_at=coalesce(public.match_workflows.formation_open_at,excluded.formation_open_at),
      selection_lock_at=excluded.selection_lock_at,
      lineup_lock_at=excluded.lineup_lock_at,
      result_edit_until=excluded.result_edit_until,
      updated_at=now();

    activated_count := activated_count+1;
    if open_now is not null then opened_count := opened_count+1; end if;
  end loop;

  insert into public.championship_publication(
    competition_code,is_published,published_at,updated_at
  )
  values(p_competition_code,true,now(),now())
  on conflict(competition_code) do update set
    is_published=true,published_at=now(),updated_at=now();

  return jsonb_build_object(
    'fixtures_activated',activated_count,
    'first_lineups_opened',opened_count
  );
end;
$$;

grant execute on function public.publish_competition_calendar(text) to authenticated;

-- Il capitano e i segretari abilitati possono inserire manualmente
-- giocatori nella propria squadra, ma non possono eliminarli.
drop policy if exists roster_requests_captain_insert on public.roster_requests;
create policy roster_requests_captain_insert
on public.roster_requests
for insert
to authenticated
with check(
  public.is_admin()
  or exists(
    select 1
    from public.team_user_roles tur
    join public.teams t on t.id=tur.team_id
    where tur.team_id=roster_requests.team_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in('captain','secretary')
      and t.captain_access_enabled=true
  )
);

drop policy if exists roster_requests_captain_select on public.roster_requests;
create policy roster_requests_captain_select
on public.roster_requests
for select
to authenticated
using(
  public.is_admin()
  or user_id=auth.uid()
  or exists(
    select 1 from public.team_user_roles tur
    where tur.team_id=roster_requests.team_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in('captain','secretary')
  )
);

grant select,insert,update on public.roster_requests to authenticated;

commit;
notify pgrst,'reload schema';
