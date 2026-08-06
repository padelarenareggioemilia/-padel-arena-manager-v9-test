begin;

create table if not exists public.team_messages(
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 sender_user_id uuid not null, sender_role text not null, sender_name text, body text not null,
 created_at timestamptz not null default now());
create table if not exists public.team_callups(
 id uuid primary key default gen_random_uuid(), fixture_id uuid, team_id uuid not null references public.teams(id) on delete cascade,
 created_by uuid not null, title text, message text, deadline timestamptz, created_at timestamptz not null default now());
create table if not exists public.team_callup_players(
 id uuid primary key default gen_random_uuid(), callup_id uuid not null references public.team_callups(id) on delete cascade,
 player_id uuid not null references public.roster_requests(id) on delete cascade,
 response text not null default 'pending', response_note text, responded_at timestamptz);
create unique index if not exists uq_team_role_user_v9 on public.team_user_roles(team_id,user_id,role);
create unique index if not exists uq_callup_player_v9 on public.team_callup_players(callup_id,player_id);

drop function if exists public.captain_appoint_secretary_v2(uuid,text);
drop function if exists public.captain_revoke_secretary(uuid,uuid);
drop function if exists public.captain_get_team_hub(uuid);
drop function if exists public.captain_send_team_message(uuid,text);
drop function if exists public.captain_create_callup(uuid,uuid,jsonb,text,timestamptz);
drop function if exists public.player_get_team_hub();
drop function if exists public.player_send_team_message(text);
drop function if exists public.player_respond_callup(uuid,text,text);

create function public.captain_appoint_secretary_v2(p_team_id uuid,p_email text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_email text;
begin
 select lower(trim(email)) into v_email from auth.users where id=auth.uid();
 if not exists(select 1 from public.teams where id=p_team_id and lower(trim(captain_email))=v_email)
 and not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role='captain')
 then raise exception 'Solo il capitano può nominare il segretario.';end if;
 if (select count(*) from public.team_user_roles where team_id=p_team_id and role='secretary' and active=true)>=3
 then raise exception 'Puoi nominare al massimo 3 segretari.';end if;
 select id into v_user from auth.users where lower(trim(email))=lower(trim(p_email)) limit 1;
 if v_user is null then raise exception 'Nessun account trovato con questa email.';end if;
 insert into public.team_user_roles(team_id,user_id,role,active) values(p_team_id,v_user,'secretary',true)
 on conflict(team_id,user_id,role) do update set active=true;
 return true;
end$$;

create function public.captain_revoke_secretary(p_team_id uuid,p_role_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_email text;
begin
 select lower(trim(email)) into v_email from auth.users where id=auth.uid();
 if not exists(select 1 from public.teams where id=p_team_id and lower(trim(captain_email))=v_email)
 and not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role='captain')
 then raise exception 'Solo il capitano può revocare il segretario.';end if;
 update public.team_user_roles set active=false where id=p_role_id and team_id=p_team_id and role='secretary';
 return found;
end$$;

create function public.captain_get_team_hub(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare vm jsonb;vc jsonb;ve text;
begin
 select lower(trim(email)) into ve from auth.users where id=auth.uid();
 if not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role in('captain','secretary'))
 and not exists(select 1 from public.teams where id=p_team_id and lower(trim(captain_email))=ve)
 then raise exception 'Account non autorizzato per questa squadra.';end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]'::jsonb) into vm from public.team_messages m where m.team_id=p_team_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'fixture_id',c.fixture_id,'title',c.title,'message',c.message,'deadline',c.deadline,'created_at',c.created_at,'players',(select coalesce(jsonb_agg(jsonb_build_object('player_id',cp.player_id,'player_name',concat(r.first_name,' ',r.last_name),'response',cp.response,'response_note',cp.response_note)),'[]'::jsonb) from public.team_callup_players cp join public.roster_requests r on r.id=cp.player_id where cp.callup_id=c.id)) order by c.created_at desc),'[]'::jsonb) into vc from public.team_callups c where c.team_id=p_team_id;
 return jsonb_build_object('current_user_id',auth.uid(),'messages',vm,'callups',vc);
end$$;

create function public.captain_send_team_message(p_team_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare vi uuid:=gen_random_uuid();vn text;ve text;
begin
 if nullif(trim(p_body),'') is null then raise exception 'Il messaggio è vuoto.';end if;
 select lower(trim(email)) into ve from auth.users where id=auth.uid();
 if not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role in('captain','secretary'))
 and not exists(select 1 from public.teams where id=p_team_id and lower(trim(captain_email))=ve)
 then raise exception 'Account non autorizzato.';end if;
 select captain_name into vn from public.teams where id=p_team_id;
 insert into public.team_messages(id,team_id,sender_user_id,sender_role,sender_name,body) values(vi,p_team_id,auth.uid(),'captain',coalesce(vn,'Capitano'),trim(p_body));
 return vi;
