# Year Rollover And Setup Wizard  (`year-rollover-setup`)

Status: `embedded` (per `features/forteTree.ts`) -> target `implemented`.
Priority: p1
Owner-decisions still blocking this packet: **BLOCKED ON D-24** for
agreement/consent revocation effects on copied next-year agreement requests; and
**BLOCKED ON D-27** for automatic grade advancement and recurring-event copy/date-
shift rules. Ledger balance, charge, credit, statement, and currency carry-
forward behavior use the accepted D-20 single-currency org/family ledger policy
once the payments-charges source module exists.
Current accepted prerequisites: **D-12** (create next-year records; never mutate
prior-year history), **D-13** (persisted `rollover_runs` audit entity), and
**D-15** (packet-local backfill only).

## Current State (ground truth)
- Existing UI: setup is partially embedded. `utils/useOnboarding.ts` reads and
  writes `onboarding_state`, tracks first-admin setup flags, and syncs org
  milestones from live activity/staff/event counts. `components/OnboardingChecklist.tsx`
  renders the hard setup gate and gate-cleared checklist, and `App.tsx` blocks
  first-admin access to `CALENDAR` until `setupGateCleared`. `components/Settings.tsx`
  exposes `schoolYearStartDate`, `schoolYearEndDate`, and `schoolYearLabel` in
  the Academic Calendar settings section. There is no rollover wizard, run
  history, preview detail, approval/apply step, or applied-run audit UI.
- Existing schema: `onboarding_state` and `user_profiles` are runtime support
  tables from `0003`; `system_configs` is the HYBRID settings table from `0001`
  and stores `AppSettings` including school-year fields. `students`,
  `enrollments`, `events`, and `event_participants` are core HYBRID tables from
  `0001`. `rollover_runs` is a normalized `0004` table with
  `from_year_label`, `to_year_label`, `status = PREVIEWED|APPLIED|FAILED|CANCELLED`,
  `preview`, `plan`, `result`, `warnings`, lifecycle timestamps, error message,
  and audit columns. Current `rollover_runs` RLS is org-member read/admin write,
  which is broader than the target module because previews can expose student,
  enrollment, schedule, agreement, and finance context.
- Existing query helpers: `previewYearRollover`, `applyYearRollover`, and
  `listSetupMilestones` in `utils/blueprintQueries.ts`. The rollover helpers are
  pure and currently enrollment-focused: preview classifies active enrollments
  into carry-forward vs not-copied/archived buckets, and apply returns a
  deterministic plan of new `MinimalEnrollment` rows plus source enrollment IDs
  that should not carry forward. They do not persist `RolloverRun`, copy students,
  copy recurring events, issue agreement requests, or touch ledger rows.
- Existing tests: `utils/blueprintQueries.test.ts` covers rollover preview/apply
  and setup milestones. `utils/supabaseSync.ts` maps
  `rolloverRuns -> rollover_runs` as `NORMALIZED`; `utils/supabaseSync.test.ts`
  and `utils/supabaseSchema.test.ts` cover the `0004` mapping/schema foundation.
  No rollover UI, transaction/apply, RLS, conflict, or Playwright workflow tests
  exist.
- Feature-tree declared queries: `previewYearRollover`, `applyYearRollover`,
  `listSetupMilestones` -- implemented.

## Users And Permissions
- Actors: super_admin and admin for setup, preview, apply, cancellation, export,
  and audit. Finance participation in balance/carry-forward sections uses
  accepted D-20 single-currency semantics after payments-charges defines the
  source ledger behavior. Teachers, general members, students/families, and
  guardian/public users have no baseline rollover access.
- Read access: admins read setup status, rollover previews, run history, warnings,
  and apply results. `onboarding_state` may remain broadly org-readable because
  it only stores setup booleans, but `rollover_runs` must be narrowed before
  launch because run payloads can expose linked student/enrollment/schedule/
  agreement/finance data.
- Write access: admins update school-year settings, generate previews, cancel
  unapplied runs, and apply approved plans. Apply must use an audited server-owned
  mutation path, not client-only multi-row writes.
- Public/token access: none. Rollover must not expose any unauthenticated setup,
  preview, or apply surface.
- See embedded role matrix below.

## Workflows
- List/search/filter: admin run history by from/to year, status, created/applied
  date, creator/applier, warning count, failed runs, and affected-record counts.
  Setup milestones are shown from `listSetupMilestones`.
- Create: admin chooses source year, target year, cutoff/new start dates, and
  rollover scope; system generates a preview and writes one `rollover_runs` row
  with status `PREVIEWED`, immutable source parameters, preview rows, warnings,
  and no downstream record mutation.
- Detail: preview detail shows source settings, setup-milestone readiness,
  students/enrollments that will carry forward, enrollments that will not carry
  forward, warnings for archived/missing students, and blocked sections for
  proposed grade changes, copied recurring events, copied agreement requests, and
  balance/charge handling where those depend on parked decisions.
