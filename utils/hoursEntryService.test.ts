import { describe, expect, it } from 'vitest';
import type { HoursEntry } from '../types/blueprint';
import type { HoursReport } from '../types';
import {
  HoursEntryServiceError,
  applyHoursEntryUpdates,
  approveHoursEntries,
  buildHoursEntryCorrection,
  buildTeacherHoursEntry,
  editTeacherHoursEntry,
  markHoursEntriesPaid,
  reconcileLegacyHoursReports,
  submitTeacherHoursPeriod,
  type HoursEntryServiceContext,
  type HoursPeriodHeader,
} from './hoursEntryService';

const T = '2026-06-18T10:00:00.000Z';
const LATER = '2026-06-18T12:30:00.000Z';
const base = { orgId: 'org_1', createdAt: T, updatedAt: T };

const teacherContext: HoursEntryServiceContext = {
  orgId: 'org_1',
  now: LATER,
  actor: { userId: 'teacher_user_1', staffMemberId: 'staff_1' },
};

const adminContext: HoursEntryServiceContext = {
  orgId: 'org_1',
  now: LATER,
  actor: { userId: 'admin_user_1', canAdminManage: true },
};

const financeContext: HoursEntryServiceContext = {
  orgId: 'org_1',
  now: LATER,
  actor: { userId: 'finance_user_1', canFinanceRead: true },
};

const entry = (overrides: Partial<HoursEntry> = {}): HoursEntry => ({
  ...base,
  id: 'entry_1',
  staffMemberId: 'staff_1',
  hoursReportId: null,
  date: '2026-06-10',
  reportedMinutes: 60,
  calendarMinutes: 60,
  eventId: 'event_1',
  teachingAssignmentId: 'assignment_1',
  orgRoleId: 'role_1',
  rate: null,
  status: 'DRAFT',
  note: null,
  ...overrides,
});

