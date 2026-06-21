import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Ban,
  BarChart3,
  CalendarDays,
  Clock3,
  DatabaseZap,
  ExternalLink,
  FileWarning,
  Inbox,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import type { AdminInboxItem, AppSettings, CalendarEvent } from '../types';
import type { HoursEntry, ReportDefinition } from '../types/blueprint';
import type { ImportSession } from '../types/v2';
import {
  buildOperationsSnapshot,
  type OperationsActor,
  type OperationsCardModel,
  type OperationsCardSource,
} from '../utils/blueprintQueries';
import { TRANSLATIONS } from '../constants';

interface OperationsSummaryProps {
  settings: AppSettings;
  orgId: string | null;
  actor: OperationsActor;
  canAccessOperations: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  events: CalendarEvent[];
  inboxItems: AdminInboxItem[];
  hoursEntries: HoursEntry[];
  reportDefinitions: ReportDefinition[];
  importSessions: ImportSession[];
  existingSourceIds?: Parameters<typeof buildOperationsSnapshot>[1]['existingSourceIds'];
  onOpenCard?: (card: OperationsCardModel) => void;
}

const ICONS: Record<OperationsCardSource, React.ComponentType<{ size?: number; className?: string }>> = {
  openConflicts: AlertTriangle,
  todayEvents: CalendarDays,
  openInboxItems: Inbox,
  pendingHoursReports: Clock3,
  importHealth: DatabaseZap,
  reportHealth: BarChart3,
  absenceImpact: ShieldAlert,
  assessmentDelivery: FileWarning,
  publicEndpointHealth: ShieldAlert,
  consentRevocation: ShieldAlert,
  instrumentDepositRefunds: FileWarning,
  hrEvaluations: ShieldAlert,
  rolloverCopyHealth: FileWarning,
};

const SOURCE_SURFACE_LABELS: Partial<Record<string, string>> = {
  CALENDAR: 'Calendar',
  ADMIN_INBOX: 'Admin Inbox',
  PAYROLL: 'Payroll',
  ANALYTICS: 'Reports',
  MANAGE: 'Manage',
};

const cardTone = (card: OperationsCardModel) => {
  if (card.status === 'BLOCKED') {
    return {
      panel: 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30',
      icon: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
      count: 'text-slate-500 dark:text-slate-300',
      chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    };
  }
  if (card.status === 'DENIED') {
    return {
      panel: 'border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20',
      icon: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
      count: 'text-rose-700 dark:text-rose-300',
      chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    };
  }
  if (card.status === 'STALE_SOURCE') {
    return {
      panel: 'border-orange-200 dark:border-orange-900/50 bg-orange-50/60 dark:bg-orange-950/20',
      icon: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
      count: 'text-orange-800 dark:text-orange-200',
      chip: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
    };
  }
  if (card.severity === 'critical' && card.status === 'READY') {
    return {
      panel: 'border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-900',
      icon: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
      count: 'text-rose-700 dark:text-rose-300',
      chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    };
  }
  if (card.status === 'READY') {
    return {
      panel: 'border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900',
      icon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      count: 'text-amber-800 dark:text-amber-200',
      chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
    };
  }
  return {
    panel: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
    icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    count: 'text-slate-800 dark:text-white',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  };
};

export function getOperationsSummaryCounts(cards: OperationsCardModel[]) {
  return {
    ready: cards.filter(card => card.status === 'READY' || card.status === 'STALE_SOURCE').length,
    empty: cards.filter(card => card.status === 'EMPTY').length,
    blocked: cards.filter(card => card.status === 'BLOCKED').length,
    denied: cards.filter(card => card.status === 'DENIED').length,
  };
}

