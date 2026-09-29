-- AICS Padel Championship V9.9.93
-- Diagnostica FITP per data di tesseramento.
-- Fino al 27/09/2026: criterio più favorevole tra ranking luglio e agosto.
-- Dal 28/09/2026: ranking agosto 2026.

begin;

create table if not exists public.fitp_compliance_checks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.roster_requests(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  audit_date date not null,
  status text not null check (status in ('non_compliant','review')),
  official_band text,
  official_points text,
  official_candidates text,
  reason text not null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  notified_at timestamptz,
  notified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(player_id,audit_date)
);

alter table public.fitp_compliance_checks enable row level security;
grant select,insert,update,delete on public.fitp_compliance_checks to authenticated;

create temporary table fitp_hybrid_recalc on commit drop as
with candidates(
  player_id,team_id,july_bad,august_bad,
  july_band,july_points,july_candidates,
  august_band,august_points,august_candidates
) as (
  values
    ('016b871f-869f-441f-ad0c-c137cc116ec0'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,true,true,'4','2.8','fascia 4, 2.8 punti','4','2.8','fascia 4, 2.8 punti'),
    ('0aa4cfe8-821e-4b65-9ee8-32cc55d42a88'::uuid,'5c2d49cf-28c5-4aac-8b65-2eee7b2fe11c'::uuid,false,true,'','','','4','1.5','fascia 4, 1.5 punti'),
    ('1400e1b5-6025-455d-a95c-f874ed8af8e5'::uuid,'ae9d544a-effc-4f49-844a-6f0e06c51e6e'::uuid,false,true,'','','','3','90','fascia 3, 90 punti'),
    ('29125569-b882-4f4b-a1fb-6540f2b07f35'::uuid,'deee5b9d-0fe1-4f32-8771-a9d91614561f'::uuid,true,true,'3','10','fascia 3, 10 punti','3','10','fascia 3, 10 punti'),
    ('2edd9468-8c46-4b62-a88a-d11ffdddaf24'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,true,true,'4','1.2, 12','fascia 4, 1.2 punti | fascia 4, 12 punti','4','1.2, 12','fascia 4, 1.2 punti | fascia 4, 12 punti'),
    ('31699406-488b-47ae-b43c-4c13888fdcb4'::uuid,'3371654b-99ca-4135-b28a-582bdc0a41f1'::uuid,false,true,'','','','3','175','fascia 3, 175 punti'),
    ('49b3aabd-171b-4e04-b078-7311ac873de5'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,true,true,'4','3.5','fascia 4, 3.5 punti','4','3.5','fascia 4, 3.5 punti'),
    ('4e06b793-3dd8-4125-89c5-0c6fd329be1d'::uuid,'a90fe88f-c00e-4838-afcd-cc38110c1597'::uuid,false,true,'','','','3','621','fascia 3, 621 punti'),
    ('6bc3a05b-5b57-4be2-a1f2-197e45f83b0f'::uuid,'9e020582-5479-4676-9629-7ac77d63f90d'::uuid,false,true,'','','','2','1215','fascia 2, 1215 punti'),
    ('6c05fba1-bad5-48b4-b41f-867b70ed1607'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,true,true,'4','5.8','fascia 4, 5.8 punti','4','5.8','fascia 4, 5.8 punti'),
    ('6d1a53fb-5124-41d0-8d8f-4324a36403ba'::uuid,'ef19a1e1-cb11-4da3-95b4-948d969dbda2'::uuid,true,false,'4','1.3','fascia 4, 1.3 punti','','',''),
    ('6e550994-9fc0-4a34-af07-62d22c2c0ed4'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,true,true,'4','1.5','fascia 4, 1.5 punti','4','1.5','fascia 4, 1.5 punti'),
    ('739fc6b3-539a-4a01-bc97-c7b9f3c513e9'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,true,true,'4','1.6','fascia 4, 1.6 punti','4','1.6','fascia 4, 1.6 punti'),
    ('75444de1-139f-42cb-be19-36e57876e436'::uuid,'2a5e5c34-0210-479e-b54b-678d0f866dbb'::uuid,false,true,'','','','3','50','fascia 3, 50 punti'),
    ('75b26c13-9a34-4f0b-9240-27f32aa04f85'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,true,true,'4','1.3','fascia 4, 1.3 punti','4','1.3','fascia 4, 1.3 punti'),
    ('7fd14d62-cb0a-4bd4-abf4-e9a82ed01095'::uuid,'ef19a1e1-cb11-4da3-95b4-948d969dbda2'::uuid,true,true,'4','5.2','fascia 4, 5.2 punti','4','5.2','fascia 4, 5.2 punti'),
    ('8e350017-5ac7-4011-bd0f-3dfac9aaa586'::uuid,'2a5e5c34-0210-479e-b54b-678d0f866dbb'::uuid,false,true,'','','','3','50','fascia 3, 50 punti'),
    ('8fced6fc-e946-4be5-945c-c07fcee5f273'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,true,true,'4','12.2','fascia 4, 12.2 punti','4','12.2','fascia 4, 12.2 punti'),
    ('9f59c651-5e2f-41cf-97d3-deab0f50cc63'::uuid,'cd564c89-d152-4e68-84d5-e5f21f55b7bd'::uuid,true,true,'4','1.3','fascia 4, 1.3 punti','4','1.3','fascia 4, 1.3 punti'),
    ('b06fe7e2-f948-4a4e-9e2b-aba5d77dce8f'::uuid,'3019ffcc-f1b9-40b7-aaa0-b183f49bc282'::uuid,true,true,'4','6','fascia 4, 6 punti','4','6','fascia 4, 6 punti'),
    ('bbb599b0-677a-40cf-9096-9440c5dbf32b'::uuid,'72bb419c-7546-4e5b-908b-95eab648b58b'::uuid,true,true,'4','10','fascia 4, 10 punti','4','10','fascia 4, 10 punti'),
    ('ccfc16db-dee2-4077-a4f1-6b2c58292470'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,true,true,'4','10','fascia 4, 10 punti','4','10','fascia 4, 10 punti'),
    ('e068710f-bc0b-4d04-b336-5dff8df0e0fc'::uuid,'a1f48f57-1224-42ec-806d-90a28dd98389'::uuid,true,true,'4','70.7','fascia 4, 70.7 punti','3','70.7','fascia 3, 70.7 punti'),
    ('eb2f97cb-fa13-4d2a-8714-24fbd88820b7'::uuid,'95418922-4683-420f-b40d-d644e741b89d'::uuid,false,true,'','','','2','1065','fascia 2, 1065 punti'),
    ('ff2c1937-54e3-4707-81e2-b7781c961ab4'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,true,true,'4','1.2','fascia 4, 1.2 punti','4','1.2','fascia 4, 1.2 punti'),
    ('ffe67e9d-01b9-4525-bd97-0c525ac50c0d'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,true,true,'4','6','fascia 4, 6 punti','4','6','fascia 4, 6 punti')
), evaluated as (
  select
    c.*,
    (r.created_at at time zone 'Europe/Rome')::date as registration_date,
    ((r.created_at at time zone 'Europe/Rome')::date < date '2026-09-28') as protected_registration
  from candidates c
  join public.roster_requests r on r.id = c.player_id
  where r.status = 'approved'
)
select
  player_id,
  team_id,
  date '2026-09-29' as audit_date,
  'non_compliant'::text as status,
  case when protected_registration then july_band else august_band end as official_band,
  case when protected_registration then july_points else august_points end as official_points,
  case when protected_registration then july_candidates else august_candidates end as official_candidates,
  case
    when protected_registration then
      'Tesserato entro il 27/09/2026 e non conforme sia con il ranking di luglio sia con l''aggiornamento di agosto; data tesseramento '
      || to_char(registration_date,'DD/MM/YYYY')
    else
      'Tesserato dal 28/09/2026: ranking FITP di agosto oltre il limite della serie; data tesseramento '
      || to_char(registration_date,'DD/MM/YYYY')
  end as reason
from evaluated
where
  (protected_registration and july_bad and august_bad)
  or
  (not protected_registration and august_bad);

-- Elimina esclusivamente le segnalazioni del controllo FITP sostituite
-- dal ricalcolo per data di tesseramento.
delete from public.fitp_compliance_checks c
where c.audit_date = date '2026-09-29'
  and not exists (
    select 1 from fitp_hybrid_recalc h where h.player_id = c.player_id
  );

insert into public.fitp_compliance_checks
  (player_id,team_id,audit_date,status,official_band,official_points,official_candidates,reason)
select
  player_id,team_id,audit_date,status,official_band,official_points,official_candidates,reason
from fitp_hybrid_recalc
on conflict (player_id,audit_date) do update set
  team_id=excluded.team_id,
  status=excluded.status,
  official_band=excluded.official_band,
  official_points=excluded.official_points,
  official_candidates=excluded.official_candidates,
  reason=excluded.reason,
  resolved=false,
  resolved_at=null,
  updated_at=now();

-- Il risultato visualizzato dallo SQL Editor è il numero definitivo
-- di irregolarità FITP dopo l'applicazione della regola temporale.
select count(*) as irregolarita_fitp_definitive from fitp_hybrid_recalc;

commit;
