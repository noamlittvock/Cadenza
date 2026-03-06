# Activity Hierarchy Extraction

> Read-only codebase extraction for planning the Activity → ActivityType → Subcategory → Position hierarchy inversion.
> Generated: 2026-03-05. No proposals included.

---

## TYPE DEFINITIONS

### `Activity` — [types.ts:77-86](../types.ts#L77)
```typescript
interface Activity {
  id: string;
  orgId: string;
  name: string;
  type: ActivityType;           // 'INSTRUCTIONAL' | 'OPERATIONAL'
  subcategories: Subcategory[]; // nested array — no separate collection
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### `ActivityType` — [types.ts:69](../types.ts#L69)
```typescript
type ActivityType = 'INSTRUCTIONAL' | 'OPERATIONAL';
```
A literal union only. Not a Firestore collection. Inherited directly on `Activity.type` and mirrored as `CalendarEvent.eventIntent`.

### `Subcategory` — [types.ts:71-75](../types.ts#L71)
```typescript
interface Subcategory {
  id: string;   // pattern: "SC_{activityId}_{index}"
  name: string;
  isArchived: boolean;
}
```
No independent existence. Always embedded in `Activity.subcategories[]`.

### `PositionAssignment` (the "Position" entity) — [types.ts:141-153](../types.ts#L141)
```typescript
interface PositionAssignment {
  id: string;           // e.g., "T1_PA0"
  positionName: string; // e.g., "Piano Instructor"
  category: string;     // e.g., "Individual Lesson" — free string, NOT a ref
  rateType: RateType;   // 'HOURLY' | 'GLOBAL_MONTHLY' | 'ONE_OFF' | 'PER_EVENT'
  rateValue: number;
  cost?: number;
  vat?: { type: 'PERCENTAGE' | 'FLAT'; value: number };
  overheadFeeType?: 'PERCENTAGE' | 'FLAT';
  overheadFeeValue?: number;
  socialBenefitsType?: 'PERCENTAGE' | 'FLAT';
  socialBenefitsValue?: number;
}
```
Always embedded in `Teacher.positionAssignments[]`. No Firestore collection. Contains billing/rate config, not curriculum.

### `PositionTitleAssignment` — [types.ts:90-96](../types.ts#L90)
```typescript
interface PositionTitleAssignment {
  id: string;
  positionTitle: string;   // e.g., "Senior Instructor", "Head of Department"
  startDate?: string;
  endDate?: string;
  isArchived: boolean;
}
```
Separate from PositionAssignment. Tracks historical title changes. Also embedded in Teacher.

### `TeachingAssignment` — [types.ts:104-113](../types.ts#L104)
```typescript
interface TeachingAssignment {
  id: string;
  activityId: string;      // → Activity.id
  subcategoryId: string;   // → Subcategory.id (within that Activity)
  startDate?: string;
  endDate?: string;
  isEnsemble: boolean;
  roster?: RosterEntry[];
  isArchived: boolean;
}
```
Embedded in `Teacher.teachingAssignments[]`. The join record between a teacher and an Activity+Subcategory pair.

### `StudentAssignment` — [types.ts:294-304](../types.ts#L294)
```typescript
interface StudentAssignment {
  id: string;
  activityId: string;            // → Activity.id
  subcategoryId: string;         // → Subcategory.id
  staffMemberId: string;         // → Teacher.id
  teachingAssignmentId: string;  // → Teacher.teachingAssignments[].id
  startDate: string;
  endDate?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  endReason?: string;
}
```
Embedded in `Student.assignments[]`. Four foreign keys.

---

## FIRESTORE STRUCTURE

### Top-Level Collections

**`activities/{activityId}`**
```
id, orgId, name, type, isArchived, createdAt, updatedAt
subcategories: [{ id, name, isArchived }, ...]   ← embedded array
```

**`teachers/{teacherId}`**
```
id, orgId, fullName, ...
positionAssignments: [{ id, positionName, category, rateType, rateValue, ... }]
teachingAssignments: [{ id, activityId, subcategoryId, isEnsemble, roster[], ... }]
positionTitles:      [{ id, positionTitle, startDate, endDate, isArchived }]
positions:           string[]   ← legacy/backup list of position name strings
```

**`students/{studentId}`**
```
id, orgId, fullName, ...
assignments: [{ id, activityId, subcategoryId, staffMemberId, teachingAssignmentId, ... }]
```

**`events/{eventId}`** — dual-field migration in progress
```
activityId?:     string   ← new field
subcategoryId?:  string   ← new field
eventIntent?:    'INSTRUCTIONAL' | 'OPERATIONAL'   ← new field
categoryId?:     string   ← legacy
subtypeId?:      string   ← legacy
positionId?:     string   ← legacy → Teacher.positionAssignments[].id
staffMemberIds?: string[]
staffMemberId?:  string   ← legacy
```

**`system_configs/{orgId}_lists`**
```
positions:          string[]   ← managed list of position name strings (not PositionAssignment objects)
tags:               string[]
classifications:    string[]
employmentTypes?:   string[]
absenceReasons?:    string[]
```
This `positions` list is managed via ManageLists.tsx and is distinct from the `PositionAssignment` objects nested in Teachers.

### What Does NOT Have Its Own Collection

- Subcategories — always nested in `activities/`
- PositionAssignments — always nested in `teachers/`
- TeachingAssignments — always nested in `teachers/`
- StudentAssignments — always nested in `students/`
- ActivityType — no collection, just a type literal

---

## READ / WRITE OPERATIONS BY ENTITY

### Activity

| Operation | File | Notes |
|---|---|---|
| Collection sync | [App.tsx:152](../App.tsx#L152) | `useFirestoreSync<Activity>('activities', [])` |
| Create | [ActivityManager.tsx:65-76](../components/ActivityManager.tsx#L65) | Local state → syncs to Firestore |
| Update name/type | [ActivityManager.tsx:58-64](../components/ActivityManager.tsx#L58) | map by id, set updatedAt |
| Archive | [ActivityManager.tsx:84](../components/ActivityManager.tsx#L84) | isArchived=true |
| Restore | [ActivityManager.tsx:90](../components/ActivityManager.tsx#L90) | isArchived=false |
| Delete | [ActivityManager.tsx:95](../components/ActivityManager.tsx#L95) | filter out by id |

### Subcategory (always through parent Activity)

| Operation | File | Notes |
|---|---|---|
| Create | [ActivityManager.tsx:115-122](../components/ActivityManager.tsx#L115) | Push to formData.subcategories[], generateId() |
| Archive | [ActivityManager.tsx:127-135](../components/ActivityManager.tsx#L127) | Map subcategories, isArchived=true |
| Restore | [ActivityManager.tsx:138-144](../components/ActivityManager.tsx#L138) | Map subcategories, isArchived=false |
| Inline create | [InlineSubcategoryCreator.tsx:35-61](../components/InlineSubcategoryCreator.tsx#L35) | Calls onSubcategoryCreated callback |

### PositionAssignment (through Teacher)

| Operation | File | Notes |
|---|---|---|
| Create/Edit/Delete | [StaffMemberManager.tsx:400+](../components/StaffMemberManager.tsx#L400) | Edit teacher.positionAssignments[] array |
| Billing aggregation | utils/financialAggregator.ts:~200+ | Groups events by PositionAssignment.category |
| Position name list | [ManageLists.tsx:94-107](../components/ManageLists.tsx#L94) | Manages string list, not PositionAssignment objects |

### TeachingAssignment (through Teacher)

| Operation | File | Notes |
|---|---|---|
| Create | [StaffMemberManager.tsx:186-193](../components/StaffMemberManager.tsx#L186) | Add to teacher.teachingAssignments[] |
| Edit activityId | [StaffMemberManager.tsx:1054](../components/StaffMemberManager.tsx#L1054) | handleTeachingAssignmentEdit(ta.id, { activityId }) |
| Edit subcategoryId | [StaffMemberManager.tsx:1067](../components/StaffMemberManager.tsx#L1067) | handleTeachingAssignmentEdit(ta.id, { subcategoryId }) |
| Effective date versioning | [StaffMemberManager.tsx:200-230](../components/StaffMemberManager.tsx#L200) | Edit creates new version, closes old with endDate |
| Delete | [StaffMemberManager.tsx:196-198](../components/StaffMemberManager.tsx#L196) | filter out by id |

### StudentAssignment (through Student)

| Operation | File | Notes |
|---|---|---|
| Create | [StudentManager.tsx:106-112](../components/StudentManager.tsx#L106) | createEmptyAssignment() |
| Edit activityId/subcategoryId | [StudentManager.tsx:~1050+](../components/StudentManager.tsx#L1050) | updateAssignment(id, { activityId, subcategoryId }) |
| Edit staffMemberId | [StudentManager.tsx:1053-1055](../components/StudentManager.tsx#L1053) | Looks up teachingAssignmentId from teacher+activity+subcategory match |
| Delete | [StudentManager.tsx:180-182](../components/StudentManager.tsx#L180) | removeAssignment(id) |
| Sync ensemble rosters | [StudentManager.tsx:470-490](../components/StudentManager.tsx#L470) | Add/remove student from teacher's roster when assignment changes |

---

## RELATIONSHIP ASSUMPTIONS IN BUSINESS LOGIC

### Filtering

| What is filtered | Logic | File |
|---|---|---|
| Subcategories shown in event form | `activity.subcategories.filter(sc => !sc.isArchived)` — scoped to selected activityId | [InlineSubcategoryCreator.tsx:24](../components/InlineSubcategoryCreator.tsx#L24) |
| Staff available for an event | `teacher.teachingAssignments.some(ta => ta.activityId === event.activityId)` | [CalendarView.tsx:~2070](../components/CalendarView.tsx#L2070) |
| Events by intent | `event.eventIntent === 'INSTRUCTIONAL'` | [CalendarView.tsx:~2068](../components/CalendarView.tsx#L2068) |
| Students in a subcategory | `student.assignments.filter(a => a.activityId === x && a.subcategoryId === y)` | [StudentManager.tsx:~400+](../components/StudentManager.tsx#L400) |

### Cross-Entity ID Lookups

| FK stored on | Points to | Used for | File |
|---|---|---|---|
| `TeachingAssignment.activityId` | `Activity.id` | Which activity the teacher teaches | [StaffMemberManager.tsx:1054](../components/StaffMemberManager.tsx#L1054) |
| `TeachingAssignment.subcategoryId` | `Subcategory.id` within that activity | Which subcategory specifically | [StaffMemberManager.tsx:1067](../components/StaffMemberManager.tsx#L1067) |
| `StudentAssignment.activityId` | `Activity.id` | Student's enrolled activity | [StudentManager.tsx:~1050](../components/StudentManager.tsx#L1050) |
| `StudentAssignment.subcategoryId` | `Subcategory.id` | Student's enrolled subcategory | [StudentManager.tsx:~1050](../components/StudentManager.tsx#L1050) |
| `StudentAssignment.teachingAssignmentId` | `Teacher.teachingAssignments[].id` | Resolves teacher+activity+subcategory together | [StudentManager.tsx:1053](../components/StudentManager.tsx#L1053) |
| `CalendarEvent.activityId` | `Activity.id` | Context for an event | [CalendarView.tsx:~1800](../components/CalendarView.tsx#L1800) |
| `CalendarEvent.subcategoryId` | `Subcategory.id` | Context for an event | [CalendarView.tsx:~1800](../components/CalendarView.tsx#L1800) |
| `CalendarEvent.positionId` | `Teacher.positionAssignments[].id` | Billing rate for an event | [CalendarView.tsx:~1500](../components/CalendarView.tsx#L1500) |

### Validation Constraints

- Subcategory name uniqueness is checked **within a single Activity only** — [ActivityManager.tsx:103-109](../components/ActivityManager.tsx#L103), [InlineSubcategoryCreator.tsx:39-41](../components/InlineSubcategoryCreator.tsx#L39)
- Subcategory IDs are immutable after creation (no rename logic)
- TeachingAssignment edits create a new versioned record; old one gets `endDate` — [StaffMemberManager.tsx:200-230](../components/StaffMemberManager.tsx#L200)
- No cascade archival: archiving an Activity does not auto-archive TeachingAssignments or StudentAssignments referencing it

---

## UI COMPONENTS

| Component | File | Renders |
|---|---|---|
| **ActivityManager** | [components/ActivityManager.tsx](../components/ActivityManager.tsx) | Full CRUD + archive/restore for Activities and their nested Subcategories |
| **InlineSubcategoryCreator** | [components/InlineSubcategoryCreator.tsx](../components/InlineSubcategoryCreator.tsx) | Activity-scoped subcategory picker + inline create, used in calendar event form |
| **ManageLists** | [components/ManageLists.tsx](../components/ManageLists.tsx) | Manages the `positions` string list (and tags, classifications, absence reasons) — not PositionAssignment objects |
| **StaffMemberManager** | [components/StaffMemberManager.tsx](../components/StaffMemberManager.tsx) | Teacher CRUD including TeachingAssignment and PositionAssignment tabs |
| **StudentManager** | [components/StudentManager.tsx](../components/StudentManager.tsx) | Student CRUD including StudentAssignment section with activity/subcategory/teacher pickers |
| **CalendarView** | [components/CalendarView.tsx](../components/CalendarView.tsx) | Event modal uses activityId/subcategoryId for context and staff filtering |
| **App.tsx** | [../App.tsx](../App.tsx) | Owns `activities` state, passes to all of the above via props |

---

## CURRENT HIERARCHY

```
Activity  (top-level Firestore document)
│  .type: INSTRUCTIONAL | OPERATIONAL
│
└─ Subcategory[]  (embedded in Activity, no independent collection)

