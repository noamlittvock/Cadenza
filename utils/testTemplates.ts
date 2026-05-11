/**
 * testTemplates.ts — One-click QA test scenarios for DevTools.
 *
 * Each template wipes existing data, generates a focused dataset for a
 * specific view, optionally activates date/role simulation, and navigates
 * directly to the target view — eliminating multi-step manual setup.
 */

import { ViewState } from '../types';
import type { CalendarSidebarTab } from '../types/calendarFilters';
import { SimulatedRole, ROLE_PRESETS } from '../context/DevSimulationContext';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DataModule =
  | 'teachers'
  | 'events'
  | 'events_with_conflicts'
  | 'rooms'
  | 'activities'
  | 'students'
  | 'ganttBlocks'
  | 'hoursReports'
  | 'adminInboxItems'
  | 'subscriptions';

export interface TestTemplate {
  id: string;
  label: string;
  description: string;
  targetView: ViewState;
  /** Sidebar tab to open after navigating to targetView (only meaningful when targetView === 'CALENDAR') */
  sidebarTab?: CalendarSidebarTab;
  modules: DataModule[];
  /** Simulated date offset in days from today (positive = future) */
  dateOffset?: number;
  /** Scenario date jump instead of offset */
  dateScenario?: 'month-end' | 'quarter-end' | 'new-year' | 'sept-1';
  /** Role preset label to activate (matches ROLE_PRESETS[].label) */
  rolePreset?: string;
  /** Color for the template card */
  color: 'blue' | 'green' | 'violet' | 'amber' | 'rose' | 'teal' | 'indigo' | 'slate';
}

// ─── Template Definitions ───────────────────────────────────────────────────────

export const TEST_TEMPLATES: TestTemplate[] = [
  {
    id: 'calendar-happy-path',
    label: 'Calendar Happy Path',
    description: 'Events spread across ±90 days with teachers and activities. Good for testing calendar navigation, event cards, and basic scheduling.',
    targetView: 'CALENDAR',
    modules: ['teachers', 'rooms', 'activities', 'events'],
    color: 'blue',
  },
  {
    id: 'room-conflicts',
    label: 'Room Conflicts',
    description: 'Generates deliberate double-bookings in rooms to test conflict detection, inbox alerts, and the conflict highlight UI.',
    targetView: 'CALENDAR',
    modules: ['teachers', 'rooms', 'activities', 'events_with_conflicts'],
    color: 'rose',
  },
  {
    id: 'staff-manager',
    label: 'Staff Manager',
    description: '25 staff members with assignments across activities, including one archived. Tests staff list, filtering, and archiving.',
    targetView: 'STAFF_MEMBERS',
    modules: ['teachers', 'activities'],
    color: 'indigo',
  },
  {
    id: 'admin-inbox',
    label: 'Admin Inbox',
    description: 'Pre-seeded inbox items including room conflicts, expiring assignments, and enrollment issues. Tests notification grouping and resolution flow.',
    targetView: 'ADMIN_INBOX',
    modules: ['teachers', 'activities', 'students', 'adminInboxItems'],
    color: 'amber',
  },
  {
    id: 'gantt-view',
    label: 'Gantt View',
    description: '15 Gantt blocks (12 assignments + 3 blackout) overlaid on a full event calendar. Tests Gantt rendering, drag handles, and conflict visualization.',
    targetView: 'CALENDAR',
    sidebarTab: 'GANTT',
    modules: ['teachers', 'rooms', 'activities', 'events', 'ganttBlocks'],
    color: 'violet',
  },
  {
    id: 'first-admin-onboarding',
    label: 'First Admin Onboarding',
    description: 'Empty data slate with the First Admin Pre-Gate role simulation active. Tests the onboarding checklist, setup gate, and empty-state UX.',
    targetView: 'CALENDAR',
    modules: [],
    rolePreset: 'First Admin \u2014 Pre-Gate',
    color: 'slate',
  },
  {
    id: 'full-stress-test',
    label: 'Full Stress Test',
    description: '25 teachers · 7 activities · ~300 events (recurring, conflicts, blackouts) · 12 students · 15 Gantt blocks · inbox. Maximum coverage across all views.',
    targetView: 'CALENDAR',
    modules: ['teachers', 'rooms', 'activities', 'events', 'students', 'ganttBlocks', 'hoursReports', 'adminInboxItems', 'subscriptions'],
    color: 'green',
  },
];

// ─── QA Scenarios ───────────────────────────────────────────────────────────────

export interface ScenarioStep {
  id: string;
  label: string;
  targetView: ViewState;
  hint?: string;
}

export interface QAScenario {
  id: string;
  label: string;
  description: string;
  /** Template to auto-load when this scenario is activated */
  templateId: string;
  steps: ScenarioStep[];
  color: 'blue' | 'green' | 'violet' | 'amber' | 'teal';
}

