import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3 as BarChartIcon,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  Filter,
  Link2,
  LockKeyhole,
  Pin,
  PlayCircle,
  Plus,
  Search,
  ShieldCheck,
  Table2,
  Trash2,
} from 'lucide-react';
import { Bar, BarChart as RechartsBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppSettings } from '../types';
import type { ReportDefinition, ReportFilter, ReportSourceEntity } from '../types/blueprint';
import {
  exportReportCsv,
  getReportLineage,
  getReportSourceAccess,
  listReportSourceAllowlist,
  runReportDefinition,
  type ReportActor,
  type ReportResult,
  type ReportSourceAccess,
} from '../utils/blueprintQueries';

type Language = 'en-US' | 'he-IL';
type StatusFilter = 'all' | 'pinned' | 'ready' | 'blocked';

interface Props {
  settings: AppSettings;
  definitions: ReportDefinition[];
  sourceRowsByEntity: Partial<Record<ReportSourceEntity, ReportSourceRow[]>>;
  loading?: boolean;
  canAccessReports: boolean;
  canManageDefinitions?: boolean;
  actor: ReportActor;
  actorId?: string | null;
  orgId?: string | null;
  onSaveDefinitions?: (updater: (prev: ReportDefinition[]) => ReportDefinition[]) => Promise<void> | void;
  onOpenSource?: (sourceEntity: ReportSourceEntity, sourceId: string, row?: ReportSourceRow) => void;
  onMobileMenuOpen: () => void;
}

interface ReportLibraryFilters {
  query: string;
  source: string;
  status: StatusFilter;
}

export interface ReportLibraryRow {
  definition: ReportDefinition;
  sourceEntity: string;
  access: ReportSourceAccess;
  status: 'PINNED' | 'READY' | 'BLOCKED';
  searchableText: string;
}

export type ReportSourceRow = Record<string, unknown> & { id: string };

interface BuilderState {
  id: string | null;
  name: string;
  description: string;
  sourceEntity: ReportSourceEntity;
  columns: string[];
  filters: ReportFilter[];
  groupBy: string;
  aggregateFn: ReportDefinition['aggregate']['fn'];
  aggregateField: string;
  isPinned: boolean;
}

