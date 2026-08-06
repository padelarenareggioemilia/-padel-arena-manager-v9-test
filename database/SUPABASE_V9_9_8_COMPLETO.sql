-- AICS PADEL CHAMPIONSHIP V9.8.7
begin;
alter table public.roster_requests
  add column if not exists admin_approved boolean not null default false,
  add column if not exists captain_approved boolean not null default false,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists residence_postal_code text,
  add column if not exists gender text;

create table if not exists public.player_cards(
  id uuid primary key default gen_random_uuid(),
  player_id uuid unique not null references public.roster_requests(id) on delete cascade,
  card_number text unique not null,
  qr_token uuid unique not null default gen_random_uuid(),
  status text not null default 'active' check(status in ('active','suspended','expired')),
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.player_cards enable row level security;

create or replace function public.user_can_manage_team(p_team_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
select public.is_admin() or exists(select 1 from team_user_roles r where r.team_id=p_team_id and r.user_id=auth.uid() and r.active and r.role in('captain','secretary'))
or exists(select 1 from teams t where t.id=p_team_id and t.captain_access_enabled<>false and lower(trim(t.captain_email))=lower(coalesce(auth.jwt()->>'email','')));
$$;

create or replace function public.captain_update_team_notes(p_team_id uuid,p_notes text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not public.user_can_manage_team(p_team_id) then raise exception 'Account capitano non abilitato per questa squadra'; end if;
 update teams set notes=coalesce(p_notes,''),updated_at=now() where id=p_team_id;
 return jsonb_build_object('success',true);
end $$;

create or replace function public.captain_add_player_complete(p_team_id uuid,p_player jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.user_can_manage_team(p_team_id) then raise exception 'Account capitano non abilitato per questa squadra'; end if;
 insert into roster_requests(team_id,photo_url,first_name,last_name,birth_date,gender,birth_place,residence_town,residence_postal_code,residence_province,email,phone,fitp_ranking,medical_certificate_expiry,status,captain_approved,admin_approved,decided_at,created_at,updated_at)
 values(p_team_id,p_player->>'photo_url',p_player->>'first_name',p_player->>'last_name',(p_player->>'birth_date')::date,p_player->>'gender',p_player->>'birth_place',p_player->>'residence_town',p_player->>'residence_postal_code',upper(p_player->>'residence_province'),lower(p_player->>'email'),p_player->>'phone',upper(p_player->>'fitp_ranking'),(p_player->>'medical_certificate_expiry')::date,'approved',true,true,now(),now(),now())
 returning id into v_id;
 return jsonb_build_object('success',true,'player_id',v_id);
end $$;

create or replace function public.issue_player_card(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r roster_requests%rowtype;n text;
begin
 select * into r from roster_requests where id=p_player_id;
 if r.id is null then raise exception 'Giocatore non trovato'; end if;
 if not public.is_admin() and not public.user_can_manage_team(r.team_id) and r.user_id<>auth.uid() and lower(r.email)<>lower(coalesce(auth.jwt()->>'email','')) then raise exception 'Non autorizzato'; end if;
 if r.status<>'approved' then raise exception 'Il giocatore deve essere approvato'; end if;
 n:='AICS-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(r.id::text,'-',''),1,10));
 insert into player_cards(player_id,card_number,status) values(r.id,n,case when r.medical_certificate_expiry<current_date then 'expired' else 'active' end)
 on conflict(player_id) do update set status=case when r.medical_certificate_expiry<current_date then 'expired' else 'active' end,updated_at=now();
 return jsonb_build_object('success',true,'player_id',r.id);
end $$;

create or replace function public.get_my_player_card(p_player_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r record;
begin
 select rr.*,pc.card_number,pc.qr_token,pc.status card_status,t.name team_name,t.series into r
 from roster_requests rr left join player_cards pc on pc.player_id=rr.id join teams t on t.id=rr.team_id
 where (p_player_id is null or rr.id=p_player_id)
 and (rr.user_id=auth.uid() or lower(rr.email)=lower(coalesce(auth.jwt()->>'email','')) or public.is_admin() or public.user_can_manage_team(rr.team_id))
 order by rr.created_at desc limit 1;
 if r.id is null then return null; end if;
 if r.card_number is null then
   perform public.issue_player_card(r.id);
   select rr.*,pc.card_number,pc.qr_token,pc.status card_status,t.name team_name,t.series into r from roster_requests rr join player_cards pc on pc.player_id=rr.id join teams t on t.id=rr.team_id where rr.id=r.id;
 end if;
 return jsonb_build_object('player_id',r.id,'first_name',r.first_name,'last_name',r.last_name,'photo_url',r.photo_url,'team_name',r.team_name,'series',r.series,'fitp_ranking',r.fitp_ranking,'medical_certificate_expiry',r.medical_certificate_expiry,'card_number',r.card_number,'card_status',case when r.medical_certificate_expiry<current_date then 'expired' else r.card_status end,'verify_url','https://padelarenareggioemilia.github.io/-padel-arena-manager-v9-test/verify-player.html?token='||r.qr_token::text);
end $$;

create or replace function public.get_my_player_dashboard()
returns jsonb language plpgsql security definer set search_path=public as $$
declare r record;fx jsonb;tm jsonb;
begin
 select rr.*,t.name team_name,t.series,t.logo_url into r from roster_requests rr join teams t on t.id=rr.team_id
 where rr.user_id=auth.uid() or lower(rr.email)=lower(coalesce(auth.jwt()->>'email','')) order by rr.created_at desc limit 1;
 if r.id is null then return jsonb_build_object('player',null); end if;
 update roster_requests set user_id=auth.uid() where id=r.id and user_id is null;
 select coalesce(jsonb_agg(to_jsonb(f) order by f.scheduled_at),'[]'::jsonb) into fx from fixtures f where f.home_team_id=r.team_id or f.away_team_id=r.team_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name)),'[]'::jsonb) into tm from teams t;
 return jsonb_build_object('player',jsonb_build_object('id',r.id,'first_name',r.first_name,'last_name',r.last_name,'photo_url',r.photo_url,'fitp_ranking',r.fitp_ranking,'medical_certificate_expiry',r.medical_certificate_expiry,'status',r.status),'team',jsonb_build_object('id',r.team_id,'name',r.team_name,'series',r.series,'logo_url',r.logo_url),'fixtures',fx,'teams',tm);
end $$;

grant execute on function public.user_can_manage_team(uuid) to authenticated;
grant execute on function public.captain_update_team_notes(uuid,text) to authenticated;
grant execute on function public.captain_add_player_complete(uuid,jsonb) to authenticated;
grant execute on function public.issue_player_card(uuid) to authenticated;
grant execute on function public.get_my_player_card(uuid) to authenticated;
grant execute on function public.get_my_player_dashboard() to authenticated;
grant select on public.player_cards to authenticated;
commit;
notify pgrst,'reload schema';


-- V9.8.9 CAPTAIN / PLAYER COMMUNICATIONS FIX
begin;

create table if not exists public.team_messages(
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id) on delete cascade,
 sender_user_id uuid not null,
 sender_role text not null,
 sender_name text,
 body text not null,
 created_at timestamptz not null default now()
);

create table if not exists public.team_callups(
 id uuid primary key default gen_random_uuid(),
 fixture_id uuid,
 team_id uuid not null references public.teams(id) on delete cascade,
 created_by uuid not null,
 title text,
 message text,
 deadline timestamptz,
 created_at timestamptz not null default now()
);

create table if not exists public.team_callup_players(
 id uuid primary key default gen_random_uuid(),
 callup_id uuid not null references public.team_callups(id) on delete cascade,
 player_id uuid not null references public.roster_requests(id) on delete cascade,
 response text not null default 'pending' check(response in('pending','confirmed','unavailable')),
 response_note text,
 responded_at timestamptz,
 unique(callup_id,player_id)
);

drop function if exists public.captain_update_player_sport_data(uuid,uuid,text,date);
drop function if exists public.captain_appoint_secretary_v2(uuid,text);
drop function if exists public.captain_get_team_hub(uuid);
drop function if exists public.captain_send_team_message(uuid,text);
drop function if exists public.captain_create_callup(uuid,uuid,jsonb,text,timestamptz);
drop function if exists public.player_get_team_hub();
drop function if exists public.player_send_team_message(text);
drop function if exists public.player_respond_callup(uuid,text,text);

create function public.captain_update_player_sport_data(p_team_id uuid,p_player_id uuid,p_fitp text,p_medical_expiry date)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not exists(
  select 1 from public.team_user_roles tur where tur.team_id=p_team_id and tur.user_id=auth.uid() and tur.active=true and tur.role in('captain','secretary')
  union all
  select 1 from public.teams t join auth.users u on u.id=auth.uid() where t.id=p_team_id and lower(trim(t.captain_email))=lower(trim(u.email))
 ) then raise exception 'Non autorizzato.'; end if;
 update public.roster_requests set fitp_ranking=upper(trim(p_fitp)),medical_certificate_expiry=p_medical_expiry where id=p_player_id and team_id=p_team_id;
 return found;
end$$;

create function public.captain_appoint_secretary_v2(p_team_id uuid,p_email text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_current_email text;
begin
 select lower(trim(email)) into v_current_email from auth.users where id=auth.uid();
 if not exists(select 1 from public.teams where id=p_team_id and lower(trim(captain_email))=v_current_email)
 and not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role='captain')
 then raise exception 'Solo il capitano può nominare il segretario.';end if;
 if(select count(*) from public.team_user_roles where team_id=p_team_id and role='secretary' and active=true)>=3 then raise exception 'Massimo 3 segretari.';end if;
 select id into v_user from auth.users where lower(trim(email))=lower(trim(p_email)) limit 1;
 if v_user is null then raise exception 'Account non trovato con questa email.';end if;
 insert into public.team_user_roles(team_id,user_id,role,active) values(p_team_id,v_user,'secretary',true)
 on conflict(team_id,user_id,role) do update set active=true;
 insert into public.profiles(id,role) values(v_user,'secretary') on conflict(id) do update set role=case when profiles.role='admin' then profiles.role else 'secretary' end;
 return true;
end$$;

create function public.captain_get_team_hub(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_messages jsonb;v_callups jsonb;v_email text;
begin
 select lower(trim(email)) into v_email from auth.users where id=auth.uid();
 if not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role in('captain','secretary'))
 and not exists(select 1 from public.teams where id=p_team_id and lower(trim(captain_email))=v_email)
 then raise exception 'Non autorizzato.';end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]'::jsonb) into v_messages from public.team_messages m where m.team_id=p_team_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'fixture_id',c.fixture_id,'title',c.title,'message',c.message,'deadline',c.deadline,'created_at',c.created_at,'players',
   (select coalesce(jsonb_agg(jsonb_build_object('player_id',cp.player_id,'player_name',concat(r.first_name,' ',r.last_name),'response',cp.response,'response_note',cp.response_note)),'[]'::jsonb)
    from public.team_callup_players cp join public.roster_requests r on r.id=cp.player_id where cp.callup_id=c.id)
 ) order by c.created_at desc),'[]'::jsonb) into v_callups from public.team_callups c where c.team_id=p_team_id;
 return jsonb_build_object('current_user_id',auth.uid(),'messages',v_messages,'callups',v_callups);
