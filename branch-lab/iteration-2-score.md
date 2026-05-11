# Iteration Score Card

- Run ID: bl01-2026-05-04-1522
- Iteration N: 2
- Title: CalendarView operator overhaul — active filter pills + conflict count badge + visible event focus ring
- Files changed: `components/CalendarView.tsx` (+133 / -2)
- Commit SHA: TBD

## Hypothesis (verbatim from wave plan)

CalendarView is the daily home for admins; today its filter state is buried, room conflicts are silent until you visit Admin Inbox, and event chips have no keyboard focus indication. Three coherent moves bundled into a single worker make CalendarView a keyboard-first, scannable surface — filter pills appear under the header, a lacquer-red Conflicts: N badge sits next to the view-mode controls, and Tab-able event chips show a focus ring.

## What Was Actually Implemented

All three moves shipped in CalendarView.tsx. Filter pills row inserted between header and showHelp block (~lines 2160–2196) with Clear-All link; pill labels derived from existing `cal.filter.*_all` keys via regex strip (acceptable cosmetic limitation noted). Conflict badge appended after DAY/WEEK/MONTH switcher (~2050–2061) using `detectRoomConflicts(expandedEvents).length`; click navigates via existing `onNavigate('ADMIN_INBOX')` prop — no new prop drilling. Focus ring added to both time-grid (~1543) and month-view (~1934) chips with `tabIndex={0}`, `role="button"`, aria-label from `bl01_calendar.event.aria_focused`, Enter/Space onKeyDown opens detail, `focus-visible:outline-2 outline-red-700`. No arrow-key navigation (out of scope). Net diff: +133 / -2 in a 2429-line file.

## Rubric Scores

| Axis | Score | Justification |
|---|---|---|
| Audience fit | 3 | Calendar is the daily home; all three moves visible immediately |
| Usefulness | 3 | Filter visibility + conflict awareness + keyboard nav each save real seconds and prevent errors |
| Clarity | 3 | "Why are events missing?" → pill row answers it. "Are there conflicts?" → badge answers it |
| Workflow efficiency | 3 | One-click filter removal; one-click jump to Admin Inbox conflict triage |
| Visual hierarchy | 3 | Lacquer accent restraint upheld — single red badge + single red focus ring; bone pills for filters |
| Accessibility | 3 | Event chips now keyboard reachable with visible focus + aria-label; conflict badge has aria-label |
| Reliability | 2 | Adds independent `detectRoomConflicts` memo over expandedEvents — duplicates work with existing conflictingIds memo (filtered view); intentional per spec but worth a future merge |
| Novelty (tasteful) | 2 | Standard patterns done correctly; bundled coherence is the bold part |
| Implementation risk | 3 | Single file; no schema changes |
| Reversibility | 2 | Single-commit revert; consumes pre-staged i18n keys |

**Composite:** 27/30
**Floor axes:** audience fit = 3, usefulness = 3
**Floor result:** PASS

## Decision

- [x] Ship — both floor axes pass, composite 27 ≥ 14

## Ambition Audit

- Narrowed from bolder? Partial: arrow-key navigation across event chips deferred to next run (would have required focus-state lifted to component level — bigger refactor than spec authorized). Worker explicit about this.
- Bolder rejected: full keyboard "E to edit / D to duplicate / R to reschedule" event command set on focused event — defers to a follow-up run after pattern proven.

## Visual Evidence

- HTTP probe: `200` at http://localhost:3001/.
- Body grep: `Cadenza` + `<div id="root">` present. CalendarView lives behind authenticated routing — full visual proof requires browser auth, deferred to user.

## Residuals

- Pill labels derived by stripping "All " prefix from existing filter keys; if Hebrew/i18n shapes differ, label may include the prefix (cosmetic only).
- `unresolvedConflictCount` recomputes on every events change — could share work with `conflictingIds`, but spec required system-wide count, not filtered.
- Focus ring uses literal `outline-red-700` — not a project token. design.md's `--lacquer-500` not yet wired through tailwind; future polish.
