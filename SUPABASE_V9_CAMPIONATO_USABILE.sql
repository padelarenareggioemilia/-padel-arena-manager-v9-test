-- V9 CAMPIONATO USABILE - aggiornamento sicuro per il progetto V9 Test
begin;

alter table public.teams add column if not exists captain_name text;
alter table public.teams add column if not exists captain_email text;
alter table public.teams add column if not exists captain_phone text;
alter table public.teams add column if not exists captain_invite_token text;
alter table public.teams add column if not exists player_invite_token text;

update public.teams set
 captain_invite_token=coalesce(nullif(captain_invite_token,''),encode(gen_random_bytes(16),'hex')),
 player_invite_token=coalesce(nullif(player_invite_token,''),encode(gen_random_bytes(16),'hex'));

alter table public.teams alter column captain_invite_token set default encode(gen_random_bytes(16),'hex');
alter table public.teams alter column player_invite_token set default encode(gen_random_bytes(16),'hex');

create unique index if not exists teams_captain_invite_uidx on public.teams(captain_invite_token);
create unique index if not exists teams_player_invite_uidx on public.teams(player_invite_token);

create table if not exists public.roster_requests(
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id) on delete cascade,
 first_name text not null,
 last_name text not null,
 email text not null,
 phone text not null,
 birth_date date not null,
 birth_place text not null,
 residence_town text not null,
 residence_province text not null,
 gender text not null,
 status text not null default 'pending' check(status in('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 unique(team_id,email)
);

alter table public.roster_requests enable row level security;

drop policy if exists roster_captain_admin_read on public.roster_requests;
create policy roster_captain_admin_read on public.roster_requests
for select to authenticated using(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
 or exists(select 1 from public.teams t where t.id=team_id and t.captain_user_id=auth.uid())
);

drop policy if exists roster_captain_admin_update on public.roster_requests;
create policy roster_captain_admin_update on public.roster_requests
for update to authenticated using(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
 or exists(select 1 from public.teams t where t.id=team_id and t.captain_user_id=auth.uid())
) with check(true);

grant select,update on public.roster_requests to authenticated;

drop function if exists public.public_team_by_captain_invite(text);
create function public.public_team_by_captain_invite(p_token text)
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('id',id,'name',name,'series',series,'club_name',club_name,'captain_name',captain_name,'captain_email',captain_email)
 from public.teams where captain_invite_token=p_token limit 1
$$;

drop function if exists public.public_team_by_player_invite(text);
create function public.public_team_by_player_invite(p_token text)
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('id',id,'name',name,'series',series,'club_name',club_name)
 from public.teams where player_invite_token=p_token limit 1
$$;

drop function if exists public.claim_team_as_captain(text);
create function public.claim_team_as_captain(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.teams; em text;
begin
 if auth.uid() is null then raise exception 'Accedi prima di continuare'; end if;
 select email into em from auth.users where id=auth.uid();
 select * into t from public.teams where captain_invite_token=p_token limit 1;
 if not found then raise exception 'Invito non valido'; end if;
 if lower(coalesce(em,''))<>lower(coalesce(t.captain_email,'')) then raise exception 'Usa l’email del capitano assegnata alla squadra'; end if;
 update public.teams set captain_user_id=auth.uid(),updated_at=now() where id=t.id;
 insert into public.team_memberships(team_id,user_id,membership_role,status) values(t.id,auth.uid(),'captain','active') on conflict do nothing;
 update public.profiles set role='captain' where id=auth.uid() and role<>'admin';
 select * into t from public.teams where id=t.id;
 return to_jsonb(t);
end $$;

drop function if exists public.submit_roster_request(text,jsonb);
create function public.submit_roster_request(p_token text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tid uuid; rid uuid;
begin
 select id into tid from public.teams where player_invite_token=p_token limit 1;
 if tid is null then raise exception 'Link non valido'; end if;
 insert into public.roster_requests(team_id,first_name,last_name,email,phone,birth_date,birth_place,residence_town,residence_province,gender)
 values(tid,p_payload->>'first_name',p_payload->>'last_name',lower(p_payload->>'email'),p_payload->>'phone',(p_payload->>'birth_date')::date,p_payload->>'birth_place',p_payload->>'residence_town',upper(p_payload->>'residence_province'),p_payload->>'gender')
 on conflict(team_id,email) do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,birth_date=excluded.birth_date,birth_place=excluded.birth_place,residence_town=excluded.residence_town,residence_province=excluded.residence_province,gender=excluded.gender,status='pending',decided_at=null
 returning id into rid;
 return jsonb_build_object('id',rid,'status','pending');
end $$;

grant execute on function public.public_team_by_captain_invite(text) to anon,authenticated;
grant execute on function public.public_team_by_player_invite(text) to anon,authenticated;
grant execute on function public.claim_team_as_captain(text) to authenticated;
grant execute on function public.submit_roster_request(text,jsonb) to anon,authenticated;

commit;
notify pgrst,'reload schema';
