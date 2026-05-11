# Claude Code Skill Pipeline — Workflow Report

Generated: 2026-03-09
Version: 8-skill pipeline (post-chaos-sweep addition)
Source: `~/.claude/CLAUDE.md` + `~/.claude/skills/*/SKILL.md`

---

## Section 1: Pipeline Overview

The Claude Code Skill Pipeline is a structured workflow for AI-assisted software development that governs how code is planned, built, audited, debugged, and reflected upon. It consists of 8 discrete skills plus 3 always-on background systems, orchestrated through two primary tracks (Bug/QA and Planned Work) and a routing table for standalone invocations.

The pipeline enforces a principle: diagnose before you act. Multiple skills are read-only analysis tools that produce structured reports consumed by downstream execution skills. No skill modifies code without explicit user confirmation, and the pipeline never auto-invokes — Claude suggests the appropriate entry point and waits.

End-to-end sequence for a complete development cycle:

```
Plan → Build → Quality Review → Adversarial Discovery → Fix → Structural Analysis → Reflect
```

Mapped to skills:

```
session-chunker → [code written] → simplify → chaos-sweep → qa-debug-session → reverse-engineer → session-retrospective
```

Not every project uses every skill. The pipeline is modular — skills are invoked individually or in chains depending on the work type.

---

## Section 2: Always-On Background Systems

These three systems run continuously in every session. They are not invoked — they are embedded in Claude's global instructions and apply regardless of which skills are active.

### 2.1 Defensive Coding Rules

**Invocation type:** [Automatic]
**What it does:** Prevents common bugs at code-creation time by enforcing guards on external data boundaries.
**Key rules:**
- Array props from external sources (Firestore, APIs, localStorage) must be defaulted to `[]` at the top of the consuming component before any `.map()`, `.forEach()`, `.length`, or spread operation.
- Object props from external sources must use optional chaining (`?.`) or be defaulted at the top.
- `replace_all: true` in the Edit tool is only safe when the target string is unique to one lexical scope. Multi-scope files require per-scope replacement.

**Scope:** Applies when writing new code. Does not apply when patching existing code (that falls under qa-debug-session).

### 2.2 Retro Notes

**Invocation type:** [Automatic]
**What it does:** Captures anomalies during any session by writing `[RETRO NOTE]` markers inline in Claude's response text. A Stop hook (`retro-logger.py`) appends these markers to `.claude/retro-log.jsonl` on disk.
**Triggers:** Fix declared complete but still broken, retried approach, wrong-file diagnosis, self-inflicted errors from tool misuse, scope violations, wrong assumptions, unverified acceptance criteria.
**Why it matters:** Retro notes survive context compaction because they are persisted to disk. The session-retrospective skill reads this log as its primary evidence source. Without retro notes, the retrospective has no structured data to work from.

### 2.3 Git Workflow

**Invocation type:** [Automatic]
**What it does:** Manages commit timing, message format, and push protocol. Auto-initializes git repos when source files exist without `.git`. Commits after phase completions, verified behaviors, architecture decisions, bug fixes, and refactors. Pushes after phase-completion commits with user confirmation.
**Key constraint:** Never force-pushes to main. Never commits intermediate edits, debug-only changes, or code that doesn't build.

---

## Section 3: The 8 Skills — Step-by-Step Breakdown

### 3.1 redundancy-auditor

**Invocation type:** [Claude-invoked] within pipeline tracks, or [User-invoked] standalone
**Purpose:** Structural pre-analysis that detects duplicate logic, conflicting data sources, and unclear ownership across modules before code is written or bugs are fixed.
**Required or optional:** Optional. Invoke when the symptom involves value divergence across views, a fix that didn't propagate, 3+ files touched by one issue, or a spec with cross-module rules and shared state. Skip for isolated single-file bugs with a clear cause or specs that are already clean and bounded.

**What triggers it:**
- User says "check for redundancies", "look for conflicts", "who owns X"
- During QA: a regression hints at two systems doing the same job
- Pipeline: invoked before qa-debug-session when symptoms suggest structural cause

