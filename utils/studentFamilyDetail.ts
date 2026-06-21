import type { CalendarEvent, Student, StaffDocument, Note, RecitalEntry, ReportCard as LegacyReportCard } from '../types';
import type {
  AgreementAcceptance,
  AgreementKind,
  AgreementTemplate,
  Certificate,
  ExamSession,
  ExaminerSubmission,
  Family,
  Guardian as FamilyGuardian,
  LessonRecord,
  ReportCard as BlueprintReportCard,
} from '../types/blueprint';
import type { ActivityV2 } from '../types/v2';
import { getStudentAssessmentSummary, listExamSessions, listStudentLessonHistory, listUnsignedAgreements, type RequiredAgreementTarget } from './blueprintQueries';

export type StudentFamilyDetailTab =
  | 'profile'
  | 'guardians'
  | 'enrollments'
  | 'lessons'
  | 'finance'
  | 'documents'
  | 'agreements'
  | 'history';

export interface DetailEnrollmentRow {
  id: string;
  studentId: string;
  studentName: string;
  activityName: string;
  staffMemberId: string;
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface DetailTimelineItem {
  id: string;
  label: string;
  at: string;
}

export interface DetailLessonHistoryRow {
  id: string;
  source: 'normalized' | 'legacy';
  studentId: string;
  studentName: string;
  date: string | null;
  eventId: string | null;
  eventName: string | null;
  attendance: LessonRecord['attendance'] | null;
  completion: LessonRecord['completion'] | null;
  notes: string | null;
  repertoire: string[];
  homework: string | null;
  summary: string | null;
}

export interface DetailUnsignedAgreementRow {
  id: string;
  templateId: string;
  templateTitle: string;
  kind: AgreementKind;
  version: number;
  reason: 'NEVER_ACCEPTED' | 'SUPERSEDED_VERSION';
  studentId: string | null;
  studentName: string | null;
  familyId: string | null;
  familyName: string | null;
  enrollmentId: string | null;
  enrollmentLabel: string | null;
  guardianId: string | null;
  guardianName: string | null;
}

export interface DetailAgreementHistoryRow {
  id: string;
  templateId: string;
  templateTitle: string;
  kind: AgreementKind | 'UNKNOWN';
  version: number;
  status: AgreementAcceptance['status'];
  studentId: string | null;
  studentName: string | null;
  familyId: string | null;
  familyName: string | null;
  enrollmentId: string | null;
  enrollmentLabel: string | null;
  guardianId: string | null;
  guardianName: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  signatureRef: string | null;
  createdAt: string;
}

export interface DetailAgreementModel {
  unsigned: DetailUnsignedAgreementRow[];
  history: DetailAgreementHistoryRow[];
  acceptedCount: number;
  pendingCount: number;
  declinedCount: number;
  expiredCount: number;
  supersededCount: number;
}

export interface DetailAssessmentSessionRow {
  id: string;
  name: string;
  date: string;
  status: ExamSession['status'];
  activityName: string | null;
  submittedCount: number;
  expectedCount: number;
}

export interface DetailAssessmentModel {
  examCount: number;
  averageScore: number | null;
  bestGrade: string | null;
  issuedCertificateCount: number;
  draftReportCardCount: number;
  releasedReportCardCount: number;
  sessions: DetailAssessmentSessionRow[];
  submissions: ExaminerSubmission[];
  certificates: Certificate[];
  reportCards: BlueprintReportCard[];
}

export interface StudentDetailModel {
  kind: 'student';
  student: Student;
  family: Family | null;
  guardians: FamilyGuardian[];
  siblingStudents: Student[];
  enrollments: DetailEnrollmentRow[];
  lessonHistory: DetailLessonHistoryRow[];
  recitalHistory: RecitalEntry[];
  reportCards: LegacyReportCard[];
  assessments: DetailAssessmentModel;
  documents: StaffDocument[];
  agreements: DetailAgreementModel;
  notes: Note[];
  timeline: DetailTimelineItem[];
}

export interface FamilyDetailModel {
  kind: 'family';
  family: Family;
  linkedStudents: Student[];
  guardians: FamilyGuardian[];
  enrollments: DetailEnrollmentRow[];
  documents: StaffDocument[];
  agreements: DetailAgreementModel;
  notes: Note[];
  lessonHistory: DetailLessonHistoryRow[];
  timeline: DetailTimelineItem[];
}

export type StudentFamilyDetailModel = StudentDetailModel | FamilyDetailModel;

function familyForStudent(families: Family[], studentId: string): Family | null {
  return families.find(family => !family.isArchived && family.studentIds.includes(studentId))
    ?? families.find(family => family.studentIds.includes(studentId))
    ?? null;
}

function legacyGuardiansToFamilyGuardians(student: Student): FamilyGuardian[] {
  return (student.guardians ?? []).map((guardian, index) => ({
    id: guardian.id,
    fullName: guardian.fullName,
    relationship: guardian.relationship ?? null,
    phone: guardian.phone ?? null,
    email: guardian.email ?? null,
    isPrimary: index === 0,
  }));
}

function guardiansFor(student: Student | null, family: Family | null): FamilyGuardian[] {
  if (family?.guardians.length) return family.guardians;
  return student ? legacyGuardiansToFamilyGuardians(student) : [];
}

function activityNameById(activities: ActivityV2[]): Map<string, string> {
  return new Map(activities.map(activity => [activity.id, activity.name]));
}

function enrollmentRowsForStudents(students: Student[], activities: ActivityV2[]): DetailEnrollmentRow[] {
  const activityNames = activityNameById(activities);
  return students.flatMap(student =>
    (student.assignments ?? []).map(assignment => ({
      id: assignment.id,
      studentId: student.id,
      studentName: student.fullName,
      activityName: activityNames.get(assignment.activityId) ?? assignment.activityId,
      staffMemberId: assignment.staffMemberId,
      startDate: assignment.startDate,
      endDate: assignment.endDate ?? null,
      status: assignment.status,
    })),
  ).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1;
    return a.studentName.localeCompare(b.studentName) || a.activityName.localeCompare(b.activityName);
  });
}

