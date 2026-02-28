// ──────────────────────────────────────────────
// components/FinancialAnalysis.tsx — Dedicated Analysis Subpage
// ──────────────────────────────────────────────
// Layout order: Insights → "New Chart" → Existing Charts
// Supports editing, deletion (with confirmation), and H:MM formatting.
// ──────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import { CalendarEvent, Teacher, AppSettings } from '../types';
import { ChartConfiguration } from '../types/chartBuilder';
import { formatHours, formatCurrency } from '../utils/formatters';
import {
    Download, Filter, Calendar as CalIcon, ChevronDown, Menu, Clock, CalendarDays, DollarSign,
    TrendingUp, X, SlidersHorizontal, Tag, User, Briefcase, ToggleLeft, Plus, Pencil, Trash2,
    Copy, BarChart3, Zap, Camera, ArrowLeft, ArrowRight, LineChart as LineChartIcon,
    Award, AlertTriangle, TrendingDown, Percent, Target, CreditCard, Users as UsersIcon, Activity,
    Settings as SettingsIcon, Check, Eye, EyeOff, RotateCcw
} from 'lucide-react';
import { ChartBuilderModal } from './ChartBuilderModal';
import { ChartRenderer } from './ChartRenderer';
import { MergedChartRenderer, DatasetInput } from './MergedChartRenderer';
import { DatePicker } from './DatePicker';
import { TRANSLATIONS } from '../constants';
import { Modal } from './Modal';

// ---- Financial data structures ----
interface PositionFinancials {
    positionId: string; positionName: string; rateType: 'HOURLY' | 'GLOBAL_MONTHLY';
    rateValue: number; category: string; activeHours: number; canceledHours: number;
    totalHours: number; hourlyCost: number; oneOffCost: number; globalCost: number;
}

interface TeacherReport {
    teacherId: string; teacherName: string; teacherColor: string;
    positions: PositionFinancials[]; totalActiveHours: number; totalCanceledHours: number;
    totalHours: number; hourlyCostTotal: number; oneOffCostTotal: number; globalCostTotal: number; grandTotal: number;
}

interface CustomInsightInfo {
    id: string; title: string;
    metric: 'totalActiveHours' | 'totalCanceledHours' | 'hourlyCostTotal' | 'oneOffCostTotal' | 'globalCostTotal' | 'grandTotal' | 'avgActiveHours' | 'avgGrandTotal' | 'cancellationRate' | 'maxEarner' | 'minEarner';
    teacherId?: string;
}

type DateFilterType = 'WEEK' | 'MONTH' | 'CUSTOM' | 'ALL';

// ---- Comparison helpers for saved charts ----
const COMPARE_COLORS = ['#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308'];

