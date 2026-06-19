import type { CalendarEvent } from '../types';
import { BLUEPRINT_COLLECTIONS, type AttendanceStatus, type LessonCompletion, type LessonRecord } from '../types/blueprint';
import type { EnrollmentV2, EventParticipant, EventV2 } from '../types/v2';
import type { AppTimestamp } from './appTimestamp';
import { eventToV2 } from './canonicalAdapters';
import { fetchCollectionItems, upsertCollectionItems } from './supabaseSync';

export type LessonAttendanceErrorCode =
  | 'LESSON_NOT_FOUND'
  | 'EVENT_MISMATCH'
  | 'ORG_MISMATCH'
  | 'TEACHER_NOT_OWNER'
  | 'INVALID_ATTENDANCE'
  | 'INVALID_COMPLETION'
  | 'PREPARE_NOT_ALLOWED';

export class LessonAttendanceError extends Error {
  constructor(
    public readonly code: LessonAttendanceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LessonAttendanceError';
  }
}

export interface LessonAttendanceActor {
  userId?: string | null;
  staffMemberId?: string | null;
  canAdminOverride?: boolean;
}

export interface LessonAttendanceMarkPatch {
  attendance: AttendanceStatus;
  completion?: LessonCompletion;
  notes?: string | null;
  repertoire?: string[];
  homework?: string | null;
  makeupOfLessonId?: string | null;
}

export interface LessonAttendanceMarkContext {
  orgId: string;
  timeZone: string;
  adapterNow: AppTimestamp;
  updatedAt: string;
  actor: LessonAttendanceActor;
}

export interface LessonAttendanceUpdatePlan {
  event: EventV2;
  lesson: LessonRecord;
}

export interface LessonAttendancePreparationPlan {
  event: EventV2;
  preparedLessons: LessonRecord[];
  skippedStudentIds: string[];
}

export interface LessonAttendanceRepository {
  fetchLessonRecords(orgId: string): Promise<LessonRecord[]>;
  upsertLessonRecords(orgId: string, lessons: LessonRecord[]): Promise<void>;
}

const ATTENDANCE_VALUES = new Set<AttendanceStatus>([
  'UNMARKED',
  'PRESENT',
  'ABSENT',
  'LATE',
  'EXCUSED',
  'MAKEUP',
]);

