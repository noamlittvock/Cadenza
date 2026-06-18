import { describe, expect, it } from 'vitest';
import type { RegistrationIntake } from '../types/blueprint';
import type { Student } from '../types';
import {
  approveIntakeRecord,
  type MinimalStudent,
} from './blueprintQueries';
import {
  applyApprovedIntakeGraphToCollections,
  applyRegistrationIntakeCorrection,
  buildRegistrationIntakeReviewRows,
  exportRegistrationIntakeCsv,
  filterRegistrationIntake,
} from './registrationIntakeReview';

const T = '2026-06-18T09:00:00.000Z';
const base = { orgId: 'org_1', createdAt: T, updatedAt: T };

function intake(overrides: Partial<RegistrationIntake>): RegistrationIntake {
  return {
    ...base,
    id: 'intake_1',
    status: 'PENDING',
    source: 'WEBSITE',
    submittedAt: '2026-06-18T08:00:00.000Z',
    applicantName: 'Dana Cohen',
    applicantEmail: 'dana@example.com',
    applicantPhone: '050-111',
    studentFullName: 'Maya Cohen',
    studentDateOfBirth: '2014-03-01',
    instrument: 'Cello',
    requestedActivityId: 'activity_strings',
    notes: 'Prefers Tuesdays',
    guardians: [
      {
        id: 'guardian_1',
        fullName: 'Dana Cohen',
        relationship: 'PARENT',
        phone: '050-111',
        email: 'dana@example.com',
        isPrimary: true,
      },
    ],
    consentAccepted: true,
    consentAgreementId: 'agreement_template_1',
    ...overrides,
  };
}

const students: MinimalStudent[] = [
  { id: 'student_existing', fullName: 'Maya Cohen' },
  { id: 'student_other', fullName: 'Noa Levi' },
];

const legacyStudent = (overrides: Partial<Student>): Student => ({
  id: 'student_old',
  orgId: 'org_1',
  fullName: 'Old Student',
  dateOfBirth: '2011-01-01',
  isMinor: true,
  guardians: [],
  assignments: [],
  pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
  notes: [],
  documents: [],
  profileStatus: 'ACTIVE',
  createdAt: T,
  updatedAt: T,
  ...overrides,
});

