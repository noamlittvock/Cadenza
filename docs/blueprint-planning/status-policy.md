# Status Policy

Defines the five status values used in `features/forteTree.ts` and in packets,
and the rule for changing a node's status. The goal: status reflects **UI
product reality**, not backend readiness. A node with full schema + queries +
tests but no usable workflow is **not** "implemented".

## Definitions

| Status | Meaning | Backend | Productized UI |
|---|---|---|---|
| `native` | Predates the Blueprint; already a first-class app surface. | yes | yes (pre-Blueprint) |
| `embedded` | Functionality exists but only inside another surface (a tab, a panel, a mini-view); not a standalone module. | partial/yes | partial |
| `planned` | Has a packet and/or schema intent, no shippable workflow. | maybe | no |
| `gap` | Identified need, little or nothing built. | maybe | no |
| `implemented` | Dedicated, usable list/detail/create/edit workflow with org-scoped persistence, status semantics, and a Playwright smoke. | yes | yes |

## The `implemented` bar (all required)

A node is `implemented` only when it has:

1. Dedicated route/tab/panel per [`route-nav-policy.md`](route-nav-policy.md).
2. List view with filter/search + empty/loading/error states.
3. Create / edit / detail flow.
4. Org-scoped Supabase persistence (real RLS, not just local/e2e bypass).
5. Status/archive semantics that match the packet.
6. Links to source records.
7. English + Hebrew labels and an RTL layout check.
8. Deterministic query/helper coverage with unit tests.
9. A Playwright smoke for the actual primary workflow.

Backend-only readiness (schema + queries + tests, no workflow) caps a node at
`planned`. Workflow-inside-another-surface caps it at `embedded`.

## Transition rule

- Status changes only via a packet update, never ad hoc.
- When a packet ships, update both the packet header and the `features/forteTree.ts`
  node in the same change, and note it in [`decision-log.md`](decision-log.md) if the
  change resolves an open question.
- Pass 0 corrected the known-stale statuses tracked by D-STATUS and D-STATUS-2.
  Current Phase C implementation status as of 2026-06-18:
  **`instrument-inventory`**, **`student-family-files`**,
  **`public-registration-intake`**, and **`lesson-details-attendance`** are
  `implemented`; **`payroll-salaries-hours`** is `embedded`;
  **`payments-charges`** remains `gap`.

## Consistency check (brief item 6)

Keep `features/forteTree.consistency.test.ts` green. It asserts every
`node.deterministicQueries` name maps to an implemented export (in
`utils/blueprintQueries.ts` or a documented utility), or is explicitly listed as a
known-unimplemented stub. This prevents the tree from claiming coverage that does
not exist. Until green, no status is promoted to `implemented`.
