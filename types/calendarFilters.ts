import type { EventStatus, ActivityTypeV2, ActivityTemplate, AssignmentType, StaffRole } from './v2';

// Re-export so consumers don't need to import from two files.
export type { EventStatus, ActivityTypeV2, ActivityTemplate, AssignmentType, StaffRole };

export type CalendarSidebarTab = 'FILTERS' | 'POWER_TOOLS' | 'GANTT' | 'BOT';

// Canonical allowlists used to validate state coming from URL or localStorage.
export const EVENT_STATUSES: readonly EventStatus[] = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'ARCHIVED'];
export const ACTIVITY_TYPES: readonly ActivityTypeV2[] = ['ACADEMIC', 'ADMINISTRATIVE', 'PERFORMANCES', 'SPECIAL_EVENTS'];
export const ACTIVITY_TEMPLATES: readonly ActivityTemplate[] = ['DISCIPLINE', 'PROGRAM', 'ENSEMBLE', 'EXTERNAL', 'ADMINISTRATIVE'];
export const ASSIGNMENT_TYPES: readonly AssignmentType[] = ['TEACHING', 'ORG_ROLE'];
export const STAFF_ROLES: readonly StaffRole[] = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];

const DEFAULT_STATUS_SET = new Set<EventStatus>(['SCHEDULED', 'COMPLETED']);

/** Returns true when the status array matches the default (SCHEDULED + COMPLETED). */
export function isStatusDefault(status: EventStatus[]): boolean {
  if (status.length !== DEFAULT_STATUS_SET.size) return false;
  return status.every(s => DEFAULT_STATUS_SET.has(s));
}

export interface CalendarFilterState {
  search: string;
  status: EventStatus[];
  recurrence: 'ALL' | 'RECURRING' | 'ONE_OFF';
  activityType: ActivityTypeV2[];
  template: ActivityTemplate[];
  activityId: string[];
  l1Id: string[];
  l2Id: string[];
  staffMemberId: string[];
  assignmentType: AssignmentType[];
  staffRole: StaffRole[];
  studentId: string[];
  studentTag: string[];
  eventTag: string[];
  location: string[];
  hasRoomConflict: boolean;
  hasValidationError: boolean;
}

export const DEFAULT_FILTER_STATE: CalendarFilterState = {
  search: '',
  status: ['SCHEDULED', 'COMPLETED'],
  recurrence: 'ALL',
  activityType: [],
  template: [],
  activityId: [],
  l1Id: [],
  l2Id: [],
  staffMemberId: [],
  assignmentType: [],
  staffRole: [],
  studentId: [],
  studentTag: [],
  eventTag: [],
  location: [],
  hasRoomConflict: false,
  hasValidationError: false,
};

/** Returns true if state differs from defaults in any dimension. */
export function isFilterActive(state: CalendarFilterState): boolean {
  return (
    !isStatusDefault(state.status) ||
    state.search !== '' ||
    state.recurrence !== 'ALL' ||
    state.activityType.length > 0 ||
    state.template.length > 0 ||
    state.activityId.length > 0 ||
    state.l1Id.length > 0 ||
    state.l2Id.length > 0 ||
    state.staffMemberId.length > 0 ||
    state.assignmentType.length > 0 ||
    state.staffRole.length > 0 ||
    state.studentId.length > 0 ||
    state.studentTag.length > 0 ||
    state.eventTag.length > 0 ||
    state.location.length > 0 ||
    state.hasRoomConflict ||
    state.hasValidationError
  );
}
