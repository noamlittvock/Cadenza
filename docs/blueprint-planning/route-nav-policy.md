# Route / Navigation Policy

Governs where every module lives and how it is reached. No packet invents a
top-level view without amending this file. Resolves decisions D-01 and D-02.

## Current reality (ground truth)

`ViewState` (`types.ts:359-372`) has 13 values:
`CALENDAR, MANAGE, SETTINGS, SUPER_ADMIN, STAFF_MEMBERS, ADMIN_INBOX, BLUEPRINT,
STUDENTS, BILLING, ACADEMICS, INVENTORY, PAYROLL, ANALYTICS`.

`App.tsx` routes only 7: `CALENDAR` (inline, 455-592) and the switch (596-724)
`STAFF_MEMBERS`, `MANAGE`, `BLUEPRINT`, `SUPER_ADMIN`, `ADMIN_INBOX`, `SETTINGS`.
**Unrouted → `app.not_found`:** `STUDENTS, BILLING, ACADEMICS, INVENTORY, PAYROLL,
ANALYTICS` (6 dead ends).

`CommandPalette.tsx` (28-58) exposes **all 13** and calls `setCurrentView(view)`
(line 113) — so 6 palette commands currently land on Not Found.

Sidebar (`Layout.tsx:184-234`, inside `isAdmin` gate):
- Always: `CALENDAR`, `BLUEPRINT`, `SETTINGS`.
- Desktop-only (`{!isMobile && …}`): `ADMIN_INBOX`, `MANAGE`.
- `SUPER_ADMIN` shown for real superadmin.

`ManageHub` (`ManageHub.tsx:80-86`) tabs via `?tab=` URL param:
`staff, activities, rooms, inventory, subscriptions`. Inventory is
`Manage?tab=inventory` (embedded), **not** a `ViewState.INVENTORY` route.

## Placement tiers

Decide each module into exactly one tier:

1. **Top-level ViewState (sidebar):** high-frequency daily operator surfaces only.
   Current: Calendar, Blueprint, Admin Inbox, Manage, Settings, SuperAdmin.
   Planned additions (per D-01 default): **Students** (`STUDENTS`),
   **Finance** (reuse `BILLING`). Everything else justifies its sidebar slot or
   does not get one — "the interface earns its space."
2. **Manage tab:** lower-frequency, config-like modules. Current: staff,
   activities, rooms, inventory, subscriptions. Candidate additions: academic
   config, agreement templates.
3. **Contextual panel:** lives inside its source record, no standalone route.
   Lesson attendance → Calendar event detail. Room/absence requests → Admin Inbox.
   Source-event lineage → Calendar event detail.
4. **Public token route:** unauthenticated, scoped by token/edge (D-07/D-14).
   Registration form, agreement signing. Never a sidebar entry.

## Dead-end cleanup (resolves D-02)

Rule: **a command-palette destination must route to a real surface or not exist.**

| ViewState | Action now | When module ships |
|---|---|---|
| `INVENTORY` | Alias to `Manage?tab=inventory` (don't render Not Found) | stays an alias; Inventory is a Manage tab |
| `STUDENTS` | Hide palette entry | unhide + route as top-level view |
| `BILLING` | Hide palette entry | unhide + route as **Finance** top-level view |
| `ACADEMICS` | Hide palette entry | unhide when Academic Hub packet ships (tier TBD) |
| `PAYROLL` | Hide palette entry | unhide; likely Manage tab or Finance sub-view |
| `ANALYTICS` | Hide palette entry | unhide when reports-analytics ships |

Implementation note for the cleanup ticket: drive palette visibility from a single
"routed views" allowlist so a view appears in the palette **iff** `App.tsx` routes
it. This kills the false-coverage problem at the source instead of per-entry.

## Mobile visibility (explicit decision)

Hiding `MANAGE` and `ADMIN_INBOX` on mobile is currently **undocumented behavior**.
Decision: **keep desktop-first for config/admin** (PRODUCT.md targets 24–27"
operator displays), and make it explicit here rather than incidental in JSX.

But: some workflows are genuinely mobile (a teacher marking attendance from a
classroom). So:
- Config-heavy surfaces (Manage, SuperAdmin) stay desktop-only — intentional.
- Any module whose **primary** workflow is mobile (e.g. teacher attendance,
  absence request) must declare mobile reachability in its packet and **not**
  inherit the Manage/Admin-Inbox mobile hide by accident.
- Admin Inbox being mobile-hidden is revisited if approvals (intake, absences)
  become a mobile need.

## Amendment rule

Adding/moving a module's home = edit this file + the decision log, in the same
change as the packet that needs it. Sidebar additions also update the palette
allowlist so the two never drift.
