-- Padel Arena Manager V9: vista pubblica di sola lettura per la classifica ufficiale.
-- Eseguire nel SQL Editor del progetto Supabase V9 Test.
-- Non modifica risultati o righe della classifica ufficiale.
begin;
create or replace view public.public_championship_official_standings
with (security_barrier = true)
as
select
  os.competition_code,
  os.group_id,
  cg.group_name,
  cg.sort_order as group_sort_order,
  os.team_id,
  t.name as team_name,
  os.played,
  os.won,
  os.lost,
  os.points,
  os.matches_won,
  os.matches_lost,
  os.matches_difference,
  os.sets_difference,
  os.games_difference,
  os.position
from public.official_standings os
left join public.competition_groups cg on cg.id = os.group_id
left join public.teams t on t.id = os.team_id;
grant select on public.public_championship_official_standings to anon, authenticated;
commit;
