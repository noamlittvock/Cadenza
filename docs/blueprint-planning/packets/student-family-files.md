# Student And Family Files  (`student-family-files`)

Status: `embedded` (per `features/forteTree.ts` + **D-STATUS-2**) → target
`implemented`.  ·  Priority: p0
Owner-decisions still blocking this packet: none.
Current accepted prerequisites: **D-03** (Family first-class editable), **D-04**
(canonical student adapter), **D-15** (backfill, recorded below), and **D-16**
(P0 guardian/contact data stays in `families.guardians[]` jsonb). This is the
keystone P0 — many modules link to students; build against editable `Family` as
source-of-truth.

## Current State (ground truth)
- Existing UI: no authoritative student/family product page. Students are *used* by calendar filters, bot context, inventory checkout, and Admin Inbox mini-views — but there is no first-class detail surface.
- Existing schema: `students` (core hybrid `{id,org_id,data jsonb}`, `0001`). **`families` is already a normalized table** (`0002`) with real fields: `name, guardians[] (jsonb), studentIds[], primaryContactGuardianId, billingNotes, isArchived`. D-03 is accepted: productize `Family` as an editable source-of-truth record, not a read-only grouping overlay.
- Type duplication: `Student` (`types.ts:256`, legacy hybrid) vs `StudentV2` (`types/v2.ts:209`, uses `AppTimestamp`; Blueprint uses ISO strings). **Note:** the query layer is already decoupled via a `MinimalStudent` shape `{id, fullName, familyId?, isArchived?}`, so D-04 mostly affects the **UI write-model**, not the helpers.
- Existing query helpers (implemented + tested): `listStudentsByGuardian` (phone/email/name match across families), `findStudentByName`, `listStudentEnrollments`.
- Existing tests: `utils/blueprintQueries.test.ts` covers the above. No student/family **workflow/UI** tests.
- Feature-tree declared queries: `listStudentsByGuardian` — implemented.

## Users And Permissions
- Actors: admin, super_admin, member (read), finance (balance tab — D-08), teacher (limited read of own students — D-06).
- Read: org members read students; **finance tab gated** (D-08). Teachers see their roster.
- Write: admin/super_admin create/edit students + families.
- Public/token: none directly (registration converts into here).

## Workflows
- List/search/filter: students by name, guardian (`listStudentsByGuardian`), activity, status. Family list/search is part of the first-class D-03 surface.
- Create: student; family with guardians + linked students (siblings).
- Detail tabs: profile · guardians · enrollments · lessons (history) · finance (balance, gated) · documents · agreements · history. (Report's tab list.)
- Edit: profile, guardians, family membership.
- Status transitions: `profileStatus` lifecycle (active/inactive/archived). Enumerate exact states [data audit].
- Archive/delete: soft-archive; linked-record (lessons/finance) visibility preserved, not orphaned.
- Import/export: student/family mapping (extends existing import/export).
- Cross-links: opens into lessons (attendance), finance (charges/balance), agreements, inventory loans.

## Data Contract
- Primary record: canonical Student (D-04) + editable `Family` (D-03 ACCEPTED).
- Linked: guardians (`families.guardians[]` jsonb per accepted D-16),
  enrollments, lesson_records, charges/payments (family-led per accepted
  D-07-FIN), documents (storage `documents` bucket), agreement_acceptances.
- Required: name, profileStatus, guardians (minor handling), createdAt/updatedAt.
- Derived: open balance (from finance), unmarked-lesson count.
- Audit: createdBy/updatedBy, server timestamps.
- **Conversion semantics:** D-03/D-04/D-15 ACCEPTED — module create/edit uses the
  canonical `StudentV2` write-model at the UI boundary and the single
  `utils/canonicalAdapters.ts` seam for legacy HYBRID student docs. Family writes
  are first-class normalized `families` rows; student↔family linking preserves
  existing `families.studentIds` and derives `MinimalStudent.familyId` for query
  helpers. Reverse adapters are read-only for legacy UI and must not become a
  second persistence model.
- Schema decisions / parked items: none for the P0 guardian model. D-16 accepts
  the current `families.guardians[]` jsonb contract; normalized guardian/contact
  identity is deferred beyond this build unless Noam reopens it.

## UX Placement (per route-nav-policy)
- Home: **top-level `STUDENTS` view** (tier 1, per D-01 default) — currently a dead-end ViewState; this packet is what un-dead-ends it.
- Navigation entry: sidebar (add) + command palette (unhide STUDENTS when routed).
- Mobile: read-oriented student lookup is plausibly mobile — declare mobile reachability for the list + profile read (do not inherit Manage's mobile hide).
- Empty/loading/error: empty roster, search-no-match, load skeleton.
- Hebrew/RTL: names bidi-safe; tabs RTL; date fields Hebrew calendar aware.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | own | — | ✓ | — | `students`/`families` currently inherit member-read; teacher roster scoping needs a student/family read-policy or query-layer scope tied to assignments/enrollments. |
| Read detail | ✓ | ✓ | own | — | ✓ | — | Same as list/read; finance ledger data must come only from D-08-gated ledger tables. |
| Create | ✓ | ✓ | — | — | — | — | Admin write on `students` hybrid rows and normalized `families` (`app_is_org_admin`). |
| Edit | ✓ | ✓ | — | — | — | — | Admin write; guardian/family edits from public intake are conversion outputs, not direct public writes. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin controls active/inactive/archive profile state; soft archive preserves linked records. |
| Status transition (payroll/finance-affecting) | — | — | — | — | — | — | Not performed on the student/family record; ledger and payroll transitions live in their packets. |
| Archive/delete | ✓ | ✓ | — | — | — | — | Soft archive only; no hard delete while lessons/finance/history exist. |
| Export | ✓ | ✓ | — | — | — | — | Admin-only student/family export; finance exports belong to the ledger packet. |
| Public submit/sign | — | — | — | — | — | — | No direct public writes; registration routes through D-07 intake conversion. |

Required RLS refinements/tests:
- Teacher student lookup must be proven as own-roster scoped before implementation.
- Finance tab access is enforced by the D-08 ledger policies, not by exposing ledger rows through the student detail query.

## Acceptance Criteria
- Unit: `listStudentsByGuardian` + any family/guardian helpers; canonical-type adapter boundary coverage.
- Supabase mapping: `families` camel↔snake + jsonb (guardians, student links); `students` hybrid wrap/unwrap.
- RLS: real-role read/write; verify teacher own-roster read scope, member cannot
  edit, and finance-tab gate.
- Playwright: create student + family → link guardian → add enrollment → search by guardian → open lesson/finance tabs.
- Hebrew/RTL: list + detail tabs.
- Mobile: list + profile read at 390x844.
- Data migration: D-15 ACCEPTED — no global `Student` → `StudentV2` persistence
  rewrite. Existing HYBRID student docs stay in place and pass through
  `studentToV2`/reverse adapters at module boundaries; packet-local family
  linking/backfill creates or links editable `Family` records where missing,
  preserves existing `families.studentIds`, keeps guardian/contact data in
  `families.guardians[]` jsonb per D-16, and exposes family membership through
  the canonical query projections. No normalized guardian/contact backfill ships
  in this P0 slice.

## Dependencies
- Blocks: public-registration-intake (conversion target), lesson-details-attendance (student links), payments-charges (family ledger), agreements.
- Blocked by: teacher-own-roster RLS refinement/test implementation and
  finance-tab enforcement during module build; no unresolved D-03/D-04 owner
  decision remains.
