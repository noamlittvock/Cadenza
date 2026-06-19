import { describe, it, expect } from 'vitest';
import type {
  RegistrationIntake, Family, LessonRecord, OperationalRequest, ExamSession,
  ExaminerSubmission, Certificate, ConcertProgram, HoursEntry, Charge, Payment,
  Adjustment, AgreementTemplate, AgreementAcceptance, Instrument, InstrumentLoan,
  InstrumentRepair, StaffEvaluation, ReportDefinition, PublicEndpoint,
} from '../types/blueprint';
import * as Q from './blueprintQueries';
import type { MinimalStudent, MinimalEnrollment, MinimalEvent, MinimalParticipant, MinimalActivity } from './blueprintQueries';

const T = '2026-06-16T10:00:00.000Z';
const base = { orgId: 'org1', createdAt: T, updatedAt: T };

// ─── fixtures ────────────────────────────────────────────────────────────────
const students: MinimalStudent[] = [
  { id: 's1', fullName: 'Avi Cohen', familyId: 'f1' },
  { id: 's2', fullName: 'Maya Levi', familyId: 'f1' },
  { id: 's3', fullName: 'Avi Cohen Jr', familyId: 'f2' },
  { id: 's4', fullName: 'Old Student', isArchived: true },
];

describe('intake', () => {
  const intake: RegistrationIntake[] = [
    { ...base, id: 'i1', status: 'PENDING', source: 'WEBSITE', submittedAt: '2026-06-10T09:00:00.000Z', studentFullName: 'Avi Cohen', studentDateOfBirth: null, instrument: 'Violin', requestedActivityId: null, notes: null, guardians: [], consentAccepted: true, consentAgreementId: null },
    { ...base, id: 'i2', status: 'CONVERTED', source: 'WEBSITE', submittedAt: '2026-06-09T09:00:00.000Z', studentFullName: 'Done Person', studentDateOfBirth: null, instrument: null, requestedActivityId: null, notes: null, guardians: [], consentAccepted: true, consentAgreementId: null },
    { ...base, id: 'i3', status: 'IN_REVIEW', source: 'MANUAL', submittedAt: '2026-06-08T09:00:00.000Z', studentFullName: 'New Kid', studentDateOfBirth: null, instrument: null, requestedActivityId: null, notes: null, guardians: [], consentAccepted: false, consentAgreementId: null },
    { ...base, id: 'i4', status: 'APPROVED', source: 'WEBSITE', submittedAt: '2026-06-07T09:00:00.000Z', studentFullName: 'Approved Person', studentDateOfBirth: null, instrument: null, requestedActivityId: null, notes: null, guardians: [], consentAccepted: true, consentAgreementId: null },
    { ...base, id: 'i5', status: 'REJECTED', source: 'WEBSITE', submittedAt: '2026-06-06T09:00:00.000Z', studentFullName: 'Rejected Person', studentDateOfBirth: null, instrument: null, requestedActivityId: null, notes: null, guardians: [], consentAccepted: true, consentAgreementId: null },
    { ...base, id: 'i6', status: 'DUPLICATE', source: 'WEBSITE', submittedAt: '2026-06-05T09:00:00.000Z', studentFullName: 'Duplicate Person', studentDateOfBirth: null, instrument: null, requestedActivityId: null, notes: null, guardians: [], consentAccepted: true, consentAgreementId: null },
  ];
  it('listPendingIntake returns pending+in-review sorted by submittedAt', () => {
    const r = Q.listPendingIntake(intake);
    expect(r.map(x => x.id)).toEqual(['i3', 'i1']);
  });
  it('suggestStudentDuplicates ranks by name similarity', () => {
    const r = Q.suggestStudentDuplicates(intake[0], students);
    expect(r[0].studentId).toBe('s1');
    expect(r[0].score).toBe(1);
    expect(r.some(d => d.studentId === 's4')).toBe(false); // archived excluded
  });
  it('approveIntakeRecord converts into the full student/family/enrollment graph', () => {
    const source: RegistrationIntake = {
      ...intake[0],
      requestedActivityId: 'activity_1',
      guardians: [
        { id: 'g1', fullName: 'Dana Cohen', relationship: 'PARENT', phone: '050-111', email: 'dana@example.com', isPrimary: true },
      ],
      consentAgreementId: 'template_1',
    };
    const graph = Q.approveIntakeRecord(source, {
      studentId: 'stu_new',
      familyId: 'fam_new',
      enrollmentId: 'enr_new',
      agreementRequestId: 'agreement_request_new',
      inboxItemId: 'inbox_new',
      now: T,
      reviewedBy: 'admin',
      l2Id: 'l2_1',
      enrollmentStartDate: '2026-09-01',
      agreementTemplateVersion: 3,
    });
    const { intake: out, student, family, enrollment, agreementRequest, inboxHistoryItem } = graph;

    expect(out.status).toBe('CONVERTED');
    expect(out.convertedStudentId).toBe('stu_new');
    expect(out.convertedEnrollmentId).toBe('enr_new');
    expect(out.reviewedBy).toBe('admin');
    expect(out.reviewedAt).toBe(T);
    expect(out.updatedAt).toBe(T);
    expect(out.updatedBy).toBe('admin');
    expect(out.consentAccepted).toBe(true);
    expect(out.statusHistory).toEqual([
      {
        id: `i1:${T}:CONVERTED:1`,
        status: 'CONVERTED',
        fromStatus: 'PENDING',
        at: T,
        by: 'admin',
        note: 'Converted to student/family/enrollment graph.',
        relatedEntityIds: ['i1', 'stu_new', 'fam_new', 'enr_new', 'agreement_request_new'],
      },
    ]);
    expect(student.fullName).toBe('Avi Cohen');
    expect(student.id).toBe('stu_new');
    expect(student.orgId).toBe('org1');
    expect(student.dateOfBirth).toBe(source.studentDateOfBirth);
    expect(student.parentName).toBe('Dana Cohen');
    expect(student.parentPhone).toBe('050-111');
    expect(student.email).toBe('dana@example.com');
    expect(student.startDate).toBe('2026-09-01');
    expect(student.tags).toEqual(['Violin']);
    expect(student.isArchived).toBe(false);
    expect(family).toMatchObject({
      id: 'fam_new',
      orgId: 'org1',
      name: 'Cohen Family',
      studentIds: ['stu_new'],
      primaryContactGuardianId: 'g1',
      isArchived: false,
      createdBy: 'admin',
      updatedBy: 'admin',
    });
    expect(family.guardians).toEqual(source.guardians);
    expect(enrollment).toMatchObject({
      id: 'enr_new',
      orgId: 'org1',
      studentId: 'stu_new',
      activityId: 'activity_1',
      l2Id: 'l2_1',
      startDate: '2026-09-01',
      endDate: null,
      status: 'ACTIVE',
    });
    expect(agreementRequest).toMatchObject({
      id: 'agreement_request_new',
      orgId: 'org1',
      templateId: 'template_1',
      templateVersion: 3,
      studentId: 'stu_new',
      familyId: 'fam_new',
      enrollmentId: 'enr_new',
      guardianId: 'g1',
      status: 'PENDING',
      createdBy: 'admin',
      updatedBy: 'admin',
    });
    expect(inboxHistoryItem).toMatchObject({
      id: 'inbox_new',
      orgId: 'org1',
      type: 'APPROVAL_REQUEST',
      status: 'APPROVED',
      relatedEntityType: 'registration_intake',
      relatedEntityIds: ['i1', 'stu_new', 'fam_new', 'enr_new', 'agreement_request_new'],
      decidedBy: 'admin',
      decidedAt: T,
      markedDoneAt: T,
      markedDoneBy: 'admin',
    });
    expect(source.status).toBe('PENDING');
  });

  it('approveIntakeRecord requires resolved enrollment placement', () => {
    expect(() => Q.approveIntakeRecord(intake[0], {
      studentId: 'stu_new',
      familyId: 'fam_new',
      enrollmentId: 'enr_new',
      agreementRequestId: 'agreement_request_new',
      inboxItemId: 'inbox_new',
      now: T,
      reviewedBy: 'admin',
      l2Id: 'l2_1',
      enrollmentStartDate: '2026-09-01',
    })).toThrow('activityId');
    expect(() => Q.approveIntakeRecord({ ...intake[0], requestedActivityId: 'activity_1' }, {
      studentId: 'stu_new',
      familyId: 'fam_new',
      enrollmentId: 'enr_new',
      agreementRequestId: 'agreement_request_new',
      inboxItemId: 'inbox_new',
      now: T,
      reviewedBy: 'admin',
      l2Id: '',
      enrollmentStartDate: '2026-09-01',
    })).toThrow('l2Id');
  });

  it('rejectIntakeRecord records rejection lineage and inbox history', () => {
    const { intake: out, inboxHistoryItem } = Q.rejectIntakeRecord(intake[0], {
      inboxItemId: 'inbox_reject',
      now: T,
      reviewedBy: 'admin',
      reason: 'Outside current program scope',
    });

    expect(out.status).toBe('REJECTED');
    expect(out.reviewedBy).toBe('admin');
    expect(out.reviewedAt).toBe(T);
    expect(out.rejectionReason).toBe('Outside current program scope');
    expect(out.convertedStudentId).toBeUndefined();
    expect(out.statusHistory?.[0]).toMatchObject({
      id: `i1:${T}:REJECTED:1`,
      status: 'REJECTED',
      fromStatus: 'PENDING',
      at: T,
      by: 'admin',
      note: 'Outside current program scope',
      relatedEntityIds: ['i1'],
    });
    expect(inboxHistoryItem).toMatchObject({
      id: 'inbox_reject',
      status: 'REJECTED',
      decisionNote: 'Outside current program scope',
      relatedEntityIds: ['i1'],
      decidedBy: 'admin',
      markedDoneBy: 'admin',
    });
    expect(intake[0].status).toBe('PENDING');
  });

  it('markIntakeDuplicate records duplicate lineage and inbox history', () => {
    const { intake: out, inboxHistoryItem } = Q.markIntakeDuplicate(intake[0], {
      inboxItemId: 'inbox_duplicate',
      now: T,
      reviewedBy: 'admin',
      duplicateOfStudentId: 's1',
      note: 'Same guardian confirmed existing student.',
    });

    expect(out.status).toBe('DUPLICATE');
    expect(out.duplicateOfStudentId).toBe('s1');
    expect(out.reviewedBy).toBe('admin');
    expect(out.reviewedAt).toBe(T);
    expect(out.statusHistory?.[0]).toMatchObject({
      id: `i1:${T}:DUPLICATE:1`,
      status: 'DUPLICATE',
      fromStatus: 'PENDING',
      at: T,
      by: 'admin',
      note: 'Same guardian confirmed existing student.',
      relatedEntityIds: ['i1', 's1'],
    });
    expect(inboxHistoryItem).toMatchObject({
      id: 'inbox_duplicate',
      status: 'REJECTED',
      decisionNote: 'Same guardian confirmed existing student.',
      relatedEntityIds: ['i1', 's1'],
      decidedBy: 'admin',
      markedDoneBy: 'admin',
    });
  });

  describe('public endpoint contract', () => {
    const endpoints: PublicEndpoint[] = [
      {
        ...base,
        id: 'endpoint_registration',
        orgId: 'org1',
        kind: 'REGISTRATION_INTAKE',
        label: 'Fall registration',
        tokenHash: 'hash_registration',
        status: 'ACTIVE',
        scopes: [Q.REGISTRATION_INTAKE_PUBLIC_SCOPE],
        targetId: 'activity_1',
        consentAgreementId: 'consent_template_1',
        expiresAt: '2026-07-01T00:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
      },
      {
        ...base,
        id: 'endpoint_hours',
        orgId: 'org1',
        kind: 'HOURS_REPORT',
        label: 'Hours report',
        tokenHash: 'hash_hours',
        status: 'ACTIVE',
        scopes: ['hours_report:submit'],
        targetId: 'report_1',
        consentAgreementId: null,
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
      },
    ];

    it('resolves an active registration endpoint to public-safe config', () => {
      const resolved = Q.resolveRegistrationIntakeEndpoint(endpoints, {
        tokenHash: 'hash_registration',
        now: T,
      });

      expect(resolved).toEqual({
        ok: true,
        endpoint: {
          endpointId: 'endpoint_registration',
          orgId: 'org1',
          kind: 'REGISTRATION_INTAKE',
          label: 'Fall registration',
          scopes: [Q.REGISTRATION_INTAKE_PUBLIC_SCOPE],
          targetId: 'activity_1',
          consentAgreementId: 'consent_template_1',
        },
      });
      if (resolved.ok) {
        expect('tokenHash' in resolved.endpoint).toBe(false);
        expect('createdBy' in resolved.endpoint).toBe(false);
      }
    });

    it('rejects missing, wrong-kind, inactive, and expired endpoint records', () => {
      expect(Q.resolveRegistrationIntakeEndpoint(endpoints, {
        tokenHash: 'missing_hash',
        now: T,
      })).toEqual({ ok: false, reason: 'NOT_FOUND' });

      expect(Q.resolveRegistrationIntakeEndpoint(endpoints, {
        tokenHash: 'hash_hours',
        now: T,
      })).toEqual({ ok: false, reason: 'WRONG_KIND' });

      expect(Q.resolveRegistrationIntakeEndpoint([
        { ...endpoints[0], status: 'REVOKED', revokedAt: T },
      ], {
        tokenHash: 'hash_registration',
        now: T,
      })).toEqual({ ok: false, reason: 'INACTIVE' });

      expect(Q.resolveRegistrationIntakeEndpoint(endpoints, {
        tokenHash: 'hash_registration',
        now: '2026-07-01T00:00:00.000Z',
      })).toEqual({ ok: false, reason: 'EXPIRED' });
    });

    it('requires registration submit scope and consent setup', () => {
      expect(Q.resolveRegistrationIntakeEndpoint([
        { ...endpoints[0], scopes: ['registration_intake:read'] },
      ], {
        tokenHash: 'hash_registration',
        now: T,
      })).toEqual({ ok: false, reason: 'MISSING_SCOPE' });

      expect(Q.resolveRegistrationIntakeEndpoint([
        { ...endpoints[0], consentAgreementId: null },
      ], {
        tokenHash: 'hash_registration',
        now: T,
      })).toEqual({ ok: false, reason: 'MISSING_CONSENT' });
    });
  });
});

