-- AICS Padel Championship V9.9.90
-- Diagnostica limitazioni categorie FITP e comunicazioni ai capitani.

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

insert into public.fitp_compliance_checks
  (player_id,team_id,audit_date,status,official_band,official_points,official_candidates,reason)
values
  ('c38759dd-0579-481d-933f-5dc3dc17b9ad'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,date '2026-09-29','non_compliant','4','16.1','fascia 4, 16.1 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('31699406-488b-47ae-b43c-4c13888fdcb4'::uuid,'3371654b-99ca-4135-b28a-582bdc0a41f1'::uuid,date '2026-09-29','non_compliant','3','175','fascia 3, 175 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('e068710f-bc0b-4d04-b336-5dff8df0e0fc'::uuid,'a1f48f57-1224-42ec-806d-90a28dd98389'::uuid,date '2026-09-29','non_compliant','3','70.7','fascia 3, 70.7 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('0aa4cfe8-821e-4b65-9ee8-32cc55d42a88'::uuid,'5c2d49cf-28c5-4aac-8b65-2eee7b2fe11c'::uuid,date '2026-09-29','non_compliant','4','1.5','fascia 4, 1.5 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('b06fe7e2-f948-4a4e-9e2b-aba5d77dce8f'::uuid,'3019ffcc-f1b9-40b7-aaa0-b183f49bc282'::uuid,date '2026-09-29','non_compliant','4','6','fascia 4, 6 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('6e550994-9fc0-4a34-af07-62d22c2c0ed4'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,date '2026-09-29','non_compliant','4','1.5','fascia 4, 1.5 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('339b844e-c12b-4ee4-8d6a-e8272c86bd2c'::uuid,'92477c5e-991a-48d2-903e-5a72a8c9fa76'::uuid,date '2026-09-29','non_compliant','3','308','fascia 3, 308 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('75444de1-139f-42cb-be19-36e57876e436'::uuid,'2a5e5c34-0210-479e-b54b-678d0f866dbb'::uuid,date '2026-09-29','non_compliant','3','50','fascia 3, 50 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('8fced6fc-e946-4be5-945c-c07fcee5f273'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','non_compliant','4','12.2','fascia 4, 12.2 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('345f1335-7b54-4a95-911b-3809cbaca875'::uuid,'e684020b-0e06-44f7-b37c-4c010a1453de'::uuid,date '2026-09-29','non_compliant','4','30','fascia 4, 30 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('bcc51328-8e3c-45ae-af23-27dfe2ff39a3'::uuid,'cd564c89-d152-4e68-84d5-e5f21f55b7bd'::uuid,date '2026-09-29','non_compliant','4','1.5','fascia 4, 1.5 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('5f403be4-25c8-4f67-b37e-5b2a0afc27ed'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,date '2026-09-29','non_compliant','4','1.5','fascia 4, 1.5 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('7b90972d-0ca4-46a1-9e73-942a2109db58'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,date '2026-09-29','non_compliant','4','4','fascia 4, 4 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('016b871f-869f-441f-ad0c-c137cc116ec0'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','non_compliant','4','2.8','fascia 4, 2.8 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('29125569-b882-4f4b-a1fb-6540f2b07f35'::uuid,'deee5b9d-0fe1-4f32-8771-a9d91614561f'::uuid,date '2026-09-29','non_compliant','3','10','fascia 3, 10 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('ff2c1937-54e3-4707-81e2-b7781c961ab4'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,date '2026-09-29','non_compliant','4','1.2','fascia 4, 1.2 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('bbb599b0-677a-40cf-9096-9440c5dbf32b'::uuid,'72bb419c-7546-4e5b-908b-95eab648b58b'::uuid,date '2026-09-29','non_compliant','4','10','fascia 4, 10 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('8e350017-5ac7-4011-bd0f-3dfac9aaa586'::uuid,'2a5e5c34-0210-479e-b54b-678d0f866dbb'::uuid,date '2026-09-29','non_compliant','3','50','fascia 3, 50 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('e7a8e62f-6742-4c10-aacd-e303e18f4830'::uuid,'2e49da72-490e-4b2a-851e-0e2741ea0aa2'::uuid,date '2026-09-29','non_compliant','3','56','fascia 3, 56 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('49b3aabd-171b-4e04-b078-7311ac873de5'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,date '2026-09-29','non_compliant','4','3.5','fascia 4, 3.5 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('15b6362c-116a-4ecf-85c7-e807521a1791'::uuid,'fe9ea06c-06e9-428f-9bb7-bc8f4f76d99b'::uuid,date '2026-09-29','non_compliant','4','1.5','fascia 4, 1.5 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('7573d303-1766-44b1-a24c-c668a46b6278'::uuid,'dfbf91a7-b2fe-49e2-8cac-188e60485064'::uuid,date '2026-09-29','non_compliant','3','0','fascia 3, 0 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('4e06b793-3dd8-4125-89c5-0c6fd329be1d'::uuid,'a90fe88f-c00e-4838-afcd-cc38110c1597'::uuid,date '2026-09-29','non_compliant','3','621','fascia 3, 621 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('7fd14d62-cb0a-4bd4-abf4-e9a82ed01095'::uuid,'ef19a1e1-cb11-4da3-95b4-948d969dbda2'::uuid,date '2026-09-29','non_compliant','4','5.2','fascia 4, 5.2 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('6c05fba1-bad5-48b4-b41f-867b70ed1607'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','non_compliant','4','5.8','fascia 4, 5.8 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('739fc6b3-539a-4a01-bc97-c7b9f3c513e9'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','non_compliant','4','1.6','fascia 4, 1.6 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('2edd9468-8c46-4b62-a88a-d11ffdddaf24'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,date '2026-09-29','non_compliant','4','1.2, 12','fascia 4, 1.2 punti | fascia 4, 12 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('1e6fad7b-dc23-4c09-9430-82bca85b95d3'::uuid,'cd564c89-d152-4e68-84d5-e5f21f55b7bd'::uuid,date '2026-09-29','non_compliant','4','2.3','fascia 4, 2.3 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('aab54991-7a88-4282-b633-4aaa80a46378'::uuid,'cd564c89-d152-4e68-84d5-e5f21f55b7bd'::uuid,date '2026-09-29','non_compliant','4','2.6','fascia 4, 2.6 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('1400e1b5-6025-455d-a95c-f874ed8af8e5'::uuid,'ae9d544a-effc-4f49-844a-6f0e06c51e6e'::uuid,date '2026-09-29','non_compliant','3','90','fascia 3, 90 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('ccfc16db-dee2-4077-a4f1-6b2c58292470'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,date '2026-09-29','non_compliant','4','10','fascia 4, 10 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('9f59c651-5e2f-41cf-97d3-deab0f50cc63'::uuid,'cd564c89-d152-4e68-84d5-e5f21f55b7bd'::uuid,date '2026-09-29','non_compliant','4','1.3','fascia 4, 1.3 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('ffe67e9d-01b9-4525-bd97-0c525ac50c0d'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','non_compliant','4','6','fascia 4, 6 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('75b26c13-9a34-4f0b-9240-27f32aa04f85'::uuid,'9f213d13-c3f6-4641-b028-cd7a73407e89'::uuid,date '2026-09-29','non_compliant','4','1.3','fascia 4, 1.3 punti','Classifica FITP ufficiale oltre il limite della serie'),
  ('69c7abb7-7c5a-47d9-8529-7647125a2368'::uuid,'a1f48f57-1224-42ec-806d-90a28dd98389'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile'),
  ('92489eb4-e3d3-40b5-b301-0466ecb2a46f'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile'),
  ('8b96c40c-4aff-4d9e-9680-5ab4959a0359'::uuid,'dfbf91a7-b2fe-49e2-8cac-188e60485064'::uuid,date '2026-09-29','review','4','0, 10, 16.4','fascia 4, 0 punti | fascia 4, 10 punti | fascia 4, 16.4 punti','Omonimia: i possibili abbinamenti hanno esiti diversi'),
  ('6f221d6c-bcca-49f2-b0c2-ce61bce3c1d8'::uuid,'a1f48f57-1224-42ec-806d-90a28dd98389'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile'),
  ('28320bf9-c215-454d-b7c4-8a1706c5ca6d'::uuid,'a1f48f57-1224-42ec-806d-90a28dd98389'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile'),
  ('3e99dc77-391b-46a3-ae58-b9ea423bf281'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','review','4','0, 6.2','fascia 4, 0 punti | fascia 4, 6.2 punti','Omonimia: i possibili abbinamenti hanno esiti diversi'),
  ('ca2b5e19-6a06-46d2-8b6a-c1eec4852cf3'::uuid,'95418922-4683-420f-b40d-d644e741b89d'::uuid,date '2026-09-29','review','2, 4, 5','0, 10, 726','fascia 2, 726 punti | fascia 4, 10 punti | fascia 5, 0 punti','Omonimia: i possibili abbinamenti hanno esiti diversi'),
  ('10b6cf3f-c001-4172-92de-69c97fcf9e8e'::uuid,'1bef2fd9-b352-4fb1-b39c-ec4ea90a48ab'::uuid,date '2026-09-29','review','3, 4','0, 108','fascia 3, 108 punti | fascia 4, 0 punti','Omonimia: i possibili abbinamenti hanno esiti diversi'),
  ('90f175c7-3338-44ea-af78-220be54027cf'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile'),
  ('f58fef98-7795-493c-9d6b-d188524bcaee'::uuid,'85c78dc4-eddd-4401-804f-7b0ffc810e26'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile'),
  ('243f86f5-65b8-48f3-8dd3-5796c7772039'::uuid,'139a2df4-196d-4063-ae5d-aacb32292778'::uuid,date '2026-09-29','review','4, 5','0, 20','fascia 4, 20 punti | fascia 5, 0 punti','Omonimia: i possibili abbinamenti hanno esiti diversi'),
  ('73d2eb1a-28d8-4102-b2eb-03783308c633'::uuid,'a79bf244-6261-4028-a88a-84ef688d765e'::uuid,date '2026-09-29','review','4, 5','0, 7.8','fascia 4, 0 punti | fascia 4, 7.8 punti | fascia 5, 0 punti','Omonimia: i possibili abbinamenti hanno esiti diversi'),
  ('56aab10c-c5d7-427e-8de9-7b79b31c6676'::uuid,'a1f48f57-1224-42ec-806d-90a28dd98389'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile'),
  ('e4e70155-cc8b-41bd-a379-9a5923bf4847'::uuid,'ef19a1e1-cb11-4da3-95b4-948d969dbda2'::uuid,date '2026-09-29','review','2, 4, 5','0, 20, 2160','fascia 2, 2160 punti | fascia 4, 20 punti | fascia 5, 0 punti','Omonimia: i possibili abbinamenti hanno esiti diversi'),
  ('605f3c95-5d0a-4010-8174-29553258af75'::uuid,'92477c5e-991a-48d2-903e-5a72a8c9fa76'::uuid,date '2026-09-29','review','3, 4','0, 275','fascia 3, 275 punti | fascia 4, 0 punti','Omonimia: i possibili abbinamenti hanno esiti diversi'),
  ('c35056fc-aff1-43c3-9b03-d74f59375249'::uuid,'ef19a1e1-cb11-4da3-95b4-948d969dbda2'::uuid,date '2026-09-29','review','3, 4','0, 3.2, 5.8, 10, 85, 222.6, 273','fascia 3, 222.6 punti | fascia 3, 273 punti | fascia 3, 85 punti | fascia 4, 0 punti | fascia 4, 10 punti | fascia 4, 3.2 punti | fascia 4, 5.8 punti','Omonimia: i possibili abbinamenti hanno esiti diversi'),
  ('1366d423-e4e6-40a9-bcb8-7feca266ef55'::uuid,'a1f48f57-1224-42ec-806d-90a28dd98389'::uuid,date '2026-09-29','review','4, 5','0, 10','fascia 4, 10 punti | fascia 5, 0 punti','Omonimia: i possibili abbinamenti hanno esiti diversi'),
  ('3d2f8ce8-74be-420b-a29e-c2b9ee26022e'::uuid,'9a3fe6c0-f0d4-4338-a7cd-6ce4743827c0'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile'),
  ('3ba25014-a1bb-4e4e-a118-b961fa0c2a98'::uuid,'33a195e2-ad86-488c-9691-1ce188e9a490'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile'),
  ('663791e0-ffb1-4303-a30a-4063c6bcec88'::uuid,'a1f48f57-1224-42ec-806d-90a28dd98389'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile'),
  ('c25ebb5a-67f3-4e41-a5e6-b6f7608a5ac9'::uuid,'a1f48f57-1224-42ec-806d-90a28dd98389'::uuid,date '2026-09-29','review','','','','Non trovato negli elenchi; classifica inserita in V9 non compatibile')
on conflict (player_id,audit_date) do update set
  team_id=excluded.team_id,
  status=excluded.status,
  official_band=excluded.official_band,
  official_points=excluded.official_points,
  official_candidates=excluded.official_candidates,
  reason=excluded.reason,
  updated_at=now();

commit;
