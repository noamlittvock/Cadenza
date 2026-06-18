# Instrument Inventory Follow-Up  (`instrument-inventory`)

Status: `implemented` (per `features/forteTree.ts` + **D-STATUS**) -> follow-up
packet. Priority: p1
Owner-decisions still blocking this packet: **BLOCKED ON D-20** for ledger
currency policy, **BLOCKED ON D-24** for agreement/consent withdrawal effects on
instrument loans, and **BLOCKED ON D-25** for the instrument deposit model.
Current accepted prerequisites: **D-02** (Inventory aliases to
`Manage?tab=inventory`), **D-03** (editable Family), **D-04** (canonical student
adapter), **D-11** (typed signature plus PDF upload for agreements), and
**D-15** (packet-local backfill).

## Current State (ground truth)
- Existing UI: `components/InstrumentManager.tsx` is embedded in
  `components/ManageHub.tsx` under `Manage?tab=inventory`. It lists instruments,
  shows available/on-loan/overdue counters, creates and edits catalog records,
  checks out instruments to a student or staff borrower, returns active loans,
  and retires instruments. `routing.ts` exposes `ViewState.INVENTORY` only as the
  accepted Manage-tab alias, not as a top-level route.
- Existing schema: `instruments`, `instrument_loans`, and `instrument_repairs`
  are normalized Blueprint tables from `0002`. `instruments` has asset tag,
  category, condition, status, location, acquisition/value fields, and notes.
  `instrument_loans` has borrower student/staff IDs, checkout/due/return dates,
  status, condition-out/in, optional `agreement_acceptance_id`, and note.
  `instrument_repairs` has report/resolve timestamps, description, cost,
  condition-before/after, and vendor. `0002` applies uniform org-member read and
  admin write RLS to all three tables.
- Existing query helpers: `listAvailableInstruments`, `listOverdueLoans`, and
  `getInstrumentCustodyHistory` in `utils/blueprintQueries.ts`.
- Existing tests: `utils/blueprintQueries.test.ts` covers availability filtering,
  overdue detection, and custody/repair chronology. `utils/supabaseSync.ts` maps
  `instruments`, `instrumentLoans`, and `instrumentRepairs` as `NORMALIZED`, and
  `docs/SUPABASE_MIGRATION_MAP.md` records those tables. `routing.test.ts` covers
  the `INVENTORY -> Manage?tab=inventory` alias. No dedicated inventory
  Playwright spec is present under `e2e/`; D-STATUS is an accepted current-source
  decision, so this packet does not demote the node.
- Feature-tree declared queries: `listAvailableInstruments`,
  `listOverdueLoans`, `getInstrumentCustodyHistory` -- implemented.
- Feature-tree drift to resolve during follow-up: `agentReadable.canonicalFields`
  names `instrumentType` and `currentLoanId`, while the actual type/table use
  `category` and derive the active loan from `instrument_loans`.

## Users And Permissions
- Actors: admin, super_admin, staff/teacher borrowers as linked records, student
  or family borrowers as linked records, and finance only if deposit/charge
  handling is later accepted.
- Read access: the current product surface is an admin Manage tab. Bare catalog
  data can remain org-readable if the app needs a lookup, but loan, repair,
  agreement, document, and deposit details must not rely on broad member-read
  before follow-up launch.
- Write access: admins create/edit catalog records, check out/return loans,
  retire instruments, and record repair lifecycle entries. Borrowers do not write
  inventory rows directly in v1.
- Public/token access: none in inventory itself. If a loan agreement is signed by
  a guardian/public signer, it goes through the agreements packet's accepted
  D-07/D-14 controlled token path; inventory only stores the resulting
  `agreementAcceptanceId`.
- See embedded role matrix below.

## Workflows
- List/search/filter: existing list sorted by `assetTag`, with counters for
  available, on-loan, and overdue. Follow-up adds search/filter by asset tag,
  name, category, status, condition, location, borrower, overdue, and repair
  state without changing the route home.
- Create: admin creates an `Instrument` with unique org-scoped `assetTag`,
  required `name`, category, condition, status, and optional brand, serial,
  location, acquired date, value, and notes.
- Detail: follow-up adds a detail drawer/panel for catalog metadata, current
  borrower, due date, agreement link, custody history from
  `getInstrumentCustodyHistory`, repair history, documents, and related charges
  or deposits only where unblocked.
- Edit: admin edits catalog metadata and corrects condition/status. Editing a
  currently loaned instrument must preserve the active loan and custody history.
