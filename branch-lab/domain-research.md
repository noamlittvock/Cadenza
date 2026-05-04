---
date: 2026-05-04
type: research
project: Cadenza
tags: [domain-research, ux, admin-tooling, calendar, rtl]
---

# Cadenza Domain UX Research — Branch Lab Iteration Wave

## 1. TL;DR
- Admins live in the calendar daily; speed-of-edit and density beat novelty. Every interaction should pay rent on a weekly-use cadence.
- Keyboard-first (Linear / Notion Calendar) is the durable aesthetic for operator tools — cmd-k, single-key actions on focused events, and visible shortcut hints.
- Trust comes from legibility: dense rows, stable tabular numerals, immediate "what changed" feedback. Not from color or motion.

## 2. Comparable Products
| Product | What they do well for admins | What to steal |
|---|---|---|
| My Music Staff | Centralized student/teacher records w/ attendance + lesson notes inline | Inline lesson-note popover on event hover; teacher-permission scoping is implicit in views |
| Opus1 / Teachworks | Multi-teacher calendar with per-room/per-teacher swimlanes | Vertical resource swimlanes for staff; conflict highlights |
| Linear | Cmd-K, single-key actions (C/E/A), contextual right-click as shortcut tutor | Cmd-K palette w/ fuzzy match across staff/students/events; right-click menus that expose hotkeys |
| Notion Calendar (Cron) | 69+ shortcuts, N to create, G to go-to-date, Z timezone peek | Arrow-key event navigation, N-to-create-at-cursor, week-jump hotkeys |
| Cal.com | Availability blocking + clear empty-state scheduling slots | Auto-blocking visual: subtle hatched fill for unavailable, no extra chrome |
| Google Calendar | Drag-resize, recurrence editing, "this and following" recurrence prompt | Borrow recurrence-edit modal vocabulary; do not borrow color-overload |

## 3. Patterns to Adopt (concrete, 1–2 file scope)
1. **Cmd-K command palette** — single component, fuzzy-match on staff/student/event titles; reuse existing route IDs so selection navigates via the router. Show the hotkey for each result.
2. **Single-key actions on focused event** — `E` edit, `D` duplicate, `R` reschedule, `Del` cancel. Focus ring on the event in week view; arrow keys move focus across the grid.
3. **Hover-card on events** — student name, teacher, room, derived comp amount. Read-only, no click required. Two-line max.
4. **Tabular-numeral money + time** — JetBrains Mono only on numerics in tables; Inter/Heebo elsewhere. Right-align money columns even in RTL (numbers stay LTR).
5. **Conflict + unavailability surface** — subtle hatched fill for unavailable, lacquer-red 1px left border on conflicting events. No toast, no modal.
6. **"What changed" affordance** — when an event is edited, highlight the affected cell with a 600ms umber wash. Single CSS transition, no library.
7. **Density toggle** — Compact/Comfortable, persisted per-user. One CSS variable swap.

## 4. Anti-Patterns to Avoid
- Rainbow per-teacher event colors — looks lively, destroys scannability. Use one accent + neutral fills.
- Modal-on-click for every event — admins edit dozens/day. Inline + keyboard wins.
- Drag-and-drop as primary reschedule path without keyboard equivalent — slow on dense weeks.
- Animated transitions over 200ms — operator tools feel sluggish fast.
- Hiding totals behind tabs/drawers — comp/billing summaries should be glanceable from the calendar surface.

## 5. Bilingual / RTL Considerations
- Mirror the week grid in RTL (Sunday on the right for Hebrew weekday-weekend convention) but keep numerics LTR — money, times, durations render left-to-right inside RTL rows.
- Use logical CSS properties (`margin-inline-start`, `padding-inline-end`, `border-inline-start`) so the lacquer-red conflict border auto-flips. Audit any `left/right` literals.
- Icons with directional meaning (chevrons, arrows, undo) must mirror; brand glyphs must not. Budget one Hebrew-reader review pass on each iteration.

## 6. Accessibility Floor
- Visible keyboard focus on every interactive element; never `outline: none` without replacement.
- WCAG AA contrast (4.5:1 text, 3:1 UI) — verify lacquer-red on bone backgrounds; provide a non-color cue for every color signal (icon, weight, hatched fill).
- Full keyboard reachability for create/edit/cancel flows; Esc closes overlays; Tab order matches visual order in both LTR and RTL.
- `aria-live="polite"` for "what changed" announcements; respect `prefers-reduced-motion` on the umber wash.
