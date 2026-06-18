import type { CalendarEvent } from '../types';
import { BLUEPRINT_COLLECTIONS, type AttendanceStatus, type LessonCompletion, type LessonRecord } from '../types/blueprint';
import type { EventV2 } from '../types/v2';
import type { AppTimestamp } from './appTimestamp';
import { eventToV2 } from './canonicalAdapters';
import { fetchCollectionItems, upsertCollectionItems } from './supabaseSync';

export type LessonAttendanceErrorCode =
  | 'LESSON_NOT_FOUND'
  | 'EVENT_MISMATCH'
  | 'ORG_MISMATCH'
  | 'TEACHER_NOT_OWNER'
  | 'INVALID_ATTENDANCE'
  | 'INVALID_COMPLETION';

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
