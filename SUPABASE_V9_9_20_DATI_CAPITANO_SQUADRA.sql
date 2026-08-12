-- V9.9.20 - Dati del capitano modificabili dalla propria Area Capitano
-- Eseguire nel SQL Editor dopo la V9.9.19.

create or replace function public.captain_get_own_team_edit_state(p_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_captain_of_team(p_team_id) then
    raise exception 'Non sei il capitano di questa squadra';
  end if;

  select jsonb_build_object(
    'captain_team_edit_enabled', t.captain_team_edit_enabled,
    'captain_name', t.captain_name,
    'captain_email', t.captain_email,
    'captain_phone', t.captain_phone,
    'series', t.series,
    'logo_url', t.logo_url
  )
  into result
  from public.teams t
  where t.id = p_team_id;

  if result is null then
    raise exception 'Squadra non trovata';
  end if;

  return result;
end;
$$;

revoke all on function public.captain_get_own_team_edit_state(uuid) from public;
grant execute on function public.captain_get_own_team_edit_state(uuid) to authenticated;

drop function if exists public.captain_update_own_team_profile_v2(uuid, text, text, text, text, text);
create function public.captain_update_own_team_profile_v2(
  p_team_id uuid,
  p_captain_name text,
  p_captain_email text,
  p_captain_phone text,
  p_series text,
  p_logo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_captain_of_team(p_team_id) then
    raise exception 'Non sei il capitano di questa squadra';
  end if;

  if not exists (
    select 1 from public.teams
    where id = p_team_id
      and captain_team_edit_enabled is true
  ) then
    raise exception 'La modifica squadra è stata disabilitata dall''amministratore';
  end if;

  if nullif(trim(p_captain_name), '') is null then
    raise exception 'Nome del capitano obbligatorio';
  end if;

  if nullif(trim(p_captain_email), '') is null
     or trim(p_captain_email) !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Email del capitano non valida';
  end if;

  if p_series not in ('Serie A', 'Serie B', 'Serie C') then
    raise exception 'Serie non valida';
  end if;

  update public.teams
  set captain_name = trim(p_captain_name),
      captain_email = lower(trim(p_captain_email)),
      captain_phone = nullif(trim(p_captain_phone), ''),
      series = p_series,
      logo_url = coalesce(nullif(trim(p_logo_url), ''), logo_url),
      updated_at = now()
  where id = p_team_id
  returning jsonb_build_object(
    'captain_name', captain_name,
    'captain_email', captain_email,
    'captain_phone', captain_phone,
    'series', series,
    'logo_url', logo_url
  ) into result;

  return result;
end;
$$;

revoke all on function public.captain_update_own_team_profile_v2(uuid, text, text, text, text, text) from public;
grant execute on function public.captain_update_own_team_profile_v2(uuid, text, text, text, text, text) to authenticated;
