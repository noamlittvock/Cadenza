PLANNING COMPLETE

This file is the loop's only cross-iteration memory. Authoritative artifacts live
in the real docs: `README.md`, `IMPLEMENTATION_HANDOFF.md`, `NEXT_SESSION_HANDOFF.md`,
`decision-log.md`, `status-policy.md`, `route-nav-policy.md`, `module-template.md`,
`role-matrix-template.md`, `packets/`, and the Pass 4 roadmap when it exists.

On completion, the loop replaces this first line with exactly:
PLANNING COMPLETE

## Current-source rule

This state was seeded for Codex after Phase A and Phase B documentation already
existed. If a queue item is already resolved by a current source document, reconcile
the stale artifact and tick the unit. Do not undo accepted Phase A/B work.

If a decision is not already resolved by a current source document, the loop may
only confirm a recommended default already written in `decision-log.md`. It must
park genuine Noam/product calls and consent-sensitive public/anon/personal-data
questions in NEEDS NOAM.

## Queue (dependency order - do the first unticked unit, exactly one)

### Stage 1 - Foundational decisions and status reconciliation
- [x] D-01 module nav home - confirm against `route-nav-policy.md`; no new top-level views beyond current policy.
- [x] D-02 dead-end palette - confirm against `route-nav-policy.md` and routed-view allowlist work.
- [x] D-15 existing-data backfill - confirm default; record on every packet's data-migration line.
- [x] D-STATUS and D-STATUS-2 tree status drift - reconcile `decision-log.md`, packet headers, and `features/forteTree.ts` per `status-policy.md`.

### Stage 2 - Per-module decisions (confirm, reconcile, or park)
- [x] D-03 family productize-as-editable - reconcile with current accepted docs if present; otherwise PARK as product call.
- [x] D-07 public unauthenticated writes - consent-sensitive; reconcile only if current docs explicitly lock the safe path, otherwise PARK.
- [x] D-07-FIN finance ledger owner - confirm/reconcile family-led default or park.
- [x] D-09 reports visibility - confirm/reconcile admin/finance default or park.
- [x] D-10 balance snapshots - confirm/reconcile compute-live plus audit snapshots default or park.
- [x] D-11 agreement signature capture - confirm/reconcile typed plus PDF default or park.
- [x] D-12 year rollover mutation model - confirm/reconcile next-year-copy default or park.

### Stage 3 - Pass 2 completion (docs)
- [x] Role/RLS matrices for the 5 P0 packets using `role-matrix-template.md`.
- [x] Conversion semantics and migration deltas for resolved decisions.

### Stage 4 - Pass 3 packets (one packet per iteration)
- [x] Enumerate from `features/forteTree.ts` every non-native node lacking a packet; add one `[ ]` queue item per module below this line.
- [x] Draft packet for `rooms-absence-requests` (p1, embedded).
- [x] Draft packet for `ensembles-theory-school-programs` (p1, planned).
- [x] Draft packet for `exams-certificates-report-cards` (p1, planned).
- [x] Draft packet for `concert-programs-events` (p2, planned).
- [x] Draft packet for `agreements-consent` (p1, gap).
- [x] Draft packet for `instrument-inventory` follow-up (p1, implemented).
- [x] Draft packet for `teacher-evaluation-hr` (p2, gap).
- [x] Draft packet for `year-rollover-setup` (p1, embedded).
- [x] Draft packet for `calendar-website-integrations` (p1, embedded).
- [x] Draft packet for `reports-analytics` (p1, planned).
- [x] Draft packet for `operations-command-center` (p1, planned).

### Stage 5 - Pass 4 roadmap
- [x] Implementation roadmap: epics, ticket slices, test plans, live-Supabase RLS markers, and keystone-first sequencing.

## Next unit
- Planning queue and completion checklist are complete. Next work starts from
  `IMPLEMENTATION_HANDOFF.md` and `IMPLEMENTATION_ROADMAP.md`, with D-17-D-27
  still parked for Noam before blocked packet sections are built.

