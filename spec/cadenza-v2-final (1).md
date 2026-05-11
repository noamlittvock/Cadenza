# Cadenza — Product Specification v2.0 Final

**Product:** Cadenza — Calendar-First Conservatory Management Platform
**Version:** 2.0 Final
**Status:** Pre-build. Ready for Stage 3.
**Supersedes:** v1.3 entirely. No migration from v1.3 data.
**Stack:** React / TypeScript / Firebase Firestore
**Consolidated:** 2026-03-06

---

## 00 — How to Read This Spec

This document is the single source of truth for the Cadenza v2.0 build. It supersedes all prior versions. Where v1.3 and v2.0 conflict, v2.0 wins.

The spec is phase-gated. Each phase has a Definition of Done. The build AI must not proceed to the next phase until the current phase's DoD is fully satisfied.

Ambiguities not resolved in this document must be surfaced as open questions before building, not resolved unilaterally.

---

## 00.1 — Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18+ with TypeScript |
| Database | Firebase Firestore (NoSQL document store, orgId-scoped) |
| Authentication | Firebase Authentication (uid-based; role resolved server-side — see Section 13) |
| Server-side logic | Firebase Cloud Functions (callable functions — required for rate resolution, RateSnapshot creation, and durationMinutes computation) |
| Hosting | Firebase Hosting |

**Server-side requirement:** The following operations must never run client-side. They require Cloud Functions callable endpoints:

- Billing resolution and RateSnapshot creation (Section 08)
- `durationMinutes` computation at event save (Section 17)
- Role resolution via `uid → StaffMember.role` lookup (Section 13)
- Payslip aggregation (Section 17)

If any of the above are implemented client-side, treat it as a spec violation.

---

## 00.2 — Architecture Map

### Engine vs. Data Layer

| Concern | Classification | Standard |
|---|---|---|
| Billing resolution logic | Engine | Hardcoded, server-side only, fully tested |
| RateSnapshot creation | Engine | Write-once, immutable after creation |
| durationMinutes computation | Engine | Server-side only; client must not compute |
| State machine transitions | Engine | Validate against enum; no freeform strings |
| Payslip aggregation formula | Engine | Exact formula from Section 17; no approximation |
| Firestore document schemas | Data Layer | Schema-validated, parameterized by orgId |
| Activity module configuration | Data Layer | Driven by template — not hardcoded per activity |
| Event form field visibility | Data Layer | Driven by Activity.modules flags at runtime |
| Org timezone | Data Layer | Stored in OrgSettings; referenced by engine, not hardcoded |

### Primary Data Flows

**Event creation:**
```
Admin submits event form
  → Cloud Function: resolve rate (Section 08)
  → Cloud Function: compute durationMinutes (startTime, endTime, OrgSettings.timezone)
  → Write Event document
  → Write EventParticipant document(s) with immutable RateSnapshot
```

**Payslip generation:**
```
Admin selects staffMemberId + billingPeriod
  → Cloud Function: query EventParticipant where staffMemberId = X
                    and event.date within billingPeriod
                    and event.status = COMPLETED
  → Apply financial formulas from Section 17 per rateType
  → Return itemized output (not stored — derived on demand)
```

**Permission resolution (every Firestore request):**
```
request.auth.uid
  → lookup StaffMember where uid = request.auth.uid
  → read StaffMember.role
  → evaluate against rule (no client claim is authoritative)
```

### Component Boundary Rules

- Engine code must not read from hardcoded activity names, rate values, or org-specific constants
- Data Layer code must not implement billing formulas or state transitions
- Client UI may read Firestore directly for display; all writes that trigger billing or status changes must go through Cloud Functions

---

## 00.3 — Scope Magnitude Log

This log records phases and decisions that carry elevated scope, risk, or dependency impact. The build AI must read this section during Step 0 and flag any blocking item without a phase assignment in Section 18.

| ID | Phase | Classification | Risk / Note |
|---|---|---|---|
| SML-001 | Phase 1 — Firestore Schema | **Foundation (blocking)** | All subsequent phases depend on correct collection structure and orgId isolation. Security rules established here are the base for Phase 8. Under-specifying Phase 1 rules creates retrofitting cost in Phase 8. |
| SML-002 | Phase 5 — Calendar & Event Creation | **Deferred constraint (blocking)** | AMD-20260306-006 (Recurring Events) is DEFERRED. Phase 5 must preserve v1.3 recurrence without modifying it. Do not build new recurrence logic. Build AI must read the existing recurring event implementation before touching Phase 5. |
| SML-003 | Phase 8 — Permissions & Auth | **Scope risk** | Phase 8 is placed after all feature phases (2–7). This means permission enforcement is retroactive. Build AI must not implement features in Phases 2–7 that would be structurally incompatible with Phase 8 rules — flag any such patterns before implementing. Mitigation: Phase 1 establishes orgId isolation; Phase 8 adds role-level enforcement. |
| SML-004 | Phase 12 — CSV Import / Export | **Scope expansion** | Largest single phase. Introduces two new Firestore schemas (ImportSession, ImportRowResult), a 3-step modal flow, and a mandatory codebase consolidation pass. The consolidation requirement (remove all legacy CSV controls before building new ones) must be completed before any new Phase 12 UI is written. Treat Phase 12 as a sub-project with its own internal sequencing: consolidation → Import / Export dropdown → import flow → export flow → template download. |

---

## 01 — Product Purpose

Cadenza is a conservatory management platform built around a calendar. It manages activities, staff, students, and events — and derives all compensation from calendar events. No event means no pay. The calendar is the source of truth for billing.

---

## 02 — Core Architectural Principle

**All compensation is event-derived.**

Roles, assignments, and activities exist only to provide rate context for events. The payslip engine never calculates pay from a staff member's profile directly — it always works from the events that person participated in during the billing period.

---

## 03 — Glossary

### Entity & Concept Terms

| Canonical Term | Definition | Do Not Use |
|---|---|---|
| Activity | A standing entity in the Activity Hub defining the rules, structure, and billing configuration for a type of work. Exists independently of the calendar. | Session, Class type, Course |
| Activity Template | The structural pattern applied at activity creation time. Determines hierarchy depth, visible modules, and event form behavior. One of: Discipline, Program, Ensemble, External, Administrative. | Activity type, Category type |
| Activity Type | The top-level classification of an activity. One of: Academic, Administrative, Performances, Special Events. Derived from the template — not a field the admin explicitly chooses. | Category, Track |
| Activity Hub | The dedicated admin section of the application where activities, templates, and subcategory hierarchies are created and managed. Separate from the calendar. | Activity manager, Activity settings |
| L1 Subcategory | The first grouping level beneath an activity. Optional — not all activity templates require it. Example: "Individual Lessons" under Academic. | Category, Group |
| L2 Subcategory | The second grouping level, always required when L1 exists. Example: "Violin" under Individual Lessons. | Subcategory (unqualified) |
| Event | A single calendar instance. Always belongs to an activity. Inherits billing rules from that activity. | Session, Occurrence, Booking |
| TeachingAssignment | The record linking a staff member to a specific activity (at L2 level) with their negotiated rate and effective dates. | Position, Role assignment |
| OrgRole | An organizational role held by a staff member that is not tied to any activity in the hierarchy. Has its own rate. Examples: CEO, IT Manager, Department Head. | Administrative position, Title |
| RateSnapshot | The rate value copied onto an EventParticipant at the moment the event is created. Immutable after creation. Ensures past events always reflect what was agreed at that time. | Historical rate, Archived rate |
| ExternalPayee | A one-off participant on a specific event who has no staff profile. Paid a flat fee attached to that event only. | Guest, Visitor, External staff |
| RateOverride | An event-level rate that replaces the standard TeachingAssignment rate for that specific event only. Does not affect the standing assignment. | Exception rate, One-off rate |
| Module | A configurable capability that can be enabled on an activity. Determines which fields appear on the event form. One of: Curriculum, Staff Billing, Revenue, External Participants, Org Role Billing. | Feature, Option, Setting |
| Enrollment | The record linking a student to an activity. Created through a dedicated enrollment flow. Required before a student can be assigned to an event for that activity. | Registration, Assignment |
| EventParticipant | The record linking a staff member or external payee to a specific event. Carries the RateSnapshot (and optional RateOverride) used for billing. One document per participant per event. | Event attendee, Event staff record |
| RevenueItem | A revenue line item embedded in an Event document. Represents a single revenue source (e.g. ticket sale, participation fee, room hire). Contains a type, amount, quantity, and optional notes. Only present when the Revenue module is enabled on the event's activity. | Revenue entry, Income line |
| OnboardingState | The Firestore document scoped per org (`onboardingState/{orgId}`) that tracks org-level setup completion flags: activitiesCreated, staffAdded, studentsAdded, firstEventCreated, and setupGateCleared. Used to drive the setup gate and checklist. | Setup state, Org flags |
| OrgSettings | The Firestore document scoped per org (`orgSettings/{orgId}`) that stores org-level configuration. In v2.0 this contains the IANA timezone identifier. Required before any events can be created. | Org config, Settings document |
| Payslip | A generated monthly summary of all event-derived compensation for a staff member. | Invoice, Salary slip |
| Billing Period | The date range used to scope a payslip calculation. Typically one calendar month. Defined by the admin at payslip generation time. | Pay period, Month |
| Roster | The list of students belonging to an Ensemble activity, stored as EnsembleRosterMember documents. Managed at the activity level via the Roster tab in the Ensemble activity detail view. Inherited read-only by each event of that activity. Not applicable to Discipline, Program, External, or Administrative templates. | Student list, Class list |
| EnsembleRosterMember | The document linking a student to an Ensemble activity's roster, with effective date range. One record per student per Ensemble activity. Distinct from Enrollment. | Roster entry, Ensemble enrollment |
| durationMinutes | The duration of an event in minutes, computed server-side at event save time from startTime and endTime in org timezone. Used as the basis for HOURLY billing calculations. Client must not compute independently. | Duration, Length |
| System | An automated actor (not a human user) that triggers state changes or writes in response to conditions being met — e.g. flipping setupGateCleared, updating firstUseFlags. Used as the owner of system-triggered workflows in Section 16. | — |