**What it produces:**
- Input classification (spec-section, feature-description, codebase-context, bug-report)
- Issues report with three problem types: DUPLICATE, CONFLICT, OWNERSHIP
- Summary table with severity and decision requirements
- Clean bill of health for problem types not found

**Output consumed by:** qa-debug-session (structural findings inform the bug fix plan), session-chunker (structural issues affect chunk boundaries)

---

### 3.2 qa-debug-session

**Invocation type:** [User-invoked]
**Purpose:** The primary bug-fixing skill. Takes freeform notes describing bugs, structures them into a verified execution plan, then implements all fixes in sequence with acceptance criteria and regression tracking.
**Required or optional:** Required for all bug/QA work. This is the execution engine of the Bug/QA track.

**Phases:**

**Phase 0 — Intake & Challenge** [Claude-invoked, within the skill]
Claude reads the bug notes critically. Challenges assumptions, proposes better approaches, asks one clarifying question at a time. Does not plan fixes yet. Waits for all challenges to resolve before proceeding.

**Phase 1 — Structure the Notes** [Claude-invoked, within the skill]
Extracts numbered issues with title, priority, description, affected files, acceptance criteria, and verification steps. Builds a dependency map, regression watch list, execution order, out-of-scope list, and gaps list. Presents the full plan and waits for user confirmation.

**Phase 2 — Build** [Claude-invoked, within the skill]
Works through issues in confirmed order. For each issue: announces, re-reads referenced code, invokes trace-before-fix for data-flow bugs (mandatory), implements, self-checks acceptance criteria, and reports using a structured format. Does not move to the next issue until the report is complete.

**Phase 3 — Sign-Off** [Claude-invoked, within the skill]
Verifies every regression watch list item. Presents a session sign-off with pass/fail for all issues, regressions, scope adherence, and new issues found.

**Key rules:**
- External diagnoses (from user, another AI, or teammate) are hypotheses, not facts — must be independently traced before implementing.
- "Compiles" is not an acceptance criterion for data-flow bugs — must trace the full round-trip.
- Inconclusive root cause: if the code path looks correct but the bug exists, state "Root cause not confirmed" rather than marking as fixed.
- Stale-bug rule: bugs surviving 2+ sessions get a fresh first-principles trace — all inherited hypotheses are discarded.

**What triggers it:**
- User pastes bug notes, QA findings, or says "things are broken"
- chaos-sweep report is handed off for fixing
- Routing table match

**What it produces:** Fixed code, structured reports per issue, session sign-off, new issues list for carry-forward.

**Output consumed by:** session-retrospective (sign-off and new issues feed the retro), session-chunker (if the issue queue is too large for one session)

---

### 3.3 trace-before-fix

**Invocation type:** [Claude-invoked] within qa-debug-session Phase 2, or [User-invoked] standalone
**Purpose:** A mandatory pre-implementation diagnostic checkpoint for data-flow bugs. Forces a structured 5-question trace from UI to state to persistence to listener to default value before any code is written.
**Required or optional:** Mandatory for any bug where the symptom involves state not updating, clearing, persisting, or values diverging between views. Skippable for cosmetic, layout, translation, or purely additive bugs. Skipping it on a qualifying bug is a retro-notable event.

**The 5-question trace:**
1. RENDER — What component displays the wrong value? (exact component and prop/state variable)
2. SOURCE — Where does that value come from? (trace backward: prop → parent → hook → state declaration)
3. PERSISTENCE — Where is it stored and how is it written? (persistence layer and exact write call)
4. LISTENER — What happens when the stored value changes or is deleted? (subscription/effect behavior on absent value)
5. DEFAULT — What is the fallback value, and is it actually empty? (hardcoded defaults that silently re-seed data)

**Decision gate:** If trace confirms hypothesis → proceed. If trace reveals different cause → update diagnosis. If trace is inconclusive → flag the gap and ask user.

**What triggers it:**
- qa-debug-session Phase 2 encounters a data-flow bug
- User describes a single data-flow bug ("X isn't updating") — runs standalone
- Routing table match for single data-flow symptoms

