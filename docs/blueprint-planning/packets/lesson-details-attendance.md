# Lesson Details And Attendance  (`lesson-details-attendance`)

Status: gap → planned (this packet)  ·  Priority: p0
Owner-decisions still blocking this packet: **D-17** (group-lesson record and
materialization model). Current accepted prerequisites: **D-05** (canonical event
adapter) and **D-06** (teacher self-write with admin approval gate) are implemented
foundation, not open blockers.

## Current State (ground truth)
- Existing UI: none. Calendar exists (native, source of truth: "no event = no pay"). No attendance marking surface, no per-event lesson detail panel for attendance.
- Existing schema: `lesson_records` (normalized, `0002`) — fields `eventId, studentId, staffMemberId, attendance, completion, repertoire[], homework, makeupOfLessonId`. **Already one row per (event, student)** (carries both eventId + studentId), but D-17 still needs Noam confirmation before this becomes the productized group-lesson rule. `events` (core hybrid, v1+v2 docs), `event_participants` (core). Type duplication: `CalendarEvent` vs `EventV2` (D-05); Blueprint dataEntities reference `EventV2`/`StaffMemberV2`/`StudentV2`.
- Existing query helpers (implemented + tested): `listStudentLessonHistory`, `listUnmarkedAttendance` (attendance=UNMARKED, optional cutoff), `summarizeLessonCompletion` (totals + completionRate).
- Existing tests: `utils/blueprintQueries.test.ts` covers all three. No attendance-marking **workflow/UI** tests.
- Feature-tree declared queries: `listStudentLessonHistory`, `listUnmarkedAttendance`, `summarizeLessonCompletion` — implemented.

## Users And Permissions
- Actors: teacher (marks own lessons), admin, super_admin.
- Read: org members read lesson records; teachers always see own.
- Write: **teacher marks attendance for own events** (D-06 default), admin can mark any. Payroll-affecting confirmation may gate (D-06).
- Public/token: none.

## Workflows
- List/search/filter: unmarked-attendance worklist (`listUnmarkedAttendance`) by teacher/date/activity; student lesson history (`listStudentLessonHistory`).
- Create: a lesson record is created from a calendar event (backfill/generation strategy below), not authored standalone.
- Detail: event detail panel — attendance status, completion, cancellation, makeup link, notes, repertoire, homework.
- Edit: re-mark within an allowed window; admin override.
- Status transitions (actual enums): `attendance` = `UNMARKED → {PRESENT | ABSENT | LATE | EXCUSED | MAKEUP}`; `completion` = `PENDING → {COMPLETED | CANCELLED | NO_SHOW}`. Makeups link via `makeupOfLessonId`.
- Archive/delete: cancellations retained (affect payroll/reporting); no hard delete.
- Import/export: attendance export for reporting.
- Cross-links: event ↔ student history; feeds payroll (hours from completed lessons) and reports; source-event lineage for moved/recurring events.

## Data Contract
- Primary record: `LessonRecord` / `lesson_records`.
- **D-17 — group lesson model:** `lesson_records` is already one row per
  (event, student). Group lessons can be represented as multiple `lesson_records`
  sharing one `eventId`, with the event-level view derived from row counts/statuses,
  but the loop cannot confirm this without Noam. Event-level embedded-status
  alternatives and lazy-vs-batch materialization are **BLOCKED ON D-17**.
- Linked: event (canonical per D-05), student/enrollment, teacher, room.
- Required: eventId, studentId, status, markedBy, markedAt.
- Derived: unmarked counter, completed-hours for payroll.
- Audit: markedBy, server markedAt, status-transition log.
- **Conversion semantics:** D-05/D-06 ACCEPTED — attendance marking creates or
  updates `LessonRecord` rows against an event converted through `eventToV2` /
  `eventToMinimal` at the module boundary; it never rewrites HYBRID `events`.
  Teacher writes are row-scoped to own lesson rows, while payroll approval remains
  in `hours_entries`. Existing-event materialization strategy is **BLOCKED ON D-17**.
- Schema decisions / parked items: D-17 controls group-lesson row shape and
  materialization. Exact payable-hours derivation is deferred to the payroll packet
  where D-18/D-19 apply.

## UX Placement (per route-nav-policy)
- Home: **contextual panel in Calendar event detail** (tier 3) — primary entry. Plus a cross-cutting "unmarked attendance" worklist (small surface, could live in Admin Inbox or a Calendar-adjacent panel).
- Navigation entry: none new; reached from the calendar.
- Mobile: **attendance marking is a genuine mobile workflow** (teacher in a classroom). Must be reachable + usable on mobile — explicitly NOT inheriting Manage/Admin-Inbox mobile hide. Declare in build ticket.
- Empty/loading/error: nothing-to-mark state; offline/save-failure handling for mobile.
- Hebrew/RTL: panel + worklist; notes accept Hebrew.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | ✓ | ✓ | ✓ | — | `lesson_records` still uses member-read; no accepted narrower read scope for this packet. |
| Read detail | ✓ | ✓ | ✓ | ✓ | ✓ | — | Same as list/read; detail is reached from a routed calendar event. |
| Create | ✓ | ✓ | own | — | — | — | `0004` `lesson_records_teacher_insert` allows staff self rows via `app_is_staff_self`; admin can materialize/backfill any lesson record. |
| Edit | ✓ | ✓ | own | — | — | — | `0004` `lesson_records_teacher_update` allows own event/student rows; admin can override. |
| Status transition (non-financial) | ✓ | ✓ | own | — | — | — | Teacher may mark own attendance/completion; admin handles after-window overrides. |
| Status transition (payroll/finance-affecting) | ✓ | ✓ | own | — | — | — | Lesson completion can feed hours, but payroll approval remains in `hours_entries` per D-06. |
| Archive/delete | ✓ | ✓ | — | — | — | — | No hard delete; admin cancellation/retention only. |
| Export | ✓ | ✓ | — | — | — | — | Admin-only attendance/reporting export. |
| Public submit/sign | — | — | — | — | — | — | No public attendance path. |

Required RLS refinements/tests:
- `0004` implements row-scoped teacher insert/update; add real-role tests proving a teacher can mark only their own lesson rows.
- Any future tightening of lesson-record read access must be a separate packet/decision; current accepted scope remains member-read.

## Acceptance Criteria
- Unit: `listStudentLessonHistory`, `listUnmarkedAttendance`, completed-hours derivation.
- Supabase mapping: `lesson_records` camel↔snake + jsonb.
- RLS: teacher marks own event (real teacher role); teacher cannot mark another's; admin override works.
- Playwright: open calendar event → mark attendance → verify student lesson history updates and unmarked counter decrements.
- Hebrew/RTL: event panel + worklist.
- Mobile: attendance marking at 390x844 (primary mobile case).
- Data migration: D-15 ACCEPTED — packet-local generation/backfill of
  `lesson_records` for existing events; no global `CalendarEvent` → `EventV2`
  persistence rewrite. Existing HYBRID events pass through `eventToV2` at module
  boundaries. Lazy-on-open vs batch materialization is **BLOCKED ON D-17** and
  must be settled before ship.

## Dependencies
- Blocks: payroll-salaries-hours (hours from attendance), reports-analytics.
- Blocked by: **D-17** confirmation; student-family-files (student links).
  D-05/D-06 are accepted/implemented prerequisites, not open blockers.
