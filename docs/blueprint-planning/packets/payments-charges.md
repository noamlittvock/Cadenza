# Payments And Charges  (`payments-charges`)

Status: gap → planned (this packet)  ·  Priority: p0 (high-risk — finance)
Owner-decisions still blocking this packet: none for the P0 family-led ledger.
Current accepted prerequisites: **D-07-FIN** (family-led ledger), **D-08**
(finance visibility/capability), **D-10** (compute-live + audit snapshots), and
**D-15** (backfill, recorded below), and **D-20** (single-currency P0 with
future-safe multi-currency mode).

## Current State (ground truth)
- Existing UI: none. No charge/payment surface.
- Existing schema (normalized, `0002`):
  - `charges`: `studentId, familyId, enrollmentId, description, amount, currency, dueDate, status (OPEN|PARTIAL|PAID|VOID), periodLabel`. **All three scope FKs present** → schema supports student/family/enrollment-led; D-07-FIN locks the family-led canonical rule.
  - `payments`: `studentId, familyId, amount, method (CASH|TRANSFER|CARD|CHECK|OTHER), receivedAt, appliedChargeIds[], reference`.
  - `adjustments`: `studentId, familyId, chargeId, amount (signed), reason, approvedBy`.
  - `balance_snapshots`: `studentId, familyId, asOf, totalCharged, totalPaid, totalAdjusted, balance` (audit history).
- Existing query helpers (implemented + tested, `utils/blueprintQueries.ts`):
  - `listOpenBalances(charges, payments, adjustments, familyId?)` — sums charged/paid/adjusted → balance (optional family filter, so **family-led aggregation already supported**).
  - `listPaymentsByFamily(payments, familyId)`.
  - `reconcileEnrollmentCharges(charges, payments, adjustments, enrollmentId)` — per-enrollment balance + payment lineage.
- Existing tests: `utils/blueprintQueries.test.ts` covers the three ledger helpers. **Missing:** single-currency invariant/property tests, partial-allocation edge tests, RLS, snapshot generation.
- Feature-tree declared queries: `listOpenBalances`, `reconcileEnrollmentCharges`, `listPaymentsByFamily` — all implemented.

## Users And Permissions
- Actors: admin, finance (capability implemented by D-08/`0004`), super_admin. **Not** general members.
- Read: finance/admin only (D-08) — narrower than uniform member-read.
- Write: admin/finance create charges, record payments, approve adjustments.
- Public/token: none.

## Workflows
- List/search/filter: open balances (`listOpenBalances`), by family/student/period/status; payment history by family (`listPaymentsByFamily`).
- Create: charge (manual; later from enrollment/import/agreement/rollover; instrument deposit or replacement-fee charge source is **BLOCKED ON D-25**); payment (apply to charges via `appliedChargeIds`); adjustment (signed, reason, approver).
- Detail: family/student ledger — charges, payments, adjustments, running balance, reconciliation (`reconcileEnrollmentCharges`).
- Edit: pre-application charge edits; void with audit.
- Status transitions: charge `OPEN → PARTIAL → PAID`; `→ VOID` (admin, audited). Payment allocation drives PARTIAL/PAID.
- Archive/delete: no hard delete; VOID + adjustments only (ledger integrity).
- Import/export: charge import; statement/receipt export.
- Cross-links: family/student files (finance tab, D-08-gated), enrollment, agreements (financial), reports.

## Data Contract
- Primary records: `Charge`, `Payment`, `Adjustment`, `BalanceSnapshot`.
- **Ledger owner (D-07-FIN ACCEPTED):** family-led rollup with per-enrollment charge lines. Charge keeps all three FKs; canonical *aggregation* key = `familyId`.
- Required: charge {amount, currency, dueDate, status, scope FK}; payment {amount, method, receivedAt}.
- Derived: open balance — **D-10 ACCEPTED:** compute on demand for live balance; persist `balance_snapshots` only for periodic/audit history.
- **Conversion semantics:** D-07-FIN/D-10 ACCEPTED — charge/payment/adjustment
  posting writes family-led ledger rows with `familyId` as the canonical
  aggregation key, while retaining `studentId`/`enrollmentId` as lineage on charge
  lines. Payment allocation updates charge status (`OPEN/PARTIAL/PAID/VOID`) but
  live balance remains computed on demand; `balance_snapshots` are written only by
  periodic/audit jobs, not as the current-balance source of truth.
