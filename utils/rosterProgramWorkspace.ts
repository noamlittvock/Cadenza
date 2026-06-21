import type { Student, Teacher } from '../types';
import type { ActivityV2, EnrollmentV2, L2Subcategory, TeachingAssignmentV2 } from '../types/v2';
import type { LessonRecord } from '../types/blueprint';

export type RosterWorkspaceKind = 'ALL' | 'ENSEMBLE' | 'THEORY' | 'PROGRAM';
export type RosterWorkspaceStatus = 'ACTIVE' | 'ARCHIVED' | 'MISSING_STAFF';

export interface RosterWorkspaceRow {
  activity: ActivityV2;
  kind: Exclude<RosterWorkspaceKind, 'ALL'>;
  activeEnrollmentIds: string[];
  archivedEnrollmentIds: string[];
  activeStudentIds: string[];
  missingStudentIds: string[];
  activeAssignmentIds: string[];
  assignedStaffMemberIds: string[];
  l2Ids: string[];
  hasMissingStaff: boolean;
  sourceLinks: {
    activityId: string;
    enrollmentIds: string[];
    teachingAssignmentIds: string[];
  };
}

export type TeacherRosterReadState = 'not_applicable' | 'denied' | 'empty' | 'ready';

export interface TeacherRosterReadRow {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  l2Id: string | null;
  lessonRecordId: string | null;
  attendance: LessonRecord['attendance'] | null;
  completion: LessonRecord['completion'] | null;
}

interface RosterStudentLike {
  id: string;
  fullName: string;
  isArchived?: boolean;
  profileStatus?: 'ACTIVE' | 'ARCHIVED' | string;
}

interface RosterEventLike {
  id: string;
  orgId: string;
  activityId: string | null;
  l1Id?: string | null;
  l2Id?: string | null;
}

export interface TeacherRosterReadModel {
  state: TeacherRosterReadState;
  activityId: string | null;
  activityName: string | null;
  sourceEnrollmentIds: string[];
  sourceTeachingAssignmentIds: string[];
  rows: TeacherRosterReadRow[];
}

export function rosterWorkspaceKind(activity: ActivityV2): Exclude<RosterWorkspaceKind, 'ALL'> | null {
  if (activity.template === 'ENSEMBLE') return 'ENSEMBLE';
  if (activity.template === 'PROGRAM') return 'PROGRAM';
  if (activity.activityType === 'ACADEMIC' || /theory/i.test(activity.name)) return 'THEORY';
  return null;
}

function assignmentMatchesRosterEvent(assignment: TeachingAssignmentV2, event: RosterEventLike): boolean {
  if (assignment.isArchived || assignment.activityId !== event.activityId) return false;
  if (assignment.scope === 'ACTIVITY') return true;
  if (assignment.scope === 'L1') return Boolean(assignment.l1Id && assignment.l1Id === (event.l1Id ?? null));
  if (assignment.scope === 'L2') return Boolean(assignment.l2Id && assignment.l2Id === (event.l2Id ?? null));
  return false;
}

function studentIsActive(student: RosterStudentLike | undefined): student is RosterStudentLike {
  if (!student) return false;
  if (student.isArchived) return false;
  if (student.profileStatus === 'ARCHIVED') return false;
  return true;
}

export function buildTeacherRosterReadModel(input: {
  event: RosterEventLike | null;
  activity: ActivityV2 | null;
  enrollments: EnrollmentV2[];
  students: RosterStudentLike[];
  teachingAssignments: TeachingAssignmentV2[];
  lessonRecords: LessonRecord[];
  actor: {
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    staffMemberId?: string | null;
  };
}): TeacherRosterReadModel {
  const event = input.event;
  const activity = input.activity;
  if (!event?.activityId || !activity || !rosterWorkspaceKind(activity)) {
    return {
      state: 'not_applicable',
      activityId: event?.activityId ?? null,
      activityName: activity?.name ?? null,
      sourceEnrollmentIds: [],
      sourceTeachingAssignmentIds: [],
      rows: [],
    };
  }

  const matchingAssignments = input.teachingAssignments
    .filter(assignment => assignment.orgId === event.orgId && assignmentMatchesRosterEvent(assignment, event))
    .sort((a, b) =>
      a.staffMemberId.localeCompare(b.staffMemberId)
      || (a.l2Id ?? '').localeCompare(b.l2Id ?? '')
      || a.id.localeCompare(b.id),
    );
  const canRead = Boolean(input.actor.isAdmin || input.actor.isSuperAdmin)
    || Boolean(input.actor.staffMemberId && matchingAssignments.some(assignment => assignment.staffMemberId === input.actor.staffMemberId));

  if (!canRead) {
    return {
      state: 'denied',
      activityId: activity.id,
      activityName: activity.name,
      sourceEnrollmentIds: [],
      sourceTeachingAssignmentIds: [],
      rows: [],
    };
  }

  const studentById = new Map(input.students.map(student => [student.id, student]));
  const lessonByStudentId = new Map(
    input.lessonRecords
      .filter(lesson => lesson.orgId === event.orgId && lesson.eventId === event.id)
      .map(lesson => [lesson.studentId, lesson]),
  );
  const activeEnrollments = input.enrollments
    .filter(enrollment => (
      enrollment.orgId === event.orgId
      && enrollment.status === 'ACTIVE'
      && enrollment.activityId === event.activityId
      && (!event.l2Id || enrollment.l2Id === event.l2Id)
      && studentIsActive(studentById.get(enrollment.studentId))
    ))
    .sort((a, b) => {
      const aName = studentById.get(a.studentId)?.fullName ?? a.studentId;
      const bName = studentById.get(b.studentId)?.fullName ?? b.studentId;
      return aName.localeCompare(bName) || a.id.localeCompare(b.id);
    });

  const rows = activeEnrollments.map(enrollment => {
    const lesson = lessonByStudentId.get(enrollment.studentId) ?? null;
    return {
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      studentName: studentById.get(enrollment.studentId)?.fullName ?? enrollment.studentId,
      l2Id: enrollment.l2Id,
      lessonRecordId: lesson?.id ?? null,
      attendance: lesson?.attendance ?? null,
      completion: lesson?.completion ?? null,
    };
  });

  return {
    state: rows.length > 0 ? 'ready' : 'empty',
    activityId: activity.id,
    activityName: activity.name,
    sourceEnrollmentIds: activeEnrollments.map(enrollment => enrollment.id),
    sourceTeachingAssignmentIds: matchingAssignments.map(assignment => assignment.id),
    rows,
  };
}

