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
  ReportFilter,
  PublicEndpoint,
  PublicEndpointKind,
  IsoDate,
  IsoTimestamp,
} from '../types/blueprint';
import type { AdminInboxItem } from '../types';
import type { EnrollmentV2, StudentV2 } from '../types/v2';
import { fromDateTimestamp } from './appTimestamp';
import { decideApproval, makeApprovalRequest } from './adminInbox';

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
export interface MinimalActivity {
  id: string;
  name: string;
  activityType?: string;
  template?: string;
  isArchived?: boolean;
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
  status?: OperationalRequest['status'],
): OperationalRequest[] {
  return requests
    .filter(r => r.kind === 'ROOM_CHANGE' && (status ? r.status === status : true))
    .sort(byDateAsc(r => r.requestedFor));
}

export function listAbsencesForPeriod(
  requests: OperationalRequest[],
  from: IsoDate,
  to: IsoDate,
): OperationalRequest[] {
  return requests
    .filter(r => (r.kind === 'ABSENCE' || r.kind === 'DAY_OFF'))
    .filter(r => {
      const start = r.requestedFor;
      const end = r.endDate ?? r.requestedFor;
      // overlap test
      return start <= to && end >= from;
    })
    .sort(byDateAsc(r => r.requestedFor));
}

export interface RoomChangeResult {
  request: OperationalRequest;
  eventId: string;
  newRoomId: string;
}

/** Pure: returns the approved request + the event/room mutation the caller applies. */
export function applyApprovedRoomChange(
  request: OperationalRequest,
  opts: { now: IsoTimestamp; decidedBy?: string | null },
): RoomChangeResult | null {
  if (request.kind !== 'ROOM_CHANGE' || !request.eventId || !request.requestedRoomId) return null;
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
  studentIds: string[];
  students: MinimalStudent[];
}

function rosterFor(
  activities: MinimalActivity[],
  enrollments: MinimalEnrollment[],
  students: MinimalStudent[],
  predicate: (a: MinimalActivity) => boolean,
): ActivityRoster[] {
  const studentById = new Map(students.map(s => [s.id, s]));
  return activities
    .filter(a => !a.isArchived && predicate(a))
    .map(a => {
      const ids = enrollments
        .filter(e => e.activityId === a.id && (e.status ? e.status === 'ACTIVE' : true))
        .map(e => e.studentId);
      const unique = Array.from(new Set(ids));
      return {
        activity: a,
        studentIds: unique,
        students: unique.map(id => studentById.get(id)).filter(Boolean) as MinimalStudent[],
      };
    })
    .sort((x, y) => x.activity.name.localeCompare(y.activity.name));
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
  status?: ExamSession['status'],
): ExamSession[] {
  return sessions
    .filter(s => (status ? s.status === status : true))
    .sort(byDateAsc(s => s.date));
}

export interface StudentAssessmentSummary {
  studentId: string;
  examCount: number;
  averageScore: number | null;
  bestGrade: string | null;
  certificates: number;
  submissions: ExaminerSubmission[];
}

export function getStudentAssessmentSummary(
  studentId: string,
  submissions: ExaminerSubmission[],
  certificates: Certificate[],
): StudentAssessmentSummary {
  const mine = submissions
    .filter(s => s.studentId === studentId)
    .sort(byDateAsc(s => s.submittedAt));
  const scored = mine.map(s => s.score).filter((n): n is number => typeof n === 'number');
  const grades = mine.map(s => s.grade).filter((g): g is string => !!g).sort();
  return {
    studentId,
    examCount: mine.length,
    averageScore: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
    bestGrade: grades.length ? grades[0] : null,
    certificates: certificates.filter(c => c.studentId === studentId && c.status === 'ISSUED').length,
    submissions: mine,
  };
}

export function listPendingCertificates(certificates: Certificate[]): Certificate[] {
  return certificates
    .filter(c => c.status === 'PENDING')
    .sort(byDateAsc(c => c.createdAt));
}

// ════════════════════════════════════════════════════════════════════════════
// 7. Concert programs  (listConcertPrograms, getProgramRunOfShow,
//    listPerformerEvents)
// ════════════════════════════════════════════════════════════════════════════

export function listConcertPrograms(
  programs: ConcertProgram[],
  status?: ConcertProgram['status'],
): ConcertProgram[] {
  return programs
    .filter(p => (status ? p.status === status : true))
    .sort(byDateAsc(p => p.date));
}

export interface RunOfShowLine {
  order: number;
  title: string;
  composer: string | null;
  performers: number;
  durationMinutes: number | null;
  cumulativeMinutes: number | null;
}