describe('students/family', () => {
  const families: Family[] = [
    { ...base, id: 'f1', name: 'Cohen-Levi', guardians: [{ id: 'g1', fullName: 'Dana Cohen', relationship: 'PARENT', phone: '050-111', email: 'dana@x.com', isPrimary: true }], studentIds: ['s1', 's2'], primaryContactGuardianId: 'g1', billingNotes: null, isArchived: false },
  ];
  it('findStudentByName matches substring case-insensitively', () => {
    expect(Q.findStudentByName(students, 'avi').map(s => s.id)).toEqual(['s1', 's3']);
    expect(Q.findStudentByName(students, '')).toEqual([]);
  });
  it('listStudentsByGuardian resolves via phone/email/name', () => {
    const byPhone = Q.listStudentsByGuardian(families, students, '050-111');
    expect(byPhone).toHaveLength(1);
    expect(byPhone[0].students.map(s => s.id)).toEqual(['s1', 's2']);
    expect(Q.listStudentsByGuardian(families, students, 'dana@x.com')).toHaveLength(1);
  });
  it('listStudentEnrollments filters + sorts by startDate', () => {
    const enr: MinimalEnrollment[] = [
      { id: 'e2', studentId: 's1', activityId: 'a1', startDate: '2026-02-01' },
      { id: 'e1', studentId: 's1', activityId: 'a2', startDate: '2026-01-01' },
      { id: 'e3', studentId: 's2', activityId: 'a1', startDate: '2026-01-01' },
    ];
    expect(Q.listStudentEnrollments(enr, 's1').map(e => e.id)).toEqual(['e1', 'e2']);
  });
});

