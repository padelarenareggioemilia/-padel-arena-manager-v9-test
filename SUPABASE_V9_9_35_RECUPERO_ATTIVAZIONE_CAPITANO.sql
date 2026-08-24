-- V9.9.35 - Recupero email di conferma/attivazione Capitano
-- ESEGUIRE UNA SOLA VOLTA nel SQL Editor di Supabase.

begin;

drop function if exists public.captain_activation_recovery(text);

create function public.captain_activation_recovery(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email,'')));
  v_result jsonb;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Inserisci un indirizzo email valido';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'team_id', t.id,
        'team_name', t.name,
        'captain_name', t.captain_name,
        'captain_email', lower(trim(t.captain_email)),
        'logo_url', t.logo_url,
        'invite_token', t.captain_invite_token::text
      )
      order by t.name
    ),
    '[]'::jsonb
  )
  into v_result
  from public.teams t
  where lower(trim(t.captain_email)) = v_email
    and nullif(trim(t.captain_invite_token::text),'') is not null;

  return jsonb_build_object(
    'ok', true,
    'email', v_email,
    'teams', v_result
  );
end;
$$;

revoke all on function public.captain_activation_recovery(text) from public;
grant execute on function public.captain_activation_recovery(text) to anon, authenticated;

commit;
notify pgrst, 'reload schema';