export function getProgramRunOfShow(program: ConcertProgram): RunOfShowLine[] {
  let cumulative = 0;
  let cumulativeKnown = true;
  return [...program.pieces]
    .sort((a, b) => a.order - b.order)
    .map(p => {
      if (typeof p.durationMinutes === 'number') cumulative += p.durationMinutes;
      else cumulativeKnown = false;
      return {
        order: p.order,
        title: p.title,
        composer: p.composer,
        performers: p.performerStudentIds.length + p.performerStaffIds.length,
        durationMinutes: p.durationMinutes,
        cumulativeMinutes: cumulativeKnown ? cumulative : null,
      };
    });
}

/** Concert programs where a given student/staff performs, newest first. */
export function listPerformerEvents(
  programs: ConcertProgram[],
  performerId: string,
): ConcertProgram[] {
  return programs
    .filter(p => p.pieces.some(piece =>
      piece.performerStudentIds.includes(performerId) ||
      piece.performerStaffIds.includes(performerId)))
    .sort((a, b) => (b.date).localeCompare(a.date));
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

/** Deterministic payslip rows from approved hours entries (rate × hours). */
export function calculatePayslipRows(entries: HoursEntry[]): PayslipRow[] {
  return entries
    .filter(e => e.status === 'APPROVED' || e.status === 'PAID')
    .filter(e => typeof e.rate === 'number')
    .map(e => {
      const hours = e.calendarMinutes / 60;
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

/** Computes per-party open balances. balance = charged + adjusted - paid. */
export function listOpenBalances(
  charges: Charge[],
  payments: Payment[],
  adjustments: Adjustment[],
  scope: 'STUDENT' | 'FAMILY' = 'STUDENT',
): OpenBalance[] {
  const key = (x: { studentId?: string | null; familyId?: string | null }) =>
    scope === 'STUDENT' ? x.studentId ?? null : x.familyId ?? null;

  const map = new Map<string, OpenBalance>();
  const ensure = (id: string, currency: string): OpenBalance => {
    let b = map.get(id);
    if (!b) {
      b = { partyId: id, scope, currency, totalCharged: 0, totalPaid: 0, totalAdjusted: 0, balance: 0, openChargeIds: [] };
      map.set(id, b);
    }
    return b;
  };

  for (const c of charges) {
    const id = key(c);
    if (!id || c.status === 'VOID') continue;
    const b = ensure(id, c.currency);
    b.totalCharged += c.amount;
    if (c.status !== 'PAID') b.openChargeIds.push(c.id);
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
  out.forEach(b => { b.balance = Math.round((b.totalCharged + b.totalAdjusted - b.totalPaid) * 100) / 100; });
  return out
    .filter(b => b.balance !== 0 || b.openChargeIds.length > 0)
    .sort((a, b) => b.balance - a.balance || a.partyId.localeCompare(b.partyId));
}

export function listPaymentsByFamily(payments: Payment[], familyId: string): Payment[] {
  return payments
    .filter(p => p.familyId === familyId)
    .sort(byDateAsc(p => p.receivedAt));
}

export interface EnrollmentReconciliation {
  enrollmentId: string;
  charges: Charge[];
  totalCharged: number;
  expectedCharged: number;
  matches: boolean;
  missingPeriods: string[];
}

/**
 * Checks that an enrollment's charges cover the expected billing periods.
 * `expectedPeriods` is passed in (deterministic — no calendar guessing here).
 */
export function reconcileEnrollmentCharges(
  enrollmentId: string,
  charges: Charge[],
  expectedPeriods: { label: string; amount: number }[],
): EnrollmentReconciliation {
  const mine = charges.filter(c => c.enrollmentId === enrollmentId && c.status !== 'VOID');
  const totalCharged = mine.reduce((s, c) => s + c.amount, 0);
  const expectedCharged = expectedPeriods.reduce((s, p) => s + p.amount, 0);
  const presentLabels = new Set(mine.map(c => c.periodLabel).filter(Boolean));
  const missingPeriods = expectedPeriods
    .filter(p => !presentLabels.has(p.label))
    .map(p => p.label);
  return {
    enrollmentId,
    charges: mine.sort(byDateAsc(c => c.dueDate)),
    totalCharged: Math.round(totalCharged * 100) / 100,
    expectedCharged: Math.round(expectedCharged * 100) / 100,
    matches: missingPeriods.length === 0 && totalCharged === expectedCharged,
    missingPeriods,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 10. Agreements / consent  (listUnsignedAgreements, getAgreementHistory,
//     findAgreementByEnrollment)
// ════════════════════════════════════════════════════════════════════════════

export interface UnsignedAgreement {
  template: AgreementTemplate;
  studentId: string;
  reason: 'NEVER_ACCEPTED' | 'SUPERSEDED_VERSION';
}

/**
 * For each active template, finds students who have no current acceptance of the
 * active version. `requiredStudentIds` scopes who must sign each kind.
 */
export function listUnsignedAgreements(
  templates: AgreementTemplate[],
  acceptances: AgreementAcceptance[],
  requiredStudentIds: string[],
): UnsignedAgreement[] {
  const active = templates.filter(t => t.isActive);
  const out: UnsignedAgreement[] = [];
  for (const t of active) {
    for (const studentId of requiredStudentIds) {
      const current = acceptances.find(a =>
        a.templateId === t.id &&
        a.studentId === studentId &&
        a.status === 'ACCEPTED' &&
        a.templateVersion === t.version);
      if (current) continue;
      const older = acceptances.find(a =>
        a.templateId === t.id &&
        a.studentId === studentId &&
        a.status === 'ACCEPTED' &&
        a.templateVersion < t.version);
      out.push({ template: t, studentId, reason: older ? 'SUPERSEDED_VERSION' : 'NEVER_ACCEPTED' });
    }
  }
  return out.sort((a, b) =>
    a.template.title.localeCompare(b.template.title) || a.studentId.localeCompare(b.studentId));
}

/** Full acceptance trail for a template (all versions/parties), newest first. */
export function getAgreementHistory(
  acceptances: AgreementAcceptance[],
  templateId: string,
): AgreementAcceptance[] {
  return acceptances
    .filter(a => a.templateId === templateId)
    .sort((a, b) => (b.acceptedAt ?? b.createdAt).localeCompare(a.acceptedAt ?? a.createdAt));
}

export function findAgreementByEnrollment(
  acceptances: AgreementAcceptance[],
  enrollmentId: string,
): AgreementAcceptance[] {
  return acceptances
    .filter(a => a.enrollmentId === enrollmentId)
    .sort((a, b) => (b.acceptedAt ?? b.createdAt).localeCompare(a.acceptedAt ?? a.createdAt));
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

function matchesFilter(row: Record<string, unknown>, f: ReportFilter): boolean {
  const v = row[f.field];
  switch (f.op) {
    case 'eq': return v === f.value;
    case 'neq': return v !== f.value;
    case 'gt': return typeof v === 'number' && v > (f.value as number);
    case 'gte': return typeof v === 'number' && v >= (f.value as number);
    case 'lt': return typeof v === 'number' && v < (f.value as number);
    case 'lte': return typeof v === 'number' && v <= (f.value as number);
    case 'in': return Array.isArray(f.value) && (f.value as Array<unknown>).includes(v as never);
    case 'contains': return typeof v === 'string' && v.toLowerCase().includes(String(f.value).toLowerCase());
    default: return false;
  }
}

export interface ReportResult {
  definitionId: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  groups: Array<{ key: string; value: number; count: number; sourceIds: string[] }>;
  totalRows: number;
  sourceIds: string[]; // lineage: ids of every source row included
}

/**
 * Runs a declarative ReportDefinition over a homogeneous row set. Deterministic:
 * filters → optional group/aggregate → stable column projection.
 */
export function runReportDefinition(
  def: ReportDefinition,
  rows: Array<Record<string, unknown> & { id: string }>,
): ReportResult {
  const filtered = rows.filter(r => def.filters.every(f => matchesFilter(r, f)));
  const sourceIds = filtered.map(r => r.id);

  const groups: ReportResult['groups'] = [];
  if (def.groupBy) {
    const buckets = new Map<string, { value: number; count: number; sourceIds: string[] }>();
    for (const r of filtered) {
      const k = String(r[def.groupBy] ?? '∅');
      let bucket = buckets.get(k);
      if (!bucket) { bucket = { value: 0, count: 0, sourceIds: [] }; buckets.set(k, bucket); }
      bucket.count += 1;
      bucket.sourceIds.push(r.id);
      const field = def.aggregate.field;
      const n = field ? Number(r[field]) : 0;
      if (def.aggregate.fn === 'sum' || def.aggregate.fn === 'avg') bucket.value += Number.isFinite(n) ? n : 0;
      else if (def.aggregate.fn === 'count') bucket.value = bucket.count;
      else if (def.aggregate.fn === 'min') bucket.value = Math.min(bucket.value || n, n);
      else if (def.aggregate.fn === 'max') bucket.value = Math.max(bucket.value, n);
    }
    for (const [key, b] of buckets) {
      groups.push({ key, value: def.aggregate.fn === 'avg' ? Math.round((b.value / b.count) * 100) / 100 : b.value, count: b.count, sourceIds: b.sourceIds });
    }
    groups.sort((a, b) => a.key.localeCompare(b.key));
  }

  const projected = filtered.map(r => {
    const out: Record<string, unknown> = {};
    for (const c of def.columns) out[c] = r[c];
    return out;
  });

  return { definitionId: def.id, columns: def.columns, rows: projected, groups, totalRows: filtered.length, sourceIds };
}

/** Deterministic CSV export of a report result (RFC-4180-ish quoting). */
export function exportReportCsv(result: ReportResult): string {
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
