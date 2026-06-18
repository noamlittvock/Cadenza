# Rooms, Absences, And Day Requests  (`rooms-absence-requests`)

Status: `embedded` (per `features/forteTree.ts`) -> target `implemented`.
Priority: p1
Owner-decisions still blocking this packet: **D-21** (approved absence/day-request
calendar mutation rules). Current accepted prerequisites: **D-05** (canonical event
adapter) is implemented foundation, not an open blocker.

## Current State (ground truth)
- Existing UI: room inventory CRUD exists as `components/RoomManager.tsx` inside
  `Manage?tab=rooms`; room conflict triage exists in `components/AdminInbox.tsx`
  for `ROOM_CONFLICT` notifications. There is no teacher request form, no
  operational-request approval queue, and no shipped absence/day-off side-effect
  workflow.
- Existing schema: `rooms`, `events`, `gantt_blocks`, and `admin_inbox_items` are
  core HYBRID tables (`0001`). `operational_requests` is normalized (`0002`) with
  `kind` = `ROOM_CHANGE | ABSENCE | DAY_OFF`, `status` =
  `PENDING | APPROVED | REJECTED | CANCELLED`, staff/date/room/event fields,
  decision lineage, and `adminInboxItemId`. `admin_inbox_items` already supports
  `APPROVAL_REQUEST`, but the UI is notification-focused today.
- Existing query/helpers: `listRoomRequests`, `listAbsencesForPeriod`, and
  `applyApprovedRoomChange` in `utils/blueprintQueries.ts`; Admin Inbox factory
  helpers `makeApprovalRequest` and `decideApproval` in `utils/adminInbox.ts`;
  native conflict helper `detectRoomConflicts` in `utils/roomConflicts.ts`.
- Existing tests: `utils/blueprintQueries.test.ts` covers the three operational
  request helpers; `utils/roomConflicts.test.ts` covers native room conflict
  detection. No request creation, Admin Inbox approval, RLS, or Playwright workflow
  tests exist for this module.
- Feature-tree declared queries: `listRoomRequests`, `listAbsencesForPeriod`,
  `applyApprovedRoomChange` — implemented.

## Users And Permissions
- Actors: teacher/requesting staff, admin, super_admin. Finance has no special
  access; guardian/public has no access.
- Read access: admins read all operational requests; teachers read their own
  requests/statuses. General member read must be narrowed before launch because
  absence reasons can contain staff personal information.
- Write access: teachers create/cancel their own pending requests; admins create,
  approve, reject, cancel, and apply side effects.
- Public/token access: none.
- See embedded role matrix below.

## Workflows
- List/search/filter: admin queue in Admin Inbox by kind/status/date/staff; teacher
  "my requests" list by status and affected date; room-change queue via
  `listRoomRequests`; absence/day-off calendar overlay via `listAbsencesForPeriod`.
- Create: teacher creates a room-change request from a calendar event or creates an
  absence/day-off request for a date range. Create writes `operational_requests`
  status `PENDING` plus a linked `APPROVAL_REQUEST` Admin Inbox item.
- Detail: request detail shows requester, event/room/date range, reason,
  conflict context, decision note, and linked inbox item.
- Edit: teacher may edit/cancel only their own `PENDING` request. Admin may edit
  request metadata before decision and may add decision notes.
- Status transitions: `PENDING -> APPROVED`; `PENDING -> REJECTED`;
  `PENDING -> CANCELLED`. Approved/rejected/cancelled requests are terminal except
  admin correction by explicit audit entry.
- Archive/delete: no hard delete; retain rejected/cancelled/approved rows for
  audit and reporting.
- Import/export: admin export of request history; no import for v1.
- Cross-links: request <-> Admin Inbox item; room-change request <-> Calendar
  event + Room; absence/day-off request <-> staff schedule, Calendar, Gantt/blackout
  view once D-21 is resolved.

## Data Contract
- Primary record: `OperationalRequest` (`types/blueprint.ts`) /
  `operational_requests`.
- Linked records: `Room`, `CalendarEvent`/`EventV2`, `AdminInboxItem`, `GanttBlock`,
  requesting staff member.
- Required fields: `kind`, `status`, `requestedByStaffId`, `requestedFor`;
  `eventId`, `currentRoomId`, and `requestedRoomId` for `ROOM_CHANGE`; `endDate`
  when an absence/day-off spans multiple days.
- Derived/computed fields: room-request queue from `listRoomRequests`;
  absence/day-off overlap from `listAbsencesForPeriod`; approved room mutation from
  `applyApprovedRoomChange`.
