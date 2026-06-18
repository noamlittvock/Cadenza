-- Cadenza 0004 blueprint security/data foundation.
-- Adds the public endpoint registry and rollover audit table, then tightens the
-- Phase-B RLS deltas accepted in the blueprint handoff:
--   D-06 teacher self-write for own lesson/hour rows.
--   D-08 finance capability for ledger access.
-- Public endpoints are intentionally inert here: no anon grants or policies.

-- ─── Capability model (D-08) ────────────────────────────────────────────────

create table if not exists public.member_capabilities (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id text not null,
  capability text not null check (capability in ('finance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  primary key (user_id, org_id, capability)
);
create index if not exists member_capabilities_org_idx on public.member_capabilities(org_id, capability);

comment on table public.member_capabilities is
  'Per-org capabilities beyond org_members.role. D-08 starts with finance; admins are treated as finance-capable by policies.';

create or replace function public.app_has_capability(p_org text, p_capability text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.member_capabilities c
    join public.org_members m
      on m.user_id = c.user_id
     and m.org_id = c.org_id
    where c.user_id = auth.uid()
      and c.org_id = p_org
      and c.capability = p_capability
  );
$$;

create or replace function public.app_is_staff_self(p_org text, p_staff_member_id text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.org_members m
    where m.user_id = auth.uid()
      and m.org_id = p_org
      and m.role = 'STAFF'
      and m.staff_member_id is not null
      and m.staff_member_id = p_staff_member_id
  );
$$;

alter table public.member_capabilities enable row level security;
drop policy if exists member_capabilities_read on public.member_capabilities;
create policy member_capabilities_read on public.member_capabilities
  for select using (public.app_is_org_admin(org_id) or user_id = auth.uid());
drop policy if exists member_capabilities_write on public.member_capabilities;
create policy member_capabilities_write on public.member_capabilities
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

-- ─── Year rollover audit (D-13) ─────────────────────────────────────────────

create table if not exists public.rollover_runs (
  id text primary key,
  org_id text not null,
  from_year_label text not null,
  to_year_label text not null,
  status text not null default 'PREVIEWED'
    check (status in ('PREVIEWED','APPLIED','FAILED','CANCELLED')),
  preview jsonb not null default '{}'::jsonb,
  plan jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  applied_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists rollover_runs_org_idx on public.rollover_runs(org_id, status, created_at);

alter table public.rollover_runs enable row level security;
drop policy if exists rollover_runs_read on public.rollover_runs;
create policy rollover_runs_read on public.rollover_runs
  for select using (public.app_is_org_member(org_id));
drop policy if exists rollover_runs_write on public.rollover_runs;
create policy rollover_runs_write on public.rollover_runs
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

-- ─── Public endpoint registry (D-14) ────────────────────────────────────────

create table if not exists public.public_endpoints (
  id text primary key,
  org_id text not null,
  kind text not null
    check (kind in ('REGISTRATION_INTAKE','AGREEMENT_ACCEPTANCE','CALENDAR_SUBSCRIPTION','HOURS_REPORT','OTHER')),
  label text not null,
  token_hash text not null,
  status text not null default 'DISABLED'
    check (status in ('DISABLED','ACTIVE','REVOKED','EXPIRED')),
  scopes jsonb not null default '[]'::jsonb,
  target_id text,
  consent_agreement_id text,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  unique (org_id, token_hash)
);
create index if not exists public_endpoints_org_idx on public.public_endpoints(org_id, kind, status);

comment on table public.public_endpoints is
  'Token registry for public surfaces. Stores token hashes only. 0004 keeps it admin-only and does not grant anon access.';

alter table public.public_endpoints enable row level security;
drop policy if exists public_endpoints_read on public.public_endpoints;
create policy public_endpoints_read on public.public_endpoints
  for select using (public.app_is_org_admin(org_id));
drop policy if exists public_endpoints_write on public.public_endpoints;
create policy public_endpoints_write on public.public_endpoints
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

-- ─── Teacher self-write refinements (D-06) ──────────────────────────────────

drop policy if exists lesson_records_write on public.lesson_records;
create policy lesson_records_write on public.lesson_records
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));
drop policy if exists lesson_records_teacher_insert on public.lesson_records;
create policy lesson_records_teacher_insert on public.lesson_records
  for insert with check (public.app_is_staff_self(org_id, staff_member_id));
drop policy if exists lesson_records_teacher_update on public.lesson_records;
create policy lesson_records_teacher_update on public.lesson_records
  for update using (public.app_is_staff_self(org_id, staff_member_id))
  with check (public.app_is_staff_self(org_id, staff_member_id));

drop policy if exists hours_entries_read on public.hours_entries;
create policy hours_entries_read on public.hours_entries
  for select using (
    public.app_is_org_admin(org_id)
    or public.app_has_capability(org_id, 'finance')
    or public.app_is_staff_self(org_id, staff_member_id)
  );
drop policy if exists hours_entries_write on public.hours_entries;
create policy hours_entries_write on public.hours_entries
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));
drop policy if exists hours_entries_teacher_insert on public.hours_entries;
create policy hours_entries_teacher_insert on public.hours_entries
  for insert with check (
    public.app_is_staff_self(org_id, staff_member_id)
    and status in ('DRAFT','SUBMITTED')
  );
drop policy if exists hours_entries_teacher_update on public.hours_entries;
create policy hours_entries_teacher_update on public.hours_entries
  for update using (
    public.app_is_staff_self(org_id, staff_member_id)
    and status in ('DRAFT','SUBMITTED')
  ) with check (
    public.app_is_staff_self(org_id, staff_member_id)
    and status in ('DRAFT','SUBMITTED')
  );

-- ─── Finance-only ledger access (D-08) ──────────────────────────────────────

drop policy if exists charges_read on public.charges;
create policy charges_read on public.charges
  for select using (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'));
drop policy if exists charges_write on public.charges;
create policy charges_write on public.charges
  for all using (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'))
  with check (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'));

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select using (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'));
drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments
  for all using (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'))
  with check (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'));

drop policy if exists adjustments_read on public.adjustments;
create policy adjustments_read on public.adjustments
  for select using (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'));
drop policy if exists adjustments_write on public.adjustments;
create policy adjustments_write on public.adjustments
  for all using (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'))
  with check (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'));

drop policy if exists balance_snapshots_read on public.balance_snapshots;
create policy balance_snapshots_read on public.balance_snapshots
  for select using (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'));
drop policy if exists balance_snapshots_write on public.balance_snapshots;
create policy balance_snapshots_write on public.balance_snapshots
  for all using (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'))
  with check (public.app_is_org_admin(org_id) or public.app_has_capability(org_id, 'finance'));

-- ─── updated_at triggers for the new normalized tables ─────────────────────

do $$
declare t text;
begin
  for t in select unnest(array[
    'member_capabilities','rollover_runs','public_endpoints'
  ])
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;
