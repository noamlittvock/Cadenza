# Cadenza — As-Built Specification
Reverse-Engineered from Codebase · March 15, 2026


## 01  Canonical Summary

Cadenza is a calendar-first conservatory management platform for internal admin use. The calendar is the source of truth — every lesson, rehearsal, recital, and admin event lives there, and all compensation, student history, and hours reporting derive from calendar events. No event means no pay.

The platform manages five core domains: Activities (structured registry of work types with billing rules), Staff (profiles, teaching assignments, org roles, pay rates), Students (profiles, enrollments, roster memberships), Events (calendar instances that carry immutable billing snapshots), and Financial Reporting (payslips, hours comparison, dashboards — all derived from events).

The application is multi-tenant (orgId-scoped), supports English and Hebrew (full RTL), and runs a dual data model — v1.3 collections remain the primary read/write path for calendar operations, while v2.0 collections are synced read-only and used for activity hub, staff billing, student enrollment, and event participant tracking.


## 02  Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19.2.3 + TypeScript 5.8.2 | Single-page app, no file-based routing |
| Build | Vite 6.2.0 | Dev server + production bundling |
| Database | Firebase Firestore | NoSQL document store, orgId-scoped multi-tenant |
| Authentication | Firebase Authentication | uid-based; role resolved via StaffMember.role lookup |
| Server-side logic | Firebase Cloud Functions | Callable: resolveRate, computeDuration, generatePayslip |
| Hosting | Firebase Hosting | |
| Trigger functions | Firestore triggers | syncUserProfile (staffMembers write → userProfiles cache) |
| Charts | Recharts 3.6.0 | Financial dashboards + custom chart builder |
| Icons | Lucide React 0.562.0 | |
| Hebrew calendar | @hebcal/core 6.0.8 | Hebrew date display and conversion |
| Recurrence | rrule 2.8.1 | Recurring event generation |
| CSV | PapaParse 5.5.3 | Import/export parsing |
| Unit tests | Vitest 4.0.18 | 89/89 passing |
| E2E tests | Playwright 1.58.2 | In-memory + Firebase emulator modes |
| Firebase SDK | firebase 12.9.0 | |


## 03  Glossary

| Term | Definition | Do Not Use |
|---|---|---|
| Activity | A standing entity in the Activity Hub defining the rules, structure, and billing configuration for a type of work. Exists independently of the calendar. | Session, Class type, Course |
| Activity Template | Structural pattern applied at activity creation. One of: Discipline, Program, Ensemble, External, Administrative. Determines hierarchy depth, visible modules, and event form behavior. | Activity type, Category type |
| Activity Type | Top-level classification derived from template. One of: Academic, Administrative, Performances, Special Events. | Category, Track |
| L1 Subcategory | First grouping level beneath an activity. Optional depending on template. | Category, Group |
| L2 Subcategory | Second grouping level, always required when L1 exists. Carries the defaultRate reference. | Subcategory (unqualified) |
| TeachingAssignment | Links a staff member to a specific activity at L2 level with negotiated rate and effective dates. | Position, Role assignment |
| OrgRole | Organizational role not tied to any activity. Has its own rate. Examples: CEO, Department Head. | Administrative position |
| RateSnapshot | Rate value copied onto an EventParticipant at event creation. Write-once, immutable after creation. | Historical rate |
| RateOverride | Event-level rate replacing the standard rate for that specific event only. Only settable while event.status = SCHEDULED. | Exception rate |
| EventParticipant | Links a staff member or external payee to a specific event. Carries the RateSnapshot used for billing. | Event attendee |
| Enrollment | Links a student to an activity at L2 level. Required before student can appear on event form for that activity. | Registration, Assignment |
| EnsembleRosterMember | Links a student to an Ensemble activity's roster with effective date range. Distinct from Enrollment. | Roster entry |
| RevenueItem | Revenue line item embedded in Event. Type, amount, quantity, notes. Only present when Revenue module is enabled. | Revenue entry |
| Module | Configurable capability on an activity. One of: Curriculum, Staff Billing, Revenue, External Participants, Org Role Billing. | Feature, Setting |
| Admin Inbox | Notification and task hub for admins. Auto-populated with room conflict alerts, manually created tasks. | Notifications |
| Calendar Subscription | Tokenized iCal feed filtered by teacher/room/activity, shareable externally. | Feed, Export |
| Hours Report | Teacher self-reported hours via tokenized public form. Admin reconciles against calendar events. | Timesheet |
| Payslip | Generated monthly summary of all event-derived compensation for a staff member. Derived on demand, not stored. | Invoice |
| DevSimulation | QA context layer that overrides auth role, onboarding state, and simulated date without affecting real auth. | Test mode |
| SlideOver | Right-side detail panel (45vw) for student/staff profiles. Replaces full-page detail swap pattern. | Sidebar, Drawer |
| ImportSession | Record of a CSV bulk import attempt. Tracks status, per-row results, and errors. | Import job |
| OnboardingState | Org-level setup completion flags driving the setup gate and checklist. | Setup state |
| OrgSettings | Org-level configuration including IANA timezone. Required before event creation. | Org config |


