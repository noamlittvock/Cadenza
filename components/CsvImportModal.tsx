/**
 * CsvImportModal — Phase 12 three-step CSV import wizard.
 * Step 1: Upload & column mapping
 * Step 2: Row review (duplicates, auto-create preview, per-row toggles)
 * Step 3: Confirm & results (writes ImportSession to Firestore)
 */

import React, { useState, useRef } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { LOCAL_MODE } from '../utils/localStore';
import { useAuth } from '../context/AuthContext';
import { AppSettings } from '../types';
import type { ImportEntityType, ImportRowResult, DuplicateAction } from '../types/v2';
import { V2_COLLECTIONS } from '../types/v2';
import { TRANSLATIONS } from '../constants';
import {
  Upload, ChevronRight, Check, X, AlertTriangle, Info,
  SkipForward, RefreshCw, Loader2,
} from 'lucide-react';
import {
  parseCSVText, mapColumns, unmappedColumns, rowDuplicateKey,
  generateExportCSV, TEMPLATE_COLUMNS, REQUIRED_COLUMNS,
} from '../utils/csvUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReviewRow {
  index: number;
  raw: Record<string, string>;
  mapped: Record<string, string>;
  status: 'VALID' | 'DUPLICATE' | 'ERROR' | 'SKIPPED';
  errorMessage: string | null;
  duplicateOf: string | null;
  duplicateAction: DuplicateAction;
  missingDeps: string[];
  enabled: boolean;
}

