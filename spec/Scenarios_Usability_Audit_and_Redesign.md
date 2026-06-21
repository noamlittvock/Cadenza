# Scenario Sandbox Planning — Usability Audit & Redesign Proposal

**Feature audited:** Scenario Sandbox Planning
**Source:** branch `blueprint-supabase`, commit `0355f8b` ("Implement scenario sandbox planning"), PR #1
**Audience for the product:** non-technical managers, secretaries, and coordinators of
mission-driven music organizations. Most have **no technical background**.
**Verdict:** Powerful engine, sound architecture — but the **language, mental model,
and flow are built for engineers**. It will not be usable by the intended audience as-is.

---

## 1. What the feature is (in plain terms)

It is a **"what-if" planning tool**. You can take a copy of the real calendar, rearrange
it freely — move lessons, swap rooms, reassign teachers, add or remove events — *without
touching the live schedule*. When you are happy, you push those changes back to the real
calendar (optionally via an approval request).

That is a genuinely valuable idea for a conservatory: "Let me reshuffle next month before
I commit to it." The problem is **not the concept** — it's how the concept is dressed.

### Where it lives in the code
| Concern | File |
| --- | --- |
| Data model | `types/scenario.ts` |
| Engine (diff / drift / finance / promote) | `utils/scenarioEngine.ts` (458 lines) |
| Calendar grid adapter | `utils/scenarioCalendarAdapter.ts` |
| Setup screen | `components/ScenarioPlanningWorkspace.tsx` (474 lines) |
| Editing screen | `components/SandboxWorkspace.tsx` (642 lines) |
| Persistence | `supabase/migrations/0018_scenario_planning.sql` |
| Navigation | nav item **"Scenarios"** (FlaskConical icon) → `routing.ts` `SCENARIOS`, `constants.ts` i18n |

### The current user journey
1. Open **"Scenarios"** from the nav.
2. In the left rail, type a name and click **+** to create a *Scenario*.
3. Fill out a dense **"Launch setup"** form: *Start mode*, *Excluded records*, start/end
   dates, checkboxes for *Included rooms*, *Activity filters*, *Staff filters*, an *Event
   tags* text box, plus a note about *Editable / Reference-only collections*.
4. Click **"Open sandbox"** → a **second, separate screen** (the Sandbox) opens, wrapped in
   an amber border with a vertical **"SANDBOX / No live writes"** rail.
5. Edit events in a **Table** or **Grid**; watch **conflicts**, **drift**, and **changed
   records** counters update.
6. Go **back to Planning**, then click **"Request promote"** to send the changes to the
   Admin Inbox as a *Scenario Promote Request*.

---

## 2. Why it feels clunky (evidence, not opinion)

### 2.1 The vocabulary is borrowed wholesale from software engineering
Every load-bearing word in this feature is a **version-control or database term**. A music
teacher or office manager has no mental model for any of these:

| Term shown to the user | Where | What a non-tech user thinks |
| --- | --- | --- |
| **Scenario** / **Sandbox** | everywhere | "A sandbox? Like for children?" |
| **Lens** | setup model | (no meaning) |
| **Start mode: Live snapshot / Blank slate** | `ScenarioPlanningWorkspace.tsx:316-324` | "Snapshot of what? Slate?" |
| **Excluded records: Hidden / Locked context / Ignored** | `:327-335` | "Records? Context? What's the difference between hidden and ignored?" |
| **Editable collections / Reference-only collections** | `:402-404` | "Collections?" |
| **Base snapshot at …** | `:270`, `SandboxWorkspace.tsx:243` | "Base? Snapshot?" |
| **Deltas** ("Edits write to scenario deltas only") | `SandboxWorkspace.tsx:263` | (no meaning) |
| **Drift** ("No stale source records detected") | `SandboxWorkspace.tsx:625-633` | "Drift? Stale?" |
| **changed records** | both screens | "Records?" |
| **Promote / Request promote** | `ScenarioPlanningWorkspace.tsx:303` | "Promote — like a job promotion?" |
| **Scenario stamp**, **Sandbox branch active**, GitBranch icon | `SandboxWorkspace.tsx:262, 603` | (git metaphors, invisible to non-devs) |

This is the single largest source of "clunkiness." The feature is speaking a foreign
language. **Fixing the words alone removes most of the pain** and requires no engine changes.

### 2.2 The flow front-loads configuration the user can't yet reason about
Before doing *anything*, the user must answer **seven setup questions** (start mode,
excluded-records behavior, date range, room checkboxes, activity filters, staff filters,
tags). A non-technical user does not know which rooms or activities to "include" *before*
they have started planning — these are expert filters presented as a mandatory gate.

