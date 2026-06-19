BUILD ACTIVE

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
- Latest committed checkpoint before this payments loop:
  `1037af8` (`Promote payroll build loop complete`) on branch
  `blueprint-supabase`.

## Current Objective

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

- `payments-charges` packet is still `gap`; there is no routed Finance UI yet.
- `BILLING` exists in `ViewState` but remains hidden/unrouted as a top-level
  Finance view per route-nav-policy until this packet routes it.
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

- `App.tsx` still has no `BILLING` route, `routing.ts` keeps `BILLING` hidden
  from the command palette, and `Layout.tsx` has no Finance sidebar entry.
- `App.tsx` does not subscribe to `charges`, `payments`, `adjustments`, or
  `balanceSnapshots`; there is no Finance workspace component yet.
- `StudentFamilyWorkspace` has a finance tab placeholder only. It currently gates
  with admin/super-admin props and does not surface real ledger rows.
- `listOpenBalances` now defaults to `FAMILY`, rejects mixed currencies per
  party, rounds totals, and sorts open charge ids by due date.
- Helper tests now cover partial-allocation balances, family-led default
  aggregation, mixed-currency rejection, and date/tie-boundary sorting.
- `supabaseSync.test.ts` verifies the table map includes `charges`, but does not
  yet cover full ledger row mapping for `charges`, `payments`, `adjustments`, or
  `balanceSnapshots`, including `appliedChargeIds` jsonb.
- Static schema tests prove admin-or-finance policies exist for all ledger
  tables. The live RLS harness currently covers `charges` read visibility, but the
  queued RLS-LIVE unit still needs all ledger tables plus write/denial cases.
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
- [ ] MAP-UNIT-B Supabase mapping coverage: add round-trip tests for `charges`,
  `payments`, `adjustments`, and `balanceSnapshots`, including numeric fields,
  nullable lineage fields, `approvedBy`, and `appliedChargeIds` jsonb. No service
  or UI work.
- [ ] Ledger service A: implement small, tested helpers for manual family-led
  charge creation, payment recording/allocation, charge status derivation, and
  computed family balances. Enforce D-20 and exclude D-25 instrument scope.
- [ ] Ledger service B: implement small, tested helpers for adjustment posting,
  void/audit semantics, and snapshot history as audit-only records. Live current
  balances must remain computed on demand.
- [ ] RLS-LIVE finance ledger run: prove admin and finance can read/write,
  plain member cannot read, anon denied, and cross-org denied against a real
  Supabase project.

### Stage 2 - Finance UI

- [ ] Finance route/nav: route `BILLING` as top-level Finance, unhide palette
  only when the route renders a real surface, and keep public routes out of
  sidebar/palette.
- [ ] Family-led ledger UI: list/search/filter families with balances; detail
  view for charges/payments/adjustments; create charge, record payment, void or
  adjust; export/read-only states for finance; empty/loading/error states.
- [ ] Student/family finance tab or link: surface the family ledger from the
  student/family context without bypassing ledger-table RLS.

### Stage 3 - Verification And Promotion

- [ ] Playwright finance smoke: create charge -> record payment -> verify open
  balance and family payment history -> void/adjustment path; include Hebrew/RTL
  amount formatting.
- [ ] Status promotion: only after every queue unit is complete and every
  completion checklist item below is true, update `features/forteTree.ts` and
  the `payments-charges` packet header to `implemented`, refresh handoff docs,
  append an iteration note here, and replace this file's first line with
  `BUILD COMPLETE`.

## Completion Checklist (all required before BUILD COMPLETE)

- [ ] D-07-FIN/D-08/D-10/D-20 are reflected in code, tests, packet docs, and
  handoffs.
- [ ] Finance ledger is family-led with per-student/per-enrollment charge lineage.
- [ ] Single-currency invariant is enforced in helpers/UI/import-facing paths.
- [ ] Mixed-currency rows are rejected or flagged; no silent cross-currency
  offset exists.
- [ ] Live balances are computed on demand; snapshots are audit/history only.
- [ ] Admin/finance ledger access passes real-role RLS; plain member/anon/cross
  org are denied.
- [ ] `BILLING` routes to a real Finance surface before it is palette-visible.
- [ ] Finance UI covers charge creation, payment recording/allocation, balance
  display, void/adjustment path, empty/loading/error states, and export/read-only
  behavior.
- [ ] Hebrew/RTL ledger states and LTR-isolated amounts are covered.
- [ ] `npm run typecheck -- --diagnostics` passes.
- [ ] `npx vitest run --reporter=dot` passes.
- [ ] Finance Playwright smoke passes.
- [ ] No D-21-D-27 blocked section was implemented without a decision update,
  especially D-25 instrument deposit/refund behavior.

## Next Unit

- MAP-UNIT-B Supabase mapping coverage: add round-trip tests for `charges`,
  `payments`, `adjustments`, and `balanceSnapshots`, including numeric fields,
  nullable lineage fields, `approvedBy`, and `appliedChargeIds` jsonb. No service
  or UI work.

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