### Permission Terms

| Canonical Term | Definition | Do Not Use |
|---|---|---|
| Super Admin | Highest permission level. Can create and edit Activity Hub, staff, students, and system config. Stored as StaffMember.role = SUPER_ADMIN. | Owner, Root user |
| Admin | Can create and edit staff, students, and events. Cannot edit Activity Hub structure. Stored as StaffMember.role = ADMIN. | Manager |
| Staff (role) | The lowest permission tier. A staff member who can only view their own payslips and has no create/edit/archive access. Stored as StaffMember.role = STAFF. Distinct from StaffMember (the entity). | Staff member (ambiguous) |
| uid | The Firebase Auth UID assigned to a StaffMember at account creation. Used as the join key between a Firebase Auth session and a StaffMember Firestore document. Immutable after creation. | Auth ID, Firebase ID |
| Role | The permission tier assigned to a StaffMember. One of: SUPER_ADMIN, ADMIN, STAFF. Stored as StaffMember.role. Governs all access control decisions and Firestore security rule evaluations. | Permission level, Access level |

### CSV Terms

| Canonical Term | Definition | Do Not Use |
|---|---|---|
| ImportSession | A record of a single CSV bulk import attempt for a specific entity type. Tracks status, per-row results, and errors. Created when an admin uploads a CSV file and persists after import completes. | Import job, Upload record |
| Import Template | A downloadable CSV file with the correct column headers and an example row for a specific entity type. Available from the Import / Export dropdown for each supported module. | CSV template, Import format |
| Duplicate Resolution | The interactive step within the Import Review screen where the admin decides whether to overwrite or skip an imported row that matches an existing record. | Merge, Conflict resolution |
| Import / Export Dropdown | The canonical UI control for all CSV functionality in Cadenza. A single dropdown button labelled "Import / Export" present on each module that supports CSV operations. Contains exactly three items: Import, Export, Download Template. Replaces all previously scattered import, export, and template download buttons across the app. | Import button, Export button, Template button (as standalone controls) |
| CSV Export | The action of generating and downloading a CSV file of existing Cadenza records for a given entity type, scoped by admin-selected filters before download. Available from the Import / Export dropdown. | Data export, Download records |
| Export Scope Selector | A pre-export modal that lets the admin define which records are included in a CSV export — e.g. date range, archived status, activity filter. Appears before the file is generated. | Export filter, Export options |

### Status Value Definitions

The following status values are used across the data model. Each is defined here canonically and must not be interpreted differently elsewhere in the spec.

| Status Value | Applies To | Definition |
|---|---|---|
| SCHEDULED | Event.status | The event has been created and is planned to occur. Default state at event creation. May still be edited, cancelled, or archived. Not yet completed. |
| COMPLETED | Event.status | The event has occurred and the admin has manually confirmed completion. Terminal for billing purposes — EventParticipant records for this event are included in payslip calculations. Cannot be reversed. |
| CANCELLED | Event.status | The event was cancelled before occurring. Excluded from payslip calculations. Can be reinstated to SCHEDULED. |
| ARCHIVED | Event.status | The event was cascade-archived because its parent activity or subcategory was archived. Terminal. Cannot be reinstated. |
| ACTIVE | Enrollment.status | The enrollment is current. The student is active in this activity at this L2 level and can be assigned to events. |

Note: `isArchived` (boolean) is a separate soft-delete flag used on Activity, L1Subcategory, L2Subcategory, StaffMember, TeachingAssignment, OrgRole, Student, and EnsembleRosterMember. It is not a formal status field — it is governed by the cascade rules in Section 10. The ARCHIVED value in Event.status is distinct from the isArchived flag and is not used on those entities.

---

## 04 — Entity Overview

Five primary entities. All are first-class Firestore documents. No entity is embedded as an array inside another entity's document, except where explicitly specified.

1. **Activity** — the standing definition of a type of work
2. **Staff Member** — a person employed by the conservatory
3. **Student** — a person enrolled in conservatory activities
4. **Event** — a calendar instance of an activity
5. **Enrollment** — links a student to an activity

Supporting records (embedded or subcollection as specified):
- TeachingAssignment — links staff to activity with rate
- OrgRole — links staff to an administrative role with rate
- EventParticipant — links staff or external payee to a specific event; carries the RateSnapshot
- RateSnapshot — immutable rate record on EventParticipant
- EnsembleRosterMember — links a student to an Ensemble activity roster with effective dates
- RevenueItem — embedded in Event; represents a revenue line item (Revenue module only)
- ImportSession — records a CSV import attempt for an entity type, including per-row results and error log
- OnboardingState — org-level setup completion flags (one document per org)
- OrgSettings — org-level configuration including timezone (one document per org)

---

## 05 — Data Schema

### Activity

```
activities/{activityId}

id:             string
orgId:          string
name:           string
template:       'DISCIPLINE' | 'PROGRAM' | 'ENSEMBLE' | 'EXTERNAL' | 'ADMINISTRATIVE'
activityType:   'ACADEMIC' | 'ADMINISTRATIVE' | 'PERFORMANCES' | 'SPECIAL_EVENTS'
                (derived from template at creation, stored for querying)
modules:        {
                  curriculum:          boolean
                  staffBilling:        boolean
                  revenue:             boolean
                  externalParticipants: boolean
                  orgRoleBilling:      boolean
                }
location:       string | null
eventNameMode:  'AUTO' | 'PROMPTED'
                (AUTO for Discipline/Program, PROMPTED for Ensemble/External/Administrative)
isArchived:     boolean
createdAt:      Timestamp
updatedAt:      Timestamp
```

### L1Subcategory

```
l1Subcategories/{l1Id}

id:             string
orgId:          string
activityId:     string       → Activity.id
name:           string
isArchived:     boolean
createdAt:      Timestamp
updatedAt:      Timestamp
```

### L2Subcategory

```
l2Subcategories/{l2Id}

id:             string
orgId:          string
activityId:     string       → Activity.id
l1Id:           string | null  → L1Subcategory.id (null if L1 not used)
name:           string
defaultRate:    null         (rate lives on TeachingAssignment, not here)
isArchived:     boolean
createdAt:      Timestamp
updatedAt:      Timestamp
```

### StaffMember

```
staffMembers/{staffId}

id:                   string
orgId:                string
uid:                  string       (Firebase Auth UID — set at account creation, immutable.
                                   Primary join key between Firebase Auth and StaffMember document.
                                   Used by all Firestore security rules to resolve the requesting user.)
role:                 'SUPER_ADMIN' | 'ADMIN' | 'STAFF'
                                   (Set at account creation. Updatable by Super Admin only.
                                   Authoritative on this document — never read from client state alone.)
fullName:             string
email:                string
phone:                string | null
isArchived:           boolean
createdAt:            Timestamp
updatedAt:            Timestamp

-- onboarding fields --
isFirstAdmin:         boolean    (true for the account that initialized the org)
onboardingDismissed:  boolean    (per user — true once this user dismisses the tour)
firstUseFlags:        {          (per user — tracks which features have been used for first-use walkthrough)
                        activityHub:    boolean
                        staffModule:    boolean
                        studentModule:  boolean
                        eventCreation:  boolean
                        enrollment:     boolean
                        payslips:       boolean
                      }
```

