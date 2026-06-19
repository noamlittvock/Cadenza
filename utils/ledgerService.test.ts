import { describe, expect, it, vi } from 'vitest';
import type { Adjustment, Charge, Payment } from '../types/blueprint';
import {
  LedgerServiceError,
  applyLedgerPaymentPlan,
  buildFamilyPaymentAllocation,
  buildManualFamilyCharge,
  computeFamilyLedgerBalance,
  createManualFamilyCharge,
  deriveFamilyChargeStatuses,
  recordFamilyPayment,
  type LedgerRepository,
  type LedgerServiceContext,
} from './ledgerService';

const T = '2026-06-19T10:00:00.000Z';
const LATER = '2026-06-19T11:30:00.000Z';
const base = { orgId: 'org_1', createdAt: T, updatedAt: T };

const adminContext: LedgerServiceContext = {
  orgId: 'org_1',
  now: LATER,
  ledgerCurrency: 'ILS',
  actor: { userId: 'admin_user_1', canAdminManage: true },
};

const financeContext: LedgerServiceContext = {
  orgId: 'org_1',
  now: LATER,
  ledgerCurrency: 'ILS',
  actor: { userId: 'finance_user_1', canFinanceManage: true },
};

const plainContext: LedgerServiceContext = {
  orgId: 'org_1',
  now: LATER,
  ledgerCurrency: 'ILS',
  actor: { userId: 'plain_user_1' },
};

const charge = (overrides: Partial<Charge> = {}): Charge => ({
  ...base,
  id: 'charge_1',
  studentId: 'student_1',
  familyId: 'family_1',
  enrollmentId: 'enrollment_1',
  description: 'Tuition',
  amount: 500,
  currency: 'ILS',
  dueDate: '2026-06-30',
  status: 'OPEN',
  periodLabel: 'June 2026',
  ...overrides,
});

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  ...base,
  id: 'payment_1',
  studentId: null,
  familyId: 'family_1',
  amount: 100,
  currency: 'ILS',
  method: 'TRANSFER',
  receivedAt: '2026-06-20T09:00:00.000Z',
  reference: null,
  appliedChargeIds: ['charge_1'],
  note: null,
  ...overrides,
});

const adjustment = (overrides: Partial<Adjustment> = {}): Adjustment => ({
  ...base,
  id: 'adjustment_1',
  studentId: 'student_1',
  familyId: 'family_1',
  chargeId: 'charge_1',
  amount: -50,
  currency: 'ILS',
  reason: 'Sibling discount',
  approvedBy: 'admin_user_1',
  ...overrides,
});

function repository(fixtures: {
  charges?: Charge[];
  payments?: Payment[];
  adjustments?: Adjustment[];
} = {}): LedgerRepository {
  return {
    fetchCharges: vi.fn(async () => fixtures.charges ?? []),
    fetchPayments: vi.fn(async () => fixtures.payments ?? []),
    fetchAdjustments: vi.fn(async () => fixtures.adjustments ?? []),
    upsertCharges: vi.fn(async () => undefined),
    upsertPayments: vi.fn(async () => undefined),
  };
}

describe('ledger service - manual family charges', () => {
  it('creates admin/finance-written family-led charge rows with student and enrollment lineage', () => {
    const created = buildManualFamilyCharge({
      input: {
        familyId: 'family_1',
        studentId: 'student_1',
        enrollmentId: 'enrollment_1',
        description: '  June tuition  ',
        amount: 500.125,
        dueDate: '2026-06-30',
        periodLabel: 'June 2026',
      },
      context: financeContext,
      idFactory: () => 'charge_new',
    });

    expect(created).toMatchObject({
      id: 'charge_new',
      orgId: 'org_1',
      familyId: 'family_1',
      studentId: 'student_1',
      enrollmentId: 'enrollment_1',
      description: 'June tuition',
      amount: 500.13,
      currency: 'ILS',
      status: 'OPEN',
      createdAt: LATER,
      updatedAt: LATER,
      createdBy: 'finance_user_1',
      updatedBy: 'finance_user_1',
    });
  });

  it('requires admin or finance write access and a family owner', () => {
    expect(() => buildManualFamilyCharge({
      input: { familyId: 'family_1', description: 'Tuition', amount: 500 },
      context: plainContext,
      idFactory: () => 'charge_new',
    })).toThrowError(new LedgerServiceError(
      'WRITE_ACCESS_REQUIRED',
      'Only admin or finance users can write family ledger rows.',
    ));

    expect(() => buildManualFamilyCharge({
      input: { familyId: '', description: 'Tuition', amount: 500 },
      context: adminContext,
      idFactory: () => 'charge_new',
    })).toThrowError(new LedgerServiceError(
      'FAMILY_REQUIRED',
      'Family-led ledger rows require a familyId.',
    ));
  });

  it('enforces D-20 single-currency ledgers before adding new charges', () => {
    expect(() => buildManualFamilyCharge({
      input: { familyId: 'family_1', description: 'USD tuition', amount: 500, currency: 'USD' },
      context: adminContext,
      idFactory: () => 'charge_new',
    })).toThrowError(new LedgerServiceError(
      'INVALID_CURRENCY',
      'Family ledger currency must be ILS; received USD.',
    ));

    expect(() => buildManualFamilyCharge({
      input: { familyId: 'family_1', description: 'Tuition', amount: 500 },
      context: adminContext,
      idFactory: () => 'charge_new',
      existingCharges: [charge({ currency: 'USD' })],
    })).toThrowError(new LedgerServiceError(
      'MIXED_CURRENCY',
      'Mixed currencies for family ledger family_1: ILS and USD.',
    ));
  });
});