const LABELS: Record<Language, Record<string, string>> = {
  'en-US': {
    title: 'Reports',
    subtitle: 'Saved report library',
    search: 'Search definitions, descriptions, sources, or fields',
    allSources: 'All sources',
    allStatuses: 'All',
    pinned: 'Pinned',
    ready: 'Ready',
    blocked: 'Blocked',
    financeScope: 'Finance-limited',
    adminScope: 'Admin workspace',
    definitions: 'Definitions',
    financeSafe: 'Finance sources',
    blockedSources: 'Blocked sources',
    columns: 'Columns',
    filters: 'Filters',
    group: 'Group',
    aggregate: 'Aggregate',
    run: 'Run',
    save: 'Save definition',
    edit: 'Edit',
    create: 'New report',
    cancel: 'Cancel',
    pinDefinition: 'Pinned',
    exportCsv: 'Export CSV',
    results: 'Results',
    grouped: 'Grouped',
    lineage: 'Lineage',
    addFilter: 'Add filter',
    removeFilter: 'Remove filter',
    reportName: 'Report name',
    description: 'Description',
    noGroup: 'No grouping',
    noAggregateField: 'No field',
    noResults: 'Run the definition to see results.',
    emptyResults: 'No rows matched this definition.',
    saveError: 'Definition could not be saved.',
    runError: 'Report could not be run.',
    exportError: 'CSV export could not be generated.',
    financeReadonly: 'Finance users can run and export authorized finance reports, but cannot create shared definitions.',
    sourceUnavailable: 'No authorized source rows are loaded for this source.',
    staleField: 'A saved field is no longer available for this source.',
    sourceLink: 'Open source',
    source: 'Source',
    updated: 'Updated',
    emptyTitle: 'No report definitions yet',
    emptyBody: 'Create the first saved definition in the builder step. This shell only lists and filters existing definitions.',
    noMatchesTitle: 'No matching reports',
    noMatchesBody: 'Adjust search, source, or status filters.',
    loading: 'Loading report definitions...',
    deniedTitle: 'Reports are permission-gated',
    deniedBody: 'Reports are available only to admins and finance-capability users. Finance can see only finance and payroll sources.',
    staleTitle: 'Some definitions need review',
    staleBody: 'Blocked or stale sources remain visible to admins as cleanup markers, but they cannot be run here.',
    selectedTitle: 'Definition detail',
    selectPrompt: 'Select a report definition from the library.',
    noDescription: 'No description',
    financeNote: 'Finance users see only charge, payment, and approved payroll-hour definitions.',
    unknown: 'Unknown',
  },
  'he-IL': {
    title: 'דוחות',
    subtitle: 'ספריית דוחות שמורים',
    search: 'חיפוש הגדרות, תיאורים, מקורות או שדות',
    allSources: 'כל המקורות',
    allStatuses: 'הכול',
    pinned: 'נעוץ',
    ready: 'מוכן',
    blocked: 'חסום',
    financeScope: 'מוגבל כספים',
    adminScope: 'מרחב מנהל',
    definitions: 'הגדרות',
    financeSafe: 'מקורות כספים',
    blockedSources: 'מקורות חסומים',
    columns: 'עמודות',
    filters: 'מסננים',
    group: 'קיבוץ',
    aggregate: 'צבירה',
    run: 'הרצה',
    save: 'שמירת הגדרה',
    edit: 'עריכה',
    create: 'דוח חדש',
    cancel: 'ביטול',
    pinDefinition: 'נעוץ',
    exportCsv: 'ייצוא CSV',
    results: 'תוצאות',
    grouped: 'קיבוץ',
    lineage: 'קישורי מקור',
    addFilter: 'הוספת מסנן',
    removeFilter: 'הסרת מסנן',
    reportName: 'שם הדוח',
    description: 'תיאור',
    noGroup: 'ללא קיבוץ',
    noAggregateField: 'ללא שדה',
    noResults: 'הריצו את ההגדרה כדי לראות תוצאות.',
    emptyResults: 'אין שורות שתואמות להגדרה.',
    saveError: 'אי אפשר לשמור את ההגדרה.',
    runError: 'אי אפשר להריץ את הדוח.',
    exportError: 'אי אפשר ליצור ייצוא CSV.',
    financeReadonly: 'משתמשי כספים יכולים להריץ ולייצא דוחות כספים מורשים, אך לא ליצור הגדרות משותפות.',
    sourceUnavailable: 'אין שורות מקור מורשות שנטענו למקור הזה.',
    staleField: 'שדה שמור כבר אינו זמין למקור הזה.',
    sourceLink: 'פתיחת מקור',
    source: 'מקור',
    updated: 'עודכן',
    emptyTitle: 'אין עדיין הגדרות דוח',
    emptyBody: 'הגדרת הדוח הראשונה תיווצר בשלב הבונה. המעטפת הזו מציגה ומסננת הגדרות קיימות בלבד.',
    noMatchesTitle: 'אין דוחות תואמים',
    noMatchesBody: 'שנו חיפוש, מקור או סטטוס.',
    loading: 'טוען הגדרות דוח...',
    deniedTitle: 'דוחות מוגבלים בהרשאה',
    deniedBody: 'דוחות זמינים רק למנהלים ולמשתמשים עם הרשאת כספים. כספים רואים רק מקורות כספים ושעות שכר.',
    staleTitle: 'חלק מההגדרות דורשות בדיקה',
    staleBody: 'מקורות חסומים או לא עדכניים מוצגים למנהלים כסימני ניקוי, אך אי אפשר להריץ אותם כאן.',
    selectedTitle: 'פרטי הגדרה',
    selectPrompt: 'בחרו הגדרת דוח מהספרייה.',
    noDescription: 'אין תיאור',
    financeNote: 'משתמשי כספים רואים רק הגדרות חיובים, תשלומים ושעות שכר מאושרות.',
    unknown: 'לא ידוע',
  },
};

const SOURCE_LABELS: Record<Language, Record<string, string>> = {
  'en-US': {
    events: 'Events',
    students: 'Students',
    enrollments: 'Enrollments',
    charges: 'Charges',
    payments: 'Payments',
    hoursEntries: 'Hours entries',
    lessonRecords: 'Lesson records',
    instruments: 'Instruments',
  },
  'he-IL': {
    events: 'אירועים',
    students: 'תלמידים',
    enrollments: 'רישומים',
    charges: 'חיובים',
    payments: 'תשלומים',
    hoursEntries: 'שורות שעות',
    lessonRecords: 'רשומות שיעור',
    instruments: 'כלים',
  },
};

const STATUS_BADGE_CLASS: Record<ReportLibraryRow['status'], string> = {
  PINNED: 'border-[#8a1538]/30 bg-[#8a1538]/10 text-[#8a1538] dark:text-rose-200',
  READY: 'border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200',
  BLOCKED: 'border-amber-600/25 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
};

const FIELD_INPUT_CLASS = 'w-full rounded-md border border-[#d8c6ad] bg-white px-2.5 py-2 text-sm outline-none focus:border-[#1f3a5f] focus:ring-2 focus:ring-[#1f3a5f]/15 dark:border-slate-700 dark:bg-slate-900';

const statusLabelKey = (status: ReportLibraryRow['status']) => {
  if (status === 'PINNED') return 'pinned';
  if (status === 'BLOCKED') return 'blocked';
  return 'ready';
};

const formatDate = (value: string | null | undefined, language: Language) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language, { month: 'short', day: '2-digit', year: 'numeric' }).format(date);
};

