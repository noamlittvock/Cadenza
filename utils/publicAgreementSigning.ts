import type { AcceptanceStatus, IsoTimestamp } from '../types/blueprint';
import { hashPublicToken } from './publicRegistrationIntake';
import { getSupabase } from './supabaseClient';

export const AGREEMENT_ACCEPTANCE_PUBLIC_SCOPE = 'agreement_acceptance:sign';

export type PublicAgreementSubmitAction = 'ACCEPT' | 'DECLINE';

export type PublicAgreementSubmitErrorCode =
  | 'SUPABASE_NOT_CONFIGURED'
  | 'VALIDATION_FAILED'
  | 'TOKEN_HASH_FAILED'
  | 'INVALID_ENDPOINT'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_MISMATCH'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_MISMATCH'
  | 'ALREADY_DECIDED'
  | 'INVALID_ACTION'
  | 'MISSING_SIGNER'
  | 'SUBMIT_FAILED';

export type PublicAgreementLoadErrorCode = Exclude<PublicAgreementSubmitErrorCode, 'VALIDATION_FAILED' | 'MISSING_SIGNER' | 'INVALID_ACTION' | 'CONSENT_REQUIRED' | 'TARGET_MISMATCH'>;

export interface PublicAgreementTargetInput {
  acceptanceId: string;
  templateId: string;
  studentId?: string | null;
  familyId?: string | null;
  enrollmentId?: string | null;
  guardianId?: string | null;
}

export interface PublicAgreementSignerInput {
  fullName: string;
}

export interface PublicAgreementConsentInput {
  confirmed: boolean;
  accepted?: boolean;
  agreementId: string;
}

export interface PublicAgreementSubmitInput {
  token: string;
  action: PublicAgreementSubmitAction;
  target: PublicAgreementTargetInput;
  signer: PublicAgreementSignerInput;
  consent: PublicAgreementConsentInput;
}

export interface PublicAgreementRpcPayload {
  action: PublicAgreementSubmitAction;
  target: PublicAgreementTargetInput;
  signer: PublicAgreementSignerInput;
  consent: {
    confirmed: true;
    accepted: boolean;
    agreementId: string;
    capturedAt: IsoTimestamp;
  };
}

export interface PublicAgreementSigningTarget {
  expiresAt: IsoTimestamp | null;
  endpointLabel: string;
  template: {
    id: string;
    kind: string;
    title: string;
    version: number;
    body: string;
    requiresGuardian: boolean;
  };
  acceptance: PublicAgreementTargetInput & {
    id: string;
    status: Extract<AcceptanceStatus, 'PENDING'>;
  };
  target: {
    label: string;
    studentId: string | null;
    familyId: string | null;
    enrollmentId: string | null;
    guardianId: string | null;
  };
}

export type PublicAgreementLoadResult =
  | {
      status: 'success';
      target: PublicAgreementSigningTarget;
    }
  | {
      status: 'error';
      code: PublicAgreementLoadErrorCode;
      message: string;
    };

export type PublicAgreementSubmitResult =
  | {
      status: 'success';
      acceptanceId: string;
      acceptanceStatus: Extract<AcceptanceStatus, 'ACCEPTED' | 'DECLINED'>;
      submittedAt: IsoTimestamp;
      message: string;
    }
  | {
      status: 'error';
      code: PublicAgreementSubmitErrorCode;
      message: string;
      fieldErrors?: Record<string, string>;
    };

export interface PublicAgreementSupabaseClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
}

export interface PublicAgreementE2ELoadContext {
  token: string;
  tokenHash: string;
}

export interface PublicAgreementE2ESubmitContext {
  input: PublicAgreementSubmitInput;
  payload: PublicAgreementRpcPayload;
  tokenHash: string;
}

declare global {
  interface Window {
    __CADENZA_PUBLIC_AGREEMENT_LOAD__?: (
      context: PublicAgreementE2ELoadContext,
    ) => Promise<PublicAgreementLoadResult> | PublicAgreementLoadResult;
    __CADENZA_PUBLIC_AGREEMENT_SUBMIT__?: (
      context: PublicAgreementE2ESubmitContext,
    ) => Promise<PublicAgreementSubmitResult> | PublicAgreementSubmitResult;
  }
}