**What it produces:** A 5-item checklist confirming or refuting the diagnosis. No code changes — read-only.

**Output consumed by:** qa-debug-session (trace results determine the fix approach)

---

### 3.4 session-chunker

**Invocation type:** [User-invoked] or [Claude-invoked] within pipeline tracks
**Purpose:** Breaks large implementation plans into context-safe execution chunks before any code is written. Writes a state file to disk at every chunk boundary so context compaction is lossless.
**Required or optional:** Required for all large planned work (spec builds, feature overhauls, UI overhauls, data migrations, multi-module dependency chains). Optional for bug/QA — invoke only when the confirmed issue queue is too large for one session. Skip for hotfixes, small features, or single-file changes.

**Phases:**

**Phase 0 — Classify and Intake:** Identifies input type (spec-build, qa-debug, feature-overhaul, ui-overhaul, data-migration, dependency-chain), enumerates work items, identifies ordering constraints.

**Phase 1 — Input-Type Rules:** Applies type-specific constraints. UI overhauls get a scope lock (discovered work is deferred, never absorbed). Data migrations enforce strict ordering (migrate → update reads → update writes → verify). Dependency chains prohibit mid-chain splits. Spec builds require completeness check first.

**Phase 2 — Size and Chunk:** Assigns complexity tiers (S/M/L/XL) to each item. Groups into chunks respecting size limits (max 1 XL, 2 L, 5 M, or 10 S per chunk). Validates chunk boundaries against dependency and migration constraints.

**Phase 3 — Produce Chunk Plan:** Outputs the full plan with items, estimated load, dependencies, scope lock status, and end conditions per chunk. Waits for user confirmation.

**Phase 4 — State File Protocol:** Writes `.claude/session-state.md` before each chunk boundary. Contains completed items, acceptance criteria, remaining queue, deferred items, open decisions, regression watch, scope lock violations, and next chunk instructions.

**Phase 5 — Chunk Boundary Prompt:** At each chunk end, presents completion summary, state file location, next chunk preview, and compaction instructions. Never auto-compacts.

**Phase 6 — Resuming:** New session reads state file, confirms completed items, states first item of current chunk, and asks "Ready to proceed?" before writing code.

**What triggers it:**
- Pipeline track for large planned work
- User says "break this into chunks" or "too big for one session"
- qa-debug-session produces a large issue queue

**What it produces:** Chunk plan, state files on disk, structured handoff protocol between sessions.

**Output consumed by:** The executing session (state file), session-retrospective (deferred items and scope lock violations)

---

### 3.5 simplify

**Invocation type:** [User-invoked]
**Purpose:** On-demand code quality review that scans changed files against a 6-item checklist and fixes structural issues. Two modes: post-write (primary) and pre-write (lightweight).
**Required or optional:** Optional. Never auto-invoked. Triggered by user command or explicit pipeline step. The session-retrospective skill flags when it was skipped on qualifying code (new components, multi-function changes, 100+ lines added).

**Post-write mode (primary):**

Checklist (6 items):
1. Single responsibility — Function/component does more than one job
2. Unnecessary complexity — Nesting 3+ levels deep, convoluted conditionals, one-time abstractions
3. In-scope duplication — Similar logic repeated in same file or between files touched this session
4. Dead code — Unused variables, unreachable branches, commented-out blocks
5. Magic values — Hardcoded numbers/strings that should be named constants
6. Naming clarity — Vague names like `data`, `temp`, `result`, `handleThing`

Explicit exclusions (handled by other tools/skills): formatting/style, type annotations, documentation/comments, cross-module architecture (redundancy-auditor), data-flow correctness (trace-before-fix).

Output: Structured flag list with severity (HIGH/MEDIUM/LOW), location, description, and suggested fix. Fixes all HIGH and MEDIUM flags immediately. Presents LOW flags for user decision.

**Pre-write mode (lightweight):**

