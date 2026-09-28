-- AICS PADEL CHAMPIONSHIP V9.9.87
-- Flusso gara conforme al Manuale operativo distinta digitale 2027.
-- La migrazione preserva captain_lineups/captain_lineup_players esistenti.

begin;

alter table public.captain_lineups
  add column if not exists confirmed_at timestamptz,
  add column if not exists locked_at timestamptz;

alter table public.match_results
  add column if not exists finished_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists central_sent_at timestamptz;

alter table public.match_workflows
  add column if not exists central_sent_at timestamptz;

create table if not exists public.captain_lineup_substitutions (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  position text not null check (position in ('M1','M2','Misto','Femminile')),
  outgoing_player_id uuid not null references public.roster_requests(id),
  incoming_player_id uuid not null references public.roster_requests(id),
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(fixture_id,team_id,position,outgoing_player_id),
  check(outgoing_player_id<>incoming_player_id)
);

create table if not exists public.captain_match_appeals (
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  opponent_team_id uuid not null references public.teams(id) on delete cascade,
  status text not null default 'draft' check(status in('draft','confirmed')),
  notes text,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(fixture_id,team_id)
);

create table if not exists public.match_result_appeals (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  reason text not null,
  status text not null default 'submitted'
    check(status in('submitted','reviewing','accepted','rejected','resolved')),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_notes text
);

create index if not exists captain_substitutions_fixture_team_idx
  on public.captain_lineup_substitutions(fixture_id,team_id);
create index if not exists captain_substitutions_outgoing_idx
  on public.captain_lineup_substitutions(outgoing_player_id);
create index if not exists captain_substitutions_incoming_idx
  on public.captain_lineup_substitutions(incoming_player_id);
create index if not exists captain_match_appeals_team_idx
  on public.captain_match_appeals(team_id);
create index if not exists captain_match_appeals_opponent_idx
  on public.captain_match_appeals(opponent_team_id);
create index if not exists match_result_appeals_fixture_idx
  on public.match_result_appeals(fixture_id,status);
create index if not exists match_result_appeals_team_idx
  on public.match_result_appeals(team_id);

alter table public.captain_lineup_substitutions enable row level security;
alter table public.captain_match_appeals enable row level security;
alter table public.match_result_appeals enable row level security;

revoke all on public.captain_lineup_substitutions from anon,authenticated;
revoke all on public.captain_match_appeals from anon,authenticated;
revoke all on public.match_result_appeals from anon,authenticated;

create or replace function public.match_weekend_cutoff(p_scheduled_at timestamptz)
returns timestamptz
language sql
immutable
set search_path='public','pg_temp'
as $function$
  select (
    date_trunc('day',p_scheduled_at at time zone 'Europe/Rome')
    + ((8-extract(isodow from p_scheduled_at at time zone 'Europe/Rome')::int) * interval '1 day')
  ) at time zone 'Europe/Rome'
$function$;

