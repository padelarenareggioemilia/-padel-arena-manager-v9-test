-- AICS PADEL CHAMPIONSHIP V9.7 STABLE
-- Eseguire integralmente una sola volta nel progetto Supabase V9.
-- Lo script è ripetibile e non cancella squadre, giocatori, gironi o risultati.

begin;

-- 1. Pubblicazione delle competizioni
create table if not exists public.championship_publication (
  competition_code text primary key,
  is_published boolean not null default true,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.championship_publication
  (competition_code,is_published,published_at,updated_at)
values
  ('SERIE_A',true,now(),now()),
  ('SERIE_B',true,now(),now()),
  ('SERIE_C',true,now(),now()),
  ('COPPA_ITALIA',true,now(),now()),
  ('SUPERCOPPA',true,now(),now())
on conflict (competition_code) do nothing;

alter table public.championship_publication enable row level security;

drop policy if exists championship_publication_public_read
on public.championship_publication;
create policy championship_publication_public_read
on public.championship_publication
for select
to anon,authenticated
using (true);

drop policy if exists championship_publication_admin_write
on public.championship_publication;
create policy championship_publication_admin_write
on public.championship_publication
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.championship_publication to anon,authenticated;
grant insert,update,delete on public.championship_publication to authenticated;

-- 2. Viste pubbliche sicure: nessun dato personale di capitani o giocatori
create or replace view public.public_championship_teams as
select
  id,name,series,club_name,club_city,club_province,
  home_court,logo_url,team_colors
from public.teams;

create or replace view public.public_championship_groups as
select id,competition_code,group_name,sort_order
from public.competition_groups;

create or replace view public.public_championship_group_teams as
select group_id,team_id
from public.competition_group_teams;

create or replace view public.public_championship_fixtures as
select
  id,competition_code,phase,group_id,round_number,
  home_team_id,away_team_id,home_placeholder,away_placeholder,
  scheduled_at,venue,status
from public.fixtures;

create or replace view public.public_championship_status as
select
  fixture_id,
  homologated_at,
  to_jsonb(match_workflows) as workflow_data
from public.match_workflows;

create or replace view public.public_championship_publication as
select competition_code,is_published,published_at,updated_at
from public.championship_publication;

grant select on public.public_championship_teams to anon,authenticated;
grant select on public.public_championship_groups to anon,authenticated;
grant select on public.public_championship_group_teams to anon,authenticated;
grant select on public.public_championship_fixtures to anon,authenticated;
grant select on public.public_championship_status to anon,authenticated;
grant select on public.public_championship_publication to anon,authenticated;

-- 3. Coppa Italia: 32 qualificate e tabellone
create table if not exists public.cup_italia_entries (
  team_id uuid primary key references public.teams(id) on delete cascade,
  seed integer not null check (seed between 1 and 32),
  group_id uuid references public.competition_groups(id) on delete set null,
  group_position integer,
  points integer not null default 0,
  matches_difference integer not null default 0,
  matches_won integer not null default 0,
  sets_difference integer not null default 0,
  games_difference integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.fixtures
add column if not exists cup_round text;

alter table public.fixtures
add column if not exists cup_match_number integer;

alter table public.fixtures
add column if not exists better_seed_team_id uuid
references public.teams(id) on delete set null;

alter table public.cup_italia_entries enable row level security;

drop policy if exists cup_italia_entries_public_read
on public.cup_italia_entries;
create policy cup_italia_entries_public_read
on public.cup_italia_entries
for select
to anon,authenticated
using (true);

drop policy if exists cup_italia_entries_admin_all
on public.cup_italia_entries;
create policy cup_italia_entries_admin_all
on public.cup_italia_entries
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.cup_italia_entries to anon,authenticated;
grant insert,update,delete on public.cup_italia_entries to authenticated;

commit;

notify pgrst, 'reload schema';
