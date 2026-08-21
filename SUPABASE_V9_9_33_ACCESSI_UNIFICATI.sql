-- V9.9.33 - ACCESSI UNIFICATI / MULTI-RUOLO / MULTI-SQUADRA / CAP NON OBBLIGATORIO
-- Eseguire una volta nel SQL Editor Supabase.
begin;

-- ============================================================
-- 1) CAP NON PIU' OBBLIGATORIO NEL COMPLETAMENTO PROFILO
-- ============================================================
create or replace function public.get_my_player_profile_completion()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.roster_requests%rowtype;
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  missing jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Sessione non valida'; end if;
  perform public.claim_my_approved_player();

  select * into r
  from public.roster_requests
  where status='approved'
    and (user_id=auth.uid() or lower(trim(email))=v_email)
  order by created_at desc
  limit 1;

  if r.id is null then
    return jsonb_build_object('complete',false,'missing_fields',jsonb_build_array('player_not_found'),'player',null);
  end if;

  if r.photo_url is null or trim(r.photo_url)='' then missing:=missing||'"photo_url"'::jsonb; end if;
  if r.first_name is null or trim(r.first_name)='' then missing:=missing||'"first_name"'::jsonb; end if;
  if r.last_name is null or trim(r.last_name)='' then missing:=missing||'"last_name"'::jsonb; end if;
  if r.birth_date is null then missing:=missing||'"birth_date"'::jsonb; end if;
  if r.birth_place is null or trim(r.birth_place)='' then missing:=missing||'"birth_place"'::jsonb; end if;
  if r.residence_town is null or trim(r.residence_town)='' then missing:=missing||'"residence_town"'::jsonb; end if;
  -- CAP intenzionalmente NON obbligatorio
  if r.residence_province is null or trim(r.residence_province)='' then missing:=missing||'"residence_province"'::jsonb; end if;
  if r.phone is null or trim(r.phone)='' then missing:=missing||'"phone"'::jsonb; end if;
  if r.email is null or trim(r.email)='' then missing:=missing||'"email"'::jsonb; end if;
  if r.gender is null or trim(r.gender)='' then missing:=missing||'"gender"'::jsonb; end if;
  if r.medical_certificate_expiry is null then missing:=missing||'"medical_certificate_expiry"'::jsonb; end if;
  if r.fitp_ranking is null or trim(r.fitp_ranking)='' then missing:=missing||'"fitp_ranking"'::jsonb; end if;

  return jsonb_build_object(
    'complete', jsonb_array_length(missing)=0,
    'missing_fields', missing,
    'player', jsonb_build_object(
      'id',r.id,'photo_url',r.photo_url,'first_name',r.first_name,'last_name',r.last_name,
      'birth_date',r.birth_date,'birth_place',r.birth_place,'residence_town',r.residence_town,
      'residence_postal_code',r.residence_postal_code,'residence_province',r.residence_province,
      'phone',r.phone,'email',r.email,'gender',r.gender,
      'medical_certificate_expiry',r.medical_certificate_expiry,'fitp_ranking',r.fitp_ranking
    )
  );
end;
$$;

