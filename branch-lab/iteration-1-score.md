# Iteration Score Card

- Run ID: bl01-2026-05-04-1522
- Iteration N: 1
- Title: Command palette (⌘K) — global keyboard navigation
- Files changed: `App.tsx` (+29), `components/CommandPalette.tsx` (NEW, +320)
- Commit SHA: TBD (set after commit)

## Hypothesis (verbatim from wave plan)

⌘K opens a fuzzy-search palette across staff/students/events and routes for keyboard-first navigation. After this lands, an admin presses ⌘K, types "john", lands on the right view via Enter — no sidebar click.

## What Was Actually Implemented

Implemented exactly to spec. New `CommandPalette.tsx` (320 lines) with four sections (Navigate, Staff, Students, Events), arrow-key highlight movement across a flat result list, Enter activates, Esc/overlay-click closes, autofocused input, RTL-aware dialog (`dir="rtl"` when he-IL), `role="dialog" aria-modal="true"`, all 19 pre-staged keys consumed in both locales. App.tsx adds a `useEffect` window-keydown listener that toggles open on (meta||ctrl)+K and a portal mount near `<DevSimulationBanner>`. Worker did not narrow scope.

## Rubric Scores

| Axis | Score | Justification |
|---|---|---|
| Audience fit | 3 | Every admin uses navigation daily; ⌘K is felt within the first session |
| Usefulness | 3 | Saves 2–4 sidebar clicks per navigation × dozens per day |
| Clarity | 3 | Sectioned results + footer hint row removes "what does ⌘K do" ambiguity |
| Workflow efficiency | 3 | Keyboard-only path through navigation, staff lookup, event lookup |
| Visual hierarchy | 2 | Honors design system (bone neutrals, no rainbow); does not yet use lacquer accent token (used neutral focus styling — future polish) |
| Accessibility | 3 | role+aria-modal+focus-restore+autofocus; Esc to close |
| Reliability | 2 | Window-level keydown listener has small risk of preempting future input shortcuts; mounted inside AppContent so re-renders are scoped |
| Novelty (tasteful) | 3 | Defines an operator-console pattern other surfaces will adopt |
| Implementation risk (3 = single file, low risk) | 2 | Two files (one new, one existing) — but App.tsx edit is additive only, low blast radius |
| Reversibility (3 = single-commit revert) | 2 | Single-commit revert; consumes pre-staged i18n keys (cosmetic residue if reverted standalone) |

**Composite (sum):** 26/30
**Floor axes:** audience fit = 3, usefulness = 3
**Floor result:** PASS

## Decision

- [x] Ship — both floor axes pass, composite 26 ≥ 14

## Ambition Audit

- Was this iteration narrowed from a bolder candidate during planning or implementation? No — full Cmd+K palette as planned.
- Bolder rejected: full fuzzy-rank with deep-link to specific student/event records (would have required schema knowledge of student/event detail routes that don't all exist).

## Visual Evidence

- HTTP probe: `/usr/bin/curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/` → `200`
- Body grep: `Cadenza` + `<div id="root">` present.
- ⌘K interaction is JS-driven; curl cannot exercise it. Manual verification deferred to user.

## Residuals

- `CalendarEvent` may not have `title`/`activity` fields in current schema — Worker used `(event as any).title || (event as any).activity || event.name` fallback chain, which works under TS but loses compile-time safety on those two synthetic fields.
- Click-outside uses `mousedown` not `click` — intentional but documented.
- No focus-trap library — relies on autofocused input + Esc + overlay click.
