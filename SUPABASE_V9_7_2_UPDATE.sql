-- AICS PADEL CHAMPIONSHIP V9.7.2
-- PERMESSI CAPITANO CORRETTI
-- Solo l'amministratore può cambiare campo/giorno/orario e rimuovere giocatori.

begin;

-- Blocca modifiche ai dati casalinghi da parte di utenti non amministratori.
create or replace function public.protect_team_home_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.home_court is distinct from old.home_court
       or new.home_match_day is distinct from old.home_match_day
       or new.home_match_time is distinct from old.home_match_time
       or new.match_slot_minutes is distinct from old.match_slot_minutes then
      raise exception 'Solo l amministratore può modificare campo, giorno, orario o durata delle partite in casa';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_team_home_schedule on public.teams;
create trigger trg_protect_team_home_schedule
before update on public.teams
for each row
execute function public.protect_team_home_schedule();

-- La cancellazione dei giocatori è riservata esclusivamente all'amministratore.
drop policy if exists players_captain_delete on public.players;
drop policy if exists players_admin_delete on public.players;

create policy players_admin_delete
on public.players
for delete
to authenticated
using (public.is_admin());

commit;

notify pgrst, 'reload schema';
