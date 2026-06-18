# Blueprint Implementation - Build Loop State

This file is the implementation loop's durable memory. The next agent must read
it in full before editing code. Authoritative specs remain:

- `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`
- `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`
- `docs/blueprint-planning/packets/lesson-details-attendance.md`
- `docs/blueprint-planning/packets/student-family-files.md`
- `docs/blueprint-planning/packets/public-registration-intake.md`
- `docs/blueprint-planning/decision-log.md`
- `docs/blueprint-planning/route-nav-policy.md`
- `docs/blueprint-planning/status-policy.md`

On completion, replace the first line with exactly:
BUILD COMPLETE

## Previous Completed Targets

- `student-family-files` reached the implemented bar on 2026-06-18.
- `public-registration-intake` reached the implemented bar on 2026-06-18.
- `features/forteTree.ts` marks both completed People keystone packets as
  `implemented`, and their packet headers are reconciled.
- Completed verification for the prior target included live Supabase RLS,
  Playwright public-submit -> admin-approve smoke, Hebrew/RTL, 390x844 public
  mobile form, typecheck, and full Vitest.

## Current Objective

Continue Phase C with the next roadmap packet: `lesson-details-attendance`.

Build the attendance slice around Calendar event details and teacher mobile
marking without deciding the still-parked D-17 group/materialization model.
The target is eventually `implemented`, but do not mark this build complete until
D-17 is answered and recorded, all non-blocked workflow pieces are shipped, live
RLS passes against a real Supabase project, and the status-policy bar holds.

## Locked Build Decisions

- D-05: Event canonical write-model is `EventV2`; legacy `CalendarEvent` remains
  at read edges. Use `utils/canonicalAdapters.ts` (`eventToV2`,
  `eventV2ToMinimal`, `eventV2ToLegacy`) at module boundaries. Do not add a
  second inline event conversion or rewrite HYBRID `events` persistence.
- D-06: teachers may self-write their own attendance/hour rows; admin approval
  remains the gate for payroll-affecting hours transitions. `0004` already added
  row-scoped teacher policies for `lesson_records` and `hours_entries`.
- D-15: packet-local backfill only. There is no global `CalendarEvent` ->
  `EventV2` persistence migration in this build.
- D-17: lesson group record/materialization model has no accepted default.
  Existing schema points to one `lesson_records` row per `(event, student)`, but
  the loop must not choose that as the product rule, add production batch/lazy
  materialization, or promote the packet until Noam answers D-17 and the packet
  and decision log are updated.
- D-17 product principle from Noam: defaults should reduce work, not invent
  facts. Attendance rows may be prepared from real schedule/roster data, but the
  system must not silently mark attendance, completion, or lesson outcomes without
  teacher/admin confirmation.
- D-18-D-27 remain parked. Do not build packet sections marked `BLOCKED ON D-xx`
  until the matching decision is answered and the packet/decision log are updated.

## Initial Lesson Attendance Scope

- Home is a contextual panel in Calendar event detail, per route-nav-policy tier
  3. Do not add a sidebar or command-palette destination for attendance.
- Mobile attendance marking is a primary workflow at 390x844 and must not inherit
  Manage/Admin-Inbox mobile hiding.
- Public/token access is not part of this packet.
- Settled workflows: teacher/admin read existing lesson records, teacher marks
  own rows, admin overrides, unmarked attendance worklist, student lesson
  history, Hebrew/RTL labels, and retained status/history semantics where the
  current schema supports them.
- Blocked workflows until D-17: deciding group lesson row shape, creating a
  productized materialization strategy for existing events, packet-local
  generation/backfill of `lesson_records`, and any implemented-status promotion
  that depends on those semantics.

## D-17 Question For Noam

D-17 remains unanswered as of 2026-06-18. Exact question to resolve before any
materialization/backfill work:

