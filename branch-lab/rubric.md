# Cadenza Branch Lab Rubric — bl01

Score each axis 0–3. Floor: **audience fit ≥ 2 AND usefulness ≥ 2**.

Cadenza-specific definitions — the rubric is calibrated for an internal admin tool serving music-school operators (schedulers, billing, registrars). Iterations targeting raw musician/composer UX are out of scope.

## Axes

### Audience fit (0–3)
Does this make a conservatory admin's day visibly better — calendar dense weeks, hours/payroll cycles, onboarding new staff, conflict triage?
- 0: Targets a different user (musician composing, end-student, marketing).
- 1: Marginal — touches admin surface but no admin actually feels it.
- 2: A frequent admin will notice within one week of use.
- 3: Re-shapes a recurring admin task; you'd feel its absence within a day.

### Usefulness (0–3)
Time saved, errors avoided, or a previously-impossible thing made possible.
- 0: Zero behavioral effect.
- 1: Cosmetic only.
- 2: Saves seconds per common interaction OR avoids a class of small mistakes.
- 3: Saves whole minutes per session OR removes a known friction point in a recurring workflow.

### Clarity (0–3)
Does the UI tell the truth at a glance about state, conflict, role, time? Designed for both en-US and he-IL with parity.
- 0: New ambiguity introduced.
- 1: Same as before.
- 2: A specific confusion is now resolved.
- 3: Information that previously required digging is now visible at the right altitude.

### Workflow efficiency (0–3)
Fewer clicks, less mode switching, keyboard-first where natural. Calendar density preserved (2px micro-grid).
- 0: Adds steps.
- 1: Neutral.
- 2: Removes a click or one mode switch in a common path.
- 3: Removes a multi-step detour or unlocks keyboard-only completion of a common task.

### Visual hierarchy (0–3)
Honors design.md: bone neutrals carry surface; lacquer accent restrained; status semantics categorical; warm not blue-slate; no SaaS pillows; calendar grid clean (no texture).
- 0: Adds noise; lacquer overused; bright decorative color.
- 1: Neutral.
- 2: Tightens hierarchy on one surface.
- 3: Restores a design.md principle that was violated and the surface now reads correctly.

### Accessibility (0–3)
Internal admin tool floor: keyboard reachable, focus visible, semantic landmarks/labels, contrast ≥ AA on text, RTL parity.
- 0: Regresses (focus trap, missing labels).
- 1: Same as before.
- 2: One specific axe issue fixed (e.g. missing aria-label, low-contrast hover).
- 3: Surface goes from "broken with keyboard" to fully navigable, or RTL parity restored where it was missing.

### Reliability (0–3)
No new error states. Network/Firestore boundaries untouched in this run.
- 0: Adds a regression risk in the data path.
- 1: Same as before.
- 2: Reduces a class of UI state bugs (stale render, unsynced toggle).
- 3: Eliminates a documented failure mode without backend changes.

### Novelty (tasteful) (0–3)
Bold but on-brand. "Bone & lacquer" voice, operator-console feel, not indie-SaaS.
- 0: Off-voice or trend-chasing.
- 1: Standard pattern done correctly.
- 2: Surprising but right — feels like Cadenza, not a competitor.
- 3: Defines a new pattern other surfaces will adopt.

### Implementation risk (3 = low risk)
- 0: Touches ≥3 files including data/persistence boundaries.
- 1: Touches 3+ files, all UI.
- 2: Two files, UI only.
- 3: One file, UI only.

### Reversibility (3 = single-commit revert)
- 0: Multi-step migration; revert requires schema/data fixup.
- 1: Multi-commit; cherry-pick possible.
- 2: Single commit but interacts with shared resource (i18n keys consumed).
- 3: Pure single-commit revert with no residue.

## Scoring discipline

- Score the **planned** candidate before dispatch (composite + floor).
- Score the **actual implementation** post-worker (iteration-N-score.md).
- If actual < planned by ≥ 4 composite OR drops below floor: do not commit. Patch in place or revert and try the next candidate.
- Two consecutive sub-floor iterations halts the run (orchestrator §10).

## Anti-rubric (auto-FAIL)

- Touches backend / DB schema / auth / payment routes.
- Modifies any file in `dirty-on-arrival.txt` (none this run).
- Pure copy polish, log-line tweak, or refactor with no user-visible change — unless it unlocks a larger product move in the same iteration.
- Adds rainbow palette, bounce animation, or breaks design.md tokens.
