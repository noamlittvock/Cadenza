# Public Registration Intake  (`public-registration-intake`)

Status: gap → planned (this packet)  ·  Priority: p0
Owner-decisions blocking this packet: **D-07** (public write path), **D-14**
(PublicEndpoint registry), **D-03** (family), **D-04** (canonical student),
**D-15** (backfill). All OPEN — this packet cannot ship UI until D-07 + D-14 land.

## Current State (ground truth)
- Existing UI: none (no public form, no review queue). Admin Inbox exists and is the natural review home.
- Existing schema: `registration_intake` (normalized, `0002`). RLS uniform: member-read / admin-write. **No anon/public insert path exists.**
- Existing query helpers (`utils/blueprintQueries.ts`, all implemented + unit-tested): `listPendingIntake` (PENDING|IN_REVIEW, sorted by submittedAt), `suggestStudentDuplicates` (name-similarity score 0–1 via `nameSimilarity`), `approveIntakeRecord(intake, {studentId, now, reviewedBy})` — **pure; mutates intake → CONVERTED and emits a Student payload only** (no family/enrollment/agreement today).
- Existing tests: `utils/blueprintQueries.test.ts` covers all three helpers. **Missing:** public-submit path, RLS, and full-graph conversion tests.
- Feature-tree declared queries: `listPendingIntake`, `suggestStudentDuplicates`, `approveIntakeRecord` — all implemented.

## Users And Permissions
- Actors: guardian/public applicant (unauthenticated), admin (reviewer), super_admin.
- Read: admins read the intake queue (org-scoped). Applicants read nothing.
- Write: applicant **submits** one intake row via a controlled path (D-07); admins review/approve/reject/convert.
- Public/token access: required — must NOT be a broad anon INSERT on org tables. **Consent rule:** the public form requires an explicit consent/setup flow; the intake row stores consent capture.

## Workflows
- List/search/filter: admin queue of pending intake — by status, date, activity, duplicate-score.
- Create: public form submit → quarantined `registration_intake` row (status `PENDING`).
- Detail: review screen — applicant/guardian/activity/consent fields + duplicate suggestions.
- Edit: admin can correct fields pre-conversion.
- Status transitions (actual enum): `PENDING → IN_REVIEW → {APPROVED | REJECTED | DUPLICATE}`; APPROVED → `CONVERTED` on `approveIntakeRecord`.
- Archive/delete: rejected/duplicate rows retained for audit, not hard-deleted.
- Import/export: export queue to spreadsheet (admin).
- Cross-links: APPROVED → student (+ family + enrollment + agreement requests per D-03/conversion decision); writes an Admin Inbox history item.

## Data Contract
- Primary record: `RegistrationIntake` (`types/blueprint.ts`) / `registration_intake`.
- Linked records (on conversion): student, family, enrollment, agreement acceptance request.
- Required fields: applicant name, guardian (if minor), requested activity, consent flags, contact.
- Derived: duplicate score (`suggestStudentDuplicates`).
- Audit: createdBy=public/system, reviewedBy, server timestamps, status-transition log.
- **Conversion semantics (decision needed):** `approveIntakeRecord` today emits a **Student only**. Extend to student + family + enrollment + agreement-request + inbox-history? Default per D-03 = full graph, transactionally. Cite D-03/D-04.
- Open schema decisions: D-14 (token/endpoint table to bind a public form to an org).

## UX Placement (per route-nav-policy)
- Home: review queue in **Admin Inbox** (reuse existing surface) initially; promote to a dedicated Registration view only if volume warrants.
- Public form: **public token route** (tier 4), unauthenticated, no sidebar entry.
- Navigation entry: none new for v1 (Admin Inbox already routed). Mobile: review is desktop-first (Admin Inbox is mobile-hidden) — acceptable; revisit if approvals become mobile.
- Empty/loading/error: empty queue state; submit success/failure on public form; duplicate-warning state.
- Hebrew/RTL: public form must be fully Hebrew/RTL (applicant-facing); review queue RTL.

## Role / RLS Matrix (key cells)
| Operation | admin | guardian/public | refinement |
|---|---|---|---|
| List/read queue | ✓ | — | default member-read (admins) |
| Public submit | — | ✓ via edge/token | ⚠ D-07 — edge fn / scoped token, not anon INSERT |
| Review/approve | ✓ | — | default admin-write |
| Convert (writes student/family/enrollment) | ✓ | — | transactional; RLS on all target tables |
Full RLS refinements roll into Pass 2.

## Acceptance Criteria
- Unit: `listPendingIntake`, `suggestStudentDuplicates`, conversion fn (intake→graph).
- Supabase mapping: `registration_intake` camel↔snake + jsonb (guardians/consent).
- RLS: public submit path tested with **no** auth; admin review with real admin role; verify a non-member cannot read the queue.
- Playwright: submit public form → appears in admin queue → approve → student/family/enrollment links exist → inbox history written.
- Hebrew/RTL: public form + review.
- Data migration: none (new surface); D-15 n/a.

## Dependencies
- Blocks: nothing downstream depends on intake.
- Blocked by: **D-07, D-14** (hard); D-03, D-04 (conversion shape); student-family-files packet (conversion target must exist first).
