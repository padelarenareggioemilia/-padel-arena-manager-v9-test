-- AICS PADEL CHAMPIONSHIP V9.9.89
-- Adeguamento operativo al regolamento 2027.
-- Non modifica rose, risultati o classifiche gia registrati.

begin;

-- ============================================================
-- 1. AMMISSIBILITA ATLETI, ROSA E UNICITA
-- ============================================================

create or replace function public.fitp_band(p_value text)
returns integer
language plpgsql
immutable
set search_path='public','pg_temp'
as $function$
declare v text:=upper(trim(coalesce(p_value,''))); m text[];
begin
  if v='' or v in('NC','N.C.','N.C','N. C.','NON CLASSIFICATO','NON CLASSIFICATA','NESSUNA','NESSUNO','NO','0','-') then
    return null;
  end if;
  m:=regexp_match(v,'(^|[^0-9])([1-5])([.]?[1-5])?([^0-9]|$)');
  if m is null then return -1; end if;
  return m[2]::integer;
end
$function$;

create or replace function public.player_is_eligible_for_series(p_series text,p_fitp text)
returns boolean
language sql
immutable
set search_path='public','pg_temp'
as $function$
  select case
    when upper(trim(coalesce(p_series,''))) in('SERIE C','SERIE_C') then public.fitp_band(p_fitp) is null
    when upper(trim(coalesce(p_series,''))) in('SERIE B','SERIE_B') then public.fitp_band(p_fitp) is null or public.fitp_band(p_fitp)>=4
    when upper(trim(coalesce(p_series,''))) in('SERIE A','SERIE_A') then public.fitp_band(p_fitp) is null or public.fitp_band(p_fitp)>=3
    else false
  end
$function$;

create unique index if not exists roster_one_approved_email_idx
on public.roster_requests(lower(trim(email)))
where lower(coalesce(status,''))='approved' and nullif(trim(email),'') is not null;

create unique index if not exists roster_one_approved_identity_idx
on public.roster_requests(lower(trim(first_name)),lower(trim(last_name)),birth_date)
where lower(coalesce(status,''))='approved' and birth_date is not null;

create or replace function public.enforce_roster_regulation()
returns trigger
language plpgsql
set search_path='public','pg_temp'
as $function$
declare v_series text; v_count integer;
begin
  if lower(coalesce(new.status,''))<>'approved' then return new; end if;
  if tg_op='UPDATE'
     and new.status is not distinct from old.status
     and new.team_id is not distinct from old.team_id
     and new.fitp_ranking is not distinct from old.fitp_ranking then
    return new;
  end if;
  select series into v_series from public.teams where id=new.team_id;
  if not public.player_is_eligible_for_series(v_series,new.fitp_ranking) then
    raise exception 'Classifica FITP non ammessa per %. Correggi la categoria o la classifica del giocatore.',coalesce(v_series,'la serie selezionata');
  end if;
  select count(*) into v_count
  from public.roster_requests r
  where r.team_id=new.team_id and lower(coalesce(r.status,''))='approved'
    and r.id<>new.id;
  if v_count>=20 then
    raise exception 'Rosa completa: massimo 20 giocatori. Utilizza la procedura di sostituzione prevista dal regolamento.';
  end if;
  return new;
end
$function$;

drop trigger if exists trg_enforce_roster_regulation on public.roster_requests;
create trigger trg_enforce_roster_regulation
before insert or update of status,team_id,fitp_ranking on public.roster_requests
for each row execute function public.enforce_roster_regulation();

-- ============================================================
-- 2. DISTINTA TARDIVA E DECISIONE DELL'AVVERSARIO
-- ============================================================

create table if not exists public.late_lineup_decisions(
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  missing_team_id uuid not null references public.teams(id) on delete cascade,
  deciding_team_id uuid not null references public.teams(id) on delete cascade,
  decision text not null check(decision in('play','refuse')),
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  notes text,
  primary key(fixture_id,missing_team_id)
);
alter table public.late_lineup_decisions enable row level security;
revoke all on public.late_lineup_decisions from anon,authenticated;

