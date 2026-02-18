# Dynamic Chart Builder — Implementation Phases

> Each phase is independently deployable and testable.  
> After each phase, the app should compile and run without errors.

---

## Phase 1: Foundation (Types + Aggregation Engine)
**Goal:** Create the type system and the shared aggregation utility — no UI changes yet.

**Files Created:**
- `types/chartBuilder.ts` — All TypeScript interfaces (`ChartConfiguration`, `DimensionId`, `MetricId`, etc.)
- `utils/financialAggregator.ts` — The `aggregateByDimension()` engine + `extractDimensionValue()` + `computeMetric()`
- `chartBuilder/smartDefaults.ts` — `DIMENSION_REGISTRY`, `getCompatibleVisualizations()`, `getSmartDefaultVisualization()`

**How to verify:**
- App compiles with `npm run dev` (no runtime usage yet, just importable modules).
- You can review the types and logic in isolation.

---

## Phase 2: Chart Renderer Component
**Goal:** Build the `<ChartRenderer />` wrapper that takes a `ChartConfiguration` + data and renders the correct Recharts chart.

**Files Created:**
- `components/ChartRenderer.tsx` — Maps `visualization` type → `BarChart` / `LineChart` / `PieChart` / `<table>`

**How to verify:**
- Still no visible UI change — but the component is ready to be used.
- App compiles cleanly.

---

## Phase 3: Chart Builder Modal
**Goal:** Build the full `<ChartBuilderModal />` with dimension/metric/visualization selectors, smart defaults, filter mode, and live preview.

**Files Created:**
- `components/ChartBuilderModal.tsx` — The create/edit modal with draft state and live preview

**How to verify:**
- Still not wired into the dashboard yet, but the component exists and is importable.
- App compiles cleanly.

---

## Phase 4: Integration into Dashboard + App State
**Goal:** Wire everything together. Add saved charts state to `App.tsx`, add the "Custom Charts" section + "+ New Chart" button to `FinancialDashboard.tsx`.

**Files Modified:**
- `App.tsx` — Add `savedCharts` state + `localStorage` persistence + pass to `FinancialDashboard`
- `components/FinancialDashboard.tsx` — Add custom charts grid, "+ New Chart" button, modal trigger, edit/delete actions

**How to verify:**
- Open the Financial Dashboard → see new "Custom Charts" section
- Click "+ New Chart" → modal opens → configure → preview updates live → save
- Saved charts render below the existing charts
- Charts with "live" filter mode update when you change dashboard filters
- Reload page → saved charts persist from `localStorage`

---
