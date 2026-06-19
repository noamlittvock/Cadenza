BUILD ACTIVE

This file is the implementation loop's durable memory. The next agent must read
it in full before editing code. Authoritative specs remain:

- `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`
- `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`
- `docs/blueprint-planning/packets/payroll-salaries-hours.md`
- `docs/blueprint-planning/packets/lesson-details-attendance.md`
- `docs/blueprint-planning/decision-log.md`
- `docs/blueprint-planning/route-nav-policy.md`
- `docs/blueprint-planning/status-policy.md`
- `docs/blueprint-planning/finance-configurable-model-scope.md`

On completion, replace the first line with exactly:
BUILD COMPLETE

## Previous Completed Targets

- `student-family-files` reached the implemented bar on 2026-06-18.
- `public-registration-intake` reached the implemented bar on 2026-06-18.
- `lesson-details-attendance` reached the implemented bar on 2026-06-18 under
  accepted D-17: one `lesson_records` row per `(eventId, studentId)`, group
  lessons sharing `eventId`, explicit teacher/admin row preparation only, and no
  silent attendance/completion/outcome marking.
- Latest committed checkpoint before this payroll loop:
  `b071afd` (`Complete attendance build loop`) on branch `blueprint-supabase`.

## Current Objective

Phase C packet `payroll-salaries-hours`: promote from `embedded` to
`implemented` by consolidating payroll around accepted D-18/D-19:

- `HoursEntry` is the payroll source of truth.
- `HoursReport` is only a period/submission header grouping entries.
- Teachers may create/edit/submit only their own DRAFT/SUBMITTED entries.
- Admin approval stamps the final payable rate using the accepted P0 order:
  admin override > engagement/assignment role-department rate > staff default >
  org default.
- APPROVED/PAID transitions are admin-gated, finance is read/export only, and
  PAID rows are immutable except by new adjusting entries.

Do not build statutory deductions, pension/social-security, employer-cost
provisions, payroll-provider disbursement, or D-21-D-27 blocked side effects.

## Locked Build Decisions

- D-05: Event canonical write-model is `EventV2`; legacy `CalendarEvent` remains
  at read edges. Use `utils/canonicalAdapters.ts` at module boundaries.
- D-06: teachers may self-write own attendance/hour rows; payroll-affecting
  approval remains admin-gated. Do not broaden staff write scope beyond row
  ownership.
- D-17: lesson attendance source rows are one row per `(eventId, studentId)`.
  Attendance/completion/outcomes must remain explicit, not silently inferred.
- D-18: `HoursEntry` is payroll source of truth; `HoursReport` is a
  period/submission header, not a parallel totals ledger.
- D-19: payroll rates are configurable; payable rate is stamped at admin
  approval using the accepted P0 order.
- D-20: finance uses a single currency per org/family ledger for P0 and must
  never silently offset currencies.
- D-21-D-27 remain parked. Do not implement packet sections marked
  `BLOCKED ON D-21` through `BLOCKED ON D-27`.

## Initial Payroll Scope

- Home: admin review belongs in an existing Manage/Finance-style operational
  surface; teacher self-report must be reachable on mobile and cannot be hidden
  behind desktop-only admin navigation.
- Primary records: normalized `hours_entries`; legacy/hybrid `hours_reports`
  may remain only as submission headers/archive context.
- Public/token access: none. Do not revive legacy `hours_reports.token` as a
  public write path.
- Calendar-derived comparison may use completed attendance/event minutes, but do
  not build D-21 absence/day-off side effects or any payroll-provider export.
- Implement dense operator UI consistent with existing app patterns; no new
  marketing or explanatory landing page.

## Baseline Known Findings - 2026-06-18

- `components/TeacherHoursForm.tsx` currently appears to use legacy
  `HoursReport.reportedEntries` nesting and direct/fetch helpers for
  `hoursReports`; audit before changing.
- `components/HoursComparisonView.tsx` currently consumes `HoursReport[]`; it
  likely needs D-18 consolidation around `HoursEntry[]`.
