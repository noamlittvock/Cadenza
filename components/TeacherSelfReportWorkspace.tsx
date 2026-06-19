import React, { useMemo, useState } from 'react';
import { AlertCircle, CalendarPlus, CheckCircle2, Clock, Menu, Pencil, Plus, Send } from 'lucide-react';
import type { CalendarEvent, AppSettings, Teacher } from '../types';
import type { HoursEntry } from '../types/blueprint';
import type { StaffMemberV2 } from '../types/v2';
import { TRANSLATIONS, generateId } from '../constants';
import { nowTimestamp } from '../utils/appTimestamp';
import { eventToV2 } from '../utils/canonicalAdapters';
import {
  applyHoursEntryUpdates,
  buildTeacherHoursEntry,
  editTeacherHoursEntry,
  type HoursPeriodHeader,
  submitTeacherHoursPeriod,
} from '../utils/hoursEntryService';

interface AuthUserLike {
  id: string;
  uid?: string;
  email?: string;
  name?: string;
}

interface Props {
  settings: AppSettings;
  currentUser: AuthUserLike | null;
  orgId: string | null;
  staffMembers: StaffMemberV2[];
  teachers: Teacher[];
  events: CalendarEvent[];
  hoursEntries: HoursEntry[];
  setHoursEntries: (next: HoursEntry[] | ((prev: HoursEntry[]) => HoursEntry[])) => Promise<void>;
  periodHeaders: HoursPeriodHeader[];
  setPeriodHeaders: (next: HoursPeriodHeader[] | ((prev: HoursPeriodHeader[]) => HoursPeriodHeader[])) => Promise<void>;
  onMobileMenuOpen: () => void;
}

type FormState = {
  date: string;
  reportedMinutes: string;
  note: string;
};

