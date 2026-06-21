BUILD ACTIVE

This file is the implementation loop's durable memory. The next agent must read
it in full before editing code. Authoritative specs remain:

- `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`
- `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`
- `docs/blueprint-planning/packets/agreements-consent.md`
- `docs/blueprint-planning/packets/reports-analytics.md`
- `docs/blueprint-planning/packets/operations-command-center.md`
- `docs/blueprint-planning/packets/ensembles-theory-school-programs.md`
- `docs/blueprint-planning/packets/exams-certificates-report-cards.md`
- `docs/blueprint-planning/packets/concert-programs-events.md`
- `docs/blueprint-planning/packets/rooms-absence-requests.md`
- `docs/blueprint-planning/packets/calendar-website-integrations.md`
- `docs/blueprint-planning/packets/year-rollover-setup.md`
- `docs/blueprint-planning/packets/teacher-evaluation-hr.md`
- `docs/blueprint-planning/decision-log.md`
- `docs/blueprint-planning/route-nav-policy.md`
- `docs/blueprint-planning/status-policy.md`
- `docs/blueprint-planning/finance-configurable-model-scope.md`
- `docs/blueprint-planning/RELEASE_HARDENING_GATES.md`

On completion, replace the first line with exactly:
BUILD COMPLETE

## Previous Completed Targets

- `student-family-files` reached the implemented bar on 2026-06-18.
- `public-registration-intake` reached the implemented bar on 2026-06-18.
- `lesson-details-attendance` reached the implemented bar on 2026-06-18 under
  accepted D-17.
- `payroll-salaries-hours` reached the implemented bar on 2026-06-19 under
  accepted D-18/D-19.
- `payments-charges` reached the implemented bar on 2026-06-19 under accepted
  D-07-FIN/D-08/D-10/D-20. D-25 remains parked.
- Latest committed checkpoint before this bird's-eye loop:
  `9006447` (`Build agreement consent workflows`) on branch `blueprint-supabase`.

## Current Objective

Build the full bird's-eye Blueprint app experience with local/static/e2e
verification, while tracking live Supabase RLS as a release-hardening gate rather
than an implementation-loop blocker.

Current order:

1. Close out `agreements-consent` as product-built with explicit live-RLS release
   gates.
2. Build `reports-analytics`.
3. Build `operations-command-center`.
4. Add first-pass bird's-eye surfaces for the remaining planned/deferred modules
   using provisional D-21-D-27 defaults.
5. Produce a final release-hardening checklist that clearly separates "visible
   app/product shape complete" from "production security and policy hardening
   complete".

Run this as one campaign, but never as one giant unit. Each iteration must do the
next single unchecked queue item only. If a unit is too large, split it in this
file first and complete only the first new subunit.

## Locked Build Decisions

- D-01/D-02: do not add a new top-level route without the route/nav policy.
  `ANALYTICS` remains hidden until reports routes to a real surface; operations
  lives in the existing Admin Inbox surface, not a new ViewState.
- D-03: `Family` is first-class.
- D-04/D-05: use `utils/canonicalAdapters.ts` for Student/Event legacy/V2
  conversion. Do not add duplicate inline conversion seams.
- D-07: public writes must go through a Supabase Edge Function or tightly scoped
  token into a controlled target. Never add broad anon policies on org tables.
- D-08: finance visibility is admin plus explicit `finance` capability.
- D-09: reports are admin/finance only initially; finance may see only
  finance-authorized reports/cards.
- D-11: agreements support both typed e-signature and PDF upload.
- D-14: public/tokenized surfaces must use the `public_endpoints` registry before
  launch.
- D-15: packet-local backfill only; no global Student/Event migration.
- D-16: guardian/contact data stays in `families.guardians[]` jsonb for P0/P1.
- D-17: lesson attendance uses one `lesson_records` row per `(eventId,
  studentId)`.
- D-18/D-19: payroll reports/cards use `HoursEntry` source rows and stamped
  approval rates.
- D-20: finance reports/agreement terms use single-currency P0 and never silently
  offset currencies.
- D-21-D-27 are accepted provisional defaults for the bird's-eye build. Keep
  them conservative, reversible, auditable, and clearly labeled for later policy
  carve/craft.

## Provisional Defaults And Release Gates

- Live Supabase RLS and remote migration application are release-hardening gates,
  not blockers for building the bird's-eye app. Keep env-gated live tests and
  static schema tests, record skips/blockers precisely, but continue local/e2e
  implementation work.
- D-21 absence/day-off: approvals create review tasks/flags, not automatic
  schedule or payroll mutation. Human operators confirm destructive changes.
- D-22 assessments/report cards: delivery is private/authenticated by default and
  requires explicit guardian release for guardian-facing output.
- D-23 public performance/media: private by default; participant-level release is
  required for public exposure, and missing consent redacts/hides the participant
  or media.
- D-24 consent revocation: revocation disables future use/public links and opens
  a review task. Preserve historical records and audit; do not delete records.
- D-25 instrument deposits/refunds: model as explicit approved ledger liability
  or credit rows. No automatic forfeiture.
- D-26 HR/evaluation: superadmin/HR-admin only by default. Staff subject
  visibility is limited to explicit acknowledgment flows.
- D-27 rollover: preview-first, copy-forward into next-year draft records, never
  mutate prior-year records, and preserve source lineage.

## Build Queue

### Stage 0 - Campaign Audit And Split

- [x] Baseline audit: read handoff, roadmap, the agreements, reports, and
  operations packets, decision log, route policy, status policy, current
  feature-tree statuses, current code/tests/RLS/mapping for the three modules,
  and existing public endpoint/storage helpers. Split any queue item that is too
  large for one safe iteration. Preserve D-21-D-27 provisional-scope boundaries.
  No product implementation in this audit unit unless needed to split the queue.

### Stage 1 - Agreements And Consent

- [x] Agreements helper/mapping coverage: strengthen deterministic helper tests
  for unsigned agreements, family/enrollment targets, guardian-required
  templates, declined/expired/superseded rows, stable sorting, and normalized
  Supabase mapping for templates/acceptances/public endpoints. No UI work.
- [x] Agreement direct-table RLS foundation: narrow `agreement_templates` and
  `agreement_acceptances` from broad org-member read to admin-only direct table
  access. Add static schema tests plus env-gated live RLS tests for admin allowed,
  plain member/teacher/finance denied by default, anon denied, and cross-org
  denied. No token signing, storage, or UI work.
- [x] Agreement token signing foundation: add the D-07/D-14 scoped
  `AGREEMENT_ACCEPTANCE` public endpoint path for target-only accept/decline.
  Validate `public_endpoints`, explicit consent/setup, target lineage, expiry,
  and accepted/reused-token behavior. Add env-gated live tests for valid token
  target-only sign and expired/reused token denial or explicitly idempotent
  behavior. No signing UI work.
- [x] Agreement private PDF storage foundation: refine signed-agreement/PDF
  storage access so direct access is admin-only or controlled by an exact scoped
  token path, with no broad org-member or anon file reads. Add static and
  env-gated tests for admin allowed and plain member/teacher/finance/anon
  denied. No PDF capture UI work.
- [x] Agreement admin surface: add Manage agreement-template/request workflow for
  list/search/filter, create/version/activate templates, issue pending requests,
  unsigned queue, empty/loading/error states, EN/HE labels, and RTL-safe bodies.
- [x] Student/family agreement history: add contextual agreement history and
  unsigned status from student/family context without bypassing agreement-table
  RLS or D-16 guardian jsonb rules.
- [x] Public signing and PDF capture: implement mobile token signing for typed
  signature and admin countersigned PDF upload/reference capture. No withdrawal,
  revocation, assessment delivery, media release, or instrument deposit/refund
  behavior.
- [x] Agreements Playwright smoke: cover admin template -> request -> mobile
  typed sign -> accepted history -> unsigned helper clears, plus PDF upload
  history.
- [x] Agreement bird's-eye status closeout: promote `agreements-consent` as
  product-built under bird's-eye mode, update the packet/header and
  `features/forteTree.ts`, and move unapplied remote agreement migrations/live
  RLS skips into an explicit release-hardening gate. Do not claim production
  security.

### Stage 2 - Reports And Analytics

- [x] Reports helper/allowlist foundation: add source/field allowlists and tests
  for invalid columns, filter operators, null/empty values, aggregate none,
  grouped average/min/max edge cases, stable order, lineage, blocked-source
  markers, and finance source allowlists. No UI work.
- [x] Reports definition RLS foundation: narrow `report_definitions` from broad
  member read to D-09 admin/finance scope and admin-only writes. Add static schema
  tests and live RLS tests for admin full definition access, finance limited
  definition read, plain member/teacher/anon denied, and cross-org denied.
- [x] Reports run/export source authorization: enforce source-row authorization
  and finance source allowlists in run/export paths so finance cannot access
  student, attendance, agreement, assessment, concert, HR, rollover, hidden
  public-endpoint, or blocked-source data. Add live/source-authorization tests.
- [x] Analytics route/library shell: route `ANALYTICS` only after a real Reports
  workspace shell exists; update the route/palette allowlist in the same change.
  Add report library list/search/filter, empty/loading/error/permission states,
  EN/HE labels, and RTL-safe values. No builder/export work.
- [x] Report builder/run/export UI: add definition builder, run/result table,
  grouped/chart view if supported by existing libraries, lineage links, CSV
  export, finance run/export limitations, EN/HE labels, and RTL-safe values.
- [x] Reports Playwright smoke and promotion: cover admin finance report
  create/run/export/link, finance run/export without create, and denied
  student/attendance report for finance. Then promote packet/header and
  `features/forteTree.ts` only if reports completion checklist holds.

### Stage 3 - Operations Command Center

- [x] Operations helper exports: implement deterministic helpers for
  `countOpenConflicts`, `listTodayEvents`, and `countPendingHoursReports`; remove
  their consistency-test stubs only when real exports exist. Add tests for hidden
  or cancelled events, org timezone date windows, stable severity ordering,
  source deletion, blocked-card markers, and role-filtered output.
