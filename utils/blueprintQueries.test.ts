import { describe, it, expect } from 'vitest';
import type {
  RegistrationIntake, Family, LessonRecord, OperationalRequest, ExamSession,
  ExaminerSubmission, Certificate, ConcertProgram, HoursEntry, Charge, Payment,
  Adjustment, AgreementTemplate, AgreementAcceptance, Instrument, InstrumentLoan,
  InstrumentRepair, StaffEvaluation, ReportDefinition,
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
  it('approveIntakeRecord converts and emits a student payload', () => {
    const { intake: out, student } = Q.approveIntakeRecord(intake[0], { studentId: 'new1', now: T, reviewedBy: 'admin' });
    expect(out.status).toBe('CONVERTED');
    expect(out.convertedStudentId).toBe('new1');
    expect(out.reviewedBy).toBe('admin');
    expect(student.fullName).toBe('Avi Cohen');
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
  it('summarizeLessonCompletion computes rates excluding cancelled', () => {
    const sum = Q.summarizeLessonCompletion(lessons);
    expect(sum.total).toBe(4);
    expect(sum.completed).toBe(1);
    expect(sum.cancelled).toBe(1);
    expect(sum.completionRate).toBeCloseTo(1 / 3);
    expect(sum.attendance.PRESENT).toBe(2);
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
  ];
  const events: MinimalEvent[] = [
    { id: 'ev1', date: '2026-06-01', durationMinutes: 120 },
    { id: 'ev2', date: '2026-06-02', durationMinutes: 60 },
  ];
  const participants: MinimalParticipant[] = [
    { eventId: 'ev1', staffMemberId: 't1' },
    { eventId: 'ev2', staffMemberId: 't1' },
  ];
  it('listPendingHoursReports returns draft/submitted', () => {
    expect(Q.listPendingHoursReports(entries).map(e => e.id)).toEqual(['h2']);
  });
  it('compareReportedVsCalendarHours computes variance + lineage', () => {
    const rec = Q.compareReportedVsCalendarHours('t1', entries, events, participants);
    expect(rec.reportedMinutes).toBe(210);
    expect(rec.calendarMinutes).toBe(180);
    expect(rec.varianceMinutes).toBe(30);
    expect(rec.sourceEntryIds).toEqual(['h1', 'h2']);
    expect(rec.matchesCalendar).toBe(false);
  });
  it('calculatePayslipRows only includes approved/paid with rate', () => {
    const rows = Q.calculatePayslipRows(entries);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(200); // 2h * 100
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
  it('listPaymentsByFamily filters + sorts', () => {
    expect(Q.listPaymentsByFamily(payments, 'f1').map(p => p.id)).toEqual(['pay1']);
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