const sourceLabel = (source: string, language: Language) =>
  SOURCE_LABELS[language][source] ?? source;

const FILTER_OPERATORS: ReportFilter['op'][] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'];
const AGGREGATE_FNS: ReportDefinition['aggregate']['fn'][] = ['none', 'count', 'sum', 'avg', 'min', 'max'];

const coerceSingleValue = (value: string): string | number | boolean | null => {
  if (value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};

const coerceFilterValue = (value: string, op: ReportFilter['op']): ReportFilter['value'] => {
  const trimmed = value.trim();
  if (op === 'in') return trimmed.split(',').map(part => coerceSingleValue(part.trim()));
  return coerceSingleValue(trimmed);
};

const filterValueToInput = (value: ReportFilter['value']): string => {
  if (Array.isArray(value)) return value.map(v => v === null ? '' : String(v)).join(', ');
  return value === null || value === undefined ? '' : String(value);
};

const makeDefinitionId = () => `report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const defaultBuilderForSource = (
  sourceEntity: ReportSourceEntity,
  language: Language,
  existing?: ReportDefinition,
): BuilderState => {
  const access = getReportSourceAccess(sourceEntity, 'admin');
  const fields = access.allowedFields.length ? access.allowedFields : ['id'];
  return {
    id: existing?.id ?? null,
    name: existing?.name ?? `${sourceLabel(sourceEntity, language)} report`,
    description: existing?.description ?? '',
    sourceEntity,
    columns: existing?.columns?.length ? [...existing.columns] : fields.slice(0, Math.min(4, fields.length)),
    filters: existing?.filters ? existing.filters.map(filter => ({ ...filter })) : [],
    groupBy: existing?.groupBy ?? '',
    aggregateFn: existing?.aggregate.fn ?? 'count',
    aggregateField: existing?.aggregate.field ?? '',
    isPinned: existing?.isPinned ?? false,
  };
};

export function buildReportDefinitionFromBuilder(
  builder: BuilderState,
  params: {
    orgId: string;
    actorId: string | null;
    now: string;
    previous?: ReportDefinition | null;
  },
): ReportDefinition {
  const name = builder.name.trim();
  if (!name) throw new Error('REPORT_NAME_REQUIRED');
  return {
    id: builder.id ?? makeDefinitionId(),
    orgId: params.previous?.orgId ?? params.orgId,
    name,
    description: builder.description.trim() || null,
    sourceEntity: builder.sourceEntity,
    filters: builder.filters.map(filter => ({ ...filter })),
    groupBy: builder.groupBy || null,
    aggregate: {
      fn: builder.aggregateFn,
      field: builder.aggregateField || null,
    },
    columns: builder.columns.length ? [...builder.columns] : ['id'],
    isPinned: builder.isPinned,
    createdAt: params.previous?.createdAt ?? params.now,
    updatedAt: params.now,
    createdBy: params.previous?.createdBy ?? params.actorId,
    updatedBy: params.actorId,
  };
}

export function buildReportSourceRows(input: {
  events?: Array<{ id: string; name?: string; start?: string; end?: string; activityId?: string; roomId?: string }>;
  students?: Array<{ id: string; fullName?: string; profileStatus?: string }>;
  studentFamilyIds?: Record<string, string | null>;
  enrollments?: ReportSourceRow[];
  charges?: ReportSourceRow[];
  payments?: ReportSourceRow[];
  hoursEntries?: ReportSourceRow[];
  lessonRecords?: ReportSourceRow[];
  instruments?: ReportSourceRow[];
}): Partial<Record<ReportSourceEntity, ReportSourceRow[]>> {
  return {
    events: (input.events ?? []).map(event => {
      const start = event.start ? new Date(event.start) : null;
      const end = event.end ? new Date(event.end) : null;
      const durationMinutes = start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
        ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
        : 0;
      return {
        id: event.id,
        name: event.name ?? '',
        date: event.start ? event.start.slice(0, 10) : '',
        durationMinutes,
        activityId: event.activityId ?? null,
        roomId: event.roomId ?? null,
      };
    }),
    students: (input.students ?? []).map(student => ({
      id: student.id,
      fullName: student.fullName ?? '',
      familyId: input.studentFamilyIds?.[student.id] ?? null,
      isArchived: student.profileStatus === 'ARCHIVED',
    })),
    enrollments: input.enrollments ?? [],
    charges: input.charges ?? [],
    payments: input.payments ?? [],
    hoursEntries: input.hoursEntries ?? [],
    lessonRecords: input.lessonRecords ?? [],
    instruments: input.instruments ?? [],
  };
}

export function buildReportLibraryRows(
  definitions: ReportDefinition[],
  actor: ReportActor,
): ReportLibraryRow[] {
  return definitions
    .map(definition => {
      const sourceEntity = String(definition.sourceEntity);
      const access = getReportSourceAccess(sourceEntity, actor);
      const status: ReportLibraryRow['status'] = !access.allowed
        ? 'BLOCKED'
        : definition.isPinned
          ? 'PINNED'
          : 'READY';
      return {
        definition,
        sourceEntity,
        access,
        status,
        searchableText: [
          definition.name,
          definition.description,
          sourceEntity,
          definition.columns.join(' '),
          definition.groupBy,
          definition.aggregate.fn,
          definition.aggregate.field,
          access.blockedDecisionIds.join(' '),
        ].filter(Boolean).join(' ').toLowerCase(),
      };
    })
    .filter(row => actor !== 'finance' || row.access.allowed)
    .sort((a, b) => {
      if (a.status === 'PINNED' && b.status !== 'PINNED') return -1;
      if (b.status === 'PINNED' && a.status !== 'PINNED') return 1;
      const dateCmp = String(b.definition.updatedAt ?? '').localeCompare(String(a.definition.updatedAt ?? ''));
      if (dateCmp !== 0) return dateCmp;
      return a.definition.name.localeCompare(b.definition.name);
    });
}

export function filterReportLibraryRows(
  rows: ReportLibraryRow[],
  filters: ReportLibraryFilters,
): ReportLibraryRow[] {
  const q = filters.query.trim().toLowerCase();
  return rows.filter(row => {
    if (q && !row.searchableText.includes(q)) return false;
    if (filters.source !== 'all' && row.sourceEntity !== filters.source) return false;
    if (filters.status === 'pinned' && row.status !== 'PINNED') return false;
    if (filters.status === 'ready' && row.status !== 'READY') return false;
    if (filters.status === 'blocked' && row.status !== 'BLOCKED') return false;
    return true;
  });
}

const Metric = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-lg border border-[#e1d2bd] bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="text-[11px] font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{value}</div>
  </div>
);

export const ReportsWorkspace: React.FC<Props> = ({
  settings,
  definitions,
  sourceRowsByEntity,
  loading = false,
  canAccessReports,
  canManageDefinitions = false,
  actor,
  actorId = null,
  orgId = null,
  onSaveDefinitions,
  onOpenSource,
  onMobileMenuOpen,
}) => {
  const language = settings.language as Language;
  const labels = LABELS[language] ?? LABELS['en-US'];
  const isRtl = language === 'he-IL';
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const initialSource = listReportSourceAllowlist(actor)[0]?.sourceEntity ?? 'charges';
  const [builder, setBuilder] = useState<BuilderState>(() => defaultBuilderForSource(initialSource, language));
  const [isEditing, setIsEditing] = useState(false);
  const [runResult, setRunResult] = useState<ReportResult | null>(null);
  const [runDefinitionId, setRunDefinitionId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const rows = useMemo(() => buildReportLibraryRows(definitions, actor), [definitions, actor]);
  const filteredRows = useMemo(
    () => filterReportLibraryRows(rows, { query, source, status }),
    [rows, query, source, status],
  );
  const selected = filteredRows.find(row => row.definition.id === selectedId) ?? filteredRows[0] ?? null;
  const sourceOptions = useMemo(() => {
    const configured = listReportSourceAllowlist(actor).map(entry => entry.sourceEntity);
    const fromRows = rows.map(row => row.sourceEntity);
    return Array.from(new Set([...configured, ...fromRows])).sort();
  }, [actor, rows]);
  const blockedCount = rows.filter(row => row.status === 'BLOCKED').length;
  const financeSafeCount = rows.filter(row => row.access.allowed && ['charges', 'payments', 'hoursEntries'].includes(row.sourceEntity)).length;
  const activeDefinition = selected?.definition ?? null;
  const activeAccess = activeDefinition ? getReportSourceAccess(String(activeDefinition.sourceEntity), actor) : null;
  const activeRows = activeDefinition ? sourceRowsByEntity[activeDefinition.sourceEntity] ?? [] : [];
  const visibleRunResult = runDefinitionId === activeDefinition?.id ? runResult : null;

  const startCreate = () => {
    const nextSource = (source !== 'all' ? source : initialSource) as ReportSourceEntity;
    setBuilder(defaultBuilderForSource(nextSource, language));
    setIsEditing(true);
    setRunResult(null);
    setRunDefinitionId(null);
    setRunError(null);
    setSaveError(null);
  };

  const startEdit = (definition: ReportDefinition) => {
    setBuilder(defaultBuilderForSource(definition.sourceEntity, language, definition));
    setIsEditing(true);
    setRunResult(null);
    setRunDefinitionId(null);
    setRunError(null);
    setSaveError(null);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setSaveError(null);
  };

  const saveDefinition = async () => {
    if (!canManageDefinitions || !onSaveDefinitions || !orgId) return;
    setSaveError(null);
    try {
      const previous = builder.id ? definitions.find(definition => definition.id === builder.id) ?? null : null;
      const now = new Date().toISOString();
      const next = buildReportDefinitionFromBuilder(builder, { orgId, actorId, now, previous });
      runReportDefinition(next, [], { actor: 'admin' });
      await onSaveDefinitions(prev => {
        const exists = prev.some(definition => definition.id === next.id);
        return exists
          ? prev.map(definition => definition.id === next.id ? next : definition)
          : [...prev, next];
      });
      setSelectedId(next.id);
      setBuilder(defaultBuilderForSource(next.sourceEntity, language, next));
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : labels.saveError);
    }
  };

  const runActiveDefinition = (definition: ReportDefinition | null) => {
    if (!definition) return;
    setRunError(null);
    setExportError(null);
    try {
      const rowsForSource = sourceRowsByEntity[definition.sourceEntity] ?? [];
      const result = runReportDefinition(definition, rowsForSource, {
        actor,
        sourceAuthorization: actor === 'finance'
          ? {
            actor: 'finance',
            sourceEntity: definition.sourceEntity,
            authorizedSourceIds: rowsForSource.map(row => row.id),
          }
          : undefined,
      });
      setRunResult(result);
      setRunDefinitionId(definition.id);
    } catch (error) {
      setRunResult(null);
      setRunDefinitionId(null);
      setRunError(error instanceof Error ? error.message : labels.runError);
    }
  };

  const exportActiveCsv = () => {
    if (!visibleRunResult || !activeDefinition) return;
    setExportError(null);
    try {
      const csv = exportReportCsv(visibleRunResult, { actor });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${activeDefinition.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'report'}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : labels.exportError);
    }
  };

  if (!canAccessReports) {
    return (
      <div data-testid="reports-workspace" dir={isRtl ? 'rtl' : 'ltr'} className="h-full overflow-auto bg-[#f7f0e6] p-4 md:p-6 dark:bg-slate-950">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-center">
          <section className="w-full max-w-xl rounded-lg border border-[#d8c6ad] bg-white p-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <LockKeyhole className="mx-auto h-9 w-9 text-[#8a1538]" />
            <h1 className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">{labels.deniedTitle}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{labels.deniedBody}</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="reports-workspace" dir={isRtl ? 'rtl' : 'ltr'} className="flex h-full flex-col overflow-hidden bg-[#f7f0e6] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="shrink-0 border-b border-[#d8c6ad] bg-[#fffaf2]/95 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onMobileMenuOpen}
            className="md:hidden rounded-md border border-[#d8c6ad] px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            {labels.title}
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight text-slate-950 dark:text-white">{labels.title}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{labels.subtitle}</p>
          </div>
          <div className="ms-auto flex items-center gap-2 rounded-md border border-[#d8c6ad] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            {actor === 'finance' ? <ShieldCheck size={14} /> : <BarChartIcon size={14} />}
            {actor === 'finance' ? labels.financeScope : labels.adminScope}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-4 md:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <section className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label={labels.definitions} value={<bdi>{rows.length}</bdi>} />
              <Metric label={labels.financeSafe} value={<bdi>{financeSafeCount}</bdi>} />
              <Metric label={labels.blockedSources} value={<bdi>{blockedCount}</bdi>} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManageDefinitions ? (
                <button
                  type="button"
                  onClick={startCreate}
                  className="inline-flex items-center gap-2 rounded-md bg-[#1f3a5f] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#182f4d]"
                >
                  <Plus className="h-4 w-4" />
                  {labels.create}
                </button>
              ) : (
                <div className="rounded-md border border-[#d8c6ad] bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  {labels.financeReadonly}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[#d8c6ad] bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_180px_150px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={labels.search}
                    className="w-full rounded-md border border-[#d8c6ad] bg-[#fffaf2] py-2 ps-9 pe-3 text-sm outline-none focus:border-[#1f3a5f] focus:ring-2 focus:ring-[#1f3a5f]/15 dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
                <label className="relative block">
                  <Filter className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={source}
                    onChange={event => setSource(event.target.value)}
                    className="w-full rounded-md border border-[#d8c6ad] bg-[#fffaf2] py-2 ps-9 pe-3 text-sm outline-none focus:border-[#1f3a5f] focus:ring-2 focus:ring-[#1f3a5f]/15 dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="all">{labels.allSources}</option>
                    {sourceOptions.map(option => (
                      <option key={option} value={option}>{sourceLabel(option, language)}</option>
                    ))}
                  </select>
                </label>
                <select
                  value={status}
                  onChange={event => setStatus(event.target.value as StatusFilter)}
                  className="w-full rounded-md border border-[#d8c6ad] bg-[#fffaf2] px-3 py-2 text-sm outline-none focus:border-[#1f3a5f] focus:ring-2 focus:ring-[#1f3a5f]/15 dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="all">{labels.allStatuses}</option>
                  <option value="pinned">{labels.pinned}</option>
                  <option value="ready">{labels.ready}</option>
                  <option value="blocked">{labels.blocked}</option>
                </select>
              </div>
              {actor === 'finance' && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{labels.financeNote}</p>
              )}
            </div>

            {blockedCount > 0 && (
              <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-semibold">{labels.staleTitle}</div>
                  <div>{labels.staleBody}</div>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-[#d8c6ad] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {loading ? (
                <div className="p-6 text-sm text-slate-600 dark:text-slate-300">{labels.loading}</div>
              ) : rows.length === 0 ? (
                <div className="p-6">
                  <Table2 className="h-8 w-8 text-slate-400" />
                  <h2 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">{labels.emptyTitle}</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{labels.emptyBody}</p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="p-6">
                  <Search className="h-8 w-8 text-slate-400" />
                  <h2 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">{labels.noMatchesTitle}</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{labels.noMatchesBody}</p>
                </div>
              ) : (
                <div className="divide-y divide-[#eadfce] dark:divide-slate-800">
                  {filteredRows.map(row => (
                    <button
                      key={row.definition.id}
                      type="button"
                      data-testid={`report-library-row-${row.definition.id}`}
                      onClick={() => setSelectedId(row.definition.id)}
                      className={`grid w-full grid-cols-[1fr_auto] gap-3 px-3 py-3 text-start transition-colors hover:bg-[#fff6e8] dark:hover:bg-slate-800/60 ${
                        selected?.definition.id === row.definition.id ? 'bg-[#fff6e8] dark:bg-slate-800/70' : ''
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          {row.definition.isPinned && <Pin className="h-3.5 w-3.5 text-[#8a1538]" />}
                          <span className="truncate text-sm font-semibold text-slate-950 dark:text-white">{row.definition.name}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE_CLASS[row.status]}`}>
                            {labels[statusLabelKey(row.status)]}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">
                          {row.definition.description || labels.noDescription}
                        </span>
                      </span>
                      <span className="text-end text-xs text-slate-500 dark:text-slate-400">
                        <span className="block font-semibold text-slate-700 dark:text-slate-200">{sourceLabel(row.sourceEntity, language)}</span>
                        <bdi className="block">{formatDate(row.definition.updatedAt, language)}</bdi>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="min-w-0 rounded-lg border border-[#d8c6ad] bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {isEditing ? (
              <BuilderPanel
                labels={labels}
                language={language}
                builder={builder}
                canSave={Boolean(canManageDefinitions && onSaveDefinitions && orgId)}
                saveError={saveError}
                onChange={setBuilder}
                onSave={saveDefinition}
                onCancel={cancelEdit}
              />
            ) : selected ? (
              <div data-testid="report-definition-detail" className="space-y-4">
                <div className="flex flex-wrap items-start gap-2">
                  {selected.access.allowed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700 dark:text-amber-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-slate-950 dark:text-white">{selected.definition.name}</h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{selected.definition.description || labels.noDescription}</p>
                  </div>
                  {canManageDefinitions && (
                    <button
                      type="button"
                      onClick={() => startEdit(selected.definition)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#d8c6ad] bg-[#fffaf2] px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#f7ead7] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      {labels.edit}
                    </button>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Info label={labels.source} value={sourceLabel(selected.sourceEntity, language)} />
                  <Info label={labels.updated} value={<bdi>{formatDate(selected.definition.updatedAt, language)}</bdi>} />
                  <Info label={labels.columns} value={<bdi>{selected.definition.columns.length}</bdi>} />
                  <Info label={labels.filters} value={<bdi>{selected.definition.filters.length}</bdi>} />
                  <Info label={labels.group} value={<bdi>{selected.definition.groupBy || '-'}</bdi>} />
                  <Info label={labels.aggregate} value={<bdi>{selected.definition.aggregate.fn}{selected.definition.aggregate.field ? `:${selected.definition.aggregate.field}` : ''}</bdi>} />
                </div>

                {!selected.access.allowed && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                    <span className="font-semibold">{selected.access.reason}</span>
                    {selected.access.blockedDecisionIds.length > 0 && (
                      <span> · <bdi>{selected.access.blockedDecisionIds.join(', ')}</bdi></span>
                    )}
                  </div>
                )}

                {activeAccess?.allowed && activeRows.length === 0 && (
                  <div className="rounded-lg border border-[#eadfce] bg-[#fffaf2] p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    {labels.sourceUnavailable}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!selected.access.allowed}
                    onClick={() => runActiveDefinition(selected.definition)}
                    className="inline-flex items-center gap-2 rounded-md bg-[#8a1538] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#74112f] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PlayCircle className="h-4 w-4" />
                    {labels.run}
                  </button>
                  <button
                    type="button"
                    disabled={!visibleRunResult}
                    onClick={exportActiveCsv}
                    className="inline-flex items-center gap-2 rounded-md border border-[#d8c6ad] bg-[#fffaf2] px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-[#f7ead7] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <Download className="h-4 w-4" />
                    {labels.exportCsv}
                  </button>
                </div>
                {runError && <ErrorBox message={`${labels.runError} ${runError}`} />}
                {exportError && <ErrorBox message={`${labels.exportError} ${exportError}`} />}

                <ReportResults
                  labels={labels}
                  result={visibleRunResult}
                  definition={selected.definition}
                  sourceRows={activeRows}
                  onOpenSource={onOpenSource}
                />
              </div>
            ) : (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
                <Table2 className="h-8 w-8 text-slate-400" />
                <h2 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">{labels.selectedTitle}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{labels.selectPrompt}</p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-lg border border-[#eadfce] bg-[#fffaf2] px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
    <div className="text-[11px] font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const ErrorBox = ({ message }: { message: string }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100">
    {message}
  </div>
);

const BuilderPanel = ({
  labels,
  language,
  builder,
  canSave,
  saveError,
  onChange,
  onSave,
  onCancel,
}: {
  labels: Record<string, string>;
  language: Language;
  builder: BuilderState;
  canSave: boolean;
  saveError: string | null;
  onChange: React.Dispatch<React.SetStateAction<BuilderState>>;
  onSave: () => void;
  onCancel: () => void;
}) => {
  const access = getReportSourceAccess(builder.sourceEntity, 'admin');
  const fields = access.allowedFields;
  const sourceOptions = listReportSourceAllowlist('admin');
  const updateFilter = (index: number, patch: Partial<ReportFilter>) => {
    onChange(prev => ({
      ...prev,
      filters: prev.filters.map((filter, i) => i === index ? { ...filter, ...patch } : filter),
    }));
  };

  return (
    <div data-testid="report-builder" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-[#1f3a5f]" />
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">{labels.create}</h2>
        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[#d8c6ad] px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={onSave}
            className="inline-flex items-center gap-1 rounded-md bg-[#1f3a5f] px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" />
            {labels.save}
          </button>
        </div>
      </div>

      {saveError && <ErrorBox message={`${labels.saveError} ${saveError}`} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label={labels.reportName}>
          <input
            value={builder.name}
            onChange={event => onChange(prev => ({ ...prev, name: event.target.value }))}
            className={FIELD_INPUT_CLASS}
          />
        </LabeledInput>
        <LabeledInput label={labels.source}>
          <select
            value={builder.sourceEntity}
            onChange={event => {
              const nextSource = event.target.value as ReportSourceEntity;
              onChange(defaultBuilderForSource(nextSource, language));
            }}
            className={FIELD_INPUT_CLASS}
          >
            {sourceOptions.map(option => (
              <option key={option.sourceEntity} value={option.sourceEntity}>{sourceLabel(option.sourceEntity, language)}</option>
            ))}
          </select>
        </LabeledInput>
      </div>

      <LabeledInput label={labels.description}>
        <textarea
          value={builder.description}
          onChange={event => onChange(prev => ({ ...prev, description: event.target.value }))}
          rows={2}
          className={`${FIELD_INPUT_CLASS} resize-none`}
        />
      </LabeledInput>

      <label className="inline-flex items-center gap-2 rounded-md border border-[#eadfce] bg-[#fffaf2] px-2.5 py-2 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
        <input
          type="checkbox"
          checked={builder.isPinned}
          onChange={event => onChange(prev => ({ ...prev, isPinned: event.target.checked }))}
        />
        <Pin className="h-3.5 w-3.5 text-[#8a1538]" />
        {labels.pinDefinition}
      </label>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">{labels.columns}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {fields.map(field => (
            <label key={field} className="flex items-center gap-2 rounded-md border border-[#eadfce] bg-[#fffaf2] px-2 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950">
              <input
                type="checkbox"
                checked={builder.columns.includes(field)}
                onChange={event => onChange(prev => ({
                  ...prev,
                  columns: event.target.checked
                    ? Array.from(new Set([...prev.columns, field]))
                    : prev.columns.filter(column => column !== field),
                }))}
              />
              <bdi>{field}</bdi>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <LabeledInput label={labels.group}>
          <select
            value={builder.groupBy}
            onChange={event => onChange(prev => ({ ...prev, groupBy: event.target.value }))}
            className={FIELD_INPUT_CLASS}
          >
            <option value="">{labels.noGroup}</option>
            {fields.map(field => <option key={field} value={field}>{field}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label={labels.aggregate}>
          <select
            value={builder.aggregateFn}
            onChange={event => onChange(prev => ({ ...prev, aggregateFn: event.target.value as ReportDefinition['aggregate']['fn'] }))}
            className={FIELD_INPUT_CLASS}
          >
            {AGGREGATE_FNS.map(fn => <option key={fn} value={fn}>{fn}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label={labels.noAggregateField}>
          <select
            value={builder.aggregateField}
            onChange={event => onChange(prev => ({ ...prev, aggregateField: event.target.value }))}
            className={FIELD_INPUT_CLASS}
          >
            <option value="">{labels.noAggregateField}</option>
            {fields.map(field => <option key={field} value={field}>{field}</option>)}
          </select>
        </LabeledInput>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">{labels.filters}</div>
          <button
            type="button"
            onClick={() => onChange(prev => ({
              ...prev,
              filters: [...prev.filters, { field: fields[0] ?? 'id', op: 'eq', value: null }],
            }))}
            className="inline-flex items-center gap-1 rounded-md border border-[#d8c6ad] px-2 py-1 text-xs font-semibold dark:border-slate-700"
          >
            <Plus className="h-3.5 w-3.5" />
            {labels.addFilter}
          </button>
        </div>
        {builder.filters.map((filter, index) => (
          <div key={`${filter.field}-${index}`} className="grid gap-2 rounded-md border border-[#eadfce] bg-[#fffaf2] p-2 sm:grid-cols-[1fr_100px_1fr_auto] dark:border-slate-800 dark:bg-slate-950">
            <select value={filter.field} onChange={event => updateFilter(index, { field: event.target.value })} className={FIELD_INPUT_CLASS}>
              {fields.map(field => <option key={field} value={field}>{field}</option>)}
            </select>
            <select value={filter.op} onChange={event => updateFilter(index, { op: event.target.value as ReportFilter['op'] })} className={FIELD_INPUT_CLASS}>
              {FILTER_OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
            <input
              value={filterValueToInput(filter.value)}
              onChange={event => updateFilter(index, { value: coerceFilterValue(event.target.value, filter.op) })}
              className={FIELD_INPUT_CLASS}
            />
            <button
              type="button"
              aria-label={labels.removeFilter}
              onClick={() => onChange(prev => ({ ...prev, filters: prev.filters.filter((_, i) => i !== index) }))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d8c6ad] text-slate-500 hover:text-red-700 dark:border-slate-700"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const LabeledInput = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">{label}</span>
    {children}
  </label>
);

const ReportResults = ({
  labels,
  result,
  definition,
  sourceRows,
  onOpenSource,
}: {
  labels: Record<string, string>;
  result: ReportResult | null;
  definition: ReportDefinition;
  sourceRows: ReportSourceRow[];
  onOpenSource?: (sourceEntity: ReportSourceEntity, sourceId: string, row?: ReportSourceRow) => void;
}) => {
  if (!result) {
    return (
      <div className="rounded-lg border border-[#eadfce] bg-[#fffaf2] p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
        {labels.noResults}
      </div>
    );
  }

  const lineage = getReportLineage(definition, result);
  const sourceById = new Map(sourceRows.map(row => [row.id, row]));

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[#eadfce] bg-[#fffaf2] p-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Table2 className="h-4 w-4" />
          {labels.results}
          <bdi className="ms-auto text-xs text-slate-500">{result.totalRows}</bdi>
        </div>
        {result.rows.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">{labels.emptyResults}</div>
        ) : (
          <div className="max-h-80 overflow-auto rounded-md border border-[#eadfce] bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-[#fffaf2] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  {result.columns.map(column => (
                    <th key={column} className="whitespace-nowrap px-2 py-2 text-start font-semibold"><bdi>{column}</bdi></th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eadfce] dark:divide-slate-800">
                {result.rows.map((row, index) => (
                  <tr key={`${result.sourceIds[index] ?? index}`}>
                    {result.columns.map(column => (
                      <td key={column} className="whitespace-nowrap px-2 py-2 text-slate-700 dark:text-slate-200"><bdi>{String(row[column] ?? '')}</bdi></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {result.groups.length > 0 && (
        <section className="rounded-lg border border-[#eadfce] bg-[#fffaf2] p-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <BarChartIcon className="h-4 w-4" />
            {labels.grouped}
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={result.groups.map(group => ({ name: group.key, value: group.value, count: group.count }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8a1538" radius={[4, 4, 0, 0]} />
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-[#eadfce] bg-[#fffaf2] p-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Link2 className="h-4 w-4" />
          {labels.lineage}
          <bdi className="ms-auto text-xs text-slate-500">{lineage.rowCount}</bdi>
        </div>
        <div className="flex flex-wrap gap-2">
          {lineage.sourceIds.map(sourceId => (
            <button
              key={sourceId}
              type="button"
              disabled={!onOpenSource}
              onClick={() => onOpenSource?.(definition.sourceEntity, sourceId, sourceById.get(sourceId))}
              className="rounded-md border border-[#d8c6ad] bg-white px-2 py-1 text-xs font-semibold text-[#1f3a5f] hover:bg-[#f7ead7] disabled:cursor-default disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-200"
            >
              {labels.sourceLink} <bdi>{sourceId}</bdi>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