### TeachingAssignment

```
teachingAssignments/{assignmentId}

id:             string
orgId:          string
staffMemberId:  string       → StaffMember.id
activityId:     string       → Activity.id
l2Id:           string       → L2Subcategory.id
rateType:       'HOURLY' | 'PER_EVENT' | 'MONTHLY_FLAT'
rateValue:      number
startDate:      string       (ISO date)
endDate:        string | null
isArchived:     boolean
createdAt:      Timestamp
updatedAt:      Timestamp
```

### OrgRole

```
orgRoles/{orgRoleId}

id:             string
orgId:          string
staffMemberId:  string       → StaffMember.id
roleTitle:      string       (e.g. "CEO", "IT Manager", "Head of Piano Department")
rateType:       'HOURLY' | 'PER_EVENT' | 'MONTHLY_FLAT'
rateValue:      number
startDate:      string
endDate:        string | null
isArchived:     boolean
createdAt:      Timestamp
updatedAt:      Timestamp
```

### Student

```
students/{studentId}

id:             string
orgId:          string
fullName:       string
dateOfBirth:    string | null
parentName:     string | null
parentPhone:    string | null
isArchived:     boolean
createdAt:      Timestamp
updatedAt:      Timestamp
```

### Enrollment

```
enrollments/{enrollmentId}

id:             string
orgId:          string
studentId:      string       → Student.id
activityId:     string       → Activity.id
l2Id:           string       → L2Subcategory.id
startDate:      string
endDate:        string | null
status:         'ACTIVE' | 'ARCHIVED'
createdAt:      Timestamp
updatedAt:      Timestamp
```

### Event

```
events/{eventId}

id:             string
orgId:          string
name:           string       (auto-generated or admin-entered depending on eventNameMode)
activityId:     string       → Activity.id
l1Id:           string | null → L1Subcategory.id
l2Id:           string | null → L2Subcategory.id
location:       string       (inherited from Activity.location, overridable per event)
date:           string       (ISO date, YYYY-MM-DD, in org timezone)
startTime:      string       (ISO 8601 time, HH:MM, in org timezone — stored as-is; canonical
                             timezone defined by OrgSettings)
endTime:        string       (ISO 8601 time, HH:MM, in org timezone — must be > startTime on
                             same date; cross-midnight not supported in v2.0)
durationMinutes: number      (computed server-side at save: endTime − startTime in org timezone,
                             stored in minutes for billing; client must not compute independently)
isRecurring:    boolean
recurringGroupId: string | null
status:         'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED'
revenueItems:   RevenueItem[] | null   (only if Activity.modules.revenue = true)
notes:          string | null
createdAt:      Timestamp
updatedAt:      Timestamp
```

### EventParticipant

```
eventParticipants/{participantId}

id:                   string
orgId:                string
eventId:              string       → Event.id
participantType:      'STAFF' | 'EXTERNAL'

-- if STAFF --
staffMemberId:        string       → StaffMember.id
assignmentType:       'TEACHING' | 'ORG_ROLE'
teachingAssignmentId: string | null → TeachingAssignment.id
orgRoleId:            string | null → OrgRole.id
rateSnapshot:         {            (copied at event creation, immutable)
                        rateType:      string
                        rateValue:     number
                        snapshotDate:  Timestamp
                      }
rateOverride:         number | null  (replaces rateSnapshot.rateValue if set;
                                     only settable while event.status = SCHEDULED)

-- if EXTERNAL --
externalName:         string
oneOffFee:            number
notes:                string | null

createdAt:            Timestamp
```

### EnsembleRosterMember

```
ensembleRosterMembers/{rosterId}

id:           string
orgId:        string
activityId:   string       → Activity.id  (must be an ENSEMBLE template activity)
studentId:    string       → Student.id
startDate:    string       (ISO date — when student joined the ensemble roster)
endDate:      string | null (ISO date — when student left; null if still active)
isArchived:   boolean
createdAt:    Timestamp
updatedAt:    Timestamp
```

EnsembleRosterMember is distinct from Enrollment. Enrollment links a student to an activity for curriculum/billing purposes; EnsembleRosterMember links a student to an Ensemble activity for event attendance purposes. At event creation time for an Ensemble activity, the student list is derived by querying all EnsembleRosterMembers where activityId = event.activityId, isArchived = false, startDate ≤ event.date, and (endDate is null OR endDate ≥ event.date). This list is read-only on the event form — it is not edited per event.

### RevenueItem (embedded in Event)

```
{
  id:       string
  type:     'TICKET' | 'PARTICIPATION_FEE' | 'ROOM_HIRE' | 'OTHER'
  amount:   number
  quantity: number | null
  notes:    string | null
}
```

Only present when Activity.modules.revenue = true. Stored as an embedded array on the Event document. The line total formula (amount × quantity) is a deferred financial calculation — not registered in Section 17 for v2.0. See Section 17 for stub entry.

### ImportSession

```
importSessions/{sessionId}

id:               string
orgId:            string
createdBy:        string            → StaffMember.id
entityType:       'STUDENT' | 'STAFF_MEMBER' | 'ENROLLMENT' | 'EVENT' | 'TEACHING_ASSIGNMENT'
status:           'PENDING' | 'REVIEWING' | 'IMPORTING' | 'COMPLETED' |
                  'COMPLETED_WITH_ERRORS' | 'CANCELLED'
fileName:         string            (original uploaded filename)
totalRows:        number            (total data rows in CSV, excluding header)
importedRows:     number            (rows successfully written)
skippedRows:      number            (rows skipped due to unresolved errors)
rowResults:       ImportRowResult[] (embedded array — one entry per CSV row)
createdAt:        Timestamp
updatedAt:        Timestamp
```

### ImportRowResult (embedded in ImportSession)

```
{
  rowIndex:         number          (1-based row number from CSV)
  status:           'PENDING' | 'VALID' | 'DUPLICATE' | 'ERROR' | 'IMPORTED' | 'SKIPPED'
  rawData:          object          (key-value map of all CSV columns for this row)
  resolvedData:     object | null   (data as it will be written — after mapping + edits)
  errorMessage:     string | null   (human-readable description of validation error)
  duplicateOf:      string | null   → existing entity id if DUPLICATE status
  duplicateAction:  'OVERWRITE' | 'SKIP' | null  (admin's resolution choice)
  autoCreated:      string[] | null (list of entity ids auto-created as dependencies)
}
```

### OnboardingState

```
onboardingState/{orgId}

orgId:                string
activitiesCreated:    boolean    (org-level — flips true when first activity is created by anyone)
staffAdded:           boolean    (org-level — flips true when first staff member is added by anyone)
studentsAdded:        boolean    (org-level — flips true when first student is added by anyone)
firstEventCreated:    boolean    (org-level — flips true when first event is created by anyone)
setupGateCleared:     boolean    (org-level — flips true when activitiesCreated AND staffAdded are both true)
```

### OrgSettings

```
orgSettings/{orgId}

orgId:      string
timezone:   string    (IANA timezone identifier, e.g. "Asia/Jerusalem", "America/New_York",
                      "Europe/London". Required. Set during org initialization. Displayed in
                      settings. All event times are interpreted and displayed in this timezone.)
createdAt:  Timestamp
updatedAt:  Timestamp
```

---

## 06 — Activity Templates

Each template pre-configures the activity's structure and modules. The admin picks a template at creation time and never thinks about hierarchy depth or module selection explicitly.

### DISCIPLINE
- **Use for:** Instrument lessons, theory, vocals, individual or group curriculum
- **Hierarchy:** L1 required (e.g. Individual Lessons, Group Lessons) → L2 required (e.g. Violin, Piano)
- **Default modules:** Curriculum ON, Staff Billing ON
- **Event name mode:** AUTO
- **Student field:** Required (single for individual, multi for group)
- **Participant cardinality:** Staff 1 or more. Students: 1 (individual) or 2+ (group — selection is per-event; admin toggles between single-select and multi-select mode at event creation time). External participants: not permitted.