Three questions answered as a short checklist:
1. Reuse — existing pattern or utility that does part of this?
2. Proportionality — proposed structure proportionate to the problem?
3. Responsibility — obvious single-responsibility violations?

**What triggers it:**
- User says `/simplify`, "review this code", "clean this up", "simplify"
- Routing table match

**What it produces:** Flag list with fixes implemented for HIGH/MEDIUM severity.

**Output consumed by:** The codebase directly (fixes are applied), session-retrospective (tracks whether simplify was run on qualifying code)

---

### 3.6 reverse-engineer

**Invocation type:** [User-invoked]
**Purpose:** Read-only diagnosis of working code that has accumulated structural debt through iterative development, QA cycles, or debugging sessions. Extracts what the code actually does, audits for bloat, and surfaces architectural improvements — without modifying anything.
**Required or optional:** Optional. Use after a feature has been through multiple QA/debug cycles and feels tangled, or when the user wants a rebuild spec for organically-grown code.

**Phases:**

**Phase 1 — Decode:** Extracts a Behavioral Summary (purpose, inputs, outputs/side effects, dependencies, edge cases handled). Presents to user and waits for confirmation before proceeding.

**Phase 2 — Bloat Audit:** Scans for 7 categories of accumulated complexity:
1. Debugging residue — console.log, commented-out blocks, TODO notes
2. Patch accumulation — multiple fix layers for the same root issue
3. Over-coupling — logic reaching into another component's concerns
4. Redundant state — state derivable from other state, or set but never read
5. Naming drift — inconsistent naming from mid-session renames
6. Dead paths — conditional branches no longer reachable
7. Workarounds — code compensating for constraints that no longer apply

Findings presented in three tiers: Remove (safe, no behavior change), Simplify (behavior-preserving refactor), Architectural Flag (improvement, requires confirmation).

**Phase 3 — Architectural Flags:** Detailed presentation of each architectural flag with description, cost of keeping it, clean version, and behavior impact assessment.

**Phase 4 — Output:** Two modes:
- Mode A (Diagnosis only) → feeds "Remove" and "Simplify" findings into `/simplify`
- Mode B (Rebuild brief) → structured spec for clean reimplementation, feeds into `session-chunker`

**What triggers it:**
- User says "reverse engineer this", "what does this actually do", "rebuild spec"
- Routing table match

**What it produces:** Behavioral summary + bloat audit + architectural flags. No code changes.

**Output consumed by:** simplify (Mode A findings), session-chunker (Mode B rebuild brief), qa-debug-session (if actual bugs are discovered)

---

### 3.7 chaos-sweep

**Invocation type:** [User-invoked] — NEVER suggested by Claude
**Purpose:** Adversarial code-level stress test that systematically analyzes code for missing guards, unhandled edge cases, and failure modes. Thinks like a hostile or careless user. Produces a structured Chaos Report.
**Required or optional:** Optional. This is a deliberate, user-commanded action — typically run after a build phase is complete. Claude must never suggest running it, never auto-invoke it, and never treat normal QA conversations as a trigger.

**Phases:**

**Phase 1 — Scope Setup:** Establishes app name/module list, current state, known fragile areas, and access method. If user says "go for it", proceeds with available context.

**Phase 2 — The Attack:** Works through app module by module against 7 attack vectors:
1. Empty & Missing Inputs — unguarded `.map()`, `.length`, destructuring on absent data
2. Boundary & Overflow Values — missing min/max validation, length limits, special character sanitization
3. Wrong-Type Inputs — type coercion at system boundaries (API responses, URL params, localStorage, Firestore)
4. Unexpected Navigation & State — missing prior-state checks, no dirty-state guards, delete without cascade logic
5. Workflow Skipping — features depending on uncompleted setup steps, missing empty-state handling
6. Rapid Repetition — missing debounce/loading guards on submit handlers, duplicate-creation risk
7. Permissions & Roles — missing route guards, client-side-only permission checks, destructive actions without confirmation

**Phase 3 — Chaos Report:** Structured output with Summary, Failure Log (table with module, description, attack vector, severity, code location), Top Priorities for QA (3-5 ranked items), Needs Manual Testing (runtime-only issues), and Assumptions Made.

