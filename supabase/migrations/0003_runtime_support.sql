-- Cadenza 0003 runtime support tables for the Supabase migration.
-- Adds the metadata tables used by AuthContext, SuperAdmin, onboarding, and
-- translations after removing Firebase Auth/Firestore runtime usage.

create table if not exists public.organizations (
  id text primary key,
  name text not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
drop policy if exists organizations_read on public.organizations;
create policy organizations_read on public.organizations
  for select using (auth.role() = 'authenticated');
drop policy if exists organizations_write on public.organizations;
create policy organizations_write on public.organizations
  for all using (
    exists (
      select 1 from public.org_members m
      where m.user_id = auth.uid() and m.role = 'SUPER_ADMIN'
    )
  ) with check (
    exists (
      select 1 from public.org_members m
      where m.user_id = auth.uid() and m.role = 'SUPER_ADMIN'
    )
  );

create table if not exists public.access_control (
  id text primary key,
  email text not null,
  allowed boolean not null default true,
  role text not null check (role in ('ADMIN', 'VIEWER')),
  org_id text not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists access_control_email_idx on public.access_control(email);
create index if not exists access_control_org_idx on public.access_control(org_id);

alter table public.org_members enable row level security;
drop policy if exists org_members_read on public.org_members;
create policy org_members_read on public.org_members
  for select using (
    user_id = auth.uid()
    or lower(coalesce((auth.jwt() ->> 'email'), '')) = 'noam.littvock@gmail.com'
  );
drop policy if exists org_members_self_write on public.org_members;
create policy org_members_self_write on public.org_members
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (
      (
        role = 'SUPER_ADMIN'
        and lower(coalesce((auth.jwt() ->> 'email'), '')) = 'noam.littvock@gmail.com'
      )
      or exists (
        select 1 from public.access_control a
        where a.org_id = org_members.org_id
          and a.allowed = true
          and lower(a.email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
          and (
            (a.role = 'ADMIN' and org_members.role = 'ADMIN')
            or (a.role = 'VIEWER' and org_members.role in ('STAFF', 'VIEWER'))
          )
      )
    )
  );

alter table public.access_control enable row level security;
drop policy if exists access_control_read on public.access_control;
create policy access_control_read on public.access_control
  for select using (
    public.app_is_org_admin(org_id)
    or lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );
drop policy if exists access_control_write on public.access_control;
create policy access_control_write on public.access_control
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

create table if not exists public.user_profiles (
  id text primary key,
  uid text not null,
  org_id text not null references public.organizations(id) on delete cascade,
  staff_member_id text,
  role text not null default 'STAFF' check (role in ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'VIEWER')),
  is_first_admin boolean not null default false,
  onboarding_dismissed boolean not null default true,
  first_use_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (uid, org_id)
);
create index if not exists user_profiles_org_idx on public.user_profiles(org_id);
create index if not exists user_profiles_uid_idx on public.user_profiles(uid);

alter table public.user_profiles enable row level security;
drop policy if exists user_profiles_read on public.user_profiles;
create policy user_profiles_read on public.user_profiles
  for select using (uid = auth.uid()::text or public.app_is_org_admin(org_id));
drop policy if exists user_profiles_write on public.user_profiles;
create policy user_profiles_write on public.user_profiles
  for all using (uid = auth.uid()::text or public.app_is_org_admin(org_id))
  with check (uid = auth.uid()::text or public.app_is_org_admin(org_id));

create table if not exists public.onboarding_state (
  id text primary key,
  org_id text not null references public.organizations(id) on delete cascade,
  activities_created boolean not null default false,
  staff_added boolean not null default false,
  first_event_created boolean not null default false,
  setup_gate_cleared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

alter table public.onboarding_state enable row level security;
drop policy if exists onboarding_state_read on public.onboarding_state;
create policy onboarding_state_read on public.onboarding_state
  for select using (public.app_is_org_member(org_id));
drop policy if exists onboarding_state_write on public.onboarding_state;
create policy onboarding_state_write on public.onboarding_state
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

create table if not exists public.translations (
  id text primary key,
  key text not null unique,
  original_english text not null,
  screen_group text not null,
  status text not null default 'untranslated'
    check (status in ('untranslated', 'auto_translated', 'reviewed', 'overridden')),
  he_il text not null default '',
  auto_translated_he_il text not null default '',
  manual_override boolean not null default false,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.translations enable row level security;
drop policy if exists translations_read on public.translations;
create policy translations_read on public.translations
  for select using (auth.role() = 'authenticated');
drop policy if exists translations_write on public.translations;
create policy translations_write on public.translations
  for all using (
    exists (
      select 1 from public.org_members m
      where m.user_id = auth.uid() and m.role = 'SUPER_ADMIN'
    )
  ) with check (
    exists (
      select 1 from public.org_members m
      where m.user_id = auth.uid() and m.role = 'SUPER_ADMIN'
    )
  );

do $$
declare t text;
begin
  for t in select unnest(array[
    'organizations','access_control','user_profiles','onboarding_state','translations'
  ])
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;
