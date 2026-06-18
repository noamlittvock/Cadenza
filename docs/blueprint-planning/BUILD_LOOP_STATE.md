# Blueprint Implementation - Build Loop State

This file is the implementation loop's durable memory. The next agent must read
it in full before editing code. Authoritative specs remain:

- `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`
- `docs/blueprint-planning/IMPLEMENTATION_ROADMAP.md`
- `docs/blueprint-planning/packets/student-family-files.md`
- `docs/blueprint-planning/decision-log.md`
- `docs/blueprint-planning/route-nav-policy.md`
- `docs/blueprint-planning/status-policy.md`

On completion, replace the first line with exactly:
BUILD COMPLETE

## Current Objective

Begin the Phase C build with the recommended shape Noam approved:

1. Build the live-role RLS harness as a separate first implementation slice.
2. Build the first Student/Family vertical slice after the harness.
3. Use the accepted D-16 P0 guardian path: `families.guardians[]` jsonb.
4. Do not normalize guardian/contact identity in this build.

Current build target: `student-family-files` reaches the `implemented` bar for
the scoped vertical slice described below. Do not continue into
`public-registration-intake` until this target is complete and Noam explicitly
asks to continue.

## Locked Build Decisions

- RLS harness strategy: separate infrastructure slice first.
- D-16: P0 guardian/contact data stays in `families.guardians[]` jsonb.
- First Student/Family slice: vertical slice, not a full omnibus module PR.
- Initial Student/Family scope:
  - route `STUDENTS`
  - sidebar + command palette visibility only after route exists
  - Student/Family list and search
  - create/edit student and family with guardians and family linking
  - student detail with profile, guardians, enrollments, lessons/history,
    finance-gated, documents, agreements, and history tab structure
  - adapter seam at the student write boundary
  - mobile read-oriented list/profile at 390x844
  - EN/HE labels and RTL layout checks

## Non-Negotiable Guardrails

- Preserve unrelated dirty work. Do not stage, commit, branch, push, or run git
  write operations.
- Do exactly one queue unit per iteration. If the next unit is too large, split it
  into smaller unchecked subunits in this file, then complete only the first
  subunit.
- Do not build any packet section marked `BLOCKED ON D-17` through `BLOCKED ON
  D-27` until the matching decision is answered and the packet/decision log are
  updated.
- D-16 is no longer blocked for P0. Use `families.guardians[]` jsonb and do not
  reopen that decision.
- Route/palette rule: a palette destination appears only when `App.tsx` renders a
  real route or `routing.ts` aliases it to one. `STUDENTS` route, sidebar entry,
  and palette visibility must ship together.
- UI must stay consistent with the existing app: dense operator surfaces, dark
  espresso sidebar, warm paper workspace, compact headers, segmented controls,
  8px-radius panels/cards, lucide icons, no marketing page.
- Use `utils/canonicalAdapters.ts` for Student legacy/V2 conversion. Do not add a
  second inline Student conversion path.
- If live Supabase credentials are absent, add env-gated RLS tests that skip with
  a clear message, record required env vars here, and do not mark RLS-LIVE or the
  module complete until those tests run against a real project.

## Queue (dependency order - do the first unticked unit, exactly one)

### Stage 0 - Harness And Preflight

- [ ] Baseline audit: read this file plus the authoritative specs, run
  `git status --short --branch`, identify existing Student/Family data flow,
  translations, routing, tests, and Supabase/RLS test conventions. Update this
  file with any discovered constraints before code edits.
- [ ] E0.1 live-role RLS harness: create the reusable real-Supabase RLS test
  harness/env contract for admin, teacher/member, finance, anon where relevant,
  and cross-org denial. It may be env-gated/skipped locally, but must document the
  exact command and env vars needed for a live run.
- [ ] E0.2 Student/Family mapping tests: add focused unit coverage for `students`
  HYBRID wrap/unwrap, `families` normalized camel<->snake/jsonb mapping, and the
  `studentToV2` write-boundary adapter behavior needed by the Student workspace.

### Stage 1 - Student/Family Vertical Slice

- [ ] Route shell: add a real `STUDENTS` route, sidebar nav item, command palette
  visibility through `routing.ts`, translations, and route/palette anti-drift
  tests. The route may render a minimal real workspace shell but not Not Found.
- [ ] Data/service boundary: add the Student/Family workspace data helpers or
  service layer using existing app patterns, `studentToV2`, family records, and
  `families.guardians[]` jsonb. Include unit tests for create/update/link
  behavior before broad UI wiring.
- [ ] List and search UI: build the dense Student/Family list surface with name,
  guardian, activity/status filters, empty/loading/error states, and family list
  mode. Reuse existing colors, spacing, icon style, and operator layout density.
- [ ] Create/edit workflows: implement student create/edit, family create/edit,
  guardian edit, sibling/family linking, soft archive semantics, and error
  handling. Keep finance/payroll mutations out of scope.
- [ ] Detail tabs: implement Student/Family detail tabs for profile, guardians,
  enrollments, lessons/history, finance-gated summary state, documents,
  agreements, and history. Tabs may show blocked/not-yet-source-ready states where
  downstream modules are not implemented, but the Student/Family record workflow
  itself must be usable.
- [ ] RLS refinement/tests for the slice: prove admin write, member denied from
  writes, teacher own-roster read scope, cross-org denial, and finance-tab gating
  with the live-role harness. Do not mark complete if only local/e2e bypass is
  tested.
- [ ] Playwright + RTL/mobile: add and run the Student/Family smoke path
  (create family+student+guardian, add/link enrollment if available, guardian
  search, open detail tabs), plus Hebrew/RTL and 390x844 list/profile checks.
- [ ] Status promotion: only after every completion checklist item below is true,
  update `features/forteTree.ts` and the `student-family-files` packet header to
  `implemented`, append an iteration note here, and replace this file's first
  line with `BUILD COMPLETE`.

## Completion Checklist (all required before BUILD COMPLETE)

- [ ] `STUDENTS` routes to a real surface and never falls through to
  `app.not_found`.
- [ ] Sidebar, command palette, `ROUTED_VIEWS`, translations, and route tests are
  synchronized.
- [ ] Student/Family list, search/filter, create, edit, detail, archive/status,
  empty, loading, and error states exist.
- [ ] Family is editable as source-of-truth and guardian/contact data uses
  `families.guardians[]` jsonb per accepted D-16.
- [ ] Student write boundary uses `utils/canonicalAdapters.ts`; no duplicate
  Student conversion path was added.
- [ ] Supabase mapping/unit tests cover the Student/Family mapping touched by the
  slice.
- [ ] RLS-LIVE passed against real authenticated roles, including cross-org denial.
- [ ] Playwright Student/Family smoke passed.
- [ ] Hebrew/RTL and mobile 390x844 checks passed for list/profile.
- [ ] `npm run typecheck -- --diagnostics` passes.
- [ ] `npx vitest run --reporter=dot` passes.
- [ ] No D-17-D-27 blocked section was implemented without a decision update.
- [ ] No git staging, commit, branch, or push was performed.

## Next Unit

- Baseline audit.

## Live RLS Env Contract

The first harness iteration must fill this in with the real variable names it
implements. Expected shape:

- Supabase project URL:
- anon key:
- service role key or privileged test provisioning token:
- org/admin fixture:
- teacher/member fixture:
- finance fixture:
- cross-org fixture:
- command to run live RLS tests:

## Iteration Log

- seed - build-loop design: recorded Noam-approved build decisions, scoped the
  first build target to the RLS harness plus Student/Family vertical slice, and
  left D-17-D-27 parked.
