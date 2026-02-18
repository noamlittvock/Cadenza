# Recurring Events — Technical Specification

> **Version**: 1.0  
> **Date**: 2026-02-17  
> **Status**: Design Phase  
> **Scope**: CalendarEvent recurrence logic for the Music Center Calendar application

---

## 1. Overview

This document specifies the recurrence engine for calendar events. It is modeled after the iCalendar
[RFC 5545 RRULE](https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10) standard, adapted 
for the Music Center's specific needs (lessons, rehearsals, recitals, etc.).

---

## 2. Schema Design

### 2.1 Core `CalendarEvent` Additions

| Field              | Type               | Required | Description                                                    |
|--------------------|---------------------|----------|----------------------------------------------------------------|
| `recurrenceRule`   | `RecurrenceRule`    | No       | The structured recurrence definition (see §2.2)                |
| `recurrenceId`     | `string`            | No       | UUID of the **parent** series event. Null for standalone/parent |
| `exceptions`       | `string[]`          | No       | ISO date strings of dates to **skip** in the series            |
| `isExceptionEdit`  | `boolean`           | No       | True if this instance was individually modified                |
| `originalStart`    | `string`            | No       | ISO string of the original occurrence date before modification |

### 2.2 `RecurrenceRule` Schema

```typescript
interface RecurrenceRule {
  /** The recurrence frequency */
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

  /** Interval between occurrences (e.g., every 2 weeks → frequency: WEEKLY, interval: 2) */
  interval: number;

  /** Days of the week this event occurs on (for WEEKLY/BIWEEKLY) */
  byDay?: ('SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA')[];

  /** Day of the month (1–31) for MONTHLY frequency with "same date" mode */
  byMonthDay?: number;

  /** Week-of-month position for MONTHLY frequency with "same weekday" mode */
  bySetPos?: number; // 1 = first, 2 = second, ..., -1 = last

  /** Day of week for positional monthly recurrence (e.g., 'TU' for "3rd Tuesday") */
  byDayOfWeek?: 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

  /** Month of the year (1–12) for YEARLY frequency */
  byMonth?: number;

  /** Termination: End by a specific date (inclusive, ISO string) */
  untilDate?: string;

  /** Termination: End after N total occurrences */
  count?: number;

  /** If neither untilDate nor count is set, the event recurs indefinitely ("Never Ends") */
}
```

### 2.3 Example Serialized RRULE Strings

| Human Description                        | RRULE String                                              |
|------------------------------------------|-----------------------------------------------------------|
| Every Monday, forever                    | `FREQ=WEEKLY;BYDAY=MO`                                   |
| Every 2 weeks on Tue & Thu, until June   | `FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20260601`      |
| Monthly on the 15th, 12 occurrences      | `FREQ=MONTHLY;BYMONTHDAY=15;COUNT=12`                    |
| Monthly on the 3rd Tuesday, forever      | `FREQ=MONTHLY;BYDAY=TU;BYSETPOS=3`                       |
| Daily for 5 days                         | `FREQ=DAILY;COUNT=5`                                      |
| Annually on March 20                     | `FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=20`                    |

---

## 3. Recurrence Categories

### 3.1 Standard Presets (One-Click Defaults)

These are pre-configured shortcuts exposed in the UI as quick-select buttons for common
music center scheduling patterns:

| Preset Name           | Frequency  | Interval | byDay    | End Mode         |
|----------------------|------------|----------|----------|------------------|
| **Weekly Lesson**     | WEEKLY     | 1        | (inherit)| End of Semester  |
| **Bi-Weekly Lesson**  | BIWEEKLY   | 2        | (inherit)| End of Semester  |
| **Daily Rehearsal**   | DAILY      | 1        | MO–FR    | After 5 days     |
| **Monthly Masterclass** | MONTHLY | 1        | —        | End of Year      |

**Behavior**:
- The `byDay` for "Weekly Lesson" and "Bi-Weekly Lesson" is auto-populated from the event's start date (e.g., if the event starts on Tuesday, `byDay = ['TU']`).
- "End of Semester" uses the nearest Gantt Block marked as a semester boundary as the `untilDate`.
- These presets are purely UI shortcuts — they generate the same `RecurrenceRule` object as custom rules.

### 3.2 Advanced / Custom Logic (Granular User Control)

Exposed behind an "Advanced" toggle in the event creation/edit modal:

#### 3.2.1 Frequency Selection
- **Daily**: Every N day(s)
- **Weekly**: Every N week(s) on selected day(s) — multi-day select (e.g., Mon + Wed + Fri)
- **Monthly**: Every N month(s) — with sub-mode selector (see §4.1)
- **Yearly**: Every N year(s) on a specific month/date

#### 3.2.2 Interval
- Numeric input: **"Every ___ [frequency unit]"**
- Default: 1
- Range: 1–52 for weekly, 1–12 for monthly, 1–10 for yearly

#### 3.2.3 End Condition
- See §5 (Termination Constraints)

---

## 4. Advanced Recurrence Rules