### PROGRAM
- **Use for:** School partnerships, external program locations
- **Hierarchy:** L1 required (e.g. Schools Program) → L2 required (e.g. Hard-Knocks, Rabin Elementary)
- **Default modules:** Curriculum ON, Staff Billing ON
- **Event name mode:** AUTO
- **Student field:** Required, scoped to enrolled students at that L2 location
- **Participant cardinality:** Staff 1 or more. Students 1 or more (scoped to enrolled students at that L2 location). External participants: not permitted.

### ENSEMBLE
- **Use for:** Orchestras, choirs, chamber groups, ensembles
- **Hierarchy:** L1 optional → L2 required (e.g. Youth Orchestra)
- **Default modules:** Curriculum ON, Staff Billing ON
- **Event name mode:** PROMPTED
- **Student field:** Roster-based (managed at activity level, inherited per event)
- **Participant cardinality:** Staff 1 or more. Students: roster-derived (no per-event student picker). External participants: permitted only when External Participants module is enabled.

### EXTERNAL
- **Use for:** Room hire, community bookings, external events
- **Hierarchy:** L1 optional → L2 required (e.g. Community Synagogue)
- **Default modules:** Revenue ON, External Participants ON
- **Event name mode:** PROMPTED
- **Student field:** Hidden
- **Participant cardinality:** Staff 0 or more (optional). Students: none. External participants: 0 or more.

### ADMINISTRATIVE
- **Use for:** Org roles, admin overhead, internal institutional functions
- **Hierarchy:** None — activity stands alone
- **Default modules:** Org Role Billing ON
- **Event name mode:** PROMPTED
- **Student field:** Hidden
- **Participant cardinality:** Staff 1 or more (OrgRole-billed). Students: none. External participants: not permitted.

---

## 07 — Module Definitions

### Curriculum
Enables: L2 subcategory selection, student assignment, enrollment enforcement
Behavior: Event form shows student field. Students filtered to those enrolled in this activity at L2 level.

### Staff Billing
Enables: Staff assignment on event, TeachingAssignment rate resolution, RateSnapshot creation
Behavior: Staff picker filtered to those with a TeachingAssignment for this activity. Rate resolved silently at event creation.

### Revenue
Enables: RevenueItem array on event (tickets, participation fees, room hire)
Behavior: Event form shows revenue section. Admin can add multiple revenue line items.

### External Participants
Enables: ExternalPayee records on event
Behavior: Event form shows "Add external participant" option. Name + one-off fee required.

### Org Role Billing
Enables: OrgRole rate resolution on event instead of TeachingAssignment
Behavior: Staff picker shows all staff. Rate resolved from matching OrgRole record.

---

## 08 — Billing Resolution Logic

When an EventParticipant record is created for a STAFF participant, rate resolution runs server-side.

### Teaching Assignment Resolution (Staff Billing module ON)

Find exactly one TeachingAssignment satisfying all of:
- `staffMemberId == selected staff`
- `activityId == event.activityId`
- `l2Id == event.l2Id`
- `isArchived == false`
- `startDate <= event.date`
- `endDate is null OR endDate >= event.date`

If zero matches → block save. Error: "No active assignment found for this staff member at this activity and level."
If more than one match → block save. Error: "Configuration error: multiple overlapping assignments exist. Contact Super Admin."
If exactly one match → copy rateType and rateValue into RateSnapshot with current timestamp.

### Org Role Resolution (Org Role Billing module ON)

Find all OrgRoles satisfying all of:
- `staffMemberId == selected staff`
- `isArchived == false`
- `startDate <= event.date`
- `endDate is null OR endDate >= event.date`

If zero matches → block save. Error: "No active org role found for this staff member on this date."
If exactly one match → copy rateType and rateValue into RateSnapshot.
If more than one match → do not auto-resolve. Require admin to select the applicable OrgRole explicitly before save. Show picker: "This staff member holds multiple active roles. Select the role to bill for this event."

### General Rules

4. If `rateOverride` is set on EventParticipant, use that value instead of `rateSnapshot.rateValue` for billing calculations. `rateOverride` is only settable while `event.status = SCHEDULED`.
5. `rateSnapshot` is write-once. After EventParticipant creation, all snapshot fields (`rateType`, `rateValue`, `snapshotDate`) are immutable regardless of subsequent assignment changes.
6. All resolution logic runs in a server-side callable function. Client-side resolution is not authoritative.

---

## 09 — Event Name Generation

| eventNameMode | Behavior |
|---|---|
| AUTO | If event has exactly one staff participant: `[L2 Name] · [Staff First Name] · [Date]` e.g. "Violin · Choffi · 14 Mar 2026". If event has multiple staff participants: `[L2 Name] · [Date]` — staff name is omitted. Name is generated at save time from participants on record at that moment. |
| PROMPTED | Admin enters name manually. System pre-fills a suggestion: `[Activity Name] · [Date]`. Admin can accept or overwrite. |

---

## 10 — Archive Cascade Rules

| Action | Cascade |
|---|---|
| Archive Activity | All future Events with this activityId set to status: ARCHIVED. Past events untouched. |
| Archive Activity (ENSEMBLE) | All EnsembleRosterMember records for this activityId set to isArchived = true. |
| Archive L1Subcategory | All future Events with this l1Id set to status: ARCHIVED. |
| Archive L2Subcategory | All future Events with this l2Id set to status: ARCHIVED. All Enrollments with this l2Id set to status: ARCHIVED. |
| Archive StaffMember | All future EventParticipants for this staff member removed from scheduled events. Past records untouched. |
| Archive Student | All Enrollments for this student set to status: ARCHIVED. Student removed from future event rosters. All EnsembleRosterMember records for this student set to isArchived = true. |

---

## 11 — State Machines

### Event.status

```
SCHEDULED → COMPLETED   (admin manually marks event as completed)
SCHEDULED → CANCELLED   (admin cancels)
SCHEDULED → ARCHIVED    (cascade from activity/subcategory archive — terminal)
CANCELLED → SCHEDULED   (admin reinstates)
COMPLETED → [terminal]
ARCHIVED  → [terminal]
```

Note: SCHEDULED → COMPLETED is always a manual admin action. There is no automatic end-of-day transition. Events that have passed without being marked complete remain SCHEDULED until the admin acts. This is intentional — it prevents phantom completions when events are rescheduled or cancelled after the fact.

### Enrollment.status

```
ACTIVE → ARCHIVED   (manual or cascade from student/activity archive)
ARCHIVED → ACTIVE   (manual reinstatement)
```

### ImportSession.status

```
PENDING → REVIEWING        (CSV parsed successfully; admin enters interactive review step)
REVIEWING → IMPORTING      (Admin confirms import)
REVIEWING → CANCELLED      (Admin cancels before confirming — terminal)
IMPORTING → COMPLETED      (All selected rows written without error — terminal)
IMPORTING → COMPLETED_WITH_ERRORS  (Some rows failed; error report shown with inline fix — terminal)
```

COMPLETED, COMPLETED_WITH_ERRORS, and CANCELLED are terminal states. Admin may re-upload a new CSV at any time to start a new ImportSession.

### isArchived (universal flag — all entities)

All entities (Activity, L1Subcategory, L2Subcategory, StaffMember, TeachingAssignment, OrgRole, Student) carry an `isArchived: boolean` field. This is not a formal state machine — it is a soft-delete flag governed entirely by the cascade rules in Section 10. There are no additional transitions beyond false → true (archive) and true → false (restore, admin action only). Archived entities are excluded from all pickers, lists, and queries by default.

---

## 12 — Event Form Behavior (Three-Zone UI)

### Zone 1 — Always visible
- Activity picker (searchable, grouped by type and hierarchy)
- Date
- Start time / End time

Once activity is selected, Zone 2 appears.

### Zone 2 — Contextual (driven by activity modules)
Fields appear only if the relevant module is enabled on the selected activity:

| Module | Fields shown |
|---|---|
| Curriculum | Student assignment (single/multi/roster depending on template) |
| Staff Billing | Staff member picker (filtered to assigned staff), rate shown read-only |
| Org Role Billing | Staff member picker (all staff), role shown read-only |
| Revenue | Revenue items section (type, amount, quantity) |
| Location | Pre-populated from activity, overridable |

### Zone 3 — Exceptions (always collapsed by default)
- Rate override — replaces standard rate for this event only
- Add external participant — name + one-off fee

