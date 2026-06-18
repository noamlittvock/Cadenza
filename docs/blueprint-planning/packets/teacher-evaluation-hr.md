# Teacher Evaluation And HR  (`teacher-evaluation-hr`)

Status: `gap` (per `features/forteTree.ts`) -> target `implemented`.
Priority: p2
Owner-decisions still blocking this packet: **D-26** (staff HR privacy, consent/
notice, reviewer/self access, document attachment, retention, and export scope).
Current accepted prerequisites: **D-15** (packet-local backfill). Current source
docs already establish that HR evaluation data must be more restricted than
ordinary org-member records; exact scope is **BLOCKED ON D-26**.

## Current State (ground truth)
- Existing UI: no teacher-evaluation workflow. The native staff surface exists as
  `components/StaffMemberManager.tsx` inside `components/ManageHub.tsx`, reached
  by `STAFF_MEMBERS` or `Manage?tab=staff`; staff detail uses
  `components/StaffSlideOverContent.tsx` for profile, assignments, roles, and
  documents. There is no evaluation tab, due-review queue, self-evaluation form,
  acknowledgment flow, or HR document attachment flow.
- Existing schema: `staff_evaluations` is a normalized Blueprint table from
  `0002` with `staff_member_id`, `reviewer_staff_id`, `period_label`, `due_date`,
  `status` = `DUE | SCHEDULED | DRAFT | COMPLETED | ACKNOWLEDGED`,
  `overall_rating`, `criteria` jsonb, `strengths`, `actions` jsonb,
  `completed_at`, `acknowledged_at`, and audit columns. `staff_members` and
  `admin_inbox_items` are core HYBRID tables from `0001`. The private
  `documents` bucket currently uses org-member read and admin write policies,
  which is too broad for HR evaluation attachments.
- Existing query helpers: `listDueEvaluations`, `getStaffEvaluationHistory`, and
  `listEvaluationActions` in `utils/blueprintQueries.ts`.
- Existing tests: `utils/blueprintQueries.test.ts` covers due filtering, history
  sorting, and open action flattening. `utils/supabaseSync.ts` maps
  `staffEvaluations -> staff_evaluations` as `NORMALIZED`, and
  `docs/SUPABASE_MIGRATION_MAP.md` records the table. No HR workflow, RLS,
  storage-policy, status-transition, or Playwright tests exist for this module.
- Feature-tree declared queries: `listDueEvaluations`,
  `getStaffEvaluationHistory`, `listEvaluationActions` -- implemented.
- Feature-tree/schema drift to resolve during implementation: the tree's
  `agentReadable.auditFields` names `submittedAt` and `reviewedAt`, but the
  actual `StaffEvaluation` type/table carry `completedAt` and `acknowledgedAt`
  only. Do not claim submitted/reviewed timestamps until D-26 and a schema
  amendment decide the review lifecycle.

## Users And Permissions
- Actors: super_admin, admin/HR reviewer, teacher/staff subject, assigned reviewer
  if separate from admin, and reports/export consumers only if D-26 allows them.
  Finance and guardian/public actors have no baseline access.
- Read access: current uniform org-member read is not acceptable for HR records.
  Exact read scope -- all admins vs designated HR capability vs assigned reviewer
  vs subject self-read -- is **BLOCKED ON D-26**.
- Write access: admins can create evaluation records under the current uniform
  admin-write baseline, but product launch must not ship until D-26 decides who
  may author, complete, acknowledge, attach documents, and edit notes.
- Public/token access: none. HR evaluation must not create an unauthenticated
  route or reuse the D-07/D-14 public endpoint machinery.
- See embedded role matrix below.

## Workflows
- List/search/filter: HR due list from `listDueEvaluations`, filterable by
  period, due date, status, staff member, reviewer, overdue state, and open
  follow-up actions from `listEvaluationActions`.
- Create: create a `StaffEvaluation` linked to one `staffMemberId`, optional
  `reviewerStaffId`, `periodLabel`, `dueDate`, initial criteria, and actions.
  Who may create HR cycles beyond super_admin/admin is **BLOCKED ON D-26**.
- Detail: evaluation detail shows subject staff profile link, reviewer, period,
  criteria scores/comments, strengths, overall rating, actions, status history,
  and document links only if D-26 accepts an attachment model and storage scope.
