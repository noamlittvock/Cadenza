import { describe, it, expect } from 'vitest';
import { detectRoomConflicts, getConflictingEventIds, RoomConflict } from './roomConflicts';
import { CalendarEvent } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeEvent = (
  id: string,
  roomId: string | undefined,
  start: string,
  end: string,
  opts: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id,
  name: `Event ${id}`,
  description: '',
  isHidden: false,
  start,
  end,
  isCanceled: false,
  roomId,
  ...opts,
} as CalendarEvent);

// ─── Room Conflict Detection ────────────────────────────────────────────────

describe('detectRoomConflicts', () => {
  it('detects overlap for two events in the same room', () => {
    const events = [
      makeEvent('e1', 'room1', '2026-03-15T10:00:00', '2026-03-15T11:00:00'),
      makeEvent('e2', 'room1', '2026-03-15T10:30:00', '2026-03-15T11:30:00'),
    ];
    const conflicts = detectRoomConflicts(events);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].roomId).toBe('room1');
    expect(conflicts[0].eventA.id).toBe('e1');
    expect(conflicts[0].eventB.id).toBe('e2');
  });

  it('no conflict for non-overlapping events in same room', () => {
    const events = [
      makeEvent('e1', 'room1', '2026-03-15T10:00:00', '2026-03-15T11:00:00'),
      makeEvent('e2', 'room1', '2026-03-15T11:00:00', '2026-03-15T12:00:00'),
    ];
    const conflicts = detectRoomConflicts(events);
    expect(conflicts).toHaveLength(0);
  });

  it('no conflict for overlapping events in different rooms', () => {
    const events = [
      makeEvent('e1', 'room1', '2026-03-15T10:00:00', '2026-03-15T11:00:00'),
      makeEvent('e2', 'room2', '2026-03-15T10:30:00', '2026-03-15T11:30:00'),
    ];
    const conflicts = detectRoomConflicts(events);
    expect(conflicts).toHaveLength(0);
  });

  it('ignores canceled events', () => {
    const events = [
      makeEvent('e1', 'room1', '2026-03-15T10:00:00', '2026-03-15T11:00:00'),
      makeEvent('e2', 'room1', '2026-03-15T10:30:00', '2026-03-15T11:30:00', { isCanceled: true }),
    ];
    const conflicts = detectRoomConflicts(events);
    expect(conflicts).toHaveLength(0);
  });

  it('ignores hidden events', () => {
    const events = [
      makeEvent('e1', 'room1', '2026-03-15T10:00:00', '2026-03-15T11:00:00'),
      makeEvent('e2', 'room1', '2026-03-15T10:30:00', '2026-03-15T11:30:00', { isHidden: true }),
    ];
    const conflicts = detectRoomConflicts(events);
    expect(conflicts).toHaveLength(0);
  });

  it('ignores events with no roomId', () => {
    const events = [
      makeEvent('e1', undefined, '2026-03-15T10:00:00', '2026-03-15T11:00:00'),
      makeEvent('e2', undefined, '2026-03-15T10:30:00', '2026-03-15T11:30:00'),
    ];
    const conflicts = detectRoomConflicts(events);
    expect(conflicts).toHaveLength(0);
  });

  it('detects multiple conflicts in same room', () => {
    const events = [
      makeEvent('e1', 'room1', '2026-03-15T10:00:00', '2026-03-15T12:00:00'),
      makeEvent('e2', 'room1', '2026-03-15T10:30:00', '2026-03-15T11:30:00'),
      makeEvent('e3', 'room1', '2026-03-15T11:00:00', '2026-03-15T12:30:00'),
    ];
    const conflicts = detectRoomConflicts(events);
    // e1 overlaps with e2, e1 overlaps with e3, e2 overlaps with e3
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
  });

  it('detects conflicts across multiple rooms', () => {
    const events = [
      makeEvent('e1', 'room1', '2026-03-15T10:00:00', '2026-03-15T11:00:00'),
      makeEvent('e2', 'room1', '2026-03-15T10:30:00', '2026-03-15T11:30:00'),
      makeEvent('e3', 'room2', '2026-03-15T14:00:00', '2026-03-15T15:00:00'),
      makeEvent('e4', 'room2', '2026-03-15T14:30:00', '2026-03-15T15:30:00'),
    ];
    const conflicts = detectRoomConflicts(events);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map(c => c.roomId).sort()).toEqual(['room1', 'room2']);
  });

  it('returns empty for empty events', () => {
    expect(detectRoomConflicts([])).toEqual([]);
  });

  it('returns empty for single event in room', () => {
    const events = [
      makeEvent('e1', 'room1', '2026-03-15T10:00:00', '2026-03-15T11:00:00'),
    ];
    expect(detectRoomConflicts(events)).toEqual([]);
  });
});

// ─── getConflictingEventIds ─────────────────────────────────────────────────

describe('getConflictingEventIds', () => {
  it('extracts unique event IDs from conflicts', () => {
    const conflicts: RoomConflict[] = [
      {
        eventA: makeEvent('e1', 'room1', '', ''),
        eventB: makeEvent('e2', 'room1', '', ''),
        roomId: 'room1',
        overlapStart: new Date(),
        overlapEnd: new Date(),
      },
      {
        eventA: makeEvent('e1', 'room1', '', ''),
        eventB: makeEvent('e3', 'room1', '', ''),
        roomId: 'room1',
        overlapStart: new Date(),
        overlapEnd: new Date(),
      },
    ];
    const ids = getConflictingEventIds(conflicts);
    expect(ids.size).toBe(3);
    expect(ids.has('e1')).toBe(true);
    expect(ids.has('e2')).toBe(true);
    expect(ids.has('e3')).toBe(true);
  });

  it('returns empty set for no conflicts', () => {
    expect(getConflictingEventIds([])).toEqual(new Set());
  });
});
