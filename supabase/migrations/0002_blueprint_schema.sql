-- ════════════════════════════════════════════════════════════════════════════
-- Cadenza · 0002 · Blueprint schema  (Forte-informed domains)
--
-- Normalized, org-scoped, auditable tables for the blueprint domains defined in
-- types/blueprint.ts. Top-level filter/join/sort columns are promoted to real
-- columns (indexed to back the deterministic queries in utils/blueprintQueries.ts);
-- nested arrays (guardians, pieces, criteria, lines…) stay in jsonb.
--
-- Every table carries: id, org_id, created_at, updated_at, created_by, updated_by.
-- RLS is applied uniformly at the bottom (read = member, write = admin).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Public registration intake ──────────────────────────────────────────
create table if not exists public.registration_intake (
  id text primary key,
  org_id text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','DUPLICATE','CONVERTED')),
  source text not null default 'WEBSITE' check (source in ('WEBSITE','MANUAL','IMPORT')),
  submitted_at timestamptz not null default now(),
  student_full_name text not null,
  student_date_of_birth date,
  instrument text,
  requested_activity_id text,
  notes text,
  guardians jsonb not null default '[]'::jsonb,
  consent_accepted boolean not null default false,
  consent_agreement_id text,
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  duplicate_of_student_id text,
  converted_student_id text,
  converted_enrollment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists registration_intake_status_idx on public.registration_intake(org_id, status);

-- ─── 2. Families ─────────────────────────────────────────────────────────────
create table if not exists public.families (
  id text primary key,
  org_id text not null,
  name text not null,
  guardians jsonb not null default '[]'::jsonb,
  student_ids jsonb not null default '[]'::jsonb,
  primary_contact_guardian_id text,
  billing_notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists families_org_idx on public.families(org_id);

-- ─── 3. Lesson records ───────────────────────────────────────────────────────
create table if not exists public.lesson_records (
  id text primary key,
  org_id text not null,
  event_id text not null,
  student_id text not null,
  staff_member_id text,
  date date not null,
  attendance text not null default 'UNMARKED'
    check (attendance in ('UNMARKED','PRESENT','ABSENT','LATE','EXCUSED','MAKEUP')),
  completion text not null default 'PENDING'
    check (completion in ('PENDING','COMPLETED','CANCELLED','NO_SHOW')),
  notes text,
  repertoire jsonb not null default '[]'::jsonb,
  homework text,
  makeup_of_lesson_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists lesson_records_student_idx on public.lesson_records(org_id, student_id, date);
create index if not exists lesson_records_event_idx on public.lesson_records(org_id, event_id);
create index if not exists lesson_records_unmarked_idx on public.lesson_records(org_id, attendance);

-- ─── 4. Operational requests (rooms / absence / day-off approvals) ───────────
create table if not exists public.operational_requests (
  id text primary key,
  org_id text not null,
  kind text not null check (kind in ('ROOM_CHANGE','ABSENCE','DAY_OFF')),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  requested_by_staff_id text,
  requested_for date not null,
  end_date date,
  event_id text,
  current_room_id text,
  requested_room_id text,
  reason text,
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  admin_inbox_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists operational_requests_idx on public.operational_requests(org_id, kind, status, requested_for);

-- ─── 5. Exams / examiner submissions / certificates / report cards ───────────
create table if not exists public.exam_sessions (
  id text primary key,
  org_id text not null,
  name text not null,
  activity_id text,
  date date not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','IN_PROGRESS','GRADED','CANCELLED')),
  examiner_staff_ids jsonb not null default '[]'::jsonb,
  student_ids jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists exam_sessions_idx on public.exam_sessions(org_id, status, date);

create table if not exists public.examiner_submissions (
  id text primary key,
  org_id text not null,
  exam_session_id text not null,
  student_id text not null,
  examiner_staff_id text not null,
  score numeric,
  grade text,
  remarks text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists examiner_submissions_idx on public.examiner_submissions(org_id, student_id);
create index if not exists examiner_submissions_session_idx on public.examiner_submissions(org_id, exam_session_id);

create table if not exists public.certificates (
  id text primary key,
  org_id text not null,
  student_id text not null,
  exam_session_id text,
  title text not null,
  level text,
  status text not null default 'PENDING' check (status in ('PENDING','ISSUED','REVOKED')),
  issued_at timestamptz,
  document_url text,
  document_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists certificates_idx on public.certificates(org_id, student_id, status);

create table if not exists public.report_cards (
  id text primary key,
  org_id text not null,
  student_id text not null,
  period_label text not null,
  activity_id text,
  lines jsonb not null default '[]'::jsonb,
  summary text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists report_cards_idx on public.report_cards(org_id, student_id);

-- ─── 6. Concert programs ─────────────────────────────────────────────────────
create table if not exists public.concert_programs (
  id text primary key,
  org_id text not null,
  title text not null,
  event_id text,
  date date not null,
  venue text,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','COMPLETED','CANCELLED')),
  pieces jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists concert_programs_idx on public.concert_programs(org_id, status, date);

-- ─── 7. Hours entries (payroll reconciliation lines) ─────────────────────────
create table if not exists public.hours_entries (
  id text primary key,
  org_id text not null,
  staff_member_id text not null,
  hours_report_id text,
  date date not null,
  reported_minutes integer not null default 0,
  calendar_minutes integer not null default 0,
  event_id text,
  teaching_assignment_id text,
  org_role_id text,
  rate numeric,
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','APPROVED','PAID')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists hours_entries_idx on public.hours_entries(org_id, staff_member_id, date);
create index if not exists hours_entries_status_idx on public.hours_entries(org_id, status);

-- ─── 8. Ledger: charges / payments / adjustments / balance snapshots ─────────
create table if not exists public.charges (
  id text primary key,
  org_id text not null,
  student_id text,
  family_id text,
  enrollment_id text,
  description text not null,
  amount numeric not null,
  currency text not null default 'ILS',
  due_date date,
  status text not null default 'OPEN' check (status in ('OPEN','PARTIAL','PAID','VOID')),
  period_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists charges_student_idx on public.charges(org_id, student_id, status);
create index if not exists charges_family_idx on public.charges(org_id, family_id, status);
create index if not exists charges_enrollment_idx on public.charges(org_id, enrollment_id);

create table if not exists public.payments (
  id text primary key,
  org_id text not null,
  student_id text,
  family_id text,
  amount numeric not null,
  currency text not null default 'ILS',
  method text not null default 'TRANSFER' check (method in ('CASH','TRANSFER','CARD','CHECK','OTHER')),
  received_at timestamptz not null default now(),
  reference text,
  applied_charge_ids jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists payments_student_idx on public.payments(org_id, student_id);
create index if not exists payments_family_idx on public.payments(org_id, family_id);

create table if not exists public.adjustments (
  id text primary key,
  org_id text not null,
  student_id text,
  family_id text,
  charge_id text,
  amount numeric not null,
  currency text not null default 'ILS',
  reason text not null,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists adjustments_idx on public.adjustments(org_id, student_id);

create table if not exists public.balance_snapshots (
  id text primary key,
  org_id text not null,
  student_id text,
  family_id text,
  as_of timestamptz not null default now(),
  total_charged numeric not null default 0,
  total_paid numeric not null default 0,
  total_adjusted numeric not null default 0,
  balance numeric not null default 0,
  currency text not null default 'ILS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists balance_snapshots_idx on public.balance_snapshots(org_id, student_id, as_of);

-- ─── 9. Agreements / consent ─────────────────────────────────────────────────
create table if not exists public.agreement_templates (
  id text primary key,
  org_id text not null,
  kind text not null check (kind in ('ENROLLMENT','CONSENT','MEDIA_RELEASE','INSTRUMENT_LOAN','FINANCIAL','OTHER')),
  title text not null,
  version integer not null default 1,
  body text not null default '',
  is_active boolean not null default true,
  supersedes_version integer,
  requires_guardian boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists agreement_templates_idx on public.agreement_templates(org_id, kind, is_active);

create table if not exists public.agreement_acceptances (
  id text primary key,
  org_id text not null,
  template_id text not null,
  template_version integer not null,
  student_id text,
  family_id text,
  enrollment_id text,
  guardian_id text,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED','EXPIRED','SUPERSEDED')),
  accepted_at timestamptz,
  accepted_by_name text,
  signature_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists agreement_acceptances_template_idx on public.agreement_acceptances(org_id, template_id, status);
create index if not exists agreement_acceptances_student_idx on public.agreement_acceptances(org_id, student_id);
create index if not exists agreement_acceptances_enrollment_idx on public.agreement_acceptances(org_id, enrollment_id);

-- ─── 10. Instrument inventory / loans / repairs ──────────────────────────────
create table if not exists public.instruments (
  id text primary key,
  org_id text not null,
  asset_tag text not null,
  name text not null,
  category text not null default 'OTHER',
  brand text,
  serial_number text,
  condition text not null default 'GOOD' check (condition in ('NEW','GOOD','FAIR','POOR','REPAIR','RETIRED')),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','ON_LOAN','IN_REPAIR','RETIRED','LOST')),
  location text,
  acquired_at date,
  value_amount numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text,
  unique (org_id, asset_tag)
);
create index if not exists instruments_idx on public.instruments(org_id, status, category);

create table if not exists public.instrument_loans (
  id text primary key,
  org_id text not null,
  instrument_id text not null,
  borrower_student_id text,
  borrower_staff_id text,
  checked_out_at timestamptz not null default now(),
  due_date date,
  returned_at timestamptz,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETURNED','OVERDUE','LOST')),
  condition_out text not null default 'GOOD',
  condition_in text,
  agreement_acceptance_id text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists instrument_loans_idx on public.instrument_loans(org_id, instrument_id);
create index if not exists instrument_loans_status_idx on public.instrument_loans(org_id, status, due_date);

create table if not exists public.instrument_repairs (
  id text primary key,
  org_id text not null,
  instrument_id text not null,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  description text not null,
  cost numeric,
  condition_before text not null default 'GOOD',
  condition_after text,
  vendor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists instrument_repairs_idx on public.instrument_repairs(org_id, instrument_id);

-- ─── 11. Staff evaluations ───────────────────────────────────────────────────
create table if not exists public.staff_evaluations (
  id text primary key,
  org_id text not null,
  staff_member_id text not null,
  reviewer_staff_id text,
  period_label text not null,
  due_date date,
  status text not null default 'DUE' check (status in ('DUE','SCHEDULED','DRAFT','COMPLETED','ACKNOWLEDGED')),
  overall_rating numeric,
  criteria jsonb not null default '[]'::jsonb,
  strengths text,
  actions jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists staff_evaluations_idx on public.staff_evaluations(org_id, staff_member_id, status);

-- ─── 12. Report definitions ──────────────────────────────────────────────────
create table if not exists public.report_definitions (
  id text primary key,
  org_id text not null,
  name text not null,
  description text,
  source_entity text not null,
  filters jsonb not null default '[]'::jsonb,
  group_by text,
  aggregate jsonb not null default '{"fn":"none","field":null}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, updated_by text
);
create index if not exists report_definitions_idx on public.report_definitions(org_id, source_entity);

-- ─── Uniform RLS + updated_at triggers for all blueprint tables ──────────────
do $$
declare
  t text;
  bp_tables text[] := array[
    'registration_intake','families','lesson_records','operational_requests',
    'exam_sessions','examiner_submissions','certificates','report_cards',
    'concert_programs','hours_entries','charges','payments','adjustments',
    'balance_snapshots','agreement_templates','agreement_acceptances',
    'instruments','instrument_loans','instrument_repairs','staff_evaluations',
    'report_definitions'
  ];
begin
  foreach t in array bp_tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.app_is_org_member(org_id))',
      t || '_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id))',
      t || '_write', t);

    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;
