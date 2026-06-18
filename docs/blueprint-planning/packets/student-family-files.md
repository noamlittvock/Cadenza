# Student And Family Files  (`student-family-files`)

Status: tree says `gap`; per status-policy this is **`embedded`** (students live inside
calendar filters / inventory checkout / admin-inbox mini-views) → target `implemented`.
Status drift logged as **D-STATUS-2**.  ·  Priority: p0
Owner-decisions blocking this packet: **D-04** (canonical Student type), **D-03**
(Family first-class), **D-15** (backfill). This is the keystone P0 — many modules
link to students; resolve D-04/D-03 first.

## Current State (ground truth)
- Existing UI: no authoritative student/family product page. Students are *used* by calendar filters, bot context, inventory checkout, and Admin Inbox mini-views — but there is no first-class detail surface.
- Existing schema: `students` (core hybrid `{id,org_id,data jsonb}`, `0001`). **`families` is already a normalized table** (`0002`) with real fields: `name, guardians[] (jsonb), studentIds[], primaryContactGuardianId, billingNotes, isArchived`. So D-03's "first-class table" is schema-true already; the open question is whether to **productize it as editable**.
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
- List/search/filter: students by name, guardian (`listStudentsByGuardian`), activity, status. Family list too if D-03 = first-class.
- Create: student; family (if first-class) with guardians + linked students (siblings).
- Detail tabs: profile · guardians · enrollments · lessons (history) · finance (balance, gated) · documents · agreements · history. (Report's tab list.)
- Edit: profile, guardians, family membership.
- Status transitions: `profileStatus` lifecycle (active/inactive/archived). Enumerate exact states [data audit].
- Archive/delete: soft-archive; linked-record (lessons/finance) visibility preserved, not orphaned.
- Import/export: student/family mapping (extends existing import/export).
- Cross-links: opens into lessons (attendance), finance (charges/balance), agreements, inventory loans.

## Data Contract
- Primary record: canonical Student (D-04) + `Family` (D-03).
- Linked: guardians (jsonb today — promote to join table? Pass 2), enrollments, lesson_records, charges/payments (family-led per D-07-FIN), documents (storage `documents` bucket), agreement_acceptances.
- Required: name, profileStatus, guardians (minor handling), createdAt/updatedAt.
- Derived: open balance (from finance), unmarked-lesson count.
- Audit: createdBy/updatedBy, server timestamps.
- Open schema decisions: D-04 (which Student), D-03 (Family as table vs overlay), guardian model (identity, minor vs adult, jsonb vs join table → Pass 2).

## UX Placement (per route-nav-policy)
- Home: **top-level `STUDENTS` view** (tier 1, per D-01 default) — currently a dead-end ViewState; this packet is what un-dead-ends it.
- Navigation entry: sidebar (add) + command palette (unhide STUDENTS when routed).
- Mobile: read-oriented student lookup is plausibly mobile — declare mobile reachability for the list + profile read (do not inherit Manage's mobile hide).
- Empty/loading/error: empty roster, search-no-match, load skeleton.
- Hebrew/RTL: names bidi-safe; tabs RTL; date fields Hebrew calendar aware.

## Role / RLS Matrix (key cells)
| Operation | admin | teacher (own) | finance | member |
|---|---|---|---|---|
| List/read profile | ✓ | own roster | ✓ | ✓ |
| Read finance tab | ✓ | — | ✓ | ⚠ D-08 gate |
| Create/edit student | ✓ | — | — | — |
| Archive | ✓ | — | — | — |
Refinements: teacher-own-roster scoping (D-06-adjacent), finance-tab gate (D-08).

## Acceptance Criteria
- Unit: `listStudentsByGuardian` + any family/guardian helpers; canonical-type adapter if D-04 chooses adapter.
- Supabase mapping: `families` camel↔snake + jsonb (guardians, student links); `students` hybrid wrap/unwrap.
- RLS: real-role read/write; verify member cannot edit; verify finance-tab gate.
- Playwright: create student + family → link guardian → add enrollment → search by guardian → open lesson/finance tabs.
- Hebrew/RTL: list + detail tabs.
- Mobile: list + profile read at 390x844.
- Data migration: existing demo students → canonical shape (D-15); family backfill if D-03 = first-class.

## Dependencies
- Blocks: public-registration-intake (conversion target), lesson-details-attendance (student links), payments-charges (family ledger), agreements.
- Blocked by: **D-04, D-03** (hard); D-08 (finance tab).
