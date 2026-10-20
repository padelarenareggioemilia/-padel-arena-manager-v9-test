-- V9.10.2 - Statistiche individuali per il mercato SVINCOLATI.
-- Da eseguire dopo SUPABASE_V9_10_0_SVINCOLATI.sql.
create or replace function public.market_list_svincolati()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
begin
  if v_uid is null then raise exception 'Sessione non valida.'; end if;
  select coalesce(public.is_admin(),false)
    or exists(select 1 from public.team_user_roles tur
      where tur.user_id=v_uid and coalesce(tur.active,true)=true
        and lower(coalesce(tur.role,'')) in ('captain','secretary'))
    or exists(select 1 from public.teams t
      where t.captain_user_id=v_uid and coalesce(t.captain_access_enabled,true)=true)
  into v_allowed;
  if not v_allowed then raise exception 'Funzione riservata ad amministratore, capitani e segretari.'; end if;

  return (
    with appearances as (
      select distinct cl.fixture_id,cl.team_id,clp.player_id,
        case lower(trim(clp.position))
          when 'maschile 1' then 0 when 'maschile1' then 0
          when 'femminile' then 1
          when 'maschile 2' then 2 when 'maschile2' then 2
          when 'misto' then 3 else null end as match_idx
      from public.captain_lineups cl
      join public.captain_lineup_players clp on clp.lineup_id=cl.id
      where cl.status='confirmed' and lower(trim(coalesce(clp.position,'')))<>'riserva'
      union
      select distinct s.fixture_id,s.team_id,s.incoming_player_id,
        case lower(trim(s.position))
          when 'maschile 1' then 0 when 'maschile1' then 0
          when 'femminile' then 1
          when 'maschile 2' then 2 when 'maschile2' then 2
          when 'misto' then 3 else null end as match_idx
      from public.captain_lineup_substitutions s
    ),
    scored as (
      select a.player_id,a.fixture_id,a.team_id,
        case
          when (nullif(m.result_data->'matches'->a.match_idx->>'h1',''))::int >
               (nullif(m.result_data->'matches'->a.match_idx->>'a1',''))::int
           and (nullif(m.result_data->'matches'->a.match_idx->>'h2',''))::int >
               (nullif(m.result_data->'matches'->a.match_idx->>'a2',''))::int then 'home'
          when (nullif(m.result_data->'matches'->a.match_idx->>'h1',''))::int <
               (nullif(m.result_data->'matches'->a.match_idx->>'a1',''))::int
           and (nullif(m.result_data->'matches'->a.match_idx->>'h2',''))::int <
               (nullif(m.result_data->'matches'->a.match_idx->>'a2',''))::int then 'away'
          when (nullif(m.result_data->'matches'->a.match_idx->>'h1',''))::int <>
               (nullif(m.result_data->'matches'->a.match_idx->>'a1',''))::int
           and (nullif(m.result_data->'matches'->a.match_idx->>'h2',''))::int <>
               (nullif(m.result_data->'matches'->a.match_idx->>'a2',''))::int
           and (nullif(m.result_data->'matches'->a.match_idx->>'htb',''))::int is not null
           and (nullif(m.result_data->'matches'->a.match_idx->>'atb',''))::int is not null
          then case when (m.result_data->'matches'->a.match_idx->>'htb')::int >
                         (m.result_data->'matches'->a.match_idx->>'atb')::int then 'home' else 'away' end
          else null
        end as winner,
        f.home_team_id
      from appearances a
      join public.fixtures f on f.id=a.fixture_id
      join public.match_results m on m.fixture_id=f.id
      where a.match_idx is not null
    ),
    stats as (
      select player_id,count(*) filter(where winner is not null) as played,
        count(*) filter(where winner is not null and ((winner='home' and team_id=home_team_id) or (winner='away' and team_id<>home_team_id))) as won,
        count(*) filter(where winner is not null and ((winner='away' and team_id=home_team_id) or (winner='home' and team_id<>home_team_id))) as lost
      from scored group by player_id
    )
    select jsonb_build_object('players',coalesce(jsonb_agg(jsonb_build_object(
      'market_entry_id',m.id,'player_id',rr.id,'first_name',rr.first_name,'last_name',rr.last_name,
      'gender',rr.gender,'email',rr.email,'phone',rr.phone,'fitp_ranking',rr.fitp_ranking,
      'medical_certificate_expiry',rr.medical_certificate_expiry,
      'source_team_id',m.source_team_id,'source_team_name',m.source_team_name,
      'reason',m.reason,'released_at',m.released_at,
      'matches_played',coalesce(st.played,0),'matches_won',coalesce(st.won,0),'matches_lost',coalesce(st.lost,0)
    ) order by m.released_at desc),'[]'::jsonb))
    from public.player_market_entries m
    join public.roster_requests rr on rr.id=m.player_id
    left join stats st on st.player_id=rr.id
    where m.status='available'
  );
end;
$function$;
revoke all on function public.market_list_svincolati() from public,anon;
grant execute on function public.market_list_svincolati() to authenticated;
notify pgrst,'reload schema';
