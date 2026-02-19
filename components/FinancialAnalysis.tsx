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
    Copy, BarChart3, Zap, Camera, ArrowLeft, LineChart as LineChartIcon,
    Award, AlertTriangle, TrendingDown, Percent, Target, CreditCard, Users as UsersIcon, Activity
} from 'lucide-react';
import { ChartBuilderModal } from './ChartBuilderModal';
import { ChartRenderer } from './ChartRenderer';

// ---- Financial data structures ----
interface PositionFinancials {
    positionId: string; positionName: string; rateType: 'HOURLY' | 'GLOBAL_MONTHLY';
    rateValue: number; category: string; activeHours: number; canceledHours: number;
    totalHours: number; hourlyCost: number; globalCost: number;
}

interface TeacherReport {
    teacherId: string; teacherName: string; teacherColor: string;
    positions: PositionFinancials[]; totalActiveHours: number; totalCanceledHours: number;
    totalHours: number; hourlyCostTotal: number; globalCostTotal: number; grandTotal: number;
}

type DateFilterType = 'WEEK' | 'MONTH' | 'CUSTOM' | 'ALL';

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
                        className={`w-full text-left text-[11px] px-2 py-1 rounded flex items-center gap-1.5 transition-colors ${selected.has(item) ? `bg-${accentColor}-50 dark:bg-${accentColor}-900/20 text-${accentColor}-700 dark:text-${accentColor}-300` : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
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
            <div className={`absolute top-0 left-0 right-0 h-1 ${tile.gradient}`} />
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
const DeleteConfirmModal: React.FC<{ chartTitle: string; onConfirm: () => void; onCancel: () => void }> = ({ chartTitle, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4" onClick={onCancel}>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg"><Trash2 size={20} className="text-red-500" /></div>
                <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Delete Chart</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
                </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                Are you sure you want to delete <strong>"{chartTitle}"</strong>?
            </p>
            <div className="flex items-center gap-2 justify-end">
                <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors">Delete</button>
            </div>
        </div>
    </div>
);

// ---- Main Component ----
interface Props {
    events: CalendarEvent[]; teachers: Teacher[]; settings: AppSettings;
    savedCharts: ChartConfiguration[]; setSavedCharts: React.Dispatch<React.SetStateAction<ChartConfiguration[]>>;
    onMobileMenuOpen: () => void; onNavigateBack: () => void;
}

export const FinancialAnalysis: React.FC<Props> = ({ events, teachers, settings, savedCharts, setSavedCharts, onMobileMenuOpen, onNavigateBack }) => {
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
                posFinancials[pa.id] = { positionId: pa.id, positionName: pa.positionName, rateType: pa.rateType, rateValue: pa.rateValue, category: pa.category, activeHours: 0, canceledHours: 0, totalHours: 0, hourlyCost: 0, globalCost: 0 };
            });
            let unassignedActive = 0, unassignedCanceled = 0;
            filteredEvents.filter(e => e.teacherId === teacher.id).forEach(evt => {
                const dur = (new Date(evt.end).getTime() - new Date(evt.start).getTime()) / 3600000;
                let tid = evt.positionId;
                if (!tid || !posFinancials[tid]) { const fk = Object.keys(posFinancials)[0]; if (fk) tid = fk; else { if (evt.isCanceled) unassignedCanceled += dur; else unassignedActive += dur; return; } }
                const pf = posFinancials[tid!]; if (!pf) return;
                pf.totalHours += dur; if (evt.isCanceled) pf.canceledHours += dur; else pf.activeHours += dur;
            });
            Object.values(posFinancials).forEach(pf => { if (pf.rateType === 'HOURLY') pf.hourlyCost = pf.activeHours * pf.rateValue; else { if (pf.totalHours > 0 || activeFilterCount > 0) pf.globalCost = pf.rateValue * monthsInRange; } });
            const arr = Object.values(posFinancials);
            const totalActiveHours = arr.reduce((s, p) => s + p.activeHours, 0) + unassignedActive;
            const totalCanceledHours = arr.reduce((s, p) => s + p.canceledHours, 0) + unassignedCanceled;
            const hourlyCostTotal = arr.reduce((s, p) => s + p.hourlyCost, 0);
            const globalCostTotal = arr.reduce((s, p) => s + p.globalCost, 0);
            return { teacherId: teacher.id, teacherName: teacher.fullName, teacherColor: teacher.color, positions: arr, totalActiveHours, totalCanceledHours, totalHours: totalActiveHours + totalCanceledHours, hourlyCostTotal, globalCostTotal, grandTotal: hourlyCostTotal + globalCostTotal };
        });
        return reports.filter(r => r.totalHours > 0 || r.grandTotal > 0 || activeFilterCount > 0);
    }, [filteredEvents, teachers, filteredTeacherIds, activeFilterCount, selectedPositionNames, selectedCategories, selectedRateTypes, monthsInRange]);

    const totals = useMemo(() => {
        const totalHours = reportData.reduce((s, r) => s + r.totalHours, 0);
        const activeHours = reportData.reduce((s, r) => s + r.totalActiveHours, 0);
        const canceledHours = reportData.reduce((s, r) => s + r.totalCanceledHours, 0);
        const hourlyCost = reportData.reduce((s, r) => s + r.hourlyCostTotal, 0);
        const globalCost = reportData.reduce((s, r) => s + r.globalCostTotal, 0);
        return { totalHours, activeHours, canceledHours, hourlyCost, globalCost, grandTotal: hourlyCost + globalCost };
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
            { id: 'most-hours', title: 'Most Hours Taught', icon: <Award size={16} />, value: formatHours(mostHrs.totalActiveHours), entity: mostHrs.teacherName, entityColor: mostHrs.teacherColor, context: `${((mostHrs.totalActiveHours / Math.max(totals.activeHours, 1)) * 100).toFixed(0)}% of all active hours`, highlight: 'max', gradient: 'bg-gradient-to-r from-emerald-400 to-emerald-600' },
            { id: 'most-canceled', title: 'Most Canceled Hours', icon: <AlertTriangle size={16} />, value: formatHours(mostCanc.totalCanceledHours), entity: mostCanc.teacherName, entityColor: mostCanc.teacherColor, context: mostCanc.totalCanceledHours > 0 ? `${((mostCanc.totalCanceledHours / Math.max(mostCanc.totalHours, 1)) * 100).toFixed(0)}% of their total hours` : 'No cancellations', highlight: mostCanc.totalCanceledHours > 0 ? 'min' : 'neutral', gradient: 'bg-gradient-to-r from-red-400 to-red-600' },
            { id: 'highest-payroll', title: 'Highest Payroll', icon: <DollarSign size={16} />, value: formatCurrency(highPay.grandTotal, settings.currency), entity: highPay.teacherName, entityColor: highPay.teacherColor, context: `${((highPay.grandTotal / Math.max(totals.grandTotal, 1)) * 100).toFixed(0)}% of total payroll`, highlight: 'max', gradient: 'bg-gradient-to-r from-blue-400 to-indigo-600' },
            { id: 'lowest-payroll', title: 'Lowest Payroll', icon: <TrendingDown size={16} />, value: lowPay ? formatCurrency(lowPay.grandTotal, settings.currency) : '—', entity: lowPay?.teacherName, entityColor: lowPay?.teacherColor, context: lowPay ? `${((lowPay.grandTotal / Math.max(totals.grandTotal, 1)) * 100).toFixed(1)}% of total` : 'No data', highlight: 'min', gradient: 'bg-gradient-to-r from-orange-400 to-red-500' },
            { id: 'cancel-rate', title: 'Cancellation Rate', icon: <Percent size={16} />, value: `${cancelRate.toFixed(1)}%`, context: `${formatHours(totals.canceledHours)} canceled of ${formatHours(totals.totalHours)} total`, highlight: cancelRate > 25 ? 'min' : cancelRate > 15 ? 'warning' : 'neutral', gradient: cancelRate > 15 ? 'bg-gradient-to-r from-amber-400 to-amber-600' : 'bg-gradient-to-r from-slate-300 to-slate-500' },
            { id: 'avg-cost', title: 'Avg Cost / Teacher', icon: <Target size={16} />, value: formatCurrency(avgCost, settings.currency), context: `Across ${rwd.length} active teacher${rwd.length !== 1 ? 's' : ''}`, highlight: 'neutral', gradient: 'bg-gradient-to-r from-violet-400 to-purple-600' },
            { id: 'top-position', title: 'Top Position (Hrs)', icon: <Briefcase size={16} />, value: topPos ? formatHours(topPos[1]) : '0:00', entity: topPos ? topPos[0] : undefined, context: 'Most active position', highlight: 'neutral', gradient: 'bg-gradient-to-r from-teal-400 to-cyan-600' },
            { id: 'cost-split', title: 'Hourly vs Global', icon: <CreditCard size={16} />, value: `${hourlyPct.toFixed(0)}% / ${(100 - hourlyPct).toFixed(0)}%`, context: `${formatCurrency(totals.hourlyCost, settings.currency)} hourly · ${formatCurrency(totals.globalCost, settings.currency)} global`, highlight: 'neutral', gradient: 'bg-gradient-to-r from-blue-400 to-emerald-500' },
            { id: 'most-positions', title: 'Most Positions', icon: <UsersIcon size={16} />, value: `${mostPos.positions.length}`, entity: mostPos.teacherName, entityColor: mostPos.teacherColor, context: mostPos.positions.map(p => p.positionName).join(', '), highlight: 'neutral', gradient: 'bg-gradient-to-r from-pink-400 to-rose-600' },
            { id: 'active-teachers', title: 'Active Teachers', icon: <Activity size={16} />, value: `${activeCount}`, context: `Out of ${teachers.length} total`, highlight: 'neutral', gradient: 'bg-gradient-to-r from-sky-400 to-blue-600' },
        ];
    }, [reportData, totals, teachers]);

    // Filter pills
    const activeFilterPills: { label: string; color: string; onRemove: () => void }[] = [];
    selectedTeacherIds.forEach(id => { const t = teachers.find(t => t.id === id); if (t) activeFilterPills.push({ label: t.fullName, color: 'blue', onRemove: () => toggleInSet(selectedTeacherIds, setSelectedTeacherIds, id) }); });
    selectedPositionNames.forEach(pn => activeFilterPills.push({ label: pn, color: 'emerald', onRemove: () => toggleInSet(selectedPositionNames, setSelectedPositionNames, pn) }));
    selectedTags.forEach(tag => activeFilterPills.push({ label: `#${tag}`, color: 'amber', onRemove: () => toggleInSet(selectedTags, setSelectedTags, tag) }));
    selectedCategories.forEach(cat => activeFilterPills.push({ label: cat, color: 'violet', onRemove: () => toggleInSet(selectedCategories, setSelectedCategories, cat) }));
    selectedRateTypes.forEach(rt => activeFilterPills.push({ label: rt === 'HOURLY' ? '⏱ Hourly' : '📅 Global Monthly', color: 'rose', onRemove: () => toggleInSet(selectedRateTypes, setSelectedRateTypes, rt) }));

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
                        <button onClick={onMobileMenuOpen} className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden" title="Open Menu">
                            <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                        </button>
                        <button onClick={onNavigateBack} className="p-2 -ml-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Back to Dashboard">
                            <ArrowLeft size={20} className="text-slate-500 dark:text-slate-400" />
                        </button>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <LineChartIcon size={24} className="text-blue-500" />Financial Analysis
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">Insights, charts, comparisons, and deep data exploration.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg flex items-center px-2 py-1.5 shadow-sm">
                            <CalIcon size={16} className="text-slate-400 mr-2" />
                            <select className="bg-transparent outline-none text-sm font-medium text-slate-700 dark:text-white" value={dateFilterType} onChange={e => setDateFilterType(e.target.value as DateFilterType)}>
                                <option value="WEEK">Current Week</option><option value="MONTH">Current Month</option><option value="CUSTOM">Custom Range</option><option value="ALL">All Time</option>
                            </select>
                        </div>
                        {dateFilterType === 'CUSTOM' && (
                            <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-1.5 shadow-sm">
                                <input type="date" className="bg-transparent text-xs outline-none dark:text-white" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                                <span className="text-slate-400">-</span>
                                <input type="date" className="bg-transparent text-xs outline-none dark:text-white" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                            </div>
                        )}
                        <button onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                            className={`border rounded-lg flex items-center px-3 py-2 shadow-sm text-sm transition-colors ${isFilterPanelOpen || activeFilterCount > 0 ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-white'}`}>
                            <SlidersHorizontal size={16} className="mr-2" />Filters
                            {activeFilterCount > 0 && <span className="ml-1.5 bg-white/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>}
                            <ChevronDown size={14} className={`ml-1 transition-transform ${isFilterPanelOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Filter Panel */}
                {isFilterPanelOpen && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg mb-6 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2"><Filter size={14} /> Advanced Filters</h3>
                            <div className="flex items-center gap-2">
                                {activeFilterCount > 0 && <button onClick={clearAllFilters} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear All</button>}
                                <button onClick={() => setIsFilterPanelOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <FilterSection title="Teachers" icon={<User size={12} />} items={teachers.map(t => t.id)} selected={selectedTeacherIds}
                                onToggle={id => toggleInSet(selectedTeacherIds, setSelectedTeacherIds, id)} colorDot={id => teacherColorMap[id]} displayLabel={id => teachers.find(t => t.id === id)?.fullName || id} accentColor="blue" />
                            <FilterSection title="Positions" icon={<Briefcase size={12} />} items={allPositionNames} selected={selectedPositionNames}
                                onToggle={pn => toggleInSet(selectedPositionNames, setSelectedPositionNames, pn)} accentColor="emerald" />
                            <FilterSection title="Tags" icon={<Tag size={12} />} items={allTags} selected={selectedTags}
                                onToggle={tag => toggleInSet(selectedTags, setSelectedTags, tag)} accentColor="amber" />
                            <FilterSection title="Categories" icon={<CalendarDays size={12} />} items={allCategories} selected={selectedCategories}
                                onToggle={cat => toggleInSet(selectedCategories, setSelectedCategories, cat)} accentColor="violet" />
                            <FilterSection title="Rate Type" icon={<ToggleLeft size={12} />} items={['HOURLY', 'GLOBAL_MONTHLY']} selected={selectedRateTypes}
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
                        <button onClick={clearAllFilters} className="text-[11px] text-slate-400 hover:text-red-500 px-2 py-0.5 flex items-center gap-0.5"><X size={10} /> Clear all</button>
                    </div>
                )}

                {/* ═══════════════════════════════════════ */}
                {/* 1. INSIGHTS SECTION (top of page)       */}
                {/* ═══════════════════════════════════════ */}
                {insightTiles.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Zap size={18} className="text-amber-500" /> Key Insights
                                <span className="text-xs font-normal bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{insightTiles.length}</span>
                            </h3>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1"><Activity size={10} /> Updated {lastUpdated.toLocaleTimeString()}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {insightTiles.map(tile => <InsightCard key={tile.id} tile={tile} />)}
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════ */}
                {/* 2. "NEW CHART" BUTTON                   */}
                {/* ═══════════════════════════════════════ */}
                <div className="mb-6 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <BarChart3 size={18} className="text-blue-500" /> Charts
                        {savedCharts.length > 0 && <span className="text-xs font-normal bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{savedCharts.length}</span>}
                    </h3>
                    <button onClick={handleNewChart}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors shadow-sm">
                        <Plus size={16} /> New Chart
                    </button>
                </div>

                {/* ═══════════════════════════════════════ */}
                {/* 3. EXISTING CHARTS SECTION              */}
                {/* ═══════════════════════════════════════ */}
                {savedCharts.length === 0 ? (
                    <div onClick={handleNewChart}
                        className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all group mb-8">
                        <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">📊</div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Create your first custom chart</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Group data by any dimension, pick metrics, and choose a visualization</p>
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
                                        <button onClick={() => handleEditChart(chart)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Edit"><Pencil size={12} className="text-slate-400 hover:text-blue-500" /></button>
                                        <button onClick={() => handleDuplicateChart(chart)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Duplicate"><Copy size={12} className="text-slate-400 hover:text-emerald-500" /></button>
                                        <button onClick={() => setDeletingChartId(chart.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete"><Trash2 size={12} className="text-slate-400 hover:text-red-500" /></button>
                                    </div>
                                </div>
                                {/* Body */}
                                <div className="p-4"><ChartRenderer config={chart} events={filteredEvents} teachers={teachers} height={280} currencySymbol={settings.currency} /></div>
                                {/* Footer */}
                                <div className="px-4 py-2 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                                    <span>{chart.dimension} × {chart.metrics.length} metric{chart.metrics.length > 1 ? 's' : ''} → {chart.visualization}</span>
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
                />

                {/* Delete Confirmation Modal */}
                {deletingChart && (
                    <DeleteConfirmModal
                        chartTitle={deletingChart.title}
                        onConfirm={() => handleDeleteChart(deletingChartId!)}
                        onCancel={() => setDeletingChartId(null)}
                    />
                )}
            </div>
        </div>
    );
};
