import { describe, expect, it, vi } from 'vitest';
import type { CalendarEvent } from '../types';
import type { LessonRecord } from '../types/blueprint';
import type { EnrollmentV2, EventParticipant, EventV2 } from '../types/v2';
import type { LessonAttendanceRepository } from './lessonAttendanceService';
import {
  LessonAttendanceError,
  applyLessonAttendancePreparation,
  applyLessonAttendanceUpdate,
  buildExistingLessonAttendanceUpdate,
  buildLessonAttendancePreparation,
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

const enrollment = (overrides: Partial<EnrollmentV2> = {}): EnrollmentV2 => ({
  id: 'enrollment_1',
  orgId: 'org_1',
  studentId: 'student_1',
  activityId: 'activity_1',
  l2Id: 'l2_1',
  startDate: '2026-01-01',
  endDate: null,
  status: 'ACTIVE',
  createdAt: adapterNow,
  updatedAt: adapterNow,
  ...overrides,
});

const participant = (overrides: Partial<EventParticipant> = {}): EventParticipant => ({
  id: 'participant_1',
  orgId: 'org_1',
  eventId: 'event_1',
  staffMemberId: 'staff_1',
  assignmentType: 'TEACHING',
  teachingAssignmentId: null,
  orgRoleId: null,
  notes: null,
  createdAt: adapterNow,
  ...overrides,
});

const eventV2 = (overrides: Partial<EventV2> = {}): EventV2 => ({
  id: 'event_1',
  orgId: 'org_1',
  name: 'Piano Lesson',
  activityId: 'activity_1',
  l1Id: null,
  l2Id: 'l2_1',
  location: 'Room 1',
  date: '2026-06-18',
  startTime: '15:00',
  endTime: '16:00',
  durationMinutes: 60,
  isRecurring: false,
  recurringGroupId: null,
  status: 'SCHEDULED',
  notes: null,
  createdAt: adapterNow,
  updatedAt: adapterNow,
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

describe('lesson attendance explicit preparation service', () => {
  it('prepares one unconfirmed row per missing active roster student without duplicating existing rows', () => {
    let seq = 0;
    const plan = buildLessonAttendancePreparation({
      event,
      eventV2: eventV2(),
      lessons: [lesson({ studentId: 'student_1' })],
      enrollments: [
        enrollment({ id: 'enrollment_1', studentId: 'student_1' }),
        enrollment({ id: 'enrollment_2', studentId: 'student_2' }),
        enrollment({ id: 'enrollment_archived', studentId: 'student_3', status: 'ARCHIVED' }),
        enrollment({ id: 'enrollment_other_l2', studentId: 'student_4', l2Id: 'l2_2' }),
      ],
      participants: [participant()],
      context,
      idFactory: () => `prepared_${++seq}`,
    });

    expect(plan.event).toMatchObject({ id: 'event_1', l2Id: 'l2_1' });
    expect(plan.skippedStudentIds).toEqual(['student_1']);
    expect(plan.preparedLessons).toHaveLength(1);
    expect(plan.preparedLessons[0]).toMatchObject({
      id: 'prepared_1',
      orgId: 'org_1',
      eventId: 'event_1',
      studentId: 'student_2',
      staffMemberId: 'staff_1',
      date: '2026-06-18',
      attendance: 'UNMARKED',
      completion: 'PENDING',
      notes: null,
      repertoire: [],
      homework: null,
      makeupOfLessonId: null,
      createdAt: UPDATED,
      updatedAt: UPDATED,
      createdBy: 'teacher_user_1',
      updatedBy: 'teacher_user_1',
    });
  });

  it('allows admin preparation for group lessons using the event participant staff member', () => {
    const plan = buildLessonAttendancePreparation({
      event,
      eventV2: eventV2({ l2Id: null }),
      lessons: [],
      enrollments: [
        enrollment({ id: 'enrollment_1', studentId: 'student_1', l2Id: 'l2_1' }),
        enrollment({ id: 'enrollment_2', studentId: 'student_2', l2Id: 'l2_2' }),
      ],
      participants: [participant({ staffMemberId: 'staff_7' })],
      context: {
        ...context,
        actor: { userId: 'admin_user_1', canAdminOverride: true },
      },
      idFactory: vi.fn()
        .mockReturnValueOnce('prepared_1')
        .mockReturnValueOnce('prepared_2'),
    });

    expect(plan.preparedLessons.map(row => row.studentId)).toEqual(['student_1', 'student_2']);
    expect(plan.preparedLessons.every(row => row.staffMemberId === 'staff_7')).toBe(true);
    expect(plan.preparedLessons.every(row => row.attendance === 'UNMARKED' && row.completion === 'PENDING')).toBe(true);
  });

  it('denies preparation by a teacher who is not assigned to the event', () => {
    expect(() => buildLessonAttendancePreparation({
      event: { ...event, teacherId: 'staff_2', staffMemberIds: ['staff_2'] },
      eventV2: eventV2(),
      lessons: [],
      enrollments: [enrollment({ studentId: 'student_2' })],
      participants: [participant({ staffMemberId: 'staff_2' })],
      context,
      idFactory: () => 'prepared_1',
    })).toThrowError(new LessonAttendanceError('PREPARE_NOT_ALLOWED', 'Only an assigned teacher or an admin can prepare attendance rows for this event.'));
  });

  it('applies prepared rows without duplicating an existing event/student pair', () => {
    const existing = lesson({ id: 'lesson_existing', studentId: 'student_1' });
    const next = applyLessonAttendancePreparation(
      [existing],
      [
        lesson({ id: 'prepared_duplicate', studentId: 'student_1' }),
        lesson({ id: 'prepared_new', studentId: 'student_2' }),
      ],
    );

    expect(next.map(row => row.id)).toEqual(['lesson_existing', 'prepared_new']);
  });
});
