import React, { useState, useMemo } from 'react';
import { CalendarEvent, Teacher, AppSettings } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Filter, Calendar as CalIcon, Check, ChevronDown, Menu } from 'lucide-react';

interface Props {
  events: CalendarEvent[];
  teachers: Teacher[];
  settings: AppSettings;
  onMobileMenuOpen: () => void;
}

type DateFilterType = 'WEEK' | 'MONTH' | 'CUSTOM' | 'ALL';
type TeacherFilterType = 'ALL' | 'SELECT';

export const FinancialDashboard: React.FC<Props> = ({ events, teachers, settings, onMobileMenuOpen }) => {
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('WEEK');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [teacherFilterType, setTeacherFilterType] = useState<TeacherFilterType>('ALL');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());
  const [isTeacherDropdownOpen, setIsTeacherDropdownOpen] = useState(false);

  // Mobile Check
  const [isMobile, setIsMobile] = useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // --- Filtering Logic ---

  const filteredEvents = useMemo(() => {
    // 1. Filter by Hidden/Blackout
    let filtered = events.filter(e => !e.isHidden);

    // 2. Filter by Teachers
    if (teacherFilterType === 'SELECT' && selectedTeacherIds.size > 0) {
      filtered = filtered.filter(e => selectedTeacherIds.has(e.teacherId));
    }

    // 3. Filter by Date
    const now = new Date();
    let startLimit: Date | null = null;
    let endLimit: Date | null = null;

    if (dateFilterType === 'WEEK') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startLimit = new Date(now.setDate(diff));
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

    if (startLimit) {
      filtered = filtered.filter(e => new Date(e.start) >= startLimit!);
    }
    if (endLimit) {
      filtered = filtered.filter(e => new Date(e.end) <= endLimit!);
    }

    return filtered;
  }, [events, dateFilterType, customStartDate, customEndDate, teacherFilterType, selectedTeacherIds]);

  // --- Aggregation Logic ---

  const reportData = useMemo(() => {
    const data: Record<string, any> = {};

    // Initialize for filtered teachers only
    const visibleTeachers = teacherFilterType === 'SELECT'
      ? teachers.filter(t => selectedTeacherIds.has(t.id))
      : teachers;

    visibleTeachers.forEach(t => {
      data[t.id] = {
        name: t.fullName,
        total: 0,
        active: 0,
        canceled: 0,
        // Classifications will be dynamic keys
      };
    });

    filteredEvents.forEach(evt => {
      if (!data[evt.teacherId]) return; // Skip if teacher filtered out (double check)

      const durationHours = (new Date(evt.end).getTime() - new Date(evt.start).getTime()) / (1000 * 60 * 60);

      data[evt.teacherId].total += durationHours;

      if (evt.isCanceled) {
        data[evt.teacherId].canceled += durationHours;
      } else {
        data[evt.teacherId].active += durationHours;
        // Dynamic breakdown
        if (!data[evt.teacherId][evt.classification]) {
          data[evt.teacherId][evt.classification] = 0;
        }
        data[evt.teacherId][evt.classification] += durationHours;
      }
    });

    return Object.values(data).filter(d => d.total > 0 || teacherFilterType === 'SELECT'); // Hide empty if showing ALL, show all if Specific
  }, [filteredEvents, teachers, teacherFilterType, selectedTeacherIds]);

  const toggleTeacher = (id: string) => {
    const newSet = new Set(selectedTeacherIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedTeacherIds(newSet);
  };

  const handleExport = () => {
    // Dynamic headers based on data content
    const classificationKeys = new Set<string>();
    reportData.forEach((d: any) => {
      Object.keys(d).forEach(k => {
        if (k !== 'name' && k !== 'total' && k !== 'active' && k !== 'canceled') {
          classificationKeys.add(k);
        }
      });
    });
    const classHeaders = Array.from(classificationKeys).sort();

    const headers = ['Teacher Name', 'Total Hours', 'Active Hours', 'Canceled Hours', ...classHeaders];
    const rows = reportData.map((d: any) => [
      `"${d.name}"`,
      d.total.toFixed(2),
      d.active.toFixed(2),
      d.canceled.toFixed(2),
      ...classHeaders.map(k => (d[k] || 0).toFixed(2))
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payroll_export_${dateFilterType.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
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
            <p className="text-slate-500 dark:text-slate-400">Payroll analytics with advanced filtering.</p>
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
              <input
                type="date"
                className="bg-transparent text-xs outline-none dark:text-white"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                className="bg-transparent text-xs outline-none dark:text-white"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
              />
            </div>
          )}

          {/* Teacher Filter */}
          <div className="relative">
            <button
              onClick={() => setIsTeacherDropdownOpen(!isTeacherDropdownOpen)}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg flex items-center px-3 py-2 shadow-sm text-sm text-slate-700 dark:text-white"
            >
              <Filter size={16} className="text-slate-400 mr-2" />
              {teacherFilterType === 'ALL' ? 'All Teachers' : `${selectedTeacherIds.size} Selected`}
              <ChevronDown size={14} className="ml-2" />
            </button>

            {isTeacherDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-2">
                <div
                  className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer text-sm font-medium"
                  onClick={() => { setTeacherFilterType('ALL'); setSelectedTeacherIds(new Set()); setIsTeacherDropdownOpen(false); }}
                >
                  All Teachers
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                <div
                  className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer text-sm font-medium text-blue-600"
                  onClick={() => { setTeacherFilterType('SELECT'); }}
                >
                  Select Specific...
                </div>
                {teacherFilterType === 'SELECT' && (
                  <div className="max-h-48 overflow-y-auto mt-2 space-y-1 custom-scrollbar">
                    {teachers.map(t => (
                      <div
                        key={t.id}
                        className="flex items-center px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer"
                        onClick={() => toggleTeacher(t.id)}
                      >
                        <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${selectedTeacherIds.has(t.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                          {selectedTeacherIds.has(t.id) && <Check size={12} className="text-white" />}
                        </div>
                        <span className="text-sm truncate">{t.fullName}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Overlay to close */}
                <div className="fixed inset-0 z-[-1]" onClick={() => setIsTeacherDropdownOpen(false)}></div>
              </div>
            )}
          </div>

          <button
            onClick={handleExport}
            className="hidden md:flex bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg items-center shadow-sm text-sm"
          >
            <Download size={16} className="mr-2" /> Export
          </button>
        </div>
      </div>

      {reportData.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center border border-dashed border-slate-300 dark:border-slate-800 text-slate-500">
          No data matches current filters.
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
              <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase">Total Scheduled Hours</h3>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                {reportData.reduce((acc: number, curr: any) => acc + curr.total, 0).toFixed(1)}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
              <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase">Active Billable Hours</h3>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                {reportData.reduce((acc: number, curr: any) => acc + curr.active, 0).toFixed(1)}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
              <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase">Canceled</h3>
              <p className="text-3xl font-bold text-red-500 mt-2">
                {reportData.reduce((acc: number, curr: any) => acc + curr.canceled, 0).toFixed(1)}
              </p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 h-96">
              <h3 className="font-bold text-slate-800 dark:text-white mb-6">Hours by Teacher</h3>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={reportData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={12} stroke="#94a3b8" />
                  <YAxis fontSize={12} stroke="#94a3b8" />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', color: '#fff' }} />
                  <Legend />
                  <Bar dataKey="active" name="Active Hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="canceled" name="Canceled" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 h-96">
              <h3 className="font-bold text-slate-800 dark:text-white mb-6">Classification Breakdown</h3>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={reportData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" fontSize={12} stroke="#94a3b8" />
                  <YAxis dataKey="name" type="category" width={100} fontSize={12} stroke="#94a3b8" />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', color: '#fff' }} />
                  <Legend />
                  {/* Dynamically generate bars based on classifications present in data */}
                  {Array.from(new Set(reportData.flatMap((d: any) => Object.keys(d).filter(k => k !== 'name' && k !== 'total' && k !== 'active' && k !== 'canceled')))).map((key, idx) => (
                    <Bar key={key} dataKey={key} stackId="a" fill={`hsl(${idx * 45}, 70%, 50%)`} />
                  ))}
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
                    <th className="px-6 py-4">Teacher</th>
                    <th className="px-6 py-4 text-right">Active</th>
                    <th className="px-6 py-4 text-right">Canceled</th>
                    <th className="px-6 py-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reportData.map((d: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{d.name}</td>
                      <td className="px-6 py-4 text-right font-medium text-blue-600 dark:text-blue-400">{d.active.toFixed(1)}</td>
                      <td className="px-6 py-4 text-right text-red-500">{d.canceled.toFixed(1)}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">{d.total.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
