import type { Student } from '../types';
import type { Family } from '../types/blueprint';

export type StudentFamilyListMode = 'students' | 'families';
export type StudentFamilyStatusFilter = 'all' | 'active' | 'archived';

export interface StudentFamilyActivityOption {
  id: string;
  label: string;
}

export interface StudentFamilyListFilters {
  mode: StudentFamilyListMode;
  query: string;
  status: StudentFamilyStatusFilter;
  activityId: string;
}

export interface StudentListRow {
  kind: 'student';
  id: string;
  fullName: string;
  familyId: string | null;
  familyName: string;
  guardianNames: string[];
  guardianContact: string;
  status: 'ACTIVE' | 'ARCHIVED';
  activityIds: string[];
  activeAssignmentCount: number;
  updatedAt: string;
}

export interface FamilyListRow {
  kind: 'family';
  id: string;
  name: string;
  guardianNames: string[];
  guardianContact: string;
  studentNames: string[];
  studentCount: number;
  activeStudentCount: number;
  status: 'ACTIVE' | 'ARCHIVED';
  activityIds: string[];
  updatedAt: string;
}

export type StudentFamilyListRow = StudentListRow | FamilyListRow;

export interface StudentFamilyListModel {
  rows: StudentFamilyListRow[];
  totalRows: number;
  totalStudents: number;
  activeStudents: number;
  archivedStudents: number;
  totalFamilies: number;
  activeFamilies: number;
  archivedFamilies: number;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function familyForStudent(families: Family[], studentId: string): Family | null {
  return families.find(family => !family.isArchived && family.studentIds.includes(studentId))
    ?? families.find(family => family.studentIds.includes(studentId))
    ?? null;
}

function guardianValues(
  family: Family | null,
  student: Student | null,
): { names: string[]; contact: string; searchable: string[] } {
  const familyGuardians = family?.guardians ?? [];
  const legacyGuardians = familyGuardians.length > 0 ? [] : student?.guardians ?? [];
  const guardians = [...familyGuardians, ...legacyGuardians];

  const names = guardians.map(guardian => guardian.fullName).filter(Boolean);
  const contact = guardians
    .map(guardian => {
      const bits = [
        guardian.phone ?? null,
        guardian.email ?? null,
      ].filter(Boolean);
      return bits.join(' · ');
    })
    .filter(Boolean)
    .join(' · ');

  const searchable = guardians.flatMap(guardian => [
    guardian.fullName,
    guardian.relationship ?? null,
    guardian.phone ?? null,
    guardian.email ?? null,
  ].filter(Boolean) as string[]);

  return { names, contact, searchable };
}

function studentActivityIds(student: Student): string[] {
  return unique(
    (student.assignments ?? [])
      .filter(assignment => assignment.status !== 'ARCHIVED')
      .map(assignment => assignment.activityId),
  );
}

function studentMatchesActivity(student: Student, activityId: string): boolean {
  if (!activityId || activityId === 'all') return true;
  return (student.assignments ?? []).some(
    assignment => assignment.status !== 'ARCHIVED' && assignment.activityId === activityId,
  );
}

export function buildStudentRows(students: Student[], families: Family[]): StudentListRow[] {
  return students
    .map(student => {
      const family = familyForStudent(families, student.id);
      const guardian = guardianValues(family, student);
      return {
        kind: 'student' as const,
        id: student.id,
        fullName: student.fullName,
        familyId: family?.id ?? null,
        familyName: family?.name ?? '',
        guardianNames: guardian.names,
        guardianContact: guardian.contact,
        status: student.profileStatus,
        activityIds: studentActivityIds(student),
        activeAssignmentCount: (student.assignments ?? []).filter(assignment => assignment.status !== 'ARCHIVED').length,
        updatedAt: student.updatedAt,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function buildFamilyRows(students: Student[], families: Family[]): FamilyListRow[] {
  const studentById = new Map(students.map(student => [student.id, student]));

  return families
    .map(family => {
      const linkedStudents = family.studentIds
        .map(studentId => studentById.get(studentId))
        .filter((student): student is Student => Boolean(student));
      const guardian = guardianValues(family, null);
      const activityIds = unique(linkedStudents.flatMap(student => studentActivityIds(student)));
      return {
        kind: 'family' as const,
        id: family.id,
        name: family.name,
        guardianNames: guardian.names,
        guardianContact: guardian.contact,
        studentNames: linkedStudents.map(student => student.fullName).sort((a, b) => a.localeCompare(b)),
        studentCount: linkedStudents.length,
        activeStudentCount: linkedStudents.filter(student => student.profileStatus !== 'ARCHIVED').length,
        status: family.isArchived ? 'ARCHIVED' as const : 'ACTIVE' as const,
        activityIds,
        updatedAt: family.updatedAt,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function rowMatchesStatus(row: StudentFamilyListRow, status: StudentFamilyStatusFilter): boolean {
  if (status === 'all') return true;
  return status === 'archived' ? row.status === 'ARCHIVED' : row.status !== 'ARCHIVED';
}

function rowMatchesActivity(row: StudentFamilyListRow, activityId: string): boolean {
  if (!activityId || activityId === 'all') return true;
  return row.activityIds.includes(activityId);
}

function rowSearchText(row: StudentFamilyListRow): string {
  const base = row.kind === 'student'
    ? [
        row.fullName,
        row.familyName,
        ...row.guardianNames,
        row.guardianContact,
      ]
    : [
        row.name,
        ...row.guardianNames,
        row.guardianContact,
        ...row.studentNames,
      ];
  return normalize(base.join(' '));
}

export function filterStudentFamilyRows(
  rows: StudentFamilyListRow[],
  filters: Omit<StudentFamilyListFilters, 'mode'>,
): StudentFamilyListRow[] {
  const query = normalize(filters.query);
  return rows.filter(row => {
    if (!rowMatchesStatus(row, filters.status)) return false;
    if (!rowMatchesActivity(row, filters.activityId)) return false;
    if (!query) return true;
    return rowSearchText(row).includes(query);
  });
}

export function buildStudentFamilyActivityOptions(
  students: Student[],
  labelsByActivityId: Record<string, string> = {},
): StudentFamilyActivityOption[] {
  const ids = unique(students.flatMap(student => studentActivityIds(student)));
  return ids
    .map(id => ({ id, label: labelsByActivityId[id] ?? id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildStudentFamilyListModel(
  students: Student[],
  families: Family[],
  filters: StudentFamilyListFilters,
): StudentFamilyListModel {
  const studentRows = buildStudentRows(students, families);
  const familyRows = buildFamilyRows(students, families);
  const sourceRows = filters.mode === 'students' ? studentRows : familyRows;
  const rows = filterStudentFamilyRows(sourceRows, filters);

  return {
    rows,
    totalRows: sourceRows.length,
    totalStudents: studentRows.length,
    activeStudents: studentRows.filter(row => row.status !== 'ARCHIVED').length,
    archivedStudents: studentRows.filter(row => row.status === 'ARCHIVED').length,
    totalFamilies: familyRows.length,
    activeFamilies: familyRows.filter(row => row.status !== 'ARCHIVED').length,
    archivedFamilies: familyRows.filter(row => row.status === 'ARCHIVED').length,
  };
}
