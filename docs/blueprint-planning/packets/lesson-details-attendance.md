# Lesson Details And Attendance  (`lesson-details-attendance`)

Status: gap → planned (this packet)  ·  Priority: p0
Owner-decisions blocking this packet: **D-05** (canonical event type), **D-06**
(teacher write vs admin approval), **L-GROUP** (group-lesson record model, below).

## Current State (ground truth)
- Existing UI: none. Calendar exists (native, source of truth: "no event = no pay"). No attendance marking surface, no per-event lesson detail panel for attendance.
- Existing schema: `lesson_records` (normalized, `0002`) — fields `eventId, studentId, staffMemberId, attendance, completion, repertoire[], homework, makeupOfLessonId`. **Already one row per (event, student)** (carries both eventId + studentId) — this settles L-GROUP below. `events` (core hybrid, v1+v2 docs), `event_participants` (core). Type duplication: `CalendarEvent` vs `EventV2` (D-05); Blueprint dataEntities reference `EventV2`/`StaffMemberV2`/`StudentV2`.
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
- **L-GROUP — effectively decided by schema:** `lesson_records` is already one row per (event, student). Group lessons = multiple `lesson_records` sharing one `eventId`; the event-level view is derived (group + count statuses). Confirm this is the intended model; no schema change needed.
- Linked: event (canonical per D-05), student/enrollment, teacher, room.
- Required: eventId, studentId, status, markedBy, markedAt.
- Derived: unmarked counter, completed-hours for payroll.
- Audit: markedBy, server markedAt, status-transition log.
- Open schema decisions: D-05 (event type), L-GROUP, attendance-affecting-payroll rule.

## UX Placement (per route-nav-policy)
- Home: **contextual panel in Calendar event detail** (tier 3) — primary entry. Plus a cross-cutting "unmarked attendance" worklist (small surface, could live in Admin Inbox or a Calendar-adjacent panel).
- Navigation entry: none new; reached from the calendar.
- Mobile: **attendance marking is a genuine mobile workflow** (teacher in a classroom). Must be reachable + usable on mobile — explicitly NOT inheriting Manage/Admin-Inbox mobile hide. Declare in build ticket.
- Empty/loading/error: nothing-to-mark state; offline/save-failure handling for mobile.
- Hebrew/RTL: panel + worklist; notes accept Hebrew.

## Role / RLS Matrix (key cells)
| Operation | teacher (own) | teacher (others) | admin |
|---|---|---|---|
| Read lesson records | ✓ | per policy | ✓ |
| Mark attendance | own events | — | ✓ |
| Edit after window | — | — | ✓ |
| Payroll-affecting confirm | per D-06 | — | ✓ |
Refinements: row-scoped teacher write to own events (⚠ D-06 — uniform RLS makes all writes admin-only today).

## Acceptance Criteria
- Unit: `listStudentLessonHistory`, `listUnmarkedAttendance`, completed-hours derivation.
- Supabase mapping: `lesson_records` camel↔snake + jsonb.
- RLS: teacher marks own event (real teacher role); teacher cannot mark another's; admin override works.
- Playwright: open calendar event → mark attendance → verify student lesson history updates and unmarked counter decrements.
- Hebrew/RTL: event panel + worklist.
- Mobile: attendance marking at 390x844 (primary mobile case).
- Data migration: backfill/generation of lesson records for existing events — define strategy (lazy-on-open vs batch). D-15.

## Dependencies
- Blocks: payroll-salaries-hours (hours from attendance), reports-analytics.
- Blocked by: **D-05, D-06, L-GROUP**; student-family-files (student links); calendar EventV2 cleanup (Pass 2).
