# Payroll, Salaries, And Hours  (`payroll-salaries-hours`)

Status: `embedded` (per `features/forteTree.ts` + **D-STATUS-2**) → target
`implemented`. ·  Priority: p0
Owner-decisions still blocking this packet: none for the P0 payroll model.
Current accepted prerequisites: **D-05** (canonical event adapter), **D-06**
(teacher self-write with admin approval gate), **D-18** (HoursEntry source of
truth with HoursReport period header), and **D-19** (configurable rate policy
stamped at admin approval) are implemented/accepted foundation, not open blockers.

## Current State (ground truth)
- Existing UI: existing hours-reporting surface (native-ish; `hours_reports` hybrid). No consolidated payroll module.
- Existing schema:
  - `hours_entries` (normalized, `0002`): `staffMemberId, date, reportedMinutes, calendarMinutes, eventId, rate, status (DRAFT|SUBMITTED|APPROVED|PAID)`.
  - `hours_reports` (core hybrid, `0001`): legacy report docs with `staffMemberId, token, periodStart, periodEnd, createdBy`.
  - **D-18 accepted consolidation:** `HoursEntry` is source of truth;
    `HoursReport` is a period/submission header grouping entries for teacher
    submission, admin review, export, and history.
- Existing query helpers (implemented + tested):
  - `listPendingHoursReports(hoursEntries)` — status=DRAFT.
  - `compareReportedVsCalendarHours(hoursEntries)` — reported vs calendar minutes per staff/date (variance).
  - `calculatePayslipRows(hoursEntries)` — rate × minutes per entry.
- Existing tests: `utils/blueprintQueries.test.ts` covers all three. No payroll **workflow/UI** or variance-approval tests.
- Feature-tree declared queries: `listPendingHoursReports`, `compareReportedVsCalendarHours` (+ `calculatePayslipRows`) — implemented.

## Users And Permissions
- Actors: teacher (self-report own hours), admin (approve/pay), super_admin,
  finance (read/export support via `hours_entries_read`).
- Read: teachers read own entries; admin/finance read all.
- Write: **teacher self-service submit** (D-06); admin approves + marks paid.
  `0004` does not grant finance write access to payroll status transitions.
- Public/token: none. (Legacy `hours_reports.token` exists — reconcile/retire under D-14 endpoint registry, not a public payroll write.)

## Workflows
- List/search/filter: pending hours (`listPendingHoursReports`); variance worklist (`compareReportedVsCalendarHours`); by staff/period/status.
- Create: hours entry — **calendar-derived** (from completed lessons/events) vs **self-reported**; the helper already compares the two.
- Detail: per-staff period — entries, reported-vs-calendar variance, payslip preview (`calculatePayslipRows`).
- Edit: teacher edits own DRAFT; locked after SUBMITTED.
- Status transitions: `DRAFT → SUBMITTED → APPROVED → PAID`. Variance resolution gates SUBMITTED→APPROVED.
- Archive/delete: PAID is immutable; corrections via new adjusting entries.
- Import/export: payslip-row export.
- Cross-links: calendar events (source of "no event = no pay"), lesson attendance (completed lessons feed hours), finance (payslip), staff files.

## Data Contract
- Primary record: `HoursEntry`; period roll-up/header: `HoursReport`.
- Linked: staff (StaffMemberV2), event (canonical D-05), lesson completion.
- **D-19 — rate source:** configurable. P0 default resolution order is
  admin-approved manual override, then staff engagement / teaching assignment /
  role-department rate, then staff default rate, then org default rate.
  `HoursEntry.rate` is stamped at admin approval time; teacher submission may show
  an estimate but does not create the final payable rate.
- Required: staffMemberId, date, reportedMinutes, status.
- Derived: variance (reported−calendar), payslip amount (rate×minutes).
- Audit: submittedBy/approvedBy/server timestamps; PAID immutable.
- **Conversion semantics:** D-05/D-06 ACCEPTED — teacher self-report creates/edits
  own DRAFT/SUBMITTED `hours_entries`; admin approval moves entries to
  APPROVED/PAID. Calendar-derived entries link to events through the D-05 adapter
  boundary and do not rewrite HYBRID `events`. D-18 makes `HoursReport` a period
  header over entries. D-19 stamps payable rates on approval using the configured
  rate policy.