## NEEDS NOAM (parking lot - loop never decides these)
- D-17: Confirm whether group lessons are multiple `lesson_records` rows sharing one `eventId` (one row per event/student) or an event-level attendance record with embedded student statuses, and choose lazy-on-open vs batch materialization for existing events.
- D-18: Should legacy `hours_reports` become a period header for normalized `hours_entries`, be migrated into `hours_entries` and retired, or remain as a parallel reporting surface?
- D-19: What is the payroll rate resolution order (teaching assignment, org role, manual override, other), and is the rate stamped at teacher submit, admin approve, or payment close?
- D-20: Should the ledger enforce a single currency per family/org, or explicitly support multi-currency balances and statements?
- D-21: When an `ABSENCE` or `DAY_OFF` operational request is approved, what calendar side effects should ship (blackout, event cancellation/reschedule, makeup task, lesson/payroll impact, notification only), and how should "extra teaching day" requests be represented?
- D-22: For exams/certificates/report cards, should v1 stay on simple authenticated `ExamSession`/`ExaminerSubmission`/`Certificate`/`ReportCard` records, or implement the older Academic Hub model with rubrics, pass/fail thresholds, AI summaries, generated PDFs, guardian email delivery, and/or tokenized examiner/guardian links; if richer scope is required, what fields, document paths, consent/setup, and public-token rules should ship?
- D-23: May concert/event publishing expose event details, venue, repertoire, student/staff performer names, and downloadable or embeddable program files to unauthenticated website/calendar visitors; if yes, what consent/release setup, redaction rules, performer display names, revocation/unpublish behavior, and `public_endpoints`/calendar-website integration scope should ship?
- D-24: Should agreement/consent v1 support guardian/family withdrawal or revocation after acceptance, and if yes what status value, audit fields (`revokedAt`, revokedBy, reason), public-token behavior, and downstream effects should ship for enrollments, media/public releases, instrument loans, and reports?
- D-25: Should instrument deposits, replacement fees, and refunds be represented as finance ledger rows, agreement-only terms, standalone fields on `instrument_loans`, or a mixed model; what lifecycle states, refund/forfeit rules, document links, and family/student/staff ownership should ship?
- D-26: For teacher evaluation/HR, may Cadenza collect and store staff self-evaluations, manager reviews, reviewer-only notes, ratings, follow-up actions, acknowledgments, and document attachments without a separate staff notice/consent or HR policy setup; if yes, what exact privacy scope should ship for admins/HR, assigned reviewers, subject staff, storage visibility, retention/deletion, and exports?
- D-27: For year rollover, should Cadenza automatically advance `StudentV2.grade` and copy recurring schedule/event records into the new school year; if yes, what grade vocabulary/increment rules, non-graded/adult-student exceptions, manual override behavior, date-shift method, holiday/blackout handling, room/staff conflict behavior, and predecessor/successor lineage fields should ship?

## Completion checklist (all must hold before PLANNING COMPLETE)
- [x] Every decision in `decision-log.md` is ACCEPTED, IMPLEMENTED, or listed in NEEDS NOAM.
- [x] Every non-native `features/forteTree.ts` node that needs a packet has one in `packets/`.
- [x] Pass 4 roadmap file exists and sequences every module.
- [x] `npm run typecheck -- --diagnostics` clean and `npx vitest run --reporter=dot` clean.
- [x] No packet cites an OPEN decision without an explicit `BLOCKED ON D-xx` marker.

