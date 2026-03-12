import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { TRANSLATIONS } from '../constants';
import { useFirestoreSync } from '../utils/useFirestoreSync';
import { buildActivityMap, getActivityName } from '../utils/activityLookup';
import { formatHours, formatCurrency } from '../utils/formatters';
import { DatePicker } from './DatePicker';
import {
  ActivityV2,
  StaffMemberV2,
  EventV2,
  EventParticipant,
  RateSnapshotV2,
  V2_COLLECTIONS,
} from '../types/v2';
import {
  FileText, Users, Calendar, HelpCircle, ChevronDown, ChevronRight, Menu, Info,
} from 'lucide-react';
import { AppSettings } from '../types';
import { useAuth } from '../context/AuthContext';

// ─── Translation helper ──────────────────────────────────────────────────────
const t = (key: string) => {
  const lang = document.documentElement.lang || 'en-US';
  return (TRANSLATIONS as Record<string, Record<string, string>>)[lang]?.[key]
    || (TRANSLATIONS as Record<string, Record<string, string>>)['en-US']?.[key]
    || key;
};

// ─── Payslip types ───────────────────────────────────────────────────────────

interface PayslipLineItem {
  eventId: string;
  eventDate: string;
  eventName: string;
  activityId: string;
  rateType: 'HOURLY' | 'PER_EVENT' | 'MONTHLY_FLAT';
  rateValue: number;
  effectiveRate: number;
  hasOverride: boolean;
  durationMinutes: number;
  cost: number;
}

interface ActivityGroup {
  activityId: string;
  activityName: string;
  items: PayslipLineItem[];
  subtotal: number;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  settings: AppSettings;
  onMobileMenuOpen: () => void;
}

// ─── Walkthrough ─────────────────────────────────────────────────────────────

const WALKTHROUGH_STEPS = [
  { key: 'payslip.walkthrough.step1', target: 'staff-select' },
  { key: 'payslip.walkthrough.step2', target: 'billing-period' },
  { key: 'payslip.walkthrough.step3', target: 'generate-btn' },
];

function getWalkthroughKey(uid: string) {
  return `payslip_walkthrough_${uid}`;
}

