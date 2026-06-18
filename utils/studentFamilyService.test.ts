import { describe, expect, it } from 'vitest';
import type { Student } from '../types';
import type { Family, Guardian as FamilyGuardian } from '../types/blueprint';
import {
  applyFamilyPatch,
  applyStudentProfilePatch,
  buildCreateStudentFamilyPlan,
  createStudentFamily,
  familyIdForStudent,
  linkStudentsToFamily,
  linkStudentsToFamilyRecord,
  reconcileFamilyStudentLinks,
  updateStudentAndFamily,
  type StudentFamilyRepository,
  type StudentFamilyWriteContext,
} from './studentFamilyService';

const NOW = '2026-06-18T12:00:00.000Z';
const LATER = '2026-06-18T13:00:00.000Z';

const ctx: StudentFamilyWriteContext = {
  orgId: 'org_1',
  now: NOW,
  actorId: 'admin_1',
  idFactory: seed => `id:${seed}`,
};

const guardians: FamilyGuardian[] = [
  {
    id: 'guardian_1',
    fullName: 'Ron Cohen',
    relationship: 'PARENT',
    phone: '050-2222222',
    email: 'ron@example.com',
    isPrimary: true,
  },
  {
    id: 'guardian_2',
    fullName: 'Mia Cohen',
    relationship: null,
    phone: null,
    email: 'mia@example.com',
    isPrimary: false,
  },
];

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'stu_1',
    orgId: 'org_1',
    fullName: 'Dana Cohen',
    dateOfBirth: '2012-03-01',
    isMinor: false,
    currentGrade: 6,
    governmentalId: undefined,
    phone: undefined,
    email: 'dana@example.com',
    guardians: [],
    assignments: [],
    pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
    notes: [],
    documents: [],
    profileStatus: 'ACTIVE',
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-06-01T08:00:00.000Z',
    ...overrides,
  };
}

function makeFamily(overrides: Partial<Family> = {}): Family {
  return {
    id: 'fam_1',
    orgId: 'org_1',
    name: 'Cohen Family',
    guardians,
    studentIds: ['stu_1'],
    primaryContactGuardianId: 'guardian_1',
    billingNotes: null,
    isArchived: false,
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-06-01T08:00:00.000Z',
    createdBy: 'admin_1',
    updatedBy: 'admin_1',
    ...overrides,
  };
}

function makeRepo() {
  const savedStudents: Student[][] = [];
  const savedFamilies: Family[][] = [];
  const repo: StudentFamilyRepository = {
    fetchStudents: async () => [],
    fetchFamilies: async () => [],
    upsertStudents: async (_orgId, students) => { savedStudents.push(students); },
    upsertFamilies: async (_orgId, families) => { savedFamilies.push(families); },
  };
  return { repo, savedStudents, savedFamilies };
}

