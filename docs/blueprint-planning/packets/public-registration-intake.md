# Public Registration Intake  (`public-registration-intake`)

Status: gap → planned (this packet)  ·  Priority: p0
Owner-decisions still blocking this packet: none.
Current accepted prerequisites: **D-03** (family/conversion graph), **D-07**
(controlled public write path with consent), **D-14** (inert PublicEndpoint
registry), **D-04** (canonical student adapter), and **D-15** (backfill, recorded
below), plus **D-16** (P0 guardian/contact data stays in `families.guardians[]`
jsonb). This packet cannot activate a public surface until the D-07 Edge
Function/scoped-token path and explicit consent/setup flow are implemented.

## Current State (ground truth)
- Existing UI: none (no public form, no review queue). Admin Inbox exists and is the natural review home.
- Existing schema: `registration_intake` (normalized, `0002`). RLS uniform: member-read / admin-write. **No anon/public insert path exists.**
- Existing query helpers (`utils/blueprintQueries.ts`, all implemented + unit-tested): `listPendingIntake` (PENDING|IN_REVIEW, sorted by submittedAt), `suggestStudentDuplicates` (name-similarity score 0–1 via `nameSimilarity`), `approveIntakeRecord(intake, {studentId, now, reviewedBy})` — **pure; mutates intake → CONVERTED and emits a Student payload only** (no family/enrollment/agreement today).
- Existing tests: `utils/blueprintQueries.test.ts` covers all three helpers. **Missing:** public-submit path, RLS, and full-graph conversion tests.
- Feature-tree declared queries: `listPendingIntake`, `suggestStudentDuplicates`, `approveIntakeRecord` — all implemented.

## Users And Permissions
- Actors: guardian/public applicant (unauthenticated), admin (reviewer), super_admin.
- Read: admins read the intake queue (org-scoped). Applicants read nothing.
- Write: applicant **submits** one intake row via the accepted D-07 controlled path; admins review/approve/reject/convert.
- Public/token access: required — must NOT be a broad anon INSERT on org tables. **Consent rule:** the public form requires an explicit consent/setup flow; the intake row stores consent capture.

## Workflows
- List/search/filter: admin queue of pending intake — by status, date, activity, duplicate-score.
- Create: public form submit → quarantined `registration_intake` row (status `PENDING`).
- Detail: review screen — applicant/guardian/activity/consent fields + duplicate suggestions.
- Edit: admin can correct fields pre-conversion.
- Status transitions (actual enum): `PENDING → IN_REVIEW → {APPROVED | REJECTED | DUPLICATE}`; APPROVED → `CONVERTED` on `approveIntakeRecord`.
- Archive/delete: rejected/duplicate rows retained for audit, not hard-deleted.
- Import/export: export queue to spreadsheet (admin).
- Cross-links: APPROVED → student + editable family + enrollment + agreement requests per accepted D-03 conversion graph; writes an Admin Inbox history item.

## Data Contract
- Primary record: `RegistrationIntake` (`types/blueprint.ts`) / `registration_intake`.
- Linked records (on conversion): student, family, enrollment, agreement acceptance request.
- Required fields: applicant name, guardian (if minor), requested activity, consent flags, contact.
- Derived: duplicate score (`suggestStudentDuplicates`).
- Audit: createdBy=public/system, reviewedBy, server timestamps, status-transition log.
- **Conversion semantics:** D-03/D-04 ACCEPTED — `approveIntakeRecord` today emits
  a **MinimalStudent only**; extend it to emit/persist the full approval graph:
  canonical student write-model via the D-04 adapter boundary, editable `Family`,
  enrollment, agreement request, converted intake lineage, and Admin Inbox history
  in one admin-approved transaction. Guardian/contact data follows the accepted
  D-16 `families.guardians[]` jsonb schema; normalized guardian identity is not
  part of the P0 conversion graph. This does not activate public submit; the
  accepted D-07 controlled write/consent path must be implemented separately.
- Open schema decisions: none for public write path; D-07 is accepted and defines the required Edge Function/scoped-token shape.

## UX Placement (per route-nav-policy)
- Home: review queue in **Admin Inbox** (reuse existing surface) initially; promote to a dedicated Registration view only if volume warrants.
- Public form: **public token route** (tier 4), unauthenticated, no sidebar entry.
- Navigation entry: none new for v1 (Admin Inbox already routed). Mobile: review is desktop-first (Admin Inbox is mobile-hidden) — acceptable; revisit if approvals become mobile.
- Empty/loading/error: empty queue state; submit success/failure on public form; duplicate-warning state.
- Hebrew/RTL: public form must be fully Hebrew/RTL (applicant-facing); review queue RTL.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | — | — | — | — | `registration_intake` currently inherits member-read; refine to admin-only queue before launch because rows contain applicant/guardian personal data. |
| Read detail | ✓ | ✓ | — | — | — | — | Same admin-only refinement; applicants do not get direct row readback. |
| Create | ✓ | ✓ | — | — | — | ✓ | Admin may create manual intake through admin-write; public submit must use D-07 Edge Function/scoped token into quarantined intake. |
| Edit | ✓ | ✓ | — | — | — | — | Admin write; public applicants cannot edit stored rows directly after submit. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin controls `PENDING -> IN_REVIEW -> APPROVED/REJECTED/DUPLICATE -> CONVERTED`. |
| Status transition (payroll/finance-affecting) | — | — | — | — | — | — | None in intake; financial effects happen only after conversion into downstream records. |
| Archive/delete | ✓ | ✓ | — | — | — | — | Retain rejected/duplicate rows for audit; no public delete. |
| Export | ✓ | ✓ | — | — | — | — | Admin-only export of the review queue. |
| Public submit/sign | — | — | — | — | — | ✓ | D-07/D-14: controlled Edge Function/scoped token, explicit consent/setup, no broad anon INSERT. |

Required RLS refinements/tests:
- Narrow `registration_intake` read access from uniform member-read to admin-only before any public form ships.
- Test the public submit path with no authenticated user and verify it cannot write any live org table directly.

## Acceptance Criteria
- Unit: `listPendingIntake`, `suggestStudentDuplicates`, conversion fn (intake→graph).
- Supabase mapping: `registration_intake` camel↔snake + jsonb (guardians/consent).
- RLS: public submit path tested with **no** auth; admin review with real admin
  role; verify non-admin members and non-members cannot read the queue.
- Playwright: submit public form → appears in admin queue → approve → student/family/enrollment links exist → inbox history written.
- Hebrew/RTL: public form + review.
- Data migration: D-15 ACCEPTED — no existing/demo intake backfill for v1; this is
  a new quarantined surface. Before launch, verify there is no legacy intake data
  to import, then create rows only through the controlled D-07 path.

## Dependencies
- Blocks: nothing downstream depends on intake.
- Blocked by: student-family-files implementation (conversion target must exist
  first). Public launch also requires building the accepted D-07 consent-gated
  Edge Function/scoped-token write path in this packet.
