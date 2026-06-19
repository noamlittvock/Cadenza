import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  Landmark,
  Menu,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
} from 'lucide-react';
import type { AppSettings, Student } from '../types';
import type { Adjustment, BalanceSnapshot, Charge, Family, Payment } from '../types/blueprint';
import {
  applyChargeUpdates,
  buildFamilyAdjustment,
  buildFamilyPaymentAllocation,
  buildManualFamilyCharge,
  buildVoidFamilyCharge,
  computeFamilyLedgerBalance,
  type FamilyBalanceSummary,
  type LedgerServiceContext,
} from '../utils/ledgerService';

interface Props {
  settings: AppSettings;
  orgId: string | null;
  actorId: string | null;
  initialFamilyId?: string | null;
  families: Family[];
  students: Student[];
  charges: Charge[];
  setCharges: (next: Charge[] | ((prev: Charge[]) => Charge[])) => Promise<void>;
  payments: Payment[];
  setPayments: (next: Payment[] | ((prev: Payment[]) => Payment[])) => Promise<void>;
  adjustments: Adjustment[];
  setAdjustments: (next: Adjustment[] | ((prev: Adjustment[]) => Adjustment[])) => Promise<void>;
  balanceSnapshots: BalanceSnapshot[];
  loading?: boolean;
  canManageLedger: boolean;
  canExportLedger?: boolean;
  onMobileMenuOpen: () => void;
}

type Language = 'en-US' | 'he-IL';
type BalanceFilter = 'all' | 'open' | 'credit' | 'zero' | 'archived';
type ActionMode = 'charge' | 'payment' | 'adjustment' | 'void';

export interface FinanceFamilySummary extends FamilyBalanceSummary {
  family: Family | null;
  familyName: string;
  guardianText: string;
  isArchived: boolean;
  chargeCount: number;
  paymentCount: number;
  adjustmentCount: number;
  snapshotCount: number;
}

