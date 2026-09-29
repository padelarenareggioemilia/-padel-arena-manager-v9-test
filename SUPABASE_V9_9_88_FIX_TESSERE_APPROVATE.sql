-- V9.9.88 - Hotfix tessere digitali dei giocatori approvati
--
-- Corregge il flusso storico in cui alcuni giocatori con stato ufficiale
-- "approved" non ricevevano la tessera digitale perché mancavano uno o
-- entrambi i flag legacy captain_approved/admin_approved.

create or replace function public.issue_player_card_if_ready()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_card_number text;
begin
  if lower(trim(coalesce(new.status,''))) = 'approved' then
    v_card_number :=
      'AICS-' || to_char(current_date,'YYYY') || '-' ||
      upper(substr(replace(new.id::text,'-',''),1,10));

    insert into public.player_cards(player_id, card_number, status)
    values(
      new.id,
      v_card_number,
      case
        when new.medical_certificate_expiry is not null
         and new.medical_certificate_expiry >= current_date
        then 'active'
        else 'expired'
      end
    )
    on conflict(player_id) do update
      set status = excluded.status,
          updated_at = now();
  end if;

  return new;
end;
$function$;

revoke all on function public.issue_player_card_if_ready()
from public, anon, authenticated;

-- Recupero una tantum delle tessere mancanti per le rose già approvate.
insert into public.player_cards(player_id, card_number, status)
select
  rr.id,
  'AICS-' || to_char(current_date,'YYYY') || '-' ||
    upper(substr(replace(rr.id::text,'-',''),1,10)),
  case
    when rr.medical_certificate_expiry is not null
     and rr.medical_certificate_expiry >= current_date
    then 'active'
    else 'expired'
  end
from public.roster_requests rr
left join public.player_cards pc on pc.player_id = rr.id
where lower(trim(coalesce(rr.status,''))) = 'approved'
  and pc.player_id is null
on conflict(player_id) do nothing;