- `App.tsx` currently syncs `hoursReports`; audit whether `hoursEntries` is
  already synced anywhere before adding another collection.
- `utils/blueprintQueries.ts` already has `listPendingHoursReports`,
  `compareReportedVsCalendarHours`, and `calculatePayslipRows`, but packet
  acceptance still requires variance-edge tests and D-19 rate-resolution tests.
- `utils/supabaseSync.ts` maps `hoursEntries` to normalized `hours_entries` and
  `hoursReports` to hybrid `hours_reports`; focused mapping coverage needs audit
  and strengthening.
- `supabase/migrations/0004_blueprint_rls_foundation.sql` has row-scoped
  teacher insert/update policies for `hours_entries`; live RLS must prove own
  DRAFT/SUBMITTED allowed, other staff denied, APPROVED/PAID denied to teacher,
  admin approval/pay allowed, finance read/export only.

## Baseline Audit Findings - 2026-06-18

- Worktree at audit start: branch `blueprint-supabase` tracking
  `origin/blueprint-supabase`; pre-existing modified files were
  `docs/blueprint-planning/BUILD_LOOP_STATE.md` and
  `docs/blueprint-planning/NEXT_AGENT_LOOP.md`. Preserve both.
- Current teacher hours surface is the unauthenticated legacy
  `/report/:token` path in `App.tsx`, rendering `components/TeacherHoursForm.tsx`.
  It queries `hours_reports` by `data->>token`, reads/writes `hoursReports`
  through `utils/supabaseSync.ts`, and submits nested
  `HoursReport.reportedEntries`. This conflicts with the payroll packet's "no
  public/token payroll write" rule and must be replaced or gated by an
  authenticated teacher self-report surface before launch.
- `components/TeacherHoursForm.tsx` initializes event rows as
  confirmed-by-default. Do not preserve that behavior when moving to D-18/D-19:
  teacher entries must write normalized `hours_entries`, and final payable rate
  must be stamped only by admin approval.
- Current admin comparison UI exists in `components/HoursComparisonView.tsx`, but
  it consumes legacy `HoursReport[]` and nested entries, supports only
  `SUBMITTED -> REVIEWED`, and was not found mounted in active app routes.
  `ManageHub` passes `hoursReports` to `StaffMemberManager`, but the current
  manager implementation does not consume those payroll props.
- Mobile/nav placement constraints: `PAYROLL` is still hidden by
  `routing.ts`/`routing.test.ts` because it is not routed. `ManageHub` is
  desktop/admin-oriented, while the payroll packet requires teacher self-report
  to be mobile-reachable and not hidden behind desktop-only Manage/Admin Inbox.
  Any command-palette entry must route to a real surface or alias to one; public
  token routes get no sidebar or palette entry.
- Runtime sync state: `App.tsx` syncs only legacy `hoursReports`; no active
  `hoursEntries` state was found. `utils/supabaseSync.ts` maps
  `hoursReports -> hours_reports` as HYBRID and
  `hoursEntries -> hours_entries` as NORMALIZED, but current mapping tests cover
  Student/Family, attendance, and intake, not payroll-specific
  `hours_entries`/`hours_reports`.
- Type split: legacy `types.ts` has `HoursReportStatus =
  PENDING|SUBMITTED|REVIEWED` and nested `HoursEntry` with decimal `hours` plus
  `entryType`; canonical Blueprint `types/blueprint.ts` has normalized
  `HoursEntry` with `reportedMinutes`, `calendarMinutes`, `rate`, and
  `DRAFT|SUBMITTED|APPROVED|PAID`. D-18/D-19 work must consolidate around the
  Blueprint entry and keep `HoursReport` as a period/submission header only.
- Existing payroll helpers in `utils/blueprintQueries.ts` operate on Blueprint
  `HoursEntry[]`: `listPendingHoursReports`, `compareReportedVsCalendarHours`,
  and `calculatePayslipRows`. Current tests cover only one happy-path variance
  and approved-row payslip case; missing coverage includes variance edge cases,
  payslip filtering, rate resolution, and approval-time stamping.
