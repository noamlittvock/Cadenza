/**
 * ExportScopeModal — Phase 12 export scope selector.
 * Shown before every CSV export. Lets user filter by date range, activity, archived status.
 * Client-side only — no Firestore write.
 */

import React, { useState } from 'react';
import { AppSettings } from '../types';
import type { ImportEntityType } from '../types/v2';
import { TRANSLATIONS } from '../constants';
import { Download, X } from 'lucide-react';
import { generateExportCSV, downloadCSV } from '../utils/csvUtils';

interface Props {
  entityType: ImportEntityType;
  /** Pre-formatted rows matching template column names */
  data: Record<string, string>[];
  /** Activity names list for filter dropdown */
  activityNames?: string[];
  settings: AppSettings;
  onClose: () => void;
}

export const ExportScopeModal: React.FC<Props> = ({
  entityType, data, activityNames = [], settings, onClose,
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activityFilter, setActivityFilter] = useState('ALL');
  const [includeArchived, setIncludeArchived] = useState(false);

  const showDateRange = entityType === 'EVENT';
  const showActivityFilter = ['ENROLLMENT', 'EVENT', 'TEACHING_ASSIGNMENT'].includes(entityType);
  const showArchivedToggle = ['STUDENT', 'STAFF_MEMBER', 'ENROLLMENT'].includes(entityType);

  const applyFilters = (): Record<string, string>[] => {
    let filtered = [...data];

    if (showDateRange && dateFrom) {
      filtered = filtered.filter(r => (r['date'] || '') >= dateFrom);
    }
    if (showDateRange && dateTo) {
      filtered = filtered.filter(r => (r['date'] || '') <= dateTo);
    }
    if (showActivityFilter && activityFilter !== 'ALL') {
      filtered = filtered.filter(r =>
        (r['activityName'] || '').toLowerCase() === activityFilter.toLowerCase()
      );
    }
    if (!includeArchived) {
      filtered = filtered.filter(r => r['isArchived'] !== 'true' && r['status'] !== 'ARCHIVED');
    }

    return filtered;
  };

  const handleExport = () => {
    const filtered = applyFilters();
    const csv = generateExportCSV(entityType, filtered);
    const filename = `${entityType.toLowerCase()}_export_${new Date().toISOString().slice(0, 10)}.csv`;

    if (filtered.length === 0) {
      // Headers-only file with inline notice
      const headersOnly = generateExportCSV(entityType, []);
      downloadCSV(headersOnly + '\n# No records match the selected scope.', filename);
    } else {
      downloadCSV(csv, filename);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('csv.export_scope')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{entityType.replace('_', ' ')}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="p-5 space-y-4">
          {showDateRange && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">{t('csv.date_range')}</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {showActivityFilter && activityNames.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">{t('csv.activity_filter')}</label>
              <select
                value={activityFilter}
                onChange={e => setActivityFilter(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">{t('csv.all_activities')}</option>
                {activityNames.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}

          {showArchivedToggle && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={e => setIncludeArchived(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t('csv.include_archived')}</span>
            </label>
          )}

          {/* Preview count */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm text-slate-600 dark:text-slate-400">
            {t('csv.will_export').replace('{n}', String(applyFilters().length))} records
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between p-5 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm">
            {t('btn.cancel')}
          </button>
          <button
            onClick={handleExport}
            className="px-5 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm flex items-center gap-2"
          >
            <Download size={16} /> {t('csv.export_btn')}
          </button>
        </div>
      </div>
    </div>
  );
};
