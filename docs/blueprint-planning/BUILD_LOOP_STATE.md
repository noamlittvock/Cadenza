# Blueprint Implementation - Build Loop State

This file is the implementation loop's durable memory. The next agent must read
it in full before editing code. Authoritative specs remain:

- `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`
- `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`
- `docs/blueprint-planning/packets/public-registration-intake.md`
- `docs/blueprint-planning/packets/student-family-files.md`
- `docs/blueprint-planning/decision-log.md`
- `docs/blueprint-planning/route-nav-policy.md`
- `docs/blueprint-planning/status-policy.md`

On completion, replace the first line with exactly:
BUILD COMPLETE

## Previous Completed Target

- `student-family-files` reached the implemented bar on 2026-06-18.
- `features/forteTree.ts` marks `student-family-files` as `implemented`.
- `docs/blueprint-planning/packets/student-family-files.md` marks the packet as
  `implemented`.
- Completed verification included live Supabase RLS, Playwright Student/Family
  smoke, Hebrew/RTL, 390x844 mobile, typecheck, and full Vitest.

## Current Objective

Continue Phase C with the next roadmap packet: `public-registration-intake`.

Build a consent-gated public registration intake flow that lets an unauthenticated
guardian/applicant submit a quarantined intake record through the accepted
D-07/D-14 public path, lets admins review/approve/reject/mark duplicates, and
converts approved intake into the existing Student/Family target graph without
opening broad anon writes to org tables.

Current build target: `public-registration-intake` reaches the `implemented` bar
for the scoped vertical slice described below. Do not continue into
`lesson-details-attendance` until this target is complete and Noam explicitly asks
to continue.

## Locked Build Decisions

- D-07: public unauthenticated writes must go through a Supabase Edge Function or
  tightly scoped token into quarantined `registration_intake`. Never add broad
  anon INSERT policies on org tables.
- D-14: `public_endpoints` is the registry/control plane for public/tokenized
  surfaces. It exists from migration `0004`; extend it only as required for this
  packet.
- Consent rule: every public data-collection surface must include explicit
  consent/setup capture. No config bypass.
- D-03/D-04: approved intake conversion must write through the accepted
  Student/Family graph and canonical student adapter boundary.
- D-16: P0 guardian/contact data stays in `families.guardians[]` jsonb. Do not
  normalize guardian/contact identity in this build.
- D-15: no global Student/Event persistence migration; packet-local backfill only.
  For this packet, verify whether any legacy intake data exists before launch.
- D-17-D-27 remain parked. Do not build blocked packet sections until the matching
  decision is answered and the packet/decision log are updated.

## Initial Public Registration Scope

- Public token route with no sidebar entry, per route-nav-policy tier 4.
- Public registration form with applicant, student, guardian/contact, requested
  activity/program, source, and explicit consent capture.
- Controlled submit path into `registration_intake`; no direct public writes to
  students, families, enrollments, agreements, or admin inbox.
- Admin review queue in Admin Inbox initially, with status filters, duplicate
  suggestions, detail/review, edit/correction, approve/reject/duplicate actions,
  retained audit trail, and spreadsheet export if local patterns make this cheap.
- Approval conversion graph: student + editable family + enrollment +
  agreement-request placeholder/history + Admin Inbox history, using the existing
  Student/Family helpers where possible.
- RLS/refinement: `registration_intake` queue must be admin-only; public submit
  must be proven with no authenticated user; non-admin members and non-members
  must not read the queue.
- Hebrew/RTL: public form and admin review states.
- Mobile: public form at 390x844; admin review can remain desktop-first if Admin
  Inbox remains desktop-only, but blocked/mobile state must be coherent.

## Non-Negotiable Guardrails

- Preserve unrelated dirty work. Do not stage, commit, branch, push, or run git
  write operations.
- Do exactly one queue unit per iteration. If the next unit is too large, split it
  into smaller unchecked subunits in this file, then complete only the first
  subunit.
- Never print or record secret values. Docs and logs may name required variables
  but must never include tokens, passwords, service-role keys, anon keys, or
  access tokens.
- Use existing app patterns and helpers. Do not introduce a new design language,
  router style, data store, or ad hoc mapping layer when a local one exists.
- Keep public surfaces unprivileged: public submit creates only quarantined
  intake, never live operational records.
- Keep conversion admin-approved and auditable. Live student/family/enrollment
  records are created only after admin approval.
- If live Supabase credentials or remote schema state are missing, add
  env-gated tests that skip with a clear message, record the exact env vars or
  remote blocker here, and do not mark RLS-LIVE or BUILD COMPLETE until tests run
  against a real project.

## Queue (dependency order - do the first unticked unit, exactly one)

