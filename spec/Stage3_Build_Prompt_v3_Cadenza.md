# BUILD PROMPT
### Stage 3 of 3 · Specification → Code
**AI App Build System · v3.0-C (Cadenza Edition)**

> ℹ **How This Fits the Workflow**
>
> This is Stage 3 of a three-stage AI-assisted app build workflow. Read this prompt fully, then read `Cadenza_Spec_v1_3.md` before writing any code or creating any files.
>
> The spec was produced by Stage 1 and validated against Stage 2's checklist. This prompt enforces build discipline — the spec provides all product decisions.
>
> **Cadenza Edition (v3.0-C):** Step 0 audits are mapped to the Cadenza spec's actual section structure. Generic section names from the standard v3.0 prompt have been replaced with their Cadenza equivalents throughout.

---

## How to Start a Build Session in Claude Code

```
Read /spec/Stage3_Build_Prompt_v3_Cadenza.md and then read /spec/Cadenza_Spec_v1_3.md.
Complete Step 0 before writing any code.
```

---

## I am working from a product specification document produced by a structured AI discovery session. Read it fully before writing any code or creating any files.

---

## Step 0 — Before Any Code

Execute ALL of the following and present results in a single response before touching any code or files:

**1. Section Verification**
Verify the spec contains all required sections: §01 Canonical Summary, §02 Tech Stack, §03 Glossary, §05 Architecture Map, Phase Definitions (Phases 1–10), §08 Exclusion List, §09 Edge Cases, §10 Data Schema, §11 Filter Migration Map, §12 Event Status & Blackout Behavior, §13 Developer Tools Test Suite, §14 Open Questions. If any are missing, stop and report which sections are absent — these are spec defects that must be resolved before the build begins.

**2. Product Understanding**
State your understanding of the product in one sentence. Compare it explicitly to the spec's Canonical Summary (§01). If they diverge — even slightly — flag the divergence and ask for clarification. Do not paraphrase past a mismatch.

**3. Tech Stack Confirmation**
Restate the confirmed tech stack from §02. Do not infer or propose a stack. If the Tech Stack section is incomplete, report it as a spec defect and wait.

**4. Phase Contract**
List all phases and their Definitions of Done. This is your build contract. Flag any phase whose Definition of Done is not verifiable (e.g. 'build the X module' without a completion criterion).

**5. Engine vs. Data Layer**
State which outputs are Engine (stable logic) and which are Data Layer (parameterized, evolvable). You will apply different code standards to each.

**6. Open Questions**
Read §14 (Open Questions). For each: state whether it is blocking or non-blocking. For blocking questions, ask one at a time. For non-blocking, state your default assumption and proceed.

**7. Entity Audit**
Read §10 (Data Schema). This spec does not have a separate Entity Relationship Map — entity relationships are embedded directly in §10 via foreign key annotations (→ EntityName.id). For every entity defined in §10, confirm that all foreign key references resolve to another entity also defined in §10. If any reference points to an entity with no schema entry, stop and report it as a spec defect.

**8. State Machine Audit**
Read §12 (Event Status & Blackout Behavior). This spec does not have a separate State Machine Registry — all status definitions and transition rules for CalendarEvent live in §12. Confirm that all four status values (ACTIVE, CANCELED, PARKED, ARCHIVED) are present in the §10 CalendarEvent schema AND that all transition triggers defined in §12 are unambiguous. Flag any transition with no defined trigger.

**9. Workflow Audit**
This spec does not have a separate Workflow Ownership Table — multi-step workflows are defined in the Core User Flows section. For every Core User Flow listed, confirm that the UI surface named exists in the spec (sidebar module, modal, Config Hub tab, etc.) and that each actor's role (Admin, Staff Member, Student) is defined in §03 Glossary. Flag any workflow step whose UI surface is not specified.

**10. Financial Logic Audit**
This spec does not have a separate Financial Logic Register — financial logic is distributed across §10 (pricingSnapshot field definition and rate type enum), §11 (Filter Migration Map, rate type canonical forms), and §12 (PARKED status excludes events from hour calculations). Confirm that: (a) the three rate type enum values (HOURLY, GLOBAL_MONTHLY, PER_EVENT) are consistently defined; (b) the pricingSnapshot field in §10 CalendarEvent lists all five snapshot fields (rate type + rate value, position name, activity + subcategory name, staff member name, VAT + overhead + social values); (c) the Financial Dashboard calculates using staffMemberIds[0] as the primary staff member. Flag any discrepancy as a blocking spec defect.

**11. Scope Magnitude Audit**
This spec does not have a separate Scope Magnitude Log — scope tagging is embedded in §05 Architecture Map using RETAIN / MODIFY / NEW / EXPAND tags on every module. For every module tagged NEW or EXPAND, confirm it has a phase assignment in Phases 1–10. For every module tagged MODIFY, confirm the migration path is described. If any NEW or EXPAND module has no phase assignment, stop and report it as a spec defect.

---

> ⏸ **Checkpoint**
>
> Wait for explicit confirmation before writing any code.
>
> If the user confirms, proceed to Phase 1. If they correct anything, update your understanding and confirm again.
>
> If any Step 0 audit found spec defects, do NOT proceed until the user resolves them.

