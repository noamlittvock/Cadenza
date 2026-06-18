# Operations Command Center  (`operations-command-center`)

Status: `planned` (per `features/forteTree.ts`) -> target `implemented`.
Priority: p1
Owner-decisions still blocking this packet: source-specific dashboard cards and
rollups are **BLOCKED ON D-18** and **BLOCKED ON D-19** for
pending-hours/payroll semantics, **BLOCKED ON D-20** for
finance/currency work, **BLOCKED ON D-21** for absence/day-off operational
impact, **BLOCKED ON D-22** for assessment/document-delivery work, **BLOCKED ON
D-23** for public event/program exposure and endpoint health, **BLOCKED ON
D-24** for revoked/withdrawn consent work, **BLOCKED ON D-25** for instrument
deposit/refund work, **BLOCKED ON D-26** for HR/evaluation reminders, and
**BLOCKED ON D-27** for rollover grade/schedule-copy health. Core authenticated
aggregation over settled Calendar, Admin Inbox, import sessions, private reports,
and source rows the current user is already allowed to read is otherwise
unblocked by the accepted route/status policy. Guardian/contact and intake-family
cards may use `families.guardians[]` jsonb only after student-family and intake
source authorization exists.
Current accepted prerequisites: **D-01** (no new top-level route beyond current
policy), **D-02** (dead-end palette entries stay hidden until routed), **D-05**
(event adapter), **D-08** (finance capability), **D-09** (reports admin/finance
only), **D-15** (packet-local backfill only), and **D-17** (attendance counters
use one `lesson_records` row per event/student after lesson attendance ships).

## Current State (ground truth)
- Existing UI: no dedicated operations dashboard. `components/AdminInbox.tsx` is
  the closest native operator surface and is routed as `ADMIN_INBOX`, but it is
  notification/conflict-focused. `components/CalendarView.tsx` computes room
  conflict indicators and an unresolved conflict badge inline. `App.tsx`
  generates `ROOM_CONFLICT` Admin Inbox notifications from `detectRoomConflicts`
  and renders scenario/tour banners. `components/HoursComparisonView.tsx`,
  `components/CsvImportModal.tsx`, `components/CalendarSubscriptionManager.tsx`,
  and `components/ConservatoryBlueprint.tsx` are source or planning surfaces, not
  a daily command view.
- Existing schema: no `operations_dashboard` table exists or is needed for v1.
  Source rows come from HYBRID core tables `events`, `admin_inbox_items`,
  `hours_reports`, `import_sessions`, `calendar_subscriptions`, and
  `system_configs` (`0001`), plus normalized Blueprint tables such as
  `registration_intake`, `hours_entries`, `operational_requests`,
  `report_definitions`, `public_endpoints`, `rollover_runs`, and source-module
  tables as their packets ship. Uniform core RLS is org-member read/admin write;
  that is too broad for command-center cards that summarize sensitive approval,
  intake, absence, token, finance, or HR records.
- Existing query helpers: the feature-tree names `countOpenConflicts`,
  `listTodayEvents`, and `countPendingHoursReports`, but
  `features/forteTree.consistency.test.ts` documents them as stubs. Real nearby
  helpers are `detectRoomConflicts`/`getConflictingEventIds`
  (`utils/roomConflicts.ts`), `listPendingHoursReports`,
  `listPendingIntake`, `listRoomRequests`, `listAbsencesForPeriod`,
  `runReportDefinition`, `exportReportCsv`, and `getReportLineage`
  (`utils/blueprintQueries.ts`), plus Admin Inbox factories in
  `utils/adminInbox.ts`.
- Existing tests: `utils/roomConflicts.test.ts` covers room conflict detection;
  `utils/blueprintQueries.test.ts` covers the source helpers listed above;
  `features/forteTree.consistency.test.ts` keeps the three command-center query
  names honest as unimplemented stubs. No command-center query, role-aware
  aggregation, RLS, UI, deep-link, or Playwright workflow tests exist.
- Feature-tree declared queries: `countOpenConflicts`, `listTodayEvents`,
  `countPendingHoursReports` -- not implemented as exported deterministic
  helpers.

## Users And Permissions
- Actors: super_admin, admin, finance capability holders for finance/payroll
  cards only, and no public/guardian user. Teachers do not get the operator
  dashboard by default; their own attendance, schedule, hours, or request work
  stays in the source module's teacher-facing path.
