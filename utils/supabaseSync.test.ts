import { describe, it, expect } from 'vitest';
import {
  rowToApp,
  appToRow,
  tableSpecFor,
  COLLECTION_TO_TABLE,
  type TableSpec,
} from './supabaseSync';

const HYBRID: TableSpec = { table: 'events', mode: 'HYBRID' };
const NORMALIZED: TableSpec = { table: 'charges', mode: 'NORMALIZED' };

describe('tableSpecFor', () => {
  it('resolves known core collections to HYBRID tables', () => {
    expect(tableSpecFor('events')).toEqual({ table: 'events', mode: 'HYBRID' });
    expect(tableSpecFor('ganttBlocks')).toEqual({ table: 'gantt_blocks', mode: 'HYBRID' });
  });

  it('resolves known blueprint collections to NORMALIZED tables', () => {
    expect(tableSpecFor('registrationIntake')).toEqual({ table: 'registration_intake', mode: 'NORMALIZED' });
    expect(tableSpecFor('charges')).toEqual({ table: 'charges', mode: 'NORMALIZED' });
    expect(tableSpecFor('rolloverRuns')).toEqual({ table: 'rollover_runs', mode: 'NORMALIZED' });
    expect(tableSpecFor('publicEndpoints')).toEqual({ table: 'public_endpoints', mode: 'NORMALIZED' });
  });

  it('falls back to a HYBRID table named after an unknown collection', () => {
    expect(tableSpecFor('somethingNew')).toEqual({ table: 'somethingNew', mode: 'HYBRID' });
  });
});

describe('HYBRID mapping (jsonb document under `data`)', () => {
  it('rowToApp unwraps `data` and surfaces id + orgId', () => {
    const row = { id: 'e1', org_id: 'org1', data: { name: 'Recital', startTime: '09:00', tagIds: ['a'] } };
    expect(rowToApp(HYBRID, row)).toEqual({
      id: 'e1',
      orgId: 'org1',
      name: 'Recital',
      startTime: '09:00',
      tagIds: ['a'],
    });
  });

  it('rowToApp tolerates a missing `data` column', () => {
    expect(rowToApp(HYBRID, { id: 'e1', org_id: 'org1' })).toEqual({ id: 'e1', orgId: 'org1' });
  });

  it('appToRow nests the whole document under `data`, sets org_id, drops top-level orgId', () => {
    const item = { id: 'e1', orgId: 'ignored', name: 'Recital', startTime: '09:00' };
    expect(appToRow(HYBRID, 'org1', item)).toEqual({
      id: 'e1',
      org_id: 'org1',
      data: { name: 'Recital', startTime: '09:00' },
    });
  });

  it('does NOT case-convert document keys (camelCase preserved inside `data`)', () => {
    const row = { id: 'e1', org_id: 'org1', data: { start_time_local: 1, mixedCaseKey: 2 } };
    const app = rowToApp(HYBRID, row);
    expect(app.start_time_local).toBe(1);
    expect(app.mixedCaseKey).toBe(2);
    // …and they survive the write path verbatim.
    expect(appToRow(HYBRID, 'org1', app as Record<string, unknown>).data).toEqual({
      start_time_local: 1,
      mixedCaseKey: 2,
    });
  });

  it('round-trips an app document through write→read', () => {
    const item = { id: 'e1', orgId: 'org1', name: 'Recital', meta: { room: 'A', seats: 40 } };
    const restored = rowToApp(HYBRID, appToRow(HYBRID, 'org1', item) as Record<string, unknown>);
    expect(restored).toEqual(item);
  });
});

