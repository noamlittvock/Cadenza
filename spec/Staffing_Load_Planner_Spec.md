# Teaching-Load / Staffing Planner (הרכבי משרה) — Standalone Spec

**Status:** proposal / discovery
**Relationship to the playground:** *sibling*, not child. It reuses the
what-if playground's **interaction DNA** (a live "bank-account" balance, instant
visible consequence, completion color, reversibility) but is a **standalone
planning module on its own data model**. Per product decision, it **does not
connect to the calendar or payroll** — assigning load here generates no events
and no paystubs. It is a planning sheet for next year's staffing.

---

## 1. What it is (plain terms)

A live dashboard for building next year's teaching staff. Administrators
**manually** allocate each teacher's required employment hours across classes and
subjects, and watch — in real time — each teacher's remaining "balance" fall to
zero (green) and each class fill up (green), while a **recruitment dashboard**
shows exactly which hours are still unstaffed.

It is **not** an automatic scheduler. It is a *thinking and tracking* tool: who
teaches what, do the hours balance, and what must we still hire for.

---

## 2. Core objectives

1. **Complete class mapping** — every class, the subjects it needs, the required
   weekly hours per subject, and the assigned teacher(s).
2. **Teacher hour tracking** — each teacher's required employment hours vs. how
   many are already assigned (the live balance).
3. **Recruitment identification** — instantly see unassigned hours so planners
   know exactly which positions to hire for.

---

## 3. Constraints & complexities (the things that make it non-trivial)

- **Manual assignment.** Admins assign teachers to class-subject hours by hand.
- **Categorized hour obligations.** A teacher's total is often split by *track*:
  e.g. of 22h, at least 10 must be **high school / Bagrut** and the rest
  **junior high**. The balance must respect these sub-buckets, not just the total.
- **Hour splitting.** A single subject's weekly hours in one class can be divided
  among multiple teachers (5h physics → 3h teacher A + 2h teacher B).

---

## 4. Data model (new — none of this exists today)

> Verified against the codebase: `StaffMemberV2` has no required-hours/FTE/track
> obligation, and `TeachingAssignmentV2` carries no hours and no splitting. This
> module needs its own entities. They follow Cadenza conventions (`orgId`, `id`,
> `isArchived`, `createdAt`/`updatedAt`).

### 4.1 `StaffingPlan` (the "sheet")
Container so plans can coexist / be drafted (the playground feel).
```
id, orgId, name, schoolYear, status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
createdAt, updatedAt, isArchived
```

### 4.2 `TeacherQuota` — the teacher's employment obligation
```
id, orgId, planId,
staffMemberId,                 // → StaffMemberV2.id
totalRequiredHours,            // e.g. 22
trackRequirements: TrackRequirement[]   // optional sub-bucket minimums
createdAt, updatedAt
```
```
TrackRequirement = { track: 'HIGH_SCHOOL' | 'JUNIOR_HIGH' | string, minHours }
```
*Balance = totalRequiredHours − Σ assigned hours; per-track balances mirror it.*

### 4.3 `ClassGroup` — a class that needs staffing
```
id, orgId, planId, name, gradeLevel, createdAt, updatedAt
```

### 4.4 `ClassSubjectRequirement` — "this class needs N hours of subject X"
```
id, orgId, planId, classGroupId,
subject,                       // string or subjectId
requiredWeeklyHours,           // e.g. 5
track: 'HIGH_SCHOOL' | 'JUNIOR_HIGH' | string   // for quota bucketing
createdAt, updatedAt
```

### 4.5 `LoadAssignment` — the allocation (supports splitting)
```
id, orgId, planId,
requirementId,                 // → ClassSubjectRequirement
staffMemberId,                 // → StaffMemberV2.id
hours,                         // the slice (3, then another row for 2)
createdAt, updatedAt
```
*A requirement is **fully staffed** when Σ assignment hours = requiredWeeklyHours.
Splitting = multiple `LoadAssignment` rows against one requirement.*

This is a small, closed model: five entities, all derivations are simple sums.

---

## 5. The three views (per the brief)

| View / Module | Primary function | Key data |
| --- | --- | --- |
| **Teacher Database** | Track each teacher's obligation & balance | total required hours, per-track minimums, **remaining unassigned** (live) |
| **Class Schedule Board** | Map curriculum & staffing per class | subjects required, hours/subject, assigned teacher(s), **unstaffed gaps** |
| **Recruitment Dashboard** | Roll up every gap across the school | missing subject, grade level, **total missing hours per gap** |

All three read from the same five tables; nothing is duplicated — the dashboards
are just different *groupings* of `requiredWeeklyHours − Σ assigned`.

---

## 6. Reused playground primitives (the "soul")

The point of building this near the playground is to **share the interaction
pattern**, so it feels familiar and stays intuitive for non-technical users:

1. **Live "bank-account" balance.** Assigning hours deducts instantly from the
   teacher's remaining total (and the relevant track bucket). A balance falling to
   zero is the whole mental model — borrowed from real life, nothing to learn.
2. **Completion color, not text.** Teacher name → **green** when balance hits 0;
   class indicator → **green** when every subject is fully staffed; **amber** for a
   gap, **red** for over-assignment. Readable at a glance.
3. **Consequence next to the action.** The balance and the class fill-state update
   in place as you assign — the user never navigates to see what they just did.
4. **Reversible & inconsequential.** Undo / reset; a `DRAFT` plan can be tried,
   duplicated, or thrown away before it becomes `ACTIVE`. This is what makes it a
   playground rather than a form.
5. **Headline first, detail on demand.** "Dana: 4 of 22h left" up front; the
   per-track and per-class breakdown one click deeper.
6. **Never block silently.** Over-allocating or breaking a track minimum shows a
   one-sentence, plain-language explanation — never a greyed control with a hidden
   reason.

---

## 7. Intentionally out of scope (per "standalone")

- **No calendar link** — assignments do not create or move scheduled events.
- **No payroll link** — assigned hours do not feed `hoursEntryService` or pay.
- **No auto-scheduling** — the tool never assigns teachers itself.

If a future product decision wants staffing → schedule → payroll, that becomes the
"projection seam" discussed in the playground audit. Not now.

---

## 8. Open questions

1. **Track taxonomy:** fixed (`HIGH_SCHOOL` / `JUNIOR_HIGH`) or org-configurable
   bands? (Drives `TrackRequirement.track` typing.)
2. **Subjects:** free-text per requirement, or a managed subject list (reuse the
   activity hierarchy)?
3. **Plan lifecycle:** one active plan per school year, or many drafts side by side
   à la what-if plans?
4. **Roster source:** are `ClassGroup`s entered here, or imported from an existing
   classes/students structure?
