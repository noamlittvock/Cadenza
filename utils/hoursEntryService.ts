import type { HoursEntry, IsoDate, IsoTimestamp } from '../types/blueprint';
import { BLUEPRINT_COLLECTIONS } from '../types/blueprint';
import {
  type PayrollRatePolicy,
  resolveHoursEntryPayRate,
} from './blueprintQueries';
import { fetchCollectionItems, upsertCollectionItems } from './supabaseSync';

export type HoursEntryServiceErrorCode =
  | 'ADMIN_REQUIRED'
  | 'TEACHER_REQUIRED'
  | 'TEACHER_NOT_OWNER'
  | 'ENTRY_NOT_FOUND'
  | 'ORG_MISMATCH'
  | 'INVALID_MINUTES'
  | 'INVALID_STATUS_TRANSITION'
  | 'TEACHER_EDIT_LOCKED'
  | 'PAID_IMMUTABLE'
  | 'RATE_MISSING'
  | 'NO_ENTRIES'
  | 'PERIOD_MISMATCH';

export class HoursEntryServiceError extends Error {
  constructor(
    public readonly code: HoursEntryServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HoursEntryServiceError';
  }
}

export interface HoursEntryActor {
  userId?: string | null;
  staffMemberId?: string | null;
  canAdminManage?: boolean;
  canFinanceRead?: boolean;
}

export interface HoursEntryServiceContext {
  orgId: string;
  now: IsoTimestamp;
  actor: HoursEntryActor;
}

