import type { AdminInboxItem, CalendarEvent } from '../types';
import type {
  Scenario,
  ScenarioBaseData,
  ScenarioDelta,
  ScenarioDiffItem,
  ScenarioDriftItem,
  ScenarioEventMeta,
  ScenarioEventSet,
  ScenarioFinanceImpactBucket,
  ScenarioFinanceImpactSummary,
  ScenarioLens,
  ScenarioSnapshot,
  ScenarioStaffAssignmentDiff,
} from '../types/scenario';
import { detectRoomConflicts } from './roomConflicts';

const EVENT_HASH_FIELDS: Array<keyof CalendarEvent> = [
  'name',
  'description',
  'start',
  'end',
  'roomId',
  'activityId',
  'staffMemberIds',
  'teacherId',
  'isCanceled',
  'isHidden',
  'tags',
];

const cloneEvent = (event: CalendarEvent): CalendarEvent => ({ ...event });
const cloneDelta = (delta: ScenarioDelta): ScenarioDelta => ({
  ...delta,
  patch: delta.patch ? { ...delta.patch } : undefined,
});

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const startOfDayTime = (date: string): number => new Date(`${date}T00:00:00`).getTime();
const endOfDayTime = (date: string): number => new Date(`${date}T23:59:59.999`).getTime();

const isEventInDateRange = (event: CalendarEvent, lens: ScenarioLens): boolean => {
  const eventStart = new Date(event.start).getTime();
  const eventEnd = new Date(event.end).getTime();
  return eventEnd >= startOfDayTime(lens.dateRange.start) && eventStart <= endOfDayTime(lens.dateRange.end);
};

const matchesEventFilters = (event: CalendarEvent, lens: ScenarioLens): boolean => {
  if (!isEventInDateRange(event, lens)) return false;
  if (lens.includedRoomIds.length > 0 && (!event.roomId || !lens.includedRoomIds.includes(event.roomId))) return false;
  if (lens.includedActivityIds.length > 0 && (!event.activityId || !lens.includedActivityIds.includes(event.activityId))) return false;
  if (lens.includedStaffIds.length > 0) {
    const eventStaffIds = new Set([event.teacherId, ...(event.staffMemberIds || [])].filter(Boolean) as string[]);
    if (!lens.includedStaffIds.some(staffId => eventStaffIds.has(staffId))) return false;
  }
  if (lens.includedEventTags.length > 0) {
    const eventTags = new Set((event.tags || []).map(tag => tag.toLowerCase()));
    if (!lens.includedEventTags.some(tag => eventTags.has(tag.toLowerCase()))) return false;
  }
  return true;
};

const normalizeIds = (ids: readonly string[] | undefined): string[] => [...new Set(ids || [])].filter(Boolean).sort();
const eventHours = (event: CalendarEvent | undefined): number => {
  if (!event) return 0;
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round(((end - start) / (60 * 60 * 1000)) * 100) / 100;
};

const addBucket = (
  buckets: Map<string, ScenarioFinanceImpactBucket>,
  id: string | undefined,
  name: string,
  hoursDelta: number,
) => {
  const key = id || 'unassigned';
  const existing = buckets.get(key) || { id: key, name, eventCount: 0, estimatedHoursDelta: 0 };
  existing.eventCount += 1;
  existing.estimatedHoursDelta = Math.round((existing.estimatedHoursDelta + hoursDelta) * 100) / 100;
  buckets.set(key, existing);
};

const hasDeltaMovedIntoLens = (event: CalendarEvent | undefined, delta: ScenarioDelta, lens: ScenarioLens): boolean => {
  if (!event || !delta.patch) return false;
  return matchesEventFilters({ ...event, ...delta.patch }, lens);
};

export const hashScenarioEventSource = (event: CalendarEvent | undefined): string => {
  if (!event) return 'missing';
  const picked: Record<string, unknown> = {};
  EVENT_HASH_FIELDS.forEach(field => {
    picked[field] = event[field];
  });
  return stableStringify(picked);
};

export function buildScenarioSnapshot(
  scenario: Scenario,
  base: ScenarioBaseData,
  deltas: ScenarioDelta[],
  builtAt = new Date().toISOString(),
): ScenarioSnapshot {
  return {
    scenario,
    base: {
      ...base,
      events: base.events.map(cloneEvent),
      rooms: base.rooms.map(room => ({ ...room })),
      activities: base.activities?.map(activity => ({ ...activity })),
      staff: base.staff?.map(staff => ({ ...staff })),
    },
    deltas: deltas.filter(delta => delta.scenarioId === scenario.id).map(cloneDelta),
    builtAt,
  };
}