export function buildRosterWorkspaceRows(input: {
  activities: ActivityV2[];
  enrollments: EnrollmentV2[];
  students: Student[];
  teachingAssignments: TeachingAssignmentV2[];
  kind?: RosterWorkspaceKind;
  status?: RosterWorkspaceStatus;
  search?: string;
}): RosterWorkspaceRow[] {
  const kindFilter = input.kind ?? 'ALL';
  const statusFilter = input.status ?? 'ACTIVE';
  const search = (input.search ?? '').trim().toLocaleLowerCase();
  const studentById = new Map(input.students.map(student => [student.id, student]));
  const rows = input.activities
    .map(activity => {
      const kind = rosterWorkspaceKind(activity);
      if (!kind) return null;
      if (kindFilter !== 'ALL' && kind !== kindFilter) return null;

      const enrollments = input.enrollments
        .filter(enrollment => enrollment.activityId === activity.id)
        .sort((a, b) => {
          const aName = studentById.get(a.studentId)?.fullName ?? a.studentId;
          const bName = studentById.get(b.studentId)?.fullName ?? b.studentId;
          return aName.localeCompare(bName) || a.id.localeCompare(b.id);
        });
      const activeEnrollments = enrollments.filter(enrollment => enrollment.status === 'ACTIVE');
      const archivedEnrollments = enrollments.filter(enrollment => enrollment.status === 'ARCHIVED');
      const activeStudentIds = Array.from(new Set(
        activeEnrollments
          .map(enrollment => enrollment.studentId)
          .filter(studentId => {
            const student = studentById.get(studentId);
            return student && student.profileStatus !== 'ARCHIVED';
          }),
      )).sort((a, b) => {
        const aName = studentById.get(a)?.fullName ?? a;
        const bName = studentById.get(b)?.fullName ?? b;
        return aName.localeCompare(bName) || a.localeCompare(b);
      });
      const missingStudentIds = Array.from(new Set(
        activeEnrollments
          .map(enrollment => enrollment.studentId)
          .filter(studentId => !studentById.has(studentId)),
      )).sort();
      const activeAssignments = input.teachingAssignments
        .filter(assignment => assignment.activityId === activity.id && !assignment.isArchived)
        .sort((a, b) =>
          a.staffMemberId.localeCompare(b.staffMemberId)
          || (a.l2Id ?? '').localeCompare(b.l2Id ?? '')
          || a.id.localeCompare(b.id),
        );
      const l2Ids = Array.from(new Set(activeEnrollments.map(enrollment => enrollment.l2Id).filter(Boolean))).sort();
      const row: RosterWorkspaceRow = {
        activity,
        kind,
        activeEnrollmentIds: activeEnrollments.map(enrollment => enrollment.id),
        archivedEnrollmentIds: archivedEnrollments.map(enrollment => enrollment.id),
        activeStudentIds,
        missingStudentIds,
        activeAssignmentIds: activeAssignments.map(assignment => assignment.id),
        assignedStaffMemberIds: Array.from(new Set(activeAssignments.map(assignment => assignment.staffMemberId))).sort(),
        l2Ids,
        hasMissingStaff: activeAssignments.length === 0,
        sourceLinks: {
          activityId: activity.id,
          enrollmentIds: activeEnrollments.map(enrollment => enrollment.id),
          teachingAssignmentIds: activeAssignments.map(assignment => assignment.id),
        },
      };
      return row;
    })
    .filter((row): row is RosterWorkspaceRow => Boolean(row));

  return rows
    .filter(row => {
      if (statusFilter === 'ACTIVE' && row.activity.isArchived) return false;
      if (statusFilter === 'ARCHIVED' && !row.activity.isArchived && row.archivedEnrollmentIds.length === 0) return false;
      if (statusFilter === 'MISSING_STAFF' && !row.hasMissingStaff) return false;
      if (!search) return true;
      const haystack = [
        row.activity.name,
        row.kind,
        ...row.activeStudentIds.map(id => studentById.get(id)?.fullName ?? id),
        ...row.assignedStaffMemberIds,
      ].join(' ').toLocaleLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => a.activity.name.localeCompare(b.activity.name) || a.activity.id.localeCompare(b.activity.id));
}

export function activityL2Options(activityId: string, l2s: L2Subcategory[]): L2Subcategory[] {
  return l2s
    .filter(l2 => l2.activityId === activityId && !l2.isArchived)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function displayNameById<T extends { id: string; fullName: string }>(items: T[], fallback = 'Unknown'): Map<string, string> {
  return new Map(items.map(item => [item.id, item.fullName || fallback]));
}

export function activeStudents(students: Student[]): Student[] {
  return students
    .filter(student => student.profileStatus !== 'ARCHIVED')
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id));
}

export function activeTeachers(teachers: Teacher[]): Teacher[] {
  return teachers
    .filter(teacher => !teacher.isArchived)
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id));
}