For `lesson-details-attendance`, should group lessons be represented as multiple
`lesson_records` rows sharing one `eventId` (one row per event/student), or as a
single event-level attendance record with embedded per-student statuses? For
existing events, should rows/status containers be materialized lazily on event
open or teacher action, generated in a batch/admin job, or created only through
an explicit admin setup action? In every option, prepared defaults may use
schedule/roster facts to reduce work, but attendance, completion, and lesson
outcomes must stay unconfirmed until a teacher/admin explicitly confirms them.

## Baseline Known Findings - 2026-06-18

- Git status is already dirty from the completed `public-registration-intake`
  build and `.build-loop/` logs. Preserve that work; do not stage, commit, branch,
  push, or run any git write operation.
- `features/forteTree.ts` still marks `lesson-details-attendance` as `gap`.
- `types/blueprint.ts` defines `LessonRecord`; `lesson_records` exists in
  `supabase/migrations/0002_blueprint_schema.sql` as normalized columns with
  `event_id`, `student_id`, `staff_member_id`, `attendance`, `completion`,
  `repertoire`, `homework`, and `makeup_of_lesson_id`.
- `utils/supabaseSync.ts` maps `lessonRecords` to `lesson_records` in
  `NORMALIZED` mode, but focused lesson-record mapping coverage should be audited
  and strengthened.
- Existing deterministic helpers in `utils/blueprintQueries.ts`:
  `listStudentLessonHistory`, `listUnmarkedAttendance`, and
  `summarizeLessonCompletion`; existing unit coverage lives in
  `utils/blueprintQueries.test.ts`.
- Existing RLS coverage includes static checks for row-scoped lesson/hour teacher
  policies in `utils/supabaseSchema.test.ts` and a live real-role test for
  teacher own lesson insert plus other-teacher denial in `utils/rlsLive.test.ts`.
  The lesson packet still needs focused live coverage for the final workflow,
  admin override, and cross-org/role denial as applicable.
- `components/StudentFamilyWorkspace.tsx` already has a lessons tab and renders
  `detail.lessonHistory`; the Calendar event-detail attendance entry point still
  needs audit before UI changes.

## Baseline Audit Findings - 2026-06-18

- Worktree audit: `git status --short --branch` shows existing dirty tracked
  work in app, planning, feature tree, RLS/schema/mapping tests, plus untracked
  public-registration intake files, e2e specs, migrations, and `.build-loop/`.
  Treat all of that as prior-user/prior-loop work; do not stage, commit, branch,
  push, or revert it.
- Calendar event detail extension point: `components/CalendarView.tsx` owns the
  contextual event/Gantt `detailItem` modal. Event chips call
  `setDetailItem({ type: 'EVENT', data: evt })` from day/week and month views;
  the modal currently renders time, teacher, room, cancel/recurrence badges, and
  admin edit/cancel/delete controls. There is no attendance panel, no lesson
  record sync, and no event-detail test id yet.
- Calendar data boundary: `App.tsx` syncs legacy HYBRID `events` as
  `CalendarEvent[]` and passes them to `CalendarView`. `CalendarView` also syncs
  `EventV2`/participants internally for the v2 form, but it still constructs
  some V2 event objects inline for calendar saves. Do not add another
  `CalendarEvent`/`EventV2` converter for attendance; new attendance module
  boundaries must call `utils/canonicalAdapters.ts` (`eventToV2` or
  `eventToMinimal`) directly.
- Mobile/nav behavior: `components/Layout.tsx` hides `ADMIN_INBOX` and `MANAGE`
  on mobile, but `CALENDAR` remains mobile-reachable through the sidebar drawer.
  Attendance UI must therefore live in/near Calendar event detail, not under a
  mobile-hidden Manage/Admin Inbox path. The current detail modal is centered
  `max-w-sm`, which is a likely 390x844 starting point but needs real smoke
  coverage once controls are added.
- `LessonRecord` contract: `types/blueprint.ts` defines `eventId`, `studentId`,
  nullable `staffMemberId`, `date`, `attendance`, `completion`, `notes`,
  `repertoire: string[]`, `homework`, and `makeupOfLessonId`.
  `supabase/migrations/0002_blueprint_schema.sql` matches those normalized
  columns, with `repertoire jsonb default []`, attendance/completion checks, and
  indexes on `(org_id, student_id, date)`, `(org_id, event_id)`, and
  `(org_id, attendance)`.