- Read access: admins read all command-center cards whose source packets are
  settled and whose source rows they may read. Finance users read only D-08/
  D-09-authorized finance, hours, and report health cards. General members,
  teachers, students/families, and guardian/public users have no baseline access
  to the command center.
- Write access: the command center does not own source records. Admin quick
  actions, if built, must call the source module's transition path and RLS:
  Admin Inbox decisions, Calendar conflict actions, Reports runs, Finance ledger
  actions, or Settings/Integration actions. Finance quick actions are limited to
  finance-authorized source workflows.
- Public/token access: none. The command center must not expose a public status
  dashboard, public CSV link, or endpoint-health page.
- See embedded role matrix below.

## Workflows
- List/search/filter: daily operator summary by date window, category, severity,
  status, source module, owner, and stale-source indicator. V1 cards: open room
  conflicts, today's upcoming events, open Admin Inbox items, pending private
  import sessions/errors, private integration health, private report-definition
  health, and settled pending-hours/intake/finance cards only where the source
  packet and decisions allow them.
- Create: no primary command-center record. Admins create source records from the
  source module reached by a card, such as Calendar event, Admin Inbox request,
  ReportDefinition, Finance charge, or Settings integration.
- Detail: expanding a card shows the source row list with count, severity,
  updated timestamp, source IDs, and deep links. Sensitive detail is loaded only
  after the source access check passes; otherwise the card shows a blocked or
  permission-denied state.
- Edit: dashboard layout/filter preference may be ephemeral in v1. Editing source
  records happens only in the source surface.
- Status transitions: no command-center status enum. Source transitions are
  delegated: Admin Inbox `OPEN -> DONE|APPROVED|REJECTED`, operational requests,
  payroll/hour approval, finance posting, endpoint revocation, rollover apply, or
  HR follow-up only after the owning packet and any **BLOCKED ON D-xx** decision
  allow that transition.
- Archive/delete: no hard delete from the command center. It may hide/dismiss a
  card locally only if the source state is unchanged and the user can restore the
  view; source archive/delete rules stay in source packets.
- Import/export: command-center snapshot export is optional admin-only and should
  be implemented through reports-analytics. Source-row exports inherit the source
  packet's export/RLS rules.
- Cross-links: Admin Inbox items, Calendar events, room-conflict resolution,
  Hours/Payroll, Registration Intake, Finance, Reports/Analytics, Import/Export,
  Settings integrations, public endpoint registry, rollover runs, and source
  modules with **BLOCKED ON D-xx** markers where unsettled.

## Data Contract
- Primary record: no persisted primary record in v1. The module computes an
  `OperationsSnapshot`-style view model from authorized source rows.
- Linked records: `CalendarEvent`/`EventV2` via the D-05 adapter boundary,
  `AdminInboxItem`, `HoursReport`, normalized `HoursEntry`, `ImportSession`,
  `RegistrationIntake`, `OperationalRequest`, `ReportDefinition`,
  `PublicEndpoint`, `RolloverRun`, ledger rows, and source-module records as
  their packets ship.
- Required fields: snapshot `{orgId, dateWindow, generatedAt, cards[]}`; card
  `{id, sourceModuleId, labelKey, severity, count, status, sourceIds[],
  sourceUpdatedAt, blockedDecisionIds[], routeTarget}`. Cards must not duplicate
  private source payloads into persisted dashboard state.
- Derived/computed fields: `countOpenConflicts` from `detectRoomConflicts`;
  `listTodayEvents` from authorized Calendar events by org timezone/date window;
  `countPendingHoursReports` from the accepted hours source after
  **BLOCKED ON D-18** resolves; intake, finance, absence, assessment, public,
  consent, instrument, HR, and rollover cards from their settled source helpers
  and source RLS.
- Audit fields: generated snapshots are transient and need no audit row. If a
  later roadmap persists dashboard preferences or snapshots, use server-owned
  `createdAt`, `updatedAt`, `generatedAt`, `generatedBy`, `sourceUpdatedAt`, and
  immutable `sourceIds`.