describe('Student/Family packet mapping contracts', () => {
  it('maps students as HYBRID rows without converting the legacy Student document', () => {
    const studentSpec = tableSpecFor('students');
    const legacyStudent = {
      id: 'stu_1',
      orgId: 'ignored-client-org',
      fullName: 'Dana Cohen',
      profileStatus: 'ACTIVE',
      currentGrade: 7,
      guardians: [
        { id: 'g1', fullName: 'Ron Cohen', phone: '050-2222222', isPrimary: true },
        { id: 'g2', fullName: 'Mia Cohen', email: 'mia@example.com', isPrimary: false },
      ],
      nestedLegacyKey: { startTime: '09:00', snake_key: 'preserved' },
    };

    const row = appToRow(studentSpec, 'org_1', legacyStudent);
    expect(row).toEqual({
      id: 'stu_1',
      org_id: 'org_1',
      data: {
        fullName: 'Dana Cohen',
        profileStatus: 'ACTIVE',
        currentGrade: 7,
        guardians: [
          { id: 'g1', fullName: 'Ron Cohen', phone: '050-2222222', isPrimary: true },
          { id: 'g2', fullName: 'Mia Cohen', email: 'mia@example.com', isPrimary: false },
        ],
        nestedLegacyKey: { startTime: '09:00', snake_key: 'preserved' },
      },
    });

    expect(rowToApp(studentSpec, row)).toEqual({ ...legacyStudent, orgId: 'org_1' });
  });

  it('maps families as NORMALIZED rows while preserving guardians[] jsonb and student links', () => {
    const familySpec = tableSpecFor('families');
    const family = {
      id: 'fam_1',
      orgId: 'ignored-client-org',
      name: 'Cohen-Levi',
      guardians: [
        {
          id: 'guardian_1',
          fullName: 'Ron Cohen',
          relationship: 'PARENT',
          phone: '050-2222222',
          email: 'ron@example.com',
          isPrimary: true,
        },
        {
          id: 'guardian_2',
          fullName: 'Mia Levi',
          relationship: 'GUARDIAN',
          phone: null,
          email: 'mia@example.com',
          isPrimary: false,
        },
      ],
      studentIds: ['stu_1', 'stu_2'],
      primaryContactGuardianId: 'guardian_1',
      billingNotes: 'Pays annually',
      isArchived: false,
      createdAt: '2026-06-18T10:00:00.000Z',
      updatedAt: '2026-06-18T11:00:00.000Z',
      createdBy: 'user_admin',
      updatedBy: undefined,
    };

    const row = appToRow(familySpec, 'org_1', family);
    expect(row).toEqual({
      org_id: 'org_1',
      id: 'fam_1',
      name: 'Cohen-Levi',
      guardians: family.guardians,
      student_ids: ['stu_1', 'stu_2'],
      primary_contact_guardian_id: 'guardian_1',
      billing_notes: 'Pays annually',
      is_archived: false,
      created_at: '2026-06-18T10:00:00.000Z',
      updated_at: '2026-06-18T11:00:00.000Z',
      created_by: 'user_admin',
    });
    expect('updated_by' in row).toBe(false);

    expect(rowToApp(familySpec, row)).toEqual({
      id: 'fam_1',
      orgId: 'org_1',
      name: 'Cohen-Levi',
      guardians: family.guardians,
      studentIds: ['stu_1', 'stu_2'],
      primaryContactGuardianId: 'guardian_1',
      billingNotes: 'Pays annually',
      isArchived: false,
      createdAt: '2026-06-18T10:00:00.000Z',
      updatedAt: '2026-06-18T11:00:00.000Z',
      createdBy: 'user_admin',
    });
  });
});

