-- PADEL ARENA MANAGER V9.2.0
-- Gironi, geolocalizzazione, calendario, Coppa Italia e Supercoppa.
-- Non cancella squadre, richieste o dati già presenti.

begin;

alter table public.teams add column if not exists latitude double precision;
alter table public.teams add column if not exists longitude double precision;
alter table public.teams add column if not exists geocoded_at timestamptz;

create table if not exists public.competition_settings (
  id uuid primary key default gen_random_uuid(),
  competition_code text not null unique,
  competition_name text not null,
  group_count integer not null default 1 check(group_count > 0),
  season_start date,
  interval_weeks integer not null default 1 check(interval_weeks > 0),
  double_round_robin boolean not null default true,
  finals_venue text not null default 'Eden Padel Club',
  finals_address text not null default 'Via Giacomo Balla 6, Reggio Emilia',
  finals_weekday text not null default 'Domenica',
  finals_start_time time not null default '10:00',
  updated_at timestamptz not null default now()
);

insert into public.competition_settings(competition_code,competition_name,group_count)
values
 ('SERIE_A','Serie A',1),
 ('SERIE_B','Serie B',1),
 ('SERIE_C','Serie C',1),
 ('COPPA_ITALIA','Coppa Italia',1),
 ('SUPERCOPPA','Supercoppa',1)
on conflict(competition_code) do nothing;

create table if not exists public.competition_groups (
  id uuid primary key default gen_random_uuid(),
  competition_code text not null,
  group_name text not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  unique(competition_code,group_name)
);

create table if not exists public.competition_group_teams (
  group_id uuid not null references public.competition_groups(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  seed integer,
  primary key(group_id,team_id)
);

create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  competition_code text not null,
  phase text not null default 'Girone',
  group_id uuid references public.competition_groups(id) on delete set null,
  round_number integer,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  home_placeholder text,
  away_placeholder text,
  scheduled_at timestamptz,
  venue text,
  status text not null default 'programmata',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.competition_settings enable row level security;
alter table public.competition_groups enable row level security;
alter table public.competition_group_teams enable row level security;
alter table public.fixtures enable row level security;

drop policy if exists competition_settings_admin_all on public.competition_settings;
create policy competition_settings_admin_all on public.competition_settings
for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists competition_groups_admin_all on public.competition_groups;
create policy competition_groups_admin_all on public.competition_groups
for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists competition_group_teams_admin_all on public.competition_group_teams;
create policy competition_group_teams_admin_all on public.competition_group_teams
for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists fixtures_admin_all on public.fixtures;
create policy fixtures_admin_all on public.fixtures
for all to authenticated using(public.is_admin()) with check(public.is_admin());

grant select,insert,update,delete on public.competition_settings to authenticated;
grant select,insert,update,delete on public.competition_groups to authenticated;
grant select,insert,update,delete on public.competition_group_teams to authenticated;
grant select,insert,update,delete on public.fixtures to authenticated;

commit;
notify pgrst,'reload schema';