- Audit fields: `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `decidedBy`,
  `decidedAt`, `decisionNote`, `adminInboxItemId`; decision timestamps are
  server-owned in implementation.
- **Conversion semantics:** create writes a normalized `operational_requests` row
  and a linked HYBRID `admin_inbox_items` approval item. Approving a `ROOM_CHANGE`
  uses `applyApprovedRoomChange` to return the approved request plus the event room
  mutation; persistence updates the request, inbox item, and HYBRID event record
  transactionally while preserving the D-05 event adapter boundary. Approved
  `ABSENCE`/`DAY_OFF` side effects and "extra teaching day" representation are
  **BLOCKED ON D-21**.
- Open schema decisions: **D-21** controls whether approved absence/day requests
  create `GanttBlock` blackouts, cancel/reschedule events, generate makeup work,
  affect lesson/payroll records, add a new `RequestKind` for extra teaching days,
  or only notify admins.

## UX Placement (obey route-nav-policy.md)
- Home: **Admin Inbox** for admin approval; **contextual Calendar event action**
  for room-change requests; teacher self-service "my requests" entry reachable
  from Calendar/staff context. Room inventory remains the existing Manage tab.
- Navigation entry: no new sidebar or command-palette destination in v1.
- Mobile visibility: teacher request creation/cancel/status is mobile-reachable at
  390x844 and must not inherit Manage/Admin-Inbox mobile hiding by accident. Admin
  approval remains desktop-first in Admin Inbox unless Noam later requires mobile
  approvals.
- Empty / loading / error states: empty pending queue, no own requests, no rooms
  available for an event, stale linked event/room, submit failure, decision
  conflict after event changed.
- Hebrew/RTL requirements: request form, queue filters, date ranges, room names,
  decision notes, and reason text must work in Hebrew/RTL; time/date values remain
  readable in mixed-direction rows.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | own | — | — | — | Refine `operational_requests_read` from uniform member-read to admin or `app_is_staff_self(org_id, requested_by_staff_id)`; linked inbox items need matching scope. |
| Read detail | ✓ | ✓ | own | — | — | — | Same as list/read; reason/decision notes must not be visible to general members. |
| Create | ✓ | ✓ | own | — | — | — | Add teacher self-insert for `PENDING` rows where `requested_by_staff_id` matches the authenticated staff member. |
| Edit | ✓ | ✓ | own | — | — | — | Teacher may edit/cancel only own `PENDING` rows; admin can correct before decision. |
| Status transition (non-financial) | ✓ | ✓ | own | — | — | — | Teacher can cancel own pending request; admin approves/rejects room changes and records decision lineage. |
| Status transition (payroll/finance-affecting) | ✓ | ✓ | — | — | — | — | Absence/day-off effects may affect attendance/payroll and are **BLOCKED ON D-21**; admin-only once resolved. |
| Archive/delete | ✓ | ✓ | — | — | — | — | No hard delete; retain decided/cancelled requests. |
| Export | ✓ | ✓ | — | — | — | — | Admin-only operational request export. |
| Public submit/sign | — | — | — | — | — | — | No public/tokenized request path. |

Required RLS refinements/tests:
- Narrow `operational_requests` read access from uniform member-read to admin or
  requester self-scope.
- Add teacher self insert/update/cancel policies for own `PENDING` rows; verify
  teachers cannot create for another staff member or decide requests.
- Align linked `APPROVAL_REQUEST` Admin Inbox visibility with the request scope so
  a broad member-read inbox item does not leak absence reasons.

## Acceptance Criteria
- Unit: existing helper coverage for `listRoomRequests`, `listAbsencesForPeriod`,
  and `applyApprovedRoomChange`; add tests for terminal statuses, own-request
  filtering, stale linked event/room handling, and D-21 side-effect helpers once
  resolved.
- Supabase mapping: normalized `operational_requests` camel<->snake; HYBRID
  `rooms`, `events`, `gantt_blocks`, and `admin_inbox_items` wrap/unwrap preserved.
- RLS/security: real-role tests showing teacher creates/cancels own pending
  request, cannot submit for others, cannot approve/reject; plain member cannot
  read all requests; admin can decide and apply room change.
- Playwright smoke: teacher requests event room change -> admin approves in Admin
  Inbox -> event room updates -> request and inbox item show approved. Absence/day
  workflow smoke is **BLOCKED ON D-21**.
- Hebrew/RTL: teacher request form and admin queue.
- Mobile viewport: teacher create/cancel/status at 390x844; admin approval
  desktop-first.
- Data migration/backfill: D-15 ACCEPTED — packet-local only. Existing
  `ROOM_CONFLICT` notifications remain notification history; do not backfill them
  into `operational_requests` unless they represent a submitted request. No global
  CalendarEvent/EventV2 persistence migration; event mutations preserve the
  current HYBRID event storage. Existing/demo absence/day-off data handling is
  **BLOCKED ON D-21**.

## Dependencies
- Blocks: reports-analytics (absence/request reporting), payroll-salaries-hours and
  lesson-details-attendance only if D-21 makes approved absences affect attendance
  or payable time, calendar-website-integrations if absence blackouts are exposed.
- Blocked by: **D-21** for absence/day-off/extra-day side effects; real-role RLS
  refinements for teacher self-service operational requests during implementation.
  D-05 is an accepted/implemented prerequisite, not an open blocker.
