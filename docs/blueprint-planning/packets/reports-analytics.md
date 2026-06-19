# Reports And Analytics  (`reports-analytics`)

Status: `planned` (per `features/forteTree.ts`) -> target `implemented`.
Priority: p1
Owner-decisions still blocking this packet: source-specific report packs are
**BLOCKED ON D-21** for absence/day-off side-effect reports, **BLOCKED
ON D-22** for richer assessment/document-delivery reports, **BLOCKED ON D-23** for
public event/program exposure reports, **BLOCKED ON D-24** for consent revocation
reports, **BLOCKED ON D-25** for instrument deposit/refund reports, **BLOCKED ON
D-26** for HR/evaluation reports, and **BLOCKED ON D-27** for rollover
grade/schedule-copy reports. Core authenticated report-definition management,
run, lineage, and CSV export over currently allowed source rows is otherwise
unblocked by accepted D-08, D-09, D-15, D-16, D-17, D-18, D-19, and D-20.
Guardian/contact reports may use `families.guardians[]` jsonb only after
student-family source authorization exists.
Current accepted prerequisites: **D-08** (finance capability), **D-09**
(reports are admin/finance only initially), **D-15** (packet-local backfill), and
**D-17** (attendance reports use one `lesson_records` row per event/student after
lesson attendance ships).

## Current State (ground truth, with file refs)
- Existing UI: no dedicated reports/analytics product surface. `ViewState.ANALYTICS`
  exists in `types.ts` and `CommandPalette.tsx` labels/icons, but `App.tsx` does
  not route it and D-02 keeps it hidden until a real surface ships. Existing
  hours-report comparison UI (`components/HoursComparisonView.tsx`) belongs to
  the payroll/hours workflow; `components/ConservatoryBlueprint.tsx` is a planning
  coverage dashboard, not operational reporting. Recharts is installed, and
  `utils/csvUtils.ts` has generic CSV utilities, but reports should be
  query-backed tables first.
- Existing schema: `report_definitions` is a normalized Blueprint table from
  `0002` with `name`, `description`, `source_entity`, `filters[]`, `group_by`,
  `aggregate`, `columns[]`, `is_pinned`, and audit columns. Source rows come from
  existing HYBRID and normalized tables (`events`, `students`, `enrollments`,
  `charges`, `payments`, `hours_entries`, `lesson_records`, `instruments`, and
  related source modules). Current `report_definitions` RLS inherits uniform
  org-member read/admin write, which is too broad for D-09. `0004` narrows ledger
  tables and `hours_entries` per D-08, but does not yet narrow the reports module.
- Existing query helpers: `runReportDefinition`, `exportReportCsv`, and
  `getReportLineage` in `utils/blueprintQueries.ts`.
- Existing tests: `utils/blueprintQueries.test.ts` covers filtering/grouping/
  projection, CSV quoting, and lineage. `utils/supabaseSync.ts` maps
  `reportDefinitions -> report_definitions` as `NORMALIZED`. No product UI, RLS,
  source-row authorization, saved-report management, chart rendering, export
  audit, or Playwright workflow tests exist for this module.
- Feature-tree declared queries: `runReportDefinition`, `exportReportCsv`,
  `getReportLineage` -- implemented.

## Users And Permissions
- Actors: super_admin, admin, finance capability holders, and no one else by
  default. Teachers, general members, students/families, guardian/public users,
  and anonymous users have no baseline reports access.
- Read access: admins read and run all report definitions allowed by settled
  source modules. Finance users read/run/export only finance-authorized reports:
  ledger tables from D-08 and payroll read/export surfaces explicitly allowed by
  the payroll packet. Finance must not gain student, attendance, assessment,
  concert, agreement, HR, or rollover data through reports unless the relevant
  packet/decision grants that scope.
- Write access: admins create, edit, pin, archive, and delete report definitions.
  Finance users can run/export their allowed reports but do not create or edit
  shared definitions in v1.
- Public/token access: none. Reports do not create public dashboards, public CSV
  links, or unauthenticated analytics endpoints.
- See embedded role matrix below.

## Workflows (the verbs)
- List/search/filter: admin/finance report library by source entity, pinned
  state, creator, updated date, table/chart availability, blocked-source marker,
  and favorite/pinned definitions. Finance sees only D-08-authorized definitions.
- Create: admin creates a `ReportDefinition` by choosing an allowed
  `sourceEntity`, selecting fields from a server-side allowlist, adding filters,
  choosing optional `groupBy`, aggregate, and projected columns. Create must
  reject fields outside the source allowlist and reject blocked report packs.
- Detail: report detail shows definition metadata, filter chips, column list,
  last-run timestamp if implemented, result table, optional grouped/chart view,
  CSV export action, and lineage from `getReportLineage` with source row IDs.
- Edit: admin edits name, description, filters, columns, group/aggregate, and
  pinned/archive state. Editing a definition never mutates source rows.
