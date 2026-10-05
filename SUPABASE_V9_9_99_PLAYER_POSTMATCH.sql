-- V9.9.99
-- Fix Area Giocatore + Post partita
-- Eseguire sul progetto Supabase V9 Test.
-- Non modifica risultati già registrati.

create or replace function public.get_my_player_portal()
returns jsonb language plpgsql security definer
set search_path to 'public'
as $function$
declare
 v_uid uuid:=auth.uid(); v_email text; v_team_id uuid;
 v_player jsonb; v_team jsonb; v_category_code text;
 v_fixtures jsonb:='[]'; v_category_fixtures jsonb:='[]'; v_all_fixtures jsonb:='[]';
 v_statuses jsonb:='[]'; v_category_statuses jsonb:='[]'; v_all_statuses jsonb:='[]';
 v_groups jsonb:='[]'; v_members jsonb:='[]'; v_teams jsonb:='[]';
begin
 if v_uid is null then raise exception 'Sessione non valida. Effettua nuovamente l’accesso.'; end if;
 select lower(trim(coalesce(email,''))) into v_email from auth.users where id=v_uid;

 select tur.team_id into v_team_id from public.team_user_roles tur
 where tur.user_id=v_uid and coalesce(tur.active,true)=true
 and lower(coalesce(tur.role,''))='player' limit 1;

 if v_team_id is null then
  select rr.team_id into v_team_id from public.roster_requests rr
  where lower(trim(coalesce(rr.email,'')))=v_email
  and lower(trim(coalesce(rr.status,''))) in ('approved','approvata','approvato','accepted','active')
  order by rr.created_at desc nulls last limit 1;
 end if;

 if v_team_id is null then
  return jsonb_build_object('ok',false,'message','Nessuna iscrizione giocatore approvata è collegata a questo account.');
 end if;

 select to_jsonb(rr) into v_player from public.roster_requests rr
 where rr.team_id=v_team_id and lower(trim(coalesce(rr.email,'')))=v_email
 order by case when lower(trim(coalesce(rr.status,''))) in ('approved','approvata','approvato','accepted','active') then 0 else 1 end,
 rr.created_at desc nulls last limit 1;

 select to_jsonb(t) into v_team from public.teams t where t.id=v_team_id limit 1;

 v_category_code:=case
 when upper(trim(coalesce(v_team->>'series',''))) in ('A','SERIE A','SERIE_A') then 'SERIE_A'
 when upper(trim(coalesce(v_team->>'series',''))) in ('B','SERIE B','SERIE_B') then 'SERIE_B'
 when upper(trim(coalesce(v_team->>'series',''))) in ('C','SERIE C','SERIE_C') then 'SERIE_C'
 else upper(replace(trim(coalesce(v_team->>'series','')),' ','_')) end;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.scheduled_at),'[]'::jsonb) into v_fixtures
 from public.public_championship_fixtures x where x.home_team_id=v_team_id or x.away_team_id=v_team_id;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.scheduled_at),'[]'::jsonb) into v_category_fixtures
 from public.public_championship_fixtures x where x.competition_code=v_category_code;

 select coalesce(jsonb_agg(to_jsonb(x) order by x.scheduled_at),'[]'::jsonb) into v_all_fixtures
 from public.public_championship_fixtures x;

 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_statuses from public.public_championship_status x
 where x.fixture_id in(select f.id from public.public_championship_fixtures f where f.home_team_id=v_team_id or f.away_team_id=v_team_id);

 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_category_statuses from public.public_championship_status x
 where x.fixture_id in(select f.id from public.public_championship_fixtures f where f.competition_code=v_category_code);

 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_all_statuses from public.public_championship_status x;

 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_members from public.public_championship_group_teams x where x.team_id=v_team_id;
 select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) into v_groups from public.public_championship_groups g
 where g.id in(select m.group_id from public.public_championship_group_teams m where m.team_id=v_team_id);
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_teams from public.public_championship_teams t;

 return jsonb_build_object(
 'ok',true,'player',coalesce(v_player,'{}'::jsonb),'team',coalesce(v_team,'{}'::jsonb),'team_id',v_team_id,
 'category_code',v_category_code,'fixtures',v_fixtures,'category_fixtures',v_category_fixtures,
 'all_fixtures',v_all_fixtures,'statuses',v_statuses,'category_statuses',v_category_statuses,
 'all_statuses',v_all_statuses,'groups',v_groups,'members',v_members,'teams',v_teams);
end;
$function$;