const LABELS = {
  'en-US': {
    title: 'Finance',
    subtitle: 'Family-led ledger',
    openSidebar: 'Open sidebar',
    openFamilies: 'Open families',
    openCharges: 'Open charges',
    recordedPayments: 'Recorded payments',
    auditSnapshots: 'Audit snapshots',
    familyLedger: 'Family ledger',
    search: 'Search families, guardians, IDs',
    filterAll: 'All',
    filterOpen: 'Open',
    filterCredit: 'Credit',
    filterZero: 'Zero',
    filterArchived: 'Archived',
    balance: 'Balance',
    charges: 'Charges',
    payments: 'Payments',
    adjustments: 'Adjustments',
    snapshots: 'Snapshots',
    lineItems: 'Line items',
    history: 'Payment history',
    adjustmentHistory: 'Adjustments',
    exportCsv: 'Export CSV',
    readOnly: 'Read-only finance view',
    writeAccess: 'Ledger write access',
    noFamily: 'Select a family',
    loading: 'Loading ledger rows...',
    emptyTitle: 'No ledger rows yet',
    emptyBody: 'Create the first family charge to start a ledger.',
    noMatches: 'No families match these filters.',
    errorTitle: 'Ledger needs cleanup',
    charge: 'Charge',
    payment: 'Payment',
    adjustment: 'Adjustment',
    void: 'Void',
    description: 'Description',
    amount: 'Amount',
    dueDate: 'Due date',
    period: 'Period',
    student: 'Student',
    optionalStudent: 'Student lineage',
    noStudent: 'No student lineage',
    method: 'Method',
    reference: 'Reference',
    note: 'Note',
    receivedAt: 'Received at',
    applyTo: 'Apply to open charges',
    reason: 'Reason',
    targetCharge: 'Target charge',
    familyLevel: 'Family-level adjustment',
    voidCharge: 'Charge to void',
    createCharge: 'Create charge',
    recordPayment: 'Record payment',
    postAdjustment: 'Post adjustment',
    voidSelected: 'Void charge',
    disabledWrite: 'Admin or finance write access is required for ledger mutations.',
    paymentNeedsCharge: 'Add or select an open charge before recording a payment.',
    saved: 'Ledger updated.',
    openChargeIds: 'Open charge IDs',
    status: 'Status',
    due: 'Due',
    totalCharged: 'Charged',
    totalPaid: 'Paid',
    totalAdjusted: 'Adjusted',
    currency: 'Currency',
  },
  'he-IL': {
    title: 'כספים',
    subtitle: 'כרטסת משפחתית',
    openSidebar: 'פתח סרגל צד',
    openFamilies: 'משפחות פתוחות',
    openCharges: 'חיובים פתוחים',
    recordedPayments: 'תשלומים שנרשמו',
    auditSnapshots: 'תצלומי ביקורת',
    familyLedger: 'כרטסת משפחה',
    search: 'חיפוש משפחות, אפוטרופוסים, מזהים',
    filterAll: 'הכל',
    filterOpen: 'פתוח',
    filterCredit: 'זיכוי',
    filterZero: 'אפס',
    filterArchived: 'ארכיון',
    balance: 'יתרה',
    charges: 'חיובים',
    payments: 'תשלומים',
    adjustments: 'התאמות',
    snapshots: 'תצלומים',
    lineItems: 'שורות חיוב',
    history: 'היסטוריית תשלומים',
    adjustmentHistory: 'התאמות',
    exportCsv: 'ייצוא CSV',
    readOnly: 'תצוגת כספים לקריאה בלבד',
    writeAccess: 'הרשאת כתיבה לכרטסת',
    noFamily: 'בחר משפחה',
    loading: 'טוען שורות כרטסת...',
    emptyTitle: 'אין עדיין שורות כרטסת',
    emptyBody: 'צרו את חיוב המשפחה הראשון כדי להתחיל כרטסת.',
    noMatches: 'אין משפחות שתואמות למסננים.',
    errorTitle: 'הכרטסת דורשת ניקוי',
    charge: 'חיוב',
    payment: 'תשלום',
    adjustment: 'התאמה',
    void: 'ביטול',
    description: 'תיאור',
    amount: 'סכום',
    dueDate: 'תאריך לתשלום',
    period: 'תקופה',
    student: 'תלמיד',
    optionalStudent: 'שיוך תלמיד',
    noStudent: 'ללא שיוך תלמיד',
    method: 'אמצעי',
    reference: 'אסמכתא',
    note: 'הערה',
    receivedAt: 'התקבל בתאריך',
    applyTo: 'שיוך לחיובים פתוחים',
    reason: 'סיבה',
    targetCharge: 'חיוב יעד',
    familyLevel: 'התאמה ברמת משפחה',
    voidCharge: 'חיוב לביטול',
    createCharge: 'יצירת חיוב',
    recordPayment: 'רישום תשלום',
    postAdjustment: 'רישום התאמה',
    voidSelected: 'ביטול חיוב',
    disabledWrite: 'נדרשת הרשאת מנהל או כספים כדי לשנות כרטסת.',
    paymentNeedsCharge: 'יש להוסיף או לבחור חיוב פתוח לפני רישום תשלום.',
    saved: 'הכרטסת עודכנה.',
    openChargeIds: 'מזהי חיובים פתוחים',
    status: 'סטטוס',
    due: 'לתשלום',
    totalCharged: 'חויב',
    totalPaid: 'שולם',
    totalAdjusted: 'הותאם',
    currency: 'מטבע',
  },
} as const;

const METHODS: Payment['method'][] = ['TRANSFER', 'CASH', 'CARD', 'CHECK', 'OTHER'];
const DEFAULT_LEDGER_CURRENCY = 'ILS';

