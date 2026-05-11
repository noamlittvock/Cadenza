import { describe, it, expect } from 'vitest';
import { executeIntent, resolveWindow, type ExecuteContext } from './botExecute';
import { resolveIntent } from './botResolve';
import type { CalendarEvent, Teacher, Room, Student } from '../types';
import type { ActivityV2 } from '../types/v2';
import { Timestamp } from 'firebase/firestore';

// ─── Synthetic org ──────────────────────────────────────────────────────────
// Anchor everything at a fixed "now" so window math is deterministic.
// Tuesday, 2026-03-10 at 10:00 local time.
const NOW = new Date('2026-03-10T10:00:00');

const ts = Timestamp.fromDate(new Date('2026-01-01T00:00:00'));

const teachers: Teacher[] = [
  { id: 't1', fullName: 'David Levi',  positions: [], positionAssignments: [], tags: [], phone: '', email: '', color: '#fff' },
  { id: 't2', fullName: 'Sarah Cohen', positions: [], positionAssignments: [], tags: [], phone: '', email: '', color: '#fff' },
  { id: 't3', fullName: 'Yossi Ben',   positions: [], positionAssignments: [], tags: [], phone: '', email: '', color: '#fff' },
];

const rooms: Room[] = [
  { id: 'r1', name: 'Studio A', itinerary: '' },
  { id: 'r2', name: 'Studio B', itinerary: '' },
  { id: 'r3', name: 'Room C',   itinerary: '' },
];

const students: Student[] = [];

const activities: ActivityV2[] = [
  {
    id: 'a1', orgId: 'org1', name: 'Piano', template: 'DISCIPLINE', activityType: 'ACADEMIC',
    modules: { curriculum: false }, location: null, eventNameMode: 'AUTO', isArchived: false,
    createdAt: ts, updatedAt: ts,
  },
  {
    id: 'a2', orgId: 'org1', name: 'Violin', template: 'DISCIPLINE', activityType: 'ACADEMIC',
    modules: { curriculum: false }, location: null, eventNameMode: 'AUTO', isArchived: false,
    createdAt: ts, updatedAt: ts,
  },
];

const ev = (
  id: string, start: string, end: string, opts: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id, name: `Event ${id}`, description: '', start, end, isCanceled: false, isHidden: false, ...opts,
});

// David: Tue 10:00 (overlapping NOW), Wed 09:00, next Mon 10:00.
// Sarah: Tue 14:00 (later same day), Tue 11:00 (Studio B).
// Yossi: archived activity reference — verifies activity filter works.
const events: CalendarEvent[] = [
  ev('e1', '2026-03-10T10:00:00', '2026-03-10T11:00:00', { teacherId: 't1', roomId: 'r1', activityId: 'a1' }),
  ev('e2', '2026-03-10T11:00:00', '2026-03-10T12:00:00', { teacherId: 't2', roomId: 'r2', activityId: 'a1' }),
  ev('e3', '2026-03-10T11:30:00', '2026-03-10T12:30:00', { teacherId: 't3', roomId: 'r2', activityId: 'a1' }), // conflicts with e2
  ev('e4', '2026-03-10T14:00:00', '2026-03-10T15:00:00', { teacherId: 't2', roomId: 'r1', activityId: 'a2' }),
  ev('e5', '2026-03-11T09:00:00', '2026-03-11T10:00:00', { teacherId: 't1', roomId: 'r3', activityId: 'a1' }),
  ev('e6', '2026-03-16T10:00:00', '2026-03-16T11:00:00', { teacherId: 't1', roomId: 'r1', activityId: 'a1' }),
  ev('e7', '2026-03-10T08:00:00', '2026-03-10T09:00:00', { teacherId: 't1', roomId: 'r1', isCanceled: true }),
];

const ctx: ExecuteContext = { teachers, rooms, students, activities, events, now: NOW };
const resolveCtx = { teachers, rooms, students, activities };

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('resolveWindow', () => {
  it('defaults to today when no hint is provided', () => {
    const w = resolveWindow({ intent: 'list_for_day', entityRefs: {} }, NOW);
    // Compare in local tz — toISOString shifts to UTC and breaks for non-UTC test runners.
    expect(w.start.getFullYear()).toBe(2026);
    expect(w.start.getMonth()).toBe(2); // March
    expect(w.start.getDate()).toBe(10);
    expect(w.start.getHours()).toBe(0);
    expect(w.end.getDate()).toBe(10);
    expect(w.end.getHours()).toBe(23);
  });
  it('expands this_week to a 7-day Sunday-start window', () => {
    const w = resolveWindow(
      { intent: 'count_events', entityRefs: {}, timeRange: { relativeHint: 'this_week' } },
      NOW,
    );
    // Sunday 2026-03-08 → Saturday 2026-03-14
    expect(w.start.getDay()).toBe(0);
    expect(w.end.getDay()).toBe(6);
  });
});

