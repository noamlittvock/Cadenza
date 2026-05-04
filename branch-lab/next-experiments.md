# Next Experiments — inheriting from bl01-2026-05-04-1522

Order is approximate priority. Each item is single-file or two-file unless noted.

## High priority — direct follow-ups from this run's residuals

1. **Per-noun filter pill labels (he-IL parity)**
   - Ship `bl01_calendar.filter.{teacher|room|class|position|tag}` keys (en + he) and use them in CalendarView's pill row, replacing the regex-strip-of-"All " derivation.
   - Files: `constants.ts` (pre-stage) + `components/CalendarView.tsx`.
   - Closes P2 locale risk from iteration 2.

2. **Bulk-archive confirmation Modal**
   - Replace `handleBulkArchive`'s `window.confirm` (line 649 in `components/ActivityManager.tsx`) with the same Modal pattern from iteration 4. Reuse existing `bl01_activity.archive.*` keys; add a small bulk variant if needed.
   - One file, low risk.

3. **`focus-ring-lacquer` utility extraction**
   - Extract the literal `outline-red-700` used in iteration 2 (CalendarView event chips) and iteration 1 (CommandPalette focus-visible rings) into a tailwind utility class or design.md-aligned token.
   - Files: `index.html` (tailwind config), `components/CalendarView.tsx`, `components/CommandPalette.tsx`.

4. **Sticky headers on ManageHub roster table**
   - Extend iteration 3's pattern. Single file: `components/ManageHub.tsx`.

## Bold / next-wave moves

5. **Arrow-key event navigation on focused calendar chip**
   - Extends iteration 2. Grid-aware ↑↓←→ focus movement; single-key actions on the focused event (E edit, D duplicate, Del cancel).
   - Single file: `components/CalendarView.tsx`. Honors the keyboard-first thesis the wave defined.

6. **Empty states for Staff / Rooms / Activities**
   - Backlog items #2 and #9 from `opportunity-backlog.md`; underscored this run. Bundle as one parallel wave (3 disjoint files).

7. **Conflict snooze / "Skip for now"**
   - Backlog item #5; deferred this run for schema-risk concerns (the AdminInboxItem schema lacks a snooze timestamp). If schema can be extended in scope, this is the highest product-momentum unblock for the conflict-triage workflow.

8. **Density toggle (Compact / Comfortable) on CalendarView**
   - Backlog item #4. Persist to localStorage. Single CSS variable swap. Works once iteration 5 lands keyboard navigation so the dense mode is usable on dense weeks.

9. **Required-field asterisks + form validation toast (EventFormV2, ActivityManager)**
   - Backlog item #11. Replaces silent submit failures with explicit field-level cues.

10. **Hover-card on calendar event chips with derived comp/pay**
    - From `domain-research.md` — proves "calendar is the source of truth" thesis viscerally. Two-line max card on hover. Single file.

## Infrastructure / unblockers

11. **Add `eslint.config.js` (flat config)**
    - Project has no flat config and no legacy `.eslintrc.*`. Workers' lint gate was unreachable this run. A minimal flat config (TypeScript + React) unblocks the full Branch Lab verification gate going forward.
    - Files: `eslint.config.js` (NEW), maybe `package.json` (devDep).

12. **Dev server liveness manager for Branch Lab**
    - The dev server stopped at some point during the parallel worker dispatch this run; restart was manual. Future Branch Lab runs should monitor + auto-restart, or have each worker spawn a short-lived preview build for its own visual probe.

## Pattern bets to confirm next run

- Coherent CalendarView overhaul (one-file, multi-concern) again — proved valuable; try the same shape on `EventFormV2.tsx` (single coherent operator-form pass: required-field marks + breadcrumb + keyboard tab order audit).
