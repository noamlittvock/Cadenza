# Agreements And Consent  (`agreements-consent`)

Status: `implemented` for bird's-eye product shape as of 2026-06-19.
Live Supabase RLS/migration verification remains a release-hardening gate; do
not claim production security until agreement live RLS tests pass without skips.
Priority: p1
Provisional policy areas still requiring production review: **D-22** for
assessment/report-card guardian delivery release, **D-23** for public
performance or media-release disclosure rules, **D-24** for consent
withdrawal/revocation downstream effects, and **D-25** for instrument-loan
deposit/refund terms. Core authenticated template management, agreement request
tracking, typed e-signature, and PDF upload capture are built.
Current accepted prerequisites: **D-03** (editable Family), **D-04** (canonical
student adapter), **D-07** (controlled public/token write path with explicit
consent/setup), **D-11** (typed signature plus PDF upload), **D-14** (inert
public endpoint registry), **D-15** (packet-local backfill), and **D-16** (P0
guardian/contact data stays in `families.guardians[]` jsonb).

## Current State (ground truth)
- Existing UI: the Manage `agreements` tab provides list/search/filter,
  create/version/activate/deactivate, pending request issuance, request history,
  unsigned queue, empty/loading/error states, EN/HE labels, and RTL-safe template
  bodies. Student/family detail shows contextual agreement history and unsigned
  status from synced templates and acceptances using `families.guardians[]`
  guardian data. `/agreement/:token` provides the mobile public signing surface
  for typed accept/decline, and the admin surface captures private countersigned
  PDF references in `signatureRef`.
- Existing schema: `agreement_templates` and `agreement_acceptances` are
  normalized Blueprint tables from `0002`. Templates store `kind`, `title`,
  monotonic `version`, `body`, `is_active`, `supersedes_version`, and
  `requires_guardian`. Acceptances store template/version, optional student,
  family, enrollment, and guardian IDs, status
  `PENDING|ACCEPTED|DECLINED|EXPIRED|SUPERSEDED`, `accepted_at`,
  `accepted_by_name`, and `signature_ref`. `public_endpoints` from `0004`
  includes `kind = AGREEMENT_ACCEPTANCE`, but remains inert/admin-only with no
  anon policy.
- Existing RLS: local/static migrations `0008_agreement_direct_table_rls.sql`,
  `0009_agreement_acceptance_public_submit.sql`,
  `0010_agreement_private_pdf_storage_rls.sql`, and
  `0011_agreement_acceptance_public_read.sql` narrow agreement table/storage
  access and add scoped D-07/D-14 public RPC paths. The remote project has not
  applied those migrations yet, so live real-role agreement RLS remains open in
  `RELEASE_HARDENING_GATES.md`.
- Existing query/helpers: `listUnsignedAgreements`, `getAgreementHistory`, and
  `findAgreementByEnrollment` in `utils/blueprintQueries.ts`.
- Existing tests: helper/mapping tests cover unsigned agreement selection,
  history sorting, enrollment lookup, family/enrollment/guardian targets,
  inactive/declined/expired/superseded rows, and normalized Supabase mappings for
  templates, acceptances, and public endpoints. Static schema tests cover
  agreement table/storage restrictions and public token RPC shape; env-gated live
  tests are present but currently skip until remote migrations `0008`-`0011` are
  applied. Component and Playwright smokes cover admin template/request
  management, mobile typed signing, accepted history, unsigned-helper clearing,
  and private PDF reference capture.
- Feature-tree declared queries: `listUnsignedAgreements`,
  `getAgreementHistory`, `findAgreementByEnrollment` -- implemented.
- Feature-tree drift to resolve during implementation: `agentReadable.auditFields`
  names `sentAt` and `revokedAt`, but the current table/type do not include those
  fields. Sent/requested timestamps can be represented by `createdAt` in v1;
  revocation/withdrawal is **BLOCKED ON D-24**.

## Users And Permissions
- Actors: admin, super_admin, guardian/public signer through a scoped token,
  student/family as linked records, and finance or teachers only through future
  explicitly scoped read surfaces if accepted.
