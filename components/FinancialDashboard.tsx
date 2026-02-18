import React, { useState, useMemo } from 'react';
import { CalendarEvent, Teacher, AppSettings, PositionAssignment } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Filter, Calendar as CalIcon, Check, ChevronDown, Menu, Clock, CalendarDays, DollarSign, TrendingUp, X, SlidersHorizontal, Tag, User, Briefcase, ToggleLeft } from 'lucide-react';

interface Props {
  events: CalendarEvent[];
  teachers: Teacher[];
  settings: AppSettings;
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
  globalCostTotal: number;
  grandTotal: number;
}

// ---- Reusable multi-select chip component ----

interface FilterSectionProps {
  title: string;
  icon: React.ReactNode;
  items: string[];
  selected: Set<string>;
  onToggle: (item: string) => void;
  colorDot?: (item: string) => string | undefined;
  displayLabel?: (item: string) => string;
  accentColor: string; // tailwind color name: 'blue', 'emerald', 'amber', etc.
}

const FilterSection: React.FC<FilterSectionProps> = ({ title, icon, items, selected, onToggle, colorDot, displayLabel, accentColor }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const getLabel = (item: string) => displayLabel ? displayLabel(item) : item;
  const filtered = searchTerm
    ? items.filter(it => getLabel(it).toLowerCase().includes(searchTerm.toLowerCase()))
    : items;

  const accentClasses: Record<string, { bg: string; border: string; check: string; pill: string; pillBorder: string; pillText: string }> = {
    blue: { bg: 'bg-blue-600 border-blue-600', border: 'border-slate-300', check: 'text-white', pill: 'bg-blue-50 dark:bg-blue-900/20', pillBorder: 'border-blue-200 dark:border-blue-800', pillText: 'text-blue-700 dark:text-blue-300' },
    emerald: { bg: 'bg-emerald-600 border-emerald-600', border: 'border-slate-300', check: 'text-white', pill: 'bg-emerald-50 dark:bg-emerald-900/20', pillBorder: 'border-emerald-200 dark:border-emerald-800', pillText: 'text-emerald-700 dark:text-emerald-300' },
    amber: { bg: 'bg-amber-500 border-amber-500', border: 'border-slate-300', check: 'text-white', pill: 'bg-amber-50 dark:bg-amber-900/20', pillBorder: 'border-amber-200 dark:border-amber-800', pillText: 'text-amber-700 dark:text-amber-300' },
    violet: { bg: 'bg-violet-600 border-violet-600', border: 'border-slate-300', check: 'text-white', pill: 'bg-violet-50 dark:bg-violet-900/20', pillBorder: 'border-violet-200 dark:border-violet-800', pillText: 'text-violet-700 dark:text-violet-300' },
    rose: { bg: 'bg-rose-600 border-rose-600', border: 'border-slate-300', check: 'text-white', pill: 'bg-rose-50 dark:bg-rose-900/20', pillBorder: 'border-rose-200 dark:border-rose-800', pillText: 'text-rose-700 dark:text-rose-300' },
  };
  const ac = accentClasses[accentColor] || accentClasses.blue;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {icon}
          {title}
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => items.forEach(it => { if (selected.has(it)) onToggle(it); })}
            className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {items.length > 6 && (
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-2 py-1 mb-1.5 outline-none focus:ring-1 focus:ring-blue-400 text-slate-700 dark:text-white"
        />
      )}
      <div className="max-h-36 overflow-y-auto space-y-0.5 custom-scrollbar">
        {filtered.map(item => (
          <div
            key={item}
            className="flex items-center px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors"
            onClick={() => onToggle(item)}
          >
            <div className={`w-3.5 h-3.5 border rounded mr-2 flex items-center justify-center flex-shrink-0 ${selected.has(item) ? ac.bg : ac.border}`}>
              {selected.has(item) && <Check size={10} className={ac.check} />}
            </div>
            {colorDot && colorDot(item) && (
              <div className="w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0" style={{ backgroundColor: colorDot(item) }} />
            )}
            <span className="text-xs truncate text-slate-700 dark:text-slate-300">{getLabel(item)}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-slate-400 px-2 py-1 italic">No matches</div>
        )}
      </div>
    </div>
  );
};

// ---- Main Component ----

