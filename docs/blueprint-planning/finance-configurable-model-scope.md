# Configurable Finance And Payroll Model Scope

Date: 2026-06-18

This document converts one conservatory finance discovery example into Cadenza
implementation assumptions. The example is useful evidence, not gospel. Cadenza
should support common conservatory finance models through configuration rather
than hard-coding one organization's spreadsheets.

## Discovery Takeaways

Many conservatories split finance into three different subsystems:

1. **Revenue / Budget P&L**
   - Catalog, tuition/pricing assumptions, account/cost-center codes, budget vs
     actuals, grant/funding lines, and category-level income/expense.
   - This is not a family billing ledger.

2. **Teacher Payroll Engine**
   - Monthly compensation workflow: attendance/hours, teacher self-reporting,
     rate cards, fixed salaries, corrections, variance checks, and bookkeeper
     export.
   - This is payable-to-teacher workflow, not family receivables.

3. **Family / Student Billing Ledger**
   - Charges, payments, allocations, balances, statements, receipts, refunds, and
     credits by family/student/payer.
   - This may be missing, external, or manual. Do not infer it from budget or
     payroll artifacts.

## Universal Configuration Surface

Cadenza should model finance with org-level configuration rather than one static
workflow:

- `currencyMode`: `SINGLE_ORG_CURRENCY` initially; future-safe for
  `MULTI_CURRENCY`.
- `orgCurrency`: default ledger currency for charges, payments, adjustments, and
  statements.
- `ledgerOwnerMode`: default `FAMILY_LEDGER`; future-safe for payer-led or split
  responsibility models.
- `chargeGenerationMode`: manual, enrollment-derived, recurring tuition,
  lesson-count/package, rental/deposit, import-only, or mixed.
- `allocationPolicy`: manual allocation initially; future-safe for oldest-first,
  invoice-specific, enrollment-specific, and unapplied-credit policies.
- `paymentMethods`: configurable method list mapped onto the existing payment
  method enum plus `OTHER` for local methods.
- `receiptPolicy`: external/manual in P0; future-safe for generated sequential
  receipts if legally required.
- `taxPolicy`: default tax-exempt/unspecified in P0; future-safe for VAT/sales-tax
  fields and accounting export.
- `payrollEntryModel`: `HOURS_ENTRY_SOURCE_OF_TRUTH`.
- `payrollReportModel`: `HOURS_REPORT_PERIOD_HEADER`.
- `ratePolicy`: configurable source order with a safe P0 default.
- `compensationModes`: hourly, fixed salary, supplier/invoice, time-clock import,
  and manual adjustment.

## Accepted Assumptions For P0

### D-18 — Payroll Report/Entry Model

`HoursEntry` is the payroll source of truth. Each row is an auditable compensation
line for a staff member/date/event/role/rate/status.

`HoursReport` is retained as a period or submission header grouping
`HoursEntry` rows for teacher submission, admin review, approval, export, and
history. It must not maintain independent payable totals that can drift from
entries. Legacy monthly workbooks/reports may be imported as immutable archive or
opening context, not as a parallel payroll ledger.

### D-19 — Payroll Rate Policy

Rates are configurable. P0 default resolution order:

1. Admin-approved manual override on the entry.
2. Staff engagement / teaching assignment / role-department rate.
3. Staff default rate.
4. Org default rate.

The payable rate is stamped on each `HoursEntry` at admin approval time. Teacher
draft/submission can show an estimate, but it does not create the final payable
rate. `PAID` entries are immutable; corrections use adjusting entries.

Fixed monthly salaries and supplier/invoice compensation should be represented as
separate compensation modes, not forced into the same hourly-rate calculation.
Statutory payroll deductions, pensions, social security, and employer-cost
provisions remain outside P0 and stay with the bookkeeper/payroll provider.

### D-20 — Currency Policy

P0 enforces a single currency per organization/family ledger. Charges, payments,
adjustments, live balances, snapshots, statements, and exports for one family
must share that currency. Mixed-currency imports should be rejected or flagged for
manual cleanup before launch.

The data model and helpers should not prevent a future multi-currency mode. If an
org later enables `MULTI_CURRENCY`, balances and statements must be partitioned
by currency, and cross-currency allocation must require explicit exchange-rate or
adjustment semantics. P0 does not silently offset one currency against another.

## P0 Scope Implications

### Payroll

Build:

- teacher self-report and admin review around `HoursEntry`;
- period/submission header via `HoursReport`;
- variance worklist from calendar/attendance vs reported hours;
- rate-card configuration and admin approval stamping;
- fixed-salary and manual-adjustment rows if the local data requires them;
- bookkeeper-ready payroll export;
- finance read/export without finance approval rights unless a later decision
  expands that scope.

Do not build in P0:

- statutory deduction/payroll-provider calculation;
- automatic finalization without a human correction/review step;
- one flat rate per teacher that erases multi-role/multi-rate work;
- historical spreadsheet re-derivation from unreliable formulas.

### Payments And Charges

Build:

- family-led ledger with per-student/per-enrollment charge lineage;
- manual charge creation and imported/demo charge canonicalization;
- payment recording with explicit allocation to charges;
- adjustments as signed audited rows;
- live balance computed on demand;
- audit snapshots only as history, not current-balance source of truth;
- single-currency validation from org/family config;
- admin/finance-only RLS and UI.

Defer unless real data proves it is required for launch:

- online processor/webhook integration;
- generated legal receipt/invoice numbering;
- VAT/tax accounting;
- multi-currency statements;
- deposits/refunds tied to instruments (still depends on D-25);
- public guardian payment portal.

## Import And Migration Assumptions

- Import revenue catalog, pricing rules, account/cost-center codes, rate cards,
  fixed salary rows, and current/open ledger rows where available.
- Treat historical monthly payroll spreadsheets as immutable archives unless they
  can be reliably normalized into entries.
- If family billing history is absent, start from explicit opening balances rather
  than manufacturing charge/payment history from budget totals.
- Normalize identity cautiously: family/student billing identity and teacher
  payroll identity are separate matching problems.

## Open Questions After These Assumptions

These are implementation discovery questions, not blockers for the P0 defaults:

- Which local payment methods should be enabled in `paymentMethods`?
- Does this org need generated receipts/invoices at launch, or is export/manual
  receipt flow enough?
- Does any actual family ledger data exist, or do we begin with opening balances?
- Which teacher identity key is most reliable for imports?
- Are fixed salaries and supplier/invoice rows required in the first payroll
  slice, or can they remain export-only/manual?