describe('Lesson details/attendance packet mapping contracts', () => {
  it('maps lesson_records as NORMALIZED rows while preserving repertoire jsonb', () => {
    const lessonRecordSpec = tableSpecFor('lessonRecords');
    expect(lessonRecordSpec).toEqual({ table: 'lesson_records', mode: 'NORMALIZED' });

    const lessonRecord = {
      id: 'lesson_1',
      orgId: 'ignored-client-org',
      eventId: 'event_1',
      studentId: 'student_1',
      staffMemberId: 'staff_1',
      date: '2026-06-18',
      attendance: 'LATE',
      completion: 'COMPLETED',
      notes: 'Arrived after warmups',
      repertoire: ['Bach Minuet', 'Scale pattern No. 4'],
      homework: 'Practice measures 8-16 slowly',
      makeupOfLessonId: 'lesson_missed_1',
      createdAt: '2026-06-18T08:30:00.000Z',
      updatedAt: '2026-06-18T09:00:00.000Z',
      createdBy: 'teacher_1',
      updatedBy: undefined,
    };

    const row = appToRow(lessonRecordSpec, 'org_1', lessonRecord);
    expect(row).toEqual({
      org_id: 'org_1',
      id: 'lesson_1',
      event_id: 'event_1',
      student_id: 'student_1',
      staff_member_id: 'staff_1',
      date: '2026-06-18',
      attendance: 'LATE',
      completion: 'COMPLETED',
      notes: 'Arrived after warmups',
      repertoire: ['Bach Minuet', 'Scale pattern No. 4'],
      homework: 'Practice measures 8-16 slowly',
      makeup_of_lesson_id: 'lesson_missed_1',
      created_at: '2026-06-18T08:30:00.000Z',
      updated_at: '2026-06-18T09:00:00.000Z',
      created_by: 'teacher_1',
    });
    expect('updated_by' in row).toBe(false);

    expect(rowToApp(lessonRecordSpec, row)).toEqual({
      id: 'lesson_1',
      orgId: 'org_1',
      eventId: 'event_1',
      studentId: 'student_1',
      staffMemberId: 'staff_1',
      date: '2026-06-18',
      attendance: 'LATE',
      completion: 'COMPLETED',
      notes: 'Arrived after warmups',
      repertoire: ['Bach Minuet', 'Scale pattern No. 4'],
      homework: 'Practice measures 8-16 slowly',
      makeupOfLessonId: 'lesson_missed_1',
      createdAt: '2026-06-18T08:30:00.000Z',
      updatedAt: '2026-06-18T09:00:00.000Z',
      createdBy: 'teacher_1',
    });
  });
});