## Iteration log
- (loop appends: iteration N - unit - verification)
- iteration 1 - D-01 module nav home: reconciled `decision-log.md` with the accepted route/nav source of truth in `IMPLEMENTATION_HANDOFF.md` and `route-nav-policy.md`; no new top-level views beyond Students + Finance.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 2 - D-02 dead-end palette: reconciled `decision-log.md`, `route-nav-policy.md`, and `IMPLEMENTATION_HANDOFF.md` with the implemented routed-view allowlist: five dead-end views stay hidden and `INVENTORY` aliases to `Manage?tab=inventory`.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 3 - D-15 existing-data backfill: accepted the packet-local backfill default in `decision-log.md`, refreshed `IMPLEMENTATION_HANDOFF.md`, and recorded D-15-specific data-migration expectations on all five P0 packets without adding a global Student/Event migration.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 4 - D-STATUS and D-STATUS-2 tree status drift: marked both status cleanup decisions implemented in `decision-log.md`, refreshed `status-policy.md` for the existing consistency gate, and reconciled the student-family/payroll packet headers with the current `embedded` tree statuses.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this planning/status unit.
- iteration 5 - D-03 family productize-as-editable: reconciled `decision-log.md`, `student-family-files`, and `public-registration-intake` with the locked handoff decision that `Family` is first-class and editable; D-07 and D-07-FIN remain separate queue decisions.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 6 - D-07 public unauthenticated writes: reconciled `decision-log.md`, `README.md`, and `public-registration-intake` with the locked safe path in `IMPLEMENTATION_HANDOFF.md`: public writes require an Edge Function/scoped token into quarantined intake plus explicit consent/setup; no broad anon insert or public surface activation.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 7 - D-07-FIN finance ledger owner: reconciled `decision-log.md`, `payments-charges`, and `student-family-files` with the locked handoff decision that the finance ledger is family-led, uses `familyId` as the canonical aggregation key, and keeps per-enrollment charge line lineage.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 8 - D-09 reports visibility: reconciled `decision-log.md` with the locked handoff decision that reports are admin/finance-only initially, with per-report scoping deferred to the `reports-analytics` packet.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 9 - D-10 balance snapshots: reconciled `decision-log.md` and `payments-charges` with the locked handoff decision that live balances are computed on demand while `balance_snapshots` are only periodic/audit history.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 10 - D-11 agreement signature capture: reconciled `decision-log.md` with the locked handoff decision that agreements support both typed e-signature and PDF upload, with `agreement_acceptances` recording either form and D-07 still governing any public/tokenized signing path.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 11 - D-12 year rollover mutation model: reconciled `decision-log.md` with the locked handoff decision that rollover creates next-year records and never mutates prior-year history; no packet or tree status edit was required.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 12 - Role/RLS matrices for the 5 P0 packets: filled the full `role-matrix-template.md` grid in all five P0 packets and reconciled the template, packet blocker text, and README pass status with the accepted `0004` teacher/finance/public-endpoint posture.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 13 - Conversion semantics and migration deltas for resolved decisions: recorded P0 packet conversion semantics and packet-local migration deltas for the accepted D-03/D-04/D-05/D-07/D-07-FIN/D-10/D-15 path, reconciled README/handoffs, and parked D-16-D-20 Noam questions with `BLOCKED ON D-xx` markers.
  Verification: `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 14 - Pass 3 packet enumeration: generated the Stage 4 queue from `features/forteTree.ts` plus existing packet files, adding 11 unticked packet units for every non-native node still lacking a packet; refreshed the README roster/count and `PublicEndpoint` audit note to match current `0004`.
  Verification: generated coverage check reported 11 missing non-native packet IDs with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 15 - rooms-absence-requests packet: drafted `packets/rooms-absence-requests.md`, added parked D-21 for unresolved absence/day-off/extra-day calendar mutation rules, and reconciled decision/handoff parked-question ranges to D-16-D-21.
  Verification: generated packet coverage check reports 10 remaining non-native packet IDs with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 16 - ensembles-theory-school-programs packet: drafted `packets/ensembles-theory-school-programs.md` as a planned P1 roster/program surface over existing ActivityV2, EnrollmentV2, StudentV2, and TeachingAssignmentV2 data; grouped attendance materialization stays marked `BLOCKED ON D-17`.
  Verification: generated packet coverage check reports 9 remaining non-native packet IDs with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 17 - exams-certificates-report-cards packet: drafted `packets/exams-certificates-report-cards.md` around the existing normalized assessment tables, authenticated examiner submission scope, Manage/Student-context placement, and storage/RLS refinements; parked D-22 for richer Academic Hub rubric/pass-fail/PDF/email/token decisions.
  Verification: generated packet coverage check reports 8 remaining non-native packet IDs with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 18 - concert-programs-events packet: drafted `packets/concert-programs-events.md` around the existing normalized `ConcertProgram` table, Calendar event anchoring, authenticated run-of-show planning, private document/export scope, and RLS/storage refinements; parked D-23 for public performer/program exposure and consent/release rules.
  Verification: generated packet coverage check reports 7 remaining non-native packet IDs with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 19 - agreements-consent packet: drafted `packets/agreements-consent.md` around the existing `agreement_templates`/`agreement_acceptances` tables, accepted D-07/D-11/D-14 signing path, admin-authenticated workflow, and RLS/storage refinements; parked D-24 for consent withdrawal/revocation semantics.
  Verification: generated packet coverage check reports 6 remaining non-native packet IDs with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 20 - instrument-inventory packet: drafted `packets/instrument-inventory.md` as the implemented Manage-tab follow-up around the current catalog/checkout/return workflow, normalized instrument/loan/repair tables, route alias, status-sync/repair/document/RLS follow-up, and blocked deposit sections; parked D-25 and reconciled affected agreement/payment packet markers.
  Verification: generated packet coverage check reports 5 remaining non-native packet IDs with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 21 - teacher-evaluation-hr packet: drafted `packets/teacher-evaluation-hr.md` around the existing normalized `StaffEvaluation` table, deterministic evaluation helpers, Staff detail placement, and required HR RLS/storage refinements; parked D-26 for staff HR privacy, consent/notice, access, attachment, retention, and export scope.
  Verification: generated packet coverage check reports 4 remaining non-native packet IDs with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 22 - year-rollover-setup packet: drafted `packets/year-rollover-setup.md` around the existing setup gate, Academic Calendar settings fields, pure rollover helpers, `rollover_runs` audit table, D-12/D-13/D-15 semantics, and required admin-only RLS refinement; parked D-27 for grade advancement and recurring-event copy/date-shift rules.
  Verification: generated packet coverage check reports 3 remaining non-native packet IDs (`operations-command-center`, `reports-analytics`, `calendar-website-integrations`) with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 23 - calendar-website-integrations packet: drafted `packets/calendar-website-integrations.md` around the existing Manage subscriptions tab, Settings/Calendar Google sync, legacy tokenized hours form, accepted D-07/D-14/D-15 endpoint registry path, and **BLOCKED ON D-23** public website/event/program exposure.
  Verification: generated packet coverage check reports 2 remaining non-native packet IDs (`reports-analytics`, `operations-command-center`) with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 24 - reports-analytics packet: drafted `packets/reports-analytics.md` around the existing `report_definitions` table, implemented deterministic report helpers, accepted D-08/D-09/D-15 reporting posture, source authorization/RLS needs, and source-specific report packs marked `BLOCKED ON D-16` through `BLOCKED ON D-27`.
  Verification: generated packet coverage check reports 1 remaining non-native packet ID (`operations-command-center`) with `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 25 - operations-command-center packet: drafted `packets/operations-command-center.md` as an Admin Inbox/Operations summary packet over Calendar conflicts, Admin Inbox, imports, reports, hours, and source-module health; source-specific dashboard cards stay marked `BLOCKED ON D-16` through `BLOCKED ON D-27`.
  Verification: generated packet coverage check reports `missing: []` and `absent: []`; `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 26 - Pass 4 implementation roadmap: drafted `IMPLEMENTATION_ROADMAP.md` with sequence 0 native spines plus 16 packeted modules, keystone-first P0 order, ticket slices, test gates, and `RLS-LIVE` markers; refreshed README and handoff links to the roadmap.
  Verification: roadmap coverage check found no missing `features/forteTree.ts` module IDs. `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo). `npm run typecheck -- --diagnostics` still fails in pre-existing `utils/canonicalAdapters.test.ts:131` cast (`StudentV2` to `Record<string, unknown>`), unrelated to this markdown-only unit.
- iteration 27 - completion gate: fixed the tracked `utils/canonicalAdapters.test.ts:131` type assertion by converting through `unknown`, preserving the lossy-field runtime check while making the TypeScript gate clean; no planning scope, packet scope, or parked Noam question changed.
  Verification: generated checklist checks found 22 feature-tree modules, 16 non-native packets, no missing packets, no roadmap omissions, no unresolved decisions outside NEEDS NOAM, and no OPEN packet marker without `BLOCKED ON D-xx`. `npm run typecheck -- --diagnostics` passed and `npx vitest run --reporter=dot` passed (11 files, 155 passed, 4 todo).
- post-loop decision update - D-16 accepted for the P0 build path after Noam agreed to the recommendation: continue using `families.guardians[]` jsonb for guardian/contact data and defer normalized guardian identity to a future explicit decision.
  Verification: planning remains complete; D-17-D-27 stay in NEEDS NOAM.