create or replace function public.captain_get_late_lineup_case(p_fixture_id uuid,p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare f public.fixtures%rowtype; v_opponent uuid; v_own boolean; v_other boolean; d public.late_lineup_decisions%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  if not public.is_admin() and not public.current_user_is_team_staff(p_team_id) then raise exception 'Non autorizzato.'; end if;
  select * into f from public.fixtures where id=p_fixture_id and p_team_id in(home_team_id,away_team_id);
  if f.id is null then raise exception 'Partita non trovata.'; end if;
  v_opponent:=case when p_team_id=f.home_team_id then f.away_team_id else f.home_team_id end;
  select exists(select 1 from public.captain_lineups where fixture_id=f.id and team_id=p_team_id and status='confirmed') into v_own;
  select exists(select 1 from public.captain_lineups where fixture_id=f.id and team_id=v_opponent and status='confirmed') into v_other;
  select * into d from public.late_lineup_decisions where fixture_id=f.id and missing_team_id in(p_team_id,v_opponent) limit 1;
  return jsonb_build_object(
    'ok',true,'deadline',f.scheduled_at-interval '120 minutes','after_deadline',now()>=f.scheduled_at-interval '120 minutes',
    'team_id',p_team_id,'opponent_team_id',v_opponent,'own_confirmed',v_own,'opponent_confirmed',v_other,
    'missing_team_id',case when not v_own then p_team_id when not v_other then v_opponent else null end,
    'can_decide',now()>=f.scheduled_at-interval '120 minutes' and v_own and not v_other,
    'decision',d.decision,'decided_at',d.decided_at,'notes',d.notes
  );
end
$function$;

create or replace function public.captain_decide_late_lineup(p_fixture_id uuid,p_team_id uuid,p_decision text,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare f public.fixtures%rowtype; v_missing uuid;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  if not public.current_user_is_team_staff(p_team_id) then raise exception 'Non autorizzato.'; end if;
  if p_decision not in('play','refuse') then raise exception 'Decisione non valida.'; end if;
  select * into f from public.fixtures where id=p_fixture_id and p_team_id in(home_team_id,away_team_id);
  if f.id is null then raise exception 'Partita non trovata.'; end if;
  if now()<f.scheduled_at-interval '120 minutes' then raise exception 'Il termine della distinta non e ancora scaduto.'; end if;
  if not exists(select 1 from public.captain_lineups where fixture_id=f.id and team_id=p_team_id and status='confirmed') then
    raise exception 'La tua distinta deve essere stata confermata entro il termine.';
  end if;
  v_missing:=case when p_team_id=f.home_team_id then f.away_team_id else f.home_team_id end;
  if exists(select 1 from public.captain_lineups where fixture_id=f.id and team_id=v_missing and status='confirmed') then
    raise exception 'La squadra avversaria ha gia confermato la distinta.';
  end if;
  insert into public.late_lineup_decisions(fixture_id,missing_team_id,deciding_team_id,decision,decided_by,decided_at,notes)
  values(f.id,v_missing,p_team_id,p_decision,auth.uid(),now(),nullif(trim(coalesce(p_notes,'')),''))
  on conflict(fixture_id,missing_team_id) do update set decision=excluded.decision,deciding_team_id=excluded.deciding_team_id,
    decided_by=auth.uid(),decided_at=now(),notes=excluded.notes;
  return jsonb_build_object('ok',true,'missing_team_id',v_missing,'decision',p_decision);
end
$function$;

-- ============================================================
-- 3. SANZIONI E RETTIFICHE DI CLASSIFICA
-- ============================================================

create table if not exists public.match_incidents(
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  incident_type text not null check(incident_type in('late_lineup','no_show','ineligible_player','unlisted_player','late_over_15','other')),
  notes text,
  status text not null default 'confirmed' check(status in('draft','confirmed','cancelled')),
  home_score integer,
  away_score integer,
  points_delta integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz
);

create table if not exists public.standing_adjustments(
  id uuid primary key default gen_random_uuid(),
  incident_id uuid unique references public.match_incidents(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  competition_code text not null,
  points_delta integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists match_incidents_fixture_idx on public.match_incidents(fixture_id,created_at desc);
create index if not exists standing_adjustments_team_comp_idx on public.standing_adjustments(team_id,competition_code);
alter table public.match_incidents enable row level security;
alter table public.standing_adjustments enable row level security;
revoke all on public.match_incidents from anon,authenticated;
revoke all on public.standing_adjustments from anon,authenticated;
grant select on public.standing_adjustments to anon,authenticated;
drop policy if exists standing_adjustments_public_read on public.standing_adjustments;
create policy standing_adjustments_public_read on public.standing_adjustments for select to anon,authenticated using(true);

create or replace view public.public_standing_adjustments with(security_invoker=true) as
select team_id,competition_code,points_delta,reason,created_at
from public.standing_adjustments;
grant select on public.public_standing_adjustments to anon,authenticated;

create or replace function public.admin_apply_match_incident(p_fixture_id uuid,p_team_id uuid,p_incident_type text,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare f public.fixtures%rowtype; v_id uuid; v_delta integer:=0; v_home integer; v_away integer; v_n integer;
begin
  if not public.is_admin() then raise exception 'Operazione riservata Admin.'; end if;
  if p_incident_type not in('late_lineup','no_show','ineligible_player','unlisted_player','late_over_15','other') then raise exception 'Tipo irregolarita non valido.'; end if;
  select * into f from public.fixtures where id=p_fixture_id and p_team_id in(home_team_id,away_team_id);
  if f.id is null then raise exception 'Partita o squadra non valida.'; end if;
  if p_incident_type='no_show' then v_delta:=-2;
  elsif p_incident_type='unlisted_player' then v_delta:=-5;
  elsif p_incident_type='ineligible_player' then
    select count(*)+1 into v_n from public.match_incidents where team_id=p_team_id and incident_type='ineligible_player' and status='confirmed';
    v_delta:=-v_n;
  elsif p_incident_type='late_lineup' then v_delta:=-1;
  end if;
  if p_incident_type in('no_show','ineligible_player','unlisted_player') then
    if p_team_id=f.home_team_id then v_home:=0;v_away:=4; else v_home:=4;v_away:=0; end if;
  end if;
  insert into public.match_incidents(fixture_id,team_id,incident_type,notes,home_score,away_score,points_delta,created_by)
  values(f.id,p_team_id,p_incident_type,nullif(trim(coalesce(p_notes,'')),''),v_home,v_away,v_delta,auth.uid()) returning id into v_id;
  if v_delta<>0 then
    insert into public.standing_adjustments(incident_id,team_id,competition_code,points_delta,reason)
    values(v_id,p_team_id,f.competition_code,v_delta,case p_incident_type
      when 'late_lineup' then 'Distinta presentata oltre il termine'
      when 'no_show' then 'Mancata presentazione'
      when 'ineligible_player' then 'Utilizzo di giocatore non schierabile'
      when 'unlisted_player' then 'Utilizzo di giocatore non presente in lista'
      else coalesce(nullif(trim(p_notes),''),'Decisione del Comitato Tecnico') end);
  end if;
  if v_home is not null then
    insert into public.match_results(fixture_id,result_data,submitted_at,submitted_by,finished_at,locked_at,central_sent_at,updated_at)
    values(f.id,jsonb_build_object('home_score',v_home,'away_score',v_away,'administrative',true,'incident_id',v_id),now(),auth.uid(),now(),now(),now(),now())
    on conflict(fixture_id) do update set result_data=excluded.result_data,submitted_at=now(),submitted_by=auth.uid(),
      finished_at=now(),locked_at=now(),central_sent_at=now(),updated_at=now();
    insert into public.match_workflows(fixture_id,result_status,homologated_at,homologated_by,central_sent_at,updated_at)
    values(f.id,'sent_to_central',now(),auth.uid(),now(),now())
    on conflict(fixture_id) do update set result_status='sent_to_central',homologated_at=now(),homologated_by=auth.uid(),central_sent_at=now(),updated_at=now();
  end if;
  return jsonb_build_object('ok',true,'incident_id',v_id,'points_delta',v_delta,'home_score',v_home,'away_score',v_away);
end
$function$;

create or replace function public.admin_list_match_incidents()
returns jsonb
language sql
security definer
set search_path='public','pg_temp'
as $function$
  select case when public.is_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'fixture_id',i.fixture_id,'team_id',i.team_id,'team_name',t.name,'incident_type',i.incident_type,
    'notes',i.notes,'status',i.status,'points_delta',i.points_delta,'home_score',i.home_score,'away_score',i.away_score,
    'created_at',i.created_at,'scheduled_at',f.scheduled_at,'home_team_id',f.home_team_id,'away_team_id',f.away_team_id,
    'home_team_name',ht.name,'away_team_name',at.name
  ) order by i.created_at desc),'[]'::jsonb) else '[]'::jsonb end
  from public.match_incidents i join public.fixtures f on f.id=i.fixture_id join public.teams t on t.id=i.team_id
  left join public.teams ht on ht.id=f.home_team_id left join public.teams at on at.id=f.away_team_id
$function$;

-- ============================================================
-- 4. VALIDAZIONE SPORTIVA DEI RISULTATI
-- ============================================================

create or replace function public.valid_six_game_set(p_home integer,p_away integer)
returns boolean language sql immutable set search_path='public','pg_temp'
as $function$
  select p_home>=0 and p_away>=0 and p_home<>p_away and (
    (greatest(p_home,p_away)=6 and least(p_home,p_away)<=4) or
    (greatest(p_home,p_away)=7 and least(p_home,p_away) in(5,6))
  )
$function$;

create or replace function public.valid_deciding_tiebreak(p_home integer,p_away integer)
returns boolean language sql immutable set search_path='public','pg_temp'
as $function$
  select p_home>=0 and p_away>=0 and p_home<>p_away and (
    (greatest(p_home,p_away)=7 and least(p_home,p_away)<=5) or
    (greatest(p_home,p_away)=8 and least(p_home,p_away) in(6,7))
  )
$function$;

create or replace function public.competition_result_engine(p_result jsonb)
returns jsonb
language plpgsql
immutable
set search_path='public','pg_temp'
as $function$
declare m jsonb; idx int:=0; hmw int:=0; amw int:=0; hs int; as_ int;
  h1 int;a1 int;h2 int;a2 int;htb int;atb int;sp jsonb;sh int;sa int;team_winner text;
begin
  if p_result is null or jsonb_typeof(p_result->'matches')<>'array' or jsonb_array_length(p_result->'matches')<>4 then
    return jsonb_build_object('valid',false,'complete',false,'error','Devono essere presenti esattamente 4 incontri.');
  end if;
  for m in select value from jsonb_array_elements(p_result->'matches') loop
    idx:=idx+1;h1:=nullif(m->>'h1','')::int;a1:=nullif(m->>'a1','')::int;h2:=nullif(m->>'h2','')::int;a2:=nullif(m->>'a2','')::int;
    htb:=nullif(coalesce(m->>'htb',m->>'h3',m->>'home_tb'),'')::int;atb:=nullif(coalesce(m->>'atb',m->>'a3',m->>'away_tb'),'')::int;
    if h1 is null or a1 is null or h2 is null or a2 is null then return jsonb_build_object('valid',false,'error','Set incompleti nell incontro '||idx||'.'); end if;
    if not public.valid_six_game_set(h1,a1) or not public.valid_six_game_set(h2,a2) then
      return jsonb_build_object('valid',false,'error','Punteggio non valido nell incontro '||idx||': i set sono ai 6 game.');
    end if;
    hs:=(h1>a1)::int+(h2>a2)::int;as_:=(a1>h1)::int+(a2>h2)::int;
    if hs=1 and as_=1 then
      if htb is null or atb is null or not public.valid_deciding_tiebreak(htb,atb) then
        return jsonb_build_object('valid',false,'error','Tie-break decisivo non valido nell incontro '||idx||': si gioca ai 7 punti.');
      end if;
      if htb>atb then hs:=2;else as_:=2;end if;
    elsif htb is not null or atb is not null then
      return jsonb_build_object('valid',false,'error','Il tie-break decisivo e ammesso soltanto sul risultato di 1-1 nei set.');
    end if;
    if hs>as_ then hmw:=hmw+1;else amw:=amw+1;end if;
  end loop;
  if hmw=2 and amw=2 then
    sp:=p_result->'spareggio';sh:=nullif(coalesce(sp->>'h',sp->>'home',sp->>'home_games'),'')::int;sa:=nullif(coalesce(sp->>'a',sp->>'away',sp->>'away_games'),'')::int;
    if sh is null or sa is null or not public.valid_six_game_set(sh,sa) then return jsonb_build_object('valid',false,'error','Sul 2-2 e obbligatorio lo spareggio Misto con un set valido ai 6 game.'); end if;
    if sh>sa then team_winner:='home';else team_winner:='away';end if;
  elsif hmw>amw then team_winner:='home';else team_winner:='away';end if;
  return jsonb_build_object('valid',true,'complete',true,'home_matches_won',hmw,'away_matches_won',amw,
    'needs_spareggio',hmw=2 and amw=2,'team_winner',team_winner,
    'home_score',hmw+case when hmw=2 and amw=2 and team_winner='home' then 1 else 0 end,
    'away_score',amw+case when hmw=2 and amw=2 and team_winner='away' then 1 else 0 end);
end
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
  v_lineup_id uuid;v_fixture public.fixtures%rowtype;v_item jsonb;v_player_id uuid;v_position text;
  v_max_uses int;v_match_date date;v_series text;v_reg public.player_registration_status%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  if not public.is_admin() and not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and lower(role) in('captain','secretary')) then raise exception 'Non autorizzato.'; end if;
  select * into v_fixture from public.fixtures where id=p_fixture_id and p_team_id in(home_team_id,away_team_id);
  if v_fixture.id is null then raise exception 'La squadra non partecipa a questa partita.'; end if;
  if v_fixture.scheduled_at is null then raise exception 'Data e orario della partita non definiti.'; end if;
  if not public.is_admin() and now()>=v_fixture.scheduled_at then raise exception 'La partita e gia iniziata: puo intervenire soltanto l organizzazione.'; end if;
  if not public.is_admin() and now()>=v_fixture.scheduled_at-interval '120 minutes' and not exists(
    select 1 from public.late_lineup_decisions d where d.fixture_id=v_fixture.id and d.missing_team_id=p_team_id and d.decision='play'
  ) then raise exception 'Distinta scaduta: serve la decisione della squadra avversaria.'; end if;
  if jsonb_typeof(coalesce(p_players,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_players,'[]'::jsonb))=0 then raise exception 'Seleziona almeno un giocatore.'; end if;
  select series into v_series from public.teams where id=p_team_id;
  v_match_date:=(v_fixture.scheduled_at at time zone 'Europe/Rome')::date;
  for v_item in select * from jsonb_array_elements(p_players) loop
    v_player_id:=(v_item->>'player_id')::uuid;v_position:=trim(coalesce(v_item->>'position',''));
    if v_position not in('M1','M2','Misto','Femminile','Riserva') then raise exception 'Assegna un ruolo valido a tutti i giocatori selezionati.'; end if;
    if not exists(select 1 from public.roster_requests rr where rr.id=v_player_id and rr.team_id=p_team_id and lower(trim(coalesce(rr.status,'')))='approved') then raise exception 'Giocatore non approvato o non appartenente alla squadra.'; end if;
    if p_confirm and not exists(select 1 from public.roster_requests rr where rr.id=v_player_id and public.player_is_eligible_for_series(v_series,rr.fitp_ranking)) then raise exception 'Giocatore non ammesso nella categoria della squadra.'; end if;
    if p_confirm then
      select * into v_reg from public.player_registration_status where player_id=v_player_id and team_id=p_team_id;
      if v_reg.player_id is null or v_reg.registration_status<>'tesserato' then raise exception 'Giocatore non ancora regolarmente tesserato.'; end if;
      if v_reg.registered_at is null or v_reg.registered_at>v_fixture.scheduled_at-interval '24 hours' then raise exception 'Tesseramento non ancora valido: devono trascorrere 24 ore dall invio completo.'; end if;
    end if;
    if p_confirm and not exists(select 1 from public.roster_requests rr where rr.id=v_player_id and rr.medical_certificate_expiry is not null and rr.medical_certificate_expiry>=v_match_date) then raise exception 'Certificato medico assente o non valido alla data della partita.'; end if;
    if p_confirm and not exists(select 1 from public.player_cards pc where pc.player_id=v_player_id and lower(coalesce(pc.status,''))='active') then raise exception 'Tessera digitale non attiva per uno dei giocatori selezionati.'; end if;
  end loop;
  select max(c) into v_max_uses from(select count(*) c from jsonb_array_elements(p_players)x group by x->>'player_id')q;
  if coalesce(v_max_uses,0)>2 then raise exception 'Ogni giocatore puo disputare massimo 2 incontri.'; end if;
  if exists(select 1 from jsonb_array_elements(p_players)x group by x->>'player_id',x->>'position' having count(*)>1) then raise exception 'Lo stesso incontro non puo essere assegnato due volte allo stesso giocatore.'; end if;
  if exists(select 1 from jsonb_array_elements(p_players)x where x->>'position' in('M1','M2') group by x->>'player_id' having count(distinct x->>'position')>1) then raise exception 'Un uomo non puo disputare entrambi gli incontri maschili.'; end if;
  if p_confirm then
    if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='M1')<>2 then raise exception 'M1 deve avere esattamente 2 giocatori.'; end if;
    if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='M2')<>2 then raise exception 'M2 deve avere esattamente 2 giocatori.'; end if;
    if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='Misto')<>2 then raise exception 'Misto deve avere esattamente 2 giocatori.'; end if;
    if(select count(*) from jsonb_array_elements(p_players)x where x->>'position'='Femminile')<>2 then raise exception 'Femminile deve avere esattamente 2 giocatrici.'; end if;
    if exists(select 1 from jsonb_array_elements(p_players)x join public.roster_requests rr on rr.id=(x->>'player_id')::uuid where x->>'position'='Femminile' and lower(trim(coalesce(rr.gender,''))) not in('f','femminile','female','donna')) then raise exception 'La partita Femminile puo contenere solo giocatrici.'; end if;
    if(select count(*) from jsonb_array_elements(p_players)x join public.roster_requests rr on rr.id=(x->>'player_id')::uuid where x->>'position'='Misto' and lower(trim(coalesce(rr.gender,''))) in('f','femminile','female','donna'))<>1 then raise exception 'Il Misto deve essere composto da 1 uomo e 1 donna.'; end if;
    if(select count(*) from jsonb_array_elements(p_players)x join public.roster_requests rr on rr.id=(x->>'player_id')::uuid where x->>'position'='Misto' and lower(trim(coalesce(rr.gender,''))) in('m','maschile','male','uomo'))<>1 then raise exception 'Il Misto deve essere composto da 1 uomo e 1 donna.'; end if;
    if(select count(distinct rr.id) from jsonb_array_elements(p_players)x join public.roster_requests rr on rr.id=(x->>'player_id')::uuid where x->>'position'<>'Riserva' and lower(trim(coalesce(rr.gender,''))) in('m','maschile','male','uomo'))<4 then raise exception 'La distinta deve comprendere almeno 4 uomini.'; end if;
    if(select count(distinct rr.id) from jsonb_array_elements(p_players)x join public.roster_requests rr on rr.id=(x->>'player_id')::uuid where x->>'position'<>'Riserva' and lower(trim(coalesce(rr.gender,''))) in('f','femminile','female','donna'))<2 then raise exception 'La distinta deve comprendere almeno 2 donne.'; end if;
  end if;
  insert into public.captain_lineups(fixture_id,team_id,created_by,status,notes,confirmed_at,locked_at,updated_at)
  values(p_fixture_id,p_team_id,auth.uid(),case when p_confirm then 'confirmed' else 'draft' end,nullif(trim(coalesce(p_notes,'')),''),case when p_confirm then now() end,null,now())
  on conflict(fixture_id,team_id) do update set status=excluded.status,notes=excluded.notes,created_by=auth.uid(),confirmed_at=case when p_confirm then now() else null end,locked_at=null,updated_at=now()
  returning id into v_lineup_id;
  delete from public.captain_lineup_players where lineup_id=v_lineup_id;
  for v_item in select * from jsonb_array_elements(p_players) loop
    insert into public.captain_lineup_players(lineup_id,player_id,position,confirmed) values(v_lineup_id,(v_item->>'player_id')::uuid,v_item->>'position',p_confirm);
  end loop;
  return v_lineup_id;
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
declare f public.fixtures%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  if not public.is_admin() and not public.current_user_is_team_staff(p_team_id) then raise exception 'Non autorizzato.'; end if;
  select * into f from public.fixtures where id=p_fixture_id and p_team_id in(home_team_id,away_team_id);
  if f.id is null then raise exception 'Partita non trovata.'; end if;
  if not public.is_admin() and now()>=f.scheduled_at-interval '120 minutes' then
    raise exception 'Il termine per utilizzare le riserve e scaduto: a T-120 la distinta diventa definitiva.';
  end if;
  raise exception 'Prima di T-120 modifica direttamente la distinta e conferma la formazione definitiva.';