- Rate-config candidates are currently schema-light: `EventParticipant` has
  `teachingAssignmentId`/`orgRoleId`, and Staff/Assignment/OrgRole surfaces
  exist, but `StaffMemberV2`, `TeachingAssignmentV2`, and `OrgRoleV2` currently
  do not expose explicit rate fields. The next unit likely needs a pure rate
  resolver with narrowly typed optional config inputs before UI/schema wiring.
- D-05 adapter usage for attendance is established in
  `utils/lessonAttendanceService.ts` and `components/CalendarView.tsx` through
  `eventToV2`; payroll code currently reads legacy `CalendarEvent` directly in
  `TeacherHoursForm.tsx`/`HoursComparisonView.tsx`. Future payroll event-derived
  comparisons must use `utils/canonicalAdapters.ts` at the module boundary.
- Static RLS coverage in `utils/supabaseSchema.test.ts` now asserts
  `hours_entries` admin-only broad writes, teacher self DRAFT/SUBMITTED-only
  insert/update policies, finance read access, and no member/finance/anon
  shortcut in teacher write policies. Live RLS coverage in
  `utils/rlsLive.test.ts` now proves teacher own DRAFT/SUBMITTED insert/update,
  teacher-other denial, teacher APPROVED/PAID denial, admin approve/pay, finance
  read/export-only behavior, anon denial, and cross-org denial for payroll.
- Live RLS env readiness was checked with presence-only output; all currently
  required `CADENZA_RLS_*` variables were present. Do not record secret values.
- Existing Playwright coverage includes student/family, public registration, and
  lesson attendance (including 390x844 Hebrew RTL), but no payroll workflow
  smoke exists yet.
- D-21-D-27 remain parked. Payroll implementation must not add absence/day-off
  payroll side effects (D-21), public concert/program exposure (D-23),
  consent-revocation effects (D-24), instrument deposit/refund finance rows
  (D-25), HR/evaluation scope (D-26), or rollover grade/schedule-copy behavior
  (D-27).

## Non-Negotiable Guardrails

- Preserve unrelated dirty work. Do not stage, commit, branch, push, or run git
  write operations inside `build-loop.sh`.
- Do exactly one queue unit per iteration. If the next unit is too large, split
  it into smaller unchecked subunits in this file, then complete only the first
  subunit.
- Never print or record secret values. Docs and logs may name required variables
  but must never include tokens, passwords, service-role keys, anon keys, access
  tokens, or database passwords.
- Use existing app patterns and helpers. Do not add a duplicate event conversion
  seam, new datastore, or broad HYBRID rewrite.
- If live Supabase credentials or remote schema state are missing, add env-gated
  tests that skip with a clear message, record the exact env vars or blocker
  here, and do not mark RLS-LIVE or BUILD COMPLETE until tests run against a real
  project.

## Queue (dependency order - do the first unticked unit, exactly one)

### Stage 0 - Audit And Contract

- [x] Baseline audit: read this file plus authoritative specs, run
  `git status --short --branch`, identify current teacher hours surfaces,
  admin comparison surfaces, mobile/nav placement, `HoursEntry` and
  `HoursReport` types/schema/helpers, `hoursEntries` and `hoursReports`
  Supabase mapping, D-05 event adapter usage, D-06 RLS coverage, rate-config
  candidates, Playwright patterns, and all D-21-D-27 blocked seams. Update this
  file with discovered constraints before code edits.
- [x] MAP-UNIT: add focused coverage for `hours_entries` camel/snake mapping,
  `hours_reports` header wrap/unwrap, variance edge cases, payslip filtering,
  and D-19 rate-resolution/stamping helpers. If a rate helper does not exist,
  create a pure helper with unit tests before UI wiring.
