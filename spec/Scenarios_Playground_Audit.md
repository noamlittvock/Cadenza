# What-if Plans — "Playground" Audit & Suggestions

**Feature audited:** Scenario / What-if Plans (`SCENARIOS` + `SANDBOX` views)
**Lens of this audit:** not the vocabulary (the earlier
`Scenarios_Usability_Audit_and_Redesign.md` already fixed most of that) but the
*feel*: does it work like a **playground** — a place you experiment freely and
**see the consequences of your changes in every view you already trust**?
**Verdict:** The engine is good and the words are now humane, but the feature
**still doesn't feel like a playground**. The draft is a cramped Table/Grid on a
**separate screen** that looks nothing like the real calendar, and there is **no
way to view your projected reality through the lenses you actually plan in**
(calendar Day/Week/Month, a teacher's schedule, a room's day, the cost/hours
impact). You edit in a spreadsheet, not in a world you can role-play.

---

## 0. What's already been fixed (so we don't re-litigate it)

The prior audit's Phase 1–2 have largely shipped:

- Renamed to **"What-if Plans"**, **"Draft"**, **"double-bookings"**, **"out of
  date"**, **"Send for approval"** (`ScenarioPlanningWorkspace.tsx`,
  `SandboxWorkspace.tsx`).
- **Date presets** (This month / Next month / Next 30 days) and a minimal create
  flow (`ScenarioPlanningWorkspace.tsx:44-48, 350-368`).
- Advanced filters **collapsed** behind a "Refine" disclosure
  (`:390-396`), off by default.

So the language is no longer the bottleneck. **The model and the surface are.**

---

## 1. Why it still feels clunky (the playground gap)

### 1.1 Two screens break the "try it and see" loop
Planning lives in `SCENARIOS`; editing lives in a *separate* `SANDBOX` view you
reach via **"Open draft"** (`App.tsx:813-816, 820-863`). A playground is one
continuous space where action and consequence sit together. Here, the place you
*decide* and the place you *do* are different screens, and the summary numbers
("changes · clashes · out of date") are duplicated across both — so you're
constantly bridging two mental contexts instead of playing in one.

