-- AICS Padel Championship V9.9.92
-- Correzione diagnostica con ranking FITP luglio 2026,
-- assunto dal campionato come valido fino al 27 settembre 2026.

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

create index if not exists fitp_compliance_checks_team_idx
  on public.fitp_compliance_checks(team_id,status,resolved);

alter table public.fitp_compliance_checks enable row level security;

drop policy if exists fitp_compliance_checks_admin_select on public.fitp_compliance_checks;
drop policy if exists fitp_compliance_checks_admin_insert on public.fitp_compliance_checks;
drop policy if exists fitp_compliance_checks_admin_update on public.fitp_compliance_checks;
drop policy if exists fitp_compliance_checks_admin_delete on public.fitp_compliance_checks;

create policy fitp_compliance_checks_admin_select
  on public.fitp_compliance_checks for select to authenticated
  using (public.is_admin());

create policy fitp_compliance_checks_admin_insert
  on public.fitp_compliance_checks for insert to authenticated
  with check (public.is_admin());

create policy fitp_compliance_checks_admin_update
  on public.fitp_compliance_checks for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy fitp_compliance_checks_admin_delete
  on public.fitp_compliance_checks for delete to authenticated
  using (public.is_admin());

grant select,insert,update,delete on public.fitp_compliance_checks to authenticated;

-- Rimuove esclusivamente le segnalazioni del controllo del 29/09/2026
-- che non risultano più aperte dopo il ricalcolo con il ranking corretto.
delete from public.fitp_compliance_checks
where audit_date = date '2026-09-29'
  and player_id not in ('e068710f-bc0b-4d04-b336-5dff8df0e0fc'::uuid,'b06fe7e2-f948-4a4e-9e2b-aba5d77dce8f'::uuid,'6e550994-9fc0-4a34-af07-62d22c2c0ed4'::uuid,'8fced6fc-e946-4be5-945c-c07fcee5f273'::uuid,'6d1a53fb-5124-41d0-8d8f-4324a36403ba'::uuid,'016b871f-869f-441f-ad0c-c137cc116ec0'::uuid,'29125569-b882-4f4b-a1fb-6540f2b07f35'::uuid,'ff2c1937-54e3-4707-81e2-b7781c961ab4'::uuid,'bbb599b0-677a-40cf-9096-9440c5dbf32b'::uuid,'49b3aabd-171b-4e04-b078-7311ac873de5'::uuid,'7fd14d62-cb0a-4bd4-abf4-e9a82ed01095'::uuid,'6c05fba1-bad5-48b4-b41f-867b70ed1607'::uuid,'739fc6b3-539a-4a01-bc97-c7b9f3c513e9'::uuid,'2edd9468-8c46-4b62-a88a-d11ffdddaf24'::uuid,'ccfc16db-dee2-4077-a4f1-6b2c58292470'::uuid,'9f59c651-5e2f-41cf-97d3-deab0f50cc63'::uuid,'ffe67e9d-01b9-4525-bd97-0c525ac50c0d'::uuid,'75b26c13-9a34-4f0b-9240-27f32aa04f85'::uuid);

insert into public.fitp_compliance_checks
  (player_id,team_id,audit_date,status,official_band,official_points,official_candidates,reason)
values
  ('e068710f-bc0b-4d04-b336-5dff8df0e0fc'::uuid,'a1f48f57-1224-42ec-806d-90a28dd98389'::uuid,date '2026-09-29','non_compliant','4','70.7','fascia 4, 70.7 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('b06fe7e2-f948-4a4e-9e2b-aba5d77dce8f'::uuid,'3019ffcc-f1b9-40b7-aaa0-b183f49bc282'::uuid,date '2026-09-29','non_compliant','4','6','fascia 4, 6 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('6e550994-9fc0-4a34-af07-62d22c2c0ed4'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,date '2026-09-29','non_compliant','4','1.5','fascia 4, 1.5 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('8fced6fc-e946-4be5-945c-c07fcee5f273'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','non_compliant','4','12.2','fascia 4, 12.2 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('6d1a53fb-5124-41d0-8d8f-4324a36403ba'::uuid,'ef19a1e1-cb11-4da3-95b4-948d969dbda2'::uuid,date '2026-09-29','non_compliant','4','1.3','fascia 4, 1.3 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('016b871f-869f-441f-ad0c-c137cc116ec0'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','non_compliant','4','2.8','fascia 4, 2.8 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('29125569-b882-4f4b-a1fb-6540f2b07f35'::uuid,'deee5b9d-0fe1-4f32-8771-a9d91614561f'::uuid,date '2026-09-29','non_compliant','3','10','fascia 3, 10 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('ff2c1937-54e3-4707-81e2-b7781c961ab4'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,date '2026-09-29','non_compliant','4','1.2','fascia 4, 1.2 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('bbb599b0-677a-40cf-9096-9440c5dbf32b'::uuid,'72bb419c-7546-4e5b-908b-95eab648b58b'::uuid,date '2026-09-29','non_compliant','4','10','fascia 4, 10 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('49b3aabd-171b-4e04-b078-7311ac873de5'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,date '2026-09-29','non_compliant','4','3.5','fascia 4, 3.5 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('7fd14d62-cb0a-4bd4-abf4-e9a82ed01095'::uuid,'ef19a1e1-cb11-4da3-95b4-948d969dbda2'::uuid,date '2026-09-29','non_compliant','4','5.2','fascia 4, 5.2 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('6c05fba1-bad5-48b4-b41f-867b70ed1607'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','non_compliant','4','5.8','fascia 4, 5.8 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('739fc6b3-539a-4a01-bc97-c7b9f3c513e9'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','non_compliant','4','1.6','fascia 4, 1.6 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('2edd9468-8c46-4b62-a88a-d11ffdddaf24'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,date '2026-09-29','non_compliant','4','1.2, 12','fascia 4, 1.2 punti | fascia 4, 12 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('ccfc16db-dee2-4077-a4f1-6b2c58292470'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,date '2026-09-29','non_compliant','4','10','fascia 4, 10 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('9f59c651-5e2f-41cf-97d3-deab0f50cc63'::uuid,'cd564c89-d152-4e68-84d5-e5f21f55b7bd'::uuid,date '2026-09-29','non_compliant','4','1.3','fascia 4, 1.3 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('ffe67e9d-01b9-4525-bd97-0c525ac50c0d'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','non_compliant','4','6','fascia 4, 6 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026'),
  ('75b26c13-9a34-4f0b-9240-27f32aa04f85'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,date '2026-09-29','non_compliant','4','1.3','fascia 4, 1.3 punti','Classifica FITP ufficiale oltre il limite della serie; ranking FITP luglio 2026 valido per il campionato fino al 27/09/2026')
on conflict (player_id,audit_date) do update set
  team_id=excluded.team_id,
  status=excluded.status,
  official_band=excluded.official_band,
  official_points=excluded.official_points,
  official_candidates=excluded.official_candidates,
  reason=excluded.reason,
  updated_at=now();

commit;
