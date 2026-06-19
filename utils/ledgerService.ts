import type { Adjustment, Charge, IsoDate, IsoTimestamp, LedgerStatus, Payment } from '../types/blueprint';
import { BLUEPRINT_COLLECTIONS } from '../types/blueprint';
import { fetchCollectionItems, upsertCollectionItems } from './supabaseSync';

export type LedgerServiceErrorCode =
  | 'WRITE_ACCESS_REQUIRED'
  | 'FAMILY_REQUIRED'
  | 'ORG_MISMATCH'
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'MIXED_CURRENCY'
  | 'PAYMENT_ALLOCATION_REQUIRED'
  | 'CHARGE_NOT_FOUND'
  | 'CHARGE_FAMILY_MISMATCH'
  | 'CHARGE_VOID'
  | 'PAYMENT_EXCEEDS_SELECTED_BALANCE';

export class LedgerServiceError extends Error {
  constructor(
    public readonly code: LedgerServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LedgerServiceError';
  }
}

export interface LedgerActor {
  userId?: string | null;
  canAdminManage?: boolean;
  canFinanceManage?: boolean;
}

export interface LedgerServiceContext {
  orgId: string;
  now: IsoTimestamp;
  ledgerCurrency: string;
  actor: LedgerActor;
}

export interface LedgerRepository {
  fetchCharges(orgId: string): Promise<Charge[]>;
  fetchPayments(orgId: string): Promise<Payment[]>;
  fetchAdjustments(orgId: string): Promise<Adjustment[]>;
  upsertCharges(orgId: string, charges: Charge[]): Promise<void>;
  upsertPayments(orgId: string, payments: Payment[]): Promise<void>;
}

export const supabaseLedgerRepository: LedgerRepository = {
  fetchCharges: orgId => fetchCollectionItems<Charge>(orgId, BLUEPRINT_COLLECTIONS.charges),
  fetchPayments: orgId => fetchCollectionItems<Payment>(orgId, BLUEPRINT_COLLECTIONS.payments),
  fetchAdjustments: orgId => fetchCollectionItems<Adjustment>(orgId, BLUEPRINT_COLLECTIONS.adjustments),
  upsertCharges: (orgId, charges) => upsertCollectionItems<Charge>(orgId, BLUEPRINT_COLLECTIONS.charges, charges),
  upsertPayments: (orgId, payments) => upsertCollectionItems<Payment>(orgId, BLUEPRINT_COLLECTIONS.payments, payments),
};

export interface ManualFamilyChargeInput {
  familyId: string;
  studentId?: string | null;
  enrollmentId?: string | null;
  description: string;
  amount: number;
  currency?: string | null;
  dueDate?: IsoDate | null;
  periodLabel?: string | null;
}

export interface FamilyPaymentInput {
  familyId: string;
  studentId?: string | null;
  amount: number;
  currency?: string | null;
  method: Payment['method'];
  receivedAt?: IsoTimestamp;
  reference?: string | null;
  note?: string | null;
  appliedChargeIds: string[];
}

export interface FamilyBalanceSummary {
  familyId: string;
  currency: string;
  totalCharged: number;
  totalPaid: number;
  totalAdjusted: number;
  balance: number;
  openChargeIds: string[];
}

export interface LedgerPaymentAllocationPlan {
  payment: Payment;
  updatedCharges: Charge[];
  familyBalance: FamilyBalanceSummary;
}

function actorId(actor: LedgerActor): string | null {
  return actor.userId ?? null;
}

function assertCanWrite(context: LedgerServiceContext): void {
  if (!context.actor.canAdminManage && !context.actor.canFinanceManage) {
    throw new LedgerServiceError('WRITE_ACCESS_REQUIRED', 'Only admin or finance users can write family ledger rows.');
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function assertPositiveMoney(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new LedgerServiceError('INVALID_AMOUNT', `${field} must be a positive amount.`);
  }
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new LedgerServiceError('INVALID_CURRENCY', `Invalid ledger currency: ${value}`);
  }
  return currency;
}

function contextCurrency(context: Pick<LedgerServiceContext, 'ledgerCurrency'>): string {
  return normalizeCurrency(context.ledgerCurrency);
}