describe('rooms/absence requests', () => {
  const reqs: OperationalRequest[] = [
    { ...base, id: 'r1', kind: 'ROOM_CHANGE', status: 'PENDING', requestedByStaffId: 't1', requestedFor: '2026-06-20', endDate: null, eventId: 'ev1', currentRoomId: 'rm1', requestedRoomId: 'rm2', reason: 'piano needed' },
    { ...base, id: 'r2', kind: 'ABSENCE', status: 'PENDING', requestedByStaffId: 't1', requestedFor: '2026-06-18', endDate: '2026-06-19', eventId: null, currentRoomId: null, requestedRoomId: null, reason: 'sick' },
    { ...base, id: 'r3', kind: 'DAY_OFF', status: 'APPROVED', requestedByStaffId: 't2', requestedFor: '2026-07-01', endDate: null, eventId: null, currentRoomId: null, requestedRoomId: null, reason: null },
  ];
  it('listRoomRequests filters kind + optional status', () => {
    expect(Q.listRoomRequests(reqs).map(r => r.id)).toEqual(['r1']);
    expect(Q.listRoomRequests(reqs, 'APPROVED')).toEqual([]);
  });
  it('listAbsencesForPeriod uses range overlap', () => {
    expect(Q.listAbsencesForPeriod(reqs, '2026-06-19', '2026-06-30').map(r => r.id)).toEqual(['r2']);
    expect(Q.listAbsencesForPeriod(reqs, '2026-07-01', '2026-07-31').map(r => r.id)).toEqual(['r3']);
  });
  it('applyApprovedRoomChange yields the mutation or null', () => {
    const res = Q.applyApprovedRoomChange(reqs[0], { now: T, decidedBy: 'admin' });
    expect(res?.newRoomId).toBe('rm2');
    expect(res?.request.status).toBe('APPROVED');
    expect(Q.applyApprovedRoomChange(reqs[1], { now: T })).toBeNull();
  });
});

describe('ensembles/theory/programs', () => {
  const activities: MinimalActivity[] = [
    { id: 'a1', name: 'Youth Orchestra', template: 'ENSEMBLE' },
    { id: 'a2', name: 'Music Theory 101', template: 'DISCIPLINE', activityType: 'ACADEMIC' },
    { id: 'a3', name: 'After School Program', template: 'PROGRAM' },
    { id: 'a4', name: 'Archived Band', template: 'ENSEMBLE', isArchived: true },
  ];
  const enr: MinimalEnrollment[] = [
    { id: 'e1', studentId: 's1', activityId: 'a1', status: 'ACTIVE' },
    { id: 'e2', studentId: 's2', activityId: 'a1', status: 'ACTIVE' },
    { id: 'e3', studentId: 's1', activityId: 'a2', status: 'ACTIVE' },
    { id: 'e4', studentId: 's3', activityId: 'a3', status: 'ACTIVE' },
  ];
  it('listEnsembleRosters returns active ensemble rosters only', () => {
    const r = Q.listEnsembleRosters(activities, enr, students);
    expect(r).toHaveLength(1);
    expect(r[0].studentIds.sort()).toEqual(['s1', 's2']);
  });
  it('listTheoryGroups matches academic/theory', () => {
    expect(Q.listTheoryGroups(activities, enr, students).map(r => r.activity.id)).toEqual(['a2']);
  });
  it('listSchoolProgramStudents matches PROGRAM template', () => {
    const r = Q.listSchoolProgramStudents(activities, enr, students);
    expect(r[0].activity.id).toBe('a3');
    expect(r[0].students[0].id).toBe('s3');
  });
});