- **Conversion semantics:** rendering the command center loads authorized source
  rows, maps HYBRID events through the D-05 adapter/projection where needed,
  computes deterministic counts/lists, and returns source-linked cards. It must
  not write aggregate counters back into source tables and must not bypass source
  module authorization through a broad security-definer query. Quick actions
  mutate only the owning source record through that source module's accepted
  conversion/status path.
- Open schema decisions: grouped attendance/unmarked counts use accepted D-17
  `lesson_records` rows after lesson attendance ships; legacy `hours_reports` vs normalized `hours_entries` pending-card
  semantics are **BLOCKED ON D-18**; payroll amount/rate variance cards are
  **BLOCKED ON D-19**; finance balance/payment work and currency-sensitive cards
  are **BLOCKED ON D-20**; absence/day-off operational-impact cards are
  **BLOCKED ON D-21**; assessment/document-delivery cards are **BLOCKED ON
  D-22**; public event/program and website endpoint cards are **BLOCKED ON
  D-23**; consent withdrawal/revocation cards are **BLOCKED ON D-24**;
  instrument deposit/refund cards are **BLOCKED ON D-25**; HR/evaluation cards
  are **BLOCKED ON D-26**; rollover grade/schedule-copy health cards are
  **BLOCKED ON D-27**.

## UX Placement (obey route-nav-policy.md)
- Home: existing **Admin Inbox / Operations summary** surface. Implement as a
  summary band or tab in the routed Admin Inbox area, with contextual drill-downs
  to Calendar, Reports, Finance, Settings, Manage, and source module details. Do
  not add a new top-level `ViewState`.
- Navigation entry: existing Admin Inbox navigation only. Do not unhide
  `ANALYTICS`, `PAYROLL`, or any other dead-end palette entry for this packet;
  those entries are owned by their source packets and route policy.
- Mobile visibility: desktop-first. Admin Inbox is intentionally mobile-hidden
  today; this dense operator dashboard may stay desktop-only. Teacher mobile
  workflows remain in attendance/hours/request packets, not here. Permission,
  blocked, and source-deep-link error states should remain readable at 390x844.
- Empty / loading / error states: no work today, no conflicts, no source access,
  source module not implemented, blocked by D-xx, stale source row deleted,
  failed source load, partial card failure, cross-org denial, and report/query
  timeout.
- Hebrew/RTL requirements: card labels, counts, severity/status chips, date
  windows, source names, blocked-decision copy, and deep-link labels need EN/HE
  strings. Times, IDs, hashes, CSV filenames, amounts, and route fragments should
  be LTR-isolated inside RTL cards.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | — | — | own | — | Use source-table RLS or a role-aware `get_operations_snapshot` RPC that enforces admin scope and D-08/D-09 finance-only card allowlists. Finance `own` means finance-authorized cards only. |
| Read detail | ✓ | ✓ | — | — | own | — | Detail rows are source-authorized per module. Do not expose intake, absence, HR, public-token, guardian/contact, or blocked source details through dashboard aggregation. |
| Create | — | — | — | — | — | — | No command-center primary record in v1; create actions route to source modules and use source RLS. |
| Edit | — | — | — | — | — | — | No source edits in the dashboard except delegated source quick actions that call owning module validation. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin may delegate Admin Inbox/Calendar/Settings source transitions only where the source packet allows them. Absence/HR/rollover transitions remain blocked where marked. |
| Status transition (payroll/finance-affecting) | ✓ | ✓ | — | — | own | — | Finance-affecting actions are delegated to payments/payroll/report packets and are **BLOCKED ON D-18**, **BLOCKED ON D-19**, **BLOCKED ON D-20**, or **BLOCKED ON D-25** as applicable. |
| Archive/delete | — | — | — | — | — | — | No command-center hard delete. Source archive/delete rules apply in source modules. |
| Export | ✓ | ✓ | — | — | own | — | Dashboard snapshot export only through reports-analytics; finance exports only finance-authorized cards/reports. |
| Public submit/sign | — | — | — | — | — | — | No public/tokenized command-center route or status endpoint. |

Required RLS refinements/tests:
- Narrow or wrap `admin_inbox_items` access before command-center launch so
  sensitive approval items do not remain broadly org-member-readable.
- If an RPC/view aggregates multiple sources, it must re-check role/capability
  per card and never return source IDs or counts the user could not obtain from
  the owning module.
