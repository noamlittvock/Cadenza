import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../types';
import type { LessonRecord } from '../types/blueprint';
import { eventToV2 } from './canonicalAdapters';
import { buildEventAttendancePanelModel, buildUnmarkedAttendanceWorklist } from './lessonAttendancePanel';

const T = '2026-06-18T10:00:00.000Z';
const base = { orgId: 'org1', createdAt: T, updatedAt: T };
const now = { seconds: 0, nanoseconds: 0 };

const event: CalendarEvent = {
  id: 'event_1',
  name: 'Piano Lesson',
  description: 'Weekly lesson',
  start: '2026-06-18T15:00:00.000Z',
  end: '2026-06-18T16:00:00.000Z',
  teacherId: 'staff_1',
  roomId: 'room_1',
  isCanceled: false,
  isHidden: false,
};

const lesson = (overrides: Partial<LessonRecord>): LessonRecord => ({
  ...base,
  id: 'lesson_1',
  eventId: 'event_1',
  studentId: 'student_1',
  staffMemberId: 'staff_1',
  date: '2026-06-18',
  attendance: 'UNMARKED',
  completion: 'PENDING',
  notes: null,
  repertoire: [],
  homework: null,
  makeupOfLessonId: null,
  ...overrides,
});

describe('buildUnmarkedAttendanceWorklist', () => {
  it('links only persisted unmarked lesson rows to existing events and students', () => {
    const items = buildUnmarkedAttendanceWorklist({
      lessons: [
        lesson({ id: 'future', date: '2026-06-20', attendance: 'UNMARKED' }),
        lesson({ id: 'marked', date: '2026-06-17', attendance: 'PRESENT' }),
        lesson({ id: 'missing_event', eventId: 'event_missing', date: '2026-06-18', studentId: 'student_missing' }),
        lesson({ id: 'ready', date: '2026-06-18', studentId: 'student_1' }),
      ],
      events: [
        { id: 'event_1', name: 'Piano Lesson', date: '2026-06-18', startTime: '15:00' },
      ],
      students: [
        { id: 'student_1', fullName: 'Ari Levi' },
      ],
      upToDate: '2026-06-18',
    });

    expect(items.map(item => item.lesson.id)).toEqual(['ready', 'missing_event']);
    expect(items[0]).toMatchObject({
      studentName: 'Ari Levi',
      eventName: 'Piano Lesson',
      eventDate: '2026-06-18',
      eventStartTime: '15:00',
      hasEventLink: true,
    });
    expect(items[1]).toMatchObject({
      studentName: 'student_missing',
      eventName: 'event_missing',
      hasEventLink: false,
    });
  });
});

describe('buildEventAttendancePanelModel', () => {
  it('filters existing lesson records through the EventV2 boundary and summarizes only that event', () => {
    const eventV2 = eventToV2(event, { orgId: 'org1', timeZone: 'UTC', now });
    const model = buildEventAttendancePanelModel({
      event: eventV2,
      lessons: [
        lesson({ id: 'lesson_b', studentId: 'student_b', attendance: 'ABSENT', completion: 'NO_SHOW' }),
        lesson({ id: 'other_event', eventId: 'event_2', studentId: 'student_c', attendance: 'PRESENT', completion: 'COMPLETED' }),
        lesson({ id: 'lesson_a', studentId: 'student_a', attendance: 'PRESENT', completion: 'COMPLETED' }),
      ],
      students: [
        { id: 'student_b', fullName: 'Ziv Cohen' },
        { id: 'student_a', fullName: 'Ari Levi' },
      ],
    });

    expect(model.state).toBe('ready');
    expect(model.eventId).toBe('event_1');
    expect(model.eventDate).toBe('2026-06-18');
    expect(model.rows.map(row => row.lesson.id)).toEqual(['lesson_a', 'lesson_b']);
    expect(model.summary.total).toBe(2);
    expect(model.summary.attendance.PRESENT).toBe(1);
    expect(model.summary.attendance.ABSENT).toBe(1);
    expect(model.summary.noShow).toBe(1);
  });

  it('returns explicit loading, error, and no-prepared-row states without creating rows', () => {
    const eventV2 = eventToV2(event, { orgId: 'org1', timeZone: 'UTC', now });
    expect(buildEventAttendancePanelModel({ event: eventV2, lessons: [], students: [], loading: true }).state).toBe('loading');
    expect(buildEventAttendancePanelModel({ event: eventV2, lessons: [], students: [], loadError: true }).state).toBe('error');

    const empty = buildEventAttendancePanelModel({ event: eventV2, lessons: [], students: [] });
    expect(empty.state).toBe('empty');
    expect(empty.rows).toEqual([]);
    expect(empty.summary.total).toBe(0);
  });
});
