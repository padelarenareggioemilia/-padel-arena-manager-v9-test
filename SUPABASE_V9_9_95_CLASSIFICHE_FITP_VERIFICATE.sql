-- AICS Padel Championship V9.9.95
-- Registra e protegge le classificazioni FITP ufficialmente verificate.

begin;

alter table public.roster_requests
  add column if not exists fitp_ranking_original text,
  add column if not exists fitp_verified boolean not null default false,
  add column if not exists fitp_official_band smallint,
  add column if not exists fitp_official_points numeric,
  add column if not exists fitp_ranking_source text,
  add column if not exists fitp_verification_note text,
  add column if not exists fitp_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='roster_requests_fitp_official_band_check'
      and conrelid='public.roster_requests'::regclass
  ) then
    alter table public.roster_requests
      add constraint roster_requests_fitp_official_band_check
      check (fitp_official_band is null or fitp_official_band between 1 and 5);
  end if;
end
$$;

create or replace function public.enforce_fitp_verified_lock()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_privileged boolean := coalesce(public.is_admin(),false)
    or (auth.uid() is null and current_user in ('postgres','supabase_admin','service_role'));
begin
  if tg_op='INSERT' then
    if coalesce(new.fitp_verified,false) and not v_privileged then
      raise exception 'La classificazione FITP ufficiale può essere convalidata soltanto dall’amministrazione.';
    end if;
    return new;
  end if;

  if not v_privileged and (
       new.fitp_verified is distinct from old.fitp_verified
    or new.fitp_official_band is distinct from old.fitp_official_band
    or new.fitp_official_points is distinct from old.fitp_official_points
    or new.fitp_ranking_source is distinct from old.fitp_ranking_source
    or new.fitp_verification_note is distinct from old.fitp_verification_note
    or new.fitp_verified_at is distinct from old.fitp_verified_at
    or (coalesce(old.fitp_verified,false) and new.fitp_ranking is distinct from old.fitp_ranking)
  ) then
    raise exception 'Classificazione FITP verificata e non modificabile. Contattare l’organizzazione.';
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_fitp_verified_lock on public.roster_requests;
create trigger trg_enforce_fitp_verified_lock
before insert or update of fitp_ranking,fitp_verified,fitp_official_band,
  fitp_official_points,fitp_ranking_source,fitp_verification_note,fitp_verified_at
on public.roster_requests
for each row execute function public.enforce_fitp_verified_lock();

-- Una classifica ufficiale non conforme deve poter essere registrata senza
-- cancellare il giocatore dalla rosa. I controlli di distinta stabiliscono
-- successivamente se il giocatore è schierabile nella serie assegnata.
create or replace function public.enforce_roster_regulation()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare v_series text; v_count integer;
begin
  if lower(coalesce(new.status,''))<>'approved' then return new; end if;
  if tg_op='UPDATE'
     and new.status is not distinct from old.status
     and new.team_id is not distinct from old.team_id
     and new.fitp_ranking is not distinct from old.fitp_ranking then
    return new;
  end if;
  select series into v_series from public.teams where id=new.team_id;
  if not coalesce(new.fitp_verified,false)
     and not public.player_is_eligible_for_series(v_series,new.fitp_ranking) then
    raise exception 'Classifica FITP non ammessa per %. Correggi la categoria o la classifica del giocatore.',coalesce(v_series,'la serie selezionata');
  end if;
  select count(*) into v_count
  from public.roster_requests r
  where r.team_id=new.team_id and lower(coalesce(r.status,''))='approved'
    and r.id<>new.id;
  if v_count>=20 then
    raise exception 'Rosa completa: massimo 20 giocatori. Utilizza la procedura di sostituzione prevista dal regolamento.';
  end if;
  return new;
end
$$;

create temporary table fitp_verified_updates(
  player_id uuid primary key,
  official_band smallint not null,
  official_points numeric,
  display_value text not null,
  candidates text not null
) on commit drop;

