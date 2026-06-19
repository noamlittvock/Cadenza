import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Student } from '../types';
import type { AgreementAcceptance, AgreementTemplate, Family, LessonRecord } from '../types/blueprint';
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

const lesson = (overrides: Partial<LessonRecord> = {}): LessonRecord => ({
  id: 'lesson_1',
  orgId: 'org_1',
  eventId: 'event_1',
  studentId: 'stu_1',
  staffMemberId: 'staff_1',
  date: '2026-06-18',
  attendance: 'PRESENT',
  completion: 'COMPLETED',
  notes: 'Worked on phrasing',
  repertoire: ['Minuet'],
  homework: 'Scales',
  makeupOfLessonId: null,
  createdAt: '2026-06-18T08:00:00.000Z',
  updatedAt: '2026-06-18T08:00:00.000Z',
  ...overrides,
});

const event: CalendarEvent = {
  id: 'event_1',
  name: 'Thursday Piano',
  description: '',
  teacherId: 'staff_1',
  roomId: 'room_1',
  start: '2026-06-18T15:00:00.000Z',
  end: '2026-06-18T16:00:00.000Z',
  isCanceled: false,
  isHidden: false,
};

const agreementTemplate = (overrides: Partial<AgreementTemplate> = {}): AgreementTemplate => ({
  id: 'template_enrollment',
  orgId: 'org_1',
  kind: 'ENROLLMENT',
  title: 'Enrollment Terms',
  version: 2,
  body: 'Terms',
  isActive: true,
  supersedesVersion: 1,
  requiresGuardian: true,
  createdAt: '2026-06-01T08:00:00.000Z',
  updatedAt: '2026-06-01T08:00:00.000Z',
  createdBy: 'admin_1',
  updatedBy: 'admin_1',
  ...overrides,
});

const agreementAcceptance = (overrides: Partial<AgreementAcceptance> = {}): AgreementAcceptance => ({
  id: 'acceptance_1',
  orgId: 'org_1',
  templateId: 'template_enrollment',
  templateVersion: 2,
  studentId: 'stu_1',
  familyId: 'fam_1',
  enrollmentId: 'asg_1',
  guardianId: 'guardian_1',
  status: 'ACCEPTED',
  acceptedAt: '2026-06-18T10:00:00.000Z',
  acceptedByName: 'Ron Cohen',
  signatureRef: 'typed://agreement_acceptances/acceptance_1',
  createdAt: '2026-06-18T09:00:00.000Z',
  updatedAt: '2026-06-18T10:00:00.000Z',
  createdBy: 'admin_1',
  updatedBy: 'admin_1',
  ...overrides,
});

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
    expect(detail?.lessonHistory).toMatchObject([
      { source: 'legacy', summary: 'Worked on scales' },
    ]);
    expect(detail?.documents.map(document => document.label)).toEqual(['ID']);
  });

  it('builds normalized lesson history from persisted lesson records without synthesizing rows', () => {
    const student = makeStudent({ pedagogicalRecord: { lessonHistory: ['Legacy note'], recitalHistory: [], reportCards: [] } });

    const detail = buildStudentDetailModel(student.id, [student], [makeFamily()], activities, [
      lesson({ id: 'older', date: '2026-06-01', attendance: 'ABSENT', completion: 'NO_SHOW', notes: null }),
      lesson(),
      lesson({ id: 'other_student', studentId: 'stu_2' }),
    ], [event]);

    expect(detail?.lessonHistory.map(row => row.id)).toEqual(['lesson_1', 'older', 'stu_1:legacy-lesson:0']);
    expect(detail?.lessonHistory[0]).toMatchObject({
      source: 'normalized',
      studentName: 'Dana Cohen',
      eventName: 'Thursday Piano',
      attendance: 'PRESENT',
      completion: 'COMPLETED',
      repertoire: ['Minuet'],
      homework: 'Scales',
      notes: 'Worked on phrasing',
    });
  });

  it('builds student agreement history and unsigned status from contextual enrollment targets', () => {
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
        {
          id: 'asg_2',
          activityId: 'act_piano',
          subcategoryId: 'l2_2',
          staffMemberId: 'staff_2',
          teachingAssignmentId: 'ta_2',
          startDate: '2026-02-01',
          status: 'ACTIVE',
        },
      ],
    });
    const family = makeFamily();
    const templates = [
      agreementTemplate(),
      agreementTemplate({ id: 'template_financial', kind: 'FINANCIAL', title: 'Financial Terms', version: 1, supersedesVersion: null }),
    ];

    const detail = buildStudentDetailModel(student.id, [student], [family], activities, [], [], templates, [
      agreementAcceptance(),
      agreementAcceptance({
        id: 'pending_financial',
        templateId: 'template_financial',
        templateVersion: 1,
        studentId: null,
        enrollmentId: null,
        status: 'PENDING',
        acceptedAt: null,
        acceptedByName: null,
        signatureRef: null,
        createdAt: '2026-06-19T09:00:00.000Z',
      }),
    ]);

    expect(detail?.agreements.history.map(row => row.id)).toEqual(['pending_financial', 'acceptance_1']);
    expect(detail?.agreements.history[1]).toMatchObject({
      templateTitle: 'Enrollment Terms',
      enrollmentLabel: 'Piano · Dana Cohen',
      guardianName: 'Ron Cohen',
      acceptedByName: 'Ron Cohen',
    });
    expect(detail?.agreements.acceptedCount).toBe(1);
    expect(detail?.agreements.pendingCount).toBe(1);
    expect(detail?.agreements.unsigned.map(row => ({
      title: row.templateTitle,
      enrollment: row.enrollmentId,
      reason: row.reason,
    }))).toEqual([
      { title: 'Enrollment Terms', enrollment: 'asg_2', reason: 'NEVER_ACCEPTED' },
      { title: 'Financial Terms', enrollment: null, reason: 'NEVER_ACCEPTED' },
    ]);
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

  it('builds family agreement history across linked students without normalizing guardians', () => {
    const students = [
      makeStudent({ id: 'stu_1', fullName: 'Dana Cohen' }),
      makeStudent({ id: 'stu_2', fullName: 'Ari Cohen' }),
    ];
    const family = makeFamily({ studentIds: ['stu_1', 'stu_2'] });

    const detail = buildFamilyDetailModel('fam_1', students, [family], activities, [], [], [
      agreementTemplate({ id: 'template_financial', kind: 'FINANCIAL', title: 'Financial Terms', version: 1, supersedesVersion: null }),
    ], [
      agreementAcceptance({
        id: 'family_acceptance',
        templateId: 'template_financial',
        templateVersion: 1,
        studentId: null,
        enrollmentId: null,
        status: 'ACCEPTED',
      }),
      agreementAcceptance({ id: 'other_family', familyId: 'fam_other', studentId: null, enrollmentId: null }),
    ]);

    expect(detail?.agreements.history.map(row => row.id)).toEqual(['family_acceptance']);
    expect(detail?.agreements.history[0]).toMatchObject({
      familyName: 'Cohen Family',
      guardianName: 'Ron Cohen',
      templateTitle: 'Financial Terms',
    });
    expect(detail?.agreements.unsigned).toEqual([]);
  });
});
