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
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Operazione riservata all’amministratore.';
  end if;

  select * into v_entry from public.player_market_entries
  where id=p_market_entry_id and status='available' for update;
  if not found then raise exception 'Giocatore non disponibile nel mercato.'; end if;

  select rr.* into v_player
  from public.roster_requests rr
  join public.roster_requests original on original.id=v_entry.player_id
  where rr.team_id=p_recruited_team_id
    and lower(trim(coalesce(rr.email,'')))=lower(trim(coalesce(original.email,'')))
    and lower(coalesce(rr.status,''))='approved'
  order by rr.created_at desc limit 1;

  if v_player.id is null then
    raise exception 'Prima completa l’inserimento ordinario del giocatore nella nuova squadra, usando la stessa email, poi registra l’acquisizione.';
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