- [x] Operations snapshot helper model: create a pure source-authorized
  operations snapshot or equivalent card model with role-filtered output,
  blocked-card markers, source IDs only where authorized, and no persisted
  aggregate table. No UI work.
- [x] Operations snapshot/security foundation: add RLS/source-authorization tests
  proving admin full cards, finance only finance/report cards, plain
  member/teacher/anon denied, cross-org denied, and no hidden-count leakage.
- [x] Admin Inbox operations summary shell: add desktop-first operations summary
  in the existing Admin Inbox surface with open conflicts, today's events, inbox,
  import/report-health, pending-hours, and finance/agreement-safe cards only
  where source semantics are settled. Include EN/HE labels, RTL-safe values, and
  empty/loading/error/blocked states. Do not add a new ViewState.
- [x] Operations drilldowns and role states: add source deep links from the Admin
  Inbox operations summary, finance-limited rendering, plain-member denial, and
  stale-source/permission failure states. Do not unhide unrelated routes.
- [x] Operations Playwright smoke and promotion: cover Admin Inbox summary card
  rendering and drill-downs, finance-limited view, and plain-member denial. Then
  promote packet/header and `features/forteTree.ts` only if operations
  completion checklist holds.

### Stage 4 - Remaining Bird's-Eye Module Surfaces

- [x] Remaining module audit and split: read the remaining packet files and split
  first-pass bird's-eye surfaces for ensembles/programs, exams/report cards,
  concerts/events, rooms/absence requests, calendar integrations, year rollover,
  and teacher evaluation/HR. No product implementation in this audit unit unless
  needed to split the queue.
- [x] Ensembles/programs helper and roster model foundation: broaden
  `listEnsembleRosters`, `listTheoryGroups`, and
  `listSchoolProgramStudents` coverage for archived/missing/duplicate/L2 rows
  and add a pure role-filtered roster/program view model over
  Activity/Enrollment/TeachingAssignment data. Add static/env-gated security
  coverage for admin full access, assigned-teacher own roster, plain member/
  finance/other-teacher denial, and cross-org isolation. No UI work.
- [x] Ensembles/programs Manage roster surface: add the desktop admin
  roster/program workspace inside the existing Activity/Manage area with
  list/search/filter, create/edit/archive Activity + Enrollment +
  TeachingAssignment flows, empty/loading/error states, EN/HE labels, and
  source links. Do not add a top-level `ACADEMICS` route.
- [x] Ensembles/programs teacher read, smoke, and promotion: add mobile-reachable
  assigned-teacher roster read from staff/calendar context and D-17 attendance
  links only where prepared lesson rows already exist. Add Playwright smoke and
  promote packet/header plus `features/forteTree.ts` only if the bird's-eye
  completion bar holds.
- [x] Exams/report-cards helper and security foundation: broaden assessment
  helper/mapping tests for session ordering, missing scores, multi-examiner
  rows, revoked certificates, report-card draft/release flags, and stable
  filters. Add static/env-gated security coverage for admin full access,
  assigned-examiner own submissions, plain member/finance/other-teacher/anon
  denial, private storage scope, and cross-org isolation. No UI work.
- [x] Exams/report-cards assessment workspace: add private Manage/academic
  assessment surface plus assigned-examiner submission workflow for sessions,
  submissions, certificates, and report-card drafts with D-22 provisional
  private delivery and explicit guardian-release flags. No public/tokenized
  examiner or guardian delivery.
- [x] Exams/report-cards student history, smoke, and promotion: add contextual
  Student assessment/certificate/report-card history, mobile examiner smoke,
  Playwright workflow, packet/header updates, and `features/forteTree.ts`
  promotion only if the bird's-eye completion bar holds.
- [x] Concerts/events helper and security foundation: broaden concert helper and
  mapping tests for draft/cancelled ordering, unlinked programs, duplicate piece
  order, null cumulative duration after unknown durations, stale performers, and
  staff/student performer lookup. Add static/env-gated security coverage for
  admin full access, assigned/performing staff own read, plain member/finance/
  other-teacher/anon denial, private storage scope, and cross-org isolation. No
  UI work.
- [x] Concerts/events private planning surface: add Calendar event detail and
  Activity/program-context program workspace for private concert programs,
  ordered pieces, performers, run-of-show, private print/export references,
  empty/loading/error states, EN/HE labels, and D-23 provisional redaction/
  media-release states. Do not add public website/program exposure.
- [x] Concerts/events teacher run-of-show, smoke, and promotion: add
  mobile-reachable teacher/performer own run-of-show read, Playwright workflow,
  packet/header updates, and `features/forteTree.ts` promotion only if the
  bird's-eye completion bar holds.
- [x] Rooms/absence helper and request security foundation: broaden
  `listRoomRequests`, `listAbsencesForPeriod`, `applyApprovedRoomChange`, and
  Admin Inbox approval helper coverage for terminal statuses, own-request
  filtering, stale event/room links, and D-21 review-task-only behavior. Add
  static/env-gated security coverage for teacher own pending create/cancel,
  no teacher decision/other-staff access, plain member/finance/anon denial, and
  cross-org isolation. No UI work.
- [x] Rooms/absence teacher request surface: add mobile-reachable teacher
  room-change/absence/day-off request creation, cancel, status, empty/loading/
  error states, EN/HE labels, and linked approval-request creation. D-21
  provisional behavior must create review tasks/flags only, not automatic
  schedule/payroll mutation.
- [x] Rooms/absence Admin Inbox review, smoke, and promotion: add Admin Inbox
  request review/decision states, review-task side effects only, Playwright
  smoke, packet/header updates, and `features/forteTree.ts` promotion only if
  the bird's-eye completion bar holds.
- [x] Calendar integrations helper/token foundation: implement exported
  deterministic helpers for `listActiveSubscriptions`, `resolvePublicToken`,
  and `listExternalSyncState`; move token logic toward `public_endpoints`
  hashing/scope/status/expiry semantics; add stale-filter, duplicate-token,
  iCal filtering/escaping, mapping, static schema, and env-gated resolver/RLS
  coverage. No UI work.
- [ ] Calendar integrations Manage surface, smoke, and promotion: harden the
  existing Manage subscriptions and Settings integration states with endpoint
  audit, token rotation/revocation, no raw durable token display, valid/revoked
  resolver smoke, EN/HE labels, RTL/LTR token isolation, packet/header updates,
  and `features/forteTree.ts` promotion. Public website/embed exposure remains
  D-23 provisional and private/off by default.
- [ ] Year rollover helper/run foundation: broaden rollover helper/mapping tests
  for D-12 prior-year immutability, stale preview detection, terminal run
  statuses, failed apply capture, warnings, and D-27 preview-first draft
  copy-forward semantics. Add static/env-gated security coverage for admin-only
  `rollover_runs`, finance denial unless explicitly scoped, anon denial, and
  cross-org isolation. No UI work.
- [ ] Year rollover Settings preview surface, smoke, and promotion: add Settings
  Academic Calendar rollover run history, preview, cancel, warnings, draft
  copy-forward plan display, no prior-year mutation, EN/HE labels, Playwright
  smoke, packet/header updates, and `features/forteTree.ts` promotion. Apply
  stays preview-first/reviewable under D-27 and must not silently mutate
  prior-year records.
- [ ] Teacher evaluation/HR helper and security foundation: broaden HR helper/
  mapping tests for due/overdue edge cases, action completion, rating
  validation, acknowledged status, and feature-tree audit-field drift. Add
  static/env-gated security coverage for D-26 provisional superadmin/HR-admin
  scope, no broad member read, no finance/public access, private storage scope,
  and cross-org isolation. No UI work.
- [ ] Teacher evaluation/HR staff detail surface: add HR-admin scoped Staff
  detail evaluation tab/workspace with due list, create/edit/complete,
  follow-up actions, explicit acknowledgment flag, retention/review labels,
  empty/loading/error states, EN/HE labels, and no public/token path.
- [ ] Teacher evaluation/HR smoke and promotion: add Playwright workflow for HR
  admin evaluation lifecycle and subject acknowledgment if surfaced, packet/
  header updates, release-hardening notes for D-26 policy review, and
  `features/forteTree.ts` promotion only if the bird's-eye completion bar holds.

### Stage 5 - Campaign Completion

- [ ] Final campaign promotion: after all three packets are implemented and every
  remaining bird's-eye surfaces are visible and every completion checklist item
  below is true, refresh handoff/roadmap/status docs, append an iteration note
  here, confirm live Supabase/policy hardening items are recorded as release
  gates, and replace this file's first line with `BUILD COMPLETE`.

## Completion Checklist (all required before BUILD COMPLETE)

- [x] `agreements-consent` is product-built in `features/forteTree.ts` and its
  packet header under bird's-eye mode, with D-07/D-11/D-14/D-16 reflected in
  code, tests, packet docs, handoffs, and live-RLS release gates.
- [x] Agreement templates/requests support admin management, typed signature, PDF
  reference capture, student/family history, EN/HE labels, RTL/mobile signing,
  and packet-local backfill/import semantics.
- [x] Agreement direct table/storage access is admin-only or explicitly scoped;
  public signing uses D-07/D-14 token control and no broad anon table policies.
- [x] `reports-analytics` is implemented in `features/forteTree.ts` and its
  packet header, with D-08/D-09 source authorization enforced in code/tests/docs.
- [x] Reports route `ANALYTICS` to a real surface before palette visibility,
  support definition management, run/results, grouped summaries where shipped,
  lineage, CSV export, blocked-source markers, EN/HE labels, and RTL states.
- [x] Finance users can run/export only allowed finance/payroll reports and
  cannot create shared definitions or access hidden source data.
- [x] `operations-command-center` is implemented in `features/forteTree.ts` and
  its packet header, living in the existing Admin Inbox surface without a new
  ViewState.
- [x] Operations cards are source-authorized, role-filtered, deep-linked, EN/HE
  labeled, and do not leak hidden counts for unauthorized or blocked sources.
- [ ] Live Supabase RLS release gates for agreements, reports, and operations are
  recorded with exact env/migration blockers where they cannot run yet; static
  schema tests and local/e2e coverage pass.
