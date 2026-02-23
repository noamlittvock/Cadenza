import React, { useState, useMemo } from 'react';
import { CalendarEvent, Teacher, AppSettings } from '../types';
import { ChartConfiguration } from '../types/chartBuilder';
import { formatHours, formatCurrency } from '../utils/formatters';
import {
  Download, Filter, Calendar as CalIcon, ChevronDown, ChevronUp, Menu, Clock, CalendarDays,
  DollarSign, TrendingUp, X, SlidersHorizontal, Tag, User, Briefcase, ToggleLeft,
  ArrowRight, BarChart3, ArrowUpDown, Mail
} from 'lucide-react';

interface Props {
  events: CalendarEvent[];
  teachers: Teacher[];
  settings: AppSettings;
  savedCharts: ChartConfiguration[];
  setSavedCharts: React.Dispatch<React.SetStateAction<ChartConfiguration[]>>;
  onMobileMenuOpen: () => void;
}

type DateFilterType = 'WEEK' | 'MONTH' | 'CUSTOM' | 'ALL';

// ---- Financial data structures ----

interface PositionFinancials {
  positionId: string;
  positionName: string;
  rateType: 'HOURLY' | 'GLOBAL_MONTHLY';
  rateValue: number;
  category: string;
  activeHours: number;
  canceledHours: number;
  totalHours: number;
  hourlyCost: number;
  oneOffCost: number;
  globalCost: number;
}

interface TeacherReport {
  teacherId: string;
  teacherName: string;
  teacherColor: string;
  positions: PositionFinancials[];
  totalActiveHours: number;
  totalCanceledHours: number;
  totalHours: number;
  hourlyCostTotal: number;
  oneOffCostTotal: number;
  globalCostTotal: number;
  grandTotal: number;
  canceledEventCount: number;
  activeEventCount: number;
}

// ---- Reusable filter section ----

interface FilterSectionProps {
  title: string;
  icon: React.ReactNode;
  items: string[];
  selected: Set<string>;
  onToggle: (item: string) => void;
  colorDot?: (item: string) => string | undefined;
  displayLabel?: (item: string) => string;
  accentColor: string;
}

