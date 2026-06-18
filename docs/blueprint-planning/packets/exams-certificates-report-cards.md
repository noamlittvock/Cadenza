# Exams, Certificates, And Report Cards  (`exams-certificates-report-cards`)

Status: `planned` (per `features/forteTree.ts`) -> target `implemented`.
Priority: p1
Owner-decisions still blocking this packet: **BLOCKED ON D-22** for formal
rubric/pass-fail semantics, AI summary generation, generated PDF/email delivery,
and any tokenized/public examiner or guardian-facing path. Core authenticated
session, submission, certificate, and report-card management over the existing
normalized tables is otherwise unblocked by current accepted decisions.
Current accepted prerequisites: **D-01** (no new top-level route beyond current
policy), **D-04** (canonical student adapter), **D-07/D-14** (public surfaces only
through controlled consent/token setup), and **D-15** (packet-local backfill).

## Current State (ground truth)
- Existing UI: no productized Academic Hub, exam-session dashboard, examiner
  submission workflow, certificate queue, or report-card generation surface.
  `spec/Academic_Hub_AddOn_Spec_v1_0.md` is a stale Firebase/top-level/sidebar
  add-on spec; it is useful product signal only where reconciled with the current
  Supabase Blueprint docs. Student files are expected to link to assessment
  history, but the student module is not yet implemented.
- Existing schema: `exam_sessions`, `examiner_submissions`, `certificates`, and
  `report_cards` are normalized Blueprint tables from `0002`. `exam_sessions`
  stores status, date, `examinerStaffIds[]`, `studentIds[]`, optional
  `activityId`, and notes. `examiner_submissions` stores one score/grade/remarks
  row per session/student/examiner. `certificates` stores pending/issued/revoked
  state plus optional document URL/path. `report_cards` stores student, period,
  optional activity, line items, summary, and `publishedAt`. Storage bucket
  `documents` is private but currently member-read/admin-write by org path.
- Existing query/helpers: `listExamSessions`, `getStudentAssessmentSummary`, and
  `listPendingCertificates` in `utils/blueprintQueries.ts`.
- Existing tests: `utils/blueprintQueries.test.ts` covers the three deterministic
  helpers. `utils/supabaseSync.ts` maps all four collections as `NORMALIZED`, and
  `docs/SUPABASE_MIGRATION_MAP.md` records their table names. No UI, RLS,
  storage-policy, PDF/export, or Playwright workflow tests exist for this module.
- Feature-tree declared queries: `listExamSessions`,
  `getStudentAssessmentSummary`, `listPendingCertificates` -- implemented.

## Users And Permissions
- Actors: admin, super_admin, authenticated examiner/teacher assigned to an exam
  session, general staff/member, student/family as linked records. Finance has no
  module-level access. Guardian/public access is not part of v1.
- Read access: admins read all exam sessions, submissions, certificates, report
  cards, and generated document metadata. Assigned examiners read only their own
  session/student submission workspace. General members must not receive all
  assessment payloads by default because the rows contain student academic data.
- Write access: admins create/edit/cancel/grade sessions, issue/revoke
  certificates, publish report cards, and correct submissions. Assigned examiners
  may create/update only their own `examiner_submissions` for their assigned
  sessions before admin finalization.
- Public/token access: none in v1. The older tokenized examiner form and any
  guardian-facing report-card link are **BLOCKED ON D-22** and, if accepted later,
  must also satisfy D-07/D-14 with explicit consent/setup.
- See embedded role matrix below.

## Workflows
- List/search/filter: admin exam-session list by status/date/activity/examiner,
  student, missing submissions, and certificate/report-card readiness; pending
  certificate queue from `listPendingCertificates`; student detail assessment
  summary from `getStudentAssessmentSummary`.
- Create: admin creates an `ExamSession` with name, date, optional activity,
  examiner staff IDs, student IDs, notes, and default status `SCHEDULED`.
  Optional report-card/certificate drafts are created only when the admin starts
  document preparation, not automatically on session creation.
- Detail: session detail shows roster, assigned examiners, submission completion,
  per-student scores/grades/remarks, linked certificates, linked report cards,
  and cross-links to Student, Activity, Staff, and stored documents.
- Edit: admin edits session metadata, roster, and examiner panel while
  `SCHEDULED` or `IN_PROGRESS`. Assigned examiners edit only their own
  submissions before the session is marked `GRADED`.
