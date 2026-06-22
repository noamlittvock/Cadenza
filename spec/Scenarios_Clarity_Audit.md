# Staffing & What-if — Clarity / Density Audit (build-agent-ready)

**Surfaces audited:** Staffing Load Planner (`StaffingPlannerWorkspace.tsx`) and the
What-if **Draft** editor (`SandboxWorkspace.tsx`).
**Lens:** not vocabulary (the `Scenarios_Usability_Audit_and_Redesign.md` pass) and
not the playground *feel* (the `Scenarios_Playground_Audit.md` pass) — but
**clarity and density**: can a non-technical scheduler land on a screen, know the
*one* thing to do next, and not be made anxious by verification machinery they
never asked for?

**Verdict.** The engine is sound and the words are humane, but the UI is built to
answer the wrong question. It surfaces *verification* — source labels, per-row
provenance tags, by-teacher/by-room breakdowns, "every figure is traceable" — which
answers *"can I trust what the system did?"*. A non-technical scheduler never asks
that; they ask *"what do I do next?"*. The proof is in the demo: it needs **six
coach-mark captions in 38 seconds**, several of which exist only to reveal hidden
affordances ("Every summary number is clickable", "Click Hours to hire to see the
gaps"). If a tooltip has to tell you a number is a button, the number doesn't look
like a button. **The tour is compensating for the UI.**

**The single highest-leverage move (applies to every finding below):**
> **Demote everything that explains the system; promote the one thing the user
> should do next.** That alone kills about half the demo's captions.

Layer codes (`A` flow/IA, `B` language, `C` affordance, `D` density) come from the
clarity-audit rubric and are kept so findings map back to it.

---

## 🔴 1. The data model is leaking onto the screen
**Layer B1 (jargon).** The "What changed" panel renders raw camelCase field keys to
the user. `SandboxWorkspace.tsx:794`:

```tsx
`Changed: ${item.changedFields.join(', ') || 'details'}`
```

`changedFields` is the raw `Object.keys(delta.patch)` from
`scenarioEngine.ts:258-262`, so a scheduler literally sees **`Changed:
staffMemberIds, start`**. Same family of leaks elsewhere: **"out of date"**
(`SandboxWorkspace.tsx:297`), **"+1h est."** (`:301`), **"read-only events"**. A
scheduler thinks in *teachers, classes, rooms, hours, start times* — not field
names.

**Fix.** Add a presentation-layer translation map (a `fieldLabel()` in the
component or a small shared util — do **not** change `changedFields` in the engine;
`scenarioEngine.test.ts:206` asserts the raw keys). Map each event field to a human
phrase and join them:

| field key | human phrase |
| --- | --- |
| `staffMemberIds` | teacher |
| `start` | start time |
| `end` | end time |
| `roomId` | room |
| `name` | name |
| `recurrenceRule` | repeat pattern |

Render e.g. **"Teacher and start time changed."** Fall back to a generic
"Details changed." for unmapped keys. Audit the same screen for any other raw token
(`est.`, `out of date`) and phrase them as sentences ("estimated", "needs a
refresh because the live schedule moved").

**Done when:** no camelCase or abbreviation appears anywhere a scheduler can read,
and every change line reads as a plain sentence.

---

## 🔴 2. No single "do this next"
**Layer A3 / B5.** On Staffing you land on four equal-weight stat tiles
(`StaffingPlannerWorkspace.tsx:200-208`) plus a teacher list. Nothing dominates —
is the primary action *add a teacher*? *close the gap*? The actual task ("See the
gaps" → close unstaffed hours) is small text inside the "Hours to hire" tile
(`:206`).

**Fix.** Lead with the task, not the dashboard. Above the tiles, render one
sentence + one prominent button driven by `summary`:

- If `summary.totalMissingHours > 0`:
  **"You have {N} unstaffed hours across {M} classes." → `[ Fix staffing → ]`**
  (button jumps to the Recruitment tab; reuse `setTab('RECRUITMENT')`).
- Else if there are teachers not yet settled: point at them.
- Else (fully staffed): a calm success line, no CTA.

The four tiles stay as a secondary, at-a-glance strip below — they're fine as
*supporting* info, just not as the headline. Spoon-feed the next step.

**Done when:** a first-time user, on landing, can say out loud what to do next
without reading any tile.

---

## 🔴 3. Stat tiles are your navigation but don't look clickable
**Layer C2 / B3.** The whole interaction model is "click a number to drill into
what's behind it" (`SummaryStat`, `StaffingPlannerWorkspace.tsx:275-292`), and the
draft repeats it. But the only affordance is a hover-revealed link:
`group-hover:opacity-100` at `:282` — invisible until you happen to mouse over, and
absent entirely on touch. That hidden affordance is *why* the tour has to announce
"every number is clickable."

**Fix.** Give drill-down tiles a persistent affordance: a small, always-visible
`View →` (or `See teachers →`) link/chip in the tile, plus button styling
(border + subtle hover elevation already exists at `:288`). Remove the
`opacity-0 group-hover:opacity-100` so the "→ explain" text is always shown on
clickable tiles. Non-clickable tiles (those without `onClick`, e.g. "Hours
assigned" if it has no destination) must look visibly different — no hover
elevation, no arrow.

**Done when:** clickable vs. read-only tiles are distinguishable at a glance,
with no hover and on touch, and the tour no longer needs to explain it.

---

## 🟡 4. The draft over-warns you into anxiety
**Layer D1 / A10.** The draft signals "you're in a draft" at least six times at
once:

- 6px amber frame — `SandboxWorkspace.tsx:268`
- vertical `DRAFT` / `Not live` rail + flask icon — `:270-276`
- `DRAFT` badge in header — `:285`
- amber-tinted background — `:268` (`bg-amber-50/40`)
- "Draft-only" entity badges — `:40, :341`
- per-row source/provenance tags

That isn't reassurance; it's noise, and over-warning makes a nervous user *more*
nervous, not less.

**Fix.** Keep **one** strong, calm signal: the amber frame **plus** a single
one-line banner ("**Draft of {plan}** — nothing here touches the real calendar").
Remove the vertical `[writing-mode:vertical-rl]` `DRAFT/Not live` rail and the
flask icon (`:270-276`); drop the redundant header `DRAFT` badge (`:285`) **or**
the banner, not both. Demote per-row source tags to a subtle dot shown only on
hover (or remove). Keep "Draft-only" only where it changes behavior (entities that
won't exist after discard), not as decoration.

**Done when:** a user can tell they're in a draft from at most two cues, and the
screen reads calm rather than quarantined.

---

## 🟡 5. The draft editor is doing three jobs on one screen
**Layer D3 (mixed zoom levels).** Bird's-eye metrics (`{events} · {clashes} ·
{out of date} · {+Nh est.}`, `SandboxWorkspace.tsx:292-303`) sit on top of a
granular editable table, which sits beside a permanent "Draft-only people & rooms"
creation card (`:340`) eating vertical space. The eye has no clear landing point —
three altitudes competing at once.

**Fix.**
1. The header metric chips (`:292-303`) **are** impact data — fold them into the
   on-demand **Impact** panel (`:730+`) where they belong, leaving the header with
   just title + the calm draft banner + primary actions (Save / Send for approval).
2. Turn "Draft-only people & rooms" (`:340`) from a permanent card into a deferred
   **`+ Add teacher/room`** action (button → popover/inline form), so the editable
   schedule is the unambiguous focus.

**Done when:** the draft has one clear primary zone (the schedule), with
bird's-eye numbers living in the Impact panel and entity-creation behind a deliberate
"+ Add".

---

## 🟡 6. "Required hours" is a premature, over-explained decision
**Layer A4.** Adding a teacher presents the hours target as a co-equal field to the
teacher picker (`StaffingPlannerWorkspace.tsx:325-328`), and the help text —
*"planning targets you enter for this plan — not payroll contracts"*
(`:311-316`) — is damage control for a confusing field. (It already defaults to
`22` at `:304`, which is good; the problem is *prominence*, not the missing
default.)

**Fix.** Lead with the single required decision — *pick the teacher* — and demote
the hours target: keep the `22` default, but move the input behind an "Adjust hours"
affordance or render it as secondary/optional next to the picker, so a user can add
a teacher in one click without confronting a number first. Shorten the help text to
a tooltip on the field rather than a standing paragraph.

**Done when:** adding a teacher is a one-decision action (choose person → Add), and
the hours target is available but not in the way.

---

## 🟡 7. Two paths to Recruitment
**Layer C4.** "Recruitment" is both a tab (`StaffingPlannerWorkspace.tsx:212`) and
the destination of the "Hours to hire" / "See the gaps" tile (`:206`, which calls
`setTab('RECRUITMENT')`). A novice clicking the number won't be sure they've landed
somewhere different from where they were — minor for experts, disorienting for
first-timers.

**Fix.** Make the relationship obvious: the tile's affordance should name its
destination ("See the gaps in **Recruitment** →"), and on navigation the
Recruitment tab should visibly activate/scroll so the user sees they moved there.
If finding #2's primary CTA also routes to Recruitment, use identical wording so the
two entry points read as the *same* door, not two.

**Done when:** clicking the gap number and clicking the Recruitment tab visibly land
in the same place, and the user understands they did.

---

## What's genuinely right — keep it
- The **sandbox concept** and "nothing here touches the real calendar" instinct are
  correct.
- Opening the **Impact panel on demand** (`SandboxWorkspace.tsx:730+`,
  toggle at `:304-309`) rather than always-on is exactly the right
  progressive-disclosure call.
- The **bank-account balance** metaphor on Teachers (`BalanceBar`, hours-left /
  settled / overdrawn) is intuitive and should stay.

The problem is uniform: the transparency machinery is set to *"always visible, full
prominence"* when it should be *"available, demoted."* Give the verification layer
to the ~10% who go looking for it; give everyone else a clear next step and a calm
screen.

---

## Suggested order
1. **#1 + #3** (jargon + clickable tiles) — pure presentation, lowest risk, and
   together they retire most of the demo captions.
2. **#2** (one "do this next" headline) — highest user-facing payoff.
3. **#4 + #5** (calm the draft, single focus) — chrome removal + moving existing
   metrics into the Impact panel; no engine change.
4. **#6 + #7** (demote required-hours, unify Recruitment) — small polish.

No engine, type, or `ScenarioDelta` changes are required for any item; every fix is
presentation-layer. Do **not** touch `changedFields` in `scenarioEngine.ts`
(covered by `scenarioEngine.test.ts:206`) — translate at render time.