**Phase 4 — Handoff:** Offers to either start a QA session immediately using the report (feeds into qa-debug-session) or give the report to the user for review first.

**What triggers it:**
- User says "chaos sweep", "atom bomb the app", "try to break it", "stress test", "run the chaos sweep"

**What it produces:** Chaos Report with failure log and prioritized QA handoff list. No code changes — read-only analysis.

**Output consumed by:** qa-debug-session (Chaos Report becomes the bug list)

---

### 3.8 session-retrospective

**Invocation type:** [User-invoked]
**Purpose:** Structured end-of-session audit that surfaces concrete, actionable flags for skill creation or refinement. Reads the retro log, conversation context, and prior retro flags to produce a ranked flag list.
**Required or optional:** Required at the end of every meaningful session (QA run, feature build, spec session). Always triggered explicitly by the user.

**Phases:**

**Phase 1 — Session Scan:**
1. Reads `.claude/retro-log.jsonl` (primary evidence source — retro notes captured by the Stop hook)
2. Reads `.claude/retro-flags.md` (cross-session flag persistence with OPEN/RESOLVED status)
3. Reads conversation context for higher-level patterns
4. Evaluates against axes: regression introduction, spec deviation, ambiguous done criteria, skipped dependency validation, scope creep, repeated clarification loops, missing rollback practice, incomplete implementation, structural audit skipped, data-flow trace skipped, code quality review skipped, and preventive practice opportunities

**Phase 2 — Flag List Output:**
- Two groups: Group A (Existing Skill Refinements) and Group B (New Skill Candidates)
- Three severities: High (regression, data loss, broken feature, significant rework), Medium (inefficiency, partial failure, repeated pattern), Low (minor deviation, informational)
- Each flag classified as App-agnostic or App-specific
- Redundancy filter: checks whether a flag is already covered by an existing skill rule before proposing a new one
- Persists new flags to `.claude/retro-flags.md` with OPEN status

**Phase 3 — Branching Into Action:**
Offers to act on one flag at a time — either drafting edits to an existing skill ("Refine existing") or creating a new SKILL.md ("New skill needed").

**What triggers it:**
- User says "let's do a retro", "wrap up", "session retrospective", "what went well", "audit this session"

**What it produces:** Ranked flag list, updated retro-flags.md, optional skill edits or new skill drafts.

**Output consumed by:** Skill files (edits or new skills), `.claude/retro-flags.md` (persistent cross-session memory)

---

## Section 4: Pipeline Tracks

### Track 1: Bug/QA Pipeline

```
[redundancy-auditor] → qa-debug-session → [session-chunker] → session-retrospective
                              ↑
                     trace-before-fix (within Phase 2, for data-flow bugs)
```

| Step | Skill | Required? | Condition to invoke | Condition to skip |
|------|-------|-----------|--------------------|--------------------|
| 1 | redundancy-auditor | Optional | Value correct in one view but wrong in another; fix didn't propagate; 3+ files touched by one issue | Isolated single-file bug with clear cause |
| 2 | qa-debug-session | Required | Always — this structures the bug list and produces the plan | Never skipped for bug/QA work |
| 2a | trace-before-fix | Conditional | Within Phase 2: symptom involves state not updating, clearing, persisting, or values diverging | Cosmetic, layout, translation, or purely additive bugs |
| 3 | session-chunker | Optional | Confirmed issue queue too large for one session | Small or focused bug lists |
| 4 | session-retrospective | Required | Always, at end of session | Never skipped — user triggers explicitly |

### Track 2: Planned Work Pipeline

```
[redundancy-auditor] → session-chunker → session-retrospective
```

| Step | Skill | Required? | Condition to invoke | Condition to skip |
|------|-------|-----------|--------------------|--------------------|
| 1 | redundancy-auditor | Optional | Spec has cross-module rules, shared state, or derived fields; arrives from external source without prior structural review | Spec is already clean and bounded |
| 2 | session-chunker | Required | Always for large planned work | Never skipped for qualifying work |
| 3 | session-retrospective | Required | Always, at end of session | Never skipped — user triggers explicitly |