## 04  Architecture Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                    BROWSER (React 19 SPA)                            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ App.tsx — Main shell                                         │    │
│  │   ViewState routing (12 views)                               │    │
│  │   Firestore sync hooks (v1.3 + v2.0 collections)            │    │
│  │   Room conflict detection → AdminInbox auto-population       │    │
│  │   Onboarding gate logic                                      │    │
│  │   Marquee selection state (lifted)                           │    │
│  │   Error boundary (global)                                    │    │
│  └───────────────────────────┬──────────────────────────────────┘    │
│                               │                                      │
│  ┌────────────┐  ┌────────────┴───────────┐  ┌──────────────────┐   │
│  │ Layout.tsx │  │ View Components (46)    │  │ Context (3)      │   │
│  │ (sidebar,  │  │ CalendarView            │  │ AuthContext       │   │
│  │  nav,      │  │ ActivityManager         │  │ DevSimulation     │   │
│  │  header,   │  │ StaffMemberManager      │  │ Translation       │   │
│  │  footer)   │  │ StudentManager          │  │                  │   │
│  │            │  │ EventFormV2             │  └──────────────────┘   │
│  │            │  │ FinancialDashboard      │                         │
│  │            │  │ FinancialAnalysis       │  ┌──────────────────┐   │
│  │            │  │ AdminInbox              │  │ Hooks/Utils (26) │   │
│  │            │  │ PayslipGenerator        │  │ useFirestoreSync │   │
│  │            │  │ GanttManager            │  │ useOnboarding    │   │
│  │            │  │ PowerTools              │  │ useColumnFilters │   │
│  │            │  │ SuperAdmin + DevTools   │  │ useSortState     │   │
│  │            │  │ Settings                │  │ payrollEngine    │   │
│  │            │  │ ManageHub               │  │ financialLogic   │   │
│  │            │  │ DocumentRepository      │  │ roomConflicts    │   │
│  │            │  │ + 30 more               │  │ eventValidation  │   │
│  └────────────┘  └────────────────────────┘  │ saveEventV2      │   │
│                                               │ rateLookup       │   │
│                                               │ devDataGenerator │   │
│  ┌──────────────────────────────────────────  │ csvUtils         │   │
│  │ Shared UI: SlideOver, Modal, DatePicker,  │ formatters       │   │
│  │ TagInput, ColumnFilterDropdown, FilterPills│ activityLookup   │   │
│  │ GuideMeButton, ImportExportDropdown,      │ + 12 more        │   │
│  │ ExportScopeModal, CsvImportModal          └──────────────────┘   │
│  └──────────────────────────────────────────────────────────────────┘│
│                               │ Firestore SDK                        │
└───────────────────────────────┼──────────────────────────────────────┘
                                │
┌───────────────────────────────┼──────────────────────────────────────┐
│                   FIREBASE SERVICES                                   │
│                               │                                       │
│  ┌────────────────────────────┴──────────────────────────────────┐   │
│  │  Firestore (30+ collections)                                   │   │
│  │                                                                │   │
│  │  v1.3 (primary read/write):                                    │   │
│  │    teachers · rooms · events · ganttBlocks · students          │   │
│  │    calendarSubscriptions · hoursReports · adminInboxItems      │   │
│  │    settings · lists · customCharts · access_control            │   │
│  │    organizations · translations · system_configs               │   │
│  │                                                                │   │
│  │  v2.0 (read-only sync in CalendarView + Managers):             │   │
│  │    activities · l1Subcategories · l2Subcategories              │   │
│  │    staffMembers · teachingAssignments · orgRoles               │   │
│  │    students(v2) · enrollments · events(v2) · eventParticipants │   │
│  │    ensembleRosterMembers · importSessions                      │   │
│  │    onboardingState · orgSettings · userProfiles                │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  Cloud Functions (Callable)                                    │   │
│  │    resolveRate     — TeachingAssignment/OrgRole rate lookup     │   │
│  │    computeDuration — server-side durationMinutes                │   │
│  │    generatePayslip — EventParticipant aggregation per period    │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  Triggers                                                      │   │
│  │    syncUserProfile — staffMembers write → userProfiles cache   │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  Firebase Auth · Firebase Hosting · Cloud Storage (document uploads)  │
└───────────────────────────────────────────────────────────────────────┘
```


## 05  Product Definition

### What It Is
A calendar-first conservatory/music school management platform for internal admin use. Manages activities, staff, students, and calendar events — and derives all compensation from calendar events. The calendar is the source of truth for billing, scheduling, and operational reporting.

### What It Is Not
Not a student or parent portal. Not a billing/invoicing system for external parties. Not a mobile app (mobile deferred). Not a multi-org platform (single org per deployment). Not a general-purpose calendar — it is domain-specific to music conservatory operations.

### Core User Flow

```
1. Org Setup (First Admin)
   → Hard gate: must complete setup before accessing calendar
   → Create first Activity (Activity Hub, template-based)
   → Add first Staff Member (profile + teaching assignment)
   → Gate clears when both complete
   → Add Students, create first Event (optional for gate)

2. Activity Configuration (Super Admin only)
   → Pick template (Discipline/Program/Ensemble/External/Administrative)
   → Configure modules (Curriculum, Staff Billing, Revenue, etc.)
   → Create L1/L2 subcategory hierarchy
   → For Ensemble: manage student roster

3. Staff & Student Management (Admin)
   → Create staff profiles, assign teaching assignments with rates
   → Assign org roles (non-teaching positions with rates)
   → Create student profiles, enroll in activities at L2 level
   → SlideOver panels for detail view (no full-page swap)
   → Excel-like column filters on all tables

4. Calendar Operations (Admin)
   → Create events via three-zone form:
     Zone 1: Activity picker, date, time (always visible)
     Zone 2: Contextual fields driven by activity modules
     Zone 3: Exceptions (rate override, external participants)
   → RateSnapshot copied immutably at event creation
   → Mark events COMPLETED for billing inclusion
   → Recurring events via rrule
   → Room conflict auto-detection → Admin Inbox notifications

5. Compensation & Reporting
   → Generate payslips: staff + billing period → itemized output
   → Hours comparison: calendar hours vs. teacher self-reported
   → Financial dashboards and analysis (Recharts)
   → Custom chart builder

6. Admin Inbox
   → Auto-populated room conflict notifications
   → Inline conflict resolution (change room, cancel, reschedule)
   → Manual task creation
   → Auto-resolution when conflicts clear

7. Calendar Subscriptions
   → Generate tokenized iCal feeds
   → Filter by teacher/room/activity
   → Share externally (no auth required for feed consumption)
