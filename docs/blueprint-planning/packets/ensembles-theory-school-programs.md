# Ensembles, Theory, And School Programs  (`ensembles-theory-school-programs`)

Status: `planned` (per `features/forteTree.ts`) -> target `implemented`.
Priority: p1
Owner-decisions still blocking this packet: **BLOCKED ON D-17** for
group-attendance record materialization. Core roster/program management is
otherwise unblocked by current accepted decisions.
Current accepted prerequisites: **D-01** (no new top-level route by default),
**D-04** (canonical student adapter), and **D-15** (packet-local backfill).

## Current State (ground truth)
- Existing UI: `components/ActivityManager.tsx` manages `ActivityV2`,
  L1/L2 hierarchy, archive/restore, and activity import inside
  `Manage?tab=activities`. `components/StaffMemberManager.tsx` manages
  `TeachingAssignmentV2` links to activities. `components/CalendarView.tsx` reads
  `EnrollmentV2` for student/tag calendar filtering. There is no productized
  ensemble/theory/school-program roster surface, no program detail workflow, and
  no attendance expectation panel for grouped programs.
- Existing schema: `activities`, `l1_subcategories`, `l2_subcategories`,
  `students`, `enrollments`, and `teaching_assignments` are core HYBRID tables
  from `0001` (`{id, org_id, data jsonb}`). There is no dedicated
  ensemble/program/school-partner table in current migrations; the feature-tree
  node is explicitly layered on Activity + Enrollment.
- Existing query/helpers: `listEnsembleRosters`, `listTheoryGroups`, and
  `listSchoolProgramStudents` in `utils/blueprintQueries.ts`. They return
  `ActivityRoster` values derived from `MinimalActivity`, `MinimalEnrollment`,
  and `MinimalStudent`.
- Existing tests: `utils/blueprintQueries.test.ts` covers all three roster
  helpers. No roster management UI, RLS, Playwright, import/export, or grouped
  attendance workflow tests exist for this module.
- Feature-tree declared queries: `listEnsembleRosters`, `listTheoryGroups`,
  `listSchoolProgramStudents` -- implemented.

## Users And Permissions
- Actors: admin, super_admin, teacher assigned to the activity/program, general
  staff/member, student/family as linked records. Finance and guardian/public
  have no module-level access in v1.
- Read access: admins read all rosters and program details. Teachers read only
  rosters for activities/L2 groups they teach. General members should not receive
  roster payloads by default because those payloads expose student personal data.
- Write access: admins create/edit/archive activities, enrollments, and teaching
  assignments. Teachers do not edit rosters in v1; attendance marking belongs to
  the lesson-attendance packet and is **BLOCKED ON D-17** for grouped events.
- Public/token access: none. This module does not create a public school-program
  intake, registration, or partner-facing surface.
- See embedded role matrix below.

## Workflows
- List/search/filter: list ensembles (`template = ENSEMBLE`), theory groups
  (`activityType = ACADEMIC` or theory-named activities), and school programs
  (`template = PROGRAM`) with filters for active/archived, staff member, activity,
  L2 group, student, school year/date range, and missing staff assignment.
- Create: admin creates the underlying `ActivityV2` in the correct template,
  links staff through `TeachingAssignmentV2`, and enrolls students through
  `EnrollmentV2`. No separate group-program table is created in v1.
- Detail: program detail shows activity metadata, hierarchy/L2 groups, assigned
  staff, active and archived roster rows, linked calendar events, enrollment
  start/end dates, and cross-links to student files.
- Edit: admin edits activity metadata, assigned staff, and roster membership.
  Roster add/remove writes `EnrollmentV2` rows or archives existing enrollments;
  edits preserve historical enrollment rows.
- Status transitions: `ActivityV2.isArchived: false -> true -> false`;
  `EnrollmentV2.status: ACTIVE -> ARCHIVED`; `TeachingAssignmentV2.isArchived:
  false -> true -> false`. Attendance/completion status for grouped sessions is
  **BLOCKED ON D-17**.
- Archive/delete: no hard delete for activities, enrollments, or teaching
  assignments after linked lessons, finance, reports, or events exist. Use archive
  states and keep historical links visible.
- Import/export: admin CSV import/export for roster rows and program membership;
  import validates existing students, activities, L2 groups, and staff before
  writing. Exports exclude finance data.
- Cross-links: program detail opens ActivityManager, Student detail, Staff
  assignment detail, Calendar filtered by activity/L2, lesson-attendance records
  once **D-17** is resolved, payments/charges by enrollment, exams/certificates,
  and reports.

## Data Contract
- Primary record: `ActivityV2` (`types/v2.ts`) in `activities` HYBRID table.
  Ensembles use `template = ENSEMBLE`; school programs use `template = PROGRAM`;
  theory groups use `activityType = ACADEMIC` and/or a theory-specific activity
  name until a richer taxonomy is added.
- Linked records: `EnrollmentV2` (`enrollments`) for roster membership,
  `StudentV2` (`students`) for roster people, `TeachingAssignmentV2`
  (`teaching_assignments`) for assigned staff, optional `L1Subcategory` /
  `L2Subcategory` rows, and `EventV2`/calendar events for scheduled sessions.
- Required fields: activity `id`, `orgId`, `name`, `template`, `activityType`,
  `modules`, `isArchived`; enrollment `studentId`, `activityId`, `l2Id`,
  `startDate`, `status`; teaching assignment `staffMemberId`, `activityId`,
  `scope`, `startDate`.
- Derived/computed fields: roster rows, active roster count, missing-staff
  warning, archived-membership count, and schedule summary are computed from
  existing activities/enrollments/students/assignments/events, not persisted as a
  duplicate roster document.
