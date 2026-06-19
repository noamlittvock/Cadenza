BUILD COMPLETE

This file is the implementation loop's durable memory. The next agent must read
it in full before editing code. Authoritative specs remain:

- `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`
- `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`
- `docs/blueprint-planning/packets/payments-charges.md`
- `docs/blueprint-planning/packets/payroll-salaries-hours.md`
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
- `payroll-salaries-hours` reached the implemented bar on 2026-06-19 under
  accepted D-18/D-19: `HoursEntry` is source of truth, `HoursReport` is a period
  header, teachers self-report own DRAFT/SUBMITTED entries, admins approve/pay
  with stamped rates, finance can read/export only, live RLS and Playwright
  workflow passed.
- `payments-charges` reached the implemented bar on 2026-06-19 under accepted
  D-07-FIN/D-08/D-10/D-20: family-led ledger, admin/finance RLS, computed live
  balances, audit-only snapshots, single-currency checks, student/family handoff,
  and Finance Playwright workflow passed. D-25 remains parked.
- Latest committed checkpoint before this payments loop:
  `1037af8` (`Promote payroll build loop complete`) on branch
  `blueprint-supabase`.

## Current Objective - Complete

Phase C packet `payments-charges`: promote from `gap` to `implemented` by
building the accepted P0 family-led finance ledger:

- D-07-FIN: family-led ledger is canonical; charges may retain student and
  enrollment lineage, but aggregation key is `familyId`.
- D-08: finance visibility/write access is admin plus explicit `finance`
  capability; plain members must not read ledger rows.
- D-10: live balances are computed on demand; `balanceSnapshots` are periodic or
  audit history only, not current-balance source of truth.
- D-20: P0 enforces a single currency per org/family ledger while staying
  future-safe for explicit multi-currency. Never silently offset currencies.
- D-25 remains parked. Do not implement instrument deposits, replacement fees,
  forfeits, or refunds.

## Locked Build Decisions

- D-03: `Family` is a first-class source-of-truth record and the finance ledger
  owner for P0.
- D-04/D-05: Student/Event canonical write models use the adapter seam in
  `utils/canonicalAdapters.ts`; do not perform broad HYBRID rewrites.
- D-07: no public unauthenticated finance writes. Do not add guardian payment
  portals or public payment submission paths.
- D-07-FIN: family-led ledger with per-enrollment charge line lineage.
- D-08: finance access is admin or `finance` capability only.
- D-10: compute live balances on demand; snapshots are history/audit.
- D-15: packet-local ledger backfill only; no global student/family migration.
- D-20: single-currency P0; reject or flag mixed-currency data.
- D-21-D-27 remain parked. In this packet, D-25 blocks instrument-specific
  deposit/fee/refund behavior.

## Baseline Known Findings - 2026-06-19

- At loop start, the `payments-charges` packet was still `gap`; `BILLING` routed
  to the top-level Finance surface and was palette-visible, but the full ledger
  workflow remained queued.
- Normalized tables already exist from `0002`: `charges`, `payments`,
  `adjustments`, and `balance_snapshots`.
- `0004` ledger RLS grants admin or finance capability access for ledger tables;
  live tests must prove admin/finance allowed, plain member denied, cross-org
  denied, and no anon access.
- Deterministic helpers already exist in `utils/blueprintQueries.ts`:
  `listOpenBalances`, `reconcileEnrollmentCharges`, and
  `listPaymentsByFamily`.
- Existing tests cover happy paths for those helpers but still need
  partial-allocation edge coverage, single-currency invariant coverage, date
  boundary coverage, and mapping/RLS/UI workflow coverage for this packet.

## Baseline Audit Findings - 2026-06-19

- `BILLING` now routes to a real Finance surface, is included in `ROUTED_VIEWS`,
  appears in the sidebar, and has a navigation smoke.
- At loop start, `App.tsx` subscribed to `charges`, `payments`, `adjustments`,
  and `balanceSnapshots` for the Finance surface, but the full ledger
  list/detail/write workflow remained queued.
- At loop start, `StudentFamilyWorkspace` had a finance tab placeholder only,
  gated with admin/super-admin props and not surfacing real ledger rows.
- `listOpenBalances` now defaults to `FAMILY`, rejects mixed currencies per
  party, rounds totals, and sorts open charge ids by due date.
- Helper tests now cover partial-allocation balances, family-led default
  aggregation, mixed-currency rejection, and date/tie-boundary sorting.
