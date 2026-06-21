# Concert Programs And Events  (`concert-programs-events`)

Status: `implemented` under bird's-eye mode (per `features/forteTree.ts`).
Priority: p2
Owner-decisions still release-gating public scope: **D-23 ACCEPTED
PROVISIONAL**. Public or website-facing event/program exposure, performer-name
disclosure, consent/release rules, redaction, and downloadable public program
files remain private/off until the production policy review enables them through
D-14 public endpoints plus participant-level consent/release setup. Core
authenticated concert planning over the existing normalized `ConcertProgram`
table is implemented.
Current accepted prerequisites: **D-01** (no new top-level route beyond current
policy), **D-04** (canonical student adapter), **D-05** (canonical event adapter),
**D-14** (public endpoint registry exists but is inert/admin-only), and **D-15**
(packet-local backfill).

## Current State (ground truth)
- Existing UI: native calendar/event scheduling exists through
  `components/CalendarView.tsx` and `components/EventFormV2.tsx`.
  `components/ConcertProgramPlanner.tsx` now provides private authenticated
  concert planning from Calendar event detail and Activity/roster context:
  list/search/status filter, create/edit/publish/cancel metadata, ordered pieces,
  student/staff performers, run-of-show, stale performer/duplicate-order/missing
  duration states, source links, private export references, EN/HE labels, and
  D-23 provisional public-output-blocked labeling. Teachers/performers have a
  mobile-reachable read-only Calendar event detail view for their own linked
  run-of-show; unrelated events show an authorization-denied state. No public
  website/program route or public file URL exists.
- Existing schema: `concert_programs` is a normalized Blueprint table from `0002`
  with `title`, optional `event_id`, `date`, `venue`, `status`, `pieces jsonb`,
  notes, and audit columns. `events`, `students`, `staff_members`, and
  `event_participants` are core HYBRID tables. The private `documents` storage
  bucket exists from `0001` and is currently org-member-read/admin-write by path.
- Existing query/helpers: `listConcertPrograms`, `getProgramRunOfShow`, and
  `listPerformerEvents` in `utils/blueprintQueries.ts`.
- Existing tests: `utils/blueprintQueries.test.ts` covers status/date sorting,
  run-of-show ordering/cumulative duration, performer lookup, draft/cancelled
  ordering, unlinked programs, duplicate order, unknown-duration cumulative
  nulling, stale performer IDs, and student/staff performer lookup.
  `components/ConcertProgramPlanner.test.tsx` covers planner draft/edit/piece
  helpers plus teacher read filtering. `utils/supabaseSync.test.ts` covers the
  normalized `concertPrograms -> concert_programs` mapping. Static schema tests
  and env-gated live RLS assertions cover admin full access, linked staff read,
  finance/plain/cross-org/anon denial, and private concert-program document
  storage. `e2e/concert-program-planning.spec.ts` covers admin private planning
  and 390x844 teacher run-of-show read/denial. Live RLS remains a
  release-hardening gate until remote migration
  `0015_concert_program_scoped_rls.sql` is applied and the concert live
  assertion passes without skips.
- Feature-tree declared queries: `listConcertPrograms`, `getProgramRunOfShow`,
  `listPerformerEvents` -- implemented.

## Users And Permissions
- Actors: admin, super_admin, assigned teacher/performance staff, general
  staff/member, finance, student/family as linked records, and guardian/public
  only if D-23 later accepts a public exposure model.
- Read access: admins read all concert programs. Assigned or performing teachers
  read only programs linked to their own events or pieces. General members should
  not receive full program payloads by default because pieces expose student
  performer data. Finance has no module-level access.
- Write access: admins create/edit/cancel/complete programs, manage piece order,
  link performers, and attach private program documents. Teachers do not edit
  program structure in v1 unless a later packet explicitly adds a scoped
  contribution workflow.
- Public/token access: none in v1. Public event pages, website embeds, public
  program PDFs, and any unauthenticated performer list are **BLOCKED ON D-23** and
  must route through the D-14 public endpoint registry plus whatever consent/setup
  D-23 requires.
- See embedded role matrix below.

## Workflows
- List/search/filter: admin list by status, date range, venue, linked event,
  missing event link, performer, activity/program, unpublished drafts, and
  cancelled/completed history; performer self list from `listPerformerEvents`.
- Create: admin creates a `ConcertProgram` from a Calendar event or as a standalone
  draft that can be linked to an event later. Create writes one
  `concert_programs` row with status `DRAFT` and an empty or imported `pieces`
  array.
