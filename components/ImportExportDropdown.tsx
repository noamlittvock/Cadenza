/**
 * ImportExportDropdown — Phase 12 reusable "Import / Export" dropdown.
 * Renders three items: Import, Export, Download Template.
 * Hosts CsvImportModal and ExportScopeModal.
 * Staff role cannot use any of the three actions (canWrite guard).
 */

import React, { useState, useRef, useEffect } from 'react';
import { AppSettings } from '../types';
import type { ImportEntityType } from '../types/v2';
import { TRANSLATIONS } from '../constants';
import { ChevronDown, Upload, Download, FileDown, FileSpreadsheet } from 'lucide-react';
import { generateTemplate, downloadCSV } from '../utils/csvUtils';
import { CsvImportModal } from './CsvImportModal';
import { ExportScopeModal } from './ExportScopeModal';

interface Props {
  entityType: ImportEntityType;
  /** Overrides the default "Import / Export" button label */
  label?: string;
  /** Icon-only trigger with hover tooltip; matches the calendar toolbar icon-button style */
  iconOnly?: boolean;
  /** Rows pre-formatted with template column names — for export & duplicate detection */
  existingData: Record<string, string>[];
  /** Pre-computed duplicate keys (e.g. lower-case fullName / email / composite) */
  existingDuplicateKeys: Set<string>;
  /** Dependency lookup maps for import resolution */
  dependencyMaps: {
    activityByName: Record<string, string>;
    l2ByName: Record<string, string>;
    staffByEmail: Record<string, string>;
    studentByName: Record<string, string>;
  };
  /** Activity names list for Export scope filter */
  activityNames?: string[];
  settings: AppSettings;
  /** Admin / Super Admin = true; Staff = false (hides all actions) */
  canWrite: boolean;
  onImportComplete: (rows: Record<string, string>[]) => void;
}

export const ImportExportDropdown: React.FC<Props> = ({
  entityType, label, iconOnly, existingData, existingDuplicateKeys, dependencyMaps,
  activityNames, settings, canWrite, onImportComplete,
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const [open, setOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!canWrite) return null;

  const handleTemplate = () => {
    setOpen(false);
    const csv = generateTemplate(entityType);
    downloadCSV(csv, `${entityType.toLowerCase()}_template.csv`);
  };

  return (
    <>
      <div className="relative" ref={ref}>
        {iconOnly ? (
          <div className="relative group/tt">
            <button
              onClick={() => setOpen(v => !v)}
              aria-label={label ?? t('csv.dropdown_label')}
              className="h-8 w-8 rounded-lg border bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center justify-center"
            >
              <FileSpreadsheet size={16} />
            </button>
            <span role="tooltip" className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[11px] font-medium bg-slate-900 dark:bg-slate-700 text-white whitespace-nowrap opacity-0 group-hover/tt:opacity-100 transition-opacity z-50 shadow-lg">
              {label ?? t('csv.dropdown_label')}
            </span>
          </div>
        ) : (
          <button
            onClick={() => setOpen(v => !v)}
            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {label ?? t('csv.dropdown_label')}
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}

        {open && (
          <div className="absolute end-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-30 overflow-hidden">
            <button
              onClick={() => { setOpen(false); setShowImport(true); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Upload size={15} className="text-blue-500" /> {t('csv.import')}
            </button>
            <button
              onClick={() => { setOpen(false); setShowExport(true); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Download size={15} className="text-green-500" /> {t('csv.export')}
            </button>
            <div className="border-t border-slate-100 dark:border-slate-700" />
            <button
              onClick={handleTemplate}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <FileDown size={15} className="text-slate-400" /> {t('csv.template')}
            </button>
          </div>
        )}
      </div>

      {showImport && (
        <CsvImportModal
          entityType={entityType}
          existingDuplicateKeys={existingDuplicateKeys}
          dependencyMaps={dependencyMaps}
          settings={settings}
          onClose={() => setShowImport(false)}
          onImportComplete={(rows) => { setShowImport(false); onImportComplete(rows); }}
        />
      )}

      {showExport && (
        <ExportScopeModal
          entityType={entityType}
          data={existingData}
          activityNames={activityNames}
          settings={settings}
          onClose={() => setShowExport(false)}
        />
      )}
    </>
  );
};