- `supabaseSync.test.ts` now covers full ledger row mapping for `charges`,
  `payments`, `adjustments`, and `balanceSnapshots`, including numeric fields,
  nullable lineage fields, `approvedBy`, and `appliedChargeIds` jsonb.
- At loop start, static schema tests proved admin-or-finance policies existed for
  all ledger tables and the live RLS harness covered `charges` read visibility;
  the queued RLS-LIVE unit still needed all ledger tables plus write/denial
  cases.
- No D-25 instrument deposit, replacement-fee, forfeit, or refund behavior was
  found in the current finance code path.

## Build Queue

### Stage 0 - Audit And Split

- [x] Baseline audit: read handoff, roadmap, payments packet, decision log,
  route policy, status policy, finance scope doc, and current finance-related
  code/tests/RLS/mapping. Split the queue into smaller safe units if needed.
  Preserve D-25 blocked scope.

### Stage 1 - Ledger Foundation

- [x] MAP-UNIT-A helper coverage: strengthen deterministic helper coverage and
  implementation for family-led aggregation, partial allocation semantics, date
  boundaries/sorting, and D-20 single-currency invariants. Keep this limited to
  helper behavior and tests; no service/UI work.
- [x] MAP-UNIT-B Supabase mapping coverage: add round-trip tests for `charges`,
  `payments`, `adjustments`, and `balanceSnapshots`, including numeric fields,
  nullable lineage fields, `approvedBy`, and `appliedChargeIds` jsonb. No service
  or UI work.
- [x] Ledger service A: implement small, tested helpers for manual family-led
  charge creation, payment recording/allocation, charge status derivation, and
  computed family balances. Enforce D-20 and exclude D-25 instrument scope.
- [x] Ledger service B: implement small, tested helpers for adjustment posting,
  void/audit semantics, and snapshot history as audit-only records. Live current
  balances must remain computed on demand.
- [x] RLS-LIVE finance ledger run: prove admin and finance can read/write,
  plain member cannot read, anon denied, and cross-org denied against a real
  Supabase project.

### Stage 2 - Finance UI

- [x] Finance route/nav: route `BILLING` as top-level Finance, unhide palette
  only when the route renders a real surface, and keep public routes out of
  sidebar/palette.
- [x] Family-led ledger UI: list/search/filter families with balances; detail
  view for charges/payments/adjustments; create charge, record payment, void or
  adjust; export/read-only states for finance; empty/loading/error states.
- [x] Student/family finance tab or link: surface the family ledger from the
  student/family context without bypassing ledger-table RLS.

### Stage 3 - Verification And Promotion

- [x] Playwright finance smoke: create charge -> record payment -> verify open
  balance and family payment history -> void/adjustment path; include Hebrew/RTL
  amount formatting.
- [x] Status promotion: only after every queue unit is complete and every
  completion checklist item below is true, update `features/forteTree.ts` and
  the `payments-charges` packet header to `implemented`, refresh handoff docs,
  append an iteration note here, and replace this file's first line with
  `BUILD COMPLETE`.

## Completion Checklist (all required before BUILD COMPLETE)

- [x] D-07-FIN/D-08/D-10/D-20 are reflected in code, tests, packet docs, and
  handoffs.
- [x] Finance ledger is family-led with per-student/per-enrollment charge lineage.
- [x] Single-currency invariant is enforced in helpers/UI/import-facing paths.
- [x] Mixed-currency rows are rejected or flagged; no silent cross-currency
  offset exists.
- [x] Live balances are computed on demand; snapshots are audit/history only.
- [x] Admin/finance ledger access passes real-role RLS; plain member/anon/cross
  org are denied.
- [x] `BILLING` routes to a real Finance surface before it is palette-visible.
- [x] Finance UI covers charge creation, payment recording/allocation, balance
  display, void/adjustment path, empty/loading/error states, and export/read-only
  behavior.
- [x] Hebrew/RTL ledger states and LTR-isolated amounts are covered.
- [x] `npm run typecheck -- --diagnostics` passes.
- [x] `npx vitest run --reporter=dot` passes.
- [x] Finance Playwright smoke passes.
- [x] No D-21-D-27 blocked section was implemented without a decision update,
  especially D-25 instrument deposit/refund behavior.

## Next Unit

- None. `payments-charges` is complete and all completion checklist items are
  true.

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
- Build-loop logs in `.build-loop/` are ignored.

## Iteration Notes

- 2026-06-19 seed for `payments-charges`: after committing and pushing completed
  payroll at `1037af8`, replaced the completed payroll loop memory with this
  payments queue. No payments code changes have been made in this seed step.