### 4.1 Monthly Recurrence — Two Modes

When frequency is `MONTHLY`, the user must choose one of two sub-modes:

#### Mode A: Same Date
> "Repeat on the 15th of every month"

- **Schema**: `{ frequency: 'MONTHLY', byMonthDay: 15 }`
- **Edge Case**: If `byMonthDay` is 29, 30, or 31, and the target month has fewer days:
  - **Strategy**: Fall back to the **last day of that month**
  - Example: `byMonthDay: 31` in February → generates occurrence on Feb 28 (or 29 in leap year)

#### Mode B: Same Day-of-Week Position
> "Repeat on the 3rd Tuesday of every month"

- **Schema**: `{ frequency: 'MONTHLY', bySetPos: 3, byDayOfWeek: 'TU' }`
- **Position values**:
  - `1` = First, `2` = Second, `3` = Third, `4` = Fourth
  - `-1` = **Last** (e.g., "Last Friday of every month")
- **Edge Case**: "5th {weekday}" doesn't exist in most months
  - **Strategy**: Skip that month (do NOT generate an occurrence) and log a warning

#### UI Presentation
```
┌──────────────────────────────────────────┐
│ Monthly Recurrence Mode                  │
│                                          │
│  ○ Same date (the 15th)                  │
│  ● Same day  (the 3rd Tuesday)           │
│                                          │
│  [Auto-calculated from event start date] │
└──────────────────────────────────────────┘
```

---

## 5. Termination Constraints

Every recurring event must have one of three end states:

| End Mode              | Schema Fields     | Description                                           |
|-----------------------|-------------------|-------------------------------------------------------|
| **Never**             | (neither set)     | Recurs indefinitely. UI shows as "No end date"        |
| **On Date**           | `untilDate`       | Last occurrence is on or before this date (inclusive)  |
| **After X Occurrences** | `count`         | Generates exactly N total occurrences, then stops     |

### 5.1 Validation Rules

- `untilDate` must be ≥ the event's `start` date
- `count` must be ≥ 1 and ≤ 365
- If both `untilDate` and `count` are set, `untilDate` takes precedence (whichever limit is reached first)
- For "Never" mode, the expansion engine should generate occurrences within a **rolling window** (e.g., 1 year ahead) to prevent infinite loops

### 5.2 UI Layout

```
┌──────────────────────────────────────────┐
│ End Recurrence                           │
│                                          │
│  ○ Never                                 │
│  ○ On date    [ 2026-06-30 ]             │
│  ● After      [ 12 ] occurrences         │
└──────────────────────────────────────────┘
```

---

## 6. Exception Handling — Manual Modifications

### 6.1 Modification Types

When a user edits or deletes a **single instance** of a recurring series, the system must handle it without breaking the series:

| Action                           | System Behavior                                                    |
|-----------------------------------|--------------------------------------------------------------------|
| **Delete single instance**        | Add the occurrence date to `exceptions[]` on the parent event      |
| **Edit single instance (time)**   | Create a new `CalendarEvent` with `isExceptionEdit: true`, `recurrenceId` pointing to parent, `originalStart` set to the original occurrence date. Add date to parent's `exceptions[]` |
| **Edit single instance (details)**| Same as time edit — creates a standalone override event             |
| **Cancel single instance**        | Create exception event with `isCanceled: true`                     |
| **Delete entire series**          | Delete the parent event and ALL exception events with matching `recurrenceId` |
| **Edit entire series**            | Modify the parent event's properties. Exception events remain unchanged (user is warned) |

### 6.2 Exception Flow Diagram

```
User clicks on a recurring event instance
     │
     ├──► "Delete" clicked
     │       │
     │       ├── "Just this one"  → Add date to parent.exceptions[]
     │       └── "All events"     → Delete parent + all recurrenceId matches
     │
     ├──► "Edit" clicked
     │       │
     │       ├── "Just this one"  → Create exception event + add to parent.exceptions[]
     │       └── "All events"     → Modify parent event (warn about existing exceptions)
     │
     └──► "Cancel" clicked
             │
             ├── "Just this one"  → Create exception event with isCanceled=true
             └── "All events"     → Set parent.isCanceled = true
```

### 6.3 UI Prompt

When a user edits any instance of a recurring event, show a modal:

```
┌────────────────────────────────────────────────┐
│ Edit Recurring Event                           │
│                                                │
│ This is a recurring event. What would you      │
│ like to modify?                                │
│                                                │
│  ┌───────────────┐  ┌─────────────────────┐    │
│  │ Just This One  │  │  All Future Events  │    │
│  └───────────────┘  └─────────────────────┘    │
│                                                │
│  [ Cancel ]                                    │
└────────────────────────────────────────────────┘
```

---

## 7. Occurrence Expansion Engine

### 7.1 Algorithm

The expansion engine generates concrete `CalendarEvent` instances from a recurrence rule:

