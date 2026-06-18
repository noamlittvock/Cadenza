import { describe, expect, it } from 'vitest';
import type { Student } from '../types';
import type { Family } from '../types/blueprint';
import type { ActivityV2 } from '../types/v2';
import { buildFamilyDetailModel, buildStudentDetailModel } from './studentFamilyDetail';

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'stu_1',
    orgId: 'org_1',
    fullName: 'Dana Cohen',
    dateOfBirth: '2012-03-01',
    isMinor: false,
    currentGrade: 6,
    email: 'dana@example.com',
    guardians: [{ id: 'legacy_guardian', fullName: 'Legacy Parent', phone: '050-legacy' }],
    assignments: [],
    pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
    notes: [],
    documents: [],
    profileStatus: 'ACTIVE',
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-06-02T08:00:00.000Z',
    ...overrides,
  };
}

function makeFamily(overrides: Partial<Family> = {}): Family {
  return {
    id: 'fam_1',
    orgId: 'org_1',
    name: 'Cohen Family',
    guardians: [
      {
        id: 'guardian_1',
        fullName: 'Ron Cohen',
        relationship: 'PARENT',
        phone: '050-1111111',
        email: 'ron@example.com',
        isPrimary: true,
      },
    ],
    studentIds: ['stu_1'],
    primaryContactGuardianId: 'guardian_1',
    billingNotes: 'card on file',
    isArchived: false,
    createdAt: '2026-06-01T07:00:00.000Z',
    updatedAt: '2026-06-03T08:00:00.000Z',
    createdBy: 'admin_1',
    updatedBy: 'admin_1',
    ...overrides,
  };
}

const activities: ActivityV2[] = [
  {
    id: 'act_piano',
    orgId: 'org_1',
    name: 'Piano',
    template: 'DISCIPLINE',
    activityType: 'ACADEMIC',
    modules: { curriculum: true },
    location: null,
    eventNameMode: 'AUTO',
    isArchived: false,
    createdAt: new Date('2026-06-01T00:00:00.000Z') as unknown as ActivityV2['createdAt'],
    updatedAt: new Date('2026-06-01T00:00:00.000Z') as unknown as ActivityV2['updatedAt'],
  },
];

describe('student/family detail model', () => {
  it('builds a student detail from family guardians and legacy assignment data', () => {
    const student = makeStudent({
      assignments: [
        {
          id: 'asg_1',
          activityId: 'act_piano',
          subcategoryId: 'l2_1',
          staffMemberId: 'staff_1',
          teachingAssignmentId: 'ta_1',
          startDate: '2026-01-01',
          status: 'ACTIVE',
        },
      ],
      pedagogicalRecord: {
        lessonHistory: ['Worked on scales'],
        recitalHistory: [],
        reportCards: [],
      },
      documents: [{ id: 'doc_1', label: 'ID', url: '/id.pdf', uploadedAt: '2026-06-01T08:00:00.000Z', uploadedBy: 'admin_1' }],
    });

    const detail = buildStudentDetailModel(student.id, [student], [makeFamily()], activities);

    expect(detail?.family?.name).toBe('Cohen Family');
    expect(detail?.guardians.map(guardian => guardian.fullName)).toEqual(['Ron Cohen']);
    expect(detail?.enrollments).toMatchObject([
      { id: 'asg_1', studentName: 'Dana Cohen', activityName: 'Piano', status: 'ACTIVE' },
    ]);
    expect(detail?.lessonHistory).toEqual(['Worked on scales']);
    expect(detail?.documents.map(document => document.label)).toEqual(['ID']);
  });

  it('falls back to legacy student guardians when no family is linked', () => {
    const detail = buildStudentDetailModel('stu_1', [makeStudent()], [], activities);

    expect(detail?.family).toBeNull();
    expect(detail?.guardians).toMatchObject([
      { id: 'legacy_guardian', fullName: 'Legacy Parent', phone: '050-legacy', isPrimary: true },
    ]);
  });

  it('builds a family detail with linked students, enrollment rows, and timeline', () => {
    const students = [
      makeStudent({
        id: 'stu_1',
        fullName: 'Dana Cohen',
        assignments: [
          {
            id: 'asg_1',
            activityId: 'act_piano',
            subcategoryId: 'l2_1',
            staffMemberId: 'staff_1',
            teachingAssignmentId: 'ta_1',
            startDate: '2026-01-01',
            status: 'ACTIVE',
          },
        ],
      }),
      makeStudent({ id: 'stu_2', fullName: 'Ari Cohen', updatedAt: '2026-06-04T08:00:00.000Z' }),
    ];

    const detail = buildFamilyDetailModel('fam_1', students, [makeFamily({ studentIds: ['stu_1', 'stu_2'] })], activities);

    expect(detail?.linkedStudents.map(student => student.fullName)).toEqual(['Dana Cohen', 'Ari Cohen']);
    expect(detail?.enrollments.map(row => row.studentName)).toEqual(['Dana Cohen']);
    expect(detail?.timeline[0]).toMatchObject({ label: 'student_updated', at: '2026-06-04T08:00:00.000Z' });
  });
});