function computeDateRangeForComparison(
    timeframe: string,
    specificDate?: string,
    customStart?: string,
    customEnd?: string,
): { start: Date; end: Date } {
    const now = new Date();
    switch (timeframe) {
        case 'currentWeek': {
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            const s = new Date(now.getFullYear(), now.getMonth(), diff); s.setHours(0, 0, 0, 0);
            const e = new Date(s); e.setDate(e.getDate() + 6); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        case 'currentMonth': {
            const s = new Date(now.getFullYear(), now.getMonth(), 1);
            const e = new Date(now.getFullYear(), now.getMonth() + 1, 0); e.setHours(23, 59, 59, 999);
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
            const s = new Date(d.getFullYear(), d.getMonth(), diff); s.setHours(0, 0, 0, 0);
            const e = new Date(s); e.setDate(e.getDate() + 6); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        case 'specificMonth': {
            const d = specificDate ? new Date(specificDate + '-01') : now;
            const s = new Date(d.getFullYear(), d.getMonth(), 1);
            const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        case 'customRange': {
            const s = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1);
            const e = customEnd ? new Date(customEnd) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
            e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        default: {
            const s = new Date(now.getFullYear(), now.getMonth(), 1);
            const e = new Date(now.getFullYear(), now.getMonth() + 1, 0); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
    }
}

// ---- Filter section ----
interface FilterSectionProps {
    title: string; icon: React.ReactNode; items: string[]; selected: Set<string>;
    onToggle: (item: string) => void; colorDot?: (item: string) => string | undefined;
    displayLabel?: (item: string) => string; accentColor: string;
}

const FilterSection: React.FC<FilterSectionProps> = ({ title, icon, items, selected, onToggle, colorDot, displayLabel, accentColor }) => {
    const getLabel = (item: string) => displayLabel ? displayLabel(item) : item;
    return (
        <div>
            <div className="flex items-center gap-1.5 mb-2">
                <span className={`text-${accentColor}-500`}>{icon}</span>
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">{title}</h4>
                {selected.size > 0 && <span className={`text-[9px] font-bold px-1 rounded bg-${accentColor}-100 dark:bg-${accentColor}-900/30 text-${accentColor}-600`}>{selected.size}</span>}
            </div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto custom-scrollbar">
                {items.map(item => (
                    <button key={item} onClick={() => onToggle(item)}
                        className={`w-full text-start text-[11px] px-2 py-1 rounded flex items-center gap-1.5 transition-colors ${selected.has(item) ? `bg-${accentColor}-50 dark:bg-${accentColor}-900/20 text-${accentColor}-700 dark:text-${accentColor}-300` : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                        {colorDot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorDot(item) || '#94a3b8' }} />}
                        <span className="truncate">{getLabel(item)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

// ---- Insight tile data ----
interface InsightTile {
    id: string; title: string; icon: React.ReactNode; value: string;
    entity?: string; entityColor?: string; context?: string;
    highlight: 'max' | 'min' | 'neutral' | 'warning'; gradient: string;
    isCustom?: boolean;
}

const InsightCard: React.FC<{ tile: InsightTile }> = ({ tile }) => {
    const borderColor = tile.highlight === 'max' ? 'border-emerald-300 dark:border-emerald-700'
        : tile.highlight === 'min' ? 'border-red-300 dark:border-red-700'
            : tile.highlight === 'warning' ? 'border-amber-300 dark:border-amber-700'
                : 'border-slate-200 dark:border-slate-700';
    const valueColor = tile.highlight === 'max' ? 'text-emerald-600 dark:text-emerald-400'
        : tile.highlight === 'min' ? 'text-red-500 dark:text-red-400'
            : tile.highlight === 'warning' ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-white';

    return (
        <div className={`relative bg-white dark:bg-slate-900 rounded-xl border-2 ${borderColor} p-4 shadow-sm overflow-hidden`}>
            <div className={`absolute top-0 start-0 end-0 h-1 ${tile.gradient}`} />
            <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 inline-block mb-2">{tile.icon}</div>
            <h4 className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 leading-tight">{tile.title}</h4>
            <p className={`text-xl font-bold ${valueColor} mb-0.5 tabular-nums`}>{tile.value}</p>
            {tile.entity && (
                <div className="flex items-center gap-1.5 mb-0.5">
                    {tile.entityColor && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tile.entityColor }} />}
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{tile.entity}</span>
                </div>
            )}
            {tile.context && <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">{tile.context}</p>}
        </div>
    );
};

// ---- Delete Confirmation Modal ----
const DeleteConfirmModal: React.FC<{ chartTitle: string; onConfirm: () => void; onCancel: () => void; t: (key: string) => string }> = ({ chartTitle, onConfirm, onCancel, t }) => (
    <Modal
        isOpen={true}
        onClose={onCancel}
        title={t('modal.delete_chart')}
        isDirty={false}
        t={t}
        maxWidth="max-w-sm"
    >
        <div className="flex items-center gap-3 mb-4 mt-2">
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg"><Trash2 size={20} className="text-red-500" /></div>
            <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('modal.cannot_undo')}</p>
            </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 font-medium">
            Are you sure you want to delete <strong>"{chartTitle}"</strong>?
        </p>
        <div className="flex items-center gap-2 justify-end">
            <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors">Delete</button>
        </div>
    </Modal>
);

// ---- Custom Insight Builder Modal ----
interface CustomInsightModalProps {
    teachers: Teacher[];
    onClose: () => void;
    onSave: (info: CustomInsightInfo) => void;
    t: (key: string) => string;
}

const CustomInsightModal: React.FC<CustomInsightModalProps> = ({ teachers, onClose, onSave, t }) => {
    const [title, setTitle] = useState('');
    const [metric, setMetric] = useState<CustomInsightInfo['metric']>('totalActiveHours');
    const [teacherId, setTeacherId] = useState('');

    const handleSave = () => {
        if (!title.trim()) return;
        onSave({ id: `ci_${Date.now()}`, title: title.trim(), metric, teacherId: teacherId || undefined });
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={<><Zap size={18} className="text-amber-500 inline mr-2" /> {t('modal.new_insight')}</>}
            isDirty={Boolean(title.trim() || teacherId)}
            t={t}
            maxWidth="max-w-sm"
            footerContent={
                <div className="flex justify-end gap-2 w-full">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors">{t('common.cancel')}</button>
                    <button onClick={handleSave} disabled={!title.trim()} className="px-4 py-2 text-xs font-medium btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft rounded-lg transition-colors">{t('modal.save_insight')}</button>
                </div>
            }
        >
            <div className="space-y-4">
                <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('modal.insight_title')}</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('analysis.chart_name_placeholder')} autoFocus className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-blue-500" />
                </div>
                <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('modal.metric')}</label>
                    <select value={metric} onChange={e => setMetric(e.target.value as any)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-blue-500">
                        <optgroup label={t('modal.totals')}>
                            <option value="totalActiveHours">{t('metric.total_active_hours')}</option>
                            <option value="totalCanceledHours">{t('metric.total_canceled_hours')}</option>
                            <option value="hourlyCostTotal">{t('metric.hourly_payroll')}</option>
                            <option value="oneOffCostTotal">{t('metric.oneoff_payroll')}</option>
                            <option value="globalCostTotal">{t('metric.global_payroll')}</option>
                            <option value="grandTotal">{t('metric.grand_total')}</option>
                        </optgroup>
                        <optgroup label={t('modal.averages_rates')}>
                            <option value="avgActiveHours">{t('metric.avg_hours')}</option>
                            <option value="avgGrandTotal">{t('metric.avg_payroll')}</option>
                            <option value="cancellationRate">{t('insight.cancel_rate')}</option>
                        </optgroup>
                        <optgroup label={t('modal.extremes')}>
                            <option value="maxEarner">{t('metric.highest_earner')}</option>
                            <option value="minEarner">{t('metric.lowest_earner')}</option>
                        </optgroup>
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('modal.filter_by_teacher')}</label>
                    <select value={teacherId} onChange={e => setTeacherId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-blue-500">
                        <option value="">{t('metric.all_teachers')}</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                    </select>
                </div>
            </div>
        </Modal>
    );
};

// ---- Main Component ----
interface Props {
    events: CalendarEvent[]; teachers: Teacher[]; settings: AppSettings;
    savedCharts: ChartConfiguration[]; setSavedCharts: React.Dispatch<React.SetStateAction<ChartConfiguration[]>>;
    onMobileMenuOpen: () => void; onNavigateBack: () => void;
}

export const FinancialAnalysis: React.FC<Props> = ({ events, teachers, settings, savedCharts, setSavedCharts, onMobileMenuOpen, onNavigateBack }) => {
    const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
    const isRtl = settings?.language === 'he-IL';
    const [dateFilterType, setDateFilterType] = useState<DateFilterType>('MONTH');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());
    const [selectedPositionNames, setSelectedPositionNames] = useState<Set<string>>(new Set());
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
    const [selectedRateTypes, setSelectedRateTypes] = useState<Set<string>>(new Set());
    const [isMobile, setIsMobile] = useState(false);
    const [isChartModalOpen, setIsChartModalOpen] = useState(false);
    const [editingChart, setEditingChart] = useState<ChartConfiguration | null>(null);
    const [deletingChartId, setDeletingChartId] = useState<string | null>(null);
    const [isInsightPickerOpen, setIsInsightPickerOpen] = useState(false);
    const [isCustomInsightModalOpen, setIsCustomInsightModalOpen] = useState(false);

    // Custom Insights State
    const CUSTOM_INSIGHTS_KEY = 'financial-analysis-custom-insights';
    const [customInsights, setCustomInsights] = useState<CustomInsightInfo[]>(() => {
        try {
            const saved = localStorage.getItem(CUSTOM_INSIGHTS_KEY);
            if (saved) return JSON.parse(saved);
        } catch { /* ignore */ }
        return [];
    });

    const saveCustomInsights = (insights: CustomInsightInfo[]) => {
        setCustomInsights(insights);
        localStorage.setItem(CUSTOM_INSIGHTS_KEY, JSON.stringify(insights));
    };

    const handleDeleteCustomInsight = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const updated = customInsights.filter(c => c.id !== id);
        saveCustomInsights(updated);
        // Also remove from visible list if needed
        if (visibleInsightIds.has(id)) {
            toggleInsightVisibility(id);
        }
    };

    // Insight visibility — persisted in localStorage
    const INSIGHT_STORAGE_KEY = 'financial-analysis-visible-insights';
    const [visibleInsightIds, setVisibleInsightIds] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem(INSIGHT_STORAGE_KEY);
            if (saved) { const arr: string[] = JSON.parse(saved); return new Set(arr); }
        } catch { /* ignore */ }
        return new Set<string>(); // empty = show all (default)
    });
    const [insightShowAll, setInsightShowAll] = useState(() => {
        try { return !localStorage.getItem(INSIGHT_STORAGE_KEY); } catch { return true; }
    });

    const saveInsightPrefs = (ids: Set<string>, showAll: boolean) => {
        setVisibleInsightIds(ids);
        setInsightShowAll(showAll);
        if (showAll) {
            localStorage.removeItem(INSIGHT_STORAGE_KEY);
        } else {
            localStorage.setItem(INSIGHT_STORAGE_KEY, JSON.stringify(Array.from(ids)));
        }
    };

    const toggleInsightVisibility = (id: string) => {
        const newIds = new Set<string>(visibleInsightIds);
        if (newIds.has(id)) newIds.delete(id); else newIds.add(id);
        saveInsightPrefs(newIds, false);
    };

    const resetInsightsToDefault = () => {
        saveInsightPrefs(new Set<string>(), true);
    };

    React.useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check(); window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const allPositionNames = useMemo(() => { const s = new Set<string>(); teachers.forEach(t => t.positionAssignments?.forEach(pa => s.add(pa.positionName))); return Array.from(s).sort(); }, [teachers]);
    const allTags = useMemo(() => { const s = new Set<string>(); teachers.forEach(t => t.tags?.forEach(tag => s.add(tag))); return Array.from(s).sort(); }, [teachers]);
    const allCategories = useMemo(() => { const s = new Set<string>(); teachers.forEach(t => t.positionAssignments?.forEach(pa => s.add(pa.category))); return Array.from(s).sort(); }, [teachers]);
    const teacherColorMap = useMemo(() => { const m: Record<string, string> = {}; teachers.forEach(t => { m[t.id] = t.color; }); return m; }, [teachers]);
    const activeFilterCount = selectedTeacherIds.size + selectedPositionNames.size + selectedTags.size + selectedCategories.size + selectedRateTypes.size;

    const toggleInSet = (set: Set<string>, setFn: React.Dispatch<React.SetStateAction<Set<string>>>, item: string) => {
        const ns = new Set(set); if (ns.has(item)) ns.delete(item); else ns.add(item); setFn(ns);
    };
    const clearAllFilters = () => { setSelectedTeacherIds(new Set()); setSelectedPositionNames(new Set()); setSelectedTags(new Set()); setSelectedCategories(new Set()); setSelectedRateTypes(new Set()); };

    // Chart CRUD
    const handleSaveChart = (config: ChartConfiguration) => {
        setSavedCharts(prev => { const idx = prev.findIndex(c => c.id === config.id); if (idx >= 0) { const u = [...prev]; u[idx] = config; return u; } return [...prev, config]; });
    };
    const handleDeleteChart = (id: string) => { setSavedCharts(prev => prev.filter(c => c.id !== id)); setDeletingChartId(null); };
    const handleDuplicateChart = (chart: ChartConfiguration) => {
        const clone: ChartConfiguration = { ...chart, id: `chart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: `${chart.title} (Copy)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        setSavedCharts(prev => [...prev, clone]);
    };
    const handleEditChart = (chart: ChartConfiguration) => { setEditingChart(chart); setIsChartModalOpen(true); };
    const handleNewChart = () => { setEditingChart(null); setIsChartModalOpen(true); };

    // Date range
    const dateRange = useMemo(() => {
        const now = new Date(); let startLimit: Date | null = null; let endLimit: Date | null = null;
        if (dateFilterType === 'WEEK') { const day = now.getDay(); const diff = now.getDate() - day + (day === 0 ? -6 : 1); startLimit = new Date(now.getFullYear(), now.getMonth(), diff); startLimit.setHours(0, 0, 0, 0); endLimit = new Date(startLimit); endLimit.setDate(endLimit.getDate() + 7); }
        else if (dateFilterType === 'MONTH') { startLimit = new Date(now.getFullYear(), now.getMonth(), 1); endLimit = new Date(now.getFullYear(), now.getMonth() + 1, 0); endLimit.setHours(23, 59, 59, 999); }
        else if (dateFilterType === 'CUSTOM') { if (customStartDate) startLimit = new Date(customStartDate); if (customEndDate) { endLimit = new Date(customEndDate); endLimit.setHours(23, 59, 59, 999); } }
        return { startLimit, endLimit };
    }, [dateFilterType, customStartDate, customEndDate]);

    const filteredTeacherIds = useMemo(() => {
        let pool = teachers;
        if (selectedTeacherIds.size > 0) pool = pool.filter(t => selectedTeacherIds.has(t.id));
        if (selectedTags.size > 0) pool = pool.filter(t => t.tags?.some(tag => selectedTags.has(tag)));
        if (selectedPositionNames.size > 0) pool = pool.filter(t => t.positionAssignments?.some(pa => selectedPositionNames.has(pa.positionName)));
        if (selectedCategories.size > 0) pool = pool.filter(t => t.positionAssignments?.some(pa => selectedCategories.has(pa.category)));
        if (selectedRateTypes.size > 0) pool = pool.filter(t => t.positionAssignments?.some(pa => selectedRateTypes.has(pa.rateType)));
        return new Set(pool.map(t => t.id));
    }, [teachers, selectedTeacherIds, selectedTags, selectedPositionNames, selectedCategories, selectedRateTypes]);

    const filteredEvents = useMemo(() => {
        let filtered = events.filter(e => !e.isHidden);
        if (activeFilterCount > 0) filtered = filtered.filter(e => filteredTeacherIds.has(e.teacherId));
        if (selectedPositionNames.size > 0) {
            filtered = filtered.filter(e => { const t = teachers.find(t => t.id === e.teacherId); if (!t) return false; if (e.positionId) { const pa = t.positionAssignments.find(p => p.id === e.positionId); return pa ? selectedPositionNames.has(pa.positionName) : false; } return t.positionAssignments.some(pa => selectedPositionNames.has(pa.positionName)); });
        }
        const { startLimit, endLimit } = dateRange;
        if (startLimit) filtered = filtered.filter(e => new Date(e.start) >= startLimit!);
        if (endLimit) filtered = filtered.filter(e => new Date(e.end) <= endLimit!);
        return filtered;
    }, [events, dateRange, filteredTeacherIds, activeFilterCount, selectedPositionNames, teachers]);

    const monthsInRange = useMemo(() => { const { startLimit, endLimit } = dateRange; if (!startLimit || !endLimit) return 1; return Math.max(1, (endLimit.getFullYear() * 12 + endLimit.getMonth()) - (startLimit.getFullYear() * 12 + startLimit.getMonth()) + 1); }, [dateRange]);

    const reportData: TeacherReport[] = useMemo(() => {
        const visibleTeachers = activeFilterCount > 0 ? teachers.filter(t => filteredTeacherIds.has(t.id)) : teachers;
        const reports: TeacherReport[] = visibleTeachers.map(teacher => {
            const posFinancials: Record<string, PositionFinancials> = {};
            teacher.positionAssignments.forEach(pa => {
                if (selectedPositionNames.size > 0 && !selectedPositionNames.has(pa.positionName)) return;
                if (selectedCategories.size > 0 && !selectedCategories.has(pa.category)) return;
                if (selectedRateTypes.size > 0 && !selectedRateTypes.has(pa.rateType)) return;
                posFinancials[pa.id] = { positionId: pa.id, positionName: pa.positionName, rateType: pa.rateType, rateValue: pa.rateValue, category: pa.category, activeHours: 0, canceledHours: 0, totalHours: 0, hourlyCost: 0, oneOffCost: 0, globalCost: 0 };
            });
            let unassignedActive = 0, unassignedCanceled = 0;
            filteredEvents.filter(e => e.teacherId === teacher.id).forEach(evt => {
                const dur = (new Date(evt.end).getTime() - new Date(evt.start).getTime()) / 3600000;
                let tid = evt.positionId;

                if (!tid && evt.classification) {
                    const syntheticId = `cat_${evt.classification}`;
                    if (!posFinancials[syntheticId]) {
                        posFinancials[syntheticId] = {
                            positionId: syntheticId, positionName: evt.classification, rateType: 'HOURLY',
                            rateValue: 0, category: evt.classification, activeHours: 0,
                            canceledHours: 0, totalHours: 0, hourlyCost: 0, oneOffCost: 0, globalCost: 0,
                        };
                    }
                    tid = syntheticId;
                }

                if (!tid || !posFinancials[tid]) { const fk = Object.keys(posFinancials)[0]; if (fk) tid = fk; else { if (evt.isCanceled) unassignedCanceled += dur; else unassignedActive += dur; return; } }
                const pf = posFinancials[tid!]; if (!pf) return;
                pf.totalHours += dur; if (evt.isCanceled) pf.canceledHours += dur; else pf.activeHours += dur;

                const isNoPayment = evt.overrideFlags?.paymentMethod === 'NONE';
                const isOneOff = evt.overrideFlags?.paymentMethod === 'ONE_OFF' || evt.overrideFlags?.isOneOffPayment || evt.pricingSnapshot?.rateType === 'ONE_OFF';

                let eventPay = 0;
                if (isNoPayment) {
                    eventPay = 0;
                } else if (isOneOff && evt.pricingSnapshot) {
                    eventPay = evt.pricingSnapshot.rateValue;
                } else if (pf.rateType === 'HOURLY') {
                    eventPay = dur * pf.rateValue;
                }

                if (!evt.isCanceled || evt.cancellationPayStatus === 'PAID_CANCELLATION') {
                    if (isOneOff) {
                        pf.oneOffCost += eventPay;
                    } else {
                        pf.hourlyCost += eventPay;
                    }
                }
            });
            Object.values(posFinancials).forEach(pf => { if (pf.rateType === 'GLOBAL_MONTHLY') { if (pf.totalHours > 0 || activeFilterCount > 0) pf.globalCost = pf.rateValue * monthsInRange; } });
            const arr = Object.values(posFinancials);
            const totalActiveHours = arr.reduce((s, p) => s + p.activeHours, 0) + unassignedActive;
            const totalCanceledHours = arr.reduce((s, p) => s + p.canceledHours, 0) + unassignedCanceled;
            const hourlyCostTotal = arr.reduce((s, p) => s + p.hourlyCost, 0);
            const oneOffCostTotal = arr.reduce((s, p) => s + p.oneOffCost, 0);
            const globalCostTotal = arr.reduce((s, p) => s + p.globalCost, 0);
            return { teacherId: teacher.id, teacherName: teacher.fullName, teacherColor: teacher.color, positions: arr, totalActiveHours, totalCanceledHours, totalHours: totalActiveHours + totalCanceledHours, hourlyCostTotal, oneOffCostTotal, globalCostTotal, grandTotal: hourlyCostTotal + oneOffCostTotal + globalCostTotal };
        });
        return reports.filter(r => r.totalHours > 0 || r.grandTotal > 0 || activeFilterCount > 0);
    }, [filteredEvents, teachers, filteredTeacherIds, activeFilterCount, selectedPositionNames, selectedCategories, selectedRateTypes, monthsInRange]);

    const totals = useMemo(() => {
        const totalHours = reportData.reduce((s, r) => s + r.totalHours, 0);
        const activeHours = reportData.reduce((s, r) => s + r.totalActiveHours, 0);
        const canceledHours = reportData.reduce((s, r) => s + r.totalCanceledHours, 0);
        const hourlyCost = reportData.reduce((s, r) => s + r.hourlyCostTotal, 0);
        const oneOffCost = reportData.reduce((s, r) => s + r.oneOffCostTotal, 0);
        const globalCost = reportData.reduce((s, r) => s + r.globalCostTotal, 0);
        return { totalHours, activeHours, canceledHours, hourlyCost, oneOffCost, globalCost, grandTotal: hourlyCost + oneOffCost + globalCost };
    }, [reportData]);

    const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const lastUpdated = useMemo(() => new Date(), [filteredEvents, reportData]);

    // ── 10 Insight Tiles ──
    const insightTiles: InsightTile[] = useMemo(() => {
        const rwd = reportData.filter(r => r.totalHours > 0 || r.grandTotal > 0);
        if (rwd.length === 0) return [];
        const mostHrs = [...rwd].sort((a, b) => b.totalActiveHours - a.totalActiveHours)[0];
        const mostCanc = [...rwd].sort((a, b) => b.totalCanceledHours - a.totalCanceledHours)[0];
        const highPay = [...rwd].sort((a, b) => b.grandTotal - a.grandTotal)[0];
        const lowPay = [...rwd].filter(r => r.grandTotal > 0).sort((a, b) => a.grandTotal - b.grandTotal)[0];
        const cancelRate = totals.totalHours > 0 ? (totals.canceledHours / totals.totalHours * 100) : 0;
        const avgCost = rwd.length > 0 ? totals.grandTotal / rwd.length : 0;
        const posCounts: Record<string, number> = {};
        rwd.forEach(r => r.positions.forEach(p => { posCounts[p.positionName] = (posCounts[p.positionName] || 0) + p.activeHours; }));
        const topPos = Object.entries(posCounts).sort((a, b) => b[1] - a[1])[0];
        const hourlyPct = totals.grandTotal > 0 ? (totals.hourlyCost / totals.grandTotal * 100) : 0;
        const mostPos = [...rwd].sort((a, b) => b.positions.length - a.positions.length)[0];
        const activeCount = rwd.filter(r => r.totalActiveHours > 0).length;

        return [
            { id: 'most-hours', title: t('insight.most_hours'), icon: <Award size={16} />, value: formatHours(mostHrs.totalActiveHours), entity: mostHrs.teacherName, entityColor: mostHrs.teacherColor, context: `${((mostHrs.totalActiveHours / Math.max(totals.activeHours, 1)) * 100).toFixed(0)}% of all active hours`, highlight: 'max', gradient: 'bg-gradient-to-r from-emerald-400 to-emerald-600' },
            { id: 'most-canceled', title: t('insight.most_canceled'), icon: <AlertTriangle size={16} />, value: formatHours(mostCanc.totalCanceledHours), entity: mostCanc.teacherName, entityColor: mostCanc.teacherColor, context: mostCanc.totalCanceledHours > 0 ? `${((mostCanc.totalCanceledHours / Math.max(mostCanc.totalHours, 1)) * 100).toFixed(0)}% of their total hours` : 'No cancellations', highlight: mostCanc.totalCanceledHours > 0 ? 'min' : 'neutral', gradient: 'bg-gradient-to-r from-red-400 to-red-600' },
            { id: 'highest-payroll', title: t('insight.highest_payroll'), icon: <DollarSign size={16} />, value: formatCurrency(highPay.grandTotal, settings.currency), entity: highPay.teacherName, entityColor: highPay.teacherColor, context: `${((highPay.grandTotal / Math.max(totals.grandTotal, 1)) * 100).toFixed(0)}% of total payroll`, highlight: 'max', gradient: 'bg-gradient-to-r from-blue-400 to-indigo-600' },
            { id: 'lowest-payroll', title: t('insight.lowest_payroll'), icon: <TrendingDown size={16} />, value: lowPay ? formatCurrency(lowPay.grandTotal, settings.currency) : '—', entity: lowPay?.teacherName, entityColor: lowPay?.teacherColor, context: lowPay ? `${((lowPay.grandTotal / Math.max(totals.grandTotal, 1)) * 100).toFixed(1)}% of total` : 'No data', highlight: 'min', gradient: 'bg-gradient-to-r from-orange-400 to-red-500' },
            { id: 'cancel-rate', title: t('insight.cancel_rate'), icon: <Percent size={16} />, value: `${cancelRate.toFixed(1)}%`, context: `${formatHours(totals.canceledHours)} canceled of ${formatHours(totals.totalHours)} total`, highlight: cancelRate > 25 ? 'min' : cancelRate > 15 ? 'warning' : 'neutral', gradient: cancelRate > 15 ? 'bg-gradient-to-r from-amber-400 to-amber-600' : 'bg-gradient-to-r from-slate-300 to-slate-500' },
            { id: 'avg-cost', title: t('insight.avg_cost'), icon: <Target size={16} />, value: formatCurrency(avgCost, settings.currency), context: `Across ${rwd.length} active teacher${rwd.length !== 1 ? 's' : ''}`, highlight: 'neutral', gradient: 'bg-gradient-to-r from-violet-400 to-purple-600' },
            { id: 'top-position', title: t('insight.top_position'), icon: <Briefcase size={16} />, value: topPos ? formatHours(topPos[1]) : '0:00', entity: topPos ? topPos[0] : undefined, context: t('insight.most_active_position'), highlight: 'neutral', gradient: 'bg-gradient-to-r from-teal-400 to-cyan-600' },
            { id: 'cost-split', title: t('insight.cost_split'), icon: <CreditCard size={16} />, value: `${hourlyPct.toFixed(0)}% / ${(100 - hourlyPct).toFixed(0)}%`, context: `${formatCurrency(totals.hourlyCost, settings.currency)} hourly · ${formatCurrency(totals.globalCost, settings.currency)} global`, highlight: 'neutral', gradient: 'bg-gradient-to-r from-blue-400 to-emerald-500' },
            { id: 'most-positions', title: t('insight.most_positions'), icon: <UsersIcon size={16} />, value: `${mostPos.positions.length}`, entity: mostPos.teacherName, entityColor: mostPos.teacherColor, context: mostPos.positions.map(p => p.positionName).join(', '), highlight: 'neutral', gradient: 'bg-gradient-to-r from-pink-400 to-rose-600' },
            { id: 'active-teachers', title: t('insight.active_teachers'), icon: <Activity size={16} />, value: `${activeCount}`, context: `Out of ${teachers.length} total`, highlight: 'neutral', gradient: 'bg-gradient-to-r from-sky-400 to-blue-600' },
        ];
    }, [reportData, totals, teachers, settings.currency]);

    const customInsightTiles: InsightTile[] = useMemo(() => {
        return customInsights.map(ci => {
            let valueStr = '';
            let entity = ci.teacherId ? teachers.find(t => t.id === ci.teacherId)?.fullName : t('metric.all_teachers');

            const ds = ci.teacherId ? reportData.filter(r => r.teacherId === ci.teacherId) : reportData;
            const totalHrs = ds.reduce((s, r) => s + r.totalActiveHours, 0);
            const cancHrs = ds.reduce((s, r) => s + r.totalCanceledHours, 0);
            const grandTot = ds.reduce((s, r) => s + r.grandTotal, 0);
            const hrTot = ds.reduce((s, r) => s + r.hourlyCostTotal, 0);
            const ooTot = ds.reduce((s, r) => s + r.oneOffCostTotal, 0);
            const glTot = ds.reduce((s, r) => s + r.globalCostTotal, 0);
            const count = ds.length || 1;

            if (ci.metric === 'totalActiveHours') valueStr = formatHours(totalHrs);
            else if (ci.metric === 'totalCanceledHours') valueStr = formatHours(cancHrs);
            else if (ci.metric === 'hourlyCostTotal') valueStr = formatCurrency(hrTot, settings.currency);
            else if (ci.metric === 'oneOffCostTotal') valueStr = formatCurrency(ooTot, settings.currency);
            else if (ci.metric === 'globalCostTotal') valueStr = formatCurrency(glTot, settings.currency);
            else if (ci.metric === 'grandTotal') valueStr = formatCurrency(grandTot, settings.currency);
            else if (ci.metric === 'avgActiveHours') valueStr = formatHours(totalHrs / count);
            else if (ci.metric === 'avgGrandTotal') valueStr = formatCurrency(grandTot / count, settings.currency);
            else if (ci.metric === 'cancellationRate') valueStr = `${(((cancHrs) / Math.max(totalHrs + cancHrs, 1)) * 100).toFixed(1)}%`;
            else if (ci.metric === 'maxEarner') {
                const max = [...ds].sort((a, b) => b.grandTotal - a.grandTotal)[0];
                valueStr = max ? formatCurrency(max.grandTotal, settings.currency) : '—';
                if (max && !ci.teacherId) entity = max.teacherName;
            }
            else if (ci.metric === 'minEarner') {
                const validDs = ds.filter(r => r.grandTotal > 0);
                const min = [...validDs].sort((a, b) => a.grandTotal - b.grandTotal)[0];
                valueStr = min ? formatCurrency(min.grandTotal, settings.currency) : '—';
                if (min && !ci.teacherId) entity = min.teacherName;
            }

            return {
                id: ci.id,
                title: ci.title,
                icon: <Zap size={16} />,
                value: valueStr,
                highlight: 'neutral',
                gradient: 'bg-gradient-to-r from-slate-400 to-slate-600',
                entity: entity,
                isCustom: true
            };
        });
    }, [reportData, customInsights, teachers, settings.currency]);

    const allInsightTiles = useMemo(() => [...insightTiles, ...customInsightTiles], [insightTiles, customInsightTiles]);

    // Filter pills
    const activeFilterPills: { label: string; color: string; onRemove: () => void }[] = [];
    selectedTeacherIds.forEach(id => { const t = teachers.find(t => t.id === id); if (t) activeFilterPills.push({ label: t.fullName, color: 'blue', onRemove: () => toggleInSet(selectedTeacherIds, setSelectedTeacherIds, id) }); });
    selectedPositionNames.forEach(pn => activeFilterPills.push({ label: pn, color: 'emerald', onRemove: () => toggleInSet(selectedPositionNames, setSelectedPositionNames, pn) }));
    selectedTags.forEach(tag => activeFilterPills.push({ label: `#${tag}`, color: 'amber', onRemove: () => toggleInSet(selectedTags, setSelectedTags, tag) }));
    selectedCategories.forEach(cat => activeFilterPills.push({ label: cat, color: 'violet', onRemove: () => toggleInSet(selectedCategories, setSelectedCategories, cat) }));
    selectedRateTypes.forEach(rt => activeFilterPills.push({ label: rt === 'HOURLY' ? '⏱ ' + t('filter.hourly') : '📅 ' + t('filter.global_monthly'), color: 'rose', onRemove: () => toggleInSet(selectedRateTypes, setSelectedRateTypes, rt) }));

    const pillColorClasses: Record<string, string> = {
        blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
        rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    };

    const deletingChart = deletingChartId ? savedCharts.find(c => c.id === deletingChartId) : null;

    return (
        <div className="h-full overflow-y-auto p-8 pb-20 custom-scrollbar">
            <div className="max-w-7xl mx-auto min-h-screen">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div className="flex items-center gap-3">
                        <button onClick={onMobileMenuOpen} className="p-2 -ms-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden" title={t('analysis.open_menu')}>
                            <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                        </button>
                        <button onClick={onNavigateBack} className="p-2 -ms-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title={t('analysis.back_to_dashboard')}>
                            {isRtl ? <ArrowRight size={20} className="text-slate-500 dark:text-slate-400" /> : <ArrowLeft size={20} className="text-slate-500 dark:text-slate-400" />}
                        </button>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <LineChartIcon size={24} className="text-blue-500" />{t('analysis.title')}
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">{t('analysis.subtitle')}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg flex items-center px-2 py-1.5 shadow-sm">
                            <CalIcon size={16} className="text-slate-400 me-2" />
                            <select className="bg-transparent outline-none text-sm font-medium text-slate-700 dark:text-white" value={dateFilterType} onChange={e => setDateFilterType(e.target.value as DateFilterType)}>
                                <option value="WEEK">{t('time.current_week')}</option><option value="MONTH">{t('time.current_month')}</option><option value="CUSTOM">{t('time.custom_range')}</option><option value="ALL">{t('time.all_time')}</option>
                            </select>
                        </div>
                        {dateFilterType === 'CUSTOM' && (
                            <div className="flex items-center space-x-2 rtl:space-x-reverse bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-1.5 shadow-sm">
                                <DatePicker
                                    type="date"
                                    className="bg-transparent text-xs outline-none dark:text-white"
                                    value={customStartDate}
                                    onChange={e => {
                                        const newStart = e.target.value;
                                        setCustomStartDate(newStart);
                                        if (!customEndDate || new Date(newStart) > new Date(customEndDate)) {
                                            setCustomEndDate(newStart);
                                        }
                                    }}
                                />
                                <span className="text-slate-400">-</span>
                                <DatePicker
                                    type="date"
                                    className="bg-transparent text-xs outline-none dark:text-white"
                                    value={customEndDate}
                                    onChange={e => {
                                        const newEnd = e.target.value;
                                        setCustomEndDate(newEnd);
                                        if (customStartDate && new Date(newEnd) < new Date(customStartDate)) {
                                            setCustomStartDate(newEnd);
                                        }
                                    }}
                                />
                            </div>
                        )}
                        <button onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                            className={`border rounded-lg flex items-center px-3 py-2 shadow-sm text-sm transition-colors ${isFilterPanelOpen || activeFilterCount > 0 ? 'btn-cadenza bg-cadenza-gradient texture-cadenza text-white border-transparent' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-white'}`}>
                            <SlidersHorizontal size={16} className="me-2" />{t('analysis.filters')}
                            {activeFilterCount > 0 && <span className="ms-1.5 bg-white/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>}
                            <ChevronDown size={14} className={`ms-1 transition-transform ${isFilterPanelOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Filter Panel */}
                {isFilterPanelOpen && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg mb-6 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2"><Filter size={14} /> {t('analysis.advanced_filters')}</h3>
                            <div className="flex items-center gap-2">
                                {activeFilterCount > 0 && <button onClick={clearAllFilters} className="text-xs text-red-500 hover:text-red-700 font-medium">{t('analysis.clear_all')}</button>}
                                <button onClick={() => setIsFilterPanelOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <FilterSection title={t('filter.teachers')} icon={<User size={12} />} items={teachers.map(t => t.id)} selected={selectedTeacherIds}
                                onToggle={id => toggleInSet(selectedTeacherIds, setSelectedTeacherIds, id)} colorDot={id => teacherColorMap[id]} displayLabel={id => teachers.find(t => t.id === id)?.fullName || id} accentColor="blue" />
                            <FilterSection title={t('filter.positions')} icon={<Briefcase size={12} />} items={allPositionNames} selected={selectedPositionNames}
                                onToggle={pn => toggleInSet(selectedPositionNames, setSelectedPositionNames, pn)} accentColor="emerald" />
                            <FilterSection title={t('filter.tags')} icon={<Tag size={12} />} items={allTags} selected={selectedTags}
                                onToggle={tag => toggleInSet(selectedTags, setSelectedTags, tag)} accentColor="amber" />
                            <FilterSection title={t('filter.categories')} icon={<CalendarDays size={12} />} items={allCategories} selected={selectedCategories}
                                onToggle={cat => toggleInSet(selectedCategories, setSelectedCategories, cat)} accentColor="violet" />
                            <FilterSection title={t('filter.rate_type')} icon={<ToggleLeft size={12} />} items={['HOURLY', 'GLOBAL_MONTHLY']} selected={selectedRateTypes}
                                onToggle={rt => toggleInSet(selectedRateTypes, setSelectedRateTypes, rt)} accentColor="rose" />
                        </div>
                    </div>
                )}

                {/* Filter pills */}
                {activeFilterPills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-6">
                        {activeFilterPills.map((pill, idx) => (
                            <span key={idx} className={`text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${pillColorClasses[pill.color] || pillColorClasses.blue}`}>
                                {pill.label}<button onClick={pill.onRemove} className="hover:opacity-60"><X size={10} /></button>
                            </span>
                        ))}
                        <button onClick={clearAllFilters} className="text-[11px] text-slate-400 hover:text-red-500 px-2 py-0.5 flex items-center gap-0.5"><X size={10} /> {t('analysis.clear_all')}</button>
                    </div>
                )}

                {/* ═══════════════════════════════════════ */}
                {/* 1. INSIGHTS SECTION (top of page)       */}
                {/* ═══════════════════════════════════════ */}
                {insightTiles.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Zap size={18} className="text-amber-500" /> {t('analysis.key_insights')}
                                <span className="text-xs font-normal bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">
                                    {insightShowAll ? allInsightTiles.length : `${visibleInsightIds.size} / ${allInsightTiles.length}`}
                                </span>
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 flex items-center gap-1"><Activity size={10} /> Updated {lastUpdated.toLocaleTimeString()}</span>
                                <button
                                    onClick={() => setIsInsightPickerOpen(!isInsightPickerOpen)}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${isInsightPickerOpen
                                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-transparent'
                                        }`}
                                >
                                    <SettingsIcon size={12} />
                                    {isInsightPickerOpen ? t('chart.done') : t('chart.edit')}
                                </button>
                            </div>
                        </div>

                        {/* Insight Picker Panel */}
                        {isInsightPickerOpen && (
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg mb-4 p-4 animate-in slide-in-from-top">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('analysis.choose_insights')}</h4>
                                        {!insightShowAll && (
                                            <span className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                                                {visibleInsightIds.size} selected
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setIsCustomInsightModalOpen(true)}
                                            className="text-[11px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors me-2"
                                        >
                                            <Plus size={12} /> {t('analysis.custom_insight')}
                                        </button>
                                        {!insightShowAll && (
                                            <button
                                                onClick={resetInsightsToDefault}
                                                className="text-[11px] text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400 font-medium flex items-center gap-1 transition-colors"
                                            >
                                                <RotateCcw size={10} /> {t('analysis.show_all')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                    {allInsightTiles.map(tile => {
                                        const isVisible = insightShowAll || visibleInsightIds.has(tile.id);
                                        return (
                                            <button
                                                key={tile.id}
                                                onClick={() => toggleInsightVisibility(tile.id)}
                                                className={`relative flex items-center gap-2 px-3 py-2.5 rounded-lg border text-start transition-all text-xs ${isVisible
                                                    ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-700 shadow-sm'
                                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 opacity-50'
                                                    }`}
                                            >
                                                <div className={`p-1 rounded ${isVisible
                                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                                                    }`}>
                                                    {tile.icon}
                                                </div>
                                                <span className={`font-medium truncate ${isVisible
                                                    ? 'text-slate-700 dark:text-slate-200'
                                                    : 'text-slate-400 dark:text-slate-500'
                                                    }`}>
                                                    {tile.title}
                                                </span>
                                                {tile.isCustom && (
                                                    <button onClick={(e) => handleDeleteCustomInsight(e, tile.id)} className="ms-1 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-red-500">
                                                        <Trash2 size={10} />
                                                    </button>
                                                )}
                                                {isVisible && (
                                                    <Check size={12} className="text-blue-500 dark:text-blue-400 flex-shrink-0 ms-auto" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {allInsightTiles
                                .filter(tile => insightShowAll || visibleInsightIds.has(tile.id))
                                .map(tile => <InsightCard key={tile.id} tile={tile} />)
                            }
                            {!insightShowAll && visibleInsightIds.size === 0 && (
                                <div className="col-span-full text-center py-6 text-slate-400 dark:text-slate-500 text-sm">
                                    <EyeOff size={20} className="mx-auto mb-2 opacity-50" />
                                    No insights selected. Click <strong>Edit</strong> to choose which insights to display.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════ */}
                {/* 2. "NEW CHART" BUTTON                   */}
                {/* ═══════════════════════════════════════ */}
                <div className="mb-6 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <BarChart3 size={18} className="text-blue-500" /> {t('analysis.charts')}
                        {savedCharts.length > 0 && <span className="text-xs font-normal bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{savedCharts.length}</span>}
                    </h3>
                    <button onClick={handleNewChart}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft text-sm font-medium transition-colors ">
                        <Plus size={16} /> {t('analysis.new_chart')}
                    </button>
                </div>

                {/* ═══════════════════════════════════════ */}
                {/* 3. EXISTING CHARTS SECTION              */}
                {/* ═══════════════════════════════════════ */}
                {savedCharts.length === 0 ? (
                    <div onClick={handleNewChart}
                        className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all group mb-8">
                        <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">📊</div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('analysis.create_first_chart')}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t('analysis.create_first_chart_desc')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                        {savedCharts.map(chart => (
                            <div key={chart.id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden group">
                                {/* Header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <h4 className="text-sm font-semibold text-slate-800 dark:text-white truncate">{chart.title}</h4>
                                        <span className={`flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${chart.filterMode === 'live'
                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                                            : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'}`}>
                                            {chart.filterMode === 'live' ? <Zap size={8} /> : <Camera size={8} />}
                                            {chart.filterMode === 'live' ? 'LIVE' : 'SNAPSHOT'}
                                        </span>
                                        {chart.chartFilters && (chart.chartFilters.teacherIds.length + chart.chartFilters.positionNames.length + chart.chartFilters.tags.length + chart.chartFilters.categories.length + chart.chartFilters.rateTypes.length) > 0 && (
                                            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
                                                <Filter size={8} />{chart.chartFilters!.teacherIds.length + chart.chartFilters!.positionNames.length + chart.chartFilters!.tags.length + chart.chartFilters!.categories.length + chart.chartFilters!.rateTypes.length} filters
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleEditChart(chart)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t('analysis.edit_tooltip')}><Pencil size={12} className="text-slate-400 hover:text-blue-500" /></button>
                                        <button onClick={() => handleDuplicateChart(chart)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t('analysis.duplicate_tooltip')}><Copy size={12} className="text-slate-400 hover:text-emerald-500" /></button>
                                        <button onClick={() => setDeletingChartId(chart.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title={t('financial.delete_title')}><Trash2 size={12} className="text-slate-400 hover:text-red-500" /></button>
                                    </div>
                                </div>
                                {/* Body */}
                                <div className="p-4">
                                    {chart.compareEnabled && chart.comparisons && chart.comparisons.length > 0 ? (
                                        (() => {
                                            // Build datasets for comparison rendering
                                            const compDatasets: DatasetInput[] = [
                                                { label: 'Primary', color: '#4f46e5', events: filteredEvents, isPrimary: true },
                                                ...chart.comparisons.map((cmp, idx) => {
                                                    const { start, end } = computeDateRangeForComparison(
                                                        cmp.timeframe, cmp.specificDate, cmp.customStart, cmp.customEnd
                                                    );
                                                    const cmpEvents = events.filter(e => {
                                                        if (e.isHidden) return false;
                                                        const eStart = new Date(e.start);
                                                        return eStart >= start && eStart <= end;
                                                    });
                                                    return {
                                                        label: cmp.specificDate || `Comparison ${idx + 1}`,
                                                        color: COMPARE_COLORS[idx % COMPARE_COLORS.length],
                                                        events: cmpEvents,
                                                    };
                                                }),
                                            ];
                                            if (chart.compareLayout === 'merged' || !chart.compareLayout) {
                                                return <MergedChartRenderer config={chart} datasets={compDatasets} teachers={teachers} height={280} currencySymbol={settings.currency} />;
                                            } else {
                                                // Side-by-side layout
                                                return (
                                                    <div className="space-y-3">
                                                        <ChartRenderer config={chart} events={filteredEvents} teachers={teachers} height={200} currencySymbol={settings.currency} />
                                                        {compDatasets.slice(1).map((ds, idx) => (
                                                            <div key={idx} className="border-t border-slate-100 dark:border-slate-800 pt-3">
                                                                <p className="text-[10px] font-medium mb-1" style={{ color: ds.color }}>{ds.label}</p>
                                                                <ChartRenderer config={chart} events={ds.events} teachers={teachers} height={160} currencySymbol={settings.currency} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                        })()
                                    ) : (
                                        <ChartRenderer config={chart} events={filteredEvents} teachers={teachers} height={280} currencySymbol={settings.currency} />
                                    )}
                                </div>
                                {/* Footer */}
                                <div className="px-4 py-2 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                                    <span>{chart.dimension} × {chart.metrics.length} metric{chart.metrics.length > 1 ? 's' : ''} → {chart.visualization}{chart.compareEnabled ? ' (compare)' : ''}</span>
                                    <span>Updated {new Date(chart.updatedAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Chart Builder Modal */}
                <ChartBuilderModal
                    isOpen={isChartModalOpen}
                    onClose={() => { setIsChartModalOpen(false); setEditingChart(null); }}
                    onSave={handleSaveChart}
                    filteredEvents={filteredEvents} allEvents={events} teachers={teachers}
                    currentFilters={{ dateFilterType, customStartDate, customEndDate, selectedTeacherIds, selectedPositionNames, selectedTags, selectedCategories, selectedRateTypes }}
                    editingChart={editingChart}
                    currencySymbol={settings.currency}
                    t={t}
                />

                {isCustomInsightModalOpen && (
                    <CustomInsightModal
                        teachers={teachers}
                        t={t}
                        onClose={() => setIsCustomInsightModalOpen(false)}
                        onSave={(info) => {
                            saveCustomInsights([...customInsights, info]);
                            setIsCustomInsightModalOpen(false);
                            // Auto-show the new insight
                            const newVisible = new Set<string>(visibleInsightIds);
                            newVisible.add(info.id);
                            saveInsightPrefs(newVisible, false);
                        }}
                    />
                )}

                {/* Delete Confirmation Modal */}
                {deletingChart && (
                    <DeleteConfirmModal
                        chartTitle={deletingChart.title}
                        t={t}
                        onConfirm={() => handleDeleteChart(deletingChartId!)}
                        onCancel={() => setDeletingChartId(null)}
                    />
                )}
            </div>
        </div>
    );
};