function trimmed(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function optionalTrimmed(value: string | null | undefined): string | null {
  const out = trimmed(value);
  return out || null;
}

export function buildPublicAgreementRpcPayload(
  input: PublicAgreementSubmitInput,
  opts: { now: IsoTimestamp },
): { ok: true; payload: PublicAgreementRpcPayload } | {
  ok: false;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  const token = trimmed(input.token);
  const acceptanceId = trimmed(input.target.acceptanceId);
  const templateId = trimmed(input.target.templateId);
  const signerName = trimmed(input.signer.fullName);
  const agreementId = trimmed(input.consent.agreementId);

  if (!token) fieldErrors.token = 'An agreement signing token is required.';
  if (!acceptanceId) fieldErrors.target = 'Agreement request target is required.';
  if (!templateId || !agreementId) fieldErrors.agreement = 'Agreement setup is required.';
  if (templateId && agreementId && templateId !== agreementId) {
    fieldErrors.agreement = 'Agreement setup does not match the request target.';
  }
  if (input.action !== 'ACCEPT' && input.action !== 'DECLINE') {
    fieldErrors.action = 'Agreement action must be accept or decline.';
  }
  if (!signerName) fieldErrors.signer = 'Signer name is required.';
  if (!input.consent.confirmed) {
    fieldErrors.consent = 'The agreement decision must be explicitly confirmed.';
  }
  if (input.action === 'ACCEPT' && input.consent.accepted !== true) {
    fieldErrors.consent = 'The agreement must be accepted before signing.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    payload: {
      action: input.action,
      target: {
        acceptanceId,
        templateId,
        studentId: optionalTrimmed(input.target.studentId),
        familyId: optionalTrimmed(input.target.familyId),
        enrollmentId: optionalTrimmed(input.target.enrollmentId),
        guardianId: optionalTrimmed(input.target.guardianId),
      },
      signer: {
        fullName: signerName,
      },
      consent: {
        confirmed: true,
        accepted: input.action === 'ACCEPT',
        agreementId,
        capturedAt: opts.now,
      },
    },
  };
}

function messageForCode(code: PublicAgreementSubmitErrorCode): string {
  switch (code) {
    case 'SUPABASE_NOT_CONFIGURED':
      return 'Agreement signing is unavailable because Supabase is not configured.';
    case 'VALIDATION_FAILED':
      return 'Please correct the highlighted agreement fields.';
    case 'TOKEN_HASH_FAILED':
      return 'Agreement link validation failed before submission.';
    case 'INVALID_ENDPOINT':
      return 'This agreement link is unavailable or expired.';
    case 'TARGET_NOT_FOUND':
      return 'This agreement request no longer exists.';
    case 'TARGET_MISMATCH':
      return 'This agreement link does not match the request target.';
    case 'CONSENT_REQUIRED':
      return 'The agreement decision must be explicitly confirmed.';
    case 'CONSENT_MISMATCH':
      return 'This agreement link is configured for a different agreement.';
    case 'ALREADY_DECIDED':
      return 'This agreement request was already completed.';
    case 'INVALID_ACTION':
      return 'Agreement action must be accept or decline.';
    case 'MISSING_SIGNER':
      return 'Signer name is required.';
    case 'SUBMIT_FAILED':
      return 'Agreement decision could not be submitted. Please try again.';
  }
}

function loadErrorResult(code: PublicAgreementLoadErrorCode): PublicAgreementLoadResult {
  return { status: 'error', code, message: messageForCode(code) };
}

function errorResult(
  code: PublicAgreementSubmitErrorCode,
  fieldErrors?: Record<string, string>,
): PublicAgreementSubmitResult {
  return { status: 'error', code, message: messageForCode(code), fieldErrors };
}

function isSuccessRpcData(
  data: unknown,
): data is { ok: true; acceptanceId: string; status: 'ACCEPTED' | 'DECLINED'; submittedAt: IsoTimestamp } {
  if (!data || typeof data !== 'object') return false;
  const value = data as Record<string, unknown>;
  return value.ok === true &&
    typeof value.acceptanceId === 'string' &&
    (value.status === 'ACCEPTED' || value.status === 'DECLINED') &&
    typeof value.submittedAt === 'string';
}

function isErrorRpcData(data: unknown): data is { ok: false; code: PublicAgreementSubmitErrorCode } {
  if (!data || typeof data !== 'object') return false;
  const value = data as Record<string, unknown>;
  return value.ok === false && typeof value.code === 'string';
}