- Edit: edit criteria, comments, rating, strengths, and actions while in
  `DUE | SCHEDULED | DRAFT`. Teacher self-evaluation edits, reviewer-only notes,
  post-completion correction rules, and document edits are **BLOCKED ON D-26**.
- Status transitions: intended enum path is `DUE -> SCHEDULED -> DRAFT ->
  COMPLETED -> ACKNOWLEDGED`, with admin correction paths only if audited.
  Subject acknowledgment and any self-evaluation submit step are **BLOCKED ON
  D-26**.
- Archive/delete: no hard delete may ship until D-26 sets HR retention/export/
  deletion rules. If a stopgap is needed after D-26, prefer archived/voided
  status or replacement records over destructive deletion.
- Import/export: HR evaluation export, personnel-file export, and import of
  legacy evaluation history are **BLOCKED ON D-26** because they expose staff
  personal-performance data.
- Cross-links: Staff profile/detail, Admin Inbox or Operations Command Center for
  due reviews/follow-up actions, private documents storage, Reports/Analytics
  only after D-26 permits aggregate or per-staff reporting.

## Data Contract
- Primary record: `StaffEvaluation` (`types/blueprint.ts`) /
  `staff_evaluations`.
- Linked records: HYBRID `staff_members` carrying `StaffMemberV2`, optional
  reviewer staff member, optional `AdminInboxItem` for due/overdue review tasks,
  optional private `DocumentEntry`/storage object once D-26 chooses attachment
  storage and visibility.
- Required fields: `orgId`, `staffMemberId`, `periodLabel`, `status`, `criteria`
  array, `actions` array. `reviewerStaffId`, `dueDate`, `overallRating`,
  `strengths`, `completedAt`, and `acknowledgedAt` are nullable by current type.
- Derived/computed fields: due/overdue list from `listDueEvaluations`, per-staff
  chronology from `getStaffEvaluationHistory`, and action worklist from
  `listEvaluationActions`. Do not persist duplicate "is overdue" flags unless a
  scheduler packet later introduces a materialized reminder job.
- Audit fields: table `createdAt`, `updatedAt`, `createdBy`, `updatedBy`;
  lifecycle fields `completedAt` and `acknowledgedAt`. Current schema does not
  carry `submittedAt`, `reviewedAt`, reviewer note visibility, or retention
  fields; those are **BLOCKED ON D-26** if required.
- **Conversion semantics:** create writes one normalized `staff_evaluations` row
  and optionally a linked HYBRID `admin_inbox_items` reminder/follow-up item.
  Completion writes criteria, strengths, rating, actions, status, and
  `completedAt` transactionally. Acknowledgment writes status and
  `acknowledgedAt` only if D-26 allows subject acknowledgment. Staff profile
  display stays on the existing HYBRID `staff_members` storage; no global Staff
  persistence migration is introduced by this packet.
- Open schema decisions: **D-26** controls staff notice/consent posture, HR vs
  admin vs reviewer vs subject visibility, self-evaluation fields, reviewer-only
  notes, document attachment storage, retention/deletion/export rules, and
  whether a dedicated HR capability is needed.

## UX Placement (obey route-nav-policy.md)
- Home: **Staff detail submodule/tab** inside the existing Staff Members surface
  (`STAFF_MEMBERS` / `Manage?tab=staff`). Due/follow-up tasks may also surface in
  Admin Inbox or Operations Command Center once permissions are resolved.
- Navigation entry: contextual only for v1. No new sidebar item and no command
  palette destination beyond existing staff search/navigation.
- Mobile visibility: HR admin/reviewer workflow is desktop-first with the Staff
  module. If D-26 allows teacher self-evaluation or acknowledgment, that
  subject-facing path must be mobile-readable at 390x844 and must not expose
  other staff records.
- Empty / loading / error states: no evaluations for staff member, no due
  evaluations, no open actions, missing staff/reviewer link, stale staff archived,
  attachment unavailable, permission denied, and sections marked **BLOCKED ON
  D-26**.
- Hebrew/RTL requirements: criteria labels, free-text comments, strengths,
  action descriptions, reviewer/staff names, period labels, and document names
  must work in Hebrew/RTL. Scores, dates, storage paths, and filenames should be
  readable in mixed-direction rows.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ⚠ | ⚠ | — | — | — | **BLOCKED ON D-26** exact HR scope. At minimum, replace uniform member-read on `staff_evaluations` with super_admin plus the accepted admin/HR/reviewer/subject scopes. |