Zone 3 is accessed via a subtle "Add exception" link. Hidden unless clicked.

The "Add external participant" option within Zone 3 is only exposed when: (a) the selected activity's External Participants module is enabled AND (b) the activity template permits external participants (Ensemble, External only). It is never shown for Discipline, Program, or Administrative templates regardless of module configuration.

---

## 13 — Permissions

| Action | Super Admin | Admin | StaffMember |
|---|---|---|---|
| Create / edit Activity Hub | ✓ | ✗ | ✗ |
| Read Activity Hub (view only) | ✓ | ✓ | ✗ |
| Create / edit Staff Members | ✓ | ✓ | ✗ |
| Assign TeachingAssignment / OrgRole | ✓ | ✓ | ✗ |
| Create / edit Students | ✓ | ✓ | ✗ |
| Create / edit Enrollments | ✓ | ✓ | ✗ |
| Create / edit Events | ✓ | ✓ | ✗ |
| View Payslips | ✓ | ✓ | own only |
| Archive any entity | ✓ | ✓ | ✗ |
| Change StaffMember.role | ✓ | ✗ | ✗ |
| CSV Import (any entity type) | ✓ | ✓ | ✗ |
| CSV Export (any entity type) | ✓ | ✓ | ✗ |
| Download Import Template | ✓ | ✓ | ✗ |

**Role storage:** Permission tier is stored as `StaffMember.role`. Firestore security rules resolve the requesting user's role by: (1) reading the Firebase Auth UID from the request context, (2) looking up the StaffMember document where `uid == request.auth.uid`, (3) reading the `role` field from that document. No client-supplied role claim is authoritative.

---

## 14 — Entity Relationship Map

```
Activity (1) ──────────────────── (many) L1Subcategory
Activity (1) ──────────────────── (many) L2Subcategory
L1Subcategory (1) ─────────────── (many) L2Subcategory

Activity (1) ──────────────────── (many) Event
L2Subcategory (1) ─────────────── (many) Event

StaffMember (1) ────────────────── (many) TeachingAssignment
TeachingAssignment (many) ──────── (1) L2Subcategory
TeachingAssignment (many) ──────── (1) Activity

StaffMember (1) ────────────────── (many) OrgRole

Event (1) ──────────────────────── (many) EventParticipant
EventParticipant (many) ────────── (1) StaffMember [if STAFF type]
EventParticipant (many) ────────── (1) TeachingAssignment [if TEACHING]
EventParticipant (many) ────────── (1) OrgRole [if ORG_ROLE]

Event (1) ──────────────────────── (many) RevenueItem [embedded, Revenue module only]

Student (1) ────────────────────── (many) Enrollment
Enrollment (many) ──────────────── (1) Activity
Enrollment (many) ──────────────── (1) L2Subcategory

Activity (1) ──────────────────── (many) EnsembleRosterMember  [ENSEMBLE template only]
Student (1) ────────────────────── (many) EnsembleRosterMember

StaffMember (1) ────────────────── (many) ImportSession  [createdBy]
ImportSession contains (many) ImportRowResult  [embedded array]

OnboardingState (1) ────────────── (1) Org  [scoped by orgId, one document per org]
StaffMember (1) ────────────────── firstUseFlags + onboardingDismissed [per-user onboarding state, embedded on StaffMember]
OrgSettings (1) ────────────────── (1) Org  [scoped by orgId, one settings document per org]
```

---

## 15 — Edge Cases

| Scenario | Required Behaviour |
|---|---|
| Admin creates event for Curriculum activity, selected student is not enrolled | Block event creation. Show error: "This student is not enrolled in this activity." |
| Admin archives an activity that has events scheduled in the future | Show confirmation: "X future events will also be archived. This cannot be undone." Require explicit confirmation before proceeding. |
| Two TeachingAssignments for same (staffMemberId, activityId, l2Id) with overlapping date ranges | Block creation. Error: "An overlapping assignment already exists for this staff member at this activity and level." |
| Two TeachingAssignments for same (staffMemberId, activityId) but different l2Ids | Allow. A teacher may hold simultaneous assignments for multiple levels under the same activity. |
| Rate override set to zero | Allow. Zero is a valid override (e.g. volunteer event). |
| Event created with no staff participants | Allow for External and Administrative templates. Block for Discipline and Program templates. |
| Activity has both staffBilling and orgRoleBilling modules enabled | Treat as configuration conflict. Block activity save until one is disabled. Error: "An activity may not have both Staff Billing and Org Role Billing enabled simultaneously." |
| Event date precedes TeachingAssignment startDate | Block save. Error: "This staff member's assignment for this activity does not take effect until [startDate]." |
| Event date falls after TeachingAssignment endDate | Block save. Error: "This staff member's assignment for this activity ended on [endDate]." |
| Multiple active OrgRoles exist for same staff on event date | Do not auto-resolve. Show OrgRole picker. Admin must explicitly select the applicable role before save. |
| Discipline or Program event saved with zero staff participants | Block save. Error: "At least one staff member is required for this event." |
| Administrative event saved with zero staff participants | Block save. Error: "At least one staff member with an active org role is required for this event." |
| External participant added to Discipline, Program, or Administrative event | Block. Zone 3 external participant option must not be exposed for these templates. |
| Discipline individual event: more than one student added | Block save. Error: "Individual lesson events may only have one student. Switch to group lesson mode to add multiple students." |
| endTime is equal to or earlier than startTime (including cross-midnight entry) | Block save. Error: "End time must be later than start time. Cross-midnight events are not supported in this version." |
| OrgSettings timezone not set at event creation time | Block event creation. Error: "Organization timezone has not been configured. Contact Super Admin to complete setup." |
| durationMinutes computed as zero | Block save. Error: "Event duration must be greater than zero minutes." |
| StaffMember created with no uid | Block save. uid must be set at account creation. A StaffMember document without a uid cannot be resolved by Firestore security rules. |
| Admin attempts to change StaffMember.role | Block. Only Super Admin may update the role field. Error: "You do not have permission to change a user's role." |
| Super Admin attempts to demote their own role | Block. Error: "You cannot change your own role." |
| CSV uploaded with no data rows (header only) | Block import. Error: "This file contains no data rows. Please check your CSV and try again." |
| CSV column headers do not match the Import Template | Show column mapping UI in Review step. Admin must map each CSV column to a known field before proceeding. Unmatched columns may be ignored. |
| Imported row references an entity that does not exist (e.g. Enrollment CSV references unknown Student name) | Auto-create the missing entity with minimum required fields populated from CSV data. Flag the auto-created entity in ImportRowResult.autoCreated. Admin sees this in the Review step before confirming. |
| Imported row matches an existing record (duplicate detected) | Flag row as DUPLICATE in Review step. Admin must choose OVERWRITE or SKIP for each duplicate before import can be confirmed. |
| Import confirmed but one or more rows fail during write | Mark failed rows as SKIPPED. Complete import of all other rows. Set ImportSession.status to COMPLETED_WITH_ERRORS. Show error report with inline editing — admin can correct failed rows and re-submit them individually. |
| Admin attempts CSV import from Activity Hub | Not supported — Activities must be created through the Activity Hub template picker. Import / Export dropdown is not shown on Activity Hub pages. |
| Admin exports with no records matching the selected scope | Generate empty CSV with headers only. Do not block. Show inline notice: "No records matched your export criteria. The file contains headers only." |
| Import / Export dropdown opened on a module where legacy standalone import, export, or template buttons previously existed | Legacy controls must be removed. The Import / Export dropdown is the only entry point for all three CSV actions. No duplicate controls should exist on the same page. |

---

## 16 — Workflow Ownership Table