- Finance users may see only D-08/D-09-authorized finance, hours, and report
  health cards; they must not infer student intake, guardian/contact, HR,
  public-token, assessment, absence, agreement, instrument deposit, or rollover
  details from hidden counts.
- Verify anon/public users have no direct or indirect dashboard access and cannot
  infer public endpoint existence through command-center health states.

## Acceptance Criteria
- Unit: implement exported deterministic helpers for `countOpenConflicts`,
  `listTodayEvents`, and `countPendingHoursReports`; remove their entries from
  `KNOWN_UNIMPLEMENTED_STUBS` when real exports exist. Add tests for hidden/
  cancelled events, org timezone date windows, stable severity ordering, source
  row deletion, blocked-card markers, and role-filtered card output. Add a
  composite snapshot helper only if it stays pure and source-authorized.
- Supabase mapping: no new table mapping for v1. Verify existing HYBRID mappings
  for `events`, `adminInboxItems`, `hoursReports`, `importSessions`,
  `calendarSubscriptions`, and normalized mappings for any source cards used by
  the snapshot. If a later preference table is added, document it in
  `supabaseSync.ts` and the migration map then.
- RLS/security: real-role tests for admin full command-center read, finance
  finance-only cards, plain member denied, teacher denied from the operator
  dashboard, cross-org isolation, no anon/public access, no card-count leakage
  from blocked or unauthorized sources, and no security-definer bypass of source
  RLS.
- Playwright smoke: admin opens Admin Inbox -> Operations summary; sees open
  conflict count, today's event list, open inbox count, import error/session
  card, private report-health card, and pending-hours card only after
  **BLOCKED ON D-18** resolves; clicking a conflict opens the Calendar event,
  clicking an inbox card opens the source inbox item, and clicking report health
  opens Analytics after reports-analytics routes. Finance user sees only allowed
  finance/report cards; plain member cannot open the dashboard. HR, public,
  agreement-revocation, public-event, deposit, and rollover-copy smokes stay
  **BLOCKED ON D-26**, **BLOCKED ON D-23**, **BLOCKED ON D-24**, **BLOCKED ON
  D-25**, and **BLOCKED ON D-27** respectively.
- Hebrew/RTL: Admin Inbox operations summary, card grid/list, blocked-source
  states, permission-denied states, source labels, and deep-link actions.
- Mobile viewport: permission/blocked/error states at 390x844. Primary operator
  triage remains desktop-first unless `route-nav-policy.md` changes Admin Inbox
  mobile visibility.
- Data migration/backfill: D-15 ACCEPTED -- packet-local only. No dashboard
  backfill and no aggregate counter table. Existing Admin Inbox conflict items,
  import sessions, hours reports, calendar subscriptions, report definitions,
  and source rows stay in their owning tables. On first launch, compute cards from
  current source rows and mark cards whose source semantics are **BLOCKED ON
  D-xx** instead of synthesizing data.

## Dependencies
- Blocks: Pass 4 roadmap sequencing for command/dashboard drill-down work,
  reports-analytics operational drill-downs, and source-module QA once the
  source packets ship.
- Blocked by: Admin Inbox and Calendar native spines; reports-analytics for
  report health/drill-downs; import-export-data-portability for import session
  details; payroll-salaries-hours plus **BLOCKED ON D-18**/**BLOCKED ON D-19**
  for pending-hours/payroll cards; public-registration-intake and accepted D-16
  jsonb guardian/contact source authorization for intake/family cards;
  payments-charges plus **BLOCKED ON D-20** for
  finance cards; rooms-absence-requests plus **BLOCKED ON D-21** for
  absence-impact cards; exams-certificates-report-cards plus **BLOCKED ON D-22**
  for assessment cards; calendar-website-integrations and concert-programs-events
  plus **BLOCKED ON D-23** for public endpoint/event cards; agreements-consent
  plus **BLOCKED ON D-24** for revocation cards; instrument-inventory plus
  **BLOCKED ON D-25** for deposit/refund cards; teacher-evaluation-hr plus
  **BLOCKED ON D-26** for HR cards; year-rollover-setup plus **BLOCKED ON D-27**
  for grade/schedule-copy health cards; and real-role RLS/source-authorization
  refinements during implementation.