function inputCurrency(value: string | null | undefined, context: LedgerServiceContext): string {
  const currency = normalizeCurrency(value ?? contextCurrency(context));
  const expected = contextCurrency(context);
  if (currency !== expected) {
    throw new LedgerServiceError('INVALID_CURRENCY', `Family ledger currency must be ${expected}; received ${currency}.`);
  }
  return currency;
}

function assertFamilyId(familyId: string): void {
  if (!familyId.trim()) {
    throw new LedgerServiceError('FAMILY_REQUIRED', 'Family-led ledger rows require a familyId.');
  }
}

function assertOrg(row: { id: string; orgId: string }, orgId: string): void {
  if (row.orgId !== orgId) {
    throw new LedgerServiceError('ORG_MISMATCH', `Ledger row ${row.id} is not in the current organization.`);
  }
}

function assertCurrency(current: string, expected: string, familyId: string): void {
  const currency = normalizeCurrency(current);
  if (currency !== expected) {
    throw new LedgerServiceError('MIXED_CURRENCY', `Mixed currencies for family ledger ${familyId}: ${expected} and ${currency}.`);
  }
}

function chargeSortKey(charge: Charge): string {
  return `${charge.dueDate ?? '9999-12-31'}:${charge.id}`;
}

function familyCharges(charges: Charge[], familyId: string, orgId: string): Charge[] {
  return charges.filter(charge => charge.orgId === orgId && charge.familyId === familyId);
}

function familyPayments(payments: Payment[], familyId: string, orgId: string): Payment[] {
  return payments.filter(payment => payment.orgId === orgId && payment.familyId === familyId);
}

function relatedFamilyAdjustments(adjustments: Adjustment[], charges: Charge[], familyId: string, orgId: string): Adjustment[] {
  const familyChargeIds = new Set(familyCharges(charges, familyId, orgId).map(charge => charge.id));
  return adjustments.filter(adjustment => (
    adjustment.orgId === orgId
    && (adjustment.familyId === familyId || (adjustment.chargeId != null && familyChargeIds.has(adjustment.chargeId)))
  ));
}

function assertSingleFamilyCurrency(params: {
  familyId: string;
  currency: string;
  orgId: string;
  charges: Charge[];
  payments: Payment[];
  adjustments: Adjustment[];
}): void {
  const charges = familyCharges(params.charges, params.familyId, params.orgId);
  const payments = familyPayments(params.payments, params.familyId, params.orgId);
  const adjustments = relatedFamilyAdjustments(params.adjustments, params.charges, params.familyId, params.orgId);
  charges.forEach(charge => assertCurrency(charge.currency, params.currency, params.familyId));
  payments.forEach(payment => assertCurrency(payment.currency, params.currency, params.familyId));
  adjustments.forEach(adjustment => assertCurrency(adjustment.currency, params.currency, params.familyId));
}

function adjustmentTotalsByCharge(adjustments: Adjustment[], charges: Charge[], familyId: string, orgId: string): Map<string, number> {
  const chargeIds = new Set(familyCharges(charges, familyId, orgId).map(charge => charge.id));
  const totals = new Map<string, number>();
  for (const adjustment of relatedFamilyAdjustments(adjustments, charges, familyId, orgId)) {
    if (!adjustment.chargeId || !chargeIds.has(adjustment.chargeId)) continue;
    totals.set(adjustment.chargeId, roundMoney((totals.get(adjustment.chargeId) ?? 0) + adjustment.amount));
  }
  return totals;
}

function adjustedChargeAmount(charge: Charge, adjustmentTotals: Map<string, number>): number {
  return Math.max(0, roundMoney(charge.amount + (adjustmentTotals.get(charge.id) ?? 0)));
}