export const QA_SCENARIOS: QAScenario[] = [
  {
    id: 'staff-cascade',
    label: 'Staff Assignment Cascade',
    description: 'Confirm that adding a teacher to an activity makes them appear in the event staff picker.',
    templateId: 'staff-manager',
    color: 'blue',
    steps: [
      {
        id: 'sc-1',
        label: 'Teacher has teaching assignment',
        targetView: 'STAFF_MEMBERS',
        hint: 'Open Staff Hub → click any teacher → Teaching Assignments should list at least one activity.',
      },
      {
        id: 'sc-2',
        label: 'Activity exists in Manage Hub',
        targetView: 'MANAGE',
        hint: 'Open Manage → Activities. The activity the teacher is assigned to should appear here.',
      },
      {
        id: 'sc-3',
        label: 'Calendar events exist for the activity',
        targetView: 'CALENDAR',
        hint: 'Open Calendar. At least one event should be visible linked to the activity.',
      },
      {
        id: 'sc-4',
        label: 'Staff picker filters by activity',
        targetView: 'CALENDAR',
        hint: 'Open any event on Calendar → Edit → Staff picker. Only teachers assigned to that activity should appear.',
      },
    ],
  },
];

// ─── Data Generation ────────────────────────────────────────────────────────────

import {
  generateDevTeachers,
  generateDevRooms,
  generateDevActivities,
  generateDevCalendar,
  generateDevStudents,
  generateDevGantts,
  generateDevInbox,
  generateDevHoursReports,
  generateDevSubscriptions,
  applyBlackoutHiding,
  linkTeachersToActivities,
} from './devDataGenerator';

import {
  Teacher, CalendarEvent, Room, Student, GanttBlock,
  AdminInboxItem, HoursReport, CalendarSubscription,
} from '../types';
import type { ActivityV2 } from '../types/v2';

export interface TemplateData {
  teachers: Teacher[];
  events: CalendarEvent[];
  rooms: Room[];
  activities: ActivityV2[];
  students: Student[];
  ganttBlocks: GanttBlock[];
  hoursReports: HoursReport[];
  adminInboxItems: AdminInboxItem[];
  subscriptions: CalendarSubscription[];
}

export function generateTemplateData(
  template: TestTemplate,
  currencySymbol: string,
  referenceDate?: Date,
): TemplateData {
  const mods = new Set(template.modules);

  const teachers = mods.has('teachers') ? generateDevTeachers(currencySymbol) : [];
  const rooms = mods.has('rooms') ? generateDevRooms() : [];
  const activities = mods.has('activities') ? generateDevActivities() : [];

  // Link teachers → activities so teachingAssignments[] are populated before students/events use them
  if (teachers.length > 0 && activities.length > 0) {
    linkTeachersToActivities(teachers, activities);
  }

  // events_with_conflicts uses the same generator (it already embeds 12 conflict pairs)
  let events: CalendarEvent[] =
    mods.has('events') || mods.has('events_with_conflicts')
      ? generateDevCalendar(teachers, rooms, currencySymbol, referenceDate)
      : [];

  const students = mods.has('students') ? generateDevStudents(teachers, activities) : [];
  const ganttBlocks = mods.has('ganttBlocks') ? generateDevGantts(teachers, referenceDate) : [];

  // Mark events that fall within blackout Gantt blocks as hidden
  if (events.length > 0 && ganttBlocks.length > 0) {
    events = applyBlackoutHiding(events, ganttBlocks);
  }

  const hoursReports = mods.has('hoursReports') ? generateDevHoursReports(teachers) : [];
  const adminInboxItems = mods.has('adminInboxItems') ? generateDevInbox(teachers, students) : [];
  const subscriptions = mods.has('subscriptions') ? generateDevSubscriptions() : [];

  return {
    teachers, events, rooms, activities, students,
    ganttBlocks, hoursReports, adminInboxItems, subscriptions,
  };
}

/** Resolve a date from a template's dateScenario or dateOffset. Returns undefined if neither is set. */
export function resolveTemplateDate(template: TestTemplate): Date | undefined {
  const now = new Date();

  if (template.dateScenario) {
    switch (template.dateScenario) {
      case 'month-end':
        return new Date(now.getFullYear(), now.getMonth() + 1, 0);
      case 'quarter-end': {
        const q = Math.floor(now.getMonth() / 3);
        return new Date(now.getFullYear(), (q + 1) * 3, 0);
      }
      case 'new-year':
        return new Date(now.getFullYear() + 1, 0, 1);
      case 'sept-1': {
        const year = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
        return new Date(year, 8, 1);
      }
    }
  }

  if (template.dateOffset !== undefined) {
    const d = new Date(now);
    d.setDate(d.getDate() + template.dateOffset);
    return d;
  }

  return undefined;
}

/** Resolve a SimulatedRole from a template's rolePreset label. */
export function resolveTemplateRole(template: TestTemplate): SimulatedRole | undefined {
  if (!template.rolePreset) return undefined;
  return ROLE_PRESETS.find(p => p.label === template.rolePreset);
}
