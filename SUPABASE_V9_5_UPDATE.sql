-- PADEL ARENA MANAGER V9.5.0
-- SOSPENSIONI CALENDARIO E FESTIVITÀ
-- Non cancella dati esistenti.

begin;

create table if not exists public.calendar_blackouts (
  id uuid primary key default gen_random_uuid(),
  blackout_date date not null,
  reason text not null default 'Sospensione organizzazione',
  competition_code text not null default 'ALL',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(blackout_date,competition_code)
);

alter table public.calendar_blackouts enable row level security;

drop policy if exists calendar_blackouts_admin_all on public.calendar_blackouts;
create policy calendar_blackouts_admin_all
on public.calendar_blackouts
for all
to authenticated
using(public.is_admin())
with check(public.is_admin());

grant select,insert,update,delete on public.calendar_blackouts to authenticated;

commit;
notify pgrst,'reload schema';