create or replace function public.captain_save_lineup(
  p_fixture_id uuid,p_team_id uuid,p_players jsonb,p_notes text,p_confirm boolean
)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_lineup_id uuid;
  v_fixture public.fixtures%rowtype;
  v_item jsonb;
  v_player_id uuid;
  v_position text;
  v_max_uses int;
  v_match_date date;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  if not public.is_admin() and not exists(
    select 1 from public.team_user_roles
    where team_id=p_team_id and user_id=auth.uid() and active=true
      and lower(role) in('captain','secretary')
  ) then raise exception 'Non autorizzato.'; end if;

  select * into v_fixture from public.fixtures
  where id=p_fixture_id and p_team_id in(home_team_id,away_team_id);
  if v_fixture.id is null then raise exception 'La squadra non partecipa a questa partita.'; end if;
  if v_fixture.scheduled_at is null then raise exception 'Data e orario della partita non definiti.'; end if;
  if not public.is_admin() and now()>=v_fixture.scheduled_at-interval '120 minutes' then
    raise exception 'Distinta definitiva: il termine di 120 minuti è scaduto.';
  end if;
  if jsonb_typeof(coalesce(p_players,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_players,'[]'::jsonb))=0 then
    raise exception 'Seleziona almeno un giocatore.';
  end if;

  v_match_date=(v_fixture.scheduled_at at time zone 'Europe/Rome')::date;
  for v_item in select * from jsonb_array_elements(p_players) loop
    v_player_id=(v_item->>'player_id')::uuid;
    v_position=trim(coalesce(v_item->>'position',''));
    if v_position not in('M1','M2','Misto','Femminile','Riserva') then
      raise exception 'Assegna un ruolo valido a tutti i giocatori selezionati.';
    end if;
    if not exists(
      select 1 from public.roster_requests rr
      where rr.id=v_player_id and rr.team_id=p_team_id
        and lower(trim(coalesce(rr.status,'')))='approved'
    ) then raise exception 'Giocatore non approvato o non appartenente alla squadra.'; end if;
    if p_confirm and not exists(
      select 1 from public.roster_requests rr
      where rr.id=v_player_id and rr.medical_certificate_expiry is not null
        and rr.medical_certificate_expiry>=v_match_date
    ) then raise exception 'Certificato medico assente o non valido alla data della partita.'; end if;
    if p_confirm and not exists(
      select 1 from public.player_cards pc
      where pc.player_id=v_player_id and lower(coalesce(pc.status,''))='active'
    ) then raise exception 'Tessera digitale non attiva per uno dei giocatori selezionati.'; end if;
  end loop;

  select max(c) into v_max_uses from(
    select count(*) c from jsonb_array_elements(p_players) x group by x->>'player_id'
  ) q;
  if coalesce(v_max_uses,0)>2 then raise exception 'Ogni giocatore può disputare massimo 2 incontri.'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_players)x
    group by x->>'player_id',x->>'position' having count(*)>1
  ) then raise exception 'Lo stesso incontro non può essere assegnato due volte allo stesso giocatore.'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_players)x
    where x->>'position' in('M1','M2')
    group by x->>'player_id'
    having count(distinct x->>'position')>1
  ) then raise exception 'Un uomo non può disputare entrambi gli incontri maschili.'; end if;

  if p_confirm then
    if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='M1')<>2 then raise exception 'M1 deve avere esattamente 2 giocatori.'; end if;
    if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='M2')<>2 then raise exception 'M2 deve avere esattamente 2 giocatori.'; end if;
    if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='Misto')<>2 then raise exception 'Misto deve avere esattamente 2 giocatori.'; end if;
    if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='Femminile')<>2 then raise exception 'Femminile deve avere esattamente 2 giocatrici.'; end if;
    if exists(
      select 1 from jsonb_array_elements(p_players)x
      join public.roster_requests rr on rr.id=(x->>'player_id')::uuid
      where x->>'position'='Femminile'
        and lower(trim(coalesce(rr.gender,''))) not in('f','femminile','female','donna')
    ) then raise exception 'La partita Femminile può contenere solo giocatrici.'; end if;
    if(select count(*) from jsonb_array_elements(p_players)x
       join public.roster_requests rr on rr.id=(x->>'player_id')::uuid
       where x->>'position'='Misto'
         and lower(trim(coalesce(rr.gender,''))) in('f','femminile','female','donna'))<>1
    then raise exception 'Il Misto deve essere composto da 1 uomo e 1 donna.'; end if;
    if(select count(*) from jsonb_array_elements(p_players)x
       join public.roster_requests rr on rr.id=(x->>'player_id')::uuid
       where x->>'position'='Misto'
         and lower(trim(coalesce(rr.gender,''))) in('m','maschile','male','uomo'))<>1
    then raise exception 'Il Misto deve essere composto da 1 uomo e 1 donna.'; end if;
    if(select count(distinct rr.id) from jsonb_array_elements(p_players)x
       join public.roster_requests rr on rr.id=(x->>'player_id')::uuid
       where x->>'position'<>'Riserva'
         and lower(trim(coalesce(rr.gender,''))) in('m','maschile','male','uomo'))<4
    then raise exception 'La distinta deve comprendere almeno 4 uomini.'; end if;
    if(select count(distinct rr.id) from jsonb_array_elements(p_players)x
       join public.roster_requests rr on rr.id=(x->>'player_id')::uuid
       where x->>'position'<>'Riserva'
         and lower(trim(coalesce(rr.gender,''))) in('f','femminile','female','donna'))<2
    then raise exception 'La distinta deve comprendere almeno 2 donne.'; end if;
  end if;

  insert into public.captain_lineups(
    fixture_id,team_id,created_by,status,notes,confirmed_at,locked_at,updated_at
  ) values(
    p_fixture_id,p_team_id,auth.uid(),case when p_confirm then 'confirmed' else 'draft' end,
    nullif(trim(coalesce(p_notes,'')),''),case when p_confirm then now() end,null,now()
  )
  on conflict(fixture_id,team_id) do update set
    status=excluded.status,notes=excluded.notes,created_by=auth.uid(),
    confirmed_at=case when p_confirm then now() else null end,locked_at=null,updated_at=now()
  returning id into v_lineup_id;

  delete from public.captain_lineup_players where lineup_id=v_lineup_id;
  for v_item in select * from jsonb_array_elements(p_players) loop
    insert into public.captain_lineup_players(lineup_id,player_id,position,confirmed)
    values(v_lineup_id,(v_item->>'player_id')::uuid,v_item->>'position',p_confirm);
  end loop;
  return v_lineup_id;