end$$;

create function public.captain_send_team_message(p_team_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid:=gen_random_uuid();v_name text;v_email text;
begin
 select lower(trim(email)) into v_email from auth.users where id=auth.uid();
 if not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role in('captain','secretary'))
 and not exists(select 1 from public.teams where id=p_team_id and lower(trim(captain_email))=v_email)
 then raise exception 'Non autorizzato.';end if;
 select captain_name into v_name from public.teams where id=p_team_id;
 insert into public.team_messages(id,team_id,sender_user_id,sender_role,sender_name,body) values(v_id,p_team_id,auth.uid(),'captain',coalesce(v_name,'Capitano'),trim(p_body));
 return v_id;
end$$;

create function public.captain_create_callup(p_team_id uuid,p_fixture_id uuid,p_player_ids jsonb,p_message text,p_deadline timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid:=gen_random_uuid();i jsonb;v_email text;
begin
 select lower(trim(email)) into v_email from auth.users where id=auth.uid();
 if not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role in('captain','secretary'))
 and not exists(select 1 from public.teams where id=p_team_id and lower(trim(captain_email))=v_email)
 then raise exception 'Non autorizzato.';end if;
 insert into public.team_callups(id,fixture_id,team_id,created_by,title,message,deadline) values(v_id,p_fixture_id,p_team_id,auth.uid(),'Convocazione partita',p_message,p_deadline);
 for i in select * from jsonb_array_elements(coalesce(p_player_ids,'[]'::jsonb)) loop
  insert into public.team_callup_players(callup_id,player_id) values(v_id,(i#>>'{}')::uuid);
 end loop;
 return v_id;
end$$;

create function public.player_get_team_hub()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player_id uuid;v_team_id uuid;v_email text;v_messages jsonb;v_callups jsonb;
begin
 select lower(trim(email)) into v_email from auth.users where id=auth.uid();
 select id,team_id into v_player_id,v_team_id from public.roster_requests where (user_id=auth.uid() or lower(trim(email))=v_email) and status='approved' order by created_at desc limit 1;
 if v_player_id is null then raise exception 'Profilo giocatore non collegato.';end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]'::jsonb) into v_messages from public.team_messages m where m.team_id=v_team_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'fixture_id',c.fixture_id,'title',c.title,'message',c.message,'deadline',c.deadline,'created_at',c.created_at,'response',cp.response,'response_note',cp.response_note) order by c.created_at desc),'[]'::jsonb)
 into v_callups from public.team_callups c join public.team_callup_players cp on cp.callup_id=c.id where cp.player_id=v_player_id;
 return jsonb_build_object('current_user_id',auth.uid(),'player_id',v_player_id,'team_id',v_team_id,'messages',v_messages,'callups',v_callups);
end$$;

create function public.player_send_team_message(p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_player public.roster_requests%rowtype;v_email text;v_id uuid:=gen_random_uuid();
begin
 select lower(trim(email)) into v_email from auth.users where id=auth.uid();
 select * into v_player from public.roster_requests where (user_id=auth.uid() or lower(trim(email))=v_email) and status='approved' order by created_at desc limit 1;
 if v_player.id is null then raise exception 'Profilo giocatore non collegato.';end if;
 insert into public.team_messages(id,team_id,sender_user_id,sender_role,sender_name,body) values(v_id,v_player.team_id,auth.uid(),'player',concat(v_player.first_name,' ',v_player.last_name),trim(p_body));
 return v_id;
end$$;

create function public.player_respond_callup(p_callup_id uuid,p_response text,p_note text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_player_id uuid;v_email text;
begin
 if p_response not in('confirmed','unavailable') then raise exception 'Risposta non valida.';end if;
 select lower(trim(email)) into v_email from auth.users where id=auth.uid();
 select id into v_player_id from public.roster_requests where (user_id=auth.uid() or lower(trim(email))=v_email) and status='approved' order by created_at desc limit 1;
 update public.team_callup_players set response=p_response,response_note=p_note,responded_at=now() where callup_id=p_callup_id and player_id=v_player_id;
 return found;
end$$;

grant execute on function public.captain_update_player_sport_data(uuid,uuid,text,date) to authenticated;
grant execute on function public.captain_appoint_secretary_v2(uuid,text) to authenticated;
grant execute on function public.captain_get_team_hub(uuid) to authenticated;
grant execute on function public.captain_send_team_message(uuid,text) to authenticated;
grant execute on function public.captain_create_callup(uuid,uuid,jsonb,text,timestamptz) to authenticated;
grant execute on function public.player_get_team_hub() to authenticated;
grant execute on function public.player_send_team_message(text) to authenticated;
grant execute on function public.player_respond_callup(uuid,text,text) to authenticated;

commit;