function getPrefillKey(uid: string) {
  return `payslip_prefill_${uid}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const PayslipGenerator: React.FC<Props> = ({ settings, onMobileMenuOpen }) => {
  const { isAdmin, currentUser } = useAuth();

  // v2.0 collections
  const [activitiesV2] = useFirestoreSync<ActivityV2>(V2_COLLECTIONS.activities, []);
  const [staffMembersV2] = useFirestoreSync<StaffMemberV2>(V2_COLLECTIONS.staffMembers, []);
  const [eventsV2] = useFirestoreSync<EventV2>(V2_COLLECTIONS.events, []);
  const [eventParticipantsV2] = useFirestoreSync<EventParticipant>(V2_COLLECTIONS.eventParticipants, []);

  // STAFF role: auto-lock to own staff member
  const ownStaffMember = useMemo(() => {
    if (isAdmin) return null;
    return staffMembersV2.find(s => s.uid === currentUser?.id) ?? null;
  }, [isAdmin, staffMembersV2, currentUser]);

  // Form state
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(false);

  // Walkthrough state
  const uid = 'default'; // TODO: replace with actual auth uid when available
  const [walkthroughStep, setWalkthroughStep] = useState<number | null>(null);
  const [showPrefillNotice, setShowPrefillNotice] = useState(false);

  // Initialize defaults: current month
  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const defaultStart = `${y}-${m}-01`;
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const defaultEnd = `${y}-${m}-${lastDay.toString().padStart(2, '0')}`;

    // Try pre-fill from localStorage
    try {
      const stored = localStorage.getItem(getPrefillKey(uid));
      if (stored) {
        const prefill = JSON.parse(stored);
        // Stale detection: check if staff member still exists and is not archived
        const staffExists = staffMembersV2.some(
          s => s.id === prefill.staffMemberId && !s.isArchived
        );
        if (staffExists && prefill.staffMemberId) {
          setSelectedStaffId(prefill.staffMemberId);
          setPeriodStart(prefill.periodStart || defaultStart);
          setPeriodEnd(prefill.periodEnd || defaultEnd);
          setShowPrefillNotice(true);
          return;
        }
      }
    } catch { /* ignore */ }

    setPeriodStart(defaultStart);
    setPeriodEnd(defaultEnd);
  }, [staffMembersV2]);

  // Walkthrough: show on first use
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(getWalkthroughKey(uid));
      if (!dismissed) {
        setWalkthroughStep(0);
      }
    } catch { /* ignore */ }
  }, []);

  const dismissWalkthrough = useCallback(() => {
    setWalkthroughStep(null);
    try {
      localStorage.setItem(getWalkthroughKey(uid), 'true');
    } catch { /* ignore */ }
  }, []);

  const advanceWalkthrough = useCallback(() => {
    setWalkthroughStep(prev => {
      if (prev === null) return null;
      if (prev >= WALKTHROUGH_STEPS.length - 1) {
        dismissWalkthrough();
        return null;
      }
      return prev + 1;
    });
  }, [dismissWalkthrough]);

  const startGuideMe = useCallback(() => {
    setWalkthroughStep(0);
  }, []);

  // Auto-lock staff selection for STAFF role
  useEffect(() => {
    if (ownStaffMember && !selectedStaffId) {
      setSelectedStaffId(ownStaffMember.id);
    }
  }, [ownStaffMember, selectedStaffId]);

  // Active (non-archived) staff for picker (admin sees all, staff sees own)
  const activeStaff = useMemo(
    () => {
      const list = staffMembersV2.filter(s => !s.isArchived);
      if (!isAdmin && ownStaffMember) return list.filter(s => s.id === ownStaffMember.id);
      return list.sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );
    },
    [staffMembersV2, isAdmin, ownStaffMember]
  );

  // Activity name lookup
  const activityNameMap = useMemo(() => buildActivityMap(activitiesV2), [activitiesV2]);

  // Compute payslip (client-side, Section 17 formulas)
  const payslipData = useMemo<{ items: PayslipLineItem[]; grandTotal: number } | null>(() => {
    if (!generated || !selectedStaffId || !periodStart || !periodEnd) return null;

    // Build event lookup (COMPLETED only, within period)
    const eventMap = new Map<string, EventV2>();
    eventsV2.forEach(e => {
      if (e.status === 'COMPLETED' && e.date >= periodStart && e.date <= periodEnd) {
        eventMap.set(e.id, e);
      }
    });

    // Filter EventParticipant records: STAFF only, matching staffMemberId
    const relevantParticipants = eventParticipantsV2.filter(p =>
      p.participantType === 'STAFF' &&
      p.staffMemberId === selectedStaffId &&
      eventMap.has(p.eventId)
    );

    const items: PayslipLineItem[] = [];
    let grandTotal = 0;

    for (const p of relevantParticipants) {
      const event = eventMap.get(p.eventId)!;
      const snapshot = p.rateSnapshot as RateSnapshotV2 | undefined;
      if (!snapshot) continue;

      // effectiveRate = rateOverride ?? rateSnapshot.rateValue
      const effectiveRate = p.rateOverride != null ? p.rateOverride : snapshot.rateValue;
      const hasOverride = p.rateOverride != null;
      const durationMinutes = event.durationMinutes || 0;
      const rateType = snapshot.rateType;

      // Section 17 formulas
      let cost = 0;
      if (rateType === 'HOURLY') {
        cost = effectiveRate * (durationMinutes / 60);
      } else if (rateType === 'PER_EVENT') {
        cost = effectiveRate;
      } else if (rateType === 'MONTHLY_FLAT') {
        cost = effectiveRate;
      }

      grandTotal += cost;

      items.push({
        eventId: event.id,
        eventDate: event.date,
        eventName: event.name,
        activityId: event.activityId,
        rateType,
        rateValue: snapshot.rateValue,
        effectiveRate,
        hasOverride,
        durationMinutes,
        cost,
      });
    }

    // Sort by date then name
    items.sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.eventName.localeCompare(b.eventName));

    return { items, grandTotal };
  }, [generated, selectedStaffId, periodStart, periodEnd, eventsV2, eventParticipantsV2]);

  // Group items by activity
  const activityGroups = useMemo<ActivityGroup[]>(() => {
    if (!payslipData) return [];
    const groupMap = new Map<string, ActivityGroup>();
    for (const item of payslipData.items) {
      let group = groupMap.get(item.activityId);
      if (!group) {
        group = {
          activityId: item.activityId,
          activityName: getActivityName(activityNameMap, item.activityId, 'Unnamed Activity'),
          items: [],
          subtotal: 0,
        };
        groupMap.set(item.activityId, group);
      }
      group.items.push(item);
      group.subtotal += item.cost;
    }
    return Array.from(groupMap.values()).sort((a, b) => a.activityName.localeCompare(b.activityName));
  }, [payslipData, activityNameMap]);

  // Expanded activity groups in results
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (activityId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  };

  // Generate handler
  const handleGenerate = () => {
    setError('');
    if (!selectedStaffId) {
      setError(t('payslip.err_no_staff'));
      return;
    }
    if (!periodStart || !periodEnd) {
      setError(t('payslip.err_no_period'));
      return;
    }

    // Save to localStorage for pre-fill
    try {
      localStorage.setItem(
        getPrefillKey(uid),
        JSON.stringify({ staffMemberId: selectedStaffId, periodStart, periodEnd })
      );
    } catch { /* ignore */ }

    setGenerated(true);
    setShowPrefillNotice(false);
    // Expand all groups by default
    const allIds = new Set<string>();
    eventParticipantsV2
      .filter(p => p.participantType === 'STAFF' && p.staffMemberId === selectedStaffId)
      .forEach(p => {
        const evt = eventsV2.find(e => e.id === p.eventId);
        if (evt) allIds.add(evt.activityId);
      });
    setExpandedGroups(allIds);
  };

  // Staff name helper
  const getStaffName = (id: string) => {
    const s = staffMembersV2.find(s => s.id === id);
    return s ? `${s.firstName} ${s.lastName}` : '';
  };

  // Rate type display
  const rateTypeLabel = (rt: string) => {
    if (rt === 'HOURLY') return t('payslip.hourly');
    if (rt === 'PER_EVENT') return t('payslip.per_event');
    if (rt === 'MONTHLY_FLAT') return t('payslip.monthly_flat');
    return rt;
  };

  const currencySymbol = settings.currency === 'ILS' ? '₪' : settings.currency === 'EUR' ? '€' : '$';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <button onClick={onMobileMenuOpen} className="md:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
            <Menu className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('payslip.title')}</h1>
        </div>
        <button
          onClick={startGuideMe}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
        >
          <HelpCircle className="w-4 h-4" />
          {t('payslip.guide_me')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Pre-fill notice */}
        {showPrefillNotice && (
          <div className="mb-4 flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 rounded-lg">
            <Info className="w-4 h-4 shrink-0" />
            {t('payslip.prefill.notice')}
          </div>
        )}

        {/* Form */}
        <div className="max-w-2xl space-y-4">
          {/* Staff picker (hidden for STAFF role — auto-locked to own) */}
          <div id="staff-select" className="relative">
            {walkthroughStep === 0 && (
              <WalkthroughTooltip
                text={t(WALKTHROUGH_STEPS[0].key)}
                onNext={advanceWalkthrough}
                onDismiss={dismissWalkthrough}
                step={1}
                total={WALKTHROUGH_STEPS.length}
              />
            )}
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <Users className="w-4 h-4 inline-block mr-1" />
              {t('payslip.staff_select')}
            </label>
            {!isAdmin && ownStaffMember ? (
              <div className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                {(ownStaffMember as any).firstName} {(ownStaffMember as any).lastName}
              </div>
            ) : (
              <select
                value={selectedStaffId}
                onChange={e => { setSelectedStaffId(e.target.value); setGenerated(false); }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t('payslip.select_staff')}</option>
                {activeStaff.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
            )}
            {activeStaff.length === 0 && !ownStaffMember && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('payslip.no_staff')}</p>
            )}
          </div>

          {/* Billing period */}
          <div id="billing-period" className="relative">
            {walkthroughStep === 1 && (
              <WalkthroughTooltip
                text={t(WALKTHROUGH_STEPS[1].key)}
                onNext={advanceWalkthrough}
                onDismiss={dismissWalkthrough}
                step={2}
                total={WALKTHROUGH_STEPS.length}
              />
            )}
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <Calendar className="w-4 h-4 inline-block mr-1" />
              {t('payslip.billing_period')}
            </label>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('payslip.start_date')}</label>
                <DatePicker
                  value={periodStart}
                  onChange={e => { setPeriodStart((e.target as HTMLInputElement).value); setGenerated(false); }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('payslip.end_date')}</label>
                <DatePicker
                  value={periodEnd}
                  onChange={e => { setPeriodEnd((e.target as HTMLInputElement).value); setGenerated(false); }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {/* Generate button */}
          <div id="generate-btn" className="relative">
            {walkthroughStep === 2 && (
              <WalkthroughTooltip
                text={t(WALKTHROUGH_STEPS[2].key)}
                onNext={advanceWalkthrough}
                onDismiss={dismissWalkthrough}
                step={3}
                total={WALKTHROUGH_STEPS.length}
              />
            )}
            <button
              onClick={handleGenerate}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              {t('payslip.generate')}
            </button>
          </div>
        </div>

        {/* Results */}
        {generated && payslipData && (
          <div className="mt-8 max-w-4xl">
            {/* Header */}
            <div className="mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t('payslip.period_for')} {getStaffName(selectedStaffId)}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {periodStart} — {periodEnd}
              </p>
            </div>

            {payslipData.items.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('payslip.no_events')}</p>
            ) : (
              <>
                {/* Activity groups */}
                {activityGroups.map(group => (
                  <div key={group.activityId} className="mb-4 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(group.activityId)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {expandedGroups.has(group.activityId) ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="font-medium text-slate-900 dark:text-slate-100">{group.activityName}</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          ({group.items.length} {group.items.length === 1 ? 'event' : 'events'})
                        </span>
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrency(group.subtotal, currencySymbol)}
                      </span>
                    </button>

                    {/* Expanded items */}
                    {expandedGroups.has(group.activityId) && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                              <th className="text-left px-4 py-2 font-medium">{t('payslip.event_date')}</th>
                              <th className="text-left px-4 py-2 font-medium">{t('payslip.event_name')}</th>
                              <th className="text-left px-4 py-2 font-medium">{t('payslip.rate_type')}</th>
                              <th className="text-right px-4 py-2 font-medium">{t('payslip.rate')}</th>
                              <th className="text-right px-4 py-2 font-medium">{t('payslip.duration')}</th>
                              <th className="text-right px-4 py-2 font-medium">{t('payslip.cost')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item, idx) => (
                              <tr
                                key={`${item.eventId}-${idx}`}
                                className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                              >
                                <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{item.eventDate}</td>
                                <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{item.eventName}</td>
                                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                                  {rateTypeLabel(item.rateType)}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">
                                  {formatCurrency(item.effectiveRate, currencySymbol)}
                                  {item.hasOverride && (
                                    <span className="ml-1 text-xs text-amber-600 dark:text-amber-400" title={t('payslip.override_applied')}>
                                      ⚑
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">
                                  {item.rateType === 'HOURLY'
                                    ? formatHours(item.durationMinutes / 60)
                                    : item.rateType === 'PER_EVENT'
                                      ? '1'
                                      : '—'}
                                </td>
                                <td className="px-4 py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                                  {formatCurrency(item.cost, currencySymbol)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-50 dark:bg-slate-800">
                              <td colSpan={5} className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">
                                {t('payslip.subtotal')}
                              </td>
                              <td className="px-4 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                                {formatCurrency(group.subtotal, currencySymbol)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                ))}

                {/* Grand total */}
                <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg mt-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{t('payslip.total')}</span>
                  <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                    {formatCurrency(payslipData.grandTotal, currencySymbol)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Walkthrough Tooltip ─────────────────────────────────────────────────────

const WalkthroughTooltip: React.FC<{
  text: string;
  onNext: () => void;
  onDismiss: () => void;
  step: number;
  total: number;
}> = ({ text, onNext, onDismiss, step, total }) => (
  <div className="absolute -top-2 left-0 right-0 transform -translate-y-full z-50">
    <div className="bg-indigo-700 text-white text-sm rounded-lg px-4 py-3 shadow-lg relative">
      <p>{text}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-indigo-300">{step}/{total}</span>
        <div className="flex gap-2">
          <button onClick={onDismiss} className="text-xs text-indigo-300 hover:text-white">
            Skip
          </button>
          <button onClick={onNext} className="text-xs bg-white text-indigo-700 px-2 py-0.5 rounded font-medium hover:bg-indigo-100">
            {step === total ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
      <div className="absolute bottom-0 left-6 transform translate-y-1/2 rotate-45 w-2 h-2 bg-indigo-700" />
    </div>
  </div>
);