---

## Build Rules — Apply to Every Phase

- Follow the spec's phase order exactly. No skipping ahead.
- Never build UI or polish before core logic is proven.
- Keep Engine and Data Layer concerns separated as §05 Architecture Map defines.
- Do not add features not in the spec. If you want to suggest one, flag it in your phase report and wait for instruction.
- If a feature is in §08 Exclusion List, treat it as a hard constraint — do not build it, scaffold for it, or leave a comment pointing toward it.
- Write production-quality code — not scaffolding, not placeholders.
- Include error handling for every edge case in §09 of the spec.
- Name every file, function, variable, and data field using the §03 Glossary's canonical terms — nothing else.
- No commented-out code. No dead imports. No unused variables.
- Engine outputs are hardcoded and tested. Data Layer outputs are parameterized, schema-validated, and editable without touching engine code.
- Every status field must implement the state machine from §12. Never write a freeform status string — always validate against the confirmed enum (ACTIVE, CANCELED, PARKED, ARCHIVED for CalendarEvent).
- Every computed financial value must be implemented exactly as specified in §10 (pricingSnapshot), §11 (rate type canonical forms), and §12 (PARKED exclusion from hours). Never invent or approximate a formula — if the formula is ambiguous, stop and ask.
- Every multi-step workflow must implement the ownership and notification logic from the Core User Flows section. If a UI surface for a workflow step is not specified in the Core User Flows or in the module description, stop and ask — do not invent one.

---

## Per-Phase Protocol

When instructed to build phase N:

1. Build every step in phase N. Nothing more, nothing less.
2. After building, provide a phase output report in the format below.
3. Flag every decision the spec left ambiguous — even if you made a reasonable call.
4. Do not begin phase N+1 unless explicitly instructed.

---

## Phase Output Report Format

Use this exact structure after each phase:

```
PHASE [N] COMPLETE

Built:
• [filename or function] — [what it does in one line]

Spec compliance notes:
• [any decision you made that the spec left ambiguous]
• [any constraint you enforced from the Exclusion List]
• [any state machine transition implemented from §12]
• [any financial formula implemented from §10/§11/§12]

Definition of Done check:
✓ [step name] — [how it was satisfied]

Entity / Schema compliance:
• [any entity written this phase — confirm schema matches §10]

Open Questions surfaced this phase:
• [any new ambiguity discovered during build — flag for user resolution]

Ready for Phase [N+1] on your instruction.
```

---

## Ambiguity Protocol

- Ask one focused, specific question. Never bundle two.
- State what decision you need and why the spec doesn't resolve it.
- If non-blocking: state your default assumption, proceed, and flag in the phase report.
- If blocking: stop and wait. No silent assumptions on blocking questions.

> ⚠ **Blocking vs. Non-Blocking**
>
> **Blocking:** different reasonable answers produce materially different code, schema, or financial output.
>
> **Non-blocking:** any reasonable answer produces the same structure — only a constant or label differs.
>
> Any ambiguity in a financial formula or state machine transition is **ALWAYS blocking.**

---

## Hard Prohibitions

| Prohibited Action | Required Response |
|---|---|
| Build features not in the spec | Say: 'That feature is not in the spec. Want to add it?' |
| Skip the Step 0 pre-flight | Never write code before completing Steps 0.1–0.11 |
| Infer or propose the tech stack | The spec must specify it — if absent, halt and report |
| Hardcode data-layer values in engine code | Always reference data through the defined interface |
| Proceed past a phase without confirmation | Phase gate is mandatory — not optional |
| Invent reasoning not in the spec | The spec's data is the only permitted source of display text |
| Use names inconsistent with the Glossary | One term per concept — always the Glossary's term |
| Build anything in the Exclusion List | No scaffolding, no stubs, no forward-looking comments |
| Invent a status value not in §12 | Stop, report the gap, ask for the correct status value |
| Approximate or modify a financial formula from §10/§11/§12 | Stop, report the ambiguity, ask for the confirmed formula |
| Build a workflow step with no UI surface in the spec | Stop, report the gap, ask where this step lives in the UI |
| Write to an entity field not defined in §10 | Stop, report the missing field, ask for the schema update |

---

## During the Build

- Advance phases by saying: 'Build Phase 2' (or whichever phase is next).
- If the AI raises an Open Question, answer it before saying 'build.' The answer becomes part of the spec for that session.
- If you want to add a feature mid-build, say 'I want to add [feature].' The AI will flag it as out of spec and ask if you want to update the spec before proceeding.
- If the build stalls on an ambiguity, check whether it belongs in §14 of the spec — and if so, add it so future sessions start with it resolved.
- If the AI surfaces a missing schema field, a missing status transition, or an unresolved formula, treat those as spec defects to fix — not as build decisions to delegate to the AI.

---

> ✅ **When to Return to Stage 1**
>
> If the build surfaces 3 or more spec defects of the same type (missing schemas, unresolved formulas, undefined workflows), stop the build session.
>
> Return to the spec and resolve the defects before resuming.
>
> A spec with structural gaps will produce a build with structural bugs — it is faster to fix the spec than to patch the build.
