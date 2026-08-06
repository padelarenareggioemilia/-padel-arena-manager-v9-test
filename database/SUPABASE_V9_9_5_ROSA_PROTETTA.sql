begin;

-- Il capitano/segretario può aggiornare soltanto FITP e certificato.
drop function if exists public.captain_update_player_sport_data(uuid,uuid,text,date);

create function public.captain_update_player_sport_data(
  p_team_id uuid,
  p_player_id uuid,
  p_fitp text,
  p_medical_expiry date
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1
    from public.team_user_roles
    where team_id=p_team_id
      and user_id=auth.uid()
      and active=true
      and role in ('captain','secretary')
  ) then
    raise exception 'Non autorizzato.';
  end if;

  update public.roster_requests
     set fitp_ranking=nullif(upper(trim(p_fitp)),''),
         medical_certificate_expiry=p_medical_expiry,
         updated_at=now()
   where id=p_player_id
     and team_id=p_team_id;

  return found;
end
$$;

grant execute on function public.captain_update_player_sport_data(uuid,uuid,text,date)
to authenticated;

-- Blocca la vecchia funzione completa agli account normali.
revoke execute on function public.captain_update_player_complete(uuid,uuid,jsonb)
from authenticated;

-- Tessera digitale accessibile soltanto a capitano/segretario della squadra.
drop function if exists public.captain_get_player_card(uuid);

create function public.captain_get_player_card(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_player jsonb;
  v_team jsonb;
  v_team_id uuid;
begin
  select team_id
    into v_team_id
    from public.roster_requests
   where id=p_player_id;

  if v_team_id is null then
    raise exception 'Giocatore non trovato.';
  end if;

  if not exists(
    select 1
    from public.team_user_roles
    where team_id=v_team_id
      and user_id=auth.uid()
      and active=true
      and role in ('captain','secretary')
  ) then
    raise exception 'Non autorizzato alla tessera di questo giocatore.';
  end if;

  select to_jsonb(r) into v_player
    from public.roster_requests r
   where r.id=p_player_id;

  select to_jsonb(t) into v_team
    from public.teams t
   where t.id=v_team_id;

  return jsonb_build_object(
    'ok',true,
    'player',v_player,
    'team',v_team
  );
end
$$;

grant execute on function public.captain_get_player_card(uuid)
to authenticated;

commit;
