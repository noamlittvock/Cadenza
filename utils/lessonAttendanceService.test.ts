import { describe, expect, it, vi } from 'vitest';
import type { CalendarEvent } from '../types';
import type { LessonRecord } from '../types/blueprint';
import type { LessonAttendanceRepository } from './lessonAttendanceService';
import {
  LessonAttendanceError,
  applyLessonAttendanceUpdate,
  buildExistingLessonAttendanceUpdate,
  markExistingLessonAttendance,
} from './lessonAttendanceService';

const T = '2026-06-18T10:00:00.000Z';
const UPDATED = '2026-06-18T11:15:00.000Z';
const adapterNow = { seconds: 0, nanoseconds: 0 };

const event: CalendarEvent = {
  id: 'event_1',
  name: 'Piano Lesson',
  description: 'Weekly lesson',
  teacherId: 'staff_1',
  roomId: 'room_1',
  activityId: 'activity_1',
  start: '2026-06-18T15:00:00.000Z',
  end: '2026-06-18T16:00:00.000Z',
  isCanceled: false,
  isHidden: false,
};

const lesson = (overrides: Partial<LessonRecord> = {}): LessonRecord => ({
  id: 'lesson_1',
  orgId: 'org_1',
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
  createdAt: T,
  updatedAt: T,
  createdBy: 'admin_1',
  updatedBy: null,
  ...overrides,
});

const context = {
  orgId: 'org_1',
  timeZone: 'UTC',
  adapterNow,
  updatedAt: UPDATED,
  actor: { userId: 'teacher_user_1', staffMemberId: 'staff_1' },
};

describe('lesson attendance existing-row marking service', () => {
  it('marks an existing event-bound row through the EventV2 adapter without inferring completion', () => {
    const plan = buildExistingLessonAttendanceUpdate({
      event,
      lessons: [lesson()],
      lessonId: 'lesson_1',
      patch: {
        attendance: 'PRESENT',
        notes: 'Worked on phrasing',
        repertoire: ['Bach Minuet'],
        homework: 'Slow practice',
      },
      context,
    });

    expect(plan.event).toMatchObject({
      id: 'event_1',
      orgId: 'org_1',
      date: '2026-06-18',
      startTime: '15:00',
      endTime: '16:00',
    });
    expect(plan.lesson).toMatchObject({
      id: 'lesson_1',
      eventId: 'event_1',
      attendance: 'PRESENT',
      completion: 'PENDING',
      notes: 'Worked on phrasing',
      repertoire: ['Bach Minuet'],
      homework: 'Slow practice',
      updatedAt: UPDATED,
      updatedBy: 'teacher_user_1',
    });
  });

  it('allows admin override on another teacher row and preserves explicit completion semantics', () => {
    const plan = buildExistingLessonAttendanceUpdate({
      event,
      lessons: [lesson({ staffMemberId: 'staff_2' })],
      lessonId: 'lesson_1',
      patch: { attendance: 'ABSENT', completion: 'NO_SHOW' },
      context: {
        ...context,
        actor: { userId: 'admin_user_1', canAdminOverride: true },
      },
    });

    expect(plan.lesson.attendance).toBe('ABSENT');
    expect(plan.lesson.completion).toBe('NO_SHOW');
    expect(plan.lesson.updatedBy).toBe('admin_user_1');
  });

  it('denies teacher marking rows they do not own', () => {
    expect(() => buildExistingLessonAttendanceUpdate({
      event,
      lessons: [lesson({ staffMemberId: 'staff_2' })],
      lessonId: 'lesson_1',
      patch: { attendance: 'LATE' },
      context,
    })).toThrowError(new LessonAttendanceError('TEACHER_NOT_OWNER', 'Teachers may only mark lesson rows assigned to their own staff member id.'));
  });

  it('rejects missing rows and event/org mismatches instead of creating or materializing rows', () => {
    expect(() => buildExistingLessonAttendanceUpdate({
      event,
      lessons: [],
      lessonId: 'lesson_1',
      patch: { attendance: 'PRESENT' },
      context,
    })).toThrowError(new LessonAttendanceError('LESSON_NOT_FOUND', 'Lesson row lesson_1 was not found.'));

    expect(() => buildExistingLessonAttendanceUpdate({
      event,
      lessons: [lesson({ eventId: 'event_2' })],
      lessonId: 'lesson_1',
      patch: { attendance: 'PRESENT' },
      context,
    })).toThrowError(new LessonAttendanceError('EVENT_MISMATCH', 'The lesson row is not linked to the selected event.'));

    expect(() => buildExistingLessonAttendanceUpdate({
      event,
      lessons: [lesson({ orgId: 'org_2' })],
      lessonId: 'lesson_1',
      patch: { attendance: 'PRESENT' },
      context,
    })).toThrowError(new LessonAttendanceError('ORG_MISMATCH', 'The lesson row is not in the current organization.'));
  });

  it('applies an update to the existing in-memory collection without adding rows', () => {
    const original = [lesson(), lesson({ id: 'lesson_2', studentId: 'student_2' })];
    const updated = { ...original[0], attendance: 'EXCUSED' as const, updatedAt: UPDATED };

    const next = applyLessonAttendanceUpdate(original, updated);

    expect(next).toHaveLength(2);
    expect(next.map(item => item.id)).toEqual(['lesson_1', 'lesson_2']);
    expect(next[0].attendance).toBe('EXCUSED');
    expect(next[1]).toBe(original[1]);
  });

  it('persists only the existing updated row through the lessonRecords repository', async () => {
    const repo: LessonAttendanceRepository = {
      fetchLessonRecords: vi.fn(async () => [lesson(), lesson({ id: 'lesson_2', studentId: 'student_2' })]),
      upsertLessonRecords: vi.fn(async () => undefined),
    };

    const plan = await markExistingLessonAttendance({
      event,
      lessonId: 'lesson_1',
      patch: { attendance: 'MAKEUP', makeupOfLessonId: 'lesson_missed_1' },
      context,
      repository: repo,
    });

    expect(repo.fetchLessonRecords).toHaveBeenCalledWith('org_1');
    expect(repo.upsertLessonRecords).toHaveBeenCalledWith('org_1', [plan.lesson]);
    expect(plan.lesson.attendance).toBe('MAKEUP');
    expect(plan.lesson.makeupOfLessonId).toBe('lesson_missed_1');
  });
});