export function buildSandboxEventSet(base: ScenarioBaseData, scenario: Scenario, deltas: ScenarioDelta[]): ScenarioEventSet {
  const scenarioDeltas = deltas.filter(delta => delta.scenarioId === scenario.id && delta.collection === 'events');
  const latestDeltaByRecordId = new Map<string, ScenarioDelta>();
  scenarioDeltas.forEach(delta => {
    const existing = latestDeltaByRecordId.get(delta.recordId);
    if (!existing || existing.updatedAt <= delta.updatedAt) latestDeltaByRecordId.set(delta.recordId, delta);
  });

  const baseById = new Map(base.events.map(event => [event.id, event]));
  const includedBaseEvents = scenario.lens.startMode === 'BLANK_SLATE'
    ? []
    : base.events.filter(event => matchesEventFilters(event, scenario.lens));

  const hiddenBaseEventIds: string[] = [];
  const lockedContextEventIds: string[] = [];
  if (scenario.lens.startMode !== 'BLANK_SLATE') {
    base.events.forEach(event => {
      if (matchesEventFilters(event, scenario.lens)) return;
      if (!isEventInDateRange(event, scenario.lens)) return;
      if (scenario.lens.excludedRecordsBehavior === 'HIDDEN') hiddenBaseEventIds.push(event.id);
      if (scenario.lens.excludedRecordsBehavior === 'LOCKED_CONTEXT') lockedContextEventIds.push(event.id);
    });
  }

  const outputById = new Map<string, CalendarEvent>();
  const metadataByEventId: Record<string, ScenarioEventMeta> = {};

  includedBaseEvents.forEach(event => {
    const copy = cloneEvent(event);
    outputById.set(copy.id, copy);
    metadataByEventId[copy.id] = {
      event: copy,
      changed: false,
      deleted: false,
      lockedContext: false,
      source: 'base',
    };
  });

  if (scenario.lens.excludedRecordsBehavior === 'LOCKED_CONTEXT' && scenario.lens.startMode !== 'BLANK_SLATE') {
    lockedContextEventIds.forEach(eventId => {
      const source = baseById.get(eventId);
      if (!source) return;
      const copy = cloneEvent(source);
      outputById.set(copy.id, copy);
      metadataByEventId[copy.id] = {
        event: copy,
        changed: false,
        deleted: false,
        lockedContext: true,
        source: 'base',
      };
    });
  }

  latestDeltaByRecordId.forEach(delta => {
    const baseEvent = baseById.get(delta.recordId);
    if (delta.operation === 'create') {
      if (!delta.patch) return;
      const created = { ...(delta.patch as CalendarEvent), id: delta.recordId };
      if (!matchesEventFilters(created, scenario.lens)) return;
      outputById.set(delta.recordId, created);
      metadataByEventId[delta.recordId] = {
        event: created,
        changed: true,
        deleted: false,
        lockedContext: false,
        source: 'delta',
        delta,
      };
      return;
    }

    if (!baseEvent && delta.operation !== 'delete') return;
    if (delta.operation === 'delete') {
      outputById.delete(delta.recordId);
      metadataByEventId[delta.recordId] = {
        event: baseEvent ? cloneEvent(baseEvent) : ({ id: delta.recordId } as CalendarEvent),
        changed: true,
        deleted: true,
        lockedContext: false,
        source: 'delta',
        delta,
      };
      return;
    }

    if (!hasDeltaMovedIntoLens(baseEvent, delta, scenario.lens) && !outputById.has(delta.recordId)) return;
    const updated = { ...baseEvent!, ...delta.patch };
    outputById.set(delta.recordId, updated);
    metadataByEventId[delta.recordId] = {
      event: updated,
      changed: true,
      deleted: false,
      lockedContext: false,
      source: 'delta',
      delta,
    };
  });

  const events = Array.from(outputById.values())
    .filter(event => !metadataByEventId[event.id]?.deleted)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return { events, metadataByEventId, hiddenBaseEventIds, lockedContextEventIds };
}

export function applyScenarioDeltas(base: ScenarioBaseData, scenario: Scenario, deltas: ScenarioDelta[]): ScenarioBaseData {
  const eventSet = buildSandboxEventSet(base, scenario, deltas);
  return {
    ...base,
    events: eventSet.events.map(cloneEvent),
    rooms: base.rooms.map(room => ({ ...room })),
    activities: base.activities?.map(activity => ({ ...activity })),
    staff: base.staff?.map(staff => ({ ...staff })),
  };
}

