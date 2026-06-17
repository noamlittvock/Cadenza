-- ════════════════════════════════════════════════════════════════════════════
-- Cadenza · 0001 · Core schema  (Firebase Firestore → Supabase Postgres)
--
-- Replaces the Firestore document model used by utils/useFirestoreSync.ts.
-- Each former top-level collection becomes a table. Core collections keep the
-- document shape in a `data jsonb` column (hybrid model) — the React layer reads
-- whole documents, so this is a 1:1, low-risk migration. Stable id + org_id are
-- promoted to real columns for primary key, joins, and RLS.
--
-- Multi-tenant isolation replaces firestore.rules: every table is RLS-protected
-- and scoped through public.org_members (the Supabase analogue of userProfiles).
-- See docs/SUPABASE_MIGRATION_MAP.md for the full collection→table map.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Membership / role resolution (replaces userProfiles + access_control) ───

create table if not exists public.org_members (
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     text not null,
  staff_member_id text,
  role       text not null default 'STAFF'
             check (role in ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'VIEWER')),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index if not exists org_members_org_idx on public.org_members(org_id);

comment on table public.org_members is
  'Maps Supabase auth.users → org + role. Replaces Firestore userProfiles/access_control. Kept in sync by the Supabase Auth onAuthStateChange bootstrap (see context/AuthContext supabase path).';

-- Stable, security-definer helpers used by every RLS policy.
create or replace function public.app_is_org_member(p_org text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.user_id = auth.uid() and m.org_id = p_org
  );
$$;

create or replace function public.app_org_role(p_org text)
returns text
language sql stable security definer set search_path = public as $$
  select role from public.org_members
  where user_id = auth.uid() and org_id = p_org
  limit 1;
$$;

-- Convenience: is the current user an admin (write-capable) in this org?
create or replace function public.app_is_org_admin(p_org text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_org_role(p_org) in ('ADMIN', 'SUPER_ADMIN');
$$;

-- ─── Core collections → tables (hybrid id/org_id + jsonb document) ───────────
-- Uniform creation + RLS so every tenant table behaves identically:
--   SELECT  → any org member
--   INSERT/UPDATE/DELETE → ADMIN or SUPER_ADMIN

do $$
declare
  t text;
  core_tables text[] := array[
    -- v1 collections
    'events', 'teachers', 'rooms', 'gantt_blocks', 'admin_inbox_items',
    'hours_reports', 'calendar_subscriptions',
    -- v2 collections (types/v2.ts · V2_COLLECTIONS)
    'students', 'activities', 'l1_subcategories', 'l2_subcategories',
    'staff_members', 'teaching_assignments', 'org_roles', 'enrollments',
    'event_participants', 'import_sessions'
  ];
begin
  foreach t in array core_tables loop
    execute format($f$
      create table if not exists public.%I (
        id         text primary key,
        org_id     text not null,
        data       jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )$f$, t);
    execute format('create index if not exists %I on public.%I (org_id)', t || '_org_idx', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.app_is_org_member(org_id))',
      t || '_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id))',
      t || '_write', t);
  end loop;
end $$;

-- ─── system_configs (Firestore system_configs/{orgId}_{docId}) ───────────────
-- Settings + array lists. Composite document id retained for parity.

create table if not exists public.system_configs (
  id         text primary key,          -- "{orgId}_{docId}"
  org_id     text not null,
  doc_id     text not null,             -- 'settings', list name, etc.
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, doc_id)
);
create index if not exists system_configs_org_idx on public.system_configs(org_id);
alter table public.system_configs enable row level security;

drop policy if exists system_configs_read on public.system_configs;
create policy system_configs_read on public.system_configs
  for select using (public.app_is_org_member(org_id));
drop policy if exists system_configs_write on public.system_configs;
create policy system_configs_write on public.system_configs
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

-- ─── updated_at trigger (parity with Firestore updatedAt convention) ─────────

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'events','teachers','rooms','gantt_blocks','admin_inbox_items','hours_reports',
        'calendar_subscriptions','students','activities','l1_subcategories','l2_subcategories',
        'staff_members','teaching_assignments','org_roles','enrollments','event_participants',
        'import_sessions','system_configs')
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- ─── Storage (replaces Firebase Storage / utils/storageUtils.ts) ─────────────
-- Bucket "documents" holds staff/student/certificate files. Path convention:
--   {orgId}/{entityType}/{entityId}/{filename}  (orgId is the first path segment)

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.app_is_org_member((storage.foldername(name))[1])
  );

drop policy if exists documents_write on storage.objects;
create policy documents_write on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.app_is_org_admin((storage.foldername(name))[1])
  );

drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects
  for delete using (
    bucket_id = 'documents'
    and public.app_is_org_admin((storage.foldername(name))[1])
  );