describe('Payroll packet mapping contracts', () => {
  it('maps hours_entries as NORMALIZED rows with payroll line columns', () => {
    const hoursEntrySpec = tableSpecFor('hoursEntries');
    expect(hoursEntrySpec).toEqual({ table: 'hours_entries', mode: 'NORMALIZED' });

    const hoursEntry = {
      id: 'hours_entry_1',
      orgId: 'ignored-client-org',
      staffMemberId: 'staff_1',
      hoursReportId: 'hours_report_1',
      date: '2026-06-18',
      reportedMinutes: 90,
      calendarMinutes: 60,
      eventId: 'event_1',
      teachingAssignmentId: 'assignment_1',
      orgRoleId: 'role_1',
      rate: null,
      status: 'SUBMITTED',
      note: 'Teacher reported setup time.',
      createdAt: '2026-06-18T08:30:00.000Z',
      updatedAt: '2026-06-18T09:00:00.000Z',
      createdBy: 'teacher_1',
      updatedBy: undefined,
    };

    const row = appToRow(hoursEntrySpec, 'org_1', hoursEntry);
    expect(row).toEqual({
      org_id: 'org_1',
      id: 'hours_entry_1',
      staff_member_id: 'staff_1',
      hours_report_id: 'hours_report_1',
      date: '2026-06-18',
      reported_minutes: 90,
      calendar_minutes: 60,
      event_id: 'event_1',
      teaching_assignment_id: 'assignment_1',
      org_role_id: 'role_1',
      rate: null,
      status: 'SUBMITTED',
      note: 'Teacher reported setup time.',
      created_at: '2026-06-18T08:30:00.000Z',
      updated_at: '2026-06-18T09:00:00.000Z',
      created_by: 'teacher_1',
    });
    expect('updated_by' in row).toBe(false);

    expect(rowToApp(hoursEntrySpec, row)).toEqual({
      id: 'hours_entry_1',
      orgId: 'org_1',
      staffMemberId: 'staff_1',
      hoursReportId: 'hours_report_1',
      date: '2026-06-18',
      reportedMinutes: 90,
      calendarMinutes: 60,
      eventId: 'event_1',
      teachingAssignmentId: 'assignment_1',
      orgRoleId: 'role_1',
      rate: null,
      status: 'SUBMITTED',
      note: 'Teacher reported setup time.',
      createdAt: '2026-06-18T08:30:00.000Z',
      updatedAt: '2026-06-18T09:00:00.000Z',
      createdBy: 'teacher_1',
    });
  });

  it('maps hours_reports as HYBRID period headers without top-level snake conversion', () => {
    const hoursReportSpec = tableSpecFor('hoursReports');
    expect(hoursReportSpec).toEqual({ table: 'hours_reports', mode: 'HYBRID' });

    const header = {
      id: 'hours_report_1',
      orgId: 'ignored-client-org',
      staffMemberId: 'staff_1',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      status: 'SUBMITTED',
      submittedAt: '2026-07-01T08:00:00.000Z',
      entryIds: ['hours_entry_1', 'hours_entry_2'],
      adminNotes: 'Reviewed against calendar variance.',
      createdBy: 'teacher_1',
      createdAt: '2026-06-01T08:00:00.000Z',
    };

    const row = appToRow(hoursReportSpec, 'org_1', header);
    expect(row).toEqual({
      id: 'hours_report_1',
      org_id: 'org_1',
      data: {
        staffMemberId: 'staff_1',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        status: 'SUBMITTED',
        submittedAt: '2026-07-01T08:00:00.000Z',
        entryIds: ['hours_entry_1', 'hours_entry_2'],
        adminNotes: 'Reviewed against calendar variance.',
        createdBy: 'teacher_1',
        createdAt: '2026-06-01T08:00:00.000Z',
      },
    });
    expect('staff_member_id' in row).toBe(false);
    expect('reported_total' in row).toBe(false);

    expect(rowToApp(hoursReportSpec, row)).toEqual({ ...header, orgId: 'org_1' });
  });
});