| Workflow | Trigger | Owner | UI Surface | Output |
|---|---|---|---|---|
| Create Activity | Admin selects template | Super Admin | Activity Hub → Create Activity modal | New Activity + L1/L2 documents created |
| Edit Activity | Admin clicks edit on activity | Super Admin | Activity Hub → Edit Activity panel | Activity document updated |
| Archive Activity | Admin clicks archive in Activity Hub | Super Admin | Activity Hub → Archive confirmation dialog | Activity archived, future events cascade-archived |
| Create L1/L2 Subcategory | Admin adds subcategory within activity | Super Admin | Activity Hub → Activity detail → Subcategory tab | L1 or L2 document created |
| Archive L1/L2 Subcategory | Admin archives subcategory | Super Admin | Activity Hub → Subcategory list → Archive action | Subcategory archived, cascade applied |
| Assign Staff to Activity | Admin adds TeachingAssignment on staff profile | Admin | Staff Profile → Teaching Assignments tab | TeachingAssignment document created |
| Update TeachingAssignment Rate | Admin edits existing assignment | Admin | Staff Profile → Teaching Assignments tab → Edit | TeachingAssignment document updated, future events use new rate |
| Archive TeachingAssignment | Admin archives a teaching assignment | Admin | Staff Profile → Teaching Assignments tab → Archive action | TeachingAssignment.isArchived set to true |
| Restore TeachingAssignment | Admin restores a teaching assignment | Admin | Staff Profile → Teaching Assignments tab → Restore action | TeachingAssignment.isArchived set to false |
| Assign Org Role to Staff | Admin adds OrgRole on staff profile | Admin | Staff Profile → Org Roles tab | OrgRole document created |
| Archive OrgRole | Admin archives an org role | Admin | Staff Profile → Org Roles tab → Archive action | OrgRole.isArchived set to true |
| Restore OrgRole | Admin restores an org role | Admin | Staff Profile → Org Roles tab → Restore action | OrgRole.isArchived set to false |
| Archive StaffMember | Admin archives staff member | Admin | Staff list → Archive action | StaffMember archived, future EventParticipant records removed |
| Enroll Student | Admin completes enrollment flow | Admin | Students → Student Profile → Enrollments tab → Add Enrollment | Enrollment document created |
| Reinstate Enrollment | Admin reinstates an archived enrollment | Admin | Students → Student Profile → Enrollments tab → Reinstate action | Enrollment.status set to ACTIVE |
| Edit Student Profile | Admin edits student details | Admin | Students → Student Profile → Edit | Student document updated |
| Archive Student | Admin archives student | Admin | Students → Archive action | Student archived, Enrollments cascade-archived |
| Create Event | Admin fills Zone 1-2-3 form in calendar | Admin | Calendar → Event creation form | Event + EventParticipant documents created, RateSnapshot copied |
| Mark Event Completed | Admin marks event as done | Admin | Calendar → Event detail → Mark Complete | Event.status → COMPLETED |
| Cancel Event | Admin cancels event | Admin | Calendar → Event detail → Cancel | Event.status → CANCELLED |
| Reinstate Cancelled Event | Admin reinstates event | Admin | Calendar → Event detail → Reinstate | Event.status → SCHEDULED |
| Create Recurring Event | Admin sets recurrence on event creation | Admin | Calendar → Event creation form → Recurrence options | Event group created per existing recurring mechanism |
| Generate Payslip | Admin selects staff + billing period | Admin | Payslips → Generate → Staff picker + date range | Itemized payslip output grouped by activity |
| Add Student to Ensemble Roster | Admin adds student to ensemble | Admin | Activity Hub → Ensemble Activity detail → Roster tab → Add student | EnsembleRosterMember document created |
| Remove Student from Ensemble Roster | Admin removes student from ensemble | Admin | Activity Hub → Ensemble Activity detail → Roster tab → Remove action | EnsembleRosterMember.endDate set to today; isArchived set to true |
| First Admin Setup Gate | First admin logs in with no org setup | System | Hard gate UI — locked state with setup checklist | Gate clears when setupGateCleared = true |
| Setup Checklist Completion | Admin creates first activity + first staff member | System | Onboarding checklist UI | OnboardingState flags updated, setupGateCleared flips true |
| Subsequent Admin Tour | Non-first admin logs in for first time | System | Dismissible walkthrough overlay | onboardingDismissed flips true on dismiss |
| Guide Me (on-demand) | Admin clicks Guide Me link on any form | Admin | Guide Me link below form title | Step-by-step guided walkthrough re-activated; partial form data preserved |
| First-Use Feature Flag Update | Admin completes first successful form submission for a feature | System | Background write on form save | Relevant firstUseFlags[feature] flips true on StaffMember document |
| Download Import Template | Admin clicks Download Template in Import / Export dropdown | Admin | Import / Export dropdown → Download Template (per entity type) | CSV template file downloaded |
| Upload CSV | Admin uploads CSV file | Admin | Import / Export dropdown → Import → Step 1 file picker | ImportSession created (PENDING), CSV parsed, status → REVIEWING |
| Review and Map Import | Admin maps columns, toggles rows, resolves duplicates | Admin | Import / Export dropdown → Import → Step 2 column mapping + row review | ImportRowResult entries updated with admin decisions |
| Confirm Import | Admin confirms the reviewed import | Admin | Import / Export dropdown → Import → Step 3 Confirm button | ImportSession status → IMPORTING → COMPLETED or COMPLETED_WITH_ERRORS |
| Fix Import Errors | Admin edits failed rows inline after import | Admin | Import results panel — inline row editor on SKIPPED rows | Corrected rows re-submitted individually |
| Cancel Import | Admin cancels during Review step | Admin | Import / Export dropdown → Import → Step 2 Cancel button | ImportSession status → CANCELLED |
| Export CSV | Admin opens Import / Export dropdown, selects Export, configures scope selector | Admin | Import / Export dropdown → Export → Export Scope Selector modal → Download | CSV file generated client-side and downloaded; no Firestore write |

---

## 17 — Financial Logic Register

### Standard rate resolution
```
effectiveRate = rateOverride ?? rateSnapshot.rateValue
Policy: Snapshot on event creation — immutable thereafter.
```

### durationMinutes computation
```
durationMinutes = endTime − startTime  (computed in OrgSettings.timezone)
Source fields: Event.startTime, Event.endTime, OrgSettings.timezone
Computation: Server-side only at event save time. DST transitions within an event's duration
             are handled by server-side computation. Client must not compute or store duration
             independently.
Policy: Snapshot on event creation — immutable thereafter. Not recalculated if event times
        are later edited. If event times are edited post-creation, the build AI must surface
        this as an open question before implementing — no policy is defined in v2.0.
```

### Hourly billing
```
eventCost = effectiveRate × (durationMinutes / 60)
Source fields: EventParticipant.rateSnapshot.rateValue, Event.durationMinutes
Policy: Snapshot on event creation — immutable thereafter.
```

### Per-event billing
```
eventCost = effectiveRate
Source fields: EventParticipant.rateSnapshot.rateValue
Policy: Snapshot on event creation — immutable thereafter.
```

### Monthly flat billing
```
eventCost = effectiveRate
(MONTHLY_FLAT rate types always resolve via a single manually created monthly event.
 No proration across multiple events. One event per month per OrgRole = full flat amount.)
Source fields: EventParticipant.rateSnapshot.rateValue
Policy: Snapshot on event creation — immutable thereafter.
```

### Payslip total
```
payslipTotal = SUM of eventCost for all EventParticipant records
               where staffMemberId = X
               and event.date within billingPeriod
               and event.status = COMPLETED
Policy: Recalculate on demand when admin generates payslip. Not stored — derived at generation time.
```

### RevenueItem line total (DEFERRED — post-v2.0)
```
lineTotal = amount × quantity  [formula defined, implementation deferred]
Source fields: RevenueItem.amount, RevenueItem.quantity
Policy: Not implemented in v2.0. Revenue items are recorded but not aggregated or surfaced
        in any financial output in this version. Full revenue reporting is out of scope for v2.0
        (see Section 20). Revisit in a dedicated discovery session before implementing.
```

---

## 18 — Build Phases

### Phase 1 — Firestore Schema & Base Collections
Set up all Firestore collections with correct document structures, security rules, and orgId scoping.

Collections: activities, l1Subcategories, l2Subcategories, staffMembers, teachingAssignments, orgRoles, students, enrollments, events, eventParticipants, onboardingState, orgSettings, ensembleRosterMembers, importSessions

**DoD:** All collections exist. Security rules enforce orgId isolation. Read/write access validated per permission level. Role resolution uses uid → StaffMember.role lookup (not client claims).

---

### Phase 2 — Activity Hub (Super Admin Only)
Build the Activity Hub UI. Super Admin can create, view, edit, and archive activities using the five templates. Admin role has read-only access to Activity Hub — they can view activities and subcategories but cannot create, edit, or archive them.

Includes: Template picker, L1/L2 subcategory management, module configuration (pre-set by template, adjustable), archive with cascade confirmation.

**DoD:** All five templates create correct document structures. L1/L2 creation and archiving works. Archive cascade confirmed via test. First-use guided walkthrough implemented for Activity Hub forms. Guide Me link present below form title. Pre-fill from last used activity works on repeat use. Ensemble Roster tab present in Ensemble activity detail view — admin can add and remove students; EnsembleRosterMember documents created and archived correctly.

