import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Room } from '../types';
import type { Scenario, ScenarioDelta, ScenarioLens } from '../types/scenario';
import {
  applyScenarioDeltas,
  buildSandboxEventSet,
  buildScenarioPromoteRequest,
  computeScenarioDiff,
  computeScenarioDrift,
  computeScenarioFinanceImpact,
  computeScenarioStaffAssignmentDiff,
  computeScenarioStaffReferenceDrift,
  hashScenarioEventSource,
} from './scenarioEngine';

const rooms: Room[] = [
  { id: 'r1', name: 'Room 1', itinerary: '' },
  { id: 'r2', name: 'Room 2', itinerary: '' },
];

const event = (id: string, roomId: string, start: string, patch: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  name: `Event ${id}`,
  description: '',
  start,
  end: new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString(),
  roomId,
  activityId: 'a1',
  staffMemberIds: ['s1'],
  isCanceled: false,
  isHidden: false,
  tags: [],
  ...patch,
});

const lens = (patch: Partial<ScenarioLens> = {}): ScenarioLens => ({
  startMode: 'LIVE_SNAPSHOT',
  dateRange: { start: '2026-03-01', end: '2026-03-31' },
  includedRoomIds: [],
  includedActivityIds: [],
  includedStaffIds: [],
  includedEventTags: [],
  excludedRecordsBehavior: 'HIDDEN',
  editableCollections: ['calendarEvents', 'roomAssignments'],
  referenceOnlyCollections: ['rooms', 'activities', 'staff'],
  ...patch,
});

const scenario = (patch: Partial<Scenario> = {}): Scenario => ({
  id: 'sc1',
  name: 'March room plan',
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  baseSnapshotAt: '2026-02-01T00:00:00.000Z',
  lens: lens(),
  status: 'SAVED',
  ...patch,
});

const delta = (recordId: string, patch: Partial<CalendarEvent>, extra: Partial<ScenarioDelta> = {}): ScenarioDelta => ({
  id: `d-${recordId}`,
  scenarioId: 'sc1',
  collection: 'events',
  recordId,
  operation: 'patch',
  patch,
  createdAt: '2026-02-02T00:00:00.000Z',
  updatedAt: '2026-02-02T00:00:00.000Z',
  ...extra,
});