function allocationsByCharge(params: {
  charges: Charge[];
  payments: Payment[];
  adjustmentTotals: Map<string, number>;
  familyId: string;
  orgId: string;
}): Map<string, number> {
  const chargesById = new Map(familyCharges(params.charges, params.familyId, params.orgId).map(charge => [charge.id, charge]));
  const paidByCharge = new Map<string, number>();
  const sortedPayments = familyPayments(params.payments, params.familyId, params.orgId)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));

  for (const payment of sortedPayments) {
    const selected = [...new Set(payment.appliedChargeIds)]
      .map(chargeId => chargesById.get(chargeId))
      .filter((charge): charge is Charge => Boolean(charge) && charge.status !== 'VOID')
      .sort((a, b) => chargeSortKey(a).localeCompare(chargeSortKey(b)));
    let remainingPayment = roundMoney(payment.amount);
    for (const charge of selected) {
      if (remainingPayment <= 0) break;
      const debt = adjustedChargeAmount(charge, params.adjustmentTotals);
      const alreadyPaid = paidByCharge.get(charge.id) ?? 0;
      const remainingDebt = roundMoney(Math.max(0, debt - alreadyPaid));
      if (remainingDebt <= 0) continue;
      const applied = roundMoney(Math.min(remainingPayment, remainingDebt));
      paidByCharge.set(charge.id, roundMoney(alreadyPaid + applied));
      remainingPayment = roundMoney(remainingPayment - applied);
    }
  }

  return paidByCharge;
}

function deriveStatus(charge: Charge, adjustedAmount: number, paidAmount: number): LedgerStatus {
  if (charge.status === 'VOID') return 'VOID';
  if (adjustedAmount <= 0 || paidAmount >= adjustedAmount) return 'PAID';
  if (paidAmount > 0 || adjustedAmount < charge.amount) return 'PARTIAL';
  return 'OPEN';
}

export function buildManualFamilyCharge(params: {
  input: ManualFamilyChargeInput;
  context: LedgerServiceContext;
  idFactory: () => string;
  existingCharges?: Charge[];
  existingPayments?: Payment[];
  existingAdjustments?: Adjustment[];
}): Charge {
  const { input, context } = params;
  assertCanWrite(context);
  assertFamilyId(input.familyId);
  assertPositiveMoney(input.amount, 'amount');
  const currency = inputCurrency(input.currency, context);
  assertSingleFamilyCurrency({
    familyId: input.familyId,
    currency,
    orgId: context.orgId,
    charges: params.existingCharges ?? [],
    payments: params.existingPayments ?? [],
    adjustments: params.existingAdjustments ?? [],
  });

  return {
    id: params.idFactory(),
    orgId: context.orgId,
    studentId: input.studentId ?? null,
    familyId: input.familyId,
    enrollmentId: input.enrollmentId ?? null,
    description: input.description.trim(),
    amount: roundMoney(input.amount),
    currency,
    dueDate: input.dueDate ?? null,
    status: 'OPEN',
    periodLabel: input.periodLabel ?? null,
    createdAt: context.now,
    updatedAt: context.now,
    createdBy: actorId(context.actor),
    updatedBy: actorId(context.actor),
  };
}

export function computeFamilyLedgerBalance(params: {
  familyId: string;
  charges: Charge[];
  payments: Payment[];
  adjustments: Adjustment[];
  context: Pick<LedgerServiceContext, 'orgId' | 'ledgerCurrency'>;
}): FamilyBalanceSummary {
  assertFamilyId(params.familyId);
  const currency = contextCurrency(params.context);
  assertSingleFamilyCurrency({
    familyId: params.familyId,
    currency,
    orgId: params.context.orgId,
    charges: params.charges,
    payments: params.payments,
    adjustments: params.adjustments,
  });

  const charges = familyCharges(params.charges, params.familyId, params.context.orgId);
  const payments = familyPayments(params.payments, params.familyId, params.context.orgId);
  const adjustments = relatedFamilyAdjustments(params.adjustments, params.charges, params.familyId, params.context.orgId);
  const openChargeIds = charges
    .filter(charge => charge.status !== 'VOID' && charge.status !== 'PAID')
    .sort((a, b) => chargeSortKey(a).localeCompare(chargeSortKey(b)))
    .map(charge => charge.id);
  const totalCharged = roundMoney(charges
    .filter(charge => charge.status !== 'VOID')
    .reduce((sum, charge) => sum + charge.amount, 0));
  const totalPaid = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const totalAdjusted = roundMoney(adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0));

  return {
    familyId: params.familyId,
    currency,
    totalCharged,
    totalPaid,
    totalAdjusted,
    balance: roundMoney(totalCharged + totalAdjusted - totalPaid),
    openChargeIds,
  };
}