- Audit fields: HYBRID row `created_at`/`updated_at` plus V2 document
  `createdAt`/`updatedAt`; implementation should record acting user in the
  app-level history/import result where available because current V2 activity and
  enrollment docs do not include `createdBy`.
- **Conversion semantics:** creating or editing a program writes the existing
  HYBRID V2 documents (`activities`, `enrollments`, `teaching_assignments`) and
  derives rosters with the existing deterministic helpers. Student data crosses
  module boundaries through the accepted D-04 adapter/projection seam; no global
  Student persistence migration is part of this packet. Grouped lesson attendance
  and any batch/lazy lesson-record materialization are **BLOCKED ON D-17**.
- Open schema decisions: grouped program attendance becoming lesson records is
  **BLOCKED ON D-17**. No new partner-school identity/contact model is introduced
  in this packet; v1 school-program identity stays on `ActivityV2` name/location
  and hierarchy fields.

## UX Placement (obey route-nav-policy.md)
- Home: **Manage tab / Activity-program area**. The module should be a filtered
  product surface over the existing ActivityManager spine, not a new top-level
  `ACADEMICS` route in v1.
- Navigation entry: no sidebar or command-palette entry in v1. `ACADEMICS` stays
  hidden until a future packet amends `route-nav-policy.md` and routes a real
  Academic Hub.
- Mobile visibility: admin roster management is desktop-first with Manage.
  Teacher assigned-roster read and future attendance entry must be reachable from
  Calendar/staff context at 390x844 and must not rely on mobile-hidden Manage.
- Empty / loading / error states: no programs in this category, no active
  students, no assigned teacher, archived-only roster, stale/missing student,
  stale/missing activity, duplicate roster import row, and save/import failure.
- Hebrew/RTL requirements: program/category labels, roster table, student names,
  staff names, import validation, and mixed Hebrew/English activity names must be
  bidi-safe; numeric counts and dates remain readable in RTL rows.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | own | — | — | — | Current HYBRID `activities`/`enrollments`/`students` member-read is too broad for roster payloads; add assigned-teacher roster scope via teaching assignments or a security-definer roster view/RPC. |
| Read detail | ✓ | ✓ | own | — | — | — | Same as list/read; teachers may read only activities/L2 groups they are assigned to teach. |
| Create | ✓ | ✓ | — | — | — | — | Current admin-write policy is acceptable for activity/enrollment/assignment creation. |
| Edit | ✓ | ✓ | — | — | — | — | Admin-only edits to activity metadata, roster membership, and teaching assignments. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin archives/restores activities, enrollments, and assignments; no teacher roster status changes in v1. |
| Status transition (payroll/finance-affecting) | — | — | — | — | — | — | No direct finance/payroll transition in this module; grouped attendance/payroll side effects are **BLOCKED ON D-17** and downstream payroll packets. |
| Archive/delete | ✓ | ✓ | — | — | — | — | Archive only; no hard delete once linked records exist. |
| Export | ✓ | ✓ | — | — | — | — | Admin-only roster/program export because rows contain student data. |
| Public submit/sign | — | — | — | — | — | — | No public/tokenized surface. |

Required RLS refinements/tests:
- Prove an assigned teacher can read only the roster for their own activity/L2
  group and cannot enumerate unrelated enrollment/student roster rows.
- Keep admin writes on the existing HYBRID tables, but test that plain members
  cannot read roster payloads through broad `enrollments`/`students` access once
  the roster surface ships.
- If implemented through an RPC/view rather than table-policy rewrites, the
  Playwright/app path must use that scoped surface and tests must verify direct
  table access remains non-leaking.

## Acceptance Criteria
- Unit: existing `listEnsembleRosters`, `listTheoryGroups`, and
  `listSchoolProgramStudents` coverage remains green; add cases for archived
  enrollments, archived/missing students, duplicate enrollments, L2-specific
  rosters, and stable sort/filter behavior.
- Supabase mapping: HYBRID wrap/unwrap for `activities`, `enrollments`,
  `students`, `teaching_assignments`, `l1_subcategories`, and `l2_subcategories`;
  no new normalized table for v1.
- RLS/security: real-role tests for admin full roster access, assigned-teacher
  own-roster read, teacher-other denied, plain member denied, finance denied, and
  cross-org isolation.
- Playwright smoke: admin creates an ensemble activity -> assigns teacher -> adds
  students to the roster -> teacher sees own roster -> unrelated teacher cannot
  see it -> admin archives one enrollment and roster count updates.
- Hebrew/RTL: roster list, detail, import validation, and category filters.
- Mobile viewport: assigned-teacher roster read at 390x844; admin management can
  remain desktop-first.
- Data migration/backfill: D-15 ACCEPTED -- packet-local only. Existing
  `ActivityV2` rows with `template = ENSEMBLE` or `PROGRAM`, plus academic/theory
  activities and existing `EnrollmentV2` rows, become the initial rosters. Backfill
  should validate missing students/staff/L2 links and archive or flag bad rows;
  do not create a global Student/Event migration or a duplicate roster table.
  Attendance backfill/materialization for existing grouped events is
  **BLOCKED ON D-17**.

## Dependencies
- Blocks: lesson-details-attendance for grouped roster context after **D-17**,
  payments-charges for per-enrollment charge lines, exams-certificates-report-cards,
  concert-programs-events, reports-analytics, and year-rollover-setup roster carry
  forward.
- Blocked by: student-family-files for authoritative student/family links;
  staff-teacher-management and activity-program-tree native spines; roster RLS
  refinement for assigned-teacher access; **BLOCKED ON D-17** for grouped
  attendance materialization. D-01/D-04/D-15 are accepted prerequisites, not open
  blockers.
