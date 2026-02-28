// ──────────────────────────────────────────────
// components/ChartBuilderModal.tsx — Chart Builder Modal
// ──────────────────────────────────────────────
// Side-by-side layout: Configuration (left) + Live Preview (right)
// Dropdown-based multi-select filters with checkboxes
// ──────────────────────────────────────────────

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
    ChartConfiguration,
    DimensionId,
    MetricId,
    MetricSelection,
    VisualizationType,
    AggregationFn,
    FilterSnapshot,
    ChartFilters,
} from '../types/chartBuilder';
import {
    DIMENSION_REGISTRY,
    METRIC_REGISTRY,
    getCompatibleVisualizations,
    getSmartDefaultVisualization,
} from '../chartBuilder/smartDefaults';
import { ChartRenderer } from './ChartRenderer';
import { MergedChartRenderer, DatasetInput } from './MergedChartRenderer';
import { DatePicker } from './DatePicker';
import { CalendarEvent, Teacher } from '../types';
import { Modal } from './Modal';
import {
    X, Plus, Trash2, BarChart3, TrendingUp,
    PieChart as PieIcon, Table, BarChart2, Layers,
    ArrowUpDown, Hash, Eye, Zap, Camera, Filter, Check,
    ChevronDown, Calendar, GitCompareArrows, Columns, Merge,
} from 'lucide-react';

// ── Visualization icons + labels ──

const VIZ_OPTIONS: { type: VisualizationType; label: string; icon: React.ReactNode }[] = [
    { type: 'bar', label: 'Bar', icon: <BarChart2 size={14} /> },
    { type: 'stacked-bar', label: 'Stacked', icon: <Layers size={14} /> },
    { type: 'line', label: 'Line', icon: <TrendingUp size={14} /> },
    { type: 'pie', label: 'Pie', icon: <PieIcon size={14} /> },
    { type: 'table', label: 'Table', icon: <Table size={14} /> },
];

// ── Aggregation options ──

const AGG_OPTIONS: { value: AggregationFn; label: string }[] = [
    { value: 'SUM', label: 'Sum' },
    { value: 'AVG', label: 'Average' },
    { value: 'COUNT', label: 'Count' },
    { value: 'MIN', label: 'Min' },
    { value: 'MAX', label: 'Max' },
];

// ── Metric options ──

const METRIC_OPTIONS: { value: MetricId; label: string }[] = Object.values(METRIC_REGISTRY).map(m => ({
    value: m.id as MetricId,
    label: m.label,
}));

// ── Timeframe types + helpers ──

type TimeframeType = 'today' | 'currentWeek' | 'currentMonth' | 'customRange' | 'specificDay' | 'specificWeek' | 'specificMonth';

const TIMEFRAME_OPTIONS: { value: TimeframeType; label: string; icon: string }[] = [
    { value: 'today', label: 'Today', icon: '📅' },
    { value: 'currentWeek', label: 'Current Week', icon: '📆' },
    { value: 'currentMonth', label: 'Current Month', icon: '🗓️' },
    { value: 'customRange', label: 'Custom Range', icon: '📐' },
    { value: 'specificDay', label: 'Specific Day', icon: '🎯' },
    { value: 'specificWeek', label: 'Specific Week', icon: '📌' },
    { value: 'specificMonth', label: 'Specific Month', icon: '📊' },
];

/** Compute start/end Date from a TimeframeType + optional user picks */
function computeDateRange(
    type: TimeframeType,
    customStart?: string,
    customEnd?: string,
    specificDate?: string,
): { start: Date; end: Date } {
    const now = new Date();
    switch (type) {
        case 'today': {
            const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const e = new Date(s); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        case 'currentWeek': {
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            const s = new Date(now.getFullYear(), now.getMonth(), diff);
            s.setHours(0, 0, 0, 0);
            const e = new Date(s); e.setDate(e.getDate() + 6); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        case 'currentMonth': {
            const s = new Date(now.getFullYear(), now.getMonth(), 1);
            const e = new Date(now.getFullYear(), now.getMonth() + 1, 0); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        case 'customRange': {
            const s = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1);
            const e = customEnd ? new Date(customEnd) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
            e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        case 'specificDay': {
            const d = specificDate ? new Date(specificDate) : now;
            const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const e = new Date(s); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        case 'specificWeek': {
            const d = specificDate ? new Date(specificDate) : now;
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const s = new Date(d.getFullYear(), d.getMonth(), diff);
            s.setHours(0, 0, 0, 0);
            const e = new Date(s); e.setDate(e.getDate() + 6); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        case 'specificMonth': {
            const d = specificDate ? new Date(specificDate + '-01') : now;
            const s = new Date(d.getFullYear(), d.getMonth(), 1);
            const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
    }
}

// ══════════════════════════════════════════════
// MultiSelectDropdown — reusable dropdown with checkboxes
// ══════════════════════════════════════════════

interface DropdownItem {
    id: string;
    label: string;
}

interface MultiSelectDropdownProps {
    label: string;
    items: DropdownItem[];
    selected: Set<string>;
    onToggle: (id: string) => void;
    onClear: () => void;
    t?: (key: string) => string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
    label, items, selected, onToggle, onClear, t: _t2,
}) => {
    const t = _t2 ?? ((k: string) => k);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const count = selected.size;
    const summary = count === 0
        ? `${t('dropdown.all')} ${label}`
        : count === 1
            ? items.find(i => selected.has(i.id))?.label ?? `1 ${t('dropdown.selected')}`
            : `${count} ${t('dropdown.selected')}`;

    return (
        <div ref={ref} className="relative">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">
                {label}
            </label>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs text-start transition-all ${count > 0
                    ? 'border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
            >
                <span className="truncate">{summary}</span>
                <ChevronDown size={12} className={`flex-shrink-0 ms-1 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-52 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Select All / Clear All */}
                    <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-3 py-2 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => items.forEach(i => { if (!selected.has(i.id)) onToggle(i.id); })}
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium"
                        >
                            {t('dropdown.select_all')}
                        </button>
                        {count > 0 && (
                            <button
                                type="button"
                                onClick={onClear}
                                className="text-[10px] text-red-500 hover:text-red-700 font-medium flex items-center gap-0.5"
                            >
                                <X size={9} /> {t('dropdown.clear')}
                            </button>
                        )}
                    </div>
                    {items.map(item => (
                        <div
                            key={item.id}
                            onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
                            className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                        >
                            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all ${selected.has(item.id)
                                ? 'bg-violet-600 border-violet-600'
                                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                }`}>
                                {selected.has(item.id) && <Check size={10} className="text-white" />}
                            </div>
                            <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{item.label}</span>
                        </div>
                    ))}
                    {items.length === 0 && (
                        <div className="px-3 py-3 text-[10px] text-slate-400 text-center">{t('dropdown.no_options')}</div>
                    )}
                </div>
            )}
        </div>
    );
};

// ══════════════════════════════════════════════
// Props
// ══════════════════════════════════════════════

export interface ChartBuilderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: ChartConfiguration) => void;
    filteredEvents: CalendarEvent[];
    allEvents: CalendarEvent[];
    teachers: Teacher[];
    currentFilters: {
        dateFilterType: string;
        customStartDate: string;
        customEndDate: string;
        selectedTeacherIds: Set<string>;
        selectedPositionNames: Set<string>;
        selectedTags: Set<string>;
        selectedCategories: Set<string>;
        selectedRateTypes: Set<string>;
    };
    editingChart?: ChartConfiguration | null;
    currencySymbol?: string;
    t?: (key: string) => string;
}

