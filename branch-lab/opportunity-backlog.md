# Cadenza v3 UI/UX Opportunity Backlog

15 single-or-two-file improvements targeting 30-minute implementation windows.

---

### 1. Keyboard Focus States on Event Chips (CalendarView)
- Files: `components/CalendarView.tsx`
- Surface: Calendar week/day view
- Hypothesis: Keyboard-only users (admins with accessibility needs, or power users using Tab) can't see which event is focused. Dark text on dark backgrounds when focused hurt readability.
- Visible delta: Event chip gains visible focus ring (2px lacquer border + subtle glow) when focused via Tab; focus visible on detail popovers too.
- Risk: low — CSS-only polish, no state changes

---

### 2. "No Conflicts" Empty State for Admin Inbox (AdminInbox)
- Files: `components/AdminInbox.tsx`
- Surface: Admin Inbox view, when zero ROOM_CONFLICT notifications exist
- Hypothesis: Admins see blank space and don't know if it's loading, if conflicts are hidden, or if the system is working. A celebratory empty state + "Enable conflict detection" CTA clarifies intent.
- Visible delta: When no conflicts exist (after filtering), show hero icon (shield + checkmark) with copy "All clear! No room conflicts detected" + optional link to Settings to enable/disable conflict detection.
- Risk: low — straightforward conditional render with mocked i18n keys

---

### 3. Activity Selection Breadcrumb for EventFormV2 (EventFormV2)
- Files: `components/EventFormV2.tsx`
- Surface: Event creation/edit modal
- Hypothesis: Admins navigating Activity → L1 → L2 hierarchy lose context if the form is tall. A sticky breadcrumb at top (Activity > Strings > L2) clarifies where they are and lets them click back to re-pick.
- Visible delta: Horizontal pill/breadcrumb bar above Zone 1 showing current Activity + L1 + L2, with chevrons and click-to-edit. Sticky under modal header.
- Risk: med — requires state lift and layout rework (sticky positioning in modal)

---

### 4. Calendar View Mode Density Toggle (CalendarView)
- Files: `components/CalendarView.tsx`
- Surface: Calendar week view header
- Hypothesis: Dense weeks (300+ events per design.md stress test) can exceed 2px micro-grid legibility. A toggle between "normal" (30-min rows) and "dense" (15-min rows, stacked chips) lets admins dial density to fit their week's complexity.
- Visible delta: Header button near view mode picker (DAY/WEEK/MONTH): toggle to "Dense 15m" → row height shrinks, event chips stack vertically with scroll on overflow. Persists to localStorage.
- Risk: med — CSS grid row-height calculation + event overflow handling; no backend touch

---

### 5. Conflict Resolution "Skip This" Button (AdminInbox/ConflictResolutionPanel)
- Files: `components/ConflictResolutionPanel.tsx`, `components/AdminInbox.tsx`
- Surface: Conflict notification expand + resolution panel
- Hypothesis: Admins may want to defer a conflict (e.g., "let me check budget before rescheduling"). Currently only "Mark Done" (resolve). A "Snooze" or "Skip This" button re-hides it for 24h.
- Visible delta: Third button in conflict card footer: "Skip for now" → moves notification to "snoozed" state, reappears as toast + inbox item tomorrow or on next login.
- Risk: med — requires snooze timestamp logic in AdminInboxItem schema (one-line addition if schema allows)

---

### 6. Staff Filters on Calendar with Pill Display (CalendarView)
- Files: `components/CalendarView.tsx` (or extract sub-component)
- Surface: Calendar filter bar
- Hypothesis: Admins filter by multiple teachers but don't see a visual summary. Currently filters exist but active state is hidden in dropdowns. FilterPills component exists but isn't used on calendar.
- Visible delta: Under filter row, show active filters as lacquer accent pills (e.g. "Teacher: John Doe", "Room: Studio A"); click pill to remove; "Clear All" link.
- Risk: low — minimal state/re-render, integrates existing FilterPills component

---

### 7. Onboarding Checklist: Progress Celebration Micro-animation (OnboardingChecklist)
- Files: `components/OnboardingChecklist.tsx`
- Surface: Setup checklist, step transition + completion
- Hypothesis: Users finish step 1 and step 2 progresses from locked → available, but the visual feedback (opacity change) is subtle. A 240ms slide + fade animation (via --ease-cadenza) signals achievement and sustains momentum.
- Visible delta: When step unlocks, it slides in from left (RTL: right) with opacity 0→1, and the progress bar animates width smoothly.
- Risk: low — pure CSS keyframes + transition, no behavior change

---

### 8. Copy Improvement: "Guide Me" → Contextual Walkthrough Titles (GuideMeButton + EventFormV2)
- Files: `components/GuideMeButton.tsx`, `components/EventFormV2.tsx`
- Surface: Event form "Guide me" slide-out panel
- Hypothesis: GuideMeButton steps have generic titles ("Step 1", "Step 2"). Admins don't know what the walkthrough covers until they open. Use TRANSLATIONS keys for localized, specific titles ("Pick an activity", "Set time & room").
- Visible delta: GuideMeButton.steps now include step.title from TRANSLATIONS; step nav shows "Pick activity" instead of "Step 1".
- Risk: low — config-only change + i18n constants