### Standalone Skills (Routing Table Only)

These skills are not part of either pipeline track. They are invoked individually via the routing table when the user's input matches a trigger phrase.

| Skill | Trigger phrases | Downstream connection |
|-------|----------------|----------------------|
| trace-before-fix | "X isn't updating" (standalone single-bug mode) | May escalate to qa-debug-session |
| simplify | "review this code", "clean this up", "simplify" | None — terminal |
| reverse-engineer | "reverse engineer this", "what does this actually do", "rebuild spec" | Feeds into simplify (Mode A) or session-chunker (Mode B) |
| chaos-sweep | "chaos sweep", "try to break it", "stress test" | Feeds into qa-debug-session |

---

## Section 5: Branching Logic and Decision Points

### Decision Point 1: Pipeline Track Selection

When the user describes work, Claude matches against the routing table:
- Bug/defect description → Track 1 (Bug/QA)
- Large planned work → Track 2 (Planned Work)
- Specific trigger phrase → Standalone skill
- No match → Proceed normally without skill invocation

Claude suggests the entry point and waits for confirmation. Never auto-invokes.

### Decision Point 2: redundancy-auditor Gate

At the start of both tracks, Claude evaluates whether redundancy-auditor is warranted:
- YES if: cross-view value divergence, non-propagating fixes, 3+ file scope, cross-module specs
- NO if: isolated bug, bounded spec, clear single-file cause
- Claude states recommendation and waits for confirmation

### Decision Point 3: trace-before-fix Gate (within qa-debug-session Phase 2)

For each issue in the execution queue:
- Data-flow symptom (state not updating/clearing/persisting/diverging) → MANDATORY trace
- Non-data-flow symptom (cosmetic, layout, translation, additive) → SKIP trace
- Skipping on a qualifying bug is automatically flagged as a retro-notable event

### Decision Point 4: session-chunker Gate

After the issue queue or plan is confirmed:
- Queue/plan too large for one session → INVOKE session-chunker
- Queue/plan fits in one session → SKIP, proceed directly to execution

### Decision Point 5: reverse-engineer Output Mode

After completing the bloat audit:
- User wants incremental fixes → Mode A (diagnosis feeds into simplify)
- User wants a clean rebuild → Mode B (rebuild brief feeds into session-chunker)

### Decision Point 6: chaos-sweep Handoff

After delivering the Chaos Report:
- User wants immediate QA → Option A (Top Priorities fed into qa-debug-session)
- User wants to review first → Option B (report delivered, QA deferred)

---

## Section 6: Use Cases

### Use Case 1: Standard QA Run

A user pastes a list of 5 bugs from manual testing. Two are data-flow issues, three are cosmetic.

**Flow:** User input → routing table matches "things are broken" → Claude suggests `qa-debug-session` → user confirms → Phase 0 challenges assumptions and asks one clarifying question → Phase 1 structures issues into execution order → user confirms plan → Phase 2 builds fixes (data-flow bugs get mandatory `trace-before-fix`; cosmetic bugs skip it) → Phase 3 sign-off → user triggers `/session-retrospective` → retro reads retro log and produces flag list.

**Skills invoked:** qa-debug-session, trace-before-fix (2x, within Phase 2), session-retrospective
**Skills skipped:** redundancy-auditor (isolated bugs), session-chunker (5 bugs fits in one session), simplify (QA session, not a code review), chaos-sweep (not commanded), reverse-engineer (not commanded)

### Use Case 2: Large Feature Build from Spec

A user provides a 30-page spec for a new multi-module feature with shared state between 4 components.

**Flow:** User input → routing table matches "large spec, feature build" → Claude suggests `session-chunker` + `redundancy-auditor` (cross-module) → user confirms → redundancy-auditor scans spec for duplicate logic, conflicting data sources, and ownership issues → findings inform the plan → session-chunker classifies as spec-build, flags any TBD sections, assigns complexity tiers, produces chunk plan → user confirms → execution begins chunk by chunk with state files at each boundary → after all chunks complete → user triggers `/session-retrospective`.

