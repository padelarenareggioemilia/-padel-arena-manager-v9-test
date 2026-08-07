-- AICS PADEL CHAMPIONSHIP V9.9.12 - FIX TEST COMPLETO
begin;

alter table public.team_user_roles add column if not exists id uuid default gen_random_uuid();
update public.team_user_roles set id=gen_random_uuid() where id is null;
create unique index if not exists uq_team_user_roles_id_v9912 on public.team_user_roles(id);

create table if not exists public.user_match_view_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 scope text not null default 'team' check(scope in ('team','category','all')),
 selected_team_id uuid references public.teams(id) on delete set null,
 selected_series text,updated_at timestamptz not null default now());
alter table public.user_match_view_preferences enable row level security;
drop policy if exists match_view_preferences_own_all on public.user_match_view_preferences;
create policy match_view_preferences_own_all on public.user_match_view_preferences for all to authenticated using(user_id=auth.uid() or public.is_admin()) with check(user_id=auth.uid() or public.is_admin());
grant select,insert,update,delete on public.user_match_view_preferences to authenticated;

create table if not exists public.team_documents(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,
 title text not null,file_name text not null,file_url text not null,storage_path text not null,mime_type text,note text,
 uploaded_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now());
alter table public.team_documents enable row level security;
drop policy if exists team_documents_staff_read on public.team_documents;
create policy team_documents_staff_read on public.team_documents for select to authenticated using(public.is_admin() or exists(select 1 from public.team_user_roles r where r.team_id=team_documents.team_id and r.user_id=auth.uid() and r.active=true and r.role in('captain','secretary')));
drop policy if exists team_documents_staff_insert on public.team_documents;
create policy team_documents_staff_insert on public.team_documents for insert to authenticated with check(public.is_admin() or exists(select 1 from public.team_user_roles r where r.team_id=team_documents.team_id and r.user_id=auth.uid() and r.active=true and r.role in('captain','secretary')));
grant select,insert on public.team_documents to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('team-documents','team-documents',true,15728640) on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit;
drop policy if exists team_documents_storage_insert on storage.objects;
create policy team_documents_storage_insert on storage.objects for insert to authenticated with check(bucket_id='team-documents' and (public.is_admin() or exists(select 1 from public.team_user_roles r where r.user_id=auth.uid() and r.active=true and r.role in('captain','secretary') and r.team_id::text=split_part(name,'/',1))));
drop policy if exists team_documents_storage_read on storage.objects;
create policy team_documents_storage_read on storage.objects for select to authenticated using(bucket_id='team-documents');

alter table public.team_callup_players add column if not exists response_note text;

drop function if exists public.captain_revoke_secretary(uuid,uuid);
create function public.captain_revoke_secretary(p_team_id uuid,p_role_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare v_email text;
begin
 select lower(trim(email)) into v_email from auth.users where id=auth.uid();
 if not exists(select 1 from public.teams where id=p_team_id and lower(trim(captain_email))=v_email) and not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role='captain') then raise exception 'Solo il capitano può revocare il segretario.'; end if;
 update public.team_user_roles set active=false where id=p_role_id and team_id=p_team_id and role='secretary';return found;
end$$;
grant execute on function public.captain_revoke_secretary(uuid,uuid) to authenticated;

commit;
notify pgrst,'reload schema';