describe('lessons/attendance', () => {
  const mk = (id: string, studentId: string, date: string, attendance: LessonRecord['attendance'], completion: LessonRecord['completion']): LessonRecord =>
    ({ ...base, id, eventId: 'ev1', studentId, staffMemberId: 't1', date, attendance, completion, notes: null, repertoire: [], homework: null, makeupOfLessonId: null });
  const lessons = [
    mk('l1', 's1', '2026-06-01', 'PRESENT', 'COMPLETED'),
    mk('l2', 's1', '2026-06-08', 'UNMARKED', 'PENDING'),
    mk('l3', 's1', '2026-06-15', 'ABSENT', 'NO_SHOW'),
    mk('l4', 's2', '2026-06-01', 'PRESENT', 'CANCELLED'),
  ];
  it('listStudentLessonHistory filters + date-sorts', () => {
    expect(Q.listStudentLessonHistory(lessons, 's1').map(l => l.id)).toEqual(['l1', 'l2', 'l3']);
  });
  it('listUnmarkedAttendance respects cutoff', () => {
    expect(Q.listUnmarkedAttendance(lessons).map(l => l.id)).toEqual(['l2']);
    expect(Q.listUnmarkedAttendance(lessons, '2026-06-05')).toEqual([]);
  });
  it('listUnmarkedAttendance includes cutoff date and sorts existing rows only', () => {
    const unmarked = [
      mk('future', 's1', '2026-06-20', 'UNMARKED', 'PENDING'),
      mk('cutoff', 's2', '2026-06-18', 'UNMARKED', 'PENDING'),
      mk('past', 's3', '2026-06-10', 'UNMARKED', 'PENDING'),
      mk('marked', 's4', '2026-06-01', 'EXCUSED', 'PENDING'),
    ];

    expect(Q.listUnmarkedAttendance(unmarked, '2026-06-18').map(l => l.id)).toEqual(['past', 'cutoff']);
  });
  it('summarizeLessonCompletion computes rates excluding cancelled', () => {
    const sum = Q.summarizeLessonCompletion(lessons);
    expect(sum.total).toBe(4);
    expect(sum.completed).toBe(1);
    expect(sum.cancelled).toBe(1);
    expect(sum.completionRate).toBeCloseTo(1 / 3);
    expect(sum.attendance.PRESENT).toBe(2);
  });
  it('summarizeLessonCompletion counts every attendance enum and no-show/pending buckets', () => {
    const summary = Q.summarizeLessonCompletion([
      mk('u', 's1', '2026-06-01', 'UNMARKED', 'PENDING'),
      mk('p', 's1', '2026-06-02', 'PRESENT', 'COMPLETED'),
      mk('a', 's1', '2026-06-03', 'ABSENT', 'NO_SHOW'),
      mk('l', 's1', '2026-06-04', 'LATE', 'COMPLETED'),
      mk('e', 's1', '2026-06-05', 'EXCUSED', 'PENDING'),
      mk('m', 's1', '2026-06-06', 'MAKEUP', 'CANCELLED'),
    ]);

    expect(summary.attendance).toEqual({
      UNMARKED: 1,
      PRESENT: 1,
      ABSENT: 1,
      LATE: 1,
      EXCUSED: 1,
      MAKEUP: 1,
    });
    expect(summary).toMatchObject({
      total: 6,
      completed: 2,
      cancelled: 1,
      noShow: 1,
      pending: 2,
    });
    expect(summary.completionRate).toBeCloseTo(2 / 5);
  });
  it('summarizeLessonCompletion returns zero rate when every row is cancelled', () => {
    const summary = Q.summarizeLessonCompletion([
      mk('c1', 's1', '2026-06-01', 'EXCUSED', 'CANCELLED'),
      mk('c2', 's2', '2026-06-01', 'MAKEUP', 'CANCELLED'),
    ]);

    expect(summary.completionRate).toBe(0);
  });
});

describe('exams/certificates', () => {
  const sessions: ExamSession[] = [
    { ...base, id: 'x1', name: 'Spring Recital Exam', activityId: null, date: '2026-05-01', status: 'GRADED', examinerStaffIds: ['t1'], studentIds: ['s1'], notes: null },
    { ...base, id: 'x2', name: 'Summer Exam', activityId: null, date: '2026-08-01', status: 'SCHEDULED', examinerStaffIds: [], studentIds: [], notes: null },
  ];
  const subs: ExaminerSubmission[] = [
    { ...base, id: 'sub1', examSessionId: 'x1', studentId: 's1', examinerStaffId: 't1', score: 88, grade: 'A', remarks: null, submittedAt: '2026-05-02T10:00:00.000Z' },
    { ...base, id: 'sub2', examSessionId: 'x1', studentId: 's1', examinerStaffId: 't2', score: 92, grade: 'A', remarks: null, submittedAt: '2026-05-02T11:00:00.000Z' },
  ];
  const certs: Certificate[] = [
    { ...base, id: 'c1', studentId: 's1', examSessionId: 'x1', title: 'Grade 3 Violin', level: '3', status: 'ISSUED', issuedAt: T, documentUrl: null, documentPath: null },
    { ...base, id: 'c2', studentId: 's2', examSessionId: null, title: 'Pending Cert', level: null, status: 'PENDING', issuedAt: null, documentUrl: null, documentPath: null },
  ];
  it('listExamSessions filters by status', () => {
    expect(Q.listExamSessions(sessions, 'SCHEDULED').map(s => s.id)).toEqual(['x2']);
  });
  it('getStudentAssessmentSummary averages scores + counts certs', () => {
    const s = Q.getStudentAssessmentSummary('s1', subs, certs);
    expect(s.examCount).toBe(2);
    expect(s.averageScore).toBe(90);
    expect(s.certificates).toBe(1);
  });
  it('listPendingCertificates returns only pending', () => {
    expect(Q.listPendingCertificates(certs).map(c => c.id)).toEqual(['c2']);
  });
});

describe('concert programs', () => {
  const programs: ConcertProgram[] = [
    { ...base, id: 'p1', title: 'Winter Concert', eventId: 'ev9', date: '2026-12-01', venue: 'Hall A', status: 'PUBLISHED', notes: null, pieces: [
      { order: 2, title: 'Piece B', composer: 'Bach', performerStudentIds: ['s2'], performerStaffIds: [], durationMinutes: 5 },
      { order: 1, title: 'Piece A', composer: 'Mozart', performerStudentIds: ['s1'], performerStaffIds: ['t1'], durationMinutes: 10 },
    ] },
    { ...base, id: 'p2', title: 'Draft Show', eventId: null, date: '2026-11-01', venue: null, status: 'DRAFT', notes: null, pieces: [] },
  ];
  it('listConcertPrograms filters by status + date-sorts', () => {
    expect(Q.listConcertPrograms(programs, 'PUBLISHED').map(p => p.id)).toEqual(['p1']);
  });
  it('getProgramRunOfShow orders pieces + cumulative duration', () => {
    const ros = Q.getProgramRunOfShow(programs[0]);
    expect(ros.map(r => r.title)).toEqual(['Piece A', 'Piece B']);
    expect(ros[1].cumulativeMinutes).toBe(15);
    expect(ros[0].performers).toBe(2);
  });
  it('listPerformerEvents finds programs by performer', () => {
    expect(Q.listPerformerEvents(programs, 's1').map(p => p.id)).toEqual(['p1']);
    expect(Q.listPerformerEvents(programs, 't1').map(p => p.id)).toEqual(['p1']);
  });
});

