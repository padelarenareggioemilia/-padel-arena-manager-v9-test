-- RIFINITURA V9 - PLAYER ENGINE 1.0
begin;

alter table public.roster_requests
  add column if not exists user_id uuid references auth.users(id) on delete set null;

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

create or replace function public.player_email_is_approved(p_email text)
returns boolean
language sql
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.roster_requests r
    where lower(trim(r.email))=lower(trim(p_email))
      and r.status='approved'
  );
$$;

create or replace function public.claim_my_approved_player()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_user uuid := auth.uid();
  v_player public.roster_requests%rowtype;
begin
  if v_user is null or v_email='' then
    raise exception 'Sessione non valida';
  end if;

  select * into v_player
  from public.roster_requests
  where lower(trim(email))=v_email
    and status='approved'
  order by created_at desc
  limit 1;

  if v_player.id is null then
    return jsonb_build_object('success',false,'message','Nessun giocatore approvato trovato con questa email');
  end if;

  update public.roster_requests
  set user_id=v_user,updated_at=now()
  where id=v_player.id and (user_id is null or user_id=v_user);

  insert into public.team_user_roles(user_id,team_id,role,active)
  values(v_user,v_player.team_id,'player',true)
  on conflict do nothing;

  return jsonb_build_object('success',true,'player_id',v_player.id,'team_id',v_player.team_id);
end;
$$;

create or replace function public.resolve_my_portal()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role record;
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_team uuid;
begin
  if public.is_admin() then
    return jsonb_build_object('destination','index.html');
  end if;

  select * into v_role
  from public.team_user_roles
  where user_id=auth.uid() and active=true
  order by case role when 'captain' then 1 when 'secretary' then 2 when 'player' then 3 else 9 end
  limit 1;

  if v_role.role in ('captain','secretary') then
    return jsonb_build_object('destination','captain.html?team='||v_role.team_id::text);
  end if;

  if v_role.role='player' then
    return jsonb_build_object('destination','player-dashboard.html?team='||v_role.team_id::text);
  end if;

  select team_id into v_team
  from public.roster_requests
  where lower(trim(email))=v_email and status='approved'
  order by created_at desc limit 1;

  if v_team is not null then
    perform public.claim_my_approved_player();
    return jsonb_build_object('destination','player-dashboard.html?team='||v_team::text);
  end if;

  return jsonb_build_object('destination','public.html');
end;
$$;

create or replace function public.issue_player_card(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.roster_requests%rowtype;
  n text;
begin
  select * into r from public.roster_requests where id=p_player_id;
  if r.id is null then raise exception 'Giocatore non trovato'; end if;

  if not public.is_admin()
     and r.user_id<>auth.uid()
     and lower(r.email)<>lower(coalesce(auth.jwt()->>'email',''))
     and not exists(
       select 1 from public.team_user_roles tr
       where tr.user_id=auth.uid() and tr.team_id=r.team_id and tr.active and tr.role in('captain','secretary')
     )
  then raise exception 'Non autorizzato'; end if;

  n:='AICS-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(r.id::text,'-',''),1,10));

  insert into public.player_cards(player_id,card_number,status)
  values(r.id,n,case when r.medical_certificate_expiry<current_date then 'expired' else 'active' end)
  on conflict(player_id) do update set
    status=case when r.medical_certificate_expiry<current_date then 'expired' else 'active' end,
    updated_at=now();

  return jsonb_build_object('success',true);
end;
$$;

create or replace function public.get_my_player_portal()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
  fx jsonb;
  roster jsonb;
  teams_json jsonb;
begin
  perform public.claim_my_approved_player();

  select rr.*,t.name team_name,t.club_name,t.series,t.logo_url team_logo_url
  into r
  from public.roster_requests rr
  join public.teams t on t.id=rr.team_id
  where rr.user_id=auth.uid()
  order by rr.created_at desc
  limit 1;

  if r.id is null then return jsonb_build_object('player',null); end if;

  select coalesce(jsonb_agg(to_jsonb(f) order by f.scheduled_at),'[]'::jsonb)
  into fx
  from public.fixtures f
  where f.home_team_id=r.team_id or f.away_team_id=r.team_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',rr.id,'first_name',rr.first_name,'last_name',rr.last_name,
    'photo_url',rr.photo_url,'fitp_ranking',rr.fitp_ranking
  ) order by rr.last_name,rr.first_name),'[]'::jsonb)
  into roster
  from public.roster_requests rr
  where rr.team_id=r.team_id and rr.status='approved';

  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name)),'[]'::jsonb)
  into teams_json from public.teams t;

  return jsonb_build_object(
    'player',jsonb_build_object(
      'id',r.id,'first_name',r.first_name,'last_name',r.last_name,'email',r.email,
      'photo_url',r.photo_url,'fitp_ranking',r.fitp_ranking,
      'medical_certificate_expiry',r.medical_certificate_expiry
    ),
    'team',jsonb_build_object(
      'id',r.team_id,'name',r.team_name,'club_name',r.club_name,
      'series',r.series,'logo_url',r.team_logo_url
    ),
    'fixtures',fx,'roster',roster,'teams',teams_json
  );