end
$function$;

create or replace function public.captain_get_match_day(p_fixture_id uuid,p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  f public.fixtures%rowtype;
  v_opponent uuid;
  v_own_confirmed boolean;
  v_opponent_confirmed boolean;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  if not public.is_admin() and not exists(
    select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid()
      and active=true and lower(role) in('captain','secretary')
  ) then raise exception 'Non autorizzato.'; end if;
  select * into f from public.fixtures where id=p_fixture_id and p_team_id in(home_team_id,away_team_id);
  if f.id is null then raise exception 'Partita non trovata.'; end if;
  v_opponent=case when p_team_id=f.home_team_id then f.away_team_id else f.home_team_id end;
  select exists(select 1 from public.captain_lineups where fixture_id=f.id and team_id=p_team_id and status='confirmed') into v_own_confirmed;
  select exists(select 1 from public.captain_lineups where fixture_id=f.id and team_id=v_opponent and status='confirmed') into v_opponent_confirmed;
  return jsonb_build_object(
    'ok',true,'fixture',to_jsonb(f),'team_id',p_team_id,'opponent_team_id',v_opponent,
    'lineup_deadline',f.scheduled_at-interval '120 minutes',
    'result_deadline',public.match_weekend_cutoff(f.scheduled_at),
    'own_confirmed',v_own_confirmed,'opponent_confirmed',v_opponent_confirmed,
    'opponent_team',(select jsonb_build_object('id',t.id,'name',t.name,'logo_url',t.logo_url) from public.teams t where t.id=v_opponent),
    'opponent_entries',case when v_own_confirmed and v_opponent_confirmed then coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',rr.id,'first_name',rr.first_name,'last_name',rr.last_name,
        'gender',rr.gender,'position',clp.position,'qr_verified',exists(
          select 1 from public.captain_opponent_verifications cov
          where cov.fixture_id=f.id and cov.verifying_team_id=p_team_id and cov.player_id=rr.id
        )
      ) order by case clp.position when 'M1' then 1 when 'Femminile' then 2 when 'M2' then 3 when 'Misto' then 4 else 5 end,rr.last_name)
      from public.captain_lineups cl
      join public.captain_lineup_players clp on clp.lineup_id=cl.id
      join public.roster_requests rr on rr.id=clp.player_id
      where cl.fixture_id=f.id and cl.team_id=v_opponent and cl.status='confirmed'
    ),'[]'::jsonb) else '[]'::jsonb end,
    'own_entries',coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id',rr.id,'first_name',rr.first_name,'last_name',rr.last_name,
        'gender',rr.gender,'position',clp.position
      ) order by case clp.position when 'M1' then 1 when 'Femminile' then 2 when 'M2' then 3 when 'Misto' then 4 else 5 end,rr.last_name)
      from public.captain_lineups cl
      join public.captain_lineup_players clp on clp.lineup_id=cl.id
      join public.roster_requests rr on rr.id=clp.player_id
      where cl.fixture_id=f.id and cl.team_id=p_team_id and cl.status='confirmed'
    ),'[]'::jsonb),
    'substitutions',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.captain_lineup_substitutions s where s.fixture_id=f.id),'[]'::jsonb),
    'appeals',coalesce((select jsonb_agg(to_jsonb(a)) from public.captain_match_appeals a where a.fixture_id=f.id),'[]'::jsonb)
  );
end
$function$;

