# Cadenza Dev Session Handoff

## Branch
`cadenza-v2`

## What Was Just Completed

Full DevTools redesign for the SuperAdmin section. All 8 phases done, 0 tsc errors, 89/89 tests passing.

### New Files Created
- `context/DevSimulationContext.tsx` — React context for date/role simulation state
- `components/DevSimulationBanner.tsx` — Fixed violet banner (z-200) shown during any active simulation
- `components/DevTools.tsx` — Extracted + enhanced DEV_TOOLS tab (~450 lines)
- `utils/devDataGenerator.ts` — Comprehensive stress-test data generator

### Modified Files
- `App.tsx` — Wrapped AppContent in DevSimulationProvider; wired simulatedDate → setCurrentDate; added DevSimulationBanner
- `components/SuperAdmin.tsx` — Replaced 366-line inline DEV_TOOLS block with `<DevTools />` component
- (Layout.tsx had no changes needed — raw useAuth() is the natural escape hatch for real SUPERADMIN)

## Features Added

### Date Simulator (violet theme in DevTools)
- Relative jump buttons: -30d, -7d, -1d, +1d, +7d, +30d, +90d, Today
- Scenario jumps: Month End, Quarter End, New Year, Sep 1 (Enrollment)
- Custom date picker
- Active date badge with "Reset to today" link
- Syncs to calendar via useEffect in App.tsx

### Role Simulator (blue theme in DevTools)
- 5 ROLE_PRESETS: SuperAdmin, Admin (Active), Viewer (Read-Only), First Admin Pre-Gate, First Admin Post-Gate
- Toggle: click same preset again to deactivate
- "Exit All Simulations" button
- DevSimulationBanner always visible during simulation
- Real SUPERADMIN auth preserved in Layout.tsx (escape hatch)

### Full Stress Test Generator
- Button in DevTools Generate Data section (green, "Full Stress Test")
- Calls `generateFullDevData(currency, simulatedDate)`
- 25 teachers (all RateTypes, #25 archived)
- 7 activities (6 INSTRUCTIONAL, 1 OPERATIONAL, 1 ARCHIVED)
- ~300 events (220 spread ±90d, 21 weekly series, 10 bi-weekly choir, 12 room conflicts, 30 future 3-6mo)
- 8 rooms
- 15 Gantt blocks (12 assignment + 3 blackout)
- 12 students with full shape (guardians, assignments, pedagogicalRecord, notes, documents)
- Admin inbox, hours reports, saved charts, subscriptions

## Key Architecture Notes

### useEffectiveAuth / useEffectiveOnboarding
- AppContent uses `useEffectiveAuth()` and `useEffectiveOnboarding()` (from DevSimulationContext)
- Layout.tsx uses raw `useAuth()` — real SUPERADMIN stays identified even when simulating another role
- This means SUPERADMIN nav item stays visible and VIEWER redirect won't fire for real SUPERADMIN

### DevSimulationContext exports
- `DevSimulationProvider` — wraps AppContent inside AuthProvider
- `useDevSimulation()` — { simulatedDate, simulatedRole, setSimulatedDate, setSimulatedRole, clearAllSimulations }
- `useEffectiveAuth()` — returns real or simulated role/auth values
- `useEffectiveOnboarding()` — returns real or simulated onboarding flags (noop async methods when simulating)
- `ROLE_PRESETS` — array of 5 preset objects

### Type Gotchas (learned the hard way)
- `CalendarEvent.teacherId` (not staffMemberId)
- `AddOnItem` requires `affectsPayroll: boolean`
- `Guardian.fullName` (not name)
- `GanttBlock`: `{ id, title, startDate, endDate, color, isBlackout }` (no teacherId/orgId)
- `Subcategory`: `{ id, name, isArchived }` only (no createdAt/updatedAt)
- `Room`: no orgId field
- `AdminInboxItem` status: `'OPEN' | 'DONE'` (not 'COMPLETED')
- `HoursReport`: uses `staffMemberId`, `token`, `periodStart`, `periodEnd`, `createdBy`
- `CalendarSubscription`: requires `token`, `filters`, `createdBy`, `createdAt`
- `Student`: requires `guardians`, `assignments`, `pedagogicalRecord`, `notes`, `documents`, `profileStatus`, `createdAt`, `updatedAt`

## Status
- All code complete and type-checked
- NOT yet committed (working tree dirty)
- Ready for manual QA in browser, then commit