- [ ] Relevant Playwright smokes pass for agreements, reports, and operations.
- [ ] First-pass bird's-eye surfaces exist for ensembles/programs,
  exams/report-cards, concerts/events, rooms/absence requests, calendar
  integrations/year rollover, and teacher evaluation/HR, with provisional
  D-21-D-27 defaults visible where applicable.
- [ ] `npm run typecheck -- --diagnostics` passes.
- [ ] `npx vitest run --reporter=dot` passes.
- [ ] D-21-D-27 provisional assumptions are documented in packet docs, the
  decision log, and release-hardening notes wherever they surface.

## Next Unit

- Calendar integrations Manage surface, smoke, and promotion: harden the
  existing Manage subscriptions and Settings integration states with endpoint
  audit, token rotation/revocation, no raw durable token display, valid/revoked
  resolver smoke, EN/HE labels, RTL/LTR token isolation, packet/header updates,
  and `features/forteTree.ts` promotion. Public website/embed exposure remains
  D-23 provisional and private/off by default.

## Setup Notes For Next Agent

- Source `.env.local` for live test credentials when needed, but never print it.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless an explicit migration-push step is being handled by the
  orchestrator.
- Bird's-eye mode is active: live Supabase RLS/migration failures are release
  gates, not implementation blockers. Keep env-gated tests and static schema
  tests; record live skips precisely; continue product implementation unless the
  current unit is explicitly release hardening.
- Required live RLS env vars currently used by the harness:
  `CADENZA_RLS_SUPABASE_URL`, `CADENZA_RLS_SUPABASE_ANON_KEY`,
  `CADENZA_RLS_SUPABASE_SERVICE_ROLE_KEY`, `CADENZA_RLS_ORG_ID`,
  `CADENZA_RLS_CROSS_ORG_ID`, `CADENZA_RLS_ADMIN_EMAIL`,
  `CADENZA_RLS_ADMIN_PASSWORD`, `CADENZA_RLS_TEACHER_EMAIL`,
  `CADENZA_RLS_TEACHER_PASSWORD`, `CADENZA_RLS_TEACHER_STAFF_MEMBER_ID`,
  `CADENZA_RLS_FINANCE_EMAIL`, `CADENZA_RLS_FINANCE_PASSWORD`,
  `CADENZA_RLS_CROSS_ORG_EMAIL`, and `CADENZA_RLS_CROSS_ORG_PASSWORD`.
- Agreement direct-table live RLS assertions are present, but the current remote
  project has not applied `0008_agreement_direct_table_rls.sql`.
  `SUPABASE_DB_PASSWORD` was present by presence-only check on 2026-06-19, but
  `npx supabase migration list` failed password authentication for the linked
  Postgres user. Refresh/fix the DB password without recording its value, apply
  migrations, then rerun `npx vitest run utils/rlsLive.test.ts --reporter=dot`
  to convert that skip into real RLS-LIVE coverage.
- Agreement token signing live RLS assertions are present, but the current remote
  project had not applied `0009_agreement_acceptance_public_submit.sql` during
  this iteration. Apply migrations with `SUPABASE_DB_PASSWORD` available, then
  rerun `npx vitest run utils/rlsLive.test.ts --reporter=dot` to convert that
  skip into real RLS-LIVE coverage. No additional live env vars were introduced.
- Agreement private PDF storage live RLS assertions are present, but the current
  remote project had not applied `0010_agreement_private_pdf_storage_rls.sql`
  during this iteration. Apply migrations with `SUPABASE_DB_PASSWORD` available,
  then rerun `npx vitest run utils/rlsLive.test.ts --reporter=dot` to convert
  that skip into real RLS-LIVE coverage. No additional live env vars were
  introduced.
- Agreement public read live RLS assertions are present, but the current remote
  project had not applied `0011_agreement_acceptance_public_read.sql` during this
  iteration. Apply migrations with `SUPABASE_DB_PASSWORD` available, then rerun
  `npx vitest run utils/rlsLive.test.ts --reporter=dot` to convert that skip
  into real RLS-LIVE coverage. No additional live env vars were introduced.
- Reports definition live RLS assertions are present, but the current remote
  project has not applied `0012_report_definition_rls.sql`; the focused verbose
  live run skipped the D-09 report definition case with that exact blocker.
  Apply migrations with `SUPABASE_DB_PASSWORD` available, then rerun
  `npx vitest run utils/rlsLive.test.ts --reporter=verbose --testTimeout=30000`
  to convert that skip into real RLS-LIVE coverage. No additional live env vars
  were introduced.
- Agreement promotion is no longer blocked for bird's-eye product shape. Promote
  with an explicit release-hardening caveat; do not claim production security
  until the agreement live RLS assertions pass without skips.
- Agreement closeout verification blockers from the 2026-06-19 restricted loop
  sandbox: `npm run test:e2e -- e2e/agreement-signing-capture.spec.ts` failed
  before browser execution because Vite could not listen on `0.0.0.0:3000`
  (`EPERM`), and manual `npx vite --mode e2e --host 127.0.0.1 --port 3000`
  failed with the same `EPERM`. The exact full `npx vitest run --reporter=dot`
  command reached live RLS because live env vars were present, then failed DNS
  lookup for `mgkhhwzqpwfvresmmytc.supabase.co` (`getaddrinfo ENOTFOUND`) under
  restricted network. Rerunning with the `CADENZA_RLS_*` variables unset passed
  the local/static suite with the live RLS file skipped.
- Reports run/export source-authorization live checks are present. The new live
  report source-authorization case passed where credentials were available,
  while the full suite still had four existing live RLS skips for unapplied
  remote migrations already documented above (`0008`-`0012`). No additional env
  vars were introduced.
- Operations snapshot/source-authorization live checks are present. The focused
  verbose live run skipped the operations snapshot source-authorization case
  because the current remote project has not applied
  `0012_report_definition_rls.sql`; apply migrations with `SUPABASE_DB_PASSWORD`
  available, then rerun `npx vitest run utils/rlsLive.test.ts --reporter=verbose
  -t "operations snapshot source authorization"` to convert that skip into real
  RLS-LIVE coverage. No additional live env vars were introduced.
- Ensembles/programs scoped roster live RLS assertions are present, but the
  current remote project has not applied
  `0013_roster_program_scoped_read.sql`; apply migrations with
  `SUPABASE_DB_PASSWORD` available, then rerun
  `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t "scoped roster/program"`
  to convert that skip into real RLS-LIVE coverage. No additional live env vars
  were introduced.
- Exams/report-cards scoped assessment live RLS assertions are present, but the
  current remote project has not applied `0014_assessment_scoped_rls.sql`; apply
  migrations with `SUPABASE_DB_PASSWORD` available, then rerun
  `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t "assessment table and private document scope"`
  to convert that skip into real RLS-LIVE coverage. No additional live env vars
  were introduced.
- Concerts/events scoped program live RLS assertions are present, but the
  current remote project has not applied `0015_concert_program_scoped_rls.sql`;
  apply migrations with `SUPABASE_DB_PASSWORD` available, then rerun
  `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t "concert program table and private document scope"`
  to convert that skip into real RLS-LIVE coverage. No additional live env vars
  were introduced.
- Concerts/events is promoted under bird's-eye mode with private authenticated
  admin planning plus mobile linked-teacher run-of-show read. D-23 public event,
  program, performer, website, embed, and public file exposure remains a release
  gate; do not add public routes or public storage URLs before the D-23 policy
  review and D-14 endpoint setup.
- Rooms/absence scoped operational request live RLS assertions are present, but
  the current remote project has not applied
  `0016_rooms_absence_request_rls.sql`; apply migrations with
  `SUPABASE_DB_PASSWORD` available, then rerun
  `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t "rooms/absence operational request"`
  to convert that skip into real RLS-LIVE coverage. No additional live env vars
  were introduced.
- Calendar subscription endpoint resolver live RLS assertions are present, but
  the current remote project has not applied
  `0017_calendar_subscription_endpoint_resolver.sql`; apply migrations with
  `SUPABASE_DB_PASSWORD` available, then rerun
  `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t "calendar subscription resolver"`
  to convert that skip into real RLS-LIVE coverage. No additional live env vars
  were introduced.
- Build-loop logs in `.build-loop/` are ignored.

## Iteration Notes

- 2026-06-19 seed for combined P1 campaign: after committing and pushing
  completed payments at `5a6fb45`, replaced the completed payments loop memory
  with an active queue for `agreements-consent`, `reports-analytics`, and
  `operations-command-center`. No product implementation has been made in this
  seed step.