- **Currency (D-20 ACCEPTED):** P0 enforces single currency per org/family ledger.
  Charges, payments, adjustments, live balances, snapshots, statements, and
  exports for one family must share the configured currency. Mixed-currency
  imports are rejected or flagged for manual cleanup. The model remains future-safe
  for explicit multi-currency mode, where balances/statements are partitioned by
  currency and cross-currency allocation requires explicit exchange/adjustment
  semantics.
- Audit: createdBy/approvedBy/server timestamps; VOID + adjustments are the mutation channel.
- Schema decisions / parked items: instrument deposit, replacement-fee, and
  refund modeling is **BLOCKED ON D-25**.

## UX Placement (per route-nav-policy)
- Home: **top-level Finance view** (routed through the `BILLING` ViewState per route-nav-policy). Family/student ledger also surfaces as a **gated tab** in student-family files.
- Navigation entry: sidebar Finance + palette-visible `BILLING` destination.
- Mobile: desktop-first (dense finance tables; PRODUCT.md operator displays). Not a mobile-primary workflow.
- Empty/loading/error: no-charges state; payment-exceeds-balance warning; void confirmation.
- Hebrew/RTL: currency/number formatting RTL-safe; amounts LTR-isolated within RTL.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | — | — | ✓ | — | `0004` ledger read policies: `app_is_org_admin` or `app_has_capability('finance')`. |
| Read detail | ✓ | ✓ | — | — | ✓ | — | Same admin-or-finance policy across charges, payments, adjustments, snapshots. |
| Create | ✓ | ✓ | — | — | ✓ | — | `0004` ledger write policies allow admin-or-finance for charges/payments/adjustments/snapshots. |
| Edit | ✓ | ✓ | — | — | ✓ | — | Finance/admin may edit pre-application records; immutable/audited states enforced in app logic and tests. |
| Status transition (non-financial) | — | — | — | — | — | — | Ledger status changes are finance-affecting by definition. |
| Status transition (payroll/finance-affecting) | ✓ | ✓ | — | — | ✓ | — | Charge `OPEN/PARTIAL/PAID/VOID`, payment allocation, adjustment approval; D-08 grants finance capability write. |
| Archive/delete | ✓ | ✓ | — | — | ✓ | — | No hard delete; VOID/adjustments only, audited. |
| Export | ✓ | ✓ | — | — | ✓ | — | Admin/finance statement, receipt, and ledger exports. |
| Public submit/sign | — | — | — | — | — | — | No public payment/charge path in v1. |

Required RLS refinements/tests:
- `0004` implements admin-or-finance ledger access; add real-role tests proving plain members cannot read ledger rows.
- Student/family finance tabs must rely on ledger-table RLS so a plain member cannot reach balances through a broader student profile query.

## Acceptance Criteria
- Unit: `listOpenBalances`, `reconcileEnrollmentCharges`, `listPaymentsByFamily`; **add** partial-allocation + single-currency invariant/property tests + date-boundary tests.
- Supabase mapping: `charges`/`payments`/`adjustments`/`balance_snapshots` camel↔snake + numeric/jsonb (appliedChargeIds).
- RLS: real finance/admin roles; verify a plain member **cannot** read finance; verify cross-org isolation.
- Playwright: create charge → record payment → verify open balance + family payment history; void path.
- Hebrew/RTL: ledger + amounts.
- Data migration: D-15 ACCEPTED — packet-local canonicalization of any existing
  demo charges/payments only; no global ledger migration. Existing demo ledger
  rows must be assigned or linked to `familyId` as the canonical aggregation key,
  while preserving per-student/per-enrollment charge lineage. Snapshot-history
  backfill may create periodic/audit baselines from existing ledger rows, but
  current live balances stay computed on demand. Mixed-currency imported rows are
  rejected or flagged for manual cleanup per D-20 unless a future explicit
  multi-currency mode is implemented.

## Dependencies
- Blocks: reports-analytics (finance reports), year-rollover (balances),
  agreements (financial), and instrument-inventory only if D-25 accepts
  ledger-backed deposits, replacement fees, or refunds.
- Blocked by: student-family-files (family/student ledger owner), real-role
  finance RLS tests during implementation, and **D-25** for instrument-specific
  deposit/fee/refund rows. D-20 is accepted for P0.