**Skills invoked:** redundancy-auditor, session-chunker, session-retrospective
**Skills skipped:** qa-debug-session (no bugs yet), trace-before-fix (no data-flow bugs), simplify (could be run per-chunk if user commands), chaos-sweep (not commanded), reverse-engineer (not commanded)

### Use Case 3: Post-Build Adversarial Test + Fix Cycle

A user completes a major build phase and commands "chaos sweep the calendar module."

**Flow:** User command → routing table matches "chaos sweep" → chaos-sweep Phase 1 scopes to calendar module → Phase 2 runs 7 attack vectors against the code → Phase 3 produces Chaos Report with failure log and priorities → Phase 4 offers handoff → user chooses Option A (immediate QA) → Top Priorities fed into qa-debug-session as bug list → qa-debug-session runs full Phase 0-3 cycle → user triggers `/session-retrospective`.

**Skills invoked:** chaos-sweep, qa-debug-session, trace-before-fix (for any data-flow findings), session-retrospective
**Skills skipped:** redundancy-auditor (unless findings suggest cross-module issues), session-chunker (unless issue list is large), simplify (different concern), reverse-engineer (different concern)

### Use Case 4: Code Quality Review After Feature Implementation

A user finishes implementing a feature and says "simplify this."

**Flow:** User command → routing table matches "simplify" → simplify runs post-write mode → scans changed files against 6-item checklist → produces flag list → fixes all HIGH and MEDIUM flags → presents LOW flags for user decision → done.

**Skills invoked:** simplify
**Skills skipped:** All others — simplify is a terminal standalone skill. If simplify notices cross-module duplication, it notes "consider running redundancy-auditor" but does not diagnose it. If it notices a data-flow bug, it notes "consider running trace-before-fix" but does not diagnose it.

### Use Case 5: Edge Case — Stale Bug With Wrong Inherited Hypothesis

A data-flow bug has survived 3 prior sessions. Each session diagnosed a different root cause and applied a "fix" that didn't resolve it. The user reports it's still broken.

**Flow:** User reports the bug → qa-debug-session Phase 0 recognizes stale-bug pattern → stale-bug rule activates: all inherited hypotheses are discarded → Phase 2 invokes trace-before-fix with a fresh first-principles trace from the UI component backward → trace reveals the actual root cause (a hardcoded default value that silently re-seeds deleted data — Step 5 of the trace) → previous "fixes" were addressing symptoms, not the cause → correct fix implemented → inconclusive root cause rule does NOT apply (root cause is confirmed) → Phase 3 sign-off → retro notes capture the pattern of compounded wrong assumptions.

**Skills invoked:** qa-debug-session, trace-before-fix, session-retrospective
**Key pipeline feature exercised:** Stale-bug rule, DEFAULT step of the trace, retro note emission for wrong-diagnosis pattern

---

## Section 7: Glossary

