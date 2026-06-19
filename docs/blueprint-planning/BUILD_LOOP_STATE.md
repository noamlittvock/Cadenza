BUILD ACTIVE

This file is the implementation loop's durable memory. The next agent must read
it in full before editing code. Authoritative specs remain:

- `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`
- `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`
- `docs/blueprint-planning/packets/agreements-consent.md`
- `docs/blueprint-planning/packets/reports-analytics.md`
- `docs/blueprint-planning/packets/operations-command-center.md`
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
  accepted D-17.
- `payroll-salaries-hours` reached the implemented bar on 2026-06-19 under
  accepted D-18/D-19.
- `payments-charges` reached the implemented bar on 2026-06-19 under accepted
  D-07-FIN/D-08/D-10/D-20. D-25 remains parked.
- Latest committed checkpoint before this campaign loop:
  `5a6fb45` (`Promote payments charges ledger`) on branch `blueprint-supabase`.

## Current Objective

Promote this P1 campaign to implemented in order:

1. `agreements-consent`
2. `reports-analytics`
3. `operations-command-center`

Run this as one campaign, but never as one giant unit. Each iteration must do the
next single unchecked queue item only. Reports and operations may depend on
agreements, so do not build report packs or command-center cards for source
semantics that remain blocked or unimplemented.

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
- D-21-D-27 remain parked. Do not implement packet sections marked
  `BLOCKED ON D-xx` until the matching decision is answered and the packet and
  decision log are updated.

## Blocked Scope For This Campaign

- D-21: absence/day-off side effects and operational impact reports/cards.
- D-22: assessment/report-card guardian delivery consent language and rich
  assessment report packs.
- D-23: public performance/media release disclosure rules, public event/program
  exposure, and public endpoint health cards.
- D-24: consent withdrawal/revocation status, audit fields, downstream effects,
  and revocation reports/cards.
- D-25: instrument loan deposit/refund/forfeit/payment terms and deposit/refund
  reports/cards.
- D-26: HR/evaluation reports, reminders, privacy, access, retention, and exports.
- D-27: year-rollover grade and recurring-event copy rules and health cards.

## Build Queue

### Stage 0 - Campaign Audit And Split

- [x] Baseline audit: read handoff, roadmap, the agreements, reports, and
  operations packets, decision log, route policy, status policy, current
  feature-tree statuses, current code/tests/RLS/mapping for the three modules,
  and existing public endpoint/storage helpers. Split any queue item that is too
  large for one safe iteration. Preserve all D-21-D-27 blocked scope. No product
  implementation in this audit unit unless needed to split the queue.

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
- [ ] Agreements live RLS and promotion: convert agreement live RLS skips to real
  passes, then promote packet/header and `features/forteTree.ts` only if the
  agreements completion checklist holds.

### Stage 2 - Reports And Analytics

- [ ] Reports helper/allowlist foundation: add source/field allowlists and tests
  for invalid columns, filter operators, null/empty values, aggregate none,
  grouped average/min/max edge cases, stable order, lineage, blocked-source
  markers, and finance source allowlists. No UI work.
- [ ] Reports definition RLS foundation: narrow `report_definitions` from broad
  member read to D-09 admin/finance scope and admin-only writes. Add static schema
  tests and live RLS tests for admin full definition access, finance limited
  definition read, plain member/teacher/anon denied, and cross-org denied.
- [ ] Reports run/export source authorization: enforce source-row authorization
  and finance source allowlists in run/export paths so finance cannot access
  student, attendance, agreement, assessment, concert, HR, rollover, hidden
  public-endpoint, or blocked-source data. Add live/source-authorization tests.
- [ ] Analytics route/library shell: route `ANALYTICS` only after a real Reports
  workspace shell exists; update the route/palette allowlist in the same change.
  Add report library list/search/filter, empty/loading/error/permission states,
  EN/HE labels, and RTL-safe values. No builder/export work.
- [ ] Report builder/run/export UI: add definition builder, run/result table,
  grouped/chart view if supported by existing libraries, lineage links, CSV
  export, finance run/export limitations, EN/HE labels, and RTL-safe values.
- [ ] Reports Playwright smoke and promotion: cover admin finance report
  create/run/export/link, finance run/export without create, and denied
  student/attendance report for finance. Then promote packet/header and
  `features/forteTree.ts` only if reports completion checklist holds.