- Read access: admins read all templates, requests, acceptances, and uploaded
  signature artifacts. Guardian/public signers read only the exact template and
  target summary behind a D-07/D-14 scoped token. General members, teachers, and
  finance users do not get module-level agreement access in v1.
- Write access: admins create/version templates, issue acceptance requests,
  manually record typed acceptances, upload countersigned PDFs, expire pending
  requests, and supersede old acceptances when a template version changes.
  Guardian/public signers can accept or decline only through the controlled
  token/Edge path.
- Public/token access: required for agreement signing, but only through D-07's
  Edge Function/scoped-token path and D-14 `public_endpoints`. There is no broad
  anon table read/write path.
- See embedded role matrix below.

## Workflows
- List/search/filter: admin list of active/inactive templates by kind, title,
  version, guardian-required flag, and missing-signature count; unsigned queue
  from `listUnsignedAgreements`; student/enrollment history from
  `getAgreementHistory` and `findAgreementByEnrollment`.
- Create: admin creates an `AgreementTemplate` draft/version, activates it, and
  creates `AgreementAcceptance` requests for a student, family, enrollment,
  instrument loan, or intake conversion target. Public/token creation of an
  acceptance request is not allowed.
- Detail: template detail shows version body, superseded lineage, active state,
  required signer type, linked acceptances, and affected students/enrollments.
  Acceptance detail shows signer, linked student/family/enrollment, status,
  accepted timestamp, typed name or private PDF reference, and audit trail.
- Edit: editing an active template with existing acceptances creates a new
  version instead of mutating the accepted text. Admin may correct pending request
  metadata before signing. Accepted rows are immutable except explicit status
  correction to `SUPERSEDED`/`EXPIRED`; withdrawal/revocation is **BLOCKED ON
  D-24**.
- Status transitions: `PENDING -> ACCEPTED`; `PENDING -> DECLINED`;
  `PENDING -> EXPIRED`; `ACCEPTED -> SUPERSEDED` when a newer active version
  replaces the accepted template. Any `ACCEPTED -> REVOKED/WITHDRAWN` path,
  downstream effect, or `revokedAt` audit field is **BLOCKED ON D-24**.
- Archive/delete: templates are deactivated/versioned, not hard-deleted, once any
  request or acceptance exists. Acceptance rows and uploaded signature artifacts
  are retained for audit; corrections create a new row or explicit status change,
  not a destructive edit.
- Import/export: admin import of legacy signed PDFs or template text; admin export
  of template/request status. Finance statement/agreement exports use the
  accepted D-20 org/family single-currency policy in P0; future explicit
  multi-currency agreement terms require a separate configured mode.
- Cross-links: Student/family detail agreements tab, Enrollment detail, public
  registration conversion, finance/payment terms, instrument loans (deposit/refund
  terms are **BLOCKED ON D-25**), report-card or certificate delivery (**BLOCKED
  ON D-22** for guardian-facing delivery consent language), concert or media
  release workflows (**BLOCKED ON D-23** for public performer/program exposure),
  and reports-analytics.

## Data Contract
- Primary records: `AgreementTemplate` and `AgreementAcceptance`
  (`types/blueprint.ts`) in normalized Supabase tables `agreement_templates` and
  `agreement_acceptances`.
- Linked records: `StudentV2`/HYBRID student rows through the D-04
  adapter/projection seam, `Family` rows, current `families.guardians[]` jsonb
  guardian entries, `EnrollmentV2`, optional `InstrumentLoan`, optional private
  `DocumentEntry`/`documents` storage object for PDF uploads, and
  `PublicEndpoint` rows for scoped signing links.
- Required fields: template `kind`, `title`, `version`, `body`, `isActive`, and
  `requiresGuardian`; acceptance `templateId`, `templateVersion`, `status`, and
  at least one target among student, family, enrollment, or downstream record
  lineage. `acceptedByName` is required for typed e-signature; `signatureRef` is
  required for uploaded PDFs or internal typed-signature evidence.
