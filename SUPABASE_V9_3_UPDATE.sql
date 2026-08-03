-- PADEL ARENA MANAGER V9.3.0
-- FORMAZIONI, RISULTATI, SEGRETARI E CONTROLLI GLOBALI
-- Non cancella squadre, calendari, richieste o utenti esistenti.

begin;

create table if not exists public.championship_controls (
  id integer primary key default 1 check (id = 1),
  captains_enabled boolean not null default true,
  players_enabled boolean not null default true,
  formations_enabled boolean not null default true,
  results_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.championship_controls(id)
values(1)
on conflict(id) do nothing;

create table if not exists public.team_user_roles (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('captain','secretary','player')),
  active boolean not null default true,
  appointed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(team_id,user_id)
);

alter table public.roster_requests add column if not exists user_id uuid references auth.users(id);
alter table public.roster_requests add column if not exists account_required boolean not null default true;

create unique index if not exists roster_requests_team_user_unique
on public.roster_requests(team_id,user_id)
where user_id is not null;

create table if not exists public.match_workflows (
  fixture_id uuid primary key references public.fixtures(id) on delete cascade,
  calendar_published_at timestamptz,
  formation_open_at timestamptz,
  selection_lock_at timestamptz,
  lineup_lock_at timestamptz,
  result_edit_deadline timestamptz,
  home_lineup_status text not null default 'waiting',
  away_lineup_status text not null default 'waiting',
  result_status text not null default 'waiting',
  homologated_at timestamptz,
  homologated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_lineups (
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  selected_player_ids uuid[] not null default '{}',
  lineup jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  selection_locked_at timestamptz,
  lineup_locked_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key(fixture_id,team_id)
);

create table if not exists public.match_results (
  fixture_id uuid primary key references public.fixtures(id) on delete cascade,
  result_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id),
  home_confirmed_at timestamptz,
  away_confirmed_at timestamptz,
  confirmed_at timestamptz,
  report_generated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.match_audit_log (
  id bigserial primary key,
  fixture_id uuid references public.fixtures(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_user_is_team_staff(p_team_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_admin()
  or exists(
    select 1 from public.team_user_roles r
    where r.team_id=p_team_id and r.user_id=auth.uid()
      and r.role in ('captain','secretary') and r.active
  )
$$;

create or replace function public.current_user_is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_admin()
  or exists(
    select 1 from public.team_user_roles r
    where r.team_id=p_team_id and r.user_id=auth.uid() and r.active
  )
$$;

create or replace function public.ensure_current_team_role(p_team_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare
  u_email text;
  t_email text;
  roster_id uuid;
  result_role text;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  select lower(email) into u_email from auth.users where id=auth.uid();
  select lower(captain_email) into t_email from public.teams where id=p_team_id;

  if u_email=t_email then
    insert into public.team_user_roles(team_id,user_id,role,active)
    values(p_team_id,auth.uid(),'captain',true)
    on conflict(team_id,user_id) do update set role='captain',active=true;
    return 'captain';
  end if;

  select id into roster_id from public.roster_requests
  where team_id=p_team_id and user_id=auth.uid() and status='approved'
  limit 1;

  if roster_id is not null then
    insert into public.team_user_roles(team_id,user_id,role,active)
    values(p_team_id,auth.uid(),'player',true)
    on conflict(team_id,user_id) do update set active=true;
    select role into result_role from public.team_user_roles
    where team_id=p_team_id and user_id=auth.uid();
    return result_role;
  end if;

  raise exception 'Utente non autorizzato per questa squadra';
end $$;

create or replace function public.set_team_secretary(p_team_id uuid,p_user_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
declare
  staff_count integer;
begin
  if not public.current_user_is_team_staff(p_team_id) then raise exception 'Operazione non autorizzata'; end if;

  if p_enabled then
    if not exists(
      select 1 from public.roster_requests
      where team_id=p_team_id and user_id=p_user_id and status='approved'
    ) then raise exception 'Il segretario deve essere un giocatore approvato con account'; end if;

    select count(*) into staff_count from public.team_user_roles
    where team_id=p_team_id and role='secretary' and active and user_id<>p_user_id;
    if staff_count>=3 then raise exception 'Sono consentiti massimo 3 segretari'; end if;

    insert into public.team_user_roles(team_id,user_id,role,active,appointed_by)
    values(p_team_id,p_user_id,'secretary',true,auth.uid())
    on conflict(team_id,user_id) do update
      set role='secretary',active=true,appointed_by=auth.uid();
  else
    update public.team_user_roles
    set role='player',active=true
    where team_id=p_team_id and user_id=p_user_id and role='secretary';
  end if;
end $$;

create or replace function public.publish_competition_calendar(p_competition_code text)
returns integer language plpgsql security definer set search_path=public as $$
declare
  f record;
  affected integer:=0;
  first_fixture uuid;
begin
  if not public.is_admin() then raise exception 'Solo amministratore'; end if;

  for f in
    select * from public.fixtures
    where competition_code=p_competition_code and scheduled_at is not null
    order by scheduled_at,id
  loop
    insert into public.match_workflows(
      fixture_id,calendar_published_at,selection_lock_at,lineup_lock_at,result_edit_deadline
    ) values(
      f.id,now(),f.scheduled_at-interval '120 minutes',
      f.scheduled_at-interval '5 minutes',f.scheduled_at+interval '26 hours'
    )
    on conflict(fixture_id) do update set
      calendar_published_at=now(),
      selection_lock_at=excluded.selection_lock_at,
      lineup_lock_at=excluded.lineup_lock_at,
      result_edit_deadline=excluded.result_edit_deadline,
      updated_at=now();
    affected:=affected+1;
  end loop;

  -- Prima gara di ogni squadra: formazione aperta alla pubblicazione.
  update public.match_workflows w
  set formation_open_at=now(),home_lineup_status='open',updated_at=now()
  where w.fixture_id in(
    select distinct on(team_id) fixture_id
    from(
      select id fixture_id,home_team_id team_id,scheduled_at from public.fixtures
      where competition_code=p_competition_code and home_team_id is not null
      union all
      select id,away_team_id,scheduled_at from public.fixtures
      where competition_code=p_competition_code and away_team_id is not null
    ) x
    order by team_id,scheduled_at
  );

  return affected;
end $$;

create or replace function public.homologate_match(p_fixture_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  f record;
  next_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo amministratore'; end if;
  select * into f from public.fixtures where id=p_fixture_id;
  if f.id is null then raise exception 'Partita non trovata'; end if;

  insert into public.match_workflows(fixture_id,homologated_at,homologated_by)
  values(p_fixture_id,now(),auth.uid())
  on conflict(fixture_id) do update
    set homologated_at=now(),homologated_by=auth.uid(),result_status='homologated',updated_at=now();

  -- Apre la prossima formazione di entrambe le squadre.
  for next_id in
    select id from public.fixtures
    where scheduled_at>f.scheduled_at
      and (home_team_id in(f.home_team_id,f.away_team_id)
        or away_team_id in(f.home_team_id,f.away_team_id))
    order by scheduled_at
    limit 2
  loop
    insert into public.match_workflows(fixture_id,formation_open_at,home_lineup_status,away_lineup_status)
    values(next_id,now(),'open','open')
    on conflict(fixture_id) do update
      set formation_open_at=coalesce(public.match_workflows.formation_open_at,now()),
          home_lineup_status='open',away_lineup_status='open',updated_at=now();
  end loop;
end $$;

create or replace function public.save_match_lineup(
  p_fixture_id uuid,p_team_id uuid,p_selected uuid[],p_lineup jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare
  w public.match_workflows%rowtype;
  controls public.championship_controls%rowtype;
  existing uuid[];
begin
  select * into controls from public.championship_controls where id=1;
  if not controls.formations_enabled then raise exception 'Inserimento formazioni disabilitato'; end if;
  if not public.current_user_is_team_staff(p_team_id) then raise exception 'Non autorizzato'; end if;

  select * into w from public.match_workflows where fixture_id=p_fixture_id;
  if w.formation_open_at is null then raise exception 'Formazione non ancora aperta'; end if;
  if now()>=w.lineup_lock_at then raise exception 'Distinta già definitiva'; end if;

  select selected_player_ids into existing from public.match_lineups
  where fixture_id=p_fixture_id and team_id=p_team_id;

  if now()>=w.selection_lock_at and existing is not null
     and (select array_agg(x order by x) from unnest(existing)x)
       is distinct from (select array_agg(x order by x) from unnest(p_selected)x)
  then
    raise exception 'A meno di 120 minuti non puoi aggiungere, eliminare o sostituire giocatori';
  end if;

  insert into public.match_lineups(
    fixture_id,team_id,selected_player_ids,lineup,submitted_at,
    selection_locked_at,lineup_locked_at,updated_at,updated_by
  ) values(
    p_fixture_id,p_team_id,p_selected,p_lineup,now(),
    case when now()>=w.selection_lock_at then w.selection_lock_at end,
    null,now(),auth.uid()
  )
  on conflict(fixture_id,team_id) do update set
    selected_player_ids=excluded.selected_player_ids,
    lineup=excluded.lineup,
    submitted_at=now(),
    selection_locked_at=case
      when now()>=w.selection_lock_at then w.selection_lock_at
      else public.match_lineups.selection_locked_at end,
    updated_at=now(),updated_by=auth.uid();

  insert into public.match_audit_log(fixture_id,team_id,user_id,action,payload)
  values(p_fixture_id,p_team_id,auth.uid(),'lineup_saved',p_lineup);
end $$;

create or replace function public.save_match_result(p_fixture_id uuid,p_result jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare
 f public.fixtures%rowtype;
 w public.match_workflows%rowtype;
 controls public.championship_controls%rowtype;
begin
 select * into controls from public.championship_controls where id=1;
 if not controls.results_enabled then raise exception 'Inserimento risultati disabilitato'; end if;
 select * into f from public.fixtures where id=p_fixture_id;
 select * into w from public.match_workflows where fixture_id=p_fixture_id;
 if not(public.current_user_is_team_staff(f.home_team_id) or public.current_user_is_team_staff(f.away_team_id) or public.is_admin())
 then raise exception 'Non autorizzato'; end if;
 if w.homologated_at is not null and not public.is_admin() then raise exception 'Risultato già omologato'; end if;
 if now()>w.result_edit_deadline and not public.is_admin() then raise exception 'Termine di 26 ore scaduto'; end if;

 insert into public.match_results(fixture_id,result_data,submitted_at,submitted_by,updated_at)
 values(p_fixture_id,p_result,now(),auth.uid(),now())
 on conflict(fixture_id) do update set
 result_data=excluded.result_data,submitted_at=now(),submitted_by=auth.uid(),updated_at=now();

 insert into public.match_audit_log(fixture_id,user_id,action,payload)
 values(p_fixture_id,auth.uid(),'result_saved',p_result);
end $$;

alter table public.championship_controls enable row level security;
alter table public.team_user_roles enable row level security;
alter table public.match_workflows enable row level security;
alter table public.match_lineups enable row level security;
alter table public.match_results enable row level security;
alter table public.match_audit_log enable row level security;

drop policy if exists controls_read on public.championship_controls;
create policy controls_read on public.championship_controls for select to authenticated using(true);
drop policy if exists controls_admin_write on public.championship_controls;
create policy controls_admin_write on public.championship_controls for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists roles_read on public.team_user_roles;
create policy roles_read on public.team_user_roles for select to authenticated using(user_id=auth.uid() or public.is_admin() or public.current_user_is_team_staff(team_id));
drop policy if exists roles_admin_write on public.team_user_roles;
create policy roles_admin_write on public.team_user_roles for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists workflows_read on public.match_workflows;
create policy workflows_read on public.match_workflows for select to authenticated using(true);
drop policy if exists workflows_admin on public.match_workflows;
create policy workflows_admin on public.match_workflows for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists lineups_read on public.match_lineups;
create policy lineups_read on public.match_lineups for select to authenticated using(true);
drop policy if exists results_read on public.match_results;
create policy results_read on public.match_results for select to authenticated using(true);
drop policy if exists audit_admin on public.match_audit_log;
create policy audit_admin on public.match_audit_log for select to authenticated using(public.is_admin());

grant select on public.championship_controls,public.team_user_roles,public.match_workflows,public.match_lineups,public.match_results to authenticated;
grant execute on function public.ensure_current_team_role(uuid) to authenticated;
grant execute on function public.set_team_secretary(uuid,uuid,boolean) to authenticated;
grant execute on function public.publish_competition_calendar(text) to authenticated;
grant execute on function public.homologate_match(uuid) to authenticated;
grant execute on function public.save_match_lineup(uuid,uuid,uuid[],jsonb) to authenticated;
grant execute on function public.save_match_result(uuid,jsonb) to authenticated;

commit;
notify pgrst,'reload schema';