function isLoadRpcData(data: unknown): data is {
  ok: true;
  expiresAt: IsoTimestamp | null;
  endpointLabel: string;
  template: PublicAgreementSigningTarget['template'];
  acceptance: PublicAgreementSigningTarget['acceptance'];
  target: PublicAgreementSigningTarget['target'];
} {
  if (!data || typeof data !== 'object') return false;
  const value = data as Record<string, unknown>;
  const template = value.template as Record<string, unknown> | null;
  const acceptance = value.acceptance as Record<string, unknown> | null;
  const target = value.target as Record<string, unknown> | null;
  return value.ok === true &&
    typeof value.endpointLabel === 'string' &&
    (!value.expiresAt || typeof value.expiresAt === 'string') &&
    Boolean(template) &&
    typeof template?.id === 'string' &&
    typeof template?.title === 'string' &&
    typeof template?.body === 'string' &&
    typeof template?.version === 'number' &&
    typeof template?.requiresGuardian === 'boolean' &&
    Boolean(acceptance) &&
    typeof acceptance?.id === 'string' &&
    typeof acceptance?.templateId === 'string' &&
    acceptance?.status === 'PENDING' &&
    Boolean(target) &&
    typeof target?.label === 'string';
}

export async function loadPublicAgreementSigningTarget(
  token: string,
  opts: {
    client?: PublicAgreementSupabaseClient | null;
    hashToken?: (token: string) => Promise<string>;
  } = {},
): Promise<PublicAgreementLoadResult> {
  const trimmedToken = trimmed(token);
  if (!trimmedToken) return loadErrorResult('INVALID_ENDPOINT');

  let tokenHash: string;
  try {
    tokenHash = await (opts.hashToken ?? hashPublicToken)(trimmedToken);
  } catch {
    return loadErrorResult('TOKEN_HASH_FAILED');
  }

  const e2eLoad =
    typeof window !== 'undefined' && import.meta.env.VITE_E2E_AUTH_BYPASS === 'true'
      ? window.__CADENZA_PUBLIC_AGREEMENT_LOAD__
      : undefined;
  if (e2eLoad) return e2eLoad({ token: trimmedToken, tokenHash });

  const client = opts.client ?? getSupabase();
  if (!client) return loadErrorResult('SUPABASE_NOT_CONFIGURED');

  const { data, error } = await client.rpc('get_public_agreement_acceptance', {
    p_token_hash: tokenHash,
  });
  if (error) return loadErrorResult('SUBMIT_FAILED');
  if (isLoadRpcData(data)) {
    return {
      status: 'success',
      target: {
        expiresAt: data.expiresAt,
        endpointLabel: data.endpointLabel,
        template: data.template,
        acceptance: data.acceptance,
        target: data.target,
      },
    };
  }
  if (isErrorRpcData(data)) return loadErrorResult(data.code as PublicAgreementLoadErrorCode);
  return loadErrorResult('SUBMIT_FAILED');
}

export async function submitPublicAgreementAcceptance(
  input: PublicAgreementSubmitInput,
  opts: {
    now?: IsoTimestamp;
    client?: PublicAgreementSupabaseClient | null;
    hashToken?: (token: string) => Promise<string>;
  } = {},
): Promise<PublicAgreementSubmitResult> {
  const now = opts.now ?? new Date().toISOString();
  const built = buildPublicAgreementRpcPayload(input, { now });
  if (built.ok === false) return errorResult('VALIDATION_FAILED', built.fieldErrors);

  let tokenHash: string;
  try {
    tokenHash = await (opts.hashToken ?? hashPublicToken)(input.token.trim());
  } catch {
    return errorResult('TOKEN_HASH_FAILED');
  }

  const e2eSubmit =
    typeof window !== 'undefined' && import.meta.env.VITE_E2E_AUTH_BYPASS === 'true'
      ? window.__CADENZA_PUBLIC_AGREEMENT_SUBMIT__
      : undefined;
  if (e2eSubmit) return e2eSubmit({ input, payload: built.payload, tokenHash });

  const client = opts.client ?? getSupabase();
  if (!client) return errorResult('SUPABASE_NOT_CONFIGURED');

  const { data, error } = await client.rpc('submit_agreement_acceptance', {
    p_token_hash: tokenHash,
    p_payload: built.payload,
  });
  if (error) return errorResult('SUBMIT_FAILED');
  if (isSuccessRpcData(data)) {
    return {
      status: 'success',
      acceptanceId: data.acceptanceId,
      acceptanceStatus: data.status,
      submittedAt: data.submittedAt,
      message: data.status === 'ACCEPTED'
        ? 'Agreement accepted.'
        : 'Agreement declined.',
    };
  }
  if (isErrorRpcData(data)) {
    return errorResult(data.code);
  }
  return errorResult('SUBMIT_FAILED');
}