create or replace function public.captain_verify_match_player(p_fixture_id uuid,p_team_id uuid,p_qr text)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  f public.fixtures%rowtype;
  v_opponent uuid;
  v_raw text:=trim(coalesce(p_qr,''));
  v_token text;
  v_id uuid;
  r record;
  v_positions text[];
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  if not public.is_admin() and not exists(
    select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid()
      and active=true and lower(role) in('captain','secretary')
  ) then raise exception 'Non autorizzato.'; end if;
  select * into f from public.fixtures where id=p_fixture_id and p_team_id in(home_team_id,away_team_id);
  if f.id is null then raise exception 'Partita non trovata.'; end if;
  v_opponent=case when p_team_id=f.home_team_id then f.away_team_id else f.home_team_id end;
  if v_raw='' then return jsonb_build_object('valid',false,'reason','Codice QR mancante.'); end if;
  v_token=substring(v_raw from '(?i)[?&]token=([0-9a-f-]{36})');
  if v_token is null and v_raw~*'^[0-9a-f-]{36}$' then v_token=v_raw; end if;
  if v_raw~*'^AICSPLAYER:[0-9a-f-]{36}' then
    v_id=(regexp_match(v_raw,'(?i)^AICSPLAYER:([0-9a-f-]{36})'))[1]::uuid;
  end if;
  select rr.id,rr.first_name,rr.last_name,rr.medical_certificate_expiry,pc.card_number,pc.status card_status
    into r
  from public.roster_requests rr join public.player_cards pc on pc.player_id=rr.id
  where rr.team_id=v_opponent and lower(coalesce(rr.status,''))='approved'
    and ((v_id is not null and rr.id=v_id) or (v_token is not null and pc.qr_token::text=v_token))
  limit 1;
  if r.id is null then return jsonb_build_object('valid',false,'reason','Tessera non valida per la squadra avversaria.'); end if;
  if lower(coalesce(r.card_status,''))<>'active' then return jsonb_build_object('valid',false,'reason','Tessera sospesa o non attiva.'); end if;
  if r.medical_certificate_expiry is null or r.medical_certificate_expiry<(f.scheduled_at at time zone 'Europe/Rome')::date then
    return jsonb_build_object('valid',false,'reason','Certificato medico assente o non valido alla data della partita.');
  end if;
  select array_agg(clp.position order by clp.position) into v_positions
  from public.captain_lineups cl join public.captain_lineup_players clp on clp.lineup_id=cl.id
  where cl.fixture_id=f.id and cl.team_id=v_opponent and cl.status='confirmed'
    and clp.confirmed=true and clp.player_id=r.id;
  if v_positions is null then return jsonb_build_object('valid',false,'reason','Giocatore non presente nella distinta confermata.'); end if;
  insert into public.captain_opponent_verifications(
    fixture_id,verifying_team_id,opponent_team_id,player_id,qr_value,verified_by
  ) values(f.id,p_team_id,v_opponent,r.id,v_raw,auth.uid())
  on conflict(fixture_id,verifying_team_id,player_id) do update set
    qr_value=excluded.qr_value,verified_by=auth.uid(),verified_at=now();
  return jsonb_build_object('valid',true,'player_id',r.id,'first_name',r.first_name,
    'last_name',r.last_name,'card_number',r.card_number,'positions',v_positions,
    'reason','Giocatore presente nella distinta e regolarmente abilitato.');
end
$function$;

create or replace function public.captain_confirm_match_appeal(p_fixture_id uuid,p_team_id uuid,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  f public.fixtures%rowtype;
  v_opponent uuid;
  v_missing int;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  if not public.is_admin() and not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and lower(role) in('captain','secretary')) then raise exception 'Non autorizzato.'; end if;
  select * into f from public.fixtures where id=p_fixture_id and p_team_id in(home_team_id,away_team_id);
  if f.id is null then raise exception 'Partita non trovata.'; end if;
  v_opponent=case when p_team_id=f.home_team_id then f.away_team_id else f.home_team_id end;
  if not exists(select 1 from public.captain_lineups where fixture_id=f.id and team_id=p_team_id and status='confirmed')
     or not exists(select 1 from public.captain_lineups where fixture_id=f.id and team_id=v_opponent and status='confirmed')
  then raise exception 'Entrambe le distinte devono essere confermate.'; end if;
  with required_players as (
    select distinct clp.player_id
    from public.captain_lineups cl join public.captain_lineup_players clp on clp.lineup_id=cl.id
    where cl.fixture_id=f.id and cl.team_id=v_opponent and cl.status='confirmed'
      and clp.confirmed=true and clp.position<>'Riserva'
      and not exists(select 1 from public.captain_lineup_substitutions s
        where s.fixture_id=f.id and s.team_id=v_opponent and s.position=clp.position and s.outgoing_player_id=clp.player_id)
    union
    select s.incoming_player_id from public.captain_lineup_substitutions s
    where s.fixture_id=f.id and s.team_id=v_opponent
  )
  select count(*) into v_missing from required_players rp
  where not exists(select 1 from public.captain_opponent_verifications cov
    where cov.fixture_id=f.id and cov.verifying_team_id=p_team_id and cov.player_id=rp.player_id);
  if v_missing>0 then raise exception 'Appello incompleto: mancano % verifiche QR.',v_missing; end if;
  insert into public.captain_match_appeals(fixture_id,team_id,opponent_team_id,status,notes,confirmed_by,confirmed_at,updated_at)
  values(f.id,p_team_id,v_opponent,'confirmed',nullif(trim(coalesce(p_notes,'')),''),auth.uid(),now(),now())
  on conflict(fixture_id,team_id) do update set status='confirmed',notes=excluded.notes,
    opponent_team_id=excluded.opponent_team_id,confirmed_by=auth.uid(),confirmed_at=now(),updated_at=now();
  return jsonb_build_object('ok',true,'status','confirmed');