describe('ledger service - payment allocation and status derivation', () => {
  it('records a partial family payment and derives PARTIAL status without writing snapshots', () => {
    const plan = buildFamilyPaymentAllocation({
      input: {
        familyId: 'family_1',
        studentId: 'student_1',
        amount: 125,
        method: 'TRANSFER',
        appliedChargeIds: ['charge_1'],
        reference: 'bank-125',
      },
      charges: [charge()],
      payments: [],
      adjustments: [adjustment({ amount: -25 })],
      context: financeContext,
      idFactory: () => 'payment_new',
    });

    expect(plan.payment).toMatchObject({
      id: 'payment_new',
      familyId: 'family_1',
      studentId: 'student_1',
      amount: 125,
      currency: 'ILS',
      method: 'TRANSFER',
      reference: 'bank-125',
      appliedChargeIds: ['charge_1'],
      createdBy: 'finance_user_1',
    });
    expect(plan.updatedCharges).toHaveLength(1);
    expect(plan.updatedCharges[0]).toMatchObject({
      id: 'charge_1',
      status: 'PARTIAL',
      updatedAt: LATER,
      updatedBy: 'finance_user_1',
    });
    expect(plan.familyBalance).toMatchObject({
      totalCharged: 500,
      totalPaid: 125,
      totalAdjusted: -25,
      balance: 350,
      openChargeIds: ['charge_1'],
    });
    expect('snapshot' in plan).toBe(false);
  });

  it('allocates one payment across selected family charges by due date and id', () => {
    const charges = [
      charge({ id: 'charge_late', amount: 200, dueDate: '2026-07-01' }),
      charge({ id: 'charge_early', amount: 300, dueDate: '2026-06-01' }),
    ];
    const plan = buildFamilyPaymentAllocation({
      input: {
        familyId: 'family_1',
        amount: 350,
        method: 'CHECK',
        appliedChargeIds: ['charge_late', 'charge_early'],
      },
      charges,
      payments: [],
      adjustments: [],
      context: adminContext,
      idFactory: () => 'payment_split',
    });

    expect(plan.updatedCharges.map(item => [item.id, item.status])).toEqual([
      ['charge_early', 'PAID'],
      ['charge_late', 'PARTIAL'],
    ]);
    expect(plan.familyBalance.balance).toBe(150);
    expect(plan.familyBalance.openChargeIds).toEqual(['charge_late']);
  });

  it('derives charge status from existing payments and adjustments on demand', () => {
    const current = deriveFamilyChargeStatuses({
      familyId: 'family_1',
      charges: [
        charge({ id: 'open', amount: 100, dueDate: '2026-06-01' }),
        charge({ id: 'discounted', amount: 100, dueDate: '2026-06-02' }),
        charge({ id: 'paid', amount: 100, dueDate: '2026-06-03' }),
        charge({ id: 'void', amount: 100, dueDate: '2026-06-04', status: 'VOID' }),
      ],
      payments: [
        payment({ id: 'pay_paid', amount: 100, appliedChargeIds: ['paid'] }),
      ],
      adjustments: [
        adjustment({ id: 'adj_discounted', chargeId: 'discounted', amount: -40 }),
      ],
      context: adminContext,
    });

    expect(current.map(item => [item.id, item.status])).toEqual([
      ['open', 'OPEN'],
      ['discounted', 'PARTIAL'],
      ['paid', 'PAID'],
      ['void', 'VOID'],
    ]);
  });

  it('rejects over-allocation, missing charge ids, cross-family charges, void charges, and mixed currencies', () => {
    expect(() => buildFamilyPaymentAllocation({
      input: { familyId: 'family_1', amount: 501, method: 'TRANSFER', appliedChargeIds: ['charge_1'] },
      charges: [charge()],
      payments: [],
      adjustments: [],
      context: adminContext,
      idFactory: () => 'payment_bad',
    })).toThrowError(new LedgerServiceError(
      'PAYMENT_EXCEEDS_SELECTED_BALANCE',
      'Payment amount 501 exceeds selected charge balance 500.',
    ));

    expect(() => buildFamilyPaymentAllocation({
      input: { familyId: 'family_1', amount: 50, method: 'TRANSFER', appliedChargeIds: ['missing'] },
      charges: [charge()],
      payments: [],
      adjustments: [],
      context: adminContext,
      idFactory: () => 'payment_bad',
    })).toThrowError(new LedgerServiceError('CHARGE_NOT_FOUND', 'Charge missing was not found.'));

    expect(() => buildFamilyPaymentAllocation({
      input: { familyId: 'family_1', amount: 50, method: 'TRANSFER', appliedChargeIds: ['charge_other'] },
      charges: [charge({ id: 'charge_other', familyId: 'family_2' })],
      payments: [],
      adjustments: [],
      context: adminContext,
      idFactory: () => 'payment_bad',
    })).toThrowError(new LedgerServiceError(
      'CHARGE_FAMILY_MISMATCH',
      'Charge charge_other is not owned by family family_1.',
    ));

    expect(() => buildFamilyPaymentAllocation({
      input: { familyId: 'family_1', amount: 50, method: 'TRANSFER', appliedChargeIds: ['charge_1'] },
      charges: [charge({ status: 'VOID' })],
      payments: [],
      adjustments: [],
      context: adminContext,
      idFactory: () => 'payment_bad',
    })).toThrowError(new LedgerServiceError(
      'CHARGE_VOID',
      'Charge charge_1 is void and cannot receive a payment allocation.',
    ));

    expect(() => buildFamilyPaymentAllocation({
      input: { familyId: 'family_1', amount: 50, method: 'TRANSFER', currency: 'USD', appliedChargeIds: ['charge_1'] },
      charges: [charge()],
      payments: [],
      adjustments: [],
      context: adminContext,
      idFactory: () => 'payment_bad',
    })).toThrowError(new LedgerServiceError(
      'INVALID_CURRENCY',
      'Family ledger currency must be ILS; received USD.',
    ));
  });

  it('applies a payment plan without mutating the original collections', () => {
    const charges = [charge()];
    const payments: Payment[] = [];
    const plan = buildFamilyPaymentAllocation({
      input: { familyId: 'family_1', amount: 500, method: 'CASH', appliedChargeIds: ['charge_1'] },
      charges,
      payments,
      adjustments: [],
      context: adminContext,
      idFactory: () => 'payment_cash',
    });
    const next = applyLedgerPaymentPlan(charges, payments, plan);

    expect(next.charges[0].status).toBe('PAID');
    expect(next.payments.map(item => item.id)).toEqual(['payment_cash']);
    expect(charges[0].status).toBe('OPEN');
    expect(payments).toHaveLength(0);
  });
});