describe('hours entry service - teacher self-report', () => {
  it('creates teacher-owned DRAFT entries without stamping a payable rate', () => {
    const created = buildTeacherHoursEntry({
      input: {
        date: '2026-06-11',
        reportedMinutes: 90,
        calendarMinutes: 60,
        eventId: 'event_2',
        teachingAssignmentId: 'assignment_1',
        note: 'Extra setup time',
      },
      context: teacherContext,
      idFactory: () => 'entry_new',
    });

    expect(created).toMatchObject({
      id: 'entry_new',
      orgId: 'org_1',
      staffMemberId: 'staff_1',
      status: 'DRAFT',
      reportedMinutes: 90,
      calendarMinutes: 60,
      eventId: 'event_2',
      teachingAssignmentId: 'assignment_1',
      rate: null,
      createdBy: 'teacher_user_1',
      updatedBy: 'teacher_user_1',
    });
  });

  it('edits only own DRAFT/SUBMITTED rows while preserving status and rate', () => {
    const submitted = entry({ status: 'SUBMITTED', rate: 999, note: 'original' });
    const updated = editTeacherHoursEntry({
      entry: submitted,
      patch: { reportedMinutes: 75, calendarMinutes: 60, note: 'corrected before admin approval' },
      context: teacherContext,
    });

    expect(updated).toEqual({
      ...submitted,
      reportedMinutes: 75,
      calendarMinutes: 60,
      note: 'corrected before admin approval',
      rate: 999,
      status: 'SUBMITTED',
      updatedAt: LATER,
      updatedBy: 'teacher_user_1',
    });
    expect(submitted.reportedMinutes).toBe(60);
  });

  it('denies teacher writes for other staff, approved rows, paid rows, and invalid minutes', () => {
    expect(() => editTeacherHoursEntry({
      entry: entry({ staffMemberId: 'staff_2' }),
      patch: { reportedMinutes: 90 },
      context: teacherContext,
    })).toThrowError(new HoursEntryServiceError('TEACHER_NOT_OWNER', 'Teachers may only write their own hours entries.'));

    expect(() => editTeacherHoursEntry({
      entry: entry({ status: 'APPROVED' }),
      patch: { reportedMinutes: 90 },
      context: teacherContext,
    })).toThrowError(new HoursEntryServiceError('TEACHER_EDIT_LOCKED', 'Teachers may only edit DRAFT or SUBMITTED hours entries.'));

    expect(() => editTeacherHoursEntry({
      entry: entry({ status: 'PAID' }),
      patch: { reportedMinutes: 90 },
      context: teacherContext,
    })).toThrowError(new HoursEntryServiceError('PAID_IMMUTABLE', 'PAID hours entries are immutable; create an adjusting entry instead.'));

    expect(() => buildTeacherHoursEntry({
      input: { date: '2026-06-11', reportedMinutes: -1 },
      context: teacherContext,
      idFactory: () => 'entry_bad',
    })).toThrowError(new HoursEntryServiceError('INVALID_MINUTES', 'reportedMinutes must be an integer minute value of at least 0.'));
  });

  it('submits a teacher period header and groups entries without independent totals', () => {
    const existingHeader: HoursPeriodHeader = {
      id: 'report_existing',
      orgId: 'org_1',
      staffMemberId: 'staff_1',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      status: 'PENDING',
      createdAt: T,
      createdBy: 'admin_user_1',
    };
    const plan = submitTeacherHoursPeriod({
      entries: [
        entry({ id: 'entry_1', date: '2026-06-10', status: 'DRAFT' }),
        entry({ id: 'entry_2', date: '2026-06-11', status: 'SUBMITTED' }),
        entry({ id: 'entry_other', staffMemberId: 'staff_2', date: '2026-06-12' }),
      ],
      entryIds: ['entry_1', 'entry_2'],
      existingHeader,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      context: teacherContext,
      headerIdFactory: () => 'unused',
    });

    expect(plan.header).toMatchObject({
      id: 'report_existing',
      orgId: 'org_1',
      staffMemberId: 'staff_1',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      status: 'SUBMITTED',
      submittedAt: LATER,
      updatedBy: 'teacher_user_1',
    });
    expect('totalMinutes' in plan.header).toBe(false);
    expect('totalAmount' in plan.header).toBe(false);
    expect(plan.entries.map(item => [item.id, item.status, item.hoursReportId])).toEqual([
      ['entry_1', 'SUBMITTED', 'report_existing'],
      ['entry_2', 'SUBMITTED', 'report_existing'],
    ]);
  });

  it('rejects explicitly selected entries or headers outside the submitted period scope', () => {
    expect(() => submitTeacherHoursPeriod({
      entries: [entry({ id: 'entry_outside', date: '2026-07-01', status: 'DRAFT' })],
      entryIds: ['entry_outside'],
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      context: teacherContext,
      headerIdFactory: () => 'report_1',
    })).toThrowError(new HoursEntryServiceError('PERIOD_MISMATCH', 'Submitted hours entries must fall within the period header.'));

    expect(() => submitTeacherHoursPeriod({
      entries: [entry({ id: 'entry_other_staff', staffMemberId: 'staff_2', date: '2026-06-10', status: 'DRAFT' })],
      entryIds: ['entry_other_staff'],
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      context: teacherContext,
      headerIdFactory: () => 'report_1',
    })).toThrowError(new HoursEntryServiceError('TEACHER_NOT_OWNER', 'Teachers may only write their own hours entries.'));

    expect(() => submitTeacherHoursPeriod({
      entries: [entry({ id: 'entry_other_org', orgId: 'org_2', date: '2026-06-10', status: 'DRAFT' })],
      entryIds: ['entry_other_org'],
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      context: teacherContext,
      headerIdFactory: () => 'report_1',
    })).toThrowError(new HoursEntryServiceError('ORG_MISMATCH', 'The hours entry is not in the current organization.'));

    expect(() => submitTeacherHoursPeriod({
      entries: [entry({ id: 'entry_1', date: '2026-06-10', status: 'DRAFT' })],
      entryIds: ['entry_1'],
      existingHeader: {
        id: 'report_wrong_period',
        orgId: 'org_1',
        staffMemberId: 'staff_1',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        status: 'PENDING',
      },
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      context: teacherContext,
      headerIdFactory: () => 'unused',
    })).toThrowError(new HoursEntryServiceError('PERIOD_MISMATCH', 'The period header does not match the submitted date range.'));
  });
});

