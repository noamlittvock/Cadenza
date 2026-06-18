import type { AdminInboxItem, Student } from '../types';
import type { AgreementAcceptance, Family, IntakeStatus, RegistrationIntake } from '../types/blueprint';
import type { EnrollmentV2 } from '../types/v2';
import {
  appendIntakeStatusHistory,
  type IntakeApprovalGraph,
  listPendingIntake,
  suggestStudentDuplicates,
  type DuplicateSuggestion,
  type MinimalStudent,
} from './blueprintQueries';
import { studentV2ToLegacy } from './canonicalAdapters';

export type IntakeReviewStatusFilter = 'ACTIVE' | 'ALL' | IntakeStatus;

export interface IntakeReviewFilters {
  status: IntakeReviewStatusFilter;
  query: string;
  activityId: string;
}

export interface IntakeReviewRow {
  record: RegistrationIntake;
  duplicateSuggestions: DuplicateSuggestion[];
  primaryGuardianName: string;
  primaryGuardianContact: string;
}

export interface IntakeCorrectionPatch {
  applicantName?: string | null;
  applicantEmail?: string | null;
  applicantPhone?: string | null;
  studentFullName?: string;
  studentDateOfBirth?: string | null;
  instrument?: string | null;
  requestedActivityId?: string | null;
  notes?: string | null;
  primaryGuardianFullName?: string;
  primaryGuardianPhone?: string | null;
  primaryGuardianEmail?: string | null;
}

export interface IntakeCorrectionOptions {
  now: string;
  reviewedBy: string;
}

export interface IntakeApprovalPersistenceState {
  students: Student[];
  families: Family[];
  enrollments: EnrollmentV2[];
  agreementAcceptances: AgreementAcceptance[];
  registrationIntake: RegistrationIntake[];
  inboxItems: AdminInboxItem[];
}

export interface IntakeApprovalPersistenceResult extends IntakeApprovalPersistenceState {
  legacyStudent: Student;
}

export interface RegistrationIntakeExportOptions {
  activityName?: (activityId: string | null | undefined) => string;
  statusLabel?: (status: IntakeStatus) => string;
}

export const REGISTRATION_INTAKE_EXPORT_COLUMNS = [
  'intakeId',
  'status',
  'submittedAt',
  'reviewedAt',
  'applicantName',
  'applicantEmail',
  'applicantPhone',
  'studentFullName',
  'studentDateOfBirth',
  'instrument',
  'requestedActivity',
  'primaryGuardianName',
  'primaryGuardianContact',
  'consentAccepted',
  'consentAgreementId',
  'duplicateScore',
  'rejectionReason',
  'duplicateOfStudentId',
  'convertedStudentId',
  'convertedEnrollmentId',
  'statusHistory',
] as const;

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
};

function sortableReviewTime(record: RegistrationIntake): string {
  return record.reviewedAt ?? record.updatedAt ?? record.submittedAt;
}

function sortIntake(records: RegistrationIntake[]): RegistrationIntake[] {
  return [...records].sort((a, b) => {
    const activeA = a.status === 'PENDING' || a.status === 'IN_REVIEW';
    const activeB = b.status === 'PENDING' || b.status === 'IN_REVIEW';
    if (activeA && activeB) return a.submittedAt.localeCompare(b.submittedAt);
    if (activeA !== activeB) return activeA ? -1 : 1;
    return sortableReviewTime(b).localeCompare(sortableReviewTime(a));
  });
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex(existing => existing.id === item.id);
  if (index === -1) return [...items, item];
  return items.map(existing => existing.id === item.id ? item : existing);
}