const formatAmount = (amount: number, currency: string, language: Language) => {
  try {
    return new Intl.NumberFormat(language, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const formatDate = (value: string | null | undefined, language: Language) => {
  if (!value) return '-';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language, { month: 'short', day: '2-digit', year: 'numeric' }).format(date);
};

const moneyText = (amount: number) => String(Math.round(amount * 100) / 100);

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const idFactory = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

function studentName(students: Student[], id: string | null | undefined): string {
  if (!id) return '';
  const student = students.find(item => item.id === id);
  return student ? student.fullName : id;
}

function chargeLabel(charge: Charge, language: Language): string {
  return `${charge.description} · ${formatAmount(charge.amount, charge.currency, language)} · ${charge.status}`;
}

export function buildFinanceFamilySummaries(params: {
  families: Family[];
  charges: Charge[];
  payments: Payment[];
  adjustments: Adjustment[];
  balanceSnapshots: BalanceSnapshot[];
  orgId: string;
  ledgerCurrency: string;
}): FinanceFamilySummary[] {
  const familyIds = new Set<string>();
  params.families.forEach(family => familyIds.add(family.id));
  params.charges.forEach(charge => { if (charge.familyId) familyIds.add(charge.familyId); });
  params.payments.forEach(payment => { if (payment.familyId) familyIds.add(payment.familyId); });
  params.adjustments.forEach(adjustment => { if (adjustment.familyId) familyIds.add(adjustment.familyId); });
  params.balanceSnapshots.forEach(snapshot => { if (snapshot.familyId) familyIds.add(snapshot.familyId); });

  const familiesById = new Map(params.families.map(family => [family.id, family]));

  return [...familyIds].map(familyId => {
    const family = familiesById.get(familyId) ?? null;
    const balance = computeFamilyLedgerBalance({
      familyId,
      charges: params.charges,
      payments: params.payments,
      adjustments: params.adjustments,
      context: { orgId: params.orgId, ledgerCurrency: params.ledgerCurrency },
    });
    const guardianText = family?.guardians
      .map(guardian => [guardian.fullName, guardian.email, guardian.phone].filter(Boolean).join(' '))
      .join(' ') ?? '';
    return {
      ...balance,
      family,
      familyName: family?.name ?? familyId,
      guardianText,
      isArchived: family?.isArchived ?? false,
      chargeCount: params.charges.filter(charge => charge.familyId === familyId && charge.orgId === params.orgId).length,
      paymentCount: params.payments.filter(payment => payment.familyId === familyId && payment.orgId === params.orgId).length,
      adjustmentCount: params.adjustments.filter(adjustment => adjustment.familyId === familyId && adjustment.orgId === params.orgId).length,
      snapshotCount: params.balanceSnapshots.filter(snapshot => snapshot.familyId === familyId && snapshot.orgId === params.orgId).length,
    };
  }).sort((a, b) => b.balance - a.balance || a.familyName.localeCompare(b.familyName));
}

export function buildFamilyLedgerCsv(params: {
  familyName: string;
  charges: Charge[];
  payments: Payment[];
  adjustments: Adjustment[];
}): string {
  const rows = [
    ['type', 'id', 'family', 'date', 'description', 'amount', 'currency', 'status_or_method', 'reference'],
    ...params.charges.map(charge => [
      'charge',
      charge.id,
      params.familyName,
      charge.dueDate ?? '',
      charge.description,
      moneyText(charge.amount),
      charge.currency,
      charge.status,
      charge.periodLabel ?? '',
    ]),
    ...params.payments.map(payment => [
      'payment',
      payment.id,
      params.familyName,
      payment.receivedAt,
      payment.note ?? '',
      moneyText(payment.amount),
      payment.currency,
      payment.method,
      payment.reference ?? '',
    ]),
    ...params.adjustments.map(adjustment => [
      'adjustment',
      adjustment.id,
      params.familyName,
      adjustment.createdAt,
      adjustment.reason,
      moneyText(adjustment.amount),
      adjustment.currency,
      adjustment.chargeId ?? '',
      adjustment.approvedBy ?? '',
    ]),
  ];

  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export const FinanceWorkspace: React.FC<Props> = ({
  settings,
  orgId,
  actorId,
  initialFamilyId = null,
  families,
  students,
  charges,
  setCharges,
  payments,
  setPayments,
  adjustments,
  setAdjustments,
  balanceSnapshots,
  loading = false,
  canManageLedger,
  canExportLedger = true,
  onMobileMenuOpen,
}) => {
  const language: Language = settings.language === 'he-IL' ? 'he-IL' : 'en-US';
  const labels = LABELS[language];
  const ledgerCurrency = DEFAULT_LEDGER_CURRENCY;
  const resolvedOrgId = orgId ?? 'local';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BalanceFilter>('all');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('');
  const [actionMode, setActionMode] = useState<ActionMode>('charge');
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [chargeForm, setChargeForm] = useState({
    description: '',
    amount: '',
    dueDate: todayDate(),
    periodLabel: '',
    studentId: '',
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'TRANSFER' as Payment['method'],
    receivedAt: todayDate(),
    reference: '',
    note: '',
    appliedChargeIds: [] as string[],
  });
  const [adjustmentForm, setAdjustmentForm] = useState({
    amount: '',
    reason: '',
    chargeId: '',
    studentId: '',
  });
  const [voidChargeId, setVoidChargeId] = useState('');

  const model = useMemo(() => {
    try {
      return {
        summaries: buildFinanceFamilySummaries({
          families,
          charges,
          payments,
          adjustments,
          balanceSnapshots,
          orgId: resolvedOrgId,
          ledgerCurrency,
        }),
        error: null as string | null,
      };
    } catch (error) {
      return {
        summaries: [] as FinanceFamilySummary[],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [adjustments, balanceSnapshots, charges, families, ledgerCurrency, payments, resolvedOrgId]);

  const filteredSummaries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return model.summaries.filter(summary => {
      if (filter === 'open' && !(summary.balance > 0 || summary.openChargeIds.length > 0)) return false;
      if (filter === 'credit' && summary.balance >= 0) return false;
      if (filter === 'zero' && summary.balance !== 0) return false;
      if (filter === 'archived' && !summary.isArchived) return false;
      if (filter !== 'archived' && summary.isArchived) return false;
      if (!normalizedQuery) return true;
      return [
        summary.familyName,
        summary.familyId,
        summary.guardianText,
        summary.openChargeIds.join(' '),
      ].join(' ').toLowerCase().includes(normalizedQuery);
    });
  }, [filter, model.summaries, query]);

  useEffect(() => {
    if (selectedFamilyId && model.summaries.some(summary => summary.familyId === selectedFamilyId)) return;
    setSelectedFamilyId(filteredSummaries[0]?.familyId ?? model.summaries[0]?.familyId ?? '');
  }, [filteredSummaries, model.summaries, selectedFamilyId]);

  useEffect(() => {
    if (!initialFamilyId) return;
    if (model.summaries.some(summary => summary.familyId === initialFamilyId)) {
      setSelectedFamilyId(initialFamilyId);
    }
  }, [initialFamilyId, model.summaries]);

  const selectedSummary = model.summaries.find(summary => summary.familyId === selectedFamilyId) ?? null;
  const selectedFamily = selectedSummary?.family ?? null;
  const selectedCharges = charges
    .filter(charge => charge.orgId === resolvedOrgId && charge.familyId === selectedFamilyId)
    .sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || a.id.localeCompare(b.id));
  const selectedPayments = payments
    .filter(payment => payment.orgId === resolvedOrgId && payment.familyId === selectedFamilyId)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || a.id.localeCompare(b.id));
  const selectedAdjustments = adjustments
    .filter(adjustment => adjustment.orgId === resolvedOrgId && adjustment.familyId === selectedFamilyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const selectedSnapshots = balanceSnapshots
    .filter(snapshot => snapshot.orgId === resolvedOrgId && snapshot.familyId === selectedFamilyId)
    .sort((a, b) => b.asOf.localeCompare(a.asOf) || a.id.localeCompare(b.id));
  const openCharges = selectedCharges.filter(charge => charge.status !== 'PAID' && charge.status !== 'VOID');
  const familyStudents = students.filter(student => selectedFamily?.studentIds.includes(student.id));
  const openChargeCount = charges.filter(charge => charge.orgId === resolvedOrgId && charge.status !== 'PAID' && charge.status !== 'VOID').length;

  const writeContext = (): LedgerServiceContext => ({
    orgId: resolvedOrgId,
    now: nowIso(),
    ledgerCurrency,
    actor: {
      userId: actorId,
      canAdminManage: canManageLedger,
      canFinanceManage: canManageLedger,
    },
  });

  const clearActionState = () => {
    setActionError(null);
    setMessage(null);
  };

  const runAction = async (work: () => Promise<void>) => {
    clearActionState();
    try {
      await work();
      setMessage(labels.saved);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleCreateCharge = async () => {
    if (!selectedFamilyId) return;
    await runAction(async () => {
      const charge = buildManualFamilyCharge({
        input: {
          familyId: selectedFamilyId,
          studentId: chargeForm.studentId || null,
          description: chargeForm.description,
          amount: Number(chargeForm.amount),
          dueDate: chargeForm.dueDate || null,
          periodLabel: chargeForm.periodLabel || null,
        },
        context: writeContext(),
        idFactory: () => idFactory('charge'),
        existingCharges: charges,
        existingPayments: payments,
        existingAdjustments: adjustments,
      });
      await setCharges(prev => [...prev, charge]);
      setChargeForm({ description: '', amount: '', dueDate: todayDate(), periodLabel: '', studentId: '' });
      setActionMode('payment');
      setPaymentForm(prev => ({ ...prev, appliedChargeIds: [charge.id], amount: moneyText(charge.amount) }));
    });
  };

  const handleRecordPayment = async () => {
    if (!selectedFamilyId) return;
    await runAction(async () => {
      const plan = buildFamilyPaymentAllocation({
        input: {
          familyId: selectedFamilyId,
          amount: Number(paymentForm.amount),
          method: paymentForm.method,
          receivedAt: paymentForm.receivedAt ? new Date(`${paymentForm.receivedAt}T12:00:00`).toISOString() : undefined,
          reference: paymentForm.reference || null,
          note: paymentForm.note || null,
          appliedChargeIds: paymentForm.appliedChargeIds,
        },
        charges,
        payments,
        adjustments,
        context: writeContext(),
        idFactory: () => idFactory('payment'),
      });
      await setPayments(prev => [...prev, plan.payment]);
      if (plan.updatedCharges.length > 0) {
        await setCharges(prev => applyChargeUpdates(prev, plan.updatedCharges));
      }
      setPaymentForm({ amount: '', method: 'TRANSFER', receivedAt: todayDate(), reference: '', note: '', appliedChargeIds: [] });
    });
  };

  const handlePostAdjustment = async () => {
    if (!selectedFamilyId) return;
    await runAction(async () => {
      const target = selectedCharges.find(charge => charge.id === adjustmentForm.chargeId);
      const plan = buildFamilyAdjustment({
        input: {
          familyId: selectedFamilyId,
          studentId: adjustmentForm.studentId || target?.studentId || null,
          chargeId: adjustmentForm.chargeId || null,
          amount: Number(adjustmentForm.amount),
          reason: adjustmentForm.reason,
        },
        charges,
        payments,
        adjustments,
        context: writeContext(),
        idFactory: () => idFactory('adjustment'),
      });
      await setAdjustments(prev => [...prev, plan.adjustment]);
      if (plan.updatedCharges.length > 0) {
        await setCharges(prev => applyChargeUpdates(prev, plan.updatedCharges));
      }
      setAdjustmentForm({ amount: '', reason: '', chargeId: '', studentId: '' });
    });
  };

  const handleVoidCharge = async () => {
    if (!selectedFamilyId || !voidChargeId) return;
    await runAction(async () => {
      const plan = buildVoidFamilyCharge({
        input: { familyId: selectedFamilyId, chargeId: voidChargeId },
        charges,
        payments,
        adjustments,
        context: writeContext(),
      });
      await setCharges(prev => applyChargeUpdates(prev, plan.updatedCharges));
      setVoidChargeId('');
    });
  };

  const exportHref = useMemo(() => {
    if (!selectedSummary) return '#';
    const csv = buildFamilyLedgerCsv({
      familyName: selectedSummary.familyName,
      charges: selectedCharges,
      payments: selectedPayments,
      adjustments: selectedAdjustments,
    });
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  }, [selectedAdjustments, selectedCharges, selectedPayments, selectedSummary]);

  return (
    <div
      data-testid="finance-workspace"
      dir={language === 'he-IL' ? 'rtl' : 'ltr'}
      className="h-full overflow-hidden bg-[#f6f0e6] text-slate-900 dark:bg-slate-950 dark:text-slate-100"
    >
      <div className="sticky top-0 z-30 border-b border-[#e3d6c3] bg-[#f6f0e6]/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onMobileMenuOpen}
              className="rounded-lg border border-[#d5c3aa] p-2 text-slate-700 dark:border-slate-700 dark:text-slate-200 md:hidden"
              aria-label={labels.openSidebar}
            >
              <Menu size={18} />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7b2d36] text-white shadow-sm">
              <Landmark size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight text-slate-950 dark:text-white">{labels.title}</h1>
              <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{labels.subtitle}</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:flex">
            {canManageLedger ? <ShieldCheck size={15} className="text-emerald-700" /> : <ShieldCheck size={15} className="text-slate-400" />}
            <span>{canManageLedger ? labels.writeAccess : labels.readOnly}</span>
          </div>
        </div>
      </div>

      <main className="h-[calc(100%-57px)] overflow-auto px-3 py-3 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={WalletCards} label={labels.openFamilies} value={model.summaries.filter(row => row.balance > 0 || row.openChargeIds.length > 0).length} />
          <Metric icon={ReceiptText} label={labels.openCharges} value={openChargeCount} />
          <Metric icon={Landmark} label={labels.recordedPayments} value={payments.filter(payment => payment.orgId === resolvedOrgId).length} />
          <Metric icon={AlertTriangle} label={labels.auditSnapshots} value={balanceSnapshots.filter(snapshot => snapshot.orgId === resolvedOrgId).length} />
        </div>

        {loading ? (
          <StatePanel title={labels.loading} />
        ) : model.error ? (
          <StatePanel icon={AlertTriangle} title={labels.errorTitle} body={model.error} tone="error" />
        ) : model.summaries.length === 0 ? (
          <StatePanel title={labels.emptyTitle} body={labels.emptyBody} />
        ) : (
          <div className="mt-3 grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
            <section className="rounded-lg border border-[#e3d6c3] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-[#eee2d2] p-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Search size={15} className="text-slate-400" />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={labels.search}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {([
                    ['all', labels.filterAll],
                    ['open', labels.filterOpen],
                    ['credit', labels.filterCredit],
                    ['zero', labels.filterZero],
                    ['archived', labels.filterArchived],
                  ] as [BalanceFilter, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${filter === value ? 'bg-[#7b2d36] text-white' : 'bg-[#f6f0e6] text-slate-600 hover:bg-[#efe3d1] dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[640px] overflow-auto p-2">
                {filteredSummaries.length === 0 ? (
                  <div className="p-5 text-center text-sm text-slate-500">{labels.noMatches}</div>
                ) : filteredSummaries.map(summary => (
                  <button
                    key={summary.familyId}
                    type="button"
                    onClick={() => setSelectedFamilyId(summary.familyId)}
                    data-testid={`finance-family-row-${summary.familyId}`}
                    className={`mb-2 w-full rounded-lg border px-3 py-2 text-start transition-colors ${selectedFamilyId === summary.familyId ? 'border-[#7b2d36] bg-[#fbf3ec]' : 'border-[#eee2d2] bg-white hover:bg-[#fbf7ef] dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{summary.familyName}</div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500">{summary.guardianText || summary.familyId}</div>
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-slate-950 dark:text-white">
                        <bdi>{formatAmount(summary.balance, summary.currency, language)}</bdi>
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                      <span>{summary.chargeCount} {labels.charges}</span>
                      <span>{summary.paymentCount} {labels.payments}</span>
                      <span>{summary.openChargeIds.length} {labels.openCharges}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="min-w-0 rounded-lg border border-[#e3d6c3] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid="finance-family-detail">
              {!selectedSummary ? (
                <StatePanel title={labels.noFamily} />
              ) : (
                <>
                  <div className="border-b border-[#eee2d2] p-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-slate-950 dark:text-white">{selectedSummary.familyName}</h2>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{selectedSummary.guardianText || selectedSummary.familyId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {canExportLedger && (
                          <a
                            href={exportHref}
                            download={`ledger-${selectedSummary.familyId}.csv`}
                            className="inline-flex items-center gap-2 rounded-md border border-[#d5c3aa] px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#fbf7ef] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Download size={14} />
                            {labels.exportCsv}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      <InfoCell label={labels.balance} value={formatAmount(selectedSummary.balance, selectedSummary.currency, language)} testId="finance-balance-value" />
                      <InfoCell label={labels.totalCharged} value={formatAmount(selectedSummary.totalCharged, selectedSummary.currency, language)} testId="finance-total-charged-value" />
                      <InfoCell label={labels.totalPaid} value={formatAmount(selectedSummary.totalPaid, selectedSummary.currency, language)} testId="finance-total-paid-value" />
                      <InfoCell label={labels.totalAdjusted} value={formatAmount(selectedSummary.totalAdjusted, selectedSummary.currency, language)} testId="finance-total-adjusted-value" />
                    </div>
                  </div>

                  <div className="grid gap-3 p-3 2xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="min-w-0 space-y-3">
                      <LedgerTable
                        title={labels.lineItems}
                        empty={labels.emptyTitle}
                        testId="finance-charges-table"
                        columns={[labels.description, labels.amount, labels.due, labels.status, labels.student]}
                        rows={selectedCharges.map(charge => [
                          charge.description,
                          formatAmount(charge.amount, charge.currency, language),
                          formatDate(charge.dueDate, language),
                          charge.status,
                          studentName(students, charge.studentId) || '-',
                        ])}
                      />
                      <LedgerTable
                        title={labels.history}
                        empty={labels.emptyTitle}
                        testId="finance-payments-table"
                        columns={[labels.receivedAt, labels.amount, labels.method, labels.reference, labels.openChargeIds]}
                        rows={selectedPayments.map(payment => [
                          formatDate(payment.receivedAt, language),
                          formatAmount(payment.amount, payment.currency, language),
                          payment.method,
                          payment.reference ?? '-',
                          payment.appliedChargeIds.join(', ') || '-',
                        ])}
                      />
                      <LedgerTable
                        title={labels.adjustmentHistory}
                        empty={labels.emptyTitle}
                        testId="finance-adjustments-table"
                        columns={[labels.reason, labels.amount, labels.targetCharge, labels.status]}
                        rows={selectedAdjustments.map(adjustment => [
                          adjustment.reason,
                          formatAmount(adjustment.amount, adjustment.currency, language),
                          adjustment.chargeId ?? labels.familyLevel,
                          adjustment.approvedBy ?? '-',
                        ])}
                      />
                      <LedgerTable
                        title={labels.snapshots}
                        empty={labels.emptyTitle}
                        testId="finance-snapshots-table"
                        columns={[labels.receivedAt, labels.balance, labels.totalCharged, labels.totalPaid]}
                        rows={selectedSnapshots.map(snapshot => [
                          formatDate(snapshot.asOf, language),
                          formatAmount(snapshot.balance, snapshot.currency, language),
                          formatAmount(snapshot.totalCharged, snapshot.currency, language),
                          formatAmount(snapshot.totalPaid, snapshot.currency, language),
                        ])}
                      />
                    </div>

                    <aside className="rounded-lg border border-[#eee2d2] bg-[#fbf7ef] p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="mb-3 flex rounded-lg border border-[#d5c3aa] bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
                        {([
                          ['charge', labels.charge, Plus],
                          ['payment', labels.payment, WalletCards],
                          ['adjustment', labels.adjustment, SlidersHorizontal],
                          ['void', labels.void, Ban],
                        ] as [ActionMode, string, React.ElementType][]).map(([mode, label, Icon]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => { setActionMode(mode); clearActionState(); }}
                            data-testid={`finance-action-${mode}`}
                            className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold ${actionMode === mode ? 'bg-[#18324a] text-white' : 'text-slate-600 hover:bg-[#efe3d1] dark:text-slate-300 dark:hover:bg-slate-800'}`}
                          >
                            <Icon size={13} />
                            <span className="truncate">{label}</span>
                          </button>
                        ))}
                      </div>

                      {!canManageLedger && (
                        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                          {labels.disabledWrite}
                        </div>
                      )}
                      {actionError && (
                        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                          {actionError}
                        </div>
                      )}
                      {message && (
                        <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                          <CheckCircle2 size={14} />
                          {message}
                        </div>
                      )}

                      {actionMode === 'charge' && (
                        <FormStack>
                          <TextField label={labels.description} value={chargeForm.description} onChange={value => setChargeForm(prev => ({ ...prev, description: value }))} />
                          <TextField label={labels.amount} type="number" value={chargeForm.amount} onChange={value => setChargeForm(prev => ({ ...prev, amount: value }))} />
                          <TextField label={labels.dueDate} type="date" value={chargeForm.dueDate} onChange={value => setChargeForm(prev => ({ ...prev, dueDate: value }))} />
                          <TextField label={labels.period} value={chargeForm.periodLabel} onChange={value => setChargeForm(prev => ({ ...prev, periodLabel: value }))} />
                          <SelectField label={labels.optionalStudent} value={chargeForm.studentId} onChange={value => setChargeForm(prev => ({ ...prev, studentId: value }))}>
                            <option value="">{labels.noStudent}</option>
                            {familyStudents.map(student => <option key={student.id} value={student.id}>{studentName(students, student.id)}</option>)}
                          </SelectField>
                          <PrimaryButton disabled={!canManageLedger} onClick={handleCreateCharge}>{labels.createCharge}</PrimaryButton>
                        </FormStack>
                      )}

                      {actionMode === 'payment' && (
                        <FormStack>
                          {openCharges.length === 0 && <div className="text-xs font-medium text-amber-700">{labels.paymentNeedsCharge}</div>}
                          <TextField label={labels.amount} type="number" value={paymentForm.amount} onChange={value => setPaymentForm(prev => ({ ...prev, amount: value }))} />
                          <TextField label={labels.receivedAt} type="date" value={paymentForm.receivedAt} onChange={value => setPaymentForm(prev => ({ ...prev, receivedAt: value }))} />
                          <SelectField label={labels.method} value={paymentForm.method} onChange={value => setPaymentForm(prev => ({ ...prev, method: value as Payment['method'] }))}>
                            {METHODS.map(method => <option key={method} value={method}>{method}</option>)}
                          </SelectField>
                          <TextField label={labels.reference} value={paymentForm.reference} onChange={value => setPaymentForm(prev => ({ ...prev, reference: value }))} />
                          <TextField label={labels.note} value={paymentForm.note} onChange={value => setPaymentForm(prev => ({ ...prev, note: value }))} />
                          <div>
                            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{labels.applyTo}</div>
                            <div className="max-h-36 space-y-1 overflow-auto rounded-md border border-[#e3d6c3] bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                              {openCharges.map(charge => (
                                <label key={charge.id} className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={paymentForm.appliedChargeIds.includes(charge.id)}
                                    onChange={event => {
                                      setPaymentForm(prev => ({
                                        ...prev,
                                        appliedChargeIds: event.target.checked
                                          ? [...prev.appliedChargeIds, charge.id]
                                          : prev.appliedChargeIds.filter(id => id !== charge.id),
                                      }));
                                    }}
                                  />
                                  <span className="truncate">{chargeLabel(charge, language)}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <PrimaryButton disabled={!canManageLedger || openCharges.length === 0} onClick={handleRecordPayment}>{labels.recordPayment}</PrimaryButton>
                        </FormStack>
                      )}

                      {actionMode === 'adjustment' && (
                        <FormStack>
                          <TextField label={labels.amount} type="number" value={adjustmentForm.amount} onChange={value => setAdjustmentForm(prev => ({ ...prev, amount: value }))} />
                          <TextField label={labels.reason} value={adjustmentForm.reason} onChange={value => setAdjustmentForm(prev => ({ ...prev, reason: value }))} />
                          <SelectField label={labels.targetCharge} value={adjustmentForm.chargeId} onChange={value => setAdjustmentForm(prev => ({ ...prev, chargeId: value }))}>
                            <option value="">{labels.familyLevel}</option>
                            {selectedCharges.filter(charge => charge.status !== 'VOID').map(charge => <option key={charge.id} value={charge.id}>{chargeLabel(charge, language)}</option>)}
                          </SelectField>
                          <SelectField label={labels.optionalStudent} value={adjustmentForm.studentId} onChange={value => setAdjustmentForm(prev => ({ ...prev, studentId: value }))}>
                            <option value="">{labels.noStudent}</option>
                            {familyStudents.map(student => <option key={student.id} value={student.id}>{studentName(students, student.id)}</option>)}
                          </SelectField>
                          <PrimaryButton disabled={!canManageLedger} onClick={handlePostAdjustment}>{labels.postAdjustment}</PrimaryButton>
                        </FormStack>
                      )}

                      {actionMode === 'void' && (
                        <FormStack>
                          <SelectField label={labels.voidCharge} value={voidChargeId} onChange={setVoidChargeId}>
                            <option value="">{labels.targetCharge}</option>
                            {selectedCharges.filter(charge => charge.status !== 'VOID').map(charge => <option key={charge.id} value={charge.id}>{chargeLabel(charge, language)}</option>)}
                          </SelectField>
                          <PrimaryButton disabled={!canManageLedger || !voidChargeId} onClick={handleVoidCharge}>{labels.voidSelected}</PrimaryButton>
                        </FormStack>
                      )}
                    </aside>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

const Metric = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) => (
  <div className="rounded-lg border border-[#e3d6c3] bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
      <Icon size={14} className="text-[#7b2d36] dark:text-cadenza-300" />
      <span>{label}</span>
    </div>
    <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">{value}</div>
  </div>
);

const StatePanel = ({
  icon: Icon = WalletCards,
  title,
  body,
  tone = 'neutral',
}: {
  icon?: React.ElementType;
  title: string;
  body?: string;
  tone?: 'neutral' | 'error';
}) => (
  <div className="mt-3 rounded-lg border border-[#e3d6c3] bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <Icon size={22} className={`mx-auto ${tone === 'error' ? 'text-amber-600' : 'text-[#7b2d36]'}`} />
    <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
    {body && <p className="mx-auto mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">{body}</p>}
  </div>
);

const InfoCell = ({ label, value, testId }: { label: string; value: string; testId?: string }) => (
  <div className="rounded-md border border-[#eee2d2] bg-[#fbf7ef] px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
    <div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div>
    <div className="mt-0.5 truncate text-sm font-bold tabular-nums text-slate-950 dark:text-white" data-testid={testId}><bdi>{value}</bdi></div>
  </div>
);

const LedgerTable = ({
  title,
  columns,
  rows,
  empty,
  testId,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  empty: string;
  testId?: string;
}) => (
  <div className="overflow-hidden rounded-lg border border-[#eee2d2] dark:border-slate-800" data-testid={testId}>
    <div className="border-b border-[#eee2d2] bg-[#fbf7ef] px-3 py-2 text-sm font-semibold dark:border-slate-800 dark:bg-slate-950">{title}</div>
    {rows.length === 0 ? (
      <div className="p-4 text-sm text-slate-500">{empty}</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#fbf7ef] text-[11px] uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>{columns.map(column => <th key={column} className="px-3 py-2 text-start font-semibold">{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-[#eee2d2] dark:border-slate-800" data-testid={testId ? `${testId}-row-${rowIndex}` : undefined}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="max-w-[280px] truncate px-3 py-2 text-slate-700 dark:text-slate-200">
                    <bdi>{cell}</bdi>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const FormStack = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-3">{children}</div>
);

const TextField = ({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
    <input
      type={type}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="w-full rounded-md border border-[#d5c3aa] bg-white px-2.5 py-2 text-sm outline-none focus:border-[#7b2d36] dark:border-slate-700 dark:bg-slate-900"
    />
  </label>
);

const SelectField = ({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className="w-full rounded-md border border-[#d5c3aa] bg-white px-2.5 py-2 text-sm outline-none focus:border-[#7b2d36] dark:border-slate-700 dark:bg-slate-900"
    >
      {children}
    </select>
  </label>
);

const PrimaryButton = ({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#7b2d36] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#64242c] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
  >
    {children}
  </button>
);
