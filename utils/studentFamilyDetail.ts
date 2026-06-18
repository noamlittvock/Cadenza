import type { CalendarEvent, Student, StaffDocument, Note, RecitalEntry, ReportCard } from '../types';
import type { Family, Guardian as FamilyGuardian, LessonRecord } from '../types/blueprint';
import type { ActivityV2 } from '../types/v2';
import { listStudentLessonHistory } from './blueprintQueries';

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

export interface StudentDetailModel {
  kind: 'student';
  student: Student;
  family: Family | null;
  guardians: FamilyGuardian[];
  siblingStudents: Student[];
  enrollments: DetailEnrollmentRow[];
  lessonHistory: DetailLessonHistoryRow[];
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

export function buildStudentDetailModel(
  studentId: string,
  students: Student[],
  families: Family[],
  activities: ActivityV2[],
  lessons: LessonRecord[] = [],
  events: CalendarEvent[] = [],
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
    lessonHistory: lessonRowsForStudents([student], lessons, events),
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
  lessons: LessonRecord[] = [],
  events: CalendarEvent[] = [],
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
): StudentFamilyDetailModel | null {
  return target.kind === 'student'
    ? buildStudentDetailModel(target.id, students, families, activities, lessons, events)
    : buildFamilyDetailModel(target.id, students, families, activities, lessons, events);
}
