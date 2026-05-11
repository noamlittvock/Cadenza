import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import {
  HoursReport, HoursEntry, HoursEntryType, CalendarEvent, Teacher, Activity,
  AppSettings
} from '../types';
import { generateId, TRANSLATIONS } from '../constants';
import { Check, Plus, Trash2, Clock, AlertCircle, Send, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  token: string;
}

type EventResponse = {
  eventId: string;
  entryType: HoursEntryType;
  hours: number;
  absenceReason?: string;
};

type ManualEntry = {
  id: string;
  date: string;
  hours: number;
  description: string;
  activityId: string;
  subcategoryId: string;
};

export const TeacherHoursForm: React.FC<Props> = ({ token }) => {
  const [report, setReport] = useState<HoursReport | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [staffMember, setStaffMember] = useState<Teacher | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [absenceReasonSuggestions, setAbsenceReasonSuggestions] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Event responses keyed by event ID
  const [responses, setResponses] = useState<Record<string, EventResponse>>({});
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const t = (key: string) => {
    const lang = settings?.language || 'en-US';
    return (TRANSLATIONS as Record<string, Record<string, string>>)[lang]?.[key]
      || (TRANSLATIONS as Record<string, Record<string, string>>)['en-US']?.[key]
      || key;
  };

  // Load report and related data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Find the HoursReport by token
        const reportsQuery = query(
          collection(db, 'hoursReports'),
          where('token', '==', token)
        );
        const reportSnap = await getDocs(reportsQuery);

        if (reportSnap.empty) {
          setError('hours.form_invalid_token');
          setLoading(false);
          return;
        }

        const reportDoc = reportSnap.docs[0];
        const reportData = { id: reportDoc.id, ...reportDoc.data() } as HoursReport;

        if (reportData.status === 'SUBMITTED' || reportData.status === 'REVIEWED') {
          setReport(reportData);
          setSubmitted(true);
          setLoading(false);
          return;
        }

        setReport(reportData);
        const orgId = reportData.orgId;

        // Build absence-reason autocomplete pool from prior submitted reports in this org
        const orgReportsSnap = await getDocs(query(
          collection(db, 'hoursReports'),
          where('orgId', '==', orgId),
        ));
        const seenReasons = new Set<string>();
        orgReportsSnap.docs.forEach(d => {
          const data = d.data() as HoursReport;
          (data.reportedEntries || []).forEach((entry: HoursEntry) => {
            const r = entry.absenceReason?.trim();
            if (r) seenReasons.add(r);
          });
        });
        setAbsenceReasonSuggestions([...seenReasons].sort());

        // Load staff member
        const staffQuery = query(
          collection(db, 'teachers'),
          where('orgId', '==', orgId)
        );
        const staffSnap = await getDocs(staffQuery);
        const staff = staffSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Teacher))
          .find(s => s.id === reportData.staffMemberId);

        if (staff) setStaffMember(staff);

        // Load events for the period
        const eventsQuery = query(
          collection(db, 'events'),
          where('orgId', '==', orgId)
        );
        const eventsSnap = await getDocs(eventsQuery);
        const allEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent));

        // Filter events for the staff member and period, exclude PARKED/CANCELED/ARCHIVED
        const periodEvents = allEvents.filter(ev => {
          const eventDate = ev.start.split('T')[0];
          const inPeriod = eventDate >= reportData.periodStart && eventDate <= reportData.periodEnd;
          const isStaffEvent = (ev.staffMemberIds && ev.staffMemberIds.includes(reportData.staffMemberId))
            || ev.teacherId === reportData.staffMemberId;
          const isActive = !ev.isCanceled && !ev.isHidden && !ev.canceledByBlackoutId;
          return inPeriod && isStaffEvent && isActive;
        });

        periodEvents.sort((a, b) => a.start.localeCompare(b.start));
        setEvents(periodEvents);

        // Initialize responses — all confirmed by default
        const initialResponses: Record<string, EventResponse> = {};
        periodEvents.forEach(ev => {
          const durationHours = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / (1000 * 60 * 60);
          initialResponses[ev.id] = {
            eventId: ev.id,
            entryType: 'CALENDAR_CONFIRMED',
            hours: Math.round(durationHours * 100) / 100,
          };
        });
        setResponses(initialResponses);

        // Load activities
        const activitiesQuery = query(
          collection(db, 'activities'),
          where('orgId', '==', orgId)
        );
        const activitiesSnap = await getDocs(activitiesQuery);
        setActivities(activitiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Activity)));

        // Load org settings (absence reasons are now free-text per-entry, no shared catalog)
        const configSnap = await getDocs(collection(db, 'system_configs'));
        configSnap.docs.forEach(d => {
          if (d.id.endsWith('_settings')) {
            setSettings(d.data() as AppSettings);
          }
        });

        setLoading(false);
      } catch (err) {
        console.error('Error loading hours report:', err);
        setError('hours.form_invalid_token');
        setLoading(false);
      }
    };
    loadData();
  }, [token]);

  const toggleEventExpand = (eventId: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const updateResponse = (eventId: string, updates: Partial<EventResponse>) => {
    setResponses(prev => ({
      ...prev,
      [eventId]: { ...prev[eventId], ...updates },
    }));
  };

  const addManualEntry = () => {
    setManualEntries(prev => [...prev, {
      id: generateId(),
      date: report?.periodStart || '',
      hours: 1,
      description: '',
      activityId: '',
      subcategoryId: '',
    }]);
  };

  const updateManualEntry = (id: string, updates: Partial<ManualEntry>) => {
    setManualEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const removeManualEntry = (id: string) => {
    setManualEntries(prev => prev.filter(e => e.id !== id));
  };

  const selectedActivity = (activityId: string) => activities.find(a => a.id === activityId);

  const handleSubmit = async () => {
    if (!report) return;
    setSubmitting(true);

    const entries: HoursEntry[] = [];

    // Calendar event entries
    (Object.values(responses) as EventResponse[]).forEach(resp => {
      const entry: HoursEntry = {
        id: generateId(),
        date: events.find(e => e.id === resp.eventId)?.start.split('T')[0] || '',
        hours: resp.hours,
        entryType: resp.entryType,
        sourceEventId: resp.eventId,
      };
      if (resp.entryType === 'CALENDAR_NOT_COMPLETED' && resp.absenceReason) {
        entry.absenceReason = resp.absenceReason;
      }
      entries.push(entry);
    });

    // Manual entries
    manualEntries.forEach(me => {
      const entry: HoursEntry = {
        id: generateId(),
        date: me.date,
        hours: me.hours,
        entryType: 'MANUAL',
        description: me.description || undefined,
        activityId: me.activityId || undefined,
        subcategoryId: me.subcategoryId || undefined,
      };
      entries.push(entry);
    });

    try {
      const reportRef = doc(db, 'hoursReports', report.id);
      await updateDoc(reportRef, {
        reportedEntries: entries,
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Error submitting report:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString(settings?.language || 'en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(settings?.language || 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h1 className="text-xl font-bold text-slate-800 mb-2">{t('hours.form_title')}</h1>
          <p className="text-slate-500">{t(error)}</p>
        </div>
      </div>
    );
  }

  // Submitted state
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="text-green-600" size={32} />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">{t('hours.form_submitted')}</h1>
          <p className="text-slate-500">{t('hours.form_submitted_msg')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Shared datalist for absence-reason inputs (browser-native autocomplete) */}
      <datalist id="absence-reason-suggestions">
        {absenceReasonSuggestions.map(r => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-slate-800">{t('hours.form_title')}</h1>
          <p className="text-slate-500 mt-1">{t('hours.form_subtitle')}</p>
          {staffMember && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: staffMember.color || '#6E1A1A' }}>
                {staffMember.fullName.charAt(0)}
              </div>
              <span className="font-medium text-slate-700">{staffMember.fullName}</span>
            </div>
          )}
          {report && (
            <div className="mt-2 text-sm text-slate-500">
              <span className="font-medium">{t('hours.form_period')}:</span> {report.periodStart} — {report.periodEnd}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Scheduled Events */}
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Clock size={20} className="text-blue-500" />
            {t('hours.form_events')}
          </h2>

          {events.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-8">{t('hours.form_no_events')}</p>
          ) : (
            <div className="space-y-3">
              {events.map(ev => {
                const resp = responses[ev.id];
                if (!resp) return null;
                const durationHours = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / (1000 * 60 * 60);
                const scheduledHours = Math.round(durationHours * 100) / 100;
                const isExpanded = expandedEvents.has(ev.id);

                return (
                  <div key={ev.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Event Header */}
                    <button
                      type="button"
                      onClick={() => toggleEventExpand(ev.id)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 text-start">
                        <div className="w-1 h-10 rounded-full" style={{ backgroundColor: staffMember?.color || '#6E1A1A' }} />
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{ev.name}</p>
                          <p className="text-xs text-slate-500">{formatDate(ev.start)} · {formatTime(ev.start)} – {formatTime(ev.end)} · {scheduledHours}h</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          resp.entryType === 'CALENDAR_CONFIRMED' ? 'bg-green-100 text-green-700' :
                          resp.entryType === 'CALENDAR_ADJUSTED' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-200 text-slate-600'
                        }`}>
                          {resp.entryType === 'CALENDAR_CONFIRMED' ? t('hours.entry_confirmed') :
                           resp.entryType === 'CALENDAR_ADJUSTED' ? t('hours.entry_adjusted') :
                           t('hours.entry_not_completed')}
                        </span>
                        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </div>
                    </button>

                    {/* Expanded Response Options */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                        {/* Entry Type Selector */}
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            ['CALENDAR_CONFIRMED', t('hours.form_confirmed'), 'bg-green-50 border-green-300 text-green-700'],
                            ['CALENDAR_ADJUSTED', t('hours.form_adjusted'), 'bg-amber-50 border-amber-300 text-amber-700'],
                            ['CALENDAR_NOT_COMPLETED', t('hours.form_not_completed'), 'bg-slate-100 border-slate-300 text-slate-600'],
                          ] as [HoursEntryType, string, string][]).map(([type, label, activeClass]) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                const updates: Partial<EventResponse> = { entryType: type };
                                if (type === 'CALENDAR_CONFIRMED') updates.hours = scheduledHours;
                                if (type === 'CALENDAR_NOT_COMPLETED') updates.hours = 0;
                                updateResponse(ev.id, updates);
                              }}
                              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                                resp.entryType === type ? activeClass : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {/* Adjusted Duration */}
                        {resp.entryType === 'CALENDAR_ADJUSTED' && (
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">{t('hours.form_actual_hours')}</label>
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              value={resp.hours}
                              onChange={e => updateResponse(ev.id, { hours: parseFloat(e.target.value) || 0 })}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        )}

                        {/* Absence Reason */}
                        {resp.entryType === 'CALENDAR_NOT_COMPLETED' && (
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">{t('hours.form_absence_reason')}</label>
                            <input
                              type="text"
                              list="absence-reason-suggestions"
                              value={resp.absenceReason || ''}
                              onChange={e => updateResponse(ev.id, { absenceReason: e.target.value })}
                              placeholder={t('hours.form_select_reason')}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Manual Entries */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Plus size={20} className="text-blue-500" />
              {t('hours.form_manual_entries')}
            </h2>
            <button
              type="button"
              onClick={addManualEntry}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1.5 border border-blue-200"
            >
              <Plus size={14} />
              {t('hours.form_add_manual')}
            </button>
          </div>

          {manualEntries.length > 0 && (
            <div className="space-y-3">
              {manualEntries.map(entry => (
                <div key={entry.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="grid grid-cols-2 gap-3 flex-1">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{t('hours.form_date')}</label>
                        <input
                          type="date"
                          value={entry.date}
                          min={report?.periodStart}
                          max={report?.periodEnd}
                          onChange={e => updateManualEntry(entry.id, { date: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{t('hours.form_hours')}</label>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={entry.hours}
                          onChange={e => updateManualEntry(entry.id, { hours: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeManualEntry(entry.id)}
                      className="ms-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t('hours.form_description')}</label>
                    <input
                      type="text"
                      value={entry.description}
                      onChange={e => updateManualEntry(entry.id, { description: e.target.value })}
                      placeholder={t('hours.form_description')}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('hours.form_activity')}</label>
                      <select
                        value={entry.activityId}
                        onChange={e => updateManualEntry(entry.id, { activityId: e.target.value, subcategoryId: '' })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{t('label.optional')}</option>
                        {activities.filter(a => !a.isArchived).map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('hours.form_subcategory')}</label>
                      <select
                        value={entry.subcategoryId}
                        onChange={e => updateManualEntry(entry.id, { subcategoryId: e.target.value })}
                        disabled={!entry.activityId}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <option value="">{t('label.optional')}</option>
                        {(selectedActivity(entry.activityId)?.subcategories || [])
                          .filter(s => !s.isArchived)
                          .map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-4 pb-8">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send size={18} />
            {submitting ? '...' : t('hours.form_submit')}
          </button>
        </div>
      </div>
    </div>
  );
};