- Edit: an unapplied preview can be regenerated or cancelled; editing parameters
  creates a new preview snapshot or explicit preview revision rather than
  silently changing an applied run. Applied runs are immutable except audited
  error/result metadata written by the server mutation.
- Status transitions: `PREVIEWED -> APPLIED`; `PREVIEWED -> CANCELLED`;
  `PREVIEWED -> FAILED` if apply fails before completion; `APPLIED` and
  `CANCELLED` are terminal. Retrying a failed apply creates a new run linked to
  the failed run or records an audited retry attempt; do not mutate prior-year
  source records to recover.
- Archive/delete: no hard delete for rollover runs. Cancel or retain failed runs
  so operators can audit attempted bulk operations.
- Import/export: admin export of preview and applied-result rows. Import of
  historical rollover runs is optional backfill only; it must not synthesize
  source mutations.
- Cross-links: Settings Academic Calendar, existing onboarding checklist, Student
  and family files, Enrollment/Activity/Calendar records, Agreements for copied
  next-year requests, Payments/Charges for D-20 single-currency
  balance/carry-forward sections, Reports/Analytics for rollover audit reports, and
  Import/Export for preview/result export.

## Data Contract
- Primary record: `RolloverRun` (`types/blueprint.ts`) /
  `rollover_runs`.
- Linked records: `AppSettings` in HYBRID `system_configs`, `onboarding_state`,
  HYBRID `students` through the D-04 canonical adapter boundary where
  `StudentV2`/`MinimalStudent` is needed, HYBRID `enrollments` carrying
  `EnrollmentV2`, HYBRID `events` and `event_participants` for schedule carry-
  forward, `AgreementTemplate`/`AgreementAcceptance` for next-year agreement
  requests, and ledger tables after payments-charges implements D-20 single-
  currency carry-forward behavior.
- Required fields: `fromYearLabel`, `toYearLabel`, `status`, `preview`, `plan`,
  `result`, and `warnings`; `startedAt` when apply begins; `appliedAt` when the
  run completes; `failedAt` and `errorMessage` on failed runs.
- Derived/computed fields: setup milestone list from `listSetupMilestones`;
  active enrollment counts, carry-forward IDs, not-copied/archived IDs, and
  warnings from `previewYearRollover`; proposed new enrollment rows from
  `applyYearRollover`; run counters and warning badges from `RolloverRun`
  payloads rather than duplicate persisted aggregates.
