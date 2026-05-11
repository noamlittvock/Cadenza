# BUILD PROMPT

Stage 3 of 3 · Specification → Code

*AI App Build System · v3.0 (Cadenza edition) · Paste this prompt + your
Stage 2 spec into an AI coding environment*

---

> **ℹ How This Fits the Workflow**
>
> This is Stage 3 of a three-stage AI-assisted app build workflow.
>
> Paste this prompt and your completed Stage 2 spec together into an AI
> coding assistant (Claude Code, Cursor, Windsurf, etc.).
>
> The spec was produced by Stage 1 and validated against Stage 2's checklist.
>
> This prompt enforces build discipline — the spec provides all product decisions.
>
> This is the Cadenza-edition prompt with section references corrected to match
> the Cadenza v2 Final spec. Do not use the generic v3.0 prompt with this spec —
> the section numbers will not match.

---

## THE PROMPT

Copy everything from the horizontal rule below to the end of this section.
Paste it first, then paste the Stage 2 spec immediately after it.

---

**I am attaching a product specification document produced by a structured AI
discovery session. Read it fully before writing any code or creating any files.**

---

### Step 0 — Before Any Code

Execute ALL of the following and present results in a single response before
touching any code or files:

**0.1** Verify the spec contains all required sections. If any are missing,
stop and report which sections are absent — these are spec defects that must be
resolved before the build begins.

Required sections:
- Product Purpose (Section 01)
- Tech Stack (Section 00.1)
- Glossary (Section 03)
- Open Questions (Section 19)
- Architecture Map (Section 00.2)
- Build Phases (Section 18)
- Scope Magnitude Log (Section 00.3)
- Entity Relationship Map (Section 14)
- State Machines (Section 11)
- Workflow Ownership Table (Section 16)
- Financial Logic Register (Section 17)

**0.2** State your understanding of the product in one sentence. Compare it
explicitly to Section 01 (Product Purpose). If they diverge — even slightly —
flag the divergence and ask for clarification. Do not paraphrase past a mismatch.

**0.3** Restate the confirmed tech stack from Section 00.1. Do not infer or
propose a stack. If Section 00.1 is incomplete, report it as a spec defect and wait.

**0.4** List all phases from Section 18 and their Definitions of Done. This is
your build contract. Flag any phase whose Definition of Done is not verifiable
(e.g. "build the X module" without a completion criterion).

**0.5** State which outputs are Engine (stable logic) and which are Data Layer
(parameterized, evolvable) as defined in Section 00.2. You will apply different
code standards to each.

**0.6** Read Section 19 (Open Questions). For each: state whether it is blocking
or non-blocking. For blocking questions, ask one at a time. For non-blocking,
state your default assumption and proceed.

**0.7 — Entity Audit:** Read Section 14 (Entity Relationship Map). For every
entity listed, confirm that Section 05 (Data Schema) contains a full schema for
that entity. If any entity from Section 14 is missing from Section 05, stop and
report it as a spec defect.

**0.8 — State Machine Audit:** Read Section 11 (State Machines). For every
entity with a status field, confirm that all status values are defined in Section
05's schema AND that all transition triggers are unambiguous. Flag any transition
with no defined trigger.

**0.9 — Workflow Audit:** Read Section 16 (Workflow Ownership Table). For every
workflow listed, confirm that the UI surface exists in the spec and that each
actor's role is defined in Section 03 (Glossary). Flag any workflow with an
undefined UI surface.

**0.10 — Financial Logic Audit:** Read Section 17 (Financial Logic Register). For
every computed field listed, confirm that all source fields exist in Section 05's
schema. Flag any formula referencing a field that is not in the schema. These are
blocking spec defects — the build cannot produce correct financial output without
resolved formulas.

**0.11 — Scope Magnitude Audit:** Read Section 00.3 (Scope Magnitude Log). For
every item classified as Foundation or Blocking, confirm it has a phase assignment
in Section 18 (Build Phases). If any blocking item has no phase, stop and report
it as a spec defect.

---

> **⏸ Checkpoint**
>
> Wait for explicit confirmation before writing any code.
>
> If the user confirms, proceed to Phase 1. If they correct anything,
> update your understanding and confirm again.
>
> If any Step 0 audit found spec defects, do NOT proceed until the user resolves them.

---

### Build Rules — Apply to Every Phase

- Follow the spec's phase order exactly. No skipping ahead.
- Never build UI or polish before core logic is proven.
- Keep Engine and Data Layer concerns separated as Section 00.2 defines.
- Do not add features not in the spec. If you want to suggest one, flag it in
  your phase report and wait for instruction.
- If a feature is in Section 20 (Out of Scope), treat it as a hard constraint —
  do not build it, scaffold for it, or leave a comment pointing toward it.
- Write production-quality code — not scaffolding, not placeholders.
- Include error handling for every edge case in Section 15 of the spec.
- Name every file, function, variable, and data field using Section 03's
  canonical terms — nothing else.
- No commented-out code. No dead imports. No unused variables.
- Engine outputs are hardcoded and tested. Data Layer outputs are parameterized,
  schema-validated, and editable without touching engine code.
- Every status field must implement the state machine from Section 11. Never write
  a freeform status string — always validate against the confirmed enum.