### Stage 3 - Operations Command Center

- [ ] Operations helper exports: implement deterministic helpers for
  `countOpenConflicts`, `listTodayEvents`, and `countPendingHoursReports`; remove
  their consistency-test stubs only when real exports exist. Add tests for hidden
  or cancelled events, org timezone date windows, stable severity ordering,
  source deletion, blocked-card markers, and role-filtered output.
- [ ] Operations snapshot helper model: create a pure source-authorized
  operations snapshot or equivalent card model with role-filtered output,
  blocked-card markers, source IDs only where authorized, and no persisted
  aggregate table. No UI work.
- [ ] Operations snapshot/security foundation: add RLS/source-authorization tests
  proving admin full cards, finance only finance/report cards, plain
  member/teacher/anon denied, cross-org denied, and no hidden-count leakage.
- [ ] Admin Inbox operations summary shell: add desktop-first operations summary
  in the existing Admin Inbox surface with open conflicts, today's events, inbox,
  import/report-health, pending-hours, and finance/agreement-safe cards only
  where source semantics are settled. Include EN/HE labels, RTL-safe values, and
  empty/loading/error/blocked states. Do not add a new ViewState.
- [ ] Operations drilldowns and role states: add source deep links from the Admin
  Inbox operations summary, finance-limited rendering, plain-member denial, and
  stale-source/permission failure states. Do not unhide unrelated routes.
- [ ] Operations Playwright smoke and promotion: cover Admin Inbox summary card
  rendering and drill-downs, finance-limited view, and plain-member denial. Then
  promote packet/header and `features/forteTree.ts` only if operations
  completion checklist holds.

### Stage 4 - Campaign Completion

- [ ] Final campaign promotion: after all three packets are implemented and every
  completion checklist item below is true, refresh handoff/roadmap/status docs,
  append an iteration note here, confirm no D-21-D-27 blocked section shipped
  without a decision update, and replace this file's first line with
  `BUILD COMPLETE`.

## Completion Checklist (all required before BUILD COMPLETE)

- [ ] `agreements-consent` is implemented in `features/forteTree.ts` and its
  packet header, with D-07/D-11/D-14/D-16 reflected in code, tests, packet docs,
  and handoffs.
- [ ] Agreement templates/requests support admin management, typed signature, PDF
  reference capture, student/family history, EN/HE labels, RTL/mobile signing,
  and packet-local backfill/import semantics.
- [ ] Agreement direct table/storage access is admin-only or explicitly scoped;
  public signing uses D-07/D-14 token control and no broad anon table policies.
- [ ] `reports-analytics` is implemented in `features/forteTree.ts` and its
  packet header, with D-08/D-09 source authorization enforced in code/tests/docs.
- [ ] Reports route `ANALYTICS` to a real surface before palette visibility,
  support definition management, run/results, grouped summaries where shipped,
  lineage, CSV export, blocked-source markers, EN/HE labels, and RTL states.
- [ ] Finance users can run/export only allowed finance/payroll reports and
  cannot create shared definitions or access hidden source data.
- [ ] `operations-command-center` is implemented in `features/forteTree.ts` and
  its packet header, living in the existing Admin Inbox surface without a new
  ViewState.
- [ ] Operations cards are source-authorized, role-filtered, deep-linked, EN/HE
  labeled, and do not leak hidden counts for unauthorized or blocked sources.
- [ ] Required real-role RLS tests pass for agreements, reports, and operations.
- [ ] Relevant Playwright smokes pass for agreements, reports, and operations.
- [ ] `npm run typecheck -- --diagnostics` passes.
- [ ] `npx vitest run --reporter=dot` passes.
- [ ] No D-21-D-27 blocked section was implemented without the matching decision
  and packet/decision-log update.

## Next Unit

- Agreements live RLS and promotion: convert agreement live RLS skips to real
  passes, then promote packet/header and `features/forteTree.ts` only if the
  agreements completion checklist holds.

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
- Agreement promotion is blocked until the agreement live RLS assertions pass
  without skips. The required Playwright smoke is now completed and passes, but
  do not promote the packet header or `features/forteTree.ts` while the live
  agreement RLS checks are skipped.
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