describe('Public registration intake mapping contracts', () => {
  it('maps public_endpoints as NORMALIZED while preserving scopes jsonb and token hashes', () => {
    const endpointSpec = tableSpecFor('publicEndpoints');
    const endpoint = {
      id: 'endpoint_1',
      orgId: 'ignored-client-org',
      kind: 'REGISTRATION_INTAKE',
      label: 'Fall registration',
      tokenHash: 'sha256-token-hash',
      status: 'ACTIVE',
      scopes: ['registration_intake:submit'],
      targetId: 'activity_1',
      consentAgreementId: 'consent_template_1',
      expiresAt: '2026-07-01T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
      createdAt: '2026-06-18T08:30:00.000Z',
      updatedAt: '2026-06-18T08:30:00.000Z',
      createdBy: 'admin_1',
      updatedBy: undefined,
    };

    const row = appToRow(endpointSpec, 'org_1', endpoint);
    expect(row).toEqual({
      org_id: 'org_1',
      id: 'endpoint_1',
      kind: 'REGISTRATION_INTAKE',
      label: 'Fall registration',
      token_hash: 'sha256-token-hash',
      status: 'ACTIVE',
      scopes: ['registration_intake:submit'],
      target_id: 'activity_1',
      consent_agreement_id: 'consent_template_1',
      expires_at: '2026-07-01T00:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
      created_at: '2026-06-18T08:30:00.000Z',
      updated_at: '2026-06-18T08:30:00.000Z',
      created_by: 'admin_1',
    });
    expect('updated_by' in row).toBe(false);

    expect(rowToApp(endpointSpec, row)).toEqual({
      id: 'endpoint_1',
      orgId: 'org_1',
      kind: 'REGISTRATION_INTAKE',
      label: 'Fall registration',
      tokenHash: 'sha256-token-hash',
      status: 'ACTIVE',
      scopes: ['registration_intake:submit'],
      targetId: 'activity_1',
      consentAgreementId: 'consent_template_1',
      expiresAt: '2026-07-01T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
      createdAt: '2026-06-18T08:30:00.000Z',
      updatedAt: '2026-06-18T08:30:00.000Z',
      createdBy: 'admin_1',
    });
  });

  it('maps registration_intake as NORMALIZED while preserving guardians[] jsonb and consent lineage', () => {
    const intakeSpec = tableSpecFor('registrationIntake');
    const guardians = [
      {
        id: 'guardian_1',
        fullName: 'Ron Cohen',
        relationship: 'PARENT',
        phone: '050-2222222',
        email: 'ron@example.com',
        isPrimary: true,
      },
      {
        id: 'guardian_2',
        fullName: 'Mia Levi',
        relationship: 'GUARDIAN',
        phone: null,
        email: 'mia@example.com',
        isPrimary: false,
      },
    ];
    const intake = {
      id: 'intake_1',
      orgId: 'ignored-client-org',
      status: 'IN_REVIEW',
      source: 'WEBSITE',
      submittedAt: '2026-06-18T08:30:00.000Z',
      studentFullName: 'Dana Cohen',
      studentDateOfBirth: '2014-05-02',
      instrument: 'Cello',
      requestedActivityId: 'activity_1',
      notes: 'Prefers Tuesday afternoons',
      guardians,
      consentAccepted: true,
      consentAgreementId: 'agreement_template_1',
      reviewedBy: 'admin_1',
      reviewedAt: '2026-06-18T09:00:00.000Z',
      rejectionReason: null,
      duplicateOfStudentId: null,
      convertedStudentId: undefined,
      convertedEnrollmentId: undefined,
      statusHistory: [
        {
          id: 'hist_1',
          status: 'IN_REVIEW',
          fromStatus: 'PENDING',
          at: '2026-06-18T09:00:00.000Z',
          by: 'admin_1',
          note: 'Admin corrections saved.',
          relatedEntityIds: ['intake_1'],
        },
      ],
      createdAt: '2026-06-18T08:30:00.000Z',
      updatedAt: '2026-06-18T09:00:00.000Z',
      createdBy: 'public',
      updatedBy: 'admin_1',
    };

    const row = appToRow(intakeSpec, 'org_1', intake);
    expect(row).toEqual({
      org_id: 'org_1',
      id: 'intake_1',
      status: 'IN_REVIEW',
      source: 'WEBSITE',
      submitted_at: '2026-06-18T08:30:00.000Z',
      student_full_name: 'Dana Cohen',
      student_date_of_birth: '2014-05-02',
      instrument: 'Cello',
      requested_activity_id: 'activity_1',
      notes: 'Prefers Tuesday afternoons',
      guardians,
      consent_accepted: true,
      consent_agreement_id: 'agreement_template_1',
      reviewed_by: 'admin_1',
      reviewed_at: '2026-06-18T09:00:00.000Z',
      rejection_reason: null,
      duplicate_of_student_id: null,
      status_history: intake.statusHistory,
      created_at: '2026-06-18T08:30:00.000Z',
      updated_at: '2026-06-18T09:00:00.000Z',
      created_by: 'public',
      updated_by: 'admin_1',
    });
    expect('converted_student_id' in row).toBe(false);
    expect('converted_enrollment_id' in row).toBe(false);

    expect(rowToApp(intakeSpec, row)).toEqual({
      id: 'intake_1',
      orgId: 'org_1',
      status: 'IN_REVIEW',
      source: 'WEBSITE',
      submittedAt: '2026-06-18T08:30:00.000Z',
      studentFullName: 'Dana Cohen',
      studentDateOfBirth: '2014-05-02',
      instrument: 'Cello',
      requestedActivityId: 'activity_1',
      notes: 'Prefers Tuesday afternoons',
      guardians,
      consentAccepted: true,
      consentAgreementId: 'agreement_template_1',
      reviewedBy: 'admin_1',
      reviewedAt: '2026-06-18T09:00:00.000Z',
      rejectionReason: null,
      duplicateOfStudentId: null,
      statusHistory: intake.statusHistory,
      createdAt: '2026-06-18T08:30:00.000Z',
      updatedAt: '2026-06-18T09:00:00.000Z',
      createdBy: 'public',
      updatedBy: 'admin_1',
    });
  });
});

