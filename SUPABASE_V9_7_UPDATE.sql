-- AICS PADEL CHAMPIONSHIP V9.7.0
begin;
create table if not exists public.cup_italia_entries (team_id uuid primary key references public.teams(id) on delete cascade,seed integer not null check(seed between 1 and 32),group_id uuid references public.competition_groups(id) on delete set null,group_position integer,points integer not null default 0,matches_difference integer not null default 0,matches_won integer not null default 0,sets_difference integer not null default 0,games_difference integer not null default 0,created_at timestamptz not null default now());
alter table public.fixtures add column if not exists cup_round text;
alter table public.fixtures add column if not exists cup_match_number integer;
alter table public.fixtures add column if not exists better_seed_team_id uuid references public.teams(id) on delete set null;
alter table public.cup_italia_entries enable row level security;
drop policy if exists cup_italia_entries_admin_all on public.cup_italia_entries;
create policy cup_italia_entries_admin_all on public.cup_italia_entries for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists cup_italia_entries_public_read on public.cup_italia_entries;
create policy cup_italia_entries_public_read on public.cup_italia_entries for select to anon,authenticated using(true);
grant select on public.cup_italia_entries to anon,authenticated;
grant insert,update,delete on public.cup_italia_entries to authenticated;
commit;
notify pgrst,'reload schema';