create or replace function public.update_my_player_required_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.roster_requests%rowtype;
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null then raise exception 'Sessione non valida'; end if;
  perform public.claim_my_approved_player();

  select * into r
  from public.roster_requests
  where status='approved'
    and (user_id=auth.uid() or lower(trim(email))=v_email)
  order by created_at desc
  limit 1
  for update;

  if r.id is null then raise exception 'Profilo giocatore non trovato'; end if;

  update public.roster_requests set
    photo_url=coalesce(nullif(trim(p_payload->>'photo_url'),''),photo_url),
    first_name=coalesce(nullif(trim(p_payload->>'first_name'),''),first_name),
    last_name=coalesce(nullif(trim(p_payload->>'last_name'),''),last_name),
    birth_date=coalesce(nullif(p_payload->>'birth_date','')::date,birth_date),
    birth_place=coalesce(nullif(trim(p_payload->>'birth_place'),''),birth_place),
    residence_town=coalesce(nullif(trim(p_payload->>'residence_town'),''),residence_town),
    residence_postal_code=coalesce(nullif(trim(p_payload->>'residence_postal_code'),''),residence_postal_code),
    residence_province=upper(coalesce(nullif(trim(p_payload->>'residence_province'),''),residence_province)),
    phone=coalesce(nullif(trim(p_payload->>'phone'),''),phone),
    gender=coalesce(nullif(trim(p_payload->>'gender'),''),gender),
    medical_certificate_expiry=coalesce(nullif(p_payload->>'medical_certificate_expiry','')::date,medical_certificate_expiry),
    fitp_ranking=upper(coalesce(nullif(trim(p_payload->>'fitp_ranking'),''),fitp_ranking)),
    updated_at=now()
  where id=r.id;

  select * into r from public.roster_requests where id=r.id;

  if r.photo_url is null or trim(r.photo_url)='' or
     r.first_name is null or trim(r.first_name)='' or
     r.last_name is null or trim(r.last_name)='' or
     r.birth_date is null or
     r.birth_place is null or trim(r.birth_place)='' or
     r.residence_town is null or trim(r.residence_town)='' or
     r.residence_province is null or trim(r.residence_province)='' or
     r.phone is null or trim(r.phone)='' or
     r.email is null or trim(r.email)='' or
     r.gender is null or trim(r.gender)='' or
     r.medical_certificate_expiry is null or
     r.fitp_ranking is null or trim(r.fitp_ranking)=''
  then raise exception 'Profilo ancora incompleto: compila tutti i dati obbligatori';
  end if;

  return jsonb_build_object('success',true,'player_id',r.id);
end;
$$;

grant execute on function public.get_my_player_profile_completion() to authenticated;
grant execute on function public.update_my_player_required_profile(jsonb) to authenticated;

-- ============================================================
-- 2) UN SOLO ACCOUNT: TUTTI I RUOLI E TUTTE LE SQUADRE
-- ============================================================
create or replace function public.get_my_account_accesses()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_staff jsonb;
  v_players jsonb;
begin
  if auth.uid() is null then raise exception 'Sessione non valida'; end if;

  select coalesce(jsonb_agg(x order by x->>'team_name'),'[]'::jsonb)
  into v_staff
  from (
    select distinct jsonb_build_object(
      'team_id',t.id,
      'team_name',t.name,
      'series',t.series,
      'club_name',t.club_name,
      'logo_url',t.logo_url,
      'role',
        case
          when exists(select 1 from public.team_user_roles r
                      where r.team_id=t.id and r.user_id=auth.uid()
                        and r.active=true and lower(r.role)='captain')
               or lower(trim(coalesce(t.captain_email,'')))=v_email
          then 'captain'
          else 'secretary'
        end
    ) x
    from public.teams t
    where
      exists(select 1 from public.team_user_roles r
             where r.team_id=t.id and r.user_id=auth.uid()
               and r.active=true and lower(r.role) in('captain','secretary'))
      or (
        coalesce(t.captain_access_enabled,true)<>false
        and lower(trim(coalesce(t.captain_email,'')))=v_email
      )
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id',r.id,'team_id',r.team_id,'first_name',r.first_name,'last_name',r.last_name,
    'team_name',t.name,'series',t.series,'logo_url',t.logo_url
  ) order by r.created_at desc),'[]'::jsonb)
  into v_players
  from public.roster_requests r
  join public.teams t on t.id=r.team_id
  where lower(coalesce(r.status,''))='approved'
    and (r.user_id=auth.uid() or lower(trim(coalesce(r.email,'')))=v_email);

  return jsonb_build_object(
    'email',v_email,
    'staff_teams',v_staff,
    'player_profiles',v_players,
    'is_player',jsonb_array_length(v_players)>0,
    'is_staff',jsonb_array_length(v_staff)>0
  );
end;
$$;

revoke all on function public.get_my_account_accesses() from public;
grant execute on function public.get_my_account_accesses() to authenticated;

