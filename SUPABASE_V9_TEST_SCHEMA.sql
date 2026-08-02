-- PADEL ARENA MANAGER V9 - DATABASE TEST ISOLATO
-- Eseguire esclusivamente nel NUOVO progetto Supabase di prova.
-- Non eseguire nel progetto V8 operativo.

begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','collaborator','captain','player');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  role public.app_role not null default 'player',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  series text,
  club_name text,
  club_address text,
  captain_user_id uuid references auth.users(id) on delete set null,
  logo_url text,
  invite_token text unique not null default encode(gen_random_bytes(16),'hex'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_role text not null check (membership_role in ('captain','player')),
  status text not null default 'active' check (status in ('pending','active','rejected')),
  created_at timestamptz not null default now(),
  unique(team_id,user_id,membership_role)
);

create table public.collaborator_assignments (
  id uuid primary key default gen_random_uuid(),
  collaborator_user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null default 'tournament',
  resource_id text not null,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(collaborator_user_id,resource_type,resource_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(id,email,first_name,last_name,role)
  values(
    new.id,
    coalesce(new.email,''),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    case
      when lower(coalesce(new.email,''))='padelarenareggioemilia@gmail.com'
      then 'admin'::public.app_role
      else 'player'::public.app_role
    end
  )
  on conflict(id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.collaborator_assignments enable row level security;

create policy profiles_read_own
on public.profiles for select to authenticated
using(id=auth.uid() or exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
));

create policy profiles_update_own
on public.profiles for update to authenticated
using(id=auth.uid() or exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
))
with check(id=auth.uid() or exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
));

create policy teams_read_authenticated
on public.teams for select to authenticated
using(true);

create policy teams_admin_insert
on public.teams for insert to authenticated
with check(exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
));

create policy teams_admin_update
on public.teams for update to authenticated
using(exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
) or captain_user_id=auth.uid())
with check(exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
) or captain_user_id=auth.uid());

create policy teams_admin_delete
on public.teams for delete to authenticated
using(exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
));

create policy memberships_read_related
on public.team_memberships for select to authenticated
using(
  user_id=auth.uid()
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
  or exists(select 1 from public.teams t where t.id=team_id and t.captain_user_id=auth.uid())
);

create policy memberships_manage_admin_captain
on public.team_memberships for all to authenticated
using(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
  or exists(select 1 from public.teams t where t.id=team_id and t.captain_user_id=auth.uid())
)
with check(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
  or exists(select 1 from public.teams t where t.id=team_id and t.captain_user_id=auth.uid())
);

create policy assignments_admin_all
on public.collaborator_assignments for all to authenticated
using(exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
))
with check(exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
));

create policy assignments_collaborator_read
on public.collaborator_assignments for select to authenticated
using(collaborator_user_id=auth.uid());

grant usage on schema public to authenticated;
grant select,update on public.profiles to authenticated;
grant select,insert,update,delete on public.teams to authenticated;
grant select,insert,update,delete on public.team_memberships to authenticated;
grant select,insert,update,delete on public.collaborator_assignments to authenticated;

commit;

select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('profiles','teams','team_memberships','collaborator_assignments')
order by table_name;
