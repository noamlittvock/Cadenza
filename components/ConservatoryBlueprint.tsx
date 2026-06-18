import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  Clock3,
  Database,
  Layers3,
  ListTree,
  Menu,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import type { AppSettings } from '../types';
import {
  FORTE_FEATURE_TREE,
  FORTE_INDUSTRY_STANDARDS,
  FORTE_READABLE_DATA_CONTRACT,
  FORTE_SOURCE_EXTRACTION,
  type ForteTreeDomain,
  type ForteTreeStatus,
} from '../features/forteTree';
import {
  buildForteEmbeddingRecords,
  queryForteTree,
  summarizeForteCoverage,
} from '../utils/forteTreeQueries';

interface ConservatoryBlueprintProps {
  settings: AppSettings;
  onMobileMenuOpen: () => void;
}

const DOMAINS: Array<ForteTreeDomain | 'all'> = [
  'all',
  'command',
  'people',
  'scheduling',
  'learning',
  'finance',
  'resources',
  'platform',
  'agent',
];

const STATUSES: Array<ForteTreeStatus | 'all'> = ['all', 'native', 'implemented', 'embedded', 'planned', 'gap'];

const STATUS_ICON: Record<ForteTreeStatus, React.ReactNode> = {
  native: <CheckCircle2 size={14} />,
  implemented: <ShieldCheck size={14} />,
  embedded: <Database size={14} />,
  planned: <Clock3 size={14} />,
  gap: <AlertTriangle size={14} />,
};

const STATUS_CLASS: Record<ForteTreeStatus, string> = {
  native: 'bg-ok-50 text-ok-700 border-ok-200 dark:bg-ok-900/30 dark:text-ok-200 dark:border-ok-700',
  implemented: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700',
  embedded: 'bg-info-50 text-info-700 border-info-200 dark:bg-info-900/30 dark:text-info-200 dark:border-info-700',
  planned: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700',
  gap: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700',
};

