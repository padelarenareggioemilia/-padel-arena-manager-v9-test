-- V9 STABLE BUILD 1 - FIX RICHIESTI
begin;

alter table public.teams
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocoded_at timestamptz;

insert into storage.buckets(id,name,public)
values ('team-logos','team-logos',true)
on conflict(id) do update set public=true;

insert into storage.buckets(id,name,public)
values ('player-photos','player-photos',true)
on conflict(id) do update set public=true;

drop policy if exists team_logos_public_read on storage.objects;
create policy team_logos_public_read on storage.objects for select
using(bucket_id='team-logos');

drop policy if exists team_logos_admin_write on storage.objects;
create policy team_logos_admin_write on storage.objects for all to authenticated
using(bucket_id='team-logos' and public.is_admin())
with check(bucket_id='team-logos' and public.is_admin());

drop policy if exists player_photos_public_read on storage.objects;
create policy player_photos_public_read on storage.objects for select
using(bucket_id='player-photos');

drop policy if exists player_photos_authenticated_write on storage.objects;
create policy player_photos_authenticated_write on storage.objects for all to authenticated
using(bucket_id='player-photos')
with check(bucket_id='player-photos');

create or replace function public.delete_empty_team_safely(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare n text;
begin
 if not public.is_admin() then raise exception 'Operazione riservata all amministratore'; end if;
 select name into n from teams where id=p_team_id;
 if n is null then raise exception 'Squadra non trovata'; end if;
 if exists(select 1 from roster_requests where team_id=p_team_id) then raise exception 'Contiene giocatori'; end if;
 if exists(select 1 from fixtures where home_team_id=p_team_id or away_team_id=p_team_id) then raise exception 'È presente nel calendario'; end if;
 if exists(select 1 from team_user_roles where team_id=p_team_id) then raise exception 'Possiede account o ruoli collegati'; end if;
 delete from championship_group_teams where team_id=p_team_id;
 delete from teams where id=p_team_id;
 return jsonb_build_object('success',true,'message','Squadra eliminata: '||n);
end $$;

create or replace function public.teams_without_real_captain()
returns table(id uuid,name text) language sql security definer set search_path=public as $$
 select t.id,t.name from teams t
 where (nullif(trim(t.captain_name),'') is null or nullif(trim(t.captain_email),'') is null)
 and not exists(select 1 from team_user_roles u where u.team_id=t.id and u.active=true and u.role='captain')
$$;

grant execute on function public.delete_empty_team_safely(uuid) to authenticated;
grant execute on function public.teams_without_real_captain() to authenticated;

commit;
notify pgrst,'reload schema';
