# Blueprint Planning

Canonical index for the Cadenza Blueprint planning phase. Source brief:
[`../BLUEPRINT_PLANNING_PHASE_REPORT.md`](../BLUEPRINT_PLANNING_PHASE_REPORT.md).

Branch: `blueprint-supabase`. Runtime: Supabase (Auth/Postgres+RLS/Realtime/Storage).
See [`../SUPABASE_MIGRATION_MAP.md`](../SUPABASE_MIGRATION_MAP.md) for the table↔query map.

## Why this phase exists

The Blueprint has a strong data/schema/query foundation but is **not** productized
end-to-end. Going straight to feature build would bake in untested product
assumptions (route placement, role/RLS behavior, conversion semantics, finance
ownership). This phase turns the feature tree's nouns into unambiguous build
tickets *before* any module UI is written.

What is real today (do not re-plan as if greenfield):

- Supabase schema + RLS + deterministic query helpers + tests for most entities.
- Blueprint dashboard (`ConservatoryBlueprint.tsx`) — a coverage/planning surface, not module CRUD.
- Instrument Inventory — the one substantial productized Blueprint module.
- Native spines: calendar, staff, rooms, activities, settings, import/export, admin inbox, hours, command palette, local/e2e mode, RTL/Hebrew.

## How to use this folder

1. Cross-module questions are resolved in [`decision-log.md`](decision-log.md) **before** the packets that depend on them ship. A packet must not silently assume an unresolved decision — it cites the decision ID and its current state.
2. Each module gets one packet from [`module-template.md`](module-template.md), filed under [`packets/`](packets/).
3. Status language is governed by [`status-policy.md`](status-policy.md). `features/forteTree.ts` is updated only per that policy.
4. Every packet embeds a role/RLS matrix per [`role-matrix-template.md`](role-matrix-template.md).
5. Route/nav placement obeys [`route-nav-policy.md`](route-nav-policy.md). No packet invents a new top-level view without amending that policy.

## Pass roadmap

| Pass | Output | State |
|---|---|---|
| 0 — Planning setup | this folder: index, template, status policy, decision log, role-matrix template, route/nav policy | ✅ done |
| 1 — P0 product definition | [`packets/`](packets/): registration, student/family, lesson attendance, payments, payroll | ✅ drafted — decision-log prerequisites resolved |
| 2 — Security/data/conversion | role matrices, canonicalization decisions, migration deltas, conversion semantics | ✅ complete for resolved P0 decisions; parked D-21–D-27 questions remain in NEEDS NOAM |
| 3 — P1/P2 module definition | packets for 11 currently unpacketized non-native nodes | ✅ drafted |
| 4 — Implementation roadmap | [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md): sequenced epics, ticket slices, test plans, live-Supabase RLS markers | ✅ drafted |

### What the audit changed (read before implementing)

The deterministic foundation is **more complete than the tree's `gap` labels imply**:
all 45 query helpers in `utils/blueprintQueries.ts` are implemented and unit-tested
(`blueprintQueries.test.ts`, 44 cases), and `intake → student` conversion already
exists as `approveIntakeRecord` (student-only). The **real P0 gaps** are: (1) product
UI/workflows, (2) remaining public-submit / real-role RLS verification beyond the
implemented `0004` teacher and finance foundations, and (3) remaining live-role
security and product workflow tests. `supabaseSync.ts` mapping and static
migration/schema consistency now have tests; live Supabase authenticated-role RLS
remains todo.
`PublicEndpoint` was a ghost entity in the audit; `0004` now creates the
inert/admin-only `public_endpoints` registry, with no public surface activated.

## Packet roster (22 feature-tree nodes)

P0 first (this pass): `public-registration-intake`, `student-family-files`,
`lesson-details-attendance`, `payments-charges`, `payroll-salaries-hours`.
Plus native spines confirmed-not-rebuilt: `staff-teacher-management`,
`activity-program-tree`, `calendar-schedule-engine`, `org-settings-global-users`,
`import-export-data-portability`, `deterministic-agent-layer`.

P1/P2 (Pass 3 queue): `rooms-absence-requests`, `ensembles-theory-school-programs`,
`exams-certificates-report-cards`, `concert-programs-events`, `agreements-consent`,
`instrument-inventory` (follow-up), `teacher-evaluation-hr`, `year-rollover-setup`,
`calendar-website-integrations`, `reports-analytics`, `operations-command-center`.

## Ground rules (from the brief)

- Subagents audit and draft; **synthesis stays centralized** here. No competing global roadmaps.
- No implementation slices for a packet section that depends on an unsettled
  decision; parked items must stay marked `BLOCKED ON D-xx`.
- Consent/personal-data rule is absolute: public intake, tokenized endpoints, and any
  data-collection surface must route through an explicit consent/setup flow, never a
  config that bypasses it.
