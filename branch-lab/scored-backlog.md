# Scored Backlog — bl01

Floor: audience fit ≥ 2 AND usefulness ≥ 2.

| # | Item | AF | Use | Cl | WE | VH | A11y | Rel | Nov | Risk | Rev | Sum | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 6 | FilterPills active filter display on calendar | 3 | 3 | 3 | 3 | 3 | 2 | 3 | 2 | 2 | 3 | **27** | PASS |
| 12 | Activity archive confirmation w/ event count | 3 | 3 | 3 | 2 | 2 | 2 | 3 | 2 | 3 | 3 | **26** | PASS |
| 13 | Sticky table headers (Staff, Rooms) | 3 | 3 | 2 | 3 | 3 | 2 | 3 | 1 | 3 | 3 | **26** | PASS |
| 14 | Command palette (Cmd+K) | 3 | 3 | 3 | 3 | 3 | 3 | 2 | 3 | 1 | 2 | **26** | PASS |
| 11 | Required field asterisks + validation | 3 | 3 | 3 | 2 | 2 | 3 | 2 | 1 | 3 | 3 | **25** | PASS |
| 10 | Conflict count badge in calendar | 3 | 3 | 3 | 3 | 2 | 2 | 2 | 2 | 2 | 3 | **25** | PASS |
| 1 | Keyboard focus ring on event chips | 3 | 2 | 2 | 2 | 2 | 3 | 3 | 1 | 3 | 3 | **24** | PASS |
| 4 | Calendar density toggle | 3 | 3 | 2 | 3 | 3 | 2 | 2 | 2 | 1 | 2 | **23** | PASS |
| 2 | "No conflicts" empty state | 2 | 2 | 3 | 1 | 2 | 2 | 3 | 1 | 3 | 3 | **22** | PASS |
| 9 | Empty state Staff Manager | 2 | 2 | 2 | 1 | 2 | 2 | 3 | 1 | 3 | 3 | **21** | PASS |
| 3 | Activity breadcrumb in EventFormV2 | 2 | 2 | 3 | 2 | 2 | 1 | 2 | 2 | 2 | 3 | **21** | PASS |
| 5 | Conflict snooze/skip | 2 | 2 | 2 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | **14** | PASS (low Rel — risky) |
| 7 | Onboarding animation | 2 | 1 | 2 | 1 | 2 | 1 | 3 | 1 | 3 | 3 | 19 | **FAIL** (use=1) |
| 8 | "Guide me" step titles | 1 | 1 | 2 | 1 | 1 | 1 | 3 | 0 | 3 | 3 | 16 | **FAIL** (af=1, use=1) |
| 15 | Soft tour dismiss with undo | 1 | 1 | 2 | 1 | 1 | 1 | 2 | 1 | 2 | 3 | 15 | **FAIL** |

12 PASS. Plenty for Phase 6 wave selection.

## File ownership map (top 8 PASS)

| # | Files | Disjoint group |
|---|---|---|
| 14 | App.tsx, **NEW** components/CommandPalette.tsx | A |
| 6 | components/CalendarView.tsx | B |
| 13 | components/StaffMemberManager.tsx, components/RoomManager.tsx | C |
| 12 | components/ActivityManager.tsx | D |
| 10 | components/CalendarView.tsx | conflicts with B |
| 11 | components/EventFormV2.tsx | E |
| 1 | components/CalendarView.tsx | conflicts with B |
| 4 | components/CalendarView.tsx | conflicts with B |
| 2 | components/AdminInbox.tsx | F |

**Top wave_size=4 with disjoint files:** 14 (A), 6 (B), 13 (C), 12 (D).
**Alternative bolder mix:** 14 (A), CalendarView coherent overhaul combining 6+10+1 (B), 13 (C), 12 (D).