// ══════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════

export const ChartBuilderModal: React.FC<ChartBuilderModalProps> = ({
    isOpen, onClose, onSave, filteredEvents, allEvents, teachers, currentFilters, editingChart, currencySymbol = '₪', t: _t,
}) => {
    const t = _t ?? ((k: string) => k);
    // ── Draft state ──// ── Draft state ──
    const [title, setTitle] = useState('');
    const [dimension, setDimension] = useState<DimensionId>('teacher');
    const [metrics, setMetrics] = useState<MetricSelection[]>([{ metricId: 'totalCost', aggregation: 'SUM' }]);
    const [visualization, setVisualization] = useState<VisualizationType>('bar');
    const [filterMode, setFilterMode] = useState<'live' | 'snapshot'>('live');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [topN, setTopN] = useState<number>(0);
    const [sortBy, setSortBy] = useState<'dimension' | MetricId>('dimension');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // Per-chart filters
    const [chartFilterTeachers, setChartFilterTeachers] = useState<Set<string>>(new Set());
    const [chartFilterPositions, setChartFilterPositions] = useState<Set<string>>(new Set());
    const [chartFilterTags, setChartFilterTags] = useState<Set<string>>(new Set());
    const [chartFilterCategories, setChartFilterCategories] = useState<Set<string>>(new Set());
    const [chartFilterRateTypes, setChartFilterRateTypes] = useState<Set<string>>(new Set());

    // ── Timeframe state ──
    const [timeframe, setTimeframe] = useState<TimeframeType>('currentMonth');
    const [tfCustomStart, setTfCustomStart] = useState('');
    const [tfCustomEnd, setTfCustomEnd] = useState('');
    const [tfSpecificDate, setTfSpecificDate] = useState('');

    // ── Comparison mode (multi-comparison) ──
    interface ComparisonEntry {
        id: string;
        specificDate: string;
        customStart: string;
        customEnd: string;
    }
    const [compareEnabled, setCompareEnabled] = useState(false);
    const [comparisons, setComparisons] = useState<ComparisonEntry[]>([]);
    const [compareLayout, setCompareLayout] = useState<'side-by-side' | 'merged'>('merged');

    const addComparison = () => {
        setComparisons(prev => [...prev, {
            id: `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
            specificDate: '', customStart: '', customEnd: '',
        }]);
    };
    const removeComparison = (id: string) => {
        setComparisons(prev => prev.filter(c => c.id !== id));
    };
    const updateComparison = (id: string, updates: Partial<ComparisonEntry>) => {
        setComparisons(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    // ── Reset / populate on open ──
    useEffect(() => {
        if (!isOpen) return;
        if (editingChart) {
            setTitle(editingChart.title);
            setDimension(editingChart.dimension);
            setMetrics([...editingChart.metrics]);
            setVisualization(editingChart.visualization);
            setFilterMode(editingChart.filterMode);
            setTopN(editingChart.limit?.topN ?? 0);
            setSortBy(editingChart.sort?.by ?? 'dimension');
            setSortDir(editingChart.sort?.direction ?? 'desc');
            setShowAdvanced(!!(editingChart.sort || editingChart.limit));
            const cf = editingChart.chartFilters;
            setChartFilterTeachers(new Set(cf?.teacherIds ?? []));
            setChartFilterPositions(new Set(cf?.positionNames ?? []));
            setChartFilterTags(new Set(cf?.tags ?? []));
            setChartFilterCategories(new Set(cf?.categories ?? []));
            setChartFilterRateTypes(new Set(cf?.rateTypes ?? []));
            // Restore comparison mode
            setCompareEnabled(editingChart.compareEnabled ?? false);
            setCompareLayout(editingChart.compareLayout ?? 'merged');
            setComparisons((editingChart.comparisons ?? []).map(c => ({
                id: c.id, specificDate: c.specificDate ?? '',
                customStart: c.customStart ?? '', customEnd: c.customEnd ?? '',
            })));
        } else {
            setTitle(''); setDimension('teacher');
            setMetrics([{ metricId: 'totalCost', aggregation: 'SUM' }]);
            setVisualization('bar'); setFilterMode('live');
            setTopN(0); setSortBy('dimension'); setSortDir('desc'); setShowAdvanced(false);
            setChartFilterTeachers(new Set()); setChartFilterPositions(new Set());
            setChartFilterTags(new Set()); setChartFilterCategories(new Set());
            setChartFilterRateTypes(new Set());
            setTimeframe('currentMonth'); setTfCustomStart(''); setTfCustomEnd(''); setTfSpecificDate('');
            setCompareEnabled(false);
            setComparisons([]); setCompareLayout('merged');
        }
    }, [isOpen, editingChart]);

    // ── Time-filtered events ──
    const timeFilteredEvents = useMemo(() => {
        const { start, end } = computeDateRange(timeframe, tfCustomStart, tfCustomEnd, tfSpecificDate);
        return allEvents.filter(e => {
            if (e.isHidden) return false;
            const eStart = new Date(e.start);
            return eStart >= start && eStart <= end;
        });
    }, [allEvents, timeframe, tfCustomStart, tfCustomEnd, tfSpecificDate]);

    // Derive the comparison timeframe type from the primary timeframe
    const derivedCompareTimeframe = useMemo((): TimeframeType => {
        switch (timeframe) {
            case 'today': case 'specificDay': return 'specificDay';
            case 'currentWeek': case 'specificWeek': return 'specificWeek';
            case 'currentMonth': case 'specificMonth': return 'specificMonth';
            case 'customRange': return 'customRange';
        }
    }, [timeframe]);

    // Compute filtered events for each comparison entry
    const comparisonResults = useMemo(() => {
        if (!compareEnabled || comparisons.length === 0) return [];
        return comparisons.map(cmp => {
            const { start, end } = computeDateRange(
                derivedCompareTimeframe, cmp.customStart, cmp.customEnd, cmp.specificDate
            );
            const events = allEvents.filter(e => {
                if (e.isHidden) return false;
                const eStart = new Date(e.start);
                return eStart >= start && eStart <= end;
            });
            return { ...cmp, events, eventCount: events.length };
        });
    }, [allEvents, compareEnabled, comparisons, derivedCompareTimeframe]);

    // Meaningful label for a comparison entry
    const getCompareLabel = useCallback((cmp: ComparisonEntry): string => {
        if (derivedCompareTimeframe === 'customRange') {
            if (cmp.customStart && cmp.customEnd) return `${cmp.customStart} → ${cmp.customEnd}`;
            return t('builder.custom_range');
        }
        if (cmp.specificDate) {
            if (derivedCompareTimeframe === 'specificDay') return new Date(cmp.specificDate).toLocaleDateString();
            if (derivedCompareTimeframe === 'specificMonth') {
                const d = new Date(cmp.specificDate + '-01');
                return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            }
            if (derivedCompareTimeframe === 'specificWeek') {
                const d = new Date(cmp.specificDate);
                return `${t('builder.week_of')} ${d.toLocaleDateString()}`;
            }
        }
        return t('builder.select_period');
    }, [derivedCompareTimeframe]);

    // Colors for comparison datasets
    const COMPARE_COLORS = ['#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308'];

    // ── Smart Defaults ──
    const compatibleViz = useMemo(() => getCompatibleVisualizations(dimension, metrics), [dimension, metrics]);
    const handleDimensionChange = useCallback((newDim: DimensionId) => {
        setDimension(newDim);
        setVisualization(getSmartDefaultVisualization(newDim, metrics));
    }, [metrics]);

    // Auto-adjust visualization when metrics change and current becomes incompatible
    useEffect(() => {
        const compatible = getCompatibleVisualizations(dimension, metrics);
        if (!compatible.includes(visualization)) {
            setVisualization(getSmartDefaultVisualization(dimension, metrics));
        }
    }, [dimension, metrics, visualization]);

    // ── Metrics management ──
    const addMetric = () => {
        const used = new Set(metrics.map(m => m.metricId));
        const next = METRIC_OPTIONS.find(o => !used.has(o.value));
        if (next) {
            const newMetrics = [...metrics, { metricId: next.value, aggregation: 'SUM' as const }];
            setMetrics(newMetrics);
        }
    };
    const updateMetric = (index: number, updates: Partial<MetricSelection>) => {
        const updated = [...metrics]; updated[index] = { ...updated[index], ...updates };
        setMetrics(updated);
    };
    const removeMetric = (index: number) => {
        if (metrics.length <= 1) return;
        const newMetrics = metrics.filter((_, i) => i !== index);
        setMetrics(newMetrics);
    };

    // ── Toggle helper ──
    const toggleIn = (set: Set<string>, setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id); else next.add(id);
        setFn(next);
    };

    // ── Dynamic, cross-filtered filter options ──
    // Options in each dropdown are based on the timeFilteredEvents and the current
    // selections in OTHER filters, creating an interdependent filter system.
    const filterOptions = useMemo(() => {
        // Build a mapping of teacherId -> Teacher for quick lookup
        const teacherMap = new Map<string, Teacher>(teachers.map(t => [t.id, t]));

        // Step 1: Determine which teachers match based on the current selections
        // (excluding the teacher filter itself so we don't self-restrict)
        const matchingTeacherIds = new Set<string>();
        const matchingPositions = new Set<string>();
        const matchingTags = new Set<string>();
        const matchingCategories = new Set<string>();
        const matchingRateTypes = new Set<string>();

        // Collect all relevant metadata from time-filtered events
        for (const ev of timeFilteredEvents) {
            const teacher = teacherMap.get(ev.teacherId);
            if (!teacher) continue;

            const pa = teacher.positionAssignments?.find(p => p.id === ev.positionId)
                ?? teacher.positionAssignments?.[0];

            // Check if this event passes the OTHER filters (not the one being populated)
            const passesTeacher = chartFilterTeachers.size === 0 || chartFilterTeachers.has(teacher.id);
            const passesPosition = chartFilterPositions.size === 0 || (pa && chartFilterPositions.has(pa.positionName));
            const passesTags = chartFilterTags.size === 0 || teacher.tags?.some(t => chartFilterTags.has(t));
            const passesCategory = chartFilterCategories.size === 0 || (pa && chartFilterCategories.has(pa.category));
            const passesRateType = chartFilterRateTypes.size === 0 || (pa && chartFilterRateTypes.has(pa.rateType));

            // For each dropdown, include options if all OTHER filters pass
            // Teachers dropdown: show teachers that match position/tag/category/rateType filters
            if (passesPosition && passesTags && passesCategory && passesRateType) {
                matchingTeacherIds.add(teacher.id);
            }
            // Positions dropdown: show positions that match teacher/tag/category/rateType filters
            if (passesTeacher && passesTags && passesCategory && passesRateType && pa) {
                matchingPositions.add(pa.positionName);
            }
            // Tags dropdown: show tags that match teacher/position/category/rateType filters
            if (passesTeacher && passesPosition && passesCategory && passesRateType) {
                teacher.tags?.forEach(tag => matchingTags.add(tag));
            }
            // Categories: show categories that match teacher/position/tag/rateType filters
            if (passesTeacher && passesPosition && passesTags && passesRateType && pa) {
                matchingCategories.add(pa.category);
            }
            // Rate types: show rate types that match teacher/position/tag/category filters
            if (passesTeacher && passesPosition && passesTags && passesCategory && pa) {
                matchingRateTypes.add(pa.rateType);
            }
        }

        return {
            teachers: teachers
                .filter(t => matchingTeacherIds.has(t.id))
                .map(t => ({ id: t.id, label: t.fullName })),
            positions: Array.from(matchingPositions).sort().map(p => ({ id: p, label: p })),
            tags: Array.from(matchingTags).sort().map(t => ({ id: t, label: t })),
            categories: Array.from(matchingCategories).sort().map(c => ({ id: c, label: c })),
            rateTypes: Array.from(matchingRateTypes).sort().map(r => ({ id: r, label: r })),
        };
    }, [teachers, timeFilteredEvents, chartFilterTeachers, chartFilterPositions, chartFilterTags, chartFilterCategories, chartFilterRateTypes]);

    // ── Chart filters object ──
    const chartFiltersObj: ChartFilters | undefined = useMemo(() => {
        const hasAny = chartFilterTeachers.size > 0 || chartFilterPositions.size > 0 ||
            chartFilterTags.size > 0 || chartFilterCategories.size > 0 || chartFilterRateTypes.size > 0;
        if (!hasAny) return undefined;
        return {
            teacherIds: [...chartFilterTeachers], positionNames: [...chartFilterPositions],
            tags: [...chartFilterTags], categories: [...chartFilterCategories], rateTypes: [...chartFilterRateTypes],
        };
    }, [chartFilterTeachers, chartFilterPositions, chartFilterTags, chartFilterCategories, chartFilterRateTypes]);

    const chartFilterCount = chartFilterTeachers.size + chartFilterPositions.size + chartFilterTags.size + chartFilterCategories.size + chartFilterRateTypes.size;

    // ── Preview config ──
    const previewConfig: ChartConfiguration = useMemo(() => ({
        id: '__preview__', title: title || 'Preview', dataSource: 'financial-dashboard',
        dimension, metrics, visualization, filterMode: 'live', chartFilters: chartFiltersObj,
        sort: sortBy !== 'dimension' || sortDir !== 'desc' ? { by: sortBy, direction: sortDir } : undefined,
        limit: topN > 0 ? { topN, otherLabel: 'Other' } : undefined,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }), [title, dimension, metrics, visualization, chartFiltersObj, sortBy, sortDir, topN]);

    // ── Filter description ──
    const filterDescription = useMemo(() => {
        const parts: string[] = [currentFilters.dateFilterType];
        if (currentFilters.selectedTeacherIds.size > 0) parts.push(`${currentFilters.selectedTeacherIds.size} ${t('builder.teacher_s')}`);
        if (currentFilters.selectedPositionNames.size > 0) parts.push(`${currentFilters.selectedPositionNames.size} ${t('builder.position_s')}`);
        if (currentFilters.selectedTags.size > 0) parts.push(`${currentFilters.selectedTags.size} ${t('builder.tag_s')}`);
        if (currentFilters.selectedCategories.size > 0) parts.push(`${currentFilters.selectedCategories.size} ${t('builder.category_ies')}`);
        if (currentFilters.selectedRateTypes.size > 0) parts.push(`${currentFilters.selectedRateTypes.size} ${t('builder.rate_type_s')}`);
        return parts.join(' · ');
    }, [currentFilters]);

    // ── Save handler ──
    const handleSave = () => {
        if (!title.trim()) return;
        const now = new Date().toISOString();
        const config: ChartConfiguration = {
            id: editingChart?.id ?? `chart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: title.trim(), dataSource: 'financial-dashboard', dimension, metrics, visualization,
            filterMode, chartFilters: chartFiltersObj,
            filterSnapshot: filterMode === 'snapshot' ? {
                dateFilterType: currentFilters.dateFilterType as FilterSnapshot['dateFilterType'],
                customStartDate: currentFilters.customStartDate || undefined,
                customEndDate: currentFilters.customEndDate || undefined,
                teacherIds: [...currentFilters.selectedTeacherIds], positionNames: [...currentFilters.selectedPositionNames],
                tags: [...currentFilters.selectedTags], categories: [...currentFilters.selectedCategories],
                rateTypes: [...currentFilters.selectedRateTypes],
            } : undefined,
            sort: sortBy !== 'dimension' || sortDir !== 'desc' ? { by: sortBy, direction: sortDir } : undefined,
            limit: topN > 0 ? { topN, otherLabel: 'Other' } : undefined,
            // Comparison mode data
            compareEnabled: compareEnabled && comparisons.length > 0 ? true : undefined,
            compareLayout: compareEnabled && comparisons.length > 0 ? compareLayout : undefined,
            comparisons: compareEnabled && comparisons.length > 0 ? comparisons.map(c => ({
                id: c.id, timeframe: derivedCompareTimeframe,
                specificDate: c.specificDate || undefined,
                customStart: c.customStart || undefined,
                customEnd: c.customEnd || undefined,
            })) : undefined,
            createdAt: editingChart?.createdAt ?? now, updatedAt: now,
        };
        onSave(config);
        onClose();
    };

    if (!isOpen) return null;

    // ══════════════════════════════════════════════
    // RENDER — Side-by-side layout
    // ══════════════════════════════════════════════
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            isDirty={title !== (editingChart?.title || '')}
            hideHeader={true}
            maxWidth="max-w-7xl"
            t={t}
            className="h-[92vh]"
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
                <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <BarChart3 size={20} className="text-blue-500" />
                    {editingChart ? t('builder.edit_chart') : t('builder.create_chart')}
                </h2>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <X size={18} className="text-slate-400" />
                </button>
            </div>

            {/* ── Two-Column Body ── */}
            <div className="flex-1 overflow-hidden flex">

                {/* ─── LEFT: Configuration ─── */}
                <div className="w-1/2 border-e border-slate-200 dark:border-slate-800 overflow-y-auto custom-scrollbar px-6 py-5 space-y-5">

                    {/* Title */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">{t('builder.chart_title')}</label>
                        <input
                            type="text" placeholder={t('builder.chart_title_placeholder')}
                            value={title} onChange={e => setTitle(e.target.value)} autoFocus
                            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-slate-400"
                        />
                    </div>

                    {/* Dimension Selector — non-temporal only */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Hash size={12} /> {t('builder.group_by')}
                        </label>
                        <p className="text-[10px] text-slate-400 mb-2">{t('builder.group_by_desc')}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {Object.values(DIMENSION_REGISTRY).filter(dim => !dim.isTemporal).map(dim => (
                                <button key={dim.id} onClick={() => handleDimensionChange(dim.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dimension === dim.id
                                        ? 'btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                >
                                    {dim.tKey ? t(dim.tKey) : dim.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Metrics — moved above Timeframe */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <BarChart2 size={12} /> {t('builder.metrics')}
                            </label>
                            {metrics.length < METRIC_OPTIONS.length && (
                                <button onClick={addMetric} className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium flex items-center gap-1 transition-colors">
                                    <Plus size={12} /> {t('builder.add')}
                                </button>
                            )}
                        </div>
                        <div className="space-y-2">
                            {metrics.map((m, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700/50">
                                    <select value={m.metricId} onChange={e => updateMetric(idx, { metricId: e.target.value as MetricId })}
                                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500/30">
                                        {METRIC_OPTIONS.map(o => { const meta = METRIC_REGISTRY[o.value]; return <option key={o.value} value={o.value}>{meta?.tKey ? t(meta.tKey) : o.label}</option>; })}
                                    </select>
                                    <span className="text-[10px] text-slate-400 font-medium">{t('builder.by')}</span>
                                    <select value={m.aggregation} onChange={e => updateMetric(idx, { aggregation: e.target.value as AggregationFn })}
                                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500/30">
                                        {AGG_OPTIONS.map(o => <option key={o.value} value={o.value}>{t({ 'SUM': 'builder.agg_sum', 'AVG': 'builder.agg_average', 'COUNT': 'builder.agg_count', 'MIN': 'builder.agg_min', 'MAX': 'builder.agg_max' }[o.value] || o.label)}</option>)}
                                    </select>
                                    {metrics.length > 1 && (
                                        <button onClick={() => removeMetric(idx)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                            <Trash2 size={13} className="text-red-400 hover:text-red-600" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Timeframe ── */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Calendar size={12} /> {t('builder.timeframe')}
                        </label>
                        <p className="text-[10px] text-slate-400 mb-2">{t('builder.timeframe_desc')}</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {TIMEFRAME_OPTIONS.map(opt => (
                                <button key={opt.value} onClick={() => setTimeframe(opt.value)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${timeframe === opt.value
                                        ? 'bg-teal-600 text-white shadow-sm shadow-teal-500/25'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                >
                                    <span className="me-1">{opt.icon}</span>{t({ 'today': 'builder.tf_today', 'currentWeek': 'builder.tf_current_week', 'currentMonth': 'builder.tf_current_month', 'customRange': 'builder.tf_custom_range', 'specificDay': 'builder.tf_specific_day', 'specificWeek': 'builder.tf_specific_week', 'specificMonth': 'builder.tf_specific_month' }[opt.value] || opt.label)}
                                </button>
                            ))}
                        </div>
                        {/* Conditional inputs */}
                        {timeframe === 'customRange' && (
                            <div className="flex items-center gap-2 mt-2 bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                                <DatePicker type="date" value={tfCustomStart} onChange={e => {
                                    const newStart = e.target.value;
                                    setTfCustomStart(newStart);
                                    if (!tfCustomEnd || new Date(newStart) > new Date(tfCustomEnd)) setTfCustomEnd(newStart);
                                }}
                                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                                <span className="text-slate-400 text-xs">{t('builder.to')}</span>
                                <DatePicker type="date" value={tfCustomEnd} onChange={e => {
                                    const newEnd = e.target.value;
                                    setTfCustomEnd(newEnd);
                                    if (tfCustomStart && new Date(newEnd) < new Date(tfCustomStart)) setTfCustomStart(newEnd);
                                }}
                                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                            </div>
                        )}
                        {timeframe === 'specificDay' && (
                            <div className="mt-2 bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                                <DatePicker type="date" value={tfSpecificDate} onChange={e => setTfSpecificDate(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                            </div>
                        )}
                        {timeframe === 'specificWeek' && (
                            <div className="mt-2 bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                                <label className="text-[10px] text-slate-500 mb-1 block">{t('builder.pick_date_desired_week')}</label>
                                <DatePicker type="date" value={tfSpecificDate} onChange={e => setTfSpecificDate(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                            </div>
                        )}
                        {timeframe === 'specificMonth' && (
                            <div className="mt-2 bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                                <DatePicker type="month" value={tfSpecificDate} onChange={e => setTfSpecificDate(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                            </div>
                        )}
                        <p className="text-[10px] text-teal-500 mt-1.5">
                            {timeFilteredEvents.length} {t('builder.events_in_timeframe')}
                        </p>
                    </div>

                    {/* ── Comparison Mode — Multi-comparison with layout toggle ── */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <GitCompareArrows size={12} /> {t('builder.comparison_mode')}
                                {compareEnabled && (
                                    <span className="ms-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-500 text-white animate-pulse">
                                        {t('builder.active_badge')} · {comparisons.length}
                                    </span>
                                )}
                            </label>
                            <button
                                onClick={() => {
                                    const next = !compareEnabled;
                                    setCompareEnabled(next);
                                    if (next && comparisons.length === 0) addComparison();
                                }}
                                className={`relative w-12 h-6 rounded-full transition-all duration-300 ${compareEnabled
                                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 shadow-md shadow-orange-500/30'
                                    : 'bg-slate-300 dark:bg-slate-600'}`}
                            >
                                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${compareEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mb-2">
                            {compareEnabled
                                ? t('builder.comparison_active')
                                : t('builder.comparison_inactive')}
                        </p>

                        {compareEnabled && (
                            <div className="space-y-2">
                                {/* Layout toggle */}
                                <div className="flex items-center gap-1.5 mb-2">
                                    <button onClick={() => setCompareLayout('side-by-side')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${compareLayout === 'side-by-side'
                                            ? 'bg-orange-500 text-white shadow-sm'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                        <Columns size={10} /> {t('builder.side_by_side')}
                                    </button>
                                    <button onClick={() => setCompareLayout('merged')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${compareLayout === 'merged'
                                            ? 'bg-orange-500 text-white shadow-sm'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                        <Merge size={10} /> {t('builder.merged')}
                                    </button>
                                </div>

                                {/* Comparison entries */}
                                {comparisons.map((cmp, idx) => (
                                    <div key={cmp.id} className="bg-orange-50 dark:bg-orange-900/10 rounded-xl p-3 border border-orange-200 dark:border-orange-800/30 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
                                                style={{ color: COMPARE_COLORS[idx % COMPARE_COLORS.length] }}>
                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] }} />
                                                {t('builder.comparison_n')} {idx + 1} — {t({ 'today': 'tf.today', 'currentWeek': 'tf.current_week', 'currentMonth': 'tf.current_month', 'customRange': 'tf.custom_range', 'specificDay': 'tf.specific_day', 'specificWeek': 'tf.specific_week', 'specificMonth': 'tf.specific_month' }[timeframe] || 'Period')}
                                            </label>
                                            <button onClick={() => removeComparison(cmp.id)}
                                                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors">
                                                <Trash2 size={12} className="text-red-400 hover:text-red-600" />
                                            </button>
                                        </div>

                                        {/* Day picker */}
                                        {(timeframe === 'today' || timeframe === 'specificDay') && (
                                            <div>
                                                <label className="text-[10px] text-slate-500 mb-1 block">{t('builder.select_comparison_day')}</label>
                                                <DatePicker type="date" value={cmp.specificDate}
                                                    onChange={e => updateComparison(cmp.id, { specificDate: e.target.value })}
                                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                                            </div>
                                        )}
                                        {/* Week picker */}
                                        {(timeframe === 'currentWeek' || timeframe === 'specificWeek') && (
                                            <div>
                                                <label className="text-[10px] text-slate-500 mb-1 block">{t('builder.pick_date_in_week')}</label>
                                                <DatePicker type="date" value={cmp.specificDate}
                                                    onChange={e => updateComparison(cmp.id, { specificDate: e.target.value })}
                                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                                            </div>
                                        )}
                                        {/* Month picker */}
                                        {(timeframe === 'currentMonth' || timeframe === 'specificMonth') && (
                                            <div>
                                                <label className="text-[10px] text-slate-500 mb-1 block">{t('builder.select_comparison_month')}</label>
                                                <DatePicker type="month" value={cmp.specificDate}
                                                    onChange={e => updateComparison(cmp.id, { specificDate: e.target.value })}
                                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                                            </div>
                                        )}
                                        {/* Custom range */}
                                        {timeframe === 'customRange' && (
                                            <div>
                                                <label className="text-[10px] text-slate-500 mb-1 block">{t('builder.select_comparison_range')}</label>
                                                <div className="flex items-center gap-2">
                                                    <DatePicker type="date" value={cmp.customStart}
                                                        onChange={e => {
                                                            const newStart = e.target.value;
                                                            let updates: any = { customStart: newStart };
                                                            if (!cmp.customEnd || new Date(newStart) > new Date(cmp.customEnd)) updates.customEnd = newStart;
                                                            updateComparison(cmp.id, updates);
                                                        }}
                                                        className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                                                    <span className="text-slate-400 text-xs">{t('builder.to')}</span>
                                                    <DatePicker type="date" value={cmp.customEnd}
                                                        onChange={e => {
                                                            const newEnd = e.target.value;
                                                            let updates: any = { customEnd: newEnd };
                                                            if (cmp.customStart && new Date(newEnd) < new Date(cmp.customStart)) updates.customStart = newEnd;
                                                            updateComparison(cmp.id, updates);
                                                        }}
                                                        className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                                                </div>
                                            </div>
                                        )}

                                        <p className="text-[10px] mt-1" style={{ color: COMPARE_COLORS[idx % COMPARE_COLORS.length] }}>
                                            {comparisonResults[idx]?.eventCount ?? 0} {t('builder.events')} · {getCompareLabel(cmp)}
                                        </p>
                                    </div>
                                ))}

                                {/* Add comparison button */}
                                <button onClick={addComparison}
                                    className="w-full py-2 rounded-xl border-2 border-dashed border-orange-300 dark:border-orange-700/40 text-orange-500 text-[11px] font-medium hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors flex items-center justify-center gap-1.5">
                                    <Plus size={12} /> {t('builder.add_another')}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Visualization — only show compatible options */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Eye size={12} /> {t('builder.visualization')}</label>
                        <div className="flex flex-wrap gap-1.5">
                            {VIZ_OPTIONS.filter(viz => compatibleViz.includes(viz.type)).map(viz => {
                                const active = visualization === viz.type;
                                return (
                                    <button key={viz.type} onClick={() => setVisualization(viz.type)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${active
                                            ? 'btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                        {viz.icon}{t({ 'bar': 'builder.viz_bar', 'stacked-bar': 'builder.viz_stacked', 'line': 'builder.viz_line', 'pie': 'builder.viz_pie', 'table': 'builder.viz_table' }[viz.type] || viz.label)}
                                    </button>
                                );
                            })}
                        </div>
                        {metrics.length > 1 && visualization !== 'table' && (
                            <p className="text-[10px] text-blue-500 mt-1.5 flex items-center gap-1">
                                <Zap size={10} /> {metrics.length} {t('builder.metrics_displayed')} {visualization === 'stacked-bar' ? t('builder.stacked_segments') : t('builder.grouped_series')}
                            </p>
                        )}
                    </div>

                    {/* ── Data Filters (Dropdown-based) ── */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <Filter size={12} /> {t('builder.data_filters')}
                            {chartFilterCount > 0 && (
                                <span className="ms-1 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full text-[10px] font-bold">{chartFilterCount}</span>
                            )}
                        </label>
                        <p className="text-[10px] text-slate-400 mb-3">
                            {t('builder.data_filters_desc')}
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <MultiSelectDropdown
                                label={t('filter.teachers')} items={filterOptions.teachers}
                                selected={chartFilterTeachers}
                                onToggle={(id) => toggleIn(chartFilterTeachers, setChartFilterTeachers, id)}
                                onClear={() => setChartFilterTeachers(new Set())}
                                t={t}
                            />
                            <MultiSelectDropdown
                                label={t('filter.positions')} items={filterOptions.positions}
                                selected={chartFilterPositions}
                                onToggle={(id) => toggleIn(chartFilterPositions, setChartFilterPositions, id)}
                                onClear={() => setChartFilterPositions(new Set())}
                                t={t}
                            />
                            <MultiSelectDropdown
                                label={t('filter.tags')} items={filterOptions.tags}
                                selected={chartFilterTags}
                                onToggle={(id) => toggleIn(chartFilterTags, setChartFilterTags, id)}
                                onClear={() => setChartFilterTags(new Set())}
                                t={t}
                            />
                            <MultiSelectDropdown
                                label={t('filter.categories')} items={filterOptions.categories}
                                selected={chartFilterCategories}
                                onToggle={(id) => toggleIn(chartFilterCategories, setChartFilterCategories, id)}
                                onClear={() => setChartFilterCategories(new Set())}
                                t={t}
                            />
                            <MultiSelectDropdown
                                label={t('filter.rate_types')} items={filterOptions.rateTypes}
                                selected={chartFilterRateTypes}
                                onToggle={(id) => toggleIn(chartFilterRateTypes, setChartFilterRateTypes, id)}
                                onClear={() => setChartFilterRateTypes(new Set())}
                                t={t}
                            />
                        </div>

                        {chartFilterCount > 0 && (
                            <button onClick={() => { setChartFilterTeachers(new Set()); setChartFilterPositions(new Set()); setChartFilterTags(new Set()); setChartFilterCategories(new Set()); setChartFilterRateTypes(new Set()); }}
                                className="mt-2.5 text-[10px] text-red-500 hover:text-red-700 font-medium flex items-center gap-1 transition-colors">
                                <X size={10} /> {t('builder.clear_all_filters')}
                            </button>
                        )}
                    </div>

                    {/* Filter Mode */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">{t('builder.filter_mode')}</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setFilterMode('live')}
                                className={`flex items-start gap-2 p-3 rounded-xl border text-start transition-all ${filterMode === 'live' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                                <Zap size={14} className={filterMode === 'live' ? 'text-blue-500 mt-0.5' : 'text-slate-400 mt-0.5'} />
                                <div>
                                    <div className={`text-xs font-semibold ${filterMode === 'live' ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>{t('builder.live')}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{t('builder.live_desc')}</div>
                                </div>
                            </button>
                            <button onClick={() => setFilterMode('snapshot')}
                                className={`flex items-start gap-2 p-3 rounded-xl border text-start transition-all ${filterMode === 'snapshot' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                                <Camera size={14} className={filterMode === 'snapshot' ? 'text-amber-500 mt-0.5' : 'text-slate-400 mt-0.5'} />
                                <div>
                                    <div className={`text-xs font-semibold ${filterMode === 'snapshot' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'}`}>{t('builder.snapshot')}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{t('builder.snapshot_desc')}</div>
                                </div>
                            </button>
                        </div>
                        <div className="mt-1.5 text-[10px] text-slate-400 px-1">{t('builder.active')} {filterDescription}</div>
                    </div>

                    {/* Advanced Options */}
                    <div>
                        <button onClick={() => setShowAdvanced(!showAdvanced)}
                            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium flex items-center gap-1.5 transition-colors">
                            <ArrowUpDown size={12} /> {t('builder.advanced')}
                            <span className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▾</span>
                        </button>
                        {showAdvanced && (
                            <div className="mt-3 grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50">
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">{t('builder.sort_by')}</label>
                                    <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none">
                                        <option value="dimension">{t('builder.dimension_label')}</option>
                                        {metrics.map(m => { const meta = METRIC_REGISTRY[m.metricId]; return <option key={m.metricId} value={m.metricId}>{meta?.tKey ? t(meta.tKey) : (meta?.label ?? m.metricId)}</option>; })}
                                    </select>
                                    <div className="flex gap-1 mt-1.5">
                                        <button onClick={() => setSortDir('asc')} className={`text-[10px] px-2 py-0.5 rounded ${sortDir === 'asc' ? 'btn-cadenza bg-cadenza-gradient texture-cadenza text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>{t('builder.ascending')}</button>
                                        <button onClick={() => setSortDir('desc')} className={`text-[10px] px-2 py-0.5 rounded ${sortDir === 'desc' ? 'btn-cadenza bg-cadenza-gradient texture-cadenza text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>{t('builder.descending')}</button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">{t('builder.limit_topn')}</label>
                                    <input type="number" min={0} max={100} value={topN} onChange={e => setTopN(parseInt(e.target.value) || 0)} placeholder={t('builder.no_limit')}
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-white outline-none" />
                                    <p className="text-[10px] text-slate-400 mt-1">{t('builder.show_all')}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── RIGHT: Live Preview (sticky) ─── */}
                <div className="w-1/2 flex flex-col bg-slate-50/50 dark:bg-slate-950/30 overflow-y-auto custom-scrollbar">
                    <div className="px-5 pt-5 pb-2 flex-shrink-0">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Eye size={12} /> {t('builder.live_preview')}
                            {compareEnabled && comparisons.length > 0 && (
                                <span className="ms-1 text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 font-bold">
                                    {compareLayout === 'merged' ? t('builder.merged_overlay') : t('builder.side_by_side_label')}
                                </span>
                            )}
                        </label>
                        <p className="text-[10px] text-slate-400 mt-1">
                            {t('builder.preview_summary').replace('{events}', String(timeFilteredEvents.length)).replace('{dim}', dimension).replace('{metrics}', String(metrics.length)).replace('{viz}', visualization)}
                            {chartFilterCount > 0 && <span className="text-violet-500 ms-1">· {t('builder.filters_applied').replace('{count}', String(chartFilterCount))}</span>}
                        </p>
                    </div>

                    {/* ── Merged overlay mode — single unified chart ── */}
                    {compareEnabled && compareLayout === 'merged' && comparisons.length > 0 ? (
                        <div className="px-5 pb-3 flex-1">
                            <div className="w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 overflow-hidden">
                                <MergedChartRenderer
                                    config={previewConfig}
                                    datasets={[
                                        {
                                            label: t({ 'today': 'builder.tf_today', 'currentWeek': 'builder.tf_current_week', 'currentMonth': 'builder.tf_current_month', 'customRange': 'builder.tf_custom_range', 'specificDay': 'builder.tf_specific_day', 'specificWeek': 'builder.tf_specific_week', 'specificMonth': 'builder.tf_specific_month' }[timeframe] || '') || t('builder.primary_label'),
                                            color: '#4f46e5',
                                            events: timeFilteredEvents,
                                            isPrimary: true,
                                        },
                                        ...comparisonResults.map((cmpResult, idx) => ({
                                            label: getCompareLabel(cmpResult),
                                            color: COMPARE_COLORS[idx % COMPARE_COLORS.length],
                                            events: cmpResult.events,
                                        })),
                                    ]}
                                    teachers={teachers}
                                    height={380}
                                    currencySymbol={currencySymbol}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Primary chart (non-merged or no comparisons) */}
                            <div className="px-5 pb-3 flex-shrink-0">
                                {compareEnabled && comparisons.length > 0 && (
                                    <div className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 mb-1.5 flex items-center gap-1">
                                        <Calendar size={10} />
                                        {TIMEFRAME_OPTIONS.find(o => o.value === timeframe)?.label ?? t('builder.primary_label')}
                                        <span className="text-slate-400 ms-1">{t('builder.n_events').replace('{count}', String(timeFilteredEvents.length))}</span>
                                    </div>
                                )}
                                <div className="w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center justify-center overflow-hidden">
                                    <ChartRenderer
                                        config={previewConfig}
                                        events={timeFilteredEvents}
                                        teachers={teachers}
                                        height={compareEnabled && comparisons.length > 0
                                            ? Math.max(200, 380 - comparisons.length * 80)
                                            : 380}
                                        currencySymbol={currencySymbol}
                                    />
                                </div>
                            </div>

                            {/* Side-by-side comparison charts */}
                            {compareEnabled && compareLayout === 'side-by-side' && comparisonResults.map((cmpResult, idx) => (
                                <div key={cmpResult.id} className="px-5 pb-3 flex-shrink-0">
                                    <div className="text-[10px] font-semibold mb-1.5 flex items-center gap-1"
                                        style={{ color: COMPARE_COLORS[idx % COMPARE_COLORS.length] }}>
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] }} />
                                        {getCompareLabel(cmpResult)}
                                        <span className="text-slate-400 ms-1">{t('builder.n_events').replace('{count}', String(cmpResult.eventCount))}</span>
                                    </div>
                                    <div className="w-full bg-white dark:bg-slate-900 rounded-xl border p-4 flex items-center justify-center overflow-hidden"
                                        style={{ borderColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] + '40' }}>
                                        <ChartRenderer
                                            config={previewConfig}
                                            events={cmpResult.events}
                                            teachers={teachers}
                                            height={Math.max(180, 260 - (comparisons.length - 1) * 40)}
                                            currencySymbol={currencySymbol}
                                        />
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="text-[10px] text-slate-400">
                    {t('builder.footer_summary').replace('{dim}', dimension).replace('{metrics}', String(metrics.length)).replace('{viz}', visualization)}
                    {chartFilterCount > 0 && t('builder.footer_filters').replace('{count}', String(chartFilterCount))}
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{t('builder.cancel')}</button>
                    <button onClick={handleSave} disabled={!title.trim()}
                        className="px-5 py-2 rounded-xl btn-cadenza bg-cadenza-gradient texture-cadenza text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-cadenza-soft">
                        {editingChart ? `💾 ${t('builder.update_chart')}` : `💾 ${t('builder.save_chart')}`}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