- Derived/computed fields: unsigned queue, superseded-version reason, current
  required template set per student/enrollment, agreement history, and
  enrollment-specific agreement lookup are computed from templates and
  acceptances, not persisted as duplicate aggregates.
- Audit fields: normalized table `createdAt`, `updatedAt`, `createdBy`,
  `updatedBy`; `acceptedAt` and `acceptedByName` on accepted rows. Implementation
  should make acceptance timestamps and any future expiration/supersession
  timestamps server-owned. `revokedAt` and consent-withdrawal side effects are
  **BLOCKED ON D-24**.
- **Conversion semantics:** D-11 ACCEPTED -- agreement capture supports both
  typed e-signature and PDF upload. Typed signing writes or updates one
  `agreement_acceptances` row to `ACCEPTED`, sets `acceptedAt`, stores the typed
  signer name in `acceptedByName`, and stores internal evidence in
  `signatureRef` without depending on an external e-sign vendor. PDF upload
  stores a private document path/reference in `signatureRef` and, where the
  owning student/family document surface exists, links the file as a
  `DocumentEntry`. Public/token signing inherits D-07/D-14: the Edge
  Function/scoped-token path validates `public_endpoints`, writes only the target
  acceptance row, and never grants broad anon access to org tables.
- Open schema decisions: financial agreement output uses the accepted D-20 P0
  single-currency org/family ledger policy; assessment/report-card guardian
  delivery consent language is **BLOCKED ON D-22**; media release and public
  performer/program disclosure language is **BLOCKED ON D-23**; withdrawal/
  revocation status, audit fields, and downstream effects are **BLOCKED ON
  D-24**; instrument-loan deposit/refund terms are **BLOCKED ON D-25**.

## UX Placement (obey route-nav-policy.md)
- Home: **Manage tab / agreement templates** for template administration, plus
  contextual Student/family and Enrollment agreement tabs for request/history
  review. Public signing lives on a **public token route**.
- Navigation entry: no new sidebar or command-palette destination in v1. The
  Hebrew `agreements` navigation signal is satisfied by the Manage/contextual
  surfaces until a future route-policy amendment creates a higher-frequency
  destination.
- Mobile visibility: admin template management is desktop-first. Guardian/public
  signing is mobile-primary and must work at 390x844; student/family agreement
  history should remain readable on mobile through the Student detail surface.
- Empty / loading / error states: no templates, no active version, no unsigned
  agreements, stale student/family/enrollment target, expired/revoked token,
  already-signed token, declined request, storage upload failure, signature save
  failure, and actions marked **BLOCKED ON D-22**, **BLOCKED ON D-23**,
  **BLOCKED ON D-24**, or **BLOCKED ON D-25**.
- Hebrew/RTL requirements: template bodies, signature forms, signer names,
  status labels, version history, mixed Hebrew/English policy titles, and PDF
  upload labels must be RTL-safe. Signature evidence values and file paths should
  be LTR-isolated inside RTL rows.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | — | — | — | — | Refine `agreement_templates` and `agreement_acceptances` from uniform member-read to admin-only for module lists; expose public target reads only through D-07/D-14 token handler. |
| Read detail | ✓ | ✓ | — | — | — | ✓ | Admin full detail. Guardian/public may read only the exact token target template/body and target summary through Edge Function/scoped token; no table SELECT. |
| Create | ✓ | ✓ | — | — | — | — | Admin creates templates, versions, and pending acceptance requests under admin-write policy. Public request creation is denied. |
| Edit | ✓ | ✓ | — | — | — | — | Admin edits pending requests and creates new template versions; accepted text is immutable. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin expires/supersedes/corrects requests. Public accept/decline is represented only in the `Public submit/sign` path below. |
| Status transition (payroll/finance-affecting) | — | — | — | — | — | — | No direct payroll/ledger mutation. Financial agreement or statement terms use accepted D-20 single-currency org/family ledger policy. |
| Archive/delete | ✓ | ✓ | — | — | — | — | Deactivate/version templates and retain acceptance rows; consent revocation/withdrawal behavior is **BLOCKED ON D-24**. |
| Export | ✓ | ✓ | — | — | — | — | Admin-only agreement status/template/PDF export; finance-specific statement output uses accepted D-20 single-currency semantics. |
| Public submit/sign | — | — | — | — | — | ✓ | D-07/D-14: controlled Edge Function/scoped token validates `public_endpoints`, explicit consent/setup, and writes only the target acceptance; no broad anon INSERT/UPDATE. |