- Status transitions: current schema has no status enum. V1 supports
  `isPinned: false <-> true`; implementation must add a soft-archive field or
  equivalent retained state before destructive deletion of saved definitions is
  exposed.
- Archive/delete: prefer soft archive for shared or previously exported
  definitions. Hard delete is allowed only for unused drafts with no export/run
  audit; otherwise retain the definition so lineage remains reproducible.
- Import/export: run result CSV via `exportReportCsv`; optional import/export of
  report-definition JSON for admins only. Source-entity data import remains in
  import-export-data-portability.
- Cross-links: result rows open the owning source record when the user has access:
  Student/family, Calendar event, Finance ledger, payroll hour entry, lesson
  record, instrument, source module detail, or blocked-source explanation.

## Data Contract
- Primary record: `ReportDefinition` (`types/blueprint.ts`) /
  `report_definitions`.
- Linked records: report source rows identified by `ReportSourceEntity`
  (`events`, `students`, `enrollments`, `charges`, `payments`, `hoursEntries`,
  `lessonRecords`, `instruments`) plus `sourceIds` returned by
  `getReportLineage`. HYBRID `students`/`events` cross module boundaries through
  accepted D-04/D-05 adapter/projection seams. Ledger and hours rows inherit D-08
  finance capability rules.
- Required fields: `name`, `sourceEntity`, `filters[]`, `aggregate`, `columns[]`,
  and `isPinned`. Implementation must validate every filter/group/column field
  against a source-specific allowlist instead of accepting arbitrary object keys.
- Derived/computed fields: `ReportResult.rows`, `groups`, `totalRows`, and
  `sourceIds` are computed on demand by `runReportDefinition`; chart data is a
  presentation of `groups`, not a separate source of truth.
- Audit fields: table `createdAt`, `updatedAt`, `createdBy`, `updatedBy`; if run
  or export history is persisted later, use server-owned `lastRunAt`,
  `lastExportedAt`, `runBy`, and immutable filter/source snapshots.
- **Conversion semantics:** creating or editing a report writes only the
  normalized `report_definitions` row. Running a report loads one authorized
  homogeneous source row set, maps HYBRID rows through existing sync/adapters as
  needed, applies deterministic filters/grouping/projection, and returns
  `ReportResult` plus lineage. Exports are generated from that result and do not
  mutate source records. Reports must never bypass source-table RLS or the
  D-08/D-09 access limits by reading a broader row set on behalf of finance or
  members.
- Open schema decisions: grouped attendance reports use accepted D-17
  `lesson_records` rows after lesson attendance ships; payroll reports use
  accepted D-18/D-19 `HoursEntry` source rows, period headers, and approval-time
  stamped rates; finance reports use accepted D-20 single-currency P0 behavior;
  explicit multi-currency report packs are deferred until a future
  `MULTI_CURRENCY` mode is implemented. Absence/day
  operational-impact reports are **BLOCKED ON D-21**; assessment PDF/email/rubric
  reports are **BLOCKED ON D-22**; public publication/performance audit reports
  are **BLOCKED ON D-23**; consent revocation reports are **BLOCKED ON D-24**;
  instrument deposit/refund reports are **BLOCKED ON D-25**; HR/evaluation
  reports are **BLOCKED ON D-26**; rollover grade/schedule-copy reports are
  **BLOCKED ON D-27**.

## UX Placement (obey route-nav-policy.md)
- Home: route the existing dead-end `ANALYTICS` ViewState as the Reports workspace
  when this module ships. This does not add a new ViewState. Until the route
  exists, D-02 keeps `ANALYTICS` hidden from the command palette.
- Navigation entry: command palette destination only in v1; do not add a new
  persistent sidebar item beyond the currently accepted Students and Finance
  additions. Finance reports may also be linked contextually from the Finance
  view once payments/charges ships.
- Mobile visibility: desktop-first. Reports are dense operator tables; no
  mobile-primary workflow is required. Permission-denied, empty, and CSV/error
  states must remain readable at 390x844, but primary authoring/export QA is
  desktop.
- Empty / loading / error states: no definitions, no results, no access to this
  source, blocked by D-xx, stale field/column after schema change, invalid filter
  value, source row deleted, CSV generation failure, oversized result warning,
  and permission denied.
- Hebrew/RTL requirements: report library, filters, table headers, aggregate
  labels, export actions, chart labels, status/error copy, and source-link labels
  must have EN/HE strings. IDs, CSV filenames, numbers, currency values, and
  timestamps should be LTR-isolated inside RTL rows.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | — | — | own | — | Refine `report_definitions_read` from uniform member-read to admin plus finance capability for finance-authorized definitions only; use source allowlists or an RPC/view so finance cannot enumerate blocked/non-finance report packs. |
