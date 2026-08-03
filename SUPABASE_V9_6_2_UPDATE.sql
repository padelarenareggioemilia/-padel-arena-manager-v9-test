-- AICS PADEL CHAMPIONSHIP V9.6.2
-- PUBBLICAZIONE ESPLICITA DELLE COMPETIZIONI

begin;

create table if not exists public.championship_publication (
  competition_code text primary key,
  is_published boolean not null default true,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.championship_publication(competition_code,is_published,published_at)
values
  ('SERIE_A',true,now()),
  ('SERIE_B',true,now()),
  ('SERIE_C',true,now()),
  ('COPPA_ITALIA',true,now()),
  ('SUPERCOPPA',true,now())
on conflict(competition_code) do nothing;

alter table public.championship_publication enable row level security;

drop policy if exists championship_publication_public_read on public.championship_publication;
create policy championship_publication_public_read
on public.championship_publication
for select
to anon,authenticated
using(true);

drop policy if exists championship_publication_admin_write on public.championship_publication;
create policy championship_publication_admin_write
on public.championship_publication
for all
to authenticated
using(public.is_admin())
with check(public.is_admin());

create or replace view public.public_championship_publication as
select competition_code,is_published,published_at,updated_at
from public.championship_publication;

grant select on public.public_championship_publication to anon,authenticated;
grant select,insert,update,delete on public.championship_publication to authenticated;

commit;
notify pgrst,'reload schema';
