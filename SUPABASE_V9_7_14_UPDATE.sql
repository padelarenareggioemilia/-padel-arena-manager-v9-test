-- AICS PADEL CHAMPIONSHIP V9.7.14
begin;
drop policy if exists roster_requests_admin_delete on public.roster_requests;
create policy roster_requests_admin_delete on public.roster_requests for delete to authenticated using (public.is_admin());
drop policy if exists roster_requests_admin_update on public.roster_requests;
create policy roster_requests_admin_update on public.roster_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select,insert,update,delete on public.roster_requests to authenticated;
commit;
notify pgrst, 'reload schema';
