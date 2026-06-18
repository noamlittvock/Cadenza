import type { Student, StaffDocument, Note, RecitalEntry, ReportCard } from '../types';
import type { Family, Guardian as FamilyGuardian } from '../types/blueprint';
import type { ActivityV2 } from '../types/v2';

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

export interface StudentDetailModel {
  kind: 'student';
  student: Student;
  family: Family | null;
  guardians: FamilyGuardian[];
  siblingStudents: Student[];
  enrollments: DetailEnrollmentRow[];
  lessonHistory: string[];
  recitalHistory: RecitalEntry[];
  reportCards: ReportCard[];
  documents: StaffDocument[];
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
  notes: Note[];
  lessonHistory: string[];
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

export function buildStudentDetailModel(
  studentId: string,
  students: Student[],
  families: Family[],
  activities: ActivityV2[],
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

  return {
    kind: 'student',
    student,
    family,
    guardians: guardiansFor(student, family),
    siblingStudents,
    enrollments: enrollmentRowsForStudents([student], activities),
    lessonHistory: student.pedagogicalRecord?.lessonHistory ?? [],
    recitalHistory: student.pedagogicalRecord?.recitalHistory ?? [],
    reportCards: student.pedagogicalRecord?.reportCards ?? [],
    documents: student.documents ?? [],
    notes: student.notes ?? [],
    timeline: timelineForStudent(student, family),
  };
}

export function buildFamilyDetailModel(
  familyId: string,
  students: Student[],
  families: Family[],
  activities: ActivityV2[],
): FamilyDetailModel | null {
  const family = families.find(item => item.id === familyId) ?? null;
  if (!family) return null;
  const linkedStudents = family.studentIds
    .map(id => students.find(item => item.id === id))
    .filter((item): item is Student => Boolean(item));

  return {
    kind: 'family',
    family,
    linkedStudents,
    guardians: guardiansFor(null, family),
    enrollments: enrollmentRowsForStudents(linkedStudents, activities),
    documents: linkedStudents.flatMap(student => student.documents ?? []),
    notes: linkedStudents.flatMap(student => student.notes ?? []),
    lessonHistory: linkedStudents.flatMap(student => student.pedagogicalRecord?.lessonHistory ?? []),
    timeline: timelineForFamily(family, linkedStudents),
  };
}

export function buildStudentFamilyDetailModel(
  target: { kind: 'student'; id: string } | { kind: 'family'; id: string },
  students: Student[],
  families: Family[],
  activities: ActivityV2[],
): StudentFamilyDetailModel | null {
  return target.kind === 'student'
    ? buildStudentDetailModel(target.id, students, families, activities)
    : buildFamilyDetailModel(target.id, students, families, activities);
}
