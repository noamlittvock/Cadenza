import type { Student } from '../types';
import type { Family, Guardian as FamilyGuardian } from '../types/blueprint';
import type { StudentV2 } from '../types/v2';
import { studentToV2 } from './canonicalAdapters';
import { fetchCollectionItems, upsertCollectionItems } from './supabaseSync';

type IdFactory = (seed: string) => string;

export interface StudentFamilyWriteContext {
  orgId: string;
  now: string;
  actorId?: string | null;
  idFactory: IdFactory;
}

export interface StudentFamilyRepository {
  fetchStudents(orgId: string): Promise<Student[]>;
  fetchFamilies(orgId: string): Promise<Family[]>;
  upsertStudents(orgId: string, students: Student[]): Promise<void>;
  upsertFamilies(orgId: string, families: Family[]): Promise<void>;
}

export const supabaseStudentFamilyRepository: StudentFamilyRepository = {
  fetchStudents: orgId => fetchCollectionItems<Student>(orgId, 'students'),
  fetchFamilies: orgId => fetchCollectionItems<Family>(orgId, 'families'),
  upsertStudents: (orgId, students) => upsertCollectionItems<Student>(orgId, 'students', students),
  upsertFamilies: (orgId, families) => upsertCollectionItems<Family>(orgId, 'families', families),
};

export interface StudentProfileInput {
  id?: string;
  fullName: string;
  dateOfBirth?: string | null;
  currentGrade?: number | null;
  email?: string | null;
  profileStatus?: Student['profileStatus'];
}

export interface FamilyInput {
  id?: string;
  name: string;
  guardians?: FamilyGuardian[];
  studentIds?: string[];
  primaryContactGuardianId?: string | null;
  billingNotes?: string | null;
  isArchived?: boolean;
}

export interface StudentProfilePatch {
  fullName?: string;
  dateOfBirth?: string | null;
  currentGrade?: number | null;
  email?: string | null;
  profileStatus?: Student['profileStatus'];
}

export interface FamilyPatch {
  name?: string;
  guardians?: FamilyGuardian[];
  studentIds?: string[];
  primaryContactGuardianId?: string | null;
  billingNotes?: string | null;
  isArchived?: boolean;
}

export interface StudentWriteBoundary {
  student: Student;
  studentV2: StudentV2;
}

export interface StudentFamilyWritePlan extends StudentWriteBoundary {
  family: Family;
}

function emptyPedagogicalRecord(): Student['pedagogicalRecord'] {
  return {
    lessonHistory: [],
    recitalHistory: [],
    reportCards: [],
  };
}

function requireName(label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function optionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function optionalLegacyString(value: string | null | undefined): string | undefined {
  return optionalString(value) ?? undefined;
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map(id => id.trim()).filter(Boolean)));
}

function normalizeFamilyGuardians(guardians: FamilyGuardian[] | undefined): FamilyGuardian[] {
  return (guardians ?? []).map(guardian => ({
    id: requireName('guardian.id', guardian.id),
    fullName: requireName('guardian.fullName', guardian.fullName),
    relationship: optionalString(guardian.relationship),
    phone: optionalString(guardian.phone),
    email: optionalString(guardian.email),
    isPrimary: Boolean(guardian.isPrimary),
  }));
}

function resolvePrimaryGuardianId(
  guardians: FamilyGuardian[],
  requestedId: string | null | undefined,
): string | null {
  if (requestedId && guardians.some(guardian => guardian.id === requestedId)) return requestedId;
  return guardians.find(guardian => guardian.isPrimary)?.id ?? guardians[0]?.id ?? null;
}

export function buildStudentWriteBoundary(
  input: StudentProfileInput,
  ctx: StudentFamilyWriteContext,
): StudentWriteBoundary {
  const student: Student = {
    id: input.id ?? ctx.idFactory(`student:${input.fullName}:${ctx.now}`),
    orgId: ctx.orgId,
    fullName: requireName('student.fullName', input.fullName),
    dateOfBirth: optionalString(input.dateOfBirth) ?? '',
    isMinor: false,
    currentGrade: input.currentGrade ?? undefined,
    governmentalId: undefined,
    phone: undefined,
    email: optionalLegacyString(input.email),
    guardians: [],
    assignments: [],
    pedagogicalRecord: emptyPedagogicalRecord(),
    notes: [],
    documents: [],
    profileStatus: input.profileStatus ?? 'ACTIVE',
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };

  return {
    student,
    studentV2: studentToV2(student),
  };
}

export function buildFamilyRecord(
  input: FamilyInput,
  ctx: StudentFamilyWriteContext,
): Family {
  const guardians = normalizeFamilyGuardians(input.guardians);
  return {
    id: input.id ?? ctx.idFactory(`family:${input.name}:${ctx.now}`),
    orgId: ctx.orgId,
    name: requireName('family.name', input.name),
    guardians,
    studentIds: uniqueIds(input.studentIds ?? []),
    primaryContactGuardianId: resolvePrimaryGuardianId(guardians, input.primaryContactGuardianId),
    billingNotes: optionalString(input.billingNotes),
    isArchived: input.isArchived ?? false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    createdBy: ctx.actorId ?? null,
    updatedBy: ctx.actorId ?? null,
  };
}