- 2026-06-19 Stage 0 baseline audit: read the handoff, roadmap, payments and
  payroll packets, decision log, route policy, status policy, finance scope doc,
  and finance-related helpers/tests/RLS/mapping/UI placeholders. Changed file:
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run routing.test.ts utils/blueprintQueries.test.ts
  utils/supabaseSync.test.ts utils/supabaseSchema.test.ts utils/rlsLive.test.ts
  --reporter=dot` passed (103 tests, live RLS harness ran); `npm run typecheck
  -- --diagnostics` passed; `npx vitest run --reporter=dot` passed (246 tests).
- 2026-06-19 MAP-UNIT-A helper coverage: changed `listOpenBalances` to default
  to family-led aggregation, reject mixed currencies per party, round money
  totals, and sort open charge ids deterministically by due date. Expanded
  `reconcileEnrollmentCharges` with payment/adjustment lineage, scoped payment
  totals, ambiguous cross-enrollment payment ids, balance totals, and enrollment
  currency rejection. Changed files: `utils/blueprintQueries.ts`,
  `utils/blueprintQueries.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/blueprintQueries.test.ts --reporter=dot` passed
  (59 tests); `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (251 tests). Playwright not run because MAP-UNIT-A has
  no UI workflow.
- 2026-06-19 MAP-UNIT-B Supabase mapping coverage: added normalized ledger
  mapping contract tests for `charges`, `payments`, `adjustments`, and
  `balanceSnapshots`, covering numeric fields, nullable lineage fields,
  `approvedBy`, `appliedChargeIds` jsonb, and undefined audit-column omission.
  Changed files: `utils/supabaseSync.test.ts` and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/supabaseSync.test.ts --reporter=dot` passed (26 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (255 tests). Playwright not run because MAP-UNIT-B has no UI workflow.
- 2026-06-19 Ledger service A: added `utils/ledgerService.ts` with admin/finance
  family-led charge creation, payment recording/allocation, deterministic charge
  status derivation, computed family balances, D-20 single-currency enforcement,
  and Supabase repository wrappers for charges/payments only. Added
  `utils/ledgerService.test.ts` coverage for manual charges, partial/full/split
  payment allocation, over-allocation denial, cross-family/void/missing charge
  denial, mixed-currency rejection, immutable apply helpers, computed balances,
  and repository write behavior without snapshots or D-25 instrument finance
  paths. Changed files: `utils/ledgerService.ts`,
  `utils/ledgerService.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/ledgerService.test.ts --reporter=dot` passed (11
  tests); `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (266 tests). Playwright not run because Ledger service
  A has no UI workflow.