- Status transitions: instrument `AVAILABLE -> ON_LOAN` on checkout;
  `ON_LOAN -> AVAILABLE` on return; `AVAILABLE -> IN_REPAIR` when repair opens;
  `IN_REPAIR -> AVAILABLE|RETIRED|LOST` when repair resolves; any non-retired
  instrument can move to `RETIRED` only if active-loan handling is explicit.
  Loan `ACTIVE -> RETURNED` on return; `ACTIVE -> OVERDUE` is derived from
  due-date for counters and may be materialized by a scheduled job only if the
  implementation adds one; `ACTIVE|OVERDUE -> LOST` is admin-only.
- Archive/delete: no hard delete for instruments with loans, repairs, agreements,
  documents, or financial rows. Retire instruments and retain loan/repair history.
- Import/export: admin import of catalog rows and historical loans/repairs;
  admin export of catalog, active loans, overdue loans, and custody history.
  Deposit/charge export is **BLOCKED ON D-25** and any currency behavior is
  **BLOCKED ON D-20**.
- Cross-links: Student/family files for borrower history, Staff profile for
  staff borrowers, Agreements for loan acceptance, Payments/Charges for deposits
  or replacement fees once D-25/D-20 are resolved, Reports/Analytics for overdue
  and utilization reports, Import/Export for catalog migration, and Documents for
  photos, condition reports, receipts, or repair invoices.

## Data Contract
- Primary records: `Instrument`, `InstrumentLoan`, and `InstrumentRepair`
  (`types/blueprint.ts`) in normalized tables `instruments`,
  `instrument_loans`, and `instrument_repairs`.
- Linked records: HYBRID `students` read/write through the D-04
  `utils/canonicalAdapters.ts` boundary when borrower context needs
  `StudentV2`/`MinimalStudent`; legacy `Teacher`/future `StaffMemberV2` staff
  records for staff borrowers; optional `AgreementAcceptance` for a signed loan
  agreement; optional private document records/storage objects for photos,
  condition reports, agreements, and repair invoices; optional finance rows only
  after D-25/D-20 are resolved.
- Required fields: instrument `assetTag`, `name`, `category`, `condition`,
  `status`; loan `instrumentId`, exactly one borrower (`borrowerStudentId` or
  `borrowerStaffId`), `checkedOutAt`, `status`, and `conditionOut`; repair
  `instrumentId`, `reportedAt`, `description`, and `conditionBefore`.
- Derived/computed fields: available count from instrument status, overdue loan
  set from `listOverdueLoans`, custody/repair timeline from
  `getInstrumentCustodyHistory`, active holder from `instrument_loans`, and
  current availability from the combination of instrument status plus active loan
  invariants. Do not persist a duplicate `currentLoanId` unless the packet is
  amended with a consistency rule.
- Audit fields: table `createdAt`, `updatedAt`, `createdBy`, `updatedBy`;
  loan `checkedOutAt`, `returnedAt`; repair `reportedAt`, `resolvedAt`.
  Implementation should make status-change timestamps server-owned where possible.
- **Conversion semantics:** checkout writes one `instrument_loans` row and updates
  the `instruments.status` to `ON_LOAN` in one transaction or equivalent
  all-or-nothing mutation; it must reject checkout if another active/overdue loan
  exists for the same instrument. Return updates the active loan to `RETURNED`,
  sets `returnedAt` and `conditionIn`, and updates the instrument condition/status
  from the return inspection. Repair report/resolution writes
  `instrument_repairs` and synchronizes instrument condition/status. Borrower
  student display and cross-linking use the D-04 adapter boundary; no global
  Student migration is introduced.
- Open schema decisions: deposit/fee lifecycle, storage, refund, and ledger
  linkage are **BLOCKED ON D-25**; mixed-currency behavior for any accepted
  deposit/fee ledger rows is **BLOCKED ON D-20**; consent withdrawal/revocation
  effects for existing loan agreements are **BLOCKED ON D-24**.

## UX Placement (obey route-nav-policy.md)
- Home: **Manage tab** at `Manage?tab=inventory`. Inventory remains an embedded
  Manage surface, not a top-level `ViewState.INVENTORY` route.
- Navigation entry: command palette alias only, through the accepted
  `INVENTORY -> Manage?tab=inventory` route alias. No new sidebar item.
- Mobile visibility: desktop-first because Manage is intentionally hidden on
  mobile for config/admin work. A future borrower-facing read-only loan card in
  Student or Staff detail can be mobile-readable through that owning surface, but
  the inventory Manage tab itself is not mobile-primary.
- Empty / loading / error states: no instruments, no search results, failed
  catalog load, duplicate asset tag, stale active-loan conflict, checkout without
  borrower, return without active loan, failed repair resolution, missing linked
  borrower, missing agreement record, document upload failure, and sections
  marked **BLOCKED ON D-20**, **BLOCKED ON D-24**, or **BLOCKED ON D-25**.
