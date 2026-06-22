-- Standalone Teaching-Load / Staffing Planner (הרכבי משרה).
-- No calendar/payroll coupling. HYBRID jsonb documents, mirroring scenarios.

create table if not exists public.staffing_plans (
  id text primary key,
  org_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staffing_quotas (
  id text primary key,
  org_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staffing_classes (
  id text primary key,
  org_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staffing_assignments (
  id text primary key,
  org_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['staffing_plans','staffing_quotas','staffing_classes','staffing_assignments']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_read', t);
    execute format('create policy %I on public.%I for select using (public.app_is_org_member(org_id));', t || '_read', t);
    execute format('drop policy if exists %I on public.%I;', t || '_write', t);
    execute format('create policy %I on public.%I for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));', t || '_write', t);
    execute format('create index if not exists %I on public.%I (org_id);', t || '_org_id_idx', t);
    execute format('drop trigger if exists %I on public.%I;', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at();', t || '_touch', t);
  end loop;
end $$;