describe('ledger service - computed family balances and repositories', () => {
  it('computes current balance from charges, payments, and adjustments only', () => {
    const balance = computeFamilyLedgerBalance({
      familyId: 'family_1',
      charges: [
        charge({ id: 'charge_1', amount: 500, status: 'PARTIAL', dueDate: '2026-06-30' }),
        charge({ id: 'charge_2', amount: 200, status: 'PAID', dueDate: '2026-06-01' }),
        charge({ id: 'charge_void', amount: 999, status: 'VOID' }),
      ],
      payments: [
        payment({ id: 'payment_1', amount: 200, appliedChargeIds: ['charge_2'] }),
        payment({ id: 'payment_2', amount: 100, appliedChargeIds: ['charge_1'] }),
      ],
      adjustments: [
        adjustment({ id: 'adjustment_1', chargeId: 'charge_1', amount: -50 }),
      ],
      context: adminContext,
    });

    expect(balance).toEqual({
      familyId: 'family_1',
      currency: 'ILS',
      totalCharged: 700,
      totalPaid: 300,
      totalAdjusted: -50,
      balance: 350,
      openChargeIds: ['charge_1'],
    });
  });

  it('persists manual charge creation through the ledger repository only', async () => {
    const repo = repository();
    const created = await createManualFamilyCharge({
      input: { familyId: 'family_1', description: 'Manual tuition', amount: 250 },
      context: adminContext,
      idFactory: () => 'charge_repo',
      repository: repo,
    });

    expect(created.id).toBe('charge_repo');
    expect(repo.upsertCharges).toHaveBeenCalledWith('org_1', [created]);
    expect(repo.upsertPayments).not.toHaveBeenCalled();
  });

  it('persists payment and derived status updates without snapshot writes', async () => {
    const repo = repository({ charges: [charge()] });
    const plan = await recordFamilyPayment({
      input: { familyId: 'family_1', amount: 500, method: 'CARD', appliedChargeIds: ['charge_1'] },
      context: financeContext,
      idFactory: () => 'payment_repo',
      repository: repo,
    });

    expect(plan.payment.id).toBe('payment_repo');
    expect(plan.updatedCharges.map(item => [item.id, item.status])).toEqual([['charge_1', 'PAID']]);
    expect(repo.upsertPayments).toHaveBeenCalledWith('org_1', [plan.payment]);
    expect(repo.upsertCharges).toHaveBeenCalledWith('org_1', plan.updatedCharges);
    expect(repo.fetchAdjustments).toHaveBeenCalled();
  });
});
