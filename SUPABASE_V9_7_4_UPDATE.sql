-- AICS PADEL CHAMPIONSHIP V9.7.4
-- SEGRETARI, FORMAZIONI CONDIVISE E DISTINTA VIRTUALE

begin;

create table if not exists public.match_lineups (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  lineup_data jsonb not null default '{"matches":[]}'::jsonb,
  status text not null default 'draft'
    check(status in ('draft','confirmed','official')),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(fixture_id,team_id)
);

create table if not exists public.match_lineup_audit (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.match_lineups enable row level security;
alter table public.match_lineup_audit enable row level security;

-- Gli addetti delle due squadre e l'admin possono vedere entrambe le formazioni,
-- anche quando sono ancora in compilazione.
drop policy if exists match_lineups_authorized_read on public.match_lineups;
create policy match_lineups_authorized_read
on public.match_lineups
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.fixtures f
    join public.team_user_roles tur
      on tur.team_id in (f.home_team_id,f.away_team_id)
    where f.id=match_lineups.fixture_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
  )
);

-- Ogni squadra può modificare soltanto la propria formazione.
drop policy if exists match_lineups_team_write on public.match_lineups;
create policy match_lineups_team_write
on public.match_lineups
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.team_user_roles tur
    join public.teams t on t.id=tur.team_id
    where tur.team_id=match_lineups.team_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
      and t.captain_access_enabled=true
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.team_user_roles tur
    join public.teams t on t.id=tur.team_id
    where tur.team_id=match_lineups.team_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
      and t.captain_access_enabled=true
  )
);

drop policy if exists match_lineup_audit_authorized_read on public.match_lineup_audit;
create policy match_lineup_audit_authorized_read
on public.match_lineup_audit
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.fixtures f
    join public.team_user_roles tur
      on tur.team_id in (f.home_team_id,f.away_team_id)
    where f.id=match_lineup_audit.fixture_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
  )
);

drop policy if exists match_lineup_audit_insert on public.match_lineup_audit;
create policy match_lineup_audit_insert
on public.match_lineup_audit
for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1
    from public.team_user_roles tur
    where tur.team_id=match_lineup_audit.team_id
      and tur.user_id=auth.uid()
      and tur.active=true
      and tur.role in ('captain','secretary')
  )
);

-- Ricerca sicura dell'account tramite email per la nomina dei segretari.
create or replace function public.find_user_id_by_email(target_email text)
returns uuid
language plpgsql
security definer
set search_path=auth,public
as $$
declare
  found_id uuid;
begin
  select id into found_id
  from auth.users
  where lower(email)=lower(target_email)
  limit 1;
  return found_id;
end;
$$;

grant execute on function public.find_user_id_by_email(text) to authenticated;

-- Massimo 3 segretari attivi per squadra.
create or replace function public.limit_team_secretaries()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  active_count integer;
begin
  if new.role='secretary' and new.active=true then
    select count(*) into active_count
    from public.team_user_roles
    where team_id=new.team_id
      and role='secretary'
      and active=true
      and id is distinct from new.id;
    if active_count>=3 then
      raise exception 'Sono consentiti al massimo 3 segretari attivi per squadra';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limit_team_secretaries on public.team_user_roles;
create trigger trg_limit_team_secretaries
before insert or update on public.team_user_roles
for each row
execute function public.limit_team_secretaries();

grant select,insert,update on public.match_lineups to authenticated;
grant select,insert on public.match_lineup_audit to authenticated;

commit;
notify pgrst,'reload schema';