- Schema decisions / parked items: statutory deductions, pension/social-security,
  employer-cost provisions, and payroll-provider disbursement remain outside P0.

## UX Placement (per route-nav-policy)
- Home: **Manage tab or Finance sub-view** (dead-end `PAYROLL` ViewState — route per route-nav-policy; likely a Manage tab given config-like cadence). Teacher self-report is a lightweight surface reachable by teachers.
- Navigation entry: admin via Manage/Finance; teacher self-report via own surface (not Manage, which is mobile-hidden/admin-gated).
- Mobile: teacher self-report should be mobile-reachable (submit from phone); admin approval desktop-first.
- Empty/loading/error: nothing-pending state; variance-mismatch warning.
- Hebrew/RTL: hours/amounts LTR-isolated within RTL; period labels Hebrew-calendar aware.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | own | — | ✓ | — | `0004` `hours_entries_read`: admin, finance capability, or `app_is_staff_self`. Legacy `hours_reports` must be consolidated to the same scope. |
| Read detail | ✓ | ✓ | own | — | ✓ | — | Same as list/read; teacher detail is own period only. |
| Create | ✓ | ✓ | own | — | — | — | `0004` `hours_entries_teacher_insert` allows own DRAFT/SUBMITTED rows; admin can create any. |
| Edit | ✓ | ✓ | own | — | — | — | Teacher may edit own DRAFT/SUBMITTED rows; admin can correct any non-PAID row. |
| Status transition (non-financial) | ✓ | ✓ | own | — | — | — | Teacher can move own `DRAFT -> SUBMITTED`; admin can move/reset pre-approval states. |
| Status transition (payroll/finance-affecting) | ✓ | ✓ | — | — | — | — | D-06/`0004`: `APPROVED` and `PAID` transitions are admin-gated; finance is read/export only unless a future decision expands payroll capability. |
| Archive/delete | ✓ | ✓ | — | — | — | — | PAID is immutable; corrections use adjusting entries. |
| Export | ✓ | ✓ | — | — | ✓ | — | Finance read access supports payslip/payroll export; writes remain admin-gated. |
| Public submit/sign | — | — | — | — | — | — | No public payroll write; legacy `hours_reports.token` must not become a D-07 bypass. |

Required RLS refinements/tests:
- `0004` implements own-row teacher insert/update for DRAFT/SUBMITTED `hours_entries`; add real-role tests for own vs other staff rows and blocked APPROVED/PAID writes.
- HoursReport↔HoursEntry consolidation must apply the same teacher-own/admin/finance-read scope to any legacy `hours_reports` surface.

## Acceptance Criteria
- Unit: `listPendingHoursReports`, `compareReportedVsCalendarHours`, `calculatePayslipRows`; add variance-edge + rate-resolution tests.
- Supabase mapping: `hours_entries` camel↔snake; `hours_reports` hybrid wrap/unwrap.
- RLS: teacher submits own (real teacher role); cannot submit for others;
  finance can read/export but cannot approve/pay; admin approve/pay works.
- Playwright: submit hours → compare against calendar → approve → generate payslip rows.
- Hebrew/RTL: hours + payslip.
- Data migration: D-15 ACCEPTED — packet-local reconciliation of existing
  `hours_reports` docs with `hours_entries`; no global student/event migration.
  D-18 accepts `hours_reports` as period/submission headers over `hours_entries`;
  legacy monthly reports may be retained as immutable archive/opening context.
  D-19 accepts admin-approval rate stamping via the configured rate policy.

## Dependencies
- Blocks: reports-analytics (payroll reports), finance (payslip → payment).
- Blocked by: lesson-details-attendance (completed-lesson hours source).
  D-05/D-06/D-18/D-19 are accepted/implemented prerequisites, not open blockers.
