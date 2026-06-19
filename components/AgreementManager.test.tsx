import { describe, expect, it } from 'vitest';
import type { Student } from '../types';
import type { AgreementAcceptance, AgreementTemplate, Family } from '../types/blueprint';
import {
  buildAgreementTemplateSummaries,
  buildAgreementUnsignedTargets,
  buildAgreementPdfAcceptanceUpdate,
  buildNextAgreementTemplateVersion,
  buildPendingAgreementRequest,
  filterAgreementTemplateSummaries,
} from './AgreementManager';

const NOW = '2026-06-19T12:00:00.000Z';
const base = { orgId: 'org_1', createdAt: NOW, updatedAt: NOW, createdBy: 'admin_1', updatedBy: 'admin_1' };

const student = (overrides: Partial<Student> = {}): Student => ({
  id: 'student_1',
  orgId: 'org_1',
  fullName: 'Avi Cohen',
  dateOfBirth: '2014-01-01',
  isMinor: true,
  currentGrade: 6,
  governmentalId: '',
  phone: '',
  email: '',
  guardians: [],
  assignments: [],
  pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
  notes: [],
  documents: [],
  profileStatus: 'ACTIVE',
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const family = (overrides: Partial<Family> = {}): Family => ({
  ...base,
  id: 'family_1',
  name: 'Cohen Family',
  guardians: [{
    id: 'guardian_1',
    fullName: 'Rina Cohen',
    relationship: 'PARENT',
    phone: null,
    email: 'rina@example.test',
    isPrimary: true,
  }],
  studentIds: ['student_1'],
  primaryContactGuardianId: 'guardian_1',
  billingNotes: null,
  isArchived: false,
  ...overrides,
});

const template = (overrides: Partial<AgreementTemplate> = {}): AgreementTemplate => ({
  ...base,
  id: 'template_1',
  kind: 'ENROLLMENT',
  title: 'Enrollment Terms',
  version: 1,
  body: 'Standard enrollment body',
  isActive: true,
  supersedesVersion: null,
  requiresGuardian: true,
  ...overrides,
});

const acceptance = (overrides: Partial<AgreementAcceptance> = {}): AgreementAcceptance => ({
  ...base,
  id: 'acceptance_1',
  templateId: 'template_1',
  templateVersion: 1,
  studentId: 'student_1',
  familyId: 'family_1',
  enrollmentId: null,
  guardianId: 'guardian_1',
  status: 'PENDING',
  acceptedAt: null,
  acceptedByName: null,
  signatureRef: null,
  ...overrides,
});

describe('AgreementManager helpers', () => {
  it('builds unsigned targets from live student/family context without normalizing guardians', () => {
    expect(buildAgreementUnsignedTargets(template(), [student(), student({ id: 'student_archived', profileStatus: 'ARCHIVED' })], [family()]))
      .toEqual([{ studentId: 'student_1', familyId: 'family_1', guardianId: 'guardian_1', kind: 'ENROLLMENT' }]);

    expect(buildAgreementUnsignedTargets(template({ kind: 'FINANCIAL' }), [student()], [family(), family({ id: 'family_archived', isArchived: true })]))
      .toEqual([{ studentId: null, familyId: 'family_1', guardianId: 'guardian_1', kind: 'FINANCIAL' }]);
  });

  it('summarizes active templates, request statuses, and unsigned counts', () => {
    const summaries = buildAgreementTemplateSummaries(
      [template(), template({ id: 'template_2', title: 'Inactive Media', kind: 'MEDIA_RELEASE', isActive: false, requiresGuardian: false })],
      [
        acceptance({ id: 'accepted_1', status: 'ACCEPTED', acceptedAt: '2026-06-18T10:00:00.000Z', acceptedByName: 'Rina Cohen' }),
        acceptance({ id: 'pending_1', status: 'PENDING', templateVersion: 2 }),
        acceptance({ id: 'declined_1', status: 'DECLINED' }),
      ],
      [student()],
      [family()],
    );

    expect(summaries[0]).toMatchObject({
      id: 'template_1',
      pendingCount: 1,
      acceptedCount: 1,
      declinedCount: 1,
      missingCount: 0,
      latestAcceptedAt: '2026-06-18T10:00:00.000Z',
    });
    expect(summaries[1]).toMatchObject({ id: 'template_2', isActive: false });
  });

  it('filters by kind, active state, guardian requirement, and request text', () => {
    const templates = [
      template(),
      template({ id: 'template_2', title: 'Finance Terms', kind: 'FINANCIAL', isActive: false, requiresGuardian: false }),
    ];
    const summaries = buildAgreementTemplateSummaries(templates, [
      acceptance({ acceptedByName: 'Rina Cohen', status: 'ACCEPTED' }),
    ], [student()], [family()]);

    expect(filterAgreementTemplateSummaries(summaries, [], [student()], [family()], { query: '', kind: 'FINANCIAL', status: 'all' }))
      .toHaveLength(1);
    expect(filterAgreementTemplateSummaries(summaries, [], [student()], [family()], { query: '', kind: 'ALL', status: 'active' }).map(row => row.id))
      .toEqual(['template_1']);
    expect(filterAgreementTemplateSummaries(summaries, [], [student()], [family()], { query: '', kind: 'ALL', status: 'guardian' }).map(row => row.id))
      .toEqual(['template_1']);
    expect(filterAgreementTemplateSummaries(summaries, [acceptance({ acceptedByName: 'Rina Cohen', status: 'ACCEPTED' })], [student()], [family()], { query: 'rina', kind: 'ALL', status: 'all' }).map(row => row.id))
      .toEqual(['template_1']);
  });

  it('creates a new immutable template version and pending request rows', () => {
    const next = buildNextAgreementTemplateVersion(template(), {
      kind: 'ENROLLMENT',
      title: 'Enrollment Terms',
      body: 'Updated terms',
      requiresGuardian: true,
    }, { id: 'template_2', now: NOW, actorId: 'admin_2' });

    expect(next).toMatchObject({
      id: 'template_2',
      version: 2,
      body: 'Updated terms',
      isActive: true,
      supersedesVersion: 1,
      createdBy: 'admin_2',
      updatedBy: 'admin_2',
    });

    const request = buildPendingAgreementRequest(next, {
      id: 'request_1',
      orgId: 'org_1',
      now: NOW,
      actorId: 'admin_2',
      studentId: 'student_1',
      familyId: 'family_1',
      enrollmentId: 'enrollment_1',
      guardianId: 'guardian_1',
    });

    expect(request).toMatchObject({
      id: 'request_1',
      templateId: 'template_2',
      templateVersion: 2,
      studentId: 'student_1',
      familyId: 'family_1',
      enrollmentId: 'enrollment_1',
      guardianId: 'guardian_1',
      status: 'PENDING',
      acceptedAt: null,
      acceptedByName: null,
      signatureRef: null,
    });
  });

  it('rejects pending requests without a student, family, or enrollment target', () => {
    expect(() => buildPendingAgreementRequest(template(), {
      id: 'request_1',
      orgId: 'org_1',
      now: NOW,
    })).toThrow('Agreement request requires a student, family, or enrollment target.');
  });

  it('captures countersigned PDF references as accepted agreement evidence', () => {
    const updated = buildAgreementPdfAcceptanceUpdate(acceptance(), {
      now: '2026-06-19T14:00:00.000Z',
      actorId: 'admin_pdf',
      signerName: ' Office Manager ',
      signatureRef: ' private://documents/org_1/agreements/acceptance_1/signed.pdf ',
    });

    expect(updated).toMatchObject({
      id: 'acceptance_1',
      status: 'ACCEPTED',
      acceptedAt: '2026-06-19T14:00:00.000Z',
      acceptedByName: 'Office Manager',
      signatureRef: 'private://documents/org_1/agreements/acceptance_1/signed.pdf',
      updatedBy: 'admin_pdf',
    });
  });

  it('rejects countersigned PDF capture without signer or private reference', () => {
    expect(() => buildAgreementPdfAcceptanceUpdate(acceptance(), {
      now: NOW,
      signerName: '',
      signatureRef: 'private://documents/org_1/agreements/acceptance_1/signed.pdf',
    })).toThrow('Countersigned PDF capture requires a signer name.');
    expect(() => buildAgreementPdfAcceptanceUpdate(acceptance(), {
      now: NOW,
      signerName: 'Office Manager',
      signatureRef: '',
    })).toThrow('Countersigned PDF capture requires a private file reference.');
  });
});
