-- V9.9.31 - Correzione circoscritta alla gestione Segretari
-- Non modifica calendari, rosa, partite, portale pubblico o accessi capitani.
begin;

create table if not exists public.team_secretary_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.team_secretary_invites enable row level security;

create or replace function public.captain_appoint_or_invite_secretary(p_team_id uuid,p_email text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_user_id uuid;
  v_role text;
  v_active_count integer;
  v_token uuid;
begin
  if not public.is_captain_of_team(p_team_id) then
    raise exception 'Solo il capitano può nominare un segretario.';
  end if;
  if v_email='' or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Inserisci un indirizzo email valido.';
  end if;
  select count(*) into v_active_count from public.team_user_roles
   where team_id=p_team_id and active=true and lower(role)='secretary';
  if v_active_count>=3 then raise exception 'Hai già raggiunto il limite massimo di 3 segretari.'; end if;

  select id into v_user_id from auth.users where lower(trim(email))=v_email limit 1;
  if v_user_id is not null then
    select lower(role) into v_role from public.team_user_roles
     where team_id=p_team_id and user_id=v_user_id limit 1;
    if v_role='captain' then raise exception 'Questa persona è già il capitano della squadra.'; end if;
    if v_role='secretary' and exists(select 1 from public.team_user_roles where team_id=p_team_id and user_id=v_user_id and active=true) then
      raise exception 'Questa persona è già un segretario attivo.';
    end if;
    update public.team_user_roles set role='secretary',active=true
     where team_id=p_team_id and user_id=v_user_id;
    if not found then
      insert into public.team_user_roles(team_id,user_id,role,active) values(p_team_id,v_user_id,'secretary',true);
    end if;
    update public.team_secretary_invites set active=false
     where team_id=p_team_id and email=v_email and active=true;
    return jsonb_build_object('status','appointed','message','Segretario nominato correttamente.');
  end if;

  update public.team_secretary_invites set active=false
   where team_id=p_team_id and email=v_email and active=true;
  insert into public.team_secretary_invites(team_id,email,created_by)
   values(p_team_id,v_email,auth.uid()) returning token into v_token;
  return jsonb_build_object('status','invite','token',v_token,'message','Account non ancora presente: invia il link personale.');
end$$;

create or replace function public.secretary_invite_details(p_token text)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('team_name',t.name,'logo_url',t.logo_url,'email',i.email)
  from public.team_secretary_invites i join public.teams t on t.id=i.team_id
  where i.token::text=trim(p_token) and i.active=true and i.claimed_at is null
  limit 1
$$;

create or replace function public.secretary_claim_invite(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inv public.team_secretary_invites%rowtype;v_email text;v_count integer;v_role text;
begin
  if auth.uid() is null then raise exception 'Devi prima creare l''account oppure accedere.'; end if;
  select * into v_inv from public.team_secretary_invites where token::text=trim(p_token) and active=true and claimed_at is null limit 1;
  if v_inv.id is null then raise exception 'Invito non valido o già utilizzato.'; end if;
  select lower(trim(email)) into v_email from auth.users where id=auth.uid();
  if v_email<>lower(trim(v_inv.email)) then raise exception 'Devi utilizzare l''email indicata nell''invito.'; end if;
  select count(*) into v_count from public.team_user_roles where team_id=v_inv.team_id and active=true and lower(role)='secretary';
  if v_count>=3 then raise exception 'La squadra ha già raggiunto il limite massimo di 3 segretari.'; end if;
  select lower(role) into v_role from public.team_user_roles where team_id=v_inv.team_id and user_id=auth.uid() limit 1;
  if v_role='captain' then raise exception 'Questo account è già il capitano della squadra.'; end if;
  update public.team_user_roles set role='secretary',active=true where team_id=v_inv.team_id and user_id=auth.uid();
  if not found then insert into public.team_user_roles(team_id,user_id,role,active) values(v_inv.team_id,auth.uid(),'secretary',true); end if;
  update public.team_secretary_invites set active=false,claimed_at=now() where id=v_inv.id;
  return jsonb_build_object('ok',true,'team_id',v_inv.team_id);
end$$;

revoke all on function public.captain_appoint_or_invite_secretary(uuid,text) from public;
revoke all on function public.secretary_invite_details(text) from public;
revoke all on function public.secretary_claim_invite(text) from public;
grant execute on function public.captain_appoint_or_invite_secretary(uuid,text) to authenticated;
grant execute on function public.secretary_invite_details(text) to anon,authenticated;
grant execute on function public.secretary_claim_invite(text) to authenticated;

-- Espone esclusivamente le modalità disponibili per l'account connesso.
create or replace function public.get_my_portal_modes()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'is_captain', exists(select 1 from public.team_user_roles r where r.user_id=auth.uid() and r.active=true and lower(r.role)='captain'),
    'is_secretary', exists(select 1 from public.team_user_roles r where r.user_id=auth.uid() and r.active=true and lower(r.role)='secretary'),
    'is_player', exists(select 1 from public.roster_requests p where p.user_id=auth.uid() and lower(coalesce(p.status,''))='approved')
  )
$$;
revoke all on function public.get_my_portal_modes() from public;
grant execute on function public.get_my_portal_modes() to authenticated;

-- Registro amministrativo dei trasferimenti giocatori.
create table if not exists public.player_transfer_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  player_name text not null default '',
  from_team_id uuid not null references public.teams(id),
  to_team_id uuid not null references public.teams(id),
  transferred_by uuid not null references auth.users(id),
  note text,
  transferred_at timestamptz not null default now()
);
alter table public.player_transfer_history enable row level security;
drop policy if exists player_transfer_history_admin_read on public.player_transfer_history;
create policy player_transfer_history_admin_read on public.player_transfer_history for select to authenticated using(public.is_admin());
grant select on public.player_transfer_history to authenticated;

