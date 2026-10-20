-- V9.10.3 - Identificazione univoca dell'acquisizione SVINCOLATI tramite email.
create or replace function public.admin_market_mark_recruited(
  p_market_entry_id uuid,
  p_recruited_team_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_entry public.player_market_entries%rowtype;
  v_team_name text;
  v_player public.roster_requests%rowtype;
  v_original public.roster_requests%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Operazione riservata all’amministratore.';
  end if;

  select * into v_entry from public.player_market_entries
  where id=p_market_entry_id and status='available' for update;
  if not found then raise exception 'Giocatore non disponibile nel mercato.'; end if;

  select * into v_original from public.roster_requests where id=v_entry.player_id;
  if not found then raise exception 'Anagrafica originale del giocatore non trovata.'; end if;

  select rr.* into v_player from public.roster_requests rr
  where rr.team_id=p_recruited_team_id
    and lower(trim(coalesce(rr.email,'')))=lower(trim(coalesce(v_original.email,'')))
  order by (rr.status='approved') desc, rr.created_at desc limit 1;

  if v_player.id is null then
    insert into public.roster_requests(
      team_id,first_name,last_name,email,phone,birth_date,birth_place,residence_town,residence_province,
      gender,status,created_at,decided_at,level,notes,photo_url,fitp_ranking,medical_certificate_expiry,
      user_id,account_required,residence_postal_code,admin_approved,captain_approved,updated_at,
      fitp_ranking_original,fitp_verified,fitp_official_band,fitp_official_points,fitp_ranking_source,
      fitp_verification_note,fitp_verified_at
    ) values (
      p_recruited_team_id,v_original.first_name,v_original.last_name,v_original.email,v_original.phone,
      v_original.birth_date,v_original.birth_place,v_original.residence_town,v_original.residence_province,
      v_original.gender,'approved',now(),now(),v_original.level,v_original.notes,v_original.photo_url,
      v_original.fitp_ranking,v_original.medical_certificate_expiry,v_original.user_id,false,
      v_original.residence_postal_code,true,true,now(),v_original.fitp_ranking_original,v_original.fitp_verified,
      v_original.fitp_official_band,v_original.fitp_official_points,v_original.fitp_ranking_source,
      v_original.fitp_verification_note,v_original.fitp_verified_at
    ) returning * into v_player;
  elsif lower(coalesce(v_player.status,'')) <> 'approved' then
    update public.roster_requests set
      first_name=v_original.first_name,last_name=v_original.last_name,phone=v_original.phone,
      birth_date=v_original.birth_date,birth_place=v_original.birth_place,residence_town=v_original.residence_town,
      residence_province=v_original.residence_province,gender=v_original.gender,status='approved',
      decided_at=now(),level=v_original.level,notes=v_original.notes,photo_url=v_original.photo_url,
      fitp_ranking=v_original.fitp_ranking,medical_certificate_expiry=v_original.medical_certificate_expiry,
      user_id=v_original.user_id,account_required=false,residence_postal_code=v_original.residence_postal_code,
      admin_approved=true,captain_approved=true,updated_at=now(),
      fitp_ranking_original=v_original.fitp_ranking_original,fitp_verified=v_original.fitp_verified,
      fitp_official_band=v_original.fitp_official_band,fitp_official_points=v_original.fitp_official_points,
      fitp_ranking_source=v_original.fitp_ranking_source,fitp_verification_note=v_original.fitp_verification_note,
      fitp_verified_at=v_original.fitp_verified_at
    where id=v_player.id returning * into v_player;
  end if;

  select name into v_team_name from public.teams where id=p_recruited_team_id;
  update public.player_market_entries
  set status='recruited',recruited_team_id=p_recruited_team_id,
      recruited_at=now(),recruited_by=auth.uid()
  where id=p_market_entry_id;

  return jsonb_build_object('ok',true,'team_name',v_team_name,'player_name',v_entry.player_name);
end;
$function$;
revoke all on function public.admin_market_mark_recruited(uuid,uuid) from public,anon;
grant execute on function public.admin_market_mark_recruited(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
