import { describe, expect, it } from 'vitest';
import {
  AGREEMENT_ACCEPTANCE_PUBLIC_SCOPE,
  buildPublicAgreementRpcPayload,
  loadPublicAgreementSigningTarget,
  submitPublicAgreementAcceptance,
  type PublicAgreementSubmitInput,
} from './publicAgreementSigning';

const NOW = '2026-06-19T12:00:00.000Z';

function validInput(overrides: Partial<PublicAgreementSubmitInput> = {}): PublicAgreementSubmitInput {
  return {
    token: 'public-agreement-token',
    action: 'ACCEPT',
    target: {
      acceptanceId: 'agreement_acceptance_1',
      templateId: 'agreement_template_1',
      studentId: 'student_1',
      familyId: 'family_1',
      enrollmentId: 'enrollment_1',
      guardianId: 'guardian_1',
    },
    signer: {
      fullName: 'Dana Cohen',
    },
    consent: {
      confirmed: true,
      accepted: true,
      agreementId: 'agreement_template_1',
    },
    ...overrides,
  };
}

describe('public agreement acceptance submit path', () => {
  it('declares the scoped public endpoint capability used by AGREEMENT_ACCEPTANCE tokens', () => {
    expect(AGREEMENT_ACCEPTANCE_PUBLIC_SCOPE).toBe('agreement_acceptance:sign');
  });

  it('builds a target-lineage RPC payload for typed acceptance', () => {
    const built = buildPublicAgreementRpcPayload(validInput(), { now: NOW });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload).toEqual({
      action: 'ACCEPT',
      target: {
        acceptanceId: 'agreement_acceptance_1',
        templateId: 'agreement_template_1',
        studentId: 'student_1',
        familyId: 'family_1',
        enrollmentId: 'enrollment_1',
        guardianId: 'guardian_1',
      },
      signer: {
        fullName: 'Dana Cohen',
      },
      consent: {
        confirmed: true,
        accepted: true,
        agreementId: 'agreement_template_1',
        capturedAt: NOW,
      },
    });
  });

  it('allows an explicit decline without recording agreement acceptance consent', () => {
    const built = buildPublicAgreementRpcPayload(validInput({
      action: 'DECLINE',
      consent: {
        confirmed: true,
        accepted: false,
        agreementId: 'agreement_template_1',
      },
    }), { now: NOW });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.action).toBe('DECLINE');
    expect(built.payload.consent.accepted).toBe(false);
  });

  it('refuses payloads without explicit confirmation, signer, target, or matching setup', () => {
    const built = buildPublicAgreementRpcPayload(validInput({
      token: '',
      target: {
        acceptanceId: '',
        templateId: 'agreement_template_1',
      },
      signer: {
        fullName: ' ',
      },
      consent: {
        confirmed: false,
        accepted: false,
        agreementId: 'agreement_template_other',
      },
    }), { now: NOW });

    expect(built).toEqual({
      ok: false,
      fieldErrors: {
        token: 'An agreement signing token is required.',
        target: 'Agreement request target is required.',
        agreement: 'Agreement setup does not match the request target.',
        signer: 'Signer name is required.',
        consent: 'The agreement must be accepted before signing.',
      },
    });
  });

  it('invokes only the scoped submit_agreement_acceptance RPC and returns accepted state', async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const result = await submitPublicAgreementAcceptance(validInput(), {
      now: NOW,
      hashToken: async token => `hashed:${token}`,
      client: {
        rpc: async (fn, args) => {
          calls.push({ fn, args });
          return {
            data: {
              ok: true,
              acceptanceId: 'agreement_acceptance_1',
              status: 'ACCEPTED',
              submittedAt: NOW,
            },
            error: null,
          };
        },
      },
    });

    expect(result).toEqual({
      status: 'success',
      acceptanceId: 'agreement_acceptance_1',
      acceptanceStatus: 'ACCEPTED',
      submittedAt: NOW,
      message: 'Agreement accepted.',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('submit_agreement_acceptance');
    expect(calls[0].args.p_token_hash).toBe('hashed:public-agreement-token');
    expect(calls[0].args.p_payload).toMatchObject({
      action: 'ACCEPT',
      target: {
        acceptanceId: 'agreement_acceptance_1',
        templateId: 'agreement_template_1',
      },
      consent: {
        confirmed: true,
        accepted: true,
        agreementId: 'agreement_template_1',
      },
    });
  });

  it('loads only one scoped public agreement target through the read RPC', async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const result = await loadPublicAgreementSigningTarget('public-agreement-token', {
      hashToken: async token => `hashed:${token}`,
      client: {
        rpc: async (fn, args) => {
          calls.push({ fn, args });
          return {
            data: {
              ok: true,
              expiresAt: '2026-06-20T12:00:00.000Z',
              endpointLabel: 'Enrollment agreement for Dana Cohen',
              template: {
                id: 'agreement_template_1',
                kind: 'ENROLLMENT',
                title: 'Enrollment terms',
                version: 2,
                body: 'Agreement body',
                requiresGuardian: true,
              },
              acceptance: {
                id: 'agreement_acceptance_1',
                templateId: 'agreement_template_1',
                templateVersion: 2,
                studentId: 'student_1',
                familyId: 'family_1',
                enrollmentId: 'enrollment_1',
                guardianId: 'guardian_1',
                status: 'PENDING',
              },
              target: {
                label: 'Enrollment agreement for Dana Cohen',
                studentId: 'student_1',
                familyId: 'family_1',
                enrollmentId: 'enrollment_1',
                guardianId: 'guardian_1',
              },
            },
            error: null,
          };
        },
      },
    });

    expect(result).toEqual({
      status: 'success',
      target: {
        expiresAt: '2026-06-20T12:00:00.000Z',
        endpointLabel: 'Enrollment agreement for Dana Cohen',
        template: {
          id: 'agreement_template_1',
          kind: 'ENROLLMENT',
          title: 'Enrollment terms',
          version: 2,
          body: 'Agreement body',
          requiresGuardian: true,
        },
        acceptance: {
          id: 'agreement_acceptance_1',
          templateId: 'agreement_template_1',
          templateVersion: 2,
          studentId: 'student_1',
          familyId: 'family_1',
          enrollmentId: 'enrollment_1',
          guardianId: 'guardian_1',
          status: 'PENDING',
        },
        target: {
          label: 'Enrollment agreement for Dana Cohen',
          studentId: 'student_1',
          familyId: 'family_1',
          enrollmentId: 'enrollment_1',
          guardianId: 'guardian_1',
        },
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      fn: 'get_public_agreement_acceptance',
      args: { p_token_hash: 'hashed:public-agreement-token' },
    });
  });

  it('maps validation, endpoint, reused-token, and transport failures to clear states', async () => {
    await expect(submitPublicAgreementAcceptance(validInput({ token: '' }), {
      now: NOW,
      client: null,
    })).resolves.toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    });

    await expect(submitPublicAgreementAcceptance(validInput(), {
      now: NOW,
      hashToken: async () => 'hash',
      client: {
        rpc: async () => ({ data: { ok: false, code: 'INVALID_ENDPOINT' }, error: null }),
      },
    })).resolves.toEqual({
      status: 'error',
      code: 'INVALID_ENDPOINT',
      message: 'This agreement link is unavailable or expired.',
      fieldErrors: undefined,
    });

    await expect(submitPublicAgreementAcceptance(validInput(), {
      now: NOW,
      hashToken: async () => 'hash',
      client: {
        rpc: async () => ({ data: { ok: false, code: 'ALREADY_DECIDED' }, error: null }),
      },
    })).resolves.toMatchObject({
      status: 'error',
      code: 'ALREADY_DECIDED',
    });

    await expect(submitPublicAgreementAcceptance(validInput(), {
      now: NOW,
      hashToken: async () => 'hash',
      client: {
        rpc: async () => ({ data: null, error: { message: 'network unavailable' } }),
      },
    })).resolves.toMatchObject({
      status: 'error',
      code: 'SUBMIT_FAILED',
    });
  });
});