insert into fitp_verified_updates values
('016b871f-869f-441f-ad0c-c137cc116ec0',4,2.8,'4ª FASCIA - 2,8 PUNTI','fascia 4, 2.8 punti'),
('29125569-b882-4f4b-a1fb-6540f2b07f35',3,10,'3ª FASCIA - 10 PUNTI','fascia 3, 10 punti'),
('2edd9468-8c46-4b62-a88a-d11ffdddaf24',4,null,'4ª FASCIA - CON PUNTEGGIO','fascia 4, 1.2 punti | fascia 4, 12 punti'),
('49b3aabd-171b-4e04-b078-7311ac873de5',4,3.5,'4ª FASCIA - 3,5 PUNTI','fascia 4, 3.5 punti'),
('6c05fba1-bad5-48b4-b41f-867b70ed1607',4,5.8,'4ª FASCIA - 5,8 PUNTI','fascia 4, 5.8 punti'),
('6e550994-9fc0-4a34-af07-62d22c2c0ed4',4,1.5,'4ª FASCIA - 1,5 PUNTI','fascia 4, 1.5 punti'),
('739fc6b3-539a-4a01-bc97-c7b9f3c513e9',4,1.6,'4ª FASCIA - 1,6 PUNTI','fascia 4, 1.6 punti'),
('75b26c13-9a34-4f0b-9240-27f32aa04f85',4,1.3,'4ª FASCIA - 1,3 PUNTI','fascia 4, 1.3 punti'),
('7fd14d62-cb0a-4bd4-abf4-e9a82ed01095',4,5.2,'4ª FASCIA - 5,2 PUNTI','fascia 4, 5.2 punti'),
('8fced6fc-e946-4be5-945c-c07fcee5f273',4,12.2,'4ª FASCIA - 12,2 PUNTI','fascia 4, 12.2 punti'),
('9f59c651-5e2f-41cf-97d3-deab0f50cc63',4,1.3,'4ª FASCIA - 1,3 PUNTI','fascia 4, 1.3 punti'),
('b06fe7e2-f948-4a4e-9e2b-aba5d77dce8f',4,6,'4ª FASCIA - 6 PUNTI','fascia 4, 6 punti'),
('bbb599b0-677a-40cf-9096-9440c5dbf32b',4,10,'4ª FASCIA - 10 PUNTI','fascia 4, 10 punti'),
('ccfc16db-dee2-4077-a4f1-6b2c58292470',4,10,'4ª FASCIA - 10 PUNTI','fascia 4, 10 punti'),
('e068710f-bc0b-4d04-b336-5dff8df0e0fc',4,70.7,'4ª FASCIA - 70,7 PUNTI','luglio: fascia 4, 70.7 punti | agosto: fascia 3, 70.7 punti'),
('ff2c1937-54e3-4707-81e2-b7781c961ab4',4,1.2,'4ª FASCIA - 1,2 PUNTI','fascia 4, 1.2 punti'),
('ffe67e9d-01b9-4525-bd97-0c525ac50c0d',4,6,'4ª FASCIA - 6 PUNTI','fascia 4, 6 punti');

update public.roster_requests r
set fitp_ranking_original=coalesce(r.fitp_ranking_original,r.fitp_ranking),
    fitp_ranking=u.display_value,
    fitp_verified=true,
    fitp_official_band=u.official_band,
    fitp_official_points=u.official_points,
    fitp_ranking_source='Ranking FITP luglio/agosto 2026 – verifica del 29/09/2026',
    fitp_verification_note='Corrispondenza negli elenchi ufficiali: '||u.candidates,
    fitp_verified_at=now(),
    updated_at=now()
from fitp_verified_updates u
where r.id=u.player_id and lower(coalesce(r.status,''))='approved';

do $$
declare v_expected integer; v_updated integer;
begin
  select count(*) into v_expected from fitp_verified_updates;
  select count(*) into v_updated
  from public.roster_requests r join fitp_verified_updates u on u.player_id=r.id
  where r.fitp_verified=true and r.fitp_ranking=u.display_value;
  if v_updated<>v_expected then
    raise exception 'Aggiornamento incompleto: attesi %, aggiornati %',v_expected,v_updated;
  end if;
end
$$;

commit;

select r.id,r.first_name,r.last_name,t.name as team_name,t.series,
       r.fitp_ranking,r.fitp_verified,r.fitp_ranking_source,r.fitp_verified_at
from public.roster_requests r
join public.teams t on t.id=r.team_id
where r.fitp_verified=true
order by t.series,t.name,r.last_name,r.first_name;