- Detail: program detail shows linked event time/location, venue, status, notes,
  ordered pieces, composer, student/staff performers, duration, cumulative
  run-of-show from `getProgramRunOfShow`, linked documents, and cross-links to
  Calendar, Student, Staff, Activity/program roster, and reports.
- Edit: admin edits title, date, venue, event link, notes, piece order,
  repertoire, performers, and durations while `DRAFT` or by explicit correction
  before completion. Editing a linked event's schedule remains a Calendar event
  edit, not a direct `ConcertProgram` mutation.
- Status transitions: `DRAFT -> PUBLISHED -> COMPLETED`; `DRAFT -> CANCELLED`;
  `PUBLISHED -> CANCELLED` by admin correction; `PUBLISHED -> DRAFT` only as an
  authenticated admin unpublish/correction while no public surface is active.
  Public unpublish, cache invalidation, and redaction semantics are **BLOCKED ON
  D-23**.
- Archive/delete: no hard delete after publication, completion, linked documents,
  or linked reports exist. Cancel incorrect programs and retain audit/history.
- Import/export: admin CSV import/export for pieces and performer IDs; private
  authenticated printable/PDF output may be stored in the private `documents`
  bucket. Public website/PDF distribution is **BLOCKED ON D-23**.
- Cross-links: program <-> Calendar event/EventV2, Student files, Staff profiles,
  Activity/program rosters, private documents, exams/certificates if a concert is
  also an assessment event, calendar-website-integrations if public exposure is
  accepted, and reports-analytics.

## Data Contract
- Primary record: `ConcertProgram` (`types/blueprint.ts`) /
  `concert_programs`.
- Linked records: `CalendarEvent`/`EventV2` (`events`) through D-05 adapter
  boundaries, `StudentV2`/student rows through D-04 adapter/projection,
  `StaffMemberV2`, `EventParticipant`, optional `ActivityV2` through the linked
  event, and optional private `DocumentEntry`/storage object for exported program
  files.
- Required fields: program `id`, `orgId`, `title`, `date`, `status`, and
  `pieces[]`; each piece needs `order`, `title`, `performerStudentIds[]`,
  `performerStaffIds[]`, and may carry `composer` and `durationMinutes`.
- Derived/computed fields: sorted program lists, run-of-show lines, performer
  counts, cumulative duration, missing-duration warnings, and performer event
  history are computed from `concert_programs.pieces` and linked records, not
  persisted as duplicate aggregates.
- Audit fields: normalized table `createdAt`, `updatedAt`, `createdBy`,
  `updatedBy`; implementation should make publish/complete/cancel timestamps
  server-owned if additional audit columns are added later.
- **Conversion semantics:** creating from a Calendar event writes one normalized
  `concert_programs` row linked by `eventId`; it does not clone or mutate the
  HYBRID event except through the existing Calendar edit path. Student/event data
  crossing module boundaries uses the accepted D-04/D-05 adapter/projection seam.
  Generated private program documents may be stored under the existing private
  `documents` bucket and linked from the program workflow; public publication,
  public file URLs, performer redaction, and consent/release enforcement are
  **BLOCKED ON D-23**.
- Open schema decisions: **D-23** controls public event/program detail exposure,
  student/staff performer display rules, consent/release requirements, redaction,
  website/embed scope, and public downloadable program files. V1 uses the existing
  `pieces jsonb` shape unless D-23 requires performer-level consent/audit that
  cannot be enforced from the current row shape.

## UX Placement (obey route-nav-policy.md)
- Home: **Calendar event detail panel** for event-linked concert programs, plus a
  desktop admin list inside the Activity/program management area for standalone
  drafts and cross-event planning. Do not unhide or route a top-level `ACADEMICS`
  destination in v1.
- Navigation entry: no sidebar or command-palette destination in v1. Calendar
  event detail and Activity/program context are the entry points.
- Mobile visibility: admin planning is desktop-first. Performer/teacher read-only
  run-of-show access for their own linked events should be reachable from Calendar
  at 390x844 and must not rely on mobile-hidden Manage.
- Empty / loading / error states: no programs, no linked event, missing performer,
  stale student/staff ID in a piece, missing duration, cancelled linked event,
  storage/export failure, publish validation failure, and D-23-blocked public
  publish attempt.
