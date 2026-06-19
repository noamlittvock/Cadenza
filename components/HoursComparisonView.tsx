import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Download,
  Filter,
  LockKeyhole,
  ReceiptText,
} from 'lucide-react';
import type { AppSettings, CalendarEvent, Teacher } from '../types';
import type { HoursEntry } from '../types/blueprint';
import type { OrgRoleV2, StaffMemberV2, TeachingAssignmentV2 } from '../types/v2';
import { eventToMinimal } from '../utils/canonicalAdapters';
import {
  calculatePayslipRows,
  compareReportedVsCalendarHours,
  type PayrollRatePolicy,
} from '../utils/blueprintQueries';
import {
  applyHoursEntryUpdates,
  approveHoursEntries,
  markHoursEntriesPaid,
  type HoursPeriodHeader,
} from '../utils/hoursEntryService';

interface AuthUserLike {
  id: string;
  uid?: string;
  email?: string;
  name?: string;
  role?: string;
}

interface Props {
  settings: AppSettings;
  currentUser: AuthUserLike | null;
  orgId: string | null;
  hoursEntries: HoursEntry[];
  setHoursEntries: (next: HoursEntry[] | ((prev: HoursEntry[]) => HoursEntry[])) => Promise<void>;
  periodHeaders: HoursPeriodHeader[];
  setPeriodHeaders: (next: HoursPeriodHeader[] | ((prev: HoursPeriodHeader[]) => HoursPeriodHeader[])) => Promise<void>;
  staffMembers: StaffMemberV2[];
  teachers: Teacher[];
  teachingAssignments: TeachingAssignmentV2[];
  orgRoles: OrgRoleV2[];
  events: CalendarEvent[];
  canApprovePay: boolean;
  canExport: boolean;
}

type StatusFilter = 'ALL' | HoursEntry['status'];

interface PayrollGroup {
  id: string;
  staffMemberId: string;
  periodStart: string;
  periodEnd: string;
  header: HoursPeriodHeader | null;
  entries: HoursEntry[];
}

const LABELS = {
  'en-US': {
    title: 'Payroll Review',
    subtitle: 'Submitted hours, calendar variance, approval, payment, and payslip export.',
    staff: 'Staff',
    status: 'Status',
    allStaff: 'All staff',
    allStatuses: 'All statuses',
    submitted: 'Submitted',
    approved: 'Approved',
    paid: 'Paid',
    draft: 'Draft',
    noGroups: 'No payroll entries match this filter.',
    reported: 'Reported',
    calendar: 'Calendar',
    variance: 'Variance',
    entries: 'Entries',
    period: 'Period',
    date: 'Date',
    source: 'Source',
    rate: 'Rate',
    amount: 'Amount',
    payslip: 'Payslip preview',
    orgDefaultRate: 'Org default rate',
    approveSubmitted: 'Approve submitted',
    markPaid: 'Mark approved paid',
    exportCsv: 'Export CSV',
    readOnly: 'Read/export only',
    overrideRate: 'Override',
    noRate: 'No rate configured for approval.',
    saved: 'Saved',
    manual: 'Manual entry',
    event: 'Calendar event',
  },
  'he-IL': {
    title: 'סקירת שכר',
    subtitle: 'שעות שהוגשו, פער מול יומן, אישור, תשלום וייצוא תלוש.',
    staff: 'צוות',
    status: 'סטטוס',
    allStaff: 'כל הצוות',
    allStatuses: 'כל הסטטוסים',
    submitted: 'הוגש',
    approved: 'אושר',
    paid: 'שולם',
    draft: 'טיוטה',
    noGroups: 'אין שורות שכר התואמות למסנן.',
    reported: 'דווח',
    calendar: 'יומן',
    variance: 'פער',
    entries: 'שורות',
    period: 'תקופה',
    date: 'תאריך',
    source: 'מקור',
    rate: 'תעריף',
    amount: 'סכום',
    payslip: 'תצוגת תלוש',
    orgDefaultRate: 'תעריף ברירת מחדל',
    approveSubmitted: 'אשר שורות שהוגשו',
    markPaid: 'סמן מאושרות כשולמו',
    exportCsv: 'ייצוא CSV',
    readOnly: 'קריאה/ייצוא בלבד',
    overrideRate: 'חריגה',
    noRate: 'לא הוגדר תעריף לאישור.',
    saved: 'נשמר',
    manual: 'שורה ידנית',
    event: 'אירוע יומן',
  },
} as const;

function toMonthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function toMonthEnd(date: string): string {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const remainder = abs % 60;
  return `${sign}${hours}:${String(remainder).padStart(2, '0')}`;
}

function parseRate(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readRate(candidate: unknown): number | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  for (const key of ['payRate', 'hourlyRate', 'defaultHourlyRate', 'defaultRate', 'rate']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function headerStatus(entries: HoursEntry[]): HoursPeriodHeader['status'] {
  if (entries.length > 0 && entries.every(entry => entry.status === 'PAID')) return 'PAID';
  if (entries.some(entry => entry.status === 'APPROVED' || entry.status === 'PAID')) return 'APPROVED';
  if (entries.some(entry => entry.status === 'SUBMITTED')) return 'SUBMITTED';
  return 'DRAFT';
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const HoursComparisonView: React.FC<Props> = ({
  settings,
  currentUser,
  orgId,
  hoursEntries,
  setHoursEntries,
  periodHeaders,
  setPeriodHeaders,
  staffMembers,
  teachers,
  teachingAssignments,
  orgRoles,
  events,
  canApprovePay,
  canExport,
}) => {
  const language = settings.language === 'he-IL' ? 'he-IL' : 'en-US';
  const labels = LABELS[language];
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [orgDefaultRate, setOrgDefaultRate] = useState('100');
  const [overrideRates, setOverrideRates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const staffName = (staffMemberId: string) => (
    staffMembers.find(staff => staff.id === staffMemberId)?.fullName
    ?? teachers.find(teacher => teacher.id === staffMemberId)?.fullName
    ?? staffMemberId
  );

  const staffColor = (staffMemberId: string) => (
    teachers.find(teacher => teacher.id === staffMemberId)?.color ?? '#7b2d36'
  );

  const eventById = useMemo(() => new Map(events.map(event => [event.id, event])), [events]);
  const minimalEvents = useMemo(() => (
    events.map(event => eventToMinimal(event, settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone))
  ), [events, settings.timeZone]);
  const minimalParticipants = useMemo(() => (
    events.flatMap(event => {
      const staffIds = new Set<string>([...(event.staffMemberIds ?? []), event.teacherId].filter(Boolean) as string[]);
      return Array.from(staffIds, staffMemberId => ({ eventId: event.id, staffMemberId }));
    })
  ), [events]);

  const groups = useMemo<PayrollGroup[]>(() => {
    const headersById = new Map<string, HoursPeriodHeader>(periodHeaders.map(header => [header.id, header]));
    const grouped = new Map<string, PayrollGroup>();
    hoursEntries
      .filter(entry => !orgId || entry.orgId === orgId)
      .filter(entry => !staffFilter || entry.staffMemberId === staffFilter)
      .filter(entry => statusFilter === 'ALL' || entry.status === statusFilter)
      .forEach(entry => {
        const header = entry.hoursReportId ? headersById.get(entry.hoursReportId) ?? null : null;
        const periodStart = header?.periodStart ?? toMonthStart(entry.date);
        const periodEnd = header?.periodEnd ?? toMonthEnd(entry.date);
        const key = header?.id ?? `${entry.staffMemberId}:${periodStart}:${periodEnd}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.entries.push(entry);
          return;
        }
        grouped.set(key, {
          id: key,
          staffMemberId: entry.staffMemberId,
          periodStart,
          periodEnd,
          header,
          entries: [entry],
        });
      });
    return Array.from(grouped.values())
      .map(group => ({ ...group, entries: group.entries.sort((a, b) => `${a.date}:${a.id}`.localeCompare(`${b.date}:${b.id}`)) }))
      .sort((a, b) => (
        `${b.periodEnd}:${staffName(b.staffMemberId)}`.localeCompare(`${a.periodEnd}:${staffName(a.staffMemberId)}`)
      ));
  }, [hoursEntries, orgId, periodHeaders, staffFilter, statusFilter]);

  const reportingStaff = useMemo(() => {
    const ids = new Set<string>(hoursEntries.filter(entry => !orgId || entry.orgId === orgId).map(entry => entry.staffMemberId));
    return Array.from(ids).sort((a, b) => staffName(a).localeCompare(staffName(b)));
  }, [hoursEntries, orgId, staffMembers, teachers]);

  const ratePolicyForEntry = (_entry: HoursEntry): PayrollRatePolicy => ({
    teachingAssignmentRates: teachingAssignments.map(assignment => ({
      teachingAssignmentId: assignment.id,
      rate: readRate(assignment),
    })),
    orgRoleRates: orgRoles.map(role => ({
      orgRoleId: role.id,
      rate: readRate(role),
    })),
    staffDefaultRates: [
      ...staffMembers.map(staff => ({ staffMemberId: staff.id, rate: readRate(staff) })),
      ...teachers.map(teacher => ({ staffMemberId: teacher.id, rate: readRate(teacher) })),
    ],
    orgDefaultRate: parseRate(orgDefaultRate),
  });

  const context = () => {
    if (!orgId) throw new Error('No organization selected.');
    return {
      orgId,
      now: new Date().toISOString(),
      actor: {
        userId: currentUser?.id ?? currentUser?.uid ?? null,
        canAdminManage: canApprovePay,
      },
    };
  };

  const updateHeaderForGroup = async (group: PayrollGroup, nextEntries: HoursEntry[]) => {
    if (!group.header) return;
    const groupIds = new Set(group.entries.map(entry => entry.id));
    const changedById = new Map(nextEntries.map(entry => [entry.id, entry]));
    const mergedGroupEntries = group.entries.map(entry => changedById.get(entry.id) ?? entry);
    const nextHeader: HoursPeriodHeader = {
      ...group.header,
      status: headerStatus(mergedGroupEntries),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.id ?? currentUser?.uid ?? null,
    };
    await setPeriodHeaders(prev => applyHoursEntryUpdates(prev, [nextHeader]));
    setExpandedGroupId(groupIds.size ? group.id : null);
  };

  const approveGroup = async (group: PayrollGroup) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const submittedIds = group.entries.filter(entry => entry.status === 'SUBMITTED').map(entry => entry.id);
      const adminOverrideRates = Object.fromEntries(
        submittedIds
          .map(id => [id, parseRate(overrideRates[id] ?? '')] as const)
          .filter(([, rate]) => rate !== null),
      );
      const approved = approveHoursEntries({
        entries: hoursEntries,
        entryIds: submittedIds,
        context: context(),
        ratePolicyForEntry,
        adminOverrideRates,
      });
      await setHoursEntries(prev => applyHoursEntryUpdates(prev, approved));
      await updateHeaderForGroup(group, approved);
      setMessage(labels.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const payGroup = async (group: PayrollGroup) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const approvedIds = group.entries.filter(entry => entry.status === 'APPROVED').map(entry => entry.id);
      const paid = markHoursEntriesPaid({
        entries: hoursEntries,
        entryIds: approvedIds,
        context: context(),
      });
      await setHoursEntries(prev => applyHoursEntryUpdates(prev, paid));
      await updateHeaderForGroup(group, paid);
      setMessage(labels.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const exportRows = (group: PayrollGroup) => {
    const rows = calculatePayslipRows(group.entries);
    const csv = [
      ['staffMemberId', 'staffName', 'date', 'hours', 'rate', 'amount', 'sourceEntryId'].join(','),
      ...rows.map(row => [
        row.staffMemberId,
        staffName(row.staffMemberId),
        row.date,
        row.hours,
        row.rate,
        row.amount,
        row.sourceEntryId,
      ].map(csvEscape).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `payroll-${group.staffMemberId}-${group.periodStart}-${group.periodEnd}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const statusLabel = (status: HoursEntry['status']) => ({
    DRAFT: labels.draft,
    SUBMITTED: labels.submitted,
    APPROVED: labels.approved,
    PAID: labels.paid,
  }[status]);

  return (
    <div className="h-full overflow-auto bg-[#f6f0e6] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="p-3 sm:p-5 max-w-7xl mx-auto space-y-4">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-bold">{labels.title}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{labels.subtitle}</p>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2 text-xs">
            <label className="rounded-lg border border-[#decfb9] dark:border-slate-800 bg-white/75 dark:bg-slate-900 px-3 py-2">
              <span className="flex items-center gap-1 text-slate-500"><Filter size={13} />{labels.staff}</span>
              <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className="mt-1 w-full bg-transparent text-sm font-semibold outline-none">
                <option value="">{labels.allStaff}</option>
                {reportingStaff.map(staffMemberId => (
                  <option key={staffMemberId} value={staffMemberId}>{staffName(staffMemberId)}</option>
                ))}
              </select>
            </label>
            <label className="rounded-lg border border-[#decfb9] dark:border-slate-800 bg-white/75 dark:bg-slate-900 px-3 py-2">
              <span className="text-slate-500">{labels.status}</span>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="mt-1 w-full bg-transparent text-sm font-semibold outline-none">
                <option value="ALL">{labels.allStatuses}</option>
                <option value="SUBMITTED">{labels.submitted}</option>
                <option value="APPROVED">{labels.approved}</option>
                <option value="PAID">{labels.paid}</option>
                <option value="DRAFT">{labels.draft}</option>
              </select>
            </label>
            <label className="rounded-lg border border-[#decfb9] dark:border-slate-800 bg-white/75 dark:bg-slate-900 px-3 py-2">
              <span className="text-slate-500">{labels.orgDefaultRate}</span>
              <input value={orgDefaultRate} onChange={e => setOrgDefaultRate(e.target.value)} type="number" min="0" step="1" dir="ltr" className="mt-1 w-full bg-transparent text-sm font-semibold outline-none" />
            </label>
          </div>
        </header>

        {(error || message || !canApprovePay) && (
          <div className="rounded-lg border border-[#decfb9] dark:border-slate-800 bg-white/75 dark:bg-slate-900 px-3 py-2 text-sm">
            {error && <div className="flex items-center gap-2 text-red-700 dark:text-red-300"><AlertTriangle size={15} />{error}</div>}
            {message && <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={15} />{message}</div>}
            {!canApprovePay && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><LockKeyhole size={15} />{labels.readOnly}</div>}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="rounded-lg border border-[#decfb9] dark:border-slate-800 bg-white/75 dark:bg-slate-900 p-10 text-center text-sm text-slate-500">
            <ReceiptText className="mx-auto mb-3 text-slate-400" size={34} />
            {labels.noGroups}
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => {
              const isExpanded = expandedGroupId === group.id;
              const submittedCount = group.entries.filter(entry => entry.status === 'SUBMITTED').length;
              const approvedCount = group.entries.filter(entry => entry.status === 'APPROVED').length;
              const periodEvents = minimalEvents.filter(event => event.date >= group.periodStart && event.date <= group.periodEnd);
              const reconciliation = compareReportedVsCalendarHours(group.staffMemberId, group.entries, periodEvents, minimalParticipants);
              const payslipRows = calculatePayslipRows(group.entries);
              const payableTotal = payslipRows.reduce((sum, row) => sum + row.amount, 0);
              const groupStatus = headerStatus(group.entries);

              return (
                <section key={group.id} className="rounded-lg border border-[#decfb9] dark:border-slate-800 bg-white/80 dark:bg-slate-900 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                    className="w-full px-4 py-3 grid gap-3 md:grid-cols-[minmax(180px,1fr)_repeat(4,120px)_32px] md:items-center text-start hover:bg-[#efe3d1]/70 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg text-white flex items-center justify-center font-bold" style={{ backgroundColor: staffColor(group.staffMemberId) }}>
                        {staffName(group.staffMemberId).charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{staffName(group.staffMemberId)}</div>
                        <div className="text-xs text-slate-500" dir="ltr">{group.periodStart} - {group.periodEnd}</div>
                      </div>
                    </div>
                    <Metric label={labels.reported} value={formatMinutes(reconciliation.reportedMinutes)} />
                    <Metric label={labels.calendar} value={formatMinutes(reconciliation.calendarMinutes)} />
                    <Metric label={labels.variance} value={formatMinutes(reconciliation.varianceMinutes)} tone={reconciliation.matchesCalendar ? 'neutral' : 'warn'} />
                    <Metric label={labels.amount} value={payableTotal ? payableTotal.toFixed(2) : '0.00'} />
                    <div className="flex items-center justify-between md:justify-end gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                        groupStatus === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                          : groupStatus === 'APPROVED'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
                            : groupStatus === 'SUBMITTED'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>{groupStatus === 'SUBMITTED' ? labels.submitted : groupStatus === 'APPROVED' ? labels.approved : groupStatus === 'PAID' ? labels.paid : labels.draft}</span>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#eadcc7] dark:border-slate-800">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-[#f5eadb] dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              <th className="text-start px-4 py-2 font-semibold">{labels.date}</th>
                              <th className="text-start px-4 py-2 font-semibold">{labels.source}</th>
                              <th className="text-end px-4 py-2 font-semibold">{labels.reported}</th>
                              <th className="text-end px-4 py-2 font-semibold">{labels.calendar}</th>
                              <th className="text-end px-4 py-2 font-semibold">{labels.rate}</th>
                              <th className="text-start px-4 py-2 font-semibold">{labels.overrideRate}</th>
                              <th className="text-start px-4 py-2 font-semibold">{labels.status}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.entries.map(entry => {
                              const event = entry.eventId ? eventById.get(entry.eventId) : null;
                              return (
                                <tr key={entry.id} className="border-t border-[#eadcc7] dark:border-slate-800">
                                  <td className="px-4 py-2 font-mono text-xs" dir="ltr">{entry.date}</td>
                                  <td className="px-4 py-2 min-w-[220px]">
                                    <div className="font-medium">{event?.name ?? entry.note ?? labels.manual}</div>
                                    <div className="text-[11px] text-slate-500">{entry.eventId ? labels.event : entry.id}</div>
                                  </td>
                                  <td className="px-4 py-2 text-end font-mono" dir="ltr">{formatMinutes(entry.reportedMinutes)}</td>
                                  <td className="px-4 py-2 text-end font-mono" dir="ltr">{formatMinutes(entry.calendarMinutes)}</td>
                                  <td className="px-4 py-2 text-end font-mono" dir="ltr">{entry.rate === null ? '-' : entry.rate.toFixed(2)}</td>
                                  <td className="px-4 py-2">
                                    <input
                                      value={overrideRates[entry.id] ?? ''}
                                      onChange={e => setOverrideRates(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                      disabled={!canApprovePay || entry.status !== 'SUBMITTED'}
                                      type="number"
                                      min="0"
                                      step="1"
                                      dir="ltr"
                                      className="w-24 rounded-md border border-[#d5c3aa] dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs disabled:opacity-50"
                                      aria-label={`${labels.overrideRate} ${entry.date}`}
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold">{statusLabel(entry.status)}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] p-4 border-t border-[#eadcc7] dark:border-slate-800">
                        <div className="rounded-lg bg-[#f5eadb] dark:bg-slate-800 p-3">
                          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                            <Coins size={15} />
                            {labels.payslip}
                          </div>
                          {payslipRows.length === 0 ? (
                            <div className="text-xs text-slate-500">{labels.noRate}</div>
                          ) : (
                            <div className="grid gap-1 text-xs">
                              {payslipRows.map(row => (
                                <div key={row.sourceEntryId} className="grid grid-cols-[1fr_80px_80px_90px] gap-2" dir="ltr">
                                  <span>{row.date}</span>
                                  <span>{row.hours.toFixed(2)} h</span>
                                  <span>{row.rate.toFixed(2)}</span>
                                  <span>{row.amount.toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap lg:flex-col gap-2 lg:min-w-[220px]">
                          {canExport && (
                            <button type="button" onClick={() => exportRows(group)} className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d5c3aa] dark:border-slate-700 px-3 py-2 text-sm font-semibold">
                              <Download size={15} />
                              {labels.exportCsv}
                            </button>
                          )}
                          {canApprovePay && (
                            <>
                              <button type="button" onClick={() => approveGroup(group)} disabled={busy || submittedCount === 0} className="inline-flex items-center justify-center gap-2 rounded-md bg-[#18324a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                                <CheckCircle2 size={15} />
                                {labels.approveSubmitted}
                              </button>
                              <button type="button" onClick={() => payGroup(group)} disabled={busy || approvedCount === 0} className="inline-flex items-center justify-center gap-2 rounded-md bg-[#7b2d36] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                                <ReceiptText size={15} />
                                {labels.markPaid}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; tone?: 'neutral' | 'warn' }> = ({ label, value, tone = 'neutral' }) => (
  <div className="text-start md:text-end">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`font-semibold font-mono ${tone === 'warn' ? 'text-[#7b2d36] dark:text-rose-300' : ''}`} dir="ltr">{value}</div>
  </div>
);