describe('payroll/hours', () => {
  const entries: HoursEntry[] = [
    { ...base, id: 'h1', staffMemberId: 't1', hoursReportId: null, date: '2026-06-01', reportedMinutes: 120, calendarMinutes: 120, eventId: 'ev1', teachingAssignmentId: null, orgRoleId: null, rate: 100, status: 'APPROVED', note: null },
    { ...base, id: 'h2', staffMemberId: 't1', hoursReportId: null, date: '2026-06-02', reportedMinutes: 90, calendarMinutes: 60, eventId: 'ev2', teachingAssignmentId: null, orgRoleId: null, rate: 100, status: 'SUBMITTED', note: null },
    { ...base, id: 'h3', staffMemberId: 't1', hoursReportId: null, date: '2026-06-03', reportedMinutes: 30, calendarMinutes: 30, eventId: 'ev3', teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'DRAFT', note: null },
    { ...base, id: 'h4', staffMemberId: 't1', hoursReportId: null, date: '2026-06-04', reportedMinutes: 60, calendarMinutes: 60, eventId: 'ev4', teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'APPROVED', note: null },
    { ...base, id: 'h5', staffMemberId: 't1', hoursReportId: null, date: '2026-06-05', reportedMinutes: 45, calendarMinutes: 45, eventId: 'ev5', teachingAssignmentId: null, orgRoleId: null, rate: 80, status: 'PAID', note: null },
    { ...base, id: 'h6', staffMemberId: 't2', hoursReportId: null, date: '2026-06-01', reportedMinutes: 60, calendarMinutes: 60, eventId: 'ev1', teachingAssignmentId: null, orgRoleId: null, rate: 90, status: 'SUBMITTED', note: null },
  ];
  const events: MinimalEvent[] = [
    { id: 'ev1', date: '2026-06-01', durationMinutes: 120 },
    { id: 'ev2', date: '2026-06-02', durationMinutes: 60 },
    { id: 'ev3', date: '2026-06-03', durationMinutes: 30 },
    { id: 'ev4', date: '2026-06-04', durationMinutes: 60 },
    { id: 'ev5', date: '2026-06-05' },
  ];
  const participants: MinimalParticipant[] = [
    { eventId: 'ev1', staffMemberId: 't1' },
    { eventId: 'ev2', staffMemberId: 't1' },
    { eventId: 'ev3', staffMemberId: 't1' },
    { eventId: 'ev4', staffMemberId: 't1' },
    { eventId: 'ev5', staffMemberId: 't1' },
    { eventId: 'ev_missing', staffMemberId: 't1' },
    { eventId: 'ev1', staffMemberId: 't2' },
  ];
  it('listPendingHoursReports returns draft/submitted', () => {
    expect(Q.listPendingHoursReports(entries).map(e => e.id)).toEqual(['h6', 'h2', 'h3']);
  });
  it('compareReportedVsCalendarHours computes variance + lineage', () => {
    const rec = Q.compareReportedVsCalendarHours('t1', entries, events, participants);
    expect(rec.reportedMinutes).toBe(345);
    expect(rec.calendarMinutes).toBe(270);
    expect(rec.varianceMinutes).toBe(75);
    expect(rec.sourceEntryIds).toEqual(['h1', 'h2', 'h3', 'h4', 'h5']);
    expect(rec.matchesCalendar).toBe(false);
  });
  it('compareReportedVsCalendarHours handles exact matches and missing calendar duration', () => {
    const rec = Q.compareReportedVsCalendarHours('t2', entries, events, participants);
    expect(rec).toMatchObject({
      staffMemberId: 't2',
      reportedMinutes: 60,
      calendarMinutes: 120,
      varianceMinutes: -60,
      entries: 1,
      sourceEntryIds: ['h6'],
      matchesCalendar: false,
    });

    const exact = Q.compareReportedVsCalendarHours(
      't3',
      [{ ...entries[0], id: 'h7', staffMemberId: 't3', reportedMinutes: 45, eventId: 'ev6' }],
      [{ id: 'ev6', date: '2026-06-06', durationMinutes: 45 }],
      [{ eventId: 'ev6', staffMemberId: 't3' }],
    );
    expect(exact.matchesCalendar).toBe(true);
    expect(exact.varianceMinutes).toBe(0);
  });
  it('calculatePayslipRows only includes approved/paid with rate', () => {
    const rows = Q.calculatePayslipRows(entries);
    expect(rows).toHaveLength(2);
    expect(rows[0].amount).toBe(200); // 2h * 100
    expect(rows[1]).toMatchObject({
      sourceEntryId: 'h5',
      hours: 0.75,
      rate: 80,
      amount: 60,
    });
    expect(rows.map(r => r.sourceEntryId)).not.toContain('h4');
  });
  it('calculatePayslipRows uses approved reported minutes, not the calendar baseline', () => {
    const rows = Q.calculatePayslipRows([
      {
        ...entries[1],
        id: 'h_variance_payable',
        status: 'APPROVED',
        rate: 100,
        reportedMinutes: 90,
        calendarMinutes: 60,
      },
    ]);

    expect(rows).toEqual([
      {
        staffMemberId: 't1',
        date: '2026-06-02',
        hours: 1.5,
        rate: 100,
        amount: 150,
        sourceEntryId: 'h_variance_payable',
      },
    ]);
  });
  it('resolveHoursEntryPayRate follows D-19 source order without trusting draft entry.rate', () => {
    const entry: HoursEntry = {
      ...entries[1],
      id: 'h_rate',
      rate: 999,
      teachingAssignmentId: 'ta_1',
      orgRoleId: 'role_1',
    };

    expect(Q.resolveHoursEntryPayRate(entry, {
      adminOverrideRate: 145,
      teachingAssignmentRates: [{ teachingAssignmentId: 'ta_1', rate: 125 }],
      orgRoleRates: [{ orgRoleId: 'role_1', rate: 115 }],
      staffDefaultRates: [{ staffMemberId: 't1', rate: 105 }],
      orgDefaultRate: 95,
    })).toEqual({ rate: 145, source: 'ADMIN_OVERRIDE', sourceId: 'h_rate' });

    expect(Q.resolveHoursEntryPayRate(entry, {
      teachingAssignmentRates: [{ teachingAssignmentId: 'ta_1', rate: 125 }],
      orgRoleRates: [{ orgRoleId: 'role_1', rate: 115 }],
      staffDefaultRates: [{ staffMemberId: 't1', rate: 105 }],
      orgDefaultRate: 95,
    })).toEqual({ rate: 125, source: 'TEACHING_ASSIGNMENT', sourceId: 'ta_1' });

    expect(Q.resolveHoursEntryPayRate({ ...entry, teachingAssignmentId: null }, {
      orgRoleRates: [{ orgRoleId: 'role_1', rate: 115 }],
      staffDefaultRates: [{ staffMemberId: 't1', rate: 105 }],
      orgDefaultRate: 95,
    })).toEqual({ rate: 115, source: 'ORG_ROLE', sourceId: 'role_1' });

    expect(Q.resolveHoursEntryPayRate({ ...entry, teachingAssignmentId: null, orgRoleId: null }, {
      staffDefaultRates: [{ staffMemberId: 't1', rate: 105 }],
      orgDefaultRate: 95,
    })).toEqual({ rate: 105, source: 'STAFF_DEFAULT', sourceId: 't1' });

    expect(Q.resolveHoursEntryPayRate({ ...entry, staffMemberId: 'missing', teachingAssignmentId: null, orgRoleId: null }, {
      orgDefaultRate: 95,
    })).toEqual({ rate: 95, source: 'ORG_DEFAULT', sourceId: null });
  });
  it('stampHoursEntryPayRate stamps a resolved approval rate immutably', () => {
    const submitted = { ...entries[1], rate: null };
    const stamped = Q.stampHoursEntryPayRate(submitted, {
      staffDefaultRates: [{ staffMemberId: 't1', rate: 110 }],
      orgDefaultRate: 95,
    });

    expect(stamped).toEqual({ ...submitted, rate: 110 });
    expect(submitted.rate).toBeNull();
    expect(() => Q.stampHoursEntryPayRate(submitted, {})).toThrow('No payroll rate configured');
  });
});