- Every computed value must be implemented exactly as specified in Section 17.
  Never invent or approximate a formula — if the formula is ambiguous, stop and ask.
- Every multi-step workflow must implement the ownership and UI surface logic from
  Section 16. If a UI surface for a workflow step is not specified, stop and ask —
  do not invent one.

---

### Per-Phase Protocol

When instructed to build phase N:

1. Build every step in phase N. Nothing more, nothing less.
2. After building, provide a phase output report in the format below.
3. Flag every decision the spec left ambiguous — even if you made a reasonable call.
4. Do not begin phase N+1 unless explicitly instructed.

---

### Phase Output Report Format

```
PHASE [N] COMPLETE

Built:
• [filename or function] — [what it does in one line]

Spec compliance notes:
• [any decision you made that the spec left ambiguous]
• [any constraint you enforced from Section 20 (Out of Scope)]
• [any state machine transition implemented from Section 11]
• [any financial formula implemented from Section 17]

Definition of Done check:
✓ [step name] — [how it was satisfied]

Entity / Schema compliance:
• [any entity from Section 14 written this phase — confirm schema matches Section 05]

Open Questions surfaced this phase:
• [any new ambiguity discovered during build — flag for user resolution]

Ready for Phase [N+1] on your instruction.
```

---

### Ambiguity Protocol

- Ask one focused, specific question. Never bundle two.
- State what decision you need and why the spec doesn't resolve it.
- If non-blocking: state your default assumption, proceed, and flag in the phase report.
- If blocking: stop and wait. No silent assumptions on blocking questions.

---

> **⚠ Blocking vs. Non-Blocking**
>
> Blocking: different reasonable answers produce materially different code, schema,
> or financial output.
>
> Non-blocking: any reasonable answer produces the same structure — only a constant
> or label differs.
>
> Any ambiguity in a financial formula (Section 17) or state machine transition
> (Section 11) is ALWAYS blocking.

---

### Hard Prohibitions

| Prohibited Action | Required Response |
|---|---|
| Build features not in the spec | Say: "That feature is not in the spec. Want to add it?" |
| Skip the Step 0 pre-flight | Never write code before completing Steps 0.1–0.11 |
| Infer or propose the tech stack | Section 00.1 must specify it — if absent, halt and report |
| Hardcode data-layer values in engine code | Always reference data through the defined interface |
| Proceed past a phase without confirmation | Phase gate is mandatory — not optional |
| Invent reasoning not in the spec | The spec's data is the only permitted source of display text |
| Use names inconsistent with Section 03 | One term per concept — always the Glossary's term |
| Build anything in Section 20 (Out of Scope) | No scaffolding, no stubs, no forward-looking comments |
| Invent a status value not in Section 11 | Stop, report the gap, ask for the correct status value |
| Approximate or modify a financial formula from Section 17 | Stop, report the ambiguity, ask for the confirmed formula |
| Build a workflow step with no UI surface in Section 16 | Stop, report the gap, ask where this step lives in the UI |
| Write to an entity field not defined in Section 05 | Stop, report the missing field, ask for the schema update |
| Build recurring event logic beyond v1.3 preservation | AMD-20260306-006 is DEFERRED — do not build new recurrence logic |

---

## HOW TO USE THIS PROMPT

**What to Paste**

1. Copy the prompt text above (between the two horizontal rules).
2. Paste it as your first message in the coding AI session.
3. Immediately follow it with the full contents of your Cadenza v2 Final spec.
4. Send. The AI will run Step 0 (including all audits) and ask for confirmation
   before writing any code.

**Compatible Environments**

| Environment | How to Use |
|---|---|
| Claude Code | Add spec as context file; paste prompt as first turn or CLAUDE.md |
| Cursor / Windsurf | Add spec as context file; paste prompt as system message or first turn |
| GitHub Copilot Chat | Paste as first message; attach spec as workspace context |
| ChatGPT (with Code Interpreter) | Paste prompt + spec in first message; upload spec as file |
| API / custom tooling | Use prompt as system message; spec as first user message |

**The Confirmation Step**

After the AI completes Step 0, it will present its understanding — including the
results of all audits — and wait. This is intentional. Review its output before
saying "confirmed."

If any audit flagged a spec defect, resolve it now. Do not instruct the AI to build
past a spec defect — the defect will surface as a bug during build, not during
planning, which costs more time to fix.

**During the Build**

- Advance phases by saying: "Build Phase 2" (or whichever phase is next).
- If the AI raises an Open Question, answer it before saying "build." The answer
  becomes part of the spec for that session.
- If you want to add a feature mid-build, say "I want to add [feature]." The AI
  will flag it as out of spec and ask if you want to update the spec before proceeding.
- If the build stalls on an ambiguity, check whether it belongs in Section 19 of
  your spec — and if so, add it so future sessions start with it resolved.
- If the AI surfaces a missing schema field, a missing status transition, or an
  unresolved formula, treat those as spec defects to fix — not as build decisions
  to delegate to the AI.

---

> **✅ When to Return to Stage 1**
>
> If the build surfaces 3 or more spec defects of the same type (missing schemas,
> unresolved formulas, undefined workflows), stop the build session.
>
> Return to your Stage 2 spec and resolve the defects using Stage 1's discovery questions.
>
> A spec with structural gaps will produce a build with structural bugs — it is
> faster to fix the spec than to patch the build.