```typescript
function expandRecurrence(
  parentEvent: CalendarEvent,
  rule: RecurrenceRule,
  windowStart: Date,
  windowEnd: Date
): CalendarEvent[] {
  const occurrences: CalendarEvent[] = [];
  let currentDate = new Date(parentEvent.start);
  let count = 0;

  while (currentDate <= windowEnd) {
    if (currentDate >= windowStart) {
      // Check if this date is in the exceptions list
      const dateStr = currentDate.toISOString().split('T')[0];
      if (!parentEvent.exceptions?.includes(dateStr)) {
        occurrences.push(createOccurrence(parentEvent, currentDate));
      }
    }

    // Advance to next occurrence based on rule
    currentDate = getNextOccurrence(currentDate, rule);
    count++;

    // Termination checks
    if (rule.count && count >= rule.count) break;
    if (rule.untilDate && currentDate > new Date(rule.untilDate)) break;
  }

  return occurrences;
}
```

### 7.2 Performance Considerations

- **Lazy Expansion**: Only expand occurrences within the visible calendar window (± 1 month buffer)
- **Caching**: Cache expanded occurrences keyed by `[parentEventId, windowStart, windowEnd]`
- **Invalidation**: Clear cache when parent event or its exceptions are modified
- **Maximum Expansion Limit**: Hard cap at 500 occurrences per series per render cycle

---

## 8. Database Storage Strategy

### 8.1 Hybrid Approach

- **Parent events** are stored as single rows with the `recurrenceRule` attached
- **Exception events** are stored as individual rows with `isExceptionEdit: true` and `recurrenceId` linking back
- **Virtual instances** (non-exception occurrences) are NOT stored — they are computed at render time

### 8.2 Query Patterns

| Query                          | Strategy                                                                    |
|--------------------------------|-----------------------------------------------------------------------------|
| "Show events for this week"    | Fetch all parents where start ≤ weekEnd, expand RRULE within [weekStart, weekEnd], merge with exception events |
| "Delete this series"           | Delete WHERE id = parentId OR recurrenceId = parentId                       |
| "Find conflicts for a room"    | Expand all recurring events for room in target window, then check overlaps  |

---

## 9. Development Backlog Items

### Epic: Recurring Events

| # | Story                                              | Priority | Estimate | Dependencies |
|---|----------------------------------------------------|----------|----------|--------------|
| 1 | **Schema Migration**: Add recurrence fields to CalendarEvent type | P0 | 2h | — |
| 2 | **RecurrenceRule Type**: Define TypeScript interface and validation | P0 | 2h | #1 |
| 3 | **Expansion Engine**: Implement `expandRecurrence()` with all frequency modes | P0 | 8h | #2 |
| 4 | **Standard Presets UI**: Add preset buttons (Weekly, Bi-Weekly, Daily, Monthly) to event modal | P1 | 4h | #2 |
| 5 | **Advanced Recurrence UI**: Build frequency/interval/end-condition form in modal | P1 | 6h | #2 |
| 6 | **Monthly Mode Selector**: Implement "Same Date" vs "Same Day" toggle | P1 | 3h | #5 |
| 7 | **Exception Handling**: "Edit This One" / "Edit All" modal + exception creation | P0 | 6h | #3 |
| 8 | **Delete Flow**: Series deletion with confirmation + exception cleanup | P0 | 3h | #7 |
| 9 | **Calendar Rendering Integration**: Merge expanded occurrences into displayEvents | P0 | 4h | #3 |
| 10 | **Gantt View Integration**: Show recurring events correctly in Gantt strips | P1 | 3h | #9 |
| 11 | **Conflict Detection**: Update conflict engine to check expanded occurrences | P2 | 4h | #9 |
| 12 | **Blackout Interaction**: Auto-cancel recurring occurrences within blackout periods | P1 | 3h | #9 |
| 13 | **Performance Optimization**: Lazy expansion + caching + expansion limits | P2 | 4h | #9 |
| 14 | **Edge Case Testing**: Month-end dates, leap years, timezone boundaries | P1 | 4h | #3, #6 |

**Total estimated effort**: ~56 hours

---

## 10. Edge Cases Reference

| Scenario | Expected Behavior |
|----------|-------------------|
| Monthly on the 31st in a 30-day month | Falls back to last day of month (30th) |
| Monthly on the 29th in February (non-leap) | Falls back to Feb 28th |
| Weekly on Mon+Wed, but Mon is a blackout | Only Wed instance is generated; Mon is auto-canceled |
| "Every 3rd Thursday" but month has no 3rd Thursday (impossible) | N/A — every month has at least 4 of each weekday |
| "5th Friday" in months without one | Skip that month entirely |
| DST transition (clock change) | Keep wall-clock time; if 2:30 AM doesn't exist, shift to 3:30 AM |
| Event series spans multiple semesters | Series continues unless `untilDate` or `count` terminates it |
| User edits recurrence rule on parent | All future virtual instances update; existing exception edits are preserved |
| Two exception edits on the same date | Only one exception event per original date (upsert behavior) |

---

*End of specification. This document should be used as the authoritative reference for implementing recurring event support.*
