-- AICS PADEL CHAMPIONSHIP V9.8.4
-- CENTRO DIAGNOSTICO V9
begin;

create or replace function public.run_v9_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata all amministratore';
  end if;

  with
  teams_no_series as (
    select t.id,t.name,t.series,t.club_name,t.club_city,t.logo_url,
      case when not exists(select 1 from roster_requests r where r.team_id=t.id)
        and not exists(select 1 from fixtures f where f.home_team_id=t.id or f.away_team_id=t.id)
        and not exists(select 1 from team_user_roles u where u.team_id=t.id)
      then true else false end can_delete,
      'Serie non assegnata'::text detail
    from teams t where t.series is null or trim(t.series)=''
  ),
  teams_no_logo as (
    select t.id,t.name,t.series,t.club_name,t.club_city,t.logo_url,false can_delete,null::text detail
    from teams t where t.logo_url is null or trim(t.logo_url)=''
  ),
  teams_no_captain as (
    select t.id,t.name,t.series,t.club_name,t.club_city,t.logo_url,false can_delete,null::text detail
    from teams t
    where not exists(select 1 from team_user_roles u where u.team_id=t.id and u.active=true and u.role='captain')
  ),
  duplicates as (
    select lower(regexp_replace(trim(name),'[^a-zA-Z0-9]+','','g')) normalized_name,
      string_agg(name,' | ' order by created_at) names,
      string_agg(coalesce(series,'NULL'),', ' order by series) series_list,
      count(*) cnt
    from teams
    group by lower(regexp_replace(trim(name),'[^a-zA-Z0-9]+','','g'))
    having count(*)>1
  ),
  incomplete as (
    select r.id,r.team_id,r.first_name,r.last_name,t.name team_name,
      concat_ws(', ',
        case when r.photo_url is null or trim(r.photo_url)='' then 'foto' end,
        case when r.first_name is null or trim(r.first_name)='' then 'nome' end,
        case when r.last_name is null or trim(r.last_name)='' then 'cognome' end,
        case when r.birth_date is null then 'data nascita' end,
        case when r.birth_place is null or trim(r.birth_place)='' then 'luogo nascita' end,
        case when r.residence_town is null or trim(r.residence_town)='' then 'residenza' end,
        case when r.residence_postal_code is null or r.residence_postal_code !~ '^[0-9]{5}$' then 'CAP' end,
        case when r.residence_province is null or trim(r.residence_province)='' then 'provincia' end,
        case when r.phone is null or trim(r.phone)='' then 'telefono' end,
        case when r.email is null or trim(r.email)='' then 'email' end,
        case when r.medical_certificate_expiry is null then 'certificato' end,
        case when r.fitp_ranking is null or trim(r.fitp_ranking)='' then 'FITP' end
      ) problem
    from roster_requests r join teams t on t.id=r.team_id
    where r.status='approved' and (
      r.photo_url is null or trim(r.photo_url)='' or r.first_name is null or trim(r.first_name)='' or
      r.last_name is null or trim(r.last_name)='' or r.birth_date is null or
      r.birth_place is null or trim(r.birth_place)='' or r.residence_town is null or trim(r.residence_town)='' or
      r.residence_postal_code is null or r.residence_postal_code !~ '^[0-9]{5}$' or
      r.residence_province is null or trim(r.residence_province)='' or r.phone is null or trim(r.phone)='' or
      r.email is null or trim(r.email)='' or r.medical_certificate_expiry is null or
      r.fitp_ranking is null or trim(r.fitp_ranking)=''
    )
  ),
  expired as (
    select r.id,r.team_id,r.first_name,r.last_name,t.name team_name,
      'Certificato scaduto il '||to_char(r.medical_certificate_expiry,'DD/MM/YYYY') problem
    from roster_requests r join teams t on t.id=r.team_id
    where r.medical_certificate_expiry<current_date
  ),
  no_photo as (
    select r.id,r.team_id,r.first_name,r.last_name,t.name team_name,'Foto tessera mancante' problem
    from roster_requests r join teams t on t.id=r.team_id
    where r.photo_url is null or trim(r.photo_url)=''
  ),
  conflicts as (
    select a.scheduled_at,a.venue,
      coalesce(ha.name,a.home_placeholder,'Da definire')||' – '||coalesce(aa.name,a.away_placeholder,'Da definire') match_1,
      coalesce(hb.name,b.home_placeholder,'Da definire')||' – '||coalesce(ab.name,b.away_placeholder,'Da definire') match_2
    from fixtures a join fixtures b on a.id<b.id
      and a.scheduled_at=b.scheduled_at
      and lower(trim(coalesce(a.venue,'')))=lower(trim(coalesce(b.venue,'')))
      and trim(coalesce(a.venue,''))<>''
    left join teams ha on ha.id=a.home_team_id left join teams aa on aa.id=a.away_team_id
    left join teams hb on hb.id=b.home_team_id left join teams ab on ab.id=b.away_team_id
  ),
  unpublished as (
    select competition_code from championship_publication where is_published=false
  ),
  card_issues as (
    select r.id,r.team_id,r.first_name,r.last_name,t.name team_name,
      case when pc.id is null then 'Tessera non generata'
           when pc.status<>'active' then 'Tessera '||pc.status
           else 'Controllare tessera' end problem
    from roster_requests r join teams t on t.id=r.team_id
    left join player_cards pc on pc.player_id=r.id
    where r.status='approved' and (pc.id is null or pc.status<>'active')
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'teams_in_series',(select count(*) from teams where series is not null and trim(series)<>''),
      'teams_without_series',(select count(*) from teams_no_series),
      'teams_without_logo',(select count(*) from teams_no_logo),
      'incomplete_players',(select count(*) from incomplete),
      'expired_medical',(select count(*) from expired),
      'fixture_conflicts',(select count(*) from conflicts),
      'total_anomalies',(select count(*) from teams_no_series)+(select count(*) from teams_no_logo)+
        (select count(*) from teams_no_captain)+(select count(*) from duplicates)+(select count(*) from incomplete)+
        (select count(*) from expired)+(select count(*) from conflicts)+(select count(*) from unpublished)+
        (select count(*) from card_issues)
    ),
    'teams_without_series',coalesce((select jsonb_agg(to_jsonb(x)) from teams_no_series x),'[]'::jsonb),
    'teams_without_logo',coalesce((select jsonb_agg(to_jsonb(x)) from teams_no_logo x),'[]'::jsonb),
    'teams_without_captain',coalesce((select jsonb_agg(to_jsonb(x)) from teams_no_captain x),'[]'::jsonb),
    'duplicate_teams',coalesce((select jsonb_agg(to_jsonb(x)) from duplicates x),'[]'::jsonb),
    'incomplete_players',coalesce((select jsonb_agg(to_jsonb(x)) from incomplete x),'[]'::jsonb),
    'expired_medical',coalesce((select jsonb_agg(to_jsonb(x)) from expired x),'[]'::jsonb),
    'players_without_photo',coalesce((select jsonb_agg(to_jsonb(x)) from no_photo x),'[]'::jsonb),
    'fixture_conflicts',coalesce((select jsonb_agg(to_jsonb(x)) from conflicts x),'[]'::jsonb),
    'unpublished_competitions',coalesce((select jsonb_agg(to_jsonb(x)) from unpublished x),'[]'::jsonb),
    'card_issues',coalesce((select jsonb_agg(to_jsonb(x)) from card_issues x),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.delete_empty_team_safely(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare n text;
begin
  if not public.is_admin() then raise exception 'Operazione riservata all amministratore'; end if;
  select name into n from teams where id=p_team_id;
  if n is null then raise exception 'Squadra non trovata'; end if;
  if exists(select 1 from roster_requests where team_id=p_team_id) then raise exception 'Eliminazione bloccata: la squadra contiene giocatori'; end if;
  if exists(select 1 from fixtures where home_team_id=p_team_id or away_team_id=p_team_id) then raise exception 'Eliminazione bloccata: la squadra è presente nel calendario'; end if;
  if exists(select 1 from team_user_roles where team_id=p_team_id) then raise exception 'Eliminazione bloccata: la squadra possiede ruoli o account collegati'; end if;
  delete from teams where id=p_team_id;
  return jsonb_build_object('success',true,'message','Record vuoto eliminato: '||n);
end;
$$;

grant execute on function public.run_v9_diagnostics() to authenticated;
grant execute on function public.delete_empty_team_safely(uuid) to authenticated;

commit;
notify pgrst,'reload schema';
