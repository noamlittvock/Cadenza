import type { Guardian, IsoDate, IsoTimestamp } from '../types/blueprint';
import { getSupabase } from './supabaseClient';

export type PublicRegistrationSubmitErrorCode =
  | 'SUPABASE_NOT_CONFIGURED'
  | 'VALIDATION_FAILED'
  | 'TOKEN_HASH_FAILED'
  | 'INVALID_ENDPOINT'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_MISMATCH'
  | 'MISSING_STUDENT'
  | 'MISSING_CONTACT'
  | 'SUBMIT_FAILED';

export interface PublicRegistrationApplicantInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
}

export interface PublicRegistrationStudentInput {
  fullName: string;
  dateOfBirth?: IsoDate | null;
  instrument?: string | null;
  requestedActivityId?: string | null;
}

export interface PublicRegistrationGuardianInput {
  fullName: string;
  relationship?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
}

export interface PublicRegistrationConsentInput {
  accepted: boolean;
  agreementId?: string | null;
}

export interface PublicRegistrationFormInput {
  token: string;
  applicant: PublicRegistrationApplicantInput;
  student: PublicRegistrationStudentInput;
  guardians?: PublicRegistrationGuardianInput[];
  notes?: string | null;
  consent: PublicRegistrationConsentInput;
}

export interface PublicRegistrationRpcPayload {
  applicant: {
    fullName: string;
    email: string | null;
    phone: string | null;
  };
  student: {
    fullName: string;
    dateOfBirth: IsoDate | null;
    instrument: string | null;
    requestedActivityId: string | null;
  };
  guardians: Guardian[];
  notes: string | null;
  consent: {
    accepted: true;
    agreementId: string | null;
    capturedAt: IsoTimestamp;
  };
}

export type PublicRegistrationSubmitResult =
  | {
      status: 'success';
      intakeId: string;
      submittedAt: IsoTimestamp;
      message: string;
    }
  | {
      status: 'error';
      code: PublicRegistrationSubmitErrorCode;
      message: string;
      fieldErrors?: Record<string, string>;
    };

export interface PublicRegistrationSupabaseClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
}

export interface PublicRegistrationE2ESubmitContext {
  input: PublicRegistrationFormInput;
  payload: PublicRegistrationRpcPayload;
  tokenHash: string;
}

declare global {
  interface Window {
    __CADENZA_PUBLIC_REGISTRATION_SUBMIT__?: (
      context: PublicRegistrationE2ESubmitContext,
    ) => Promise<PublicRegistrationSubmitResult> | PublicRegistrationSubmitResult;
  }
}

function trimmed(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function optionalTrimmed(value: string | null | undefined): string | null {
  const out = trimmed(value);
  return out || null;
}

function hasContact(value: { email?: string | null; phone?: string | null }): boolean {
  return Boolean(optionalTrimmed(value.email) || optionalTrimmed(value.phone));
}

function normalizeGuardians(input: PublicRegistrationFormInput): Guardian[] {
  const guardians = (input.guardians ?? [])
    .map((guardian, index): Guardian | null => {
      const fullName = trimmed(guardian.fullName);
      if (!fullName) return null;
      return {
        id: `guardian_${index + 1}`,
        fullName,
        relationship: optionalTrimmed(guardian.relationship),
        phone: optionalTrimmed(guardian.phone),
        email: optionalTrimmed(guardian.email),
        isPrimary: Boolean(guardian.isPrimary),
      };
    })
    .filter((guardian): guardian is Guardian => Boolean(guardian));

  if (guardians.length === 0) {
    const applicantName = trimmed(input.applicant.fullName);
    if (applicantName && hasContact(input.applicant)) {
      guardians.push({
        id: 'guardian_applicant',
        fullName: applicantName,
        relationship: 'PARENT',
        phone: optionalTrimmed(input.applicant.phone),
        email: optionalTrimmed(input.applicant.email),
        isPrimary: true,
      });
    }
  }

  if (guardians.length > 0 && !guardians.some(guardian => guardian.isPrimary)) {
    guardians[0] = { ...guardians[0], isPrimary: true };
  }

  return guardians;
}

export function buildPublicRegistrationRpcPayload(
  input: PublicRegistrationFormInput,
  opts: { now: IsoTimestamp },
): { ok: true; payload: PublicRegistrationRpcPayload } | {
  ok: false;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  const token = trimmed(input.token);
  const applicantName = trimmed(input.applicant.fullName);
  const studentName = trimmed(input.student.fullName);
  const guardians = normalizeGuardians(input);

  if (!token) fieldErrors.token = 'A registration link token is required.';
  if (!applicantName) fieldErrors.applicant = 'Applicant name is required.';
  if (!studentName) fieldErrors.student = 'Student name is required.';
  if (guardians.length === 0 || !guardians.some(hasContact)) {
    fieldErrors.guardians = 'At least one guardian or applicant phone/email is required.';
  }
  if (!input.consent.accepted) {
    fieldErrors.consent = 'Explicit consent must be accepted before submission.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    payload: {
      applicant: {
        fullName: applicantName,
        email: optionalTrimmed(input.applicant.email),
        phone: optionalTrimmed(input.applicant.phone),
      },
      student: {
        fullName: studentName,
        dateOfBirth: optionalTrimmed(input.student.dateOfBirth) as IsoDate | null,
        instrument: optionalTrimmed(input.student.instrument),
        requestedActivityId: optionalTrimmed(input.student.requestedActivityId),
      },
      guardians,
      notes: optionalTrimmed(input.notes),
      consent: {
        accepted: true,
        agreementId: optionalTrimmed(input.consent.agreementId),
        capturedAt: opts.now,
      },
    },
  };
}