---

### Phase 3 — Staff Module
Build staff profile management. Admin can create staff members, assign TeachingAssignments, and assign OrgRoles.

Includes: Staff list, staff profile view, TeachingAssignment tab (activity picker → L2 picker → rate config), OrgRole tab (title + rate config), effective date management.

**DoD:** Staff can hold multiple TeachingAssignments and OrgRoles simultaneously. Overlapping assignment validation works. Archive cascade from staff works. First-use guided walkthrough implemented for staff creation and assignment forms. Guide Me link present below form title.

---

### Phase 4 — Student Module & Enrollment
Build student profile management and the enrollment flow.

Includes: Student list, student profile view, enrollment flow (student → activity → L2 → start date), enrollment archive.

**DoD:** Students can be enrolled in multiple activities. Enrollment correctly scopes student availability in event form. Archiving student cascades to enrollments. First-use guided walkthrough implemented for student creation and enrollment flows. Guide Me link present below form title. Pre-fill from last used activity + L2 combination works on repeat enrollment.

---

### Phase 5 — Calendar & Event Creation
Build the calendar view and the three-zone event creation form.

Includes: Calendar display, Zone 1 (activity picker, date, time), Zone 2 (contextual fields driven by activity modules), Zone 3 (collapsed exceptions — rate override, external participant), auto/prompted event naming, RateSnapshot creation on save.

**⚠ Recurring events:** AMD-20260306-006 is DEFERRED. The existing recurring event mechanism from v1.3 is preserved as-is for now. Before building Phase 5, read the existing recurring event implementation in the codebase and do not modify its core logic. The three-zone form adds activity-aware fields on top of the existing recurrence UI — it does not replace it. **Do not build new recurrence logic until AMD-20260306-006 is resolved.** See Section 22 for the five open questions that must be answered first.

**DoD:** All five activity templates produce correct Zone 2 configurations. RateSnapshot is immutable after creation. Rate override works. External participant records correctly. Student field filters to enrolled students only. Ensemble event creation shows a read-only roster derived from active EnsembleRosterMember records scoped to the event date — no per-event student picker for Ensemble template. Recurring event creation continues to function as before. First-use guided walkthrough implemented for event creation form. Guide Me link present below form title. Pre-fill from last used activity works on repeat event creation. Stale pre-fill detection clears field silently when a pre-filled value references an archived entity.

---

### Phase 6 — Payslip Engine
Build the payslip generation flow.

Includes: Staff member + billing period selector, aggregation of EventParticipant records, financial logic (hourly / per-event / monthly flat), itemized output grouped by activity.

**DoD:** Payslip correctly reflects RateSnapshot values. Rate overrides applied correctly. External payees excluded from staff payslips. Monthly flat rate logic validated. Past events unaffected by rate changes made after event creation. First-use guided walkthrough implemented for payslip generation flow. Guide Me link present below form title. Pre-fill from last used staff member + billing period combination works on repeat generation.

---

### Phase 7 — Archive & Status Management
Build archive flows for all entities with correct cascade behaviour.

Includes: Archive confirmation dialogs with cascade counts, cascade execution, status display in UI.

**DoD:** All cascade rules from Section 10 verified. Archived entities correctly excluded from pickers and lists. Past records preserved.

---

### Phase 8 — Permissions & Auth
Enforce permission model from Section 13 across all UI surfaces and Firestore rules.

**DoD:** Admin cannot create/edit/archive Activity Hub entries. Admin can read Activity Hub. Staff cannot create events or view other staff payslips. Super Admin has full access. Role resolution via uid → StaffMember.role confirmed in all Firestore rules.

---

### Phase 9 — Developer Tools & Test Suite
Build the test suite covering: rate resolution, payslip calculation, archive cascades, enrollment enforcement, event form validation, edge cases from Section 15.

**DoD:** All edge cases in Section 15 covered by tests. Financial logic formulas from Section 17 verified against manual calculations.

---

### Phase 10 — Polish & QA
UI consistency pass, loading states, error states, empty states for all views.

**DoD:** No broken states. All error messages match wording in Section 15. Desktop UI fully polished. (Mobile deferred — see Section 20.)

---

### Phase 11 — Onboarding Flow

Build the onboarding state model and gate logic.

Includes: `onboardingState` Firestore collection, `firstUseFlags` and `onboardingDismissed` fields on StaffMember, hard gate for first admin (blocks calendar/students/enrollment/payslips until `setupGateCleared`), soft dismissible tour for subsequent admins, Super Admin bypass, setup checklist UI with four steps (Create Activity → Add Staff → Add Student → Create First Event), friendly locked-feature states, Guide Me link wired to step-by-step walkthrough on all applicable forms.

**DoD:** Hard gate blocks first admin from calendar, students, enrollment, and payslips until `setupGateCleared = true`. `setupGateCleared` flips true when `activitiesCreated AND staffAdded` are both true. Super Admin bypasses all gates and sees no tour. Subsequent admins (non-first) see dismissible tour on first login only; subsequent logins go straight to app. Setup checklist reflects correct org-level flag state. `onboardingDismissed` flips true when user dismisses tour. All `firstUseFlags` update correctly on first successful form submission per feature. Stale pre-fill clears correctly when archived entities are referenced. Guide Me link present below form title on all forms; partial form data preserved when switching between Fill Mode and guided walkthrough.

---

### Phase 12 — CSV Import / Export

Build the CSV import/export system for all five entity types.

**Codebase consolidation first:** Before writing any new CSV UI, audit the existing codebase for all standalone import buttons, export buttons, and template download links. Search for: button labels containing "import", "export", "template", "download"; any CSV-related onClick handlers; any file download utility functions. Remove all located controls. The Import / Export dropdown is the only permitted entry point for these actions across the entire app — no duplicate controls.

Includes: Import / Export dropdown (labelled "Import / Export") per module on Students list, Staff list, Events calendar, Enrollments tab (on student profile), and Teaching Assignments tab (on staff profile). Three dropdown items per module: Import, Export, Download Template.

**Import flow:** 3-step modal — Step 1 (Upload: file picker), Step 2 (Review: column mapping, row-level toggles, duplicate resolution picker, auto-create dependency preview), Step 3 (Confirm & Results: progress, error report with inline row editing). ImportSession Firestore writes throughout.

**Export flow:** Export Scope Selector modal before download (date range, activity filter, archived status toggle). Client-side CSV generation. No Firestore write.

**Import Template column definitions (minimum required fields):**
- Student: fullName, dateOfBirth (optional), parentName (optional), parentPhone (optional)
- StaffMember: fullName, email, phone (optional), role
- Enrollment: studentFullName, activityName, l2Name, startDate
- Event: activityName, l2Name, date, startTime, endTime, location (optional)
- TeachingAssignment: staffEmail, activityName, l2Name, rateType, rateValue, startDate

**DoD:** Import / Export dropdown present and functional on all five module pages. No standalone import, export, or template buttons exist anywhere in the app after Phase 12 completes. Template download works for all five entity types. Valid CSV imports correctly for all five types. Duplicate detection surfaces in Review step. Dependency auto-creation works (unknown reference → stub record created, flagged in review). Column mapping UI handles mismatched headers. Failed rows skipped, shown in error report, fixable inline. ImportSession documents written correctly. Export Scope Selector appears before every export. Export generates correct CSV for all five entity types. Empty-result export produces headers-only file with inline notice. Admin and Super Admin can use all three actions; Staff role cannot.

---

## 19 — Open Questions

