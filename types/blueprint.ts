/**
 * Cadenza Blueprint Type Definitions
 *
 * Forte-informed blueprint domains expressed as backend-agnostic, org-scoped,
 * auditable, agent-readable data contracts. Unlike `types/v2.ts` (which binds
 * timestamps to backend-specific timestamp objects), every entity here uses ISO-8601
 * strings so the same shapes serialize cleanly to Supabase Postgres, local
 * storage, CSV import/export, and embedding text.
 *
 * Contract guarantees (every entity):
 *   - `id`        stable opaque identifier
 *   - `orgId`     tenant scope (matches Supabase RLS `org_id`)
 *   - `createdAt` / `updatedAt`  ISO-8601 timestamps
 *   - audit fields (`createdBy` / `updatedBy`) where a human decision matters
 *   - an explicit status/archive field where the record has a lifecycle
 *
 * These map 1:1 to the `dataEntities` declared in `features/forteTree.ts`, and
 * the query helpers in `utils/blueprintQueries.ts` answer the `deterministicQueries`
 * declared there.
 */

// ─── Shared primitives ───────────────────────────────────────────────────────

/** ISO-8601 timestamp string, e.g. "2026-06-16T14:25:00.000Z" */
export type IsoTimestamp = string;
/** ISO-8601 date string, e.g. "2026-06-16" */
export type IsoDate = string;

/** Fields every org-scoped, auditable blueprint record carries. */
export interface BlueprintBase {
  id: string;
  orgId: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  createdBy?: string | null;
  updatedBy?: string | null;
}

// ─── Public registration intake ──────────────────────────────────────────────

export type IntakeStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'DUPLICATE'
  | 'CONVERTED';

