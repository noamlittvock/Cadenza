import { describe, it, expect } from 'vitest';
import type {
  RegistrationIntake, Family, LessonRecord, OperationalRequest, ExamSession,
  ExaminerSubmission, Certificate, ConcertProgram, HoursEntry, Charge, Payment,
  Adjustment, AgreementTemplate, AgreementAcceptance, Instrument, InstrumentLoan,
  InstrumentRepair, StaffEvaluation, ReportDefinition, PublicEndpoint, ReportCard,
} from '../types/blueprint';
import type { AdminInboxItem, CalendarEvent, CalendarSubscription } from '../types';
import type { ImportSession } from '../types/v2';
import * as Q from './blueprintQueries';
import type { MinimalStudent, MinimalEnrollment, MinimalEvent, MinimalParticipant, MinimalActivity, MinimalTeachingAssignment } from './blueprintQueries';

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

describe('calendar integrations', () => {
  const subscriptions: CalendarSubscription[] = [
    {
      id: 'sub_active',
      orgId: 'org1',
      name: 'Cello Room Feed',
      token: 'legacy-token-should-not-leak',
      filters: {
        staffMemberIds: ['staff_1', 'missing_staff'],
        roomIds: ['room_1'],
        activityIds: ['activity_1'],
        tags: ['recital'],
      },
      createdBy: 'admin',
      createdAt: '2026-06-01T08:00:00.000Z',
      isActive: true,
    },
    {
      id: 'sub_revoked',
      orgId: 'org1',
      name: 'Revoked Feed',
      token: 'legacy-revoked-token',
      filters: {},
      createdBy: 'admin',
      createdAt: '2026-06-02T08:00:00.000Z',
      isActive: true,
    },
    {
      id: 'sub_disabled',
      orgId: 'org1',
      name: 'Disabled Feed',
      token: 'legacy-disabled-token',
      filters: {},
      createdBy: 'admin',
      createdAt: '2026-06-03T08:00:00.000Z',
      isActive: false,
    },
  ];

  const endpoints: PublicEndpoint[] = [
    {
      ...base,
      id: 'endpoint_calendar_active',
      kind: 'CALENDAR_SUBSCRIPTION',
      label: 'Cello Room Feed',
      tokenHash: 'hash_calendar_active',
      status: 'ACTIVE',
      scopes: [Q.CALENDAR_SUBSCRIPTION_PUBLIC_SCOPE],
      targetId: 'sub_active',
      consentAgreementId: null,
      expiresAt: '2026-07-01T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
    },
    {
      ...base,
      id: 'endpoint_calendar_duplicate',
      kind: 'CALENDAR_SUBSCRIPTION',
      label: 'Duplicate hash audit row',
      tokenHash: 'hash_calendar_active',
      status: 'REVOKED',
      scopes: [Q.CALENDAR_SUBSCRIPTION_PUBLIC_SCOPE],
      targetId: 'sub_duplicate',
      consentAgreementId: null,
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: T,
    },
    {
      ...base,
      id: 'endpoint_calendar_revoked',
      kind: 'CALENDAR_SUBSCRIPTION',
      label: 'Revoked Feed',
      tokenHash: 'hash_calendar_revoked',
      status: 'REVOKED',
      scopes: [Q.CALENDAR_SUBSCRIPTION_PUBLIC_SCOPE],
      targetId: 'sub_revoked',
      consentAgreementId: null,
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: T,
    },
  ];

  const calendarEvents: CalendarEvent[] = [
    {
      id: 'event_match',
      name: 'Cello, recital; line\none',
      description: 'Bring bow, rosin; stand',
      teacherId: 'staff_1',
      staffMemberIds: ['staff_1'],
      roomId: 'room_1',
      activityId: 'activity_1',
      start: '2026-06-20T09:00:00.000Z',
      end: '2026-06-20T10:00:00.000Z',
      isCanceled: false,
      isHidden: false,
      tags: ['recital'],
    },
    {
      id: 'event_wrong_room',
      name: 'Wrong room',
      description: '',
      roomId: 'room_2',
      start: '2026-06-20T09:00:00.000Z',
      end: '2026-06-20T10:00:00.000Z',
      isCanceled: false,
      isHidden: false,
      tags: ['recital'],
    },
    {
      id: 'event_hidden',
      name: 'Hidden recital',
      description: '',
      roomId: 'room_1',
      activityId: 'activity_1',
      start: '2026-06-20T11:00:00.000Z',
      end: '2026-06-20T12:00:00.000Z',
      isCanceled: false,
      isHidden: true,
      tags: ['recital'],
    },
  ];

  it('resolves calendar subscription tokens through public_endpoints scopes without requiring consent capture', () => {
    const resolved = Q.resolveCalendarSubscriptionEndpoint(endpoints, {
      tokenHash: 'hash_calendar_active',
      now: T,
    });
    expect(resolved).toEqual({
      ok: true,
      endpoint: {
        endpointId: 'endpoint_calendar_active',
        orgId: 'org1',
        kind: 'CALENDAR_SUBSCRIPTION',
        label: 'Cello Room Feed',
        scopes: [Q.CALENDAR_SUBSCRIPTION_PUBLIC_SCOPE],
        targetId: 'sub_active',
        consentAgreementId: null,
      },
    });
    if (resolved.ok) {
      expect('tokenHash' in resolved.endpoint).toBe(false);
    }

    expect(Q.resolveCalendarSubscriptionEndpoint([
      { ...endpoints[0], scopes: ['calendar_subscription:audit'] },
    ], {
      tokenHash: 'hash_calendar_active',
      now: T,
    })).toEqual({ ok: false, reason: 'MISSING_SCOPE' });
  });

  it('lists endpoint-backed active subscriptions with stale filters and duplicate-token markers', () => {
    const active = Q.listActiveSubscriptions(subscriptions, {
      now: T,
      endpoints,
      staffMembers: [
        { id: 'staff_1', positions: ['Cello'] },
        { id: 'staff_archived', positions: ['Theory'], isArchived: true },
      ],
      rooms: [{ id: 'room_1' }],
      activities: [{ id: 'activity_1', name: 'Cello Group' }],
      events: calendarEvents,
    });

    expect(active.map(s => s.id)).toEqual(['sub_active']);
    expect(active[0]).toMatchObject({
      endpointId: 'endpoint_calendar_active',
      endpointStatus: 'ACTIVE',
      duplicateTokenHash: true,
      requiresEndpointBackfill: false,
    });
    expect(active[0].filterIssues).toEqual([
      { key: 'staffMemberIds', value: 'missing_staff', reason: 'MISSING_SOURCE' },
    ]);
    expect('token' in active[0]).toBe(false);
    expect('tokenHash' in active[0]).toBe(false);
  });

  it('builds filtered RFC 5545 calendar output with escaped text and no hidden/cancelled events', () => {
    const ics = Q.buildCalendarSubscriptionIcs(subscriptions[0], calendarEvents, { now: T });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:event_match@cadenza-forte');
    expect(ics).not.toContain('event_wrong_room');
    expect(ics).not.toContain('event_hidden');
    expect(ics).toContain('SUMMARY:Cello\\, recital\\; line\\none');
    expect(ics).toContain('DESCRIPTION:Bring bow\\, rosin\\; stand');
  });

  it('summarizes external sync state without exposing public endpoint hashes', () => {
    const state = Q.listExternalSyncState({
      now: T,
      settings: {
        googleCalendarSyncEnabled: true,
        googleCalendarId: '',
      },
      events: [
        { ...calendarEvents[0], googleEventId: 'google_event_1', teacherGoogleEventIds: { staff_1: 'teacher_google_event_1' } },
        { ...calendarEvents[2], googleEventId: 'hidden_google_event' },
      ],
      subscriptions,
      endpoints,
    });

    expect(state.find(s => s.id === 'google-tenant-calendar')).toMatchObject({
      status: 'WARNING',
      syncedCount: 1,
      issueCount: 1,
    });
    expect(state.find(s => s.id === 'google-teacher-calendars')).toMatchObject({
      status: 'OK',
      syncedCount: 1,
      sourceIds: ['staff_1'],
    });
    expect(state.find(s => s.id === 'ical-subscriptions')).toMatchObject({
      status: 'WARNING',
      syncedCount: 1,
      blockedDecisionIds: ['D-23'],
    });
    expect(JSON.stringify(state)).not.toContain('hash_calendar_active');
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
    { ...base, id: 'r4', kind: 'ROOM_CHANGE', status: 'CANCELLED', requestedByStaffId: 't1', requestedFor: '2026-06-20', endDate: null, eventId: 'ev2', currentRoomId: 'rm1', requestedRoomId: 'rm3', reason: 'cancelled by teacher' },
    { ...base, id: 'r5', kind: 'ROOM_CHANGE', status: 'PENDING', requestedByStaffId: 't2', requestedFor: '2026-06-20', endDate: null, eventId: 'missing-event', currentRoomId: 'rm1', requestedRoomId: 'rm2', reason: 'stale event link' },
    { ...base, id: 'r6', kind: 'ROOM_CHANGE', status: 'PENDING', requestedByStaffId: 't1', requestedFor: '2026-06-21', endDate: null, eventId: 'ev3', currentRoomId: 'rm2', requestedRoomId: 'rm2', reason: 'same room stale request' },
  ];
  it('listRoomRequests filters kind + optional status', () => {
    expect(Q.listRoomRequests(reqs).map(r => r.id)).toEqual(['r1', 'r4', 'r5', 'r6']);
    expect(Q.listRoomRequests(reqs, 'CANCELLED').map(r => r.id)).toEqual(['r4']);
  });
  it('listRoomRequests supports own-request filtering, terminal suppression, stale links, and stable same-day ordering', () => {
    expect(Q.listRoomRequests(reqs, {
      requestedByStaffId: 't1',
      includeTerminal: false,
    }).map(r => r.id)).toEqual(['r1', 'r6']);

    expect(Q.listRoomRequests(reqs, {
      includeTerminal: false,
      includeStaleLinks: false,
      eventIds: ['ev1', 'ev2', 'ev3'],
      roomIds: ['rm1', 'rm2', 'rm3'],
    }).map(r => r.id)).toEqual(['r1']);
  });
  it('listAbsencesForPeriod uses range overlap', () => {
    expect(Q.listAbsencesForPeriod(reqs, '2026-06-19', '2026-06-30').map(r => r.id)).toEqual(['r2']);
    expect(Q.listAbsencesForPeriod(reqs, '2026-07-01', '2026-07-31').map(r => r.id)).toEqual(['r3']);
  });
  it('listAbsencesForPeriod supports own-request and active-queue filters', () => {
    expect(Q.listAbsencesForPeriod(reqs, '2026-06-01', '2026-07-31', {
      requestedByStaffId: 't1',
      includeTerminal: false,
    }).map(r => r.id)).toEqual(['r2']);
  });
  it('applyApprovedRoomChange yields the mutation or null', () => {
    const res = Q.applyApprovedRoomChange(reqs[0], {
      now: T,
      decidedBy: 'admin',
      eventIds: ['ev1'],
      roomIds: ['rm1', 'rm2'],
    });
    expect(res?.newRoomId).toBe('rm2');
    expect(res?.request.status).toBe('APPROVED');
    expect(Q.applyApprovedRoomChange(reqs[1], { now: T })).toBeNull();
    expect(Q.applyApprovedRoomChange({ ...reqs[0], status: 'APPROVED' }, { now: T })).toBeNull();
    expect(Q.applyApprovedRoomChange(reqs[4], {
      now: T,
      eventIds: ['ev1'],
      roomIds: ['rm1', 'rm2'],
    })).toBeNull();
    expect(Q.applyApprovedRoomChange(reqs[5], { now: T })).toBeNull();
  });
  it('keeps D-21 absence/day-off approvals as review-only with no automatic room mutation', () => {
    expect(Q.applyApprovedRoomChange({ ...reqs[1], status: 'APPROVED' }, { now: T })).toBeNull();
    expect(Q.applyApprovedRoomChange(reqs[2], { now: T })).toBeNull();
  });
});

describe('ensembles/theory/programs', () => {
  const activities: MinimalActivity[] = [
    { id: 'a1', name: 'Youth Orchestra', template: 'ENSEMBLE' },
    { id: 'a2', name: 'Music Theory 101', template: 'DISCIPLINE', activityType: 'ACADEMIC' },
    { id: 'a3', name: 'After School Program', template: 'PROGRAM' },
    { id: 'a4', name: 'Archived Band', template: 'ENSEMBLE', isArchived: true },
    { id: 'a5', name: 'Youth Orchestra B', template: 'ENSEMBLE' },
  ];
  const enr: MinimalEnrollment[] = [
    { id: 'e1', studentId: 's1', activityId: 'a1', status: 'ACTIVE' },
    { id: 'e2', studentId: 's2', activityId: 'a1', status: 'ACTIVE' },
    { id: 'e3', studentId: 's1', activityId: 'a2', status: 'ACTIVE' },
    { id: 'e4', studentId: 's3', activityId: 'a3', status: 'ACTIVE' },
    { id: 'e5', studentId: 's4', activityId: 'a1', status: 'ACTIVE' },
    { id: 'e6', studentId: 'missing', activityId: 'a1', status: 'ACTIVE' },
    { id: 'e7', studentId: 's2', activityId: 'a1', status: 'ARCHIVED' },
    { id: 'e8', studentId: 's2', activityId: 'a1', status: 'ACTIVE', l2Id: 'l2-b' },
    { id: 'e9', studentId: 's1', activityId: 'a5', status: 'ACTIVE', l2Id: 'l2-a' },
    { id: 'e10', studentId: 's2', activityId: 'a5', status: 'ACTIVE', l2Id: 'l2-b' },
  ];
  const assignments: MinimalTeachingAssignment[] = [
    { id: 'ta1', staffMemberId: 'staff-1', activityId: 'a1', scope: 'ACTIVITY', isArchived: false },
    { id: 'ta2', staffMemberId: 'staff-2', activityId: 'a5', scope: 'L2', l2Id: 'l2-b', isArchived: false },
    { id: 'ta3', staffMemberId: 'staff-3', activityId: 'a5', scope: 'L2', l2Id: 'l2-a', isArchived: true },
  ];
  it('listEnsembleRosters returns active ensemble rosters only', () => {
    const r = Q.listEnsembleRosters(activities, enr, students);
    expect(r).toHaveLength(2);
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
  it('flags archived, missing, duplicate, and L2 enrollment rows without counting them as active students', () => {
    const [roster] = Q.listEnsembleRosters(activities, enr, students);
    expect(roster.enrollmentIds).toEqual(['e1', 'e2', 'e6', 'e5', 'e8']);
    expect(roster.studentIds).toEqual(['s1', 's2']);
    expect(roster.archivedEnrollmentIds).toEqual(['e7']);
    expect(roster.missingStudentIds).toEqual(['missing']);
    expect(roster.archivedStudentIds).toEqual(['s4']);
    expect(roster.duplicateStudentIds).toEqual(['s2']);
    expect(roster.l2Ids).toEqual(['l2-b']);
  });
  it('buildRosterProgramViewModel gives admins full source-linked roster visibility', () => {
    const model = Q.buildRosterProgramViewModel({
      activities,
      enrollments: enr,
      students,
      teachingAssignments: assignments,
      access: { role: 'admin' },
      kind: 'ENSEMBLE',
    });

    expect(model.access).toBe('FULL');
    expect(model.canWrite).toBe(true);
    expect(model.canExport).toBe(true);
    expect(model.blockedSourceMarkers).toEqual([]);
    expect(model.items.map(item => item.activity.id)).toEqual(['a1', 'a5']);
    expect(model.items[0].assignedStaffMemberIds).toEqual(['staff-1']);
    expect(model.items[0].visibleSourceIds).toEqual({
      activityId: 'a1',
      enrollmentIds: ['e1', 'e2', 'e6', 'e5', 'e8'],
      assignmentIds: ['ta1'],
    });
  });
  it('buildRosterProgramViewModel limits assigned teachers to their own L2 roster slice', () => {
    const model = Q.buildRosterProgramViewModel({
      activities,
      enrollments: enr,
      students,
      teachingAssignments: assignments,
      access: { role: 'teacher', staffMemberId: 'staff-2' },
      kind: 'ENSEMBLE',
    });

    expect(model.access).toBe('ASSIGNED_TEACHER');
    expect(model.canWrite).toBe(false);
    expect(model.canExport).toBe(false);
    expect(model.items).toHaveLength(1);
    expect(model.items[0].activity.id).toBe('a5');
    expect(model.items[0].studentIds).toEqual(['s2']);
    expect(model.items[0].l2Ids).toEqual(['l2-b']);
    expect(model.items[0].visibleSourceIds).toEqual({
      activityId: 'a5',
      enrollmentIds: ['e10'],
      assignmentIds: ['ta2'],
    });
  });
  it('buildRosterProgramViewModel denies plain member, finance, and unrelated teacher access without leaking counts', () => {
    for (const access of [
      { role: 'member' as const },
      { role: 'finance' as const },
      { role: 'teacher' as const, staffMemberId: 'staff-other' },
    ]) {
      const model = Q.buildRosterProgramViewModel({
        activities,
        enrollments: enr,
        students,
        teachingAssignments: assignments,
        access,
      });
      expect(model.items).toEqual([]);
      expect(model.canWrite).toBe(false);
      expect(model.canExport).toBe(false);
      if (access.role === 'teacher') {
        expect(model.access).toBe('ASSIGNED_TEACHER');
        expect(model.blockedSourceMarkers).toEqual([]);
      } else {
        expect(model.access).toBe('DENIED');
        expect(model.blockedSourceMarkers).toEqual(['roster_programs']);
      }
    }
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
    { ...base, id: 'x0', name: 'Cancelled Same-Day Exam', activityId: 'activity_2', date: '2026-05-01', status: 'CANCELLED', examinerStaffIds: ['t2'], studentIds: ['s2'], notes: null },
    { ...base, id: 'x3', name: 'Second Summer Exam', activityId: 'activity_1', date: '2026-08-01', status: 'SCHEDULED', examinerStaffIds: ['t1', 't2'], studentIds: ['s1', 's2'], notes: null },
  ];
  const subs: ExaminerSubmission[] = [
    { ...base, id: 'sub1', examSessionId: 'x1', studentId: 's1', examinerStaffId: 't1', score: 88, grade: 'A', remarks: null, submittedAt: '2026-05-02T10:00:00.000Z' },
    { ...base, id: 'sub2', examSessionId: 'x1', studentId: 's1', examinerStaffId: 't2', score: 92, grade: 'A', remarks: null, submittedAt: '2026-05-02T11:00:00.000Z' },
    { ...base, id: 'sub0', examSessionId: 'x3', studentId: 's1', examinerStaffId: 't1', score: null, grade: null, remarks: 'Awaiting final mark', submittedAt: null },
    { ...base, id: 'sub3', examSessionId: 'x3', studentId: 's2', examinerStaffId: 't2', score: 77, grade: 'B', remarks: null, submittedAt: '2026-08-02T11:00:00.000Z' },
  ];
  const certs: Certificate[] = [
    { ...base, id: 'c1', studentId: 's1', examSessionId: 'x1', title: 'Grade 3 Violin', level: '3', status: 'ISSUED', issuedAt: T, documentUrl: null, documentPath: null },
    { ...base, id: 'c2', studentId: 's2', examSessionId: null, title: 'Pending Cert', level: null, status: 'PENDING', issuedAt: null, documentUrl: null, documentPath: null },
    { ...base, id: 'c0', studentId: 's1', examSessionId: 'x1', title: 'Revoked Cert', level: '2', status: 'REVOKED', issuedAt: T, documentUrl: null, documentPath: 'org1/assessments/c0/revoked.pdf' },
    { ...base, id: 'c3', studentId: 's3', examSessionId: null, title: 'Pending Same Timestamp', level: null, status: 'PENDING', issuedAt: null, documentUrl: null, documentPath: null },
  ];
  const reportCards: ReportCard[] = [
    { ...base, id: 'r2', studentId: 's1', periodLabel: '2026 Spring', activityId: 'activity_1', lines: [{ subject: 'Technique', grade: 'A', comment: 'Secure' }], summary: 'Released privately.', publishedAt: '2026-06-01T10:00:00.000Z' },
    { ...base, id: 'r1', studentId: 's1', periodLabel: '2026 Draft', activityId: 'activity_1', lines: [{ subject: 'Musicianship', grade: null, comment: null }], summary: null, publishedAt: null },
    { ...base, id: 'r3', studentId: 's2', periodLabel: '2026 Spring', activityId: 'activity_1', lines: [], summary: null, publishedAt: null },
  ];
  it('listExamSessions filters by status', () => {
    expect(Q.listExamSessions(sessions, 'SCHEDULED').map(s => s.id)).toEqual(['x2', 'x3']);
  });
  it('listExamSessions applies stable session filters for activity, examiner, and student', () => {
    expect(Q.listExamSessions(sessions, { activityId: 'activity_1', examinerStaffId: 't2', studentId: 's2' }).map(s => s.id)).toEqual(['x3']);
    expect(Q.listExamSessions(sessions).map(s => s.id)).toEqual(['x0', 'x1', 'x2', 'x3']);
  });
  it('getStudentAssessmentSummary averages scored multi-examiner submissions, keeps missing scores, and excludes revoked certificates', () => {
    const s = Q.getStudentAssessmentSummary('s1', subs, certs, reportCards);
    expect(s.examCount).toBe(3);
    expect(s.averageScore).toBe(90);
    expect(s.certificates).toBe(1);
    expect(s.submissions.map(row => row.id)).toEqual(['sub0', 'sub1', 'sub2']);
    expect(s.reportCards).toMatchObject({ total: 2, draft: 1, released: 1 });
    expect(s.reportCards.items.map(row => row.id)).toEqual(['r1', 'r2']);
  });
  it('listPendingCertificates returns only pending with stable id tie-breaks', () => {
    expect(Q.listPendingCertificates(certs).map(c => c.id)).toEqual(['c2', 'c3']);
  });
});

describe('concert programs', () => {
  const programs: ConcertProgram[] = [
    { ...base, id: 'p1', title: 'Winter Concert', eventId: 'ev9', date: '2026-12-01', venue: 'Hall A', status: 'PUBLISHED', notes: null, pieces: [
      { order: 2, title: 'Piece B', composer: 'Bach', performerStudentIds: ['s2'], performerStaffIds: [], durationMinutes: 5 },
      { order: 1, title: 'Piece A', composer: 'Mozart', performerStudentIds: ['s1'], performerStaffIds: ['t1'], durationMinutes: 10 },
    ] },
    { ...base, id: 'p2', title: 'Draft Show', eventId: null, date: '2026-11-01', venue: null, status: 'DRAFT', notes: null, pieces: [] },
    { ...base, id: 'p0', title: 'Cancelled Hold', eventId: 'ev0', date: '2026-11-01', venue: 'Hall B', status: 'CANCELLED', notes: null, pieces: [] },
    { ...base, id: 'p3', title: 'Draft Same Day', eventId: null, date: '2026-11-01', venue: null, status: 'DRAFT', notes: null, pieces: [] },
  ];
  it('listConcertPrograms filters by status and keeps draft/cancelled/unlinked ordering stable', () => {
    expect(Q.listConcertPrograms(programs, 'PUBLISHED').map(p => p.id)).toEqual(['p1']);
    expect(Q.listConcertPrograms(programs, 'DRAFT').map(p => p.id)).toEqual(['p2', 'p3']);
    expect(Q.listConcertPrograms(programs, 'CANCELLED').map(p => p.id)).toEqual(['p0']);
    expect(Q.listConcertPrograms(programs).map(p => p.id)).toEqual(['p2', 'p3', 'p0', 'p1']);
    expect(Q.listConcertPrograms(programs).filter(p => p.eventId === null).map(p => p.id)).toEqual(['p2', 'p3']);
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
  it('getProgramRunOfShow flags duplicate order, unknown-duration tails, and stale performers', () => {
    const program: ConcertProgram = {
      ...base,
      id: 'p4',
      title: 'Spring Concert',
      eventId: 'ev4',
      date: '2026-12-10',
      venue: 'Main Hall',
      status: 'DRAFT',
      notes: null,
      pieces: [
        { order: 1, title: 'Known A', composer: null, performerStudentIds: ['s1'], performerStaffIds: ['staff_archived'], durationMinutes: 4 },
        { order: 2, title: 'A Unknown', composer: null, performerStudentIds: ['missing_student'], performerStaffIds: ['t1'], durationMinutes: null },
        { order: 2, title: 'Known B', composer: null, performerStudentIds: ['s_archived'], performerStaffIds: ['missing_staff'], durationMinutes: 6 },
      ],
    };

    const ros = Q.getProgramRunOfShow(program, {
      students: [
        { id: 's1', fullName: 'Dana Cohen' },
        { id: 's_archived', fullName: 'Old Student', isArchived: true },
      ],
      staff: [
        { id: 't1', fullName: 'Mira Staff' },
        { id: 'staff_archived', fullName: 'Old Staff', isArchived: true },
      ],
    });

    expect(ros.map(row => row.title)).toEqual(['Known A', 'A Unknown', 'Known B']);
    expect(ros.map(row => row.orderConflict)).toEqual([false, true, true]);
    expect(ros.map(row => row.cumulativeMinutes)).toEqual([4, null, null]);
    expect(ros[0].performerNames).toEqual(['Dana Cohen']);
    expect(ros[0].staleStaffIds).toEqual(['staff_archived']);
    expect(ros[1].performerNames).toEqual(['Mira Staff']);
    expect(ros[1].staleStudentIds).toEqual(['missing_student']);
    expect(ros[2].staleStudentIds).toEqual(['s_archived']);
    expect(ros[2].staleStaffIds).toEqual(['missing_staff']);
  });
  it('listPerformerEvents distinguishes student and staff performer IDs', () => {
    const collidingPrograms: ConcertProgram[] = [
      { ...base, id: 'student_hit', title: 'Student Hit', eventId: 'ev_s', date: '2026-12-04', venue: null, status: 'PUBLISHED', notes: null, pieces: [
        { order: 1, title: 'Student Piece', composer: null, performerStudentIds: ['shared'], performerStaffIds: [], durationMinutes: 3 },
      ] },
      { ...base, id: 'staff_hit', title: 'Staff Hit', eventId: 'ev_t', date: '2026-12-05', venue: null, status: 'PUBLISHED', notes: null, pieces: [
        { order: 1, title: 'Staff Piece', composer: null, performerStudentIds: [], performerStaffIds: ['shared'], durationMinutes: 3 },
      ] },
    ];

    expect(Q.listPerformerEvents(collidingPrograms, 'shared', 'student').map(p => p.id)).toEqual(['student_hit']);
    expect(Q.listPerformerEvents(collidingPrograms, 'shared', 'staff').map(p => p.id)).toEqual(['staff_hit']);
    expect(Q.listPerformerEvents(collidingPrograms, 'shared').map(p => p.id)).toEqual(['staff_hit', 'student_hit']);
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

describe('operations command center helpers', () => {
  const event = (
    id: string,
    start: string,
    end: string,
    overrides: Partial<CalendarEvent> = {},
  ): CalendarEvent => ({
    id,
    name: id,
    description: '',
    roomId: 'room-a',
    start,
    end,
    isCanceled: false,
    isHidden: false,
    ...overrides,
  });

  it('countOpenConflicts ignores hidden and cancelled event rows', () => {
    const events = [
      event('visible-a', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'),
      event('visible-b', '2026-06-19T09:30:00.000Z', '2026-06-19T10:30:00.000Z'),
      event('hidden-overlap', '2026-06-19T09:45:00.000Z', '2026-06-19T10:15:00.000Z', { isHidden: true }),
      event('cancelled-overlap', '2026-06-19T09:15:00.000Z', '2026-06-19T09:45:00.000Z', { isCanceled: true }),
      event('other-room', '2026-06-19T09:15:00.000Z', '2026-06-19T09:45:00.000Z', { roomId: 'room-b' }),
    ];

    expect(Q.countOpenConflicts(events)).toBe(1);
  });

  it('listTodayEvents uses the org timezone date window and stable start/id sorting', () => {
    const events = [
      event('utc-early', '2026-06-19T06:00:00.000Z', '2026-06-19T07:00:00.000Z'),
      event('jerusalem-a', '2026-06-18T22:30:00.000Z', '2026-06-18T23:30:00.000Z'),
      event('jerusalem-b', '2026-06-18T22:30:00.000Z', '2026-06-18T23:00:00.000Z'),
      event('previous-local-day', '2026-06-18T20:00:00.000Z', '2026-06-18T21:00:00.000Z'),
      event('hidden-today', '2026-06-18T23:30:00.000Z', '2026-06-19T00:30:00.000Z', { isHidden: true }),
      event('cancelled-today', '2026-06-18T23:45:00.000Z', '2026-06-19T00:45:00.000Z', { isCanceled: true }),
    ];

    expect(Q.listTodayEvents(events, {
      now: '2026-06-19T08:00:00.000Z',
      timeZone: 'Asia/Jerusalem',
    }).map(e => e.id)).toEqual(['jerusalem-a', 'jerusalem-b', 'utc-early']);

    expect(Q.listTodayEvents(events, {
      date: '2026-06-19',
      timeZone: 'UTC',
    }).map(e => e.id)).toEqual(['utc-early']);
  });

  it('countPendingHoursReports delegates to the pending hours entry semantics', () => {
    const entries: HoursEntry[] = [
      { ...base, id: 'draft', staffMemberId: 't1', hoursReportId: null, date: '2026-06-01', reportedMinutes: 30, calendarMinutes: 30, eventId: null, teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'DRAFT', note: null },
      { ...base, id: 'submitted', staffMemberId: 't1', hoursReportId: null, date: '2026-06-02', reportedMinutes: 30, calendarMinutes: 30, eventId: null, teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'SUBMITTED', note: null },
      { ...base, id: 'approved', staffMemberId: 't1', hoursReportId: null, date: '2026-06-03', reportedMinutes: 30, calendarMinutes: 30, eventId: null, teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'APPROVED', note: null },
      { ...base, id: 'paid', staffMemberId: 't1', hoursReportId: null, date: '2026-06-04', reportedMinutes: 30, calendarMinutes: 30, eventId: null, teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'PAID', note: null },
    ];

    expect(Q.countPendingHoursReports(entries)).toBe(2);
  });

  it('returns stable severity-ordered role-filtered operations access without hidden-count leakage', () => {
    expect(Q.listOperationsCardAccess('admin', { allowedOnly: true }).map(c => c.source)).toEqual([
      'openConflicts',
      'importHealth',
      'openInboxItems',
      'pendingHoursReports',
      'reportHealth',
      'todayEvents',
    ]);
    expect(Q.listOperationsCardAccess('finance', { allowedOnly: true }).map(c => c.source)).toEqual([
      'pendingHoursReports',
      'reportHealth',
    ]);
    expect(Q.listOperationsCardAccess('teacher', { allowedOnly: true })).toEqual([]);

    const deniedConflict = Q.getOperationsCardAccess('openConflicts', 'finance');
    expect(deniedConflict).toMatchObject({
      allowed: false,
      reason: 'ROLE_DENIED',
      revealCounts: false,
      revealSourceIds: false,
    });
  });

  it('marks provisional blocked operations sources and never reveals their counts or source ids', () => {
    expect(Q.getOperationsCardAccess('absenceImpact', 'admin')).toMatchObject({
      allowed: false,
      reason: 'BLOCKED_SOURCE',
      blockedDecisionIds: ['D-21'],
      revealCounts: false,
      revealSourceIds: false,
    });
    expect(Q.getOperationsCardAccess('hrEvaluations', 'finance')).toMatchObject({
      allowed: false,
      reason: 'BLOCKED_SOURCE',
      blockedDecisionIds: ['D-26'],
      revealCounts: false,
      revealSourceIds: false,
    });
  });

  it('marks stale source references after source row deletion', () => {
    expect(Q.resolveOperationsSourceReferences(
      ['event-3', 'event-1', 'event-2'],
      ['event-1', 'event-3'],
    )).toEqual([
      { id: 'event-1', exists: true, stale: false },
      { id: 'event-2', exists: false, stale: true },
      { id: 'event-3', exists: true, stale: false },
    ]);
  });

  it('buildOperationsSnapshot composes authorized admin cards with source lineage only from source rows', () => {
    const events = [
      event('conflict-a', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z', { audit: { updatedAt: '2026-06-18T12:00:00.000Z' } }),
      event('conflict-b', '2026-06-19T09:30:00.000Z', '2026-06-19T10:30:00.000Z', { audit: { updatedAt: '2026-06-18T13:00:00.000Z' } }),
      event('today-only', '2026-06-19T11:00:00.000Z', '2026-06-19T12:00:00.000Z'),
      event('hidden-overlap', '2026-06-19T09:45:00.000Z', '2026-06-19T10:15:00.000Z', { isHidden: true }),
    ];
    const hoursEntries: HoursEntry[] = [
      { ...base, id: 'hours-draft', staffMemberId: 't1', hoursReportId: null, date: '2026-06-01', reportedMinutes: 30, calendarMinutes: 30, eventId: null, teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'DRAFT', note: null },
      { ...base, id: 'hours-paid', staffMemberId: 't1', hoursReportId: null, date: '2026-06-02', reportedMinutes: 30, calendarMinutes: 30, eventId: null, teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'PAID', note: null },
    ];
    const adminInboxItems = [
      { id: 'inbox-open', orgId: 'org1', type: 'NOTIFICATION' as const, status: 'OPEN' as const, title: 'Open', message: 'Open item', createdAt: '2026-06-18T09:00:00.000Z' },
      { id: 'inbox-done', orgId: 'org1', type: 'NOTIFICATION' as const, status: 'DONE' as const, title: 'Done', message: 'Done item', createdAt: '2026-06-18T08:00:00.000Z' },
    ];
    const reportDefinitions: ReportDefinition[] = [
      { ...base, id: 'report-charge', name: 'Charges', description: null, sourceEntity: 'charges', filters: [], groupBy: null, aggregate: { fn: 'none', field: null }, columns: ['id'], isPinned: true },
      { ...base, id: 'report-student', name: 'Students', description: null, sourceEntity: 'students', filters: [], groupBy: null, aggregate: { fn: 'none', field: null }, columns: ['id'], isPinned: false },
    ];
    const importSessions: ImportSession[] = [
      { id: 'import-errors', orgId: 'org1', createdBy: 'admin', entityType: 'STUDENT', status: 'COMPLETED_WITH_ERRORS', fileName: 'students.csv', totalRows: 4, importedRows: 2, skippedRows: 1, rowResults: [], createdAt: { seconds: 1_718_665_000, nanoseconds: 0 }, updatedAt: { seconds: 1_718_665_100, nanoseconds: 0 } },
      { id: 'import-done', orgId: 'org1', createdBy: 'admin', entityType: 'ROOM', status: 'COMPLETED', fileName: 'rooms.csv', totalRows: 1, importedRows: 1, skippedRows: 0, rowResults: [], createdAt: { seconds: 1_718_665_000, nanoseconds: 0 }, updatedAt: { seconds: 1_718_665_200, nanoseconds: 0 } },
    ];

    const snapshot = Q.buildOperationsSnapshot({
      events,
      hoursEntries,
      adminInboxItems,
      reportDefinitions,
      importSessions,
    }, {
      orgId: 'org1',
      actor: 'admin',
      generatedAt: T,
      date: '2026-06-19',
      timeZone: 'UTC',
      existingSourceIds: {
        openConflicts: ['conflict-a'],
      },
    });

    expect(snapshot).toMatchObject({
      orgId: 'org1',
      actor: 'admin',
      generatedAt: T,
      dateWindow: { date: '2026-06-19', timeZone: 'UTC' },
    });
    expect(snapshot.cards.map(card => card.source)).toEqual([
      'absenceImpact',
      'openConflicts',
      'assessmentDelivery',
      'consentRevocation',
      'hrEvaluations',
      'importHealth',
      'instrumentDepositRefunds',
      'openInboxItems',
      'pendingHoursReports',
      'publicEndpointHealth',
      'rolloverCopyHealth',
      'reportHealth',
      'todayEvents',
    ]);

    expect(snapshot.cards.find(card => card.source === 'openConflicts')).toMatchObject({
      status: 'STALE_SOURCE',
      count: 1,
      sourceIds: ['conflict-a', 'conflict-b'],
      sourceUpdatedAt: '2026-06-18T13:00:00.000Z',
      routeTarget: 'CALENDAR',
      sourceReferences: [
        { id: 'conflict-a', exists: true, stale: false },
        { id: 'conflict-b', exists: false, stale: true },
      ],
    });
    expect(snapshot.cards.find(card => card.source === 'todayEvents')).toMatchObject({
      count: 3,
      sourceIds: ['conflict-a', 'conflict-b', 'today-only'],
    });
    expect(snapshot.cards.find(card => card.source === 'openInboxItems')).toMatchObject({
      count: 1,
      sourceIds: ['inbox-open'],
      routeTarget: 'ADMIN_INBOX',
    });
    expect(snapshot.cards.find(card => card.source === 'pendingHoursReports')).toMatchObject({
      count: 1,
      sourceIds: ['hours-draft'],
      routeTarget: 'PAYROLL',
    });
    expect(snapshot.cards.find(card => card.source === 'importHealth')).toMatchObject({
      count: 1,
      sourceIds: ['import-errors'],
      routeTarget: 'MANAGE',
    });
    expect(snapshot.cards.find(card => card.source === 'reportHealth')).toMatchObject({
      count: 2,
      sourceIds: ['report-charge', 'report-student'],
      routeTarget: 'ANALYTICS',
    });
    expect(snapshot.cards.find(card => card.source === 'absenceImpact')).toMatchObject({
      status: 'BLOCKED',
      count: null,
      sourceIds: [],
      blockedDecisionIds: ['D-21'],
    });
  });

  it('buildOperationsSnapshot limits finance cards to finance-authorized sources without hidden report counts', () => {
    const reportDefinitions: ReportDefinition[] = [
      { ...base, id: 'report-charge', name: 'Charges', description: null, sourceEntity: 'charges', filters: [], groupBy: null, aggregate: { fn: 'none', field: null }, columns: ['id'], isPinned: true },
      { ...base, id: 'report-hours', name: 'Hours', description: null, sourceEntity: 'hoursEntries', filters: [], groupBy: null, aggregate: { fn: 'none', field: null }, columns: ['id'], isPinned: false },
      { ...base, id: 'report-student', name: 'Students', description: null, sourceEntity: 'students', filters: [], groupBy: null, aggregate: { fn: 'none', field: null }, columns: ['id'], isPinned: false },
    ];
    const hoursEntries: HoursEntry[] = [
      { ...base, id: 'hours-submitted', staffMemberId: 't1', hoursReportId: null, date: '2026-06-01', reportedMinutes: 30, calendarMinutes: 30, eventId: null, teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'SUBMITTED', note: null },
    ];

    const snapshot = Q.buildOperationsSnapshot({
      events: [
        event('conflict-a', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'),
        event('conflict-b', '2026-06-19T09:30:00.000Z', '2026-06-19T10:30:00.000Z'),
      ],
      hoursEntries,
      adminInboxItems: [
        { id: 'inbox-open', orgId: 'org1', type: 'NOTIFICATION', status: 'OPEN', title: 'Open', message: 'Open item', createdAt: T },
      ],
      reportDefinitions,
    }, {
      orgId: 'org1',
      actor: 'finance',
      generatedAt: T,
      date: '2026-06-19',
      timeZone: 'UTC',
    });

    expect(snapshot.cards.map(card => card.source)).toEqual([
      'absenceImpact',
      'assessmentDelivery',
      'consentRevocation',
      'hrEvaluations',
      'instrumentDepositRefunds',
      'pendingHoursReports',
      'publicEndpointHealth',
      'rolloverCopyHealth',
      'reportHealth',
    ]);
    expect(snapshot.cards.find(card => card.source === 'pendingHoursReports')).toMatchObject({
      count: 1,
      sourceIds: ['hours-submitted'],
    });
    expect(snapshot.cards.find(card => card.source === 'reportHealth')).toMatchObject({
      count: 2,
      sourceIds: ['report-charge', 'report-hours'],
    });
    expect(snapshot.cards.some(card => card.source === 'openConflicts')).toBe(false);
    expect(snapshot.cards.some(card => card.source === 'openInboxItems')).toBe(false);
    expect(snapshot.cards.flatMap(card => card.sourceIds)).not.toContain('report-student');
    expect(snapshot.cards.flatMap(card => card.sourceIds)).not.toContain('inbox-open');
    expect(snapshot.cards.flatMap(card => card.sourceIds)).not.toContain('conflict-a');
  });

  it('buildOperationsSnapshot denies non-operator actors by default and can expose redacted denial cards for permission UI', () => {
    const sources = {
      events: [
        event('conflict-a', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'),
        event('conflict-b', '2026-06-19T09:30:00.000Z', '2026-06-19T10:30:00.000Z'),
      ],
    };
    const options = {
      orgId: 'org1',
      actor: 'member' as const,
      generatedAt: T,
      date: '2026-06-19' as const,
      timeZone: 'UTC',
    };

    expect(Q.buildOperationsSnapshot(sources, options).cards).toEqual([]);

    const redacted = Q.buildOperationsSnapshot(sources, {
      ...options,
      includeDeniedCards: true,
      includeBlockedCards: true,
    });
    expect(redacted.cards.find(card => card.source === 'openConflicts')).toMatchObject({
      status: 'DENIED',
      accessReason: 'ROLE_DENIED',
      count: null,
      sourceIds: [],
      sourceReferences: [],
    });
    expect(redacted.cards.find(card => card.source === 'absenceImpact')).toMatchObject({
      status: 'BLOCKED',
      accessReason: 'BLOCKED_SOURCE',
      count: null,
      sourceIds: [],
      blockedDecisionIds: ['D-21'],
    });
  });

  it('redacts hidden operations counts and source ids for finance, teacher, member, and anonymous actors', () => {
    const sensitiveEvents = [
      event('conflict-a', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'),
      event('conflict-b', '2026-06-19T09:30:00.000Z', '2026-06-19T10:30:00.000Z'),
      event('today-only', '2026-06-19T12:00:00.000Z', '2026-06-19T13:00:00.000Z'),
    ];
    const sensitiveInbox: AdminInboxItem[] = [
      { id: 'inbox-sensitive', orgId: 'org1', type: 'APPROVAL_REQUEST', status: 'OPEN', title: 'Sensitive request', message: 'Do not leak', createdAt: T },
    ];
    const sensitiveReports: ReportDefinition[] = [
      { ...base, id: 'report-charge', name: 'Charges', description: null, sourceEntity: 'charges', filters: [], groupBy: null, aggregate: { fn: 'none', field: null }, columns: ['id'], isPinned: true },
      { ...base, id: 'report-student', name: 'Students', description: null, sourceEntity: 'students', filters: [], groupBy: null, aggregate: { fn: 'none', field: null }, columns: ['id'], isPinned: false },
    ];
    const sources = {
      events: sensitiveEvents,
      adminInboxItems: sensitiveInbox,
      reportDefinitions: sensitiveReports,
      hoursEntries: [
        { ...base, id: 'hours-submitted', staffMemberId: 't1', hoursReportId: null, date: '2026-06-01', reportedMinutes: 30, calendarMinutes: 30, eventId: null, teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'SUBMITTED' as const, note: null },
      ],
    };
    const baseOptions = {
      orgId: 'org1',
      generatedAt: T,
      date: '2026-06-19' as const,
      timeZone: 'UTC',
      includeDeniedCards: true,
      includeBlockedCards: true,
    };

    const finance = Q.buildOperationsSnapshot(sources, { ...baseOptions, actor: 'finance' });
    expect(finance.cards.find(card => card.source === 'openConflicts')).toMatchObject({
      status: 'DENIED',
      count: null,
      sourceIds: [],
      sourceReferences: [],
    });
    expect(finance.cards.find(card => card.source === 'openInboxItems')).toMatchObject({
      status: 'DENIED',
      count: null,
      sourceIds: [],
    });
    expect(finance.cards.find(card => card.source === 'todayEvents')).toMatchObject({
      status: 'DENIED',
      count: null,
      sourceIds: [],
    });
    expect(finance.cards.find(card => card.source === 'reportHealth')).toMatchObject({
      count: 1,
      sourceIds: ['report-charge'],
    });
    expect(finance.cards.flatMap(card => card.sourceIds)).not.toEqual(
      expect.arrayContaining(['conflict-a', 'conflict-b', 'today-only', 'inbox-sensitive', 'report-student']),
    );

    for (const actor of ['teacher', 'member', 'anonymous'] as const) {
      const snapshot = Q.buildOperationsSnapshot(sources, { ...baseOptions, actor });
      expect(snapshot.cards.every(card => card.count === null), actor).toBe(true);
      expect(snapshot.cards.every(card => card.sourceIds.length === 0), actor).toBe(true);
      expect(snapshot.cards.every(card => card.sourceReferences.length === 0), actor).toBe(true);
      expect(snapshot.cards.some(card => card.status === 'READY'), actor).toBe(false);
      expect(snapshot.cards.flatMap(card => card.sourceIds), actor).not.toEqual(
        expect.arrayContaining(['conflict-a', 'conflict-b', 'today-only', 'inbox-sensitive', 'hours-submitted', 'report-charge', 'report-student']),
      );
    }
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
    { ...base, id: 't2', kind: 'ENROLLMENT', title: 'Enrollment Terms', version: 1, body: '...', isActive: true, supersedesVersion: null, requiresGuardian: false },
    { ...base, id: 't3', kind: 'FINANCIAL', title: 'Payment Terms', version: 1, body: '...', isActive: true, supersedesVersion: null, requiresGuardian: true },
    { ...base, id: 't4', kind: 'OTHER', title: 'Archived Policy', version: 1, body: '...', isActive: false, supersedesVersion: null, requiresGuardian: false },
  ];
  const acceptances: AgreementAcceptance[] = [
    { ...base, id: 'ac1', templateId: 't1', templateVersion: 1, studentId: 's1', familyId: null, enrollmentId: 'en1', guardianId: 'g1', status: 'ACCEPTED', acceptedAt: '2025-09-01T10:00:00.000Z', acceptedByName: 'Dana', signatureRef: null },
    { ...base, id: 'ac2', templateId: 't1', templateVersion: 2, studentId: 's2', familyId: null, enrollmentId: 'en2', guardianId: 'g1', status: 'ACCEPTED', acceptedAt: '2026-09-01T10:00:00.000Z', acceptedByName: 'Dana', signatureRef: null },
    { ...base, id: 'ac3', templateId: 't2', templateVersion: 1, studentId: 's1', familyId: null, enrollmentId: 'en1', guardianId: null, status: 'DECLINED', acceptedAt: null, acceptedByName: null, signatureRef: null },
    { ...base, id: 'ac4', templateId: 't2', templateVersion: 1, studentId: 's2', familyId: null, enrollmentId: 'en2', guardianId: null, status: 'EXPIRED', acceptedAt: null, acceptedByName: null, signatureRef: null },
    { ...base, id: 'ac5', templateId: 't3', templateVersion: 1, studentId: null, familyId: 'f1', enrollmentId: null, guardianId: 'g1', status: 'ACCEPTED', acceptedAt: '2026-08-01T10:00:00.000Z', acceptedByName: 'Dana', signatureRef: 'typed://sig/ac5' },
    { ...base, id: 'ac6', templateId: 't1', templateVersion: 1, studentId: 's4', familyId: null, enrollmentId: 'en4', guardianId: 'g2', status: 'SUPERSEDED', acceptedAt: '2025-08-01T10:00:00.000Z', acceptedByName: 'Mia', signatureRef: null },
  ];
  it('listUnsignedAgreements flags superseded + never-signed', () => {
    const r = Q.listUnsignedAgreements([templates[0]], acceptances, ['s1', 's2', 's3']);
    const s1 = r.find(x => x.studentId === 's1')!;
    expect(s1.reason).toBe('SUPERSEDED_VERSION'); // had v1, active is v2
    expect(r.find(x => x.studentId === 's2')).toBeUndefined(); // signed v2
    expect(r.find(x => x.studentId === 's3')!.reason).toBe('NEVER_ACCEPTED');
  });
  it('listUnsignedAgreements handles scoped family/enrollment targets and guardian-required templates', () => {
    const r = Q.listUnsignedAgreements(templates, acceptances, [
      { studentId: 's1', enrollmentId: 'en1', kind: 'ENROLLMENT' },
      { studentId: null, familyId: 'f1', guardianId: 'g1', templateId: 't3' },
      { studentId: null, familyId: 'f2', guardianId: 'g2', templateId: 't3' },
    ]);

    expect(r.map(x => ({
      templateId: x.template.id,
      requiresGuardian: x.template.requiresGuardian,
      studentId: x.studentId,
      familyId: x.familyId,
      enrollmentId: x.enrollmentId,
      guardianId: x.guardianId,
      reason: x.reason,
    }))).toEqual([
      {
        templateId: 't2',
        requiresGuardian: false,
        studentId: 's1',
        familyId: null,
        enrollmentId: 'en1',
        guardianId: null,
        reason: 'NEVER_ACCEPTED',
      },
      {
        templateId: 't3',
        requiresGuardian: true,
        studentId: null,
        familyId: 'f2',
        enrollmentId: null,
        guardianId: 'g2',
        reason: 'NEVER_ACCEPTED',
      },
    ]);
  });
  it('listUnsignedAgreements treats declined/expired as unsigned and superseded rows as stale signatures', () => {
    const r = Q.listUnsignedAgreements(templates, acceptances, [
      { studentId: 's1', enrollmentId: 'en1', templateId: 't2' },
      { studentId: 's2', enrollmentId: 'en2', templateId: 't2' },
      { studentId: 's4', enrollmentId: 'en4', templateId: 't1' },
    ]);

    expect(r.map(x => [x.template.id, x.studentId, x.reason])).toEqual([
      ['t2', 's1', 'NEVER_ACCEPTED'],
      ['t2', 's2', 'NEVER_ACCEPTED'],
      ['t1', 's4', 'SUPERSEDED_VERSION'],
    ]);
  });
  it('listUnsignedAgreements ignores inactive templates and sorts deterministically', () => {
    const sameTitleTemplates: AgreementTemplate[] = [
      { ...base, id: 't_b', kind: 'CONSENT', title: 'Same Title', version: 1, body: '...', isActive: true, supersedesVersion: null, requiresGuardian: false },
      { ...base, id: 't_a', kind: 'CONSENT', title: 'Same Title', version: 1, body: '...', isActive: true, supersedesVersion: null, requiresGuardian: false },
      { ...base, id: 't_inactive', kind: 'CONSENT', title: 'AAA Inactive', version: 1, body: '...', isActive: false, supersedesVersion: null, requiresGuardian: false },
    ];

    const r = Q.listUnsignedAgreements(sameTitleTemplates, [], ['s2', 's1']);

    expect(r.map(x => `${x.template.id}:${x.studentId}`)).toEqual([
      't_a:s1',
      't_a:s2',
      't_b:s1',
      't_b:s2',
    ]);
  });
  it('getAgreementHistory + findAgreementByEnrollment sort newest first with id tie-breaks', () => {
    const sameTime = '2026-09-02T10:00:00.000Z';
    const historyRows: AgreementAcceptance[] = [
      { ...acceptances[0], id: 'tie_b', acceptedAt: sameTime, createdAt: '2026-09-01T10:00:00.000Z' },
      { ...acceptances[0], id: 'older', acceptedAt: '2026-09-01T10:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z' },
      { ...acceptances[0], id: 'tie_a', acceptedAt: sameTime, createdAt: '2026-09-01T10:00:00.000Z' },
      { ...acceptances[0], id: 'created_only', acceptedAt: null, createdAt: '2026-09-03T10:00:00.000Z' },
    ];

    expect(Q.getAgreementHistory(historyRows, 't1').map(a => a.id)).toEqual(['created_only', 'tie_a', 'tie_b', 'older']);
    expect(Q.findAgreementByEnrollment(historyRows, 'en1').map(a => a.id)).toEqual(['created_only', 'tie_a', 'tie_b', 'older']);
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
    { id: 'ch2', status: 'PAID', amount: 500, currency: 'ILS' },
    { id: 'ch1', status: 'OPEN', amount: 500, currency: 'ILS' },
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

  it('rejects invalid columns, filters, aggregate fields, and unknown operators before reading rows', () => {
    expect(() => Q.runReportDefinition({ ...def, columns: ['id', 'guardians'] }, rows)).toThrow(/Column field "guardians"/);
    expect(() => Q.runReportDefinition({ ...def, filters: [{ field: 'signatureRef', op: 'eq', value: 'x' }] }, rows)).toThrow(/Filter field "signatureRef"/);
    expect(() => Q.runReportDefinition({ ...def, aggregate: { fn: 'sum', field: 'status' } }, rows)).toThrow(/must be numeric/);
    expect(() => Q.runReportDefinition({
      ...def,
      filters: [{ field: 'status', op: 'regex' as never, value: '^OPEN' }],
    }, rows)).toThrow(/operator "regex"/);
  });

  it('supports every filter operator with validated values', () => {
    const sourceRows = [
      { id: 'a', status: 'OPEN', amount: 100, currency: 'ILS', description: 'Private lesson' },
      { id: 'b', status: 'PARTIAL', amount: 250, currency: 'ILS', description: 'Ensemble fee' },
      { id: 'c', status: 'PAID', amount: 400, currency: 'USD', description: 'Lesson package' },
    ];
    const run = (filters: ReportDefinition['filters']) => Q.runReportDefinition({
      ...def,
      filters,
      groupBy: null,
      aggregate: { fn: 'none', field: null },
      columns: ['id'],
    }, sourceRows).sourceIds;

    expect(run([{ field: 'status', op: 'eq', value: 'OPEN' }])).toEqual(['a']);
    expect(run([{ field: 'status', op: 'neq', value: 'OPEN' }])).toEqual(['b', 'c']);
    expect(run([{ field: 'amount', op: 'gt', value: 100 }])).toEqual(['b', 'c']);
    expect(run([{ field: 'amount', op: 'gte', value: 250 }])).toEqual(['b', 'c']);
    expect(run([{ field: 'amount', op: 'lt', value: 400 }])).toEqual(['a', 'b']);
    expect(run([{ field: 'amount', op: 'lte', value: 250 }])).toEqual(['a', 'b']);
    expect(run([{ field: 'status', op: 'in', value: ['OPEN', 'PAID'] }])).toEqual(['a', 'c']);
    expect(run([{ field: 'description', op: 'contains', value: 'lesson' }])).toEqual(['a', 'c']);
    expect(() => run([{ field: 'amount', op: 'gt', value: '100' as never }])).toThrow(/numeric value/);
    expect(() => run([{ field: 'status', op: 'in', value: 'OPEN' as never }])).toThrow(/array value/);
    expect(() => run([{ field: 'status', op: 'contains', value: 10 as never }])).toThrow(/text value/);
  });

  it('handles null and empty filter values explicitly', () => {
    const dueRows = [
      { id: 'due-empty', amount: 30, status: 'OPEN', currency: 'ILS', dueDate: '' },
      { id: 'due-null', amount: 20, status: 'OPEN', currency: 'ILS', dueDate: null },
      { id: 'due-set', amount: 10, status: 'OPEN', currency: 'ILS', dueDate: '2026-06-01' },
    ];
    const run = (filter: ReportDefinition['filters'][number]) => Q.runReportDefinition({
      ...def,
      filters: [filter],
      groupBy: null,
      aggregate: { fn: 'none', field: null },
      columns: ['id', 'dueDate'],
    }, dueRows).sourceIds;

    expect(run({ field: 'dueDate', op: 'eq', value: null })).toEqual(['due-null']);
    expect(run({ field: 'dueDate', op: 'eq', value: '' })).toEqual(['due-empty']);
    expect(run({ field: 'dueDate', op: 'in', value: [null, '2026-06-01'] })).toEqual(['due-null', 'due-set']);
  });

  it('supports aggregate none and stable row ordering by source id', () => {
    const res = Q.runReportDefinition({
      ...def,
      filters: [],
      groupBy: 'status',
      aggregate: { fn: 'none', field: null },
      columns: ['id', 'status'],
    }, [
      { id: 'z', status: 'OPEN', amount: 1, currency: 'ILS' },
      { id: 'a', status: 'OPEN', amount: 2, currency: 'ILS' },
      { id: 'm', status: '', amount: 3, currency: 'ILS' },
    ]);

    expect(res.sourceIds).toEqual(['a', 'm', 'z']);
    expect(res.rows.map(r => r.id)).toEqual(['a', 'm', 'z']);
    expect(res.groups).toEqual([
      { key: '∅', value: 1, count: 1, sourceIds: ['m'] },
      { key: 'OPEN', value: 2, count: 2, sourceIds: ['a', 'z'] },
    ]);
  });

  it('computes grouped avg, min, and max over numeric values only', () => {
    const sourceRows = [
      { id: 'a', status: 'OPEN', amount: 10, currency: 'ILS' },
      { id: 'b', status: 'OPEN', amount: 15, currency: 'ILS' },
      { id: 'c', status: 'OPEN', amount: null, currency: 'ILS' },
      { id: 'd', status: 'PAID', amount: -5, currency: 'ILS' },
    ];
    const grouped = (aggregate: ReportDefinition['aggregate']) => Q.runReportDefinition({
      ...def,
      filters: [],
      groupBy: 'status',
      aggregate,
      columns: ['id', 'status', 'amount'],
    }, sourceRows).groups;

    expect(grouped({ fn: 'avg', field: 'amount' }).find(g => g.key === 'OPEN')?.value).toBe(12.5);
    expect(grouped({ fn: 'min', field: 'amount' }).find(g => g.key === 'PAID')?.value).toBe(-5);
    expect(grouped({ fn: 'max', field: 'amount' }).find(g => g.key === 'OPEN')?.value).toBe(15);
  });

  it('returns lineage only for filtered rows after stable sorting', () => {
    const res = Q.runReportDefinition({
      ...def,
      filters: [{ field: 'status', op: 'eq', value: 'OPEN' }],
      groupBy: null,
      aggregate: { fn: 'none', field: null },
      columns: ['id'],
    }, [
      { id: 'row-3', status: 'PAID', amount: 1, currency: 'ILS' },
      { id: 'row-2', status: 'OPEN', amount: 1, currency: 'ILS' },
      { id: 'row-1', status: 'OPEN', amount: 1, currency: 'ILS' },
    ]);

    expect(Q.getReportLineage(def, res).sourceIds).toEqual(['row-1', 'row-2']);
  });

  it('exposes source, field, blocked-source, and finance allowlists', () => {
    expect(Q.listReportSourceAllowlist('admin').find(s => s.sourceEntity === 'charges')?.fields).toContain('amount');
    expect(Q.listReportSourceAllowlist('finance').map(s => s.sourceEntity).sort()).toEqual(['charges', 'hoursEntries', 'payments']);
    expect(Q.getReportSourceAccess('staffEvaluations', 'admin')).toEqual({
      sourceEntity: 'staffEvaluations',
      allowed: false,
      reason: 'BLOCKED_SOURCE',
      allowedFields: [],
      blockedDecisionIds: ['D-26'],
    });
    expect(Q.getReportSourceAccess('students', 'finance')).toEqual({
      sourceEntity: 'students',
      allowed: false,
      reason: 'FINANCE_SOURCE_NOT_ALLOWED',
      allowedFields: [],
      blockedDecisionIds: ['D-09'],
    });
    expect(() => Q.runReportDefinition({ ...def, sourceEntity: 'students', columns: ['id'] }, rows, { actor: 'finance' })).toThrow(/FINANCE_SOURCE_NOT_ALLOWED/);
    expect(Q.runReportDefinition(def, rows, {
      actor: 'finance',
      sourceAuthorization: {
        actor: 'finance',
        sourceEntity: 'charges',
        authorizedSourceIds: rows.map(row => row.id),
      },
    }).totalRows).toBe(3);
  });

  it('requires source-row authorization for finance report runs and exports', () => {
    expect(() => Q.runReportDefinition(def, rows, { actor: 'finance' }))
      .toThrow(/explicit source-row authorization/);
    expect(() => Q.runReportDefinition(def, rows, {
      actor: 'finance',
      sourceAuthorization: {
        actor: 'finance',
        sourceEntity: 'students',
        authorizedSourceIds: rows.map(row => row.id),
      },
    })).toThrow(/covers "students", not "charges"/);
    expect(() => Q.runReportDefinition(def, rows, {
      actor: 'finance',
      sourceAuthorization: {
        actor: 'finance',
        sourceEntity: 'charges',
        authorizedSourceIds: ['ch1', 'ch2'],
      },
    })).toThrow(/REPORT_SOURCE_ROW_NOT_AUTHORIZED|not authorized/);

    const financeResult = Q.runReportDefinition(def, rows, {
      actor: 'finance',
      sourceAuthorization: {
        actor: 'finance',
        sourceEntity: 'charges',
        authorizedSourceIds: rows.map(row => row.id),
      },
    });
    expect(Q.exportReportCsv(financeResult, { actor: 'finance' }).split('\n')[0]).toBe('id,status,amount');

    const adminResult = Q.runReportDefinition(def, rows);
    expect(() => Q.exportReportCsv(adminResult, { actor: 'finance' })).toThrow(/authorized finance report run/);
  });

  it('denies finance report runs for student, attendance, agreement, assessment, concert, HR, rollover, and public endpoint sources', () => {
    const deniedSources = [
      'students',
      'lessonRecords',
      'agreementAcceptances',
      'examSessions',
      'certificates',
      'concertPrograms',
      'staffEvaluations',
      'rolloverRuns',
      'publicEndpoints',
    ] as const;

    for (const sourceEntity of deniedSources) {
      const blockedDef = {
        ...def,
        sourceEntity: sourceEntity as never,
        filters: [],
        groupBy: null,
        aggregate: { fn: 'none', field: null },
        columns: ['id'],
      } as ReportDefinition;
      expect(() => Q.runReportDefinition(blockedDef, [{ id: 'source-row' }], {
        actor: 'finance',
        sourceAuthorization: {
          actor: 'finance',
          sourceEntity,
          authorizedSourceIds: ['source-row'],
        },
      }), sourceEntity).toThrow(/REPORT_SOURCE_NOT_ALLOWED|BLOCKED_SOURCE|FINANCE_SOURCE_NOT_ALLOWED/);
    }
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