interface Props {
  entityType: ImportEntityType;
  existingDuplicateKeys: Set<string>;
  /** For dependency resolution: map activityName→id, l2Name→id, staffEmail→id */
  dependencyMaps: {
    activityByName: Record<string, string>;
    l2ByName: Record<string, string>;
    staffByEmail: Record<string, string>;
    studentByName: Record<string, string>;
  };
  settings: AppSettings;
  onClose: () => void;
  onImportComplete: (rows: Record<string, string>[]) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const CsvImportModal: React.FC<Props> = ({
  entityType, existingDuplicateKeys, dependencyMaps, settings, onClose, onImportComplete,
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const { currentUser, orgId } = useAuth();

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState('');

  // Step 1 state
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [uploadedHeaders, setUploadedHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);

  // Step 3 state
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [results, setResults] = useState<{ imported: number; skipped: number; errors: number }>({ imported: 0, skipped: 0, errors: 0 });
  const [errorRows, setErrorRows] = useState<ReviewRow[]>([]);

  const expectedCols = TEMPLATE_COLUMNS[entityType];

  // ─── Step 1: File upload ─────────────────────────────────────────────────

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const rows = parseCSVText(text);
      if (rows.length === 0) { setUploadError('No valid rows found in file.'); return; }
      const headers = Object.keys(rows[0]);
      const autoMapping = mapColumns(headers, entityType);
      setParsedRows(rows);
      setUploadedHeaders(headers);
      setColumnMapping(autoMapping);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const missingMappings = unmappedColumns(columnMapping, entityType);

  const proceedToReview = () => {
    // Apply column mapping to each row
    const review: ReviewRow[] = parsedRows.map((raw, index) => {
      const mapped: Record<string, string> = {};
      expectedCols.forEach(col => {
        const uploadedCol = columnMapping[col];
        mapped[col] = uploadedCol ? (raw[uploadedCol] ?? '') : '';
      });

      // Validate required fields
      let errorMessage: string | null = null;
      const required = REQUIRED_COLUMNS[entityType];
      const missing = required.filter(c => !mapped[c]);
      if (missing.length > 0) errorMessage = `Missing required: ${missing.join(', ')}`;

      // Duplicate check
      const dupKey = rowDuplicateKey(mapped, entityType);
      const isDuplicate = dupKey ? existingDuplicateKeys.has(dupKey) : false;

      // Missing dependency check
      const missingDeps: string[] = [];
      if ((entityType === 'ENROLLMENT' || entityType === 'EVENT' || entityType === 'TEACHING_ASSIGNMENT') && mapped['activityName']) {
        if (!dependencyMaps.activityByName[mapped['activityName']]) missingDeps.push(`Activity "${mapped['activityName']}"`);
      }
      if ((entityType === 'ENROLLMENT' || entityType === 'EVENT' || entityType === 'TEACHING_ASSIGNMENT') && mapped['l2Name']) {
        if (!dependencyMaps.l2ByName[mapped['l2Name']]) missingDeps.push(`L2 "${mapped['l2Name']}"`);
      }
      if (entityType === 'ENROLLMENT' && mapped['studentFullName']) {
        if (!dependencyMaps.studentByName[mapped['studentFullName']]) missingDeps.push(`Student "${mapped['studentFullName']}"`);
      }
      if (entityType === 'TEACHING_ASSIGNMENT' && mapped['staffEmail']) {
        if (!dependencyMaps.staffByEmail[mapped['staffEmail']]) missingDeps.push(`Staff "${mapped['staffEmail']}"`);
      }

      return {
        index,
        raw,
        mapped,
        status: errorMessage ? 'ERROR' : isDuplicate ? 'DUPLICATE' : 'VALID',
        errorMessage,
        duplicateOf: isDuplicate ? dupKey : null,
        duplicateAction: 'SKIP' as DuplicateAction,
        missingDeps,
        enabled: !errorMessage,
      };
    });
    setReviewRows(review);
    setStep(2);
  };

  // ─── Step 2: Review ──────────────────────────────────────────────────────

  const toggleRow = (index: number) => {
    setReviewRows(prev => prev.map(r => r.index === index ? { ...r, enabled: !r.enabled } : r));
  };

  const setDuplicateAction = (index: number, action: DuplicateAction) => {
    setReviewRows(prev => prev.map(r => r.index === index ? { ...r, duplicateAction: action, enabled: true } : r));
  };

  const validCount = reviewRows.filter(r => r.enabled && r.status !== 'ERROR').length;
  const dupCount = reviewRows.filter(r => r.status === 'DUPLICATE').length;
  const errorCount = reviewRows.filter(r => r.status === 'ERROR').length;

  // ─── Step 3: Confirm & Import ────────────────────────────────────────────

  const confirmImport = async () => {
    setStep(3);
    setImporting(true);

    const rowsToImport = reviewRows.filter(r => r.enabled && r.status !== 'ERROR');
    const rowResults: ImportRowResult[] = reviewRows.map(r => ({
      rowIndex: r.index,
      status: !r.enabled ? 'SKIPPED' : r.status === 'ERROR' ? 'ERROR' : 'IMPORTED',
      rawData: r.raw as Record<string, unknown>,
      resolvedData: r.mapped as Record<string, unknown>,
      errorMessage: r.errorMessage,
      duplicateOf: r.duplicateOf,
      duplicateAction: r.status === 'DUPLICATE' ? r.duplicateAction : null,
      autoCreated: r.missingDeps.length > 0 ? r.missingDeps : null,
    }));

    const imported = rowsToImport.length;
    const skipped = reviewRows.length - imported;
    const errors = errorCount;

    try {
      // LOCAL_MODE skips the Firestore audit trail (importSessions) because
      // addDoc/updateDoc hang forever without a Firestore project. Rows still
      // flow through onImportComplete and persist via useFirestoreSync.
      const sessionRef = LOCAL_MODE ? null : await addDoc(
        collection(db, V2_COLLECTIONS.importSessions),
        {
          orgId,
          createdBy: currentUser?.uid || '',
          entityType,
          status: 'IMPORTING',
          fileName,
          totalRows: reviewRows.length,
          importedRows: 0,
          skippedRows: 0,
          rowResults: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );

      onImportComplete(rowsToImport.map(r => r.mapped));

      if (sessionRef) {
        await updateDoc(doc(db, V2_COLLECTIONS.importSessions, sessionRef.id), {
          status: errors > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
          importedRows: imported,
          skippedRows: skipped,
          rowResults,
          updatedAt: serverTimestamp(),
        });
      }

      setResults({ imported, skipped, errors });
      setErrorRows(reviewRows.filter(r => r.status === 'ERROR'));
    } catch (err) {
      console.error('Import session write failed:', err);
    } finally {
      setImporting(false);
      setImportDone(true);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const stepLabel = ['', 'csv.step_upload', 'csv.step_review', 'csv.step_confirm'];

  const statusBadge = (status: ReviewRow['status'], enabled: boolean) => {
    if (!enabled) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">SKIP</span>;
    const cfg: Record<string, string> = {
      VALID: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      DUPLICATE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      ERROR: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      SKIPPED: 'bg-slate-100 text-slate-500',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg[status] || ''}`}>{status}</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-700">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('csv.import_title')} — {entityType.replace('_', ' ')}
            </h2>
            <div className="flex items-center gap-3 mt-1">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>
                    {step > s ? <Check size={10} /> : s}
                  </div>
                  <span className="text-xs text-slate-500">{t(stepLabel[s])}</span>
                  {s < 3 && <ChevronRight size={12} className="text-slate-300" />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── Step 1: Upload ── */}
          {step === 1 && (
            <div className="space-y-5">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('csv.upload_desc')}</p>

              {/* Drop zone */}
              <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl cursor-pointer hover:border-blue-500 transition-colors bg-slate-50 dark:bg-slate-800/50">
                <Upload size={28} className="text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {fileName || t('csv.drop_file')}
                </span>
                <span className="text-xs text-slate-400 mt-1">.csv files only</span>
                <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFile} />
              </label>

              {uploadError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  <AlertTriangle size={16} /> {uploadError}
                </div>
              )}

              {/* Column mapping */}
              {parsedRows.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('csv.column_mapping')}</h3>
                  <div className="space-y-2">
                    {expectedCols.map(col => (
                      <div key={col} className="flex items-center gap-3">
                        <span className="w-40 text-xs font-medium text-slate-600 dark:text-slate-400 shrink-0">{col}</span>
                        <select
                          value={columnMapping[col] || ''}
                          onChange={e => setColumnMapping(prev => ({ ...prev, [col]: e.target.value }))}
                          className="flex-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">{t('csv.not_mapped')}</option>
                          {uploadedHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        {columnMapping[col] ? (
                          <Check size={14} className="text-green-500 shrink-0" />
                        ) : REQUIRED_COLUMNS[entityType].includes(col) ? (
                          <span className="text-[10px] text-amber-500 shrink-0">required</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 shrink-0">optional</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const unmappedRequired = missingMappings.filter(c => REQUIRED_COLUMNS[entityType].includes(c));
                    return unmappedRequired.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
                        <Info size={13} /> Required columns not mapped: {unmappedRequired.join(', ')}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Review ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex gap-3 text-xs">
                <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full font-bold">{validCount} valid</span>
                {dupCount > 0 && <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded-full font-bold">{dupCount} duplicates</span>}
                {errorCount > 0 && <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-full font-bold">{errorCount} errors</span>}
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="p-3 w-8 text-start"><input type="checkbox" checked={reviewRows.every(r => r.enabled || r.status === 'ERROR')} onChange={e => setReviewRows(prev => prev.map(r => r.status === 'ERROR' ? r : { ...r, enabled: e.target.checked }))} /></th>
                      <th className="p-3 text-start text-slate-500 font-medium">Row</th>
                      <th className="p-3 text-start text-slate-500 font-medium">Status</th>
                      <th className="p-3 text-start text-slate-500 font-medium">Data</th>
                      <th className="p-3 text-start text-slate-500 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {reviewRows.map(row => (
                      <tr key={row.index} className={`${row.status === 'ERROR' ? 'opacity-60' : ''} hover:bg-slate-50 dark:hover:bg-slate-800/50`}>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            disabled={row.status === 'ERROR'}
                            onChange={() => toggleRow(row.index)}
                          />
                        </td>
                        <td className="p-3 text-slate-500">{row.index + 1}</td>
                        <td className="p-3">{statusBadge(row.status, row.enabled)}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300 max-w-xs truncate">
                          {Object.entries(row.mapped).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                          {row.errorMessage && <div className="text-red-500 text-[10px] mt-1">{row.errorMessage}</div>}
                          {row.missingDeps.length > 0 && (
                            <div className="text-amber-500 text-[10px] mt-1">
                              Will create stubs: {row.missingDeps.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          {row.status === 'DUPLICATE' && (
                            <select
                              value={row.duplicateAction}
                              onChange={e => setDuplicateAction(row.index, e.target.value as DuplicateAction)}
                              className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded px-2 py-1 text-[10px] outline-none"
                            >
                              <option value="SKIP">Skip</option>
                              <option value="OVERWRITE">Overwrite</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Step 3: Results ── */}
          {step === 3 && (
            <div className="space-y-5">
              {importing ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 size={32} className="animate-spin text-blue-500" />
                  <p className="text-sm text-slate-500">{t('csv.importing')}</p>
                </div>
              ) : importDone ? (
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1 bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-green-700 dark:text-green-400">{results.imported}</div>
                      <div className="text-xs text-green-600 mt-1">{t('csv.imported')}</div>
                    </div>
                    <div className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-slate-600 dark:text-slate-300">{results.skipped}</div>
                      <div className="text-xs text-slate-500 mt-1">{t('csv.skipped')}</div>
                    </div>
                    {results.errors > 0 && (
                      <div className="flex-1 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-700 dark:text-red-400">{results.errors}</div>
                        <div className="text-xs text-red-600 mt-1">{t('csv.errors')}</div>
                      </div>
                    )}
                  </div>

                  {errorRows.length > 0 && (
                    <div className="border border-red-200 dark:border-red-800 rounded-xl overflow-hidden">
                      <div className="bg-red-50 dark:bg-red-900/20 px-4 py-2 text-xs font-bold text-red-700 dark:text-red-400">{t('csv.error_report')}</div>
                      <div className="divide-y divide-red-100 dark:divide-red-900/30">
                        {errorRows.map(row => (
                          <div key={row.index} className="flex items-start gap-3 p-3 text-xs">
                            <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                            <div>
                              <span className="font-medium text-slate-700 dark:text-slate-300">Row {row.index + 1}</span>
                              <span className="text-slate-500 ms-2">{row.errorMessage}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-5 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <button
            onClick={step === 1 ? onClose : () => setStep(s => (s - 1) as 1 | 2 | 3)}
            disabled={step === 3 && importing}
            className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm"
          >
            {step === 1 ? t('btn.cancel') : step === 3 && importDone ? t('btn.close') : t('btn.back')}
          </button>

          {step === 1 && (
            <button
              onClick={proceedToReview}
              disabled={parsedRows.length === 0}
              className="px-5 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {t('csv.review')} <ChevronRight size={16} />
            </button>
          )}

          {step === 2 && (
            <button
              onClick={confirmImport}
              disabled={validCount === 0}
              className="px-5 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {t('csv.import_n').replace('{n}', String(validCount))} <Check size={16} />
            </button>
          )}

          {step === 3 && importDone && (
            <button
              onClick={onClose}
              className="px-5 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm"
            >
              {t('csv.done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
