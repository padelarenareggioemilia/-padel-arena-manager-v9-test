-- PADEL ARENA MANAGER V9.6.0
-- PORTALE PUBBLICO E ACCESSO PER RUOLO
-- Espone solo dati necessari alla consultazione pubblica.

begin;

create or replace view public.public_championship_teams as
select id,name,series,club_name,club_city,club_province,home_court,logo_url,team_colors
from public.teams;

create or replace view public.public_championship_groups as
select id,competition_code,group_name,sort_order
from public.competition_groups;

create or replace view public.public_championship_group_teams as
select group_id,team_id
from public.competition_group_teams;

create or replace view public.public_championship_fixtures as
select id,competition_code,phase,group_id,round_number,home_team_id,away_team_id,
       home_placeholder,away_placeholder,scheduled_at,venue,status
from public.fixtures;

create or replace view public.public_championship_status as
select fixture_id,homologated_at,to_jsonb(match_workflows) as workflow_data
from public.match_workflows;

grant usage on schema public to anon,authenticated;
grant select on public.public_championship_teams to anon,authenticated;
grant select on public.public_championship_groups to anon,authenticated;
grant select on public.public_championship_group_teams to anon,authenticated;
grant select on public.public_championship_fixtures to anon,authenticated;
grant select on public.public_championship_status to anon,authenticated;

commit;
notify pgrst,'reload schema';
