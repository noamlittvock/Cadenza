# Lesson Details And Attendance  (`lesson-details-attendance`)

Status: implemented  ·  Priority: p0
Owner-decisions still blocking this packet: none for the current P0 attendance
materialization path. Accepted prerequisites: **D-05** (canonical event adapter),
**D-06** (teacher self-write with admin approval gate), and **D-17** (one lesson
row per event/student with explicit preparation) are implemented/accepted
foundation, not open blockers.

## Current State (ground truth)
- Existing UI: Calendar event detail now includes event-linked attendance
  read/mark controls, an explicit teacher/admin row preparation action for
  existing events, an unmarked worklist, student lesson history links,
  Hebrew/RTL, and 390x844 mobile coverage. Preparation follows accepted D-17:
  no rows are created on event open, and prepared rows start unconfirmed.
- Existing schema: `lesson_records` (normalized, `0002`) — fields `eventId, studentId, staffMemberId, attendance, completion, repertoire[], homework, makeupOfLessonId`. D-17 ACCEPTED: one row per `(event, student)`. Group lessons are multiple `lesson_records` sharing one `eventId`; event-level attendance views are derived from row counts/statuses. `events` (core hybrid, v1+v2 docs), `event_participants` (core). Type duplication: `CalendarEvent` vs `EventV2` (D-05); Blueprint dataEntities reference `EventV2`/`StaffMemberV2`/`StudentV2`.
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
- **D-17 — group lesson model:** ACCEPTED 2026-06-18. `lesson_records` is one row
  per `(event, student)`. Group lessons are represented by multiple
  `lesson_records` sharing one `eventId`, with event-level attendance summaries
  derived from those rows. Do not add an event-level embedded-status container.
- **D-17 — materialization model:** existing-event row preparation/materialization
  must be an explicit teacher/admin setup or preparation action. Do not
  materialize silently on event open. Do not batch-generate rows without an
  explicit admin action and audit trail.
- **Attendance default principle:** defaults should reduce work, not invent facts.
  The system may prepare rows from schedule/roster facts and offer low-friction
  actions such as "all present" or "mark exceptions", but it must not silently
  mark attendance, completion, or lesson outcomes without an explicit
  teacher/admin confirmation. Prepared rows start unconfirmed:
  `attendance=UNMARKED` and `completion=PENDING`.
- Linked: event (canonical per D-05), student/enrollment, teacher, room.
- Required: eventId, studentId, status, markedBy, markedAt.
- Derived: unmarked counter, completed-hours for payroll.
- Audit: markedBy, server markedAt, status-transition log.
- **Conversion semantics:** D-05/D-06 ACCEPTED — attendance marking creates or
  updates `LessonRecord` rows against an event converted through `eventToV2` /
  `eventToMinimal` at the module boundary; it never rewrites HYBRID `events`.
  Teacher writes are row-scoped to own lesson rows, while payroll approval remains
  in `hours_entries`. Existing-event materialization follows accepted D-17:
  explicit teacher/admin preparation only, no silent event-open materialization.
- Schema decisions / parked items: Exact payable-hours derivation is deferred to
  the payroll packet where D-18/D-19 apply.

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
  boundaries. Per accepted D-17, generation/backfill must be explicit
  teacher/admin preparation, not silent event-open materialization.

## Dependencies
- Blocks: payroll-salaries-hours (hours from attendance), reports-analytics.
- Blocked by: student-family-files (student links) is implemented. D-05/D-06 are
  accepted/implemented prerequisites, and D-17 is accepted for this P0 path.