end
$function$;

create or replace function public.captain_use_reserve(
  p_fixture_id uuid,p_team_id uuid,p_position text,p_outgoing_player_id uuid,p_incoming_player_id uuid,p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  f public.fixtures%rowtype;
  v_lineup uuid;
  v_id uuid;
  v_in_gender text;
  v_out_gender text;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  if not public.is_admin() and not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and lower(role) in('captain','secretary')) then raise exception 'Non autorizzato.'; end if;
  select * into f from public.fixtures where id=p_fixture_id and p_team_id in(home_team_id,away_team_id);
  if f.id is null then raise exception 'Partita non trovata.'; end if;
  if p_position not in('M1','M2','Misto','Femminile') then raise exception 'Incontro non valido.'; end if;
  if now()<f.scheduled_at-interval '120 minutes' and not public.is_admin() then raise exception 'Le riserve diventano utilizzabili dopo il blocco della distinta.'; end if;
  if now()>=public.match_weekend_cutoff(f.scheduled_at) and not public.is_admin() then raise exception 'Gara già chiusa.'; end if;
  select id into v_lineup from public.captain_lineups where fixture_id=f.id and team_id=p_team_id and status='confirmed';
  if v_lineup is null then raise exception 'Distinta non confermata.'; end if;
  if not exists(select 1 from public.captain_lineup_players where lineup_id=v_lineup and player_id=p_outgoing_player_id and position=p_position and confirmed=true) then raise exception 'Giocatore uscente non presente in questo incontro.'; end if;
  if not exists(select 1 from public.captain_lineup_players where lineup_id=v_lineup and player_id=p_incoming_player_id and position='Riserva' and confirmed=true) then raise exception 'Il giocatore entrante non era indicato come riserva entro T-120.'; end if;
  select lower(trim(coalesce(gender,''))) into v_in_gender from public.roster_requests where id=p_incoming_player_id;
  select lower(trim(coalesce(gender,''))) into v_out_gender from public.roster_requests where id=p_outgoing_player_id;
  if p_position='Femminile' and v_in_gender not in('f','femminile','female','donna') then raise exception 'Nel Femminile può entrare soltanto una giocatrice.'; end if;
  if p_position='Misto' and ((v_out_gender in('f','femminile','female','donna'))<>(v_in_gender in('f','femminile','female','donna'))) then raise exception 'Nel Misto la riserva deve sostituire un giocatore dello stesso sesso.'; end if;
  if p_position in('M1','M2') and v_in_gender not in('m','maschile','male','uomo') then raise exception 'Negli incontri maschili può entrare soltanto un uomo.'; end if;
  if p_position in('M1','M2') and exists(
    select 1 from public.captain_lineup_players where lineup_id=v_lineup and player_id=p_incoming_player_id
      and position in('M1','M2') and position<>p_position
    union all
    select 1 from public.captain_lineup_substitutions where fixture_id=f.id and team_id=p_team_id
      and incoming_player_id=p_incoming_player_id and position in('M1','M2') and position<>p_position
  ) then raise exception 'Un uomo non può disputare entrambi gli incontri maschili.'; end if;
  if (select count(*) from (
      select position from public.captain_lineup_players where lineup_id=v_lineup and player_id=p_incoming_player_id and position<>'Riserva'
      union all select position from public.captain_lineup_substitutions where fixture_id=f.id and team_id=p_team_id and incoming_player_id=p_incoming_player_id
    )q)>=2 then raise exception 'La riserva ha già raggiunto il limite di 2 incontri.'; end if;
  insert into public.captain_lineup_substitutions(fixture_id,team_id,position,outgoing_player_id,incoming_player_id,reason,created_by)
  values(f.id,p_team_id,p_position,p_outgoing_player_id,p_incoming_player_id,nullif(trim(coalesce(p_reason,'')),''),auth.uid())
  returning id into v_id;
  return v_id;
end
$function$;

