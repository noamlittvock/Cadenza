# Payroll, Salaries, And Hours  (`payroll-salaries-hours`)

Status: tree says `gap`; per status-policy this is **`embedded`** (existing hours
reporting + `hours_reports`) → target `implemented`. Drift logged as **D-STATUS-2**.
·  Priority: p0
Owner-decisions blocking this packet: **D-05** (canonical event), **D-06** (teacher
self-report vs admin approval), **PR-RATE** (rate source, below).

## Current State (ground truth)
- Existing UI: existing hours-reporting surface (native-ish; `hours_reports` hybrid). No consolidated payroll module.
- Existing schema:
  - `hours_entries` (normalized, `0002`): `staffMemberId, date, reportedMinutes, calendarMinutes, eventId, rate, status (DRAFT|SUBMITTED|APPROVED|PAID)`.
  - `hours_reports` (core hybrid, `0001`): legacy report docs with `staffMemberId, token, periodStart, periodEnd, createdBy`.
  - **Consolidation needed:** two parallel models — `HoursReport` (hybrid, period-level) vs `HoursEntry` (normalized, line-level). Define the relationship (entries roll up into a report?).
- Existing query helpers (implemented + tested):
  - `listPendingHoursReports(hoursEntries)` — status=DRAFT.
  - `compareReportedVsCalendarHours(hoursEntries)` — reported vs calendar minutes per staff/date (variance).
  - `calculatePayslipRows(hoursEntries)` — rate × minutes per entry.
- Existing tests: `utils/blueprintQueries.test.ts` covers all three. No payroll **workflow/UI** or variance-approval tests.
- Feature-tree declared queries: `listPendingHoursReports`, `compareReportedVsCalendarHours` (+ `calculatePayslipRows`) — implemented.

## Users And Permissions
- Actors: teacher (self-report own hours), admin (approve/pay), super_admin, finance (pay).
- Read: teachers read own entries; admin/finance read all.
- Write: **teacher self-service submit** (D-06); admin approves + marks paid.
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
- Primary record: `HoursEntry`; period roll-up: `HoursReport` (consolidation decision).
- Linked: staff (StaffMemberV2), event (canonical D-05), lesson completion.
- **PR-RATE (rate source):** teaching assignment vs org role vs manual override. `HoursEntry.rate` is per-entry; decide the resolution order and where the rate is stamped (at submit vs at approve).
- Required: staffMemberId, date, reportedMinutes, status.
- Derived: variance (reported−calendar), payslip amount (rate×minutes).
- Audit: submittedBy/approvedBy/server timestamps; PAID immutable.
- Open schema decisions: HoursReport↔HoursEntry consolidation, PR-RATE.

## UX Placement (per route-nav-policy)
- Home: **Manage tab or Finance sub-view** (dead-end `PAYROLL` ViewState — route per route-nav-policy; likely a Manage tab given config-like cadence). Teacher self-report is a lightweight surface reachable by teachers.
- Navigation entry: admin via Manage/Finance; teacher self-report via own surface (not Manage, which is mobile-hidden/admin-gated).
- Mobile: teacher self-report should be mobile-reachable (submit from phone); admin approval desktop-first.
- Empty/loading/error: nothing-pending state; variance-mismatch warning.
- Hebrew/RTL: hours/amounts LTR-isolated within RTL; period labels Hebrew-calendar aware.

## Role / RLS Matrix (key cells)
| Operation | teacher (own) | admin | finance | refinement |
|---|---|---|---|---|
| Read own hours | ✓ | ✓ | ✓ | row-scope teacher to own (⚠ D-06) |
| Submit own hours | ✓ | ✓ | — | ⚠ uniform RLS makes writes admin-only today |
| Approve / mark PAID | — | ✓ | per policy | admin-gated |
**Required refinement:** teacher self-write to own entries (D-06) + finance visibility (D-08-adjacent).

## Acceptance Criteria
- Unit: `listPendingHoursReports`, `compareReportedVsCalendarHours`, `calculatePayslipRows`; add variance-edge + rate-resolution tests.
- Supabase mapping: `hours_entries` camel↔snake; `hours_reports` hybrid wrap/unwrap.
- RLS: teacher submits own (real teacher role); cannot submit for others; admin approve/pay works.
- Playwright: submit hours → compare against calendar → approve → generate payslip rows.
- Hebrew/RTL: hours + payslip.
- Data migration: reconcile existing `hours_reports` docs into entries/reports model (D-15).

## Dependencies
- Blocks: reports-analytics (payroll reports), finance (payslip → payment).
- Blocked by: **D-05, D-06, PR-RATE**, HoursReport↔HoursEntry consolidation; lesson-details-attendance (completed-lesson hours source).