- 2026-06-19 baseline audit: read the handoff, roadmap, agreements/reports/
  operations packets, decision log, route policy, status policy, finance scope,
  feature tree, helper tests, Supabase mapping, RLS migrations/tests, public
  endpoint registry, and storage helpers. Split oversized future security/UI
  units while preserving D-21-D-27 blocked scope. Current findings: agreements
  helpers exist but need broader edge coverage; agreement template/acceptance
  tables still inherit broad member-read RLS; agreement signing has no scoped
  token path yet; shared `documents` storage is still org-member readable;
  reports helpers exist but currently accept arbitrary fields and lack source
  authorization; `ANALYTICS` remains hidden/unrouted; operations helper names are
  still documented stubs in `features/forteTree.consistency.test.ts`; operations
  must stay in Admin Inbox. Changed files: `docs/blueprint-planning/BUILD_LOOP_STATE.md`.
  Verification: `npx vitest run features/forteTree.consistency.test.ts
  utils/blueprintQueries.test.ts utils/supabaseSync.test.ts
  utils/supabaseSchema.test.ts --reporter=dot` passed (101 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (277 tests). No product implementation was changed.
- 2026-06-19 agreements helper/mapping coverage: strengthened
  `listUnsignedAgreements` target matching for legacy student inputs plus scoped
  student/family/enrollment/guardian requirements, treated `SUPERSEDED` prior
  rows as stale signatures, and added deterministic tie-break sorting for
  agreement history/enrollment lookups. Added helper coverage for guardian-
  required templates, declined/expired/superseded rows, inactive templates, and
  stable sorting. Added normalized Supabase mapping coverage for
  `agreement_templates`, `agreement_acceptances`, and `AGREEMENT_ACCEPTANCE`
  `public_endpoints` without raw-token columns. Changed files:
  `utils/blueprintQueries.ts`, `utils/blueprintQueries.test.ts`,
  `utils/supabaseSync.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts utils/supabaseSync.test.ts
  --reporter=dot` passed (91 tests); `npm run typecheck -- --diagnostics`
  passed; `npx vitest run --reporter=dot` passed (283 tests). No UI, RLS, token
  signing, storage, route, or blocked D-21-D-27 scope was changed.
- 2026-06-19 agreement direct-table RLS foundation: added
  `0008_agreement_direct_table_rls.sql` to replace broad org-member direct reads
  on `agreement_templates` and `agreement_acceptances` with admin-only direct
  read/write policies. Added static schema coverage proving no member, finance,
  teacher, staff-self, or anon direct access helpers are present, and added
  env-gated live RLS coverage for admin access plus teacher/plain member,
  finance, anon, and cross-org denial. The live project credentials were present,
  but the remote database had not applied `0008`; `SUPABASE_DB_PASSWORD` was
  missing, so migration status/push could not be completed. The agreement live
  assertion therefore skipped with that blocker; RLS-LIVE is not claimed yet for
  this agreement slice. Changed files:
  `supabase/migrations/0008_agreement_direct_table_rls.sql`,
  `utils/supabaseSchema.test.ts`, `utils/rlsLive.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/supabaseSchema.test.ts utils/rlsLive.test.ts
  --reporter=dot` passed (21 tests, 1 skipped for unapplied remote `0008`);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (285 tests, 1 skipped for unapplied remote `0008`). No token signing,
  storage, UI, route, or blocked D-21-D-27 scope was changed.
- 2026-06-19 agreement token signing foundation: added
  `0009_agreement_acceptance_public_submit.sql` with a D-07/D-14
  SECURITY DEFINER `submit_agreement_acceptance` RPC for scoped
  `AGREEMENT_ACCEPTANCE` endpoints. The RPC validates `public_endpoints`, active
  status, expiry, `agreement_acceptance:sign` scope, configured consent
  agreement, exact target lineage, pending status, explicit decision
  confirmation, signer name, and accept/decline action; successful decisions
  update only the target `agreement_acceptances` row and expire the endpoint.
  Added `utils/publicAgreementSigning.ts` plus unit coverage for payload
  validation, hashed-token RPC submit, accepted/declined states, and structured
  endpoint/reuse errors. Added static schema coverage proving no anon table
  grants and env-gated live RLS coverage for valid token sign, target mismatch,
  expired token denial, reused token denial, and anon direct table denial. The
  live project credentials were present, but the remote database had not applied
  `0009`; the agreement token live assertion skipped with that blocker, so
  RLS-LIVE is not claimed yet for this agreement slice. Changed files:
  `supabase/migrations/0009_agreement_acceptance_public_submit.sql`,
  `utils/publicAgreementSigning.ts`, `utils/publicAgreementSigning.test.ts`,
  `utils/supabaseSchema.test.ts`, `utils/rlsLive.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/publicAgreementSigning.test.ts utils/supabaseSchema.test.ts
  --reporter=dot` passed (22 tests); `npx vitest run utils/rlsLive.test.ts
  --reporter=verbose` passed (6 passed, 2 skipped for unapplied remote `0008`
  and `0009`); `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (292 tests, 2 skipped for unapplied remote agreement
  migrations). No signing UI, storage, route, or blocked D-21-D-27 scope was
  changed.
- 2026-06-19 agreement private PDF storage foundation: added
  `0010_agreement_private_pdf_storage_rls.sql` to exclude
  `{orgId}/agreements/...` objects from broad org-member `documents` reads and
  add admin-only direct reads for signed agreement/PDF files. Added static
  storage-policy coverage proving no org-member, finance, staff-self, or anon
  read path for the agreements prefix, plus env-gated live storage RLS coverage
  for admin download allowed and teacher/plain member, finance, anon, and
  cross-org download denial. Updated the Supabase migration map with the
  agreement PDF path convention. The live project credentials were present, but
  the remote database had not applied `0010`; the agreement PDF storage live
  assertion skipped with that blocker, so RLS-LIVE is not claimed yet for this
  agreement slice. Changed files:
  `supabase/migrations/0010_agreement_private_pdf_storage_rls.sql`,
  `utils/supabaseSchema.test.ts`, `utils/rlsLive.test.ts`,
  `docs/SUPABASE_MIGRATION_MAP.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/supabaseSchema.test.ts utils/rlsLive.test.ts
  --reporter=dot` passed (24 tests, 3 skipped for unapplied remote `0008`,
  `0009`, and `0010`); `npx vitest run utils/rlsLive.test.ts
  --reporter=verbose` passed (6 passed, 3 skipped with explicit remote migration
  blockers); `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (294 tests, 3 skipped for unapplied remote agreement
  migrations). No PDF capture UI, signing UI, route, or blocked D-21-D-27 scope
  was changed.
- 2026-06-19 agreement admin surface: added a desktop Manage `agreements` tab
  with synced `agreementTemplates`/`agreementAcceptances`, template list/search/
  kind/status filters, active/inactive and guardian-required states, create,
  immutable new-version activation, activate/deactivate, pending student/family/
  enrollment request issuance, request history, unsigned queue, loading/empty/
  save-error states, EN/HE labels, and RTL-safe template bodies. Added pure
  helper coverage for unsigned target derivation, summaries, filters, versioning,
  and pending request rows, plus a Playwright smoke for Manage -> Agreements ->
  create template -> create version -> issue pending student request. Updated the
  route policy to list agreement templates as a Manage tab. Changed files:
  `App.tsx`, `components/ManageHub.tsx`, `components/AgreementManager.tsx`,
  `components/AgreementManager.test.tsx`, `e2e/agreement-admin.spec.ts`,
  `docs/blueprint-planning/route-nav-policy.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run components/AgreementManager.test.tsx --reporter=dot` passed
  (5 tests); `npm run test:e2e -- e2e/agreement-admin.spec.ts` passed (1 test);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (299 passed, 3 skipped for unapplied remote agreement migrations). No
  public signing UI, PDF capture workflow, student/family history, RLS policy, or
  blocked D-21-D-27 behavior was changed.
- 2026-06-19 student/family agreement history: connected the existing
  Student/Family Agreements detail tab to synced agreement templates and
  acceptances through the contextual detail model. Added student/family
  agreement history rows, unsigned requirement rows via `listUnsignedAgreements`,
  enrollment-specific targets, family-led financial targets, signature reference
  display, EN/HE labels, loading/empty states, and guardian display from
  `families.guardians[]` only. Added unit coverage for student enrollment
  history/unsigned status and family history isolation, and updated the
  student-family Playwright smoke to assert accepted history plus an unsigned
  consent requirement. Changed files: `App.tsx`,
  `components/StudentFamilyWorkspace.tsx`, `constants.ts`,
  `utils/studentFamilyDetail.ts`, `utils/studentFamilyDetail.test.ts`,
  `e2e/student-family.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/studentFamilyDetail.test.ts
  components/AgreementManager.test.tsx --reporter=dot` passed (11 tests);
  `npm run test:e2e -- e2e/student-family.spec.ts` passed (3 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (301 passed, 3 skipped for unapplied remote agreement migrations). No
  public signing UI, PDF upload/capture workflow, RLS policy, route/palette
  change, or blocked D-21-D-27 behavior was changed.
- 2026-06-19 public signing and PDF capture: added
  `0011_agreement_acceptance_public_read.sql` with a D-07/D-14 scoped
  `get_public_agreement_acceptance` RPC so public signers can read only the
  pending target/template behind an `AGREEMENT_ACCEPTANCE` endpoint, with no anon
  table grants. Added `/agreement/:token` mobile signing UI with EN/HE, RTL,
  explicit typed signature consent, accept/decline submit through
  `submit_agreement_acceptance`, and e2e-only hooks matching the registration
  pattern. Added admin countersigned PDF upload/reference capture in Manage ->
  Agreements using the private `{orgId}/agreements/{acceptanceId}/...` storage
  prefix and `signatureRef`, without withdrawal/revocation, assessment delivery,
  media release, or instrument deposit/refund behavior. Changed files:
  `App.tsx`, `components/PublicAgreementSigningForm.tsx`,
  `components/AgreementManager.tsx`, `components/AgreementManager.test.tsx`,
  `e2e/agreement-signing-capture.spec.ts`,
  `supabase/migrations/0011_agreement_acceptance_public_read.sql`,
  `utils/publicAgreementSigning.ts`, `utils/publicAgreementSigning.test.ts`,
  `utils/storageUtils.ts`, `utils/supabaseSchema.test.ts`,
  `utils/rlsLive.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/publicAgreementSigning.test.ts
  components/AgreementManager.test.tsx utils/supabaseSchema.test.ts
  --reporter=dot` passed (33 tests); `npm run test:e2e --
  e2e/agreement-signing-capture.spec.ts` passed (2 tests); `npx vitest run
  utils/publicAgreementSigning.test.ts components/AgreementManager.test.tsx
  utils/supabaseSchema.test.ts utils/rlsLive.test.ts --reporter=dot` passed
  (39 passed, 3 skipped for unapplied remote agreement migrations); `npm run
  typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot` passed
  (305 passed, 3 skipped for unapplied remote agreement migrations). Agreement
  packet promotion remains for the next queue unit.
- 2026-06-19 agreement smoke/promotion attempt: strengthened
  `e2e/agreement-signing-capture.spec.ts` with an integrated smoke covering
  admin template creation -> student request issuance -> 390x844 public typed
  signing -> Manage accepted history -> Student/Family agreement history with
  unsigned helper rows cleared, while preserving the PDF capture history smoke.
  Did not promote `agreements-consent` packet header or `features/forteTree.ts`
  because agreement live RLS still skips: the remote project has not applied
  `0008`, `0009`, and `0010` (and `0011` remains listed as unapplied in setup
  notes), and `npx supabase migration list` failed password authentication even
  though `SUPABASE_DB_PASSWORD` was present by presence-only check. Changed
  files: `e2e/agreement-signing-capture.spec.ts` and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npm run test:e2e -- e2e/agreement-signing-capture.spec.ts` passed (3 tests);
  `zsh -lc 'source .env.local >/dev/null 2>&1 || true; npx vitest run
  utils/rlsLive.test.ts --reporter=verbose --testTimeout=30000'` passed (6
  passed, 3 skipped for unapplied remote agreement migrations);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (305 passed, 3 skipped). Queue item remains unchecked and Next Unit
  remains the agreement Playwright smoke and promotion gate.
- 2026-06-19 agreement promotion gate recheck: reran the existing integrated
  agreement Playwright smoke and the required verification gates. The smoke still
  passes, but promotion remains blocked because live agreement RLS assertions
  still skip for unapplied remote migrations `0008`, `0009`, and `0010`; `npx
  supabase migration list` still fails Postgres SASL password authentication even
  though all required live RLS env vars and `SUPABASE_DB_PASSWORD` were present
  by presence-only check. Did not promote the packet header or
  `features/forteTree.ts`, and left the queue item unchecked. Changed files:
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npm run test:e2e -- e2e/agreement-signing-capture.spec.ts` passed (3 tests);
  `zsh -lc 'source .env.local >/dev/null 2>&1 || true; npx vitest run
  utils/rlsLive.test.ts --reporter=verbose --testTimeout=30000'` passed (6
  passed, 3 skipped for unapplied remote agreement migrations); `npm run
  typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot` passed
  (305 passed, 3 skipped).