- 2026-06-19 Ledger service B: extended `utils/ledgerService.ts` with
  admin/finance adjustment posting, audited charge voiding, explicit audit-only
  balance snapshot recording, repository wrappers for `adjustments` and
  `balanceSnapshots`, and live balance computation that remains sourced from
  charges/payments/adjustments rather than snapshots. Added
  `utils/ledgerService.test.ts` coverage for signed adjustments, void semantics,
  snapshot history separation, immutable apply helpers, repository write behavior,
  D-20 currency checks, and write-access denials. Changed files:
  `utils/ledgerService.ts`, `utils/ledgerService.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/ledgerService.test.ts --reporter=dot` passed (18 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (273 tests). Playwright not run because Ledger service B has no UI
  workflow.
- 2026-06-19 RLS-LIVE finance ledger run: expanded live Supabase RLS coverage
  from `charges`-only to all finance ledger tables: `charges`, `payments`,
  `adjustments`, and `balance_snapshots`. The live harness now proves
  admin/finance own-org insert/update/read access, plain member and anon
  read/insert denial, cross-org read/insert denial, primary-admin cross-org
  insert denial, and unauthorized updates leaving rows unchanged. Changed files:
  `utils/rlsLive.test.ts` and `docs/blueprint-planning/BUILD_LOOP_STATE.md`.
  Verification: presence-only live env check showed all required
  `CADENZA_RLS_*` vars set; `npx vitest run utils/rlsLive.test.ts
  --reporter=dot` passed (6 live tests); `npm run typecheck -- --diagnostics`
  passed; `npx vitest run --reporter=dot` passed (273 tests). Playwright not run
  because this RLS-LIVE unit has no UI workflow.
- 2026-06-19 Finance route/nav: routed `BILLING` as the top-level Finance view,
  added a real ledger-backed Finance surface with loading/empty/error states,
  added the Finance sidebar entry and palette visibility through `ROUTED_VIEWS`,
  updated route/navigation policy docs, and tightened the navigation smoke
  locators while adding a Finance route assertion. Changed files: `App.tsx`,
  `components/FinanceWorkspace.tsx`, `components/Layout.tsx`,
  `components/CommandPalette.tsx`, `constants.ts`, `routing.ts`,
  `routing.test.ts`, `e2e/helpers/navigate.ts`, `e2e/navigation.spec.ts`,
  `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`,
  `docs/blueprint-planning/decision-log.md`,
  `docs/blueprint-planning/packets/payments-charges.md`,
  `docs/blueprint-planning/route-nav-policy.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run routing.test.ts --reporter=dot` passed (9 tests);
  `npm run test:e2e -- e2e/navigation.spec.ts` passed (7 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (274 tests).
- 2026-06-19 Family-led ledger UI: expanded the Finance surface into a
  searchable/filterable family-led ledger with computed live balances, family
  detail tables for charges/payments/adjustments/audit snapshots, CSV export,
  read-only/write-access states, and admin/super-admin write forms for manual
  charge creation, payment allocation, signed adjustments, and charge voiding
  through `utils/ledgerService.ts`. The component supports read-only/export
  states by prop, but `AuthContext` still does not expose the Supabase `finance`
  capability to React; `App.tsx` currently passes the existing admin/super-admin
  write/export booleans while ledger-table RLS remains the real access boundary.
  Added focused helper coverage for live
  balance summaries, audit-only snapshots, D-20 mixed-currency errors, and CSV
  escaping; updated the existing Finance route smoke assertion for the new UI
  copy. Changed files: `App.tsx`, `components/FinanceWorkspace.tsx`,
  `components/FinanceWorkspace.test.tsx`, `e2e/navigation.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run components/FinanceWorkspace.test.tsx --reporter=dot` passed
  (3 tests); `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (277 tests); `npm run test:e2e --
  e2e/navigation.spec.ts` passed (7 tests). The dedicated create-charge ->
  record-payment -> balance -> void/adjustment Playwright workflow remains the
  queued Stage 3 smoke unit, so the Finance Playwright completion checklist item
  is still unchecked.
- 2026-06-19 Student/family finance tab/link: replaced the Student/Family
  finance placeholder with a read-only family ledger summary computed from the
  same `charges`, `payments`, `adjustments`, and `balanceSnapshots` arrays used
  by the Finance workspace, preserving ledger-table RLS as the access boundary.
  Added an "Open family ledger" handoff that routes to the real Finance surface
  with the family preselected; ledger mutations remain only in Finance. Updated
  EN/HE labels and the existing Student/Family and navigation Playwright smokes.
  Changed files: `App.tsx`, `components/FinanceWorkspace.tsx`,
  `components/StudentFamilyWorkspace.tsx`, `constants.ts`,
  `e2e/student-family.spec.ts`, `e2e/navigation.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npm run typecheck -- --diagnostics` passed; `npm run test:e2e --
  e2e/student-family.spec.ts e2e/navigation.spec.ts` passed (10 tests);
  `npx vitest run --reporter=dot` passed (277 tests).
- 2026-06-19 Playwright finance smoke: added a dedicated Finance ledger
  Playwright spec covering create charge -> partial payment -> open balance and
  payment history -> signed adjustment -> second-charge void path. Added stable
  Finance workspace test selectors and a Hebrew RTL check proving the ledger
  renders RTL and currency amounts inside `bdi` isolation. Changed files:
  `components/FinanceWorkspace.tsx`, `e2e/finance-ledger.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npm run test:e2e -- e2e/finance-ledger.spec.ts` passed (2 tests);
  `npx vitest run components/FinanceWorkspace.test.tsx --reporter=dot` passed
  (3 tests); `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (277 tests).
- 2026-06-19 Status promotion: promoted `payments-charges` to `implemented` in
  `features/forteTree.ts` and the packet header, refreshed handoff/status docs,
  updated feature-tree query tests for the new no-P0-gap state, marked all
  completion checklist items true, and set this file to `BUILD COMPLETE`.
  Changed files: `features/forteTree.ts`, `utils/forteTreeQueries.test.ts`,
  `docs/blueprint-planning/packets/payments-charges.md`,
  `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`,
  `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`,
  `docs/blueprint-planning/status-policy.md`,
  `docs/blueprint-planning/decision-log.md`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/forteTreeQueries.test.ts --reporter=dot` passed (5
  tests); `npm run typecheck -- --diagnostics` passed; `npx vitest run
  --reporter=dot` passed (277 tests).