describe('scenarioEngine', () => {
  it('overlays event room/date/time deltas without mutating live base data', () => {
    const liveEvents = [
      event('e1', 'r1', '2026-03-10T10:00:00.000Z'),
      event('e2', 'r2', '2026-03-10T12:00:00.000Z'),
    ];
    const original = JSON.stringify(liveEvents);
    Object.freeze(liveEvents[0]);
    Object.freeze(liveEvents[1]);
    Object.freeze(liveEvents);

    const result = applyScenarioDeltas(
      { events: liveEvents, rooms },
      scenario(),
      [delta('e1', { roomId: 'r2', start: '2026-03-11T09:00:00.000Z', end: '2026-03-11T10:00:00.000Z' })],
    );

    expect(result.events.find(e => e.id === 'e1')?.roomId).toBe('r2');
    expect(result.events.find(e => e.id === 'e1')?.start).toBe('2026-03-11T09:00:00.000Z');
    expect(liveEvents[0].roomId).toBe('r1');
    expect(JSON.stringify(liveEvents)).toBe(original);
    expect(result.events[0]).not.toBe(liveEvents[0]);
  });

  it('loads a blank slate from deltas only', () => {
    const liveEvents = [event('e1', 'r1', '2026-03-10T10:00:00.000Z')];
    const sc = scenario({ lens: lens({ startMode: 'BLANK_SLATE' }) });
    const result = buildSandboxEventSet(
      { events: liveEvents, rooms },
      sc,
      [delta('e1', { roomId: 'r2' })],
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0].roomId).toBe('r2');
    expect(result.metadataByEventId.e1.changed).toBe(true);
  });

  it('shows sandbox-created events without mutating live events', () => {
    const liveEvents = [event('e1', 'r1', '2026-03-10T10:00:00.000Z')];
    const original = JSON.stringify(liveEvents);
    const created = event('sandbox-new', 'r2', '2026-03-12T09:00:00.000Z', { name: 'Sandbox new event' });
    const createDelta: ScenarioDelta = delta(created.id, created, {
      id: 'd-create',
      operation: 'create',
      patch: created,
    });

    const result = buildSandboxEventSet({ events: liveEvents, rooms }, scenario(), [createDelta]);

    expect(result.events.map(e => e.id)).toEqual(['e1', 'sandbox-new']);
    expect(result.metadataByEventId['sandbox-new']).toMatchObject({
      changed: true,
      deleted: false,
      source: 'delta',
    });
    expect(JSON.stringify(liveEvents)).toBe(original);
  });

  it('hides a deleted live event in sandbox only', () => {
    const liveEvents = [
      event('e1', 'r1', '2026-03-10T10:00:00.000Z'),
      event('e2', 'r2', '2026-03-10T12:00:00.000Z'),
    ];
    const original = JSON.stringify(liveEvents);
    const deleteDelta: ScenarioDelta = delta('e1', {}, {
      id: 'd-delete',
      operation: 'delete',
      patch: undefined,
      baseHash: hashScenarioEventSource(liveEvents[0]),
    });

    const result = buildSandboxEventSet({ events: liveEvents, rooms }, scenario(), [deleteDelta]);

    expect(result.events.map(e => e.id)).toEqual(['e2']);
    expect(result.metadataByEventId.e1).toMatchObject({
      changed: true,
      deleted: true,
      source: 'delta',
    });
    expect(JSON.stringify(liveEvents)).toBe(original);
  });

  it('can delete a sandbox-created event by removing its create delta without touching live', () => {
    const liveEvents = [event('e1', 'r1', '2026-03-10T10:00:00.000Z')];
    const original = JSON.stringify(liveEvents);
    const created = event('sandbox-new', 'r2', '2026-03-12T09:00:00.000Z');
    const withCreate = [delta(created.id, created, { id: 'd-create', operation: 'create', patch: created })];

    expect(buildSandboxEventSet({ events: liveEvents, rooms }, scenario(), withCreate).events.map(e => e.id))
      .toEqual(['e1', 'sandbox-new']);
    expect(buildSandboxEventSet({ events: liveEvents, rooms }, scenario(), []).events.map(e => e.id))
      .toEqual(['e1']);
    expect(JSON.stringify(liveEvents)).toBe(original);
  });

  it('reports created scenario events as created diffs and does not mark them as drift', () => {
    const created = event('sandbox-new', 'r2', '2026-03-12T09:00:00.000Z');
    const createDelta = delta(created.id, created, { id: 'd-create', operation: 'create', patch: created });

    const diff = computeScenarioDiff({ events: [], rooms }, scenario(), [createDelta]);
    const drift = computeScenarioDrift({ events: [], rooms }, scenario(), [createDelta]);

    expect(diff).toHaveLength(1);
    expect(diff[0].changeType).toBe('created');
    expect(diff[0].before).toBeUndefined();
    expect(diff[0].after?.id).toBe(created.id);
    expect(drift).toEqual([]);
  });

  it('applies date range and included room subset filters', () => {
    const liveEvents = [
      event('e1', 'r1', '2026-03-10T10:00:00.000Z'),
      event('e2', 'r2', '2026-03-10T10:00:00.000Z'),
      event('e3', 'r1', '2026-04-10T10:00:00.000Z'),
    ];
    const sc = scenario({ lens: lens({ includedRoomIds: ['r1'] }) });

    const result = buildSandboxEventSet({ events: liveEvents, rooms }, sc, []);

    expect(result.events.map(e => e.id)).toEqual(['e1']);
    expect(result.hiddenBaseEventIds).toEqual(['e2']);
  });

  it('computes field-level diff rows from deltas', () => {
    const liveEvents = [event('e1', 'r1', '2026-03-10T10:00:00.000Z')];

    const diff = computeScenarioDiff(
      { events: liveEvents, rooms },
      scenario(),
      [delta('e1', { roomId: 'r2', start: '2026-03-10T11:00:00.000Z' })],
    );

    expect(diff).toHaveLength(1);
    expect(diff[0].changedFields.sort()).toEqual(['roomId', 'start']);
    expect(diff[0].before?.roomId).toBe('r1');
    expect(diff[0].after?.roomId).toBe('r2');
  });

  it('detects drift for changed and missing live source records', () => {
    const base = event('e1', 'r1', '2026-03-10T10:00:00.000Z');
    const staleDelta = delta('e1', { roomId: 'r2' }, { baseHash: hashScenarioEventSource(base) });
    const missingDelta = delta('missing', { roomId: 'r2' }, { id: 'd-missing', recordId: 'missing', baseHash: 'old' });
    const changedLive = { ...base, start: '2026-03-10T11:00:00.000Z' };

    const drift = computeScenarioDrift(
      { events: [changedLive], rooms },
      scenario(),
      [staleDelta, missingDelta],
    );

    expect(drift.map(item => item.severity).sort()).toEqual(['changed', 'missing']);
  });

  it('filters events by included staff ids when configured', () => {
    const liveEvents = [
      event('e1', 'r1', '2026-03-10T10:00:00.000Z', { staffMemberIds: ['s1'] }),
      event('e2', 'r2', '2026-03-10T12:00:00.000Z', { staffMemberIds: ['s2'] }),
    ];

    const result = buildSandboxEventSet(
      { events: liveEvents, rooms },
      scenario({ lens: lens({ includedStaffIds: ['s2'] }) }),
      [],
    );

    expect(result.events.map(item => item.id)).toEqual(['e2']);
  });

  it('computes staff assignment diffs from scenario event patches', () => {
    const liveEvents = [event('e1', 'r1', '2026-03-10T10:00:00.000Z', { staffMemberIds: ['s1'] })];

    const staffDiff = computeScenarioStaffAssignmentDiff(
      { events: liveEvents, rooms },
      scenario(),
      [delta('e1', { staffMemberIds: ['s2', 's3'] })],
    );

    expect(staffDiff).toHaveLength(1);
    expect(staffDiff[0]).toMatchObject({
      eventId: 'e1',
      beforeStaffMemberIds: ['s1'],
      afterStaffMemberIds: ['s2', 's3'],
      addedStaffMemberIds: ['s2', 's3'],
      removedStaffMemberIds: ['s1'],
      changed: true,
    });
  });

  it('detects staff reference drift when sandbox events reference missing live staff', () => {
    const liveEvents = [event('e1', 'r1', '2026-03-10T10:00:00.000Z', { staffMemberIds: ['missing-staff'] })];

    const drift = computeScenarioStaffReferenceDrift(
      { events: liveEvents, rooms, staff: [] },
      scenario(),
      [],
    );

    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({
      recordId: 'e1',
      severity: 'missing',
      message: 'Referenced staff member missing-staff no longer exists.',
    });
  });

  it('computes reference-only finance impact from scenario event outputs', () => {
    const liveEvents = [
      event('e1', 'r1', '2026-03-10T10:00:00.000Z', { staffMemberIds: ['s1'] }),
      event('e2', 'r2', '2026-03-10T12:00:00.000Z', { staffMemberIds: ['s2'] }),
    ];
    const created = event('created', 'r1', '2026-03-11T09:00:00.000Z', { staffMemberIds: ['s1'] });
    const summary = computeScenarioFinanceImpact(
      {
        events: liveEvents,
        rooms,
        activities: [{ id: 'a1', name: 'Lessons' } as any],
        staff: [
          { id: 's1', fullName: 'Ada Staff' } as any,
          { id: 's2', fullName: 'Ben Staff' } as any,
        ],
      },
      scenario(),
      [
        delta('e1', { end: '2026-03-10T12:00:00.000Z', staffMemberIds: ['s1', 's2'] }),
        delta('e2', {}, { id: 'd-delete-e2', operation: 'delete', patch: undefined }),
        delta(created.id, created, { id: 'd-create', operation: 'create', patch: created }),
      ],
    );

    expect(summary.estimateOnly).toBe(true);
    expect(summary.changedEventCount).toBe(3);
    expect(summary.createdEventCount).toBe(1);
    expect(summary.deletedEventCount).toBe(1);
    expect(summary.staffAssignmentChangeCount).toBe(1);
    expect(summary.estimatedScheduledHoursDelta).toBe(1);
    expect(summary.byStaff.find(bucket => bucket.id === 's2')?.eventCount).toBe(2);
    expect(summary.byActivity[0]).toMatchObject({ id: 'a1', name: 'Lessons' });
  });

  it('builds a promote request record without applying scenario deltas to live collections', () => {
    const liveEvents = [event('e1', 'r1', '2026-03-10T10:00:00.000Z')];
    const original = JSON.stringify(liveEvents);
    const request = buildScenarioPromoteRequest({
      scenario: scenario({ name: 'Promote candidate' }),
      base: { events: liveEvents, rooms },
      deltas: [delta('e1', { roomId: 'r2' })],
      requestedBy: 'user-1',
      requestedAt: '2026-03-01T00:00:00.000Z',
      orgId: 'org-1',
      idFactory: () => 'inbox-1',
    });

    expect(request).toMatchObject({
      id: 'inbox-1',
      orgId: 'org-1',
      type: 'APPROVAL_REQUEST',
      status: 'OPEN',
      relatedEntityType: 'SCENARIO_PROMOTE_REQUEST',
      relatedEntityIds: ['sc1'],
      scenarioPromoteRequest: {
        scenarioId: 'sc1',
        scenarioName: 'Promote candidate',
        requestedBy: 'user-1',
        requestedAt: '2026-03-01T00:00:00.000Z',
        status: 'pending',
        diffSummary: {
          changedRecords: 1,
          conflictCount: 0,
          driftCount: 0,
          eventCount: 1,
        },
      },
    });
    expect(JSON.stringify(liveEvents)).toBe(original);
    expect(liveEvents[0].roomId).toBe('r1');
  });
});