- Audit fields: table `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, plus
  lifecycle fields `startedAt`, `appliedAt`, `failedAt`, and `errorMessage`.
  Apply timestamps and actor fields should be server-owned.
- **Conversion semantics:** D-12 ACCEPTED -- rollover creates next-year records
  and never mutates prior-year student, enrollment, schedule, ledger, or
  agreement history in place. The current helper's `archiveEnrollmentIds` must be
  treated as "source enrollment IDs not carried forward" for persistence planning;
  do not update those prior-year enrollment rows solely because they appeared in
  the list. D-13 ACCEPTED -- every preview/apply attempt persists a
  `rollover_runs` audit row. Apply must be all-or-nothing for the selected plan:
  create next-year records, write result metadata, and transition the run to
  `APPLIED`; on failure, leave source records intact and mark the run `FAILED`.
- Open schema decisions: automatic grade advancement, student-copy lineage, and
  recurring-event copy/date-shift rules are **BLOCKED ON D-27**; balance, charge,
  credit, statement, and currency carry-forward behavior use accepted D-20 P0
  single-currency semantics after payments-charges defines the source ledger
  rows; copied agreement-request behavior when prior consent was withdrawn/
  revoked is **BLOCKED ON D-24**.

## UX Placement (obey route-nav-policy.md)
- Home: **Settings -> Academic Calendar / Setup** submodule for school-year
  dates, setup readiness, rollover preview, and run history. The existing
  `OnboardingChecklist` remains the embedded first-admin setup gate; rollover
  does not add a new top-level `ViewState`.
- Navigation entry: no sidebar or command-palette destination in v1. Admins reach
  rollover from Settings or from contextual prompts in setup/readiness surfaces.
- Mobile visibility: setup checklist remains mobile-readable through the current
  gate. The rollover preview/apply workflow is admin desktop-first because it is
  dense, bulk, and high-risk; no mobile-primary apply flow is required.
- Empty / loading / error states: no school-year settings, setup gate incomplete,
  no prior runs, no active enrollments to carry forward, stale source data since
  preview, warnings present, permission denied, failed apply, cancelled run, and
  sections marked **BLOCKED ON D-24** or **BLOCKED ON D-27**.
- Hebrew/RTL requirements: setup milestone labels, school-year labels, warning
  text, student/enrollment names, dates, status chips, and preview/result tables
  must work in Hebrew/RTL. IDs, timestamps, file/export names, and currency
  values should be LTR-isolated inside RTL rows.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | — | — | — | — | Refine `rollover_runs_read` from uniform member-read to admin-only before launch. Finance read of balance/carry-forward sections uses accepted D-20 single-currency semantics after payments-charges exists. |
| Read detail | ✓ | ✓ | — | — | — | — | Same as list/read; detail can expose student, enrollment, agreement, and finance lineage. |
| Create | ✓ | ✓ | — | — | — | — | Current admin-write policy covers preview-row creation; implementation should write previews through a validated server/RPC path. |
| Edit | ✓ | ✓ | — | — | — | — | Admin may regenerate/cancel unapplied previews; applied runs are immutable except server-owned result/error metadata. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin transitions `PREVIEWED -> APPLIED|CANCELLED|FAILED`; apply must preserve D-12 prior-year immutability. |
| Status transition (payroll/finance-affecting) | ✓ | ✓ | — | — | ⚠ | — | Ledger balance/charge/credit/statement carry-forward uses accepted D-20 single-currency semantics after payments-charges exists. |
| Archive/delete | — | — | — | — | — | — | No hard delete of runs; cancellation or retained failure state only. |
| Export | ✓ | ✓ | — | — | — | — | Admin export of preview/result rows. Finance-specific exports use accepted D-20 single-currency semantics. |
| Public submit/sign | — | — | — | — | — | — | No public/tokenized rollover path. |

Required RLS refinements/tests:
- Narrow `rollover_runs` read access from org-member to admin-only before any
  preview UI ships.
- Verify admin/super_admin can create, cancel, apply, and export runs; plain
  members, teachers, finance users without an explicit payments-charges-derived
  finance scope, and guardian/public users cannot read or write rollover runs.
- Verify cross-org isolation for `rollover_runs`, `onboarding_state`, school-year
  settings, and all linked source/result rows.
- If finance access is added for D-20 carry-forward sections, add a scoped
  view/RPC or table policy that exposes only the accepted finance fields.

## Acceptance Criteria
- Unit: existing helper coverage for `previewYearRollover`,
  `applyYearRollover`, and `listSetupMilestones`; add tests that D-12 persistence
  treats `archiveEnrollmentIds` as not-copied source IDs rather than in-place
  source mutations, plus tests for stale preview detection, failed apply result
  capture, run status terminality, D-20 single-currency finance sections once
  payments-charges exists, and **BLOCKED ON D-27**/**BLOCKED ON D-24** sections
  once resolved.
- Supabase mapping: normalized camel<->snake mapping for `rolloverRuns`; HYBRID
  `systemConfigs`, `students`, `enrollments`, `events`, and `eventParticipants`
  remain wrapped/unwrapped through existing adapters. `preview`, `plan`,
  `result`, and `warnings` jsonb must round-trip without key loss.
- RLS/security: real-role tests for admin full access, plain member denied from
  `rollover_runs`, teacher denied, guardian/public denied, optional finance scope
  only after an explicit payments-charges-derived scope exists, no anon access,
  and cross-org isolation.
- Playwright smoke: Settings -> Academic Calendar -> enter/confirm school-year
  dates -> generate rollover preview -> warnings and carry-forward counts render
  -> cancel run. After **BLOCKED ON D-27**/**BLOCKED ON D-24** sections are
  resolved and payments-charges source ledger behavior exists, add apply smoke:
  generate preview -> apply -> next-year records exist -> prior-year records are
  unchanged -> run history shows `APPLIED`.
- Hebrew/RTL: setup gate/checklist, Academic Calendar settings, rollover preview,
  warnings, run history, and export labels.
- Mobile viewport: current setup gate remains readable at 390x844. Rollover
  preview/apply is desktop-first; no mobile-primary apply smoke required unless
  route policy changes.
- Data migration/backfill: D-15 ACCEPTED -- packet-local only. Existing
  school-year settings remain in `system_configs`; existing `onboarding_state`
  rows are preserved. Do not backfill historical `rollover_runs` unless there is
  deterministic source evidence for a past run. No global Student/Event/Enrollment
  persistence migration. Student grade advancement and recurring-event copy
  backfill are **BLOCKED ON D-27**; finance carry-forward backfill uses
  payments-charges rows under accepted D-20 single-currency semantics; copied
  agreement requests affected by withdrawn/revoked consent are **BLOCKED ON
  D-24**.

## Dependencies
- Blocks: agreements-consent for copied next-year agreement requests,
  payments-charges for D-20 single-currency balance/charge carry-forward,
  reports-analytics for rollover audit reports, calendar-website-integrations if
  copied public calendars depend on next-year schedule records, ensembles/theory/
  school-program rosters, exams/report-card carry-forward history, and
  import-export-data-portability for preview/result exports.
- Blocked by: student-family-files for first-class student/family context,
  agreements-consent for structured next-year agreement requests, payments-
  charges for any ledger carry-forward, real-role RLS refinement for
  `rollover_runs`, **BLOCKED ON D-24** for agreement revocation effects, and
  **BLOCKED ON D-27** for grade advancement plus recurring event copy/date-shift
  semantics.