-- ============================================================
-- 3) PORTALE CAPITANO PER UNA SQUADRA SCELTA
-- Riusa la funzione esistente senza cancellarla.
-- ============================================================
create or replace function public.get_my_captain_portal_for_team(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_allowed boolean := false;
  v_result jsonb;
  r record;
begin
  if auth.uid() is null then raise exception 'Sessione non valida'; end if;

  select (
    exists(select 1 from public.team_user_roles x
      where x.team_id=p_team_id and x.user_id=auth.uid()
        and x.active=true and lower(x.role) in('captain','secretary'))
    or exists(select 1 from public.teams t
      where t.id=p_team_id and coalesce(t.captain_access_enabled,true)<>false
        and lower(trim(coalesce(t.captain_email,'')))=v_email)
  ) into v_allowed;

  if not v_allowed then raise exception 'Non autorizzato per questa squadra'; end if;

  -- La V9 storica sceglie una sola squadra. Per il tempo della chiamata
  -- rendiamo visibile come ruolo operativo solo la squadra scelta.
  create temporary table if not exists _v9_roles_snapshot(
    team_id uuid, role text, active boolean
  ) on commit drop;
  truncate _v9_roles_snapshot;

  insert into _v9_roles_snapshot(team_id,role,active)
  select team_id,role,active
  from public.team_user_roles
  where user_id=auth.uid() and lower(role) in('captain','secretary');

  update public.team_user_roles
     set active=(team_id=p_team_id)
   where user_id=auth.uid() and lower(role) in('captain','secretary');

  begin
    v_result := public.get_my_captain_portal();
  exception when others then
    -- ripristino prima di rilanciare
    update public.team_user_roles x
       set active=s.active
      from _v9_roles_snapshot s
     where x.user_id=auth.uid() and x.team_id=s.team_id and x.role=s.role;
    raise;
  end;

  update public.team_user_roles x
     set active=s.active
    from _v9_roles_snapshot s
   where x.user_id=auth.uid() and x.team_id=s.team_id and x.role=s.role;

  if (v_result->>'team_id')::uuid is distinct from p_team_id then
    raise exception 'La squadra richiesta non è stata selezionata correttamente dal portale.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_my_captain_portal_for_team(uuid) from public;
grant execute on function public.get_my_captain_portal_for_team(uuid) to authenticated;

-- ============================================================
-- 4) ADMIN: ACCESSO CAPITANO REVERSIBILE
-- Cambia l'email della squadra, genera un nuovo invito e collega
-- direttamente l'account se l'email è già registrata.
-- ============================================================
create or replace function public.admin_reassign_captain_access(p_team_id uuid,p_new_email text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_email text := lower(trim(coalesce(p_new_email,'')));
  v_user uuid;
  v_token uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'Operazione riservata all''amministratore'; end if;
  if v_email='' or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    then raise exception 'Email non valida'; end if;
  if not exists(select 1 from public.teams where id=p_team_id)
    then raise exception 'Squadra non trovata'; end if;

  -- Disattiva soltanto i vecchi collegamenti capitano di questa squadra.
  update public.team_user_roles
     set active=false
   where team_id=p_team_id and lower(role)='captain';

  update public.teams
     set captain_email=v_email,
         captain_invite_token=v_token,
         captain_access_enabled=true,
         updated_at=now()
   where id=p_team_id;

  select id into v_user
  from auth.users
  where lower(trim(email))=v_email
  limit 1;

  if v_user is not null then
    update public.team_user_roles set role='captain',active=true
     where team_id=p_team_id and user_id=v_user;
    if not found then
      insert into public.team_user_roles(team_id,user_id,role,active)
      values(p_team_id,v_user,'captain',true);
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'email',v_email,
    'user_already_exists',v_user is not null,
    'invite_token',v_token,
    'activation_path','captain-activate.html?invite='||v_token::text
  );
end;
$$;

revoke all on function public.admin_reassign_captain_access(uuid,text) from public;
grant execute on function public.admin_reassign_captain_access(uuid,text) to authenticated;

commit;
notify pgrst,'reload schema';