```


## 06  Navigation Structure

| Section | View | Icon | Access | Description |
|---|---|---|---|---|
| Operations | Smart Calendar | Calendar | All | Calendar with day/week/month views, event CRUD, drag-drop, filters |
| Operations | Payslips | FileText | All | Staff compensation generation (staff role: own only) |
| Operations | Documents | FolderOpen | All | Document repository and template library |
| Admin | Staff Members | Users | Admin+ | Staff profiles, teaching assignments, org roles, SlideOver detail |
| Admin | Students | GraduationCap | Admin+ | Student profiles, enrollments, SlideOver detail, column filters |
| Admin | Manage | Sliders | Admin+ | Tabs: Rooms, Lists, Calendar Subscriptions |
| Admin | Admin Inbox | Inbox | Admin+ | Tasks + notifications with badge count |
| Analytics | Financial | BarChart3 | Admin+ | Tabs: Dashboard, Analysis. Charts, hours comparison |
| Analytics | Settings | Settings | Admin+ | App preferences, org configuration |
| Super Admin | Super Admin | AlertOctagon | Super Admin | Org management, access control, DevTools, data generation |

**Persistent elements:** Collapsible sidebar (desktop: min(25vw, 300px), tablet: 80px icon strip, mobile: 256px overlay). Dark mode toggle. User profile + sign-out in footer. Sandbox/simulation banners when active.

**Special routes:** `/report/:token` — Public teacher hours reporting form (no auth required).


## 07  Data Schema

### v2.0 Collections (Canonical)

#### Activity
```
activities/{activityId}

id:             string
orgId:          string
name:           string
template:       'DISCIPLINE' | 'PROGRAM' | 'ENSEMBLE' | 'EXTERNAL' | 'ADMINISTRATIVE'
activityType:   'ACADEMIC' | 'ADMINISTRATIVE' | 'PERFORMANCES' | 'SPECIAL_EVENTS'
modules:        {
                  curriculum:           boolean
                  staffBilling:         boolean
                  revenue:              boolean
                  externalParticipants: boolean
                  orgRoleBilling:       boolean
                }
location:       string | null
eventNameMode:  'AUTO' | 'PROMPTED'
isArchived:     boolean
createdAt:      Timestamp
updatedAt:      Timestamp
```

#### L1Subcategory
```
l1Subcategories/{l1Id}

id:          string
orgId:       string
activityId:  string       → Activity.id
name:        string
isArchived:  boolean
createdAt:   Timestamp
updatedAt:   Timestamp
```

#### L2Subcategory
```
l2Subcategories/{l2Id}

id:          string
orgId:       string
activityId:  string       → Activity.id
l1Id:        string | null → L1Subcategory.id
name:        string
defaultRate: null          (rate lives on TeachingAssignment)
isArchived:  boolean
createdAt:   Timestamp
updatedAt:   Timestamp
```

#### StaffMember (v2)
```
staffMembers/{staffId}

id:                    string
orgId:                 string
uid:                   string       (Firebase Auth UID, immutable)
role:                  'SUPER_ADMIN' | 'ADMIN' | 'STAFF'
fullName:              string
email:                 string
phone:                 string | null
isArchived:            boolean
isFirstAdmin:          boolean
onboardingDismissed:   boolean
firstUseFlags:         {
                         activityHub:    boolean
                         staffModule:    boolean
                         studentModule:  boolean
                         eventCreation:  boolean
                         enrollment:     boolean
                         payslips:       boolean
                       }
createdAt:             Timestamp
updatedAt:             Timestamp
```

#### TeachingAssignment
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

#### OrgRole
```
orgRoles/{orgRoleId}

id:             string
orgId:          string
staffMemberId:  string       → StaffMember.id
roleTitle:      string
rateType:       'HOURLY' | 'PER_EVENT' | 'MONTHLY_FLAT'
rateValue:      number
startDate:      string
endDate:        string | null
isArchived:     boolean
createdAt:      Timestamp
updatedAt:      Timestamp
```

#### Student (v2)
```
students/{studentId}

id:           string
orgId:        string
fullName:     string
dateOfBirth:  string | null
parentName:   string | null
parentPhone:  string | null
grade:        string | null    (select: א׳-יב׳ + בוגר)
startDate:    string | null    (ISO date, years of study derived)
level:        number | null    (1-7, feeds from Academic Hub later)
tags:         string[]         (free-form chips)
phone2:       string | null    (second phone on student)
email:        string | null
address:      string | null
isArchived:   boolean
createdAt:    Timestamp
updatedAt:    Timestamp
```

**Note:** The v2 Student schema adds 7 fields beyond the original spec (grade, startDate, level, tags, phone2, email, address) — implemented in Phase 16. The original spec only had fullName, dateOfBirth, parentName, parentPhone.

#### Enrollment
```
enrollments/{enrollmentId}

id:          string
orgId:       string
studentId:   string       → Student.id
activityId:  string       → Activity.id
l2Id:        string       → L2Subcategory.id
startDate:   string
endDate:     string | null
status:      'ACTIVE' | 'ARCHIVED'
createdAt:   Timestamp
updatedAt:   Timestamp
```

#### Event (v2)
```
events/{eventId}

id:               string
orgId:            string
name:             string
activityId:       string       → Activity.id
l1Id:             string | null
l2Id:             string | null
location:         string
date:             string       (ISO date, YYYY-MM-DD, org timezone)
startTime:        string       (HH:MM, org timezone)
endTime:          string       (HH:MM, org timezone, cross-midnight not supported)
durationMinutes:  number       (server-side computed, immutable)
isRecurring:      boolean
recurringGroupId: string | null
status:           'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED'
revenueItems:     RevenueItem[] | null
notes:            string | null
createdAt:        Timestamp
updatedAt:        Timestamp
```

#### EventParticipant
```
eventParticipants/{participantId}

id:                    string
orgId:                 string
eventId:               string       → Event.id
participantType:       'STAFF' | 'EXTERNAL'