const FilterSection: React.FC<FilterSectionProps> = ({ title, icon, items, selected, onToggle, colorDot, displayLabel, accentColor }) => {
  const getLabel = (item: string) => displayLabel ? displayLabel(item) : item;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`text-${accentColor}-500`}>{icon}</span>
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">{title}</h4>
        {selected.size > 0 && (
          <span className={`text-[9px] font-bold px-1 rounded bg-${accentColor}-100 dark:bg-${accentColor}-900/30 text-${accentColor}-600`}>{selected.size}</span>
        )}
      </div>
      <div className="space-y-0.5 max-h-32 overflow-y-auto custom-scrollbar">
        {items.map(item => (
          <button
            key={item}
            onClick={() => onToggle(item)}
            className={`w-full text-left text-[11px] px-2 py-1 rounded flex items-center gap-1.5 transition-colors ${selected.has(item) ? `bg-${accentColor}-50 dark:bg-${accentColor}-900/20 text-${accentColor}-700 dark:text-${accentColor}-300` : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
          >
            {colorDot && (
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorDot(item) || '#94a3b8' }} />
            )}
            <span className="truncate">{getLabel(item)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// Sort column type
type SortColumn = 'name' | 'activeHrs' | 'canceledHrs' | 'canceledEvents' | 'totalHrs' | 'hourlyCost' | 'oneOffCost' | 'globalCost' | 'total';

// ---- Main Component ----

export const FinancialDashboard: React.FC<Props> = ({ events, teachers, settings, savedCharts, setSavedCharts, onMobileMenuOpen }) => {
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('MONTH');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Advanced filters
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());
  const [selectedPositionNames, setSelectedPositionNames] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedRateTypes, setSelectedRateTypes] = useState<Set<string>>(new Set());

  // Table sort
  const [sortCol, setSortCol] = useState<SortColumn>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Email sending
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Expanded rows in table
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());

  // Mobile Check
  const [isMobile, setIsMobile] = useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // --- Compute filter option lists ---
  const allPositionNames = useMemo(() => {
    const names = new Set<string>();
    teachers.forEach(t => t.positionAssignments?.forEach(pa => names.add(pa.positionName)));
    return Array.from(names).sort();
  }, [teachers]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    teachers.forEach(t => t.tags?.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [teachers]);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    teachers.forEach(t => t.positionAssignments?.forEach(pa => cats.add(pa.category)));
    return Array.from(cats).sort();
  }, [teachers]);

  const teacherColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    teachers.forEach(t => { map[t.id] = t.color; });
    return map;
  }, [teachers]);

  const activeFilterCount = selectedTeacherIds.size + selectedPositionNames.size + selectedTags.size + selectedCategories.size + selectedRateTypes.size;

  const toggleInSet = (set: Set<string>, setFn: React.Dispatch<React.SetStateAction<Set<string>>>, item: string) => {
    const newSet = new Set(set);
    if (newSet.has(item)) newSet.delete(item);
    else newSet.add(item);
    setFn(newSet);
  };

  const clearAllFilters = () => {
    setSelectedTeacherIds(new Set());
    setSelectedPositionNames(new Set());
    setSelectedTags(new Set());
    setSelectedCategories(new Set());
    setSelectedRateTypes(new Set());
  };

  // --- Date range ---
  const dateRange = useMemo(() => {
    const now = new Date();
    let startLimit: Date | null = null;
    let endLimit: Date | null = null;
    if (dateFilterType === 'WEEK') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startLimit = new Date(now.getFullYear(), now.getMonth(), diff);
      startLimit.setHours(0, 0, 0, 0);
      endLimit = new Date(startLimit);
      endLimit.setDate(endLimit.getDate() + 7);
    } else if (dateFilterType === 'MONTH') {
      startLimit = new Date(now.getFullYear(), now.getMonth(), 1);
      endLimit = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endLimit.setHours(23, 59, 59, 999);
    } else if (dateFilterType === 'CUSTOM') {
      if (customStartDate) startLimit = new Date(customStartDate);
      if (customEndDate) { endLimit = new Date(customEndDate); endLimit.setHours(23, 59, 59, 999); }
    }
    return { startLimit, endLimit };
  }, [dateFilterType, customStartDate, customEndDate]);

  const monthsInRange = useMemo(() => {
    const { startLimit, endLimit } = dateRange;
    if (!startLimit || !endLimit) return 1;
    const startMonth = startLimit.getFullYear() * 12 + startLimit.getMonth();
    const endMonth = endLimit.getFullYear() * 12 + endLimit.getMonth();
    return Math.max(1, endMonth - startMonth + 1);
  }, [dateRange]);

  // --- Which teachers pass the advanced filters? ---
  const filteredTeacherIds = useMemo(() => {
    let pool = teachers;
    if (selectedTeacherIds.size > 0) pool = pool.filter(t => selectedTeacherIds.has(t.id));
    if (selectedTags.size > 0) pool = pool.filter(t => t.tags?.some(tag => selectedTags.has(tag)));
    if (selectedPositionNames.size > 0) pool = pool.filter(t => t.positionAssignments?.some(pa => selectedPositionNames.has(pa.positionName)));
    if (selectedCategories.size > 0) pool = pool.filter(t => t.positionAssignments?.some(pa => selectedCategories.has(pa.category)));
    if (selectedRateTypes.size > 0) pool = pool.filter(t => t.positionAssignments?.some(pa => selectedRateTypes.has(pa.rateType)));
    return new Set(pool.map(t => t.id));
  }, [teachers, selectedTeacherIds, selectedTags, selectedPositionNames, selectedCategories, selectedRateTypes]);

  // --- Filtering Logic ---
  const filteredEvents = useMemo(() => {
    let filtered = events.filter(e => !e.isHidden);
    if (activeFilterCount > 0) filtered = filtered.filter(e => filteredTeacherIds.has(e.teacherId));
    if (selectedPositionNames.size > 0) {
      filtered = filtered.filter(e => {
        const teacher = teachers.find(t => t.id === e.teacherId);
        if (!teacher) return false;
        if (e.positionId) {
          const pa = teacher.positionAssignments.find(p => p.id === e.positionId);
          return pa ? selectedPositionNames.has(pa.positionName) : false;
        }
        return teacher.positionAssignments.some(pa => selectedPositionNames.has(pa.positionName));
      });
    }
    const { startLimit, endLimit } = dateRange;
    if (startLimit) filtered = filtered.filter(e => new Date(e.start) >= startLimit!);
    if (endLimit) filtered = filtered.filter(e => new Date(e.end) <= endLimit!);
    return filtered;
  }, [events, dateRange, filteredTeacherIds, activeFilterCount, selectedPositionNames, teachers]);

  // --- Aggregation Logic ---
  const reportData: TeacherReport[] = useMemo(() => {
    const visibleTeachers = activeFilterCount > 0 ? teachers.filter(t => filteredTeacherIds.has(t.id)) : teachers;

    const reports: TeacherReport[] = visibleTeachers.map(teacher => {
      const posFinancials: Record<string, PositionFinancials> = {};
      teacher.positionAssignments.forEach(pa => {
        if (selectedPositionNames.size > 0 && !selectedPositionNames.has(pa.positionName)) return;
        if (selectedCategories.size > 0 && !selectedCategories.has(pa.category)) return;
        if (selectedRateTypes.size > 0 && !selectedRateTypes.has(pa.rateType)) return;
        posFinancials[pa.id] = {
          positionId: pa.id, positionName: pa.positionName, rateType: pa.rateType,
          rateValue: pa.rateValue, category: pa.category, activeHours: 0,
          canceledHours: 0, totalHours: 0, hourlyCost: 0, oneOffCost: 0, globalCost: 0,
        };
      });

      let unassignedActive = 0, unassignedCanceled = 0;
      let canceledEventCount = 0, activeEventCount = 0;
      const teacherEvents = filteredEvents.filter(e => e.teacherId === teacher.id);
      teacherEvents.forEach(evt => {
        const durationHours = (new Date(evt.end).getTime() - new Date(evt.start).getTime()) / (1000 * 60 * 60);
        if (evt.isCanceled) canceledEventCount++; else activeEventCount++;

        let targetPosId = evt.positionId;

        // Handle general category events with no position (do not drop them, group under category)
        if (!targetPosId && evt.classification) {
          const syntheticId = `cat_${evt.classification}`;
          if (!posFinancials[syntheticId]) {
            posFinancials[syntheticId] = {
              positionId: syntheticId, positionName: evt.classification, rateType: 'HOURLY',
              rateValue: 0, category: evt.classification, activeHours: 0,
              canceledHours: 0, totalHours: 0, hourlyCost: 0, oneOffCost: 0, globalCost: 0,
            };
          }
          targetPosId = syntheticId;
        }

        if (!targetPosId || !posFinancials[targetPosId]) {
          const firstKey = Object.keys(posFinancials)[0];
          if (firstKey) { targetPosId = firstKey; }
          else { if (evt.isCanceled) unassignedCanceled += durationHours; else unassignedActive += durationHours; return; }
        }

        const pf = posFinancials[targetPosId!];
        if (!pf) return;

        pf.totalHours += durationHours;
        if (evt.isCanceled) pf.canceledHours += durationHours; else pf.activeHours += durationHours;

        // Calculate pay for this event
        const isNoPayment = evt.overrideFlags?.paymentMethod === 'NONE';
        const isOneOff = evt.overrideFlags?.paymentMethod === 'ONE_OFF' || evt.overrideFlags?.isOneOffPayment || evt.pricingSnapshot?.rateType === 'ONE_OFF';

        let eventPay = 0;
        if (isNoPayment) {
          eventPay = 0;
        } else if (isOneOff && evt.pricingSnapshot) {
          eventPay = evt.pricingSnapshot.rateValue;
        } else if (pf.rateType === 'HOURLY') {
          eventPay = durationHours * pf.rateValue;
        }

        if (!evt.isCanceled || evt.cancellationPayStatus === 'PAID_CANCELLATION') {
          if (isOneOff) {
            pf.oneOffCost += eventPay;
          } else {
            pf.hourlyCost += eventPay;
          }
        }
      });

      Object.values(posFinancials).forEach(pf => {
        if (pf.rateType === 'GLOBAL_MONTHLY') {
          if (pf.totalHours > 0 || activeFilterCount > 0) {
            pf.globalCost = pf.rateValue * monthsInRange;
          }
        }
      });

      const positionsArr = Object.values(posFinancials);
      const totalActiveHours = positionsArr.reduce((s, p) => s + p.activeHours, 0) + unassignedActive;
      const totalCanceledHours = positionsArr.reduce((s, p) => s + p.canceledHours, 0) + unassignedCanceled;
      const hourlyCostTotal = positionsArr.reduce((s, p) => s + p.hourlyCost, 0);
      const oneOffCostTotal = positionsArr.reduce((s, p) => s + p.oneOffCost, 0);
      const globalCostTotal = positionsArr.reduce((s, p) => s + p.globalCost, 0);

      return {
        teacherId: teacher.id, teacherName: teacher.fullName, teacherColor: teacher.color,
        positions: positionsArr, totalActiveHours, totalCanceledHours,
        totalHours: totalActiveHours + totalCanceledHours,
        hourlyCostTotal, oneOffCostTotal, globalCostTotal, grandTotal: hourlyCostTotal + oneOffCostTotal + globalCostTotal,
        canceledEventCount, activeEventCount,
      };
    });
    return reports.filter(r => r.totalHours > 0 || r.grandTotal > 0 || activeFilterCount > 0);
  }, [filteredEvents, teachers, filteredTeacherIds, activeFilterCount, selectedPositionNames, selectedCategories, selectedRateTypes, monthsInRange]);

  // --- Totals ---
  const totals = useMemo(() => {
    const totalHours = reportData.reduce((s, r) => s + r.totalHours, 0);
    const activeHours = reportData.reduce((s, r) => s + r.totalActiveHours, 0);
    const canceledHours = reportData.reduce((s, r) => s + r.totalCanceledHours, 0);
    const hourlyCost = reportData.reduce((s, r) => s + r.hourlyCostTotal, 0);
    const oneOffCost = reportData.reduce((s, r) => s + r.oneOffCostTotal, 0);
    const globalCost = reportData.reduce((s, r) => s + r.globalCostTotal, 0);
    const grandTotal = hourlyCost + oneOffCost + globalCost;
    const canceledEvents = reportData.reduce((s, r) => s + r.canceledEventCount, 0);
    const activeEvents = reportData.reduce((s, r) => s + r.activeEventCount, 0);
    return { totalHours, activeHours, canceledHours, hourlyCost, oneOffCost, globalCost, grandTotal, canceledEvents, activeEvents };
  }, [reportData]);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // --- Sorting ---
  const sortedReportData = useMemo(() => {
    const sorted = [...reportData];
    sorted.sort((a, b) => {
      let aVal: number | string, bVal: number | string;
      switch (sortCol) {
        case 'name': aVal = a.teacherName; bVal = b.teacherName; break;
        case 'activeHrs': aVal = a.totalActiveHours; bVal = b.totalActiveHours; break;
        case 'canceledHrs': aVal = a.totalCanceledHours; bVal = b.totalCanceledHours; break;
        case 'canceledEvents': aVal = a.canceledEventCount; bVal = b.canceledEventCount; break;
        case 'totalHrs': aVal = a.totalHours; bVal = b.totalHours; break;
        case 'hourlyCost': aVal = a.hourlyCostTotal; bVal = b.hourlyCostTotal; break;
        case 'oneOffCost': aVal = a.oneOffCostTotal; bVal = b.oneOffCostTotal; break;
        case 'globalCost': aVal = a.globalCostTotal; bVal = b.globalCostTotal; break;
        case 'total': aVal = a.grandTotal; bVal = b.grandTotal; break;
        default: aVal = a.grandTotal; bVal = b.grandTotal;
      }
      const cmp = typeof aVal === 'string' ? (aVal as string).localeCompare(bVal as string) : (aVal as number) - (bVal as number);
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [reportData, sortCol, sortDir]);

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon: React.FC<{ col: SortColumn }> = ({ col }) => {
    if (sortCol !== col) return <ArrowUpDown size={10} className="text-slate-400 dark:text-slate-500 ml-0.5 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp size={10} className="text-blue-500 dark:text-blue-400 ml-0.5 inline" />
      : <ChevronDown size={10} className="text-blue-500 dark:text-blue-400 ml-0.5 inline" />;
  };

  const toggleExpandTeacher = (id: string) => {
    const newSet = new Set(expandedTeachers);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setExpandedTeachers(newSet);
  };

  // --- Export ---
  const handleExport = () => {
    const headers = ['Teacher', 'Position', 'Rate Type', `Rate (${settings.currency})`, 'Active Hours', 'Canceled Hours', `Hourly Cost (${settings.currency})`, `One-Off Payments (${settings.currency})`, `Global Cost (${settings.currency})`, `Total Cost (${settings.currency})`];
    const rows: string[][] = [];
    reportData.forEach(r => {
      if (r.positions.length === 0) {
        rows.push([`"${r.teacherName}"`, '—', '—', '0', formatHours(r.totalActiveHours), formatHours(r.totalCanceledHours), '0', '0', '0', '0']);
      } else {
        r.positions.forEach(p => {
          rows.push([
            `"${r.teacherName}"`, `"${p.positionName}"`, p.rateType, p.rateValue.toString(),
            formatHours(p.activeHours), formatHours(p.canceledHours),
            p.hourlyCost.toFixed(2), p.oneOffCost.toFixed(2), p.globalCost.toFixed(2), (p.hourlyCost + p.oneOffCost + p.globalCost).toFixed(2),
          ]);
        });
      }
    });
    rows.push(['', '', '', '', '', '', totals.hourlyCost.toFixed(2), totals.oneOffCost.toFixed(2), totals.globalCost.toFixed(2), totals.grandTotal.toFixed(2)]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `payroll_export_${dateFilterType.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Active filter pills ---
  const activeFilterPills: { label: string; color: string; onRemove: () => void }[] = [];
  selectedTeacherIds.forEach(id => {
    const t = teachers.find(t => t.id === id);
    if (t) activeFilterPills.push({ label: t.fullName, color: 'blue', onRemove: () => toggleInSet(selectedTeacherIds, setSelectedTeacherIds, id) });
  });
  selectedPositionNames.forEach(pn => activeFilterPills.push({ label: pn, color: 'emerald', onRemove: () => toggleInSet(selectedPositionNames, setSelectedPositionNames, pn as string) }));
  selectedTags.forEach(tag => activeFilterPills.push({ label: `#${tag}`, color: 'amber', onRemove: () => toggleInSet(selectedTags, setSelectedTags, tag as string) }));
  selectedCategories.forEach(cat => activeFilterPills.push({ label: cat, color: 'violet', onRemove: () => toggleInSet(selectedCategories, setSelectedCategories, cat as string) }));
  selectedRateTypes.forEach(rt => activeFilterPills.push({ label: rt === 'HOURLY' ? '⏱ Hourly' : '📅 Global Monthly', color: 'rose', onRemove: () => toggleInSet(selectedRateTypes, setSelectedRateTypes, rt as string) }));

  const pillColorClasses: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  };

  return (
    <div className="h-full overflow-y-auto p-8 pb-20 custom-scrollbar">
      <div className="max-w-7xl mx-auto min-h-screen">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onMobileMenuOpen} className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden" title="Open Menu">
              <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Financial Dashboard</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Payroll overview — teacher metrics and cost breakdown.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {/* Date Filter */}
            <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg flex items-center px-2 py-1.5 shadow-sm">
              <CalIcon size={16} className="text-slate-400 mr-2" />
              <select className="bg-transparent outline-none text-sm font-medium text-slate-700 dark:text-white" value={dateFilterType} onChange={(e) => setDateFilterType(e.target.value as DateFilterType)}>
                <option value="WEEK">Current Week</option>
                <option value="MONTH">Current Month</option>
                <option value="CUSTOM">Custom Range</option>
                <option value="ALL">All Time</option>
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

            <button onClick={handleExport} className="hidden md:flex bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg items-center shadow-sm text-sm">
              <Download size={16} className="mr-2" /> Export
            </button>
            <button onClick={() => { setIsEmailModalOpen(true); setEmailSuccess(false); }} className="hidden md:flex bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg items-center shadow-sm text-sm">
              <Mail size={16} className="mr-2" /> Email Report
            </button>
          </div>
        </div>

        {/* Advanced Filter Panel */}
        {isFilterPanelOpen && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg mb-6 p-5 animate-in slide-in-from-top">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2"><Filter size={14} /> Advanced Filters</h3>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && <button onClick={clearAllFilters} className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">Clear All</button>}
                <button onClick={() => setIsFilterPanelOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={16} /></button>
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

        {/* Active Filter Pills */}
        {activeFilterPills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {activeFilterPills.map((pill, idx) => (
              <span key={idx} className={`text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${pillColorClasses[pill.color] || pillColorClasses.blue}`}>
                {pill.label}
                <button onClick={pill.onRemove} className="hover:opacity-60"><X size={10} /></button>
              </span>
            ))}
            <button onClick={clearAllFilters} className="text-[11px] text-slate-400 hover:text-red-500 px-2 py-0.5 flex items-center gap-0.5">
              <X size={10} /> Clear all
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-xl shadow-lg text-white">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="opacity-80" />
              <h3 className="text-xs font-semibold uppercase tracking-wider opacity-80">Grand Total</h3>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totals.grandTotal, settings.currency)}</p>
            <p className="text-xs opacity-70 mt-1">{monthsInRange} month{monthsInRange > 1 ? 's' : ''}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-blue-500" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Hourly Fees</h3>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totals.hourlyCost, settings.currency)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={14} className="text-emerald-500" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Global Monthly</h3>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totals.globalCost, settings.currency)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-blue-500" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Hours</h3>
            </div>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatHours(totals.activeHours)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <X size={14} className="text-red-500" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Canceled</h3>
            </div>
            <p className="text-xl font-bold text-red-500">{formatHours(totals.canceledHours)}</p>
          </div>
        </div>

        {reportData.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center border border-dashed border-slate-300 dark:border-slate-800 text-slate-500">
            No data matches current filters.
          </div>
        ) : (
          <>
            {/* ── Teacher Metrics Table ── */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">Teacher Metrics</h3>
                <span className="text-[10px] text-slate-400">{sortedReportData.length} teacher{sortedReportData.length !== 1 ? 's' : ''} · Click headers to sort</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-medium">
                    <tr>
                      <th className="px-4 py-3 w-8"></th>
                      <th className="px-4 py-3 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors select-none" onClick={() => handleSort('name')}>
                        Teacher <SortIcon col="name" />
                      </th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors select-none" onClick={() => handleSort('activeHrs')}>
                        Active Hrs <SortIcon col="activeHrs" />
                      </th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors select-none" onClick={() => handleSort('canceledHrs')}>
                        Canc. Hrs <SortIcon col="canceledHrs" />
                      </th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors select-none" onClick={() => handleSort('canceledEvents')}>
                        Canc. Events <SortIcon col="canceledEvents" />
                      </th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors select-none" onClick={() => handleSort('hourlyCost')}>
                        <span className="flex items-center justify-end gap-1"><Clock size={11} /> Hourly ({settings.currency})</span> <SortIcon col="hourlyCost" />
                      </th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors select-none" onClick={() => handleSort('oneOffCost')}>
                        <span className="flex items-center justify-end gap-1"><DollarSign size={11} /> One-Off ({settings.currency})</span> <SortIcon col="oneOffCost" />
                      </th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors select-none" onClick={() => handleSort('globalCost')}>
                        <span className="flex items-center justify-end gap-1"><CalendarDays size={11} /> Global ({settings.currency})</span> <SortIcon col="globalCost" />
                      </th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors select-none font-bold" onClick={() => handleSort('total')}>
                        Total ({settings.currency}) <SortIcon col="total" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sortedReportData.map(r => (
                      <React.Fragment key={r.teacherId}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors" onClick={() => toggleExpandTeacher(r.teacherId)}>
                          <td className="px-4 py-4">
                            <ChevronDown size={14} className={`text-slate-400 dark:text-slate-500 transition-transform ${expandedTeachers.has(r.teacherId) ? 'rotate-180' : ''}`} />
                          </td>
                          <td className="px-4 py-4 font-medium text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.teacherColor }} />
                              {r.teacherName}
                              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{r.positions.length} pos</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-medium text-blue-600 dark:text-blue-400 tabular-nums">{formatHours(r.totalActiveHours)}</td>
                          <td className="px-4 py-4 text-right text-red-500 tabular-nums">{formatHours(r.totalCanceledHours)}</td>
                          <td className="px-4 py-4 text-right text-red-500 tabular-nums">{r.canceledEventCount}</td>
                          <td className="px-4 py-4 text-right text-blue-600 dark:text-blue-400 font-medium tabular-nums">{formatCurrency(r.hourlyCostTotal, settings.currency)}</td>
                          <td className="px-4 py-4 text-right text-violet-600 dark:text-violet-400 font-medium tabular-nums">{formatCurrency(r.oneOffCostTotal, settings.currency)}</td>
                          <td className="px-4 py-4 text-right text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{formatCurrency(r.globalCostTotal, settings.currency)}</td>
                          <td className="px-4 py-4 text-right font-bold text-slate-900 dark:text-white tabular-nums">{formatCurrency(r.grandTotal, settings.currency)}</td>
                        </tr>
                        {expandedTeachers.has(r.teacherId) && r.positions.map(p => (
                          <tr key={p.positionId} className="bg-slate-50/50 dark:bg-slate-800/30">
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                              <div className="flex items-center gap-2 pl-4">
                                <span className="text-xs font-medium">{p.positionName}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${p.rateType === 'HOURLY'
                                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                  : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  }`}>
                                  {p.rateType === 'HOURLY' ? `${settings.currency}${p.rateValue}/hr` : `${formatCurrency(p.rateValue, settings.currency)}/mo`}
                                </span>
                                <span className="text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{p.category}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums">{formatHours(p.activeHours)}</td>
                            <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums">{formatHours(p.canceledHours)}</td>
                            <td className="px-4 py-3 text-right text-xs text-slate-400">—</td>
                            <td className="px-4 py-3 text-right text-xs text-blue-500 tabular-nums">{p.hourlyCost > 0 ? formatCurrency(p.hourlyCost, settings.currency) : '—'}</td>
                            <td className="px-4 py-3 text-right text-xs text-violet-500 tabular-nums">{p.oneOffCost > 0 ? formatCurrency(p.oneOffCost, settings.currency) : '—'}</td>
                            <td className="px-4 py-3 text-right text-xs text-emerald-500 tabular-nums">{p.globalCost > 0 ? formatCurrency(p.globalCost, settings.currency) : '—'}</td>
                            <td className="px-4 py-3 text-right text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">{formatCurrency(p.hourlyCost + p.oneOffCost + p.globalCost, settings.currency)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                    {/* Totals Row */}
                    <tr className="bg-slate-100 dark:bg-slate-950 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                      <td className="px-4 py-4"></td>
                      <td className="px-4 py-4 text-slate-800 dark:text-white">Grand Total</td>
                      <td className="px-4 py-4 text-right text-blue-600 dark:text-blue-400 tabular-nums">{formatHours(totals.activeHours)}</td>
                      <td className="px-4 py-4 text-right text-red-500 tabular-nums">{formatHours(totals.canceledHours)}</td>
                      <td className="px-4 py-4 text-right text-red-500 tabular-nums">{totals.canceledEvents}</td>
                      <td className="px-4 py-4 text-right text-blue-600 dark:text-blue-400 tabular-nums">{formatCurrency(totals.hourlyCost, settings.currency)}</td>
                      <td className="px-4 py-4 text-right text-violet-600 dark:text-violet-400 tabular-nums">{formatCurrency(totals.oneOffCost, settings.currency)}</td>
                      <td className="px-4 py-4 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(totals.globalCost, settings.currency)}</td>
                      <td className="px-4 py-4 text-right text-slate-900 dark:text-white text-lg tabular-nums">{formatCurrency(totals.grandTotal, settings.currency)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Email Report Modal */}
        {isEmailModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 rounded-t-xl">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Mail size={20} className="text-blue-500" /> Send Financial Reports</h3>
                  <p className="text-sm text-slate-500 mt-1">Based on current filters, reports will be sent to the following teachers.</p>
                </div>
                <button onClick={() => setIsEmailModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-200/50 dark:bg-slate-800 p-2 rounded-full transition-colors"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/50 dark:bg-slate-900">
                {emailSuccess ? (
                  <div className="flex flex-col items-center justify-center text-center py-12">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Reports Sent Successfully!</h4>
                    <p className="text-slate-500 dark:text-slate-400 max-w-md">Email reports have been generated and dispatched to {reportData.length} recipients.</p>
                  </div>
                ) : reportData.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    No reports match the current filters to send.
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-medium">
                        <tr>
                          <th className="px-4 py-3">Recipient</th>
                          <th className="px-4 py-3">Email Address</th>
                          <th className="px-4 py-3 text-right">Total Payout</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {reportData.map(r => {
                          const teacher = teachers.find(t => t.id === r.teacherId);
                          return (
                            <tr key={r.teacherId}>
                              <td className="px-4 py-3 font-medium text-slate-800 dark:text-white flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: r.teacherColor }}>{r.teacherName.charAt(0)}</div>
                                {r.teacherName}
                              </td>
                              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{teacher?.email || 'No email saved'}</td>
                              <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(r.grandTotal, settings.currency)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {!emailSuccess && (
                <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex justify-between items-center rounded-b-xl">
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    Filter settings applied: <strong className="text-slate-700 dark:text-slate-300">{activeFilterCount} active filters</strong>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setIsEmailModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-lg font-medium text-sm">Cancel</button>
                    <button
                      onClick={() => {
                        setIsSendingEmails(true);
                        setTimeout(() => {
                          setIsSendingEmails(false);
                          setEmailSuccess(true);
                        }, 1500);
                      }}
                      disabled={isSendingEmails || reportData.length === 0}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-sm transition-all flex items-center"
                    >
                      {isSendingEmails ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                          Sending...
                        </>
                      ) : (
                        `Send ${reportData.length} Reports`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