describe('hours entry service - admin approval and payment', () => {
  it('approves submitted entries with D-19 payable-rate stamping at approval time', () => {
    const draftEstimate = entry({ id: 'entry_approval', status: 'SUBMITTED', rate: 999 });
    const [approved] = approveHoursEntries({
      entries: [draftEstimate],
      entryIds: ['entry_approval'],
      context: adminContext,
      ratePolicyForEntry: () => ({
        teachingAssignmentRates: [{ teachingAssignmentId: 'assignment_1', rate: 125 }],
        orgRoleRates: [{ orgRoleId: 'role_1', rate: 115 }],
        staffDefaultRates: [{ staffMemberId: 'staff_1', rate: 105 }],
        orgDefaultRate: 95,
      }),
    });

    expect(approved).toMatchObject({
      id: 'entry_approval',
      status: 'APPROVED',
      rate: 125,
      updatedAt: LATER,
      updatedBy: 'admin_user_1',
    });
    expect(draftEstimate.rate).toBe(999);
  });

  it('lets admin override rate source and rejects finance approval attempts', () => {
    const submitted = entry({ id: 'entry_override', status: 'SUBMITTED', rate: null });
    const [approved] = approveHoursEntries({
      entries: [submitted],
      entryIds: ['entry_override'],
      context: adminContext,
      adminOverrideRates: { entry_override: 150 },
      ratePolicyForEntry: () => ({ staffDefaultRates: [{ staffMemberId: 'staff_1', rate: 105 }] }),
    });
    expect(approved.rate).toBe(150);

    expect(() => approveHoursEntries({
      entries: [submitted],
      entryIds: ['entry_override'],
      context: financeContext,
      ratePolicyForEntry: () => ({ orgDefaultRate: 95 }),
    })).toThrowError(new HoursEntryServiceError('ADMIN_REQUIRED', 'Only an admin can approve, pay, or correct payroll entries.'));
  });

  it('marks only APPROVED entries paid and leaves PAID rows immutable', () => {
    const approved = entry({ id: 'entry_paid', status: 'APPROVED', rate: 120 });
    const [paid] = markHoursEntriesPaid({
      entries: [approved],
      entryIds: ['entry_paid'],
      context: adminContext,
    });

    expect(paid).toMatchObject({
      id: 'entry_paid',
      status: 'PAID',
      rate: 120,
      updatedAt: LATER,
      updatedBy: 'admin_user_1',
    });

    expect(() => markHoursEntriesPaid({
      entries: [paid],
      entryIds: ['entry_paid'],
      context: adminContext,
    })).toThrowError(new HoursEntryServiceError('PAID_IMMUTABLE', 'PAID hours entries are immutable; create an adjusting entry instead.'));
  });

  it('requires configured rates and valid status transitions', () => {
    expect(() => approveHoursEntries({
      entries: [entry({ id: 'entry_no_rate', status: 'SUBMITTED' })],
      entryIds: ['entry_no_rate'],
      context: adminContext,
      ratePolicyForEntry: () => ({}),
    })).toThrowError(new HoursEntryServiceError('RATE_MISSING', 'No payroll rate configured for hours entry entry_no_rate.'));

    expect(() => markHoursEntriesPaid({
      entries: [entry({ id: 'entry_draft', status: 'DRAFT' })],
      entryIds: ['entry_draft'],
      context: adminContext,
    })).toThrowError(new HoursEntryServiceError('INVALID_STATUS_TRANSITION', 'Only APPROVED hours entries can be marked PAID.'));
  });
});

describe('hours entry service - corrections', () => {
  it('creates a separate adjusting entry for paid-row corrections', () => {
    const paid = entry({ id: 'entry_paid', status: 'PAID', rate: 120, reportedMinutes: 60 });
    const correction = buildHoursEntryCorrection({
      sourceEntry: paid,
      reportedMinutesDelta: -15,
      note: 'Overreported setup time',
      context: adminContext,
      idFactory: () => 'entry_correction',
    });

    expect(correction).toMatchObject({
      id: 'entry_correction',
      orgId: 'org_1',
      staffMemberId: 'staff_1',
      hoursReportId: null,
      date: '2026-06-10',
      reportedMinutes: -15,
      calendarMinutes: 0,
      eventId: null,
      teachingAssignmentId: 'assignment_1',
      orgRoleId: 'role_1',
      rate: null,
      status: 'DRAFT',
      note: 'Correction for entry_paid: Overreported setup time',
      createdBy: 'admin_user_1',
    });

    const next = applyHoursEntryUpdates([paid], [correction]);
    expect(next.map(item => item.id)).toEqual(['entry_paid', 'entry_correction']);
    expect(next[0]).toBe(paid);
  });

  it('does not allow correction helpers to mutate unpaid rows or zero-minute deltas', () => {
    expect(() => buildHoursEntryCorrection({
      sourceEntry: entry({ status: 'APPROVED' }),
      reportedMinutesDelta: -15,
      note: 'Too early',
      context: adminContext,
      idFactory: () => 'entry_correction',
    })).toThrowError(new HoursEntryServiceError('INVALID_STATUS_TRANSITION', 'Corrections are reserved for PAID entries; edit or re-approve earlier statuses instead.'));

    expect(() => buildHoursEntryCorrection({
      sourceEntry: entry({ status: 'PAID' }),
      reportedMinutesDelta: 0,
      note: 'No-op',
      context: adminContext,
      idFactory: () => 'entry_correction',
    })).toThrowError(new HoursEntryServiceError('INVALID_MINUTES', 'reportedMinutesDelta must not be 0.'));
  });
});

