-- PADEL ARENA MANAGER V9.9.85
-- RASSEGNA SETTIMANALE ADMIN: partite reggiane, foto e articolo per la stampa locale.

begin;

create table if not exists public.weekly_press_articles (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  title text,
  body text,
  selected_photos jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_press_dates_ok check (week_end >= week_start),
  constraint weekly_press_photos_array_ok check (jsonb_typeof(selected_photos)='array'),
  constraint weekly_press_photos_limit_ok check (jsonb_array_length(selected_photos)<=2)
);

create index if not exists weekly_press_articles_created_by_idx
  on public.weekly_press_articles(created_by);
create index if not exists weekly_press_articles_updated_by_idx
  on public.weekly_press_articles(updated_by);

alter table public.weekly_press_articles enable row level security;
revoke all on public.weekly_press_articles from anon,authenticated;
drop policy if exists weekly_press_admin_read on public.weekly_press_articles;
create policy weekly_press_admin_read on public.weekly_press_articles for select to authenticated using(public.is_admin());

-- L'Admin deve poter intervenire in emergenza sulle distinte ufficiali.
create or replace function public.captain_save_lineup(p_fixture_id uuid,p_team_id uuid,p_players jsonb,p_notes text,p_confirm boolean)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v uuid;i jsonb;v_pid uuid;v_pos text;v_count int;
begin
 if not public.is_admin() and not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role in('captain','secretary')) then raise exception 'Non autorizzato.'; end if;
 if not exists(select 1 from public.fixtures where id=p_fixture_id and p_team_id in(home_team_id,away_team_id)) then raise exception 'La squadra non partecipa a questa partita.'; end if;
 if jsonb_array_length(coalesce(p_players,'[]'::jsonb))=0 then raise exception 'Seleziona almeno un giocatore.'; end if;
 for i in select * from jsonb_array_elements(coalesce(p_players,'[]'::jsonb)) loop
   v_pid=(i->>'player_id')::uuid;v_pos=trim(coalesce(i->>'position',''));
   if v_pos not in('M1','M2','Misto','Femminile','Riserva') then raise exception 'Assegna un ruolo valido a tutti i giocatori selezionati.'; end if;
   if not exists(select 1 from public.roster_requests rr where rr.id=v_pid and rr.team_id=p_team_id and lower(coalesce(rr.status,''))='approved') then raise exception 'Giocatore non approvato o non appartenente alla squadra.'; end if;
 end loop;
 select max(c) into v_count from(select count(*) c from jsonb_array_elements(p_players)x group by x->>'player_id')q;
 if coalesce(v_count,0)>2 then raise exception 'Ogni giocatore può essere impiegato in massimo 2 incontri.'; end if;
 if exists(select 1 from jsonb_array_elements(p_players)x group by x->>'player_id',x->>'position' having count(*)>1) then raise exception 'Lo stesso ruolo non può essere assegnato due volte allo stesso giocatore.'; end if;
 if p_confirm then
   if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='M1')<>2 then raise exception 'M1 deve avere esattamente 2 giocatori.'; end if;
   if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='M2')<>2 then raise exception 'M2 deve avere esattamente 2 giocatori.'; end if;
   if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='Misto')<>2 then raise exception 'Misto deve avere esattamente 2 giocatori.'; end if;
   if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='Femminile')<>2 then raise exception 'Femminile deve avere esattamente 2 giocatrici.'; end if;
   if exists(select 1 from jsonb_array_elements(p_players)x join public.roster_requests rr on rr.id=(x->>'player_id')::uuid where x->>'position'='Femminile' and lower(trim(coalesce(rr.gender,''))) not in('f','femminile','female','donna')) then raise exception 'La partita Femminile può contenere solo giocatrici.'; end if;
   if(select count(*) from jsonb_array_elements(p_players)x join public.roster_requests rr on rr.id=(x->>'player_id')::uuid where x->>'position'='Misto' and lower(trim(coalesce(rr.gender,''))) in('f','femminile','female','donna'))<>1 then raise exception 'Il Misto deve essere composto da 1 uomo e 1 donna.'; end if;
   if(select count(*) from jsonb_array_elements(p_players)x join public.roster_requests rr on rr.id=(x->>'player_id')::uuid where x->>'position'='Misto' and lower(trim(coalesce(rr.gender,''))) in('m','maschile','male','uomo'))<>1 then raise exception 'Il Misto deve essere composto da 1 uomo e 1 donna.'; end if;
 end if;
 insert into public.captain_lineups(fixture_id,team_id,created_by,status,notes,updated_at) values(p_fixture_id,p_team_id,auth.uid(),case when p_confirm then 'confirmed' else 'draft' end,p_notes,now()) on conflict(fixture_id,team_id) do update set status=excluded.status,notes=excluded.notes,updated_at=now(),created_by=auth.uid() returning id into v;
 delete from public.captain_lineup_players where lineup_id=v;
 for i in select * from jsonb_array_elements(p_players) loop insert into public.captain_lineup_players(lineup_id,player_id,position,confirmed) values(v,(i->>'player_id')::uuid,i->>'position',p_confirm);end loop;
 return v;