export const ConservatoryBlueprint: React.FC<ConservatoryBlueprintProps> = ({
  settings,
  onMobileMenuOpen,
}) => {
  const [status, setStatus] = useState<ForteTreeStatus | 'all'>('all');
  const [domain, setDomain] = useState<ForteTreeDomain | 'all'>('all');
  const [search, setSearch] = useState('');

  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const isRtl = settings.language === 'he-IL';
  const coverage = useMemo(() => summarizeForteCoverage(), []);
  const visibleNodes = useMemo(() => queryForteTree({
    status: status === 'all' ? undefined : status,
    domain: domain === 'all' ? undefined : domain,
    text: search,
  }), [domain, search, status]);
  const embeddingRecords = useMemo(() => buildForteEmbeddingRecords(), []);
  // Productized = fully or partially shipped surfaces: native + embedded + implemented.
  const productized = coverage.byStatus.native + coverage.byStatus.embedded + coverage.byStatus.implemented;
  const coveragePercent = Math.round((productized / Math.max(coverage.total, 1)) * 100);

  return (
    <div
      className="flex h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-h-[44px] items-center gap-3">
          <button
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
            onClick={onMobileMenuOpen}
            aria-label={t('layout.mobile_access_label')}
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <ListTree size={18} className="text-cadenza-600 dark:text-cadenza-300" />
            <div>
              <h2 className="text-sm font-semibold leading-tight">{t('blueprint.title')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('blueprint.subtitle')}</p>
            </div>
          </div>
          <div className="ms-auto hidden items-center gap-2 text-xs text-slate-500 dark:text-slate-400 sm:flex">
            <span>{FORTE_SOURCE_EXTRACTION.extractedAt}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span>{FORTE_SOURCE_EXTRACTION.sourceUrl.replace('https://', '')}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                icon={<Layers3 size={16} />}
                label={t('blueprint.metric_features')}
                value={String(coverage.total)}
              />
              <MetricTile
                icon={<CheckCircle2 size={16} />}
                label={t('blueprint.metric_covered')}
                value={`${coveragePercent}%`}
              />
              <MetricTile
                icon={<AlertTriangle size={16} />}
                label={t('blueprint.metric_p0_gaps')}
                value={String(coverage.p0Gaps)}
              />
              <MetricTile
                icon={<Braces size={16} />}
                label={t('blueprint.metric_embeddings')}
                value={String(embeddingRecords.length)}
              />
            </section>

            <section className="border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-3 dark:border-slate-800 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ltr:left-3 rtl:right-3"
                  />
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder={t('blueprint.search_placeholder')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-9 text-sm outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <select
                  value={domain}
                  onChange={event => setDomain(event.target.value as ForteTreeDomain | 'all')}
                  className="h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950"
                >
                  {DOMAINS.map(option => (
                    <option key={option} value={option}>{t(`blueprint.domain.${option}`)}</option>
                  ))}
                </select>
                <select
                  value={status}
                  onChange={event => setStatus(event.target.value as ForteTreeStatus | 'all')}
                  className="h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950"
                >
                  {STATUSES.map(option => (
                    <option key={option} value={option}>{t(`blueprint.status.${option}`)}</option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                      <th className="w-[24%] px-3 py-2 text-start font-semibold">{t('blueprint.table_feature')}</th>
                      <th className="w-[12%] px-3 py-2 text-start font-semibold">{t('blueprint.table_status')}</th>
                      <th className="w-[18%] px-3 py-2 text-start font-semibold">{t('blueprint.table_data')}</th>
                      <th className="px-3 py-2 text-start font-semibold">{t('blueprint.table_next')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleNodes.map(node => (
                      <tr key={node.id} className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {isRtl ? node.labelHe : node.label}
                            </span>
                            <span className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                              {node.shape}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                              {node.id}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${STATUS_CLASS[node.status]}`}>
                            {STATUS_ICON[node.status]}
                            {t(`blueprint.status.${node.status}`)}
                          </span>
                          <div className="mt-2 text-xs font-semibold uppercase text-slate-400">{node.priority}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {node.dataEntities.slice(0, 4).map(entity => (
                              <span key={entity} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                {entity}
                              </span>
                            ))}
                            {node.dataEntities.length > 4 && (
                              <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 dark:border-slate-700">
                                +{node.dataEntities.length - 4}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {node.deterministicQueries[0]}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {node.nextStep}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <section className="border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck size={16} className="text-cadenza-600 dark:text-cadenza-300" />
                <h3 className="text-sm font-semibold">{t('blueprint.standards_title')}</h3>
              </div>
              <div className="space-y-3">
                {FORTE_INDUSTRY_STANDARDS.map(standard => (
                  <div key={standard.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{standard.label}</div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{standard.agentReadableCheck}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center gap-2">
                <Database size={16} className="text-cadenza-600 dark:text-cadenza-300" />
                <h3 className="text-sm font-semibold">{t('blueprint.readable_title')}</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {FORTE_READABLE_DATA_CONTRACT.contractId}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                    v{FORTE_READABLE_DATA_CONTRACT.version}
                  </div>
                </div>
                <div className="space-y-2">
                  {FORTE_READABLE_DATA_CONTRACT.deterministicQueryFamilies.map(family => (
                    <div key={family.id} className="rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950">
                      <div className="font-mono text-xs text-slate-800 dark:text-slate-200">{family.id}</div>
                      <div className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{family.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center gap-2">
                <Braces size={16} className="text-cadenza-600 dark:text-cadenza-300" />
                <h3 className="text-sm font-semibold">{t('blueprint.sources_title')}</h3>
              </div>
              <div className="space-y-3">
                {FORTE_SOURCE_EXTRACTION.signals.map(signal => (
                  <div key={signal.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800">
                    <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{signal.id}</div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">{signal.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

const MetricTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500 dark:text-slate-400">{icon}</span>
      <span className="font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</span>
    </div>
    <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
  </div>
);
