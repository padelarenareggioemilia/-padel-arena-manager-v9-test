-- V9 - COMPLETAMENTO OBBLIGATORIO PROFILO GIOCATORE
-- Eseguire UNA VOLTA nel SQL Editor del progetto Supabase V9.

begin;

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
  if r.residence_postal_code is null or r.residence_postal_code !~ '^[0-9]{5}$' then missing:=missing||'"residence_postal_code"'::jsonb; end if;
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
     r.residence_postal_code is null or r.residence_postal_code !~ '^[0-9]{5}$' or
     r.residence_province is null or trim(r.residence_province)='' or
     r.phone is null or trim(r.phone)='' or
     r.email is null or trim(r.email)='' or
     r.gender is null or trim(r.gender)='' or
     r.medical_certificate_expiry is null or
     r.fitp_ranking is null or trim(r.fitp_ranking)=''
  then
    raise exception 'Profilo ancora incompleto: compila tutti i dati obbligatori';
  end if;

  return jsonb_build_object('success',true,'player_id',r.id);
end;
$$;

grant execute on function public.get_my_player_profile_completion() to authenticated;
grant execute on function public.update_my_player_required_profile(jsonb) to authenticated;

commit;
notify pgrst,'reload schema';
