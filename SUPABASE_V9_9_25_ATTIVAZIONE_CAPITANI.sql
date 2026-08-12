-- V9.9.25 - Primo accesso e attivazione sicura dell'account Capitano
-- Eseguire nel SQL Editor di Supabase prima di inviare le nuove email.

drop function if exists public.captain_invite_details(text);
create function public.captain_invite_details(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if nullif(trim(p_token), '') is null then
    raise exception 'Codice di invito mancante';
  end if;

  select jsonb_build_object(
    'ok', true,
    'team_id', t.id,
    'team_name', t.name,
    'captain_name', t.captain_name,
    'captain_email', lower(trim(t.captain_email)),
    'logo_url', t.logo_url
  )
  into result
  from public.teams t
  where t.captain_invite_token::text = trim(p_token)
    and nullif(trim(t.captain_email), '') is not null
  limit 1;

  if result is null then
    raise exception 'Invito non valido oppure squadra priva dell''email del capitano';
  end if;

  return result;
end;
$$;

revoke all on function public.captain_invite_details(text) from public;
grant execute on function public.captain_invite_details(text) to anon, authenticated;

drop function if exists public.captain_claim_invite(text);
create function public.captain_claim_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_team_name text;
  v_expected_email text;
  v_user_email text;
  v_other_user uuid;
begin
  if auth.uid() is null then
    raise exception 'Devi prima creare l''account oppure accedere';
  end if;

  select t.id, t.name, lower(trim(t.captain_email))
  into v_team_id, v_team_name, v_expected_email
  from public.teams t
  where t.captain_invite_token::text = trim(p_token)
  limit 1;

  if v_team_id is null then
    raise exception 'Codice di invito non valido';
  end if;

  select lower(trim(u.email))
  into v_user_email
  from auth.users u
  where u.id = auth.uid();

  if v_user_email is null or v_expected_email is null
     or v_user_email <> v_expected_email then
    raise exception 'Devi utilizzare l''email del capitano indicata nell''invito';
  end if;

  select tur.user_id
  into v_other_user
  from public.team_user_roles tur
  where tur.team_id = v_team_id
    and lower(tur.role) = 'captain'
    and tur.active is true
    and tur.user_id <> auth.uid()
  limit 1;

  if v_other_user is not null then
    raise exception 'Questa squadra è già collegata a un altro account Capitano';
  end if;

  update public.team_user_roles
  set active = true,
      role = 'captain'
  where team_id = v_team_id
    and user_id = auth.uid()
    and lower(role) = 'captain';

  if not found then
    insert into public.team_user_roles(team_id, user_id, role, active)
    values(v_team_id, auth.uid(), 'captain', true);
  end if;

  return jsonb_build_object(
    'ok', true,
    'team_id', v_team_id,
    'team_name', v_team_name
  );
end;
$$;

revoke all on function public.captain_claim_invite(text) from public;
grant execute on function public.captain_claim_invite(text) to authenticated;