- Hebrew/RTL requirements: Hebrew labels for statuses, piece order, composer,
  performer names, venue, durations, print/export actions, and validation states;
  mixed Hebrew/English repertoire titles and names must be bidi-safe.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | own | — | — | — | Refine uniform `concert_programs` member-read. Assigned/performing staff need a policy/RPC/view keyed by linked event participants or `pieces.performerStaffIds`; no public read until **D-23**. |
| Read detail | ✓ | ✓ | own | — | — | — | Same as list/read; detail contains student performer data and private document links. |
| Create | ✓ | ✓ | — | — | — | — | Current admin-write policy is acceptable for authenticated program creation. |
| Edit | ✓ | ✓ | — | — | — | — | Admin-only edits to program metadata, pieces, performer links, and private document attachments. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin-only publish, complete, cancel, and authenticated correction transitions. Public unpublish/redaction is **BLOCKED ON D-23**. |
| Status transition (payroll/finance-affecting) | — | — | — | — | — | — | No direct payroll/finance transition in this module. |
| Archive/delete | ✓ | ✓ | — | — | — | — | No hard delete after publication/completion/documents; cancel/retain history. |
| Export | ✓ | ✓ | — | — | — | — | Admin-only authenticated export because rows contain student performer data. Public export/download is **BLOCKED ON D-23**. |
| Public submit/sign | — | — | — | — | — | — | No public write/sign path. Public read/embed/download exposure is **BLOCKED ON D-23** and must use D-14 plus consent/release setup if accepted. |

Required RLS refinements/tests:
- Narrow `concert_programs` from uniform org-member read to admin plus explicit
  assigned/performing staff read scope, or expose the app path through a scoped
  security-definer RPC/view while blocking direct broad table enumeration.
- Verify teachers can read only programs where they are linked by event
  participation or performer staff ID, and cannot see unrelated student performer
  lists.
- Restrict any generated program document storage reads to the same module scope;
  the current `documents` bucket org-member read is too broad for private concert
  PDFs that contain student names.
- Verify no anon/public access exists for programs, performer lists, or files
  unless D-23 later defines a compliant public exposure model.

## Acceptance Criteria
- Unit: existing coverage for `listConcertPrograms`, `getProgramRunOfShow`, and
  `listPerformerEvents`; add cases for `DRAFT`/`CANCELLED` ordering, unlinked
  programs, duplicate piece order validation, unknown duration causing null
  cumulative duration after that point, student vs staff performer lookups, and
  stale performer IDs.
- Supabase mapping: normalized camel<->snake mapping for `concertPrograms`;
  `pieces jsonb` preservation; HYBRID event/student/staff reads remain wrapped
  through existing sync and D-04/D-05 adapter/projection seams.
- RLS/security: real-role tests for admin full access, assigned/performing teacher
  own-program read, teacher-other denied, plain member denied, finance denied,
  cross-org isolation, private storage scope, and no anon access.
- Playwright smoke: admin opens a Calendar event -> creates a concert program ->
  adds two pieces with student and staff performers -> publishes authenticated
  program -> run-of-show order and cumulative duration render -> linked teacher
  sees own program -> unrelated teacher cannot see it. Public website/PDF smoke is
  **BLOCKED ON D-23**.
- Hebrew/RTL: program list/detail, piece editor, run-of-show, validation, and
  authenticated print/export flow.
- Mobile viewport: teacher/performer read-only run-of-show from Calendar at
  390x844; admin planning can remain desktop-first.
- Data migration/backfill: D-15 ACCEPTED -- packet-local only. Existing/demo
  `concert_programs` rows become the initial planning set. Backfill validates
  linked event IDs, stale student/staff performer IDs, invalid statuses, duplicate
  piece order, and storage paths. Do not create a global Student/Event migration
  or duplicate event schedule data inside the program row.

## Dependencies
- Blocks: reports-analytics for event/program reporting, calendar-website-
  integrations if D-23 accepts public exposure, exams-certificates-report-cards
  only if concerts become assessment events, and student-family-files/staff
  profiles for performer history links.
- Blocked by: calendar-schedule-engine native event spine, student-family-files
  for first-class student links, staff-teacher-management for staff identities,
  activity-program-tree and ensembles-theory-school-programs for roster/activity
  context, real-role RLS/storage refinements during implementation, and **BLOCKED
  ON D-23** for public/website/published performer exposure. D-01/D-04/D-05/D-14/
  D-15 are accepted prerequisites, not open blockers.