describe('payments/ledger', () => {
  const charges: Charge[] = [
    { ...base, id: 'ch1', studentId: 's1', familyId: 'f1', enrollmentId: 'en1', description: 'Tuition Q1', amount: 500, currency: 'ILS', dueDate: '2026-06-30', status: 'OPEN', periodLabel: 'Q1' },
    { ...base, id: 'ch2', studentId: 's1', familyId: 'f1', enrollmentId: 'en1', description: 'Tuition Q2', amount: 500, currency: 'ILS', dueDate: '2026-09-30', status: 'PAID', periodLabel: 'Q2' },
    { ...base, id: 'ch3', studentId: 's2', familyId: 'f1', enrollmentId: 'en2', description: 'Void', amount: 100, currency: 'ILS', dueDate: null, status: 'VOID', periodLabel: null },
  ];
  const payments: Payment[] = [
    { ...base, id: 'pay1', studentId: 's1', familyId: 'f1', amount: 500, currency: 'ILS', method: 'TRANSFER', receivedAt: '2026-06-15T10:00:00.000Z', reference: null, appliedChargeIds: ['ch2'], note: null },
  ];
  const adjustments: Adjustment[] = [
    { ...base, id: 'adj1', studentId: 's1', familyId: 'f1', chargeId: 'ch1', amount: -50, currency: 'ILS', reason: 'sibling discount' },
  ];
  it('listOpenBalances computes charged+adjusted-paid', () => {
    const bals = Q.listOpenBalances(charges, payments, adjustments, 'STUDENT');
    const s1 = bals.find(b => b.partyId === 's1')!;
    expect(s1.totalCharged).toBe(1000);
    expect(s1.totalPaid).toBe(500);
    expect(s1.totalAdjusted).toBe(-50);
    expect(s1.balance).toBe(450);
    expect(s1.openChargeIds).toEqual(['ch1']);
  });
  it('listOpenBalances defaults to family-led aggregation and sorts open charges by due date', () => {
    const familyCharges: Charge[] = [
      { ...base, id: 'ch_late', studentId: 's2', familyId: 'f1', enrollmentId: 'en2', description: 'Late fee', amount: 80, currency: 'ILS', dueDate: '2026-10-01', status: 'OPEN', periodLabel: 'Q4' },
      { ...base, id: 'ch_early', studentId: 's1', familyId: 'f1', enrollmentId: 'en1', description: 'Early fee', amount: 120, currency: 'ILS', dueDate: '2026-05-01', status: 'PARTIAL', periodLabel: 'Q0' },
      ...charges,
    ];
    const bals = Q.listOpenBalances(familyCharges, payments, adjustments);
    expect(bals).toHaveLength(1);
    expect(bals[0]).toMatchObject({
      partyId: 'f1',
      scope: 'FAMILY',
      currency: 'ILS',
      totalCharged: 1200,
      totalPaid: 500,
      totalAdjusted: -50,
      balance: 650,
    });
    expect(bals[0].openChargeIds).toEqual(['ch_early', 'ch1', 'ch_late']);
  });
  it('listOpenBalances preserves partial allocation as an open balance', () => {
    const partialPayments: Payment[] = [
      { ...base, id: 'pay_partial', studentId: 's1', familyId: 'f1', amount: 125, currency: 'ILS', method: 'TRANSFER', receivedAt: '2026-06-15T10:00:00.000Z', reference: null, appliedChargeIds: ['ch1'], note: null },
    ];
    const partialAdjustments: Adjustment[] = [
      { ...base, id: 'adj_partial', studentId: 's1', familyId: 'f1', chargeId: 'ch1', amount: -25, currency: 'ILS', reason: 'manual credit' },
    ];
    const [balance] = Q.listOpenBalances([charges[0]], partialPayments, partialAdjustments);
    expect(balance.totalCharged).toBe(500);
    expect(balance.totalPaid).toBe(125);
    expect(balance.totalAdjusted).toBe(-25);
    expect(balance.balance).toBe(350);
    expect(balance.openChargeIds).toEqual(['ch1']);
  });
  it('listOpenBalances rejects mixed currencies for one family ledger', () => {
    expect(() => Q.listOpenBalances([
      charges[0],
      { ...charges[1], id: 'ch_usd', currency: 'USD' },
    ], payments, adjustments)).toThrow('Mixed currencies for family ledger f1');
    expect(() => Q.listOpenBalances(charges, [
      { ...payments[0], currency: 'USD' },
    ], adjustments)).toThrow('Mixed currencies for family ledger f1');
  });
  it('listPaymentsByFamily filters + sorts', () => {
    const unsorted: Payment[] = [
      { ...payments[0], id: 'pay_z', receivedAt: '2026-06-15T10:00:00.000Z' },
      { ...payments[0], id: 'pay_a', receivedAt: '2026-06-15T10:00:00.000Z' },
      { ...payments[0], id: 'pay_previous', receivedAt: '2026-06-15T00:00:00.000Z' },
      { ...payments[0], id: 'pay_other_family', familyId: 'f2', receivedAt: '2026-06-14T00:00:00.000Z' },
    ];
    expect(Q.listPaymentsByFamily(unsorted, 'f1').map(p => p.id)).toEqual(['pay_previous', 'pay_a', 'pay_z']);
  });
  it('reconcileEnrollmentCharges flags missing periods', () => {
    const rec = Q.reconcileEnrollmentCharges('en1', charges, [
      { label: 'Q1', amount: 500 }, { label: 'Q2', amount: 500 }, { label: 'Q3', amount: 500 },
    ]);
    expect(rec.totalCharged).toBe(1000);
    expect(rec.expectedCharged).toBe(1500);
    expect(rec.missingPeriods).toEqual(['Q3']);
    expect(rec.matches).toBe(false);
  });
  it('reconcileEnrollmentCharges includes scoped payment and adjustment lineage', () => {
    const scopedPayments: Payment[] = [
      { ...base, id: 'pay_partial_en1', studentId: 's1', familyId: 'f1', amount: 200, currency: 'ILS', method: 'TRANSFER', receivedAt: '2026-06-15T10:00:00.000Z', reference: null, appliedChargeIds: ['ch1'], note: null },
      { ...base, id: 'pay_cross_enrollments', studentId: null, familyId: 'f1', amount: 300, currency: 'ILS', method: 'TRANSFER', receivedAt: '2026-06-16T10:00:00.000Z', reference: null, appliedChargeIds: ['ch1', 'ch_other_enrollment'], note: null },
    ];
    const scopedAdjustments: Adjustment[] = [
      { ...base, id: 'adj_en1', studentId: 's1', familyId: 'f1', chargeId: 'ch1', amount: -50, currency: 'ILS', reason: 'discount' },
    ];
    const rec = Q.reconcileEnrollmentCharges('en1', [
      { ...charges[1], dueDate: '2026-09-30' },
      { ...charges[0], dueDate: '2026-06-30' },
      { ...base, id: 'ch_other_enrollment', studentId: 's2', familyId: 'f1', enrollmentId: 'en2', description: 'Other enrollment', amount: 300, currency: 'ILS', dueDate: '2026-06-01', status: 'OPEN', periodLabel: 'Q1' },
    ], [
      { label: 'Q1', amount: 500 },
      { label: 'Q2', amount: 500 },
    ], scopedPayments, scopedAdjustments);

    expect(rec.charges.map(c => c.id)).toEqual(['ch1', 'ch2']);
    expect(rec.paymentIds).toEqual(['pay_partial_en1', 'pay_cross_enrollments']);
    expect(rec.ambiguousPaymentIds).toEqual(['pay_cross_enrollments']);
    expect(rec.totalCharged).toBe(1000);
    expect(rec.totalPaid).toBe(200);
    expect(rec.totalAdjusted).toBe(-50);
    expect(rec.balance).toBe(750);
    expect(rec.matches).toBe(true);
  });
  it('reconcileEnrollmentCharges rejects mixed currencies for one enrollment ledger', () => {
    expect(() => Q.reconcileEnrollmentCharges('en1', [
      charges[0],
      { ...charges[1], currency: 'USD' },
    ], [])).toThrow('Mixed currencies for enrollment ledger en1');
    expect(() => Q.reconcileEnrollmentCharges('en1', charges, [], [
      { ...payments[0], currency: 'USD' },
    ])).toThrow('Mixed currencies for enrollment ledger en1');
  });
});

