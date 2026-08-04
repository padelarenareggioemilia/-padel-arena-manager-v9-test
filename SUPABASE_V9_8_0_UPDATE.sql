-- AICS PADEL CHAMPIONSHIP V9.8.0
-- PREFERENZE PERSONALI DI VISUALIZZAZIONE PARTITE
begin;

create table if not exists public.user_match_view_preferences(
  user_id uuid primary key references auth.users(id) on delete cascade,
  scope text not null default 'team' check(scope in ('team','category','all')),
  selected_team_id uuid references public.teams(id) on delete set null,
  selected_series text,
  updated_at timestamptz not null default now()
);

alter table public.user_match_view_preferences enable row level security;

drop policy if exists match_view_preferences_own_all on public.user_match_view_preferences;
create policy match_view_preferences_own_all
on public.user_match_view_preferences
for all to authenticated
using(user_id=auth.uid() or public.is_admin())
with check(user_id=auth.uid() or public.is_admin());

grant select,insert,update,delete on public.user_match_view_preferences to authenticated;

commit;
notify pgrst,'reload schema';
