/**
 * testTemplates.ts — One-click QA test scenarios for DevTools.
 *
 * Each template wipes existing data, generates a focused dataset for a
 * specific view, optionally activates date/role simulation, and navigates
 * directly to the target view — eliminating multi-step manual setup.
 */

import { ViewState } from '../types';
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
  | 'savedCharts'
  | 'adminInboxItems'
  | 'subscriptions';

export interface TestTemplate {
  id: string;
  label: string;
  description: string;
  targetView: ViewState;
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
    id: 'financial-dashboard',
    label: 'Financial Dashboard',
    description: 'Rich dataset with hours reports and saved charts, simulated to month-end. Good for testing pay calculations, chart rendering, and export.',
    targetView: 'FINANCIAL',
    modules: ['teachers', 'rooms', 'activities', 'events', 'hoursReports', 'savedCharts'],
    dateScenario: 'month-end',
    color: 'green',
  },
  {
    id: 'student-manager',
    label: 'Student Manager',
    description: '12 students with full profiles (guardians, assignments, pedagogical records). Tests enrollment status, assignment date ranges, and document uploads.',
    targetView: 'STUDENTS',
    modules: ['teachers', 'activities', 'students'],
    color: 'teal',
  },
  {
    id: 'staff-manager',
    label: 'Staff Manager',
    description: '25 teachers across all rate types (HOURLY, GLOBAL_MONTHLY, PER_EVENT, ONE_OFF) including one archived teacher. Tests rate display, filtering, and archiving.',
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
    targetView: 'GANTT',
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
    description: '25 teachers · 7 activities · ~300 events (recurring, conflicts, blackouts) · 12 students · 15 Gantt blocks · inbox · charts. Maximum coverage across all views.',
    targetView: 'CALENDAR',
    modules: ['teachers', 'rooms', 'activities', 'events', 'students', 'ganttBlocks', 'hoursReports', 'savedCharts', 'adminInboxItems', 'subscriptions'],
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
    id: 'enrollment-chain',
    label: 'Full Enrollment Chain',
    description: 'Trace a student from activity creation → teacher assignment → enrollment → calendar event.',
    templateId: 'student-manager',
    color: 'teal',
    steps: [
      {
        id: 'ec-1',
        label: 'Activity exists in Manage Hub',
        targetView: 'MANAGE',
        hint: 'Open Manage → Activities tab. Confirm at least one activity is listed.',
      },
      {
        id: 'ec-2',
        label: 'Teacher is assigned to that activity',
        targetView: 'STAFF_MEMBERS',
        hint: 'Open Staff Hub → click any teacher → Teaching Assignments section should list the same activity.',
      },
      {
        id: 'ec-3',
        label: 'Student is enrolled in the activity',
        targetView: 'STUDENTS',
        hint: 'Open Student Hub → click any student → Assignments section should list the activity with a valid teacher name.',
      },
      {
        id: 'ec-4',
        label: 'Calendar shows events for that activity',
        targetView: 'CALENDAR',
        hint: 'Navigate to Calendar. Events should appear with matching activity label and teacher name.',
      },
    ],
  },
  {
    id: 'pay-calc-chain',
    label: 'Pay Calculation Chain',
    description: 'Verify that teacher rates flow through events into the financial dashboard and hours reports.',
    templateId: 'financial-dashboard',
    color: 'green',
    steps: [
      {
        id: 'pc-1',
        label: 'Teacher has a rate in Staff Hub',
        targetView: 'STAFF_MEMBERS',
        hint: 'Open Staff Hub → click a teacher → Position Assignments should show a rate type and value.',
      },
      {
        id: 'pc-2',
        label: 'Events reference that teacher',
        targetView: 'CALENDAR',
        hint: 'Open Calendar → click an event → Teacher field should match a staff hub name.',
      },
      {
        id: 'pc-3',
        label: 'Financial dashboard loads without error',
        targetView: 'FINANCIAL',
        hint: 'Open Financial Dashboard. The page should render charts and teacher rows, not a blank screen.',
      },
      {
        id: 'pc-4',
        label: 'Hours reports are present',
        targetView: 'FINANCIAL',
        hint: 'In Financial Dashboard → Hours Reports tab. Rows should be visible with hour counts.',
      },
    ],
  },
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
  {
    id: 'student-integrity',
    label: 'Student Record Integrity',
    description: 'Check that student profiles are complete with guardians, enrollments, and correct activity counts.',
    templateId: 'student-manager',
    color: 'amber',
    steps: [
      {
        id: 'si-1',
        label: 'Student list loads with names',
        targetView: 'STUDENTS',
        hint: 'Open Student Hub. All 12 students should be listed. One should show as Archived.',
      },
      {
        id: 'si-2',
        label: 'Minor student has guardian info',
        targetView: 'STUDENTS',
        hint: 'Click a minor student → Guardian section should show parent name and phone.',
      },
      {
        id: 'si-3',
        label: 'Enrollments list activities',
        targetView: 'STUDENTS',
        hint: 'In student detail → Assignments/Enrollments section should list activity name, teacher, and start date.',
      },
      {
        id: 'si-4',
        label: 'Enrollment count badge is correct',
        targetView: 'STUDENTS',
        hint: 'Back in the student list — each row\'s enrollment count badge should match the number of activities in their detail view.',
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
  generateDevCharts,
  generateDevSubscriptions,
  applyBlackoutHiding,
  linkTeachersToActivities,
} from './devDataGenerator';

import {
  Teacher, CalendarEvent, Room, Student, GanttBlock,
  AdminInboxItem, HoursReport, CalendarSubscription,
} from '../types';
import type { ActivityV2 } from '../types/v2';
import { ChartConfiguration } from '../types/chartBuilder';

export interface TemplateData {
  teachers: Teacher[];
  events: CalendarEvent[];
  rooms: Room[];
  activities: ActivityV2[];
  students: Student[];
  ganttBlocks: GanttBlock[];
  hoursReports: HoursReport[];
  savedCharts: ChartConfiguration[];
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
  const savedCharts = mods.has('savedCharts') ? generateDevCharts() : [];
  const adminInboxItems = mods.has('adminInboxItems') ? generateDevInbox(teachers, students) : [];
  const subscriptions = mods.has('subscriptions') ? generateDevSubscriptions() : [];

  return {
    teachers, events, rooms, activities, students,
    ganttBlocks, hoursReports, savedCharts, adminInboxItems, subscriptions,
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