const COMPLETION_VALUES = new Set<LessonCompletion>([
  'PENDING',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

export const supabaseLessonAttendanceRepository: LessonAttendanceRepository = {
  fetchLessonRecords: orgId => fetchCollectionItems<LessonRecord>(orgId, BLUEPRINT_COLLECTIONS.lessonRecords),
  upsertLessonRecords: (orgId, lessons) => upsertCollectionItems<LessonRecord>(orgId, BLUEPRINT_COLLECTIONS.lessonRecords, lessons),
};

function assertKnownAttendance(attendance: AttendanceStatus): void {
  if (!ATTENDANCE_VALUES.has(attendance)) {
    throw new LessonAttendanceError('INVALID_ATTENDANCE', `Unsupported attendance status: ${attendance}`);
  }
}

function assertKnownCompletion(completion: LessonCompletion): void {
  if (!COMPLETION_VALUES.has(completion)) {
    throw new LessonAttendanceError('INVALID_COMPLETION', `Unsupported lesson completion: ${completion}`);
  }
}

function assertActorCanMark(lesson: LessonRecord, actor: LessonAttendanceActor): void {
  if (actor.canAdminOverride) return;
  if (!actor.staffMemberId || lesson.staffMemberId !== actor.staffMemberId) {
    throw new LessonAttendanceError('TEACHER_NOT_OWNER', 'Teachers may only mark lesson rows assigned to their own staff member id.');
  }
}

function resolveEventForAttendance(params: {
  event: CalendarEvent;
  eventV2?: EventV2 | null;
  context: Pick<LessonAttendanceMarkContext, 'orgId' | 'timeZone' | 'adapterNow'>;
}): EventV2 {
  const adapted = eventToV2(params.event, {
    orgId: params.context.orgId,
    timeZone: params.context.timeZone,
    now: params.context.adapterNow,
  });
  if (!params.eventV2) return adapted;
  if (params.eventV2.id !== adapted.id || params.eventV2.orgId !== params.context.orgId) return adapted;
  return params.eventV2;
}

export function buildExistingLessonAttendanceUpdate(params: {
  event: CalendarEvent;
  lessons: LessonRecord[];
  lessonId: string;
  patch: LessonAttendanceMarkPatch;
  context: LessonAttendanceMarkContext;
}): LessonAttendanceUpdatePlan {
  const { event, lessons, lessonId, patch, context } = params;
  assertKnownAttendance(patch.attendance);
  if (patch.completion !== undefined) assertKnownCompletion(patch.completion);

  const eventV2 = eventToV2(event, {
    orgId: context.orgId,
    timeZone: context.timeZone,
    now: context.adapterNow,
  });

  const existing = lessons.find(lesson => lesson.id === lessonId);
  if (!existing) {
    throw new LessonAttendanceError('LESSON_NOT_FOUND', `Lesson row ${lessonId} was not found.`);
  }
  if (existing.orgId !== context.orgId || eventV2.orgId !== context.orgId) {
    throw new LessonAttendanceError('ORG_MISMATCH', 'The lesson row is not in the current organization.');
  }
  if (existing.eventId !== eventV2.id) {
    throw new LessonAttendanceError('EVENT_MISMATCH', 'The lesson row is not linked to the selected event.');
  }
  assertActorCanMark(existing, context.actor);

  return {
    event: eventV2,
    lesson: {
      ...existing,
      attendance: patch.attendance,
      completion: patch.completion ?? existing.completion,
      notes: patch.notes !== undefined ? patch.notes : existing.notes,
      repertoire: patch.repertoire !== undefined ? patch.repertoire : existing.repertoire,
      homework: patch.homework !== undefined ? patch.homework : existing.homework,
      makeupOfLessonId: patch.makeupOfLessonId !== undefined ? patch.makeupOfLessonId : existing.makeupOfLessonId,
      updatedAt: context.updatedAt,
      updatedBy: context.actor.userId ?? existing.updatedBy ?? null,
    },
  };
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function activeRosterStudentIds(eventV2: EventV2, enrollments: EnrollmentV2[]): string[] {
  if (!eventV2.activityId) return [];
  return uniqueIds(enrollments
    .filter(enrollment => (
      enrollment.orgId === eventV2.orgId
      && enrollment.status === 'ACTIVE'
      && enrollment.activityId === eventV2.activityId
      && (!eventV2.l2Id || enrollment.l2Id === eventV2.l2Id)
    ))
    .map(enrollment => enrollment.studentId));
}

function eventStaffMemberIds(event: CalendarEvent, participants: EventParticipant[]): string[] {
  const teaching = participants.filter(participant => participant.assignmentType === 'TEACHING');
  const source = teaching.length > 0 ? teaching : participants;
  return uniqueIds([
    ...source.map(participant => participant.staffMemberId),
    ...(event.staffMemberIds ?? []),
    event.teacherId,
  ]);
}

export function buildLessonAttendancePreparation(params: {
  event: CalendarEvent;
  eventV2?: EventV2 | null;
  lessons: LessonRecord[];
  enrollments: EnrollmentV2[];
  participants: EventParticipant[];
  context: LessonAttendanceMarkContext;
  idFactory: () => string;
}): LessonAttendancePreparationPlan {
  const { event, lessons, enrollments, participants, context, idFactory } = params;
  const eventV2 = resolveEventForAttendance({
    event,
    eventV2: params.eventV2,
    context,
  });
  if (eventV2.orgId !== context.orgId) {
    throw new LessonAttendanceError('ORG_MISMATCH', 'The selected event is not in the current organization.');
  }

  const staffMemberIds = eventStaffMemberIds(event, participants.filter(participant => (
    (!participant.orgId || participant.orgId === context.orgId)
    && (!participant.eventId || participant.eventId === eventV2.id)
  )));
  if (!context.actor.canAdminOverride && (!context.actor.staffMemberId || !staffMemberIds.includes(context.actor.staffMemberId))) {
    throw new LessonAttendanceError('PREPARE_NOT_ALLOWED', 'Only an assigned teacher or an admin can prepare attendance rows for this event.');
  }

  const existingStudentIds = new Set(lessons
    .filter(lesson => lesson.orgId === context.orgId && lesson.eventId === eventV2.id)
    .map(lesson => lesson.studentId));
  const rosterStudentIds = activeRosterStudentIds(eventV2, enrollments);
  const missingStudentIds = rosterStudentIds.filter(studentId => !existingStudentIds.has(studentId));
  const primaryStaffMemberId = context.actor.canAdminOverride
    ? (staffMemberIds[0] ?? null)
    : (context.actor.staffMemberId ?? staffMemberIds[0] ?? null);

  return {
    event: eventV2,
    skippedStudentIds: rosterStudentIds.filter(studentId => existingStudentIds.has(studentId)),
    preparedLessons: missingStudentIds.map(studentId => ({
      id: idFactory(),
      orgId: context.orgId,
      eventId: eventV2.id,
      studentId,
      staffMemberId: primaryStaffMemberId,
      date: eventV2.date,
      attendance: 'UNMARKED',
      completion: 'PENDING',
      notes: null,
      repertoire: [],
      homework: null,
      makeupOfLessonId: null,
      createdAt: context.updatedAt,
      updatedAt: context.updatedAt,
      createdBy: context.actor.userId ?? null,
      updatedBy: context.actor.userId ?? null,
    })),
  };
}

export function applyLessonAttendanceUpdate(
  lessons: LessonRecord[],
  updatedLesson: LessonRecord,
): LessonRecord[] {
  if (!lessons.some(lesson => lesson.id === updatedLesson.id)) {
    throw new LessonAttendanceError('LESSON_NOT_FOUND', `Lesson row ${updatedLesson.id} was not found.`);
  }
  return lessons.map(lesson => lesson.id === updatedLesson.id ? updatedLesson : lesson);
}

export async function markExistingLessonAttendance(params: {
  event: CalendarEvent;
  lessonId: string;
  patch: LessonAttendanceMarkPatch;
  context: LessonAttendanceMarkContext;
  repository?: LessonAttendanceRepository;
}): Promise<LessonAttendanceUpdatePlan> {
  const repository = params.repository ?? supabaseLessonAttendanceRepository;
  const lessons = await repository.fetchLessonRecords(params.context.orgId);
  const plan = buildExistingLessonAttendanceUpdate({
    event: params.event,
    lessons,
    lessonId: params.lessonId,
    patch: params.patch,
    context: params.context,
  });
  await repository.upsertLessonRecords(params.context.orgId, [plan.lesson]);
  return plan;
}

export function applyLessonAttendancePreparation(
  lessons: LessonRecord[],
  preparedLessons: LessonRecord[],
): LessonRecord[] {
  if (preparedLessons.length === 0) return lessons;
  const existingKeys = new Set(lessons.map(lesson => `${lesson.eventId}|${lesson.studentId}`));
  const additions = preparedLessons.filter(lesson => !existingKeys.has(`${lesson.eventId}|${lesson.studentId}`));
  return [...lessons, ...additions];
}