- Status transitions: `ExamSession.status: SCHEDULED -> IN_PROGRESS -> GRADED`;
  `SCHEDULED -> CANCELLED`; `IN_PROGRESS -> CANCELLED` by admin correction only.
  `Certificate.status: PENDING -> ISSUED -> REVOKED`. `ReportCard.publishedAt:
  null -> timestamp`; post-publish correction requires admin audit and either a
  replacement report-card row or explicit regeneration path **BLOCKED ON D-22**.
- Archive/delete: no hard delete after submissions, certificates, report cards,
  or exported files exist. Cancel sessions and revoke certificates instead;
  retain linked assessment history.
- Import/export: admin CSV import for session rosters and examiner panels; admin
  CSV export of session results. Generated PDF certificates/report cards and bulk
  email dispatch are **BLOCKED ON D-22** until the document-generation and
  delivery model is accepted.
- Cross-links: session <-> Student files, Activity/program rosters, Staff
  examiner profiles, lesson history/report-card references, certificates, report
  cards, document storage objects, and reports-analytics.

## Data Contract
- Primary records: `ExamSession`, `ExaminerSubmission`, `Certificate`, and
  `ReportCard` (`types/blueprint.ts`) in normalized Supabase tables
  `exam_sessions`, `examiner_submissions`, `certificates`, and `report_cards`.
- Linked records: `StudentV2`/legacy HYBRID student rows via D-04 adapter,
  `ActivityV2`/activity rows, staff members for examiners, optional
  `DocumentEntry`/`documents` storage files, and future Student detail assessment
  tabs.
- Required fields: session `name`, `date`, `status`, `examinerStaffIds[]`,
  `studentIds[]`; submission `examSessionId`, `studentId`, `examinerStaffId`;
  certificate `studentId`, `title`, `status`; report card `studentId`,
  `periodLabel`, `lines[]`.
- Derived/computed fields: session completion percentage, missing-submission
  count, student average score, best grade, issued-certificate count, pending
  certificate count, and report-card published/draft state. These are computed
  from submissions/certificates/report cards; a richer aggregate assessment
  record is **BLOCKED ON D-22**.
- Audit fields: normalized table `createdAt`, `updatedAt`, `createdBy`,
  `updatedBy`; submission `submittedAt`; certificate `issuedAt`; report-card
  `publishedAt`. Implementation should make finalization, certificate issue,
  revoke, and report-card publish timestamps server-owned.
- **Conversion semantics:** creating a session writes one normalized
  `exam_sessions` row. Examiner submission writes one normalized
  `examiner_submissions` row per session/student/examiner. Certificate issue
  updates the `certificates` row and, when a file exists, points to the private
  `documents` storage object. Report-card publish updates `report_cards` and
  links back to the Student file; student data crosses module boundaries through
  the accepted D-04 adapter/projection seam. No global Student persistence
  migration is part of this packet.
- Open schema decisions: rubric/category scoring, explicit pass/fail status,
  pass thresholds, AI-assisted summaries, generated PDF report-card templates,
  bulk email dispatch, tokenized examiner forms, guardian-facing report-card
  links, and any new assessment aggregate/template tables are **BLOCKED ON D-22**.

## UX Placement (obey route-nav-policy.md)
- Home: **Manage tab / Academic assessments area** plus contextual Student detail
  assessment tab. Do not unhide or route top-level `ACADEMICS` in v1; D-01 only
  locked top-level Students and Finance as planned additions.
- Navigation entry: no sidebar or command-palette entry in v1. `ACADEMICS` stays
  hidden until a future route-policy amendment creates a real Academic Hub route.
- Mobile visibility: admin assessment management is desktop-first with Manage.
  Assigned examiner submission should be reachable from Staff/Calendar/assessment
  context at 390x844 and must not rely on mobile-hidden Manage.
- Empty / loading / error states: no sessions, no pending certificates, no
  students assigned, missing examiner, missing linked student/activity/staff,
  partial submissions, cancelled session, revoked certificate, storage upload
  failure, export failure, and stale linked file.
- Hebrew/RTL requirements: Hebrew labels for sessions, statuses, certificate
  statuses, report-card lines, examiner remarks, score/grade columns, and export
  actions; mixed Hebrew/English student names and free-text remarks must be
  bidi-safe.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | own | — | — | — | Refine uniform member-read on all four tables. Assigned examiner scope needs a policy/RPC/view keyed by `examiner_staff_ids` and own `examiner_submissions`; document storage read must not leak assessment files to all members. |