describe('NORMALIZED mapping (real snake_case columns, nested jsonb)', () => {
  it('rowToApp converts top-level columns snake→camel and leaves nested jsonb intact', () => {
    const row = {
      id: 'c1',
      org_id: 'org1',
      family_id: 'f1',
      line_items: [{ unitPrice: 10, taxRate: 0.17 }],
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(rowToApp(NORMALIZED, row)).toEqual({
      id: 'c1',
      orgId: 'org1',
      familyId: 'f1',
      lineItems: [{ unitPrice: 10, taxRate: 0.17 }], // nested keys untouched
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('appToRow converts top-level camel→snake, sets org_id, drops orgId and undefined', () => {
    const item = {
      id: 'c1',
      orgId: 'ignored',
      familyId: 'f1',
      lineItems: [{ unitPrice: 10 }],
      note: undefined,
    };
    expect(appToRow(NORMALIZED, 'org1', item)).toEqual({
      org_id: 'org1',
      id: 'c1',
      family_id: 'f1',
      line_items: [{ unitPrice: 10 }], // nested keys untouched
    });
    expect('note' in appToRow(NORMALIZED, 'org1', item)).toBe(false);
  });

  it('round-trips a normalized item through write→read (orgId restored from column)', () => {
    const item = { id: 'c1', orgId: 'org1', familyId: 'f1', amountDue: 250, lineItems: [{ unitPrice: 250 }] };
    const restored = rowToApp(NORMALIZED, appToRow(NORMALIZED, 'org1', item) as Record<string, unknown>);
    expect(restored).toEqual(item);
  });

  it('single-capital keys round-trip cleanly (pdfUrl ↔ pdf_url)', () => {
    const row = appToRow(NORMALIZED, 'org1', { id: 'a1', pdfUrl: 'http://x' });
    expect(row.pdf_url).toBe('http://x');
    expect(rowToApp(NORMALIZED, row).pdfUrl).toBe('http://x');
  });

  it('GUARD: consecutive-capital keys do NOT collapse to a clean snake column', () => {
    // camelToSnake underscores EACH capital, so an acronym key like `pdfURL`
    // maps to `pdf_u_r_l`, not `pdf_url`. It round-trips without data loss, but
    // the column name will not match a hand-written `pdf_url` column. Normalized
    // table fields must therefore avoid consecutive capitals / acronyms.
    const row = appToRow(NORMALIZED, 'org1', { id: 'a1', pdfURL: 'http://x' });
    expect(row.pdf_url).toBeUndefined();
    expect(row.pdf_u_r_l).toBe('http://x');
    expect(rowToApp(NORMALIZED, row).pdfURL).toBe('http://x'); // no data loss on round-trip
  });
});

describe('COLLECTION_TO_TABLE integrity', () => {
  it('maps every collection to a snake_case (or lower) table name', () => {
    for (const [collection, spec] of Object.entries(COLLECTION_TO_TABLE)) {
      expect(spec.table, `${collection} → ${spec.table}`).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(['HYBRID', 'NORMALIZED']).toContain(spec.mode);
    }
  });

  it('has no duplicate table targets', () => {
    const tables = Object.values(COLLECTION_TO_TABLE).map(s => s.table);
    expect(tables.length).toBe(new Set(tables).size);
  });
});
