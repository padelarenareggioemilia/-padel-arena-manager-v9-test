-- Contatore informativo trasferimenti in uscita per squadra.
-- Eseguire dopo SUPABASE_V9_10_0_SVINCOLATI.sql nell'ambiente di test.
create or replace function public.admin_get_transfer_counters()
returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp as $function$
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Operazione riservata all’amministratore.';
  end if;
  return jsonb_build_object('teams',coalesce((
    select jsonb_agg(jsonb_build_object(
      'team_id',t.id,'team_name',t.name,
      'transfers_out',
        (select count(*) from public.player_transfer_history h where h.from_team_id=t.id)
        + (select count(*) from public.player_market_entries m where m.source_team_id=t.id)
    ) order by t.name)
    from public.teams t
  ),'[]'::jsonb));
end;
$function$;
revoke all on function public.admin_get_transfer_counters() from public,anon;
grant execute on function public.admin_get_transfer_counters() to authenticated;
notify pgrst,'reload schema';