export function buildCreateStudentFamilyPlan(
  input: { student: StudentProfileInput; family: FamilyInput },
  ctx: StudentFamilyWriteContext,
): StudentFamilyWritePlan {
  const studentBoundary = buildStudentWriteBoundary(input.student, ctx);
  const family = buildFamilyRecord(
    {
      ...input.family,
      studentIds: uniqueIds([...(input.family.studentIds ?? []), studentBoundary.student.id]),
    },
    ctx,
  );

  return { ...studentBoundary, family };
}

export function applyStudentProfilePatch(
  existing: Student,
  patch: StudentProfilePatch,
  ctx: StudentFamilyWriteContext,
): StudentWriteBoundary {
  const next: Student = {
    ...existing,
    orgId: ctx.orgId,
    fullName: patch.fullName !== undefined ? requireName('student.fullName', patch.fullName) : existing.fullName,
    dateOfBirth: patch.dateOfBirth !== undefined ? optionalString(patch.dateOfBirth) ?? '' : existing.dateOfBirth,
    currentGrade: patch.currentGrade !== undefined ? patch.currentGrade ?? undefined : existing.currentGrade,
    email: patch.email !== undefined ? optionalLegacyString(patch.email) : existing.email,
    profileStatus: patch.profileStatus ?? existing.profileStatus,
    updatedAt: ctx.now,
  };

  return {
    student: next,
    studentV2: studentToV2(next),
  };
}

export function applyFamilyPatch(existing: Family, patch: FamilyPatch, ctx: StudentFamilyWriteContext): Family {
  const guardians = patch.guardians !== undefined
    ? normalizeFamilyGuardians(patch.guardians)
    : existing.guardians;

  return {
    ...existing,
    orgId: ctx.orgId,
    name: patch.name !== undefined ? requireName('family.name', patch.name) : existing.name,
    guardians,
    studentIds: patch.studentIds !== undefined ? uniqueIds(patch.studentIds) : existing.studentIds,
    primaryContactGuardianId: patch.primaryContactGuardianId !== undefined
      ? resolvePrimaryGuardianId(guardians, patch.primaryContactGuardianId)
      : resolvePrimaryGuardianId(guardians, existing.primaryContactGuardianId),
    billingNotes: patch.billingNotes !== undefined ? optionalString(patch.billingNotes) : existing.billingNotes,
    isArchived: patch.isArchived ?? existing.isArchived,
    updatedAt: ctx.now,
    updatedBy: ctx.actorId ?? existing.updatedBy ?? null,
  };
}

export function linkStudentsToFamilyRecord(
  family: Family,
  studentIds: string[],
  ctx: StudentFamilyWriteContext,
): Family {
  return applyFamilyPatch(
    family,
    { studentIds: uniqueIds([...(family.studentIds ?? []), ...studentIds]) },
    ctx,
  );
}

export function reconcileFamilyStudentLinks(
  families: Family[],
  targetFamilyId: string,
  studentIds: string[],
  ctx: StudentFamilyWriteContext,
): Family[] {
  const movedStudentIds = uniqueIds(studentIds);
  if (!targetFamilyId || movedStudentIds.length === 0) return families;

  return families.map(family => {
    const currentIds = family.studentIds ?? [];
    const nextIds = family.id === targetFamilyId
      ? uniqueIds([...currentIds, ...movedStudentIds])
      : currentIds.filter(studentId => !movedStudentIds.includes(studentId));

    if (
      nextIds.length === currentIds.length &&
      nextIds.every((studentId, index) => studentId === currentIds[index])
    ) {
      return family;
    }

    return applyFamilyPatch(family, { studentIds: nextIds }, ctx);
  });
}

export function familyIdForStudent(families: Family[], studentId: string): string | null {
  return families.find(family => !family.isArchived && family.studentIds.includes(studentId))?.id ?? null;
}

export async function createStudentFamily(
  repo: StudentFamilyRepository,
  input: { student: StudentProfileInput; family: FamilyInput },
  ctx: StudentFamilyWriteContext,
): Promise<StudentFamilyWritePlan> {
  const plan = buildCreateStudentFamilyPlan(input, ctx);
  await repo.upsertStudents(ctx.orgId, [plan.student]);
  await repo.upsertFamilies(ctx.orgId, [plan.family]);
  return plan;
}

export async function updateStudentAndFamily(
  repo: StudentFamilyRepository,
  existing: { student: Student; family: Family },
  patch: { student?: StudentProfilePatch; family?: FamilyPatch },
  ctx: StudentFamilyWriteContext,
): Promise<StudentFamilyWritePlan> {
  const studentBoundary = patch.student
    ? applyStudentProfilePatch(existing.student, patch.student, ctx)
    : { student: existing.student, studentV2: studentToV2(existing.student) };
  const family = patch.family ? applyFamilyPatch(existing.family, patch.family, ctx) : existing.family;

  await repo.upsertStudents(ctx.orgId, [studentBoundary.student]);
  await repo.upsertFamilies(ctx.orgId, [family]);
  return { ...studentBoundary, family };
}

export async function linkStudentsToFamily(
  repo: StudentFamilyRepository,
  family: Family,
  studentIds: string[],
  ctx: StudentFamilyWriteContext,
): Promise<Family> {
  const next = linkStudentsToFamilyRecord(family, studentIds, ctx);
  await repo.upsertFamilies(ctx.orgId, [next]);
  return next;
}
