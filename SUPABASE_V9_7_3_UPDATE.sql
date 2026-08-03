-- AICS PADEL CHAMPIONSHIP V9.7.3
-- CORREZIONE: I GIOCATORI SONO NELLA TABELLA roster_requests
-- Non usa e non crea public.players.

begin;

-- Protezione dei dati casalinghi:
-- solo l'amministratore può cambiare campo, giorno, ora e durata.
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

-- Lettura dei giocatori della propria squadra.
drop policy if exists roster_requests_captain_select
on public.roster_requests;

create policy roster_requests_captain_select
on public.roster_requests
for select
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.team_user_roles tur
    where tur.team_id = roster_requests.team_id
      and tur.user_id = auth.uid()
      and tur.active = true
      and tur.role in ('captain','secretary')
  )
);

-- Inserimento manuale consentito a capitano/segretario abilitato.
drop policy if exists roster_requests_captain_insert
on public.roster_requests;

create policy roster_requests_captain_insert
on public.roster_requests
for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1
    from public.team_user_roles tur
    join public.teams t on t.id = tur.team_id
    where tur.team_id = roster_requests.team_id
      and tur.user_id = auth.uid()
      and tur.active = true
      and tur.role in ('captain','secretary')
      and t.captain_access_enabled = true
  )
);

-- Aggiornamento consentito a capitano/segretario abilitato.
drop policy if exists roster_requests_captain_update
on public.roster_requests;

create policy roster_requests_captain_update
on public.roster_requests
for update
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.team_user_roles tur
    join public.teams t on t.id = tur.team_id
    where tur.team_id = roster_requests.team_id
      and tur.user_id = auth.uid()
      and tur.active = true
      and tur.role in ('captain','secretary')
      and t.captain_access_enabled = true
  )
)
with check (
  public.is_admin()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.team_user_roles tur
    join public.teams t on t.id = tur.team_id
    where tur.team_id = roster_requests.team_id
      and tur.user_id = auth.uid()
      and tur.active = true
      and tur.role in ('captain','secretary')
      and t.captain_access_enabled = true
  )
);

-- Eliminazione riservata esclusivamente all'amministratore.
drop policy if exists roster_requests_captain_delete
on public.roster_requests;

drop policy if exists roster_requests_admin_delete
on public.roster_requests;

create policy roster_requests_admin_delete
on public.roster_requests
for delete
to authenticated
using (public.is_admin());

grant select,insert,update,delete on public.roster_requests to authenticated;
grant select,update on public.teams to authenticated;

commit;

notify pgrst, 'reload schema';
