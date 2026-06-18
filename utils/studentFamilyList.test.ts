import { describe, expect, it } from 'vitest';
import type { Student } from '../types';
import type { Family } from '../types/blueprint';
import {
  buildFamilyRows,
  buildStudentFamilyActivityOptions,
  buildStudentFamilyListModel,
  buildStudentRows,
} from './studentFamilyList';

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'stu_1',
    orgId: 'org_1',
    fullName: 'Dana Cohen',
    dateOfBirth: '2012-03-01',
    isMinor: false,
    currentGrade: 6,
    governmentalId: undefined,
    phone: undefined,
    email: 'dana@example.com',
    guardians: [],
    assignments: [],
    pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
    notes: [],
    documents: [],
    profileStatus: 'ACTIVE',
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-06-01T08:00:00.000Z',
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
    billingNotes: null,
    isArchived: false,
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-06-01T08:00:00.000Z',
    createdBy: 'admin_1',
    updatedBy: 'admin_1',
    ...overrides,
  };
}

describe('student/family list model', () => {
  it('builds student rows from families.guardians[] and falls back to legacy guardians only when unlinked', () => {
    const linked = makeStudent({ id: 'stu_1', fullName: 'Dana Cohen' });
    const unlinked = makeStudent({
      id: 'stu_2',
      fullName: 'Noa Levi',
      guardians: [{ id: 'legacy_guardian', fullName: 'Legacy Parent', phone: '050-2222222' }],
    });

    const rows = buildStudentRows([unlinked, linked], [makeFamily()]);

    expect(rows.find(row => row.id === 'stu_1')).toMatchObject({
      familyName: 'Cohen Family',
      guardianNames: ['Ron Cohen'],
      guardianContact: '050-1111111 · ron@example.com',
    });
    expect(rows.find(row => row.id === 'stu_2')).toMatchObject({
      familyName: '',
      guardianNames: ['Legacy Parent'],
      guardianContact: '050-2222222',
    });
  });

  it('filters student mode by guardian search, active status, and activity', () => {
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
      makeStudent({
        id: 'stu_2',
        fullName: 'Ari Levi',
        profileStatus: 'ARCHIVED',
        assignments: [
          {
            id: 'asg_2',
            activityId: 'act_violin',
            subcategoryId: 'l2_2',
            staffMemberId: 'staff_2',
            teachingAssignmentId: 'ta_2',
            startDate: '2026-01-01',
            status: 'ACTIVE',
          },
        ],
      }),
    ];
    const families = [
      makeFamily({ id: 'fam_1', guardians: [{ ...makeFamily().guardians[0], fullName: 'Ron Cohen' }], studentIds: ['stu_1'] }),
      makeFamily({ id: 'fam_2', name: 'Levi Family', guardians: [{ ...makeFamily().guardians[0], id: 'guardian_2', fullName: 'Maya Levi' }], studentIds: ['stu_2'] }),
    ];

    const model = buildStudentFamilyListModel(students, families, {
      mode: 'students',
      query: 'ron',
      status: 'active',
      activityId: 'act_piano',
    });

    expect(model.rows.map(row => row.id)).toEqual(['stu_1']);
    expect(model.totalStudents).toBe(2);
    expect(model.activeStudents).toBe(1);
    expect(model.archivedStudents).toBe(1);
  });

  it('builds family mode rows and filters by linked student activity', () => {
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
      makeStudent({ id: 'stu_2', fullName: 'Ari Cohen', profileStatus: 'ARCHIVED' }),
    ];
    const family = makeFamily({ studentIds: ['stu_1', 'stu_2'] });

    const rows = buildFamilyRows(students, [family]);
    expect(rows[0]).toMatchObject({
      id: 'fam_1',
      studentNames: ['Ari Cohen', 'Dana Cohen'],
      studentCount: 2,
      activeStudentCount: 1,
      activityIds: ['act_piano'],
    });

    const model = buildStudentFamilyListModel(students, [family], {
      mode: 'families',
      query: 'ari',
      status: 'active',
      activityId: 'act_piano',
    });
    expect(model.rows.map(row => row.id)).toEqual(['fam_1']);
  });

  it('returns activity options from active assignments with labels', () => {
    const options = buildStudentFamilyActivityOptions(
      [
        makeStudent({
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
            {
              id: 'asg_2',
              activityId: 'act_violin',
              subcategoryId: 'l2_2',
              staffMemberId: 'staff_2',
              teachingAssignmentId: 'ta_2',
              startDate: '2026-01-01',
              status: 'ARCHIVED',
            },
          ],
        }),
      ],
      { act_piano: 'Piano' },
    );

    expect(options).toEqual([{ id: 'act_piano', label: 'Piano' }]);
  });
});
