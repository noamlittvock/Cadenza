import React, { useState, useMemo } from 'react';
import { HoursReport, HoursEntry, CalendarEvent, Teacher, AppSettings } from '../types';
import { TRANSLATIONS } from '../constants';
import { formatHours } from '../utils/formatters';
import {
  ChevronDown, ChevronUp, CheckCircle2, Clock, AlertTriangle,
  FileText, User, Calendar as CalIcon, Filter
} from 'lucide-react';

interface Props {
  hoursReports: HoursReport[];
  setHoursReports: React.Dispatch<React.SetStateAction<HoursReport[]>>;
  events: CalendarEvent[];
  teachers: Teacher[];
  settings: AppSettings;
}

interface ComparisonRow {
  eventId?: string;
  eventName: string;
  eventDate: string;
  scheduledHours: number;
  reportedHours: number;
  entryType: string;
  absenceReason?: string;
  description?: string;
  difference: number;
}

export const HoursComparisonView: React.FC<Props> = ({
  hoursReports, setHoursReports, events, teachers, settings
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US']?.[key] || key;

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [filterStaffId, setFilterStaffId] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState('');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  // Only show SUBMITTED and REVIEWED reports
  const relevantReports = useMemo(() => {
    return hoursReports
      .filter(r => r.status === 'SUBMITTED' || r.status === 'REVIEWED')
      .filter(r => !filterStaffId || r.staffMemberId === filterStaffId)
      .sort((a, b) => (b.submittedAt || b.createdAt).localeCompare(a.submittedAt || a.createdAt));
  }, [hoursReports, filterStaffId]);

  // Staff members who have reports
  const reportingStaff = useMemo(() => {
    const staffIds = new Set(hoursReports.filter(r => r.status === 'SUBMITTED' || r.status === 'REVIEWED').map(r => r.staffMemberId));
    return teachers.filter(t => staffIds.has(t.id));
  }, [hoursReports, teachers]);

  // Build comparison rows for a report
  const buildComparison = (report: HoursReport): ComparisonRow[] => {
    const rows: ComparisonRow[] = [];
    const entries = report.reportedEntries || [];

    // Calendar-based entries
    const calendarEntries = entries.filter(e => e.sourceEventId);
    calendarEntries.forEach(entry => {
      const event = events.find(ev => ev.id === entry.sourceEventId);
      const scheduledHours = event
        ? Math.round(((new Date(event.end).getTime() - new Date(event.start).getTime()) / (1000 * 60 * 60)) * 100) / 100
        : 0;

      rows.push({
        eventId: entry.sourceEventId,
        eventName: event?.name || 'Unknown Event',
        eventDate: entry.date,
        scheduledHours,
        reportedHours: entry.hours,
        entryType: entry.entryType,
        absenceReason: entry.absenceReason,
        difference: entry.hours - scheduledHours,
      });
    });

    // Manual entries
    const manualEntries = entries.filter(e => e.entryType === 'MANUAL');
    manualEntries.forEach(entry => {
      rows.push({
        eventName: entry.description || t('hours.entry_manual'),
        eventDate: entry.date,
        scheduledHours: 0,
        reportedHours: entry.hours,
        entryType: 'MANUAL',
        description: entry.description,
        difference: entry.hours,
      });
    });

    rows.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    return rows;
  };

  const getStaffName = (staffMemberId: string) => {
    return teachers.find(t => t.id === staffMemberId)?.fullName || staffMemberId;
  };

  const getStaffColor = (staffMemberId: string) => {
    return teachers.find(t => t.id === staffMemberId)?.color || '#6E1A1A';
  };

  const getEntryTypeLabel = (entryType: string) => {
    switch (entryType) {
      case 'CALENDAR_CONFIRMED': return t('hours.entry_confirmed');
      case 'CALENDAR_ADJUSTED': return t('hours.entry_adjusted');
      case 'CALENDAR_NOT_COMPLETED': return t('hours.entry_not_completed');
      case 'MANUAL': return t('hours.entry_manual');
      default: return entryType;
    }
  };

  const getEntryTypeColor = (entryType: string) => {
    switch (entryType) {
      case 'CALENDAR_CONFIRMED': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'CALENDAR_ADJUSTED': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'CALENDAR_NOT_COMPLETED': return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
      case 'MANUAL': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const handleSaveNotes = (reportId: string) => {
    setHoursReports(prev => prev.map(r =>
      r.id === reportId ? { ...r, adminNotes: adminNotes } : r
    ));
  };

  const handleMarkReviewed = (reportId: string) => {
    setHoursReports(prev => prev.map(r =>
      r.id === reportId ? { ...r, status: 'REVIEWED' as const } : r
    ));
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">{t('hours.comparison_title')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('hours.comparison_subtitle')}</p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Filter size={16} className="text-slate-400" />
          <select
            value={filterStaffId}
            onChange={e => setFilterStaffId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('filter.all_teachers')}</option>
            {reportingStaff.map(s => (
              <option key={s.id} value={s.id}>{s.fullName}</option>
            ))}
          </select>
        </div>

        {/* Reports */}
        {relevantReports.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={48} />
            <p className="text-slate-400 dark:text-slate-500">{t('hours.comparison_no_reports')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {relevantReports.map(report => {
              const isExpanded = expandedReport === report.id;
              const rows = isExpanded ? buildComparison(report) : [];
              const totalScheduled = rows.reduce((sum, r) => sum + r.scheduledHours, 0);
              const totalReported = rows.reduce((sum, r) => sum + r.reportedHours, 0);

              return (
                <div key={report.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  {/* Report Header */}
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedReport(isExpanded ? null : report.id);
                      setAdminNotes(report.adminNotes || '');
                    }}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: getStaffColor(report.staffMemberId) }}>
                        {getStaffName(report.staffMemberId).charAt(0)}
                      </div>
                      <div className="text-start">
                        <p className="font-semibold text-slate-800 dark:text-white">{getStaffName(report.staffMemberId)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {report.periodStart} → {report.periodEnd}
                          {report.submittedAt && ` · ${t('hours.comparison_submitted_at')}: ${new Date(report.submittedAt).toLocaleDateString(settings.language)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        report.status === 'REVIEWED'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                        {t(`hours.${report.status.toLowerCase()}`)}
                      </span>
                      {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                    </div>
                  </button>

                  {/* Expanded Comparison Table */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-800">
                      {/* Comparison Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                              <th className="text-start px-5 py-2.5 font-semibold">{t('hours.form_date')}</th>
                              <th className="text-start px-5 py-2.5 font-semibold">{t('label.name')}</th>
                              <th className="text-end px-5 py-2.5 font-semibold">{t('hours.comparison_calendar_hours')}</th>
                              <th className="text-end px-5 py-2.5 font-semibold">{t('hours.comparison_reported_hours')}</th>
                              <th className="text-end px-5 py-2.5 font-semibold">{t('hours.comparison_difference')}</th>
                              <th className="text-start px-5 py-2.5 font-semibold">{t('hours.comparison_entry_type')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, idx) => (
                              <tr key={idx} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300">{row.eventDate}</td>
                                <td className="px-5 py-2.5 text-slate-800 dark:text-white font-medium">
                                  {row.eventName}
                                  {row.absenceReason && (
                                    <span className="block text-xs text-slate-500 dark:text-slate-400 italic mt-0.5">{row.absenceReason}</span>
                                  )}
                                </td>
                                <td className="px-5 py-2.5 text-end text-slate-600 dark:text-slate-400 font-mono">{row.scheduledHours > 0 ? formatHours(row.scheduledHours) : '—'}</td>
                                <td className="px-5 py-2.5 text-end text-slate-800 dark:text-white font-mono font-semibold">{formatHours(row.reportedHours)}</td>
                                <td className={`px-5 py-2.5 text-end font-mono font-semibold ${
                                  row.difference > 0 ? 'text-green-600' : row.difference < 0 ? 'text-amber-600' : 'text-slate-400'
                                }`}>
                                  {row.difference > 0 ? '+' : ''}{row.difference !== 0 ? formatHours(row.difference) : '—'}
                                </td>
                                <td className="px-5 py-2.5">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getEntryTypeColor(row.entryType)}`}>
                                    {getEntryTypeLabel(row.entryType)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-bold">
                              <td className="px-5 py-3 text-slate-800 dark:text-white" colSpan={2}>{t('col.total')}</td>
                              <td className="px-5 py-3 text-end text-slate-600 dark:text-slate-400 font-mono">{formatHours(totalScheduled)}</td>
                              <td className="px-5 py-3 text-end text-slate-800 dark:text-white font-mono">{formatHours(totalReported)}</td>
                              <td className={`px-5 py-3 text-end font-mono ${
                                totalReported - totalScheduled > 0 ? 'text-green-600' : totalReported - totalScheduled < 0 ? 'text-amber-600' : 'text-slate-400'
                              }`}>
                                {totalReported - totalScheduled > 0 ? '+' : ''}{totalReported !== totalScheduled ? formatHours(totalReported - totalScheduled) : '—'}
                              </td>
                              <td className="px-5 py-3"></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Admin Actions */}
                      <div className="p-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{t('hours.comparison_admin_notes')}</label>
                          <textarea
                            value={adminNotes}
                            onChange={e => setAdminNotes(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => handleSaveNotes(report.id)}
                            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                          >
                            {t('hours.comparison_save_notes')}
                          </button>
                          {report.status === 'SUBMITTED' && (
                            <button
                              type="button"
                              onClick={() => handleMarkReviewed(report.id)}
                              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5"
                            >
                              <CheckCircle2 size={16} />
                              {t('hours.comparison_mark_reviewed')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
