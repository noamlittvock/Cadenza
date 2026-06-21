import { describe, expect, it } from 'vitest';
import type { Student, Teacher } from '../types';
import type { ActivityV2, EnrollmentV2, L2Subcategory, TeachingAssignmentV2 } from '../types/v2';
import type { LessonRecord } from '../types/blueprint';
import { fromDateTimestamp } from './appTimestamp';
import { activeStudents, activeTeachers, activityL2Options, buildRosterWorkspaceRows, buildTeacherRosterReadModel } from './rosterProgramWorkspace';

const T = fromDateTimestamp(new Date('2026-06-19T10:00:00.000Z'));

const activities: ActivityV2[] = [
  { id: 'act_ensemble', orgId: 'org1', name: 'Youth Orchestra', template: 'ENSEMBLE', activityType: 'PERFORMANCES', modules: { curriculum: true }, location: null, eventNameMode: 'PROMPTED', isArchived: false, createdAt: T, updatedAt: T },
  { id: 'act_theory', orgId: 'org1', name: 'Theory Level A', template: 'DISCIPLINE', activityType: 'ACADEMIC', modules: { curriculum: true }, location: null, eventNameMode: 'AUTO', isArchived: false, createdAt: T, updatedAt: T },
  { id: 'act_program', orgId: 'org1', name: 'West School Program', template: 'PROGRAM', activityType: 'ACADEMIC', modules: { curriculum: true }, location: null, eventNameMode: 'AUTO', isArchived: true, createdAt: T, updatedAt: T },
];

const students: Student[] = [
  { id: 'stu_a', orgId: 'org1', fullName: 'Avi Cohen', dateOfBirth: '', isMinor: true, guardians: [], assignments: [], pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] }, notes: [], documents: [], profileStatus: 'ACTIVE', createdAt: '2026-06-19T10:00:00.000Z', updatedAt: '2026-06-19T10:00:00.000Z' },
  { id: 'stu_b', orgId: 'org1', fullName: 'Maya Levi', dateOfBirth: '', isMinor: true, guardians: [], assignments: [], pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] }, notes: [], documents: [], profileStatus: 'ACTIVE', createdAt: '2026-06-19T10:00:00.000Z', updatedAt: '2026-06-19T10:00:00.000Z' },
  { id: 'stu_archived', orgId: 'org1', fullName: 'Archived Student', dateOfBirth: '', isMinor: true, guardians: [], assignments: [], pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] }, notes: [], documents: [], profileStatus: 'ARCHIVED', createdAt: '2026-06-19T10:00:00.000Z', updatedAt: '2026-06-19T10:00:00.000Z' },
];

const enrollments: EnrollmentV2[] = [
  { id: 'enr_a', orgId: 'org1', studentId: 'stu_a', activityId: 'act_ensemble', l2Id: 'l2_ensemble', startDate: '2026-09-01', endDate: null, status: 'ACTIVE', createdAt: T, updatedAt: T },
  { id: 'enr_b', orgId: 'org1', studentId: 'stu_b', activityId: 'act_ensemble', l2Id: 'l2_ensemble', startDate: '2026-09-01', endDate: null, status: 'ARCHIVED', createdAt: T, updatedAt: T },
  { id: 'enr_missing', orgId: 'org1', studentId: 'missing', activityId: 'act_theory', l2Id: 'l2_theory', startDate: '2026-09-01', endDate: null, status: 'ACTIVE', createdAt: T, updatedAt: T },
  { id: 'enr_archived_student', orgId: 'org1', studentId: 'stu_archived', activityId: 'act_theory', l2Id: 'l2_theory', startDate: '2026-09-01', endDate: null, status: 'ACTIVE', createdAt: T, updatedAt: T },
];

const assignments: TeachingAssignmentV2[] = [
  { id: 'ta_1', orgId: 'org1', staffMemberId: 'staff_1', activityId: 'act_ensemble', scope: 'ACTIVITY', l1Id: null, l2Id: null, startDate: '2026-09-01', endDate: null, isArchived: false, createdAt: T, updatedAt: T },
  { id: 'ta_old', orgId: 'org1', staffMemberId: 'staff_2', activityId: 'act_ensemble', scope: 'ACTIVITY', l1Id: null, l2Id: null, startDate: '2025-09-01', endDate: null, isArchived: true, createdAt: T, updatedAt: T },
];

const lessons: LessonRecord[] = [
  {
    id: 'lesson_a',
    orgId: 'org1',
    eventId: 'event_ensemble',
    studentId: 'stu_a',
    staffMemberId: 'staff_1',
    date: '2026-09-15',
    attendance: 'UNMARKED',
    completion: 'PENDING',
    notes: null,
    repertoire: [],
    homework: null,
    makeupOfLessonId: null,
    createdAt: '2026-06-19T10:00:00.000Z',
    updatedAt: '2026-06-19T10:00:00.000Z',
  },
];