- Helper behavior: `utils/blueprintQueries.ts` already implements
  `listStudentLessonHistory` (student filter, date ascending),
  `listUnmarkedAttendance` (`UNMARKED`, optional cutoff, date ascending), and
  `summarizeLessonCompletion` (attendance counts and completion rate excluding
  cancelled lessons). Current `utils/blueprintQueries.test.ts` has basic coverage
  for those helpers, but not richer mapping/adapter boundary cases.
- Supabase mapping: `utils/supabaseSync.ts` maps `lessonRecords` to
  `lesson_records` in `NORMALIZED` mode, so top-level camel/snake conversion
  should handle `staffMemberId` and `makeupOfLessonId`, while nested/jsonb values
  such as `repertoire` pass through unchanged. `utils/supabaseSync.test.ts`
  currently covers normalized students/families/public intake paths but has no
  focused lesson-record mapping case; that is the next MAP-UNIT.
- RLS coverage: `supabase/migrations/0004_blueprint_rls_foundation.sql` replaced
  broad admin-only lesson writes with admin write plus row-scoped
  `lesson_records_teacher_insert`/`lesson_records_teacher_update` using
  `app_is_staff_self(org_id, staff_member_id)`. Static coverage exists in
  `utils/supabaseSchema.test.ts`; live coverage in `utils/rlsLive.test.ts`
  currently proves teacher own insert and other-staff insert denial, but still
  needs the packet-specific final workflow/admin override/cross-org denial
  coverage before RLS-LIVE can be checked off.
- Student/family lesson-history rendering: `components/StudentFamilyWorkspace.tsx`
  has a Lessons tab, but `utils/studentFamilyDetail.ts` populates it from legacy
  `student.pedagogicalRecord.lessonHistory` strings. It is not yet connected to
  normalized `LessonRecord` rows or event-linked attendance history.
- Playwright patterns: current e2e specs seed local collections with
  `page.addInitScript`, navigate with `e2e/helpers/navigate.ts`, and include
  RTL/mobile examples in `e2e/student-family.spec.ts`. There is no attendance
  smoke yet; the eventual spec should seed events/students/lessonRecords, open a
  Calendar event, mark attendance, and verify the unmarked count plus student
  history at desktop, Hebrew/RTL, and 390x844 mobile.
- D-17 blocked seams: do not implement or imply a product rule for group lesson
  row shape; do not create lazy-on-open or batch materialization/backfill for
  existing events; do not synthesize lesson rows from rosters/schedules beyond
  explicit existing rows; do not silently mark attendance, completion, or lesson
  outcomes; do not promote `lesson-details-attendance` to `implemented` or mark
  BACKFILL/RLS-LIVE/PW-SMOKE complete until D-17 is answered and recorded.

## Non-Negotiable Guardrails

- Preserve unrelated dirty work. Do not stage, commit, branch, push, or run git
  write operations.
- Do exactly one queue unit per iteration. If the next unit is too large, split it
  into smaller unchecked subunits in this file, then complete only the first
  subunit.
- Never print or record secret values. Docs and logs may name required variables
  but must never include tokens, passwords, service-role keys, anon keys, access
  tokens, or database passwords.
- Use existing app patterns and helpers. Do not introduce a new design language,
  router style, data store, or ad hoc mapping layer when a local one exists.
- Attendance UI must match the existing app language: dense operator workflows,
  warm paper workspace, dark espresso sidebar, bordeaux/navy accents, compact
  headers, segmented controls, 8px-radius panels/cards, lucide icons, and no
  marketing page.
- If live Supabase credentials or remote schema state are missing, add env-gated
  tests that skip with a clear message, record the exact env vars or blocker
  here, and do not mark RLS-LIVE or BUILD COMPLETE until tests run against a real
  project.

## Queue (dependency order - do the first unticked unit, exactly one)

### Stage 0 - Audit And Contract