### 1.2 The draft is a spreadsheet, not your calendar
This is the heart of the user's complaint. The draft offers only **Table** and a
**bespoke mini-Grid** (`SandboxWorkspace.tsx:273-595`). That grid is a
*reimplementation* — `buildScenarioCalendarLayout` with a hardcoded
**07:00–22:00** window and **one lane per room**
(`scenarioCalendarAdapter.ts:28-30, 76-96`). It does **not** reuse the real
`CalendarView` (full Day/Week/**Month**, filters, Gantt, power tools,
recurrence — `CalendarView.tsx:68, 3518`).

Consequences:
- The "what-if" reality **looks foreign**. The user plans every day in the real
  calendar, then has to reason about their changes in a different-looking grid.
- **No Month view**, no agenda, no filter sidebar, no recurrence expansion in the
  draft — so larger reshuffles are invisible or wrong.
- Each card crams time inputs + a staff picker + room name into a **72px**
  draggable box (`:430`) — too dense to "play" with confidently.

### 1.3 You can only see *one* projection, in *one* shape
Everything in Cadenza derives from events (per `CLAUDE.md`: "Calendar is the
source of truth"). That means a draft's projected events could be viewed as a
**teacher's week**, a **room's day**, a **student's timetable**, or a
**cost/hours impact** — the exact "role-play" views the user is asking for. Today
none of that exists in the draft. The only non-grid lens is a static
**"Cost & hours preview"** card back on the *planning* screen
(`ScenarioPlanningWorkspace.tsx:493-523`), disconnected from where you edit.

### 1.4 You can't see draft-vs-reality side by side
A playground for planning is fundamentally **comparative** — "what does next month
look like *now* vs. *if I do this*?" The engine already computes a clean diff
(`computeScenarioDiff`) and a finance delta (`computeScenarioFinanceImpact`), but
the UI never shows **before/after on the calendar itself**. Changed events get an
amber dot; the user can't glance at "live schedule" beside "my projected
schedule" and feel the difference.

### 1.5 Leftover "lab" framing fights the playground feel
The amber `border-[6px]`, the vertical `[writing-mode:vertical-rl]`
**"DRAFT / Not live"** rail, the **FlaskConical** and **GitBranch** icons
(`SandboxWorkspace.tsx:220-228, 599`) read as *quarantine* ("you are in a
dangerous lab, nothing here is real") rather than *invitation* ("play freely,
nothing here can break"). Same fact, opposite emotional message. A playground
reassures by being **familiar and reversible**, not by being walled off.

### 1.6 Friction against free experimentation
- **No undo / redo** and **no reset-to-live**. Deltas accumulate; the only way
  back is deleting events one by one or deleting the whole plan. Experimentation
  needs a cheap "never mind."
- **No "what would this break?" affordance** beyond raw counters — e.g. moving a
  lesson doesn't surface "this teacher now has a 10-min gap / a double-booking /
  +1.5h this week" inline at the moment of the move.
- Creating an event is a **6-field form bar** (`:300-340`), not a click-on-the-
  calendar gesture you'd expect in a playground.

---

## 2. The core idea: **project reality into the views you already use**

> A what-if plan is just a *lens over the real data*. Anything the app can show
> from live events, it should be able to show from a plan's projected events.

The projected event set already exists: `buildSandboxEventSet(base, scenario,
deltas)` returns the merged "reality if this plan were applied"
(`SandboxWorkspace.tsx:75`). The unlock is to **stop drawing a custom grid** and
instead **pipe that projected set through the app's real view components**, with
edits writing to deltas instead of live events.

### 2.1 Make the draft *be* the real calendar (highest impact)
Render the existing **`CalendarView`** in the draft, fed by the projected event
set, with a `setEvents`-shaped adapter that translates edits into
`ScenarioDelta`s (the move/patch/create/delete logic already lives in
`SandboxWorkspace` and `scenarioCalendarAdapter`). Wins immediately:
- Day / Week / **Month**, filters, Gantt, recurrence — all "for free."
- The draft **looks identical** to where the user plans every day → instant
  familiarity, the cheapest intuitiveness there is.
- Drag-to-move, click-to-create gestures the user already knows.

This is the single change that most converts "spreadsheet" → "playground."

### 2.2 A "view-as" switcher — role-play the projection
Above the draft calendar, a small switcher to re-slice the *same* projected
events into the lenses a planner role-plays in:

| View | What it answers | Derives from |
| --- | --- | --- |
| **Calendar** (Day/Week/Month) | "What does the schedule look like?" | reuse `CalendarView` |
| **By teacher** | "What is Dana's week now?" — gaps, load, clashes | filter projected events by `staffMemberIds` |
| **By room** | "Is Studio A overbooked?" | group projected events by `roomId` (lanes already exist) |
| **By student** *(if modeled)* | "Does this student still have their slot?" | filter by enrollment |
| **Cost & hours** | "What does this plan cost vs. now?" | `computeScenarioFinanceImpact` (already built) |

All read-only re-slices of one projection — low risk, high "role-play" payoff.
Start with **By teacher** and **By room**; they're pure groupings of data we
already merge.

### 2.3 "Live vs. plan" toggle / split
Let the user flip the *same* view between **Live** and **This plan** (and, ideally,
a **split / overlay** that ghosts the live position of any moved event under its
new one). This makes the diff *felt*, not counted. The data is already there:
`liveById` (live) vs. `eventSet.events` (projected), and `computeScenarioDiff`
for the field-level story.

---

## 3. Make it feel like play, not a lab

| Now | Suggestion |
| --- | --- |
| Amber 6px border + vertical "DRAFT/Not live" rail + flask/git icons | A single calm, persistent banner ("**Draft of next month** — changes here don't touch the real calendar · **Reset** · **Apply**"). Drop the quarantine chrome; keep one unmistakable badge. |
| Deltas only accumulate | **Undo / redo** (stack of delta ops) and **"Reset to live"** per-plan. Reversibility is what makes people experiment. |
| Two screens (plan vs. draft) | **One screen.** Setup (dates + Refine) becomes a collapsible panel/drawer over the draft calendar, not a separate destination. The plans **list** stays as the entry point. |
| Create = 6-field form bar | **Click an empty calendar slot** to create (reuse the real calendar's create affordance); keep the form as the fallback. |
| Counters report machinery | Inline, at the moment of action: after a move, a quiet toast/badge — "Dana now teaches 6h this week (+1.5) · no clashes." Consequence where the action happens. |
| "Send for approval" silently disabled | Already improved with an inline banner (`ScenarioPlanningWorkspace.tsx:333-344`) — keep it; ensure it's visible from the draft too, not only the plan screen. |

---

## 4. Suggested phasing

| Phase | Scope | Risk | Payoff |
| --- | --- | --- | --- |
| **A — One screen** | Merge `SANDBOX` into `SCENARIOS`; setup becomes a drawer over the draft. Drop lab chrome → one calm banner. | Low–Med | Removes the context-bridge; immediate "playground" feel. |
| **B — Real calendar in the draft** | Render `CalendarView` on the projected event set; adapter maps edits → deltas. Retire the bespoke mini-grid + `buildScenarioCalendarLayout`. | Med (wiring `setEvents`→deltas) | **Biggest win.** Day/Week/Month + filters + familiarity. |
| **C — View-as + Live/Plan toggle** | "By teacher / By room / Cost & hours" re-slices; Live↔Plan toggle (overlay later). | Med | Delivers the "role-play your projected reality" ask directly. |
| **D — Reversibility & inline consequences** | Undo/redo, Reset-to-live, click-to-create, at-the-moment feedback. | Med | Converts "careful editing" into "free experimentation." |

**Recommended first:** **A then B.** A is mostly moving/merging existing screens
and deleting chrome; B reuses a component that already exists and retires
~200 lines of custom grid. Together they turn the feature from "edit in a
sandboxed spreadsheet" into "play on a copy of your real calendar."

---

## 4b. App-wide: the playground is a *projection layer*, not a calendar feature

The suggestions above are calendar-shaped, but the playground should reach
**every module** (finance, payroll, analytics, students). How the code derives
those modules decides how much is "free" vs. real work.

### What's actually tied to the calendar (and what isn't)
- **Payroll / compensation — calendar-derived.** `PayrollWorkspace` already
  consumes `events` (`App.tsx:1003`), and `hoursEntryService` turns scheduled
  hours into teacher pay. A what-if on the schedule has a *real, computable* cost
  projection. The engine already has a stub: `computeScenarioFinanceImpact`,
  stamped `estimateOnly: true` (`scenarioEngine.ts:367`, `types/scenario.ts:119`).
- **Family billing / tuition — NOT calendar-derived.** Charges in `ledgerService`
  key off `familyId` / `enrollmentId`, never `eventId` (`ledgerService.ts:328-344`);
  `FinanceWorkspace` reads stored `charges`/`payments`/`adjustments`
  (`App.tsx:963-969`). Moving a lesson in a draft changes *payroll cost* but does
  **nothing** to tuition — tuition flows from enrollment, not the schedule.
- **Analytics/reports — entity-derived.** `ReportsWorkspace` runs on a generic
  `sourceRowsByEntity` (`App.tsx:981`); projectable by feeding projected rows.

### Two layers, very different cost
**Layer 1 — Projected *views* of derived data (read-only re-derivation).** Pipe
the plan's projected event set through the services that already exist:

| Module | Feasibility | Why |
| --- | --- | --- |
| Calendar | Free | Just events. |
| **Payroll cost** | Nearly free | `PayrollWorkspace` already takes `events`; recompute hours via `hoursEntryService` on the projected set. |
| Analytics / reports | Medium | Feed projected source rows into the report engine. |
| Family billing | N/A for event-only what-ifs | Decoupled from the calendar by design. |

**Layer 2 — What-if *edits to non-event entities*.** True app-wide play —
"what if we raise tuition 5% / add 10 students / change this teacher's rate?" —
requires **extending the delta model beyond `'events'`** (today
`ScenarioDeltaCollection = 'events'`, `types/scenario.ts:8`) to enrollments,
charges, and comp rules. The derivation services are already **pure functions**
that don't assume the live store (`ledgerService`, `hoursEntryService`), so the
real work is plumbing, not re-math.

### The unifying concept: a `ProjectionContext`
Don't build the playground as a screen — build it as a **projection layer**: one
context holding `(base data + plan deltas)` that exposes the *same shapes the live
app reads* (`events`, derived `hoursEntries`, derived `charges`, report rows). Any
workspace renders against that context instead of the live store. Then the
playground is an app-wide switcher:

> **View this plan in → Calendar · Payroll · Finance · Reports**

Recommended sequencing for the app-wide arc: **Calendar → Payroll cost →
Analytics → (Layer 2) non-event deltas for billing/roster what-ifs.** Payroll is
the first proof that "the schedule playground moves money," because it's the one
financial dimension genuinely derived from the calendar.

### A clear product line to hold
Anything projected from derived data is an **estimate** and must be labelled so
(the engine already stamps `estimateOnly: true`). The playground previews
*consequences*; it never silently writes a charge or a paystub.

---

## 5. Open questions for product

1. **Reuse vs. fork of `CalendarView`:** is `CalendarView` cleanly drivable by an
   injected event set + custom `setEvents`, or does it assume the live store?
   (Determines B's effort — worth a spike.)
2. **Which role-play views matter most** to managers: by-teacher, by-room, or
   cost/hours? (Sequences C.)
3. **Overlay vs. toggle** for Live-vs-plan: is a ghosted before/after overlay
   worth the layout work, or is a simple Live↔Plan toggle enough for v1?
4. **Undo scope:** per-session undo stack, or persistent per-plan history? (Affects
   the delta model.)
5. **App-wide scope:** is v1 the *calendar + payroll-cost* projection (Layer 1, mostly
   reuse), or do we commit to **non-event deltas** (Layer 2 — billing/roster what-ifs)
   that need the delta model extended beyond `'events'`?

---

## 6. One-paragraph summary

The words were fixed; the **feel** wasn't. What-if Plans still drops the user into
a *separate screen* to edit their schedule in a *spreadsheet and a hand-rolled
mini-grid* that look nothing like the calendar they live in — so it reads as a
walled-off lab, not a playground. Because every Cadenza view derives from events,
the fix is mostly **reuse, not new engine**: render the **real calendar** (and
teacher/room/cost re-slices) over the plan's already-computed *projected* event
set, on **one screen**, with **Live-vs-plan** comparison and cheap **undo/reset**.
That is what lets a manager *role-play* next month — see their projected reality in
every view they trust, and experiment without fear.
