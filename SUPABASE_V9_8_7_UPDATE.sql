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