end$$;

create function public.captain_create_callup(p_team_id uuid,p_fixture_id uuid,p_player_ids jsonb,p_message text,p_deadline timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare vi uuid:=gen_random_uuid();vp jsonb;ve text;
begin
 select lower(trim(email)) into ve from auth.users where id=auth.uid();
 if not exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=auth.uid() and active=true and role in('captain','secretary'))
 and not exists(select 1 from public.teams where id=p_team_id and lower(trim(captain_email))=ve)
 then raise exception 'Account non autorizzato.';end if;
 insert into public.team_callups(id,fixture_id,team_id,created_by,title,message,deadline) values(vi,p_fixture_id,p_team_id,auth.uid(),'Convocazione partita',nullif(trim(p_message),''),p_deadline);
 for vp in select * from jsonb_array_elements(coalesce(p_player_ids,'[]'::jsonb)) loop
  insert into public.team_callup_players(callup_id,player_id) values(vi,(vp#>>'{}')::uuid) on conflict(callup_id,player_id) do nothing;
 end loop;
 return vi;
end$$;

create function public.player_get_team_hub()
returns jsonb language plpgsql security definer set search_path=public as $$
declare vpid uuid;vtid uuid;ve text;vm jsonb;vc jsonb;
begin
 select lower(trim(email)) into ve from auth.users where id=auth.uid();
 select id,team_id into vpid,vtid from public.roster_requests where (user_id=auth.uid() or lower(trim(email))=ve) and status='approved' order by created_at desc limit 1;
 if vpid is null then raise exception 'Profilo giocatore non collegato.';end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]'::jsonb) into vm from public.team_messages m where m.team_id=vtid;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'fixture_id',c.fixture_id,'title',c.title,'message',c.message,'deadline',c.deadline,'created_at',c.created_at,'response',cp.response,'response_note',cp.response_note) order by c.created_at desc),'[]'::jsonb) into vc from public.team_callups c join public.team_callup_players cp on cp.callup_id=c.id where cp.player_id=vpid;
 return jsonb_build_object('current_user_id',auth.uid(),'player_id',vpid,'team_id',vtid,'messages',vm,'callups',vc);
end$$;

create function public.player_send_team_message(p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare vr public.roster_requests%rowtype;ve text;vi uuid:=gen_random_uuid();
begin
 if nullif(trim(p_body),'') is null then raise exception 'Il messaggio è vuoto.';end if;
 select lower(trim(email)) into ve from auth.users where id=auth.uid();
 select * into vr from public.roster_requests where (user_id=auth.uid() or lower(trim(email))=ve) and status='approved' order by created_at desc limit 1;
 if vr.id is null then raise exception 'Profilo giocatore non collegato.';end if;
 insert into public.team_messages(id,team_id,sender_user_id,sender_role,sender_name,body) values(vi,vr.team_id,auth.uid(),'player',concat(vr.first_name,' ',vr.last_name),trim(p_body));
 return vi;
end$$;

create function public.player_respond_callup(p_callup_id uuid,p_response text,p_note text)
returns boolean language plpgsql security definer set search_path=public as $$
declare vpid uuid;ve text;
begin
 if p_response not in('confirmed','unavailable') then raise exception 'Risposta non valida.';end if;
 select lower(trim(email)) into ve from auth.users where id=auth.uid();
 select id into vpid from public.roster_requests where (user_id=auth.uid() or lower(trim(email))=ve) and status='approved' order by created_at desc limit 1;
 update public.team_callup_players set response=p_response,response_note=nullif(trim(p_note),''),responded_at=now() where callup_id=p_callup_id and player_id=vpid;
 return found;
end$$;

grant execute on function public.captain_appoint_secretary_v2(uuid,text) to authenticated;
grant execute on function public.captain_revoke_secretary(uuid,uuid) to authenticated;
grant execute on function public.captain_get_team_hub(uuid) to authenticated;
grant execute on function public.captain_send_team_message(uuid,text) to authenticated;
grant execute on function public.captain_create_callup(uuid,uuid,jsonb,text,timestamptz) to authenticated;
grant execute on function public.player_get_team_hub() to authenticated;
grant execute on function public.player_send_team_message(text) to authenticated;
grant execute on function public.player_respond_callup(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
