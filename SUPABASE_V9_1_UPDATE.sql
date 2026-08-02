-- PADEL ARENA MANAGER V9.1 - AGGIORNAMENTO COMPLETO
begin;
alter table public.teams add column if not exists club_city text;
alter table public.teams add column if not exists club_province text;
alter table public.teams add column if not exists club_fiscal_code text;
alter table public.teams add column if not exists home_court text;
alter table public.teams add column if not exists team_colors text;
alter table public.teams add column if not exists vice_captain_name text;
alter table public.teams add column if not exists vice_captain_email text;
alter table public.teams add column if not exists notes text;
alter table public.teams add column if not exists captain_access_enabled boolean not null default true;
alter table public.roster_requests add column if not exists level text;
alter table public.roster_requests add column if not exists notes text;
insert into storage.buckets(id,name,public) values('team-logos','team-logos',true) on conflict(id) do update set public=true;
drop policy if exists team_logos_public_read on storage.objects;
create policy team_logos_public_read on storage.objects for select to public using(bucket_id='team-logos');
drop policy if exists team_logos_admin_insert on storage.objects;
create policy team_logos_admin_insert on storage.objects for insert to authenticated with check(bucket_id='team-logos' and public.is_admin());
drop policy if exists team_logos_admin_update on storage.objects;
create policy team_logos_admin_update on storage.objects for update to authenticated using(bucket_id='team-logos' and public.is_admin()) with check(bucket_id='team-logos' and public.is_admin());
drop policy if exists team_logos_admin_delete on storage.objects;
create policy team_logos_admin_delete on storage.objects for delete to authenticated using(bucket_id='team-logos' and public.is_admin());
drop function if exists public.public_team_by_captain_invite(text);
create function public.public_team_by_captain_invite(p_token text) returns jsonb language sql security definer set search_path=public as $$ select jsonb_build_object('id',id,'name',name,'series',series,'club_name',club_name,'logo_url',logo_url,'captain_name',captain_name,'captain_email',captain_email,'captain_access_enabled',captain_access_enabled) from public.teams where captain_invite_token=p_token limit 1 $$;
drop function if exists public.public_team_by_player_invite(text);
create function public.public_team_by_player_invite(p_token text) returns jsonb language sql security definer set search_path=public as $$ select jsonb_build_object('id',id,'name',name,'series',series,'club_name',club_name,'logo_url',logo_url) from public.teams where player_invite_token=p_token limit 1 $$;
drop function if exists public.submit_roster_request(text,jsonb);
create function public.submit_roster_request(p_token text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$ declare tid uuid; rid uuid; begin select id into tid from public.teams where player_invite_token=p_token limit 1; if tid is null then raise exception 'Link non valido'; end if; insert into public.roster_requests(team_id,first_name,last_name,email,phone,birth_date,birth_place,residence_town,residence_province,gender,level,notes) values(tid,p_payload->>'first_name',p_payload->>'last_name',lower(p_payload->>'email'),p_payload->>'phone',(p_payload->>'birth_date')::date,p_payload->>'birth_place',p_payload->>'residence_town',upper(p_payload->>'residence_province'),p_payload->>'gender',p_payload->>'level',p_payload->>'notes') on conflict(team_id,email) do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,birth_date=excluded.birth_date,birth_place=excluded.birth_place,residence_town=excluded.residence_town,residence_province=excluded.residence_province,gender=excluded.gender,level=excluded.level,notes=excluded.notes,status='pending',decided_at=null returning id into rid; return jsonb_build_object('id',rid,'status','pending'); end $$;
grant execute on function public.public_team_by_captain_invite(text) to anon,authenticated;
grant execute on function public.public_team_by_player_invite(text) to anon,authenticated;
grant execute on function public.submit_roster_request(text,jsonb) to anon,authenticated;
commit; notify pgrst,'reload schema';

-- V9.1.1: programmazione partite casalinghe
alter table public.teams add column if not exists home_match_day text;
alter table public.teams add column if not exists home_match_time time;
notify pgrst,'reload schema';
