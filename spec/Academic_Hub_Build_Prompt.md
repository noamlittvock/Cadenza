# Stage 3 Build Prompt — Academic Hub Add-On
**Cadenza Management Platform · Add-On Spec v1.0 · March 2026**

---

## Your Role

You are a Stage 3 build AI. Your job is to implement the **Academic Hub add-on** for the Cadenza Management Platform exactly as specified in the attached spec document (`Academic_Hub_AddOn_Spec_v1_0.docx`).

You are building onto a live application. The existing codebase, data model, and UI are **frozen** unless the spec explicitly instructs otherwise. Do not refactor, redesign, or reorganise anything that is not directly in scope.

---

## Before You Write a Single Line of Code

Read the following sections of the spec in order:

1. **Section B — Constraints Carried Forward** — understand what is locked
2. **Section C — Glossary** — use these canonical terms everywhere: in code, in comments, in variable names, in Firestore collection names
3. **Section N — Handoff Note** — read all three paragraphs carefully
4. **Section M — Open Questions** — note the default assumptions; flag any that affect the phase you are about to build

Do not begin implementation until you have read all four sections.

---

## Tech Stack

- **React (TypeScript)** — frontend
- **Firebase Firestore** — database
- **Firebase Auth** — authentication
- **Firebase Hosting** — deployment
- **Firebase Cloud Functions** — server-side logic (token validation, AI calls, email dispatch, PDF generation)

Do not introduce any new dependencies or services outside this stack without explicit instruction.

---

## Canonical Collection Names

Use these exact Firestore collection names — no variations:

| Collection | Purpose |
|---|---|
| `assessmentEventTypes` | Rubric and configuration templates |
| `assessmentEvents` | Top-level assessment event containers |
| `assessmentSessions` | Sub-units within an event; carries the shared form token |
| `assessmentStudentRecords` | Per-student result records within a session |
| `examinerSubmissions` | Individual examiner score submissions |
| `reportCardTemplates` | Pre-designed PDF template registry |
| `settings/integrations` | Single document — BYOK AI key and toggle |

The Student Pedagogical Record extension writes to the existing `students` collection — **do not create a new collection for this**.

---

## Build Order

Build phases **sequentially**. Do not begin a phase until the previous phase's Definition of Done criteria are met and verified.

| Phase | Name | Key Deliverable |
|---|---|---|
| 11 | Foundation & Event Type Configuration | Academic Hub sidebar item; event type builder with rubric config |
| 12 | Event & Session Management + Examiner Form | Event/session CRUD; public tokenized examiner form |
| 13 | Results Review Interface | Session dashboard; student drill-down; AI summary; BYOK settings |
| 14 | Report Card PDF Generation | Classic template PDF; per-student and bulk generation |
| 15 | Email Dispatch & Pedagogical Record Integration | Guardian email dispatch; Assessment Reference write to Student profile |

Full phase definitions — including step-by-step instructions and Definitions of Done — are in **Section I** of the spec.

---

## Critical Constraints

### 1 — The Examiner Form Security Model (read this carefully)
The form at `/assess/{formToken}` must be:
- **Publicly accessible** — no Firebase Auth required. Examiners do not have Cadenza accounts.
- **Token-validated server-side** — a Cloud Function must verify the token maps to an existing, open (non-locked) session before returning any session data to the client.

**Do not** require Auth on this route.  
**Do not** expose session data before the token is validated.  
Reference the existing HoursReport tokenized form as the pattern.

### 2 — Existing Collections Are Append-Only
The `students`, `teachers`, and all other existing collections must not have fields removed or renamed. You may add new fields (e.g. `assessmentHistory` on the Pedagogical Record). Any schema extension must be backward-compatible.

### 3 — AI API Key Is Write-Only
The Gemini API key stored in `settings/integrations` must:
- Be encrypted at rest
- Never be returned to the client in plaintext
- Only be consumed server-side via Cloud Function

### 4 — Frozen UI Modules
Do not modify the layout or interactions of: Calendar View, Financial Dashboard, Financial Analysis, Gantt Manager, Power Tools, Super Admin, or the modal system. The Settings module gets one new sub-section (Integrations) — nothing else changes.

### 5 — Score Direction
All scores are **higher = better**. There is no score inversion. The minimum passing score is defined per Assessment Event Type as `passThreshold`.

---

## Computed Field Formulas

Implement these exactly — do not approximate:

**`assessmentStudentRecord.computedAverage`**
```
SUM(all examinerSubmission.categoryScores[*].score for this studentRecordId)
÷ (count of submissions × count of rubric categories)
```
Recalculate on every ExaminerSubmission write. Store as a denormalized field on the record.

**`assessmentStudentRecord.passFailStatus`**
```
IF passFailOverride != null
  → use passFailOverride value
ELSE IF computedAverage >= assessmentEventType.passThreshold
  → "pass"
ELSE IF computedAverage < passThreshold
  → "fail"
ELSE
  → "pending"
```

---

## State Machines

Implement status transitions strictly per **Section F**. No status may transition in a direction not defined in the state machine. Provide a server-side guard (Cloud Function or Firestore security rule) for irreversible transitions.

| Entity | Valid Statuses |
|---|---|
| `AssessmentEvent` | `draft` → `active` → `completed` → `archived` |
| `AssessmentSession` | `open` ↔ `locked` (bidirectional, admin-only) |
| `AssessmentStudentRecord` | `pending` → `partial` → `complete` → `reported` |

---

## Edge Cases to Handle

Before marking any phase complete, verify these scenarios work correctly (full list in **Section K**):

- Duplicate examiner submission for the same student → 409 error, form shows "already submitted" message
- Student with no guardian email → disable dispatch button with explanatory tooltip
- AI API key not configured → disable AI summary button with explanatory tooltip; single-examiner mode unaffected
- Report card generated before `consolidatedSummary` is set → disable generation button
- Session locked with outstanding submissions → unlock flow works; post-lock edits flagged with `isPostLockEdit: true`
- Rubric edit attempted after an active event references the event type → block edit, surface warning

---

## What Is Explicitly Out of Scope

Do not build any of the following. If a question or edge case points toward them, flag it rather than implementing:

- Lesson-by-lesson skill tracking
- App-wide AI layer (AI is scoped to the summary consolidation feature only in v1)
- Report card template builder or layout editor
- Per-examiner tokenized links (shared link only)
- Lead/responsible examiner designation
- Student ordering within a session
- External (non-Staff Member) examiners
- Automatic report card generation (always admin-triggered)

Full exclusion list in **Section L**.

---

## Open Questions

Six questions remain unresolved at spec time (**Section M**). Default assumptions are provided for each. If your current phase is affected by an open question, surface it to the operator before proceeding rather than assuming silently.

The most time-sensitive question before Phase 14:
> **Is the conservatory logo/stamp already stored in Firestore from the base spec Settings module, and in what field path?** The Classic report card template requires it. If it is not yet stored, a Settings extension must be added to Phase 11 before Phase 14 can complete.

---

## When You Are Unsure

- **Ambiguity about behaviour** → check Section K (edge cases) first, then Section M (open questions)
- **Ambiguity about data model** → check Section D; use the exact field names and types specified
- **Ambiguity about a workflow** → check Section G; every workflow has a confirmed initiator and UI surface
- **Tempted to refactor existing code** → re-read Section B and the critical build framing at the top of the spec

If something is not covered by the spec and cannot be resolved by the above, surface the gap rather than making an architectural decision unilaterally.

---

*Cadenza Management Platform · Academic Hub Add-On Spec v1.0 · Build Prompt for Stage 3*