Required RLS refinements/tests:
- Narrow `agreement_templates` and especially `agreement_acceptances` from uniform
  org-member read to admin-only or an explicit scoped view/RPC before launch.
- Add the D-07/D-14 agreement-signing token path with no direct anon table
  policy. Tests must prove anon users cannot read or write the agreement tables
  directly.
- Scope private uploaded PDF/signature storage to admin plus the exact public
  token target. The current org-member-readable `documents` bucket is too broad
  for signed agreements.
- If finance, teacher, or student/family authenticated read surfaces are later
  added, each needs an explicit RLS rule or security-definer path; do not inherit
  broad member-read.

## Acceptance Criteria
- Unit: existing helper coverage for `listUnsignedAgreements`,
  `getAgreementHistory`, and `findAgreementByEnrollment`; add cases for multiple
  active template kinds, family/enrollment targets, `requiresGuardian`,
  `DECLINED`, `EXPIRED`, `SUPERSEDED`, inactive templates, and stable sorting.
- Supabase mapping: normalized camel<->snake mapping for `agreementTemplates`,
  `agreementAcceptances`, and `publicEndpoints`; `signatureRef` and private PDF
  document paths preserved without leaking raw public tokens.
- RLS/security: real-role tests for admin full access, plain member denied,
  teacher denied, finance denied unless explicitly added later, cross-org
  isolation, no anon direct table/storage access, valid token can read/sign only
  its target, expired/revoked token denied, and token reuse after accepted state
  denied or idempotent by explicit implementation rule.
- Playwright smoke: admin creates enrollment agreement template -> issues request
  for a student/enrollment -> guardian opens token link on mobile -> typed-signs
  -> admin sees accepted history -> helper removes the student from unsigned
  list. Separate smoke: admin uploads a countersigned PDF and the acceptance
  history shows the private file reference. Revocation smoke is **BLOCKED ON
  D-24**.
- Hebrew/RTL: template editor, unsigned queue, signature page, status history,
  and PDF upload flow.
- Mobile viewport: guardian/public signing at 390x844; student/family agreement
  history read at 390x844.
- Data migration/backfill: D-15 ACCEPTED -- packet-local only. Seed active
  templates from current org policy/payment/instrument-loan text if available;
  import legacy signed PDFs or known accepted forms as `AgreementAcceptance`
  history with private `signatureRef` paths and linked student/family/enrollment
  IDs where deterministic. Do not create a global Student migration. Guardian/
  contact data uses `families.guardians[]` jsonb per D-16; no normalized
  guardian identity backfill ships in this packet. Consent withdrawal/revocation
  history is **BLOCKED ON D-24**.

## Dependencies
- Blocks: public-registration-intake agreement-request conversion, payments-charges
  for enrollment/payment-term confirmation, instrument-inventory loan agreements
  and any later instrument-loan deposit/refund terms (**BLOCKED ON D-25**),
  year-rollover-setup for copied next-year agreement requests, reports-analytics
  for unsigned/expired consent reporting, calendar-website-integrations only if
  public consent links are exposed there, exams-certificates-report-cards
  (**BLOCKED ON D-22** for guardian-facing delivery), and
  concert-programs-events (**BLOCKED ON D-23** for media/public-performance
  releases).
- Blocked by: student-family-files for first-class student/family agreement tabs,
  public-registration-intake for intake-created agreement requests, payments-
  charges for finance-linked terms, real-role RLS/storage refinements during
  implementation, and the accepted D-07/D-14 token handler build. Specific
  unresolved sections remain **BLOCKED ON D-22**, **BLOCKED ON D-23**,
  **BLOCKED ON D-24**, and **BLOCKED ON D-25**.
