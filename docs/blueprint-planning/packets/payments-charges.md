# Payments And Charges  (`payments-charges`)

Status: gap → planned (this packet)  ·  Priority: p0 (high-risk — finance)
Owner-decisions blocking this packet: **D-07-FIN** (ledger canonical owner),
**D-08** (finance visibility), **D-10** (balance snapshots), **D-15** (backfill).

## Current State (ground truth)
- Existing UI: none. No charge/payment surface.
- Existing schema (normalized, `0002`):
  - `charges`: `studentId, familyId, enrollmentId, description, amount, currency, dueDate, status (OPEN|PARTIAL|PAID|VOID), periodLabel`. **All three scope FKs present** → schema supports student/family/enrollment-led; D-07-FIN picks the canonical rule.
  - `payments`: `studentId, familyId, amount, method (CASH|TRANSFER|CARD|CHECK|OTHER), receivedAt, appliedChargeIds[], reference`.
  - `adjustments`: `studentId, familyId, chargeId, amount (signed), reason, approvedBy`.
  - `balance_snapshots`: `studentId, familyId, asOf, totalCharged, totalPaid, totalAdjusted, balance` (audit history).
- Existing query helpers (implemented + tested, `utils/blueprintQueries.ts`):
  - `listOpenBalances(charges, payments, adjustments, familyId?)` — sums charged/paid/adjusted → balance (optional family filter, so **family-led aggregation already supported**).
  - `listPaymentsByFamily(payments, familyId)`.
  - `reconcileEnrollmentCharges(charges, payments, adjustments, enrollmentId)` — per-enrollment balance + payment lineage.
- Existing tests: `utils/blueprintQueries.test.ts` covers the three ledger helpers. **Missing:** money/currency-mixing property tests, partial-allocation edge tests, RLS, snapshot generation.
- Feature-tree declared queries: `listOpenBalances`, `reconcileEnrollmentCharges`, `listPaymentsByFamily` — all implemented.

## Users And Permissions
- Actors: admin, finance (capability — not yet a DB role), super_admin. **Not** general members.
- Read: finance/admin only (D-08) — narrower than uniform member-read.
- Write: admin/finance create charges, record payments, approve adjustments.
- Public/token: none.

## Workflows
- List/search/filter: open balances (`listOpenBalances`), by family/student/period/status; payment history by family (`listPaymentsByFamily`).
- Create: charge (manual; later from enrollment/import/agreement/rollover); payment (apply to charges via `appliedChargeIds`); adjustment (signed, reason, approver).
- Detail: family/student ledger — charges, payments, adjustments, running balance, reconciliation (`reconcileEnrollmentCharges`).
- Edit: pre-application charge edits; void with audit.
- Status transitions: charge `OPEN → PARTIAL → PAID`; `→ VOID` (admin, audited). Payment allocation drives PARTIAL/PAID.
- Archive/delete: no hard delete; VOID + adjustments only (ledger integrity).
- Import/export: charge import; statement/receipt export.
- Cross-links: family/student files (finance tab, D-08-gated), enrollment, agreements (financial), reports.

## Data Contract
- Primary records: `Charge`, `Payment`, `Adjustment`, `BalanceSnapshot`.
- **Ledger owner (D-07-FIN):** default family-led rollup with per-enrollment charge lines. Charge keeps all three FKs; canonical *aggregation* key = familyId.
- Required: charge {amount, currency, dueDate, status, scope FK}; payment {amount, method, receivedAt}.
- Derived: open balance — **D-10:** compute on demand for live balance; persist `balance_snapshots` only for history/audit.
- **Currency:** `Charge.currency` exists but no mixing guard → require a single-currency-per-family invariant or explicit multi-currency handling; add property test.
- Audit: createdBy/approvedBy/server timestamps; VOID + adjustments are the mutation channel.
- Open schema decisions: D-07-FIN, D-10, currency policy.

## UX Placement (per route-nav-policy)
- Home: **top-level Finance view** (reuse dead-end `BILLING` ViewState; un-dead-end per route-nav-policy). Family/student ledger also surfaces as a **gated tab** in student-family files.
- Navigation entry: sidebar (add Finance) + palette (unhide BILLING when routed).
- Mobile: desktop-first (dense finance tables; PRODUCT.md operator displays). Not a mobile-primary workflow.
- Empty/loading/error: no-charges state; payment-exceeds-balance warning; void confirmation.
- Hebrew/RTL: currency/number formatting RTL-safe; amounts LTR-isolated within RTL.

## Role / RLS Matrix (key cells)
| Operation | admin | finance | member | refinement |
|---|---|---|---|---|
| Read ledger | ✓ | ✓ | — | ⚠ D-08 — narrower than uniform member-read |
| Create charge / record payment | ✓ | ✓ | — | needs `finance` capability/role |
| Approve adjustment / void | ✓ | per policy | — | admin-gated |
**Required refinement:** finance is not a DB role yet — uniform RLS would expose finance to all members. This is the hardest RLS delta; resolve in Pass 2.

## Acceptance Criteria
- Unit: `listOpenBalances`, `reconcileEnrollmentCharges`, `listPaymentsByFamily`; **add** partial-allocation + currency-mixing property tests + date-boundary tests.
- Supabase mapping: `charges`/`payments`/`adjustments`/`balance_snapshots` camel↔snake + numeric/jsonb (appliedChargeIds).
- RLS: real finance/admin roles; verify a plain member **cannot** read finance; verify cross-org isolation.
- Playwright: create charge → record payment → verify open balance + family payment history; void path.
- Hebrew/RTL: ledger + amounts.
- Data migration: existing demo charges/payments → canonical owner (D-07-FIN); D-15.

## Dependencies
- Blocks: reports-analytics (finance reports), year-rollover (balances), agreements (financial).
- Blocked by: **D-07-FIN, D-08, D-10**; student-family-files (family/student ledger owner); finance-role RLS refinement (Pass 2).