- [x] RLS refinement/test audit: prove static and env-gated live coverage for
  teacher own DRAFT/SUBMITTED insert/update, teacher-other denial, teacher
  APPROVED/PAID denial, admin approve/pay, finance read-only/export-only,
  anon denial, and cross-org denial.

### Stage 1 - Payroll Workflow Core

- [x] HoursEntry service layer: implement D-18/D-19 helpers for teacher
  self-report create/edit/submit, period header grouping, admin approval with
  payable-rate stamping, admin mark-paid, PAID immutability, and correction via
  new adjusting entries. Keep helpers pure where possible and verify with unit
  tests before UI.
- [ ] Teacher self-report UI: wire a mobile-reachable teacher surface to
  normalized `hours_entries` and `hours_reports` period headers. Teachers may
  edit only own DRAFT/SUBMITTED entries; submission locks teacher edits that
  should require admin action. Do not use public/token writes.
- [ ] Admin review/approval UI: add or adapt the existing comparison surface to
  list pending/submitted entries by staff/period, show reported-vs-calendar
  variance, stamp rates on approval, mark approved entries paid, and preview or
  export payslip rows. Finance may read/export but not approve/pay.
- [ ] Legacy consolidation/backfill: reconcile existing `hours_reports`
  reported-entry docs into the D-18 model as period headers plus normalized
  `hours_entries` where packet-local safe. Retain legacy reports as archive or
  opening context only; do not create a parallel payroll ledger.

### Stage 2 - Verification And Promotion

- [ ] Playwright payroll workflow smoke: teacher submit hours -> admin compare
  variance -> approve with stamped rate -> payslip rows/export; include Hebrew
  RTL and 390x844 teacher self-report coverage.
- [ ] RLS-LIVE payroll run: run the live-role harness against a real Supabase
  project for the payroll workflow. Do not mark complete if only skipped local
  tests ran.
- [ ] Status promotion: only after every queue unit is complete and every
  completion checklist item below is true, update `features/forteTree.ts` and
  the `payroll-salaries-hours` packet header to `implemented`, refresh handoff
  docs, append an iteration note here, and replace this file's first line with
  `BUILD COMPLETE`.

## Completion Checklist (all required before BUILD COMPLETE)

- [ ] D-18/D-19 are reflected in code, tests, packet docs, and handoffs.
- [ ] `HoursEntry` is the payroll source of truth; `HoursReport` is not used as
  a parallel totals ledger.
- [ ] Teacher can create/edit/submit only own DRAFT/SUBMITTED entries.
- [ ] Admin approval stamps the final payable rate using accepted P0 order.
- [ ] Finance read/export cannot mutate approval/payment status.
- [ ] PAID entries are immutable; corrections use new adjusting entries.
- [ ] Teacher self-report is mobile-reachable and covered at 390x844.
- [ ] Hebrew/RTL hours and payslip states are covered with LTR-isolated numbers.
- [ ] Playwright payroll smoke passed.
- [ ] RLS-LIVE passed against a real project for payroll.
- [ ] `npm run typecheck -- --diagnostics` passes.
- [ ] `npx vitest run --reporter=dot` passes.
- [ ] No D-21-D-27 blocked section was implemented without a decision update.

## Next Unit

- Teacher self-report UI: wire a mobile-reachable teacher surface to normalized
  `hours_entries` and `hours_reports` period headers. Teachers may edit only own
  DRAFT/SUBMITTED entries; submission locks teacher edits that should require
  admin action. Do not use public/token writes.

## Setup Notes For Next Agent

- Source `.env.local` for live test credentials when needed, but never print it.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless an explicit migration-push step is being handled by the
  orchestrator.