- Hebrew/RTL requirements: catalog table, filters, status/condition labels,
  borrower names, serial numbers, asset tags, dates, custody timeline, repair
  notes, and document filenames must remain readable in Hebrew/RTL. Asset tags,
  serial numbers, file paths, and currency values should be LTR-isolated inside
  RTL rows.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | own | — | — | — | Current `0002` member-read is broader than the follow-up target for loans/repairs. Refine `instrument_loans`/`instrument_repairs` to admin plus borrower self-scope, or expose borrower self reads through a scoped RPC/view. Bare `instruments` catalog may stay member-readable if it carries no borrower/agreement/deposit detail. |
| Read detail | ✓ | ✓ | own | — | — | — | Full detail includes borrower, agreement, documents, repair, and possible finance lineage; require admin or borrower self-scope. |
| Create | ✓ | ✓ | — | — | — | — | Existing admin-write policy covers catalog/loan/repair creation; borrowers do not self-create inventory rows. |
| Edit | ✓ | ✓ | — | — | — | — | Admin edits catalog metadata and repair details; borrower correction requires admin action. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin performs checkout, return, repair, retire, lost, and correction transitions with status-sync tests. |
| Status transition (payroll/finance-affecting) | — | — | — | — | — | — | Deposit, replacement-fee, or refund transitions are **BLOCKED ON D-25** and any currency behavior is **BLOCKED ON D-20**. |
| Archive/delete | ✓ | ✓ | — | — | — | — | No hard delete after linked loans/repairs/agreements/documents/finance rows; retire instead. |
| Export | ✓ | ✓ | — | — | — | — | Admin catalog/loan/repair export. Finance/deposit exports are **BLOCKED ON D-25**. |
| Public submit/sign | — | — | — | — | — | — | No inventory public write path. Guardian/public agreement signing, if used, belongs to agreements-consent through D-07/D-14. |

Required RLS refinements/tests:
- Prove plain org members cannot read borrower/agreement/deposit/document details
  unless they are the borrower self-context explicitly allowed by the packet.
- Prove staff borrowers can read only their own contextual loan summary if that
  surface ships; they cannot list all loans, edit, return, or retire instruments.
- Keep admin write access for catalog, checkout/return, repair, and retire, with
  cross-org isolation for all three normalized tables.
- If document or agreement links are shown, storage/table policies must match the
  same admin or borrower self-scope. Do not leak signed agreements through broad
  member-readable document paths.

## Acceptance Criteria
- Unit: existing helper coverage for `listAvailableInstruments`,
  `listOverdueLoans`, and `getInstrumentCustodyHistory`; add tests for checkout
  active-loan uniqueness, return status/condition synchronization, repair
  open/resolve synchronization, retired/lost edge cases, and overdue derivation
  at date boundaries.
- Supabase mapping: normalized camel<->snake mapping for `instruments`,
  `instrumentLoans`, and `instrumentRepairs`, including numeric `valueAmount` and
  repair `cost`, date/timestamp fields, and optional `agreementAcceptanceId`.
- RLS/security: real-role tests for admin full access, plain member denied from
  loan/repair/agreement detail, staff borrower own contextual read if shipped,
  staff borrower cannot mutate rows, no guardian/public table access, and
  cross-org isolation.
- Playwright smoke: Manage -> Inventory -> add instrument -> edit metadata ->
  checkout to a student with due date -> overdue counter appears for past due date
  -> return instrument -> custody history records checkout/return -> retire
  instrument. Follow-up smoke for repair/document/detail panel when those sections
  are built. Deposit/fee smoke is **BLOCKED ON D-25**.
- Hebrew/RTL: inventory table, filters, checkout modal, return/repair/detail
  panel, document labels, status chips, and mixed-direction asset tags.
- Mobile viewport: desktop-first Manage flow does not need mobile-primary
  coverage, but any borrower loan card in Student/Staff detail must be readable at
  390x844.
- Data migration/backfill: D-15 ACCEPTED -- packet-local only. Existing
  local/demo inventory rows remain in normalized tables. Backfill historical loans
  and repairs only when source records exist; otherwise preserve current catalog
  and derive availability from current instrument status. No global Student,
  Staff, or Event migration. Any deposit/fee backfill is **BLOCKED ON D-25** and
  any mixed-currency handling is **BLOCKED ON D-20**.

## Dependencies
- Blocks: reports-analytics for overdue, utilization, repair-cost, and custody
  reports; import-export-data-portability for catalog/loan/repair import/export;
  agreements-consent for loan agreement request/history; payments-charges only if
  instrument deposits, replacement fees, or refunds are accepted; student-family
  files for borrower history and family context.
- Blocked by: student-family-files for first-class borrower/family cross-links,
  agreements-consent for structured loan agreement request/history, real-role RLS
  refinements for loan/repair/document detail, **D-20** for currency behavior,
  **D-24** for agreement withdrawal effects on instrument loans, and **D-25** for
  the deposit model.