- [x] Baseline audit: read this file plus authoritative specs, run
  `git status --short --branch`, identify Calendar event-detail extension
  points, current mobile behavior, `LessonRecord` schema/types/helpers,
  `lessonRecords` Supabase mapping, D-05 event adapter usage, D-06 RLS coverage,
  Student/Family lesson-history rendering, Playwright patterns, and every D-17
  blocked seam. Update this file with discovered constraints before code edits.
- [x] MAP-UNIT: add focused lesson-record mapping/unit coverage for
  camel/snake/jsonb `repertoire`, current helper behavior, completion summaries,
  and D-05 event adapter boundary usage before broad UI wiring.
- [x] RLS refinement/test audit: prove the existing `0004` teacher self-write
  policy and any packet-required refinements with static and env-gated live tests
  for teacher own mark, teacher-other denial, admin override, and cross-org/role
  denial. Do not mark RLS-LIVE if live credentials/schema are absent.
- [x] D-17 decision gate: if D-17 is still unanswered, split the remaining queue
  into explicit D-17-safe subunits and D-17-blocked subunits, record the exact
  Noam question, and complete only the first safe subunit. If Noam answers D-17,
  update `decision-log.md` and the packet before implementing materialization.
  - [x] D-17-safe subunit completed in this iteration: recorded the exact Noam
    question and split the remaining queue into D-17-safe existing-row work and
    D-17-blocked materialization/promotion work.

### Stage 1A - D-17-Safe Attendance Workflow (existing rows only)

- [x] Calendar event detail existing-row read surface: add or extend the
  contextual Calendar event detail panel for attendance without adding a new
  route/palette entry. It may read and display `lesson_records` already linked to
  the event, including empty/loading/error and "no prepared rows" states, but it
  must not create, synthesize, or backfill lesson rows while D-17 is parked.
- [x] Teacher/admin existing-row marking service: implement event-bound
  attendance update helpers through existing Supabase/local sync patterns and
  D-05 adapters, limited to existing `lesson_records` rows. Do not invent event
  materialization semantics while D-17 is parked.
- [x] Existing-row unmarked worklist and student history links: expose unmarked
  attendance and updated student lesson history through existing Calendar/Student
  surfaces using only persisted `lesson_records`; no roster-derived row creation.
- [x] Hebrew/RTL/mobile existing-row UI: cover event panel/worklist labels, RTL
  layout, and 390x844 teacher marking usability for existing rows only.
- [x] Playwright existing-row workflow smoke: preseed an event, students, and
  `lesson_records`; open event -> mark attendance -> verify student history and
  unmarked counter update, plus mobile/RTL checks. Do not mark complete if browser
  binaries or live services are unavailable; record the blocker here.

### Stage 2 - Live Verification And Promotion

- [x] RLS-LIVE existing-row run: after the existing-row attendance workflow ships,
  run the attendance live-role harness against a real Supabase project, including
  teacher own write, teacher-other denial, admin override, finance/plain-member
  denial, anon denial, and cross-org denial. Do not mark complete if only
  local/e2e bypass or skipped env-gated tests are exercised.

### Stage 3 - D-17-Blocked Materialization And Promotion

- [ ] D-17 answer intake: after Noam answers D-17, update `decision-log.md` and
  `packets/lesson-details-attendance.md` with the accepted group row/status
  container and materialization model before any blocked implementation work.
- [ ] BACKFILL/materialization: only after D-17 is accepted, implement packet-local
  generation/backfill for existing events if required by that decision. This is
  where lazy-on-open, teacher-action preparation, batch/admin generation, or any
  event-level embedded-status model may be implemented according to the accepted
  D-17 answer.
- [ ] Status promotion: only after D-17 is accepted, every queue unit is complete,
  and every completion checklist item below is true, update
  `features/forteTree.ts` and the `lesson-details-attendance` packet header to
  `implemented`, append an iteration note here, and replace this file's first
  line with `BUILD COMPLETE`.

## Completion Checklist (all required before BUILD COMPLETE)