describe('hours entry service - legacy hours report reconciliation', () => {
  const legacyReport = (overrides: Partial<HoursReport> = {}): HoursReport => ({
    id: 'report_legacy',
    orgId: 'org_1',
    staffMemberId: 'staff_1',
    token: 'legacy-token',
    periodStart: '2026-05-01',
    periodEnd: '2026-05-31',
    status: 'SUBMITTED',
    submittedAt: '2026-06-01T08:00:00.000Z',
    createdBy: 'admin_user_1',
    createdAt: '2026-05-01T08:00:00.000Z',
    reportedEntries: [
      {
        id: 'legacy_entry_1',
        date: '2026-05-10',
        hours: 1.5,
        entryType: 'CALENDAR_ADJUSTED',
        sourceEventId: 'event_1',
        absenceReason: 'Makeup',
      },
      {
        id: 'legacy_entry_2',
        date: '2026-05-12',
        hours: 2,
        entryType: 'MANUAL',
        description: 'Workshop prep',
      },
    ],
    ...overrides,
  });

  it('converts nested legacy reported entries into normalized HoursEntry rows and header-only reports', () => {
    const plan = reconcileLegacyHoursReports({
      reports: [legacyReport()],
      existingEntries: [],
      now: LATER,
    });

    expect(plan.headers).toEqual([
      {
        id: 'report_legacy',
        orgId: 'org_1',
        staffMemberId: 'staff_1',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        status: 'SUBMITTED',
        submittedAt: '2026-06-01T08:00:00.000Z',
        createdAt: '2026-05-01T08:00:00.000Z',
        updatedAt: LATER,
        createdBy: 'admin_user_1',
        updatedBy: 'legacy-hours-reconciliation',
        token: undefined,
        reportedEntries: undefined,
      },
    ]);
    expect(plan.entries).toEqual([
      {
        id: 'legacy_report_legacy_legacy_entry_1',
        orgId: 'org_1',
        staffMemberId: 'staff_1',
        hoursReportId: 'report_legacy',
        date: '2026-05-10',
        reportedMinutes: 90,
        calendarMinutes: 90,
        eventId: 'event_1',
        teachingAssignmentId: null,
        orgRoleId: null,
        rate: null,
        status: 'SUBMITTED',
        note: 'Absence reason: Makeup | Legacy type: CALENDAR_ADJUSTED',
        createdAt: '2026-06-01T08:00:00.000Z',
        updatedAt: LATER,
        createdBy: 'admin_user_1',
        updatedBy: 'legacy-hours-reconciliation',
      },
      {
        id: 'legacy_report_legacy_legacy_entry_2',
        orgId: 'org_1',
        staffMemberId: 'staff_1',
        hoursReportId: 'report_legacy',
        date: '2026-05-12',
        reportedMinutes: 120,
        calendarMinutes: 0,
        eventId: null,
        teachingAssignmentId: null,
        orgRoleId: null,
        rate: null,
        status: 'SUBMITTED',
        note: 'Workshop prep | Legacy type: MANUAL',
        createdAt: '2026-06-01T08:00:00.000Z',
        updatedAt: LATER,
        createdBy: 'admin_user_1',
        updatedBy: 'legacy-hours-reconciliation',
      },
    ]);
  });

  it('is idempotent and keeps reviewed legacy rows awaiting D-19 rate stamping', () => {
    const existing = entry({
      id: 'legacy_report_legacy_legacy_entry_1',
      hoursReportId: 'report_legacy',
      status: 'APPROVED',
      rate: 120,
    });
    const plan = reconcileLegacyHoursReports({
      reports: [legacyReport({ status: 'REVIEWED' })],
      existingEntries: [existing],
      now: LATER,
    });

    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({
      id: 'legacy_report_legacy_legacy_entry_2',
      status: 'SUBMITTED',
      rate: null,
      note: 'Workshop prep | Legacy type: MANUAL | Legacy report was reviewed; admin approval must stamp the payable rate before payment.',
    });
    expect(plan.headers[0]).toMatchObject({
      status: 'REVIEWED',
      token: undefined,
      reportedEntries: undefined,
    });
  });

  it('maps pending legacy entry drafts without creating a parallel totals ledger', () => {
    const plan = reconcileLegacyHoursReports({
      reports: [legacyReport({ status: 'PENDING', submittedAt: undefined })],
      existingEntries: [],
      now: LATER,
    });

    expect(plan.entries.map(item => item.status)).toEqual(['DRAFT', 'DRAFT']);
    expect('totalMinutes' in plan.headers[0]).toBe(false);
    expect('totalAmount' in plan.headers[0]).toBe(false);
  });
});