describe('agreements/consent', () => {
  const templates: AgreementTemplate[] = [
    { ...base, id: 't1', kind: 'CONSENT', title: 'Media Release', version: 2, body: '...', isActive: true, supersedesVersion: 1, requiresGuardian: true },
  ];
  const acceptances: AgreementAcceptance[] = [
    { ...base, id: 'ac1', templateId: 't1', templateVersion: 1, studentId: 's1', familyId: null, enrollmentId: 'en1', guardianId: 'g1', status: 'ACCEPTED', acceptedAt: '2025-09-01T10:00:00.000Z', acceptedByName: 'Dana', signatureRef: null },
    { ...base, id: 'ac2', templateId: 't1', templateVersion: 2, studentId: 's2', familyId: null, enrollmentId: 'en2', guardianId: 'g1', status: 'ACCEPTED', acceptedAt: '2026-09-01T10:00:00.000Z', acceptedByName: 'Dana', signatureRef: null },
  ];
  it('listUnsignedAgreements flags superseded + never-signed', () => {
    const r = Q.listUnsignedAgreements(templates, acceptances, ['s1', 's2', 's3']);
    const s1 = r.find(x => x.studentId === 's1')!;
    expect(s1.reason).toBe('SUPERSEDED_VERSION'); // had v1, active is v2
    expect(r.find(x => x.studentId === 's2')).toBeUndefined(); // signed v2
    expect(r.find(x => x.studentId === 's3')!.reason).toBe('NEVER_ACCEPTED');
  });
  it('getAgreementHistory + findAgreementByEnrollment', () => {
    expect(Q.getAgreementHistory(acceptances, 't1').map(a => a.id)).toEqual(['ac2', 'ac1']);
    expect(Q.findAgreementByEnrollment(acceptances, 'en1').map(a => a.id)).toEqual(['ac1']);
  });
});

