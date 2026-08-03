-- PADEL ARENA MANAGER V9.4.0
-- IMPORT / EXPORT EXCEL E CSV - PERMESSI AMMINISTRATORE
-- Non cancella alcun dato.

begin;

-- Le squadre sono già gestite dalle policy admin esistenti.
-- Aggiungiamo policy esplicite per importare e aggiornare i giocatori.

drop policy if exists roster_admin_insert on public.roster_requests;
create policy roster_admin_insert
on public.roster_requests
for insert
to authenticated
with check(public.is_admin());

drop policy if exists roster_admin_delete on public.roster_requests;
create policy roster_admin_delete
on public.roster_requests
for delete
to authenticated
using(public.is_admin());

-- Mantiene la policy di update già presente e aggiunge una policy admin separata.
drop policy if exists roster_admin_update_import on public.roster_requests;
create policy roster_admin_update_import
on public.roster_requests
for update
to authenticated
using(public.is_admin())
with check(public.is_admin());

grant select,insert,update,delete on public.roster_requests to authenticated;
grant select,insert,update,delete on public.teams to authenticated;
grant select on public.team_user_roles to authenticated;

commit;
notify pgrst,'reload schema';
