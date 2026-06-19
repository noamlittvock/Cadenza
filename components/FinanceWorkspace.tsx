import React, { useMemo } from 'react';
import { AlertTriangle, Landmark, Menu, ReceiptText, WalletCards } from 'lucide-react';
import type { AppSettings } from '../types';
import type { Adjustment, BalanceSnapshot, Charge, Family, Payment } from '../types/blueprint';
import { listOpenBalances } from '../utils/blueprintQueries';

interface Props {
  settings: AppSettings;
  families: Family[];
  charges: Charge[];
  payments: Payment[];
  adjustments: Adjustment[];
  balanceSnapshots: BalanceSnapshot[];
  loading?: boolean;
  onMobileMenuOpen: () => void;
}

const LABELS = {
  'en-US': {
    title: 'Finance',
    subtitle: 'Family-led ledger overview',
    openSidebar: 'Open sidebar',
    familyBalances: 'Family balances',
    openFamilies: 'Open families',
    openCharges: 'Open charges',
    recordedPayments: 'Recorded payments',
    auditSnapshots: 'Audit snapshots',
    family: 'Family',
    balance: 'Balance',
    openChargeIds: 'Open charge IDs',
    loading: 'Loading ledger rows...',
    emptyTitle: 'No ledger rows yet',
    emptyBody: 'New charges, payments, adjustments, and audit snapshots will appear here as ledger rows are added.',
    errorTitle: 'Ledger needs cleanup',
  },
  'he-IL': {
    title: 'כספים',
    subtitle: 'סקירת כרטסת משפחתית',
    openSidebar: 'פתח סרגל צד',
    familyBalances: 'יתרות משפחה',
    openFamilies: 'משפחות פתוחות',
    openCharges: 'חיובים פתוחים',
    recordedPayments: 'תשלומים שנרשמו',
    auditSnapshots: 'תצלומי ביקורת',
    family: 'משפחה',
    balance: 'יתרה',
    openChargeIds: 'מזהי חיוב פתוחים',
    loading: 'טוען שורות כרטסת...',
    emptyTitle: 'אין עדיין שורות כרטסת',
    emptyBody: 'חיובים, תשלומים, התאמות ותצלומי ביקורת יופיעו כאן כשיתווספו שורות כרטסת.',
    errorTitle: 'הכרטסת דורשת ניקוי',
  },
} as const;

const formatAmount = (amount: number, currency: string, language: 'en-US' | 'he-IL') => {
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

export const FinanceWorkspace: React.FC<Props> = ({
  settings,
  families,
  charges,
  payments,
  adjustments,
  balanceSnapshots,
  loading = false,
  onMobileMenuOpen,
}) => {
  const language = settings.language === 'he-IL' ? 'he-IL' : 'en-US';
  const labels = LABELS[language];
  const familyNames = useMemo(() => new Map(families.map(family => [family.id, family.name])), [families]);
  const openChargeCount = charges.filter(charge => charge.status !== 'PAID' && charge.status !== 'VOID').length;

  const balanceModel = useMemo(() => {
    try {
      return { balances: listOpenBalances(charges, payments, adjustments), error: null as string | null };
    } catch (error) {
      return { balances: [], error: error instanceof Error ? error.message : String(error) };
    }
  }, [charges, payments, adjustments]);

  return (
    <div
      data-testid="finance-workspace"
      dir={language === 'he-IL' ? 'rtl' : 'ltr'}
      className="h-full overflow-hidden bg-[#f6f0e6] text-slate-900 dark:bg-slate-950 dark:text-slate-100"
    >
      <div className="sticky top-0 z-30 border-b border-[#e3d6c3] bg-[#f6f0e6]/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5">
        <div className="flex items-center gap-3">
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
      </div>

      <main className="h-[calc(100%-57px)] overflow-auto px-3 py-3 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={WalletCards} label={labels.openFamilies} value={balanceModel.balances.length} />
          <Metric icon={ReceiptText} label={labels.openCharges} value={openChargeCount} />
          <Metric icon={Landmark} label={labels.recordedPayments} value={payments.length} />
          <Metric icon={AlertTriangle} label={labels.auditSnapshots} value={balanceSnapshots.length} />
        </div>

        <section className="mt-3 rounded-lg border border-[#e3d6c3] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 border-b border-[#eee2d2] px-3 py-2 dark:border-slate-800">
            <h2 className="text-sm font-semibold">{labels.familyBalances}</h2>
          </div>

          {loading ? (
            <StatePanel title={labels.loading} />
          ) : balanceModel.error ? (
            <StatePanel icon={AlertTriangle} title={labels.errorTitle} body={balanceModel.error} tone="error" />
          ) : balanceModel.balances.length === 0 ? (
            <StatePanel title={labels.emptyTitle} body={labels.emptyBody} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#fbf7ef] text-[11px] uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-start font-semibold">{labels.family}</th>
                    <th className="px-3 py-2 text-start font-semibold">{labels.balance}</th>
                    <th className="px-3 py-2 text-start font-semibold">{labels.openChargeIds}</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceModel.balances.map(balance => (
                    <tr key={balance.partyId} className="border-t border-[#eee2d2] dark:border-slate-800">
                      <td className="px-3 py-2 font-medium">
                        {familyNames.get(balance.partyId) ?? balance.partyId}
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums">
                        <bdi>{formatAmount(balance.balance, balance.currency, language)}</bdi>
                      </td>
                      <td className="max-w-[420px] truncate px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                        {balance.openChargeIds.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
  <div className="p-8 text-center">
    <Icon size={22} className={`mx-auto ${tone === 'error' ? 'text-amber-600' : 'text-[#7b2d36]'}`} />
    <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
    {body && <p className="mx-auto mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">{body}</p>}
  </div>
);