export const OperationsSummary: React.FC<OperationsSummaryProps> = ({
  settings,
  orgId,
  actor,
  canAccessOperations,
  loading = false,
  errorMessage = null,
  events,
  inboxItems,
  hoursEntries,
  reportDefinitions,
  importSessions,
  existingSourceIds,
  onOpenCard,
}) => {
  const locale = settings.language === 'he-IL' ? 'he-IL' : 'en-US';
  const isRtl = settings.language === 'he-IL';
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const generatedAt = useMemo(() => new Date().toISOString(), [events, inboxItems, hoursEntries, reportDefinitions, importSessions]);
  const today = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: settings.timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(generatedAt));
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }, [generatedAt, settings.timeZone]);
  const snapshot = useMemo(() => buildOperationsSnapshot({
    events,
    adminInboxItems: inboxItems,
    hoursEntries,
    reportDefinitions,
    importSessions,
  }, {
    orgId: orgId ?? 'local',
    actor,
    generatedAt,
    date: today,
    timeZone: settings.timeZone || 'UTC',
    includeDeniedCards: !canAccessOperations,
    existingSourceIds,
  }), [actor, canAccessOperations, events, existingSourceIds, generatedAt, hoursEntries, importSessions, inboxItems, orgId, reportDefinitions, settings.timeZone, today]);
  const counts = getOperationsSummaryCounts(snapshot.cards);
  const visibleCards = canAccessOperations ? snapshot.cards : snapshot.cards.filter(card => card.status === 'DENIED');

  return (
    <section
      data-testid="operations-summary"
      dir={isRtl ? 'rtl' : 'ltr'}
      className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
            <BarChart3 size={17} className="text-cyan-800 dark:text-cyan-200" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('operations.title')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('operations.subtitle')
                .replace('{date}', today)
                .replace('{ready}', String(counts.ready))
                .replace('{blocked}', String(counts.blocked))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 bg-slate-50 dark:bg-slate-950">
            {t(`operations.actor.${actor}`)}
          </span>
          <span className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 bg-slate-50 dark:bg-slate-950" dir="ltr">
            {settings.timeZone || 'UTC'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="p-5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          {t('operations.loading')}
        </div>
      ) : errorMessage ? (
        <div className="p-5 flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle size={16} />
          {errorMessage}
        </div>
      ) : !canAccessOperations ? (
        <div data-testid="operations-summary-denied" className="p-5 flex items-start gap-3 text-sm">
          <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
            <Ban size={16} className="text-rose-700 dark:text-rose-300" />
          </div>
          <div>
            <div className="font-semibold text-rose-800 dark:text-rose-200">{t('operations.denied_title')}</div>
            <div className="text-slate-500 dark:text-slate-400 mt-0.5">{t('operations.denied_body')}</div>
          </div>
        </div>
      ) : (
        <div className="p-4">
          {counts.ready === 0 && (
            <div data-testid="operations-summary-empty" className="mb-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              {t('operations.empty')}
            </div>
          )}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibleCards.map(card => {
              const tone = cardTone(card);
              const Icon = ICONS[card.source];
              const countText = card.count === null ? '—' : String(card.count);
              const routeLabel = card.routeTarget ? SOURCE_SURFACE_LABELS[card.routeTarget] ?? card.routeTarget : t('operations.no_route');
              const staleCount = card.sourceReferences.filter(reference => reference.stale).length;
              const canOpen = canAccessOperations && card.routeTarget && card.status !== 'BLOCKED' && card.status !== 'DENIED';
              return (
                <article
                  key={card.id}
                  data-testid={`operations-card-${card.source}`}
                  className={`rounded-lg border p-3 min-h-[132px] flex flex-col gap-3 ${tone.panel}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tone.icon}`}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{t(card.labelKey)}</h4>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {t(`operations.status.${card.status.toLowerCase()}`)}
                        </p>
                      </div>
                    </div>
                    <div className={`text-2xl font-bold leading-none ${tone.count}`} dir="ltr">{countText}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                    <span className={`px-2 py-0.5 rounded-full ${tone.chip}`}>{t(`operations.severity.${card.severity}`)}</span>
                    {card.blockedDecisionIds.map(id => (
                      <span key={id} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" dir="ltr">{id}</span>
                    ))}
                  </div>

                  <div className="mt-auto flex items-end justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="truncate">
                      {card.status === 'BLOCKED'
                        ? t('operations.blocked_review')
                        : card.status === 'DENIED'
                          ? t('operations.permission_failure')
                          : staleCount > 0
                            ? t('operations.stale_sources').replace('{count}', String(staleCount))
                        : t('operations.source_count').replace('{count}', String(card.sourceIds.length))}
                    </span>
                    <span className="font-semibold text-slate-600 dark:text-slate-300 truncate">{routeLabel}</span>
                  </div>
                  {card.sourceReferences.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 text-[10px]" aria-label={t('operations.source_refs')}>
                      {card.sourceReferences.slice(0, 3).map(reference => (
                        <span
                          key={reference.id}
                          data-testid={`operations-source-ref-${card.source}-${reference.id}`}
                          className={`max-w-full truncate rounded-md px-1.5 py-0.5 font-mono ${reference.stale ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                          dir="ltr"
                        >
                          {reference.stale ? '!' : '#'} {reference.id}
                        </span>
                      ))}
                      {card.sourceReferences.length > 3 && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-300" dir="ltr">
                          +{card.sourceReferences.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenCard?.(card)}
                    disabled={!canOpen || !onOpenCard}
                    data-testid={`operations-open-${card.source}`}
                    className="mt-0 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-bold text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <ExternalLink size={13} />
                    {t('operations.open_source').replace('{surface}', routeLabel)}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
