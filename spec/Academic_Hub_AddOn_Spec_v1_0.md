# ADD-ON SPEC BLOCK — Academic Hub: Assessment Events

**AI App Build System · Add-On Spec Template v1.0 · Produced by Add-On Discovery Session**

---

> ⚠ **CRITICAL BUILD FRAMING — READ FIRST**
>
> This is an ADD-ON spec, not a greenfield spec. An existing application is live. Its UI, data model, interactions, and architecture are **FROZEN** unless this document explicitly says otherwise.
>
> Do not rebuild, redesign, or refactor any existing component unless this document explicitly instructs it. Build only what is defined in the sections below.
>
> Before building anything in this spec, read **Section B** (Constraints Carried Forward) and the **Handoff Note** (Section N). Those sections define what already exists and must not be changed.

---

## ADD-ON SPEC BLOCK HEADER

| | |
|---|---|
| **Product Name** | Cadenza Management Platform |
| **Add-On Name** | Academic Hub — Assessment Events |
| **Base Spec Version** | v1.3 |
| **Add-On Version** | 1.0 — Initial add-on specification |
| **Author** | AI Discovery Session |
| **Date** | March 2026 |

---

## SECTION A — Add-On Summary

This add-on introduces the **Academic Hub** module to Cadenza: a top-level sidebar section that manages formal student assessment events (recitals, juries, auditions, and similar panel-reviewed events). In v1, it covers the full pipeline — multi-examiner form submission via shared tokenized links, per-category scoring with configurable rubrics, AI-assisted or single-examiner summary authoring, pass/fail determination with admin override, PDF report card generation from pre-designed templates, and email dispatch to student guardians.

The add-on does **NOT** implement lesson-by-lesson skill tracking, an app-wide AI layer, or a report card template builder in v1. The data schema is designed to accommodate these extensions in v2/v3 without a breaking migration.

---

## SECTION B — Constraints Carried Forward

Everything below is **LOCKED** from the base spec. The build AI must not alter, replace, or re-architect any of these.

### Tech Stack (Locked)

- React (TypeScript)
- Firebase Firestore
- Firebase Auth
- Firebase Hosting
- Firebase Cloud Functions (for token generation, email dispatch, AI calls, and PDF generation — per existing HoursReport pattern)

### Existing Firestore Collections (Locked — add-on may extend, not replace)

- `activities`
- `subcategories`
- `teachers` (StaffMembers)
- `students`
- `calendarEvents`
- `calendarSubscriptions`
- `hoursReports`
- `lists`

### Existing Entities & Canonical Names (Locked)

Activity, Subcategory, StaffMember, Student, CalendarEvent, CalendarSubscription, HoursReport, RecitalEntry (manual log only — retained for informal performances; see Section D)

### Existing Roles (Locked)

- **VIEWER** — read-only access
- **ADMIN** — full operational access
- **SUPER_ADMIN** — cross-tenant and configuration access

### Completed Phases (Locked)

All 10 phases defined in Cadenza Spec v1.3 constitute the build roadmap. No phase is confirmed complete at spec time. Add-on phases (11+) must not depend on unbuilt base spec work — add-on build should only begin once the base spec phases it depends on are verified complete.

### Frozen UI Modules (Locked)

Layout and interactions must not change for any of the following:

- Calendar View
- Financial Dashboard
- Financial Analysis
- Gantt Manager
- Power Tools
- Settings *(layout frozen; a new Integrations sub-section is added by this add-on — see Section D)*
- Super Admin
- Modal system
- Layout / Sidebar *(a new top-level Academic Hub item is added — see Section C)*

---

## SECTION C — New Glossary Entries

Only terms NOT already present in base spec Section 03. The build AI must use these canonical terms and must not use the Do Not Use variants.