### Stage 0 - Audit And Contract

- [ ] Baseline audit: read this file plus authoritative specs, run
  `git status --short --branch`, identify existing intake schema/types/helpers,
  Admin Inbox extension points, public/token route patterns, RLS conventions, and
  test conventions. Update this file with discovered constraints before code
  edits.
- [ ] MAP-UNIT: add focused mapping/unit coverage for `registration_intake`
  camel/snake/jsonb conversion, current helper behavior, and the approval graph
  contract before broad UI wiring.
- [ ] Conversion graph service: extend the intake approval logic from
  student-only output to student + family + enrollment + agreement-request
  placeholder/history + Admin Inbox history. Keep conversion pure or repository
  injected where possible and cover create/reject/duplicate transitions.

### Stage 1 - Public Submit Path

- [ ] Public endpoint contract: wire or extend the D-14 `public_endpoints` lookup
  and token/config validation for registration intake without exposing live org
  tables.
- [ ] Public submit implementation: implement the D-07 controlled submit path
  into quarantined `registration_intake`, including consent capture and clear
  submit success/failure states.
- [ ] Public form UI/route: add the unauthenticated token route, applicant-facing
  form, Hebrew/RTL strings, and 390x844 public mobile behavior. No sidebar or
  command-palette entry.

### Stage 2 - Admin Review And Conversion

- [ ] Admin review queue: add Admin Inbox intake review list/detail with status
  filters, duplicate suggestions, correction/edit, reject, duplicate, and approve
  actions.
- [ ] Approval persistence wiring: persist the approved conversion graph to
  students, families, enrollments, agreement/history records where supported, and
  update intake lineage/status atomically enough for current app patterns.
- [ ] Export/audit polish: add retained audit/history states and queue export only
  if it fits existing utilities; otherwise record the scoped deferral.

### Stage 3 - RLS, Live Verification, And Promotion

- [ ] RLS refinement/test implementation: narrow `registration_intake` queue reads
  to admin/super_admin, preserve controlled public submit, and add env-gated live
  assertions for no-auth submit, no anon live-table writes, non-admin queue denial,
  admin review, and cross-org denial.
- [ ] RLS-LIVE run: apply/push needed migrations and run the live-role/no-auth
  harness against a real Supabase project. Do not mark complete if only local/e2e
  bypass or skipped env-gated tests are exercised.
- [ ] Playwright + RTL/mobile: run submit public form -> admin queue -> approve ->
  student/family/enrollment links visible -> inbox history, plus Hebrew/RTL and
  390x844 public form checks.
- [ ] Status promotion: only after every completion checklist item below is true,
  update `features/forteTree.ts` and the `public-registration-intake` packet
  header to `implemented`, append an iteration note here, and replace this file's
  first line with `BUILD COMPLETE`.

## Completion Checklist (all required before BUILD COMPLETE)

- [ ] Public submit path is controlled by D-07/D-14 and does not require a logged
  in browser user.
- [ ] Public applicants can submit only quarantined `registration_intake` records.
- [ ] No broad anon INSERT/SELECT/UPDATE/DELETE policies exist on org tables.
- [ ] `registration_intake` review queue is admin/super_admin only.
- [ ] Admin review supports pending/in-review/approved/rejected/duplicate/converted
  workflow states with retained audit context.
- [ ] Duplicate suggestions are visible during review.
- [ ] Approval creates or links the Student/Family target graph using the accepted
  D-03/D-04/D-16 boundaries.
- [ ] Agreement/enrollment/Admin Inbox history outputs are implemented or explicitly
  scoped as placeholders where downstream modules are not source-ready.
- [ ] Hebrew/RTL public form and review states are covered.
- [ ] Public form mobile 390x844 check passes.
- [ ] RLS-LIVE passed against a real project, including no-auth submit,
  non-admin queue denial, no anon direct live-table writes, and cross-org denial.
- [ ] Playwright public submit -> admin approve smoke passed.
- [ ] `npm run typecheck -- --diagnostics` passes.
- [ ] `npx vitest run --reporter=dot` passes.
- [ ] No D-17-D-27 blocked section was implemented without a decision update.
- [ ] No git staging, commit, branch, or push was performed.

## Next Unit

- Baseline audit for `public-registration-intake`.

## Setup Notes For Next Agent

- The live RLS harness from the previous target exists in
  `utils/rlsLiveHarness.ts` and can be extended.
- Supabase CLI is installed and the project was previously linked locally.
- Source `.env.local` for live test credentials, but never print it.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless an explicit migration-push step is being handled by the
  orchestrator.
- `build-loop.sh` defaults `CODEX_REASONING_EFFORT=high`.