-- if STAFF --
staffMemberId:         string       → StaffMember.id
assignmentType:        'TEACHING' | 'ORG_ROLE'
teachingAssignmentId:  string | null → TeachingAssignment.id
orgRoleId:             string | null → OrgRole.id
rateSnapshot:          { rateType: string, rateValue: number, snapshotDate: Timestamp }
rateOverride:          number | null

-- if EXTERNAL --
externalName:          string
oneOffFee:             number
notes:                 string | null

createdAt:             Timestamp
```

#### EnsembleRosterMember
```
ensembleRosterMembers/{rosterId}

id:          string
orgId:       string
activityId:  string       → Activity.id (ENSEMBLE template only)
studentId:   string       → Student.id
startDate:   string
endDate:     string | null
isArchived:  boolean
createdAt:   Timestamp
updatedAt:   Timestamp
```

#### RevenueItem (embedded in Event)
```
{
  id:       string
  type:     'TICKET' | 'PARTICIPATION_FEE' | 'ROOM_HIRE' | 'OTHER'
  amount:   number
  quantity: number | null
  notes:    string | null
}
```

#### ImportSession
```
importSessions/{sessionId}

id:            string
orgId:         string
createdBy:     string           → StaffMember.id
entityType:    'STUDENT' | 'STAFF_MEMBER' | 'ENROLLMENT' | 'EVENT' | 'TEACHING_ASSIGNMENT'
status:        'PENDING' | 'REVIEWING' | 'IMPORTING' | 'COMPLETED' |
               'COMPLETED_WITH_ERRORS' | 'CANCELLED'
fileName:      string
totalRows:     number
importedRows:  number
skippedRows:   number
rowResults:    ImportRowResult[]
createdAt:     Timestamp
updatedAt:     Timestamp
```

#### ImportRowResult (embedded in ImportSession)
```
{
  rowIndex:        number
  status:          'PENDING' | 'VALID' | 'DUPLICATE' | 'ERROR' | 'IMPORTED' | 'SKIPPED'
  rawData:         object
  resolvedData:    object | null
  errorMessage:    string | null
  duplicateOf:     string | null
  duplicateAction: 'OVERWRITE' | 'SKIP' | null
  autoCreated:     string[] | null
}
```

#### OnboardingState
```
onboardingState/{orgId}

orgId:              string
activitiesCreated:  boolean
staffAdded:         boolean
studentsAdded:      boolean
firstEventCreated:  boolean
setupGateCleared:   boolean    (flips true when activitiesCreated AND staffAdded)
```

#### OrgSettings
```
orgSettings/{orgId}

orgId:      string
timezone:   string       (IANA identifier, e.g. "Asia/Jerusalem")
createdAt:  Timestamp
updatedAt:  Timestamp
```

#### UserProfile (security rules cache)
```
userProfiles/{profileId}

uid:           string
orgId:         string
staffMemberId: string
role:          string
```

### v1.3 Collections (Still Primary for Calendar Operations)

#### Teacher (v1.3)
```
teachers/{teacherId}

id, orgId, fullName, email, phone, color
positions[], positionAssignments[], positionTitles[]
tags[], teachingAssignments[]
credentials, notes, documents
isArchived, createdAt, updatedAt
```

#### CalendarEvent (v1.3)
```
events/{eventId}

id, orgId, name, description
teacherId, roomId, subtypeId
start, end (Timestamps)
isCanceled, isHidden
recurrenceRule, recurrenceRuleId
googleEventId
tags[]
createdAt, updatedAt
```

#### Room
```
rooms/{roomId}

id, name, itinerary, isArchived
```

#### GanttBlock
```
ganttBlocks/{blockId}

id, title, startDate, endDate
color, isBlackout, canceledEventIds[]
createdAt
```

#### AdminInboxItem
```
adminInboxItems/{itemId}

id, orgId
type:              'TASK' | 'NOTIFICATION'
status:            'OPEN' | 'DONE'
title, message
relatedEntityType: 'ROOM_CONFLICT' | ...
relatedEntityIds:  string[]
createdAt, markedDoneAt
```

#### HoursReport
```
hoursReports/{reportId}

id, orgId, staffMemberId, token
periodStart, periodEnd
status:        'PENDING' | 'SUBMITTED' | 'REVIEWED'
submittedAt, reviewedAt
reportedEntries[]
createdBy
```

#### CalendarSubscription
```
calendarSubscriptions/{subscriptionId}

id, orgId, name, token
filters:   { staffMemberIds[], tags[], positionTitles[], roomIds[], activityIds[] }
createdBy, createdAt, isActive
```

#### AppSettings
```
system_configs/{orgId}_settings

language:              'en-US' | 'he-IL'
dateFormat, timeFormat, timeZone
defaultEventDuration, weekNumberDisplay
currency:              '₪' | '$' | '€'
developerMode:         boolean
schoolYearStartDate
googleCalendarConnectedBy
```

#### ListsState
```
system_configs/{orgId}_lists

positions[], tags[], employmentTypes[], absenceReasons[]
```

### Firestore Security Rules Structure

```
/organizations/{orgSlug}           — read: public, write: SUPERADMIN
/translations/{key}                — read: public, write: SUPERADMIN
/access_control/{recordId}         — email-based org access control
/teachers/{id}                     — orgId-scoped, role-gated
/events/{id}                       — orgId-scoped, ADMIN+ write
/rooms/{id}                        — orgId-scoped
/ganttBlocks/{id}                  — orgId-scoped
/settings/{id}, /lists/{id}        — SUPERADMIN only
/adminInboxItems/{id}              — auth + orgId
/hoursReports/{id}                 — auth + orgId
/system_configs/{configId}         — SUPERADMIN only
/userProfiles/{profileId}          — SUPERADMIN or own profile
/staffMembers/{id}                 — auth + orgId
/activities/{id}                   — auth + orgId
/students/{id}                     — auth + orgId
/l1,l2Subcategories/{id}          — auth + orgId
/teachingAssignments/{id}          — auth + orgId
/orgRoles/{id}                     — auth + orgId
/enrollments/{id}                  — auth + orgId
/eventParticipants/{id}            — auth + orgId
/ensembleRosterMembers/{id}        — auth + orgId
/importSessions/{id}               — auth + orgId
/onboardingState/{orgId}           — auth + orgId
/orgSettings/{orgId}               — auth + orgId
/calendarSubscriptions/{id}        — auth + orgId
```


## 08  Cloud Functions

### resolveRate (Callable)
```
Input:  { orgId, eventDate, staffMemberId, assignmentType, activityId?, l2Id?, orgRoleId? }
Output: { rateType, rateValue, snapshotDate, teachingAssignmentId?, orgRoleId? }