### 2.3 Two screens that overlap and disorient
"Scenario Planning" and "Sandbox" are **separate full-screen workspaces** that both display
*changed / conflicts / drift*. The user sets up in one, edits in the other, and must
mentally bridge them. The amber border, the vertical `writing-mode: vertical-rl`
**"SANDBOX / No live writes"** rail (`SandboxWorkspace.tsx:225-231`), and the "Planning"
back-button read as developer tooling, not a planning aid.

### 2.4 Counters and panels report machinery, not outcomes
The headline numbers are **"X changed · Y conflicts · Z drift"**. "Conflicts" is
understandable (double-bookings). "Changed" is vague. **"Drift" is meaningless** to the
audience — it actually means *"the real calendar changed underneath your plan since you
started,"* which is important, but is surfaced as a cryptic counter and an amber panel
titled "Drift" reading "No stale source records detected."

### 2.5 Hostile input controls
- **Staff is a native `<select multiple>`** (`SandboxWorkspace.tsx:454-462, 556-565`).
  Multi-select listboxes are one of the most error-prone controls on the web — ctrl/cmd-click
  to multi-select is unknown to most users and impossible to discover.
- **Tags are a raw comma-separated text field** (`ScenarioPlanningWorkspace.tsx:396-401`).
- The grid packs **time inputs + a multi-select + room name** into a ~72px draggable card —
  far too dense to operate confidently.

### 2.6 Destructive / consequential actions lack plain-language guardrails
- Delete uses a bare `window.confirm("Delete \"X\"? Scenario deltas will be discarded.")`
  (`ScenarioPlanningWorkspace.tsx:152`) — again "deltas."
- **"Request promote"** silently disables itself when there are conflicts/drift, with the
  explanation buried in a `title` tooltip. The user sees a greyed-out button and no visible
  reason.

