-- V9 STABLE BUILD 1.1
begin;

alter table public.roster_requests
  add column if not exists updated_at timestamptz not null default now();

-- Permessi admin completi sui giocatori
drop policy if exists roster_requests_admin_update_v11 on public.roster_requests;
create policy roster_requests_admin_update_v11 on public.roster_requests
for update to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists roster_requests_admin_delete_v11 on public.roster_requests;
create policy roster_requests_admin_delete_v11 on public.roster_requests
for delete to authenticated using(public.is_admin());

grant select,insert,update,delete on public.roster_requests to authenticated;

create or replace function public.delete_player_safely(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare n text; tname text; c integer;
begin
  if not public.is_admin() then raise exception 'Operazione riservata all amministratore'; end if;
  select trim(coalesce(first_name,'')||' '||coalesce(last_name,'')), teams.name
    into n,tname from roster_requests join teams on teams.id=roster_requests.team_id where roster_requests.id=p_player_id;
  if n is null then raise exception 'Giocatore non trovato'; end if;

  if to_regclass('public.player_card_checks') is not null then
    execute 'delete from public.player_card_checks where player_id=$1' using p_player_id;
  end if;
  if to_regclass('public.player_cards') is not null then
    execute 'delete from public.player_cards where player_id=$1' using p_player_id;
  end if;
  if to_regclass('public.lineup_players') is not null then
    execute 'select count(*) from public.lineup_players where player_id=$1' into c using p_player_id;
    if c>0 then raise exception 'Eliminazione bloccata: giocatore già utilizzato in una formazione'; end if;
  end if;

  delete from roster_requests where id=p_player_id;
  return jsonb_build_object('success',true,'message','Giocatore eliminato: '||n||' ('||tname||')');
end $$;

create or replace function public.delete_empty_team_safely_v11(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare n text; c integer;
begin
  if not public.is_admin() then raise exception 'Operazione riservata all amministratore'; end if;
  select name into n from teams where id=p_team_id;
  if n is null then raise exception 'Squadra non trovata'; end if;

  select count(*) into c from roster_requests where team_id=p_team_id;
  if c>0 then raise exception 'Impossibile eliminare: la squadra contiene % giocatori',c; end if;
  select count(*) into c from fixtures where home_team_id=p_team_id or away_team_id=p_team_id;
  if c>0 then raise exception 'Impossibile eliminare: la squadra è collegata a % partite',c; end if;
  select count(*) into c from team_user_roles where team_id=p_team_id;
  if c>0 then raise exception 'Impossibile eliminare: la squadra ha % account o ruoli collegati',c; end if;

  if to_regclass('public.championship_group_teams') is not null then
    execute 'delete from public.championship_group_teams where team_id=$1' using p_team_id;
  end if;
  if to_regclass('public.cup_italia_teams') is not null then
    execute 'delete from public.cup_italia_teams where team_id=$1' using p_team_id;
  end if;

  delete from teams where id=p_team_id;
  return jsonb_build_object('success',true,'message','Squadra eliminata correttamente: '||n);
end $$;

grant execute on function public.delete_player_safely(uuid) to authenticated;
grant execute on function public.delete_empty_team_safely_v11(uuid) to authenticated;

commit;
notify pgrst,'reload schema';