---

### 9. Empty State for Staff Member Manager (StaffMemberManager)
- Files: `components/StaffMemberManager.tsx`
- Surface: Staff list, when zero staff exist
- Hypothesis: New org has no staff. Admins see blank list with no cue to add staff. Design system suggests hero icon + CTA copy.
- Visible delta: When list is empty, show illustration/icon (Users icon from lucide), copy "No staff members yet", button "Create your first staff member".
- Risk: low — conditional render + icon

---

### 10. Room Conflicts Indicator Badge on Calendar Header (CalendarView)
- Files: `components/CalendarView.tsx`
- Surface: Calendar view header/controls
- Hypothesis: Admin is viewing calendar but doesn't realize there are unresolved room conflicts. Conflict count is only visible if they navigate to Admin Inbox.
- Visible delta: Next to view mode buttons, show red badge: "Conflicts: 3" (with count). Click to navigate to Admin Inbox's conflict section, with auto-expand first conflict.
- Risk: med — requires conflict count memoization, navigation callback

---

### 11. Form Validation Highlight: Required Fields Mark (EventFormV2, ActivityManager create modals)
- Files: `components/EventFormV2.tsx`
- Surface: Event creation form, Activity creation modal
- Hypothesis: Some fields (Activity, Date, Start time) are required, but there's no visual mark. Admins fill form, hit Save, then see validation error for a field they thought was optional.
- Visible delta: Required fields get red asterisk (*) next to label (standard UX). Form shows error toast on submit if any required field empty, with field names listed.
- Risk: low — label rendering + validation error toast (minor behavior)

---

### 12. Activity Archive/Restore Confirmation Modal (ActivityManager)
- Files: `components/ActivityManager.tsx`
- Surface: Activity list archive action
- Hypothesis: Archiving an activity that has upcoming events is destructive (hides associated calendar entries from pickers). One-click archive is risky.
- Visible delta: Archive button triggers modal: "This activity has 12 upcoming events. They'll remain on the calendar but won't show in the activity picker. Archive anyway?" with cancel/archive buttons.
- Risk: low — conditional modal, event count lookup (memoized)

---

### 13. Sticky Table Headers on Dense Staff/Student/Room Lists (StaffMemberManager, RoomManager, ManageHub)
- Files: `components/StaffMemberManager.tsx`, `components/RoomManager.tsx`
- Surface: Staff list, Rooms list, any scrollable table
- Hypothesis: Admin scrolls down a list of 50+ rows. Column headers scroll off. They lose context on which column they're reading.
- Visible delta: Table header (thead or pill row) uses `position: sticky; top: 0; z-10` with background + subtle shadow; stays visible as user scrolls.
- Risk: low — CSS-only, no state

---

### 14. Command Palette Prototype (Layout.tsx or new CommandPalette.tsx)
- Files: `components/Layout.tsx` + new `components/CommandPalette.tsx`
- Surface: Global keyboard shortcut (Cmd+K / Ctrl+K)
- Hypothesis: Power admins navigate views via sidebar clicks. A keyboard command palette (Cmd+K) allows "Go to Calendar", "Create Event", "Open Admin Inbox", "Search Staff" without mouse, dramatically speeding recurring workflows.
- Visible delta: Cmd+K opens modal with input field + recent/quick actions list (CALENDAR, ADMIN_INBOX, MANAGE). Type to fuzzy-search. Arrow/Enter to navigate.
- Risk: high — requires new component, input logic, fuzzy search, route navigation. ~30–40 minutes for MVP (no search, just quick nav).

---

### 15. Onboarding Soft Tour Banner: Make Dismissible with Undo (App.tsx)
- Files: `components/ScenarioBanner.tsx` (or new ScenarioBanner.tsx for soft tour), `App.tsx`
- Surface: Soft tour banner shown to non-first admins on first login
- Hypothesis: Banner is static and takes up 44px height on every view until admin refreshes or dismisses. No undo if they accidentally close it.
- Visible delta: Dismiss button → toast with "Tour dismissed" + Undo link (restores banner). Toast auto-hides in 6s. Undo link re-enables banner without page reload.
- Risk: low — toast + localStorage toggle

---

## Summary Stats

- **Total items:** 15
- **Bold product moves (30%+):** Items 4 (density toggle), 14 (command palette) — both unlock new admin workflows
- **Highest impact, lowest risk:** Items 1, 2, 9, 13 (keyboard focus, empty states, sticky headers)
- **Architectural smells noted:**
  - CalendarView.tsx (2429 lines) is dense; consider extracting filter bar + header controls to sub-component
  - No global command router (route navigation scattered across navigation handlers); unified router would clean up Item 14
  - AdminInboxItem schema lacks snooze/defer state for Item 5
  - Some empty states are missing across CRUD surfaces (staff, rooms, activities all need one)