- 2026-06-19 agreement smoke split: split the combined agreement smoke/promotion
  queue item into a completed Playwright-smoke subunit and a remaining live
  RLS/promotion subunit. Reran the integrated agreement smoke covering admin
  template creation, student request issuance, 390x844 public typed signing,
  accepted Manage and Student/Family history, unsigned-helper clearing, and PDF
  upload history. Promotion remains blocked because live agreement RLS assertions
  still skip for unapplied remote migrations `0008`, `0009`, and `0010`; `npx
  supabase migration list` still fails Postgres SASL password authentication even
  though all required live RLS env vars and `SUPABASE_DB_PASSWORD` were present
  by presence-only check. Did not promote the packet header or
  `features/forteTree.ts`. Changed files:
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `zsh -lc 'source .env.local >/dev/null 2>&1 || true; npx vitest run
  utils/rlsLive.test.ts --reporter=verbose --testTimeout=30000'` passed (6
  passed, 3 skipped for unapplied remote agreement migrations); `npm run
  test:e2e -- e2e/agreement-signing-capture.spec.ts` passed (3 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (305 passed, 3 skipped).
- 2026-06-19 bird's-eye loop prep: pivoted the next loop from live-RLS-blocked
  P1 completion to a bird's-eye Blueprint completion campaign. Live Supabase RLS
  and remote migration application are now release-hardening gates rather than
  product-build blockers; D-21-D-27 are accepted provisional defaults for
  conservative, reversible, auditable first-pass surfaces. Added a dedicated
  release-hardening gate file and refreshed next-agent instructions. The next
  unit is Agreement bird's-eye status closeout, followed by reports, operations,
  and remaining module surfaces. Changed files: `build-loop.sh`,
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`,
  `docs/blueprint-planning/NEXT_AGENT_LOOP.md`,
  `docs/blueprint-planning/RELEASE_HARDENING_GATES.md`,
  `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`,
  `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`,
  `docs/blueprint-planning/decision-log.md`, and
  `docs/blueprint-planning/status-policy.md`. Verification: `bash -n
  build-loop.sh` passed. No product code was changed.
- 2026-06-19 agreement bird's-eye status closeout: promoted
  `agreements-consent` to product-built under bird's-eye mode without claiming
  production security. Updated the packet header/current-state text, the
  `features/forteTree.ts` node, roadmap/handoff status, and
  `RELEASE_HARDENING_GATES.md` so unapplied remote agreement migrations
  `0008`-`0011`, live RLS skips, restricted-network DNS failure, and local Vite
  bind failure are explicit release/local verification gates. Changed files:
  `features/forteTree.ts`,
  `docs/blueprint-planning/packets/agreements-consent.md`,
  `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`,
  `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`,
  `docs/blueprint-planning/status-policy.md`,
  `docs/blueprint-planning/RELEASE_HARDENING_GATES.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run features/forteTree.consistency.test.ts
  utils/blueprintQueries.test.ts utils/supabaseSchema.test.ts --reporter=dot`
  passed (84 tests); `npm run typecheck -- --diagnostics` passed; exact
  `npx vitest run --reporter=dot` failed in the restricted sandbox when the live
  RLS harness hit `getaddrinfo ENOTFOUND mgkhhwzqpwfvresmmytc.supabase.co`;
  rerun with `CADENZA_RLS_*` variables unset passed (299 passed, 1 skipped);
  `npm run test:e2e -- e2e/agreement-signing-capture.spec.ts` failed before
  browser execution because Vite could not bind `0.0.0.0:3000` (`EPERM`), and a
  manual `127.0.0.1:3000` Vite start failed with the same blocker.
- 2026-06-19 reports helper/allowlist foundation: added report source and field
  allowlists, runtime report-definition validation, finance-only source
  allowlists, and blocked-source markers for provisional D-21-D-27 report packs.
  `runReportDefinition` now validates columns, filters, aggregate fields, and
  actor source access before processing rows; it also produces stable source-ID
  ordering, explicit null/empty grouping, numeric-only avg/min/max behavior, and
  aggregate-none grouped counts. Broadened report helper tests for invalid
  columns/operators, all filter operators, null/empty values, aggregate none,
  grouped average/min/max, stable order, lineage after filtering, D-xx blocked
  markers, and D-09 finance source limits. Changed files:
  `utils/blueprintQueries.ts`, `utils/blueprintQueries.test.ts`,
  `types/blueprint.ts`, and `docs/blueprint-planning/BUILD_LOOP_STATE.md`.
  Verification: `npx vitest run utils/blueprintQueries.test.ts --reporter=dot`
  passed (69 tests); `npm run typecheck -- --diagnostics` passed; `npx vitest
  run --reporter=dot` passed (312 passed, 3 skipped). No UI, route/palette, RLS,
  migration, report definition persistence, export path, or D-21-D-27 product
  behavior was changed.
- 2026-06-19 reports definition RLS foundation: added
  `0012_report_definition_rls.sql` to replace broad member reads on
  `report_definitions` with D-09 admin reads plus finance-capable non-admin reads
  limited to finance/payroll-authorized sources (`charges`, `payments`,
  `hoursEntries`), while keeping all direct writes admin-only. Added static
  schema coverage for the latest report-definition policies and live RLS coverage
  for admin full access, finance limited read/no write, teacher/plain member
  denial, anon denial, and cross-org isolation. The remote project has not
  applied `0012`, so the live D-09 report definition assertion skipped with that
  exact migration blocker; RLS-LIVE is not claimed for this reports slice yet.
  Changed files: `supabase/migrations/0012_report_definition_rls.sql`,
  `utils/supabaseSchema.test.ts`, `utils/rlsLive.test.ts`,
  `docs/blueprint-planning/RELEASE_HARDENING_GATES.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/supabaseSchema.test.ts --reporter=dot` passed (21
  tests); `npx vitest run utils/rlsLive.test.ts --reporter=verbose
  --testTimeout=30000` passed (6 passed, 4 skipped: `0012` reports plus
  agreement `0008`, `0009`, and `0010`); `npm run typecheck -- --diagnostics`
  passed; `npx vitest run --reporter=dot` passed (314 passed, 4 skipped). No UI,
  route/palette, report runner/export source authorization, or D-21-D-27 product
  behavior was changed.
- 2026-06-19 reports run/export source authorization: enforced explicit
  source-row authorization for finance report runs, including matching actor,
  matching source entity, and authorized source-row IDs before filtering or
  export. `exportReportCsv` now rejects finance exports unless the result was
  produced by an authorized finance run, while admin exports remain unchanged.
  Added deterministic coverage proving finance can run/export only authorized
  `charges` rows and cannot use reports for student, attendance, agreement,
  assessment, concert, HR, rollover, hidden public-endpoint, or blocked-source
  data. Added a live/source-authorization harness case that seeds representative
  source rows and proves the same report-run/export guard over live source data.
  Changed files: `utils/blueprintQueries.ts`,
  `utils/blueprintQueries.test.ts`, `utils/rlsLive.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts --reporter=dot` passed (71
  tests); `npx vitest run utils/supabaseSchema.test.ts utils/rlsLive.test.ts
  --reporter=dot` passed (28 passed, 4 skipped for existing unapplied remote
  migrations); `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (317 passed, 4 skipped). No UI, route/palette, report
  builder/library, migration, or D-21-D-27 product behavior was changed.
- 2026-06-19 analytics route/library shell: routed `ANALYTICS` to a real Reports
  workspace shell and added it to the routed-view/palette allowlist with no
  sidebar entry. Added a dense report library list with search, source/status
  filters, loading/empty/no-match/permission/stale-source states, admin vs
  finance actor filtering, EN/HE labels, and RTL-safe date/count values. Left
  builder, run, export, chart, lineage, and packet promotion for the next units.
  Changed files: `App.tsx`, `routing.ts`, `routing.test.ts`,
  `components/ReportsWorkspace.tsx`, `components/ReportsWorkspace.test.tsx`,
  `e2e/reports-library.spec.ts`,
  `docs/blueprint-planning/route-nav-policy.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run routing.test.ts components/ReportsWorkspace.test.tsx
  --reporter=dot` passed (13 tests); `npm run test:e2e --
  e2e/reports-library.spec.ts` passed (2 tests); `npm run typecheck --
  --diagnostics` passed; `npx vitest run --reporter=dot` passed (321 passed, 4
  skipped for existing unapplied remote live-RLS migration gates).
- 2026-06-19 report builder/run/export UI: expanded the Reports workspace from
  library shell to usable admin builder plus run/export detail. Added source-row
  shaping for events, students with family lineage, enrollments, finance rows,
  payroll hours, lesson records, and instruments; admin create/edit/save for
  report definitions; result tables; grouped Recharts bar view; CSV export;
  lineage source chips with links into existing Calendar, Students, Finance,
  Payroll, and Manage Inventory surfaces; EN/HE labels; and finance read-only
  run/export behavior using explicit source-row authorization. Changed files:
  `App.tsx`, `components/ReportsWorkspace.tsx`,
  `components/ReportsWorkspace.test.tsx`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run components/ReportsWorkspace.test.tsx
  utils/blueprintQueries.test.ts --reporter=dot` passed (76 tests);
  `npm run test:e2e -- e2e/reports-library.spec.ts` passed (2 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (323 passed, 4 skipped for existing unapplied remote live-RLS migration
  gates). The fuller reports Playwright smoke and packet promotion remain the
  next queue unit.
- 2026-06-19 reports Playwright smoke and promotion: added the full reports
  Playwright workflow for admin pinned charge-status report create/run/grouped
  view/export/source-link into Finance, finance-capability read-only run/export
  without create, and finance denial of student and attendance definitions.
  Added an e2e/local finance-capability simulation hook and exposed the pinned
  report toggle in the builder. Promoted `reports-analytics` to implemented
  under bird's-eye mode in `features/forteTree.ts` and the packet header/current
  state without claiming production security; live report-definition RLS for
  remote migration `0012` remains in `RELEASE_HARDENING_GATES.md`. Changed
  files: `App.tsx`, `components/ReportsWorkspace.tsx`,
  `e2e/reports-library.spec.ts`, `features/forteTree.ts`,
  `docs/blueprint-planning/packets/reports-analytics.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run components/ReportsWorkspace.test.tsx
  utils/blueprintQueries.test.ts --reporter=dot` passed (76 tests);
  `npm run test:e2e -- e2e/reports-library.spec.ts` passed (4 tests);
  `npx vitest run features/forteTree.consistency.test.ts routing.test.ts
  components/ReportsWorkspace.test.tsx utils/blueprintQueries.test.ts
  utils/supabaseSchema.test.ts --reporter=dot` passed (110 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (323 passed, 4 skipped for existing unapplied remote live-RLS migration
  gates).
- 2026-06-19 operations helper exports: added deterministic operations helper
  exports for `countOpenConflicts`, `listTodayEvents`, and
  `countPendingHoursReports`, reusing existing room-conflict and pending-hours
  semantics. Added pure operations access/source-reference metadata for the
  current helper layer, covering role-filtered output, no hidden-count/source-id
  leakage, D-21-D-27 blocked-card markers, stable severity ordering, timezone
  date windows, hidden/cancelled event exclusion, and stale source references.
  Removed the three operations names from the feature-tree consistency stub list.
  Changed files: `utils/blueprintQueries.ts`,
  `utils/blueprintQueries.test.ts`, `features/forteTree.consistency.test.ts`,
  and `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts
  features/forteTree.consistency.test.ts --reporter=dot` passed (80 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (329 passed, 4 skipped for existing unapplied remote live-RLS migration
  gates). No UI, route/palette, RLS policy, persisted aggregate table, snapshot
  model, packet promotion, or D-21-D-27 product behavior was changed.
- 2026-06-19 operations snapshot helper model: added a pure transient
  `buildOperationsSnapshot` card model over source rows for open room conflicts,
  today's events, open Admin Inbox items, pending hours entries, and report
  health. The model applies the existing role/source access rules, includes
  D-21-D-27 blocked-card markers, filters finance report health to finance-
  authorized definitions only, redacts counts/source IDs for denied or blocked
  cards, and marks stale source references without introducing any persisted
  aggregate table. Changed files: `utils/blueprintQueries.ts`,
  `utils/blueprintQueries.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts --reporter=dot` passed (80
  tests); `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (332 passed, 4 skipped for existing unapplied remote
  live-RLS migration gates). No UI, route/palette, RLS policy, migration, packet
  promotion, or D-21-D-27 product side effect was changed.
- 2026-06-19 operations snapshot/security foundation: strengthened operations
  source-authorization coverage without adding a persisted dashboard table or
  RPC. Added pure tests proving finance, teacher, member, and anonymous actors
  do not receive hidden counts/source IDs even when sensitive source arrays are
  present; added static schema coverage that the command center has no public
  aggregate endpoint and continues to depend on source-specific hours/report RLS;
  and added an env-gated live RLS/source-authorization scenario over seeded
  Calendar, Admin Inbox, hours, and report rows. The live operations assertion is
  skipped on the current remote project until `0012_report_definition_rls.sql` is
  applied. Changed files: `utils/blueprintQueries.test.ts`,
  `utils/supabaseSchema.test.ts`, `utils/rlsLive.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts utils/supabaseSchema.test.ts
  utils/rlsLive.test.ts --reporter=dot` passed (111 passed, 5 skipped);
  `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t "operations
  snapshot source authorization"` skipped with the explicit remote `0012`
  blocker; `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (335 passed, 5 skipped for unapplied remote live-RLS
  migration gates). No UI, route/palette, migration, packet promotion, or
  D-21-D-27 product side effect was changed.
- 2026-06-19 Admin Inbox operations summary shell: added a desktop-first
  operations summary band to the existing Admin Inbox surface without a new
  ViewState or palette/sidebar entry. Wired the pure operations snapshot into UI
  cards for open room conflicts, today's events, open inbox items, pending hours,
  import health, report health, and D-21-D-27 blocked/review-gated sources; added
  EN/HE labels, RTL-safe count/timezone values, loading/empty/error/denied/
  blocked states, and no hidden counts for non-operator denial. Extended the
  snapshot model to include admin-only import-session health over active/error
  import sessions. Changed files: `App.tsx`, `components/AdminInbox.tsx`,
  `components/OperationsSummary.tsx`, `components/OperationsSummary.test.tsx`,
  `constants.ts`, `utils/blueprintQueries.ts`,
  `utils/blueprintQueries.test.ts`, `e2e/operations-summary.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts
  components/OperationsSummary.test.tsx --reporter=dot` passed (84 tests);
  `npm run test:e2e -- e2e/operations-summary.spec.ts` passed (1 test);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (338 passed, 5 skipped for existing unapplied remote live-RLS migration
  gates).
- 2026-06-19 operations drilldowns and role states: added actionable source
  deep-link buttons from the Admin Inbox operations summary into Calendar,
  Payroll, Reports, and Manage surfaces without adding or unhiding routes.
  Calendar drilldowns select the linked event IDs. Added stale-source card
  status/rendering when source references no longer resolve, permission-failure
  copy, source-reference chips, and finance/member role rendering that keeps
  non-finance/admin inbox source rows hidden below the summary. Changed files:
  `App.tsx`, `components/AdminInbox.tsx`,
  `components/OperationsSummary.tsx`, `components/OperationsSummary.test.tsx`,
  `constants.ts`, `utils/blueprintQueries.ts`,
  `utils/blueprintQueries.test.ts`, `e2e/operations-summary.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts
  components/OperationsSummary.test.tsx --reporter=dot` passed (86 tests);
  `npm run test:e2e -- e2e/operations-summary.spec.ts` passed (3 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (340 passed, 5 skipped for existing unapplied remote live-RLS migration
  gates).
- 2026-06-19 operations Playwright smoke and promotion: strengthened the
  operations smoke so the open-inbox card focuses its source Admin Inbox item,
  while preserving Admin Inbox card rendering/drill-down coverage, finance-
  limited rendering, and plain-member denial. Promoted
  `operations-command-center` to implemented under bird's-eye mode in
  `features/forteTree.ts` and the packet header/current state without adding a
  new ViewState or claiming production security. Recorded the operations live
  RLS release gate in `RELEASE_HARDENING_GATES.md`: remote migration
  `0012_report_definition_rls.sql` must be applied before the operations live
  source-authorization assertion can pass without skips. Changed files:
  `components/AdminInbox.tsx`, `e2e/operations-summary.spec.ts`,
  `features/forteTree.ts`,
  `docs/blueprint-planning/packets/operations-command-center.md`,
  `docs/blueprint-planning/RELEASE_HARDENING_GATES.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run components/OperationsSummary.test.tsx
  utils/blueprintQueries.test.ts --reporter=dot` passed (86 tests);
  `npm run test:e2e -- e2e/operations-summary.spec.ts` passed (3 tests);
  `npx vitest run features/forteTree.consistency.test.ts
  components/OperationsSummary.test.tsx utils/blueprintQueries.test.ts
  utils/supabaseSchema.test.ts --reporter=dot` passed (112 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (340 passed, 5 skipped for existing unapplied remote live-RLS migration
  gates).
- 2026-06-19 remaining module audit and split: read the remaining Stage 4
  packets for ensembles/programs, exams/report-cards, concerts/events,
  rooms/absence requests, calendar integrations, year rollover, and teacher
  evaluation/HR, plus handoff, roadmap, decision log, route policy, status
  policy, release-hardening gates, feature-tree/module status, route allowlist,
  Manage/Admin Inbox hosts, and consistency stubs. Split the oversized
  bird's-eye module queue into helper/security foundations, UI surfaces, smoke,
  and promotion subunits. Key audit findings: ensembles should stay in the
  Activity/Manage area with teacher mobile read only; exams/report delivery is
  private with explicit D-22 release flags; concerts stay private with D-23
  redaction/media-release states and no public exposure; rooms/absence uses
  D-21 review tasks/flags only; calendar integrations need
  `public_endpoints`-backed token helpers before UI hardening; rollover stays
  Settings-based, preview-first, and D-27 draft copy-forward only; HR is
  Staff-detail scoped to superadmin/HR-admin D-26 provisional privacy. Changed
  files: `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run features/forteTree.consistency.test.ts --reporter=dot`
  passed (3 tests); `npm run typecheck -- --diagnostics` passed; `npx vitest
  run --reporter=dot` passed (340 passed, 5 skipped for existing unapplied
  remote live-RLS migration gates).
- 2026-06-19 ensembles/programs helper and roster model foundation: broadened
  the deterministic roster helpers to flag archived enrollments, missing or
  archived students, duplicate active roster rows, and L2 group membership
  without counting bad rows as active students. Added a pure
  `buildRosterProgramViewModel` role-filtered model over Activity/Enrollment/
  TeachingAssignment data for admin full access, assigned-teacher roster slices,
  and member/finance denial without hidden counts. Added HYBRID mapping coverage
  for activity-program source records, static schema coverage, and
  `0013_roster_program_scoped_read.sql` with admin-only direct reads plus a
  scoped authenticated roster RPC. Live roster RLS is a release gate until remote
  `0013` is applied. Changed files: `utils/blueprintQueries.ts`,
  `utils/blueprintQueries.test.ts`, `utils/supabaseSync.test.ts`,
  `utils/supabaseSchema.test.ts`, `utils/rlsLive.test.ts`,
  `supabase/migrations/0013_roster_program_scoped_read.sql`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts utils/supabaseSync.test.ts
  utils/supabaseSchema.test.ts utils/rlsLive.test.ts --reporter=dot` passed
  (148 passed, 6 skipped); `npx vitest run utils/rlsLive.test.ts
  --reporter=verbose -t "scoped roster/program"` passed with the roster live
  assertion skipped for unapplied remote `0013`; `npm run typecheck --
  --diagnostics` passed; `npx vitest run --reporter=dot` passed (348 passed, 6
  skipped).
- 2026-06-19 ensembles/programs Manage roster surface: added a desktop
  Rosters & Programs workspace inside Manage -> Activities without adding an
  `ACADEMICS` route. The surface lists/searches/filters ensemble, theory, and
  school-program source rows; creates Activity + L2 group + Enrollment +
  TeachingAssignment source records; opens linked Activity source detail;
  archives roster enrollments, staff assignments, and whole programs with
  source-history visibility; shows loading/empty/save-error/missing-staff/
  missing-student states; and adds EN/HE labels plus source ID links. Added a
  pure roster workspace helper and Playwright admin smoke. Changed files:
  `components/ActivityManager.tsx`, `components/ManageHub.tsx`, `constants.ts`,
  `utils/rosterProgramWorkspace.ts`,
  `utils/rosterProgramWorkspace.test.ts`, `e2e/manage-rosters.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/rosterProgramWorkspace.test.ts --reporter=dot` passed
  (3 tests); `npm run test:e2e -- e2e/manage-rosters.spec.ts` passed (1 test);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (351 passed, 6 skipped). No teacher mobile read, attendance-linking,
  packet promotion, feature-tree promotion, route/palette change, or public/
  tokenized surface was added.
- 2026-06-19 ensembles/programs teacher read, smoke, and promotion: added
  `buildTeacherRosterReadModel` for source-authorized Calendar roster reads,
  limiting non-admin visibility to assigned staff and exposing D-17 attendance
  links only when a prepared `lesson_records` row already exists. Added the
  mobile Calendar event-detail roster card with EN/HE labels and no silent
  lesson-row materialization. Extended the roster Playwright smoke to cover
  390x844 assigned-teacher roster read with one prepared and one unprepared
  roster student, then promoted `ensembles-theory-school-programs` to
  implemented under bird's-eye mode in `features/forteTree.ts` and the packet
  header/current state. Recorded the live roster RLS release gate for remote
  migration `0013_roster_program_scoped_read.sql` in
  `RELEASE_HARDENING_GATES.md`; production security is not claimed until that
  live assertion passes without skips. Changed files:
  `components/CalendarView.tsx`, `constants.ts`, `utils/rosterProgramWorkspace.ts`,
  `utils/rosterProgramWorkspace.test.ts`, `e2e/manage-rosters.spec.ts`,
  `features/forteTree.ts`,
  `docs/blueprint-planning/packets/ensembles-theory-school-programs.md`,
  `docs/blueprint-planning/RELEASE_HARDENING_GATES.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/rosterProgramWorkspace.test.ts --reporter=dot` passed
  (5 tests); `npm run test:e2e -- e2e/manage-rosters.spec.ts` passed (2 tests);
  `npx vitest run features/forteTree.consistency.test.ts
  utils/rosterProgramWorkspace.test.ts utils/blueprintQueries.test.ts
  utils/supabaseSchema.test.ts --reporter=dot` passed (118 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (353 passed, 6 skipped for existing unapplied remote live-RLS migration
  gates).
- 2026-06-19 exams/report-cards helper and security foundation: broadened
  assessment helper coverage and behavior for stable session filtering by status,
  activity, examiner, and student; missing-score multi-examiner submissions;
  revoked-certificate exclusion; pending-certificate stable ordering; and
  report-card draft/released counts in private student summaries. Added
  normalized mapping tests for `exam_sessions`, `examiner_submissions`,
  `certificates`, and `report_cards`, including JSONB arrays/lines and private
  assessment document paths. Added `0014_assessment_scoped_rls.sql` to narrow
  direct assessment table access to admin plus assigned-examiner own session/
  submission scope, keep certificates/report cards admin-only, and protect
  `{orgId}/assessments/...`, `{orgId}/certificates/...`, and
  `{orgId}/report-cards/...` storage prefixes from broad member reads. Added
  static schema coverage, env-gated live RLS assertions, migration-map notes,
  and release-hardening gates. The live assessment assertion skipped because the
  current remote project has not applied `0014_assessment_scoped_rls.sql`.
  Changed files: `utils/blueprintQueries.ts`,
  `utils/blueprintQueries.test.ts`, `utils/supabaseSync.test.ts`,
  `utils/supabaseSchema.test.ts`, `utils/rlsLive.test.ts`,
  `supabase/migrations/0014_assessment_scoped_rls.sql`,
  `docs/SUPABASE_MIGRATION_MAP.md`,
  `docs/blueprint-planning/RELEASE_HARDENING_GATES.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts utils/supabaseSync.test.ts
  utils/supabaseSchema.test.ts utils/rlsLive.test.ts --reporter=dot` passed
  (157 passed, 7 skipped); `npx vitest run utils/rlsLive.test.ts
  --reporter=verbose -t "assessment table and private document scope"` passed
  with the assessment live assertion skipped for unapplied remote `0014`;
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (362 passed, 7 skipped). No UI, route/palette, public/tokenized
  examiner, guardian delivery, packet promotion, or feature-tree promotion was
  added.
- 2026-06-19 exams/report-cards assessment workspace: added a private
  Manage -> Assessments tab without unhiding `ACADEMICS` or adding public/token
  routes. The workspace syncs normalized `examSessions`,
  `examinerSubmissions`, `certificates`, and `reportCards`; supports admin
  private session creation/status updates, assigned-examiner score/grade/
  remarks submission, pending certificate creation/issue/revoke, and report-card
  draft creation with an explicit D-22 guardian-release flag. Added EN/HE labels,
  loading/empty/denied states, private-delivery copy, and a focused Playwright
  smoke for session -> submission -> certificate -> report-card draft. Changed
  files: `App.tsx`, `components/ManageHub.tsx`,
  `components/AssessmentWorkspace.tsx`, `e2e/assessment-workspace.spec.ts`,
  `docs/blueprint-planning/route-nav-policy.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts utils/supabaseSync.test.ts
  utils/supabaseSchema.test.ts --reporter=dot` passed (150 tests);
  `npm run test:e2e -- e2e/assessment-workspace.spec.ts` passed (1 test);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (362 passed, 7 skipped for existing unapplied remote live-RLS migration
  gates). No contextual Student history, mobile examiner smoke, packet
  promotion, feature-tree promotion, public/tokenized examiner path, or guardian
  delivery was added.
- 2026-06-19 exams/report-cards student history, smoke, and promotion: added
  contextual Student assessment/certificate/report-card history from normalized
  `examSessions`, `examinerSubmissions`, `certificates`, and `reportCards`
  without adding public/tokenized examiner or guardian delivery. Extended the
  assessment Playwright workflow to cover admin session -> examiner submission
  -> graded session -> issued certificate -> report-card draft -> Student
  history, plus a 390x844 assigned-examiner submission through the assessment
  context with staff-role simulation. Promoted
  `exams-certificates-report-cards` to implemented under bird's-eye mode in
  `features/forteTree.ts` and the packet header/current state, keeping D-22
  provisional and live RLS migration `0014_assessment_scoped_rls.sql` as release
  gates. Changed files: `App.tsx`, `components/StudentFamilyWorkspace.tsx`,
  `constants.ts`, `utils/studentFamilyDetail.ts`,
  `utils/studentFamilyDetail.test.ts`, `e2e/assessment-workspace.spec.ts`,
  `features/forteTree.ts`,
  `docs/blueprint-planning/packets/exams-certificates-report-cards.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/studentFamilyDetail.test.ts --reporter=dot` passed (7
  tests); `npx vitest run features/forteTree.consistency.test.ts
  utils/studentFamilyDetail.test.ts utils/blueprintQueries.test.ts
  utils/supabaseSchema.test.ts --reporter=dot` passed (125 tests); `npm run
  test:e2e -- e2e/assessment-workspace.spec.ts` passed (2 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (363 passed, 7 skipped for existing unapplied remote live-RLS migration
  gates).
- 2026-06-19 concerts/events helper and security foundation: broadened concert
  helper behavior and coverage for stable draft/cancelled/unlinked program
  ordering, duplicate piece order flags, unknown-duration cumulative nulling,
  stale/archived student and staff performers, and separate student/staff
  performer lookup. Added normalized `concert_programs` mapping coverage for
  `pieces[]` JSONB preservation and nullable event links. Added
  `0015_concert_program_scoped_rls.sql` to narrow `concert_programs` direct
  reads to admin plus linked non-finance staff through event participants or
  `performerStaffIds`, keep writes admin-only, and protect
  `{orgId}/concert-programs/...` private export files from broad member reads.
  Added static schema coverage, env-gated live RLS assertions, migration-map
  notes, and release-hardening gates. The live concert assertion skipped because
  the current remote project has not applied
  `0015_concert_program_scoped_rls.sql`. Changed files:
  `utils/blueprintQueries.ts`, `utils/blueprintQueries.test.ts`,
  `utils/supabaseSync.test.ts`, `utils/supabaseSchema.test.ts`,
  `utils/rlsLive.test.ts`,
  `supabase/migrations/0015_concert_program_scoped_rls.sql`,
  `docs/SUPABASE_MIGRATION_MAP.md`,
  `docs/blueprint-planning/RELEASE_HARDENING_GATES.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts utils/supabaseSync.test.ts
  utils/supabaseSchema.test.ts utils/rlsLive.test.ts --reporter=dot` passed
  (163 passed, 8 skipped); `npx vitest run utils/rlsLive.test.ts
  --reporter=verbose -t "concert program table and private document scope"`
  passed with the concert live assertion skipped for unapplied remote `0015`;
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (369 passed, 8 skipped). No UI, route/palette, public website/program
  exposure, packet promotion, or feature-tree promotion was added.
- 2026-06-19 concerts/events private planning surface: added a reusable private
  `ConcertProgramPlanner` embedded in Calendar event detail and Manage ->
  Activities roster/program context. Admins can create event-linked or unlinked
  private `concertPrograms`, edit title/date/venue/status/notes, add ordered
  pieces with student/staff performers and durations, see run-of-show cumulative
  timing plus duplicate/stale performer warnings, prepare private export
  references under `{orgId}/concert-programs/{programId}/program.pdf`, and see
  D-23 provisional public-output/media-release review states. The surface uses
  existing `concertPrograms` Supabase/local sync and does not add any public
  route, token path, sidebar entry, command-palette entry, packet promotion, or
  feature-tree promotion. Changed files: `App.tsx`,
  `components/CalendarView.tsx`, `components/ManageHub.tsx`,
  `components/ActivityManager.tsx`, `components/ConcertProgramPlanner.tsx`,
  `components/ConcertProgramPlanner.test.tsx`,
  `e2e/concert-program-planning.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run components/ConcertProgramPlanner.test.tsx --reporter=dot`
  passed (4 tests); `npm run test:e2e --
  e2e/concert-program-planning.spec.ts` passed (1 test);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (373 passed, 8 skipped for existing unapplied remote live-RLS
  migration gates).
- 2026-06-19 concerts/events teacher run-of-show and promotion: added staff-
  scoped read filtering to `ConcertProgramPlanner`, hid private export controls
  from read-only teacher views, wired Calendar to effective auth/current staff
  ownership, and added mobile Playwright coverage for a linked teacher's own
  run-of-show plus unrelated-event denial. Promoted
  `concert-programs-events` to implemented under bird's-eye mode in
  `features/forteTree.ts` and packet/status docs, with D-23 public exposure kept
  private/off and live RLS for `0015_concert_program_scoped_rls.sql` retained as
  a release-hardening gate. Changed files:
  `components/ConcertProgramPlanner.tsx`, `components/CalendarView.tsx`,
  `components/ConcertProgramPlanner.test.tsx`,
  `e2e/concert-program-planning.spec.ts`, `features/forteTree.ts`,
  `docs/blueprint-planning/packets/concert-programs-events.md`,
  `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`,
  `docs/blueprint-planning/status-policy.md`,
  `docs/blueprint-planning/decision-log.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run components/ConcertProgramPlanner.test.tsx
  utils/blueprintQueries.test.ts utils/supabaseSync.test.ts
  utils/supabaseSchema.test.ts --reporter=dot` passed (161 tests);
  `npm run test:e2e -- e2e/concert-program-planning.spec.ts` passed (2 tests);
  `npx vitest run features/forteTree.consistency.test.ts
  components/ConcertProgramPlanner.test.tsx --reporter=dot` passed (8 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (374 passed, 8 skipped for documented env-gated live RLS/release gates).
- 2026-06-19 rooms/absence helper and request security foundation: broadened
  `listRoomRequests` and `listAbsencesForPeriod` with own-request filters,
  terminal-status suppression for active queues, stale room/event link handling,
  and stable date/id ordering. Tightened `applyApprovedRoomChange` to pending
  room-change requests with known event/room lineage and kept absence/day-off
  approvals review-only under provisional D-21. Added Admin Inbox approval helper
  coverage for operational-request lineage and no automatic schedule/payroll
  side effects. Added normalized `operational_requests` mapping coverage and
  `0016_rooms_absence_request_rls.sql` for admin/requester-scoped operational
  request reads, teacher own pending insert/cancel, admin-only decisions, and
  sensitive `APPROVAL_REQUEST` inbox privacy while preserving regular
  notification member reads. Added static schema coverage, env-gated live RLS
  assertions, migration-map notes, and release-hardening gates. The live
  rooms/absence assertion skipped because the current remote project has not
  applied `0016_rooms_absence_request_rls.sql`. Changed files:
  `utils/blueprintQueries.ts`, `utils/blueprintQueries.test.ts`,
  `utils/adminInbox.test.ts`, `utils/supabaseSync.test.ts`,
  `utils/supabaseSchema.test.ts`, `utils/rlsLive.test.ts`,
  `supabase/migrations/0016_rooms_absence_request_rls.sql`,
  `docs/SUPABASE_MIGRATION_MAP.md`,
  `docs/blueprint-planning/RELEASE_HARDENING_GATES.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts utils/adminInbox.test.ts
  utils/supabaseSync.test.ts utils/supabaseSchema.test.ts --reporter=dot`
  passed (165 tests); `npx vitest run utils/rlsLive.test.ts
  --reporter=verbose -t "rooms/absence operational request"` passed with the
  rooms/absence live assertion skipped for unapplied remote `0016`;
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (383 passed, 9 skipped). No UI, route/palette, packet promotion, or
  feature-tree promotion was added.
- 2026-06-20 rooms/absence teacher request surface: added synced
  `operationalRequests` state to the Calendar surface and a mobile-reachable
  teacher request panel in event detail for room-change, absence, and day-off
  submission. Requests create `PENDING` operational rows plus linked
  `APPROVAL_REQUEST` Admin Inbox items, show own status/history with EN/HE
  labels and empty/loading/error states, allow teachers to cancel only own
  pending rows, and keep D-21 behavior review-task-only with no automatic event,
  Gantt, attendance, or payroll mutation. Added a pure
  `operationalRequestService` with validation/approval-item/cancel coverage and
  a 390x844 Playwright smoke for create -> linked inbox -> cancel -> absence
  request persistence. Changed files: `App.tsx`, `components/CalendarView.tsx`,
  `constants.ts`, `utils/operationalRequestService.ts`,
  `utils/operationalRequestService.test.ts`, `e2e/teacher-requests.spec.ts`,
  and `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/operationalRequestService.test.ts --reporter=dot`
  passed (6 tests); `npm run test:e2e -- e2e/teacher-requests.spec.ts` passed
  (1 test); `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (389 passed, 9 skipped). No Admin Inbox decision UI,
  packet/header promotion, feature-tree promotion, route/palette change, or
  automatic D-21 schedule/payroll side effect was added.
- 2026-06-20 rooms/absence Admin Inbox review and promotion: added
  `decideOperationalRequest` service coverage for linked approval decisions,
  stale event/room protection, room-change event updates, rejection, and D-21
  absence/day-off review-only decisions. Added an Admin Inbox operational-request
  review section with search/status filters, loading/empty/error/stale states,
  EN/HE labels, source links, decision notes, approve/reject actions, and
  persisted request/inbox/event updates. Extended the Playwright smoke to cover
  admin approval from Admin Inbox -> event room update -> request/inbox approved
  history while preserving no Gantt/payroll side effects. Promoted
  `rooms-absence-requests` to implemented under bird's-eye mode in
  `features/forteTree.ts` and packet/status/roadmap/decision docs; live RLS for
  `0016_rooms_absence_request_rls.sql` remains a release-hardening gate. Changed
  files: `App.tsx`, `components/AdminInbox.tsx`, `constants.ts`,
  `utils/operationalRequestService.ts`,
  `utils/operationalRequestService.test.ts`, `e2e/teacher-requests.spec.ts`,
  `features/forteTree.ts`,
  `docs/blueprint-planning/packets/rooms-absence-requests.md`,
  `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`,
  `docs/blueprint-planning/status-policy.md`,
  `docs/blueprint-planning/decision-log.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/operationalRequestService.test.ts utils/adminInbox.test.ts
  --reporter=dot` passed (12 tests); `npm run test:e2e --
  e2e/teacher-requests.spec.ts` passed (2 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (393 passed, 9 skipped).
- 2026-06-20 calendar integrations helper/token foundation: added exported
  deterministic helpers for endpoint-backed active subscription lists, generic
  and calendar-specific public token resolution, external sync state summaries,
  stale filter/duplicate-token markers, and filtered RFC 5545 iCal escaping/
  folding. Added `0017_calendar_subscription_endpoint_resolver.sql` to narrow
  direct `calendar_subscriptions` reads to admins and expose a D-07/D-14
  hash-only resolver over `public_endpoints` for scoped private iCal output.
  Added calendar subscription/public endpoint mapping coverage, static schema
  assertions, env-gated live resolver/RLS coverage, migration-map and release-
  hardening notes, and removed the now-implemented calendar helper names from
  the feature-tree consistency stub list. The live calendar resolver assertion
  skipped because the current remote project has not applied `0017`. Changed
  files: `utils/blueprintQueries.ts`, `utils/blueprintQueries.test.ts`,
  `utils/supabaseSync.test.ts`, `utils/supabaseSchema.test.ts`,
  `utils/rlsLive.test.ts`, `features/forteTree.consistency.test.ts`,
  `supabase/migrations/0017_calendar_subscription_endpoint_resolver.sql`,
  `docs/SUPABASE_MIGRATION_MAP.md`,
  `docs/blueprint-planning/RELEASE_HARDENING_GATES.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts utils/supabaseSync.test.ts
  utils/supabaseSchema.test.ts features/forteTree.consistency.test.ts
  --reporter=dot` passed (174 tests); `npx vitest run utils/rlsLive.test.ts
  --reporter=verbose -t "calendar subscription resolver" --testTimeout=30000`
  passed with the calendar resolver live assertion skipped for unapplied remote
  `0017`; `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (401 passed, 10 skipped).