end;$$;

-- L'interruttore globale resta valido per gli staff, ma non blocca un intervento Admin.
create or replace function public.save_match_result(p_fixture_id uuid,p_result jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare f public.fixtures%rowtype;w public.match_workflows%rowtype;controls public.championship_controls%rowtype;v jsonb;
begin
 select * into controls from public.championship_controls where id=1;
 if not coalesce(controls.results_enabled,true) and not public.is_admin() then raise exception 'Inserimento risultati disabilitato'; end if;
 select * into f from public.fixtures where id=p_fixture_id;if f.id is null then raise exception 'Partita non trovata';end if;
 select * into w from public.match_workflows where fixture_id=p_fixture_id;
 if not(public.current_user_is_team_staff(f.home_team_id) or public.current_user_is_team_staff(f.away_team_id) or public.is_admin()) then raise exception 'Non autorizzato';end if;
 if w.homologated_at is not null and not public.is_admin() then raise exception 'Risultato già omologato';end if;
 if now()>w.result_edit_deadline and not public.is_admin() then raise exception 'Termine di 26 ore scaduto';end if;
 v:=public.competition_result_engine(p_result);if coalesce((v->>'valid')::boolean,false) is not true then raise exception '%',coalesce(v->>'error','Risultato incompleto o non valido.');end if;
 insert into public.match_results(fixture_id,result_data,submitted_at,submitted_by,updated_at) values(p_fixture_id,p_result,now(),auth.uid(),now()) on conflict(fixture_id) do update set result_data=excluded.result_data,submitted_at=now(),submitted_by=auth.uid(),updated_at=now();
 insert into public.match_audit_log(fixture_id,user_id,action,payload) values(p_fixture_id,auth.uid(),'result_saved',p_result);
end;$$;

create or replace function public.is_reggio_province(p_value text)
returns boolean
language sql
immutable
set search_path=public,pg_temp
as $$
  select regexp_replace(upper(coalesce(trim(p_value),'')),'[^A-Z]','','g')
    in ('RE','REGGIOEMILIA','REGGIONELLEMILIA');
$$;

create or replace function public.admin_get_match_lineup_data(p_fixture_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare f public.fixtures%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Accesso riservato Admin'; end if;
  select * into f from public.fixtures where id=p_fixture_id;
  if f.id is null then raise exception 'Partita non trovata'; end if;
  return jsonb_build_object(
    'ok',true,'fixture',to_jsonb(f),
    'teams',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by case when t.id=f.home_team_id then 0 else 1 end) from public.teams t where t.id in(f.home_team_id,f.away_team_id)),'[]'::jsonb),
    'roster',coalesce((select jsonb_agg(jsonb_build_object('id',rr.id,'team_id',rr.team_id,'first_name',rr.first_name,'last_name',rr.last_name,'fitp_ranking',rr.fitp_ranking,'status',rr.status,'gender',rr.gender) order by rr.team_id,rr.last_name,rr.first_name) from public.roster_requests rr where rr.team_id in(f.home_team_id,f.away_team_id) and lower(coalesce(rr.status,''))='approved'),'[]'::jsonb),
    'lineups',coalesce((select jsonb_agg(to_jsonb(cl) order by cl.team_id) from public.captain_lineups cl where cl.fixture_id=f.id),'[]'::jsonb),
    'lineup_players',coalesce((select jsonb_agg(to_jsonb(clp) order by clp.lineup_id,clp.position) from public.captain_lineup_players clp join public.captain_lineups cl on cl.id=clp.lineup_id where cl.fixture_id=f.id),'[]'::jsonb)
  );
end;$$;

