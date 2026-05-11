import React, { useState, useEffect } from 'react';
import { CalendarEvent, Teacher, Room, AppSettings, GanttBlock } from '../types';
import type { ActivityV2 } from '../types/v2';
import { TRANSLATIONS, generateId, COLORS } from '../constants';
import { Trash2, Filter, AlertTriangle, Check, Calendar, User, Tag, BoxSelect, MousePointer2, ListFilter, Hand, XCircle } from 'lucide-react';
import { DatePicker } from './DatePicker';

interface Props {
    events: CalendarEvent[];
    setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
    teachers: Teacher[];
    rooms: Room[];
    settings: AppSettings;
    selectionMode?: 'NORMAL' | 'MARQUEE';
    setSelectionMode?: (mode: 'NORMAL' | 'MARQUEE') => void;
    selectedEventIds?: Set<string>;
    setSelectedEventIds?: React.Dispatch<React.SetStateAction<Set<string>>>;
    ganttBlocks?: GanttBlock[];
    setGanttBlocks?: React.Dispatch<React.SetStateAction<GanttBlock[]>>;
    activities?: ActivityV2[];
}

export const PowerTools: React.FC<Props> = ({ events, setEvents, teachers, rooms, settings, selectionMode, setSelectionMode, selectedEventIds, setSelectedEventIds, ganttBlocks, setGanttBlocks, activities = [] }) => {
    // Tag filter pool sourced from teacher tags (the value used in the actual filter check, line ~83).
    const allTeacherTags = React.useMemo(() => {
        const seen = new Map<string, string>();
        for (const tch of teachers) {
            if (tch.isArchived) continue;
            for (const tag of tch.tags || []) {
                const k = tag.toLowerCase();
                if (!seen.has(k)) seen.set(k, tag);
            }
        }
        return [...seen.values()].sort((a, b) => a.localeCompare(b));
    }, [teachers]);
    const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

    // Selection Method State
    const [selectionMethod, setSelectionMethod] = useState<'FILTER' | 'MANUAL'>('FILTER');

    // Filter Logic State
    const [deleteStartDate, setDeleteStartDate] = useState('');
    const [deleteEndDate, setDeleteEndDate] = useState('');
    const [filterTeacher, setFilterTeacher] = useState('ALL');
    const [filterType, setFilterType] = useState('ALL');
    const [filterTag, setFilterTag] = useState('ALL');

    // Effect: Cleanup on Unmount (Clear Selection when leaving Power Tools)
    useEffect(() => {
        return () => {
            if (setSelectedEventIds) setSelectedEventIds(new Set());
            if (setSelectionMode) setSelectionMode('NORMAL');
        };
    }, [setSelectedEventIds, setSelectionMode]);

    // Effect: Handle Selection Mode Switching
    useEffect(() => {
        if (setSelectionMode && setSelectedEventIds) {
            if (selectionMethod === 'MANUAL') {
                setSelectionMode('MARQUEE');
            } else {
                setSelectionMode('NORMAL');
                // Persist selection even when leaving manual mode, so user can navigate back
            }
        }
    }, [selectionMethod, setSelectionMode, setSelectedEventIds]);

    // Memoize Filtered Events
    const targetEvents = React.useMemo(() => {
        if (selectionMethod === 'MANUAL') {
            // In manual mode, we return events that are in selectedEventIds
            // But for the visual indicator sync, we actually rely on the USER to select them.
            // When calculating 'targetEvents' for Action, we use the selection set.
            if (!selectedEventIds || selectedEventIds.size === 0) return [];
            return events.filter(e => selectedEventIds.has(e.id));
        } else {
            // Filter Logic
            if (!deleteStartDate || !deleteEndDate) return [];
            const [sYear, sMonth, sDay] = deleteStartDate.split('-').map(Number);
            const start = new Date(sYear, sMonth - 1, sDay, 0, 0, 0).getTime();

            const [eYear, eMonth, eDay] = deleteEndDate.split('-').map(Number);
            const end = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999).getTime();

            return events.filter(evt => {
                const evtStart = new Date(evt.start).getTime();
                if (evtStart < start || evtStart >= end) return false;
                if (filterTeacher !== 'ALL' && evt.teacherId !== filterTeacher) return false;
                if (filterType !== 'ALL') {
                    if (evt.activityId !== filterType) return false;
                }
                if (filterTag !== 'ALL') {
                    const teacher = teachers.find(t => t.id === evt.teacherId);
                    if (!teacher || !teacher.tags.includes(filterTag)) return false;
                }
                return true;
            });
        }
    }, [selectionMethod, events, selectedEventIds, deleteStartDate, deleteEndDate, filterTeacher, filterType, filterTag, teachers, activities]);

    // Effect: Sync Filtered Events to Selection Selection (Show Indicator)
    useEffect(() => {
        if (selectionMethod === 'FILTER' && setSelectedEventIds) {
            // When definition of targetEvents changes in FILTER mode, update selection ring
            const ids = new Set(targetEvents.map(e => e.id));
            setSelectedEventIds(ids);
        }
    }, [targetEvents, selectionMethod, setSelectedEventIds]);


    const count = targetEvents.length;

    const handleBulkAction = (action: 'CANCEL' | 'DELETE') => {
        if (count === 0) return;

        const actionVerb = action === 'CANCEL' ? t('power.action_cancel') : t('power.action_delete');
        const methodDesc = selectionMethod === 'MANUAL' ? t('power.selected_word') : t('power.matching');

        if (window.confirm(`${t('power.confirm_action')} ${actionVerb} ${count} ${methodDesc} ${t('power.events_word')}?`)) {
            if (action === 'DELETE') {
                const idsToDelete = new Set(targetEvents.map(e => e.id));
                setEvents(prev => prev.filter(e => !idsToDelete.has(e.id)));
                if (setSelectedEventIds) setSelectedEventIds(new Set());
                alert(t('power.alert_deleted').replace('${count}', String(count)));
            } else {
                setEvents(prev => prev.map(e => {
                    // If event is in target list, cancel it
                    if (targetEvents.some(target => target.id === e.id)) {
                        return { ...e, isCanceled: true };
                    }
                    return e;
                }));
                if (setSelectedEventIds) setSelectedEventIds(new Set());
                alert(`${t('power.alert_canceled')} ${count} ${t('power.events_word')}.\n\n${t('power.alert_cancel_note')}`);
            }
        }
    };


    return (
        <div className="p-4 space-y-6">
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center mb-1">
                    <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg me-2 text-slate-600 dark:text-slate-300">
                        <BoxSelect size={20} />
                    </div>
                    {t('power.title')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('power.subtitle')}
                </p>
            </div>

            {/* Selection Method Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button
                    onClick={() => setSelectionMethod('FILTER')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center transition-all ${selectionMethod === 'FILTER' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <ListFilter size={14} className="me-1.5" />
                    {t('power.tab_filter')}
                </button>
                <button
                    onClick={() => setSelectionMethod('MANUAL')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md items-center justify-center transition-all hidden md:flex ${selectionMethod === 'MANUAL' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Hand size={14} className="me-1.5" />
                    {t('power.tab_manual')}
                </button>
            </div>

            <div className="space-y-4">
                {selectionMethod === 'FILTER' ? (
                    <>
                        {/* Filter View */}
                        <div className="space-y-4 animate-in fade-in duration-300">
                            {/* Time Range */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('power.time_range')}</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] font-medium text-slate-400 mb-1">{t('power.label_from')}</label>
                                        <DatePicker
                                            type="date"
                                            className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                            value={deleteStartDate}
                                            onChange={e => {
                                                const newStart = e.target.value;
                                                setDeleteStartDate(newStart);
                                                if (!deleteEndDate || (new Date(newStart) > new Date(deleteEndDate))) {
                                                    setDeleteEndDate(newStart);
                                                }
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-slate-400 mb-1">{t('power.label_to')}</label>
                                        <DatePicker
                                            type="date"
                                            className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                            value={deleteEndDate}
                                            onChange={e => {
                                                const newEnd = e.target.value;
                                                setDeleteEndDate(newEnd);
                                                if (deleteStartDate && (new Date(newEnd) < new Date(deleteStartDate))) {
                                                    setDeleteStartDate(newEnd);
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Filters */}
                            <div className="space-y-2 opacity-100 transition-opacity">
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('power.criteria')}</h4>
                                {!deleteStartDate || !deleteEndDate ? (
                                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30">
                                        {t('power.select_time_range_first')}
                                    </div>
                                ) : (
                                    <div className="space-y-2 animate-in fade-in">
                                        <select
                                            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-2 py-1.5 text-xs outline-none"
                                            value={filterTeacher}
                                            onChange={e => setFilterTeacher(e.target.value)}
                                        >
                                            <option value="ALL">{t('power.all_teachers')}</option>
                                            {teachers.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                                        </select>
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-2 py-1.5 text-xs outline-none"
                                                value={filterType}
                                                onChange={e => setFilterType(e.target.value)}
                                            >
                                                <option value="ALL">{t('power.all_activities')}</option>
                                                {activities.filter(a => !a.isArchived).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                            </select>
                                            <select
                                                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-2 py-1.5 text-xs outline-none"
                                                value={filterTag}
                                                onChange={e => setFilterTag(e.target.value)}
                                            >
                                                <option value="ALL">{t('power.all_tags')}</option>
                                                {allTeacherTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    setDeleteStartDate('');
                                    setDeleteEndDate('');
                                    setFilterTeacher('ALL');
                                    setFilterType('ALL');
                                    setFilterTag('ALL');
                                }}
                                className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 dark:text-slate-400 rounded-lg transition-colors flex items-center justify-center font-bold shadow-sm"
                            >
                                <XCircle size={14} className="me-1.5" />
                                {t('power.clear_filters')}
                            </button>
                        </div>
                    </>
                ) : selectionMethod === 'MANUAL' ? (
                    <>
                        {/* Manual View */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 rounded-lg p-3 animate-in fade-in duration-300">
                            <div className="flex items-start">
                                <MousePointer2 className="text-blue-500 mt-0.5 me-2" size={16} />
                                <div>
                                    <h4 className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">{t('power.interactive_selection')}</h4>
                                    <p className="text-[10px] text-blue-600 dark:text-blue-400 leading-relaxed">
                                        {t('power.manual_desc')}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">{t('power.selected_events')}</span>
                            <span className="font-bold text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                                {selectedEventIds?.size || 0}
                            </span>
                        </div>
                        {(selectedEventIds?.size || 0) > 0 && (
                            <button

                                onClick={() => setSelectedEventIds && setSelectedEventIds(new Set())}
                                className="w-full mt-2 py-2 px-4 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors flex items-center justify-center dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                                <XCircle size={14} className="me-2" />
                                {t('power.clear_selection')} ({selectedEventIds?.size})
                            </button>
                        )}
                    </>

                ) : null}


                {/* Footer Actions (Only for Filter/Manual) */}
                {selectionMethod !== 'IMPORT_GANTT' && (
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                        <div className="text-center mb-2">
                            {count > 0 ? (
                                <span className="text-xs font-bold text-slate-800 dark:text-white bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full text-green-700 dark:text-green-400">
                                    {count} {t('power.targeted')}
                                </span>
                            ) : (
                                <span className="text-xs italic text-slate-400">
                                    {selectionMethod === 'FILTER' ? t('power.adjust_filters') : t('power.select_events')}
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleBulkAction('CANCEL')}
                                disabled={count === 0}
                                className={`py-2 rounded-lg font-bold shadow-sm flex items-center justify-center transition-all text-xs ${count > 0
                                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                                    }`}
                            >
                                <XCircle size={14} className="me-1.5" />
                                {t('power.bulk_cancel')}
                            </button>
                            <button
                                onClick={() => handleBulkAction('DELETE')}
                                disabled={count === 0}
                                className={`py-2 rounded-lg font-bold shadow-sm flex items-center justify-center transition-all text-xs ${count > 0
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                                    }`}
                            >
                                <Trash2 size={14} className="me-1.5" />
                                {t('power.bulk_delete')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
};