- [ ] D-17 is answered, recorded in `decision-log.md`, and reflected in the packet.
- [ ] Attendance defaults reduce work without inventing facts: no silent
  present/completed/outcome marking occurs without teacher/admin confirmation.
- [ ] Attendance remains a Calendar contextual panel; no new sidebar or
  command-palette destination was added.
- [ ] Event conversion uses `utils/canonicalAdapters.ts`; no second inline
  `CalendarEvent`/`EventV2` conversion was added.
- [ ] Teacher can mark only own lesson rows; admin can override; other-teacher,
  cross-org, finance/plain-member, and anon write paths are denied as applicable.
- [ ] Event -> mark attendance -> student lesson history and unmarked counter
  workflow is implemented with retained status semantics.
- [ ] Hebrew/RTL event panel/worklist states are covered.
- [ ] Teacher attendance marking works at 390x844 mobile.
- [x] RLS-LIVE passed against a real project for the attendance workflow.
- [ ] Playwright attendance smoke passed.
- [ ] `npm run typecheck -- --diagnostics` passes.
- [ ] `npx vitest run --reporter=dot` passes.
- [ ] No D-18-D-27 blocked section was implemented without a decision update.
- [ ] No git staging, commit, branch, or push was performed.

## Next Unit

- D-17 answer intake: after Noam answers D-17, update `decision-log.md` and
  `packets/lesson-details-attendance.md` with the accepted group row/status
  container and materialization model before any blocked implementation work.

## Setup Notes For Next Agent

- Source `.env.local` for live test credentials when needed, but never print it.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless an explicit migration-push step is being handled by the
  orchestrator.
- Required live RLS env vars currently used by the harness:
  `CADENZA_RLS_SUPABASE_URL`, `CADENZA_RLS_SUPABASE_ANON_KEY`,
  `CADENZA_RLS_SUPABASE_SERVICE_ROLE_KEY`, `CADENZA_RLS_ORG_ID`,
  `CADENZA_RLS_CROSS_ORG_ID`, `CADENZA_RLS_ADMIN_EMAIL`,
  `CADENZA_RLS_ADMIN_PASSWORD`, `CADENZA_RLS_TEACHER_EMAIL`,
  `CADENZA_RLS_TEACHER_PASSWORD`, `CADENZA_RLS_TEACHER_STAFF_MEMBER_ID`,
  `CADENZA_RLS_FINANCE_EMAIL`, `CADENZA_RLS_FINANCE_PASSWORD`,
  `CADENZA_RLS_CROSS_ORG_EMAIL`, and `CADENZA_RLS_CROSS_ORG_PASSWORD`.
- Supabase CLI is installed and the project was previously linked locally, but
  do not apply migrations unless the active queue unit explicitly requires it.
- `build-loop.sh` defaults `CODEX_REASONING_EFFORT=high`.

## Iteration Notes

- 2026-06-18 preparation for `lesson-details-attendance`: Noam explicitly asked
  to continue the Blueprint build loop after `public-registration-intake` reached
  `BUILD COMPLETE`. Seeded this state for the next roadmap packet and preserved a
  D-17-first boundary so the next agent can begin with a baseline audit without
  accidentally deciding group lesson materialization.