function prependUniqueById<T extends { id: string }>(items: T[], item: T): T[] {
  return [item, ...items.filter(existing => existing.id !== item.id)];
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function statusHistorySummary(record: RegistrationIntake): string {
  return (record.statusHistory ?? [])
    .map(entry => {
      const from = entry.fromStatus ? `${entry.fromStatus}->` : '';
      const actor = entry.by ? ` by ${entry.by}` : '';
      const note = entry.note ? ` (${entry.note})` : '';
      return `${entry.at} ${from}${entry.status}${actor}${note}`;
    })
    .join(' | ');
}

function legacyStudentForApprovedGraph(graph: IntakeApprovalGraph): Student {
  const legacyStudent = studentV2ToLegacy(graph.student);
  return {
    ...legacyStudent,
    guardians: [],
    assignments: [
      {
        id: graph.enrollment.id,
        activityId: graph.enrollment.activityId,
        subcategoryId: graph.enrollment.l2Id,
        staffMemberId: '',
        teachingAssignmentId: '',
        startDate: graph.enrollment.startDate,
        endDate: graph.enrollment.endDate ?? undefined,
        status: graph.enrollment.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
      },
    ],
  };
}

export function applyApprovedIntakeGraphToCollections(
  graph: IntakeApprovalGraph,
  state: IntakeApprovalPersistenceState,
): IntakeApprovalPersistenceResult {
  const legacyStudent = legacyStudentForApprovedGraph(graph);
  return {
    legacyStudent,
    students: upsertById(state.students, legacyStudent),
    families: upsertById(state.families, graph.family),
    enrollments: upsertById(state.enrollments, graph.enrollment),
    agreementAcceptances: upsertById(state.agreementAcceptances, graph.agreementRequest),
    registrationIntake: upsertById(state.registrationIntake, graph.intake),
    inboxItems: prependUniqueById(state.inboxItems, graph.inboxHistoryItem),
  };
}

export function filterRegistrationIntake(
  intake: RegistrationIntake[],
  filters: IntakeReviewFilters,
): RegistrationIntake[] {
  const query = filters.query.trim().toLowerCase();
  const byStatus = filters.status === 'ACTIVE'
    ? listPendingIntake(intake)
    : sortIntake(filters.status === 'ALL' ? intake : intake.filter(r => r.status === filters.status));

  return byStatus.filter(record => {
    if (filters.activityId && record.requestedActivityId !== filters.activityId) return false;
    if (!query) return true;
    const haystack = [
      record.studentFullName,
      record.applicantName,
      record.applicantEmail,
      record.applicantPhone,
      record.instrument,
      record.notes,
      ...record.guardians.flatMap(g => [g.fullName, g.email, g.phone, g.relationship]),
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function buildRegistrationIntakeReviewRows(
  intake: RegistrationIntake[],
  students: MinimalStudent[],
  filters: IntakeReviewFilters,
  duplicateThreshold = 0.5,
): IntakeReviewRow[] {
  return filterRegistrationIntake(intake, filters).map(record => {
    const primaryGuardian = record.guardians.find(g => g.isPrimary) ?? record.guardians[0] ?? null;
    return {
      record,
      duplicateSuggestions: suggestStudentDuplicates(record, students, duplicateThreshold),
      primaryGuardianName: primaryGuardian?.fullName ?? '',
      primaryGuardianContact: [primaryGuardian?.phone, primaryGuardian?.email].filter(Boolean).join(' · '),
    };
  });
}

export function exportRegistrationIntakeCsv(
  rows: IntakeReviewRow[],
  opts: RegistrationIntakeExportOptions = {},
): string {
  const lines = rows.map(row => {
    const record = row.record;
    const duplicate = row.duplicateSuggestions[0];
    const values: Record<(typeof REGISTRATION_INTAKE_EXPORT_COLUMNS)[number], unknown> = {
      intakeId: record.id,
      status: opts.statusLabel?.(record.status) ?? record.status,
      submittedAt: record.submittedAt,
      reviewedAt: record.reviewedAt ?? '',
      applicantName: record.applicantName ?? '',
      applicantEmail: record.applicantEmail ?? '',
      applicantPhone: record.applicantPhone ?? '',
      studentFullName: record.studentFullName,
      studentDateOfBirth: record.studentDateOfBirth ?? '',
      instrument: record.instrument ?? '',
      requestedActivity: opts.activityName?.(record.requestedActivityId) ?? record.requestedActivityId ?? '',
      primaryGuardianName: row.primaryGuardianName,
      primaryGuardianContact: row.primaryGuardianContact,
      consentAccepted: record.consentAccepted ? 'yes' : 'no',
      consentAgreementId: record.consentAgreementId ?? '',
      duplicateScore: duplicate ? Math.round(duplicate.score * 100) : '',
      rejectionReason: record.rejectionReason ?? '',
      duplicateOfStudentId: record.duplicateOfStudentId ?? '',
      convertedStudentId: record.convertedStudentId ?? '',
      convertedEnrollmentId: record.convertedEnrollmentId ?? '',
      statusHistory: statusHistorySummary(record),
    };
    return REGISTRATION_INTAKE_EXPORT_COLUMNS.map(column => csvCell(values[column])).join(',');
  });

  return [
    REGISTRATION_INTAKE_EXPORT_COLUMNS.join(','),
    ...lines,
  ].join('\n');
}

export function applyRegistrationIntakeCorrection(
  record: RegistrationIntake,
  patch: IntakeCorrectionPatch,
  opts: IntakeCorrectionOptions,
): RegistrationIntake {
  const guardians = [...record.guardians];
  const primaryIndex = guardians.findIndex(g => g.isPrimary);
  const targetIndex = primaryIndex >= 0 ? primaryIndex : 0;

  if (
    patch.primaryGuardianFullName !== undefined ||
    patch.primaryGuardianPhone !== undefined ||
    patch.primaryGuardianEmail !== undefined
  ) {
    const existing = guardians[targetIndex] ?? {
      id: `${record.id}-guardian-primary`,
      fullName: '',
      relationship: 'PARENT',
      phone: null,
      email: null,
      isPrimary: true,
    };
    guardians[targetIndex] = {
      ...existing,
      fullName: clean(patch.primaryGuardianFullName) ?? existing.fullName,
      phone: patch.primaryGuardianPhone !== undefined ? clean(patch.primaryGuardianPhone) : existing.phone,
      email: patch.primaryGuardianEmail !== undefined ? clean(patch.primaryGuardianEmail) : existing.email,
      isPrimary: true,
    };
  }

  const nextStatus = record.status === 'PENDING' ? 'IN_REVIEW' : record.status;
  return {
    ...record,
    status: nextStatus,
    applicantName: patch.applicantName !== undefined ? clean(patch.applicantName) : record.applicantName,
    applicantEmail: patch.applicantEmail !== undefined ? clean(patch.applicantEmail) : record.applicantEmail,
    applicantPhone: patch.applicantPhone !== undefined ? clean(patch.applicantPhone) : record.applicantPhone,
    studentFullName: clean(patch.studentFullName) ?? record.studentFullName,
    studentDateOfBirth: patch.studentDateOfBirth !== undefined ? clean(patch.studentDateOfBirth) : record.studentDateOfBirth,
    instrument: patch.instrument !== undefined ? clean(patch.instrument) : record.instrument,
    requestedActivityId: patch.requestedActivityId !== undefined ? clean(patch.requestedActivityId) : record.requestedActivityId,
    notes: patch.notes !== undefined ? clean(patch.notes) : record.notes,
    guardians,
    reviewedBy: opts.reviewedBy,
    reviewedAt: opts.now,
    statusHistory: appendIntakeStatusHistory(record, {
      status: nextStatus,
      fromStatus: record.status,
      now: opts.now,
      by: opts.reviewedBy,
      note: record.status === 'PENDING' ? 'Moved into admin review with corrections.' : 'Admin corrections saved.',
      relatedEntityIds: [record.id],
    }),
    updatedBy: opts.reviewedBy,
    updatedAt: opts.now,
  };
}