create or replace function public.admin_transfer_player(p_player_id uuid,p_to_team_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_from_team_id uuid;v_player_name text;v_email text;v_from_name text;v_to_name text;
begin
  if not public.is_admin() then raise exception 'Operazione riservata all''amministratore.'; end if;
  select p.team_id,trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),lower(trim(coalesce(p.email,'')))
    into v_from_team_id,v_player_name,v_email from public.roster_requests p where p.id=p_player_id for update;
  if v_from_team_id is null then raise exception 'Giocatore non trovato.'; end if;
  if p_to_team_id is null or p_to_team_id=v_from_team_id then raise exception 'Seleziona una squadra di destinazione diversa.'; end if;
  if not exists(select 1 from public.teams where id=p_to_team_id) then raise exception 'Squadra di destinazione non trovata.'; end if;
  if v_email<>'' and exists(select 1 from public.roster_requests p where p.team_id=p_to_team_id and p.id<>p_player_id and lower(trim(coalesce(p.email,'')))=v_email) then
    raise exception 'Nella squadra di destinazione esiste già un giocatore con la stessa email.';
  end if;
  select name into v_from_name from public.teams where id=v_from_team_id;
  select name into v_to_name from public.teams where id=p_to_team_id;
  update public.roster_requests set team_id=p_to_team_id where id=p_player_id;
  insert into public.player_transfer_history(player_id,player_name,from_team_id,to_team_id,transferred_by,note)
    values(p_player_id,v_player_name,v_from_team_id,p_to_team_id,auth.uid(),nullif(trim(coalesce(p_note,'')),''));
  return jsonb_build_object('ok',true,'player_name',v_player_name,'from_team',v_from_name,'to_team',v_to_name);
end$$;
revoke all on function public.admin_transfer_player(uuid,uuid,text) from public;
grant execute on function public.admin_transfer_player(uuid,uuid,text) to authenticated;

commit;
notify pgrst,'reload schema';