### 2.7 Hebrew / RTL gap
The app is bilingual (`constants.ts` has Hebrew strings; RTL is supported). `nav.sandbox`
is translated literally as **"ארגז חול"** ("sandbox," the children's play-pit) and
`layout.sandbox_badge` likewise. Most other scenario terms have **no Hebrew strings at
all**, so a Hebrew user sees raw English engineering jargon. Any redesign must define the
Hebrew vocabulary deliberately, not transliterate.

---

## 3. The redesign: keep the engine, change the language and the flow

**Principle:** the underlying engine (deltas, diff, drift detection, finance estimate,
promote request) is well-built and should stay. We are redesigning the **surface** — the
words, the order of decisions, and the visual framing — so a non-technical person can use
it by relying on a mental model they already have: **a rough draft you scribble on, then
make official.**

### 3.1 New mental model & name
Stop calling it "Scenarios / Sandbox." Call it what it is:

> **"What-if Plans"** (or simply **"Planning Drafts"**) — *"Try changes to your schedule
> without affecting the real calendar."*

The editing space is just **"draft mode,"** not a separate "sandbox." Think Google Docs
"Suggesting" mode or a pencil draft over a wall calendar.

### 3.2 Vocabulary translation (the highest-impact, lowest-risk change)

| Engineer term (current) | Human term (proposed) | Hebrew (proposed) |
| --- | --- | --- |
| Scenario | **Plan** / What-if plan | תוכנית |
| Sandbox / Sandbox branch | **Draft** (mode) | טיוטה |
| Lens / Launch setup | **What's included** (optional) | מה כלול |
| Start mode → Live snapshot | **Start from the current schedule** | התחל מהלו"ז הנוכחי |
| Start mode → Blank slate | **Start from an empty schedule** | התחל מלו"ז ריק |
| Excluded records: Hidden | **Hide events outside this plan** | הסתר אירועים מחוץ לתוכנית |
| Excluded records: Locked context | **Show them, but don't allow edits** | הצג ללא עריכה |
| Excluded records: Ignored | **Leave them out** | השמט |
| Editable / Reference-only collections | *(remove from UI entirely)* | — |
| Base snapshot at … | **Copied from the live schedule on …** | הועתק מהלו"ז ב־… |
| Delta / changed records | **Changes** / edits | שינויים |
| Drift / stale source | **"The real schedule changed since you started"** | הלו"ז האמיתי השתנה מאז |
| Conflicts | **Double-bookings** / clashes *(keep)* | התנגשויות |
| Promote / Request promote | **Apply to the real calendar** (or **Send for approval**) | החל על הלו"ז / שלח לאישור |
| Finance impact (estimate only) | **Cost & hours preview** | תצוגה מקדימה: עלות ושעות |
| SANDBOX badge | **DRAFT — not live** | טיוטה — לא פעיל |

### 3.3 New flow (progressive disclosure)

1. **Plans list** with a one-sentence, friendly **empty state**:
   *"Try out changes to your schedule — move lessons, swap rooms, add events — without
   touching the real calendar. When you're happy, apply them for real."*
   Each plan card shows: name, the time period in words, and a plain summary
   ("3 changes · 1 double-booking").

2. **Create a plan** asks for the **minimum**: a name and *"Which dates?"* with friendly
   presets — **This month / Next month / Custom**. Default to *start from the current
   schedule*. **No** room/activity/staff/tag/excluded-behavior questions up front.

3. **Land directly in draft mode** — one screen, not two. It should look like the app's
   **real calendar**, with a calm, persistent banner: **"You're editing a draft — changes
   here don't affect the real calendar."** Drop the vertical "No live writes" rail and the
   git iconography.

4. **Advanced filtering is optional and collapsed** behind a **"Refine / Focus on specific
   rooms or teachers"** disclosure — for power users, off by default.

5. **Plain-language status bar**, always visible:
   *"3 changes · 1 double-booking · up to date"* — each term a hover/tap explanation. Replace
   the "drift" counter with an **inline warning that only appears when it happens**:
   *"⚠ The real schedule changed since you started this plan — review before applying."*

6. **One primary action: "Apply to the real calendar."** Clicking it opens a **plain-words
   confirmation**: *"This will move 3 lessons, add 1 event, and cancel 1 event on the real
   calendar. Continue?"* If there are double-bookings, the dialog explains why it's blocked
   in a sentence — never a silently-greyed button. Where approval is required, the same
   button reads **"Send for approval"** and explains who will receive it.

### 3.4 Control fixes
- Replace native multi-select staff pickers with the app's existing **chip / pill
  multi-add** pattern (consistency with the rest of Cadenza).
- Replace the comma-separated **tags** text box with the standard tag chips control.
- Make the draft calendar reuse the **real calendar component** so it looks and behaves
  identically — familiarity is the cheapest form of intuitiveness.
- Replace `window.confirm` with the app's styled confirmation dialog, in plain language.

---

## 4. Recommended phasing

| Phase | Scope | Risk | Impact |
| --- | --- | --- | --- |
| **1 — Re-language** | Rename every user-facing string (English + Hebrew) per §3.2. Pure copy/i18n; **no engine or logic change**. | Very low | **~70% of the clunkiness** |
| **2 — Simplify the flow** | Minimal create dialog with date presets + sensible defaults; collapse advanced filters; merge the two screens (or make setup an optional drawer over draft mode). | Medium | High |
| **3 — Polish the controls** | Chip-based staff & tag pickers; reuse the real calendar component; plain-language confirmation + apply dialog; inline "schedule changed" warning. | Medium | High |

**Phase 1 is recommended to do first and immediately** — it is almost entirely string
changes (`constants.ts` i18n + the labels in the two components), carries near-zero
regression risk, and delivers the largest perceived improvement. Phases 2–3 involve product
decisions (how much filtering to expose, whether to keep the approval/promote step, one
screen vs. two) that are worth confirming before building.

---

## 5. Open questions for product (to settle before Phase 2)

1. **Approval step:** is the "apply to real calendar" meant to require admin approval
   (current "promote request"), or can a manager apply directly? This decides whether the
   button says *"Apply"* or *"Send for approval."*
2. **Filtering depth:** do non-technical users ever need room/activity/staff/tag filters, or
   is "a date range over the whole schedule" enough for 95% of cases? (Drives how much of the
   setup form survives.)
3. **One screen or two:** is there a reason to keep "Planning" and "Sandbox" separate, or
   should setup become an optional panel inside a single draft screen?
4. **Finance preview:** keep the "cost & hours" estimate visible to managers, or hide behind
   an "advanced" toggle?

---

## 6. One-paragraph summary

The Scenario Sandbox feature is architecturally solid but **wears an engineer's vocabulary
and an engineer's workflow**. For managers and secretaries with no technical background, the
words (*sandbox, lens, snapshot, delta, drift, promote, records, collections*) and the
seven-question setup gate make it feel — and look — clunky. The fix is not to rebuild the
engine; it is to **re-language the surface** (Phase 1, immediate, low-risk) and then
**simplify the flow** so the feature reads like what it actually is: *a rough draft of your
schedule that you scribble on and then make official.*