describe('resolveIntent', () => {
  it('matches a teacher by first name', () => {
    const refs = resolveIntent({ intent: 'lookup_schedule', entityRefs: { teacherName: 'David' } }, resolveCtx);
    expect(refs.teacherId).toBe('t1');
  });
  it('flags unresolved when no candidate scores high enough', () => {
    const refs = resolveIntent({ intent: 'lookup_schedule', entityRefs: { teacherName: 'Zorglax' } }, resolveCtx);
    expect(refs.unresolved).toContain('teacher');
  });
  it('matches a room by exact name', () => {
    const refs = resolveIntent({ intent: 'who_is_where', entityRefs: { roomName: 'Studio A' } }, resolveCtx);
    expect(refs.roomId).toBe('r1');
  });
});

describe('executeIntent', () => {
  it('lookup_schedule returns David\'s Tuesday events', () => {
    const intent = {
      intent: 'lookup_schedule' as const,
      entityRefs: { teacherName: 'David' },
      filters: { dayOfWeek: [2] },
    };
    const refs = resolveIntent(intent, resolveCtx);
    const result = executeIntent(intent, refs, ctx);
    expect(result.kind).toBe('event_list');
    expect(result.events?.map(e => e.id)).toEqual(['e1']);
  });

  it('find_free_room flags Studio A as busy at 10:30 today', () => {
    const intent = {
      intent: 'find_free_room' as const,
      entityRefs: {},
      timeRange: { relativeHint: 'today' as const, timeOfDay: '10:30' },
    };
    const refs = resolveIntent(intent, resolveCtx);
    const result = executeIntent(intent, refs, ctx);
    const studioA = result.rooms?.find(r => r.roomId === 'r1');
    expect(studioA?.isFree).toBe(false);
    expect(studioA?.conflictingEventName).toBe('Event e1');
  });

  it('who_is_where returns David in Studio A at NOW', () => {
    const intent = { intent: 'who_is_where' as const, entityRefs: { roomName: 'Studio A' } };
    const refs = resolveIntent(intent, resolveCtx);
    const result = executeIntent(intent, refs, ctx);
    expect(result.kind).toBe('event_list');
    expect(result.events?.[0].id).toBe('e1');
  });

  it('count_events tallies David this week, ignoring next-week e6', () => {
    const intent = {
      intent: 'count_events' as const,
      entityRefs: { teacherName: 'David' },
      timeRange: { relativeHint: 'this_week' as const },
    };
    const refs = resolveIntent(intent, resolveCtx);
    const result = executeIntent(intent, refs, ctx);
    expect(result.kind).toBe('count');
    expect(result.count).toBe(2); // e1 (Tue), e5 (Wed); cancelled e7 + next-week e6 excluded
  });

  it('next_event returns David\'s next future event at NOW', () => {
    const intent = { intent: 'next_event' as const, entityRefs: { teacherName: 'David' } };
    const refs = resolveIntent(intent, resolveCtx);
    const result = executeIntent(intent, refs, ctx);
    // NOW is exactly e1.start, so e1 is "next" (>=).
    expect(result.kind).toBe('single_event');
    expect(result.events?.[0].id).toBe('e1');
  });

  it('who_teaches Piano lists upcoming teachers only', () => {
    const intent = { intent: 'who_teaches' as const, entityRefs: { activityName: 'Piano' } };
    const refs = resolveIntent(intent, resolveCtx);
    const result = executeIntent(intent, refs, ctx);
    expect(result.kind).toBe('people_list');
    const ids = result.people?.map(p => p.id).sort();
    expect(ids).toEqual(['t1', 't2', 't3']);
  });

  it('check_conflicts catches the Studio B double-booking', () => {
    const intent = {
      intent: 'check_conflicts' as const,
      entityRefs: { roomName: 'Studio B' },
      timeRange: { relativeHint: 'today' as const },
    };
    const refs = resolveIntent(intent, resolveCtx);
    const result = executeIntent(intent, refs, ctx);
    expect(result.kind).toBe('conflict_list');
    expect(result.conflicts?.length).toBeGreaterThan(0);
    expect(result.conflicts?.[0].roomName).toBe('Studio B');
  });

  it('unresolved teacher short-circuits with name_not_found', () => {
    const intent = { intent: 'lookup_schedule' as const, entityRefs: { teacherName: 'Zorglax' } };
    const refs = resolveIntent(intent, resolveCtx);
    const result = executeIntent(intent, refs, ctx);
    expect(result.kind).toBe('name_not_found');
    expect(result.missingEntity).toBe('teacher');
  });

  it('unknown intent returns unsupported', () => {
    const result = executeIntent({ intent: 'unknown', entityRefs: {} }, {}, ctx);
    expect(result.kind).toBe('unsupported');
  });

  it('list_for_day tomorrow returns Wed events only', () => {
    const intent = {
      intent: 'list_for_day' as const,
      entityRefs: {},
      timeRange: { relativeHint: 'tomorrow' as const },
    };
    const refs = resolveIntent(intent, resolveCtx);
    const result = executeIntent(intent, refs, ctx);
    expect(result.events?.map(e => e.id)).toEqual(['e5']);
  });
});
