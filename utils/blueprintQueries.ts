/**
 * Deterministic Blueprint Query Helpers
 *
 * Pure, side-effect-free functions over typed, org-scoped data. They implement
 * the `deterministicQueries` declared for every node in `features/forteTree.ts`,
 * so agents can answer operational questions from data instead of scraping UI:
 *   what exists · what is pending · what changed · what is missing ·
 *   what conflicts · what is owed · who is linked to whom · what supports the answer.
 *
 * Every function is deterministic: same inputs → same output, stable ordering,
 * no clock/network/random reads (callers pass `now`/`asOf` explicitly). External
 * app entities are accepted as minimal structural shapes to keep this module
 * decoupled and fully testable.
 */

import type {
  RegistrationIntake,
  IntakeStatus,
  IntakeStatusHistoryEntry,
  Family,
  Guardian,
  LessonRecord,
  OperationalRequest,
  ExamSession,
  ExaminerSubmission,
  Certificate,
  ReportCard,
  ConcertProgram,
  HoursEntry,
  Charge,
  Payment,
  Adjustment,
  BalanceSnapshot,
  AgreementTemplate,
  AgreementAcceptance,
  Instrument,
  InstrumentLoan,
  InstrumentRepair,
  StaffEvaluation,
  EvaluationAction,
  ReportDefinition,
  ReportSourceEntity,
  ReportFilter,
  PublicEndpoint,
  PublicEndpointKind,
  IsoDate,
  IsoTimestamp,
} from '../types/blueprint';
import type { AdminInboxItem, CalendarEvent, CalendarSubscription } from '../types';
import type { EnrollmentV2, ImportSession, StudentV2 } from '../types/v2';
import { fromDateTimestamp } from './appTimestamp';
import { decideApproval, makeApprovalRequest } from './adminInbox';
import { detectRoomConflicts, getConflictingEventIds } from './roomConflicts';

// ─── Minimal structural shapes for cross-module entities ─────────────────────
// Avoids importing heavy app types; matches the fields these queries read.