export function computeScenarioDiff(base: ScenarioBaseData, scenario: Scenario, deltas: ScenarioDelta[]): ScenarioDiffItem[] {
  const baseById = new Map(base.events.map(event => [event.id, event]));
  return deltas
    .filter(delta => delta.scenarioId === scenario.id && delta.collection === 'events')
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .map(delta => {
      const before = baseById.get(delta.recordId);
      const after = delta.operation === 'delete'
        ? undefined
        : delta.operation === 'create'
          ? delta.patch ? { ...(delta.patch as CalendarEvent), id: delta.recordId } : undefined
          : before ? { ...before, ...delta.patch } : undefined;
      const changedFields = delta.operation === 'delete'
        ? ['deleted']
        : delta.operation === 'create'
          ? Object.keys(delta.patch || {})
        : Object.keys(delta.patch || {}).filter(key => JSON.stringify((before as any)?.[key]) !== JSON.stringify((after as any)?.[key]));
      return {
        id: delta.id,
        collection: delta.collection,
        recordId: delta.recordId,
        title: before?.name || after?.name || delta.recordId,
        changeType: delta.operation === 'create' ? 'created' : delta.operation === 'delete' ? 'deleted' : 'changed',
        before,
        after,
        changedFields,
      };
    });
}

export function computeScenarioDrift(base: ScenarioBaseData, scenario: Scenario, deltas: ScenarioDelta[]): ScenarioDriftItem[] {
  const baseById = new Map(base.events.map(event => [event.id, event]));
  const eventDrift = deltas
    .filter(delta => delta.scenarioId === scenario.id && delta.collection === 'events')
    .flatMap<ScenarioDriftItem>(delta => {
      if (delta.operation === 'create') return [];
      const current = baseById.get(delta.recordId);
      if (!current) {
        return [{
          id: `${delta.id}:missing`,
          collection: delta.collection,
          recordId: delta.recordId,
          title: delta.recordId,
          severity: 'missing' as const,
          message: 'This event was deleted from the real schedule.',
        }];
      }
      if (delta.baseHash && delta.baseHash !== hashScenarioEventSource(current)) {
        return [{
          id: `${delta.id}:changed`,
          collection: delta.collection,
          recordId: delta.recordId,
          title: current.name || delta.recordId,
          severity: 'changed' as const,
          message: 'This event changed in the real schedule after you edited it here.',
        }];
      }
      return [];
    });
  return [...eventDrift, ...computeScenarioStaffReferenceDrift(base, scenario, deltas)];
}

export function computeScenarioStaffReferenceDrift(base: ScenarioBaseData, scenario: Scenario, deltas: ScenarioDelta[]): ScenarioDriftItem[] {
  if (!base.staff) return [];
  const staffById = new Set((base.staff || []).map(staff => staff.id));
  const eventSet = buildSandboxEventSet(base, scenario, deltas);
  return eventSet.events.flatMap<ScenarioDriftItem>(event => {
    const missing = normalizeIds([event.teacherId, ...(event.staffMemberIds || [])].filter(Boolean) as string[])
      .filter(staffId => !staffById.has(staffId));
    return missing.map(staffId => ({
      id: `${event.id}:staff:${staffId}`,
      collection: 'events',
      recordId: event.id,
      title: event.name || event.id,
      severity: 'missing',
      message: `A staff member assigned here no longer exists.`,
    }));
  });
}

export function computeScenarioStaffAssignmentDiff(
  base: ScenarioBaseData,
  scenario: Scenario,
  deltas: ScenarioDelta[],
): ScenarioStaffAssignmentDiff[] {
  const baseById = new Map(base.events.map(event => [event.id, event]));
  const eventSet = buildSandboxEventSet(base, scenario, deltas);
  return eventSet.events
    .map(event => {
      const before = normalizeIds(baseById.get(event.id)?.staffMemberIds);
      const after = normalizeIds(event.staffMemberIds);
      const beforeSet = new Set(before);
      const afterSet = new Set(after);
      const addedStaffMemberIds = after.filter(id => !beforeSet.has(id));
      const removedStaffMemberIds = before.filter(id => !afterSet.has(id));
      return {
        eventId: event.id,
        eventName: event.name,
        beforeStaffMemberIds: before,
        afterStaffMemberIds: after,
        addedStaffMemberIds,
        removedStaffMemberIds,
        changed: addedStaffMemberIds.length > 0 || removedStaffMemberIds.length > 0,
      };
    })
    .filter(item => item.changed);
}