describe('registration intake review model', () => {
  it('filters active review rows by status, query, activity, and keeps duplicate suggestions visible', () => {
    const rows = buildRegistrationIntakeReviewRows(
      [
        intake({
          id: 'newer',
          studentFullName: 'Noa Levi',
          applicantName: 'Ron Levi',
          applicantEmail: 'ron@example.com',
          guardians: [],
          submittedAt: '2026-06-18T10:00:00.000Z',
        }),
        intake({ id: 'match', submittedAt: '2026-06-18T07:00:00.000Z' }),
        intake({ id: 'converted', status: 'CONVERTED', studentFullName: 'Maya Cohen' }),
      ],
      students,
      { status: 'ACTIVE', query: 'dana', activityId: 'activity_strings' },
    );

    expect(rows.map(row => row.record.id)).toEqual(['match']);
    expect(rows[0].primaryGuardianName).toBe('Dana Cohen');
    expect(rows[0].primaryGuardianContact).toBe('050-111 · dana@example.com');
    expect(rows[0].duplicateSuggestions[0]).toMatchObject({
      intakeId: 'match',
      studentId: 'student_existing',
      score: 1,
    });
  });

  it('can include terminal audit states when requested', () => {
    const filtered = filterRegistrationIntake(
      [
        intake({ id: 'pending', status: 'PENDING' }),
        intake({ id: 'rejected', status: 'REJECTED', reviewedAt: '2026-06-18T12:00:00.000Z' }),
        intake({ id: 'duplicate', status: 'DUPLICATE', reviewedAt: '2026-06-18T11:00:00.000Z' }),
      ],
      { status: 'ALL', query: '', activityId: '' },
    );

    expect(filtered.map(r => r.id)).toEqual(['pending', 'rejected', 'duplicate']);
  });

  it('applies admin corrections without bypassing captured consent', () => {
    const corrected = applyRegistrationIntakeCorrection(
      intake({ status: 'PENDING', consentAccepted: true }),
      {
        studentFullName: '  Maya Cohen-Levi  ',
        requestedActivityId: 'activity_piano',
        applicantEmail: ' corrected@example.com ',
        primaryGuardianPhone: ' 050-222 ',
      },
      { now: '2026-06-18T13:00:00.000Z', reviewedBy: 'admin_1' },
    );

    expect(corrected).toMatchObject({
      status: 'IN_REVIEW',
      studentFullName: 'Maya Cohen-Levi',
      requestedActivityId: 'activity_piano',
      applicantEmail: 'corrected@example.com',
      reviewedBy: 'admin_1',
      reviewedAt: '2026-06-18T13:00:00.000Z',
      updatedBy: 'admin_1',
    });
    expect(corrected.guardians[0].phone).toBe('050-222');
    expect(corrected.consentAccepted).toBe(true);
    expect(corrected.statusHistory).toEqual([
      {
        id: 'intake_1:2026-06-18T13:00:00.000Z:IN_REVIEW:1',
        status: 'IN_REVIEW',
        fromStatus: 'PENDING',
        at: '2026-06-18T13:00:00.000Z',
        by: 'admin_1',
        note: 'Moved into admin review with corrections.',
        relatedEntityIds: ['intake_1'],
      },
    ]);
  });

  it('exports filtered queue rows with retained audit history', () => {
    const rows = buildRegistrationIntakeReviewRows(
      [
        intake({
          id: 'intake_export',
          status: 'REJECTED',
          reviewedAt: '2026-06-18T15:00:00.000Z',
          rejectionReason: 'Program is full, waitlist offered',
          statusHistory: [
            {
              id: 'hist_1',
              status: 'PENDING',
              fromStatus: null,
              at: '2026-06-18T08:00:00.000Z',
              by: 'public-submit',
              note: 'Submitted',
            },
            {
              id: 'hist_2',
              status: 'REJECTED',
              fromStatus: 'PENDING',
              at: '2026-06-18T15:00:00.000Z',
              by: 'admin_1',
              note: 'Program is full, waitlist offered',
              relatedEntityIds: ['intake_export'],
            },
          ],
        }),
      ],
      students,
      { status: 'ALL', query: '', activityId: '' },
    );

    const csv = exportRegistrationIntakeCsv(rows, {
      activityName: id => id === 'activity_strings' ? 'Youth Strings' : String(id ?? ''),
      statusLabel: status => status.toLowerCase(),
    });

    expect(csv.split('\n')[0]).toContain('intakeId,status,submittedAt');
    expect(csv).toContain('intake_export,rejected');
    expect(csv).toContain('Youth Strings');
    expect(csv).toContain('"Program is full, waitlist offered"');
    expect(csv).toContain('2026-06-18T08:00:00.000Z PENDING by public-submit (Submitted)');
    expect(csv).toContain('2026-06-18T15:00:00.000Z PENDING->REJECTED by admin_1');
  });

  it('persists an approved graph into all review target collections with legacy-visible enrollment links', () => {
    const graph = approveIntakeRecord(intake({ id: 'intake_approved' }), {
      studentId: 'student_new',
      familyId: 'family_new',
      enrollmentId: 'enrollment_new',
      agreementRequestId: 'agreement_request_new',
      inboxItemId: 'inbox_history_new',
      now: '2026-06-18T14:00:00.000Z',
      reviewedBy: 'admin_1',
      activityId: 'activity_strings',
      l2Id: 'l2_cello',
      enrollmentStartDate: '2026-09-01',
      agreementTemplateVersion: 2,
      decisionNote: 'Approved from review queue.',
    });

    const result = applyApprovedIntakeGraphToCollections(graph, {
      students: [legacyStudent({ id: 'student_existing' })],
      families: [],
      enrollments: [],
      agreementAcceptances: [],
      registrationIntake: [intake({ id: 'intake_approved' })],
      inboxItems: [],
    });

    expect(result.registrationIntake).toHaveLength(1);
    expect(result.registrationIntake[0]).toMatchObject({
      id: 'intake_approved',
      status: 'CONVERTED',
      convertedStudentId: 'student_new',
      convertedEnrollmentId: 'enrollment_new',
    });
    expect(result.students.map(student => student.id)).toEqual(['student_existing', 'student_new']);
    expect(result.legacyStudent).toMatchObject({
      id: 'student_new',
      fullName: 'Maya Cohen',
      profileStatus: 'ACTIVE',
    });
    expect(result.legacyStudent.assignments).toEqual([
      {
        id: 'enrollment_new',
        activityId: 'activity_strings',
        subcategoryId: 'l2_cello',
        staffMemberId: '',
        teachingAssignmentId: '',
        startDate: '2026-09-01',
        endDate: undefined,
        status: 'ACTIVE',
      },
    ]);
    expect(result.families).toEqual([graph.family]);
    expect(result.enrollments).toEqual([graph.enrollment]);
    expect(result.agreementAcceptances).toEqual([graph.agreementRequest]);
    expect(result.inboxItems).toEqual([graph.inboxHistoryItem]);
  });
});
