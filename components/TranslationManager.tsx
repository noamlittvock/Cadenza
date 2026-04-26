import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { TRANSLATIONS } from '../constants';
import { TranslationRecord } from '../types/translations';
import extractedDataRaw from '../translations_extracted.json';
import { ChevronRight, ChevronLeft, ChevronDown, Globe, Search, RefreshCw, Lock, Unlock, Save } from 'lucide-react';

// Cast the imported JSON to avoid type errors
const extractedData = extractedDataRaw as Array<{ key: string, screen_group: string }>;

interface TranslationManagerProps {
    settings: any;
}

export const TranslationManager: React.FC<TranslationManagerProps> = ({ settings }) => {
    const isRtl = settings.language === 'he-IL';
    const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

    // Database State
    const [liveData, setLiveData] = useState<Record<string, TranslationRecord>>({});
    const [loading, setLoading] = useState(true);
    const [deploying, setDeploying] = useState(false);

    // UI State
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [autoTranslateLoading, setAutoTranslateLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set(['Operations', 'Admin', 'System', 'Other']));

    // Navigation hierarchy
    const NAV_HIERARCHY: Record<string, string[]> = {
        Operations: ['CalendarView', 'GanttManager', 'PowerTools'],
        Admin: ['StaffMemberManager', 'ManageHub', 'RoomManager', 'ManageLists', 'SuperAdmin', 'TranslationManager'],
        System: ['App', 'AuthContext', 'Layout', 'Modal', 'Settings'],
    };

    const toggleBranch = (branch: string) => {
        setExpandedBranches(prev => {
            const next = new Set(prev);
            if (next.has(branch)) next.delete(branch); else next.add(branch);
            return next;
        });
    };

    // Initial Merge of Extracted vs Live
    useEffect(() => {
        const fetchAndMerge = async () => {
            setLoading(true);
            setErrorMsg(null);

            const dbRecords: Record<string, TranslationRecord> = {};
            try {
                const snapshot = await getDocs(collection(db, 'translations'));
                snapshot.forEach(doc => {
                    dbRecords[doc.id] = doc.data() as TranslationRecord;
                });
            } catch (error) {
                console.error("Failed to load translations from DB", error);
                setErrorMsg("Connecting to Firestore failed. Loading locally extracted strings only. Deploys will fail until permissions are resolved.");
            }

            try {
                const merged: Record<string, TranslationRecord> = {};

                // Merge Extracted Data
                extractedData.forEach(item => {
                    if (dbRecords[item.key]) {
                        merged[item.key] = dbRecords[item.key];
                    } else {
                        // Resolve original english from constants if available
                        const original = TRANSLATIONS['en-US'][item.key] || item.key;
                        const existingHebrew = TRANSLATIONS['he-IL']?.[item.key] || '';

                        merged[item.key] = {
                            id: item.key,
                            key: item.key,
                            original_english: original,
                            screen_group: item.screen_group,
                            status: existingHebrew ? 'reviewed' : 'untranslated',
                            he_IL: existingHebrew,
                            auto_translated_he_IL: '',
                            manual_override: false,
                            last_updated: new Date().toISOString()
                        };
                    }
                });

                // Add any DB records that weren't in extraction (custom or deprecated keys)
                Object.keys(dbRecords).forEach(key => {
                    if (!merged[key]) {
                        merged[key] = dbRecords[key];
                    }
                });

                setLiveData(merged);
            } catch (error) {
                console.error("Failed to process translations", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAndMerge();
    }, []);

    // Derived Data
    const { groups, stats, groupedRecords } = useMemo(() => {
        const records: TranslationRecord[] = Object.values(liveData);
        let untranslated = 0;
        let total = records.length;

        const grouped: Record<string, TranslationRecord[]> = {};
        const groupStats: Record<string, { total: number, untranslated: number }> = {};

        records.forEach((r: TranslationRecord) => {
            if (r.status === 'untranslated' || !r.he_IL) untranslated++;

            const groupMatch = searchQuery ? r.key.toLowerCase().includes(searchQuery.toLowerCase()) || r.original_english.toLowerCase().includes(searchQuery.toLowerCase()) : true;

            if (groupMatch) {
                if (!grouped[r.screen_group]) {
                    grouped[r.screen_group] = [];
                    groupStats[r.screen_group] = { total: 0, untranslated: 0 };
                }
                grouped[r.screen_group].push(r);
                groupStats[r.screen_group].total++;
                if (r.status === 'untranslated' || !r.he_IL) groupStats[r.screen_group].untranslated++;
            }
        });

        const sortedGroups = Object.keys(groupStats).sort((a, b) => {
            // Sort by most untranslated first
            return groupStats[b].untranslated - groupStats[a].untranslated;
        });

        // Search matching flat list if searching inside a group or globally
        let flatResults = records;
        if (searchQuery) {
            flatResults = flatResults.filter((r: TranslationRecord) => r.key.toLowerCase().includes(searchQuery.toLowerCase()) || r.original_english.toLowerCase().includes(searchQuery.toLowerCase()) || (r.he_IL && r.he_IL.toLowerCase().includes(searchQuery.toLowerCase())));
        }

        return {
            groups: sortedGroups.map(g => ({ name: g, ...groupStats[g] })),
            stats: { total, untranslated, translated: total - untranslated },
            groupedRecords: grouped,
            flatResults
        };
    }, [liveData, searchQuery]);

    const handleDeploy = async () => {
        setDeploying(true);
        try {
            const batch = writeBatch(db);
            let count = 0;
            const chunks = [];
            let currentBatch = writeBatch(db);

            Object.values(liveData).forEach((record: TranslationRecord) => {
                const docRef = doc(db, 'translations', record.key);
                currentBatch.set(docRef, record);
                count++;

                if (count === 490) { // Firestore batch limit is 500
                    chunks.push(currentBatch);
                    currentBatch = writeBatch(db);
                    count = 0;
                }
            });

            if (count > 0) chunks.push(currentBatch);

            for (const b of chunks) {
                await b.commit();
            }

            alert(t('tm.deploy_success'));
        } catch (error) {
            console.error(error);
            alert(t('tm.deploy_failed'));
        } finally {
            setDeploying(false);
        }
    };

    const handleAutoTranslate = async () => {
        setAutoTranslateLoading(true);
        try {
            const records: TranslationRecord[] = Object.values(liveData);
            const missing = records.filter(r => r.status === 'untranslated' && !r.manual_override);

            if (missing.length === 0) {
                alert(t('tm.no_missing'));
                return;
            }

            const apiKey = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY;
            if (!apiKey) {
                alert(t('tm.api_key_missing'));
                return;
            }

            const chunks = [];
            for (let i = 0; i < missing.length; i += 50) {
                chunks.push(missing.slice(i, i + 50));
            }

            let translatedCount = 0;

            for (const chunk of chunks) {
                const texts = chunk.map(r => r.original_english);
                const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        q: texts,
                        target: 'iw', // Google Translate uses 'iw' for Hebrew
                        source: 'en',
                        format: 'text'
                    })
                });

                const data = await res.json();
                if (data.error) throw new Error(data.error.message);

                const translations = data.data.translations;

                setLiveData(prev => {
                    const next = { ...prev };
                    chunk.forEach((record, index) => {
                        const translatedText = translations[index].translatedText;
                        next[record.key] = {
                            ...next[record.key],
                            he_IL: translatedText,
                            auto_translated_he_IL: translatedText,
                            status: 'auto_translated',
                            last_updated: new Date().toISOString()
                        };
                    });
                    return next;
                });
                translatedCount += chunk.length;
            }

            alert(t('tm.auto_translate_success').replace('{count}', String(translatedCount)));
        } catch (e) {
            console.error(e);
            alert(t('tm.auto_translate_failed').replace('{error}', (e as Error).message));
        } finally {
            setAutoTranslateLoading(false);
        }
    };

    const updateRecord = (key: string, field: keyof TranslationRecord, value: any) => {
        setLiveData(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                [field]: value,
                last_updated: new Date().toISOString()
            }
        }));
    };

    if (loading) {
        return <div className="p-8 flex items-center justify-center h-full"><Globe className="animate-spin text-cadenza-light me-2" /> {t('tm.loading')}</div>;
    }

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-cadenza-soft">
            {errorMsg && (
                <div className="bg-red-500 text-white p-3 text-sm text-center font-bold relative z-20">
                    {errorMsg}
                </div>
            )}
            {/* Level 3: Global Header */}
            <div className="bg-white dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 z-10 sticky top-0">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="p-3 bg-cadenza-light/10 text-cadenza-light rounded-xl">
                        <Globe size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('tm.title')}</h2>
                        <div className="text-xs font-medium text-slate-500 mt-0.5">
                            {stats.translated} Translated / {stats.total} Total
                        </div>
                        {/* Progress Bar */}
                        <div className="w-48 h-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full mt-1.5 overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${(stats.translated / Math.max(stats.total, 1)) * 100}%` }}></div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder={t('tm.search_placeholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full ps-9 pe-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-cadenza-light outline-none"
                        />
                    </div>
                    <button
                        onClick={() => alert(t('tm.auto_translate_placeholder'))}
                        className="btn-cadenza-secondary px-4 py-2 border border-slate-200 dark:border-slate-700 shadow-sm text-sm"
                        disabled={autoTranslateLoading}
                    >
                        {autoTranslateLoading ? <RefreshCw className="animate-spin w-4 h-4 me-2" /> : null}
                        {t('tm.auto_translate')}
                    </button>
                    <button
                        onClick={handleDeploy}
                        disabled={deploying}
                        className="btn-cadenza px-4 py-2 flex items-center gap-2 shadow-cadenza-pressed shrink-0"
                    >
                        {deploying ? <Globe className="animate-spin w-4 h-4" /> : <Save size={16} />}
                        {t('tm.deploy')}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
                {!selectedGroup ? (
                    /* Level 1: Navigational Tree */
                    <div className="space-y-4 max-w-4xl mx-auto">
                        {(() => {
                            const groupMap = new Map(groups.map(g => [g.name, g]));
                            const mappedGroups = new Set(Object.values(NAV_HIERARCHY).flat());
                            const otherGroups = groups.filter(g => !mappedGroups.has(g.name));
                            const branches = [
                                ...Object.entries(NAV_HIERARCHY).map(([branch, screenGroups]) => ({
                                    branch,
                                    items: screenGroups
                                        .map(sg => groupMap.get(sg))
                                        .filter((g): g is typeof groups[0] => !!g),
                                })),
                                ...(otherGroups.length > 0 ? [{ branch: 'Other', items: otherGroups }] : []),
                            ];

                            return branches.map(({ branch, items }) => {
                                if (items.length === 0) return null;
                                const branchTotal = items.reduce((s, g) => s + g.total, 0);
                                const branchTranslated = items.reduce((s, g) => s + (g.total - g.untranslated), 0);
                                const branchUntranslated = branchTotal - branchTranslated;
                                const isExpanded = expandedBranches.has(branch);

                                const needsTranslation = items.filter(g => g.untranslated > 0).sort((a, b) => a.name.localeCompare(b.name));
                                const completed = items.filter(g => g.untranslated === 0).sort((a, b) => a.name.localeCompare(b.name));

                                return (
                                    <div key={branch} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                        {/* Branch Header */}
                                        <button
                                            onClick={() => toggleBranch(branch)}
                                            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-start"
                                        >
                                            <div className="flex items-center gap-3">
                                                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90 rtl:rotate-90'}`} />
                                                <h3 className="font-bold text-slate-800 dark:text-white">{t(`tm.section_${branch.toLowerCase()}`) !== `tm.section_${branch.toLowerCase()}` ? t(`tm.section_${branch.toLowerCase()}`) : branch}</h3>
                                                <span className="text-xs text-slate-400 font-medium">{branchTranslated}/{branchTotal}</span>
                                            </div>
                                            {branchUntranslated > 0 ? (
                                                <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded text-xs font-bold">
                                                    {branchUntranslated} {t('tm.missing')}
                                                </span>
                                            ) : (
                                                <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded text-xs font-bold">
                                                    {t('tm.complete')}
                                                </span>
                                            )}
                                        </button>

                                        {/* Branch Content */}
                                        {isExpanded && (
                                            <div className="px-4 pb-4 space-y-3">
                                                {/* Needs Translation */}
                                                {needsTranslation.length > 0 && (
                                                    <div>
                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2 px-1">
                                                            {t('tm.needs_translation')} ({needsTranslation.length})
                                                        </h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                            {needsTranslation.map(g => (
                                                                <div
                                                                    key={g.name}
                                                                    onClick={() => setSelectedGroup(g.name)}
                                                                    className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors group"
                                                                >
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <span className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{g.name}</span>
                                                                        <span className="text-[10px] text-slate-400 flex-shrink-0">{g.total - g.untranslated}/{g.total}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="bg-amber-200 dark:bg-amber-800/50 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0">
                                                                            {g.untranslated} {t('tm.missing')}
                                                                        </span>
                                                                        <div className="text-slate-400 group-hover:text-amber-600 transition-colors">
                                                                            {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Completed */}
                                                {completed.length > 0 && (
                                                    <div>
                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2 px-1">
                                                            {t('tm.completed_group')} ({completed.length})
                                                        </h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                            {completed.map(g => (
                                                                <div
                                                                    key={g.name}
                                                                    onClick={() => setSelectedGroup(g.name)}
                                                                    className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group"
                                                                >
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <span className="font-medium text-sm text-slate-600 dark:text-slate-400 truncate">{g.name}</span>
                                                                        <span className="text-[10px] text-slate-400 flex-shrink-0">{g.total}/{g.total}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0">
                                                                            {t('tm.complete')}
                                                                        </span>
                                                                        <div className="text-slate-400 group-hover:text-slate-600 transition-colors">
                                                                            {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            });
                        })()}
                    </div>
                ) : (
                    /* Level 2: Screen Detail */
                    <div className="max-w-4xl mx-auto w-full pb-20">
                        <button
                            onClick={() => setSelectedGroup(null)}
                            className="mb-6 flex items-center text-sm font-medium text-slate-500 hover:text-cadenza-light transition-colors"
                        >
                            {isRtl ? <ChevronRight size={16} className="ms-1" /> : <ChevronLeft size={16} className="me-1" />}
                            {t('tm.back_to_groups')}
                        </button>

                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Globe className="text-cadenza-light opacity-50" size={20} />
                                {selectedGroup}
                            </h3>
                        </div>

                        <div className="flex flex-col gap-3">
                            {groupedRecords[selectedGroup]?.sort((a: TranslationRecord, b: TranslationRecord) => {
                                // untranslated first
                                if (a.status === 'untranslated' && b.status !== 'untranslated') return -1;
                                if (a.status !== 'untranslated' && b.status === 'untranslated') return 1;
                                return 0;
                            }).map(record => (
                                <div key={record.id} className={`bg-white dark:bg-slate-800 rounded-xl border p-4 shadow-sm relative overflow-hidden transition-colors ${record.status === 'untranslated' ? 'border-amber-300 dark:border-amber-700/50 hover:border-amber-400' : 'border-slate-200 dark:border-slate-700'}`}>
                                    {/* Top Metadata Row */}
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-2 max-w-[70%]">
                                            <code className="text-[10px] font-mono bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 px-2 py-1 rounded truncate pointer-events-none select-none">
                                                {record.key}
                                            </code>
                                            <button
                                                onClick={() => updateRecord(record.key, 'manual_override', !record.manual_override)}
                                                className={`p-1 rounded-full transition-colors ${record.manual_override ? 'text-cadenza-light bg-cadenza-light/10 hover:bg-cadenza-light/20' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                                                title={record.manual_override ? t('tm.lock_tooltip') : t('tm.unlock_tooltip')}
                                            >
                                                {record.manual_override ? <Lock size={12} /> : <Unlock size={12} />}
                                            </button>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-2">
                                            {record.status === 'untranslated' && <span className="text-[10px] uppercase tracking-wide font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">{t('tm.status_untranslated')}</span>}
                                            {record.status === 'auto_translated' && <span className="text-[10px] uppercase tracking-wide font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{t('tm.status_auto')}</span>}
                                            {record.status === 'reviewed' && <span className="text-[10px] uppercase tracking-wide font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">{t('tm.status_reviewed')}</span>}
                                        </div>
                                    </div>

                                    {/* String Editing Area (STRICT LTR/RTL SPLIT) */}
                                    <div className="flex flex-col md:flex-row gap-4 border-t border-slate-100 dark:border-slate-700 pt-3">

                                        {/* Original English (Strict LTR) */}
                                        <div className="flex-1 space-y-1" dir="ltr">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-start">{t('tm.label_original')}</label>
                                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-start">
                                                {record.original_english}
                                            </div>
                                        </div>

                                        {/* Target Hebrew (Strict RTL) */}
                                        <div className="flex-1 space-y-1 relative" dir="rtl">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-start">{t('tm.label_translation')}</label>
                                            <textarea
                                                value={record.he_IL}
                                                onChange={(e) => {
                                                    updateRecord(record.key, 'he_IL', e.target.value);
                                                    if (record.status === 'untranslated') {
                                                        updateRecord(record.key, 'status', 'reviewed');
                                                    }
                                                }}
                                                className={`w-full text-sm font-medium p-3 rounded-lg border ${record.manual_override ? 'bg-cadenza-light/5 border-cadenza-light/30 focus:border-cadenza-light focus:ring-1 focus:ring-cadenza-light outline-none text-slate-900 dark:text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none'} text-start resize-none`}
                                                rows={Math.max(2, Math.ceil(record.original_english.length / 40))}
                                                placeholder="..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