| Canonical Term | Definition | Do Not Use |
|---|---|---|
| Academic Hub | Top-level sidebar module containing all formal student assessment functionality. | Recitals, Assessments Module, Academic Module |
| Assessment Event | A named, scheduled event under which one or more Assessment Sessions are run (e.g. "Winter Recital 2026"). Top-level container in Academic Hub. | Recital Event, Event |
| Assessment Event Type | A configured template defining the rubric, scoring scale, pass threshold, summary mode, and report card template for a category of formal assessment (e.g. Recital, Jury, Audition). Managed within Academic Hub. | Recital Type, Event Type |
| Assessment Session | A sub-unit of an Assessment Event representing one panel of examiners assessing a group of students (e.g. "Strings — Morning"). Carries its own examiner panel and shared form link. | Session |
| Assessment Student Record | The record of a single student's participation in an Assessment Session. Holds all submitted scores, computed average, pass/fail status, summary, and report card state. | Student Assessment, Grading Record |
| Examiner Submission | One examiner's complete scored response for one student in one session — containing per-category scores and a summary text. | Examiner Form, Score Sheet |
| Scoring Category | A single dimension of assessment within an Assessment Event Type rubric (e.g. Pitch & Intonation, Rhythm). Has a configurable set of Scoring Levels. | Category, Criterion |
| Scoring Level | One discrete level within a Scoring Category, defined by a numeric value and a verbal descriptor (e.g. value: 4, descriptor: "Excellent"). | Score, Grade Level |
| Pass Threshold | The minimum computed average score required for a student to receive a passing result. Defined per Assessment Event Type. | Passing Score, Minimum Score |
| Examiner Panel | The set of Staff Members assigned as examiners for a specific Assessment Session. Defined by admin filtering at session creation time. | Panel, Examiners |
| BYOK (Bring Your Own Key) | The model by which a conservatory manager supplies their own third-party AI API key (e.g. Google Gemini) in Settings > Integrations, which Cadenza uses server-side for AI-assisted features. | API Key, AI Key |
| Report Card Template | A pre-designed visual layout used to generate the student PDF report card. Admin selects one per Assessment Event. Template builder is a v2 feature. | Template, Certificate Template |
| Assessment Reference | A lightweight read-only record stored on the Student's Pedagogical Record pointing to a completed Assessment Student Record. | Assessment Link, Result Reference |
| Informal Performance Log | The existing `RecitalEntry` on the Student's Pedagogical Record. Retained for non-assessed performances that do not go through the Academic Hub pipeline. | RecitalEntry (when used for assessed events) |

---

## SECTION D — New Data Schema

### Collection: `assessmentEventTypes` — NEW

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Auto-generated Firestore doc ID |
| `name` | string | Yes | e.g. "Recital", "Jury", "Audition" |
| `rubric` | ScoringCategory[] | Yes | Array of scoring categories. See sub-schema below. |
| `passThreshold` | number | Yes | Minimum average score to pass (e.g. 3.0 on a 4-point scale) |
| `examinerSummaryMode` | `"single"` or `"ai_consolidated"` | Yes | `"single"` = one designated examiner writes summary. `"ai_consolidated"` = each examiner writes their own, AI merges. Requires valid AI API key if `"ai_consolidated"`. |
| `defaultTemplateId` | string | Yes | Ref to `reportCardTemplates` doc. Pre-populated with system default. |
| `createdAt` | Timestamp | Yes | |
| `createdBy` | string (uid) | Yes | |

