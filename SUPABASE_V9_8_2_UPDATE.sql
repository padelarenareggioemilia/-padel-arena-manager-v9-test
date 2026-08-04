-- AICS PADEL CHAMPIONSHIP V9.8.2
begin;

alter table public.roster_requests
  add column if not exists admin_approved boolean not null default false,
  add column if not exists captain_approved boolean not null default false;

create table if not exists public.player_cards(
  id uuid primary key default gen_random_uuid(),
  player_id uuid unique not null references public.roster_requests(id) on delete cascade,
  card_number text unique not null,
  qr_token uuid unique not null default gen_random_uuid(),
  status text not null default 'active' check(status in ('active','suspended','expired')),
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_card_checks(
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  player_id uuid not null references public.roster_requests(id) on delete cascade,
  checked_by uuid not null references auth.users(id),
  valid boolean not null,
  reason text,
  checked_at timestamptz not null default now()
);

alter table public.player_cards enable row level security;
alter table public.player_card_checks enable row level security;

create or replace function public.issue_player_card_if_ready()
returns trigger language plpgsql security definer set search_path=public as $$
declare n text;
begin
  if new.status='approved' and new.admin_approved and new.captain_approved then
    n:='AICS-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(new.id::text,'-',''),1,10));
    insert into public.player_cards(player_id,card_number,status)
    values(new.id,n,case when new.medical_certificate_expiry<current_date then 'expired' else 'active' end)
    on conflict(player_id) do update set
      status=case when new.medical_certificate_expiry<current_date then 'expired' else 'active' end,
      updated_at=now();
  end if;
  return new;
end;$$;

drop trigger if exists trg_issue_player_card on public.roster_requests;
create trigger trg_issue_player_card after insert or update on public.roster_requests
for each row execute function public.issue_player_card_if_ready();

create or replace function public.get_my_player_card(p_player_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r record;
begin
  select rr.*,pc.card_number,pc.qr_token,pc.status card_status,t.name team_name,t.series
  into r
  from roster_requests rr join player_cards pc on pc.player_id=rr.id join teams t on t.id=rr.team_id
  where rr.id=coalesce(p_player_id,rr.id)
    and (rr.user_id=auth.uid() or public.is_admin() or exists(
      select 1 from team_user_roles tur where tur.team_id=rr.team_id and tur.user_id=auth.uid() and tur.active and tur.role in('captain','secretary')
    ))
  order by rr.created_at desc limit 1;
  if r.id is null then return null; end if;
  return jsonb_build_object(
    'player_id',r.id,'first_name',r.first_name,'last_name',r.last_name,'photo_url',r.photo_url,
    'team_name',r.team_name,'series',r.series,'fitp_ranking',r.fitp_ranking,
    'medical_certificate_expiry',r.medical_certificate_expiry,'card_number',r.card_number,
    'card_status',case when r.medical_certificate_expiry<current_date then 'expired' else r.card_status end,
    'verify_url','https://padelarenareggioemilia.github.io/-padel-arena-manager-v9-test/verify-player.html?token='||r.qr_token::text
  );
end;$$;

create or replace function public.verify_player_card_for_fixture(p_fixture_id uuid,p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r record; ok boolean; why text;
begin
  select rr.*,pc.status card_status,t.name team_name,f.home_team_id,f.away_team_id
  into r
  from player_cards pc
  join roster_requests rr on rr.id=pc.player_id
  join teams t on t.id=rr.team_id
  join fixtures f on f.id=p_fixture_id
  where pc.qr_token::text=p_token;

  if r.id is null then
    raise exception 'Tessera non riconosciuta';
  end if;

  if not public.is_admin() and not exists(
    select 1 from team_user_roles tur
    where tur.user_id=auth.uid() and tur.active and tur.role in('captain','secretary')
      and tur.team_id in(r.home_team_id,r.away_team_id)
  ) then
    raise exception 'Non sei autorizzato a verificare questa partita';
  end if;

  ok:=true;why:='Giocatore presente nella distinta e tessera valida.';

  if r.card_status<>'active' then ok:=false;why:='Tessera sospesa o non attiva.'; end if;
  if r.medical_certificate_expiry<current_date then ok:=false;why:='Certificato medico scaduto.'; end if;
  if r.team_id not in(r.home_team_id,r.away_team_id) then ok:=false;why:='Il giocatore appartiene a una squadra diversa.'; end if;
  if not exists(
    select 1 from match_lineups ml
    where ml.fixture_id=p_fixture_id and ml.team_id=r.team_id
      and ml.lineup_data::text like '%'||r.id::text||'%'
  ) then ok:=false;why:='Il giocatore non è presente nella formazione della partita.'; end if;

  insert into player_card_checks(fixture_id,player_id,checked_by,valid,reason)
  values(p_fixture_id,r.id,auth.uid(),ok,why);

  return jsonb_build_object('valid',ok,'reason',why,'first_name',r.first_name,'last_name',r.last_name,'photo_url',r.photo_url,'team_name',r.team_name);
end;$$;

grant execute on function public.get_my_player_card(uuid) to authenticated;
grant execute on function public.verify_player_card_for_fixture(uuid,text) to authenticated;
grant select on public.player_cards to authenticated;
grant select on public.player_card_checks to authenticated;

commit;
notify pgrst,'reload schema';