TEACHING: Find exactly one TeachingAssignment matching staff + activity + l2Id
          where startDate ≤ eventDate and (endDate is null OR ≥ eventDate)
          0 matches → error, 2+ matches → error, 1 match → RateSnapshot

ORG_ROLE: Find all active OrgRoles for staff on date
          0 matches → error, 1 match → RateSnapshot,
          2+ matches → return list for client picker
```

### computeDuration (Callable)
```
Input:  { startTime, endTime, date, orgId }
Output: { durationMinutes }

Server-side only. DST-aware. Client must never compute independently.
```

### generatePayslip (Callable)
```
Input:  { orgId, staffMemberId, periodStart, periodEnd }
Output: { staffMemberId, staffName, periodStart, periodEnd, items[], grandTotal }

Queries EventParticipants where staffMemberId = X, event.status = COMPLETED,
event.date within billing period.

Per rateType:
  HOURLY:       effectiveRate × (durationMinutes / 60)
  PER_EVENT:    effectiveRate
  MONTHLY_FLAT: effectiveRate

effectiveRate = rateOverride ?? rateSnapshot.rateValue
Items sorted by date then name.
```

### syncUserProfile (Trigger)
```
Trigger: staffMembers/{id} onWrite
Action:  Syncs uid, orgId, staffMemberId, role to userProfiles collection
Purpose: Keeps role lookup cache in sync for Firestore security rules
```


## 09  Entity Relationship Map

```
Activity (1) ──────────────── (many) L1Subcategory
Activity (1) ──────────────── (many) L2Subcategory
L1Subcategory (1) ─────────── (many) L2Subcategory

Activity (1) ──────────────── (many) Event
L2Subcategory (1) ─────────── (many) Event

StaffMember (1) ───────────── (many) TeachingAssignment
TeachingAssignment (many) ──── (1) L2Subcategory
TeachingAssignment (many) ──── (1) Activity

StaffMember (1) ───────────── (many) OrgRole

Event (1) ─────────────────── (many) EventParticipant
EventParticipant (many) ────── (1) StaffMember [if STAFF]
EventParticipant (many) ────── (1) TeachingAssignment [if TEACHING]
EventParticipant (many) ────── (1) OrgRole [if ORG_ROLE]
Event (1) ─────────────────── (many) RevenueItem [embedded, Revenue module only]

Student (1) ───────────────── (many) Enrollment
Enrollment (many) ─────────── (1) Activity
Enrollment (many) ─────────── (1) L2Subcategory

Activity (1) ──────────────── (many) EnsembleRosterMember [ENSEMBLE only]
Student (1) ───────────────── (many) EnsembleRosterMember

StaffMember (1) ───────────── (many) ImportSession [createdBy]
ImportSession (1) ─────────── (many) ImportRowResult [embedded]

OnboardingState (1) ────────── (1) Org [scoped by orgId]
OrgSettings (1) ───────────── (1) Org [scoped by orgId]

CalendarEvent (v1.3) ↔ Teacher (v1.3) [teacherId FK]
CalendarEvent (v1.3) ↔ Room [roomId FK]
AdminInboxItem ↔ CalendarEvent [relatedEntityIds]
HoursReport ↔ StaffMember [staffMemberId FK]
CalendarSubscription ↔ Org [orgId, filter-based joins]
```


## 10  Activity Templates

| Template | Hierarchy | Default Modules | Event Name | Students | Staff | External |
|---|---|---|---|---|---|---|
| DISCIPLINE | L1 required → L2 required | Curriculum, Staff Billing | AUTO | Single or group (toggle) | 1+ required | Not permitted |
| PROGRAM | L1 required → L2 required | Curriculum, Staff Billing | AUTO | 1+ (scoped to enrolled at L2) | 1+ required | Not permitted |
| ENSEMBLE | L1 optional → L2 required | Curriculum, Staff Billing | PROMPTED | Roster-derived (read-only) | 1+ required | When module enabled |
| EXTERNAL | L1 optional → L2 required | Revenue, External Participants | PROMPTED | Hidden | 0+ optional | 0+ |
| ADMINISTRATIVE | None | Org Role Billing | PROMPTED | Hidden | 1+ (OrgRole-billed) | Not permitted |


## 11  Permissions

| Action | Super Admin | Admin | Staff |
|---|---|---|---|
| Create/edit Activity Hub | Yes | Read-only | No |
| Create/edit Staff Members | Yes | Yes | No |
| Assign TeachingAssignment/OrgRole | Yes | Yes | No |
| Create/edit Students/Enrollments | Yes | Yes | No |
| Create/edit Events | Yes | Yes | No |
| View Payslips | Yes | Yes | Own only |
| Archive any entity | Yes | Yes | No |
| Change StaffMember.role | Yes | No | No |
| CSV Import/Export | Yes | Yes | No |
| Super Admin panel/DevTools | Yes | No | No |
| Admin Inbox | Yes | Yes | No |
| Financial dashboards | Yes | Yes | No |

**Role resolution:** Firebase Auth UID → StaffMember.uid lookup → StaffMember.role. No client claims authoritative. SUPERADMIN hardcoded for `noam.littvock@gmail.com`.


## 12  State Machines

### Event.status
```
SCHEDULED → COMPLETED   (admin manually marks complete)
SCHEDULED → CANCELLED   (admin cancels)
SCHEDULED → ARCHIVED    (cascade from activity/subcategory archive — terminal)
CANCELLED → SCHEDULED   (admin reinstates)
COMPLETED → [terminal]
ARCHIVED  → [terminal]
```

### Enrollment.status
```
ACTIVE → ARCHIVED    (manual or cascade)
ARCHIVED → ACTIVE    (manual reinstatement)
```

### ImportSession.status
```
PENDING → REVIEWING → IMPORTING → COMPLETED
REVIEWING → CANCELLED [terminal]
IMPORTING → COMPLETED_WITH_ERRORS [terminal]
```

### AdminInboxItem.status
```
OPEN → DONE   (manual mark or auto-resolution when conflict clears)
```

### HoursReport.status
```
PENDING → SUBMITTED   (teacher submits via token form)
SUBMITTED → REVIEWED   (admin reviews)
```

### isArchived (universal soft-delete)
```
false → true   (archive)
true → false   (restore, admin action only)
```


## 13  Financial Logic Register

```
effectiveRate     = rateOverride ?? rateSnapshot.rateValue
durationMinutes   = endTime − startTime (server-side, DST-aware, immutable)

