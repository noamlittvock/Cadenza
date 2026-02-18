# Dynamic Chart Builder — Architecture & Integration Design

> **Status:** Design Specification  
> **Date:** 2026-02-18  
> **Tech Stack:** React 19 / TypeScript / Vite / Recharts 3.6 / localStorage persistence  

---

## Table of Contents

1. [Step 1 — Structural Analysis](#step-1--structural-analysis)
2. [Step 2 — Chart Schema Definition](#step-2--chart-schema-definition)
3. [Step 3 — Integration Strategy](#step-3--integration-strategy)
4. [Step 4 — Implementation Roadmap](#step-4--implementation-roadmap)
5. [Deliverables — TypeScript Interfaces](#deliverables--typescript-interfaces)
6. [Deliverables — Smart Default Engine](#deliverables--smart-default-engine)
7. [Deliverables — React Component Structure & API Adapter](#deliverables--react-component-structure--api-adapter)

---

## Step 1 — Structural Analysis

### 1.1 Current Architecture Summary

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React 19 + TypeScript | Single-page app via Vite; component-per-view pattern |
| **State** | `useState` + `localStorage` | All data (teachers, events, rooms, settings) is loaded from `localStorage` at mount in `App.tsx` and persisted via `useEffect` hooks |
| **Charting** | Recharts 3.6 | `BarChart`, `ResponsiveContainer`, `Tooltip`, `Legend` — all from `recharts` |
| **Data Flow** | Props-down | `App.tsx` → `FinancialDashboard` receives raw `events[]`, `teachers[]`, `settings` |
| **Backend** | None (client-only) | No REST API or database — `localStorage` *is* the "backend" |

### 1.2 Data-Fetching Patterns

There is **no network data-fetching** — the application is fully client-side. The "query" is a chain of `useMemo` hooks inside `FinancialDashboard.tsx`:

```
Props (events[], teachers[])
  → filteredEvents (useMemo: date range + advanced filters)
    → reportData: TeacherReport[] (useMemo: aggregation per teacher-position)
      → totals (useMemo: sum across all reports)
        → chartData (useMemo: reshape for Recharts)
```

### 1.3 How Filters Are Currently Serialized

Filters are **not serialized to an API**. They are local React state (`useState<Set<string>>`):

| Filter State Variable | Type | Dimension |
|---|---|---|
| `dateFilterType` | `'WEEK' \| 'MONTH' \| 'CUSTOM' \| 'ALL'` | Temporal Range |
| `customStartDate` / `customEndDate` | `string` (date) | Custom Date Range |
| `selectedTeacherIds` | `Set<string>` | Teacher (entity) |
| `selectedPositionNames` | `Set<string>` | Position Name (role) |
| `selectedTags` | `Set<string>` | Tag (teacher attribute) |
| `selectedCategories` | `Set<string>` | Category (position attribute) |
| `selectedRateTypes` | `Set<string>` | Rate Type (`HOURLY` / `GLOBAL_MONTHLY`) |

Filter values are combined into `filteredTeacherIds: Set<string>` and `filteredEvents: CalendarEvent[]` via `useMemo` chains (lines 228–287 of `FinancialDashboard.tsx`).

### 1.4 Dimension & Metric Mapping

#### Dimensions (Group-By Attributes)

| Dimension ID | Source | Cardinality | Temporal? | Notes |
|---|---|---|---|---|
| `teacher` | `Teacher.id` → `Teacher.fullName` | ~20–30 | No | Primary entity |
| `position` | `PositionAssignment.positionName` | ~20+ | No | Role within teacher |
| `category` | `PositionAssignment.category` | ~7 (Classification enum) | No | Lesson type |
| `tag` | `Teacher.tags[]` | ~12+ | No | Dept/seniority label |
| `rateType` | `PositionAssignment.rateType` | 2 | No | `HOURLY` / `GLOBAL_MONTHLY` |
| `month` | Derived from `CalendarEvent.start` | Variable | **Yes** | Year-Month grouping |
| `week` | Derived from `CalendarEvent.start` | Variable | **Yes** | ISO week grouping |
| `dayOfWeek` | Derived from `CalendarEvent.start` | 7 | **Yes** (cyclic) | Sun–Sat |
| `room` | `CalendarEvent.roomId` → `Room.name` | ~3–10 | No | Physical location |
| `classification` | `CalendarEvent.classification` | ~7 | No | Event classification |

#### Metrics (Aggregate Attributes)

| Metric ID | Aggregation(s) | Source | Unit |
|---|---|---|---|
| `activeHours` | `SUM`, `AVG`, `COUNT` | `filteredEvents` (non-canceled) duration calc | Hours |
| `canceledHours` | `SUM`, `AVG`, `COUNT` | `filteredEvents` (canceled) duration calc | Hours |
| `totalHours` | `SUM`, `AVG` | `activeHours + canceledHours` | Hours |
| `hourlyCost` | `SUM`, `AVG` | `activeHours × rateValue` (for `HOURLY` positions) | ₪ |
| `globalCost` | `SUM`, `AVG` | `rateValue × monthsInRange` (for `GLOBAL_MONTHLY`) | ₪ |
| `totalCost` | `SUM`, `AVG` | `hourlyCost + globalCost` | ₪ |
| `eventCount` | `COUNT` | Number of events in group | Count |
| `teacherCount` | `COUNT_DISTINCT` | Unique `teacherId` values | Count |
| `avgRate` | `AVG` | `rateValue` across matching position assignments | ₪ |

---

## Step 2 — Chart Schema Definition

### 2.1 The `ChartConfiguration` Interface

```typescript
// ──────────────────────────────────────────────
// types/chartBuilder.ts
// ──────────────────────────────────────────────

/** Identifies which dimension to group data by */
export type DimensionId =
  | 'teacher'
  | 'position'
  | 'category'
  | 'tag'
  | 'rateType'
  | 'month'
  | 'week'
  | 'dayOfWeek'
  | 'room'
  | 'classification';

/** Available aggregation functions */
export type AggregationFn = 'SUM' | 'AVG' | 'COUNT' | 'COUNT_DISTINCT' | 'MIN' | 'MAX';

/** Identifies which metric to measure */
export type MetricId =
  | 'activeHours'
  | 'canceledHours'
  | 'totalHours'
  | 'hourlyCost'
  | 'globalCost'
  | 'totalCost'
  | 'eventCount'
  | 'teacherCount'
  | 'avgRate';

/** Chart visualization types */
export type VisualizationType = 'bar' | 'stacked-bar' | 'line' | 'pie' | 'table';

/** A single metric selection with its aggregation */
export interface MetricSelection {
  metricId: MetricId;
  aggregation: AggregationFn;
  /** Optional display label override */
  label?: string;
  /** Color override for this metric's series */
  color?: string;
}

/** Sort direction for output data */
export type SortDirection = 'asc' | 'desc';

/** Sorting configuration */
export interface SortConfig {
  /** Sort by dimension label or a metric value */
  by: 'dimension' | MetricId;
  direction: SortDirection;
}

/** Optional limit/top-N configuration */
export interface LimitConfig {
  /** Max number of groups to display */
  topN: number;
  /** How to aggregate the remaining groups */
  otherLabel?: string; // e.g., "Other"
}

/** 
 * Snapshot of the dashboard's active filters at the time of chart creation.
 * This allows the chart to either "inherit" the live filters or freeze them.
 */
export interface FilterSnapshot {
  dateFilterType: 'WEEK' | 'MONTH' | 'CUSTOM' | 'ALL';
  customStartDate?: string;
  customEndDate?: string;
  teacherIds: string[];
  positionNames: string[];
  tags: string[];
  categories: string[];
  rateTypes: string[];
}

/**
 * The core, JSON-serializable chart configuration object.
 * This is what gets saved/loaded from localStorage.
 */
export interface ChartConfiguration {
  /** Unique identifier */
  id: string;
  
  /** User-provided chart title */
  title: string;
  
  /** Optional description */
  description?: string;
  
  /**
   * dataSource: Reference to the data pipeline.
   * In this client-only app, this is a constant reference to the
   * FinancialDashboard's internal data pipeline. In a backend scenario,
   * this would be an API endpoint URL.
   */
  dataSource: 'financial-dashboard';
  
  /**
   * The "Group By" attribute — determines the X-axis / category labels.
   * Only one primary dimension is supported for simplicity.
   * An optional secondary dimension enables stacked/grouped charts.
   */
  dimension: DimensionId;
  secondaryDimension?: DimensionId;
  
  /**
   * The "Aggregate" attributes — determines the Y-axis / values.
   * Multiple metrics can be plotted simultaneously.
   */
  metrics: MetricSelection[];
  
  /**
   * Visualization configuration.
   * The Smart Default engine auto-selects this, but the user can override.
   */
  visualization: VisualizationType;
  
  /** Sorting */
  sort?: SortConfig;
  
  /** Top-N limiting */
  limit?: LimitConfig;
  
  /**
   * Filter strategy:
   * - 'live': Chart always uses the current dashboard filter state (reactive).
   * - 'snapshot': Chart freezes the filters captured at creation time.
   */
  filterMode: 'live' | 'snapshot';
  
  /** Captured filter state (used only when filterMode === 'snapshot') */
  filterSnapshot?: FilterSnapshot;
  
  /** Creation/modification timestamps */
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
}
```

### 2.2 Visualization Compatibility Matrix

The Smart Default engine uses this matrix to auto-disable incompatible chart types:

```typescript
// chartBuilder/smartDefaults.ts

export interface DimensionMeta {
  id: DimensionId;
  label: string;
  isTemporal: boolean;
  /** Estimated cardinality — affects chart type recommendations */
  estimatedCardinality: 'low' | 'medium' | 'high';
}

export const DIMENSION_REGISTRY: Record<DimensionId, DimensionMeta> = {
  teacher:        { id: 'teacher',        label: 'Teacher',        isTemporal: false, estimatedCardinality: 'medium' },
  position:       { id: 'position',       label: 'Position',       isTemporal: false, estimatedCardinality: 'medium' },
  category:       { id: 'category',       label: 'Category',       isTemporal: false, estimatedCardinality: 'low' },
  tag:            { id: 'tag',            label: 'Tag',            isTemporal: false, estimatedCardinality: 'low' },
  rateType:       { id: 'rateType',       label: 'Rate Type',      isTemporal: false, estimatedCardinality: 'low' },
  month:          { id: 'month',          label: 'Month',          isTemporal: true,  estimatedCardinality: 'medium' },
  week:           { id: 'week',           label: 'Week',           isTemporal: true,  estimatedCardinality: 'high' },
  dayOfWeek:      { id: 'dayOfWeek',      label: 'Day of Week',    isTemporal: true,  estimatedCardinality: 'low' },
  room:           { id: 'room',           label: 'Room',           isTemporal: false, estimatedCardinality: 'low' },
  classification: { id: 'classification', label: 'Classification', isTemporal: false, estimatedCardinality: 'low' },
};

/**
 * Returns the set of visualization types that are VALID for a given dimension + metrics combo.
 * 
 * Rules:
 * 1. Line charts require temporal dimensions.
 * 2. Pie charts require exactly 1 metric and LOW cardinality dimension.
 * 3. Stacked bars require a secondary dimension.
 * 4. Tables are always valid.
 * 5. Bar charts are always valid.
 */
export function getCompatibleVisualizations(
  dimension: DimensionId,
  metrics: MetricSelection[],
  secondaryDimension?: DimensionId
): VisualizationType[] {
  const meta = DIMENSION_REGISTRY[dimension];
  const valid: VisualizationType[] = ['table']; // always valid

  // Bar charts — always valid
  valid.push('bar');

  // Stacked bar — needs secondary dimension or multiple metrics
  if (secondaryDimension || metrics.length > 1) {
    valid.push('stacked-bar');
  }

  // Line charts — only for temporal dimensions
  if (meta.isTemporal) {
    valid.push('line');
  }

  // Pie charts — single metric, low cardinality
  if (metrics.length === 1 && meta.estimatedCardinality === 'low') {
    valid.push('pie');
  }

  return valid;
}

/**
 * The "Smart Default" engine:
 * Given a dimension and metrics selection, auto-picks the best visualization type.
 */
export function getSmartDefaultVisualization(
  dimension: DimensionId,
  metrics: MetricSelection[],
  secondaryDimension?: DimensionId
): VisualizationType {
  const meta = DIMENSION_REGISTRY[dimension];

  // Rule 1: Temporal dimension → Line chart
  if (meta.isTemporal && metrics.length <= 3) {
    return 'line';
  }

  // Rule 2: Low cardinality + single metric → Pie chart
  if (meta.estimatedCardinality === 'low' && metrics.length === 1) {
    return 'pie';
  }

  // Rule 3: Secondary dimension present → Stacked bar
  if (secondaryDimension) {
    return 'stacked-bar';
  }

  // Rule 4: Multiple metrics → Bar chart
  if (metrics.length > 1) {
    return 'bar';
  }

  // Rule 5: High cardinality → Table (too many bars)
  if (meta.estimatedCardinality === 'high') {
    return 'table';
  }

  // Default: Bar chart
  return 'bar';
}
```

### 2.3 Smart Default Logic Flow

```
┌─────────────────────────┐
│ User selects Dimension  │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐    YES    ┌──────────────────┐
│ Is Dimension Temporal?  │──────────▶│ Default: LINE    │
│ (month, week, dayOfWeek)│           │ chart            │
└──────────┬──────────────┘           └──────────────────┘
           │ NO
           ▼
┌─────────────────────────┐    YES    ┌──────────────────┐
│ Cardinality == LOW      │──────────▶│ Default: PIE     │
│ AND single metric?      │           │ chart            │
└──────────┬──────────────┘           └──────────────────┘
           │ NO
           ▼
┌─────────────────────────┐    YES    ┌──────────────────┐
│ Secondary dimension     │──────────▶│ Default: STACKED │
│ is selected?            │           │ BAR chart        │
└──────────┬──────────────┘           └──────────────────┘
           │ NO
           ▼
┌─────────────────────────┐    YES    ┌──────────────────┐
│ Cardinality == HIGH?    │──────────▶│ Default: TABLE   │
└──────────┬──────────────┘           └──────────────────┘
           │ NO
           ▼
      ┌──────────────────┐
      │ Default: BAR     │
      │ chart            │
      └──────────────────┘
```

---

## Step 3 — Integration Strategy

### 3.1 UI/UX: The "Create Chart" Modal Interaction

Since there is **no backend API**, the Chart Builder will reuse the exact same `useMemo` aggregation pipeline that `FinancialDashboard` already has — extracted into a shared utility.

#### Modal Workflow

```
┌──────────────────────────────────────────────────────────┐
│                  FINANCIAL DASHBOARD                      │
│  [Summary Cards] [Existing Charts] [Detail Table]         │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  📊 Custom Charts                    [+ New Chart]   │ │
│  │                                                       │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │ │
│  │  │ Saved       │ │ Saved       │ │ Saved       │    │ │
│  │  │ Chart 1     │ │ Chart 2     │ │ Chart 3     │    │ │
│  │  │ (Live)      │ │ (Snapshot)  │ │ (Live)      │    │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘    │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘

Clicking [+ New Chart] opens:

┌────────────────────────────────────────────────────────────┐
│  ✨ Create Custom Chart                            [X]     │
│  ──────────────────────────────────────────────────────── │
│  Title: [________________________________]                 │
│                                                            │
│  📐 DIMENSION (Group By)                                   │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ ○ Teacher  ○ Position  ● Month  ○ Category         │  │
│  │ ○ Tag  ○ Rate Type  ○ Day of Week  ○ Room          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  📊 METRICS (Measuring)               [+ Add Metric]      │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ [Total Cost ▼] aggregated by [SUM ▼]     [🗑]       │ │
│  │ [Active Hours ▼] aggregated by [SUM ▼]   [🗑]       │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  🎨 VISUALIZATION                                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ ● Line ✓  ○ Bar ✓  ○ Pie ✗  ○ Table ✓             │  │
│  │   (auto-selected: Line — temporal dimension)        │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  🔗 FILTER MODE                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ ● Live (uses current dashboard filters)             │  │
│  │ ○ Snapshot (freeze current filters)                 │  │
│  │   Inheriting: Month | 2 Teachers | #Strings Dept   │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  ─── PREVIEW ──────────────────────────────────────────── │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         📈 [Live Chart Preview Renders Here]        │  │
│  │                                                      │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│        [Cancel]                    [💾 Save Chart]         │
└────────────────────────────────────────────────────────────┘
```

#### Filter Interaction Rules

1. **Live mode**: The chart re-aggregates whenever the dashboard's global filters change. It reads from the *same* `filteredEvents` source.
2. **Snapshot mode**: At save-time, we serialize the current filter state into `FilterSnapshot` and the chart always replays those specific filters.
3. The filter pills shown in the modal ("Inheriting: ...") are **read-only** — the user does not modify dashboard filters from within the Chart Builder modal.

### 3.2 Data Consistency (Dry-Run Strategy)

Since there is no separate API, **data consistency is guaranteed by design** — we extract the aggregation logic from `FinancialDashboard` into a shared utility function and call it from both:

```
┌─────────────────────────────────────────┐
│  utils/financialAggregator.ts           │
│                                         │
│  aggregateByDimension(                  │
│    events, teachers, config, filters    │
│  ) → AggregatedRow[]                   │
│                                         │
│  ▲ Used by:                             │
│  │  • FinancialDashboard (existing)     │
│  │  • ChartRenderer (new)              │
│  │  • Chart Preview (new)              │
└─────────────────────────────────────────┘
```

This is the architectural equivalent of a "dry-run execution strategy" — there's no separate query to diverge. A single function is the single source of truth for all financial aggregations.

---

## Step 4 — Implementation Roadmap

### 4.1 State Management: Draft Chart State

The chart builder manages a "draft" configuration before saving:

```typescript
// Inside ChartBuilderModal component
const [draft, setDraft] = useState<Partial<ChartConfiguration>>({
  dataSource: 'financial-dashboard',
  dimension: 'teacher',
  metrics: [{ metricId: 'totalCost', aggregation: 'SUM' }],
  visualization: 'bar',
  filterMode: 'live',
  title: '',
});

// Saved charts persist in App.tsx state → localStorage
const [savedCharts, setSavedCharts] = useState<ChartConfiguration[]>(() => {
  const saved = localStorage.getItem('customCharts');
  return saved ? JSON.parse(saved) : [];
});
```

**Draft lifecycle:**
1. Open modal → initialize draft with smart defaults
2. User modifies dimension → Smart Default engine recalculates visualization
3. User adds/removes metrics → Compatible visualizations update
4. User clicks "Save" → draft validated → `id` + timestamps assigned → appended to `savedCharts[]`
5. `savedCharts` persisted to `localStorage` via `useEffect`

### 4.2 Dynamic Querying: The `aggregateByDimension` Function

This is the heart of the system — it replaces the current hardcoded `useMemo` chain with a dynamic, configuration-driven aggregation engine:

```typescript
// utils/financialAggregator.ts

import { CalendarEvent, Teacher, PositionAssignment } from '../types';
import { ChartConfiguration, FilterSnapshot, DimensionId, MetricId, AggregationFn } from '../types/chartBuilder';

export interface AggregatedRow {
  /** The group label (e.g., teacher name, month string, category) */
  dimensionLabel: string;
  /** Raw dimension value for sorting/linking */
  dimensionValue: string;
  /** Computed metric values keyed by "metricId:aggregation" */
  values: Record<string, number>;
}

/**
 * Extract the dimension value from an event + teacher context.
 */
function extractDimensionValue(
  dimension: DimensionId,
  event: CalendarEvent,
  teacher: Teacher | undefined,
  posAssignment: PositionAssignment | undefined
): string {
  switch (dimension) {
    case 'teacher':
      return teacher?.fullName ?? 'Unknown';
    case 'position':
      return posAssignment?.positionName ?? 'Unassigned';
    case 'category':
      return posAssignment?.category ?? event.classification ?? 'Other';
    case 'tag':
      // Events can map to multiple tags — pick the first for grouping
      return teacher?.tags?.[0] ?? 'Untagged';
    case 'rateType':
      return posAssignment?.rateType ?? 'UNKNOWN';
    case 'month': {
      const d = new Date(event.start);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    case 'week': {
      const d = new Date(event.start);
      const startOfYear = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    }
    case 'dayOfWeek': {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return days[new Date(event.start).getDay()];
    }
    case 'room':
      return event.roomId; // Would need Room lookup for display
    case 'classification':
      return event.classification;
    default:
      return 'Unknown';
  }
}

/**
 * Main aggregation engine: processes filtered events into chart-ready data.
 * 
 * This function is the "query engine" — it replaces the hardcoded useMemo
 * chains in FinancialDashboard with a dynamic, config-driven pipeline.
 */
export function aggregateByDimension(
  events: CalendarEvent[],
  teachers: Teacher[],
  config: Pick<ChartConfiguration, 'dimension' | 'metrics' | 'sort' | 'limit'>
): AggregatedRow[] {
  const teacherMap = new Map(teachers.map(t => [t.id, t]));
  
  // --- Phase 1: Group events by dimension ---
  const groups = new Map<string, {
    events: CalendarEvent[];
    teachers: Set<string>;
    posAssignments: PositionAssignment[];
  }>();

  for (const event of events) {
    const teacher = teacherMap.get(event.teacherId);
    const posAssignment = teacher?.positionAssignments.find(pa => pa.id === event.positionId)
      ?? teacher?.positionAssignments[0];
    
    const dimValue = extractDimensionValue(config.dimension, event, teacher, posAssignment);
    
    if (!groups.has(dimValue)) {
      groups.set(dimValue, { events: [], teachers: new Set(), posAssignments: [] });
    }
    const group = groups.get(dimValue)!;
    group.events.push(event);
    if (teacher) group.teachers.add(teacher.id);
    if (posAssignment) group.posAssignments.push(posAssignment);
  }

  // --- Phase 2: Compute metrics per group ---
  const rows: AggregatedRow[] = [];

  for (const [dimValue, group] of groups) {
    const values: Record<string, number> = {};

    for (const { metricId, aggregation } of config.metrics) {
      const key = `${metricId}:${aggregation}`;
      values[key] = computeMetric(metricId, aggregation, group.events, group.teachers, group.posAssignments);
    }

    rows.push({
      dimensionLabel: dimValue,
      dimensionValue: dimValue,
      values,
    });
  }

  // --- Phase 3: Sort ---
  if (config.sort) {
    const sortKey = config.sort.by === 'dimension' 
      ? null 
      : `${config.sort.by}:${config.metrics.find(m => m.metricId === config.sort!.by)?.aggregation ?? 'SUM'}`;
    
    rows.sort((a, b) => {
      const aVal = sortKey ? (a.values[sortKey] ?? 0) : a.dimensionLabel;
      const bVal = sortKey ? (b.values[sortKey] ?? 0) : b.dimensionLabel;
      const cmp = typeof aVal === 'number' ? aVal - (bVal as number) : aVal.localeCompare(bVal as string);
      return config.sort!.direction === 'desc' ? -cmp : cmp;
    });
  }

  // --- Phase 4: Limit (Top-N) ---
  if (config.limit && rows.length > config.limit.topN) {
    const topRows = rows.slice(0, config.limit.topN);
    const otherRows = rows.slice(config.limit.topN);
    
    // Aggregate "Other" bucket
    const otherValues: Record<string, number> = {};
    for (const key of Object.keys(topRows[0]?.values ?? {})) {
      otherValues[key] = otherRows.reduce((sum, r) => sum + (r.values[key] ?? 0), 0);
    }
    
    topRows.push({
      dimensionLabel: config.limit.otherLabel ?? 'Other',
      dimensionValue: '__other__',
      values: otherValues,
    });
    
    return topRows;
  }

  return rows;
}

/**
 * Compute a single metric value for a group of events.
 */
function computeMetric(
  metricId: MetricId,
  aggregation: AggregationFn,
  events: CalendarEvent[],
  teachers: Set<string>,
  posAssignments: PositionAssignment[]
): number {
  // Extract raw values based on metricId
  let rawValues: number[];

  switch (metricId) {
    case 'activeHours':
      rawValues = events
        .filter(e => !e.isCanceled)
        .map(e => (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3600000);
      break;
    case 'canceledHours':
      rawValues = events
        .filter(e => e.isCanceled)
        .map(e => (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3600000);
      break;
    case 'totalHours':
      rawValues = events
        .map(e => (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3600000);
      break;
    case 'hourlyCost':
      rawValues = events
        .filter(e => !e.isCanceled)
        .map(e => {
          const pa = posAssignments.find(p => p.id === e.positionId);
          if (pa?.rateType === 'HOURLY') {
            const hours = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3600000;
            return hours * pa.rateValue;
          }
          return 0;
        });
      break;
    case 'globalCost':
      // Global cost is per-assignment, not per-event; sum unique assignments
      const seen = new Set<string>();
      rawValues = posAssignments
        .filter(pa => {
          if (pa.rateType !== 'GLOBAL_MONTHLY' || seen.has(pa.id)) return false;
          seen.add(pa.id);
          return true;
        })
        .map(pa => pa.rateValue);
      break;
    case 'totalCost': {
      const hourly = events.filter(e => !e.isCanceled).reduce((sum, e) => {
        const pa = posAssignments.find(p => p.id === e.positionId);
        if (pa?.rateType === 'HOURLY') {
          return sum + ((new Date(e.end).getTime() - new Date(e.start).getTime()) / 3600000) * pa.rateValue;
        }
        return sum;
      }, 0);
      const seenGlobal = new Set<string>();
      const global = posAssignments
        .filter(pa => { if (pa.rateType !== 'GLOBAL_MONTHLY' || seenGlobal.has(pa.id)) return false; seenGlobal.add(pa.id); return true; })
        .reduce((s, pa) => s + pa.rateValue, 0);
      rawValues = [hourly + global];
      break;
    }
    case 'eventCount':
      rawValues = [events.length];
      break;
    case 'teacherCount':
      rawValues = [teachers.size];
      break;
    case 'avgRate':
      rawValues = posAssignments.map(pa => pa.rateValue);
      break;
    default:
      rawValues = [];
  }

  // Apply aggregation
  if (rawValues.length === 0) return 0;

  switch (aggregation) {
    case 'SUM':
      return rawValues.reduce((a, b) => a + b, 0);
    case 'AVG':
      return rawValues.reduce((a, b) => a + b, 0) / rawValues.length;
    case 'COUNT':
      return rawValues.length;
    case 'COUNT_DISTINCT':
      return new Set(rawValues).size;
    case 'MIN':
      return Math.min(...rawValues);
    case 'MAX':
      return Math.max(...rawValues);
    default:
      return 0;
  }
}
```

### 4.3 Rendering Engine: `ChartRenderer` Component

A thin wrapper that takes a `ChartConfiguration` and maps it to Recharts:

```typescript
// components/ChartRenderer.tsx

import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ChartConfiguration } from '../types/chartBuilder';
import { aggregateByDimension, AggregatedRow } from '../utils/financialAggregator';
import { CalendarEvent, Teacher } from '../types';

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#64748b',
];

interface ChartRendererProps {
  config: ChartConfiguration;
  events: CalendarEvent[];
  teachers: Teacher[];
  height?: number;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  config, events, teachers, height = 350,
}) => {
  // Run the aggregation engine
  const data = useMemo(
    () => aggregateByDimension(events, teachers, config),
    [events, teachers, config]
  );

  // Build Recharts-friendly data shape
  const chartData = useMemo(() => {
    return data.map(row => {
      const point: Record<string, string | number> = { name: row.dimensionLabel };
      config.metrics.forEach(({ metricId, aggregation, label }) => {
        const key = `${metricId}:${aggregation}`;
        const displayKey = label ?? `${metricId} (${aggregation.toLowerCase()})`;
        point[displayKey] = Math.round((row.values[key] ?? 0) * 100) / 100;
      });
      return point;
    });
  }, [data, config.metrics]);

  // Get display keys for metrics
  const metricKeys = config.metrics.map(({ metricId, aggregation, label }) =>
    label ?? `${metricId} (${aggregation.toLowerCase()})`
  );

  // ── Render based on visualization type ──

  switch (config.visualization) {
    case 'bar':
    case 'stacked-bar':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" fontSize={12} stroke="#94a3b8" />
            <YAxis fontSize={12} stroke="#94a3b8" />
            <Tooltip
              cursor={{ fill: '#f8fafc' }}
              contentStyle={{
                backgroundColor: '#1e293b',
                border: 'none',
                color: '#fff',
                borderRadius: '8px',
              }}
            />
            <Legend />
            {metricKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                stackId={config.visualization === 'stacked-bar' ? 'stack' : undefined}
                fill={config.metrics[i]?.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case 'line':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" fontSize={12} stroke="#94a3b8" />
            <YAxis fontSize={12} stroke="#94a3b8" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: 'none',
                color: '#fff',
                borderRadius: '8px',
              }}
            />
            <Legend />
            {metricKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={config.metrics[i]?.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS[i % CHART_COLORS.length], r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );

    case 'pie': {
      const metricKey = metricKeys[0];
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey={metricKey}
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={Math.min(height * 0.35, 140)}
              label={({ name, value }) => `${name}: ${value}`}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">{config.dimension}</th>
                {metricKeys.map(k => (
                  <th key={k} className="px-4 py-3 text-right font-medium">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {chartData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    {row.name}
                  </td>
                  {metricKeys.map(k => (
                    <td key={k} className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                      {typeof row[k] === 'number' ? (row[k] as number).toLocaleString() : row[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return <div className="text-slate-500 p-4">Unsupported visualization type</div>;
  }
};
```

### 4.4 ChartBuilderModal Component Structure

```typescript
// components/ChartBuilderModal.tsx (High-Level Structure)

import React, { useState, useMemo, useCallback } from 'react';
import { ChartConfiguration, DimensionId, MetricSelection, VisualizationType } from '../types/chartBuilder';
import { getSmartDefaultVisualization, getCompatibleVisualizations, DIMENSION_REGISTRY } from '../chartBuilder/smartDefaults';
import { ChartRenderer } from './ChartRenderer';
import { CalendarEvent, Teacher } from '../types';
import { X, Plus, Trash2, BarChart3 } from 'lucide-react';

interface ChartBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ChartConfiguration) => void;
  /** Pass current filtered events for preview + live mode */
  filteredEvents: CalendarEvent[];
  /** All events for snapshot replay */
  allEvents: CalendarEvent[];
  teachers: Teacher[];
  /** Current dashboard filter state, for snapshot capture */
  currentFilters: {
    dateFilterType: string;
    customStartDate: string;
    customEndDate: string;
    selectedTeacherIds: Set<string>;
    selectedPositionNames: Set<string>;
    selectedTags: Set<string>;
    selectedCategories: Set<string>;
    selectedRateTypes: Set<string>;
  };
  /** Editing an existing chart? Pre-populate draft. */
  editingChart?: ChartConfiguration;
}

export const ChartBuilderModal: React.FC<ChartBuilderModalProps> = ({
  isOpen, onClose, onSave,
  filteredEvents, allEvents, teachers,
  currentFilters, editingChart,
}) => {
  // ── Draft State ──
  const [title, setTitle] = useState(editingChart?.title ?? '');
  const [dimension, setDimension] = useState<DimensionId>(editingChart?.dimension ?? 'teacher');
  const [metrics, setMetrics] = useState<MetricSelection[]>(
    editingChart?.metrics ?? [{ metricId: 'totalCost', aggregation: 'SUM' }]
  );
  const [visualization, setVisualization] = useState<VisualizationType>(
    editingChart?.visualization ?? 'bar'
  );
  const [filterMode, setFilterMode] = useState<'live' | 'snapshot'>(
    editingChart?.filterMode ?? 'live'
  );

  // ── Smart Defaults: auto-update visualization when dimension changes ──
  const compatibleViz = useMemo(
    () => getCompatibleVisualizations(dimension, metrics),
    [dimension, metrics]
  );

  const handleDimensionChange = useCallback((newDim: DimensionId) => {
    setDimension(newDim);
    const smartDefault = getSmartDefaultVisualization(newDim, metrics);
    setVisualization(smartDefault);
  }, [metrics]);

  // ── Build preview config ──
  const previewConfig: ChartConfiguration = useMemo(() => ({
    id: '__preview__',
    title: title || 'Preview',
    dataSource: 'financial-dashboard',
    dimension,
    metrics,
    visualization,
    filterMode,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }), [title, dimension, metrics, visualization, filterMode]);

  // ── Save handler ──
  const handleSave = () => {
    if (!title.trim()) return; // validation

    const now = new Date().toISOString();
    const config: ChartConfiguration = {
      id: editingChart?.id ?? `chart_${Date.now()}`,
      title: title.trim(),
      dataSource: 'financial-dashboard',
      dimension,
      metrics,
      visualization,
      filterMode,
      filterSnapshot: filterMode === 'snapshot' ? {
        dateFilterType: currentFilters.dateFilterType as any,
        customStartDate: currentFilters.customStartDate,
        customEndDate: currentFilters.customEndDate,
        teacherIds: [...currentFilters.selectedTeacherIds],
        positionNames: [...currentFilters.selectedPositionNames],
        tags: [...currentFilters.selectedTags],
        categories: [...currentFilters.selectedCategories],
        rateTypes: [...currentFilters.selectedRateTypes],
      } : undefined,
      createdAt: editingChart?.createdAt ?? now,
      updatedAt: now,
    };

    onSave(config);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <BarChart3 size={20} />
            {editingChart ? 'Edit Chart' : 'Create Custom Chart'}
          </h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        {/* ── Title ── */}
        <input
          type="text"
          placeholder="Chart title..."
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full px-4 py-2 mb-6 border rounded-lg bg-white dark:bg-slate-800 dark:text-white"
        />

        {/* ── Dimension Selector ── */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">
            📐 Group By (Dimension)
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.values(DIMENSION_REGISTRY).map(dim => (
              <button
                key={dim.id}
                onClick={() => handleDimensionChange(dim.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  dimension === dim.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {dim.label}
                {dim.isTemporal && ' 📅'}
              </button>
            ))}
          </div>
        </section>

        {/* ── Metrics Selector ── */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              📊 Metrics
            </h3>
            <button
              onClick={() => setMetrics([...metrics, { metricId: 'activeHours', aggregation: 'SUM' }])}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Plus size={12} /> Add Metric
            </button>
          </div>
          {metrics.map((m, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <select
                value={m.metricId}
                onChange={e => {
                  const updated = [...metrics];
                  updated[idx] = { ...m, metricId: e.target.value as any };
                  setMetrics(updated);
                }}
                className="flex-1 px-3 py-1.5 rounded-lg border bg-white dark:bg-slate-800 dark:text-white text-sm"
              >
                <option value="totalCost">Total Cost</option>
                <option value="hourlyCost">Hourly Cost</option>
                <option value="globalCost">Global Cost</option>
                <option value="activeHours">Active Hours</option>
                <option value="canceledHours">Canceled Hours</option>
                <option value="totalHours">Total Hours</option>
                <option value="eventCount">Event Count</option>
                <option value="teacherCount">Teacher Count</option>
                <option value="avgRate">Average Rate</option>
              </select>
              <select
                value={m.aggregation}
                onChange={e => {
                  const updated = [...metrics];
                  updated[idx] = { ...m, aggregation: e.target.value as any };
                  setMetrics(updated);
                }}
                className="px-3 py-1.5 rounded-lg border bg-white dark:bg-slate-800 dark:text-white text-sm"
              >
                <option value="SUM">Sum</option>
                <option value="AVG">Average</option>
                <option value="COUNT">Count</option>
                <option value="MIN">Min</option>
                <option value="MAX">Max</option>
              </select>
              {metrics.length > 1 && (
                <button onClick={() => setMetrics(metrics.filter((_, i) => i !== idx))}>
                  <Trash2 size={14} className="text-red-400 hover:text-red-600" />
                </button>
              )}
            </div>
          ))}
        </section>

        {/* ── Visualization Selector ── */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">
            🎨 Visualization
          </h3>
          <div className="flex flex-wrap gap-2">
            {(['bar', 'stacked-bar', 'line', 'pie', 'table'] as VisualizationType[]).map(viz => {
              const isCompatible = compatibleViz.includes(viz);
              return (
                <button
                  key={viz}
                  onClick={() => isCompatible && setVisualization(viz)}
                  disabled={!isCompatible}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    visualization === viz
                      ? 'bg-blue-600 text-white'
                      : isCompatible
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                        : 'bg-slate-50 dark:bg-slate-900 text-slate-300 dark:text-slate-600 cursor-not-allowed line-through'
                  }`}
                >
                  {viz}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Filter Mode ── */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">
            🔗 Filter Mode
          </h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio" name="filterMode" value="live"
                checked={filterMode === 'live'}
                onChange={() => setFilterMode('live')}
              />
              <span className="text-sm">Live (reactive to dashboard filters)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio" name="filterMode" value="snapshot"
                checked={filterMode === 'snapshot'}
                onChange={() => setFilterMode('snapshot')}
              />
              <span className="text-sm">Snapshot (freeze current filters)</span>
            </label>
          </div>
        </section>

        {/* ── Live Preview ── */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">
            Preview
          </h3>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <ChartRenderer
              config={previewConfig}
              events={filteredEvents}
              teachers={teachers}
              height={280}
            />
          </div>
        </section>

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            💾 Save Chart
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## Full File Map

Here is how the new files map into the existing project structure:

```
Alpert Music Center Management 2/
├── types/
│   └── chartBuilder.ts          ← NEW: ChartConfiguration interface + all types
├── utils/
│   ├── dataGenerator.ts         ← EXISTING
│   └── financialAggregator.ts   ← NEW: Dynamic aggregation engine
├── chartBuilder/
│   └── smartDefaults.ts         ← NEW: Dimension registry + smart default logic
├── components/
│   ├── FinancialDashboard.tsx   ← MODIFIED: Add "Custom Charts" section + modal trigger
│   ├── ChartRenderer.tsx        ← NEW: Generic Recharts rendering wrapper
│   └── ChartBuilderModal.tsx    ← NEW: Create/Edit chart modal
└── App.tsx                      ← MODIFIED: Add `savedCharts` state + localStorage persistence
```

### Changes to Existing Files

#### `App.tsx` — Add saved charts state

```typescript
// Add to App.tsx state initialization:
const [savedCharts, setSavedCharts] = useState<ChartConfiguration[]>(() => {
  const saved = localStorage.getItem('customCharts');
  return saved ? JSON.parse(saved) : [];
});

// Add persistence effect:
useEffect(() => localStorage.setItem('customCharts', JSON.stringify(savedCharts)), [savedCharts]);

// Pass to FinancialDashboard:
<FinancialDashboard
  events={events}
  teachers={teachers}
  settings={settings}
  savedCharts={savedCharts}
  setSavedCharts={setSavedCharts}
  onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
/>
```

#### `FinancialDashboard.tsx` — Add custom charts section

Insert a new grid section after the existing charts (after line 714) that:
1. Renders each saved `ChartConfiguration` using `<ChartRenderer />`
2. Shows a `[+ New Chart]` button that opens `<ChartBuilderModal />`
3. Each saved chart card has Edit / Delete / Clone actions

---

## Summary

| Deliverable | File | Status |
|---|---|---|
| TypeScript `ChartConfiguration` interface | `types/chartBuilder.ts` | ✅ Defined above |
| Smart Default engine logic flow | `chartBuilder/smartDefaults.ts` | ✅ Defined above |
| Dimension & Metric registries | `chartBuilder/smartDefaults.ts` + `utils/financialAggregator.ts` | ✅ Defined above |
| `ChartRenderer` React component | `components/ChartRenderer.tsx` | ✅ Defined above |
| `ChartBuilderModal` React component | `components/ChartBuilderModal.tsx` | ✅ Defined above |
| `aggregateByDimension` engine | `utils/financialAggregator.ts` | ✅ Defined above |
| Integration strategy & filter flow | This document §3 | ✅ Documented |
| Modification plan for existing files | This document §File Map | ✅ Documented |