end
$function$;

create or replace function public.save_match_result(p_fixture_id uuid,p_result jsonb)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare f public.fixtures%rowtype;controls public.championship_controls%rowtype;v_engine jsonb;v_cutoff timestamptz;
  v_side text;v_player text;v_team uuid;v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Sessione non valida.'; end if;
  select * into controls from public.championship_controls where id=1;
  if not coalesce(controls.results_enabled,true) and not public.is_admin() then raise exception 'Inserimento risultati disabilitato'; end if;
  select * into f from public.fixtures where id=p_fixture_id;
  if f.id is null then raise exception 'Partita non trovata'; end if;
  if not(public.current_user_is_team_staff(f.home_team_id) or public.current_user_is_team_staff(f.away_team_id) or public.is_admin()) then raise exception 'Non autorizzato'; end if;
  v_cutoff:=public.match_weekend_cutoff(f.scheduled_at);
  if now()>=v_cutoff and not public.is_admin() then raise exception 'Risultati chiusi: termine di domenica ore 24:00 scaduto.'; end if;
  if not public.is_admin() and (not exists(select 1 from public.captain_match_appeals where fixture_id=f.id and team_id=f.home_team_id and status='confirmed') or not exists(select 1 from public.captain_match_appeals where fixture_id=f.id and team_id=f.away_team_id and status='confirmed')) then raise exception 'Appello digitale non ancora convalidato da entrambe le squadre.'; end if;
  v_engine:=public.competition_result_engine(p_result);
  if coalesce((v_engine->>'valid')::boolean,false) is not true then raise exception '%',coalesce(v_engine->>'error','Risultato incompleto o non valido.'); end if;
  if (v_engine->>'needs_spareggio')::boolean then
    foreach v_side in array array['home','away'] loop
      v_team:=case when v_side='home' then f.home_team_id else f.away_team_id end;
      if jsonb_typeof(p_result->'spareggio'->(v_side||'_players'))<>'array' or jsonb_array_length(p_result->'spareggio'->(v_side||'_players'))<>2 then raise exception 'Seleziona uomo e donna dello spareggio per entrambe le squadre.'; end if;
      if(select count(*) from jsonb_array_elements_text(p_result->'spareggio'->(v_side||'_players'))z join public.roster_requests rr on rr.id=z.value::uuid where lower(trim(coalesce(rr.gender,''))) in('f','femminile','female','donna'))<>1 then raise exception 'Ogni coppia dello spareggio deve avere una donna.'; end if;
      if(select count(*) from jsonb_array_elements_text(p_result->'spareggio'->(v_side||'_players'))z join public.roster_requests rr on rr.id=z.value::uuid where lower(trim(coalesce(rr.gender,''))) in('m','maschile','male','uomo'))<>1 then raise exception 'Ogni coppia dello spareggio deve avere un uomo.'; end if;
      for v_player in select value from jsonb_array_elements_text(p_result->'spareggio'->(v_side||'_players')) loop
        if not exists(select 1 from public.captain_lineups cl join public.captain_lineup_players clp on clp.lineup_id=cl.id where cl.fixture_id=f.id and cl.team_id=v_team and cl.status='confirmed' and clp.player_id=v_player::uuid and clp.position<>'Riserva') then raise exception 'Allo spareggio possono partecipare soltanto giocatori in distinta che abbiano gia giocato nella giornata.'; end if;
      end loop;
    end loop;
  end if;
  v_payload:=p_result||jsonb_build_object('home_score',(v_engine->>'home_score')::int,'away_score',(v_engine->>'away_score')::int,'winner',v_engine->>'team_winner');
  insert into public.match_results(fixture_id,result_data,submitted_at,submitted_by,finished_at,updated_at)
  values(f.id,v_payload,now(),auth.uid(),now(),now())
  on conflict(fixture_id) do update set result_data=excluded.result_data,submitted_at=now(),submitted_by=auth.uid(),finished_at=coalesce(public.match_results.finished_at,now()),updated_at=now();
  insert into public.match_audit_log(fixture_id,user_id,action,payload) values(f.id,auth.uid(),'result_saved',v_payload);
  insert into public.match_workflows(fixture_id,result_edit_deadline,result_status,updated_at) values(f.id,v_cutoff,'submitted',now())
  on conflict(fixture_id) do update set result_edit_deadline=v_cutoff,result_status='submitted',updated_at=now();