export interface MinimalStudent {
  id: string;
  fullName: string;
  familyId?: string | null;
  isArchived?: boolean;
}
export interface MinimalEnrollment {
  id: string;
  studentId: string;
  activityId: string;
  l1Id?: string | null;
  l2Id?: string | null;
  status?: string;
  startDate?: IsoDate;
  endDate?: IsoDate | null;
}
export interface MinimalEvent {
  id: string;
  date: IsoDate;
  durationMinutes?: number;
  activityId?: string | null;
  name?: string;
  roomId?: string | null;
}
export interface MinimalParticipant {
  eventId: string;
  staffMemberId: string;
}
export interface MinimalStaffMember {
  id: string;
  fullName?: string;
  name?: string;
  isArchived?: boolean;
}
export interface MinimalActivity {
  id: string;
  name: string;
  activityType?: string;
  template?: string;
  isArchived?: boolean;
}
export interface MinimalTeachingAssignment {
  id: string;
  staffMemberId: string;
  activityId: string;
  scope?: 'ACTIVITY' | 'L1' | 'L2' | string;
  l1Id?: string | null;
  l2Id?: string | null;
  isArchived?: boolean;
  startDate?: IsoDate;
  endDate?: IsoDate | null;
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

/** Case/whitespace-insensitive normalize for name matching. */
export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Stable ascending sort by an ISO date/timestamp field. */
function byDateAsc<T>(get: (x: T) => string | null | undefined) {
  return (a: T, b: T) => (get(a) ?? '').localeCompare(get(b) ?? '');
}

function byDateAscThenId<T extends { id: string }>(get: (x: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const dateCompare = (get(a) ?? '').localeCompare(get(b) ?? '');
    return dateCompare || a.id.localeCompare(b.id);
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Inclusive date-range check on ISO date strings. */
export function withinRange(date: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return date >= from && date <= to;
}

/** Levenshtein-free cheap similarity: shared normalized tokens ratio. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach(t => { if (tb.has(t)) shared += 1; });
  return shared / Math.max(ta.size, tb.size);
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Public registration intake  (listPendingIntake, suggestStudentDuplicates,
//    approveIntakeRecord)
// ════════════════════════════════════════════════════════════════════════════

export function listPendingIntake(intake: RegistrationIntake[]): RegistrationIntake[] {
  return intake
    .filter(r => r.status === 'PENDING' || r.status === 'IN_REVIEW')
    .sort(byDateAsc(r => r.submittedAt));
}

export interface DuplicateSuggestion {
  intakeId: string;
  studentId: string;
  studentName: string;
  score: number; // 0–1
  reason: string;
}

/** Suggests existing students that may duplicate an intake applicant. */
export function suggestStudentDuplicates(
  record: RegistrationIntake,
  students: MinimalStudent[],
  threshold = 0.5,
): DuplicateSuggestion[] {
  return students
    .filter(s => !s.isArchived)
    .map(s => {
      const score = nameSimilarity(record.studentFullName, s.fullName);
      return {
        intakeId: record.id,
        studentId: s.id,
        studentName: s.fullName,
        score,
        reason: score >= 0.99 ? 'exact name match' : 'name token overlap',
      };
    })
    .filter(d => d.score >= threshold)
    .sort((a, b) => b.score - a.score || a.studentName.localeCompare(b.studentName));
}

export const REGISTRATION_INTAKE_PUBLIC_SCOPE = 'registration_intake:submit';
export const CALENDAR_SUBSCRIPTION_PUBLIC_SCOPE = 'calendar_subscription:read';
export const HOURS_REPORT_PUBLIC_SCOPE = 'hours_report:submit';

export type PublicTokenResolutionReason =
  | 'NOT_FOUND'
  | 'WRONG_KIND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'MISSING_SCOPE'
  | 'MISSING_CONSENT';

export interface PublicTokenResolutionOptions {
  tokenHash: string;
  kind: PublicEndpointKind;
  now: IsoTimestamp;
  requiredScope?: string;
  requireConsentAgreement?: boolean;
}

export interface ResolvedPublicEndpoint {
  endpointId: string;
  orgId: string;
  kind: PublicEndpointKind;
  label: string;
  scopes: string[];
  targetId: string | null;
  consentAgreementId: string | null;
}

export type PublicTokenResolution =
  | { ok: true; endpoint: ResolvedPublicEndpoint }
  | { ok: false; reason: PublicTokenResolutionReason };

/**
 * D-14 public endpoint contract resolver. Callers pass an already-hashed token;
 * raw public tokens are never stored in application state or compared directly
 * to persisted rows. This only validates the registry record and returns the
 * public-safe endpoint config. It does not write intake or any live org table.
 */
export function resolvePublicToken(
  endpoints: PublicEndpoint[],
  opts: PublicTokenResolutionOptions,
): PublicTokenResolution {
  const endpoint = endpoints.find(e => e.tokenHash === opts.tokenHash);
  if (!endpoint) return { ok: false, reason: 'NOT_FOUND' };
  if (endpoint.kind !== opts.kind) return { ok: false, reason: 'WRONG_KIND' };
  if (endpoint.status !== 'ACTIVE') return { ok: false, reason: 'INACTIVE' };
  if (endpoint.expiresAt && endpoint.expiresAt <= opts.now) {
    return { ok: false, reason: 'EXPIRED' };
  }
  if (opts.requiredScope && !endpoint.scopes.includes(opts.requiredScope)) {
    return { ok: false, reason: 'MISSING_SCOPE' };
  }
  if (opts.requireConsentAgreement && !endpoint.consentAgreementId) {
    return { ok: false, reason: 'MISSING_CONSENT' };
  }

  return {
    ok: true,
    endpoint: {
      endpointId: endpoint.id,
      orgId: endpoint.orgId,
      kind: endpoint.kind,
      label: endpoint.label,
      scopes: [...endpoint.scopes],
      targetId: endpoint.targetId,
      consentAgreementId: endpoint.consentAgreementId,
    },
  };
}

export function resolveRegistrationIntakeEndpoint(
  endpoints: PublicEndpoint[],
  opts: { tokenHash: string; now: IsoTimestamp },
): PublicTokenResolution {
  return resolvePublicToken(endpoints, {
    tokenHash: opts.tokenHash,
    kind: 'REGISTRATION_INTAKE',
    now: opts.now,
    requiredScope: REGISTRATION_INTAKE_PUBLIC_SCOPE,
    requireConsentAgreement: true,
  });
}

export function resolveCalendarSubscriptionEndpoint(
  endpoints: PublicEndpoint[],
  opts: { tokenHash: string; now: IsoTimestamp },
): PublicTokenResolution {
  return resolvePublicToken(endpoints, {
    tokenHash: opts.tokenHash,
    kind: 'CALENDAR_SUBSCRIPTION',
    now: opts.now,
    requiredScope: CALENDAR_SUBSCRIPTION_PUBLIC_SCOPE,
  });
}

type SubscriptionFilterKey = 'staffMemberIds' | 'positionTitles' | 'roomIds' | 'activityIds' | 'tags';

export interface SubscriptionFilterIssue {
  key: SubscriptionFilterKey;
  value: string;
  reason: 'MISSING_SOURCE' | 'ARCHIVED_SOURCE' | 'UNUSED_TAG_OR_POSITION';
}

export interface ActiveCalendarSubscription {
  id: string;
  orgId: string;
  name: string;
  endpointId: string | null;
  endpointStatus: PublicEndpoint['status'] | 'LEGACY_RAW_TOKEN';
  targetId: string | null;
  expiresAt: IsoTimestamp | null;
  filterIssues: SubscriptionFilterIssue[];
  duplicateTokenHash: boolean;
  requiresEndpointBackfill: boolean;
  createdAt: IsoTimestamp;
}

export interface ListActiveSubscriptionsOptions {
  now: IsoTimestamp;
  endpoints?: PublicEndpoint[];
  staffMembers?: Array<{ id: string; fullName?: string; positions?: string[]; isArchived?: boolean }>;
  rooms?: Array<{ id: string; name?: string; isArchived?: boolean }>;
  activities?: Array<{ id: string; name?: string; isArchived?: boolean }>;
  events?: CalendarEvent[];
}

function countBy<T>(items: T[], keyOf: (item: T) => string | null | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function endpointIsUsable(endpoint: PublicEndpoint | undefined, now: IsoTimestamp): boolean {
  return !!endpoint &&
    endpoint.kind === 'CALENDAR_SUBSCRIPTION' &&
    endpoint.status === 'ACTIVE' &&
    endpoint.scopes.includes(CALENDAR_SUBSCRIPTION_PUBLIC_SCOPE) &&
    (!endpoint.expiresAt || endpoint.expiresAt > now);
}

function collectSubscriptionFilterIssues(
  sub: CalendarSubscription,
  opts: ListActiveSubscriptionsOptions,
): SubscriptionFilterIssue[] {
  const issues: SubscriptionFilterIssue[] = [];
  const staffById = new Map((opts.staffMembers ?? []).map(s => [s.id, s]));
  const roomById = new Map((opts.rooms ?? []).map(r => [r.id, r]));
  const activityById = new Map((opts.activities ?? []).map(a => [a.id, a]));
  const knownTags = new Set((opts.events ?? []).flatMap(e => e.tags ?? []));
  const knownPositions = new Set((opts.staffMembers ?? []).flatMap(s => s.positions ?? []));

  for (const id of sub.filters.staffMemberIds ?? []) {
    const staff = staffById.get(id);
    if (!staff) issues.push({ key: 'staffMemberIds', value: id, reason: 'MISSING_SOURCE' });
    else if (staff.isArchived) issues.push({ key: 'staffMemberIds', value: id, reason: 'ARCHIVED_SOURCE' });
  }
  for (const id of sub.filters.roomIds ?? []) {
    const room = roomById.get(id);
    if (!room) issues.push({ key: 'roomIds', value: id, reason: 'MISSING_SOURCE' });
    else if (room.isArchived) issues.push({ key: 'roomIds', value: id, reason: 'ARCHIVED_SOURCE' });
  }
  for (const id of sub.filters.activityIds ?? []) {
    const activity = activityById.get(id);
    if (!activity) issues.push({ key: 'activityIds', value: id, reason: 'MISSING_SOURCE' });
    else if (activity.isArchived) issues.push({ key: 'activityIds', value: id, reason: 'ARCHIVED_SOURCE' });
  }
  for (const tag of sub.filters.tags ?? []) {
    if (knownTags.size > 0 && !knownTags.has(tag)) {
      issues.push({ key: 'tags', value: tag, reason: 'UNUSED_TAG_OR_POSITION' });
    }
  }
  for (const position of sub.filters.positionTitles ?? []) {
    if (knownPositions.size > 0 && !knownPositions.has(position)) {
      issues.push({ key: 'positionTitles', value: position, reason: 'UNUSED_TAG_OR_POSITION' });
    }
  }

  return issues.sort((a, b) =>
    a.key.localeCompare(b.key) ||
    a.value.localeCompare(b.value) ||
    a.reason.localeCompare(b.reason)
  );
}

export function listActiveSubscriptions(
  subscriptions: CalendarSubscription[],
  opts: ListActiveSubscriptionsOptions,
): ActiveCalendarSubscription[] {
  const endpoints = opts.endpoints ?? [];
  const endpointsByTarget = new Map(
    endpoints
      .filter(e => e.kind === 'CALENDAR_SUBSCRIPTION' && e.targetId)
      .map(e => [e.targetId as string, e])
  );
  const tokenHashCounts = countBy(endpoints, e => e.kind === 'CALENDAR_SUBSCRIPTION' ? e.tokenHash : null);

  return subscriptions
    .filter(sub => {
      if (!sub.isActive) return false;
      if (endpoints.length === 0) return true;
      return endpointIsUsable(endpointsByTarget.get(sub.id), opts.now);
    })
    .map(sub => {
      const endpoint = endpointsByTarget.get(sub.id);
      const endpointStatus: ActiveCalendarSubscription['endpointStatus'] = endpoint?.status ?? 'LEGACY_RAW_TOKEN';
      return {
        id: sub.id,
        orgId: sub.orgId,
        name: sub.name,
        endpointId: endpoint?.id ?? null,
        endpointStatus,
        targetId: endpoint?.targetId ?? null,
        expiresAt: endpoint?.expiresAt ?? null,
        filterIssues: collectSubscriptionFilterIssues(sub, opts),
        duplicateTokenHash: endpoint ? (tokenHashCounts.get(endpoint.tokenHash) ?? 0) > 1 : false,
        requiresEndpointBackfill: !endpoint,
        createdAt: sub.createdAt,
      };
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id)
    );
}

function eventMatchesSubscription(
  event: CalendarEvent,
  sub: CalendarSubscription,
  staffMembers: Array<{ id: string; positions?: string[] }> = [],
): boolean {
  if (event.isCanceled || event.isHidden) return false;
  const filters = sub.filters;
  if (filters.staffMemberIds?.length) {
    const staffIds = new Set([event.teacherId, ...(event.staffMemberIds ?? [])].filter(Boolean) as string[]);
    if (!filters.staffMemberIds.some(id => staffIds.has(id))) return false;
  }
  if (filters.roomIds?.length && (!event.roomId || !filters.roomIds.includes(event.roomId))) return false;
  if (filters.activityIds?.length && (!event.activityId || !filters.activityIds.includes(event.activityId))) return false;
  if (filters.tags?.length) {
    const eventTags = new Set(event.tags ?? []);
    if (!filters.tags.some(tag => eventTags.has(tag))) return false;
  }
  if (filters.positionTitles?.length) {
    const eventStaffIds = new Set([event.teacherId, ...(event.staffMemberIds ?? [])].filter(Boolean) as string[]);
    const matchingStaff = staffMembers.filter(staff => eventStaffIds.has(staff.id));
    if (!matchingStaff.some(staff => (staff.positions ?? []).some(position => filters.positionTitles?.includes(position)))) {
      return false;
    }
  }
  return true;
}

function formatIcalDateTime(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function foldIcalLine(line: string, limit = 75): string {
  if (line.length <= limit) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, limit));
  rest = rest.slice(limit);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, limit - 1)}`);
    rest = rest.slice(limit - 1);
  }
  return parts.join('\r\n');
}

export function buildCalendarSubscriptionIcs(
  subscription: CalendarSubscription,
  events: CalendarEvent[],
  opts: { now: IsoTimestamp; staffMembers?: Array<{ id: string; positions?: string[] }> },
): string {
  const matchingEvents = events
    .filter(event => eventMatchesSubscription(event, subscription, opts.staffMembers))
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cadenza Forte//Calendar Subscription//EN',
    `X-WR-CALNAME:${escapeIcalText(subscription.name)}`,
    ...matchingEvents.flatMap(event => [
      'BEGIN:VEVENT',
      `UID:${escapeIcalText(event.id)}@cadenza-forte`,
      `DTSTAMP:${formatIcalDateTime(opts.now)}`,
      `DTSTART:${formatIcalDateTime(event.start)}`,
      `DTEND:${formatIcalDateTime(event.end)}`,
      `SUMMARY:${escapeIcalText(event.name)}`,
      event.description ? `DESCRIPTION:${escapeIcalText(event.description)}` : null,
      event.roomId ? `LOCATION:${escapeIcalText(event.roomId)}` : null,
      'END:VEVENT',
    ].filter((line): line is string => Boolean(line))),
    'END:VCALENDAR',
  ];

  return lines.map(line => foldIcalLine(line)).join('\r\n');
}

export type ExternalSyncStatus = 'OK' | 'WARNING' | 'ERROR' | 'DISABLED';

export interface ExternalSyncState {
  id: string;
  kind: 'GOOGLE_TENANT_CALENDAR' | 'GOOGLE_TEACHER_CALENDARS' | 'ICAL_SUBSCRIPTIONS';
  status: ExternalSyncStatus;
  label: string;
  syncedCount: number;
  issueCount: number;
  sourceIds: string[];
  blockedDecisionIds: string[];
}

export function listExternalSyncState(input: {
  settings?: { googleCalendarSyncEnabled?: boolean; googleCalendarId?: string | null; googleCalendarConnectedBy?: string | null };
  events?: CalendarEvent[];
  subscriptions?: CalendarSubscription[];
  endpoints?: PublicEndpoint[];
  now: IsoTimestamp;
}): ExternalSyncState[] {
  const settings = input.settings ?? {};
  const events = input.events ?? [];
  const subscriptions = input.subscriptions ?? [];
  const endpoints = input.endpoints ?? [];
  const activeSubscriptionViews = listActiveSubscriptions(subscriptions, { now: input.now, endpoints, events });
  const duplicateEndpointHashes = [...countBy(
    endpoints.filter(e => e.kind === 'CALENDAR_SUBSCRIPTION'),
    e => e.tokenHash,
  ).values()].filter(count => count > 1).length;

  const tenantSyncedEvents = events.filter(e => e.googleEventId && !e.isCanceled && !e.isHidden);
  const teacherSyncedIds = new Set<string>();
  for (const event of events) {
    if (event.isCanceled || event.isHidden) continue;
    for (const staffId of Object.keys(event.teacherGoogleEventIds ?? {})) teacherSyncedIds.add(staffId);
  }

  return [
    {
      id: 'google-tenant-calendar',
      kind: 'GOOGLE_TENANT_CALENDAR',
      status: settings.googleCalendarSyncEnabled
        ? (settings.googleCalendarId ? 'OK' : 'WARNING')
        : 'DISABLED',
      label: 'Tenant Google Calendar',
      syncedCount: tenantSyncedEvents.length,
      issueCount: settings.googleCalendarSyncEnabled && !settings.googleCalendarId ? 1 : 0,
      sourceIds: tenantSyncedEvents.map(e => e.id).sort(),
      blockedDecisionIds: [],
    },
    {
      id: 'google-teacher-calendars',
      kind: 'GOOGLE_TEACHER_CALENDARS',
      status: teacherSyncedIds.size > 0 ? 'OK' : 'DISABLED',
      label: 'Teacher Google Calendars',
      syncedCount: teacherSyncedIds.size,
      issueCount: 0,
      sourceIds: [...teacherSyncedIds].sort(),
      blockedDecisionIds: [],
    },
    {
      id: 'ical-subscriptions',
      kind: 'ICAL_SUBSCRIPTIONS',
      status: duplicateEndpointHashes > 0 || activeSubscriptionViews.some(s => s.filterIssues.length > 0 || s.requiresEndpointBackfill)
        ? 'WARNING'
        : (activeSubscriptionViews.length > 0 ? 'OK' : 'DISABLED'),
      label: 'Private iCal subscriptions',
      syncedCount: activeSubscriptionViews.length,
      issueCount: duplicateEndpointHashes +
        activeSubscriptionViews.filter(s => s.filterIssues.length > 0 || s.requiresEndpointBackfill).length,
      sourceIds: activeSubscriptionViews.map(s => s.id),
      blockedDecisionIds: ['D-23'],
    },
  ];
}

export interface IntakeApprovalGraph {
  intake: RegistrationIntake;
  student: StudentV2;
  family: Family;
  enrollment: EnrollmentV2;
  agreementRequest: AgreementAcceptance;
  inboxHistoryItem: AdminInboxItem;
}

export interface IntakeApprovalOptions {
  studentId: string;
  familyId: string;
  enrollmentId: string;
  agreementRequestId: string;
  inboxItemId: string;
  now: IsoTimestamp;
  reviewedBy: string;
  activityId?: string | null;
  l2Id: string;
  enrollmentStartDate: IsoDate;
  agreementTemplateId?: string | null;
  agreementTemplateVersion?: number;
  decisionNote?: string;
}

export interface IntakeReviewDecision {
  intake: RegistrationIntake;
  inboxHistoryItem: AdminInboxItem;
}

export interface IntakeRejectOptions {
  inboxItemId: string;
  now: IsoTimestamp;
  reviewedBy: string;
  reason: string;
}

export interface IntakeDuplicateOptions {
  inboxItemId: string;
  now: IsoTimestamp;
  reviewedBy: string;
  duplicateOfStudentId: string;
  note?: string;
}

export interface AppendIntakeStatusHistoryOptions {
  status: IntakeStatus;
  now: IsoTimestamp;
  by: string | null;
  note?: string | null;
  fromStatus?: IntakeStatus | null;
  relatedEntityIds?: string[];
}

function primaryGuardian(record: RegistrationIntake): Guardian | null {
  return record.guardians.find(g => g.isPrimary) ?? record.guardians[0] ?? null;
}

function deriveFamilyName(record: RegistrationIntake): string {
  const source = primaryGuardian(record)?.fullName || record.studentFullName;
  const tokens = source.trim().split(/\s+/).filter(Boolean);
  const surname = tokens.length > 1 ? tokens[tokens.length - 1] : tokens[0];
  return surname ? `${surname} Family` : `${record.studentFullName} Family`;
}

export function appendIntakeStatusHistory(
  record: RegistrationIntake,
  opts: AppendIntakeStatusHistoryOptions,
): IntakeStatusHistoryEntry[] {
  const previous = record.statusHistory ?? [];
  const fromStatus = opts.fromStatus !== undefined ? opts.fromStatus : record.status;
  return [
    ...previous,
    {
      id: `${record.id}:${opts.now}:${opts.status}:${previous.length + 1}`,
      status: opts.status,
      fromStatus: fromStatus === opts.status ? null : fromStatus,
      at: opts.now,
      by: opts.by,
      note: opts.note ?? null,
      ...(opts.relatedEntityIds?.length ? { relatedEntityIds: [...opts.relatedEntityIds] } : {}),
    },
  ];
}

function buildIntakeHistoryItem(
  record: RegistrationIntake,
  opts: {
    inboxItemId: string;
    now: IsoTimestamp;
    reviewedBy: string;
    decision: 'APPROVED' | 'REJECTED';
    title: string;
    message: string;
    note: string;
    relatedEntityIds: string[];
  },
): AdminInboxItem {
  return decideApproval(
    makeApprovalRequest({
      id: opts.inboxItemId,
      orgId: record.orgId,
      title: opts.title,
      message: opts.message,
      relatedEntityType: 'registration_intake',
      relatedEntityIds: opts.relatedEntityIds,
      requestedBy: record.createdBy ?? 'public',
      nowIso: opts.now,
    }),
    opts.decision,
    { decidedBy: opts.reviewedBy, nowIso: opts.now, note: opts.note },
  );
}

/**
 * Pure conversion service: returns the admin-approved intake lineage plus the
 * records a repository layer should persist in one transaction. Public submit
 * never calls this directly; it only creates quarantined intake rows.
 */
export function approveIntakeRecord(
  record: RegistrationIntake,
  opts: IntakeApprovalOptions,
): IntakeApprovalGraph {
  const activityId = opts.activityId ?? record.requestedActivityId;
  if (!activityId) {
    throw new Error('Cannot approve registration intake without an activityId');
  }
  if (!opts.l2Id) {
    throw new Error('Cannot approve registration intake without an l2Id');
  }

  const stamp = fromDateTimestamp(new Date(opts.now));
  const guardian = primaryGuardian(record);
  const familyGuardians = record.guardians.map(g => ({ ...g }));
  const agreementTemplateId =
    opts.agreementTemplateId ?? record.consentAgreementId ?? 'registration-intake-placeholder';
  const agreementTemplateVersion = opts.agreementTemplateVersion ?? 1;

  const student: StudentV2 = {
    id: opts.studentId,
    orgId: record.orgId,
    fullName: record.studentFullName,
    dateOfBirth: record.studentDateOfBirth,
    parentName: guardian?.fullName ?? null,
    parentPhone: guardian?.phone ?? null,
    grade: null,
    startDate: opts.enrollmentStartDate,
    level: null,
    tags: record.instrument ? [record.instrument] : [],
    phone2: null,
    email: guardian?.email ?? null,
    address: null,
    isArchived: false,
    createdAt: stamp,
    updatedAt: stamp,
    documents: [],
  };
  const family: Family = {
    id: opts.familyId,
    orgId: record.orgId,
    name: deriveFamilyName(record),
    guardians: familyGuardians,
    studentIds: [opts.studentId],
    primaryContactGuardianId: guardian?.id ?? null,
    billingNotes: null,
    isArchived: false,
    createdAt: opts.now,
    updatedAt: opts.now,
    createdBy: opts.reviewedBy,
    updatedBy: opts.reviewedBy,
  };
  const enrollment: EnrollmentV2 = {
    id: opts.enrollmentId,
    orgId: record.orgId,
    studentId: opts.studentId,
    activityId,
    l2Id: opts.l2Id,
    startDate: opts.enrollmentStartDate,
    endDate: null,
    status: 'ACTIVE',
    createdAt: stamp,
    updatedAt: stamp,
  };
  const agreementRequest: AgreementAcceptance = {
    id: opts.agreementRequestId,
    orgId: record.orgId,
    templateId: agreementTemplateId,
    templateVersion: agreementTemplateVersion,
    studentId: opts.studentId,
    familyId: opts.familyId,
    enrollmentId: opts.enrollmentId,
    guardianId: guardian?.id ?? null,
    status: 'PENDING',
    acceptedAt: null,
    acceptedByName: null,
    signatureRef: null,
    createdAt: opts.now,
    updatedAt: opts.now,
    createdBy: opts.reviewedBy,
    updatedBy: opts.reviewedBy,
  };
  const relatedEntityIds = [
    record.id,
    opts.studentId,
    opts.familyId,
    opts.enrollmentId,
    opts.agreementRequestId,
  ];
  const decisionNote = opts.decisionNote ?? 'Converted to student/family/enrollment graph.';
  const intake: RegistrationIntake = {
    ...record,
    status: 'CONVERTED',
    reviewedBy: opts.reviewedBy,
    reviewedAt: opts.now,
    convertedStudentId: opts.studentId,
    convertedEnrollmentId: opts.enrollmentId,
    statusHistory: appendIntakeStatusHistory(record, {
      status: 'CONVERTED',
      now: opts.now,
      by: opts.reviewedBy,
      note: decisionNote,
      relatedEntityIds,
    }),
    updatedAt: opts.now,
    updatedBy: opts.reviewedBy,
  };
  const inboxHistoryItem = buildIntakeHistoryItem(record, {
    inboxItemId: opts.inboxItemId,
    now: opts.now,
    reviewedBy: opts.reviewedBy,
    decision: 'APPROVED',
    title: 'Registration intake approved',
    message: `${record.studentFullName} was converted from intake ${record.id}.`,
    note: decisionNote,
    relatedEntityIds,
  });

  return { intake, student, family, enrollment, agreementRequest, inboxHistoryItem };
}

export function rejectIntakeRecord(
  record: RegistrationIntake,
  opts: IntakeRejectOptions,
): IntakeReviewDecision {
  const intake: RegistrationIntake = {
    ...record,
    status: 'REJECTED',
    reviewedBy: opts.reviewedBy,
    reviewedAt: opts.now,
    rejectionReason: opts.reason,
    statusHistory: appendIntakeStatusHistory(record, {
      status: 'REJECTED',
      now: opts.now,
      by: opts.reviewedBy,
      note: opts.reason,
      relatedEntityIds: [record.id],
    }),
    updatedAt: opts.now,
    updatedBy: opts.reviewedBy,
  };
  const inboxHistoryItem = buildIntakeHistoryItem(record, {
    inboxItemId: opts.inboxItemId,
    now: opts.now,
    reviewedBy: opts.reviewedBy,
    decision: 'REJECTED',
    title: 'Registration intake rejected',
    message: `${record.studentFullName} intake ${record.id} was rejected.`,
    note: opts.reason,
    relatedEntityIds: [record.id],
  });
  return { intake, inboxHistoryItem };
}

export function markIntakeDuplicate(
  record: RegistrationIntake,
  opts: IntakeDuplicateOptions,
): IntakeReviewDecision {
  const note = opts.note ?? `Duplicate of student ${opts.duplicateOfStudentId}.`;
  const intake: RegistrationIntake = {
    ...record,
    status: 'DUPLICATE',
    reviewedBy: opts.reviewedBy,
    reviewedAt: opts.now,
    duplicateOfStudentId: opts.duplicateOfStudentId,
    statusHistory: appendIntakeStatusHistory(record, {
      status: 'DUPLICATE',
      now: opts.now,
      by: opts.reviewedBy,
      note,
      relatedEntityIds: [record.id, opts.duplicateOfStudentId],
    }),
    updatedAt: opts.now,
    updatedBy: opts.reviewedBy,
  };
  const inboxHistoryItem = buildIntakeHistoryItem(record, {
    inboxItemId: opts.inboxItemId,
    now: opts.now,
    reviewedBy: opts.reviewedBy,
    decision: 'REJECTED',
    title: 'Registration intake marked duplicate',
    message: `${record.studentFullName} intake ${record.id} was marked duplicate.`,
    note,
    relatedEntityIds: [record.id, opts.duplicateOfStudentId],
  });
  return { intake, inboxHistoryItem };
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Students / family files  (findStudentByName, listStudentsByGuardian,
//    listStudentEnrollments)
// ════════════════════════════════════════════════════════════════════════════

export function findStudentByName(students: MinimalStudent[], name: string): MinimalStudent[] {
  const q = normalizeName(name);
  if (!q) return [];
  return students
    .filter(s => normalizeName(s.fullName).includes(q))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export interface GuardianLink {
  guardian: Guardian;
  family: Family;
  students: MinimalStudent[];
}

/** Resolves which students sit under a guardian (matched by phone or email). */
export function listStudentsByGuardian(
  families: Family[],
  students: MinimalStudent[],
  guardianContact: string,
): GuardianLink[] {
  const q = normalizeName(guardianContact);
  const studentById = new Map(students.map(s => [s.id, s]));
  const links: GuardianLink[] = [];
  for (const family of families) {
    for (const g of family.guardians) {
      const matches =
        (g.phone && normalizeName(g.phone).includes(q)) ||
        (g.email && normalizeName(g.email).includes(q)) ||
        normalizeName(g.fullName).includes(q);
      if (matches) {
        links.push({
          guardian: g,
          family,
          students: family.studentIds.map(id => studentById.get(id)).filter(Boolean) as MinimalStudent[],
        });
      }
    }
  }
  return links;
}

export function listStudentEnrollments(
  enrollments: MinimalEnrollment[],
  studentId: string,
): MinimalEnrollment[] {
  return enrollments
    .filter(e => e.studentId === studentId)
    .sort(byDateAsc(e => e.startDate));
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Rooms / absence / day requests  (listRoomRequests, listAbsencesForPeriod,
//    applyApprovedRoomChange)
// ════════════════════════════════════════════════════════════════════════════

export function listRoomRequests(
  requests: OperationalRequest[],
  statusOrOptions?: OperationalRequest['status'] | OperationalRequestListOptions,
): OperationalRequest[] {
  const opts = normalizeOperationalRequestListOptions(statusOrOptions);
  const knownEventIds = opts.eventIds ? new Set(opts.eventIds) : null;
  const knownRoomIds = opts.roomIds ? new Set(opts.roomIds) : null;
  return requests
    .filter(r => r.kind === 'ROOM_CHANGE')
    .filter(r => matchesOperationalRequestFilters(r, opts))
    .filter(r => opts.includeStaleLinks !== false || roomChangeLinksAreKnown(r, knownEventIds, knownRoomIds))
    .sort(byDateAscThenId(r => r.requestedFor));
}

export function listAbsencesForPeriod(
  requests: OperationalRequest[],
  from: IsoDate,
  to: IsoDate,
  options: OperationalRequestListOptions = {},
): OperationalRequest[] {
  return requests
    .filter(r => (r.kind === 'ABSENCE' || r.kind === 'DAY_OFF'))
    .filter(r => matchesOperationalRequestFilters(r, options))
    .filter(r => {
      const start = r.requestedFor;
      const end = r.endDate ?? r.requestedFor;
      // overlap test
      return start <= to && end >= from;
    })
    .sort(byDateAscThenId(r => r.requestedFor));
}

export interface RoomChangeResult {
  request: OperationalRequest;
  eventId: string;
  newRoomId: string;
}

export interface OperationalRequestListOptions {
  status?: OperationalRequest['status'] | OperationalRequest['status'][];
  requestedByStaffId?: string | null;
  includeTerminal?: boolean;
  eventIds?: readonly string[];
  roomIds?: readonly string[];
  includeStaleLinks?: boolean;
}

function normalizeOperationalRequestListOptions(
  statusOrOptions?: OperationalRequest['status'] | OperationalRequestListOptions,
): OperationalRequestListOptions {
  return typeof statusOrOptions === 'string'
    ? { status: statusOrOptions }
    : statusOrOptions ?? {};
}

function isTerminalRequestStatus(status: OperationalRequest['status']): boolean {
  return status === 'APPROVED' || status === 'REJECTED' || status === 'CANCELLED';
}

function matchesOperationalRequestFilters(
  request: OperationalRequest,
  options: OperationalRequestListOptions,
): boolean {
  const statuses = Array.isArray(options.status)
    ? options.status
    : options.status
      ? [options.status]
      : null;
  if (statuses && !statuses.includes(request.status)) return false;
  if (options.includeTerminal === false && isTerminalRequestStatus(request.status)) return false;
  if (options.requestedByStaffId && request.requestedByStaffId !== options.requestedByStaffId) return false;
  return true;
}

function roomChangeLinksAreKnown(
  request: OperationalRequest,
  eventIds: Set<string> | null,
  roomIds: Set<string> | null,
): boolean {
  if (!request.eventId || !request.currentRoomId || !request.requestedRoomId) return false;
  if (request.currentRoomId === request.requestedRoomId) return false;
  if (eventIds && !eventIds.has(request.eventId)) return false;
  if (roomIds && (!roomIds.has(request.currentRoomId) || !roomIds.has(request.requestedRoomId))) return false;
  return true;
}

/** Pure: returns the approved request + the event/room mutation the caller applies. */
export function applyApprovedRoomChange(
  request: OperationalRequest,
  opts: {
    now: IsoTimestamp;
    decidedBy?: string | null;
    eventIds?: readonly string[];
    roomIds?: readonly string[];
  },
): RoomChangeResult | null {
  if (request.kind !== 'ROOM_CHANGE' || request.status !== 'PENDING') return null;
  const knownEventIds = opts.eventIds ? new Set(opts.eventIds) : null;
  const knownRoomIds = opts.roomIds ? new Set(opts.roomIds) : null;
  if (!roomChangeLinksAreKnown(request, knownEventIds, knownRoomIds)) return null;
  return {
    request: {
      ...request,
      status: 'APPROVED',
      decidedBy: opts.decidedBy ?? null,
      decidedAt: opts.now,
      updatedAt: opts.now,
    },
    eventId: request.eventId,
    newRoomId: request.requestedRoomId,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Ensembles / theory / school programs  (listEnsembleRosters,
//    listTheoryGroups, listSchoolProgramStudents)
// ════════════════════════════════════════════════════════════════════════════

export interface ActivityRoster {
  activity: MinimalActivity;
  enrollmentIds: string[];
  studentIds: string[];
  students: MinimalStudent[];
  l2Ids: string[];
  archivedEnrollmentIds: string[];
  missingStudentIds: string[];
  archivedStudentIds: string[];
  duplicateStudentIds: string[];
}

function rosterFor(
  activities: MinimalActivity[],
  enrollments: MinimalEnrollment[],
  students: MinimalStudent[],
  predicate: (a: MinimalActivity) => boolean,
  enrollmentPredicate: (enrollment: MinimalEnrollment, activity: MinimalActivity) => boolean = () => true,
): ActivityRoster[] {
  const studentById = new Map(students.map(s => [s.id, s]));
  return activities
    .filter(a => !a.isArchived && predicate(a))
    .map(a => {
      const activityEnrollments = enrollments
        .filter(e => e.activityId === a.id && enrollmentPredicate(e, a))
        .sort((x, y) => {
          const xStudent = studentById.get(x.studentId)?.fullName ?? x.studentId;
          const yStudent = studentById.get(y.studentId)?.fullName ?? y.studentId;
          return (x.l2Id ?? '').localeCompare(y.l2Id ?? '')
            || xStudent.localeCompare(yStudent)
            || x.studentId.localeCompare(y.studentId)
            || x.id.localeCompare(y.id);
        });
      const archivedEnrollmentIds = activityEnrollments
        .filter(e => e.status === 'ARCHIVED')
        .map(e => e.id);
      const activeEnrollments = activityEnrollments.filter(e => e.status ? e.status === 'ACTIVE' : true);
      const ids = activeEnrollments.map(e => e.studentId);
      const duplicateStudentIds = Array.from(
        ids.reduce((acc, id) => acc.set(id, (acc.get(id) ?? 0) + 1), new Map<string, number>()),
      )
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
        .sort();
      const unique = Array.from(new Set(ids));
      const missingStudentIds = unique.filter(id => !studentById.has(id)).sort();
      const archivedStudentIds = unique.filter(id => studentById.get(id)?.isArchived).sort();
      const activeStudentIds = unique
        .filter(id => studentById.has(id) && !studentById.get(id)?.isArchived)
        .sort((x, y) => {
          const sx = studentById.get(x);
          const sy = studentById.get(y);
          return (sx?.fullName ?? x).localeCompare(sy?.fullName ?? y) || x.localeCompare(y);
        });
      return {
        activity: a,
        enrollmentIds: activeEnrollments.map(e => e.id),
        studentIds: activeStudentIds,
        students: activeStudentIds.map(id => studentById.get(id)).filter(Boolean) as MinimalStudent[],
        l2Ids: Array.from(new Set(activeEnrollments.map(e => e.l2Id).filter(Boolean) as string[])).sort(),
        archivedEnrollmentIds,
        missingStudentIds,
        archivedStudentIds,
        duplicateStudentIds,
      };
    })
    .sort((x, y) => x.activity.name.localeCompare(y.activity.name) || x.activity.id.localeCompare(y.activity.id));
}

export function listEnsembleRosters(
  activities: MinimalActivity[],
  enrollments: MinimalEnrollment[],
  students: MinimalStudent[],
): ActivityRoster[] {
  return rosterFor(activities, enrollments, students, a => a.template === 'ENSEMBLE');
}

export function listTheoryGroups(
  activities: MinimalActivity[],
  enrollments: MinimalEnrollment[],
  students: MinimalStudent[],
): ActivityRoster[] {
  return rosterFor(activities, enrollments, students, a =>
    /theory/i.test(a.name) || a.activityType === 'ACADEMIC',
  );
}

export function listSchoolProgramStudents(
  activities: MinimalActivity[],
  enrollments: MinimalEnrollment[],
  students: MinimalStudent[],
): ActivityRoster[] {
  return rosterFor(activities, enrollments, students, a => a.template === 'PROGRAM');
}

export type RosterProgramKind = 'ENSEMBLE' | 'THEORY' | 'PROGRAM' | 'ALL';
export type RosterProgramAccess =
  | { role: 'admin' | 'super_admin' }
  | { role: 'teacher'; staffMemberId: string }
  | { role: 'member' | 'finance' | 'guardian' | 'public' };

export interface RosterProgramViewItem extends ActivityRoster {
  kind: Exclude<RosterProgramKind, 'ALL'>;
  assignmentIds: string[];
  assignedStaffMemberIds: string[];
  visibleSourceIds: {
    activityId: string;
    enrollmentIds: string[];
    assignmentIds: string[];
  };
}

export interface RosterProgramViewModel {
  access: 'FULL' | 'ASSIGNED_TEACHER' | 'DENIED';
  canWrite: boolean;
  canExport: boolean;
  items: RosterProgramViewItem[];
  blockedSourceMarkers: string[];
}

function rosterKind(activity: MinimalActivity): Exclude<RosterProgramKind, 'ALL'> | null {
  if (activity.template === 'ENSEMBLE') return 'ENSEMBLE';
  if (activity.template === 'PROGRAM') return 'PROGRAM';
  if (/theory/i.test(activity.name) || activity.activityType === 'ACADEMIC') return 'THEORY';
  return null;
}

function assignmentMatchesEnrollment(assignment: MinimalTeachingAssignment, enrollment: MinimalEnrollment): boolean {
  const scope = assignment.scope ?? 'ACTIVITY';
  if (assignment.activityId !== enrollment.activityId) return false;
  if (scope === 'L2') return Boolean(assignment.l2Id) && assignment.l2Id === enrollment.l2Id;
  if (scope === 'L1') return !assignment.l1Id || assignment.l1Id === enrollment.l1Id;
  return true;
}

export function buildRosterProgramViewModel(opts: {
  activities: MinimalActivity[];
  enrollments: MinimalEnrollment[];
  students: MinimalStudent[];
  teachingAssignments: MinimalTeachingAssignment[];
  access: RosterProgramAccess;
  kind?: RosterProgramKind;
}): RosterProgramViewModel {
  const requestedKind = opts.kind ?? 'ALL';
  if (opts.access.role === 'member' || opts.access.role === 'finance' || opts.access.role === 'guardian' || opts.access.role === 'public') {
    return {
      access: 'DENIED',
      canWrite: false,
      canExport: false,
      items: [],
      blockedSourceMarkers: ['roster_programs'],
    };
  }

  const isAdmin = opts.access.role === 'admin' || opts.access.role === 'super_admin';
  const teacherStaffMemberId = opts.access.role === 'teacher' ? opts.access.staffMemberId : null;
  const activeAssignments = opts.teachingAssignments.filter(a => !a.isArchived);
  const visibleAssignmentByActivity = new Map<string, MinimalTeachingAssignment[]>();
  for (const assignment of activeAssignments) {
    if (!isAdmin && assignment.staffMemberId !== teacherStaffMemberId) continue;
    const current = visibleAssignmentByActivity.get(assignment.activityId) ?? [];
    current.push(assignment);
    visibleAssignmentByActivity.set(assignment.activityId, current);
  }

  const rosters = rosterFor(
    opts.activities,
    opts.enrollments,
    opts.students,
    activity => {
      const kind = rosterKind(activity);
      if (!kind) return false;
      if (requestedKind !== 'ALL' && kind !== requestedKind) return false;
      return isAdmin || visibleAssignmentByActivity.has(activity.id);
    },
    (enrollment, activity) => {
      if (isAdmin) return true;
      const assignments = visibleAssignmentByActivity.get(activity.id) ?? [];
      return assignments.some(assignment => assignmentMatchesEnrollment(assignment, enrollment));
    },
  );

  const items: RosterProgramViewItem[] = rosters.map(roster => {
    const activityAssignments = activeAssignments
      .filter(a => a.activityId === roster.activity.id)
      .filter(a => isAdmin || a.staffMemberId === teacherStaffMemberId)
      .sort((a, b) =>
        a.staffMemberId.localeCompare(b.staffMemberId)
        || (a.l2Id ?? '').localeCompare(b.l2Id ?? '')
        || a.id.localeCompare(b.id),
      );
    return {
      ...roster,
      kind: rosterKind(roster.activity) ?? 'THEORY',
      assignmentIds: activityAssignments.map(a => a.id),
      assignedStaffMemberIds: Array.from(new Set(activityAssignments.map(a => a.staffMemberId))).sort(),
      visibleSourceIds: {
        activityId: roster.activity.id,
        enrollmentIds: roster.enrollmentIds,
        assignmentIds: activityAssignments.map(a => a.id),
      },
    };
  });

  return {
    access: isAdmin ? 'FULL' : 'ASSIGNED_TEACHER',
    canWrite: isAdmin,
    canExport: isAdmin,
    items,
    blockedSourceMarkers: [],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 5. Lesson details / attendance  (listStudentLessonHistory,
//    listUnmarkedAttendance, summarizeLessonCompletion)
// ════════════════════════════════════════════════════════════════════════════

export function listStudentLessonHistory(
  lessons: LessonRecord[],
  studentId: string,
): LessonRecord[] {
  return lessons
    .filter(l => l.studentId === studentId)
    .sort(byDateAsc(l => l.date));
}

/** Lessons whose attendance was never marked, optionally on/before a cutoff date. */
export function listUnmarkedAttendance(
  lessons: LessonRecord[],
  upToDate?: IsoDate,
): LessonRecord[] {
  return lessons
    .filter(l => l.attendance === 'UNMARKED' && (upToDate ? l.date <= upToDate : true))
    .sort(byDateAsc(l => l.date));
}

export interface LessonCompletionSummary {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  pending: number;
  attendance: Record<LessonRecord['attendance'], number>;
  completionRate: number; // completed / (total - cancelled), 0 when denom 0
}

export function summarizeLessonCompletion(lessons: LessonRecord[]): LessonCompletionSummary {
  const attendance = {
    UNMARKED: 0, PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, MAKEUP: 0,
  } as Record<LessonRecord['attendance'], number>;
  let completed = 0, cancelled = 0, noShow = 0, pending = 0;
  for (const l of lessons) {
    attendance[l.attendance] += 1;
    if (l.completion === 'COMPLETED') completed += 1;
    else if (l.completion === 'CANCELLED') cancelled += 1;
    else if (l.completion === 'NO_SHOW') noShow += 1;
    else pending += 1;
  }
  const denom = lessons.length - cancelled;
  return {
    total: lessons.length,
    completed, cancelled, noShow, pending,
    attendance,
    completionRate: denom > 0 ? completed / denom : 0,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 6. Exams / certificates / report cards  (listExamSessions,
//    getStudentAssessmentSummary, listPendingCertificates)
// ════════════════════════════════════════════════════════════════════════════

export function listExamSessions(
  sessions: ExamSession[],
  statusOrFilters?: ExamSession['status'] | {
    status?: ExamSession['status'];
    activityId?: string | null;
    examinerStaffId?: string;
    studentId?: string;
  },
): ExamSession[] {
  const filters = typeof statusOrFilters === 'string'
    ? { status: statusOrFilters }
    : (statusOrFilters ?? {});
  return sessions
    .filter(s => (filters.status ? s.status === filters.status : true))
    .filter(s => ('activityId' in filters ? s.activityId === filters.activityId : true))
    .filter(s => (filters.examinerStaffId ? s.examinerStaffIds.includes(filters.examinerStaffId) : true))
    .filter(s => (filters.studentId ? s.studentIds.includes(filters.studentId) : true))
    .sort(byDateAscThenId(s => s.date));
}

export interface StudentAssessmentSummary {
  studentId: string;
  examCount: number;
  averageScore: number | null;
  bestGrade: string | null;
  certificates: number;
  submissions: ExaminerSubmission[];
  reportCards: {
    total: number;
    draft: number;
    released: number;
    items: ReportCard[];
  };
}

export function getStudentAssessmentSummary(
  studentId: string,
  submissions: ExaminerSubmission[],
  certificates: Certificate[],
  reportCards: ReportCard[] = [],
): StudentAssessmentSummary {
  const mine = submissions
    .filter(s => s.studentId === studentId)
    .sort(byDateAscThenId(s => s.submittedAt));
  const scored = mine.map(s => s.score).filter((n): n is number => typeof n === 'number');
  const grades = mine.map(s => s.grade).filter((g): g is string => !!g).sort();
  const studentReportCards = reportCards
    .filter(r => r.studentId === studentId)
    .sort(byDateAscThenId(r => r.createdAt));
  return {
    studentId,
    examCount: mine.length,
    averageScore: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
    bestGrade: grades.length ? grades[0] : null,
    certificates: certificates.filter(c => c.studentId === studentId && c.status === 'ISSUED').length,
    submissions: mine,
    reportCards: {
      total: studentReportCards.length,
      draft: studentReportCards.filter(r => !r.publishedAt).length,
      released: studentReportCards.filter(r => !!r.publishedAt).length,
      items: studentReportCards,
    },
  };
}

export function listPendingCertificates(certificates: Certificate[]): Certificate[] {
  return certificates
    .filter(c => c.status === 'PENDING')
    .sort(byDateAscThenId(c => c.createdAt));
}

// ════════════════════════════════════════════════════════════════════════════
// 7. Concert programs  (listConcertPrograms, getProgramRunOfShow,
//    listPerformerEvents)
// ════════════════════════════════════════════════════════════════════════════

export function listConcertPrograms(
  programs: ConcertProgram[],
  status?: ConcertProgram['status'],
): ConcertProgram[] {
  const statusRank: Record<ConcertProgram['status'], number> = {
    DRAFT: 0,
    PUBLISHED: 1,
    COMPLETED: 2,
    CANCELLED: 3,
  };
  return programs
    .filter(p => (status ? p.status === status : true))
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      statusRank[a.status] - statusRank[b.status] ||
      a.id.localeCompare(b.id));
}

export interface RunOfShowLine {
  order: number;
  title: string;
  composer: string | null;
  performers: number;
  performerStudentIds: string[];
  performerStaffIds: string[];
  performerNames: string[];
  staleStudentIds: string[];
  staleStaffIds: string[];
  durationMinutes: number | null;
  cumulativeMinutes: number | null;
  orderConflict: boolean;
}

export interface ConcertPerformerLookup {
  students?: MinimalStudent[];
  staff?: MinimalStaffMember[];
}

function staffDisplayName(staff: MinimalStaffMember): string {
  return staff.fullName ?? staff.name ?? staff.id;
}

export function getProgramRunOfShow(
  program: ConcertProgram,
  lookup: ConcertPerformerLookup = {},
): RunOfShowLine[] {
  let cumulative = 0;
  let cumulativeKnown = true;
  const studentById = new Map((lookup.students ?? []).map(student => [student.id, student]));
  const staffById = new Map((lookup.staff ?? []).map(staff => [staff.id, staff]));
  const orderCounts = new Map<number, number>();
  for (const piece of program.pieces) {
    orderCounts.set(piece.order, (orderCounts.get(piece.order) ?? 0) + 1);
  }
  return [...program.pieces]
    .sort((a, b) =>
      a.order - b.order ||
      a.title.localeCompare(b.title) ||
      (a.composer ?? '').localeCompare(b.composer ?? ''))
    .map(p => {
      if (typeof p.durationMinutes === 'number') cumulative += p.durationMinutes;
      else cumulativeKnown = false;
      const studentPerformers = p.performerStudentIds
        .map(id => studentById.get(id))
        .filter((student): student is MinimalStudent => !!student && !student.isArchived);
      const staffPerformers = p.performerStaffIds
        .map(id => staffById.get(id))
        .filter((staff): staff is MinimalStaffMember => !!staff && !staff.isArchived);
      return {
        order: p.order,
        title: p.title,
        composer: p.composer,
        performers: p.performerStudentIds.length + p.performerStaffIds.length,
        performerStudentIds: [...p.performerStudentIds],
        performerStaffIds: [...p.performerStaffIds],
        performerNames: [
          ...studentPerformers.map(student => student.fullName),
          ...staffPerformers.map(staffDisplayName),
        ].sort((a, b) => a.localeCompare(b)),
        staleStudentIds: p.performerStudentIds
          .filter(id => !studentById.has(id) || studentById.get(id)?.isArchived)
          .sort(),
        staleStaffIds: p.performerStaffIds
          .filter(id => !staffById.has(id) || staffById.get(id)?.isArchived)
          .sort(),
        durationMinutes: p.durationMinutes,
        cumulativeMinutes: cumulativeKnown ? cumulative : null,
        orderConflict: (orderCounts.get(p.order) ?? 0) > 1,
      };
    });
}

/** Concert programs where a given student/staff performs, newest first. */
export function listPerformerEvents(
  programs: ConcertProgram[],
  performerId: string,
  performerKind: 'student' | 'staff' | 'any' = 'any',
): ConcertProgram[] {
  return programs
    .filter(p => p.pieces.some(piece =>
      (performerKind !== 'staff' && piece.performerStudentIds.includes(performerId)) ||
      (performerKind !== 'student' && piece.performerStaffIds.includes(performerId))))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

// ════════════════════════════════════════════════════════════════════════════
// 8. Payroll / hours  (listPendingHoursReports, compareReportedVsCalendarHours,
//    calculatePayslipRows)
// ════════════════════════════════════════════════════════════════════════════

export function listPendingHoursReports(entries: HoursEntry[]): HoursEntry[] {
  return entries
    .filter(e => e.status === 'SUBMITTED' || e.status === 'DRAFT')
    .sort(byDateAsc(e => e.date));
}

// ════════════════════════════════════════════════════════════════════════════
// 8b. Operations command center helper exports
//     (countOpenConflicts, listTodayEvents, countPendingHoursReports)
// ════════════════════════════════════════════════════════════════════════════

export type OperationsActor = 'admin' | 'finance' | 'teacher' | 'member' | 'anonymous';
export type OperationsCardSeverity = 'critical' | 'warning' | 'info';
export type OperationsCardAccessReason = 'ALLOWED' | 'ROLE_DENIED' | 'BLOCKED_SOURCE';
export type OperationsCardStatus = 'READY' | 'EMPTY' | 'DENIED' | 'BLOCKED' | 'STALE_SOURCE';

export type OperationsCardSource =
  | 'openConflicts'
  | 'openInboxItems'
  | 'pendingHoursReports'
  | 'importHealth'
  | 'reportHealth'
  | 'todayEvents'
  | 'absenceImpact'
  | 'assessmentDelivery'
  | 'publicEndpointHealth'
  | 'consentRevocation'
  | 'instrumentDepositRefunds'
  | 'hrEvaluations'
  | 'rolloverCopyHealth';

export interface OperationsTodayEventsOptions {
  timeZone: string;
  /** Pass either a local org date or a timestamp; no helper reads the clock. */
  date?: IsoDate;
  now?: IsoTimestamp;
  includeHidden?: boolean;
  includeCanceled?: boolean;
}

export interface OperationsCardAccess {
  source: OperationsCardSource;
  severity: OperationsCardSeverity;
  allowed: boolean;
  reason: OperationsCardAccessReason;
  financeAllowed: boolean;
  revealCounts: boolean;
  revealSourceIds: boolean;
  blockedDecisionIds: string[];
}

export interface OperationsSourceReference {
  id: string;
  exists: boolean;
  stale: boolean;
}

export interface OperationsCardModel {
  id: string;
  source: OperationsCardSource;
  sourceModuleId: string;
  labelKey: string;
  severity: OperationsCardSeverity;
  status: OperationsCardStatus;
  accessReason: OperationsCardAccessReason;
  count: number | null;
  sourceIds: string[];
  sourceReferences: OperationsSourceReference[];
  sourceUpdatedAt: IsoTimestamp | null;
  blockedDecisionIds: string[];
  routeTarget: string | null;
}

export interface OperationsSnapshotSources {
  events?: CalendarEvent[];
  hoursEntries?: HoursEntry[];
  adminInboxItems?: AdminInboxItem[];
  reportDefinitions?: ReportDefinition[];
  importSessions?: ImportSession[];
}

export interface OperationsSnapshotOptions extends OperationsTodayEventsOptions {
  orgId: string;
  actor: OperationsActor;
  generatedAt: IsoTimestamp;
  includeBlockedCards?: boolean;
  includeDeniedCards?: boolean;
  existingSourceIds?: Partial<Record<OperationsCardSource, Iterable<string>>>;
}

export interface OperationsSnapshot {
  orgId: string;
  actor: OperationsActor;
  generatedAt: IsoTimestamp;
  dateWindow: {
    date: IsoDate;
    timeZone: string;
  };
  cards: OperationsCardModel[];
}

interface OperationsCardAccessDefinition {
  source: OperationsCardSource;
  severity: OperationsCardSeverity;
  financeAllowed: boolean;
  blockedDecisionIds: readonly string[];
}

const OPERATIONS_CARD_ACCESS_DEFINITIONS: readonly OperationsCardAccessDefinition[] = [
  { source: 'openConflicts', severity: 'critical', financeAllowed: false, blockedDecisionIds: [] },
  { source: 'absenceImpact', severity: 'critical', financeAllowed: false, blockedDecisionIds: ['D-21'] },
  { source: 'openInboxItems', severity: 'warning', financeAllowed: false, blockedDecisionIds: [] },
  { source: 'importHealth', severity: 'warning', financeAllowed: false, blockedDecisionIds: [] },
  { source: 'pendingHoursReports', severity: 'warning', financeAllowed: true, blockedDecisionIds: [] },
  { source: 'assessmentDelivery', severity: 'warning', financeAllowed: false, blockedDecisionIds: ['D-22'] },
  { source: 'publicEndpointHealth', severity: 'warning', financeAllowed: false, blockedDecisionIds: ['D-23'] },
  { source: 'consentRevocation', severity: 'warning', financeAllowed: false, blockedDecisionIds: ['D-24'] },
  { source: 'instrumentDepositRefunds', severity: 'warning', financeAllowed: false, blockedDecisionIds: ['D-25'] },
  { source: 'hrEvaluations', severity: 'warning', financeAllowed: false, blockedDecisionIds: ['D-26'] },
  { source: 'rolloverCopyHealth', severity: 'warning', financeAllowed: false, blockedDecisionIds: ['D-27'] },
  { source: 'reportHealth', severity: 'info', financeAllowed: true, blockedDecisionIds: [] },
  { source: 'todayEvents', severity: 'info', financeAllowed: false, blockedDecisionIds: [] },
];

const OPERATIONS_CARD_SEVERITY_RANK: Record<OperationsCardSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function instantDateInTimeZone(iso: string, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function resolveOperationsDate(options: OperationsTodayEventsOptions): IsoDate {
  if (options.date) return options.date;
  if (options.now) return instantDateInTimeZone(options.now, options.timeZone);
  throw new Error('listTodayEvents requires either options.date or options.now');
}

const OPERATIONS_CARD_META: Record<OperationsCardSource, { sourceModuleId: string; routeTarget: string | null }> = {
  openConflicts: { sourceModuleId: 'calendar-schedule-engine', routeTarget: 'CALENDAR' },
  openInboxItems: { sourceModuleId: 'operations-command-center', routeTarget: 'ADMIN_INBOX' },
  importHealth: { sourceModuleId: 'import-export-data-portability', routeTarget: 'MANAGE' },
  pendingHoursReports: { sourceModuleId: 'payroll-salaries-hours', routeTarget: 'PAYROLL' },
  reportHealth: { sourceModuleId: 'reports-analytics', routeTarget: 'ANALYTICS' },
  todayEvents: { sourceModuleId: 'calendar-schedule-engine', routeTarget: 'CALENDAR' },
  absenceImpact: { sourceModuleId: 'rooms-absence-requests', routeTarget: null },
  assessmentDelivery: { sourceModuleId: 'exams-certificates-report-cards', routeTarget: null },
  publicEndpointHealth: { sourceModuleId: 'calendar-website-integrations', routeTarget: null },
  consentRevocation: { sourceModuleId: 'agreements-consent', routeTarget: null },
  instrumentDepositRefunds: { sourceModuleId: 'instrument-inventory', routeTarget: null },
  hrEvaluations: { sourceModuleId: 'teacher-evaluation-hr', routeTarget: null },
  rolloverCopyHealth: { sourceModuleId: 'year-rollover-setup', routeTarget: null },
};

function latestIso(values: readonly (string | null | undefined)[]): IsoTimestamp | null {
  const sorted = values.filter((value): value is string => Boolean(value)).sort();
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

function latestEventUpdate(events: readonly CalendarEvent[]): IsoTimestamp | null {
  return latestIso(events.map(event => event.audit?.updatedAt ?? event.audit?.createdAt ?? event.end ?? event.start));
}

function appTimestampishToIso(value: unknown): IsoTimestamp | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const timestamp = value as { seconds?: unknown; nanoseconds?: unknown };
  if (typeof timestamp.seconds !== 'number') return null;
  const nanos = typeof timestamp.nanoseconds === 'number' ? timestamp.nanoseconds : 0;
  return new Date(timestamp.seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString();
}

function buildOperationsCard(
  access: OperationsCardAccess,
  data: {
    count: number;
    sourceIds: string[];
    sourceUpdatedAt: IsoTimestamp | null;
    existingSourceIds?: Iterable<string>;
  },
): OperationsCardModel {
  const meta = OPERATIONS_CARD_META[access.source];
  const sourceIds = access.revealSourceIds ? [...data.sourceIds].sort() : [];
  const sourceReferences = access.revealSourceIds
    ? resolveOperationsSourceReferences(sourceIds, data.existingSourceIds ?? sourceIds)
    : [];
  const hasStaleSources = sourceReferences.some(reference => reference.stale);
  const status: OperationsCardStatus = hasStaleSources
    ? 'STALE_SOURCE'
    : data.count > 0
      ? 'READY'
      : 'EMPTY';
  return {
    id: `operations:${access.source}`,
    source: access.source,
    sourceModuleId: meta.sourceModuleId,
    labelKey: `operations.cards.${access.source}`,
    severity: access.severity,
    status,
    accessReason: access.reason,
    count: access.revealCounts ? data.count : null,
    sourceIds,
    sourceReferences,
    sourceUpdatedAt: access.revealSourceIds ? data.sourceUpdatedAt : null,
    blockedDecisionIds: [...access.blockedDecisionIds],
    routeTarget: meta.routeTarget,
  };
}

function buildUnavailableOperationsCard(
  access: OperationsCardAccess,
): OperationsCardModel {
  const meta = OPERATIONS_CARD_META[access.source];
  return {
    id: `operations:${access.source}`,
    source: access.source,
    sourceModuleId: meta.sourceModuleId,
    labelKey: `operations.cards.${access.source}`,
    severity: access.severity,
    status: access.reason === 'BLOCKED_SOURCE' ? 'BLOCKED' : 'DENIED',
    accessReason: access.reason,
    count: null,
    sourceIds: [],
    sourceReferences: [],
    sourceUpdatedAt: null,
    blockedDecisionIds: [...access.blockedDecisionIds],
    routeTarget: meta.routeTarget,
  };
}

export function countOpenConflicts(events: CalendarEvent[]): number {
  return detectRoomConflicts(events).length;
}

export function listTodayEvents(
  events: CalendarEvent[],
  options: OperationsTodayEventsOptions,
): CalendarEvent[] {
  const targetDate = resolveOperationsDate(options);
  return events
    .filter(event => options.includeHidden || !event.isHidden)
    .filter(event => options.includeCanceled || !event.isCanceled)
    .filter(event => instantDateInTimeZone(event.start, options.timeZone) === targetDate)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime() || a.id.localeCompare(b.id));
}

export function countPendingHoursReports(entries: HoursEntry[]): number {
  return listPendingHoursReports(entries).length;
}

export function getOperationsCardAccess(
  source: OperationsCardSource,
  actor: OperationsActor,
): OperationsCardAccess {
  const definition = OPERATIONS_CARD_ACCESS_DEFINITIONS.find(entry => entry.source === source);
  if (!definition) {
    throw new Error(`Unknown operations card source: ${source}`);
  }

  if (definition.blockedDecisionIds.length > 0) {
    return {
      source,
      severity: definition.severity,
      allowed: false,
      reason: 'BLOCKED_SOURCE',
      financeAllowed: definition.financeAllowed,
      revealCounts: false,
      revealSourceIds: false,
      blockedDecisionIds: [...definition.blockedDecisionIds],
    };
  }

  const allowed = actor === 'admin' || (actor === 'finance' && definition.financeAllowed);
  return {
    source,
    severity: definition.severity,
    allowed,
    reason: allowed ? 'ALLOWED' : 'ROLE_DENIED',
    financeAllowed: definition.financeAllowed,
    revealCounts: allowed,
    revealSourceIds: allowed,
    blockedDecisionIds: [],
  };
}

export function listOperationsCardAccess(
  actor: OperationsActor,
  options: { allowedOnly?: boolean } = {},
): OperationsCardAccess[] {
  return OPERATIONS_CARD_ACCESS_DEFINITIONS
    .map(definition => getOperationsCardAccess(definition.source, actor))
    .filter(access => !options.allowedOnly || access.allowed)
    .sort((a, b) =>
      OPERATIONS_CARD_SEVERITY_RANK[a.severity] - OPERATIONS_CARD_SEVERITY_RANK[b.severity] ||
      a.source.localeCompare(b.source)
    );
}

export function resolveOperationsSourceReferences(
  sourceIds: readonly string[],
  existingSourceIds: Iterable<string>,
): OperationsSourceReference[] {
  const existing = new Set(existingSourceIds);
  return [...sourceIds]
    .sort()
    .map(id => ({
      id,
      exists: existing.has(id),
      stale: !existing.has(id),
    }));
}

export function buildOperationsSnapshot(
  sources: OperationsSnapshotSources,
  options: OperationsSnapshotOptions,
): OperationsSnapshot {
  const date = resolveOperationsDate(options);
  const cards: OperationsCardModel[] = [];
  const includeBlockedCards = options.includeBlockedCards ?? (options.actor === 'admin' || options.actor === 'finance');
  const includeDeniedCards = options.includeDeniedCards ?? false;

  for (const access of listOperationsCardAccess(options.actor)) {
    if (!access.allowed) {
      if ((access.reason === 'BLOCKED_SOURCE' && includeBlockedCards) ||
        (access.reason === 'ROLE_DENIED' && includeDeniedCards)) {
        cards.push(buildUnavailableOperationsCard(access));
      }
      continue;
    }

    if (access.source === 'openConflicts') {
      const conflicts = detectRoomConflicts(sources.events ?? []);
      const sourceIds = [...getConflictingEventIds(conflicts)];
      const sourceEvents = (sources.events ?? []).filter(event => sourceIds.includes(event.id));
      cards.push(buildOperationsCard(access, {
        count: conflicts.length,
        sourceIds,
        sourceUpdatedAt: latestEventUpdate(sourceEvents),
        existingSourceIds: options.existingSourceIds?.openConflicts,
      }));
      continue;
    }

    if (access.source === 'todayEvents') {
      const todayEvents = listTodayEvents(sources.events ?? [], options);
      cards.push(buildOperationsCard(access, {
        count: todayEvents.length,
        sourceIds: todayEvents.map(event => event.id),
        sourceUpdatedAt: latestEventUpdate(todayEvents),
        existingSourceIds: options.existingSourceIds?.todayEvents,
      }));
      continue;
    }

    if (access.source === 'openInboxItems') {
      const openItems = (sources.adminInboxItems ?? [])
        .filter(item => item.status === 'OPEN')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      cards.push(buildOperationsCard(access, {
        count: openItems.length,
        sourceIds: openItems.map(item => item.id),
        sourceUpdatedAt: latestIso(openItems.map(item => item.markedDoneAt ?? item.decidedAt ?? item.createdAt)),
        existingSourceIds: options.existingSourceIds?.openInboxItems,
      }));
      continue;
    }

    if (access.source === 'pendingHoursReports') {
      const pending = listPendingHoursReports(sources.hoursEntries ?? []);
      cards.push(buildOperationsCard(access, {
        count: pending.length,
        sourceIds: pending.map(entry => entry.id),
        sourceUpdatedAt: latestIso(pending.map(entry => entry.updatedAt ?? entry.createdAt)),
        existingSourceIds: options.existingSourceIds?.pendingHoursReports,
      }));
      continue;
    }

    if (access.source === 'importHealth') {
      const attentionStatuses = new Set(['PENDING', 'REVIEWING', 'IMPORTING', 'COMPLETED_WITH_ERRORS']);
      const sessions = (sources.importSessions ?? [])
        .filter(session => attentionStatuses.has(session.status))
        .sort((a, b) => {
          const aUpdated = appTimestampishToIso(a.updatedAt) ?? '';
          const bUpdated = appTimestampishToIso(b.updatedAt) ?? '';
          return bUpdated.localeCompare(aUpdated) || a.id.localeCompare(b.id);
        });
      cards.push(buildOperationsCard(access, {
        count: sessions.length,
        sourceIds: sessions.map(session => session.id),
        sourceUpdatedAt: latestIso(sessions.map(session => appTimestampishToIso(session.updatedAt) ?? appTimestampishToIso(session.createdAt))),
        existingSourceIds: options.existingSourceIds?.importHealth,
      }));
      continue;
    }

    if (access.source === 'reportHealth') {
      const reportActor: ReportActor = options.actor === 'finance' ? 'finance' : 'admin';
      const visibleDefinitions = (sources.reportDefinitions ?? [])
        .filter(definition => getReportSourceAccess(definition.sourceEntity, reportActor).allowed)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id));
      cards.push(buildOperationsCard(access, {
        count: visibleDefinitions.length,
        sourceIds: visibleDefinitions.map(definition => definition.id),
        sourceUpdatedAt: latestIso(visibleDefinitions.map(definition => definition.updatedAt ?? definition.createdAt)),
        existingSourceIds: options.existingSourceIds?.reportHealth,
      }));
    }
  }

  return {
    orgId: options.orgId,
    actor: options.actor,
    generatedAt: options.generatedAt,
    dateWindow: {
      date,
      timeZone: options.timeZone,
    },
    cards: cards.sort((a, b) =>
      OPERATIONS_CARD_SEVERITY_RANK[a.severity] - OPERATIONS_CARD_SEVERITY_RANK[b.severity] ||
      a.source.localeCompare(b.source)
    ),
  };
}

export interface HoursReconciliation {
  staffMemberId: string;
  reportedMinutes: number;
  calendarMinutes: number;
  varianceMinutes: number; // reported - calendar
  entries: number;
  sourceEntryIds: string[]; // lineage
  matchesCalendar: boolean;
}

/**
 * Reconciles reported hours against calendar-derived participation minutes.
 * Calendar minutes are recomputed from events + participants (source of truth),
 * not trusted from the entry, so the variance is auditable.
 */
export function compareReportedVsCalendarHours(
  staffMemberId: string,
  entries: HoursEntry[],
  events: MinimalEvent[],
  participants: MinimalParticipant[],
): HoursReconciliation {
  const mine = entries.filter(e => e.staffMemberId === staffMemberId);
  const reportedMinutes = mine.reduce((sum, e) => sum + e.reportedMinutes, 0);

  const eventById = new Map(events.map(e => [e.id, e]));
  const myEventIds = new Set(
    participants.filter(p => p.staffMemberId === staffMemberId).map(p => p.eventId),
  );
  let calendarMinutes = 0;
  myEventIds.forEach(eid => {
    const ev = eventById.get(eid);
    if (ev && typeof ev.durationMinutes === 'number') calendarMinutes += ev.durationMinutes;
  });

  return {
    staffMemberId,
    reportedMinutes,
    calendarMinutes,
    varianceMinutes: reportedMinutes - calendarMinutes,
    entries: mine.length,
    sourceEntryIds: mine.map(e => e.id),
    matchesCalendar: reportedMinutes === calendarMinutes,
  };
}

export interface PayslipRow {
  staffMemberId: string;
  date: IsoDate;
  hours: number;
  rate: number;
  amount: number;
  sourceEntryId: string;
}

export type PayrollRateSource =
  | 'ADMIN_OVERRIDE'
  | 'TEACHING_ASSIGNMENT'
  | 'ORG_ROLE'
  | 'STAFF_DEFAULT'
  | 'ORG_DEFAULT';

export interface PayrollRateResolution {
  rate: number | null;
  source: PayrollRateSource | 'NONE';
  sourceId: string | null;
}

export interface PayrollRatePolicy {
  adminOverrideRate?: number | null;
  teachingAssignmentRates?: Array<{ teachingAssignmentId: string; rate: number | null | undefined }>;
  orgRoleRates?: Array<{ orgRoleId: string; rate: number | null | undefined }>;
  staffDefaultRates?: Array<{ staffMemberId: string; rate: number | null | undefined }>;
  orgDefaultRate?: number | null;
}

function validPayrollRate(rate: number | null | undefined): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0;
}

/**
 * D-19 rate resolution for approval-time stamping.
 * The existing entry.rate may be a draft estimate, so it is intentionally not
 * considered final unless the caller passes an explicit admin override.
 */
export function resolveHoursEntryPayRate(
  entry: HoursEntry,
  policy: PayrollRatePolicy,
): PayrollRateResolution {
  if (validPayrollRate(policy.adminOverrideRate)) {
    return { rate: policy.adminOverrideRate, source: 'ADMIN_OVERRIDE', sourceId: entry.id };
  }

  if (entry.teachingAssignmentId) {
    const assignmentRate = policy.teachingAssignmentRates
      ?.find(r => r.teachingAssignmentId === entry.teachingAssignmentId);
    if (assignmentRate && validPayrollRate(assignmentRate.rate)) {
      return {
        rate: assignmentRate.rate,
        source: 'TEACHING_ASSIGNMENT',
        sourceId: entry.teachingAssignmentId,
      };
    }
  }

  if (entry.orgRoleId) {
    const orgRoleRate = policy.orgRoleRates?.find(r => r.orgRoleId === entry.orgRoleId);
    if (orgRoleRate && validPayrollRate(orgRoleRate.rate)) {
      return { rate: orgRoleRate.rate, source: 'ORG_ROLE', sourceId: entry.orgRoleId };
    }
  }

  const staffRate = policy.staffDefaultRates?.find(r => r.staffMemberId === entry.staffMemberId);
  if (staffRate && validPayrollRate(staffRate.rate)) {
    return { rate: staffRate.rate, source: 'STAFF_DEFAULT', sourceId: entry.staffMemberId };
  }

  if (validPayrollRate(policy.orgDefaultRate)) {
    return { rate: policy.orgDefaultRate, source: 'ORG_DEFAULT', sourceId: null };
  }

  return { rate: null, source: 'NONE', sourceId: null };
}

export function stampHoursEntryPayRate(
  entry: HoursEntry,
  policy: PayrollRatePolicy,
): HoursEntry {
  const resolution = resolveHoursEntryPayRate(entry, policy);
  if (resolution.rate === null) {
    throw new Error(`No payroll rate configured for hours entry ${entry.id}`);
  }
  return { ...entry, rate: resolution.rate };
}

/** Deterministic payslip rows from approved hours entries (rate × hours). */
export function calculatePayslipRows(entries: HoursEntry[]): PayslipRow[] {
  return entries
    .filter(e => e.status === 'APPROVED' || e.status === 'PAID')
    .filter(e => typeof e.rate === 'number')
    .map(e => {
      const hours = e.reportedMinutes / 60;
      const rate = e.rate as number;
      return {
        staffMemberId: e.staffMemberId,
        date: e.date,
        hours: Math.round(hours * 100) / 100,
        rate,
        amount: Math.round(hours * rate * 100) / 100,
        sourceEntryId: e.id,
      };
    })
    .sort(byDateAsc(r => r.date));
}

// ════════════════════════════════════════════════════════════════════════════
// 9. Payments / charges / ledger  (listOpenBalances, listPaymentsByFamily,
//    reconcileEnrollmentCharges)
// ════════════════════════════════════════════════════════════════════════════

export interface OpenBalance {
  partyId: string; // studentId or familyId
  scope: 'STUDENT' | 'FAMILY';
  currency: string;
  totalCharged: number;
  totalPaid: number;
  totalAdjusted: number;
  balance: number;
  openChargeIds: string[];
}

function assertSameLedgerCurrency(
  current: string,
  next: string,
  context: { scope: 'STUDENT' | 'FAMILY' | 'ENROLLMENT'; id: string },
): void {
  if (current !== next) {
    throw new Error(`Mixed currencies for ${context.scope.toLowerCase()} ledger ${context.id}: ${current} and ${next}`);
  }
}

/** Computes per-party open balances. balance = charged + adjusted - paid. */
export function listOpenBalances(
  charges: Charge[],
  payments: Payment[],
  adjustments: Adjustment[],
  scope: 'STUDENT' | 'FAMILY' = 'FAMILY',
): OpenBalance[] {
  const key = (x: { studentId?: string | null; familyId?: string | null }) =>
    scope === 'STUDENT' ? x.studentId ?? null : x.familyId ?? null;

  const map = new Map<string, OpenBalance>();
  const openChargeSortKeys = new Map<string, string>();
  const ensure = (id: string, currency: string): OpenBalance => {
    let b = map.get(id);
    if (!b) {
      b = { partyId: id, scope, currency, totalCharged: 0, totalPaid: 0, totalAdjusted: 0, balance: 0, openChargeIds: [] };
      map.set(id, b);
    } else {
      assertSameLedgerCurrency(b.currency, currency, { scope, id });
    }
    return b;
  };

  for (const c of charges) {
    const id = key(c);
    if (!id || c.status === 'VOID') continue;
    const b = ensure(id, c.currency);
    b.totalCharged += c.amount;
    if (c.status !== 'PAID') {
      b.openChargeIds.push(c.id);
      openChargeSortKeys.set(c.id, `${c.dueDate ?? '9999-12-31'}:${c.id}`);
    }
  }
  for (const p of payments) {
    const id = key(p);
    if (!id) continue;
    ensure(id, p.currency).totalPaid += p.amount;
  }
  for (const a of adjustments) {
    const id = key(a);
    if (!id) continue;
    ensure(id, a.currency).totalAdjusted += a.amount;
  }
  const out = Array.from(map.values());
  out.forEach(b => {
    b.totalCharged = roundMoney(b.totalCharged);
    b.totalPaid = roundMoney(b.totalPaid);
    b.totalAdjusted = roundMoney(b.totalAdjusted);
    b.balance = roundMoney(b.totalCharged + b.totalAdjusted - b.totalPaid);
    b.openChargeIds.sort((a, bId) => (openChargeSortKeys.get(a) ?? a).localeCompare(openChargeSortKeys.get(bId) ?? bId));
  });
  return out
    .filter(b => b.balance !== 0 || b.openChargeIds.length > 0)
    .sort((a, b) => b.balance - a.balance || a.partyId.localeCompare(b.partyId));
}

export function listPaymentsByFamily(payments: Payment[], familyId: string): Payment[] {
  return payments
    .filter(p => p.familyId === familyId)
    .sort(byDateAscThenId(p => p.receivedAt));
}

export interface EnrollmentReconciliation {
  enrollmentId: string;
  charges: Charge[];
  payments: Payment[];
  totalCharged: number;
  totalPaid: number;
  totalAdjusted: number;
  balance: number;
  expectedCharged: number;
  matches: boolean;
  missingPeriods: string[];
  paymentIds: string[];
  ambiguousPaymentIds: string[];
}

/**
 * Checks that an enrollment's charges cover the expected billing periods.
 * `expectedPeriods` is passed in (deterministic — no calendar guessing here).
 * Payment amounts are counted only when every applied charge belongs to this
 * enrollment; cross-enrollment payment allocations are exposed as ambiguous so
 * callers do not silently assign one payment amount to multiple ledgers.
 */
export function reconcileEnrollmentCharges(
  enrollmentId: string,
  charges: Charge[],
  expectedPeriods: { label: string; amount: number }[],
  payments: Payment[] = [],
  adjustments: Adjustment[] = [],
): EnrollmentReconciliation {
  const mine = charges.filter(c => c.enrollmentId === enrollmentId && c.status !== 'VOID');
  const sortedCharges = mine.sort(byDateAscThenId(c => c.dueDate));
  const chargeIds = new Set(mine.map(c => c.id));
  const currency = mine[0]?.currency ?? null;
  if (currency) {
    for (const c of mine) {
      assertSameLedgerCurrency(currency, c.currency, { scope: 'ENROLLMENT', id: enrollmentId });
    }
  }

  const relatedPayments = payments
    .filter(p => p.appliedChargeIds.some(chargeId => chargeIds.has(chargeId)))
    .sort(byDateAscThenId(p => p.receivedAt));
  const scopedPayments = relatedPayments.filter(p => p.appliedChargeIds.every(chargeId => chargeIds.has(chargeId)));
  const ambiguousPaymentIds = relatedPayments
    .filter(p => !p.appliedChargeIds.every(chargeId => chargeIds.has(chargeId)))
    .map(p => p.id);
  const relatedAdjustments = adjustments
    .filter(a => a.chargeId != null && chargeIds.has(a.chargeId))
    .sort(byDateAscThenId(a => a.createdAt));

  if (currency) {
    for (const p of relatedPayments) {
      assertSameLedgerCurrency(currency, p.currency, { scope: 'ENROLLMENT', id: enrollmentId });
    }
    for (const a of relatedAdjustments) {
      assertSameLedgerCurrency(currency, a.currency, { scope: 'ENROLLMENT', id: enrollmentId });
    }
  }

  const totalCharged = mine.reduce((s, c) => s + c.amount, 0);
  const totalPaid = scopedPayments.reduce((s, p) => s + p.amount, 0);
  const totalAdjusted = relatedAdjustments.reduce((s, a) => s + a.amount, 0);
  const expectedCharged = expectedPeriods.reduce((s, p) => s + p.amount, 0);
  const presentLabels = new Set(mine.map(c => c.periodLabel).filter(Boolean));
  const missingPeriods = expectedPeriods
    .filter(p => !presentLabels.has(p.label))
    .map(p => p.label);
  return {
    enrollmentId,
    charges: sortedCharges,
    payments: relatedPayments,
    totalCharged: roundMoney(totalCharged),
    totalPaid: roundMoney(totalPaid),
    totalAdjusted: roundMoney(totalAdjusted),
    balance: roundMoney(totalCharged + totalAdjusted - totalPaid),
    expectedCharged: roundMoney(expectedCharged),
    matches: missingPeriods.length === 0 && roundMoney(totalCharged) === roundMoney(expectedCharged),
    missingPeriods,
    paymentIds: relatedPayments.map(p => p.id),
    ambiguousPaymentIds,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 10. Agreements / consent  (listUnsignedAgreements, getAgreementHistory,
//     findAgreementByEnrollment)
// ════════════════════════════════════════════════════════════════════════════

export interface UnsignedAgreement {
  template: AgreementTemplate;
  studentId: string | null;
  familyId: string | null;
  enrollmentId: string | null;
  guardianId: string | null;
  reason: 'NEVER_ACCEPTED' | 'SUPERSEDED_VERSION';
}

export interface RequiredAgreementTarget {
  studentId: string | null;
  familyId?: string | null;
  enrollmentId?: string | null;
  guardianId?: string | null;
  templateId?: string | null;
  kind?: AgreementTemplate['kind'] | null;
}

function normalizeAgreementTargets(targets: string[] | RequiredAgreementTarget[]): RequiredAgreementTarget[] {
  return targets.map(target => typeof target === 'string' ? { studentId: target } : target);
}

function agreementTargetApplies(template: AgreementTemplate, target: RequiredAgreementTarget): boolean {
  if (target.templateId && target.templateId !== template.id) return false;
  if (target.kind && target.kind !== template.kind) return false;
  return true;
}

function agreementMatchesTarget(acceptance: AgreementAcceptance, target: RequiredAgreementTarget): boolean {
  if (target.studentId !== null && target.studentId !== undefined && acceptance.studentId !== target.studentId) return false;
  if (target.familyId !== null && target.familyId !== undefined && acceptance.familyId !== target.familyId) return false;
  if (target.enrollmentId !== null && target.enrollmentId !== undefined && acceptance.enrollmentId !== target.enrollmentId) return false;
  if (target.guardianId !== null && target.guardianId !== undefined && acceptance.guardianId !== target.guardianId) return false;
  return target.studentId !== undefined || target.familyId !== undefined || target.enrollmentId !== undefined || target.guardianId !== undefined;
}

function agreementTargetSortKey(target: UnsignedAgreement): string {
  return [
    target.studentId ?? '',
    target.familyId ?? '',
    target.enrollmentId ?? '',
    target.guardianId ?? '',
  ].join('|');
}

function agreementDateDescThenId(a: AgreementAcceptance, b: AgreementAcceptance): number {
  const dateCompare = (b.acceptedAt ?? b.createdAt).localeCompare(a.acceptedAt ?? a.createdAt);
  return dateCompare || a.id.localeCompare(b.id);
}

/**
 * For each active template, finds students who have no current acceptance of the
 * active version. String inputs preserve the legacy student-scoped call shape;
 * target inputs support family/enrollment agreement requirements.
 */
export function listUnsignedAgreements(
  templates: AgreementTemplate[],
  acceptances: AgreementAcceptance[],
  requiredTargets: string[] | RequiredAgreementTarget[],
): UnsignedAgreement[] {
  const active = templates.filter(t => t.isActive);
  const targets = normalizeAgreementTargets(requiredTargets);
  const out: UnsignedAgreement[] = [];
  for (const t of active) {
    for (const target of targets) {
      if (!agreementTargetApplies(t, target)) continue;
      const current = acceptances.find(a =>
        a.templateId === t.id &&
        agreementMatchesTarget(a, target) &&
        a.status === 'ACCEPTED' &&
        a.templateVersion === t.version);
      if (current) continue;
      const older = acceptances.find(a =>
        a.templateId === t.id &&
        agreementMatchesTarget(a, target) &&
        (a.status === 'ACCEPTED' || a.status === 'SUPERSEDED') &&
        a.templateVersion < t.version);
      out.push({
        template: t,
        studentId: target.studentId ?? null,
        familyId: target.familyId ?? null,
        enrollmentId: target.enrollmentId ?? null,
        guardianId: target.guardianId ?? null,
        reason: older ? 'SUPERSEDED_VERSION' : 'NEVER_ACCEPTED',
      });
    }
  }
  return out.sort((a, b) =>
    a.template.title.localeCompare(b.template.title) ||
    a.template.id.localeCompare(b.template.id) ||
    agreementTargetSortKey(a).localeCompare(agreementTargetSortKey(b)));
}

/** Full acceptance trail for a template (all versions/parties), newest first. */
export function getAgreementHistory(
  acceptances: AgreementAcceptance[],
  templateId: string,
): AgreementAcceptance[] {
  return acceptances
    .filter(a => a.templateId === templateId)
    .sort(agreementDateDescThenId);
}

export function findAgreementByEnrollment(
  acceptances: AgreementAcceptance[],
  enrollmentId: string,
): AgreementAcceptance[] {
  return acceptances
    .filter(a => a.enrollmentId === enrollmentId)
    .sort(agreementDateDescThenId);
}

// ════════════════════════════════════════════════════════════════════════════
// 11. Instrument inventory  (listAvailableInstruments, listOverdueLoans,
//     getInstrumentCustodyHistory)
// ════════════════════════════════════════════════════════════════════════════

export function listAvailableInstruments(
  instruments: Instrument[],
  category?: string,
): Instrument[] {
  return instruments
    .filter(i => i.status === 'AVAILABLE' && (category ? i.category === category : true))
    .sort((a, b) => a.assetTag.localeCompare(b.assetTag));
}

/** Active loans past their due date as of `now` (ISO date). */
export function listOverdueLoans(loans: InstrumentLoan[], now: IsoDate): InstrumentLoan[] {
  return loans
    .filter(l => (l.status === 'ACTIVE' || l.status === 'OVERDUE') && l.dueDate !== null && l.dueDate < now)
    .sort(byDateAsc(l => l.dueDate));
}

export interface CustodyEvent {
  at: IsoTimestamp;
  kind: 'CHECKOUT' | 'RETURN' | 'REPAIR' | 'REPAIR_RESOLVED';
  loanId: string | null;
  repairId: string | null;
  holderStudentId: string | null;
  holderStaffId: string | null;
  detail: string;
}

/** Chronological custody + repair timeline for one instrument. */
export function getInstrumentCustodyHistory(
  instrumentId: string,
  loans: InstrumentLoan[],
  repairs: InstrumentRepair[],
): CustodyEvent[] {
  const events: CustodyEvent[] = [];
  for (const l of loans.filter(x => x.instrumentId === instrumentId)) {
    events.push({
      at: l.checkedOutAt, kind: 'CHECKOUT', loanId: l.id, repairId: null,
      holderStudentId: l.borrowerStudentId, holderStaffId: l.borrowerStaffId,
      detail: `Checked out (condition ${l.conditionOut})`,
    });
    if (l.returnedAt) {
      events.push({
        at: l.returnedAt, kind: 'RETURN', loanId: l.id, repairId: null,
        holderStudentId: l.borrowerStudentId, holderStaffId: l.borrowerStaffId,
        detail: `Returned${l.conditionIn ? ` (condition ${l.conditionIn})` : ''}`,
      });
    }
  }
  for (const r of repairs.filter(x => x.instrumentId === instrumentId)) {
    events.push({ at: r.reportedAt, kind: 'REPAIR', loanId: null, repairId: r.id, holderStudentId: null, holderStaffId: null, detail: r.description });
    if (r.resolvedAt) {
      events.push({ at: r.resolvedAt, kind: 'REPAIR_RESOLVED', loanId: null, repairId: r.id, holderStudentId: null, holderStaffId: null, detail: `Resolved${r.conditionAfter ? ` (${r.conditionAfter})` : ''}` });
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

// ════════════════════════════════════════════════════════════════════════════
// 12. Teacher evaluation / HR  (listDueEvaluations, getStaffEvaluationHistory,
//     listEvaluationActions)
// ════════════════════════════════════════════════════════════════════════════

export function listDueEvaluations(evaluations: StaffEvaluation[], now: IsoDate): StaffEvaluation[] {
  return evaluations
    .filter(e => (e.status === 'DUE' || e.status === 'SCHEDULED' || e.status === 'DRAFT'))
    .filter(e => e.dueDate === null || e.dueDate <= now || e.status === 'DUE')
    .sort(byDateAsc(e => e.dueDate));
}

export function getStaffEvaluationHistory(
  evaluations: StaffEvaluation[],
  staffMemberId: string,
): StaffEvaluation[] {
  return evaluations
    .filter(e => e.staffMemberId === staffMemberId)
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
}

export interface OpenEvaluationAction extends EvaluationAction {
  evaluationId: string;
  staffMemberId: string;
}

/** Flattens incomplete actions across evaluations (the follow-up worklist). */
export function listEvaluationActions(
  evaluations: StaffEvaluation[],
  onlyOpen = true,
): OpenEvaluationAction[] {
  const out: OpenEvaluationAction[] = [];
  for (const e of evaluations) {
    for (const a of e.actions) {
      if (onlyOpen && a.done) continue;
      out.push({ ...a, evaluationId: e.id, staffMemberId: e.staffMemberId });
    }
  }
  return out.sort(byDateAsc(a => a.dueDate));
}

// ════════════════════════════════════════════════════════════════════════════
// 13. Reports / analytics  (runReportDefinition, exportReportCsv, getReportLineage)
// ════════════════════════════════════════════════════════════════════════════

export type ReportActor = 'admin' | 'finance';

export interface ReportSourceAllowlistEntry {
  sourceEntity: ReportSourceEntity;
  fields: string[];
  financeAllowed: boolean;
  blockedDecisionIds: string[];
}

export interface ReportSourceAccess {
  sourceEntity: string;
  allowed: boolean;
  reason: 'ALLOWED' | 'UNKNOWN_SOURCE' | 'BLOCKED_SOURCE' | 'FINANCE_SOURCE_NOT_ALLOWED';
  allowedFields: string[];
  blockedDecisionIds: string[];
}

export interface ReportSourceAuthorization {
  actor?: ReportActor;
  sourceEntity: string;
  authorizedSourceIds: readonly string[];
}

export class ReportDefinitionValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ReportDefinitionValidationError';
    this.code = code;
  }
}

const REPORT_SOURCE_FIELDS: Record<ReportSourceEntity, readonly string[]> = {
  events: ['id', 'name', 'date', 'durationMinutes', 'activityId', 'roomId'],
  students: ['id', 'fullName', 'familyId', 'isArchived'],
  enrollments: ['id', 'studentId', 'activityId', 'l2Id', 'status', 'startDate', 'endDate'],
  charges: ['id', 'studentId', 'familyId', 'enrollmentId', 'description', 'amount', 'currency', 'dueDate', 'status', 'periodLabel'],
  payments: ['id', 'studentId', 'familyId', 'amount', 'currency', 'method', 'receivedAt', 'reference', 'appliedChargeIds'],
  hoursEntries: ['id', 'staffMemberId', 'hoursReportId', 'date', 'reportedMinutes', 'calendarMinutes', 'eventId', 'teachingAssignmentId', 'orgRoleId', 'rate', 'status'],
  lessonRecords: ['id', 'eventId', 'studentId', 'staffMemberId', 'date', 'attendance', 'completion', 'makeupOfLessonId'],
  instruments: ['id', 'assetTag', 'name', 'category', 'brand', 'condition', 'status', 'location', 'acquiredAt', 'valueAmount'],
};

const REPORT_NUMERIC_FIELDS: Partial<Record<ReportSourceEntity, readonly string[]>> = {
  events: ['durationMinutes'],
  charges: ['amount'],
  payments: ['amount'],
  hoursEntries: ['reportedMinutes', 'calendarMinutes', 'rate'],
  instruments: ['valueAmount'],
};

const FINANCE_REPORT_SOURCES = new Set<ReportSourceEntity>(['charges', 'payments', 'hoursEntries']);

const BLOCKED_REPORT_SOURCE_DECISIONS: Record<string, readonly string[]> = {
  operationalRequests: ['D-21'],
  examSessions: ['D-22'],
  examinerSubmissions: ['D-22'],
  certificates: ['D-22'],
  reportCards: ['D-22'],
  concertPrograms: ['D-23'],
  publicEndpoints: ['D-23'],
  agreementAcceptances: ['D-24'],
  instrumentDeposits: ['D-25'],
  staffEvaluations: ['D-26'],
  rolloverRuns: ['D-27'],
};

export const REPORT_SOURCE_ALLOWLIST: ReportSourceAllowlistEntry[] = (
  Object.keys(REPORT_SOURCE_FIELDS) as ReportSourceEntity[]
).map(sourceEntity => ({
  sourceEntity,
  fields: [...REPORT_SOURCE_FIELDS[sourceEntity]],
  financeAllowed: FINANCE_REPORT_SOURCES.has(sourceEntity),
  blockedDecisionIds: [],
}));

function isReportSourceEntity(value: string): value is ReportSourceEntity {
  return Object.prototype.hasOwnProperty.call(REPORT_SOURCE_FIELDS, value);
}

export function getReportSourceAccess(
  sourceEntity: string,
  actor: ReportActor = 'admin',
): ReportSourceAccess {
  const blockedDecisionIds = BLOCKED_REPORT_SOURCE_DECISIONS[sourceEntity];
  if (blockedDecisionIds) {
    return {
      sourceEntity,
      allowed: false,
      reason: 'BLOCKED_SOURCE',
      allowedFields: [],
      blockedDecisionIds: [...blockedDecisionIds],
    };
  }
  if (!isReportSourceEntity(sourceEntity)) {
    return {
      sourceEntity,
      allowed: false,
      reason: 'UNKNOWN_SOURCE',
      allowedFields: [],
      blockedDecisionIds: [],
    };
  }
  if (actor === 'finance' && !FINANCE_REPORT_SOURCES.has(sourceEntity)) {
    return {
      sourceEntity,
      allowed: false,
      reason: 'FINANCE_SOURCE_NOT_ALLOWED',
      allowedFields: [],
      blockedDecisionIds: ['D-09'],
    };
  }
  return {
    sourceEntity,
    allowed: true,
    reason: 'ALLOWED',
    allowedFields: [...REPORT_SOURCE_FIELDS[sourceEntity]],
    blockedDecisionIds: [],
  };
}

export function listReportSourceAllowlist(actor: ReportActor = 'admin'): ReportSourceAllowlistEntry[] {
  return REPORT_SOURCE_ALLOWLIST
    .filter(entry => actor !== 'finance' || entry.financeAllowed)
    .map(entry => ({
      ...entry,
      fields: [...entry.fields],
      blockedDecisionIds: [...entry.blockedDecisionIds],
    }));
}

function assertReportField(
  sourceEntity: ReportSourceEntity,
  field: string,
  reason: string,
): void {
  if (!REPORT_SOURCE_FIELDS[sourceEntity].includes(field)) {
    throw new ReportDefinitionValidationError(
      'INVALID_REPORT_FIELD',
      `${reason} field "${field}" is not allowed for report source "${sourceEntity}".`,
    );
  }
}

function assertNumericReportField(sourceEntity: ReportSourceEntity, field: string, reason: string): void {
  assertReportField(sourceEntity, field, reason);
  if (!(REPORT_NUMERIC_FIELDS[sourceEntity] ?? []).includes(field)) {
    throw new ReportDefinitionValidationError(
      'INVALID_REPORT_AGGREGATE_FIELD',
      `${reason} field "${field}" must be numeric for report source "${sourceEntity}".`,
    );
  }
}

function assertReportFilter(sourceEntity: ReportSourceEntity, filter: ReportFilter): void {
  assertReportField(sourceEntity, filter.field, 'Filter');
  switch (filter.op) {
    case 'eq':
    case 'neq':
      return;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      if (typeof filter.value !== 'number') {
        throw new ReportDefinitionValidationError('INVALID_REPORT_FILTER_VALUE', `Filter "${filter.field}" requires a numeric value.`);
      }
      return;
    case 'in':
      if (!Array.isArray(filter.value)) {
        throw new ReportDefinitionValidationError('INVALID_REPORT_FILTER_VALUE', `Filter "${filter.field}" requires an array value.`);
      }
      return;
    case 'contains':
      if (typeof filter.value !== 'string') {
        throw new ReportDefinitionValidationError('INVALID_REPORT_FILTER_VALUE', `Filter "${filter.field}" requires a text value.`);
      }
      return;
    default:
      throw new ReportDefinitionValidationError('INVALID_REPORT_FILTER_OPERATOR', `Filter operator "${String(filter.op)}" is not allowed.`);
  }
}

export interface ReportDefinitionValidationOptions {
  actor?: ReportActor;
}

export function validateReportDefinition(
  def: ReportDefinition,
  opts: ReportDefinitionValidationOptions = {},
): ReportSourceAccess {
  const sourceEntity = String(def.sourceEntity);
  const access = getReportSourceAccess(sourceEntity, opts.actor ?? 'admin');
  if (!access.allowed) {
    throw new ReportDefinitionValidationError(
      'REPORT_SOURCE_NOT_ALLOWED',
      `Report source "${sourceEntity}" is not allowed: ${access.reason}.`,
    );
  }
  if (!isReportSourceEntity(sourceEntity)) {
    throw new ReportDefinitionValidationError('REPORT_SOURCE_NOT_ALLOWED', `Report source "${sourceEntity}" is not configured.`);
  }

  for (const c of def.columns) assertReportField(sourceEntity, c, 'Column');
  for (const f of def.filters) assertReportFilter(sourceEntity, f);
  if (def.groupBy) assertReportField(sourceEntity, def.groupBy, 'Group');

  switch (def.aggregate.fn) {
    case 'none':
    case 'count':
      if (def.aggregate.field) assertReportField(sourceEntity, def.aggregate.field, 'Aggregate');
      break;
    case 'sum':
    case 'avg':
    case 'min':
    case 'max':
      if (!def.aggregate.field) {
        throw new ReportDefinitionValidationError('INVALID_REPORT_AGGREGATE_FIELD', `Aggregate "${def.aggregate.fn}" requires a field.`);
      }
      assertNumericReportField(sourceEntity, def.aggregate.field, 'Aggregate');
      break;
    default:
      throw new ReportDefinitionValidationError('INVALID_REPORT_AGGREGATE_FN', `Aggregate "${String(def.aggregate.fn)}" is not allowed.`);
  }

  return access;
}

function normalizeFilterValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

function matchesFilter(row: Record<string, unknown>, f: ReportFilter): boolean {
  const v = normalizeFilterValue(row[f.field]);
  const filterValue = normalizeFilterValue(f.value);
  switch (f.op) {
    case 'eq': return v === filterValue;
    case 'neq': return v !== filterValue;
    case 'gt': return typeof v === 'number' && v > (filterValue as number);
    case 'gte': return typeof v === 'number' && v >= (filterValue as number);
    case 'lt': return typeof v === 'number' && v < (filterValue as number);
    case 'lte': return typeof v === 'number' && v <= (filterValue as number);
    case 'in': return Array.isArray(filterValue) && (filterValue as Array<unknown>).map(normalizeFilterValue).includes(v);
    case 'contains': return typeof v === 'string' && v.toLowerCase().includes(String(filterValue).toLowerCase());
    default: return false;
  }
}

function reportGroupKey(value: unknown): string {
  return value === null || value === undefined || value === '' ? '∅' : String(value);
}

export interface ReportResult {
  definitionId: string;
  sourceEntity: ReportSourceEntity;
  runActor: ReportActor;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  groups: Array<{ key: string; value: number; count: number; sourceIds: string[] }>;
  totalRows: number;
  sourceIds: string[]; // lineage: ids of every source row included
  sourceAuthorization: {
    actor: ReportActor;
    sourceEntity: ReportSourceEntity;
    sourceIds: string[];
  } | null;
}

export interface RunReportDefinitionOptions {
  actor?: ReportActor;
  sourceAuthorization?: ReportSourceAuthorization;
}

function assertReportRowsAuthorized(
  def: ReportDefinition,
  rows: Array<Record<string, unknown> & { id: string }>,
  actor: ReportActor,
  sourceAuthorization?: ReportSourceAuthorization,
): void {
  if (actor === 'finance' && !sourceAuthorization) {
    throw new ReportDefinitionValidationError(
      'REPORT_SOURCE_AUTHORIZATION_REQUIRED',
      `Finance report "${def.id}" requires explicit source-row authorization before run/export.`,
    );
  }
  if (!sourceAuthorization) return;

  if (sourceAuthorization.actor && sourceAuthorization.actor !== actor) {
    throw new ReportDefinitionValidationError(
      'REPORT_SOURCE_AUTHORIZATION_MISMATCH',
      `Report source authorization was prepared for "${sourceAuthorization.actor}", not "${actor}".`,
    );
  }
  if (sourceAuthorization.sourceEntity !== def.sourceEntity) {
    throw new ReportDefinitionValidationError(
      'REPORT_SOURCE_AUTHORIZATION_MISMATCH',
      `Report source authorization covers "${sourceAuthorization.sourceEntity}", not "${def.sourceEntity}".`,
    );
  }

  const authorizedIds = new Set(sourceAuthorization.authorizedSourceIds);
  const deniedIds = rows.map(row => row.id).filter(id => !authorizedIds.has(id));
  if (deniedIds.length) {
    throw new ReportDefinitionValidationError(
      'REPORT_SOURCE_ROW_NOT_AUTHORIZED',
      `Report source rows are not authorized for "${def.sourceEntity}": ${deniedIds.sort().join(', ')}.`,
    );
  }
}

/**
 * Runs a declarative ReportDefinition over a homogeneous row set. Deterministic:
 * filters → optional group/aggregate → stable column projection.
 */
export function runReportDefinition(
  def: ReportDefinition,
  rows: Array<Record<string, unknown> & { id: string }>,
  opts: RunReportDefinitionOptions = {},
): ReportResult {
  const actor = opts.actor ?? 'admin';
  validateReportDefinition(def, { actor });
  assertReportRowsAuthorized(def, rows, actor, opts.sourceAuthorization);
  const filtered = rows
    .filter(r => def.filters.every(f => matchesFilter(r, f)))
    .sort((a, b) => a.id.localeCompare(b.id));
  const sourceIds = filtered.map(r => r.id);

  const groups: ReportResult['groups'] = [];
  if (def.groupBy) {
    const buckets = new Map<string, { sum: number; count: number; numericCount: number; min: number | null; max: number | null; sourceIds: string[] }>();
    for (const r of filtered) {
      const k = reportGroupKey(r[def.groupBy]);
      let bucket = buckets.get(k);
      if (!bucket) {
        bucket = { sum: 0, count: 0, numericCount: 0, min: null, max: null, sourceIds: [] };
        buckets.set(k, bucket);
      }
      bucket.count += 1;
      bucket.sourceIds.push(r.id);
      const field = def.aggregate.field;
      const rawValue = field ? r[field] : undefined;
      const n = typeof rawValue === 'number' ? rawValue : NaN;
      if (Number.isFinite(n)) {
        bucket.sum += n;
        bucket.numericCount += 1;
        bucket.min = bucket.min === null ? n : Math.min(bucket.min, n);
        bucket.max = bucket.max === null ? n : Math.max(bucket.max, n);
      }
    }
    for (const [key, b] of buckets) {
      let value: number;
      if (def.aggregate.fn === 'sum') value = b.sum;
      else if (def.aggregate.fn === 'avg') value = b.numericCount ? Math.round((b.sum / b.numericCount) * 100) / 100 : 0;
      else if (def.aggregate.fn === 'min') value = b.min ?? 0;
      else if (def.aggregate.fn === 'max') value = b.max ?? 0;
      else value = b.count;
      groups.push({ key, value, count: b.count, sourceIds: b.sourceIds });
    }
    groups.sort((a, b) => a.key.localeCompare(b.key));
  }

  const projected = filtered.map(r => {
    const out: Record<string, unknown> = {};
    for (const c of def.columns) out[c] = r[c];
    return out;
  });

  return {
    definitionId: def.id,
    sourceEntity: def.sourceEntity,
    runActor: actor,
    columns: def.columns,
    rows: projected,
    groups,
    totalRows: filtered.length,
    sourceIds,
    sourceAuthorization: opts.sourceAuthorization
      ? {
        actor,
        sourceEntity: def.sourceEntity,
        sourceIds,
      }
      : null,
  };
}

export interface ExportReportCsvOptions {
  actor?: ReportActor;
}

/** Deterministic CSV export of a report result (RFC-4180-ish quoting). */
export function exportReportCsv(result: ReportResult, opts: ExportReportCsvOptions = {}): string {
  const actor = opts.actor ?? result.runActor ?? 'admin';
  const access = getReportSourceAccess(result.sourceEntity, actor);
  if (!access.allowed) {
    throw new ReportDefinitionValidationError(
      'REPORT_SOURCE_NOT_ALLOWED',
      `Report source "${result.sourceEntity}" is not allowed for export: ${access.reason}.`,
    );
  }
  if (actor === 'finance') {
    const auth = result.sourceAuthorization;
    if (!auth || auth.actor !== 'finance' || auth.sourceEntity !== result.sourceEntity) {
      throw new ReportDefinitionValidationError(
        'REPORT_RESULT_NOT_AUTHORIZED_FOR_EXPORT',
        `Finance CSV export requires a result produced by an authorized finance report run.`,
      );
    }
  }

  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = result.columns.map(esc).join(',');
  const lines = result.rows.map(r => result.columns.map(c => esc(r[c])).join(','));
  return [header, ...lines].join('\n');
}

export interface ReportLineage {
  definitionId: string;
  sourceEntity: string;
  filters: ReportFilter[];
  rowCount: number;
  sourceIds: string[];
}

/** Returns the provenance of a report result so an agent can cite source rows. */
export function getReportLineage(def: ReportDefinition, result: ReportResult): ReportLineage {
  return {
    definitionId: def.id,
    sourceEntity: def.sourceEntity,
    filters: def.filters,
    rowCount: result.totalRows,
    sourceIds: result.sourceIds,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 14. Year rollover / setup  (previewYearRollover, applyYearRollover,
//     listSetupMilestones)
// ════════════════════════════════════════════════════════════════════════════

export interface RolloverPreview {
  fromYearLabel: string;
  toYearLabel: string;
  activeStudents: number;
  activeEnrollments: number;
  enrollmentsToRoll: string[]; // enrollment ids that would carry forward
  enrollmentsToArchive: string[]; // ended before cutoff
  warnings: string[];
}

/**
 * Pure preview of a school-year rollover: which active enrollments carry forward
 * vs. archive, given a cutoff date. No writes — the apply step consumes this.
 */
export function previewYearRollover(
  enrollments: MinimalEnrollment[],
  students: MinimalStudent[],
  opts: { fromYearLabel: string; toYearLabel: string; cutoffDate: IsoDate },
): RolloverPreview {
  const activeStudentIds = new Set(students.filter(s => !s.isArchived).map(s => s.id));
  const toRoll: string[] = [];
  const toArchive: string[] = [];
  const warnings: string[] = [];
  for (const e of enrollments) {
    const ended = e.endDate && e.endDate < opts.cutoffDate;
    const studentActive = activeStudentIds.has(e.studentId);
    if (ended || !studentActive) toArchive.push(e.id);
    else if (e.status === 'ACTIVE' || !e.status) toRoll.push(e.id);
    if (!studentActive && !ended) warnings.push(`Enrollment ${e.id} references archived/missing student ${e.studentId}`);
  }
  return {
    fromYearLabel: opts.fromYearLabel,
    toYearLabel: opts.toYearLabel,
    activeStudents: activeStudentIds.size,
    activeEnrollments: enrollments.filter(e => e.status === 'ACTIVE' || !e.status).length,
    enrollmentsToRoll: toRoll.sort(),
    enrollmentsToArchive: toArchive.sort(),
    warnings,
  };
}

export interface RolloverPlan {
  archiveEnrollmentIds: string[];
  newEnrollments: MinimalEnrollment[];
  appliedAt: IsoTimestamp;
}

/** Pure: turns a preview into a concrete write plan the caller persists. */
export function applyYearRollover(
  preview: RolloverPreview,
  enrollments: MinimalEnrollment[],
  opts: { now: IsoTimestamp; idFactory: (seed: string) => string; newStartDate: IsoDate },
): RolloverPlan {
  const byId = new Map(enrollments.map(e => [e.id, e]));
  const newEnrollments: MinimalEnrollment[] = preview.enrollmentsToRoll.map(id => {
    const src = byId.get(id)!;
    return {
      id: opts.idFactory(`${id}:${preview.toYearLabel}`),
      studentId: src.studentId,
      activityId: src.activityId,
      l2Id: src.l2Id ?? null,
      status: 'ACTIVE',
      startDate: opts.newStartDate,
      endDate: null,
    };
  });
  return { archiveEnrollmentIds: [...preview.enrollmentsToArchive], newEnrollments, appliedAt: opts.now };
}

export interface SetupMilestone {
  id: string;
  label: string;
  done: boolean;
}

/** Deterministic setup checklist state from raw flags. */
export function listSetupMilestones(state: {
  activitiesCreated?: boolean;
  staffAdded?: boolean;
  firstEventCreated?: boolean;
  setupGateCleared?: boolean;
}): SetupMilestone[] {
  return [
    { id: 'activities', label: 'Activities created', done: !!state.activitiesCreated },
    { id: 'staff', label: 'Staff added', done: !!state.staffAdded },
    { id: 'firstEvent', label: 'First event created', done: !!state.firstEventCreated },
    { id: 'gate', label: 'Setup gate cleared', done: !!state.setupGateCleared },
  ];
}

// Keep BalanceSnapshot referenced so the import is meaningful for downstream UIs.
export type { BalanceSnapshot };
