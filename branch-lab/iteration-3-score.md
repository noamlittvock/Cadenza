# Iteration Score Card

- Run ID: bl01-2026-05-04-1522
- Iteration N: 3
- Title: Sticky table headers — Staff Members + Rooms
- Files changed: `components/StaffMemberManager.tsx`, `components/RoomManager.tsx` (CSS-only)
- Commit SHA: TBD

## Hypothesis (verbatim from wave plan)

Music-school admins routinely scroll 50+ rows of staff or rooms; the column header scrolls off-screen, so they lose track of which column they are reading. Apply `position: sticky; top: 0; z-10` to header cells in both managers.

## What Was Actually Implemented

CSS-only on both files. Worker correctly identified that `position: sticky` on `<thead>` is finicky cross-browser and instead applied `sticky top-0 z-10 bg-... shadow-sm` per `<th>`. Cleaned up redundant sticky classes that had been on `<tr>` in StaffMemberManager (sticky cells need their own backgrounds — `<tr>` backgrounds don't paint behind sticky children, a real cross-browser pitfall). In RoomManager, swapped wrapper `overflow-hidden` → `overflow-clip` because `overflow-hidden` neutralizes sticky by establishing a non-scrolling sticky containing block — the swap clips visually the same way without breaking sticky binding to page scroll. No copy edits, no behavior changes.

## Rubric Scores

| Axis | Score | Justification |
|---|---|---|
| Audience fit | 3 | Anyone scrolling a long roster benefits — common admin path |
| Usefulness | 3 | Eliminates a known friction every time a list exceeds the viewport |
| Clarity | 2 | Header context preserved; no new clarity affordance |
| Workflow efficiency | 3 | Removes scroll-to-top + scroll-back ritual |
| Visual hierarchy | 3 | Subtle shadow on stuck header reads correctly; matches existing surface tones |
| Accessibility | 2 | Header remains in DOM order; screen readers unchanged |
| Reliability | 3 | CSS only, no state, no schema |
| Novelty (tasteful) | 1 | Standard pattern, table stakes for admin tools |
| Implementation risk | 2 | Two files but pure CSS; ownership disjoint from other workers |
| Reversibility | 3 | Pure single-commit revert |

**Composite:** 25/30
**Floor axes:** audience fit = 3, usefulness = 3
**Floor result:** PASS

## Decision

- [x] Ship — both floor axes pass, composite 25 ≥ 14

## Ambition Audit

- Narrowed from bolder? No — sticky header was the move.
- Worth noting: the fix went **deeper than copy-paste sticky utility**. Worker diagnosed real cross-browser pitfalls (sticky on `<tr>` vs `<th>`, `overflow-hidden` containing block) and addressed them. That's craft, not narrowing.

## Visual Evidence

- HTTP probe: `200` at http://localhost:3001/.
- Sticky behavior is scroll-driven; cannot be exercised via curl. Manual scroll test deferred to user.
- Tailwind classes `sticky top-0 z-10` + bg + shadow are project-standard utilities used elsewhere.

## Residuals

- Wide-table horizontal scroll case not addressed (no frozen first column) — neither manager has a horizontal scroll on desktop, so non-issue at present densities.
- The `overflow-hidden` → `overflow-clip` swap in RoomManager is a one-token tailwind change but worth user QA to confirm rounded-corner clipping still reads correctly.