| Term | Definition |
|------|-----------|
| **Always-on system** | A rule or behavior embedded in CLAUDE.md that applies to every session without explicit invocation. Examples: Defensive Coding, Retro Notes, Git Workflow. |
| **Attack vector** | One of 7 categories of adversarial analysis used by chaos-sweep to find failure modes in code: empty inputs, boundary values, wrong types, unexpected navigation, workflow skipping, rapid repetition, permissions. |
| **Bloat audit** | A categorized scan for accumulated complexity in working code, performed by reverse-engineer. Covers debugging residue, patch accumulation, over-coupling, redundant state, naming drift, dead paths, and workarounds. |
| **Chunk** | A unit of work sized to complete within approximately 60% of the context window, produced by session-chunker. Each chunk has defined items, estimated load, dependencies, and end conditions. |
| **Complexity tier** | A sizing label (S/M/L/XL) assigned to work items by session-chunker to determine how many items fit in one chunk. |
| **Decision gate** | A mandatory checkpoint in trace-before-fix where the trace results determine whether to proceed with the fix, update the diagnosis, or ask the user. |
| **Deferred item** | Work discovered during execution that falls outside the current chunk's scope. Logged to the state file and addressed in a future chunk. Never absorbed into the current chunk. |
| **Intake** | Phase 0 of qa-debug-session where Claude critically examines bug reports before planning fixes — challenging assumptions, suggesting better approaches, and asking clarifying questions. |
| **Pipeline track** | A predefined sequence of skills invoked for a specific type of work. Track 1 handles bugs/QA. Track 2 handles planned work. |
| **Retro flag** | A finding from session-retrospective, persisted in `.claude/retro-flags.md` with OPEN or RESOLVED status. Flags older than 3 sessions still OPEN are surfaced as stale. |
| **Retro note** | A `[RETRO NOTE]` marker written inline in Claude's response during any session when an anomaly is detected. Captured by a Stop hook and persisted to `.claude/retro-log.jsonl`. |
| **Routing table** | A pattern-matching table in CLAUDE.md that maps user input phrases to suggested skill entry points. Claude suggests but does not auto-invoke. |
| **Scope lock** | A constraint applied during UI overhauls and data migrations (via session-chunker) that prevents discovered work from being absorbed into the current chunk. All new work is deferred. |
| **Stale-bug rule** | A qa-debug-session rule that discards all inherited hypotheses for bugs surviving 2+ prior sessions and forces a fresh first-principles trace. |
| **State file** | A markdown file (`.claude/session-state.md`) written by session-chunker at every chunk boundary. Contains the authoritative record of completed work, remaining queue, and handoff instructions. Survives context compaction. |
| **Trace** | The 5-question diagnostic checklist used by trace-before-fix: RENDER → SOURCE → PERSISTENCE → LISTENER → DEFAULT. Traces data flow from the UI symptom back to the root cause. |

---

## Section 8: Skill Relationship Matrix

This matrix shows how each skill relates to every other skill — whether they collaborate, have boundary rules, or are independent.

| | redundancy-auditor | qa-debug-session | trace-before-fix | session-chunker | simplify | reverse-engineer | chaos-sweep | session-retrospective |
|---|---|---|---|---|---|---|---|---|
| **redundancy-auditor** | — | Runs before; findings inform fix plan | Independent | Runs before; findings affect chunk boundaries | Independent | RE looks at one feature's debt; RA looks at cross-module duplication | Different lens: RA checks structural duplication, CS checks failure paths | Flags when RA was skipped on qualifying bugs |
| **qa-debug-session** | May invoke RA for cross-view bugs | — | Invokes within Phase 2 for data-flow bugs | Feeds issue queue into SC if too large | Independent | If RE finds bugs, hands to QA | CS report becomes QA bug list | Sign-off and new issues feed retro |
| **trace-before-fix** | Independent | Invoked within QA Phase 2 | — | Independent | Independent | Independent | If CS finds data-flow issue, QA invokes TBF when fixing | Flags when TBF was skipped on qualifying bugs |
| **session-chunker** | RA runs before for cleaner boundaries | Feeds confirmed issue queue as input | Independent | — | Independent | RE Mode B feeds rebuild brief into SC | Independent | Deferred items and scope violations feed retro |
| **simplify** | Cross-module duplication is RA's job | Bug fixing is QA's job | Data-flow correctness is TBF's job | Independent | — | RE diagnoses, simplify fixes (Mode A) | Different concerns: simplify=structure, CS=failure modes | Retro flags when simplify was skipped |
| **reverse-engineer** | Run both if feature spans multiple modules | Hands actual bugs to QA | Independent | Mode B feeds into SC | Mode A feeds into simplify | — | Independent | Independent |
| **chaos-sweep** | Independent | CS report → QA bug list | QA invokes TBF for CS-found data-flow bugs | Independent | Independent | Independent | — | Independent |
| **session-retrospective** | Independent | Independent | Independent | Independent | Flags when simplify skipped | Independent | Independent | — |
