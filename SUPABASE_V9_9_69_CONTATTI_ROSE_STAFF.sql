-- V9.9.69 - CONTATTI CAPITANI E ROSE CLUB PER CAPITANI/SEGRETARI
-- Applicata al progetto V9. Espone soltanto i dati necessari all'area staff.
begin;

create or replace function public.friendly_get_hub()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
begin
  if v_uid is null then raise exception 'Sessione non valida'; end if;
  select coalesce(public.is_admin(),false)
    or exists(select 1 from public.team_user_roles tur where tur.user_id=v_uid and coalesce(tur.active,true)=true and lower(coalesce(tur.role,'')) in ('captain','secretary'))
    or exists(select 1 from public.teams t where t.captain_user_id=v_uid and coalesce(t.captain_access_enabled,true)=true)
  into v_allowed;
  if not v_allowed then raise exception 'Funzione riservata a capitani e segretari'; end if;

  return jsonb_build_object(
    'teams',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'name',t.name,'series',t.series,'club_name',t.club_name,'logo_url',t.logo_url,
      'captain_name',t.captain_name,'captain_email',t.captain_email,'captain_phone',t.captain_phone
    ) order by t.name) from public.teams t),'[]'::jsonb),
    'my_teams',coalesce((select jsonb_agg(distinct jsonb_build_object('id',t.id,'name',t.name,'series',t.series,'role',tur.role))
      from public.team_user_roles tur join public.teams t on t.id=tur.team_id
      where tur.user_id=v_uid and coalesce(tur.active,true)=true and lower(coalesce(tur.role,'')) in ('captain','secretary')),'[]'::jsonb),
    'invitations',coalesce((select jsonb_agg(to_jsonb(fi) order by fi.created_at desc) from public.friendly_invitations fi
      where public.is_admin() or public.friendly_user_can_manage_team(fi.inviter_team_id) or public.friendly_user_can_manage_team(fi.invited_team_id)),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(to_jsonb(fm) order by fm.scheduled_at desc nulls last) from public.friendly_matches fm
      where public.is_admin() or public.friendly_user_can_manage_team(fm.source_home_team_id) or public.friendly_user_can_manage_team(fm.source_away_team_id)),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.friendly_get_hub() from public, anon;
grant execute on function public.friendly_get_hub() to authenticated;

create or replace function public.captain_get_club_rosters()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
begin
  if v_uid is null then raise exception 'Sessione non valida'; end if;
  select coalesce(public.is_admin(),false)
    or exists(select 1 from public.team_user_roles tur where tur.user_id=v_uid and coalesce(tur.active,true)=true and lower(coalesce(tur.role,'')) in ('captain','secretary'))
    or exists(select 1 from public.teams t where t.captain_user_id=v_uid and coalesce(t.captain_access_enabled,true)=true)
  into v_allowed;
  if not v_allowed then raise exception 'Funzione riservata a capitani e segretari'; end if;

  return jsonb_build_object('teams',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',t.id,'name',t.name,'series',t.series,'club_name',t.club_name,'club_city',t.club_city,'logo_url',t.logo_url,
      'captain_name',t.captain_name,'captain_email',t.captain_email,'captain_phone',t.captain_phone,
      'players',coalesce((select jsonb_agg(jsonb_build_object(
        'first_name',rr.first_name,'last_name',rr.last_name,'gender',rr.gender,'fitp_ranking',rr.fitp_ranking
      ) order by rr.last_name,rr.first_name) from public.roster_requests rr
        where rr.team_id=t.id and lower(coalesce(rr.status,''))='approved'),'[]'::jsonb)
    ) order by t.series nulls last,t.name) from public.teams t
  ),'[]'::jsonb));
end;
$$;
revoke all on function public.captain_get_club_rosters() from public, anon;
grant execute on function public.captain_get_club_rosters() to authenticated;

commit;
notify pgrst,'reload schema';