function timelineForStudent(student: Student, family: Family | null): DetailTimelineItem[] {
  const items: DetailTimelineItem[] = [
    { id: `${student.id}:created`, label: 'created', at: student.createdAt },
    { id: `${student.id}:updated`, label: 'updated', at: student.updatedAt },
  ];
  if (student.profileStatus === 'ARCHIVED') {
    items.push({ id: `${student.id}:archived`, label: 'archived', at: student.updatedAt });
  }
  if (family) {
    items.push({ id: `${family.id}:family-updated`, label: 'family_updated', at: family.updatedAt });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

function buildAssessmentModel(
  studentId: string,
  activities: ActivityV2[],
  examSessions: ExamSession[] = [],
  examinerSubmissions: ExaminerSubmission[] = [],
  certificates: Certificate[] = [],
  reportCards: BlueprintReportCard[] = [],
): DetailAssessmentModel {
  const activityNames = activityNameById(activities);
  const summary = getStudentAssessmentSummary(studentId, examinerSubmissions, certificates, reportCards);
  const sessions = listExamSessions(examSessions, { studentId })
    .filter(session => session.status !== 'CANCELLED')
    .map(session => {
      const sessionSubmissions = examinerSubmissions.filter(row => row.examSessionId === session.id && row.studentId === studentId);
      return {
        id: session.id,
        name: session.name,
        date: session.date,
        status: session.status,
        activityName: session.activityId ? activityNames.get(session.activityId) ?? session.activityId : null,
        submittedCount: sessionSubmissions.filter(row => row.submittedAt).length,
        expectedCount: Math.max(1, session.examinerStaffIds.length),
      };
    });

  return {
    examCount: summary.examCount,
    averageScore: summary.averageScore,
    bestGrade: summary.bestGrade,
    issuedCertificateCount: summary.certificates,
    draftReportCardCount: summary.reportCards.draft,
    releasedReportCardCount: summary.reportCards.released,
    sessions,
    submissions: summary.submissions,
    certificates: certificates
      .filter(certificate => certificate.studentId === studentId)
      .sort((a, b) => (b.issuedAt ?? b.createdAt).localeCompare(a.issuedAt ?? a.createdAt) || a.id.localeCompare(b.id)),
    reportCards: summary.reportCards.items,
  };
}

function timelineForFamily(family: Family, linkedStudents: Student[]): DetailTimelineItem[] {
  const items: DetailTimelineItem[] = [
    { id: `${family.id}:created`, label: 'created', at: family.createdAt },
    { id: `${family.id}:updated`, label: 'updated', at: family.updatedAt },
  ];
  if (family.isArchived) {
    items.push({ id: `${family.id}:archived`, label: 'archived', at: family.updatedAt });
  }
  for (const student of linkedStudents) {
    items.push({ id: `${student.id}:student-updated`, label: 'student_updated', at: student.updatedAt });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

function legacyLessonRows(student: Student): DetailLessonHistoryRow[] {
  return (student.pedagogicalRecord?.lessonHistory ?? []).map((entry, index) => ({
    id: `${student.id}:legacy-lesson:${index}`,
    source: 'legacy',
    studentId: student.id,
    studentName: student.fullName,
    date: null,
    eventId: null,
    eventName: null,
    attendance: null,
    completion: null,
    notes: null,
    repertoire: [],
    homework: null,
    summary: entry,
  }));
}

function lessonRowsForStudents(
  targetStudents: Student[],
  lessons: LessonRecord[],
  events: CalendarEvent[],
): DetailLessonHistoryRow[] {
  const studentById = new Map(targetStudents.map(student => [student.id, student]));
  const eventById = new Map(events.map(event => [event.id, event]));
  const normalizedRows = targetStudents.flatMap(student =>
    listStudentLessonHistory(lessons, student.id).map(lesson => {
      const event = eventById.get(lesson.eventId);
      return {
        id: lesson.id,
        source: 'normalized' as const,
        studentId: lesson.studentId,
        studentName: studentById.get(lesson.studentId)?.fullName ?? lesson.studentId,
        date: lesson.date,
        eventId: lesson.eventId,
        eventName: event?.name ?? null,
        attendance: lesson.attendance,
        completion: lesson.completion,
        notes: lesson.notes,
        repertoire: lesson.repertoire,
        homework: lesson.homework,
        summary: null,
      };
    }),
  );

  return [
    ...normalizedRows,
    ...targetStudents.flatMap(legacyLessonRows),
  ].sort((a, b) => {
    const dateA = a.date ?? '';
    const dateB = b.date ?? '';
    return dateB.localeCompare(dateA) || a.studentName.localeCompare(b.studentName) || a.id.localeCompare(b.id);
  });
}

function guardianNameById(family: Family | null, guardianId: string | null | undefined): string | null {
  if (!family || !guardianId) return null;
  return family.guardians.find(guardian => guardian.id === guardianId)?.fullName ?? guardianId;
}

function enrollmentLabelById(enrollments: DetailEnrollmentRow[]): Map<string, string> {
  return new Map(enrollments.map(row => [row.id, `${row.activityName} · ${row.studentName}`]));
}

function agreementTargetsForContext(
  templates: AgreementTemplate[],
  targetStudents: Student[],
  family: Family | null,
  enrollments: DetailEnrollmentRow[],
): RequiredAgreementTarget[] {
  const targets: RequiredAgreementTarget[] = [];
  const primaryGuardianId = family?.primaryContactGuardianId ?? undefined;
  const studentIds = new Set(targetStudents.map(student => student.id));
  const activeEnrollmentRows = enrollments.filter(row => row.status === 'ACTIVE');

  for (const template of templates.filter(row => row.isActive)) {
    if (template.kind === 'FINANCIAL') {
      if (family) {
        targets.push({
          studentId: null,
          familyId: family.id,
          guardianId: primaryGuardianId,
          kind: template.kind,
          templateId: template.id,
        });
      }
      continue;
    }

    if (template.kind === 'ENROLLMENT' && activeEnrollmentRows.length > 0) {
      for (const enrollment of activeEnrollmentRows) {
        const studentId = studentIds.has(enrollment.studentId) ? enrollment.studentId : null;
        targets.push({
          studentId,
          familyId: family?.id ?? undefined,
          enrollmentId: enrollment.id,
          guardianId: primaryGuardianId,
          kind: template.kind,
          templateId: template.id,
        });
      }
      continue;
    }

    for (const student of targetStudents) {
      targets.push({
        studentId: student.id,
        familyId: family?.id ?? undefined,
        guardianId: primaryGuardianId,
        kind: template.kind,
        templateId: template.id,
      });
    }
  }

  return targets;
}

function buildAgreementModel(
  targetStudents: Student[],
  family: Family | null,
  enrollments: DetailEnrollmentRow[],
  templates: AgreementTemplate[],
  acceptances: AgreementAcceptance[],
): DetailAgreementModel {
  const studentById = new Map(targetStudents.map(student => [student.id, student]));
  const templateById = new Map(templates.map(template => [template.id, template]));
  const linkedStudentIds = new Set(targetStudents.map(student => student.id));
  const enrollmentIds = new Set(enrollments.map(row => row.id));
  const enrollmentLabels = enrollmentLabelById(enrollments);

  const related = acceptances.filter(row => (
    (row.studentId !== null && linkedStudentIds.has(row.studentId)) ||
    (family !== null && row.familyId === family.id) ||
    (row.enrollmentId !== null && enrollmentIds.has(row.enrollmentId))
  ));

  const history = related
    .map(row => {
      const template = templateById.get(row.templateId);
      const kind: AgreementKind | 'UNKNOWN' = template?.kind ?? 'UNKNOWN';
      return {
        id: row.id,
        templateId: row.templateId,
        templateTitle: template?.title ?? row.templateId,
        kind,
        version: row.templateVersion,
        status: row.status,
        studentId: row.studentId,
        studentName: row.studentId ? studentById.get(row.studentId)?.fullName ?? row.studentId : null,
        familyId: row.familyId,
        familyName: row.familyId ? family?.name ?? row.familyId : null,
        enrollmentId: row.enrollmentId,
        enrollmentLabel: row.enrollmentId ? enrollmentLabels.get(row.enrollmentId) ?? row.enrollmentId : null,
        guardianId: row.guardianId,
        guardianName: guardianNameById(family, row.guardianId),
        acceptedAt: row.acceptedAt,
        acceptedByName: row.acceptedByName,
        signatureRef: row.signatureRef,
        createdAt: row.createdAt,
      };
    })
    .sort((a, b) =>
      (b.acceptedAt ?? b.createdAt).localeCompare(a.acceptedAt ?? a.createdAt) ||
      a.templateTitle.localeCompare(b.templateTitle) ||
      a.id.localeCompare(b.id));

  const unsigned = listUnsignedAgreements(
    templates,
    acceptances,
    agreementTargetsForContext(templates, targetStudents, family, enrollments),
  ).map(row => ({
    id: `${row.template.id}:${row.studentId ?? ''}:${row.familyId ?? ''}:${row.enrollmentId ?? ''}:${row.guardianId ?? ''}`,
    templateId: row.template.id,
    templateTitle: row.template.title,
    kind: row.template.kind,
    version: row.template.version,
    reason: row.reason,
    studentId: row.studentId,
    studentName: row.studentId ? studentById.get(row.studentId)?.fullName ?? row.studentId : null,
    familyId: row.familyId,
    familyName: row.familyId ? family?.name ?? row.familyId : null,
    enrollmentId: row.enrollmentId,
    enrollmentLabel: row.enrollmentId ? enrollmentLabels.get(row.enrollmentId) ?? row.enrollmentId : null,
    guardianId: row.guardianId,
    guardianName: guardianNameById(family, row.guardianId),
  }));

  return {
    unsigned,
    history,
    acceptedCount: history.filter(row => row.status === 'ACCEPTED').length,
    pendingCount: history.filter(row => row.status === 'PENDING').length,
    declinedCount: history.filter(row => row.status === 'DECLINED').length,
    expiredCount: history.filter(row => row.status === 'EXPIRED').length,
    supersededCount: history.filter(row => row.status === 'SUPERSEDED').length,
  };
}

export function buildStudentDetailModel(
  studentId: string,
  students: Student[],
  families: Family[],
  activities: ActivityV2[],
  lessons: LessonRecord[] = [],
  events: CalendarEvent[] = [],
  agreementTemplates: AgreementTemplate[] = [],
  agreementAcceptances: AgreementAcceptance[] = [],
  examSessions: ExamSession[] = [],
  examinerSubmissions: ExaminerSubmission[] = [],
  certificates: Certificate[] = [],
  reportCards: BlueprintReportCard[] = [],
): StudentDetailModel | null {
  const student = students.find(item => item.id === studentId) ?? null;
  if (!student) return null;
  const family = familyForStudent(families, student.id);
  const siblingStudents = family
    ? family.studentIds
        .filter(id => id !== student.id)
        .map(id => students.find(item => item.id === id))
        .filter((item): item is Student => Boolean(item))
    : [];
  const enrollments = enrollmentRowsForStudents([student], activities);

  return {
    kind: 'student',
    student,
    family,
    guardians: guardiansFor(student, family),
    siblingStudents,
    enrollments,
    lessonHistory: lessonRowsForStudents([student], lessons, events),
    recitalHistory: student.pedagogicalRecord?.recitalHistory ?? [],
    reportCards: student.pedagogicalRecord?.reportCards ?? [],
    assessments: buildAssessmentModel(student.id, activities, examSessions, examinerSubmissions, certificates, reportCards),
    documents: student.documents ?? [],
    agreements: buildAgreementModel([student], family, enrollments, agreementTemplates, agreementAcceptances),
    notes: student.notes ?? [],
    timeline: timelineForStudent(student, family),
  };
}

export function buildFamilyDetailModel(
  familyId: string,
  students: Student[],
  families: Family[],
  activities: ActivityV2[],
  lessons: LessonRecord[] = [],
  events: CalendarEvent[] = [],
  agreementTemplates: AgreementTemplate[] = [],
  agreementAcceptances: AgreementAcceptance[] = [],
): FamilyDetailModel | null {
  const family = families.find(item => item.id === familyId) ?? null;
  if (!family) return null;
  const linkedStudents = family.studentIds
    .map(id => students.find(item => item.id === id))
    .filter((item): item is Student => Boolean(item));
  const enrollments = enrollmentRowsForStudents(linkedStudents, activities);

  return {
    kind: 'family',
    family,
    linkedStudents,
    guardians: guardiansFor(null, family),
    enrollments,
    documents: linkedStudents.flatMap(student => student.documents ?? []),
    agreements: buildAgreementModel(linkedStudents, family, enrollments, agreementTemplates, agreementAcceptances),
    notes: linkedStudents.flatMap(student => student.notes ?? []),
    lessonHistory: lessonRowsForStudents(linkedStudents, lessons, events),
    timeline: timelineForFamily(family, linkedStudents),
  };
}

export function buildStudentFamilyDetailModel(
  target: { kind: 'student'; id: string } | { kind: 'family'; id: string },
  students: Student[],
  families: Family[],
  activities: ActivityV2[],
  lessons: LessonRecord[] = [],
  events: CalendarEvent[] = [],
  agreementTemplates: AgreementTemplate[] = [],
  agreementAcceptances: AgreementAcceptance[] = [],
  examSessions: ExamSession[] = [],
  examinerSubmissions: ExaminerSubmission[] = [],
  certificates: Certificate[] = [],
  reportCards: BlueprintReportCard[] = [],
): StudentFamilyDetailModel | null {
  return target.kind === 'student'
    ? buildStudentDetailModel(target.id, students, families, activities, lessons, events, agreementTemplates, agreementAcceptances, examSessions, examinerSubmissions, certificates, reportCards)
    : buildFamilyDetailModel(target.id, students, families, activities, lessons, events, agreementTemplates, agreementAcceptances);
}