export function computeScenarioSummary(base: ScenarioBaseData, scenario: Scenario, deltas: ScenarioDelta[]) {
  const eventSet = buildSandboxEventSet(base, scenario, deltas);
  const diff = computeScenarioDiff(base, scenario, deltas);
  const drift = computeScenarioDrift(base, scenario, deltas);
  return {
    scenarioId: scenario.id,
    changedRecords: diff.length,
    conflictCount: detectRoomConflicts(eventSet.events).length,
    driftCount: drift.length,
    eventCount: eventSet.events.length,
  };
}

export function computeScenarioFinanceImpact(
  base: ScenarioBaseData,
  scenario: Scenario,
  deltas: ScenarioDelta[],
): ScenarioFinanceImpactSummary {
  const diff = computeScenarioDiff(base, scenario, deltas);
  const activityNames = new Map((base.activities || []).map(activity => [activity.id, activity.name]));
  const roomNames = new Map(base.rooms.map(room => [room.id, room.name]));
  const staffNames = new Map((base.staff || []).map(staff => [staff.id, staff.fullName]));
  const byActivity = new Map<string, ScenarioFinanceImpactBucket>();
  const byStaff = new Map<string, ScenarioFinanceImpactBucket>();
  const byRoom = new Map<string, ScenarioFinanceImpactBucket>();

  let estimatedScheduledHoursDelta = 0;
  let createdEventCount = 0;
  let deletedEventCount = 0;
  let staffAssignmentChangeCount = 0;

  diff.forEach(item => {
    const beforeHours = eventHours(item.before);
    const afterHours = eventHours(item.after);
    const hoursDelta = Math.round((afterHours - beforeHours) * 100) / 100;
    estimatedScheduledHoursDelta = Math.round((estimatedScheduledHoursDelta + hoursDelta) * 100) / 100;
    if (item.changeType === 'created') createdEventCount += 1;
    if (item.changeType === 'deleted') deletedEventCount += 1;
    if (item.changeType === 'changed' && item.changedFields.includes('staffMemberIds')) staffAssignmentChangeCount += 1;

    const reference = item.after || item.before;
    addBucket(byActivity, reference?.activityId, reference?.activityId ? activityNames.get(reference.activityId) || reference.activityId : 'No activity', hoursDelta);
    addBucket(byRoom, reference?.roomId, reference?.roomId ? roomNames.get(reference.roomId) || reference.roomId : 'Unassigned', hoursDelta);
    const staffIds = normalizeIds(reference?.staffMemberIds);
    if (staffIds.length === 0) {
      addBucket(byStaff, undefined, 'Unassigned', hoursDelta);
    } else {
      staffIds.forEach(staffId => addBucket(byStaff, staffId, staffNames.get(staffId) || staffId, hoursDelta));
    }
  });

  const sortBuckets = (items: Map<string, ScenarioFinanceImpactBucket>) => (
    Array.from(items.values()).sort((a, b) => Math.abs(b.estimatedHoursDelta) - Math.abs(a.estimatedHoursDelta) || b.eventCount - a.eventCount || a.name.localeCompare(b.name))
  );

  return {
    scenarioId: scenario.id,
    estimateOnly: true,
    changedEventCount: diff.length,
    createdEventCount,
    deletedEventCount,
    staffAssignmentChangeCount,
    estimatedScheduledHoursDelta,
    byActivity: sortBuckets(byActivity),
    byStaff: sortBuckets(byStaff),
    byRoom: sortBuckets(byRoom),
  };
}

export function buildScenarioPromoteRequest(params: {
  scenario: Scenario;
  base: ScenarioBaseData;
  deltas: ScenarioDelta[];
  requestedBy: string | null;
  requestedAt: string;
  orgId: string;
  idFactory: () => string;
}): AdminInboxItem {
  const summary = computeScenarioSummary(params.base, params.scenario, params.deltas);
  return {
    id: params.idFactory(),
    orgId: params.orgId,
    type: 'APPROVAL_REQUEST',
    status: 'OPEN',
    title: `Apply plan: ${params.scenario.name}`,
    message: `${summary.changedRecords} changes, ${summary.conflictCount} clashes, ${summary.driftCount} out-of-date items.`,
    relatedEntityType: 'SCENARIO_PROMOTE_REQUEST',
    relatedEntityIds: [params.scenario.id],
    requestedBy: params.requestedBy ?? undefined,
    createdAt: params.requestedAt,
    scenarioPromoteRequest: {
      scenarioId: params.scenario.id,
      scenarioName: params.scenario.name,
      diffSummary: {
        changedRecords: summary.changedRecords,
        conflictCount: summary.conflictCount,
        driftCount: summary.driftCount,
        eventCount: summary.eventCount,
      },
      requestedBy: params.requestedBy,
      requestedAt: params.requestedAt,
      status: 'pending',
    },
  };
}