end
$function$;

-- Il portale pubblico riceve ora anche il risultato realmente registrato.
create or replace view public.public_championship_status as
select w.fixture_id,w.homologated_at,
  to_jsonb(w) || jsonb_build_object('result_data',r.result_data) as workflow_data
from public.match_workflows w
left join public.match_results r on r.fixture_id=w.fixture_id;
grant select on public.public_championship_status to anon,authenticated;

-- ============================================================
-- 5. SICUREZZA: AMICHEVOLI SOLO VIA RPC E RPC RISERVATE
-- ============================================================

do $block$
declare n text;
begin
  foreach n in array array['friendly_players','friendly_matches_meta','friendly_invitations','friendly_matches','friendly_lineups','friendly_lineup_players','friendly_team_roles','friendly_results','friendly_team_snapshots'] loop
    if to_regclass('public.'||n) is not null then
      execute format('alter table public.%I enable row level security',n);
      execute format('revoke all on public.%I from anon,authenticated',n);
    end if;
  end loop;
end
$block$;

revoke execute on function public.captain_get_late_lineup_case(uuid,uuid) from public,anon;
revoke execute on function public.captain_decide_late_lineup(uuid,uuid,text,text) from public,anon;
revoke execute on function public.admin_apply_match_incident(uuid,uuid,text,text) from public,anon;
revoke execute on function public.admin_list_match_incidents() from public,anon;
grant execute on function public.captain_get_late_lineup_case(uuid,uuid) to authenticated;
grant execute on function public.captain_decide_late_lineup(uuid,uuid,text,text) to authenticated;
grant execute on function public.admin_apply_match_incident(uuid,uuid,text,text) to authenticated;
grant execute on function public.admin_list_match_incidents() to authenticated;

-- Tutte le RPC operative Admin/Capitano richiedono una sessione autenticata.
do $block$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and (p.proname like 'admin_%' or p.proname like 'captain_%')
      and p.proname not in('captain_invite_details','captain_claim_invite','captain_activation_recovery')
  loop
    execute format('revoke execute on function %s from public,anon',r.signature);
    execute format('grant execute on function %s to authenticated',r.signature);
  end loop;
end
$block$;

-- Riduce l'API anonima alle sole funzioni necessarie prima del login
-- (inviti pubblici, iscrizione tramite token e verifica pubblica della tessera).
do $block$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.proname not in(
        'captain_activation_recovery','captain_invite_details','captain_claim_invite',
        'public_team_by_captain_invite','public_team_by_player_invite',
        'secretary_invite_details','secretary_claim_invite','submit_roster_request',
        'verify_player_card','verify_player_card_for_fixture','player_email_is_approved',
        'regulation_article_text'
      )
  loop
    execute format('revoke execute on function %s from public,anon',r.signature);
    execute format('grant execute on function %s to authenticated',r.signature);
  end loop;
end
$block$;

commit;
notify pgrst,'reload schema';