| Question | Why It Matters | Default Assumption |
|---|---|---|
| For Discipline template events, how does the admin specify individual vs. group? Is it a toggle on the event form that switches the student picker between single-select and multi-select mode, or a separate field? | Affects event form UI and validation (individual = max 1 student, group = 2+). | Event form shows a single-select student picker by default. A "Add another student (group lesson)" link below the picker switches it to multi-select mode. Confirm before Phase 4 builds. |
| What is the canonical timezone for the pilot organization? | OrgSettings.timezone must be set at org initialization. Determines all event display and durationMinutes computation. | No default — must be configured by Super Admin during org setup before any events can be created. |
| Should ImportSession records be retained permanently or purged after N days? | Determines storage cost and whether import history is a visible feature. | Retained permanently; visible to Super Admin only. Revisit post-v2.0. |
| If event times are edited after creation, should durationMinutes be recomputed? | durationMinutes is currently defined as a snapshot taken at creation time. If event editing is supported, a policy for recalculation must be defined before Phase 5 implements event editing. | No policy defined in v2.0. Build AI must surface this before implementing event edit functionality. |
| Firestore security rules are partially specified. Phase 1 DoD requires orgId isolation and role-level enforcement, but no explicit rule definitions are provided in the spec. How detailed should the Phase 1 Firestore rule implementation be? | Risk of retrofitting rules in Phase 8 after all features are built on an insecure base. | Phase 1 should implement at minimum: orgId isolation on all reads/writes, and uid → StaffMember.role lookup pattern. Full permission-level enforcement (e.g. Staff cannot write events) should be targeted in Phase 8. If the build AI requires more specificity before Phase 1, flag before proceeding. |
| Phase 8 placement risk: Phases 2–7 build all features before permissions are fully enforced. Is there an accepted risk here, or should permission enforcement be layered into each phase's DoD? | Retrofitting security rules after all features are built increases the risk of gaps. | Current structure is accepted. Phase 1 establishes orgId isolation. Phase 8 enforces role-level permissions. Build AI should not build features that would be structurally incompatible with Phase 8 enforcement — flag any such patterns before implementing. |

---

## 20 — Out of Scope (V2)

- Revenue reporting and finance dashboard
- Student-facing portal
- Parent communication tools
- Invoice generation for external parties
- Multi-org support
- RevenueItem line total aggregation and reporting (formula defined in Section 17 but deferred)
- **Mobile** — Mobile is explicitly deferred. No mobile-specific implementation in v2.0. No architectural blockers have been identified. If any future phase introduces UI patterns that would be destructive to a mobile retrofit, flag it as an open question before implementing.

---

## 21 — UX Principles

These principles apply universally across Cadenza. No form or generation flow is exempt. Implement them in every applicable phase as a non-negotiable layer of the build.

---

### 21.1 — Three-Layer UX Pattern

Every form and generation flow in Cadenza follows this three-layer pattern. Apply to Activity Hub, Staff, Students, Events, Enrollment, Payslips, and all future features.

**Layer 1 — Guided first use (per user, per feature)**

On a user's first interaction with any form or generation flow, show a step-by-step guided walkthrough. Present one question or field at a time. The underlying data model and validation are identical to the standard form — only the presentation differs.

First-use state is tracked per user account, per feature via `firstUseFlags` on StaffMember. If Admin A has used the piano lesson event form before, Admin B still gets the guided flow on their first use of it.

**Layer 2 — Smart pre-fill on repeat use**

After first use, pre-fill forms based on scope:

- **Forms with an activity in scope** (event creation, Activity Hub edits) → pre-fill from the last saved instance of that specific activity.
- **Forms without an activity scope** → pre-fill from last used combination:
  - Payslip generation → remembers last staff member + last billing period together.
  - Enrollment → remembers last activity + last L2 together.
- **Archived entity handling** → if a pre-filled value references an archived entity, clear the field silently and prompt the admin. Never display a stale or broken value.

**Layer 3 — On-demand Guide Me**

A "Guide me" link is always visible on every form, positioned below the form title. It re-activates the step-by-step guided walkthrough at any time, regardless of whether the user has completed first use.

If the admin has partially filled the form and clicks Guide Me, their partial progress is preserved. Switching between Fill Mode and guided walkthrough must never cause data loss.

---

### 21.2 — Onboarding Flow

**Onboarding State Model**

Two data locations:

1. `onboardingState/{orgId}` — org-level flags (see Section 05 for schema).
2. `StaffMember.firstUseFlags` + `StaffMember.onboardingDismissed` + `StaffMember.isFirstAdmin` — per-user flags (see Section 05 for schema).

**Gate Logic**

```
if user.role === SUPER_ADMIN
  → no gate, no tour, full app access regardless of setup state

if user.isFirstAdmin && !org.setupGateCleared
  → hard gate: can only access Activity Hub and Staff module
  → calendar, students, enrollment, payslips are locked with friendly prompt
  → gate clears automatically when org.setupGateCleared = true
  → gate cannot be dismissed or skipped

if !user.isFirstAdmin && !user.onboardingDismissed
  → soft tour on first login: dismissible walkthrough of the app
  → admin can dismiss immediately and go straight to the app
  → tour only triggers once per user (while onboardingDismissed = false)

if user.onboardingDismissed
  → straight to app, no tour
  → Guide Me always available on demand via Layer 3 pattern
```

**Minimum Viable Setup**

`setupGateCleared` flips to `true` when both of the following are true:
- At least one Activity has been created (`activitiesCreated = true`)
- At least one StaffMember has been added (`staffAdded = true`)

Students and events are not required to clear the gate.

**Onboarding UI Behavior**

- First admin sees a setup checklist with four steps: Create Activity → Add Staff → Add Student → Create First Event. Each step reflects its completion state from org-level flags. Checklist is dismissible after gate clears but remains accessible from Settings.
- Subsequent admins see a dismissible tour on first login showing the pre-populated app.
- Super Admin sees neither — or optionally a dev/override banner indicating org setup state.

**Future Animation Hooks (flags only — no implementation in v2.0)**

The onboarding state flags are designed to support future animated experiences without architectural change:
- Progress bar reading from org-level flags.
- Celebratory completion moment when `firstEventCreated` flips true.
- Re-enterable Getting Started guide in Settings.
- Interactive product tour triggered by Guide Me.

---

### 21.3 — Mobile

Mobile is explicitly deferred. No mobile-specific implementation in v2.0. Flag in the build if any UI pattern would be destructive to a future mobile retrofit. See Section 20.

---

## 22 — Amendment Log

| Amendment ID | Date | Area | Summary | Status |
|---|---|---|---|---|
| AMD-20260306-001 | 2026-03-06 | Billing Resolution | Section 08 rewritten: rate lookup now requires l2Id match and startDate ≤ event.date; server-side only; multi-OrgRole picker added | Applied |
| AMD-20260306-002 | 2026-03-06 | Assignment Uniqueness | Uniqueness scoped to (staffMemberId, activityId, l2Id, date range); multi-L2 assignments now allowed | Applied |
| AMD-20260306-003 | 2026-03-06 | Permissions | Phase 2 corrected to Super Admin Only; Admin has read-only Activity Hub access | Applied |
| AMD-20260306-004 | 2026-03-06 | Participant Cardinality | Cardinality rules added to all five templates; multi-staff AUTO naming fixed; Zone 3 gated by template | Applied |
| AMD-20260306-005 | 2026-03-06 | Timezone & Duration | OrgSettings collection added; event times scoped to org timezone; cross-midnight blocked; durationMinutes server-side only | Applied |
| AMD-20260306-006 | 2026-03-06 | Recurring Events | Recurring event semantics undefined — dependency on v1.3 logic is insufficient | **DEFERRED — discovery session required before Phase 5** |
| AMD-20260306-007 | 2026-03-06 | Auth & Permissions | uid and role fields added to StaffMember; Firestore rule resolution pattern defined; role-related edge cases added | Applied |
| AMD-20260306-008 | 2026-03-06 | Ensemble Roster | EnsembleRosterMember entity defined; Roster tab added to Phase 2; event roster query defined; archive cascades updated | Applied |
| AMD-20260306-009 | 2026-03-06 | CSV Import | ImportSession and ImportRowResult schemas added; 3-step import modal defined; Phase 12 added | Applied |
| AMD-20260306-010 | 2026-03-06 | CSV Export & UI | CSV Export and Export Scope Selector added; Import / Export dropdown established as canonical UI pattern; codebase consolidation instruction added to Phase 12 | Applied |

### AMD-20260306-006 — Deferred: Recurring Event Semantics

"Preserve v1.3 recurrence as-is" is not a spec. The following questions must be answered in a dedicated session before Phase 5 is built:

1. What is the full recurrence lifecycle? (series create / single-instance edit / future-instances edit / cancel one / cancel all future / delete series)
2. When a teacher's rate changes mid-series, do already-created future instances keep the old RateSnapshot, or are they regenerated?
3. When an activity is archived, what happens to scheduled recurring instances in the series?
4. Can a recurring series span a TeachingAssignment endDate? What happens at the boundary?
5. Is recurrence a first-class v2 feature rebuilt from spec, or a preserved v1.3 code dependency? If the latter, the v1.3 recurrence behavior must be fully documented here before v2 is built on top of it.

**Do not start Phase 5 without AMD-20260306-006 resolved and applied.**