create or replace function public.save_match_result(p_fixture_id uuid,p_result jsonb)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  f public.fixtures%rowtype;
  w public.match_workflows%rowtype;
  controls public.championship_controls%rowtype;
  v_engine jsonb;
  v_cutoff timestamptz;
  v_side text;
  v_player text;
  v_team uuid;
  v_gender text;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  select * into controls from public.championship_controls where id=1;
  if not coalesce(controls.results_enabled,true) and not public.is_admin() then raise exception 'Inserimento risultati disabilitato'; end if;
  select * into f from public.fixtures where id=p_fixture_id;
  if f.id is null then raise exception 'Partita non trovata'; end if;
  select * into w from public.match_workflows where fixture_id=p_fixture_id;
  if not(public.current_user_is_team_staff(f.home_team_id) or public.current_user_is_team_staff(f.away_team_id) or public.is_admin()) then raise exception 'Non autorizzato'; end if;
  v_cutoff=public.match_weekend_cutoff(f.scheduled_at);
  if now()>=v_cutoff then
    if not public.is_admin() then raise exception 'Risultati chiusi: termine di domenica ore 24:00 scaduto.'; end if;
    if not exists(select 1 from public.match_result_appeals where fixture_id=f.id and status in('submitted','reviewing','accepted')) then
      raise exception 'Dopo la chiusura è necessario un ricorso formale attivo.';
    end if;
  end if;
  if not public.is_admin() and (
    not exists(select 1 from public.captain_match_appeals where fixture_id=f.id and team_id=f.home_team_id and status='confirmed')
    or not exists(select 1 from public.captain_match_appeals where fixture_id=f.id and team_id=f.away_team_id and status='confirmed')
  ) then raise exception 'Appello digitale non ancora convalidato da entrambe le squadre.'; end if;
  v_engine=public.competition_result_engine(p_result);
  if coalesce((v_engine->>'valid')::boolean,false) is not true then raise exception '%',coalesce(v_engine->>'error','Risultato incompleto o non valido.'); end if;
  if coalesce((v_engine->>'home_matches_won')::int,0)=2 and coalesce((v_engine->>'away_matches_won')::int,0)=2 then
    foreach v_side in array array['home','away'] loop
      v_team=case when v_side='home' then f.home_team_id else f.away_team_id end;
      if jsonb_typeof(p_result->'spareggio'->(v_side||'_players'))<>'array'
         or jsonb_array_length(p_result->'spareggio'->(v_side||'_players'))<>2
      then raise exception 'Seleziona uomo e donna dello spareggio per entrambe le squadre.'; end if;
      if (select count(*) from jsonb_array_elements_text(p_result->'spareggio'->(v_side||'_players')) z
          join public.roster_requests rr on rr.id=z.value::uuid
          where lower(trim(coalesce(rr.gender,''))) in('f','femminile','female','donna'))<>1
         or (select count(*) from jsonb_array_elements_text(p_result->'spareggio'->(v_side||'_players')) z
          join public.roster_requests rr on rr.id=z.value::uuid
          where lower(trim(coalesce(rr.gender,''))) in('m','maschile','male','uomo'))<>1
      then raise exception 'Ogni coppia dello spareggio deve essere composta da un uomo e una donna.'; end if;
      for v_player in select value from jsonb_array_elements_text(p_result->'spareggio'->(v_side||'_players')) loop
        if not exists(
          select 1 from public.captain_lineups cl join public.captain_lineup_players clp on clp.lineup_id=cl.id
          where cl.fixture_id=f.id and cl.team_id=v_team and cl.status='confirmed' and clp.player_id=v_player::uuid
            and clp.position<>'Riserva' and not exists(select 1 from public.captain_lineup_substitutions s
              where s.fixture_id=f.id and s.team_id=v_team and s.position=clp.position and s.outgoing_player_id=clp.player_id)
          union all
          select 1 from public.captain_lineup_substitutions s
          where s.fixture_id=f.id and s.team_id=v_team and s.incoming_player_id=v_player::uuid
        ) then raise exception 'Allo spareggio possono partecipare soltanto giocatori in distinta che abbiano già giocato nella giornata.'; end if;
      end loop;
    end loop;
  end if;
  insert into public.match_results(fixture_id,result_data,submitted_at,submitted_by,finished_at,updated_at)
  values(f.id,p_result,now(),auth.uid(),now(),now())
  on conflict(fixture_id) do update set result_data=excluded.result_data,submitted_at=now(),
    submitted_by=auth.uid(),finished_at=coalesce(public.match_results.finished_at,now()),updated_at=now();
  insert into public.match_audit_log(fixture_id,user_id,action,payload) values(f.id,auth.uid(),'result_saved',p_result);
  insert into public.match_workflows(fixture_id,result_edit_deadline,result_status,updated_at)
  values(f.id,v_cutoff,'submitted',now())
  on conflict(fixture_id) do update set result_edit_deadline=v_cutoff,result_status='submitted',updated_at=now();
