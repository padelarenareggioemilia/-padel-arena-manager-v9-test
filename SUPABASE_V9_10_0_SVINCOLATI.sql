-- V9.10.0 - Mercato SVINCOLATI
-- Migrazione additiva: non modifica la procedura ordinaria di inserimento giocatori.
-- Eseguire prima in ambiente Supabase di test.

begin;

create table if not exists public.player_market_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.roster_requests(id) on delete restrict,
  source_team_id uuid not null references public.teams(id) on delete restrict,
  source_team_name text not null,
  player_name text not null,
  reason text,
  status text not null default 'available' check (status in ('available','recruited')),
  released_at timestamptz not null default now(),
  released_by uuid references auth.users(id) on delete set null,
  recruited_team_id uuid references public.teams(id) on delete set null,
  recruited_at timestamptz,
  recruited_by uuid references auth.users(id) on delete set null
);

create unique index if not exists player_market_one_available_entry_idx
  on public.player_market_entries(player_id) where status='available';
create index if not exists player_market_status_date_idx
  on public.player_market_entries(status,released_at desc);

alter table public.player_market_entries enable row level security;
revoke all on public.player_market_entries from anon, authenticated;

create or replace function public.admin_release_player_to_market(
  p_player_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_player public.roster_requests%rowtype;
  v_team_name text;
  v_entry_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Operazione riservata all’amministratore.';
  end if;

  select * into v_player
  from public.roster_requests
  where id=p_player_id
  for update;

  if not found then raise exception 'Giocatore non trovato.'; end if;
  if lower(coalesce(v_player.status,'')) <> 'approved' then
    raise exception 'È possibile mettere sul mercato soltanto un giocatore approvato nella rosa.';
  end if;

  select name into v_team_name from public.teams where id=v_player.team_id;
  if v_team_name is null then raise exception 'Squadra di provenienza non trovata.'; end if;

  if exists(select 1 from public.player_market_entries where player_id=v_player.id and status='available') then
    raise exception 'Il giocatore risulta già disponibile tra gli svincolati.';
  end if;

  insert into public.player_market_entries(
    player_id,source_team_id,source_team_name,player_name,reason,released_by
  ) values (
    v_player.id,v_player.team_id,v_team_name,
    trim(coalesce(v_player.first_name,'') || ' ' || coalesce(v_player.last_name,'')),
    nullif(trim(coalesce(p_reason,'')),''),auth.uid()
  ) returning id into v_entry_id;

  -- Lo stato rejected è già previsto dal vincolo esistente della tabella roster_requests.
  -- I dati anagrafici originali restano conservati e lo slot attivo viene liberato.
  update public.roster_requests
  set status='rejected', decided_at=now()
  where id=v_player.id;

  return jsonb_build_object(
    'ok',true,'market_entry_id',v_entry_id,'player_id',v_player.id,
    'player_name',trim(coalesce(v_player.first_name,'') || ' ' || coalesce(v_player.last_name,'')),
    'source_team',v_team_name
  );
end;
$function$;

create or replace function public.market_list_svincolati()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
begin
  if v_uid is null then raise exception 'Sessione non valida.'; end if;

  select coalesce(public.is_admin(),false)
    or exists(
      select 1 from public.team_user_roles tur
      where tur.user_id=v_uid and coalesce(tur.active,true)=true
        and lower(coalesce(tur.role,'')) in ('captain','secretary')
    )
    or exists(
      select 1 from public.teams t
      where t.captain_user_id=v_uid and coalesce(t.captain_access_enabled,true)=true
    )
  into v_allowed;

  if not v_allowed then raise exception 'Funzione riservata ad amministratore, capitani e segretari.'; end if;

  return jsonb_build_object('players',coalesce((
    select jsonb_agg(jsonb_build_object(
      'market_entry_id',m.id,
      'player_id',rr.id,
      'first_name',rr.first_name,
      'last_name',rr.last_name,
      'gender',rr.gender,
      'email',rr.email,
      'phone',rr.phone,
      'fitp_ranking',rr.fitp_ranking,
      'medical_certificate_expiry',rr.medical_certificate_expiry,
      'source_team_id',m.source_team_id,
      'source_team_name',m.source_team_name,
      'reason',m.reason,
      'released_at',m.released_at
    ) order by m.released_at desc)
    from public.player_market_entries m
    join public.roster_requests rr on rr.id=m.player_id
    where m.status='available'
  ),'[]'::jsonb));
end;
$function$;

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
    and lower(trim(rr.first_name))=lower(trim(original.first_name))
    and lower(trim(rr.last_name))=lower(trim(original.last_name))
    and lower(coalesce(rr.status,''))='approved'
  order by rr.created_at desc limit 1;

  -- Non si chiude il mercato senza una scheda approvata del medesimo giocatore
  -- nella squadra di destinazione, inserita tramite il flusso ordinario V9.
  if v_player.id is null then
    raise exception 'Prima completa l’inserimento ordinario del giocatore nella nuova squadra, poi registra l’acquisizione.';
  end if;

  select name into v_team_name from public.teams where id=p_recruited_team_id;
  update public.player_market_entries
  set status='recruited',recruited_team_id=p_recruited_team_id,
      recruited_at=now(),recruited_by=auth.uid()
  where id=p_market_entry_id;

  return jsonb_build_object('ok',true,'team_name',v_team_name,'player_name',v_entry.player_name);
end;
$function$;

revoke all on function public.admin_release_player_to_market(uuid,text) from public,anon;
revoke all on function public.market_list_svincolati() from public,anon;
revoke all on function public.admin_market_mark_recruited(uuid,uuid) from public,anon;
grant execute on function public.admin_release_player_to_market(uuid,text) to authenticated;
grant execute on function public.market_list_svincolati() to authenticated;
grant execute on function public.admin_market_mark_recruited(uuid,uuid) to authenticated;

commit;
notify pgrst,'reload schema';
