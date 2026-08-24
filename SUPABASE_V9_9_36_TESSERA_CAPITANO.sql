-- V9.9.36 - FIX APERTURA TESSERA DA AREA CAPITANO
-- Eseguire una volta nel SQL Editor Supabase.
begin;

create or replace function public.captain_get_player_card_v2(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  r record;
  v_card record;
begin
  if v_uid is null then raise exception 'Sessione non valida'; end if;

  select rr.*,t.name team_name,t.series,t.logo_url team_logo_url,t.captain_email
  into r
  from public.roster_requests rr
  join public.teams t on t.id=rr.team_id
  where rr.id=p_player_id
    and lower(coalesce(rr.status,''))='approved'
  limit 1;

  if r.id is null then
    return jsonb_build_object('ok',false,'message','Giocatore non trovato o non approvato');
  end if;

  if not public.is_admin()
     and not exists(
       select 1 from public.team_user_roles x
       where x.user_id=v_uid and x.team_id=r.team_id
         and x.active=true and lower(x.role) in('captain','secretary')
     )
     and lower(trim(coalesce(r.captain_email,'')))<>v_email
  then
    return jsonb_build_object('ok',false,'message','Non sei autorizzato ad aprire la tessera di questo giocatore');
  end if;

  select * into v_card from public.player_cards where player_id=r.id;

  if v_card.id is null then
    insert into public.player_cards(player_id,card_number,status)
    values(
      r.id,
      'AICS-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(r.id::text,'-',''),1,10)),
      case when r.medical_certificate_expiry is not null and r.medical_certificate_expiry<current_date then 'expired' else 'active' end
    )
    returning * into v_card;
  else
    update public.player_cards
    set status=case when r.medical_certificate_expiry is not null and r.medical_certificate_expiry<current_date then 'expired' else 'active' end,
        updated_at=now()
    where id=v_card.id
    returning * into v_card;
  end if;

  return jsonb_build_object(
    'ok',true,
    'player',jsonb_build_object(
      'id',r.id,'first_name',r.first_name,'last_name',r.last_name,
      'photo_url',r.photo_url,'fitp_ranking',r.fitp_ranking,
      'birth_date',r.birth_date,'medical_certificate_expiry',r.medical_certificate_expiry
    ),
    'team',jsonb_build_object(
      'id',r.team_id,'name',r.team_name,'series',r.series,'logo_url',r.team_logo_url
    ),
    'card',jsonb_build_object(
      'card_number',v_card.card_number,
      'status',v_card.status,
      'verify_url','https://padelarenareggioemilia.github.io/-padel-arena-manager-v9-test/verify-player.html?token='||v_card.qr_token::text
    )
  );
end;
$$;

revoke all on function public.captain_get_player_card_v2(uuid) from public;
grant execute on function public.captain_get_player_card_v2(uuid) to authenticated;

commit;
notify pgrst,'reload schema';