export async function hashPublicToken(token: string): Promise<string> {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle) {
    throw new Error('Web Crypto is unavailable for public token hashing.');
  }

  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function messageForCode(code: PublicRegistrationSubmitErrorCode): string {
  switch (code) {
    case 'SUPABASE_NOT_CONFIGURED':
      return 'Registration submission is unavailable because Supabase is not configured.';
    case 'VALIDATION_FAILED':
      return 'Please correct the highlighted registration fields.';
    case 'TOKEN_HASH_FAILED':
      return 'Registration link validation failed before submission.';
    case 'INVALID_ENDPOINT':
      return 'This registration link is unavailable or expired.';
    case 'CONSENT_REQUIRED':
      return 'Consent must be accepted before submitting registration.';
    case 'CONSENT_MISMATCH':
      return 'This registration link is not configured for the selected consent agreement.';
    case 'MISSING_STUDENT':
      return 'Student information is required.';
    case 'MISSING_CONTACT':
      return 'Guardian or applicant contact information is required.';
    case 'SUBMIT_FAILED':
      return 'Registration could not be submitted. Please try again.';
  }
}

function errorResult(
  code: PublicRegistrationSubmitErrorCode,
  fieldErrors?: Record<string, string>,
): PublicRegistrationSubmitResult {
  return { status: 'error', code, message: messageForCode(code), fieldErrors };
}

function isSuccessRpcData(data: unknown): data is { ok: true; intakeId: string; submittedAt: IsoTimestamp } {
  if (!data || typeof data !== 'object') return false;
  const value = data as Record<string, unknown>;
  return value.ok === true &&
    typeof value.intakeId === 'string' &&
    typeof value.submittedAt === 'string';
}

function isErrorRpcData(data: unknown): data is { ok: false; code: PublicRegistrationSubmitErrorCode } {
  if (!data || typeof data !== 'object') return false;
  const value = data as Record<string, unknown>;
  return value.ok === false && typeof value.code === 'string';
}

export async function submitPublicRegistrationIntake(
  input: PublicRegistrationFormInput,
  opts: {
    now?: IsoTimestamp;
    client?: PublicRegistrationSupabaseClient | null;
    hashToken?: (token: string) => Promise<string>;
  } = {},
): Promise<PublicRegistrationSubmitResult> {
  const now = opts.now ?? new Date().toISOString();
  const built = buildPublicRegistrationRpcPayload(input, { now });
  if (built.ok === false) return errorResult('VALIDATION_FAILED', built.fieldErrors);

  let tokenHash: string;
  try {
    tokenHash = await (opts.hashToken ?? hashPublicToken)(input.token.trim());
  } catch {
    return errorResult('TOKEN_HASH_FAILED');
  }

  const e2eSubmit =
    typeof window !== 'undefined' && import.meta.env.VITE_E2E_AUTH_BYPASS === 'true'
      ? window.__CADENZA_PUBLIC_REGISTRATION_SUBMIT__
      : undefined;
  if (e2eSubmit) {
    return e2eSubmit({ input, payload: built.payload, tokenHash });
  }

  const client = opts.client ?? getSupabase();
  if (!client) return errorResult('SUPABASE_NOT_CONFIGURED');

  const { data, error } = await client.rpc('submit_registration_intake', {
    p_token_hash: tokenHash,
    p_payload: built.payload,
  });
  if (error) return errorResult('SUBMIT_FAILED');
  if (isSuccessRpcData(data)) {
    return {
      status: 'success',
      intakeId: data.intakeId,
      submittedAt: data.submittedAt,
      message: 'Registration submitted for review.',
    };
  }
  if (isErrorRpcData(data)) {
    return errorResult(data.code);
  }
  return errorResult('SUBMIT_FAILED');
}