describe('buildCreateStudentFamilyPlan', () => {
  it('creates a legacy student write plus canonical StudentV2 boundary and family guardians jsonb', () => {
    const plan = buildCreateStudentFamilyPlan(
      {
        student: {
          id: 'stu_new',
          fullName: '  Dana Cohen  ',
          dateOfBirth: '2012-03-01',
          currentGrade: 6,
          email: ' dana@example.com ',
        },
        family: {
          id: 'fam_new',
          name: ' Cohen Family ',
          guardians,
          studentIds: ['stu_new', 'stu_sibling', 'stu_sibling'],
          billingNotes: '  annual payer  ',
        },
      },
      ctx,
    );

    expect(plan.student).toMatchObject({
      id: 'stu_new',
      orgId: 'org_1',
      fullName: 'Dana Cohen',
      dateOfBirth: '2012-03-01',
      currentGrade: 6,
      email: 'dana@example.com',
      guardians: [],
      profileStatus: 'ACTIVE',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(plan.studentV2).toMatchObject({
      id: 'stu_new',
      orgId: 'org_1',
      fullName: 'Dana Cohen',
      grade: '6',
      parentName: null,
      parentPhone: null,
      isArchived: false,
    });
    expect((plan.studentV2 as unknown as Record<string, unknown>).familyId).toBeUndefined();
    expect((plan.studentV2 as unknown as Record<string, unknown>).guardians).toBeUndefined();

    expect(plan.family).toMatchObject({
      id: 'fam_new',
      orgId: 'org_1',
      name: 'Cohen Family',
      guardians,
      studentIds: ['stu_new', 'stu_sibling'],
      primaryContactGuardianId: 'guardian_1',
      billingNotes: 'annual payer',
      isArchived: false,
      createdBy: 'admin_1',
      updatedBy: 'admin_1',
    });
  });
});

describe('update helpers', () => {
  it('updates student profile fields through studentToV2 without touching family guardian data', () => {
    const updated = applyStudentProfilePatch(
      makeStudent({ guardians: [{ id: 'legacy_guardian', fullName: 'Legacy Parent' }] }),
      { fullName: 'Dana Levi', currentGrade: null, email: null, profileStatus: 'ARCHIVED' },
      { ...ctx, now: LATER },
    );

    expect(updated.student).toMatchObject({
      fullName: 'Dana Levi',
      currentGrade: undefined,
      email: undefined,
      profileStatus: 'ARCHIVED',
      updatedAt: LATER,
    });
    expect(updated.student.guardians).toEqual([{ id: 'legacy_guardian', fullName: 'Legacy Parent' }]);
    expect(updated.studentV2).toMatchObject({
      fullName: 'Dana Levi',
      grade: null,
      email: null,
      isArchived: true,
    });
  });

  it('updates a family as the guardian source of truth and normalizes primary contact', () => {
    const patched = applyFamilyPatch(
      makeFamily(),
      {
        name: 'Levi Family',
        guardians: [
          { id: 'guardian_3', fullName: 'Noa Levi', relationship: '', phone: '', email: ' noa@example.com ', isPrimary: false },
        ],
        primaryContactGuardianId: 'missing_guardian',
        billingNotes: null,
      },
      { ...ctx, now: LATER },
    );

    expect(patched).toMatchObject({
      name: 'Levi Family',
      guardians: [
        {
          id: 'guardian_3',
          fullName: 'Noa Levi',
          relationship: null,
          phone: null,
          email: 'noa@example.com',
          isPrimary: false,
        },
      ],
      primaryContactGuardianId: 'guardian_3',
      billingNotes: null,
      updatedAt: LATER,
      updatedBy: 'admin_1',
    });
  });
});

describe('student/family service persistence', () => {
  it('persists create plans through the existing collection-shaped repository', async () => {
    const { repo, savedStudents, savedFamilies } = makeRepo();

    const plan = await createStudentFamily(
      repo,
      {
        student: { id: 'stu_new', fullName: 'Dana Cohen' },
        family: { id: 'fam_new', name: 'Cohen Family', guardians },
      },
      ctx,
    );

    expect(savedStudents).toEqual([[plan.student]]);
    expect(savedFamilies).toEqual([[plan.family]]);
    expect(plan.family.studentIds).toEqual(['stu_new']);
    expect(plan.family.guardians).toEqual(guardians);
  });

  it('persists student and family updates together', async () => {
    const { repo, savedStudents, savedFamilies } = makeRepo();

    const plan = await updateStudentAndFamily(
      repo,
      { student: makeStudent(), family: makeFamily() },
      {
        student: { fullName: 'Dana Updated' },
        family: { billingNotes: 'card on file' },
      },
      { ...ctx, now: LATER },
    );

    expect(plan.studentV2.fullName).toBe('Dana Updated');
    expect(plan.family.billingNotes).toBe('card on file');
    expect(savedStudents).toEqual([[plan.student]]);
    expect(savedFamilies).toEqual([[plan.family]]);
  });
});

describe('family linking helpers', () => {
  it('links sibling students to the existing editable family without duplicates', async () => {
    const { repo, savedFamilies } = makeRepo();
    const next = await linkStudentsToFamily(
      repo,
      makeFamily({ studentIds: ['stu_1'] }),
      ['stu_2', 'stu_1', 'stu_3'],
      { ...ctx, now: LATER },
    );

    expect(next.studentIds).toEqual(['stu_1', 'stu_2', 'stu_3']);
    expect(next.updatedAt).toBe(LATER);
    expect(savedFamilies).toEqual([[next]]);
  });

  it('derives active family membership for query projections', () => {
    const active = makeFamily({ id: 'fam_active', studentIds: ['stu_1'] });
    const archived = makeFamily({ id: 'fam_archived', isArchived: true, studentIds: ['stu_2'] });

    expect(familyIdForStudent([archived, active], 'stu_1')).toBe('fam_active');
    expect(familyIdForStudent([archived, active], 'stu_2')).toBeNull();
    expect(linkStudentsToFamilyRecord(active, ['stu_1', 'stu_4'], { ...ctx, now: LATER }).studentIds)
      .toEqual(['stu_1', 'stu_4']);
  });

  it('moves selected students into one editable family and removes prior family links', () => {
    const first = makeFamily({ id: 'fam_1', studentIds: ['stu_1', 'stu_2'] });
    const second = makeFamily({ id: 'fam_2', studentIds: ['stu_3'] });
    const untouched = makeFamily({ id: 'fam_3', studentIds: ['stu_4'] });

    const next = reconcileFamilyStudentLinks(
      [first, second, untouched],
      'fam_2',
      ['stu_1', 'stu_3'],
      { ...ctx, now: LATER },
    );

    expect(next.find(family => family.id === 'fam_1')?.studentIds).toEqual(['stu_2']);
    expect(next.find(family => family.id === 'fam_2')?.studentIds).toEqual(['stu_3', 'stu_1']);
    expect(next.find(family => family.id === 'fam_3')).toBe(untouched);
    expect(next.find(family => family.id === 'fam_1')?.updatedAt).toBe(LATER);
    expect(next.find(family => family.id === 'fam_2')?.updatedAt).toBe(LATER);
  });
});