- Required live RLS env vars currently used by the harness:
  `CADENZA_RLS_SUPABASE_URL`, `CADENZA_RLS_SUPABASE_ANON_KEY`,
  `CADENZA_RLS_SUPABASE_SERVICE_ROLE_KEY`, `CADENZA_RLS_ORG_ID`,
  `CADENZA_RLS_CROSS_ORG_ID`, `CADENZA_RLS_ADMIN_EMAIL`,
  `CADENZA_RLS_ADMIN_PASSWORD`, `CADENZA_RLS_TEACHER_EMAIL`,
  `CADENZA_RLS_TEACHER_PASSWORD`, `CADENZA_RLS_TEACHER_STAFF_MEMBER_ID`,
  `CADENZA_RLS_FINANCE_EMAIL`, `CADENZA_RLS_FINANCE_PASSWORD`,
  `CADENZA_RLS_CROSS_ORG_EMAIL`, and `CADENZA_RLS_CROSS_ORG_PASSWORD`.
- Supabase CLI is installed and the project was previously linked locally, but
  do not apply migrations unless the active queue unit explicitly requires it.
- `build-loop.sh` defaults `CODEX_REASONING_EFFORT=high`.

## Iteration Notes

- 2026-06-18 seed for `payroll-salaries-hours`: after committing and pushing the
  completed D-17 attendance loop at `b071afd`, replaced the completed attendance
  loop memory with this payroll queue. No payroll code changes have been made in
  this seed step.
- 2026-06-18 baseline audit: read the loop state, handoff, roadmap, payroll and
  attendance packets, decision log, route/nav policy, status policy, and finance
  scope doc; audited payroll surfaces, routing, types, Supabase mapping, D-05
  adapter usage, RLS/static/live coverage, rate-source candidates, Playwright
  coverage, and D-21-D-27 parked seams. Changed only
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/supabaseSync.test.ts utils/blueprintQueries.test.ts utils/supabaseSchema.test.ts routing.test.ts --reporter=dot`
  passed (90 tests);
  `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (20 files, 224 tests).
- 2026-06-18 MAP-UNIT for `payroll-salaries-hours`: added normalized
  `hours_entries` camel/snake mapping coverage, HYBRID `hours_reports` period
  header wrap/unwrap coverage, payroll variance edge tests, payslip filtering
  tests, and pure D-19 rate resolution/stamping helpers that do not trust a
  teacher-submitted draft `HoursEntry.rate` without an explicit admin override.
  Changed files: `utils/supabaseSync.test.ts`,
  `utils/blueprintQueries.ts`, `utils/blueprintQueries.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts utils/supabaseSync.test.ts --reporter=dot`
  passed (2 files, 75 tests);
  `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (20 files, 229 tests).
- 2026-06-18 RLS refinement/test audit for `payroll-salaries-hours`: tightened
  static RLS assertions for `hours_entries` policy shape and added a live
  real-role payroll matrix proving teacher own DRAFT/SUBMITTED insert/update,
  teacher-other denial, teacher APPROVED/PAID denial, admin approve/pay, finance
  read/export-only behavior, anon denial, and cross-org denial. Required live RLS
  env vars were present by presence-only check; no secret values were printed or
  recorded. Changed files: `utils/supabaseSchema.test.ts`,
  `utils/rlsLive.test.ts`, and `docs/blueprint-planning/BUILD_LOOP_STATE.md`.
  Verification:
  `npx vitest run utils/supabaseSchema.test.ts utils/rlsLive.test.ts --reporter=dot`
  passed (2 files, 19 tests);
  `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (20 files, 230 tests).
- 2026-06-18 HoursEntry service layer for `payroll-salaries-hours`: added a pure
  payroll service for teacher-owned DRAFT/SUBMITTED create/edit/period submit,
  `HoursReport` period-header grouping without totals, admin-only D-19 approval
  rate stamping, admin mark-paid, PAID immutability, and separate adjusting
  entries for paid corrections. The submit helper now rejects explicitly selected
  wrong-org, wrong-teacher, or outside-period entries instead of silently
  filtering them out. Added repository hooks for normalized `hoursEntries` and
  hybrid `hoursReports` without changing UI routes or public token writes.
  Changed files: `utils/hoursEntryService.ts`,
  `utils/hoursEntryService.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/hoursEntryService.test.ts --reporter=dot` passed (1
  file, 11 tests); `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (21 files, 241 tests).