HOURLY:        eventCost = effectiveRate × (durationMinutes / 60)
PER_EVENT:     eventCost = effectiveRate
MONTHLY_FLAT:  eventCost = effectiveRate (one event per month per OrgRole)

payslipTotal   = SUM(eventCost) for all EventParticipants
                 where staffMemberId = X
                 and event.date within billingPeriod
                 and event.status = COMPLETED

RevenueItem lineTotal = amount × quantity [formula defined, implementation deferred]
```


## 14  Component Inventory

### Core Views (12 ViewStates)

| Component | Size | Purpose |
|---|---|---|
| CalendarView.tsx | 115KB | Main calendar with day/week/month views, drag-drop, filters, event CRUD |
| EventFormV2.tsx | 62KB | Three-zone event creation/editing with full billing workflow |
| ActivityManager.tsx | 64KB | Activity Hub CRUD with 5 templates, modules, L1/L2 hierarchy |
| StaffMemberManager.tsx | 68KB | Staff profiles, assignments, org roles, SlideOver detail, filters |
| StudentManager.tsx | 64KB | Student profiles, enrollments, SlideOver detail, column filters |
| FinancialDashboard.tsx | — | Revenue/billing overview with Recharts |
| FinancialAnalysis.tsx | 72KB | Detailed financial reporting and comparisons |
| AdminInbox.tsx | 42KB | Task/notification hub with inline conflict resolution |
| PayslipGenerator.tsx | — | Staff compensation document generation |
| GanttManager.tsx | — | Gantt timeline visualization with blackout periods |
| SuperAdmin.tsx | 46KB | Multi-tenant management, access control, QA scenarios |
| DevTools.tsx | 49KB | Date/role simulation, stress test generator, first-use flag overrides |

### Shared UI Components

| Component | Purpose |
|---|---|
| Layout.tsx | Sidebar navigation, responsive (desktop/tablet/mobile) |
| Modal.tsx | Reusable modal wrapper with standard controls |
| SlideOver.tsx | Right-side detail panel (45vw, full on mobile) |
| DatePicker.tsx | Calendar date selection |
| TagInput.tsx | Free-form chip/tag input |
| ColumnFilterDropdown.tsx | Searchable multi-select column filter |
| FilterPills.tsx | Active filter display with remove/clear |
| GuideMeButton.tsx | Contextual help/walkthrough trigger |
| ImportExportDropdown.tsx | CSV import/export/template dropdown |
| ExportScopeModal.tsx | Export date range and filter configuration |
| CsvImportModal.tsx | 3-step CSV import wizard |
| InlineSubcategoryCreator.tsx | Create subcategories inline during event/assignment creation |
| ConflictResolutionPanel.tsx | Inline room conflict editor with reschedule modal |
| OnboardingChecklist.tsx | Step-by-step first admin setup |
| DevSimulationBanner.tsx | Violet banner showing active simulation state |
| ScenarioBanner.tsx | QA scenario progress tracker |

### Data Management

| Component | Purpose |
|---|---|
| ChartBuilderModal.tsx (74KB) | Custom financial chart designer |
| ChartRenderer.tsx | Individual chart rendering |
| MergedChartRenderer.tsx (33KB) | Multi-series composite chart rendering |
| HoursComparisonView.tsx | Calendar hours vs. reported hours reconciliation |
| PowerTools.tsx | Bulk event operations via filter or marquee selection |
| DocumentRepository.tsx | Document storage and template library |
| RoomManager.tsx | Room CRUD |
| ManageHub.tsx | Tabbed container for Rooms, Lists, Subscriptions |
| ManageLists.tsx | Shared list management (positions, tags, types) |
| CalendarSubscriptionManager.tsx | iCal feed CRUD |
| TranslationManager.tsx | Multi-language management with Google Cloud Translation |
| TeacherHoursForm.tsx | Public token-based hours reporting form |
| Settings.tsx | App settings and org configuration |


## 15  Context Providers

### AuthContext
- Firebase Auth → access_control lookup → org assignment
- Roles: SUPERADMIN | ADMIN | VIEWER
- SUPERADMIN hardcoded: `noam.littvock@gmail.com`
- E2E bypass: `VITE_E2E_AUTH_BYPASS=true`
- Exports: `useAuth()`, `AuthProvider`, `UserRole`, `User`

### DevSimulationContext
- Date/role simulation for QA testing
- Overrides: `useEffectiveAuth()`, `useEffectiveOnboarding()`
- 5 role presets (SuperAdmin, Admin, Viewer, Pre-Gate, Post-Gate)
- State persisted to sessionStorage
- Real SUPERADMIN preserved in Layout.tsx via raw `useAuth()`

### TranslationContext
- Multi-language support (Hebrew, English)
- RTL-aware with lang/dir sync to DOM
- Firestore `translations/{key}` collection
- `t(key)` function for string lookup


## 16  Utility & Hook Inventory

| File | Lines | Purpose |
|---|---|---|
| devDataGenerator.ts | 780 | Stress test data: 25 teachers, 7 activities, ~300 events, 12 students |
| testTemplates.ts | 388 | Test data builders and factories |
| financialAggregator.ts | 368 | Aggregation logic for financial reports |
| financialLogic.ts | 194 | Financial calculation engine |
| useFirestoreSync.ts | 233 | Hook for real-time Firestore collection/document subscriptions |
| useOnboarding.ts | 218 | Onboarding workflow state tracking |
| googleCalendarSync.ts | 198 | Google Calendar bi-directional sync |
| eventValidation.ts | 187 | Event schema and business rule validation |
| payrollEngine.ts | 171 | Payroll calculation (Section 17 formulas) |
| useColumnFilters.ts | 141 | Column visibility and filtering state |
| csvUtils.ts | 128 | CSV parsing and formatting |
| saveEventV2.ts | 113 | Event save workflow (v2 path, used by conflict resolution) |
| rateLookup.ts | 90 | Rate resolution helpers |
| roomConflicts.ts | 72 | Room/time conflict detection |
| useSortState.ts | — | Sort state management |
| useListStyle.ts | — | List view mode (grid/list/table) |
| activityLookup.ts | — | Activity lookup cache |
| schemaRegistry.ts | — | Dynamic schema registration |
| formatters.ts | 44 | Date/number formatting |
| firebase.ts | — | Firebase app initialization + emulator support |


## 17  Internationalization

| Aspect | Detail |
|---|---|
| Languages | English (en-US), Hebrew (he-IL) |
| Architecture | TRANSLATIONS object in constants.ts + Firestore `translations` collection |
| RTL | Full support — logical CSS properties, direction-aware transforms |
| Hebrew calendar | @hebcal/core for Hebrew date display |
| Translation management | TranslationManager in SuperAdmin (Google Cloud Translation API) |
| Live switching | Context-based, syncs lang/dir to DOM |
| Grade localization | Student grades localized: א׳-יב׳ + בוגר (Hebrew), 1-12 + Graduate (English) |


## 18  Test Suite

### Unit Tests (Vitest) — 89/89 passing

| File | Coverage |
|---|---|
| financialLogic.test.ts | Financial calculation engine |
| payrollEngine.test.ts | Payroll formulas |
| roomConflicts.test.ts | Room/time conflict detection |
| eventValidation.test.ts | Event validation rules |

### E2E Tests (Playwright) — 18 test files

**In-memory mode:**
navigation, superadmin, devtools-date-sim, devtools-role-sim, admin-inbox, cross-cutting, settings, financial, devtools-regen

**Firebase emulator mode:**
calendar, manage-hub, financial, gantt, onboarding, devtools-templates, document-repository, firestore-sync, popup-ux


## 19  Onboarding Flow

### Gate Logic
```
SUPER_ADMIN → no gate, no tour, full access
First Admin + !setupGateCleared → hard gate: only Activity Hub + Staff module
  Gate clears when activitiesCreated AND staffAdded