describe('instruments', () => {
  const instruments: Instrument[] = [
    { ...base, id: 'in1', assetTag: 'VLN-001', name: 'Violin 1', category: 'STRINGS', brand: null, serialNumber: null, condition: 'GOOD', status: 'AVAILABLE', location: 'Storage', acquiredAt: null, valueAmount: null, notes: null },
    { ...base, id: 'in2', assetTag: 'VLN-002', name: 'Violin 2', category: 'STRINGS', brand: null, serialNumber: null, condition: 'FAIR', status: 'ON_LOAN', location: null, acquiredAt: null, valueAmount: null, notes: null },
  ];
  const loans: InstrumentLoan[] = [
    { ...base, id: 'ln1', instrumentId: 'in2', borrowerStudentId: 's1', borrowerStaffId: null, checkedOutAt: '2026-05-01T10:00:00.000Z', dueDate: '2026-06-01', returnedAt: null, status: 'ACTIVE', conditionOut: 'FAIR', conditionIn: null, agreementAcceptanceId: null, note: null },
  ];
  const repairs: InstrumentRepair[] = [
    { ...base, id: 'rp1', instrumentId: 'in2', reportedAt: '2026-04-01T10:00:00.000Z', resolvedAt: '2026-04-10T10:00:00.000Z', description: 'String replace', cost: 50, conditionBefore: 'POOR', conditionAfter: 'FAIR', vendor: null },
  ];
  it('listAvailableInstruments filters status/category', () => {
    expect(Q.listAvailableInstruments(instruments).map(i => i.id)).toEqual(['in1']);
    expect(Q.listAvailableInstruments(instruments, 'BRASS')).toEqual([]);
  });
  it('listOverdueLoans uses now cutoff', () => {
    expect(Q.listOverdueLoans(loans, '2026-06-16').map(l => l.id)).toEqual(['ln1']);
    expect(Q.listOverdueLoans(loans, '2026-05-15')).toEqual([]);
  });
  it('getInstrumentCustodyHistory merges loans + repairs chronologically', () => {
    const hist = Q.getInstrumentCustodyHistory('in2', loans, repairs);
    expect(hist.map(h => h.kind)).toEqual(['REPAIR', 'REPAIR_RESOLVED', 'CHECKOUT']);
  });
});

describe('evaluations', () => {
  const evals: StaffEvaluation[] = [
    { ...base, id: 'ev1', staffMemberId: 't1', reviewerStaffId: 'a1', periodLabel: '2026 H1', dueDate: '2026-06-01', status: 'DUE', overallRating: null, criteria: [], strengths: null, actions: [{ id: 'act1', description: 'Submit lesson plans', dueDate: '2026-06-20', done: false }], completedAt: null, acknowledgedAt: null },
    { ...base, id: 'ev2', staffMemberId: 't1', reviewerStaffId: 'a1', periodLabel: '2025 H2', dueDate: '2025-12-01', status: 'COMPLETED', overallRating: 4, criteria: [], strengths: 'Great', actions: [{ id: 'act2', description: 'Done thing', dueDate: null, done: true }], completedAt: '2025-12-05T10:00:00.000Z', acknowledgedAt: null },
  ];
  it('listDueEvaluations returns due/scheduled', () => {
    expect(Q.listDueEvaluations(evals, '2026-06-16').map(e => e.id)).toEqual(['ev1']);
  });
  it('getStaffEvaluationHistory newest first', () => {
    expect(Q.getStaffEvaluationHistory(evals, 't1').map(e => e.id)).toEqual(['ev1', 'ev2']);
  });
  it('listEvaluationActions flattens open actions', () => {
    const open = Q.listEvaluationActions(evals);
    expect(open.map(a => a.id)).toEqual(['act1']);
    expect(Q.listEvaluationActions(evals, false).map(a => a.id).sort()).toEqual(['act1', 'act2']);
  });
});

describe('reports', () => {
  const def: ReportDefinition = {
    ...base, id: 'rd1', name: 'Charges by status', description: null, sourceEntity: 'charges',
    filters: [{ field: 'currency', op: 'eq', value: 'ILS' }], groupBy: 'status',
    aggregate: { fn: 'sum', field: 'amount' }, columns: ['id', 'status', 'amount'], isPinned: false,
  };
  const rows = [
    { id: 'ch1', status: 'OPEN', amount: 500, currency: 'ILS' },
    { id: 'ch2', status: 'PAID', amount: 500, currency: 'ILS' },
    { id: 'ch3', status: 'OPEN', amount: 300, currency: 'ILS' },
    { id: 'ch4', status: 'OPEN', amount: 999, currency: 'USD' },
  ];
  it('runReportDefinition filters, groups, aggregates, projects', () => {
    const res = Q.runReportDefinition(def, rows);
    expect(res.totalRows).toBe(3); // USD filtered out
    const open = res.groups.find(g => g.key === 'OPEN')!;
    expect(open.value).toBe(800);
    expect(open.sourceIds.sort()).toEqual(['ch1', 'ch3']);
    expect(Object.keys(res.rows[0])).toEqual(['id', 'status', 'amount']);
  });
  it('exportReportCsv quotes correctly', () => {
    const res = Q.runReportDefinition(def, rows);
    const csv = Q.exportReportCsv(res);
    expect(csv.split('\n')[0]).toBe('id,status,amount');
    expect(csv.split('\n')).toHaveLength(4); // header + 3
  });
  it('getReportLineage exposes provenance', () => {
    const res = Q.runReportDefinition(def, rows);
    const lin = Q.getReportLineage(def, res);
    expect(lin.sourceEntity).toBe('charges');
    expect(lin.sourceIds.sort()).toEqual(['ch1', 'ch2', 'ch3']);
  });
});

describe('year rollover', () => {
  const enr: MinimalEnrollment[] = [
    { id: 'en1', studentId: 's1', activityId: 'a1', status: 'ACTIVE', startDate: '2025-09-01', endDate: null },
    { id: 'en2', studentId: 's2', activityId: 'a1', status: 'ACTIVE', startDate: '2025-09-01', endDate: '2026-01-01' },
    { id: 'en3', studentId: 's4', activityId: 'a2', status: 'ACTIVE', startDate: '2025-09-01', endDate: null }, // archived student
  ];
  it('previewYearRollover splits roll vs archive', () => {
    const p = Q.previewYearRollover(enr, students, { fromYearLabel: '2025-26', toYearLabel: '2026-27', cutoffDate: '2026-06-30' });
    expect(p.enrollmentsToRoll).toEqual(['en1']);
    expect(p.enrollmentsToArchive.sort()).toEqual(['en2', 'en3']);
  });
  it('applyYearRollover builds a deterministic plan', () => {
    const p = Q.previewYearRollover(enr, students, { fromYearLabel: '2025-26', toYearLabel: '2026-27', cutoffDate: '2026-06-30' });
    const plan = Q.applyYearRollover(p, enr, { now: T, idFactory: seed => `new:${seed}`, newStartDate: '2026-09-01' });
    expect(plan.newEnrollments).toHaveLength(1);
    expect(plan.newEnrollments[0].studentId).toBe('s1');
    expect(plan.newEnrollments[0].startDate).toBe('2026-09-01');
    expect(plan.archiveEnrollmentIds.sort()).toEqual(['en2', 'en3']);
  });
  it('listSetupMilestones reflects flags', () => {
    const ms = Q.listSetupMilestones({ activitiesCreated: true, staffAdded: false });
    expect(ms.find(m => m.id === 'activities')!.done).toBe(true);
    expect(ms.find(m => m.id === 'staff')!.done).toBe(false);
  });
});