**ScoringCategory sub-schema** (array element within `assessmentEventTypes.rubric`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `categoryId` | string | Yes | UUID generated at creation |
| `name` | string | Yes | e.g. "Pitch & Intonation" |
| `levels` | ScoringLevel[] | Yes | Ordered array, ascending value. Minimum 2 levels. |

**ScoringLevel sub-schema** (array element within `ScoringCategory.levels`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `value` | number | Yes | Numeric score. Higher = better. No inversion. |
| `descriptor` | string | Yes | Verbal label displayed on form and report card (e.g. "Excellent") |

---

### Collection: `assessmentEvents` — NEW

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Auto-generated |
| `name` | string | Yes | e.g. "Winter Recital 2026" |
| `eventTypeId` | string | Yes | Ref to `assessmentEventTypes` |
| `date` | Timestamp | Yes | Event date |
| `status` | `"draft"`, `"active"`, `"completed"`, or `"archived"` | Yes | See Section F state machine |
| `reportCardTemplateId` | string | Yes | Admin may override default from event type |
| `createdAt` | Timestamp | Yes | |
| `createdBy` | string (uid) | Yes | |

---

### Collection: `assessmentSessions` — NEW

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Auto-generated |
| `eventId` | string | Yes | Ref to `assessmentEvents` |
| `name` | string | Yes | e.g. "Strings — Morning Session" |
| `examinerPanel` | ExaminerPanelEntry[] | Yes | Scoped list of Staff Members. See sub-schema. |
| `panelFilter` | PanelFilter | Yes | Filter used to scope panel at creation. See sub-schema. |
| `formToken` | string | Yes | Server-generated token. Shared form URL = `/assess/{formToken}` |
| `status` | `"open"` or `"locked"` | Yes | See Section F state machine |
| `lockedAt` | Timestamp or null | No | |
| `lockedBy` | string (uid) or null | No | |
| `auditLog` | AuditEntry[] | No | Append-only log of post-lock edits, unlocks, and overrides. Default empty array. |
| `createdAt` | Timestamp | Yes | |
| `createdBy` | string (uid) | Yes | |

**ExaminerPanelEntry sub-schema**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `staffMemberId` | string | Yes | Ref to `teachers` collection |
| `name` | string | Yes | Denormalized for display on form and report card |

**PanelFilter sub-schema**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `"department"`, `"activity"`, `"position"`, or `"manual"` | Yes | How the panel was scoped |
| `values` | string[] | Yes | The filter values applied (dept names, activity IDs, position titles, or staffMemberIds for manual) |

**AuditEntry sub-schema**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `action` | string | Yes | e.g. "session_unlocked", "post_lock_edit", "pass_fail_override" |
| `performedBy` | string (uid) | Yes | |
| `performedAt` | Timestamp | Yes | |
| `note` | string or null | No | Required for pass/fail override entries |

---

### Collection: `assessmentStudentRecords` — NEW

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Auto-generated |
| `sessionId` | string | Yes | Ref to `assessmentSessions` |
| `eventId` | string | Yes | Ref to `assessmentEvents` — denormalized for query efficiency |
| `studentId` | string | Yes | Ref to `students` collection |
| `studentName` | string | Yes | Denormalized at time of record creation |
| `teacherName` | string | Yes | Denormalized at time of record creation |
| `instrument` | string | Yes | Denormalized from student's Activity |
| `yearOfStudy` | number | Yes | Denormalized at time of record creation |
| `submissionCount` | number | Yes | Running count of Examiner Submissions received |
| `status` | `"pending"`, `"partial"`, `"complete"`, or `"reported"` | Yes | See Section F |
| `computedAverage` | number or null | No | Null until at least one submission. See Section H. |
| `passFailStatus` | `"pass"`, `"fail"`, or `"pending"` | Yes | System-computed. "pending" until computedAverage is available. |
| `passFailOverride` | `"pass"`, `"fail"`, or null | No | Explicit admin override. If set, overrides passFailStatus for display and report card. |
| `passFailOverrideNote` | string or null | No | Required when passFailOverride is set. |
| `passFailOverrideBy` | string (uid) or null | No | |
| `passFailOverrideAt` | Timestamp or null | No | |
| `consolidatedSummary` | string or null | No | Final summary shown on report card. Editable by admin before PDF generation. |
| `summarySource` | `"ai"`, `"single_examiner"`, `"admin"`, or null | No | "admin" when admin edits the consolidated summary directly. |
| `summaryGeneratedAt` | Timestamp or null | No | |
| `summaryEditedBy` | string (uid) or null | No | |
| `summaryEditedAt` | Timestamp or null | No | |
| `reportCardGenerated` | boolean | Yes | Default false |
| `reportCardGeneratedAt` | Timestamp or null | No | |
| `reportCardTemplateId` | string or null | No | If null, inherits from assessmentEvent |
| `emailDispatched` | boolean | Yes | Default false |
| `emailDispatchedAt` | Timestamp or null | No | |
| `addedAt` | Timestamp | Yes | |
| `addedBy` | string (uid) | Yes | |

---

### Collection: `examinerSubmissions` — NEW

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Auto-generated |
| `sessionId` | string | Yes | Ref to `assessmentSessions` |
| `studentRecordId` | string | Yes | Ref to `assessmentStudentRecords` |
| `examinerStaffMemberId` | string | Yes | Ref to `teachers` collection |
| `examinerName` | string | Yes | Denormalized |
| `categoryScores` | CategoryScore[] | Yes | See sub-schema below |
| `summaryText` | string | Yes | Examiner's written summary for this student. Required for submission. |
| `isSummaryAuthor` | boolean | Yes | True only in `"single"` summary mode. At most one submission per student record may have this true. |
| `submittedAt` | Timestamp | Yes | |
| `sessionStatusAtSubmission` | string | Yes | Snapshot of session status at time of submission. For audit. |
| `isPostLockEdit` | boolean | Yes | True if submitted or modified after session was locked. |
| `editedBy` | string (uid) or null | No | Admin uid if post-lock edit was made |
| `editedAt` | Timestamp or null | No | |

**CategoryScore sub-schema** (array element within `examinerSubmissions.categoryScores`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `categoryId` | string | Yes | Ref to `ScoringCategory.categoryId` on the event type |
| `categoryName` | string | Yes | Denormalized at submission time |
| `score` | number | Yes | The numeric value of the selected Scoring Level |
| `descriptor` | string | Yes | Denormalized verbal descriptor at submission time |

---

### Collection: `reportCardTemplates` — NEW

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Auto-generated |
| `name` | string | Yes | e.g. "Classic", "Modern" |
| `isDefault` | boolean | Yes | Exactly one template has `isDefault: true` at all times |
| `createdAt` | Timestamp | Yes | |

*In v1, templates are pre-designed and shipped with the app. Admin selects from available templates but cannot edit template layout. A "Classic" template replicating the existing PDF report card format is included as the default.*

---

### Collection: `settings/integrations` — NEW (single document)

| Field | Type | Required | Notes |
|---|---|---|---|
| `aiProvider` | `"gemini"` or null | Yes | v1 supports Gemini only. Null if not configured. |
| `aiApiKey` | string (encrypted) or null | Yes | Stored encrypted. Never returned to client in plaintext. Used server-side only via Cloud Function. |
| `aiEnabled` | boolean | Yes | Master toggle. False if `aiApiKey` is null. |
| `updatedAt` | Timestamp | Yes | |
| `updatedBy` | string (uid) | Yes | |

---

### Extension: `students.pedagogicalRecord` — EXISTING COLLECTION EXTENDED

Add the following field to the existing `PedagogicalRecord` sub-document on each Student. **Do NOT modify or remove the existing `recitalHistory: RecitalEntry[]` field.**

| Field | Type | Required | Notes |
|---|---|---|---|
| `assessmentHistory` | AssessmentReference[] | No | Array of lightweight references to completed assessments. Default empty array. |

**AssessmentReference sub-schema**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `studentRecordId` | string | Yes | Ref to `assessmentStudentRecords` |
| `eventId` | string | Yes | Ref to `assessmentEvents` |
| `eventName` | string | Yes | Denormalized |
| `sessionName` | string | Yes | Denormalized |
| `date` | Timestamp | Yes | Denormalized from `assessmentEvent` |
| `instrument` | string | Yes | Denormalized |
| `passFailResult` | `"pass"`, `"fail"`, or `"pending"` | Yes | Reflects override if set, otherwise computed |
| `addedAt` | Timestamp | Yes | |


---

## SECTION E — Entity Relationship Map (Add-On Additions)

| Entity | Related To | Relationship Type |
|---|---|---|
| AssessmentEvent | AssessmentEventType | Many-to-one (event has one type) |
| AssessmentEvent | ReportCardTemplate | Many-to-one (event has one template) |
| AssessmentSession | AssessmentEvent | Many-to-one (session belongs to one event) |
| AssessmentSession | StaffMember (teachers) | Many-to-many via `examinerPanel` array |
| AssessmentStudentRecord | AssessmentSession | Many-to-one |
| AssessmentStudentRecord | Student | Many-to-one (student may have many records over time) |
| ExaminerSubmission | AssessmentStudentRecord | Many-to-one (one per examiner per student) |
| ExaminerSubmission | StaffMember | Many-to-one (submission belongs to one examiner) |
| Student.assessmentHistory[] | AssessmentStudentRecord | Reference (read-only summary link) |
| AssessmentEventType | ScoringCategory[] | One-to-many (embedded sub-documents) |
| integrationSettings | Cloud Function (AI consolidation) | One-to-one (settings document consumed by function) |

---

## SECTION F — State Machine Registry (Add-On Additions)

| Entity | Status Values | Transition Triggers | Irreversible? |
|---|---|---|---|
| AssessmentEvent | `draft` → `active` → `completed` → `archived` | draft→active: Admin publishes event. active→completed: Admin marks complete. completed→archived: Admin archives. completed→active: Allowed for admin correction. | `archived` is terminal. |
| AssessmentSession | `open` ↔ `locked` | open→locked: Admin locks session. locked→open: Admin unlocks (audit log entry written). | No terminal state. Admin may always reopen. |
| AssessmentStudentRecord | `pending` → `partial` → `complete` → `reported` | pending→partial: First ExaminerSubmission received. partial→complete: Admin manually marks complete OR all panel members have submitted. complete→reported: Report card generated AND email dispatched. Any→partial: Post-lock admin edit removes a submission (edge case). | `reported` is not terminal — admin may regenerate or re-dispatch. |

---

## SECTION G — Workflow Ownership Table (Add-On Additions)

| Workflow | Initiator | Actor(s) | Approver | Notification Target | UI Surface |
|---|---|---|---|---|---|
| Configure Assessment Event Type | ADMIN | ADMIN | None | None | Academic Hub > Event Type Config |
| Create Assessment Event | ADMIN | ADMIN | None | None | Academic Hub > Events list |
| Create Assessment Session | ADMIN | ADMIN | None | None | Academic Hub > Event detail |
| Distribute shared form link | ADMIN | ADMIN copies/shares link | None | Examiners (out of band) | Academic Hub > Session detail |
| Examiner submits assessment | Examiner (via shared form URL) | Examiner | None | None (admin sees in real time) | Public tokenized form `/assess/{token}` |
| Admin reviews session results | ADMIN | ADMIN | None | None | Academic Hub > Session dashboard + student drill-down |
| Generate consolidated AI summary | ADMIN | Cloud Function (Gemini API) | ADMIN reviews and may edit | None | Academic Hub > Student detail |
| Admin overrides pass/fail | ADMIN | ADMIN | None | None | Academic Hub > Student detail (override field + required note) |
| Generate PDF report card | ADMIN | ADMIN (per student or bulk) | None | None | Academic Hub > Session dashboard or Student detail |
| Dispatch report card email | ADMIN | System sends to guardian emails from Student profile | ADMIN confirms | Student guardian(s) | Academic Hub > Session dashboard or Student detail |
| Lock / unlock session | ADMIN | ADMIN | None | None (audit log written) | Academic Hub > Session detail |
| Configure AI API key (BYOK) | ADMIN / SUPER_ADMIN | ADMIN | None | None | Settings > Integrations |
| Add student to session | ADMIN | ADMIN | None | None | Academic Hub > Session detail |
| Post-lock admin submission edit | ADMIN | ADMIN | None | None (audit log written) | Academic Hub > Student detail |
| Write Assessment Reference to Student | System (automated) | Cloud Function on `emailDispatched=true` | None | None | Automatic — no UI trigger |

---

## SECTION H — Financial Logic Register (Add-On Additions)

No financial transactions are introduced by this add-on. The following are the computed assessment values.

| Computed Field | Formula | Source Fields | Recalculation Policy |
|---|---|---|---|
| `assessmentStudentRecord.computedAverage` | SUM(all examinerSubmission.categoryScores[*].score for this studentRecordId) ÷ (count of submissions × count of rubric categories) | `examinerSubmissions.categoryScores[].score` for a given `studentRecordId` | Recalculated on every ExaminerSubmission write. Stored as a denormalized field on the record. |
| `assessmentStudentRecord.passFailStatus` | IF passFailOverride != null → passFailOverride value; ELSE IF computedAverage >= passThreshold → "pass"; ELSE IF computedAverage < passThreshold → "fail"; ELSE → "pending" | `computedAverage`, `assessmentEventType.passThreshold`, `passFailOverride` | Recalculated whenever `computedAverage` changes or `passFailOverride` is written. |
| `assessmentStudentRecord.submissionCount` | COUNT of ExaminerSubmission documents with matching `studentRecordId` | `examinerSubmissions` collection | Incremented on each new ExaminerSubmission. Post-lock edits are tracked separately and do not decrement. |

---

## SECTION I — Phase Definitions (Add-On Phases)

*Phases numbered continuing from base spec Phase 10. All phases depend on base spec Phase 1 (Auth), Phase 3 (Student entity), and Phase 8 (Staff Members) being complete.*

---

### Phase 11 — Academic Hub Foundation & Event Type Configuration

*Establish the Academic Hub module in the sidebar and build the Assessment Event Type configuration interface within it.*

**Steps:**

- Add "Academic Hub" as a top-level sidebar item (ADMIN and SUPER_ADMIN only). **Definition of Done:** Item appears in sidebar for ADMIN+ roles; not visible to VIEWER.
- Create the `assessmentEventTypes` Firestore collection and schema (Section D). **Definition of Done:** Collection exists with correct field types; security rules block VIEWER writes.
- Build Event Type list view: displays all configured assessment event types with name and rubric category count. **Definition of Done:** List renders correctly; empty state shown when no types exist.
- Build Event Type creation/edit form: name, rubric builder (add/remove/reorder categories, configure levels per category with value and descriptor), pass threshold, summary mode selector, default template selector. **Definition of Done:** A complete event type can be created, saved to Firestore, and retrieved; rubric validates minimum 1 category and 2 levels per category.
- Create `reportCardTemplates` collection and seed with "Classic" template record. **Definition of Done:** Classic template doc exists in Firestore; template selector in event type form shows it as default.
- Create `integrationSettings` document at `settings/integrations` with `aiEnabled: false`, `aiProvider: null`. **Definition of Done:** Document exists; readable by ADMIN.

*Integration points with base spec: Sidebar component (Phase 2), Auth roles (Phase 1), Settings module (Phase 9 — layout frozen, new Integrations sub-section added).*

---

### Phase 12 — Assessment Event & Session Management + Examiner Form

*Build the event and session creation flow, and the public examiner submission form.*

**Steps:**

- Create `assessmentEvents` collection and schema. Build event creation form (name, event type, date, template override). **Definition of Done:** Events can be created and listed in Academic Hub; status defaults to `"draft"`.
- Build event detail view: event metadata, status controls (publish/complete/archive), and session list. **Definition of Done:** Event detail renders; status transitions work per Section F state machine.
- Build session creation form within event detail: name, panel filter (type + values), examiner panel preview, form token generation. **Definition of Done:** Session created with a unique `formToken`; `examinerPanel` populated from filtered Staff Members; shared form URL displayed and copyable.
- Build session detail view: examiner panel list, student list, submission progress indicators (N/M examiners submitted per student), lock/unlock control. **Definition of Done:** Session detail renders; lock/unlock writes audit fields to Firestore and appends to `auditLog`.
- Build student addition flow: admin searches/selects students to add to session. **Definition of Done:** `AssessmentStudentRecord` created per added student; `studentName`, `teacherName`, `instrument`, `yearOfStudy` denormalized at creation time.
- Build public examiner form at `/assess/{formToken}`: examiner self-identifies from scoped panel dropdown, selects student from session list, scores each rubric category via level selector (value + descriptor displayed), writes summary text, submits. **Definition of Done:** `ExaminerSubmission` written to Firestore; `submissionCount` and `computedAverage` update; form accessible without Auth; `formToken` validated server-side before rendering.
- Implement one-student-at-a-time form flow: after submission, examiner returns to student selection. **Definition of Done:** Form resets and returns to student selector after each successful submission.

*Integration points with base spec: Students collection (Phase 3), Staff Members collection (Phase 8), tokenized form pattern (HoursReport, Phase 7), Firestore security rules (Phase 1).*

---

### Phase 13 — Results Review Interface

*Build the admin-facing results review surfaces: session dashboard and per-student detail.*

**Steps:**

- Build session results dashboard: table of all students — one row per student showing name, teacher, instrument, submission count vs panel size, computed average, pass/fail status badge. **Definition of Done:** Dashboard renders live data; updates within 5 seconds of a new ExaminerSubmission without page refresh.
- Build student detail drill-down: each examiner's scores per category side-by-side, computed average per category, overall computed average, pass/fail status, pass/fail override field (with required note), all examiners' summary texts. **Definition of Done:** All submitted data visible; pass/fail override saves to Firestore with `note`, `overrideBy`, `overrideAt`; override reflected immediately in session dashboard.
- Build consolidated summary section: in `"single"` mode — shows summary from `isSummaryAuthor=true` submission, admin may edit; in `"ai_consolidated"` mode — shows "Generate AI Summary" button (disabled if `aiEnabled=false`), triggering Cloud Function; result shown in editable text field. **Definition of Done:** Both modes render correctly; AI call is server-side via Cloud Function using stored encrypted API key; result stored in `consolidatedSummary`; `summarySource` set correctly.
- Build Settings > Integrations sub-section: API provider selector (Gemini only in v1), write-only API key input, enable/disable toggle, connection test button. **Definition of Done:** Key saved encrypted to `integrationSettings`; toggle updates `aiEnabled`; test button verifies key validity via Cloud Function.

*Integration points with base spec: Settings module (Phase 9 — new sub-section only, existing layout frozen), real-time Firestore listeners.*

---

### Phase 14 — Report Card PDF Generation

*Build PDF generation for the Classic template and wire it into the admin review interface.*

**Steps:**

- Implement Classic report card template: conservatory logo, event name, date, instrument, student name, year of study, examiner names, per-category verbal descriptor table, pass/fail row, consolidated summary block, conservatory stamp. **Definition of Done:** Generated PDF visually matches the reference document; all fields populated from Firestore data.
- Wire "Generate Report Card" button into student detail: triggers PDF generation Cloud Function, stores PDF to Firebase Storage, sets `reportCardGenerated=true` and `reportCardGeneratedAt`. **Definition of Done:** PDF generated and accessible for preview; button disabled if `consolidatedSummary` is null.
- Wire bulk "Generate All Report Cards" action into session dashboard: generates PDFs for all students with `status=complete`. **Definition of Done:** Bulk generation queued and processed; progress indicator shown; individual student statuses updated as each PDF completes.
- Verify report card template selector: admin may change template on the Assessment Event before generation. **Definition of Done:** Template change reflected in subsequent PDF generation; already-generated PDFs not retroactively changed.

*Integration points: Firebase Storage, Cloud Functions, `assessmentStudentRecord` schema.*

---

### Phase 15 — Email Dispatch & Pedagogical Record Integration

*Build the email dispatch flow and connect assessment results to the Student Pedagogical Record.*

**Steps:**

- Build per-student "Send Report Card" action: pulls guardian email(s) from Student profile, shows confirmation modal with recipient list, sends email with PDF attachment. **Definition of Done:** Email sent to guardian(s); `emailDispatched=true` and `emailDispatchedAt` set; if no guardian email exists, button is disabled with explanatory tooltip.
- Build bulk "Send All Report Cards" action: checkbox-select students, confirm, dispatch. **Definition of Done:** Batch email sent; each student's `emailDispatched` updated independently; failures surfaced per student without blocking others.
- Implement Assessment Reference write to `Student.pedagogicalRecord.assessmentHistory` on `emailDispatched=true`: Cloud Function triggered on dispatch, appends `AssessmentReference` to student doc. **Definition of Done:** After email dispatch, Student profile shows a new entry under Assessment History linking to the correct assessment record.
- Build Assessment History section in Student Pedagogical Record UI: shows `assessmentHistory` entries as a list with event name, date, instrument, pass/fail badge, and "View Full Result" link navigating to Academic Hub. **Definition of Done:** Section renders; existing `recitalHistory` (Informal Performance Log) section is visually distinct and unmodified.

*Integration points with base spec: Students collection and Pedagogical Record UI (Phase 3), email infrastructure (Phase 6 — financial emails), guardian contacts on Student entity.*

---

## SECTION J — Scope Magnitude Log (Add-On Entries)

| Feature | Threshold Crossed | Recommended Phase |
|---|---|---|
| Assessment Event Type rubric builder (configurable categories + levels) | Medium — custom form builder with dynamic array management | Phase 11 |
| Public tokenized examiner form (no-auth, server-token-validated) | Medium — new public route, server-side token validation, security rules | Phase 12 |
| Real-time session dashboard (live submission updates) | Medium — Firestore real-time listeners, live computed fields | Phase 13 |
| AI summary consolidation via BYOK Gemini key (server-side Cloud Function) | Medium — Cloud Function, encrypted key storage, external API call, fallback logic | Phase 13 |
| PDF report card generation (Classic template) | Medium-High — server-side PDF generation, Firebase Storage, template rendering | Phase 14 |
| Bulk email dispatch with PDF attachment | Medium — batch email, per-item failure handling, existing email infra extension | Phase 15 |
| Assessment Reference auto-write to Student Pedagogical Record | Low — triggered Cloud Function, append-only write | Phase 15 |
| Settings > Integrations (BYOK key management) | Medium — encrypted storage, write-only key display, connection test | Phase 13 |

---

## SECTION K — Edge Cases & Failure Handling (Add-On Specific)

| Scenario | Required Behaviour |
|---|---|
| Examiner submits for wrong student | Admin may delete the incorrect `ExaminerSubmission` from the student detail view (ADMIN only). Deletion triggers recomputation of `computedAverage` and `submissionCount`. Deletion logged with `deletedBy` and `deletedAt`. |
| Session locked before all examiners have submitted | Admin may unlock session to allow late submission. Unlock logged in `auditLog`. Post-lock submissions have `isPostLockEdit=true`. |
| AI API key not configured or invalid | "Generate AI Summary" button disabled with tooltip explaining the key is not configured. Single-examiner summary mode remains fully functional. |
| AI consolidation API call fails (timeout, quota, error) | Cloud Function returns error to client. Admin sees error toast. All individual examiner summaries remain available for manual authoring. No data is lost. |
| Examiner writes no summary text | Form validation blocks submission if `summaryText` is empty. Required field. |
| Student has no guardian email on record | Per-student "Send Report Card" button disabled. Tooltip: "No guardian email on file — update the Student profile." Bulk dispatch skips students with no email and surfaces them as a warning list. |
| Report card generated before `consolidatedSummary` is set | "Generate Report Card" button disabled until `consolidatedSummary` is non-null. |
| Admin changes report card template after some PDFs already generated | Already-generated PDFs not retroactively changed. Admin shown warning: "X report cards have already been generated with the previous template. Regenerate?" |
| Duplicate examiner submission (same examiner submits twice for same student) | Server-side Cloud Function checks for existing submission with matching `sessionId` + `studentRecordId` + `examinerStaffMemberId`. If duplicate, returns 409 and form displays: "You have already submitted for this student." |
| Student removed from session after submissions exist | Removal blocked if any `ExaminerSubmission` exists for that `studentRecordId`. Admin shown: "This student has existing submissions and cannot be removed. Archive the record instead." |
| `assessmentEventType` rubric edited after events already use it | Rubric edits blocked once any `AssessmentEvent` referencing the type has `status="active"` or later. Admin must create a new event type. Warning shown in the edit form. |
| Post-lock admin edit to an ExaminerSubmission | Allowed for ADMIN only. Writes `editedBy`, `editedAt`, `isPostLockEdit=true`. `computedAverage` and `passFailStatus` recomputed. Edit action appended to `assessmentSession.auditLog`. |

---

## SECTION L — Exclusion List (Add-On Scope)

1. Lesson-by-lesson and ongoing skill assessment tracking (v3). Schema is designed to extend for this, but no lesson-level entities, forms, or UI are built in v1.
2. App-wide AI layer (v2). The BYOK Gemini integration is scoped exclusively to the AI summary consolidation feature in Academic Hub. Using AI across other Cadenza modules is a v2 generalisation of the pattern established here.
3. Report card template builder / drag-and-drop configurator (v2). In v1, templates are pre-designed and shipped with the app. Layout editing is not available.
4. Additional pre-designed report card templates beyond "Classic" (v2). One default template matching the existing PDF format is built in v1.
5. Per-examiner tokenized form links. The shared link with a pre-scoped examiner panel is the v1 model. Per-examiner unique tokens are not built.
6. Lead / responsible examiner designation. All examiners are equal in v1. The session document owns all metadata.
7. Student performance ordering within a session. Students are an unordered list within a session.
8. Automatic report card generation on completion. Generation is always admin-triggered, never automatic.
9. External examiners (non-Staff Members). All examiners must be existing Staff Members in the `teachers` collection in v1.
10. Assessment event type duplication / cloning UI. Admin must create event types from scratch in v1.
11. Assessment result disputes or formal review workflow. Pass/fail override with a required note is the v1 mechanism.
12. Audit log as a dedicated Firestore collection. Post-lock edit audit entries are appended to the `assessmentSession` document as `auditLog: AuditEntry[]` in v1.

---

## SECTION M — Open Questions

| Question | Why It Matters | Default Assumption If Skipped |
|---|---|---|
| Can a student appear in multiple sessions within the same Assessment Event? | Determines whether `studentId` uniqueness is enforced per session or per event. | Allow the same student in multiple sessions within one event. Enforce uniqueness per session only (one `AssessmentStudentRecord` per `studentId` per `sessionId`). |
| What is the exact category score displayed on the report card — the rounded average across examiners, or the mode (most common score)? | Average may not correspond to a whole-number level; mode always maps cleanly to a descriptor. | Display the Scoring Level descriptor corresponding to the rounded average. If the average falls exactly between two levels, round up. |
| Should existing `recitalHistory` entries on the Student Pedagogical Record be migrated or archived when this add-on goes live? | Existing informal log entries predate the add-on. Any that recorded past assessed recitals will be orphaned from the new system. | Retain all existing `recitalHistory` entries unchanged. No migration. Admin is responsible for any historical data they wish to re-enter into Academic Hub. |
| Does the conservatory stamp on the report card come from a conservatory-wide setting, or is it configurable per session or event? | Affects the PDF template data source. If stamps vary by department, additional configuration is needed. | Use the conservatory-wide logo/stamp from the existing Settings module. No per-session stamp configuration in v1. |
| Should the examiner form support RTL layout for Hebrew? | Base spec v1.3 includes RTL/translation support as a v1.2 migration item. | Follow the RTL/i18n approach established in the base spec. If the base spec's RTL implementation is complete before Phase 12, apply it to the examiner form. If not, build LTR-first and note as a known gap. |
| What is the complete scope of the session audit log in v1? | Post-lock edits, unlocks, and pass/fail overrides all warrant audit entries. Storing as an array on the session document has a ~1MB Firestore doc size limit. | Audit log stored as `auditLog: AuditEntry[]` on the `assessmentSession` document. Each entry: `{ action, performedBy, performedAt, note }`. If the array grows beyond 500 entries (unlikely in v1), revisit in v2. |

---

## SECTION N — Handoff Note for Stage 3

This add-on introduces the **Academic Hub** module to Cadenza Management Platform (v1.3), a React/TypeScript + Firebase application for conservatory management. Academic Hub is a new top-level sidebar section enabling formal student assessment: admins create Assessment Event Types (configurable rubrics, scoring scales, pass thresholds), then create Assessment Events and Sessions, distribute a shared tokenized examiner form, receive real-time submissions from teachers, review averaged results, and generate and dispatch PDF report cards to student guardians. The base app already has a proven tokenized-form pattern (HoursReport), a Staff Members collection, and a Student entity with a Pedagogical Record — all of which this add-on extends rather than replaces. Your job is to build the Academic Hub module and all of its supporting collections, Cloud Functions, and UI surfaces as defined in Sections D through I above. Do not touch any frozen UI module or existing collection schema unless Section D explicitly instructs an extension.

The single most important architectural constraint is the **examiner form's security model**. The form at `/assess/{formToken}` must be publicly accessible — no Firebase Auth required, as examiners do not have Cadenza accounts — but the `formToken` must be validated server-side via a Cloud Function before any session data is exposed to the client. The Cloud Function must verify the token maps to an existing, open (non-locked) session before returning session data. If this is implemented incorrectly — either over-securing (breaking the form for examiners without accounts) or under-securing (exposing session data to anyone with a guessed token) — the core workflow of the add-on breaks. The HoursReport tokenized form pattern in the base spec is the reference implementation.

The most important open question to resolve before Phase 14 begins: **is the conservatory's logo and stamp already stored in Firestore as part of the base spec Settings module, and in what field path and format?** The Classic report card template requires these assets. If they are not yet stored, a Settings extension to upload and store them must be added to Phase 11 before Phase 14 can complete. Confirm this against the live codebase before starting Phase 14.

---

## SECTION O — Spec Integration Checklist

*Run this checklist after pasting this Add-On Spec Block into `Cadenza_Spec_v1_3.md` to produce `Cadenza_Spec_v1_4.md`. Delete this section from the base spec after completion.*

- [ ] Bump base spec version number to v1.4 and update date
- [ ] Append Section A summary to base spec Section 01 (Canonical Summary)
- [ ] Append Section C rows to base spec Section 03 (Glossary)
- [ ] Append Section D tables to base spec Section 10 (Data Schema)
- [ ] Append Section E rows to base spec Section 14 (Entity Relationship Map)
- [ ] Append Section F rows to base spec Section 15 (State Machine Registry)
- [ ] Append Section G rows to base spec Section 16 (Workflow Ownership Table)
- [ ] Append Section H rows to base spec Section 17 (Financial Logic Register)
- [ ] Append Section I phases (11–15) to base spec Section 06 (Phase Definitions)
- [ ] Append Section J rows to base spec Section 13 (Scope Magnitude Log)
- [ ] Append Section K rows to base spec Section 09 (Edge Cases & Failure Handling)
- [ ] Append Section L items to base spec Section 08 (Exclusion List)
- [ ] Append Section M rows to base spec Section 11 (Open Questions)
- [ ] Confirm Section N Handoff Note replaces or supplements base spec Section 12
- [ ] Delete Section O (this checklist) from integrated spec
- [ ] Send integrated spec to Stage 3 build AI
