import type { CalendarEvent, Room } from '../types';
import type { ActivityV2, StaffMemberV2 } from './v2';

export type ScenarioStartMode = 'LIVE_SNAPSHOT' | 'BLANK_SLATE';
export type ScenarioExcludedRecordsBehavior = 'HIDDEN' | 'LOCKED_CONTEXT' | 'IGNORED';
export type ScenarioEditableCollection = 'calendarEvents' | 'roomAssignments';
export type ScenarioReferenceCollection = 'rooms' | 'activities' | 'staff';
export type ScenarioDeltaCollection = 'events';
export type ScenarioDeltaOperation = 'create' | 'patch' | 'delete';

export interface ScenarioDateRange {
  start: string;
  end: string;
}

export interface ScenarioLens {
  startMode: ScenarioStartMode;
  dateRange: ScenarioDateRange;
  includedRoomIds: string[];
  includedActivityIds: string[];
  includedStaffIds: string[];
  includedEventTags: string[];
  excludedRecordsBehavior: ScenarioExcludedRecordsBehavior;
  editableCollections: ScenarioEditableCollection[];
  referenceOnlyCollections: ScenarioReferenceCollection[];
}

export interface Scenario {
  id: string;
  orgId?: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  baseSnapshotAt: string;
  lens: ScenarioLens;
  status: 'DRAFT' | 'SAVED' | 'ARCHIVED';
}

export interface ScenarioDelta {
  id: string;
  scenarioId: string;
  collection: ScenarioDeltaCollection;
  recordId: string;
  operation: ScenarioDeltaOperation;
  patch?: Partial<CalendarEvent>;
  baseHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioBaseData {
  events: CalendarEvent[];
  rooms: Room[];
  activities?: ActivityV2[];
  staff?: StaffMemberV2[];
}

export interface ScenarioSnapshot {
  scenario: Scenario;
  base: ScenarioBaseData;
  deltas: ScenarioDelta[];
  builtAt: string;
}

export interface ScenarioEventMeta {
  event: CalendarEvent;
  changed: boolean;
  deleted: boolean;
  lockedContext: boolean;
  source: 'base' | 'delta';
  delta?: ScenarioDelta;
}

export interface ScenarioEventSet {
  events: CalendarEvent[];
  metadataByEventId: Record<string, ScenarioEventMeta>;
  hiddenBaseEventIds: string[];
  lockedContextEventIds: string[];
}

export interface ScenarioDiffItem {
  id: string;
  collection: ScenarioDeltaCollection;
  recordId: string;
  title: string;
  changeType: 'created' | 'changed' | 'deleted';
  before?: CalendarEvent;
  after?: CalendarEvent;
  changedFields: string[];
}

export interface ScenarioDriftItem {
  id: string;
  collection: ScenarioDeltaCollection;
  recordId: string;
  title: string;
  severity: 'missing' | 'changed';
  message: string;
}

export interface ScenarioStaffAssignmentDiff {
  eventId: string;
  eventName: string;
  beforeStaffMemberIds: string[];
  afterStaffMemberIds: string[];
  addedStaffMemberIds: string[];
  removedStaffMemberIds: string[];
  changed: boolean;
}

export interface ScenarioFinanceImpactBucket {
  id: string;
  name: string;
  eventCount: number;
  estimatedHoursDelta: number;
}

export interface ScenarioFinanceImpactSummary {
  scenarioId: string;
  estimateOnly: true;
  changedEventCount: number;
  createdEventCount: number;
  deletedEventCount: number;
  staffAssignmentChangeCount: number;
  estimatedScheduledHoursDelta: number;
  byActivity: ScenarioFinanceImpactBucket[];
  byStaff: ScenarioFinanceImpactBucket[];
  byRoom: ScenarioFinanceImpactBucket[];
}

export interface ScenarioSummary {
  scenarioId: string;
  changedRecords: number;
  conflictCount: number;
  driftCount: number;
  eventCount: number;
}
