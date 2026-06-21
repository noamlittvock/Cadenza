import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Room } from '../types';
import type { Scenario, ScenarioDelta, ScenarioLens } from '../types/scenario';
import { buildSandboxEventSet } from './scenarioEngine';
import { detectRoomConflicts } from './roomConflicts';
import {
  buildMovedScenarioEvent,
  buildScenarioCalendarLayout,
  buildScenarioEventMoveDelta,
  getScenarioCalendarDays,
} from './scenarioCalendarAdapter';

const rooms: Room[] = [
  { id: 'r1', name: 'Room 1', itinerary: '' },
  { id: 'r2', name: 'Room 2', itinerary: '' },
];

const event = (id: string, roomId: string, start: string): CalendarEvent => ({
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
});

const lens = (): ScenarioLens => ({
  startMode: 'LIVE_SNAPSHOT',
  dateRange: { start: '2026-03-01', end: '2026-03-31' },
  includedRoomIds: [],
  includedActivityIds: [],
  includedStaffIds: [],
  includedEventTags: [],
  excludedRecordsBehavior: 'HIDDEN',
  editableCollections: ['calendarEvents', 'roomAssignments'],
  referenceOnlyCollections: ['rooms', 'activities', 'staff'],
});

const scenario: Scenario = {
  id: 'sc1',
  name: 'March plan',
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  baseSnapshotAt: '2026-02-01T00:00:00.000Z',
  lens: lens(),
  status: 'SAVED',
};

describe('scenarioCalendarAdapter', () => {
  it('positions events in a day/week grid by date, room, and time', () => {
    const days = getScenarioCalendarDays(new Date('2026-03-10T12:00:00'), 'WEEK');
    const layout = buildScenarioCalendarLayout(
      [event('e1', 'r1', '2026-03-10T09:00:00.000Z')],
      days,
      rooms,
    );

    expect(days).toHaveLength(7);
    expect(layout).toHaveLength(1);
    expect(layout[0]).toMatchObject({ dayKey: '2026-03-10', roomId: 'r1' });
    expect(layout[0].topPercent).toBeGreaterThanOrEqual(0);
    expect(layout[0].heightPercent).toBeGreaterThan(0);
  });

  it('creates a scenario move delta without mutating the base event', () => {
    const baseEvent = event('e1', 'r1', '2026-03-10T09:00:00.000Z');
    const original = JSON.stringify(baseEvent);

    const moveDelta = buildScenarioEventMoveDelta({
      scenarioId: scenario.id,
      event: baseEvent,
      baseEvent,
      move: { date: '2026-03-11', startTime: '10:30', endTime: '11:30', roomId: 'r2' },
      now: '2026-02-02T00:00:00.000Z',
      idFactory: () => 'd1',
    });

    expect(moveDelta).toMatchObject({
      id: 'd1',
      operation: 'patch',
      recordId: 'e1',
      patch: {
        roomId: 'r2',
      },
    });
    expect(moveDelta?.patch?.start).toContain('2026-03-11T');
    expect(JSON.stringify(baseEvent)).toBe(original);
  });

  it('updates sandbox conflict count after a move while live events remain unchanged', () => {
    const movedReference = buildMovedScenarioEvent(event('e1', 'r1', '2026-03-10T09:00:00.000Z'), {
      date: '2026-03-11',
      startTime: '10:30',
      endTime: '11:30',
      roomId: 'r2',
    });
    const liveEvents = [
      event('e1', 'r1', '2026-03-10T09:00:00.000Z'),
      { ...event('e2', 'r2', movedReference.start), end: movedReference.end },
    ];
    const original = JSON.stringify(liveEvents);
    expect(detectRoomConflicts(liveEvents)).toHaveLength(0);

    const moveDelta = buildScenarioEventMoveDelta({
      scenarioId: scenario.id,
      event: liveEvents[0],
      baseEvent: liveEvents[0],
      move: { date: '2026-03-11', startTime: '10:30', endTime: '11:30', roomId: 'r2' },
      now: '2026-02-02T00:00:00.000Z',
      idFactory: () => 'd1',
    }) as ScenarioDelta;
    const eventSet = buildSandboxEventSet({ events: liveEvents, rooms }, scenario, [moveDelta]);

    expect(detectRoomConflicts(eventSet.events)).toHaveLength(1);
    expect(JSON.stringify(liveEvents)).toBe(original);
  });

  it('preserves room when a move only changes time', () => {
    const source = event('e1', 'r1', '2026-03-10T09:00:00.000Z');

    const moved = buildMovedScenarioEvent(source, { startTime: '12:00', endTime: '13:00' });

    expect(moved.roomId).toBe('r1');
    expect(source.start).toBe('2026-03-10T09:00:00.000Z');
  });
});