end
$function$;

create or replace function public.captain_get_match_center(p_fixture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare f public.fixtures%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  select * into f from public.fixtures where id=p_fixture_id;
  if f.id is null then raise exception 'Partita non trovata.'; end if;
  if not(public.current_user_is_team_staff(f.home_team_id) or public.current_user_is_team_staff(f.away_team_id) or public.is_admin()) then raise exception 'Non autorizzato.'; end if;
  return jsonb_build_object(
    'ok',true,'fixture',to_jsonb(f),'result_deadline',public.match_weekend_cutoff(f.scheduled_at),
    'teams',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by case when t.id=f.home_team_id then 0 else 1 end) from public.teams t where t.id in(f.home_team_id,f.away_team_id)),'[]'::jsonb),
    'workflow',(select to_jsonb(w) from public.match_workflows w where w.fixture_id=f.id),
    'result',(select mr.result_data from public.match_results mr where mr.fixture_id=f.id),
    'appeals',coalesce((select jsonb_agg(to_jsonb(a) order by a.submitted_at desc) from public.match_result_appeals a where a.fixture_id=f.id),'[]'::jsonb),
    'eligible_spareggio',coalesce((
      with played as (
        select cl.team_id,clp.player_id
        from public.captain_lineups cl join public.captain_lineup_players clp on clp.lineup_id=cl.id
        where cl.fixture_id=f.id and cl.status='confirmed' and clp.position<>'Riserva'
          and not exists(select 1 from public.captain_lineup_substitutions s where s.fixture_id=f.id and s.team_id=cl.team_id and s.position=clp.position and s.outgoing_player_id=clp.player_id)
        union
        select s.team_id,s.incoming_player_id from public.captain_lineup_substitutions s where s.fixture_id=f.id
      )
      select jsonb_agg(jsonb_build_object('team_id',p.team_id,'player_id',rr.id,'first_name',rr.first_name,'last_name',rr.last_name,'gender',rr.gender) order by p.team_id,rr.last_name)
      from played p join public.roster_requests rr on rr.id=p.player_id
    ),'[]'::jsonb)
  );
end
$function$;

create or replace function public.captain_submit_result_appeal(p_fixture_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare f public.fixtures%rowtype; r public.match_results%rowtype; v_team uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Descrivi il motivo del ricorso.'; end if;
  select * into f from public.fixtures where id=p_fixture_id;
  select * into r from public.match_results where fixture_id=p_fixture_id;
  if f.id is null or r.fixture_id is null then raise exception 'Partita o risultato non disponibile.'; end if;
  if public.current_user_is_team_staff(f.home_team_id) then v_team=f.home_team_id;
  elsif public.current_user_is_team_staff(f.away_team_id) then v_team=f.away_team_id;
  elsif public.is_admin() then v_team=f.home_team_id;
  else raise exception 'Non autorizzato.'; end if;
  if now()>coalesce(r.finished_at,r.submitted_at)+interval '48 hours' then raise exception 'Termine di 48 ore per il ricorso scaduto.'; end if;
  insert into public.match_result_appeals(fixture_id,team_id,reason,submitted_by)
  values(f.id,v_team,trim(p_reason),auth.uid()) returning id into v_id;
  return v_id;
end
$function$;

create or replace function public.admin_resolve_result_appeal(p_appeal_id uuid,p_status text,p_notes text default null)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'Operazione riservata Admin.'; end if;
  if p_status not in('reviewing','accepted','rejected','resolved') then raise exception 'Stato non valido.'; end if;
  update public.match_result_appeals set status=p_status,resolved_by=auth.uid(),
    resolved_at=case when p_status in('rejected','resolved') then now() else null end,
    resolution_notes=nullif(trim(coalesce(p_notes,'')),'')
  where id=p_appeal_id;
  if not found then raise exception 'Ricorso non trovato.'; end if;
end
$function$;

create or replace function public.admin_get_result_appeals()
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'Operazione riservata Admin.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'fixture_id',a.fixture_id,'team_id',a.team_id,'team_name',t.name,
      'reason',a.reason,'status',a.status,'submitted_at',a.submitted_at,
      'resolved_at',a.resolved_at,'resolution_notes',a.resolution_notes,
      'scheduled_at',f.scheduled_at,'home_team_name',ht.name,'away_team_name',at.name
    ) order by a.submitted_at desc)
    from public.match_result_appeals a
    join public.fixtures f on f.id=a.fixture_id
    join public.teams t on t.id=a.team_id
    left join public.teams ht on ht.id=f.home_team_id
    left join public.teams at on at.id=f.away_team_id
  ),'[]'::jsonb);