| Read detail | ✓ | ⚠ | ⚠ | — | — | — | Same as list/read; full detail includes performance comments/actions and any private document links. |
| Create | ✓ | ⚠ | — | — | — | — | Current admin-write baseline exists, but product permission to create HR cycles is **BLOCKED ON D-26**. |
| Edit | ✓ | ⚠ | ⚠ | — | — | — | Criteria/rating/action edits, self-evaluation text, reviewer-only notes, and post-completion corrections are **BLOCKED ON D-26**. |
| Status transition (non-financial) | ✓ | ⚠ | ⚠ | — | — | — | `DUE/SCHEDULED/DRAFT/COMPLETED/ACKNOWLEDGED` transition ownership is **BLOCKED ON D-26**. |
| Status transition (payroll/finance-affecting) | — | — | — | — | — | — | Evaluation status has no direct payroll/finance transition in v1; any downstream payroll/reporting effect would require a new decision. |
| Archive/delete | ✓ | ⚠ | — | — | — | — | HR retention, voiding, hard delete, and export/delete requests are **BLOCKED ON D-26**. |
| Export | ✓ | ⚠ | ⚠ | — | — | — | Personnel-file/performance export scope is **BLOCKED ON D-26**; finance has no default access. |
| Public submit/sign | — | — | — | — | — | — | No public/tokenized HR evaluation path. |

Required RLS refinements/tests:
- Narrow `staff_evaluations` read access from uniform org-member read before any
  UI ships; verify plain staff cannot list or read other staff evaluations.
- Add only the D-26-accepted scopes: admin/HR/reviewer access, subject self-read,
  subject self-edit/acknowledgment, and reviewer-only note access if accepted.
- Scope `documents` storage or any document-link table to the same HR visibility;
  the current org-member-readable `documents` bucket is too broad for evaluation
  attachments.
- Align any Admin Inbox/Operations items so due-review reminders do not leak HR
  evaluation titles, notes, or staff names beyond the accepted scope.

## Acceptance Criteria
- Unit: existing helper coverage for `listDueEvaluations`,
  `getStaffEvaluationHistory`, and `listEvaluationActions`; add tests for status
  transition helpers, overdue edge cases, action completion filtering, rating
  validation, and feature-tree audit-field drift once lifecycle fields are
  finalized.
- Supabase mapping: normalized camel<->snake mapping for `staffEvaluations`,
  including `reviewerStaffId`, `dueDate`, `overallRating`, `criteria` jsonb,
  `actions` jsonb, `completedAt`, and `acknowledgedAt`.
- RLS/security: real-role tests proving no broad member read, cross-org
  isolation, no finance/public access, and the exact D-26-accepted admin/HR/
  reviewer/subject scopes for read, write, acknowledgment, export, and document
  storage.
- Playwright smoke: after D-26 is resolved, Staff -> open staff profile ->
  Evaluations tab -> create evaluation -> due list shows it -> complete review ->
  optional subject acknowledgment -> follow-up action appears in action worklist.
  Self-evaluation, acknowledgment, reviewer-only notes, and attachments are
  **BLOCKED ON D-26**.
- Hebrew/RTL: Staff evaluation tab/detail, criteria editor, action list,
  acknowledgment view if accepted, and document labels.
- Mobile viewport: desktop-first for admin/reviewer HR work; if D-26 accepts a
  teacher subject-facing path, that path needs 390x844 coverage.
- Data migration/backfill: D-15 ACCEPTED -- packet-local only. Existing/demo
  `staff_evaluations` rows, if any, remain normalized. Do not backfill staff
  documents into evaluation attachments or create new HR history from free-text
  staff notes unless D-26 accepts attachment/history semantics. No global Staff
  migration.

## Dependencies
- Blocks: reports-analytics for HR/evaluation reports, operations-command-center
  for follow-up action aggregation, import-export-data-portability for personnel
  file import/export, and staff-teacher-management detail integration.
- Blocked by: **D-26** for HR privacy/consent/notice, reviewer/self permissions,
  attachments, retention, and export scope; real-role RLS/storage refinements
  for `staff_evaluations`, `documents`, and any linked Admin Inbox reminders.