export const FinancialDashboard: React.FC<Props> = ({ events, teachers, settings, onMobileMenuOpen }) => {
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

  // Count active filters
  const activeFilterCount = selectedTeacherIds.size + selectedPositionNames.size + selectedTags.size + selectedCategories.size + selectedRateTypes.size;

  // Toggle helpers
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
      if (customEndDate) {
        endLimit = new Date(customEndDate);
        endLimit.setHours(23, 59, 59, 999);
      }
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

    // Filter by selected teacher IDs
    if (selectedTeacherIds.size > 0) {
      pool = pool.filter(t => selectedTeacherIds.has(t.id));
    }

    // Filter by tags
    if (selectedTags.size > 0) {
      pool = pool.filter(t => t.tags?.some(tag => selectedTags.has(tag)));
    }

    // Filter by position name
    if (selectedPositionNames.size > 0) {
      pool = pool.filter(t => t.positionAssignments?.some(pa => selectedPositionNames.has(pa.positionName)));
    }

    // Filter by category
    if (selectedCategories.size > 0) {
      pool = pool.filter(t => t.positionAssignments?.some(pa => selectedCategories.has(pa.category)));
    }

    // Filter by rate type
    if (selectedRateTypes.size > 0) {
      pool = pool.filter(t => t.positionAssignments?.some(pa => selectedRateTypes.has(pa.rateType)));
    }

    return new Set(pool.map(t => t.id));
  }, [teachers, selectedTeacherIds, selectedTags, selectedPositionNames, selectedCategories, selectedRateTypes]);

  // --- Filtering Logic ---
  const filteredEvents = useMemo(() => {
    let filtered = events.filter(e => !e.isHidden);

    // Filter by advanced-filtered teachers
    if (activeFilterCount > 0) {
      filtered = filtered.filter(e => filteredTeacherIds.has(e.teacherId));
    }

    // Further filter by position name on the event itself
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

    // Filter by date
    const { startLimit, endLimit } = dateRange;
    if (startLimit) filtered = filtered.filter(e => new Date(e.start) >= startLimit!);
    if (endLimit) filtered = filtered.filter(e => new Date(e.end) <= endLimit!);

    return filtered;
  }, [events, dateRange, filteredTeacherIds, activeFilterCount, selectedPositionNames, teachers]);

  // --- Aggregation Logic ---
  const reportData: TeacherReport[] = useMemo(() => {
    const visibleTeachers = activeFilterCount > 0
      ? teachers.filter(t => filteredTeacherIds.has(t.id))
      : teachers;

    const reports: TeacherReport[] = visibleTeachers.map(teacher => {
      const posFinancials: Record<string, PositionFinancials> = {};

      teacher.positionAssignments.forEach(pa => {
        // Filter by position name
        if (selectedPositionNames.size > 0 && !selectedPositionNames.has(pa.positionName)) return;
        // Filter by category
        if (selectedCategories.size > 0 && !selectedCategories.has(pa.category)) return;
        // Filter by rate type
        if (selectedRateTypes.size > 0 && !selectedRateTypes.has(pa.rateType)) return;

        posFinancials[pa.id] = {
          positionId: pa.id,
          positionName: pa.positionName,
          rateType: pa.rateType,
          rateValue: pa.rateValue,
          category: pa.category,
          activeHours: 0,
          canceledHours: 0,
          totalHours: 0,
          hourlyCost: 0,
          globalCost: 0,
        };
      });

      let unassignedActive = 0;
      let unassignedCanceled = 0;

      const teacherEvents = filteredEvents.filter(e => e.teacherId === teacher.id);
      teacherEvents.forEach(evt => {
        const durationHours = (new Date(evt.end).getTime() - new Date(evt.start).getTime()) / (1000 * 60 * 60);
        let targetPosId = evt.positionId;
        if (!targetPosId || !posFinancials[targetPosId]) {
          const firstKey = Object.keys(posFinancials)[0];
          if (firstKey) {
            targetPosId = firstKey;
          } else {
            if (evt.isCanceled) unassignedCanceled += durationHours;
            else unassignedActive += durationHours;
            return;
          }
        }
        const pf = posFinancials[targetPosId];
        if (!pf) return;
        pf.totalHours += durationHours;
        if (evt.isCanceled) {
          pf.canceledHours += durationHours;
        } else {
          pf.activeHours += durationHours;
        }
      });

      Object.values(posFinancials).forEach(pf => {
        if (pf.rateType === 'HOURLY') {
          pf.hourlyCost = pf.activeHours * pf.rateValue;
        } else {
          if (pf.totalHours > 0 || activeFilterCount > 0) {
            pf.globalCost = pf.rateValue * monthsInRange;
          }
        }
      });

      const positionsArr = Object.values(posFinancials);
      const totalActiveHours = positionsArr.reduce((s, p) => s + p.activeHours, 0) + unassignedActive;
      const totalCanceledHours = positionsArr.reduce((s, p) => s + p.canceledHours, 0) + unassignedCanceled;
      const hourlyCostTotal = positionsArr.reduce((s, p) => s + p.hourlyCost, 0);
      const globalCostTotal = positionsArr.reduce((s, p) => s + p.globalCost, 0);

      return {
        teacherId: teacher.id,
        teacherName: teacher.fullName,
        teacherColor: teacher.color,
        positions: positionsArr,
        totalActiveHours,
        totalCanceledHours,
        totalHours: totalActiveHours + totalCanceledHours,
        hourlyCostTotal,
        globalCostTotal,
        grandTotal: hourlyCostTotal + globalCostTotal,
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
    const globalCost = reportData.reduce((s, r) => s + r.globalCostTotal, 0);
    const grandTotal = hourlyCost + globalCost;
    return { totalHours, activeHours, canceledHours, hourlyCost, globalCost, grandTotal };
  }, [reportData]);

  // --- Chart data ---
  const chartData = useMemo(() => {
    return reportData.map(r => ({
      name: r.teacherName.split(' ')[0],
      'Hourly Cost': Math.round(r.hourlyCostTotal),
      'Global Monthly': Math.round(r.globalCostTotal),
      'Active Hours': parseFloat(r.totalActiveHours.toFixed(1)),
      'Canceled Hours': parseFloat(r.totalCanceledHours.toFixed(1)),
    }));
  }, [reportData]);

  const toggleExpandTeacher = (id: string) => {
    const newSet = new Set(expandedTeachers);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedTeachers(newSet);
  };

  // --- Export ---
  const handleExport = () => {
    const headers = ['Teacher', 'Position', 'Rate Type', 'Rate (₪)', 'Active Hours', 'Canceled Hours', 'Hourly Cost (₪)', 'Global Cost (₪)', 'Total Cost (₪)'];
    const rows: string[][] = [];

    reportData.forEach(r => {
      if (r.positions.length === 0) {
        rows.push([`"${r.teacherName}"`, '—', '—', '0', r.totalActiveHours.toFixed(2), r.totalCanceledHours.toFixed(2), '0', '0', '0']);
      } else {
        r.positions.forEach(p => {
          rows.push([
            `"${r.teacherName}"`, `"${p.positionName}"`, p.rateType, p.rateValue.toString(),
            p.activeHours.toFixed(2), p.canceledHours.toFixed(2),
            p.hourlyCost.toFixed(2), p.globalCost.toFixed(2), (p.hourlyCost + p.globalCost).toFixed(2),
          ]);
        });
      }
    });
    rows.push(['', '', '', '', '', '', totals.hourlyCost.toFixed(2), totals.globalCost.toFixed(2), totals.grandTotal.toFixed(2)]);

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

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // --- Build active filter pills for display ---
  const activeFilterPills: { label: string; color: string; onRemove: () => void }[] = [];
  selectedTeacherIds.forEach(id => {
    const t = teachers.find(t => t.id === id);
    if (t) activeFilterPills.push({ label: t.fullName, color: 'blue', onRemove: () => toggleInSet(selectedTeacherIds, setSelectedTeacherIds, id) });
  });
  selectedPositionNames.forEach(pn => {
    activeFilterPills.push({ label: pn, color: 'emerald', onRemove: () => toggleInSet(selectedPositionNames, setSelectedPositionNames, pn as string) });
  });
  selectedTags.forEach(tag => {
    activeFilterPills.push({ label: `#${tag}`, color: 'amber', onRemove: () => toggleInSet(selectedTags, setSelectedTags, tag as string) });
  });
  selectedCategories.forEach(cat => {
    activeFilterPills.push({ label: cat, color: 'violet', onRemove: () => toggleInSet(selectedCategories, setSelectedCategories, cat as string) });
  });
  selectedRateTypes.forEach(rt => {
    activeFilterPills.push({ label: rt === 'HOURLY' ? '⏱ Hourly' : '📅 Global Monthly', color: 'rose', onRemove: () => toggleInSet(selectedRateTypes, setSelectedRateTypes, rt as string) });
  });

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
            <button
              onClick={onMobileMenuOpen}
              className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden"
              title="Open Menu"
            >
              <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Financial Dashboard</h2>
              <p className="text-slate-500 dark:text-slate-400">Payroll analytics with rate-based calculations.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {/* Date Filter */}
            <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg flex items-center px-2 py-1.5 shadow-sm">
              <CalIcon size={16} className="text-slate-400 mr-2" />
              <select
                className="bg-transparent outline-none text-sm font-medium text-slate-700 dark:text-white"
                value={dateFilterType}
                onChange={(e) => setDateFilterType(e.target.value as DateFilterType)}
              >
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

            {/* Advanced Filters Toggle */}
            <button
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`border rounded-lg flex items-center px-3 py-2 shadow-sm text-sm transition-colors ${isFilterPanelOpen || activeFilterCount > 0
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-white'
                }`}
            >
              <SlidersHorizontal size={16} className="mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1.5 bg-white/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown size={14} className={`ml-1 transition-transform ${isFilterPanelOpen ? 'rotate-180' : ''}`} />
            </button>

            <button
              onClick={handleExport}
              className="hidden md:flex bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg items-center shadow-sm text-sm"
            >
              <Download size={16} className="mr-2" /> Export
            </button>
          </div>
        </div>

        {/* Advanced Filter Panel */}
        {isFilterPanelOpen && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg mb-6 p-5 animate-in slide-in-from-top">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Filter size={14} />
                Advanced Filters
              </h3>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => setIsFilterPanelOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Teachers */}
              <FilterSection
                title="Teachers"
                icon={<User size={12} />}
                items={teachers.map(t => t.id)}
                selected={selectedTeacherIds}
                onToggle={(id) => toggleInSet(selectedTeacherIds, setSelectedTeacherIds, id)}
                colorDot={(id) => teacherColorMap[id]}
                displayLabel={(id) => teachers.find(t => t.id === id)?.fullName || id}
                accentColor="blue"
              />

              {/* Positions */}
              <FilterSection
                title="Positions"
                icon={<Briefcase size={12} />}
                items={allPositionNames}
                selected={selectedPositionNames}
                onToggle={(pn) => toggleInSet(selectedPositionNames, setSelectedPositionNames, pn)}
                accentColor="emerald"
              />

              {/* Tags */}
              <FilterSection
                title="Tags"
                icon={<Tag size={12} />}
                items={allTags}
                selected={selectedTags}
                onToggle={(tag) => toggleInSet(selectedTags, setSelectedTags, tag)}
                accentColor="amber"
              />

              {/* Categories */}
              <FilterSection
                title="Categories"
                icon={<CalendarDays size={12} />}
                items={allCategories}
                selected={selectedCategories}
                onToggle={(cat) => toggleInSet(selectedCategories, setSelectedCategories, cat)}
                accentColor="violet"
              />

              {/* Rate Type */}
              <FilterSection
                title="Rate Type"
                icon={<ToggleLeft size={12} />}
                items={['HOURLY', 'GLOBAL_MONTHLY']}
                selected={selectedRateTypes}
                onToggle={(rt) => toggleInSet(selectedRateTypes, setSelectedRateTypes, rt)}
                accentColor="rose"
              />
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

        {reportData.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center border border-dashed border-slate-300 dark:border-slate-800 text-slate-500">
            No data matches current filters.
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-xl shadow-lg text-white">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={16} className="opacity-80" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider opacity-80">Grand Total</h3>
                </div>
                <p className="text-2xl font-bold">₪{fmt(totals.grandTotal)}</p>
                <p className="text-xs opacity-70 mt-1">{monthsInRange} month{monthsInRange > 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-blue-500" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Hourly Fees</h3>
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">₪{fmt(totals.hourlyCost)}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays size={14} className="text-emerald-500" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Global Monthly</h3>
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">₪{fmt(totals.globalCost)}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={14} className="text-blue-500" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Hours</h3>
                </div>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{totals.activeHours.toFixed(1)}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-1">
                  <X size={14} className="text-red-500" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Canceled</h3>
                </div>
                <p className="text-xl font-bold text-red-500">{totals.canceledHours.toFixed(1)}</p>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 h-96">
                <h3 className="font-bold text-slate-800 dark:text-white mb-6">Cost by Teacher (₪)</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={12} stroke="#94a3b8" />
                    <YAxis fontSize={12} stroke="#94a3b8" />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', color: '#fff', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="Hourly Cost" stackId="cost" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Global Monthly" stackId="cost" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 h-96">
                <h3 className="font-bold text-slate-800 dark:text-white mb-6">Hours by Teacher</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={12} stroke="#94a3b8" />
                    <YAxis fontSize={12} stroke="#94a3b8" />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', color: '#fff', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="Active Hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Canceled Hours" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Detailed Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-medium">
                    <tr>
                      <th className="px-6 py-4 w-8"></th>
                      <th className="px-6 py-4">Teacher</th>
                      <th className="px-6 py-4 text-right">Active Hrs</th>
                      <th className="px-6 py-4 text-right">Canceled Hrs</th>
                      <th className="px-6 py-4 text-right">
                        <span className="flex items-center justify-end gap-1"><Clock size={12} /> Hourly (₪)</span>
                      </th>
                      <th className="px-6 py-4 text-right">
                        <span className="flex items-center justify-end gap-1"><CalendarDays size={12} /> Global (₪)</span>
                      </th>
                      <th className="px-6 py-4 text-right font-bold">Total (₪)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {reportData.map((r) => (
                      <React.Fragment key={r.teacherId}>
                        <tr
                          className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                          onClick={() => toggleExpandTeacher(r.teacherId)}
                        >
                          <td className="px-6 py-4">
                            <ChevronDown
                              size={14}
                              className={`text-slate-400 transition-transform ${expandedTeachers.has(r.teacherId) ? 'rotate-180' : ''}`}
                            />
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.teacherColor }} />
                              {r.teacherName}
                              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">
                                {r.positions.length} pos
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-blue-600 dark:text-blue-400">{r.totalActiveHours.toFixed(1)}</td>
                          <td className="px-6 py-4 text-right text-red-500">{r.totalCanceledHours.toFixed(1)}</td>
                          <td className="px-6 py-4 text-right text-blue-600 dark:text-blue-400 font-medium">₪{fmt(r.hourlyCostTotal)}</td>
                          <td className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400 font-medium">₪{fmt(r.globalCostTotal)}</td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">₪{fmt(r.grandTotal)}</td>
                        </tr>

                        {expandedTeachers.has(r.teacherId) && r.positions.map(p => (
                          <tr key={p.positionId} className="bg-slate-50/50 dark:bg-slate-800/30">
                            <td className="px-6 py-3"></td>
                            <td className="px-6 py-3 text-slate-600 dark:text-slate-400">
                              <div className="flex items-center gap-2 pl-4">
                                <span className="text-xs font-medium">{p.positionName}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${p.rateType === 'HOURLY'
                                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                  : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  }`}>
                                  {p.rateType === 'HOURLY' ? `₪${p.rateValue}/hr` : `₪${fmt(p.rateValue)}/mo`}
                                </span>
                                <span className="text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{p.category}</span>
                              </div>
                            </td>
                            <td className="px-6 py-3 text-right text-xs text-slate-500">{p.activeHours.toFixed(1)}</td>
                            <td className="px-6 py-3 text-right text-xs text-slate-500">{p.canceledHours.toFixed(1)}</td>
                            <td className="px-6 py-3 text-right text-xs text-blue-500">{p.hourlyCost > 0 ? `₪${fmt(p.hourlyCost)}` : '—'}</td>
                            <td className="px-6 py-3 text-right text-xs text-emerald-500">{p.globalCost > 0 ? `₪${fmt(p.globalCost)}` : '—'}</td>
                            <td className="px-6 py-3 text-right text-xs font-medium text-slate-700 dark:text-slate-300">₪{fmt(p.hourlyCost + p.globalCost)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}

                    <tr className="bg-slate-100 dark:bg-slate-950 font-bold">
                      <td className="px-6 py-4"></td>
                      <td className="px-6 py-4 text-slate-800 dark:text-white">Grand Total</td>
                      <td className="px-6 py-4 text-right text-blue-600 dark:text-blue-400">{totals.activeHours.toFixed(1)}</td>
                      <td className="px-6 py-4 text-right text-red-500">{totals.canceledHours.toFixed(1)}</td>
                      <td className="px-6 py-4 text-right text-blue-600 dark:text-blue-400">₪{fmt(totals.hourlyCost)}</td>
                      <td className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400">₪{fmt(totals.globalCost)}</td>
                      <td className="px-6 py-4 text-right text-slate-900 dark:text-white text-lg">₪{fmt(totals.grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
