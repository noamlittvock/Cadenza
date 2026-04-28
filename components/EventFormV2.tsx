import React, { useState, useMemo, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { CalendarEvent, RecurrenceRule, DayOfWeek, Room, AppSettings } from '../types';
import {
  ActivityV2, L1Subcategory, L2Subcategory, StaffMemberV2,
  TeachingAssignmentV2, OrgRoleV2, EventParticipant,
  EventNameMode,
} from '../types/v2';
import { generateId } from '../constants';
import { useAuth } from '../context/AuthContext';
import { DatePicker } from './DatePicker';
import { Plus, Trash2, ChevronDown, ChevronUp, Repeat, HelpCircle, X } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_ABBR: DayOfWeek[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const PREFILL_KEY = 'cadenza_event_prefill';
const WALKTHROUGH_KEY = 'cadenza_event_walkthrough_done';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StaffParticipantDraft {
  staffMemberId: string;
  assignmentType: 'TEACHING' | 'ORG_ROLE';
  teachingAssignmentId?: string;
  orgRoleId?: string;
}

interface ExternalParticipantDraft {
  id: string;
  externalName: string;
  notes: string;
}

export interface EventFormState {
  // Zone 1
  activityId: string;
  l1Id: string;
  l2Id: string;
  name: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  location: string;
  roomId: string;
  // Zone 2
  staffParticipants: StaffParticipantDraft[];
  // Zone 3
  externalParticipants: ExternalParticipantDraft[];
  // Recurrence (passthrough from v1.3)
  recurrenceRule?: RecurrenceRule;
  // Status
  isCanceled: boolean;
  notes: string;
}

export interface EventFormV2Handle {
  triggerSave: () => void;
  isSaving: boolean;
}

export interface EventFormV2Props {
  // v2 data
  activitiesV2: ActivityV2[];
  l1Subcategories: L1Subcategory[];
  l2Subcategories: L2Subcategory[];
  staffMembers: StaffMemberV2[];
  teachingAssignments: TeachingAssignmentV2[];
  orgRoles: OrgRoleV2[];
  // v1.3 compat
  rooms: Room[];
  settings: AppSettings;
  // Form lifecycle
  editingEventId: string | null;
  existingFormState?: Partial<EventFormState>;
  existingParticipants?: EventParticipant[];
  // Recurrence passthrough
  isExceptionEdit?: boolean;
  initialStart?: string; // ISO string from slot click
  initialEnd?: string;
  // Callbacks
  onSave: (form: EventFormState) => void;
  // Translation
  t: (key: string) => string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoToDate(iso: string): string {
  return iso ? new Date(iso).toISOString().split('T')[0] : '';
}

function isoToTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateDisplay(date: string): string {
  if (!date) return '';
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────────

export const EventFormV2 = forwardRef<EventFormV2Handle, EventFormV2Props>(({
  activitiesV2, l1Subcategories, l2Subcategories, staffMembers,
  teachingAssignments, orgRoles,
  rooms, settings,
  editingEventId, existingFormState, existingParticipants,
  isExceptionEdit, initialStart, initialEnd,
  onSave,
  t,
}, ref) => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || '';

  // ─── Walkthrough State ───────────────────────────────────────────────────
  const walkthroughDone = uid ? localStorage.getItem(`${WALKTHROUGH_KEY}_${uid}`) === 'true' : true;
  const [walkthroughStep, setWalkthroughStep] = useState<number | null>(
    !editingEventId && !walkthroughDone ? 1 : null
  );

  const dismissWalkthrough = useCallback(() => {
    setWalkthroughStep(null);
    if (uid) localStorage.setItem(`${WALKTHROUGH_KEY}_${uid}`, 'true');
  }, [uid]);

  // ─── Pre-fill ────────────────────────────────────────────────────────────
  const prefill = useMemo(() => {
    if (editingEventId) return null;
    try {
      const raw = uid ? localStorage.getItem(`${PREFILL_KEY}_${uid}`) : null;
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { activityId?: string; l1Id?: string; l2Id?: string };
      // Stale detection: clear if activity is archived
      if (parsed.activityId) {
        const act = activitiesV2.find(a => a.id === parsed.activityId);
        if (!act || act.isArchived) return null;
      }
      if (parsed.l2Id) {
        const l2 = l2Subcategories.find(l => l.id === parsed.l2Id);
        if (!l2 || l2.isArchived) { parsed.l2Id = undefined; }
      }
      if (parsed.l1Id) {
        const l1 = l1Subcategories.find(l => l.id === parsed.l1Id);
        if (!l1 || l1.isArchived) { parsed.l1Id = undefined; }
      }
      return parsed;
    } catch { return null; }
  }, [editingEventId, uid, activitiesV2, l1Subcategories, l2Subcategories]);

  // ─── Form State ──────────────────────────────────────────────────────────
  const buildInitialState = useCallback((): EventFormState => {
    if (existingFormState) {
      return {
        activityId: '', l1Id: '', l2Id: '', name: '', date: '', startTime: '', endTime: '',
        location: '', roomId: '',
        staffParticipants: [], externalParticipants: [],
        isCanceled: false, notes: '',
        ...existingFormState,
      };
    }
    return {
      activityId: prefill?.activityId || '',
      l1Id: prefill?.l1Id || '',
      l2Id: prefill?.l2Id || '',
      name: '',
      date: initialStart ? isoToDate(initialStart) : new Date().toISOString().split('T')[0],
      startTime: initialStart ? isoToTime(initialStart) : '09:00',
      endTime: initialEnd ? isoToTime(initialEnd) : '10:00',
      location: '',
      roomId: '',
      staffParticipants: [],
      externalParticipants: [],
      isCanceled: false,
      notes: '',
    };
  }, [existingFormState, prefill, initialStart, initialEnd]);

  const [form, setForm] = useState<EventFormState>(buildInitialState);
  const [zone3Open, setZone3Open] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showPrefillNotice, setShowPrefillNotice] = useState(!!prefill?.activityId && !editingEventId);

  // ─── Derived Data ────────────────────────────────────────────────────────
  const selectedActivity = useMemo(
    () => activitiesV2.find(a => a.id === form.activityId) || null,
    [activitiesV2, form.activityId]
  );

  const modules = selectedActivity?.modules || {
    curriculum: false,
    externalParticipants: false,
  };

  const template = selectedActivity?.template || null;
  const eventNameMode: EventNameMode = selectedActivity?.eventNameMode || 'PROMPTED';

  // Template-based L1/L2 visibility: DISCIPLINE shows both, PROGRAM shows L2 only, others hide both
  const showL1Field = template === 'DISCIPLINE';
  const showL2Field = template === 'DISCIPLINE' || template === 'PROGRAM';

  // L1/L2 options filtered by activity
  const l1Options = useMemo(
    () => l1Subcategories.filter(l => l.activityId === form.activityId && !l.isArchived),
    [l1Subcategories, form.activityId]
  );
  const l2Options = useMemo(
    () => l2Subcategories.filter(l => {
      if (l.activityId !== form.activityId || l.isArchived) return false;
      if (form.l1Id && l.l1Id !== form.l1Id) return false;
      return true;
    }),
    [l2Subcategories, form.activityId, form.l1Id]
  );

  // Staff with active teaching assignments for this activity + L2
  const eligibleStaff = useMemo(() => {
    if (template === 'ADMINISTRATIVE') return [];
    return staffMembers.filter(sm => {
      if (sm.isArchived) return false;
      return teachingAssignments.some(ta =>
        ta.staffMemberId === sm.id &&
        ta.activityId === form.activityId &&
        (!form.l2Id || ta.l2Id === form.l2Id) &&
        !ta.isArchived &&
        ta.startDate <= form.date &&
        (!ta.endDate || ta.endDate >= form.date)
      );
    });
  }, [staffMembers, teachingAssignments, form.activityId, form.l2Id, form.date, template]);

  // Org roles for selected staff (administrative template)
  const getActiveOrgRoles = useCallback((staffMemberId: string) => {
    return orgRoles.filter(r =>
      r.staffMemberId === staffMemberId &&
      !r.isArchived &&
      r.startDate <= form.date &&
      (!r.endDate || r.endDate >= form.date)
    );
  }, [orgRoles, form.date]);

  // Resolve teaching assignment rate for a staff+activity+l2
  const resolveAssignment = useCallback((staffMemberId: string) => {
    return teachingAssignments.find(ta =>
      ta.staffMemberId === staffMemberId &&
      ta.activityId === form.activityId &&
      (!form.l2Id || ta.l2Id === form.l2Id) &&
      !ta.isArchived &&
      ta.startDate <= form.date &&
      (!ta.endDate || ta.endDate >= form.date)
    ) || null;
  }, [teachingAssignments, form.activityId, form.l2Id, form.date]);

  // ─── Activity change → reset dependent fields ────────────────────────────
  const handleActivityChange = (actId: string) => {
    const act = activitiesV2.find(a => a.id === actId);
    setForm(prev => ({
      ...prev,
      activityId: actId,
      l1Id: '',
      l2Id: '',
      name: '',
      location: act?.location || '',
      staffParticipants: [],
      externalParticipants: [],
    }));
    setErrors({});
    if (walkthroughStep === 1) setWalkthroughStep(2);
  };

  // Auto-populate location when activity changes
  useEffect(() => {
    if (selectedActivity?.location && !form.location) {
      setForm(prev => ({ ...prev, location: selectedActivity.location || '' }));
    }
  }, [selectedActivity]);

  // ─── Validation ──────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!form.activityId) errs.activityId = t('event.v2.select_activity');
    if (!form.date) errs.date = t('event.v2.date');
    if (!form.startTime) errs.startTime = t('event.v2.start_time');
    if (!form.endTime) errs.endTime = t('event.v2.end_time');

    if (form.startTime && form.endTime) {
      if (form.endTime <= form.startTime) {
        errs.endTime = t('event.v2.err_end_before_start');
      }
      if (form.endTime === form.startTime) {
        errs.endTime = t('event.v2.err_zero_duration');
      }
    }

    // PROMPTED name required
    if (eventNameMode === 'PROMPTED' && !form.name.trim()) {
      errs.name = t('event.v2.name_placeholder');
    }

    // Staff required for DISCIPLINE/PROGRAM
    if (template === 'DISCIPLINE' || template === 'PROGRAM') {
      if (form.staffParticipants.length === 0) {
        errs.staff = t('event.v2.err_staff_required');
      }
    }

    // Org role required for ADMINISTRATIVE
    if (template === 'ADMINISTRATIVE') {
      if (form.staffParticipants.length === 0) {
        errs.staff = t('event.v2.err_role_required');
      }
    }

    // Timezone must be configured
    if (!settings.timeZone) {
      errs.timezone = t('event.v2.err_no_timezone');
    }

    // Assignment date range check: staff added for one date may be out of range if date changed
    if (template !== 'ADMINISTRATIVE' && !errs.staff) {
      for (const sp of form.staffParticipants) {
        if (sp.assignmentType !== 'TEACHING') continue;
        const active = resolveAssignment(sp.staffMemberId);
        if (!active) {
          // Find any matching assignment to determine why it's inactive
          const anyTA = teachingAssignments.find(ta =>
            ta.staffMemberId === sp.staffMemberId &&
            ta.activityId === form.activityId &&
            (!form.l2Id || ta.l2Id === form.l2Id) &&
            !ta.isArchived,
          );
          if (anyTA) {
            if (form.date && anyTA.startDate > form.date) {
              errs.staff = t('event.v2.err_assignment_not_started').replace('{startDate}', anyTA.startDate);
            } else if (anyTA.endDate && form.date && anyTA.endDate < form.date) {
              errs.staff = t('event.v2.err_assignment_ended').replace('{endDate}', anyTA.endDate);
            }
            break;
          }
        }
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Save ────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!validate()) return;
    setIsSaving(true);

    // Generate AUTO name if needed
    let finalForm = { ...form };
    if (eventNameMode === 'AUTO') {
      const l2 = l2Subcategories.find(l => l.id === form.l2Id);
      const l2Name = l2?.name || selectedActivity?.name || '';
      const dateStr = formatDateDisplay(form.date);
      if (form.staffParticipants.length === 1) {
        const staff = staffMembers.find(s => s.id === form.staffParticipants[0].staffMemberId);
        const firstName = staff?.fullName.split(' ')[0] || '';
        finalForm.name = `${l2Name} · ${firstName} · ${dateStr}`;
      } else {
        finalForm.name = `${l2Name} · ${dateStr}`;
      }
    }

    // Save pre-fill for next time
    if (uid) {
      localStorage.setItem(`${PREFILL_KEY}_${uid}`, JSON.stringify({
        activityId: form.activityId,
        l1Id: form.l1Id,
        l2Id: form.l2Id,
      }));
    }

    // Dismiss walkthrough
    if (walkthroughStep !== null) dismissWalkthrough();

    onSave(finalForm);
  };

  useImperativeHandle(ref, () => ({ triggerSave: handleSave, isSaving }));

  // ─── Staff participant management ────────────────────────────────────────
  const addStaffParticipant = (staffId: string, assignmentType: 'TEACHING' | 'ORG_ROLE') => {
    if (form.staffParticipants.some(sp => sp.staffMemberId === staffId)) return;

    const draft: StaffParticipantDraft = { staffMemberId: staffId, assignmentType };

    if (assignmentType === 'TEACHING') {
      const assignment = resolveAssignment(staffId);
      if (assignment) {
        draft.teachingAssignmentId = assignment.id;
      }
    }

    setForm(prev => ({
      ...prev,
      staffParticipants: [...prev.staffParticipants, draft],
    }));
    if (walkthroughStep === 3) setWalkthroughStep(4);
  };

  const removeStaffParticipant = (staffId: string) => {
    setForm(prev => ({
      ...prev,
      staffParticipants: prev.staffParticipants.filter(sp => sp.staffMemberId !== staffId),
    }));
  };

  const setStaffOrgRole = (staffId: string, roleId: string) => {
    setForm(prev => ({
      ...prev,
      staffParticipants: prev.staffParticipants.map(sp =>
        sp.staffMemberId === staffId ? { ...sp, orgRoleId: roleId } : sp
      ),
    }));
  };

  // ─── External participant management ─────────────────────────────────────
  const addExternalParticipant = () => {
    setForm(prev => ({
      ...prev,
      externalParticipants: [...prev.externalParticipants, {
        id: generateId(), externalName: '', notes: '',
      }],
    }));
  };

  const updateExternalParticipant = (id: string, updates: Partial<ExternalParticipantDraft>) => {
    setForm(prev => ({
      ...prev,
      externalParticipants: prev.externalParticipants.map(ep => ep.id === id ? { ...ep, ...updates } : ep),
    }));
  };

  const removeExternalParticipant = (id: string) => {
    setForm(prev => ({
      ...prev,
      externalParticipants: prev.externalParticipants.filter(ep => ep.id !== id),
    }));
  };

  // ─── CSS helpers ─────────────────────────────────────────────────────────
  const inputCls = 'w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500';
  const selectCls = 'w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none';
  const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';
  const errorCls = 'text-xs text-red-500 mt-1';

  // ─── Walkthrough overlay ─────────────────────────────────────────────────
  const renderWalkthroughStep = () => {
    if (walkthroughStep === null) return null;
    const stepKey = `event.v2.walkthrough.step${walkthroughStep}`;
    return (
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">{walkthroughStep}</div>
            <span className="text-sm text-blue-800 dark:text-blue-200 font-medium">{t(stepKey)}</span>
          </div>
          <button onClick={dismissWalkthrough} className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-1 mt-2">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= walkthroughStep! ? 'bg-blue-500' : 'bg-blue-200 dark:bg-blue-800'}`} />
          ))}
        </div>
      </div>
    );
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Guide Me link */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{editingEventId ? t('event.edit') : t('event.new')}</span>
        <button
          onClick={() => setWalkthroughStep(1)}
          className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
        >
          <HelpCircle size={12} /> {t('event.v2.guide_me')}
        </button>
      </div>

      {/* Walkthrough */}
      {renderWalkthroughStep()}

      {/* Pre-fill notice */}
      {showPrefillNotice && (
        <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between">
          <span className="text-xs text-amber-700 dark:text-amber-300">{t('event.v2.prefill.notice')}</span>
          <button onClick={() => setShowPrefillNotice(false)} className="text-amber-400 hover:text-amber-600"><X size={14} /></button>
        </div>
      )}

      {/* Validation summary — surfaced at top so failures aren't missed */}
      {Object.keys(errors).length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
            {t('event.v2.err_summary_title') || 'Please fix the following before saving:'}
          </p>
          <ul className="list-disc ms-5 text-xs text-red-600 dark:text-red-400 space-y-0.5">
            {Object.values(errors).map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ═══ ZONE 1: Always Visible ═══ */}

      {/* Activity picker */}
      <div>
        <label className={labelCls}>{t('event.activity')} <span className="text-red-500">*</span></label>
        <select
          className={selectCls}
          value={form.activityId}
          onChange={e => handleActivityChange(e.target.value)}
        >
          <option value="" disabled>{t('event.v2.select_activity')}</option>
          {activitiesV2.filter(a => !a.isArchived).map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.template})</option>
          ))}
        </select>
        {errors.activityId && <p className={errorCls}>{errors.activityId}</p>}
      </div>

      {/* L1 cascade — DISCIPLINE only */}
      {form.activityId && showL1Field && l1Options.length > 0 && (
        <div>
          <label className={labelCls}>{t('event.v2.select_l1')}</label>
          <select className={selectCls} value={form.l1Id} onChange={e => setForm(prev => ({ ...prev, l1Id: e.target.value, l2Id: '' }))}>
            <option value="">{t('event.v2.select_l1')}</option>
            {l1Options.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {/* L2 cascade — DISCIPLINE + PROGRAM */}
      {form.activityId && showL2Field && l2Options.length > 0 && (
        <div>
          <label className={labelCls}>{t('event.v2.select_l2')}</label>
          <select className={selectCls} value={form.l2Id} onChange={e => setForm(prev => ({ ...prev, l2Id: e.target.value, staffParticipants: [] }))}>
            <option value="">{t('event.v2.select_l2')}</option>
            {l2Options.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {/* Event Name */}
      {form.activityId && (
        <div>
          <label className={labelCls}>
            {t('event.v2.name')}
            {eventNameMode === 'AUTO'
              ? <span className="text-xs text-slate-400 font-normal ms-2">{t('event.v2.name_auto')}</span>
              : <span className="text-red-500"> *</span>
            }
          </label>
          {eventNameMode === 'PROMPTED' ? (
            <input
              className={inputCls}
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder={selectedActivity ? `${selectedActivity.name} · ${formatDateDisplay(form.date)}` : t('event.v2.name_placeholder')}
            />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">
              {form.staffParticipants.length === 1
                ? `${l2Subcategories.find(l => l.id === form.l2Id)?.name || selectedActivity?.name || ''} · ${staffMembers.find(s => s.id === form.staffParticipants[0].staffMemberId)?.fullName.split(' ')[0] || ''} · ${formatDateDisplay(form.date)}`
                : `${l2Subcategories.find(l => l.id === form.l2Id)?.name || selectedActivity?.name || ''} · ${formatDateDisplay(form.date)}`
              }
            </p>
          )}
          {errors.name && <p className={errorCls}>{errors.name}</p>}
        </div>
      )}

      {/* Date & Time */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>{t('event.v2.date')} <span className="text-red-500">*</span></label>
          <input
            type="date"
            className={inputCls}
            value={form.date}
            onChange={e => {
              setForm(prev => ({ ...prev, date: e.target.value }));
              if (walkthroughStep === 2) setWalkthroughStep(3);
            }}
          />
          {errors.date && <p className={errorCls}>{errors.date}</p>}
          {errors.timezone && <p className={errorCls}>{errors.timezone}</p>}
        </div>
        <div>
          <label className={labelCls}>{t('event.v2.start_time')} <span className="text-red-500">*</span></label>
          <input
            type="time"
            className={inputCls}
            value={form.startTime}
            onChange={e => {
              const val = e.target.value;
              setForm(prev => {
                const next = { ...prev, startTime: val };
                // Auto-advance end time if needed
                if (val >= prev.endTime) {
                  const [h, m] = val.split(':').map(Number);
                  next.endTime = `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                }
                return next;
              });
            }}
          />
          {errors.startTime && <p className={errorCls}>{errors.startTime}</p>}
        </div>
        <div>
          <label className={labelCls}>{t('event.v2.end_time')} <span className="text-red-500">*</span></label>
          <input
            type="time"
            className={inputCls}
            value={form.endTime}
            onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))}
          />
          {errors.endTime && <p className={errorCls}>{errors.endTime}</p>}
        </div>
      </div>

      {/* Location */}
      {form.activityId && (
        <div>
          <label className={labelCls}>
            {t('event.v2.location')}
            {selectedActivity?.location && <span className="text-xs text-slate-400 font-normal ms-2">({t('event.v2.location_inherited')})</span>}
          </label>
          <input
            className={inputCls}
            value={form.location}
            onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
            placeholder={t('event.v2.location_placeholder')}
          />
        </div>
      )}

      {/* Room picker */}
      {form.activityId && rooms.length > 0 && (
        <div>
          <label className={labelCls}>{t('event.v2.room') || 'Room'}</label>
          <select
            className={selectCls}
            value={form.roomId}
            onChange={e => setForm(prev => ({ ...prev, roomId: e.target.value }))}
          >
            <option value="">{t('event.v2.no_room') || '— No room —'}</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ═══ ZONE 2: Module-Driven (visible when activity selected) ═══ */}
      {selectedActivity && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('event.v2.zone2_title')}</h4>

          {/* ── Staff (non-ADMINISTRATIVE templates) ── */}
          {template !== 'ADMINISTRATIVE' && (
            <div>
              <label className={labelCls}>
                {t('event.v2.staff')}
                {(template === 'DISCIPLINE' || template === 'PROGRAM') && <span className="text-red-500"> *</span>}
              </label>

              {/* Existing staff participants */}
              {form.staffParticipants.filter(sp => sp.assignmentType === 'TEACHING').map(sp => {
                const staff = staffMembers.find(s => s.id === sp.staffMemberId);
                return (
                  <div key={sp.staffMemberId} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-lg p-2 mb-2">
                    <div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{staff?.fullName}</span>
                    </div>
                    <button onClick={() => removeStaffParticipant(sp.staffMemberId)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                  </div>
                );
              })}

              {/* Add staff picker */}
              <select
                className={selectCls}
                value=""
                onChange={e => {
                  if (e.target.value) addStaffParticipant(e.target.value, 'TEACHING');
                }}
              >
                <option value="">{t('event.v2.add_staff')}</option>
                {eligibleStaff
                  .filter(s => !form.staffParticipants.some(sp => sp.staffMemberId === s.id))
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))
                }
              </select>
              {errors.staff && <p className={errorCls}>{errors.staff}</p>}
            </div>
          )}

          {/* ── Org Role (Administrative templates) ── */}
          {template === 'ADMINISTRATIVE' && (
            <div>
              <label className={labelCls}>
                {t('event.v2.org_role')} <span className="text-red-500">*</span>
              </label>

              {/* Existing org role participants */}
              {form.staffParticipants.filter(sp => sp.assignmentType === 'ORG_ROLE').map(sp => {
                const staff = staffMembers.find(s => s.id === sp.staffMemberId);
                const activeRoles = getActiveOrgRoles(sp.staffMemberId);
                const selectedRole = orgRoles.find(r => r.id === sp.orgRoleId);
                return (
                  <div key={sp.staffMemberId} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 mb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{staff?.fullName}</span>
                      <button onClick={() => removeStaffParticipant(sp.staffMemberId)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                    </div>
                    {activeRoles.length > 1 && !sp.orgRoleId && (
                      <div className="mt-2">
                        <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">{t('event.v2.multiple_roles')}</p>
                        <select className={selectCls} value={sp.orgRoleId || ''} onChange={e => setStaffOrgRole(sp.staffMemberId, e.target.value)}>
                          <option value="">{t('event.v2.select_role')}</option>
                          {activeRoles.map(r => (
                            <option key={r.id} value={r.id}>{r.roleTitle}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {selectedRole && (
                      <span className="text-xs text-slate-400">{selectedRole.roleTitle}</span>
                    )}
                  </div>
                );
              })}

              {/* Add org role staff picker */}
              <select
                className={selectCls}
                value=""
                onChange={e => {
                  if (e.target.value) {
                    const staffId = e.target.value;
                    const roles = getActiveOrgRoles(staffId);
                    const draft: StaffParticipantDraft = {
                      staffMemberId: staffId,
                      assignmentType: 'ORG_ROLE',
                    };
                    // Auto-resolve if single role
                    if (roles.length === 1) {
                      draft.orgRoleId = roles[0].id;
                    }
                    setForm(prev => ({
                      ...prev,
                      staffParticipants: [...prev.staffParticipants, draft],
                    }));
                    if (walkthroughStep === 3) setWalkthroughStep(4);
                  }
                }}
              >
                <option value="">{t('event.v2.add_staff')}</option>
                {staffMembers
                  .filter(s => !s.isArchived && !form.staffParticipants.some(sp => sp.staffMemberId === s.id))
                  .filter(s => getActiveOrgRoles(s.id).length > 0)
                  .map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)
                }
              </select>
              {errors.staff && <p className={errorCls}>{errors.staff}</p>}
            </div>
          )}

        </div>
      )}

      {/* ═══ ZONE 3: Exceptions (collapsed by default) ═══ */}
      {selectedActivity && (form.staffParticipants.length > 0 || modules.externalParticipants) && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
          <button
            type="button"
            onClick={() => setZone3Open(!zone3Open)}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1"
          >
            {zone3Open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {t('event.v2.add_exception')}
          </button>

          {zone3Open && (
            <div className="mt-3 space-y-4">
              {/* External participants — only ENSEMBLE/EXTERNAL templates */}
              {modules.externalParticipants && (template === 'ENSEMBLE' || template === 'EXTERNAL') && (
                <div>
                  <label className={labelCls}>{t('event.v2.external')}</label>
                  {form.externalParticipants.map(ep => (
                    <div key={ep.id} className="grid grid-cols-[1fr_auto] gap-2 mb-2 items-end">
                      <input
                        className={inputCls}
                        value={ep.externalName}
                        onChange={e => updateExternalParticipant(ep.id, { externalName: e.target.value })}
                        placeholder={t('event.v2.external_name')}
                      />
                      <button onClick={() => removeExternalParticipant(ep.id)} className="text-red-400 hover:text-red-600 pb-2"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addExternalParticipant}
                    className="text-sm text-blue-500 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Plus size={14} /> {t('event.v2.add_external')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ Recurrence Section (passthrough from v1.3) ═══ */}
      {!isExceptionEdit && (
        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer mb-3">
            <input
              type="checkbox"
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-slate-300 dark:border-slate-600"
              checked={!!form.recurrenceRule}
              onChange={e => {
                if (e.target.checked) {
                  const dayIdx = form.date ? new Date(form.date + 'T12:00:00').getDay() : 1;
                  setForm(prev => ({
                    ...prev,
                    recurrenceRule: { frequency: 'WEEKLY', interval: 1, byDay: [DAY_ABBR[dayIdx]] },
                  }));
                } else {
                  setForm(prev => {
                    const { recurrenceRule, ...rest } = prev;
                    return { ...rest } as EventFormState;
                  });
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Repeat size={16} className="text-blue-500" />
              <span className="font-medium text-slate-900 dark:text-white">{t('recurrence.recurring_event')}</span>
            </div>
          </label>

          {form.recurrenceRule && (() => {
            const rule = form.recurrenceRule!;
            const updateRule = (updates: Partial<RecurrenceRule>) => {
              setForm(prev => ({ ...prev, recurrenceRule: { ...prev.recurrenceRule!, ...updates } }));
            };

            return (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                {/* Preset Buttons */}
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: t('recurrence.weekly'), rule: { frequency: 'WEEKLY' as const, interval: 1, byDay: [form.date ? DAY_ABBR[new Date(form.date + 'T12:00:00').getDay()] : 'MO' as DayOfWeek] } },
                    { label: t('recurrence.biweekly'), rule: { frequency: 'WEEKLY' as const, interval: 2, byDay: [form.date ? DAY_ABBR[new Date(form.date + 'T12:00:00').getDay()] : 'MO' as DayOfWeek] } },
                    { label: t('recurrence.daily'), rule: { frequency: 'DAILY' as const, interval: 1 } },
                    { label: t('recurrence.monthly'), rule: { frequency: 'MONTHLY' as const, interval: 1 } },
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => updateRule({ ...preset.rule, untilDate: rule.untilDate, count: rule.count })}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${rule.frequency === preset.rule.frequency && rule.interval === preset.rule.interval
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Frequency & Interval */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{t('recurrence.every')}</span>
                  <input
                    type="number" min={1} max={52}
                    className="w-16 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-sm outline-none"
                    value={rule.interval}
                    onChange={e => updateRule({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
                  />
                  <select
                    className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-sm outline-none"
                    value={rule.frequency}
                    onChange={e => updateRule({ frequency: e.target.value as RecurrenceRule['frequency'] })}
                  >
                    <option value="DAILY">{t('recurrence.days')}</option>
                    <option value="WEEKLY">{t('recurrence.weeks')}</option>
                    <option value="MONTHLY">{t('recurrence.months')}</option>
                  </select>
                </div>

                {/* Day-of-week selector for WEEKLY */}
                {rule.frequency === 'WEEKLY' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('recurrence.on_days')}</label>
                    <div className="flex gap-1">
                      {DAY_ABBR.map(day => (
                        <button
                          key={day} type="button"
                          onClick={() => {
                            const current = rule.byDay || [];
                            const next = current.includes(day)
                              ? current.filter(d => d !== day)
                              : [...current, day];
                            updateRule({ byDay: next.length > 0 ? next : [day] });
                          }}
                          className={`w-8 h-8 text-xs rounded-full font-medium transition-colors ${(rule.byDay || []).includes(day)
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Monthly mode selector */}
                {rule.frequency === 'MONTHLY' && form.date && (() => {
                  const startDate = new Date(form.date + 'T12:00:00');
                  const dayNum = startDate.getDate();
                  const dayName = [t('recurrence.day_sunday'), t('recurrence.day_monday'), t('recurrence.day_tuesday'), t('recurrence.day_wednesday'), t('recurrence.day_thursday'), t('recurrence.day_friday'), t('recurrence.day_saturday')][startDate.getDay()];
                  const weekOfMonth = Math.ceil(dayNum / 7);
                  const posLabels = ['', t('recurrence.pos_1st'), t('recurrence.pos_2nd'), t('recurrence.pos_3rd'), t('recurrence.pos_4th'), t('recurrence.pos_5th')];
                  const isPositionalMode = !!rule.bySetPos;

                  return (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t('recurrence.monthly_mode')}</label>
                      <div className="space-y-1">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                          <input type="radio" name="monthlyMode" checked={!isPositionalMode} onChange={() => updateRule({ byMonthDay: dayNum, bySetPos: undefined, byDayOfWeek: undefined })} className="text-blue-600" />
                          {t('recurrence.on_day_of_month').replace('{ordinal}', String(dayNum) + (dayNum === 1 ? t('recurrence.ordinal_st') : dayNum === 2 ? t('recurrence.ordinal_nd') : dayNum === 3 ? t('recurrence.ordinal_rd') : t('recurrence.ordinal_th')))}
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                          <input type="radio" name="monthlyMode" checked={isPositionalMode} onChange={() => updateRule({ bySetPos: weekOfMonth, byDayOfWeek: DAY_ABBR[startDate.getDay()], byMonthDay: undefined })} className="text-blue-600" />
                          {t('recurrence.on_pos_day_of_month').replace('{pos}', posLabels[weekOfMonth]).replace('{dayName}', dayName)}
                        </label>
                      </div>
                    </div>
                  );
                })()}

                {/* End Condition */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t('recurrence.ends')}</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                      <input type="radio" name="endMode" checked={!rule.untilDate && !rule.count} onChange={() => updateRule({ untilDate: undefined, count: undefined })} className="text-blue-600" />
                      {t('recurrence.never')}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                      <input type="radio" name="endMode" checked={!!rule.untilDate} onChange={() => {
                        const d = new Date(); d.setMonth(d.getMonth() + 3);
                        updateRule({ untilDate: d.toISOString().split('T')[0], count: undefined });
                      }} className="text-blue-600" />
                      {t('recurrence.on_date')}
                      {rule.untilDate && (
                        <input type="date" className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-sm outline-none ms-1" value={rule.untilDate} onChange={e => updateRule({ untilDate: e.target.value })} />
                      )}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                      <input type="radio" name="endMode" checked={!!rule.count} onChange={() => updateRule({ count: 12, untilDate: undefined })} className="text-blue-600" />
                      {t('recurrence.after')}
                      {rule.count !== undefined && (
                        <input type="number" min={1} max={365} className="w-16 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-sm outline-none" value={rule.count} onChange={e => updateRule({ count: Math.max(1, parseInt(e.target.value) || 1) })} />
                      )}
                      {rule.count !== undefined && <span>{t('recurrence.occurrences')}</span>}
                    </label>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Cancel toggle (edit mode, non-recurring only) */}
      {editingEventId && !form.recurrenceRule && (
        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mt-2">
          <label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer">
            <input
              type="checkbox"
              className="w-5 h-5 text-red-600 rounded focus:ring-red-500 border-slate-300 dark:border-slate-600"
              checked={form.isCanceled}
              onChange={e => setForm(prev => ({
                ...prev,
                isCanceled: e.target.checked,
              }))}
            />
            <span className="font-medium text-slate-900 dark:text-white">{t('cal.mark_canceled')}</span>
          </label>
        </div>
      )}

      {/* Notes */}
      {form.activityId && (
        <div>
          <label className={labelCls}>{t('event.v2.notes')}</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            placeholder={t('event.v2.notes_placeholder')}
          />
        </div>
      )}

    </div>
  );
});
