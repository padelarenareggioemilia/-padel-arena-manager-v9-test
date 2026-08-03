-- AICS PADEL CHAMPIONSHIP V9.7.7
-- FIX: cannot change return type of existing function
-- Questo script elimina soltanto la vecchia funzione e la ricrea correttamente.
-- Non elimina squadre, calendari, risultati o formazioni.

begin;

drop function if exists public.publish_competition_calendar(text);

create function public.publish_competition_calendar(p_competition_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture_row record;
  already_opened_teams uuid[] := array[]::uuid[];
  opened_count integer := 0;
  activated_count integer := 0;
  open_now timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata all amministratore';
  end if;

  for fixture_row in
    select *
    from public.fixtures
    where competition_code = p_competition_code
      and home_team_id is not null
      and away_team_id is not null
      and scheduled_at is not null
    order by scheduled_at, id
  loop
    open_now := null;

    -- Apre immediatamente la prima gara incontrata per ciascuna squadra.
    if not (fixture_row.home_team_id = any(already_opened_teams))
       or not (fixture_row.away_team_id = any(already_opened_teams)) then
      open_now := now();

      if not (fixture_row.home_team_id = any(already_opened_teams)) then
        already_opened_teams :=
          array_append(already_opened_teams, fixture_row.home_team_id);
      end if;

      if not (fixture_row.away_team_id = any(already_opened_teams)) then
        already_opened_teams :=
          array_append(already_opened_teams, fixture_row.away_team_id);
      end if;
    end if;

    insert into public.match_workflows (
      fixture_id,
      formation_open_at,
      selection_lock_at,
      lineup_lock_at,
      result_edit_until,
      created_at,
      updated_at
    )
    values (
      fixture_row.id,
      open_now,
      fixture_row.scheduled_at - interval '120 minutes',
      fixture_row.scheduled_at - interval '5 minutes',
      fixture_row.scheduled_at + interval '26 hours',
      now(),
      now()
    )
    on conflict (fixture_id) do update set
      formation_open_at =
        coalesce(public.match_workflows.formation_open_at,
                 excluded.formation_open_at),
      selection_lock_at = excluded.selection_lock_at,
      lineup_lock_at = excluded.lineup_lock_at,
      result_edit_until = excluded.result_edit_until,
      updated_at = now();

    activated_count := activated_count + 1;

    if open_now is not null then
      opened_count := opened_count + 1;
    end if;
  end loop;

  insert into public.championship_publication (
    competition_code,
    is_published,
    published_at,
    updated_at
  )
  values (
    p_competition_code,
    true,
    now(),
    now()
  )
  on conflict (competition_code) do update set
    is_published = true,
    published_at = now(),
    updated_at = now();

  return jsonb_build_object(
    'fixtures_activated', activated_count,
    'first_lineups_opened', opened_count
  );
end;
$$;

grant execute
on function public.publish_competition_calendar(text)
to authenticated;

commit;

notify pgrst, 'reload schema';