| Read detail | ✓ | ✓ | own | — | — | — | Same as list/read; teacher self detail is limited to assigned sessions/students and own submissions, not all student assessment history. |
| Create | ✓ | ✓ | own | — | — | — | Admin creates sessions/certificates/report cards. Add teacher self-insert only for own `examiner_submissions` where the examiner is assigned to the session. |
| Edit | ✓ | ✓ | own | — | — | — | Admin edits all rows. Teacher self update is limited to own submission before session `GRADED`; no certificate/report-card edits. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin-only session status, certificate issue/revoke, and report-card publish transitions. |
| Status transition (payroll/finance-affecting) | — | — | — | — | — | — | No direct payroll/finance transition in this module. |
| Archive/delete | ✓ | ✓ | — | — | — | — | No hard delete after linked submissions/documents; admin cancels/revokes/replaces instead. |
| Export | ✓ | ✓ | — | — | — | — | Admin-only result/certificate/report-card export because rows contain student academic data. |
| Public submit/sign | — | — | — | — | — | — | No public/tokenized surface in v1. Tokenized examiner forms or guardian links are **BLOCKED ON D-22** and must use D-07/D-14 if later accepted. |

Required RLS refinements/tests:
- Narrow `exam_sessions`, `examiner_submissions`, `certificates`, and
  `report_cards` from uniform org-member read to admin plus explicit assigned
  examiner/student-context access.
- Add real-role policies or a security-definer RPC/view so assigned examiners can
  insert/update only their own submissions and cannot read or mutate other
  examiners' rows.
- Restrict generated certificate/report-card storage object reads to the same
  module scope; current `documents` bucket member-read is too broad for private
  assessment documents.
- Verify no anon/public access exists for exam submissions, certificates, report
  cards, or storage paths. Any D-07/D-14-compliant public path is **BLOCKED ON
  D-22**.

## Acceptance Criteria
- Unit: existing helper coverage for `listExamSessions`,
  `getStudentAssessmentSummary`, and `listPendingCertificates`; add tests for
  cancelled/graded ordering, missing scores, multiple examiner submissions,
  revoked certificates, report-card publish/draft helpers, and stable session
  filters.
- Supabase mapping: normalized camel<->snake mapping for `examSessions`,
  `examinerSubmissions`, `certificates`, and `reportCards`; jsonb preservation for
  `examinerStaffIds`, `studentIds`, and `ReportCard.lines`; storage path
  conventions for generated/uploaded files.
- RLS/security: real-role tests for admin full access, assigned examiner
  own-session read and own-submission write, teacher-other denied, plain member
  denied, finance denied, cross-org isolation, and no anon access.
- Playwright smoke: admin creates exam session -> assigns examiners and students
  -> examiner submits own score/remarks -> admin marks session graded -> admin
  creates pending certificate -> issues certificate -> student assessment summary
  reflects the issued certificate. PDF/report-card/email smoke is **BLOCKED ON
  D-22**.
- Hebrew/RTL: session list/detail, examiner submission form, certificate queue,
  report-card lines, and export labels.
- Mobile viewport: assigned examiner submission form at 390x844; admin management
  can remain desktop-first.
- Data migration/backfill: D-15 ACCEPTED -- packet-local only. Existing/demo
  `exam_sessions`, `examiner_submissions`, `certificates`, and `report_cards`
  rows become the initial assessment history. Backfill validates missing
  students, activities, staff examiners, document paths, and invalid statuses; do
  not create a global Student migration. Historical informal recital/report-card
  notes remain in their existing student records; a broader Academic Hub import
  model is **BLOCKED ON D-22**.

## Dependencies
- Blocks: reports-analytics assessment reports, student-family-files assessment
  history tabs, concert-programs-events if concerts produce assessed sessions,
  agreements-consent only if future certificate/report-card consent language is
  introduced, and year-rollover-setup for carrying forward academic history.
- Blocked by: student-family-files for first-class Student detail links;
  ensembles-theory-school-programs and activity-program-tree for activity/program
  context; staff-teacher-management for examiner identities; real-role RLS and
  storage-policy refinements during implementation; **BLOCKED ON D-22** for
  formal rubric/pass-fail, AI/PDF/email, and tokenized/public examiner or guardian
  flows. D-01/D-04/D-07/D-14/D-15 are accepted prerequisites, not open blockers.
