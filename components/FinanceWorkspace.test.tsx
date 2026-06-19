import { describe, expect, it } from 'vitest';
import type { Adjustment, BalanceSnapshot, Charge, Family, Payment } from '../types/blueprint';
import { buildFamilyLedgerCsv, buildFinanceFamilySummaries } from './FinanceWorkspace';

const T = '2026-06-19T10:00:00.000Z';
const base = { orgId: 'org_1', createdAt: T, updatedAt: T };

const family = (overrides: Partial<Family> = {}): Family => ({
  ...base,
  id: 'family_1',
  name: 'Cohen Family',
  guardians: [{
    id: 'guardian_1',
    fullName: 'Rina Cohen',
    relationship: 'PARENT',
    email: 'rina@example.test',
    phone: '050-000-0000',
    isPrimary: true,
  }],
  studentIds: ['student_1'],
  primaryContactGuardianId: 'guardian_1',
  billingNotes: null,
  isArchived: false,
  ...overrides,
});

const charge = (overrides: Partial<Charge> = {}): Charge => ({
  ...base,
  id: 'charge_1',
  studentId: 'student_1',
  familyId: 'family_1',
  enrollmentId: 'enrollment_1',
  description: 'June tuition',
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
  amount: 125,
  currency: 'ILS',
  method: 'TRANSFER',
  receivedAt: '2026-06-20T09:00:00.000Z',
  reference: 'bank-125',
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

const snapshot = (overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot => ({
  ...base,
  id: 'snapshot_1',
  studentId: null,
  familyId: 'family_1',
  asOf: '2026-06-21T09:00:00.000Z',
  totalCharged: 9999,
  totalPaid: 0,
  totalAdjusted: 0,
  balance: 9999,
  currency: 'ILS',
  ...overrides,
});

describe('FinanceWorkspace helpers', () => {
  it('builds family-led summaries from live ledger rows and keeps snapshots audit-only', () => {
    const summaries = buildFinanceFamilySummaries({
      families: [family()],
      charges: [charge()],
      payments: [payment()],
      adjustments: [adjustment()],
      balanceSnapshots: [snapshot()],
      orgId: 'org_1',
      ledgerCurrency: 'ILS',
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      familyId: 'family_1',
      familyName: 'Cohen Family',
      balance: 325,
      totalCharged: 500,
      totalPaid: 125,
      totalAdjusted: -50,
      snapshotCount: 1,
      openChargeIds: ['charge_1'],
    });
  });

  it('surfaces D-20 mixed-currency ledger cleanup instead of offsetting balances', () => {
    expect(() => buildFinanceFamilySummaries({
      families: [family()],
      charges: [charge(), charge({ id: 'charge_usd', currency: 'USD' })],
      payments: [],
      adjustments: [],
      balanceSnapshots: [],
      orgId: 'org_1',
      ledgerCurrency: 'ILS',
    })).toThrow('Mixed currencies for family ledger family_1: ILS and USD');
  });

  it('exports selected family ledger rows as quoted CSV', () => {
    const csv = buildFamilyLedgerCsv({
      familyName: 'Cohen Family',
      charges: [charge({ description: 'June "tuition"' })],
      payments: [payment()],
      adjustments: [adjustment()],
    });

    expect(csv).toContain('"charge","charge_1","Cohen Family","2026-06-30","June ""tuition""","500","ILS","OPEN","June 2026"');
    expect(csv).toContain('"payment","payment_1","Cohen Family","2026-06-20T09:00:00.000Z","","125","ILS","TRANSFER","bank-125"');
    expect(csv).toContain('"adjustment","adjustment_1","Cohen Family","2026-06-19T10:00:00.000Z","Sibling discount","-50","ILS","charge_1","admin_user_1"');
  });
});