Non-first Admin + !onboardingDismissed → soft dismissible tour
onboardingDismissed → straight to app
Guide Me → always available on demand
```

### Three-Layer UX Pattern
1. **Guided first use** — step-by-step walkthrough on first interaction (per user, per feature via firstUseFlags)
2. **Smart pre-fill** — forms pre-fill from last saved instance (localStorage)
3. **On-demand Guide Me** — re-activate walkthrough at any time


## 20  Archive Cascade Rules

| Action | Cascade |
|---|---|
| Archive Activity | Future Events → status: ARCHIVED. Past events untouched. |
| Archive Activity (ENSEMBLE) | EnsembleRosterMembers → isArchived: true |
| Archive L1Subcategory | Future Events with l1Id → status: ARCHIVED |
| Archive L2Subcategory | Future Events with l2Id → ARCHIVED. Enrollments with l2Id → ARCHIVED. |
| Archive StaffMember | Future EventParticipants removed from scheduled events. Past untouched. |
| Archive Student | Enrollments → ARCHIVED. Removed from future event rosters. EnsembleRosterMembers → isArchived. |


## 21  Edge Cases (Implemented)

| Scenario | Handling |
|---|---|
| Student not enrolled in activity | Block event creation with error message |
| Archive activity with future events | Confirmation dialog with cascade count |
| Overlapping TeachingAssignment date ranges | Block creation (same staff + activity + l2Id) |
| Rate override set to zero | Allowed (volunteer event) |
| Event with no staff (External/Admin only) | Allowed for External/Admin templates; blocked for Discipline/Program |
| staffBilling + orgRoleBilling on same activity | Block activity save (configuration conflict) |
| Event date outside assignment date range | Block save with descriptive error |
| Multiple active OrgRoles on event date | Show picker, require explicit selection |
| endTime ≤ startTime | Block save (cross-midnight not supported) |
| OrgSettings timezone not set | Block event creation |
| Room conflict detected | Auto-generate AdminInbox notification |
| Room conflict resolved (event moved/cancelled/room changed) | Auto-mark notification as DONE |
| CSV with no data rows | Block import |
| Duplicate row in CSV import | Flag as DUPLICATE, admin chooses OVERWRITE or SKIP |
| Import row references unknown entity | Auto-create stub, flag in review |


## 22  Features Beyond Original Spec

The following features were built during v2.0 development but were not in the original v2.0 Final spec:

| Feature | Phase | Description |
|---|---|---|
| Admin Inbox | 8 | Task/notification hub with auto-populated room conflict alerts, inline resolution, auto-resolution when conflicts clear |
| Calendar Subscriptions | 6 | Tokenized iCal feeds filtered by teacher/room/activity for external sharing |
| Teacher Hours Reporting | 7 | Token-based public form for teacher self-report + admin hours comparison reconciliation |
| Gantt Manager | — | Gantt timeline visualization with blackout periods |
| Power Tools | — | Bulk event operations via filter or marquee selection |
| Financial Dashboard & Analysis | — | Recharts-based charts, comparisons, revenue insights, custom chart builder |
| Document Repository | — | Document storage and template library |
| Room Manager | — | Room CRUD with conflict detection |
| Translation Manager | — | Google Cloud Translation API integration for i18n management |
| Google Calendar Sync | — | Bi-directional sync (import/export events to Google Calendar) |
| Dark Mode | — | Full dark theme with localStorage persistence |
| Inline Conflict Resolution | 15 | ConflictResolutionPanel for reschedule/reassign without leaving inbox |
| QA Scenario System | 14 | Scenario-based testing with progress banners |
| Stress Test Generator | 14 | devDataGenerator: 25 teachers, 7 activities, ~300 events, 12 students |
| Student Phase 16 Fields | 16 | grade, startDate, level, tags, phone2, email, address |
| SlideOver Pattern | 16 | Right-side detail panel replacing full-page detail swap |
| Excel-like Column Filters | 16 | ColumnFilterDropdown + FilterPills reusable system |
| Sortable Table Views | 15.5 | Multi-column sort on student and staff tables |
| Marquee Selection | — | Cross-calendar bulk selection for PowerTools |


## 23  Dual Data Model (v1.3 ↔ v2.0)

Cadenza runs a dual data model where v1.3 collections remain the primary read/write path for calendar operations while v2.0 collections are synced read-only and used for the newer domain features:

| Domain | Primary Write Path | Read Path |
|---|---|---|
| Calendar events | v1.3 `events` (CalendarEvent) | v1.3 + v2.0 read-only sync |
| Staff profiles | v1.3 `teachers` (Teacher) | v1.3 + v2.0 read-only |
| Student profiles | v1.3 `students` (Student) | v1.3 + v2.0 read-only |
| Rooms | v1.3 `rooms` | v1.3 only |
| Activities | v2.0 `activities` | v2.0 |
| Teaching assignments | v2.0 `teachingAssignments` | v2.0 |
| Org roles | v2.0 `orgRoles` | v2.0 |
| Enrollments | v2.0 `enrollments` | v2.0 |
| Event participants | v2.0 `eventParticipants` | v2.0 |
| Ensemble rosters | v2.0 `ensembleRosterMembers` | v2.0 |
| Admin inbox | v1.3 `adminInboxItems` | v1.3 |
| Hours reports | v1.3 `hoursReports` | v1.3 |
| Calendar subscriptions | v1.3 `calendarSubscriptions` | v1.3 |
| App settings | v1.3 `system_configs` | v1.3 |

This coexistence is a transitional architecture — v2.0 collections are designed to eventually replace v1.3 for all operations once full migration is complete.


## 24  Build Phase History

| Phase | Description | Status |
|---|---|---|
| 1-5 | Manager components, calendar integration, multi-tenant, RTL | Complete |
| 6 | Calendar Subscriptions — iCal feed generation | Complete |
| 7 | Teacher Hours Reporting — tokenized forms and admin reconciliation | Complete |
| 8 | Admin Inbox — shared notifications and task list | Complete |
| 9 | CalendarEvent cleanup migration — activityId-first reads | Complete |
| 10 | RTL & Translation QA — final release pass | Complete |
| 11 | QA Run 3 — wipe data, dummy data, view modes, translation tree | Complete |
| 12 | QA Run 4 — critical fixes and calendar enhancements | Complete |
| 13 | QA Run 6 — Document Repository, Google Import, critical fixes | Complete |
| 14 | v2.0 Dev Tools, test templates, QA scenarios, data wipe fix | Complete |
| 15 | Popup UX Overhaul — fixed footers, modal positioning, AdminInbox navigation | Complete |
| 15.5 | Sortable table views (student + staff) | Complete |
| 16 | Student & Staff Manager Overhaul — 7 new fields, SlideOver, column filters | Complete (uncommitted) |
| — | Admin Inbox conflict resolution — inline panel, auto-resolution, reschedule modal | Complete (uncommitted) |

**Tests:** 89/89 passing (Vitest). 18 E2E test files (Playwright).

**Branch:** `cadenza-v2`


## 25  Exclusion List (Not Implemented)

- Revenue reporting and finance dashboard aggregation from RevenueItems
- Student-facing portal
- Parent communication tools
- Invoice generation for external parties
- Multi-org support (single org per deployment)
- RevenueItem line total aggregation (formula defined, implementation deferred)
- Mobile-specific implementation (no architectural blockers identified)
- Full v1.3 → v2.0 migration (dual model still active)
- Recurring event v2.0 semantics (AMD-20260306-006 still deferred — 5 open questions unresolved)
- Academic Hub (add-on spec exists, not yet built)
- Offline sync / PWA capabilities
- Batch operations beyond marquee selection


## 26  Deferred Items & Open Questions

| Item | Context | Status |
|---|---|---|
| AMD-20260306-006 — Recurring Event Semantics | 5 open questions about series lifecycle, rate changes mid-series, archive behavior, assignment boundary crossing, v1.3 dependency | DEFERRED — discovery session required |
| Academic Hub | Assessment sessions, report cards, AI-assisted examiner workflows. Spec exists at `Academic_Hub_AddOn_Spec_v1_0.md` | Not started |
| durationMinutes on event edit | If event times are edited post-creation, should durationMinutes be recomputed? No policy defined. | Open question |
| ImportSession retention | Permanent vs. purge after N days? | Retained permanently; revisit post-v2.0 |
| Full v2.0 migration | v1.3 collections still primary for calendar/staff/student writes | Transitional — v2.0 designed to replace |
| Revenue reporting | RevenueItems recorded but not aggregated or surfaced in financial output | Post-v2.0 |
| Mobile | No architectural blockers identified, explicitly deferred | Post-v2.0 |