| Read detail | ✓ | ✓ | — | — | own | — | Same as list/read. Detail and lineage must be source-authorized; finance detail is limited to D-08 ledger/hour scopes and safe columns. |
| Create | ✓ | ✓ | — | — | — | — | Admin-only report-definition creation under admin policy; reject arbitrary source/field names. |
| Edit | ✓ | ✓ | — | — | — | — | Admin-only edits to filters, columns, aggregates, pin/archive state, and descriptions. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin pins/unpins and archives definitions; no source-record status mutation. |
| Status transition (payroll/finance-affecting) | — | — | — | — | — | — | Reports do not mutate payroll/ledger records. Payroll and finance reports use accepted D-18/D-19/D-20 semantics from their source packets. |
| Archive/delete | ✓ | ✓ | — | — | — | — | Admin soft-archive or delete unused drafts only; retain definitions with run/export lineage. |
| Export | ✓ | ✓ | — | — | own | — | Admin exports all allowed reports. Finance exports only D-08-authorized finance/payroll reports; no HR/assessment/student roster/public reports by default. |
| Public submit/sign | — | — | — | — | — | — | No public/tokenized report route, CSV link, or dashboard in v1. |

Required RLS refinements/tests:
- Narrow `report_definitions` from uniform org-member read to D-09 admin/finance
  scope before launch.
- Enforce source-row authorization in the run/export path, not only in the UI.
  A finance user must not receive student, attendance, agreement, assessment,
  concert, HR, rollover, or hidden public-endpoint data through a saved report.
- Add source/column allowlists so `runReportDefinition` cannot be pointed at
  arbitrary fields that leak nested personal data or private document paths.
- Verify no anon/public access exists for report definitions, results, exports,
  lineage, or source rows.

## Acceptance Criteria
- Unit: existing tests for `runReportDefinition`, `exportReportCsv`, and
  `getReportLineage` stay green; add tests for every filter operator, null/empty
  values, `aggregate.fn = none`, invalid column rejection, grouped average/min/max
  edge cases, stable row order, blocked-source markers, finance source allowlists,
  and lineage after filtered rows are removed.
- Supabase mapping: normalized camel<->snake mapping for `reportDefinitions`;
  `filters`, `aggregate`, and `columns` jsonb round-trip without key loss. HYBRID
  source reads remain wrapped/unwrapped through existing sync, D-04/D-05 adapters,
  and source-specific helpers.
- RLS/security: real-role tests for admin full definition/run/export access,
  finance allowed only on D-08-authorized report sources, plain member denied,
  teacher denied by default, guardian/public/anon denied, no cross-org reads, and
  no report-run bypass of source table RLS.
- Playwright smoke: admin opens Analytics -> creates a pinned charge-status
  report -> runs it -> table and grouped summary render -> CSV downloads -> line
  item opens the linked finance record. Finance user can run/export the same
  finance report but cannot create a shared definition or run a student/attendance
  report. HR, public, and blocked-source report smokes are **BLOCKED ON D-26**,
  **BLOCKED ON D-23**, and the relevant **BLOCKED ON D-xx** source decision.
- Hebrew/RTL: report library, definition builder, result table, grouped/chart
  view, export controls, blocked-source messages, and permission-denied states.
- Mobile viewport: permission, empty, and result-read states at 390x844; primary
  report builder/export flow is desktop-first unless route policy changes.
- Data migration/backfill: D-15 ACCEPTED -- packet-local only. Seed initial
  report definitions only for settled source modules and field allowlists, validate
  that each definition's `sourceEntity`, filters, group field, and columns still
  exist, and mark or skip definitions whose sources are **BLOCKED ON D-xx**. Do
  not create a global Student/Event migration or backfill duplicate aggregate
  tables. Live balances remain computed on demand per D-10; snapshot-history
  reporting is audit-only and P0 currency behavior follows accepted D-20.

## Dependencies
- Blocks: operations-command-center for report/health drill-downs; import-export-
  data-portability for report-definition export/import; source modules that need
  saved operational reports after their own packets ship.
- Blocked by: student-family-files for authoritative student/family links and
  guardian/contact source authorization through the accepted D-16 jsonb path;
  lesson-details-attendance for attendance reports using accepted D-17 rows;
  payroll-salaries-hours for payroll reports using accepted D-18/D-19 semantics;
  payments-charges for finance/currency reports using accepted D-20 semantics; rooms-
  absence-requests and **BLOCKED ON D-21** for absence impact reports; exams-
  certificates-report-cards and **BLOCKED ON D-22** for richer assessment reports;
  concert-programs-events and **BLOCKED ON D-23** for public/performance exposure
  reports; agreements-consent and **BLOCKED ON D-24** for revocation reports;
  instrument-inventory and **BLOCKED ON D-25** for deposit/refund reports;
  teacher-evaluation-hr and **BLOCKED ON D-26** for HR reports; year-rollover-
  setup and **BLOCKED ON D-27** for grade/schedule-copy reports; real-role RLS
  refinements and source-authorization tests during implementation. D-08/D-09/
  D-15 are accepted prerequisites, not open blockers.