/** A guardian/parent contact captured at intake or on a family file. */
export interface Guardian {
  id: string;
  fullName: string;
  relationship: string | null; // PARENT | GUARDIAN | SELF | OTHER
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

/**
 * features/forteTree → public-registration-intake.
 * A structured, reviewable record created by the public website form BEFORE it
 * becomes an official Student/Enrollment.
 */
export interface RegistrationIntake extends BlueprintBase {
  status: IntakeStatus;
  source: 'WEBSITE' | 'MANUAL' | 'IMPORT';
  submittedAt: IsoTimestamp;
  // Applicant
  studentFullName: string;
  studentDateOfBirth: IsoDate | null;
  instrument: string | null;
  requestedActivityId: string | null;
  notes: string | null;
  guardians: Guardian[];
  consentAccepted: boolean;
  consentAgreementId: string | null;
  // Review / conversion lineage
  reviewedBy?: string | null;
  reviewedAt?: IsoTimestamp | null;
  rejectionReason?: string | null;
  duplicateOfStudentId?: string | null;
  convertedStudentId?: string | null;
  convertedEnrollmentId?: string | null;
}

// ─── Students / family files ─────────────────────────────────────────────────

/**
 * features/forteTree → student-family-files.
 * Groups students under shared guardians/billing for family-level operations.
 */
export interface Family extends BlueprintBase {
  name: string;
  guardians: Guardian[];
  studentIds: string[];
  primaryContactGuardianId: string | null;
  billingNotes: string | null;
  isArchived: boolean;
}

// ─── Lesson details / attendance ─────────────────────────────────────────────

export type AttendanceStatus =
  | 'UNMARKED'
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'EXCUSED'
  | 'MAKEUP';

export type LessonCompletion = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

/**
 * features/forteTree → lesson-details-attendance.
 * Pedagogical record linked to an EventV2/CalendarEvent for one student.
 */
export interface LessonRecord extends BlueprintBase {
  eventId: string;
  studentId: string;
  staffMemberId: string | null;
  date: IsoDate;
  attendance: AttendanceStatus;
  completion: LessonCompletion;
  notes: string | null;
  repertoire: string[]; // pieces worked on
  homework: string | null;
  makeupOfLessonId: string | null; // links a makeup to the missed lesson
}

// ─── Rooms / absence / day requests (Admin Inbox approvals) ──────────────────

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type RequestKind = 'ROOM_CHANGE' | 'ABSENCE' | 'DAY_OFF';

/**
 * features/forteTree → rooms-absence-requests.
 * Approval-bearing operational request that surfaces in the Admin Inbox.
 */
export interface OperationalRequest extends BlueprintBase {
  kind: RequestKind;
  status: RequestStatus;
  requestedByStaffId: string | null;
  requestedFor: IsoDate; // date the request affects
  endDate: IsoDate | null; // for multi-day absences
  // ROOM_CHANGE specifics
  eventId: string | null;
  currentRoomId: string | null;
  requestedRoomId: string | null;
  reason: string | null;
  // decision lineage
  decidedBy?: string | null;
  decidedAt?: IsoTimestamp | null;
  decisionNote?: string | null;
  adminInboxItemId?: string | null;
}

// ─── Exams / certificates / report cards ─────────────────────────────────────

export type ExamStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'GRADED' | 'CANCELLED';

/** features/forteTree → exams-certificates-report-cards. */
export interface ExamSession extends BlueprintBase {
  name: string;
  activityId: string | null;
  date: IsoDate;
  status: ExamStatus;
  examinerStaffIds: string[];
  studentIds: string[];
  notes: string | null;
}

export interface ExaminerSubmission extends BlueprintBase {
  examSessionId: string;
  studentId: string;
  examinerStaffId: string;
  score: number | null; // 0–100
  grade: string | null; // letter / level
  remarks: string | null;
  submittedAt: IsoTimestamp | null;
}

export type CertificateStatus = 'PENDING' | 'ISSUED' | 'REVOKED';

export interface Certificate extends BlueprintBase {
  studentId: string;
  examSessionId: string | null;
  title: string;
  level: string | null;
  status: CertificateStatus;
  issuedAt: IsoTimestamp | null;
  documentUrl: string | null;
  documentPath: string | null;
}

export interface ReportCard extends BlueprintBase {
  studentId: string;
  periodLabel: string; // e.g. "2025-2026 Semester 1"
  activityId: string | null;
  lines: ReportCardLine[];
  summary: string | null;
  publishedAt: IsoTimestamp | null;
}

export interface ReportCardLine {
  subject: string;
  grade: string | null;
  comment: string | null;
}

// ─── Concert programs ────────────────────────────────────────────────────────

export type ConcertProgramStatus = 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED';

/** features/forteTree → concert-programs-events. */
export interface ConcertProgram extends BlueprintBase {
  title: string;
  eventId: string | null; // linked CalendarEvent/EventV2
  date: IsoDate;
  venue: string | null;
  status: ConcertProgramStatus;
  pieces: ConcertPiece[];
  notes: string | null;
}

export interface ConcertPiece {
  order: number;
  title: string;
  composer: string | null;
  performerStudentIds: string[];
  performerStaffIds: string[];
  durationMinutes: number | null;
}

// ─── Payroll / hours ─────────────────────────────────────────────────────────

/**
 * features/forteTree → payroll-salaries-hours.
 * A single reconciled line within payroll, traceable to a calendar source row.
 */
export interface HoursEntry extends BlueprintBase {
  staffMemberId: string;
  hoursReportId: string | null;
  date: IsoDate;
  reportedMinutes: number;
  calendarMinutes: number; // derived from event participation
  eventId: string | null;
  teachingAssignmentId: string | null;
  orgRoleId: string | null;
  rate: number | null; // per-hour
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID';
  note: string | null;
}

// ─── Payments / charges / ledger ─────────────────────────────────────────────

export type LedgerStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'VOID';

/** features/forteTree → payments-charges. A billed amount owed by a family/student. */
export interface Charge extends BlueprintBase {
  studentId: string | null;
  familyId: string | null;
  enrollmentId: string | null;
  description: string;
  amount: number; // positive, in minor org currency units? No — decimal units
  currency: string; // ISO 4217, defaults to org currency
  dueDate: IsoDate | null;
  status: LedgerStatus;
  periodLabel: string | null;
}

export interface Payment extends BlueprintBase {
  studentId: string | null;
  familyId: string | null;
  amount: number; // positive
  currency: string;
  method: 'CASH' | 'TRANSFER' | 'CARD' | 'CHECK' | 'OTHER';
  receivedAt: IsoTimestamp;
  reference: string | null;
  appliedChargeIds: string[]; // internal allocation, no external processor
  note: string | null;
}

export interface Adjustment extends BlueprintBase {
  studentId: string | null;
  familyId: string | null;
  chargeId: string | null;
  amount: number; // signed: negative = discount/credit, positive = surcharge
  currency: string;
  reason: string;
  approvedBy?: string | null;
}

/** Point-in-time computed balance, for audit/history. */
export interface BalanceSnapshot extends BlueprintBase {
  studentId: string | null;
  familyId: string | null;
  asOf: IsoTimestamp;
  totalCharged: number;
  totalPaid: number;
  totalAdjusted: number;
  balance: number; // charged + adjusted - paid
  currency: string;
}

// ─── Year rollover / public endpoint foundation ─────────────────────────────

export type RolloverRunStatus = 'PREVIEWED' | 'APPLIED' | 'FAILED' | 'CANCELLED';

/** Auditable record of a school-year rollover preview/apply operation. */
export interface RolloverRun extends BlueprintBase {
  fromYearLabel: string;
  toYearLabel: string;
  status: RolloverRunStatus;
  preview: Record<string, unknown>;
  plan: Record<string, unknown>;
  result: Record<string, unknown>;
  warnings: string[];
  startedAt: IsoTimestamp | null;
  appliedAt: IsoTimestamp | null;
  failedAt: IsoTimestamp | null;
  errorMessage: string | null;
}

export type PublicEndpointKind =
  | 'REGISTRATION_INTAKE'
  | 'AGREEMENT_ACCEPTANCE'
  | 'CALENDAR_SUBSCRIPTION'
  | 'HOURS_REPORT'
  | 'OTHER';

export type PublicEndpointStatus = 'DISABLED' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';

/**
 * Token registry for public surfaces. The raw token is never stored; only
 * `tokenHash` is persisted.
 */
export interface PublicEndpoint extends BlueprintBase {
  kind: PublicEndpointKind;
  label: string;
  tokenHash: string;
  status: PublicEndpointStatus;
  scopes: string[];
  targetId: string | null;
  consentAgreementId: string | null;
  expiresAt: IsoTimestamp | null;
  lastUsedAt: IsoTimestamp | null;
  revokedAt: IsoTimestamp | null;
}

// ─── Agreements / consent ────────────────────────────────────────────────────

export type AgreementKind =
  | 'ENROLLMENT'
  | 'CONSENT'
  | 'MEDIA_RELEASE'
  | 'INSTRUMENT_LOAN'
  | 'FINANCIAL'
  | 'OTHER';

/** features/forteTree → agreements-consent. A versioned template. */
export interface AgreementTemplate extends BlueprintBase {
  kind: AgreementKind;
  title: string;
  version: number; // monotonic per (orgId, kind, title)
  body: string; // markdown / plain text, embedding-ready
  isActive: boolean; // only one active version per template line
  supersedesVersion: number | null;
  requiresGuardian: boolean;
}

export type AcceptanceStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'SUPERSEDED';

/** A specific party's acceptance of a specific template version. */
export interface AgreementAcceptance extends BlueprintBase {
  templateId: string;
  templateVersion: number;
  studentId: string | null;
  familyId: string | null;
  enrollmentId: string | null;
  guardianId: string | null;
  status: AcceptanceStatus;
  acceptedAt: IsoTimestamp | null;
  acceptedByName: string | null;
  signatureRef: string | null; // token / ip / file path — internal, not external e-sign
}

// ─── Instrument inventory ────────────────────────────────────────────────────

export type InstrumentCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'REPAIR' | 'RETIRED';
export type InstrumentStatus = 'AVAILABLE' | 'ON_LOAN' | 'IN_REPAIR' | 'RETIRED' | 'LOST';

/** features/forteTree → instrument-inventory. */
export interface Instrument extends BlueprintBase {
  assetTag: string; // human-stable inventory tag
  name: string;
  category: string; // STRINGS | BRASS | PERCUSSION | KEYBOARD | OTHER
  brand: string | null;
  serialNumber: string | null;
  condition: InstrumentCondition;
  status: InstrumentStatus;
  location: string | null;
  acquiredAt: IsoDate | null;
  valueAmount: number | null;
  notes: string | null;
}

export type LoanStatus = 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'LOST';

/** Custody record — who holds an instrument and when it is due back. */
export interface InstrumentLoan extends BlueprintBase {
  instrumentId: string;
  borrowerStudentId: string | null;
  borrowerStaffId: string | null;
  checkedOutAt: IsoTimestamp;
  dueDate: IsoDate | null;
  returnedAt: IsoTimestamp | null;
  status: LoanStatus;
  conditionOut: InstrumentCondition;
  conditionIn: InstrumentCondition | null;
  agreementAcceptanceId: string | null;
  note: string | null;
}

/** Repair/condition change history entry for an instrument. */
export interface InstrumentRepair extends BlueprintBase {
  instrumentId: string;
  reportedAt: IsoTimestamp;
  resolvedAt: IsoTimestamp | null;
  description: string;
  cost: number | null;
  conditionBefore: InstrumentCondition;
  conditionAfter: InstrumentCondition | null;
  vendor: string | null;
}

// ─── Teacher / staff evaluation ──────────────────────────────────────────────

export type EvaluationStatus = 'DUE' | 'SCHEDULED' | 'DRAFT' | 'COMPLETED' | 'ACKNOWLEDGED';

/** features/forteTree → teacher-evaluation-hr. */
export interface StaffEvaluation extends BlueprintBase {
  staffMemberId: string;
  reviewerStaffId: string | null;
  periodLabel: string;
  dueDate: IsoDate | null;
  status: EvaluationStatus;
  overallRating: number | null; // 1–5
  criteria: EvaluationCriterion[];
  strengths: string | null;
  actions: EvaluationAction[];
  completedAt: IsoTimestamp | null;
  acknowledgedAt: IsoTimestamp | null;
}

export interface EvaluationCriterion {
  label: string;
  rating: number | null; // 1–5
  comment: string | null;
}

export interface EvaluationAction {
  id: string;
  description: string;
  dueDate: IsoDate | null;
  done: boolean;
}

// ─── Reports / analytics ─────────────────────────────────────────────────────

export type ReportSourceEntity =
  | 'events'
  | 'students'
  | 'enrollments'
  | 'charges'
  | 'payments'
  | 'hoursEntries'
  | 'lessonRecords'
  | 'instruments';

/** features/forteTree → reports-analytics. A saved, deterministic report definition. */
export interface ReportDefinition extends BlueprintBase {
  name: string;
  description: string | null;
  sourceEntity: ReportSourceEntity;
  // declarative, deterministic spec — no embedded code
  filters: ReportFilter[];
  groupBy: string | null;
  aggregate: ReportAggregate;
  columns: string[];
  isPinned: boolean;
}

export interface ReportFilter {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: string | number | boolean | Array<string | number>;
}

export interface ReportAggregate {
  fn: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'none';
  field: string | null;
}

// ─── Collection / table names ────────────────────────────────────────────────

/**
 * Canonical local collection to Supabase table names for blueprint
 * entities. snake_case Postgres tables are documented in
 * docs/SUPABASE_MIGRATION_MAP.md. Local-mode collection names stay camelCase to
 * match the existing `useSupabaseSync` convention.
 */
export const BLUEPRINT_COLLECTIONS = {
  registrationIntake: 'registrationIntake',
  families: 'families',
  lessonRecords: 'lessonRecords',
  operationalRequests: 'operationalRequests',
  examSessions: 'examSessions',
  examinerSubmissions: 'examinerSubmissions',
  certificates: 'certificates',
  reportCards: 'reportCards',
  concertPrograms: 'concertPrograms',
  hoursEntries: 'hoursEntries',
  charges: 'charges',
  payments: 'payments',
  adjustments: 'adjustments',
  balanceSnapshots: 'balanceSnapshots',
  rolloverRuns: 'rolloverRuns',
  publicEndpoints: 'publicEndpoints',
  agreementTemplates: 'agreementTemplates',
  agreementAcceptances: 'agreementAcceptances',
  instruments: 'instruments',
  instrumentLoans: 'instrumentLoans',
  instrumentRepairs: 'instrumentRepairs',
  staffEvaluations: 'staffEvaluations',
  reportDefinitions: 'reportDefinitions',
} as const;

export type BlueprintCollection =
  (typeof BLUEPRINT_COLLECTIONS)[keyof typeof BLUEPRINT_COLLECTIONS];