export function deriveFamilyChargeStatuses(params: {
  familyId: string;
  charges: Charge[];
  payments: Payment[];
  adjustments: Adjustment[];
  context: Pick<LedgerServiceContext, 'orgId' | 'ledgerCurrency'> & { now?: IsoTimestamp; actor?: LedgerActor };
}): Charge[] {
  assertFamilyId(params.familyId);
  const currency = contextCurrency(params.context);
  assertSingleFamilyCurrency({
    familyId: params.familyId,
    currency,
    orgId: params.context.orgId,
    charges: params.charges,
    payments: params.payments,
    adjustments: params.adjustments,
  });
  const charges = familyCharges(params.charges, params.familyId, params.context.orgId);
  const adjustmentTotals = adjustmentTotalsByCharge(params.adjustments, params.charges, params.familyId, params.context.orgId);
  const paidByCharge = allocationsByCharge({
    charges: params.charges,
    payments: params.payments,
    adjustmentTotals,
    familyId: params.familyId,
    orgId: params.context.orgId,
  });

  return charges
    .map(charge => {
      const nextStatus = deriveStatus(
        charge,
        adjustedChargeAmount(charge, adjustmentTotals),
        paidByCharge.get(charge.id) ?? 0,
      );
      if (nextStatus === charge.status) return charge;
      return {
        ...charge,
        status: nextStatus,
        updatedAt: params.context.now ?? charge.updatedAt,
        updatedBy: params.context.actor ? actorId(params.context.actor) : charge.updatedBy,
      };
    })
    .sort((a, b) => chargeSortKey(a).localeCompare(chargeSortKey(b)));
}

function validateSelectedCharges(params: {
  input: FamilyPaymentInput;
  charges: Charge[];
  payments: Payment[];
  adjustments: Adjustment[];
  context: LedgerServiceContext;
  currency: string;
}): Charge[] {
  if (params.input.appliedChargeIds.length === 0) {
    throw new LedgerServiceError('PAYMENT_ALLOCATION_REQUIRED', 'Family payments require at least one applied charge id.');
  }
  const byId = new Map(params.charges.map(charge => [charge.id, charge]));
  const selected = [...new Set(params.input.appliedChargeIds)].map(chargeId => {
    const charge = byId.get(chargeId);
    if (!charge) throw new LedgerServiceError('CHARGE_NOT_FOUND', `Charge ${chargeId} was not found.`);
    assertOrg(charge, params.context.orgId);
    if (charge.familyId !== params.input.familyId) {
      throw new LedgerServiceError('CHARGE_FAMILY_MISMATCH', `Charge ${chargeId} is not owned by family ${params.input.familyId}.`);
    }
    if (charge.status === 'VOID') {
      throw new LedgerServiceError('CHARGE_VOID', `Charge ${chargeId} is void and cannot receive a payment allocation.`);
    }
    assertCurrency(charge.currency, params.currency, params.input.familyId);
    return charge;
  }).sort((a, b) => chargeSortKey(a).localeCompare(chargeSortKey(b)));

  const adjustmentTotals = adjustmentTotalsByCharge(params.adjustments, params.charges, params.input.familyId, params.context.orgId);
  const paidByCharge = allocationsByCharge({
    charges: params.charges,
    payments: params.payments,
    adjustmentTotals,
    familyId: params.input.familyId,
    orgId: params.context.orgId,
  });
  const selectedOutstanding = roundMoney(selected.reduce((sum, charge) => (
    sum + Math.max(0, adjustedChargeAmount(charge, adjustmentTotals) - (paidByCharge.get(charge.id) ?? 0))
  ), 0));
  if (params.input.amount > selectedOutstanding) {
    throw new LedgerServiceError(
      'PAYMENT_EXCEEDS_SELECTED_BALANCE',
      `Payment amount ${roundMoney(params.input.amount)} exceeds selected charge balance ${selectedOutstanding}.`,
    );
  }

  return selected;
}