- 2026-06-18 baseline audit for `lesson-details-attendance`: read
  `BUILD_LOOP_STATE.md` plus authoritative handoff, roadmap, packet,
  decision-log, route/nav policy, and status policy; ran
  `git status --short --branch`; audited Calendar event detail, mobile nav,
  LessonRecord schema/types/helpers, lessonRecords Supabase mapping, D-05 adapter
  usage, D-06 RLS coverage, Student/Family lesson-history rendering, Playwright
  patterns, and D-17 blocked seams. Changed file:
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (17 files, 201 tests).
- 2026-06-18 MAP-UNIT for `lesson-details-attendance`: added focused coverage for
  `lessonRecords` normalized camel/snake mapping including `repertoire` jsonb and
  `makeupOfLessonId`, richer attendance helper behavior for cutoff sorting and
  completion summaries, and a D-05 adapter-boundary assertion that attendance
  helper projections flow through `EventV2`. Changed files:
  `utils/supabaseSync.test.ts`, `utils/blueprintQueries.test.ts`,
  `utils/canonicalAdapters.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/supabaseSync.test.ts utils/blueprintQueries.test.ts utils/canonicalAdapters.test.ts --reporter=dot`
  passed (3 files, 98 tests); `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (17 files, 206 tests).
- 2026-06-18 RLS refinement/test audit for `lesson-details-attendance`: tightened
  static policy assertions so `lesson_records` teacher write remains row-scoped
  and not widened through member/finance access; extended the env-gated live RLS
  harness to prove teacher own attendance mark, other-teacher no-mutation, admin
  override, finance/plain-member insert denial, anon insert denial, and cross-org
  update/insert denial. Live RLS env readiness check reported all required
  `CADENZA_RLS_*` vars set without printing values. Changed files:
  `utils/supabaseSchema.test.ts`, `utils/rlsLive.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/supabaseSchema.test.ts utils/rlsLive.test.ts --reporter=dot`
  passed against the live project (2 files, 18 tests);
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (17 files, 207 tests). Stage 2 `RLS-LIVE run` remains unticked because
  the final attendance workflow and D-17-blocked pieces have not shipped yet.
- 2026-06-18 D-17 decision gate for `lesson-details-attendance`: confirmed D-17
  is still `NEEDS NOAM` in `decision-log.md`, recorded the exact group
  row/materialization question in this file, and split the remaining queue into
  D-17-safe existing-row attendance work versus D-17-blocked materialization and
  promotion work. Changed file:
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npm run typecheck -- --diagnostics` passed; `npx vitest run --reporter=dot`
  passed (17 files, 207 tests).
- 2026-06-18 Calendar event detail existing-row read surface: added a D-17-safe,
  read-only attendance panel inside the existing Calendar event detail modal. The
  panel subscribes to persisted `lessonRecords`, adapts the selected
  `CalendarEvent` through `eventToV2`, filters only existing rows by event id,
  renders loading/error/no-prepared-row states plus row summaries, and adds EN/HE
  labels. No route, sidebar, command-palette, row creation, row synthesis, or
  backfill semantics were added. Changed files: `components/CalendarView.tsx`,
  `constants.ts`, `utils/lessonAttendancePanel.ts`,
  `utils/lessonAttendancePanel.test.ts`,
  `e2e/lesson-attendance-read.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/lessonAttendancePanel.test.ts --reporter=dot` passed (1
  file, 2 tests); `npm run test:e2e -- e2e/lesson-attendance-read.spec.ts`
  passed (2 tests); `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (18 files, 209 tests).
- 2026-06-18 Teacher/admin existing-row marking service: added a D-17-safe
  attendance marking service that converts the selected `CalendarEvent` through
  `eventToV2`, validates org/event binding, updates only found existing
  `lesson_records` rows, enforces teacher row ownership unless admin override is
  explicit, and preserves completion unless the caller explicitly sets it. Added
  repository and in-memory collection helpers for existing sync patterns; no row
  creation, materialization, route, or UI marking controls were added. Changed
  files: `utils/lessonAttendanceService.ts`,
  `utils/lessonAttendanceService.test.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/lessonAttendanceService.test.ts --reporter=dot` passed
  (1 file, 6 tests); `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (19 files, 215 tests).
