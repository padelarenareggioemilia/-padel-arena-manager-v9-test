-- V9.9.19 - Modifica controllata della squadra da parte del capitano
-- Eseguire una sola volta nel SQL Editor di Supabase.

alter table public.teams
  add column if not exists captain_team_edit_enabled boolean not null default true;

comment on column public.teams.captain_team_edit_enabled is
  'Se true, il capitano può modificare logo, telefono e serie della propria squadra.';

create or replace function public.is_captain_of_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_user_roles tur
    where tur.team_id = p_team_id
      and tur.user_id = auth.uid()
      and tur.active is true
      and lower(tur.role) = 'captain'
  )
  or exists (
    select 1
    from public.teams t
    join auth.users u on u.id = auth.uid()
    where t.id = p_team_id
      and lower(trim(coalesce(t.captain_email, ''))) = lower(trim(coalesce(u.email, '')))
      and trim(coalesce(t.captain_email, '')) <> ''
  );
$$;

revoke all on function public.is_captain_of_team(uuid) from public;
grant execute on function public.is_captain_of_team(uuid) to authenticated;

drop function if exists public.admin_set_captain_team_edit(uuid, boolean);
create function public.admin_set_captain_team_edit(
  p_team_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Operazione consentita solo all''amministratore';
  end if;

  update public.teams
  set captain_team_edit_enabled = coalesce(p_enabled, false),
      updated_at = now()
  where id = p_team_id;

  if not found then
    raise exception 'Squadra non trovata';
  end if;

  return true;
end;
$$;

revoke all on function public.admin_set_captain_team_edit(uuid, boolean) from public;
grant execute on function public.admin_set_captain_team_edit(uuid, boolean) to authenticated;

drop function if exists public.captain_get_own_team_edit_state(uuid);
create function public.captain_get_own_team_edit_state(p_team_id uuid)
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

drop function if exists public.captain_update_own_team_profile(uuid, text, text, text);
create function public.captain_update_own_team_profile(
  p_team_id uuid,
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

  if p_series not in ('Serie A', 'Serie B', 'Serie C') then
    raise exception 'Serie non valida';
  end if;

  update public.teams
  set captain_phone = nullif(trim(p_captain_phone), ''),
      series = p_series,
      logo_url = coalesce(nullif(trim(p_logo_url), ''), logo_url),
      updated_at = now()
  where id = p_team_id
  returning jsonb_build_object(
    'captain_phone', captain_phone,
    'series', series,
    'logo_url', logo_url
  ) into result;

  return result;
end;
$$;

revoke all on function public.captain_update_own_team_profile(uuid, text, text, text) from public;
grant execute on function public.captain_update_own_team_profile(uuid, text, text, text) to authenticated;

-- Il capitano può caricare un nuovo logo soltanto nella cartella della propria
-- squadra e soltanto quando l'amministratore ha abilitato le modifiche.
drop policy if exists team_logos_captain_edit_insert on storage.objects;
create policy team_logos_captain_edit_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'team-logos'
  and split_part(name, '/', 1) = 'teams'
  and exists (
    select 1
    from public.teams t
    where t.id::text = split_part(name, '/', 2)
      and t.captain_team_edit_enabled is true
      and public.is_captain_of_team(t.id)
  )
);

-- Nessuna policy DELETE viene concessa ai capitani: non possono cancellare
-- né la squadra né i loghi già caricati.