export function buildFamilyPaymentAllocation(params: {
  input: FamilyPaymentInput;
  charges: Charge[];
  payments: Payment[];
  adjustments: Adjustment[];
  context: LedgerServiceContext;
  idFactory: () => string;
}): LedgerPaymentAllocationPlan {
  const { input, context } = params;
  assertCanWrite(context);
  assertFamilyId(input.familyId);
  assertPositiveMoney(input.amount, 'amount');
  const currency = inputCurrency(input.currency, context);
  assertSingleFamilyCurrency({
    familyId: input.familyId,
    currency,
    orgId: context.orgId,
    charges: params.charges,
    payments: params.payments,
    adjustments: params.adjustments,
  });
  validateSelectedCharges({ ...params, currency });

  const payment: Payment = {
    id: params.idFactory(),
    orgId: context.orgId,
    studentId: input.studentId ?? null,
    familyId: input.familyId,
    amount: roundMoney(input.amount),
    currency,
    method: input.method,
    receivedAt: input.receivedAt ?? context.now,
    reference: input.reference ?? null,
    appliedChargeIds: [...new Set(input.appliedChargeIds)],
    note: input.note ?? null,
    createdAt: context.now,
    updatedAt: context.now,
    createdBy: actorId(context.actor),
    updatedBy: actorId(context.actor),
  };

  const nextPayments = [...params.payments, payment];
  const derivedCharges = deriveFamilyChargeStatuses({
    familyId: input.familyId,
    charges: params.charges,
    payments: nextPayments,
    adjustments: params.adjustments,
    context,
  });
  const originalById = new Map(params.charges.map(charge => [charge.id, charge]));
  const updatedCharges = derivedCharges.filter(charge => originalById.get(charge.id)?.status !== charge.status);

  return {
    payment,
    updatedCharges,
    familyBalance: computeFamilyLedgerBalance({
      familyId: input.familyId,
      charges: applyChargeUpdates(params.charges, updatedCharges),
      payments: nextPayments,
      adjustments: params.adjustments,
      context,
    }),
  };
}

export function applyChargeUpdates(charges: Charge[], updates: Charge[]): Charge[] {
  if (updates.length === 0) return charges;
  const updateById = new Map(updates.map(update => [update.id, update]));
  return charges.map(charge => updateById.get(charge.id) ?? charge);
}

export function applyLedgerPaymentPlan(charges: Charge[], payments: Payment[], plan: LedgerPaymentAllocationPlan): {
  charges: Charge[];
  payments: Payment[];
} {
  return {
    charges: applyChargeUpdates(charges, plan.updatedCharges),
    payments: [...payments, plan.payment],
  };
}

export async function createManualFamilyCharge(params: {
  input: ManualFamilyChargeInput;
  context: LedgerServiceContext;
  idFactory: () => string;
  repository?: LedgerRepository;
}): Promise<Charge> {
  const repository = params.repository ?? supabaseLedgerRepository;
  const [charges, payments, adjustments] = await Promise.all([
    repository.fetchCharges(params.context.orgId),
    repository.fetchPayments(params.context.orgId),
    repository.fetchAdjustments(params.context.orgId),
  ]);
  const charge = buildManualFamilyCharge({
    input: params.input,
    context: params.context,
    idFactory: params.idFactory,
    existingCharges: charges,
    existingPayments: payments,
    existingAdjustments: adjustments,
  });
  await repository.upsertCharges(params.context.orgId, [charge]);
  return charge;
}

export async function recordFamilyPayment(params: {
  input: FamilyPaymentInput;
  context: LedgerServiceContext;
  idFactory: () => string;
  repository?: LedgerRepository;
}): Promise<LedgerPaymentAllocationPlan> {
  const repository = params.repository ?? supabaseLedgerRepository;
  const [charges, payments, adjustments] = await Promise.all([
    repository.fetchCharges(params.context.orgId),
    repository.fetchPayments(params.context.orgId),
    repository.fetchAdjustments(params.context.orgId),
  ]);
  const plan = buildFamilyPaymentAllocation({
    input: params.input,
    charges,
    payments,
    adjustments,
    context: params.context,
    idFactory: params.idFactory,
  });
  await repository.upsertPayments(params.context.orgId, [plan.payment]);
  if (plan.updatedCharges.length > 0) {
    await repository.upsertCharges(params.context.orgId, plan.updatedCharges);
  }
  return plan;
}