end;
$$;

create or replace function public.get_my_player_card(p_player_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
begin
  perform public.claim_my_approved_player();

  select rr.*,pc.card_number,pc.qr_token,pc.status card_status,
         t.name team_name,t.series,t.logo_url team_logo_url
  into r
  from public.roster_requests rr
  join public.teams t on t.id=rr.team_id
  left join public.player_cards pc on pc.player_id=rr.id
  where (p_player_id is null or rr.id=p_player_id)
    and (
      rr.user_id=auth.uid()
      or public.is_admin()
      or exists(
        select 1 from public.team_user_roles tr
        where tr.user_id=auth.uid() and tr.team_id=rr.team_id and tr.active and tr.role in('captain','secretary')
      )
    )
  order by rr.created_at desc
  limit 1;

  if r.id is null then return null; end if;
  if r.card_number is null then
    perform public.issue_player_card(r.id);
    select rr.*,pc.card_number,pc.qr_token,pc.status card_status,
           t.name team_name,t.series,t.logo_url team_logo_url
    into r
    from public.roster_requests rr
    join public.teams t on t.id=rr.team_id
    join public.player_cards pc on pc.player_id=rr.id
    where rr.id=r.id;
  end if;

  return jsonb_build_object(
    'player_id',r.id,'first_name',r.first_name,'last_name',r.last_name,
    'photo_url',r.photo_url,'team_name',r.team_name,'team_logo_url',r.team_logo_url,
    'series',r.series,'fitp_ranking',r.fitp_ranking,
    'medical_certificate_expiry',r.medical_certificate_expiry,
    'card_number',r.card_number,'card_status',
    case when r.medical_certificate_expiry<current_date then 'expired' else r.card_status end,
    'verify_url','https://padelarenareggioemilia.github.io/-padel-arena-manager-v9-test/verify-player.html?token='||r.qr_token::text
  );
end;
$$;

create or replace function public.verify_player_card(p_token text)
returns jsonb
language sql
security definer
set search_path=public
as $$
select jsonb_build_object(
  'first_name',rr.first_name,'last_name',rr.last_name,'photo_url',rr.photo_url,
  'team_name',t.name,'team_logo_url',t.logo_url,'series',t.series,
  'card_number',pc.card_number,'card_status',
  case when rr.medical_certificate_expiry<current_date then 'expired' else pc.status end,
  'medical_valid',rr.medical_certificate_expiry>=current_date
)
from public.player_cards pc
join public.roster_requests rr on rr.id=pc.player_id
join public.teams t on t.id=rr.team_id
where pc.qr_token::text=p_token
limit 1;
$$;

grant execute on function public.player_email_is_approved(text) to anon,authenticated;
grant execute on function public.claim_my_approved_player() to authenticated;
grant execute on function public.resolve_my_portal() to authenticated;
grant execute on function public.issue_player_card(uuid) to authenticated;
grant execute on function public.get_my_player_portal() to authenticated;
grant execute on function public.get_my_player_card(uuid) to authenticated;
grant execute on function public.verify_player_card(text) to anon,authenticated;

commit;
notify pgrst,'reload schema';
