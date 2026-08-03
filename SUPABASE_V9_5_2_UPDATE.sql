-- PADEL ARENA MANAGER V9.5.2
-- COPPA ITALIA E CONTROLLO CONFLITTI IMPIANTO
begin;
alter table public.teams
add column if not exists match_slot_minutes integer not null default 120
check(match_slot_minutes in (90,120,150));
commit;
notify pgrst,'reload schema';
