-- Padel Arena Manager V9
-- Vista di sola lettura per esporre la classifica ufficiale ai capitani.
-- Eseguire nel SQL Editor del progetto Supabase V9 TEST.
-- Non modifica risultati, punteggi o righe di official_standings.

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

-- NOTA: questa migrazione espone i dati, ma per completare la correzione
-- va modificato anche competition-public.html affinché la scheda Classifica
-- legga questa vista invece di ricostruire i punteggi nel browser.