end
$function$;

create or replace function public.finalize_weekend_results()
returns integer
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare v_count int;
begin
  with due as (
    select mr.fixture_id,public.match_weekend_cutoff(f.scheduled_at) cutoff
    from public.match_results mr join public.fixtures f on f.id=mr.fixture_id
    where mr.central_sent_at is null
      and now()>=public.match_weekend_cutoff(f.scheduled_at)+interval '1 minute'
  ), updated as (
    update public.match_results mr set central_sent_at=now(),locked_at=d.cutoff,updated_at=now()
    from due d where mr.fixture_id=d.fixture_id returning mr.fixture_id
  )
  select count(*) into v_count from updated;
  update public.match_workflows w set central_sent_at=now(),result_status='sent_to_central',updated_at=now()
  where exists(select 1 from public.match_results mr where mr.fixture_id=w.fixture_id and mr.central_sent_at is not null)
    and w.central_sent_at is null;
  update public.captain_lineups cl set locked_at=coalesce(cl.locked_at,f.scheduled_at-interval '120 minutes')
  from public.fixtures f where f.id=cl.fixture_id and now()>=f.scheduled_at-interval '120 minutes' and cl.locked_at is null;
  return v_count;
end
$function$;

-- Allinea i workflow già pubblicati e crea quello eventualmente mancante.
insert into public.match_workflows(
  fixture_id,calendar_published_at,formation_open_at,selection_lock_at,lineup_lock_at,result_edit_deadline,updated_at
)
select f.id,now(),now(),f.scheduled_at-interval '120 minutes',f.scheduled_at-interval '120 minutes',
  public.match_weekend_cutoff(f.scheduled_at),now()
from public.fixtures f
where f.scheduled_at is not null
on conflict(fixture_id) do update set
  selection_lock_at=excluded.selection_lock_at,lineup_lock_at=excluded.lineup_lock_at,
  result_edit_deadline=excluded.result_edit_deadline,updated_at=now();

revoke execute on function public.match_weekend_cutoff(timestamptz) from public,anon;
revoke execute on function public.captain_save_lineup(uuid,uuid,jsonb,text,boolean) from public,anon;
revoke execute on function public.captain_get_match_day(uuid,uuid) from public,anon;
revoke execute on function public.captain_verify_match_player(uuid,uuid,text) from public,anon;
revoke execute on function public.captain_confirm_match_appeal(uuid,uuid,text) from public,anon;
revoke execute on function public.captain_use_reserve(uuid,uuid,text,uuid,uuid,text) from public,anon;
revoke execute on function public.save_match_result(uuid,jsonb) from public,anon;
revoke execute on function public.captain_get_match_center(uuid) from public,anon;
revoke execute on function public.captain_submit_result_appeal(uuid,text) from public,anon;
revoke execute on function public.admin_resolve_result_appeal(uuid,text,text) from public,anon;
revoke execute on function public.admin_get_result_appeals() from public,anon;
revoke execute on function public.finalize_weekend_results() from public,anon,authenticated;

grant execute on function public.match_weekend_cutoff(timestamptz) to authenticated;
grant execute on function public.captain_save_lineup(uuid,uuid,jsonb,text,boolean) to authenticated;
grant execute on function public.captain_get_match_day(uuid,uuid) to authenticated;
grant execute on function public.captain_verify_match_player(uuid,uuid,text) to authenticated;
grant execute on function public.captain_confirm_match_appeal(uuid,uuid,text) to authenticated;
grant execute on function public.captain_use_reserve(uuid,uuid,text,uuid,uuid,text) to authenticated;
grant execute on function public.save_match_result(uuid,jsonb) to authenticated;
grant execute on function public.captain_get_match_center(uuid) to authenticated;
grant execute on function public.captain_submit_result_appeal(uuid,text) to authenticated;
grant execute on function public.admin_resolve_result_appeal(uuid,text,text) to authenticated;
grant execute on function public.admin_get_result_appeals() to authenticated;

commit;

-- Automazione: controllo ogni minuto; la funzione applica il termine di domenica ore 24:00 Europe/Rome.
create extension if not exists pg_cron with schema pg_catalog;
do $block$
begin
  if exists(select 1 from cron.job where jobname='aics-finalize-weekend-results') then
    perform cron.unschedule('aics-finalize-weekend-results');
  end if;
  perform cron.schedule('aics-finalize-weekend-results','* * * * *','select public.finalize_weekend_results();');
end
$block$;