export interface HoursPeriodHeader {
  id: string;
  orgId: string;
  staffMemberId: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  status: 'PENDING' | 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED' | 'PAID';
  submittedAt?: IsoTimestamp | null;
  createdAt?: IsoTimestamp;
  updatedAt?: IsoTimestamp;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface HoursEntryRepository {
  fetchHoursEntries(orgId: string): Promise<HoursEntry[]>;
  upsertHoursEntries(orgId: string, entries: HoursEntry[]): Promise<void>;
  fetchHoursPeriodHeaders(orgId: string): Promise<HoursPeriodHeader[]>;
  upsertHoursPeriodHeaders(orgId: string, headers: HoursPeriodHeader[]): Promise<void>;
}

export const supabaseHoursEntryRepository: HoursEntryRepository = {
  fetchHoursEntries: orgId => fetchCollectionItems<HoursEntry>(orgId, BLUEPRINT_COLLECTIONS.hoursEntries),
  upsertHoursEntries: (orgId, entries) => upsertCollectionItems<HoursEntry>(orgId, BLUEPRINT_COLLECTIONS.hoursEntries, entries),
  fetchHoursPeriodHeaders: orgId => fetchCollectionItems<HoursPeriodHeader>(orgId, 'hoursReports'),
  upsertHoursPeriodHeaders: (orgId, headers) => upsertCollectionItems<HoursPeriodHeader>(orgId, 'hoursReports', headers),
};

export interface TeacherHoursEntryInput {
  date: IsoDate;
  reportedMinutes: number;
  calendarMinutes?: number;
  eventId?: string | null;
  teachingAssignmentId?: string | null;
  orgRoleId?: string | null;
  note?: string | null;
  hoursReportId?: string | null;
}

export interface TeacherHoursEntryPatch {
  date?: IsoDate;
  reportedMinutes?: number;
  calendarMinutes?: number;
  eventId?: string | null;
  teachingAssignmentId?: string | null;
  orgRoleId?: string | null;
  note?: string | null;
  hoursReportId?: string | null;
}

export interface HoursPeriodSubmissionPlan {
  header: HoursPeriodHeader;
  entries: HoursEntry[];
}

function actorId(actor: HoursEntryActor): string | null {
  return actor.userId ?? actor.staffMemberId ?? null;
}

function assertTeacher(context: HoursEntryServiceContext): string {
  if (!context.actor.staffMemberId) {
    throw new HoursEntryServiceError('TEACHER_REQUIRED', 'Teacher self-report requires a staff member id.');
  }
  return context.actor.staffMemberId;
}

function assertAdmin(context: HoursEntryServiceContext): void {
  if (!context.actor.canAdminManage) {
    throw new HoursEntryServiceError('ADMIN_REQUIRED', 'Only an admin can approve, pay, or correct payroll entries.');
  }
}

function assertOrg(entry: HoursEntry, orgId: string): void {
  if (entry.orgId !== orgId) {
    throw new HoursEntryServiceError('ORG_MISMATCH', 'The hours entry is not in the current organization.');
  }
}

function assertTeacherOwns(entry: HoursEntry, context: HoursEntryServiceContext): void {
  if (context.actor.canAdminManage) return;
  const staffMemberId = assertTeacher(context);
  if (entry.staffMemberId !== staffMemberId) {
    throw new HoursEntryServiceError('TEACHER_NOT_OWNER', 'Teachers may only write their own hours entries.');
  }
}

function assertNotPaid(entry: HoursEntry): void {
  if (entry.status === 'PAID') {
    throw new HoursEntryServiceError('PAID_IMMUTABLE', 'PAID hours entries are immutable; create an adjusting entry instead.');
  }
}

function assertTeacherEditable(entry: HoursEntry): void {
  if (entry.status !== 'DRAFT' && entry.status !== 'SUBMITTED') {
    throw new HoursEntryServiceError('TEACHER_EDIT_LOCKED', 'Teachers may only edit DRAFT or SUBMITTED hours entries.');
  }
}

function assertMinutes(value: number, field: string, opts: { allowNegative?: boolean } = {}): void {
  const min = opts.allowNegative ? Number.NEGATIVE_INFINITY : 0;
  if (!Number.isInteger(value) || !Number.isFinite(value) || value < min) {
    throw new HoursEntryServiceError('INVALID_MINUTES', `${field} must be an integer minute value${opts.allowNegative ? '' : ' of at least 0'}.`);
  }
}

function withinPeriod(date: IsoDate, periodStart: IsoDate, periodEnd: IsoDate): boolean {
  return date >= periodStart && date <= periodEnd;
}

export function buildTeacherHoursEntry(params: {
  input: TeacherHoursEntryInput;
  context: HoursEntryServiceContext;
  idFactory: () => string;
}): HoursEntry {
  const staffMemberId = assertTeacher(params.context);
  assertMinutes(params.input.reportedMinutes, 'reportedMinutes');
  assertMinutes(params.input.calendarMinutes ?? 0, 'calendarMinutes');

  return {
    id: params.idFactory(),
    orgId: params.context.orgId,
    staffMemberId,
    hoursReportId: params.input.hoursReportId ?? null,
    date: params.input.date,
    reportedMinutes: params.input.reportedMinutes,
    calendarMinutes: params.input.calendarMinutes ?? 0,
    eventId: params.input.eventId ?? null,
    teachingAssignmentId: params.input.teachingAssignmentId ?? null,
    orgRoleId: params.input.orgRoleId ?? null,
    rate: null,
    status: 'DRAFT',
    note: params.input.note ?? null,
    createdAt: params.context.now,
    updatedAt: params.context.now,
    createdBy: actorId(params.context.actor),
    updatedBy: actorId(params.context.actor),
  };
}

export function editTeacherHoursEntry(params: {
  entry: HoursEntry;
  patch: TeacherHoursEntryPatch;
  context: HoursEntryServiceContext;
}): HoursEntry {
  const { entry, patch, context } = params;
  assertOrg(entry, context.orgId);
  assertNotPaid(entry);
  assertTeacherOwns(entry, context);
  assertTeacherEditable(entry);
  if (patch.reportedMinutes !== undefined) assertMinutes(patch.reportedMinutes, 'reportedMinutes');
  if (patch.calendarMinutes !== undefined) assertMinutes(patch.calendarMinutes, 'calendarMinutes');

  return {
    ...entry,
    date: patch.date ?? entry.date,
    reportedMinutes: patch.reportedMinutes ?? entry.reportedMinutes,
    calendarMinutes: patch.calendarMinutes ?? entry.calendarMinutes,
    eventId: patch.eventId !== undefined ? patch.eventId : entry.eventId,
    teachingAssignmentId: patch.teachingAssignmentId !== undefined ? patch.teachingAssignmentId : entry.teachingAssignmentId,
    orgRoleId: patch.orgRoleId !== undefined ? patch.orgRoleId : entry.orgRoleId,
    hoursReportId: patch.hoursReportId !== undefined ? patch.hoursReportId : entry.hoursReportId,
    note: patch.note !== undefined ? patch.note : entry.note,
    rate: entry.rate,
    status: entry.status,
    updatedAt: context.now,
    updatedBy: actorId(context.actor),
  };
}

export function submitTeacherHoursPeriod(params: {
  entries: HoursEntry[];
  entryIds?: string[];
  existingHeader?: HoursPeriodHeader | null;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  context: HoursEntryServiceContext;
  headerIdFactory: () => string;
}): HoursPeriodSubmissionPlan {
  const staffMemberId = assertTeacher(params.context);
  const selectedIds = params.entryIds ? new Set(params.entryIds) : null;
  const byId = new Map(params.entries.map(entry => [entry.id, entry]));
  const candidates = selectedIds
    ? Array.from(selectedIds, id => {
      const entry = byId.get(id);
      if (!entry) {
        throw new HoursEntryServiceError('ENTRY_NOT_FOUND', `Hours entry ${id} was not found.`);
      }
      return entry;
    })
    : params.entries.filter(entry => (
      entry.orgId === params.context.orgId
      && entry.staffMemberId === staffMemberId
      && withinPeriod(entry.date, params.periodStart, params.periodEnd)
    ));

  if (params.existingHeader) {
    if (params.existingHeader.orgId !== params.context.orgId) {
      throw new HoursEntryServiceError('ORG_MISMATCH', 'The period header is not in the current organization.');
    }
    if (params.existingHeader.staffMemberId !== staffMemberId) {
      throw new HoursEntryServiceError('TEACHER_NOT_OWNER', 'Teachers may only submit their own period headers.');
    }
    if (params.existingHeader.periodStart !== params.periodStart || params.existingHeader.periodEnd !== params.periodEnd) {
      throw new HoursEntryServiceError('PERIOD_MISMATCH', 'The period header does not match the submitted date range.');
    }
  }

  if (candidates.length === 0) {
    throw new HoursEntryServiceError('NO_ENTRIES', 'No teacher-owned hours entries were found for the submitted period.');
  }

  candidates.forEach(entry => {
    assertOrg(entry, params.context.orgId);
    assertNotPaid(entry);
    assertTeacherOwns(entry, params.context);
    assertTeacherEditable(entry);
    if (!withinPeriod(entry.date, params.periodStart, params.periodEnd)) {
      throw new HoursEntryServiceError('PERIOD_MISMATCH', 'Submitted hours entries must fall within the period header.');
    }
  });

  const headerId = params.existingHeader?.id ?? params.headerIdFactory();
  const header: HoursPeriodHeader = {
    ...(params.existingHeader ?? {
      id: headerId,
      orgId: params.context.orgId,
      staffMemberId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      createdAt: params.context.now,
      createdBy: actorId(params.context.actor),
    }),
    id: headerId,
    orgId: params.context.orgId,
    staffMemberId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    status: 'SUBMITTED',
    submittedAt: params.context.now,
    updatedAt: params.context.now,
    updatedBy: actorId(params.context.actor),
  };

  return {
    header,
    entries: candidates.map(entry => ({
      ...entry,
      hoursReportId: headerId,
      status: 'SUBMITTED',
      updatedAt: params.context.now,
      updatedBy: actorId(params.context.actor),
    })),
  };
}

export function approveHoursEntries(params: {
  entries: HoursEntry[];
  entryIds: string[];
  context: HoursEntryServiceContext;
  ratePolicyForEntry: (entry: HoursEntry) => PayrollRatePolicy;
  adminOverrideRates?: Record<string, number | null | undefined>;
}): HoursEntry[] {
  assertAdmin(params.context);
  const byId = new Map(params.entries.map(entry => [entry.id, entry]));
  return params.entryIds.map(id => {
    const entry = byId.get(id);
    if (!entry) throw new HoursEntryServiceError('ENTRY_NOT_FOUND', `Hours entry ${id} was not found.`);
    assertOrg(entry, params.context.orgId);
    assertNotPaid(entry);
    if (entry.status !== 'SUBMITTED') {
      throw new HoursEntryServiceError('INVALID_STATUS_TRANSITION', 'Only SUBMITTED hours entries can be approved.');
    }
    const basePolicy = params.ratePolicyForEntry(entry);
    const hasOverride = params.adminOverrideRates && Object.prototype.hasOwnProperty.call(params.adminOverrideRates, entry.id);
    const policy = hasOverride
      ? { ...basePolicy, adminOverrideRate: params.adminOverrideRates?.[entry.id] }
      : basePolicy;
    const resolution = resolveHoursEntryPayRate(entry, policy);
    if (resolution.rate === null) {
      throw new HoursEntryServiceError('RATE_MISSING', `No payroll rate configured for hours entry ${entry.id}.`);
    }
    return {
      ...entry,
      rate: resolution.rate,
      status: 'APPROVED',
      updatedAt: params.context.now,
      updatedBy: actorId(params.context.actor),
    };
  });
}

export function markHoursEntriesPaid(params: {
  entries: HoursEntry[];
  entryIds: string[];
  context: HoursEntryServiceContext;
}): HoursEntry[] {
  assertAdmin(params.context);
  const byId = new Map(params.entries.map(entry => [entry.id, entry]));
  return params.entryIds.map(id => {
    const entry = byId.get(id);
    if (!entry) throw new HoursEntryServiceError('ENTRY_NOT_FOUND', `Hours entry ${id} was not found.`);
    assertOrg(entry, params.context.orgId);
    assertNotPaid(entry);
    if (entry.status !== 'APPROVED') {
      throw new HoursEntryServiceError('INVALID_STATUS_TRANSITION', 'Only APPROVED hours entries can be marked PAID.');
    }
    return {
      ...entry,
      status: 'PAID',
      updatedAt: params.context.now,
      updatedBy: actorId(params.context.actor),
    };
  });
}

export function buildHoursEntryCorrection(params: {
  sourceEntry: HoursEntry;
  reportedMinutesDelta: number;
  note: string;
  context: HoursEntryServiceContext;
  idFactory: () => string;
}): HoursEntry {
  assertAdmin(params.context);
  assertOrg(params.sourceEntry, params.context.orgId);
  if (params.sourceEntry.status !== 'PAID') {
    throw new HoursEntryServiceError('INVALID_STATUS_TRANSITION', 'Corrections are reserved for PAID entries; edit or re-approve earlier statuses instead.');
  }
  assertMinutes(params.reportedMinutesDelta, 'reportedMinutesDelta', { allowNegative: true });
  if (params.reportedMinutesDelta === 0) {
    throw new HoursEntryServiceError('INVALID_MINUTES', 'reportedMinutesDelta must not be 0.');
  }

  return {
    id: params.idFactory(),
    orgId: params.sourceEntry.orgId,
    staffMemberId: params.sourceEntry.staffMemberId,
    hoursReportId: null,
    date: params.sourceEntry.date,
    reportedMinutes: params.reportedMinutesDelta,
    calendarMinutes: 0,
    eventId: null,
    teachingAssignmentId: params.sourceEntry.teachingAssignmentId,
    orgRoleId: params.sourceEntry.orgRoleId,
    rate: null,
    status: 'DRAFT',
    note: `Correction for ${params.sourceEntry.id}: ${params.note}`,
    createdAt: params.context.now,
    updatedAt: params.context.now,
    createdBy: actorId(params.context.actor),
    updatedBy: actorId(params.context.actor),
  };
}

export function applyHoursEntryUpdates<T extends { id: string }>(entries: T[], updates: T[]): T[] {
  const updateById = new Map(updates.map(update => [update.id, update]));
  const seen = new Set<string>();
  const replaced = entries.map(entry => {
    const update = updateById.get(entry.id);
    if (!update) return entry;
    seen.add(entry.id);
    return update;
  });
  const additions = updates.filter(update => !seen.has(update.id));
  return [...replaced, ...additions];
}
