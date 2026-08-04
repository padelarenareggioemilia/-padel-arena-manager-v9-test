-- AICS PADEL CHAMPIONSHIP V9.8.1
begin;

alter table public.roster_requests
  add column if not exists residence_postal_code text;

create or replace function public.player_profile_is_complete(r public.roster_requests)
returns boolean language sql stable as $$
select
  nullif(trim(r.photo_url),'') is not null
  and nullif(trim(r.first_name),'') is not null
  and nullif(trim(r.last_name),'') is not null
  and r.birth_date is not null
  and nullif(trim(r.birth_place),'') is not null
  and nullif(trim(r.residence_town),'') is not null
  and r.residence_postal_code ~ '^[0-9]{5}$'
  and nullif(trim(r.residence_province),'') is not null
  and nullif(trim(r.phone),'') is not null
  and nullif(trim(r.email),'') is not null
  and r.medical_certificate_expiry is not null
  and nullif(trim(r.fitp_ranking),'') is not null;
$$;

create or replace function public.enforce_complete_player_profile()
returns trigger language plpgsql as $$
begin
  new.residence_province:=upper(trim(new.residence_province));
  new.residence_postal_code:=trim(new.residence_postal_code);
  new.fitp_ranking:=upper(trim(new.fitp_ranking));
  new.email:=lower(trim(new.email));
  if new.status='approved' and not public.player_profile_is_complete(new) then
    raise exception 'Profilo giocatore incompleto: tutti i dati e la foto tessera sono obbligatori';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_complete_player_profile on public.roster_requests;
create trigger trg_enforce_complete_player_profile
before insert or update on public.roster_requests
for each row execute function public.enforce_complete_player_profile();

create or replace view public.player_profile_status as
select r.id,r.team_id,
 public.player_profile_is_complete(r) as profile_complete,
 (r.medical_certificate_expiry<current_date) as medical_expired,
 (r.medical_certificate_expiry between current_date and current_date+30) as medical_expiring
from public.roster_requests r;

grant select on public.player_profile_status to authenticated;
grant execute on function public.player_profile_is_complete(public.roster_requests) to authenticated;

commit;
notify pgrst,'reload schema';