create or replace function public.admin_get_weekly_press_data(p_from date,p_to date)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_matches jsonb; v_saved jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Accesso riservato Admin'; end if;
  if p_from is null or p_to is null or p_to<p_from then raise exception 'Intervallo date non valido'; end if;
  if p_to-p_from>31 then raise exception 'Seleziona un intervallo massimo di 31 giorni'; end if;

  with official as (
    select f.scheduled_at, jsonb_build_object(
      'kind','official','id',f.id,'competition_code',f.competition_code,'phase',f.phase,
      'round_number',f.round_number,'scheduled_at',f.scheduled_at,'venue',f.venue,
      'group_name',(select cg.group_name from public.competition_groups cg where cg.id=f.group_id),
      'home',jsonb_build_object('id',ht.id,'name',ht.name,'series',ht.series,'logo_url',ht.logo_url,'province',ht.club_province,'is_reggio',public.is_reggio_province(ht.club_province)),
      'away',jsonb_build_object('id',at.id,'name',at.name,'series',at.series,'logo_url',at.logo_url,'province',at.club_province,'is_reggio',public.is_reggio_province(at.club_province)),
      'result',r.result_data,
      'photos',coalesce((select jsonb_agg(jsonb_build_object('id',pm.id,'kind','official','match_id',f.id,'storage_path',pm.storage_path,'file_name',pm.file_name,'caption',pm.caption,'created_at',pm.created_at) order by pm.created_at,pm.id) from public.match_post_media pm where pm.fixture_id=f.id),'[]'::jsonb)
    ) item
    from public.fixtures f
    join public.match_workflows w on w.fixture_id=f.id and w.homologated_at is not null
    join public.match_results r on r.fixture_id=f.id
    join public.teams ht on ht.id=f.home_team_id
    join public.teams at on at.id=f.away_team_id
    where (f.scheduled_at at time zone 'Europe/Rome')::date between p_from and p_to
      and (public.is_reggio_province(ht.club_province) or public.is_reggio_province(at.club_province))
  ), friendly as (
    select fm.scheduled_at, jsonb_build_object(
      'kind','friendly','id',fm.id,'competition_code','AMICHEVOLE','phase','Fuori classifica',
      'round_number',null,'scheduled_at',fm.scheduled_at,'venue',fm.venue,'group_name',null,
      'home',jsonb_build_object('id',fm.source_home_team_id,'name',fm.home_team_name,'series',fm.home_series,'logo_url',fm.home_logo_url,'province',ht.club_province,'is_reggio',public.is_reggio_province(ht.club_province)),
      'away',jsonb_build_object('id',fm.source_away_team_id,'name',fm.away_team_name,'series',fm.away_series,'logo_url',fm.away_logo_url,'province',at.club_province,'is_reggio',public.is_reggio_province(at.club_province)),
      'result',fr.result_data,
      'photos',coalesce((select jsonb_agg(jsonb_build_object('id',pm.id,'kind','friendly','match_id',fm.id,'storage_path',pm.storage_path,'file_name',pm.file_name,'caption',pm.caption,'created_at',pm.created_at) order by pm.created_at,pm.id) from public.friendly_match_post_media pm where pm.friendly_match_id=fm.id),'[]'::jsonb)
    ) item
    from public.friendly_matches fm
    join public.friendly_results fr on fr.friendly_match_id=fm.id
    left join public.teams ht on ht.id=fm.source_home_team_id
    left join public.teams at on at.id=fm.source_away_team_id
    where fm.result_status='completed'
      and (fm.scheduled_at at time zone 'Europe/Rome')::date between p_from and p_to
      and (public.is_reggio_province(ht.club_province) or public.is_reggio_province(at.club_province))
  ), all_matches as (
    select * from official union all select * from friendly
  )
  select coalesce(jsonb_agg(item order by scheduled_at),'[]'::jsonb) into v_matches from all_matches;

  select to_jsonb(a) into v_saved from public.weekly_press_articles a where a.week_start=p_from;
  return jsonb_build_object('ok',true,'from',p_from,'to',p_to,'matches',v_matches,'saved',v_saved);
end;
$$;

create or replace function public.admin_save_weekly_press_article(
  p_week_start date,
  p_week_end date,
  p_title text,
  p_body text,
  p_selected_photos jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid; v_photos jsonb:=coalesce(p_selected_photos,'[]'::jsonb);
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Accesso riservato Admin'; end if;
  if p_week_start is null or p_week_end is null or p_week_end<p_week_start then raise exception 'Intervallo date non valido'; end if;
  if jsonb_typeof(v_photos)<>'array' or jsonb_array_length(v_photos)>2 then raise exception 'Puoi selezionare al massimo 2 foto'; end if;
  insert into public.weekly_press_articles(week_start,week_end,title,body,selected_photos,created_by,updated_by)
  values(p_week_start,p_week_end,nullif(trim(p_title),''),nullif(trim(p_body),''),v_photos,auth.uid(),auth.uid())
  on conflict(week_start) do update set
    week_end=excluded.week_end,title=excluded.title,body=excluded.body,
    selected_photos=excluded.selected_photos,updated_by=auth.uid(),updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.is_reggio_province(text) from public,anon;
revoke all on function public.captain_save_lineup(uuid,uuid,jsonb,text,boolean) from public,anon;
revoke all on function public.save_match_result(uuid,jsonb) from public,anon;
revoke all on function public.admin_get_match_lineup_data(uuid) from public,anon;
revoke all on function public.admin_get_weekly_press_data(date,date) from public,anon;
revoke all on function public.admin_save_weekly_press_article(date,date,text,text,jsonb) from public,anon;
grant execute on function public.is_reggio_province(text) to authenticated;
grant execute on function public.captain_save_lineup(uuid,uuid,jsonb,text,boolean) to authenticated;
grant execute on function public.save_match_result(uuid,jsonb) to authenticated;
grant execute on function public.admin_get_match_lineup_data(uuid) to authenticated;
grant execute on function public.admin_get_weekly_press_data(date,date) to authenticated;
grant execute on function public.admin_save_weekly_press_article(date,date,text,text,jsonb) to authenticated;

commit;
