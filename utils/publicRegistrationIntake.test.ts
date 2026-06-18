import { describe, expect, it } from 'vitest';
import {
  buildPublicRegistrationRpcPayload,
  hashPublicToken,
  submitPublicRegistrationIntake,
  type PublicRegistrationFormInput,
} from './publicRegistrationIntake';

const NOW = '2026-06-18T12:00:00.000Z';

function validInput(overrides: Partial<PublicRegistrationFormInput> = {}): PublicRegistrationFormInput {
  return {
    token: 'public-registration-token',
    applicant: {
      fullName: 'Dana Cohen',
      email: 'dana@example.com',
      phone: '050-111-2222',
    },
    student: {
      fullName: 'Avi Cohen',
      dateOfBirth: '2014-03-02',
      instrument: 'Violin',
      requestedActivityId: 'activity_1',
    },
    guardians: [
      {
        fullName: 'Dana Cohen',
        relationship: 'PARENT',
        email: 'dana@example.com',
        phone: '050-111-2222',
        isPrimary: true,
      },
    ],
    notes: 'Interested in orchestra placement.',
    consent: {
      accepted: true,
      agreementId: 'consent_template_1',
    },
    ...overrides,
  };
}

describe('public registration intake submit path', () => {
  it('builds a quarantined RPC payload with applicant, guardian, student, and consent capture', () => {
    const built = buildPublicRegistrationRpcPayload(validInput(), { now: NOW });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload).toEqual({
      applicant: {
        fullName: 'Dana Cohen',
        email: 'dana@example.com',
        phone: '050-111-2222',
      },
      student: {
        fullName: 'Avi Cohen',
        dateOfBirth: '2014-03-02',
        instrument: 'Violin',
        requestedActivityId: 'activity_1',
      },
      guardians: [
        {
          id: 'guardian_1',
          fullName: 'Dana Cohen',
          relationship: 'PARENT',
          phone: '050-111-2222',
          email: 'dana@example.com',
          isPrimary: true,
        },
      ],
      notes: 'Interested in orchestra placement.',
      consent: {
        accepted: true,
        agreementId: 'consent_template_1',
        capturedAt: NOW,
      },
    });
  });

  it('falls back to applicant contact as the primary guardian when no guardian array is supplied', () => {
    const built = buildPublicRegistrationRpcPayload(validInput({ guardians: [] }), { now: NOW });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.guardians).toEqual([
      {
        id: 'guardian_applicant',
        fullName: 'Dana Cohen',
        relationship: 'PARENT',
        phone: '050-111-2222',
        email: 'dana@example.com',
        isPrimary: true,
      },
    ]);
  });

  it('refuses submission payloads without explicit consent or contact information', () => {
    const built = buildPublicRegistrationRpcPayload(validInput({
      applicant: { fullName: 'Dana Cohen', email: '', phone: '' },
      guardians: [],
      consent: { accepted: false, agreementId: 'consent_template_1' },
    }), { now: NOW });

    expect(built).toEqual({
      ok: false,
      fieldErrors: {
        guardians: 'At least one guardian or applicant phone/email is required.',
        consent: 'Explicit consent must be accepted before submission.',
      },
    });
  });

  it('hashes raw public tokens without exposing the token to persisted state', async () => {
    await expect(hashPublicToken('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('invokes only the scoped submit_registration_intake RPC and returns a success state', async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const result = await submitPublicRegistrationIntake(validInput(), {
      now: NOW,
      hashToken: async token => `hashed:${token}`,
      client: {
        rpc: async (fn, args) => {
          calls.push({ fn, args });
          return {
            data: {
              ok: true,
              intakeId: 'intake_1',
              submittedAt: NOW,
            },
            error: null,
          };
        },
      },
    });

    expect(result).toEqual({
      status: 'success',
      intakeId: 'intake_1',
      submittedAt: NOW,
      message: 'Registration submitted for review.',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('submit_registration_intake');
    expect(calls[0].args.p_token_hash).toBe('hashed:public-registration-token');
    expect(calls[0].args.p_payload).toMatchObject({
      student: { fullName: 'Avi Cohen' },
      consent: { accepted: true, agreementId: 'consent_template_1' },
    });
  });

  it('maps validation, endpoint, and transport failures to clear submit states', async () => {
    await expect(submitPublicRegistrationIntake(validInput({ token: '' }), {
      now: NOW,
      client: null,
    })).resolves.toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    });

    await expect(submitPublicRegistrationIntake(validInput(), {
      now: NOW,
      hashToken: async () => 'hash',
      client: {
        rpc: async () => ({ data: { ok: false, code: 'INVALID_ENDPOINT' }, error: null }),
      },
    })).resolves.toEqual({
      status: 'error',
      code: 'INVALID_ENDPOINT',
      message: 'This registration link is unavailable or expired.',
      fieldErrors: undefined,
    });

    await expect(submitPublicRegistrationIntake(validInput(), {
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