const LABELS = {
  'en-US': {
    title: 'Payroll Hours',
    subtitle: 'Teacher self-report',
    period: 'Period',
    start: 'Start',
    end: 'End',
    addEntry: 'Add entry',
    updateEntry: 'Update entry',
    date: 'Date',
    minutes: 'Reported minutes',
    note: 'Note',
    notePlaceholder: 'Work source, context, or adjustment note',
    saveDraft: 'Save draft',
    clear: 'Clear',
    submitPeriod: 'Submit period',
    drafts: 'Draft',
    submitted: 'Submitted',
    approved: 'Approved',
    paid: 'Paid',
    calendar: 'Calendar suggestions',
    addFromCalendar: 'Add',
    noSuggestions: 'No unreported calendar items in this period.',
    entries: 'Entries',
    noEntries: 'No hours entries for this period.',
    noStaff: 'No linked staff profile for this account.',
    noOrg: 'No organization selected.',
    submittedAt: 'Submitted',
    locked: 'Locked',
    edit: 'Edit',
    variance: 'Variance',
    saved: 'Saved',
  },
  'he-IL': {
    title: 'שעות שכר',
    subtitle: 'דיווח עצמי למורה',
    period: 'תקופה',
    start: 'התחלה',
    end: 'סיום',
    addEntry: 'הוספת שורה',
    updateEntry: 'עדכון שורה',
    date: 'תאריך',
    minutes: 'דקות מדווחות',
    note: 'הערה',
    notePlaceholder: 'מקור עבודה, הקשר או הערת תיקון',
    saveDraft: 'שמור טיוטה',
    clear: 'נקה',
    submitPeriod: 'שלח תקופה',
    drafts: 'טיוטה',
    submitted: 'נשלח',
    approved: 'אושר',
    paid: 'שולם',
    calendar: 'הצעות מהיומן',
    addFromCalendar: 'הוסף',
    noSuggestions: 'אין פריטי יומן לא מדווחים בתקופה זו.',
    entries: 'שורות',
    noEntries: 'אין שורות שעות בתקופה זו.',
    noStaff: 'אין פרופיל צוות מקושר לחשבון זה.',
    noOrg: 'לא נבחר ארגון.',
    submittedAt: 'נשלח',
    locked: 'נעול',
    edit: 'עריכה',
    variance: 'פער',
    saved: 'נשמר',
  },
} as const;

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function monthStart(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthEnd(date: Date): string {
  return dateOnly(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function formatMinutes(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(2)} h`;
}

function inPeriod(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export const TeacherSelfReportWorkspace: React.FC<Props> = ({
  settings,
  currentUser,
  orgId,
  staffMembers,
  teachers,
  events,
  hoursEntries,
  setHoursEntries,
  periodHeaders,
  setPeriodHeaders,
  onMobileMenuOpen,
}) => {
  const language = settings.language === 'he-IL' ? 'he-IL' : 'en-US';
  const labels = LABELS[language];
  const tr = (key: string) => TRANSLATIONS[language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const today = new Date();
  const [periodStart, setPeriodStart] = useState(monthStart(today));
  const [periodEnd, setPeriodEnd] = useState(monthEnd(today));
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    date: dateOnly(today),
    reportedMinutes: '60',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const staffProfile = useMemo(() => {
    if (!currentUser) return null;
    const ids = new Set([currentUser.id, currentUser.uid].filter(Boolean));
    const email = currentUser.email?.toLowerCase();
    return (
      staffMembers.find(staff => (staff.uid && ids.has(staff.uid)) || staff.email.toLowerCase() === email) ??
      null
    );
  }, [currentUser, staffMembers]);

  const legacyTeacher = useMemo(() => {
    const email = currentUser?.email?.toLowerCase();
    return teachers.find(teacher => teacher.email?.toLowerCase() === email || teacher.id === staffProfile?.id) ?? null;
  }, [currentUser, staffProfile, teachers]);

  const staffMemberId = staffProfile?.id ?? legacyTeacher?.id ?? null;
  const displayName = staffProfile?.fullName ?? legacyTeacher?.fullName ?? currentUser?.name ?? '';

  const ownEntries = useMemo(() => (
    hoursEntries
      .filter(entry => entry.orgId === orgId && entry.staffMemberId === staffMemberId)
      .sort((a, b) => `${a.date}:${a.createdAt ?? ''}`.localeCompare(`${b.date}:${b.createdAt ?? ''}`))
  ), [hoursEntries, orgId, staffMemberId]);

  const periodRows = useMemo(() => (
    ownEntries.filter(entry => inPeriod(entry.date, periodStart, periodEnd))
  ), [ownEntries, periodEnd, periodStart]);

  const draftRows = periodRows.filter(entry => entry.status === 'DRAFT');
  const submittedRows = periodRows.filter(entry => entry.status === 'SUBMITTED');
  const totalMinutes = periodRows.reduce((sum, entry) => sum + entry.reportedMinutes, 0);
  const calendarMinutes = periodRows.reduce((sum, entry) => sum + entry.calendarMinutes, 0);
  const existingHeader = periodHeaders.find(header => (
    header.orgId === orgId
    && header.staffMemberId === staffMemberId
    && header.periodStart === periodStart
    && header.periodEnd === periodEnd
  )) ?? null;

  const calendarSuggestions = useMemo(() => {
    if (!orgId || !staffMemberId) return [];
    const reportedEventIds = new Set(ownEntries.map(entry => entry.eventId).filter(Boolean));
    return events
      .filter(event => {
        const isStaffEvent = event.staffMemberIds?.includes(staffMemberId) || event.teacherId === staffMemberId;
        return isStaffEvent && !event.isCanceled && !event.isHidden && !event.canceledByBlackoutId && !reportedEventIds.has(event.id);
      })
      .map(event => {
        const canonical = eventToV2(event, {
          orgId,
          timeZone: settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          now: nowTimestamp(),
        });
        return { event, canonical };
      })
      .filter(({ canonical }) => inPeriod(canonical.date, periodStart, periodEnd))
      .sort((a, b) => `${a.canonical.date}:${a.canonical.startTime}`.localeCompare(`${b.canonical.date}:${b.canonical.startTime}`));
  }, [events, orgId, ownEntries, periodEnd, periodStart, settings.timeZone, staffMemberId]);

  const resetForm = () => {
    setEditingEntryId(null);
    setForm({ date: periodStart, reportedMinutes: '60', note: '' });
    setError(null);
  };

  const context = () => {
    if (!orgId) throw new Error(labels.noOrg);
    if (!staffMemberId) throw new Error(labels.noStaff);
    return {
      orgId,
      now: nowIso(),
      actor: {
        userId: currentUser?.id ?? null,
        staffMemberId,
        canAdminManage: false,
      },
    };
  };

  const persistEntry = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const reportedMinutes = Number(form.reportedMinutes);
      const ctx = context();
      const editingEntry = editingEntryId ? hoursEntries.find(entry => entry.id === editingEntryId) : null;
      const nextEntry = (() => {
        if (editingEntryId) {
          if (!editingEntry) throw new Error('Hours entry no longer exists.');
          return editTeacherHoursEntry({
            entry: editingEntry,
            context: ctx,
            patch: {
              date: form.date,
              reportedMinutes,
              note: form.note.trim() || null,
            },
          });
        }
        return buildTeacherHoursEntry({
          context: ctx,
          idFactory: generateId,
          input: {
            date: form.date,
            reportedMinutes,
            note: form.note.trim() || null,
          },
        });
      })();
      await setHoursEntries(prev => applyHoursEntryUpdates(prev, [nextEntry]));
      setMessage(labels.saved);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const addCalendarEntry = async (suggestion: (typeof calendarSuggestions)[number]) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const entry = buildTeacherHoursEntry({
        context: context(),
        idFactory: generateId,
        input: {
          date: suggestion.canonical.date,
          reportedMinutes: suggestion.canonical.durationMinutes,
          calendarMinutes: suggestion.canonical.durationMinutes,
          eventId: suggestion.event.id,
          note: suggestion.event.name,
        },
      });
      await setHoursEntries(prev => applyHoursEntryUpdates(prev, [entry]));
      setMessage(labels.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitPeriod = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const plan = submitTeacherHoursPeriod({
        entries: hoursEntries,
        entryIds: draftRows.map(entry => entry.id),
        existingHeader,
        periodStart,
        periodEnd,
        context: context(),
        headerIdFactory: generateId,
      });
      await setPeriodHeaders(prev => applyHoursEntryUpdates(prev, [plan.header]));
      await setHoursEntries(prev => applyHoursEntryUpdates(prev, plan.entries));
      setMessage(labels.submitted);
      setEditingEntryId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (entry: HoursEntry) => {
    setEditingEntryId(entry.id);
    setForm({
      date: entry.date,
      reportedMinutes: String(entry.reportedMinutes),
      note: entry.note ?? '',
    });
    setError(null);
  };

  const statusLabel = (status: HoursEntry['status']) => ({
    DRAFT: labels.drafts,
    SUBMITTED: labels.submitted,
    APPROVED: labels.approved,
    PAID: labels.paid,
  }[status]);

  return (
    <div className="h-full overflow-y-auto bg-[#f6f0e6] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="sticky top-0 z-20 border-b border-[#e3d6c3] dark:border-slate-800 bg-[#f6f0e6]/95 dark:bg-slate-950/95 backdrop-blur">
        <div className="px-3 sm:px-5 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onMobileMenuOpen}
            className="md:hidden p-2 rounded-lg border border-[#d5c3aa] dark:border-slate-700 text-slate-700 dark:text-slate-200"
            aria-label={tr('layout.open_sidebar')}
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold leading-tight">{labels.title}</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{labels.subtitle}{displayName ? ` · ${displayName}` : ''}</p>
          </div>
          <div className="ms-auto hidden sm:grid grid-cols-3 gap-2 text-end text-xs">
            <div className="rounded-lg border border-[#decfb9] dark:border-slate-800 px-3 py-2 bg-white/60 dark:bg-slate-900">
              <div className="text-slate-500">{labels.entries}</div>
              <div className="font-semibold" dir="ltr">{periodRows.length}</div>
            </div>
            <div className="rounded-lg border border-[#decfb9] dark:border-slate-800 px-3 py-2 bg-white/60 dark:bg-slate-900">
              <div className="text-slate-500">{labels.drafts}</div>
              <div className="font-semibold" dir="ltr">{draftRows.length}</div>
            </div>
            <div className="rounded-lg border border-[#decfb9] dark:border-slate-800 px-3 py-2 bg-white/60 dark:bg-slate-900">
              <div className="text-slate-500">{labels.submitted}</div>
              <div className="font-semibold" dir="ltr">{submittedRows.length}</div>
            </div>
          </div>
        </div>
      </div>

      <main className="p-3 sm:p-5 max-w-7xl mx-auto grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="rounded-lg border border-[#decfb9] dark:border-slate-800 bg-white/75 dark:bg-slate-900 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Clock size={16} />
              {labels.period}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-600 dark:text-slate-400">
                {labels.start}
                <input value={periodStart} onChange={e => setPeriodStart(e.target.value)} type="date" className="mt-1 w-full rounded-md border border-[#d5c3aa] dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600 dark:text-slate-400">
                {labels.end}
                <input value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} type="date" className="mt-1 w-full rounded-md border border-[#d5c3aa] dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-[#efe3d1] dark:bg-slate-800 px-3 py-2">
                <span className="text-slate-500">{labels.entries}</span>
                <div className="font-semibold" dir="ltr">{formatMinutes(totalMinutes)}</div>
              </div>
              <div className="rounded-md bg-[#efe3d1] dark:bg-slate-800 px-3 py-2">
                <span className="text-slate-500">{labels.variance}</span>
                <div className="font-semibold" dir="ltr">{formatMinutes(totalMinutes - calendarMinutes)}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={submitPeriod}
              disabled={busy || draftRows.length === 0 || !staffMemberId}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#7b2d36] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#68242d]"
            >
              <Send size={15} />
              {labels.submitPeriod}
            </button>
            {existingHeader?.submittedAt && (
              <div className="mt-2 text-[11px] text-slate-500">
                {labels.submittedAt}: <span dir="ltr">{new Date(existingHeader.submittedAt).toLocaleString(language)}</span>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[#decfb9] dark:border-slate-800 bg-white/75 dark:bg-slate-900 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
              {editingEntryId ? <Pencil size={16} /> : <Plus size={16} />}
              {editingEntryId ? labels.updateEntry : labels.addEntry}
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-slate-600 dark:text-slate-400">
                {labels.date}
                <input value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} type="date" className="mt-1 w-full rounded-md border border-[#d5c3aa] dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-sm" />
              </label>
              <label className="block text-xs text-slate-600 dark:text-slate-400">
                {labels.minutes}
                <input value={form.reportedMinutes} onChange={e => setForm(prev => ({ ...prev, reportedMinutes: e.target.value }))} type="number" min="0" step="15" dir="ltr" className="mt-1 w-full rounded-md border border-[#d5c3aa] dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-sm" />
              </label>
              <label className="block text-xs text-slate-600 dark:text-slate-400">
                {labels.note}
                <textarea value={form.note} onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))} placeholder={labels.notePlaceholder} rows={3} className="mt-1 w-full rounded-md border border-[#d5c3aa] dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-sm resize-none" />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={persistEntry} disabled={busy || !staffMemberId} className="flex-1 rounded-md bg-[#18324a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {labels.saveDraft}
                </button>
                <button type="button" onClick={resetForm} className="rounded-md border border-[#d5c3aa] dark:border-slate-700 px-3 py-2 text-sm">
                  {labels.clear}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#decfb9] dark:border-slate-800 bg-white/75 dark:bg-slate-900 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
              <CalendarPlus size={16} />
              {labels.calendar}
            </div>
            <div className="space-y-2">
              {calendarSuggestions.length === 0 && <div className="text-sm text-slate-500">{labels.noSuggestions}</div>}
              {calendarSuggestions.slice(0, 8).map(({ event, canonical }) => (
                <div key={event.id} className="flex items-center gap-2 rounded-md border border-[#eadcc7] dark:border-slate-800 px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{event.name}</div>
                    <div className="text-[11px] text-slate-500" dir="ltr">{canonical.date} · {canonical.startTime} · {formatMinutes(canonical.durationMinutes)}</div>
                  </div>
                  <button type="button" onClick={() => addCalendarEntry({ event, canonical })} disabled={busy || !staffMemberId} className="rounded-md border border-[#7b2d36]/30 px-2 py-1 text-xs font-semibold text-[#7b2d36] dark:text-rose-300 disabled:opacity-50">
                    {labels.addFromCalendar}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-[#decfb9] dark:border-slate-800 bg-white/75 dark:bg-slate-900 min-h-[420px]">
          <div className="px-4 py-3 border-b border-[#eadcc7] dark:border-slate-800 flex items-center gap-2">
            <CheckCircle2 size={16} />
            <h2 className="font-semibold">{labels.entries}</h2>
          </div>
          {(error || message || !orgId || !staffMemberId) && (
            <div className="p-3 border-b border-[#eadcc7] dark:border-slate-800">
              {!orgId && <div className="flex items-center gap-2 text-sm text-amber-700"><AlertCircle size={15} />{labels.noOrg}</div>}
              {orgId && !staffMemberId && <div className="flex items-center gap-2 text-sm text-amber-700"><AlertCircle size={15} />{labels.noStaff}</div>}
              {error && <div className="flex items-center gap-2 text-sm text-red-700"><AlertCircle size={15} />{error}</div>}
              {message && <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={15} />{message}</div>}
            </div>
          )}
          <div className="divide-y divide-[#eadcc7] dark:divide-slate-800">
            {periodRows.length === 0 && <div className="p-6 text-sm text-slate-500">{labels.noEntries}</div>}
            {periodRows.map(entry => {
              const editable = entry.status === 'DRAFT';
              return (
                <div key={entry.id} className="p-3 sm:p-4 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)_140px_110px] sm:items-center">
                  <div className="text-sm font-semibold" dir="ltr">{entry.date}</div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{entry.note || entry.eventId || labels.addEntry}</div>
                    <div className="text-[11px] text-slate-500" dir="ltr">
                      {formatMinutes(entry.reportedMinutes)}
                      {entry.calendarMinutes ? ` · cal ${formatMinutes(entry.calendarMinutes)}` : ''}
                    </div>
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                      entry.status === 'DRAFT'
                        ? 'bg-amber-100 text-amber-800'
                        : entry.status === 'SUBMITTED'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {statusLabel(entry.status)}
                    </span>
                  </div>
                  <div className="flex sm:justify-end">
                    {editable ? (
                      <button type="button" onClick={() => startEdit(entry)} className="inline-flex items-center gap-1 rounded-md border border-[#d5c3aa] dark:border-slate-700 px-2 py-1.5 text-xs font-semibold">
                        <Pencil size={13} />
                        {labels.edit}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">{labels.locked}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};