Teacher  (independent Firestore document)
│
├─ PositionAssignment[]  (embedded; billing/rate config; NOT linked to Activity)
│
└─ TeachingAssignment[]  (embedded; FK: activityId + subcategoryId → Activity hierarchy)

Student  (independent Firestore document)
│
└─ StudentAssignment[]  (embedded; FK: activityId + subcategoryId + staffMemberId + teachingAssignmentId)

CalendarEvent  (independent Firestore document)
│  FK: activityId?, subcategoryId?  → Activity hierarchy
│  FK: positionId?                  → Teacher.PositionAssignment (billing)
│  FK: staffMemberIds[]             → Teacher
```

### Key Structural Facts

- Activity is the top-level concept in Firestore
- Subcategory has no independent identity — it only exists inside an Activity document
- Position (PositionAssignment) is entirely separate from the Activity hierarchy; it lives on Teachers and is a billing/role concept, not a curriculum one
- The `positions` string list in `system_configs` is a separate managed reference list of name strings, distinct from PositionAssignment objects
- ActivityType (`INSTRUCTIONAL`/`OPERATIONAL`) is a scalar on Activity, not a collection
- All cross-entity joins are done via string IDs stored on the child/joining record; no Firestore subcollections are used anywhere
- No cascade archival exists between entities