describe('roster program workspace helpers', () => {
  it('builds source-linked rows with missing staff and stale student markers', () => {
    const rows = buildRosterWorkspaceRows({ activities, enrollments, students, teachingAssignments: assignments });

    expect(rows.map(row => row.activity.id)).toEqual(['act_theory', 'act_ensemble']);
    expect(rows[0]).toMatchObject({
      kind: 'THEORY',
      activeEnrollmentIds: ['enr_archived_student', 'enr_missing'],
      activeStudentIds: [],
      missingStudentIds: ['missing'],
      hasMissingStaff: true,
      sourceLinks: {
        activityId: 'act_theory',
        enrollmentIds: ['enr_archived_student', 'enr_missing'],
        teachingAssignmentIds: [],
      },
    });
    expect(rows[1]).toMatchObject({
      kind: 'ENSEMBLE',
      activeEnrollmentIds: ['enr_a'],
      archivedEnrollmentIds: ['enr_b'],
      activeStudentIds: ['stu_a'],
      activeAssignmentIds: ['ta_1'],
      assignedStaffMemberIds: ['staff_1'],
    });
  });

  it('filters by kind, status, and search without leaking archived activity into active status', () => {
    expect(buildRosterWorkspaceRows({ activities, enrollments, students, teachingAssignments: assignments, kind: 'PROGRAM' })).toEqual([]);
    expect(buildRosterWorkspaceRows({ activities, enrollments, students, teachingAssignments: assignments, status: 'ARCHIVED' }).map(row => row.activity.id)).toEqual(['act_program', 'act_ensemble']);
    expect(buildRosterWorkspaceRows({ activities, enrollments, students, teachingAssignments: assignments, search: 'maya' }).map(row => row.activity.id)).toEqual([]);
    expect(buildRosterWorkspaceRows({ activities, enrollments, students, teachingAssignments: assignments, search: 'avi' }).map(row => row.activity.id)).toEqual(['act_ensemble']);
  });

  it('returns stable active student, teacher, and L2 options', () => {
    const teachers: Teacher[] = [
      { id: 't2', fullName: 'Ziv Staff', positions: [], positionAssignments: [], tags: [], phone: '', email: '', color: '#000' },
      { id: 't1', fullName: 'Ari Staff', positions: [], positionAssignments: [], tags: [], phone: '', email: '', color: '#000', isArchived: true },
    ];
    const l2s: L2Subcategory[] = [
      { id: 'l2_b', orgId: 'org1', activityId: 'act_ensemble', l1Id: null, name: 'Second', isArchived: false, createdAt: T, updatedAt: T },
      { id: 'l2_a', orgId: 'org1', activityId: 'act_ensemble', l1Id: null, name: 'First', isArchived: false, createdAt: T, updatedAt: T },
      { id: 'l2_old', orgId: 'org1', activityId: 'act_ensemble', l1Id: null, name: 'Old', isArchived: true, createdAt: T, updatedAt: T },
    ];

    expect(activeStudents(students).map(student => student.id)).toEqual(['stu_a', 'stu_b']);
    expect(activeTeachers(teachers).map(teacher => teacher.id)).toEqual(['t2']);
    expect(activityL2Options('act_ensemble', l2s).map(l2 => l2.id)).toEqual(['l2_a', 'l2_b']);
  });

  it('builds assigned-teacher roster read rows with attendance links only for prepared lesson records', () => {
    const model = buildTeacherRosterReadModel({
      event: { id: 'event_ensemble', orgId: 'org1', activityId: 'act_ensemble', l1Id: null, l2Id: 'l2_ensemble' },
      activity: activities[0],
      enrollments: [
        ...enrollments,
        { id: 'enr_c', orgId: 'org1', studentId: 'stu_b', activityId: 'act_ensemble', l2Id: 'l2_ensemble', startDate: '2026-09-01', endDate: null, status: 'ACTIVE', createdAt: T, updatedAt: T },
      ],
      students,
      teachingAssignments: assignments,
      lessonRecords: lessons,
      actor: { staffMemberId: 'staff_1' },
    });

    expect(model.state).toBe('ready');
    expect(model.sourceTeachingAssignmentIds).toEqual(['ta_1']);
    expect(model.rows.map(row => row.studentName)).toEqual(['Avi Cohen', 'Maya Levi']);
    expect(model.rows.map(row => row.lessonRecordId)).toEqual(['lesson_a', null]);
    expect(model.rows.map(row => row.attendance)).toEqual(['UNMARKED', null]);
  });

  it('denies unrelated teachers and hides non-roster event details', () => {
    const denied = buildTeacherRosterReadModel({
      event: { id: 'event_ensemble', orgId: 'org1', activityId: 'act_ensemble', l1Id: null, l2Id: 'l2_ensemble' },
      activity: activities[0],
      enrollments,
      students,
      teachingAssignments: assignments,
      lessonRecords: lessons,
      actor: { staffMemberId: 'staff_other' },
    });

    expect(denied.state).toBe('denied');
    expect(denied.rows).toEqual([]);
    expect(denied.sourceEnrollmentIds).toEqual([]);

    const notApplicable = buildTeacherRosterReadModel({
      event: { id: 'event_private', orgId: 'org1', activityId: 'act_private', l1Id: null, l2Id: null },
      activity: { id: 'act_private', orgId: 'org1', name: 'Private Piano', template: 'DISCIPLINE', activityType: 'PERFORMANCES', modules: { curriculum: true }, location: null, eventNameMode: 'AUTO', isArchived: false, createdAt: T, updatedAt: T },
      enrollments,
      students,
      teachingAssignments: assignments,
      lessonRecords: lessons,
      actor: { isAdmin: true },
    });

    expect(notApplicable.state).toBe('not_applicable');
  });
});