- 2026-06-18 Existing-row unmarked worklist and student history links: added a
  Calendar-local unmarked attendance popover that lists only persisted
  `lesson_records`, opens linked existing Calendar events, and does not add a
  route/sidebar/palette destination or create/synthesize rows. Student/Family
  lesson tabs now consume persisted normalized lesson history with retained
  attendance/completion/status details while keeping legacy notes as fallback.
  Changed files: `App.tsx`, `components/CalendarView.tsx`,
  `components/StudentFamilyWorkspace.tsx`, `constants.ts`,
  `utils/lessonAttendancePanel.ts`, `utils/lessonAttendancePanel.test.ts`,
  `utils/studentFamilyDetail.ts`, `utils/studentFamilyDetail.test.ts`,
  `e2e/lesson-attendance-read.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/lessonAttendancePanel.test.ts utils/studentFamilyDetail.test.ts --reporter=dot`
  passed (2 files, 7 tests);
  `npm run test:e2e -- e2e/lesson-attendance-read.spec.ts` passed (2 tests);
  `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (19 files, 217 tests).
- 2026-06-18 Hebrew/RTL/mobile existing-row UI: wired existing-row attendance
  marking controls into the Calendar event detail panel through the D-05-safe
  marking service, added EN/HE labels for mark states/errors, set explicit RTL
  direction on the event panel and unmarked worklist, and added a 390x844 Hebrew
  Playwright check that marks an existing persisted row without creating or
  preparing rows. Changed files: `components/CalendarView.tsx`, `constants.ts`,
  `e2e/lesson-attendance-read.spec.ts`, and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/lessonAttendanceService.test.ts utils/lessonAttendancePanel.test.ts --reporter=dot`
  passed (2 files, 9 tests);
  `npm run test:e2e -- e2e/lesson-attendance-read.spec.ts` passed (3 tests);
  `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (19 files, 217 tests).
- 2026-06-18 Playwright existing-row workflow smoke: extended the attendance
  Playwright smoke to seed an existing event, students, and persisted
  `lessonRecords`, then open the Calendar event, mark Ziv's existing row present,
  verify local persistence and the unmarked counter dropping to zero, and confirm
  Ziv's Student lesson history reflects the updated attendance. Existing
  no-prepared-rows and 390x844 Hebrew/RTL marking checks remain in the same spec.
  Changed files: `e2e/lesson-attendance-read.spec.ts` and
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npm run test:e2e -- e2e/lesson-attendance-read.spec.ts` passed (3 tests);
  `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (19 files, 217 tests).
- 2026-06-18 RLS-LIVE existing-row run: confirmed all required
  `CADENZA_RLS_*` live harness variables were present using presence-only output,
  then ran the attendance live-role harness against the configured Supabase
  project. The existing-row attendance RLS test covered teacher own write,
  other-teacher no-mutation, admin override, finance/plain-member insert denial,
  anon insert denial, teacher cross-org insert denial, and cross-org update
  no-mutation. Changed file:
  `docs/blueprint-planning/BUILD_LOOP_STATE.md`. Verification:
  `npx vitest run utils/rlsLive.test.ts --reporter=dot` passed against the live
  project (1 file, 5 tests); `npm run typecheck -- --diagnostics` passed;
  `npx vitest run --reporter=dot` passed (19 files, 217 tests).
- 2026-06-18 blocked D-17 answer intake: read the full loop state and
  authoritative handoff, roadmap, packet, decision log, route/nav policy, and
  status policy; searched planning docs and repo text for any newer D-17 answer.
  D-17 remains `NEEDS NOAM`, so the next queue unit cannot be completed without
  choosing the group lesson row/status-container and materialization model. Queue
  state remains unchanged and no implementation, materialization, promotion, git
  write operation, or test run was performed.
- 2026-06-18 blocked D-17 answer intake recheck: read the full loop state and
  authoritative handoff, roadmap, current packet, decision log, route/nav policy,
  and status policy; ran `git status --short --branch`; searched planning docs
  and repo text for any newer D-17 answer. D-17 still remains `NEEDS NOAM`, and
  the current user prompt did not supply the group row/status-container or
  materialization choice. Queue state remains unticked; no implementation,
  materialization, promotion, git write operation, or test run was performed.
- 2026-06-18 blocked D-17 answer intake third recheck: read the full loop state
  and authoritative handoff, roadmap, current packet, decision log, route/nav
  policy, and status policy; ran `git status --short --branch`; searched
  planning docs and repo text for any newer D-17 answer. D-17 still remains
  `NEEDS NOAM`, so the next queue unit cannot be completed without Noam choosing
  the group lesson row/status-container and materialization model. Queue state
  remains unticked; no implementation, materialization, promotion, git write
  operation, or test run was performed.
