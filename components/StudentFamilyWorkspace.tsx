import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Edit3,
  FileText,
  GraduationCap,
  History,
  Landmark,
  LockKeyhole,
  Menu,
  Plus,
  ScrollText,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { AppSettings, CalendarEvent, Student } from '../types';
import type { ActivityV2 } from '../types/v2';
import type { Adjustment, BalanceSnapshot, Charge, Family, Guardian as FamilyGuardian, LessonCompletion, LessonRecord, Payment } from '../types/blueprint';
import { generateId, TRANSLATIONS } from '../constants';
import { Modal } from './Modal';
import {
  buildStudentFamilyActivityOptions,
  buildStudentFamilyListModel,
  type FamilyListRow,
  type StudentFamilyListMode,
  type StudentFamilyStatusFilter,
  type StudentListRow,
} from '../utils/studentFamilyList';
import {
  buildStudentFamilyDetailModel,
  type StudentFamilyDetailModel,
  type StudentFamilyDetailTab,
} from '../utils/studentFamilyDetail';
import {
  applyFamilyPatch,
  applyStudentProfilePatch,
  buildFamilyRecord,
  buildStudentWriteBoundary,
  reconcileFamilyStudentLinks,
  type StudentFamilyWriteContext,
} from '../utils/studentFamilyService';
import { computeFamilyLedgerBalance, type FamilyBalanceSummary } from '../utils/ledgerService';

type SyncSetter<T extends { id: string }> = (data: T[] | ((prev: T[]) => T[])) => Promise<void>;

interface Props {
  settings: AppSettings;
  students: Student[];
  families: Family[];
  activities: ActivityV2[];
  lessonRecords?: LessonRecord[];
  events?: CalendarEvent[];
  setStudents: SyncSetter<Student>;
  setFamilies: SyncSetter<Family>;
  orgId: string | null;
  actorId?: string | null;
  canViewFinance?: boolean;
  charges?: Charge[];
  payments?: Payment[];
  adjustments?: Adjustment[];
  balanceSnapshots?: BalanceSnapshot[];
  financeLedgerLoading?: boolean;
  onOpenFinanceLedger?: (familyId: string) => void;
  studentsLoading?: boolean;
  familiesLoading?: boolean;
  errorMessage?: string | null;
  onMobileMenuOpen: () => void;
}

const Stat = ({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
      <Icon size={14} className="text-cadenza-600 dark:text-cadenza-300" />
      <span>{label}</span>
    </div>
    <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{value}</div>
  </div>
);

const StatusBadge = ({ status, t }: { status: 'ACTIVE' | 'ARCHIVED'; t: (key: string) => string }) => (
  <span
    className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${
      status === 'ARCHIVED'
        ? 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
        : 'border border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
    }`}
  >
    {status === 'ARCHIVED' ? t('student_family.status.archived') : t('student_family.status.active')}
  </span>
);

const FilterSelect = ({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) => (
  <label className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
    <span className="hidden shrink-0 font-semibold sm:inline">{label}</span>
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className="min-w-0 bg-transparent text-xs font-semibold text-slate-800 outline-none dark:text-slate-100"
    >
      {children}
    </select>
  </label>
);

const LoadingRows = () => (
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    {Array.from({ length: 5 }).map((_, index) => (
      <div key={index} className="grid grid-cols-12 gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-slate-800">
        <div className="col-span-4 h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-3 h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-3 h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-2 h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    ))}
  </div>
);

const StatePanel = ({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
    <Icon size={22} className="mx-auto text-cadenza-600 dark:text-cadenza-300" />
    <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{body}</p>
  </div>
);

type EditorMode = 'create-student' | 'edit-student' | 'create-family' | 'edit-family';

interface EditorTarget {
  mode: EditorMode;
  studentId?: string;
  familyId?: string;
}

type DetailTarget =
  | { kind: 'student'; id: string }
  | { kind: 'family'; id: string };

interface StudentFamilyFormState {
  fullName: string;
  dateOfBirth: string;
  currentGrade: string;
  email: string;
  profileStatus: Student['profileStatus'];
  familyId: string;
  familyName: string;
  guardians: FamilyGuardian[];
  linkedStudentIds: string[];
  billingNotes: string;
  isArchived: boolean;
}

const NEW_FAMILY_VALUE = '__new_family__';
const DEFAULT_LEDGER_CURRENCY = 'ILS';

const emptyGuardian = (): FamilyGuardian => ({
  id: `guardian_${generateId()}`,
  fullName: '',
  relationship: '',
  phone: '',
  email: '',
  isPrimary: false,
});

const defaultFormState = (): StudentFamilyFormState => ({
  fullName: '',
  dateOfBirth: '',
  currentGrade: '',
  email: '',
  profileStatus: 'ACTIVE',
  familyId: NEW_FAMILY_VALUE,
  familyName: '',
  guardians: [{ ...emptyGuardian(), isPrimary: true }],
  linkedStudentIds: [],
  billingNotes: '',
  isArchived: false,
});

const familyForStudent = (families: Family[], studentId: string): Family | null =>
  families.find(family => !family.isArchived && family.studentIds.includes(studentId))
  ?? families.find(family => family.studentIds.includes(studentId))
  ?? null;

const formFromTarget = (
  target: EditorTarget,
  students: Student[],
  families: Family[],
): StudentFamilyFormState => {
  const base = defaultFormState();
  const student = target.studentId ? students.find(item => item.id === target.studentId) : null;
  const family = target.familyId
    ? families.find(item => item.id === target.familyId) ?? null
    : student
      ? familyForStudent(families, student.id)
      : null;

  if (student) {
    base.fullName = student.fullName;
    base.dateOfBirth = student.dateOfBirth || '';
    base.currentGrade = student.currentGrade === undefined ? '' : String(student.currentGrade);
    base.email = student.email ?? '';
    base.profileStatus = student.profileStatus;
  }

  if (family) {
    base.familyId = family.id;
    base.familyName = family.name;
    base.guardians = family.guardians.length > 0 ? family.guardians : base.guardians;
    base.linkedStudentIds = family.studentIds.filter(id => id !== student?.id);
    base.billingNotes = family.billingNotes ?? '';
    base.isArchived = family.isArchived;
  } else if (student) {
    base.familyName = `${student.fullName.split(' ').slice(-1)[0] || student.fullName} Family`;
  }

  return base;
};

const makeWriteContext = (orgId: string | null, actorId: string | null | undefined): StudentFamilyWriteContext => ({
  orgId: orgId ?? 'local',
  now: new Date().toISOString(),
  actorId: actorId ?? null,
  idFactory: seed => `${seed.split(':')[0]}_${generateId()}`,
});

const parseGrade = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) throw new Error('student_family.validation.grade');
  return parsed;
};

const normalizeGuardiansForForm = (guardians: FamilyGuardian[]): FamilyGuardian[] => {
  const nonEmpty = guardians.filter(guardian => guardian.fullName.trim());
  const source = nonEmpty.length > 0 ? nonEmpty : guardians;
  return source.map((guardian, index) => ({
    ...guardian,
    isPrimary: index === 0 ? true : guardian.isPrimary,
  }));
};

const StudentDesktopRow = ({
  row,
  t,
  onOpen,
  onEdit,
}: {
  key?: React.Key;
  row: StudentListRow;
  t: (key: string) => string;
  onOpen: () => void;
  onEdit: () => void;
}) => (
  <tr
    onClick={onOpen}
    className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
  >
    <td className="px-3 py-2.5">
      <div className="font-semibold text-slate-900 dark:text-white">{row.fullName}</div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {row.familyName || t('student_family.unlinked_family')}
      </div>
    </td>
    <td className="px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200">
      {row.guardianNames.join(', ') || t('student_family.no_guardian')}
      {row.guardianContact && <div className="text-xs text-slate-500 dark:text-slate-400">{row.guardianContact}</div>}
    </td>
    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
      {row.activeAssignmentCount > 0
        ? t('student_family.assignments_count').replace('{count}', String(row.activeAssignmentCount))
        : t('student_family.no_activity')}
    </td>
    <td className="px-3 py-2.5">
      <StatusBadge status={row.status} t={t} />
    </td>
    <td className="px-3 py-2.5 text-end">
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onEdit();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-cadenza-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cadenza-200"
        title={t('student_family.action.edit_student')}
        aria-label={t('student_family.action.edit_student')}
      >
        <Edit3 size={15} />
      </button>
    </td>
  </tr>
);

const FamilyDesktopRow = ({
  row,
  t,
  onOpen,
  onEdit,
}: {
  key?: React.Key;
  row: FamilyListRow;
  t: (key: string) => string;
  onOpen: () => void;
  onEdit: () => void;
}) => (
  <tr
    onClick={onOpen}
    className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
  >
    <td className="px-3 py-2.5">
      <div className="font-semibold text-slate-900 dark:text-white">{row.name}</div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {t('student_family.students_count').replace('{count}', String(row.studentCount))}
      </div>
    </td>
    <td className="px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200">
      {row.guardianNames.join(', ') || t('student_family.no_guardian')}
      {row.guardianContact && <div className="text-xs text-slate-500 dark:text-slate-400">{row.guardianContact}</div>}
    </td>
    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
      {row.studentNames.join(', ') || t('student_family.no_students_linked')}
    </td>
    <td className="px-3 py-2.5">
      <StatusBadge status={row.status} t={t} />
    </td>
    <td className="px-3 py-2.5 text-end">
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onEdit();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-cadenza-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cadenza-200"
        title={t('student_family.action.edit_family')}
        aria-label={t('student_family.action.edit_family')}
      >
        <Edit3 size={15} />
      </button>
    </td>
  </tr>
);

const MobileRow = ({
  row,
  t,
  onOpen,
}: {
  key?: React.Key;
  row: StudentListRow | FamilyListRow;
  t: (key: string) => string;
  onOpen: () => void;
}) => {
  const title = row.kind === 'student' ? row.fullName : row.name;
  const subtitle = row.kind === 'student'
    ? row.familyName || t('student_family.unlinked_family')
    : t('student_family.students_count').replace('{count}', String(row.studentCount));
  const detail = row.kind === 'student'
    ? row.guardianNames.join(', ') || t('student_family.no_guardian')
    : row.studentNames.join(', ') || t('student_family.no_students_linked');

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`student-family-mobile-row-${row.kind}-${row.id}`}
      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-start shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-cadenza-700 dark:bg-slate-800 dark:text-cadenza-200">
          {row.kind === 'student' ? <UserRound size={17} /> : <UsersRound size={17} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
            </div>
            <StatusBadge status={row.status} t={t} />
          </div>
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{detail}</div>
          {row.guardianContact && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.guardianContact}</div>}
        </div>
      </div>
    </button>
  );
};

const DETAIL_TABS: Array<{ id: StudentFamilyDetailTab; icon: React.ElementType; labelKey: string }> = [
  { id: 'profile', icon: UserRound, labelKey: 'student_family.detail.tab.profile' },
  { id: 'guardians', icon: UsersRound, labelKey: 'student_family.detail.tab.guardians' },
  { id: 'enrollments', icon: ClipboardList, labelKey: 'student_family.detail.tab.enrollments' },
  { id: 'lessons', icon: CalendarDays, labelKey: 'student_family.detail.tab.lessons' },
  { id: 'finance', icon: Landmark, labelKey: 'student_family.detail.tab.finance' },
  { id: 'documents', icon: FileText, labelKey: 'student_family.detail.tab.documents' },
  { id: 'agreements', icon: ScrollText, labelKey: 'student_family.detail.tab.agreements' },
  { id: 'history', icon: History, labelKey: 'student_family.detail.tab.history' },
];

const compactDate = (value: string | null | undefined) => {
  if (!value) return '—';
  return value.length > 10 ? value.slice(0, 10) : value;
};

const InfoCell = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
    <div className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-1 min-h-5 text-sm font-medium text-slate-900 dark:text-white">{value || '—'}</div>
  </div>
);

const lessonAttendanceClass = (attendance: LessonRecord['attendance'] | null) => {
  switch (attendance) {
    case 'PRESENT': return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300';
    case 'ABSENT': return 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/25 dark:text-red-300';
    case 'LATE': return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-300';
    case 'EXCUSED': return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/25 dark:text-blue-300';
    case 'MAKEUP': return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/25 dark:text-indigo-300';
    case 'UNMARKED':
    default: return 'border-stone-200 bg-stone-50 text-stone-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
};

const lessonCompletionLabelKey = (completion: LessonCompletion) => `attendance.completion.${completion.toLowerCase()}`;

const DetailEmpty = ({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center dark:border-slate-700 dark:bg-slate-950">
    <Icon size={20} className="mx-auto text-cadenza-600 dark:text-cadenza-300" />
    <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{body}</div>
  </div>
);

const DetailPanel = ({
  detail,
  activeTab,
  setActiveTab,
  t,
  language,
  orgId,
  canViewFinance,
  charges,
  payments,
  adjustments,
  balanceSnapshots,
  financeLedgerLoading,
  onOpenFinanceLedger,
  onEdit,
  onClose,
}: {
  detail: StudentFamilyDetailModel;
  activeTab: StudentFamilyDetailTab;
  setActiveTab: (tab: StudentFamilyDetailTab) => void;
  t: (key: string) => string;
  language: AppSettings['language'];
  orgId: string;
  canViewFinance: boolean;
  charges: Charge[];
  payments: Payment[];
  adjustments: Adjustment[];
  balanceSnapshots: BalanceSnapshot[];
  financeLedgerLoading: boolean;
  onOpenFinanceLedger?: (familyId: string) => void;
  onEdit: () => void;
  onClose: () => void;
}) => {
  const title = detail.kind === 'student' ? detail.student.fullName : detail.family.name;
  const subtitle = detail.kind === 'student'
    ? detail.family?.name ?? t('student_family.unlinked_family')
    : t('student_family.students_count').replace('{count}', String(detail.linkedStudents.length));
  const status = detail.kind === 'student'
    ? detail.student.profileStatus
    : detail.family.isArchived ? 'ARCHIVED' : 'ACTIVE';
  const ledgerFamilyId = detail.kind === 'student' ? detail.family?.id ?? null : detail.family.id;
  const formatAmount = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(language, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  };
  const buildFinanceSummary = (): (FamilyBalanceSummary & {
    chargeCount: number;
    paymentCount: number;
    adjustmentCount: number;
    snapshotCount: number;
  }) | null => {
    if (!ledgerFamilyId) return null;
    const balance = computeFamilyLedgerBalance({
      familyId: ledgerFamilyId,
      charges,
      payments,
      adjustments,
      context: { orgId, ledgerCurrency: DEFAULT_LEDGER_CURRENCY },
    });
    return {
      ...balance,
      chargeCount: charges.filter(charge => charge.orgId === orgId && charge.familyId === ledgerFamilyId).length,
      paymentCount: payments.filter(payment => payment.orgId === orgId && payment.familyId === ledgerFamilyId).length,
      adjustmentCount: adjustments.filter(adjustment => adjustment.orgId === orgId && adjustment.familyId === ledgerFamilyId).length,
      snapshotCount: balanceSnapshots.filter(snapshot => snapshot.orgId === orgId && snapshot.familyId === ledgerFamilyId).length,
    };
  };

  const renderProfile = () => (
    <div className="grid gap-2 sm:grid-cols-2">
      {detail.kind === 'student' ? (
        <>
          <InfoCell label={t('student_family.field.birth_date')} value={compactDate(detail.student.dateOfBirth)} />
          <InfoCell label={t('student_family.field.grade')} value={detail.student.currentGrade ?? '—'} />
          <InfoCell label={t('student_family.field.email')} value={detail.student.email ?? '—'} />
          <InfoCell label={t('student_family.col.family')} value={detail.family?.name ?? t('student_family.unlinked_family')} />
          <InfoCell label={t('student_family.detail.siblings')} value={detail.siblingStudents.map(student => student.fullName).join(', ') || '—'} />
          <InfoCell label={t('student_family.detail.notes')} value={String(detail.notes.length)} />
        </>
      ) : (
        <>
          <InfoCell label={t('student_family.field.family_name')} value={detail.family.name} />
          <InfoCell label={t('student_family.col.status')} value={<StatusBadge status={status} t={t} />} />
          <InfoCell label={t('student_family.col.students')} value={detail.linkedStudents.map(student => student.fullName).join(', ') || '—'} />
          <InfoCell label={t('student_family.detail.active_enrollments')} value={String(detail.enrollments.filter(row => row.status === 'ACTIVE').length)} />
          <InfoCell label={t('student_family.field.billing_notes')} value={detail.family.billingNotes ?? '—'} />
          <InfoCell label={t('student_family.detail.notes')} value={String(detail.notes.length)} />
        </>
      )}
    </div>
  );

  const renderGuardians = () => (
    detail.guardians.length === 0 ? (
      <DetailEmpty icon={UsersRound} title={t('student_family.no_guardian')} body={t('student_family.detail.no_guardian_body')} />
    ) : (
      <div className="space-y-2">
        {detail.guardians.map(guardian => (
          <div key={guardian.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{guardian.fullName}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{guardian.relationship || t('student_family.detail.relationship_unknown')}</div>
              </div>
              {guardian.isPrimary && (
                <span className="rounded border border-cadenza-200 bg-cadenza-50 px-2 py-0.5 text-[11px] font-semibold text-cadenza-700 dark:border-cadenza-900 dark:bg-cadenza-950/30 dark:text-cadenza-200">
                  {t('student_family.field.primary_guardian')}
                </span>
              )}
            </div>
            <div className="mt-2 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
              <span>{guardian.phone || t('student_family.detail.no_phone')}</span>
              <span>{guardian.email || t('student_family.detail.no_email')}</span>
            </div>
          </div>
        ))}
      </div>
    )
  );

  const renderEnrollments = () => (
    detail.enrollments.length === 0 ? (
      <DetailEmpty icon={ClipboardList} title={t('student_family.detail.no_enrollments')} body={t('student_family.detail.no_enrollments_body')} />
    ) : (
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        {detail.enrollments.map(row => (
          <div key={row.id} className="grid gap-2 border-b border-slate-100 p-3 text-sm last:border-b-0 dark:border-slate-800 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">{row.activityName}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{row.studentName} · {compactDate(row.startDate)} - {compactDate(row.endDate)}</div>
            </div>
            <StatusBadge status={row.status} t={t} />
          </div>
        ))}
      </div>
    )
  );

  const renderLessons = () => {
    const lessonCount = detail.lessonHistory.length;
    const recitalCount = detail.kind === 'student' ? detail.recitalHistory.length : 0;
    const reportCount = detail.kind === 'student' ? detail.reportCards.length : 0;
    if (lessonCount + recitalCount + reportCount === 0) {
      return <DetailEmpty icon={CalendarDays} title={t('student_family.detail.no_lessons')} body={t('student_family.detail.no_lessons_body')} />;
    }
    return (
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <InfoCell label={t('student_family.detail.lesson_entries')} value={String(lessonCount)} />
          <InfoCell label={t('student_family.detail.recitals')} value={String(recitalCount)} />
          <InfoCell label={t('student_family.detail.report_cards')} value={String(reportCount)} />
        </div>
        {detail.lessonHistory.length > 0 && (
          <div className="space-y-2">
            {detail.lessonHistory.slice(0, 5).map(entry => (
              <div key={entry.id} data-testid="student-family-lesson-history-row" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900 dark:text-white">
                      {entry.eventName || entry.summary || t('student_family.detail.lesson_entry')}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {[entry.date ? compactDate(entry.date) : null, detail.kind === 'family' ? entry.studentName : null].filter(Boolean).join(' · ') || t('student_family.detail.legacy_lesson_note')}
                    </div>
                  </div>
                  {entry.attendance && (
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${lessonAttendanceClass(entry.attendance)}`}>
                      {t(`attendance.status.${entry.attendance.toLowerCase()}`)}
                    </span>
                  )}
                </div>
                {entry.completion && (
                  <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t(lessonCompletionLabelKey(entry.completion))}
                  </div>
                )}
                {(entry.repertoire.length > 0 || entry.homework || entry.notes || (entry.summary && entry.eventName)) && (
                  <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {entry.repertoire.length > 0 && <p className="truncate">{t('attendance.panel.repertoire')}: {entry.repertoire.join(', ')}</p>}
                    {entry.homework && <p className="truncate">{t('attendance.panel.homework')}: {entry.homework}</p>}
                    {entry.notes && <p className="line-clamp-2">{t('attendance.panel.notes')}: {entry.notes}</p>}
                    {entry.summary && entry.eventName && <p className="line-clamp-2">{entry.summary}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderFinance = () => {
    if (!canViewFinance) {
      return <DetailEmpty icon={LockKeyhole} title={t('student_family.detail.finance_locked_title')} body={t('student_family.detail.finance_locked_body')} />;
    }
    if (!ledgerFamilyId) {
      return <DetailEmpty icon={ShieldAlert} title={t('student_family.detail.finance_no_family_title')} body={t('student_family.detail.finance_no_family_body')} />;
    }
    if (financeLedgerLoading) {
      return <DetailEmpty icon={Landmark} title={t('student_family.detail.finance_loading_title')} body={t('student_family.detail.finance_loading_body')} />;
    }

    let summary: ReturnType<typeof buildFinanceSummary>;
    try {
      summary = buildFinanceSummary();
    } catch (error) {
      return (
        <DetailEmpty
          icon={AlertCircle}
          title={t('student_family.detail.finance_cleanup_title')}
          body={error instanceof Error ? error.message : String(error)}
        />
      );
    }
    if (!summary) return null;

    return (
      <div data-testid="student-family-finance-panel" className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{t('student_family.detail.finance_summary_title')}</div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('student_family.detail.finance_summary_body')}</div>
            </div>
            <button
              type="button"
              onClick={() => onOpenFinanceLedger?.(ledgerFamilyId)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ArrowUpRight size={14} />
              {t('student_family.detail.open_finance_ledger')}
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <InfoCell label={t('student_family.detail.finance_balance')} value={<bdi>{formatAmount(summary.balance, summary.currency)}</bdi>} />
            <InfoCell label={t('student_family.detail.finance_open_charges')} value={String(summary.openChargeIds.length)} />
            <InfoCell label={t('student_family.detail.finance_total_paid')} value={<bdi>{formatAmount(summary.totalPaid, summary.currency)}</bdi>} />
            <InfoCell label={t('student_family.detail.finance_adjusted')} value={<bdi>{formatAmount(summary.totalAdjusted, summary.currency)}</bdi>} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <InfoCell label={t('student_family.detail.finance_charges')} value={String(summary.chargeCount)} />
          <InfoCell label={t('student_family.detail.finance_payments')} value={String(summary.paymentCount)} />
          <InfoCell label={t('student_family.detail.finance_adjustments')} value={String(summary.adjustmentCount)} />
          <InfoCell label={t('student_family.detail.finance_snapshots')} value={String(summary.snapshotCount)} />
        </div>
        {summary.openChargeIds.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <span className="font-semibold">{t('student_family.detail.finance_open_charge_ids')}: </span>
            <bdi>{summary.openChargeIds.join(', ')}</bdi>
          </div>
        )}
      </div>
    );
  };

  const renderDocuments = () => (
    detail.documents.length === 0 ? (
      <DetailEmpty icon={FileText} title={t('student_family.detail.no_documents')} body={t('student_family.detail.no_documents_body')} />
    ) : (
      <div className="space-y-2">
        {detail.documents.map(document => (
          <div key={document.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{document.label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{compactDate(document.uploadedAt)} · {document.uploadedBy}</div>
          </div>
        ))}
      </div>
    )
  );

  const renderAgreements = () => (
    <DetailEmpty icon={ScrollText} title={t('student_family.detail.agreements_source_ready_title')} body={t('student_family.detail.agreements_source_ready_body')} />
  );

  const renderHistory = () => (
    <div className="space-y-3">
      <div className="space-y-2">
        {detail.timeline.map(item => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
            <span className="font-semibold text-slate-800 dark:text-slate-100">{t(`student_family.history.${item.label}`)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{compactDate(item.at)}</span>
          </div>
        ))}
      </div>
      {detail.notes.length > 0 && (
        <div className="space-y-2">
          {detail.notes.slice(0, 4).map(note => (
            <div key={note.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              <div>{note.content}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{compactDate(note.createdAt)} · {note.createdBy}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderTab = () => {
    switch (activeTab) {
      case 'profile': return renderProfile();
      case 'guardians': return renderGuardians();
      case 'enrollments': return renderEnrollments();
      case 'lessons': return renderLessons();
      case 'finance': return renderFinance();
      case 'documents': return renderDocuments();
      case 'agreements': return renderAgreements();
      case 'history': return renderHistory();
      default: return null;
    }
  };

  return (
    <aside data-testid="student-family-detail-panel" className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-cadenza-700 dark:bg-slate-800 dark:text-cadenza-200">
            {detail.kind === 'student' ? <UserRound size={18} /> : <UsersRound size={18} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
              <StatusBadge status={status} t={t} />
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-cadenza-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cadenza-200"
            title={detail.kind === 'student' ? t('student_family.action.edit_student') : t('student_family.action.edit_family')}
            aria-label={detail.kind === 'student' ? t('student_family.action.edit_student') : t('student_family.action.edit_family')}
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            title={t('btn.close')}
            aria-label={t('btn.close')}
          >
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="border-b border-slate-200 p-2 dark:border-slate-800">
        <div role="tablist" className="flex gap-1 overflow-x-auto">
          {DETAIL_TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`student-family-detail-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${
                  active
                    ? 'bg-cadenza-100 text-cadenza-800 dark:bg-cadenza-900/30 dark:text-cadenza-100'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={13} />
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-3">{renderTab()}</div>
    </aside>
  );
};

export const StudentFamilyWorkspace: React.FC<Props> = ({
  settings,
  students,
  families,
  activities,
  lessonRecords = [],
  events = [],
  setStudents,
  setFamilies,
  orgId,
  actorId = null,
  canViewFinance = false,
  charges = [],
  payments = [],
  adjustments = [],
  balanceSnapshots = [],
  financeLedgerLoading = false,
  onOpenFinanceLedger,
  studentsLoading = false,
  familiesLoading = false,
  errorMessage = null,
  onMobileMenuOpen,
}) => {
  const [mode, setMode] = useState<StudentFamilyListMode>('students');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StudentFamilyStatusFilter>('active');
  const [activityId, setActivityId] = useState('all');
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [detailTab, setDetailTab] = useState<StudentFamilyDetailTab>('profile');
  const [form, setForm] = useState<StudentFamilyFormState>(defaultFormState);
  const [formBaseline, setFormBaseline] = useState<StudentFamilyFormState>(defaultFormState);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const isRtl = settings.language === 'he-IL';
  const isLoading = studentsLoading || familiesLoading;

  const activityLabels = useMemo(
    () => Object.fromEntries(activities.map(activity => [activity.id, activity.name])),
    [activities],
  );
  const activityOptions = useMemo(
    () => buildStudentFamilyActivityOptions(students, activityLabels),
    [students, activityLabels],
  );
  const model = useMemo(
    () => buildStudentFamilyListModel(students, families, { mode, query, status, activityId }),
    [students, families, mode, query, status, activityId],
  );
  const detailModel = useMemo(
    () => detailTarget ? buildStudentFamilyDetailModel(detailTarget, students, families, activities, lessonRecords, events) : null,
    [detailTarget, students, families, activities, lessonRecords, events],
  );

  const hasSourceRows = model.totalRows > 0;
  const isFilteredEmpty = hasSourceRows && model.rows.length === 0;
  const editorOpen = Boolean(editorTarget);
  const editorIsStudent = editorTarget?.mode === 'create-student' || editorTarget?.mode === 'edit-student';
  const editorIsCreate = editorTarget?.mode === 'create-student' || editorTarget?.mode === 'create-family';
  const editorFamily = form.familyId !== NEW_FAMILY_VALUE
    ? families.find(family => family.id === form.familyId) ?? null
    : null;
  const availableSiblingStudents = students.filter(student => student.id !== editorTarget?.studentId);

  const openEditor = (target: EditorTarget) => {
    const next = formFromTarget(target, students, families);
    setEditorTarget(target);
    setForm(next);
    setFormBaseline(next);
    setSaveError(null);
  };

  const openDetail = (target: DetailTarget) => {
    setDetailTarget(target);
    setDetailTab('profile');
  };

  const closeDetail = () => {
    setDetailTarget(null);
    setDetailTab('profile');
  };

  const closeEditor = () => {
    setEditorTarget(null);
    setSaveError(null);
    setSaving(false);
  };

  const updateGuardian = (index: number, patch: Partial<FamilyGuardian>) => {
    setForm(current => ({
      ...current,
      guardians: current.guardians.map((guardian, guardianIndex) => {
        if (guardianIndex !== index) {
          return patch.isPrimary ? { ...guardian, isPrimary: false } : guardian;
        }
        return { ...guardian, ...patch };
      }),
    }));
  };

  const addGuardian = () => {
    setForm(current => ({
      ...current,
      guardians: [...current.guardians, emptyGuardian()],
    }));
  };

  const removeGuardian = (index: number) => {
    setForm(current => {
      const next = current.guardians.filter((_, guardianIndex) => guardianIndex !== index);
      return {
        ...current,
        guardians: next.length > 0 ? normalizeGuardiansForForm(next) : [{ ...emptyGuardian(), isPrimary: true }],
      };
    });
  };

  const toggleLinkedStudent = (studentId: string) => {
    setForm(current => ({
      ...current,
      linkedStudentIds: current.linkedStudentIds.includes(studentId)
        ? current.linkedStudentIds.filter(id => id !== studentId)
        : [...current.linkedStudentIds, studentId],
    }));
  };

  const familyNameForSave = () => {
    if (form.familyId !== NEW_FAMILY_VALUE && editorFamily) return editorFamily.name;
    return form.familyName;
  };

  const saveEditor = async (): Promise<boolean> => {
    if (!editorTarget || saving) return false;
    setSaving(true);
    setSaveError(null);
    const ctx = makeWriteContext(orgId, actorId);

    try {
      const guardians = normalizeGuardiansForForm(form.guardians);
      const currentStudent = editorTarget.studentId
        ? students.find(student => student.id === editorTarget.studentId)
        : null;
      let nextStudents = students;
      let nextFamilies = families;
      let editedStudentId = currentStudent?.id ?? null;
      let targetFamilyId = form.familyId;
      let familyRecord: Family | null = editorFamily;

      if (editorIsStudent) {
        const studentInput = {
          fullName: form.fullName,
          dateOfBirth: form.dateOfBirth,
          currentGrade: parseGrade(form.currentGrade),
          email: form.email,
          profileStatus: form.profileStatus,
        };
        const studentBoundary = currentStudent
          ? applyStudentProfilePatch(currentStudent, studentInput, ctx)
          : buildStudentWriteBoundary(studentInput, ctx);
        editedStudentId = studentBoundary.student.id;
        nextStudents = currentStudent
          ? students.map(student => student.id === studentBoundary.student.id ? studentBoundary.student : student)
          : [...students, studentBoundary.student];
      }

      if (form.familyId === NEW_FAMILY_VALUE || !familyRecord) {
        familyRecord = buildFamilyRecord(
          {
            name: familyNameForSave(),
            guardians,
            studentIds: [
              ...(editedStudentId ? [editedStudentId] : []),
              ...form.linkedStudentIds,
            ],
            billingNotes: form.billingNotes,
            isArchived: form.isArchived,
          },
          ctx,
        );
        targetFamilyId = familyRecord.id;
        nextFamilies = [...families, familyRecord];
      } else {
        const memberIds = [
          ...(editedStudentId ? [editedStudentId] : []),
          ...form.linkedStudentIds,
        ];
        const nextFamilyStudentIds = editorTarget.mode === 'create-student'
          ? [...familyRecord.studentIds, ...memberIds]
          : memberIds.length > 0
            ? memberIds
            : familyRecord.studentIds;
        familyRecord = applyFamilyPatch(
          familyRecord,
          {
            name: form.familyName,
            guardians,
            studentIds: nextFamilyStudentIds,
            billingNotes: form.billingNotes,
            isArchived: form.isArchived,
          },
          ctx,
        );
        nextFamilies = families.map(family => family.id === familyRecord?.id ? familyRecord as Family : family);
      }

      const movedIds = [
        ...(editedStudentId ? [editedStudentId] : []),
        ...form.linkedStudentIds,
      ];
      nextFamilies = reconcileFamilyStudentLinks(nextFamilies, targetFamilyId, movedIds, ctx);
      if (familyRecord) {
        nextFamilies = nextFamilies.map(family => (
          family.id === targetFamilyId
            ? applyFamilyPatch(family, {
                name: form.familyName || family.name,
                guardians,
                primaryContactGuardianId: guardians.find(guardian => guardian.isPrimary)?.id ?? guardians[0]?.id ?? null,
                billingNotes: form.billingNotes,
                isArchived: form.isArchived,
              }, ctx)
            : family
        ));
      }

      await Promise.all([
        setStudents(nextStudents),
        setFamilies(nextFamilies),
      ]);
      closeEditor();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'student_family.save_error';
      setSaveError(t(message));
      setSaving(false);
      return false;
    }
  };

  return (
    <div
      data-testid="student-family-workspace"
      className="flex h-full flex-col bg-slate-50 dark:bg-slate-950"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="border-b border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-h-[52px] items-center gap-3 px-2">
          <button
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
            onClick={onMobileMenuOpen}
            aria-label={t('layout.open_sidebar')}
          >
            <Menu size={24} />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cadenza-gradient text-white shadow-cadenza-soft texture-cadenza">
              <GraduationCap size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold leading-tight text-slate-900 dark:text-white">
                {t('student_family.title')}
              </h2>
              <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
                {t('student_family.subtitle')}
              </p>
            </div>
          </div>

          <div className="ms-auto flex items-center gap-2">
            <button
              type="button"
              aria-label={t('student_family.action.new_student')}
              data-testid="student-family-new-student"
              onClick={() => {
                setMode('students');
                openEditor({ mode: 'create-student' });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cadenza-gradient px-3 text-xs font-semibold text-white shadow-cadenza-soft texture-cadenza"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">{t('student_family.action.new_student')}</span>
            </button>
            <button
              type="button"
              aria-label={t('student_family.action.new_family')}
              data-testid="student-family-new-family"
              onClick={() => {
                setMode('families');
                openEditor({ mode: 'create-family' });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <UsersRound size={14} />
              <span className="hidden sm:inline">{t('student_family.action.new_family')}</span>
            </button>
          </div>

          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
            {(['students', 'families'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setMode(tab)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold sm:px-3 ${
                  mode === tab
                    ? 'bg-white text-cadenza-700 shadow-sm dark:bg-slate-700 dark:text-cadenza-200'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'students' ? <UserRound size={14} /> : <UsersRound size={14} />}
                <span>{tab === 'students' ? t('student_family.tab.students') : t('student_family.tab.families')}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label={t('student_family.stat.students')} value={model.totalStudents} icon={GraduationCap} />
            <Stat label={t('student_family.stat.active')} value={model.activeStudents} icon={UserRound} />
            <Stat label={t('student_family.stat.families')} value={model.totalFamilies} icon={UsersRound} />
            <Stat label={t('student_family.stat.archived')} value={model.archivedStudents + model.archivedFamilies} icon={Archive} />
            <Stat label={t('student_family.stat.results')} value={model.rows.length} icon={SlidersHorizontal} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder={mode === 'students' ? t('student_family.search.students') : t('student_family.search.families')}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 ps-9 pe-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterSelect label={t('student_family.filter.status')} value={status} onChange={value => setStatus(value as StudentFamilyStatusFilter)}>
                  <option value="all">{t('student_family.filter.all_status')}</option>
                  <option value="active">{t('student_family.status.active')}</option>
                  <option value="archived">{t('student_family.status.archived')}</option>
                </FilterSelect>
                <FilterSelect label={t('student_family.filter.activity')} value={activityId} onChange={setActivityId}>
                  <option value="all">{t('student_family.filter.all_activities')}</option>
                  {activityOptions.map(activity => (
                    <option key={activity.id} value={activity.id}>{activity.label}</option>
                  ))}
                </FilterSelect>
              </div>
            </div>
          </div>

          <div className={detailModel ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]' : 'space-y-4'}>
            <div className="space-y-4">
              {errorMessage ? (
                <StatePanel icon={AlertCircle} title={t('student_family.error_title')} body={errorMessage} />
              ) : isLoading ? (
                <LoadingRows />
              ) : !hasSourceRows ? (
                <StatePanel
                  icon={mode === 'students' ? GraduationCap : UsersRound}
                  title={mode === 'students' ? t('student_family.empty.students_title') : t('student_family.empty.families_title')}
                  body={mode === 'students' ? t('student_family.empty.students_body') : t('student_family.empty.families_body')}
                />
              ) : isFilteredEmpty ? (
                <StatePanel icon={Search} title={t('student_family.no_results_title')} body={t('student_family.no_results_body')} />
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 md:block">
                    <table className="w-full table-fixed text-start text-sm">
                      <thead className="border-b border-slate-200 bg-slate-100 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                        <tr>
                          <th className="w-[30%] px-3 py-2 text-start font-semibold">
                            {mode === 'students' ? t('student_family.col.student') : t('student_family.col.family')}
                          </th>
                          <th className="w-[30%] px-3 py-2 text-start font-semibold">{t('student_family.col.guardian')}</th>
                          <th className="w-[27%] px-3 py-2 text-start font-semibold">
                            {mode === 'students' ? t('student_family.col.activity') : t('student_family.col.students')}
                          </th>
                          <th className="w-[10%] px-3 py-2 text-start font-semibold">{t('student_family.col.status')}</th>
                          <th className="w-[3%] px-3 py-2 text-end font-semibold">{t('student_family.col.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.rows.map(row => (
                          row.kind === 'student'
                            ? (
                              <StudentDesktopRow
                                key={row.id}
                                row={row}
                                t={t}
                                onOpen={() => openDetail({ kind: 'student', id: row.id })}
                                onEdit={() => openEditor({ mode: 'edit-student', studentId: row.id })}
                              />
                            )
                            : (
                              <FamilyDesktopRow
                                key={row.id}
                                row={row}
                                t={t}
                                onOpen={() => openDetail({ kind: 'family', id: row.id })}
                                onEdit={() => openEditor({ mode: 'edit-family', familyId: row.id })}
                              />
                            )
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 md:hidden">
                    {model.rows.map(row => (
                      <MobileRow
                        key={row.id}
                        row={row}
                        t={t}
                        onOpen={() => openDetail(row.kind === 'student'
                          ? { kind: 'student', id: row.id }
                          : { kind: 'family', id: row.id })}
                      />
                    ))}
                  </div>
                </>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-cadenza-600 dark:text-cadenza-300" />
                  <span>{t('student_family.list_note')}</span>
                </div>
              </div>
            </div>

            {detailModel && (
              <DetailPanel
                detail={detailModel}
                activeTab={detailTab}
                setActiveTab={setDetailTab}
                t={t}
                language={settings.language}
                orgId={orgId ?? 'local'}
                canViewFinance={canViewFinance}
                charges={charges}
                payments={payments}
                adjustments={adjustments}
                balanceSnapshots={balanceSnapshots}
                financeLedgerLoading={financeLedgerLoading}
                onOpenFinanceLedger={onOpenFinanceLedger}
                onEdit={() => openEditor(detailModel.kind === 'student'
                  ? { mode: 'edit-student', studentId: detailModel.student.id }
                  : { mode: 'edit-family', familyId: detailModel.family.id })}
                onClose={closeDetail}
              />
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={editorOpen}
        onClose={closeEditor}
        title={editorIsStudent
          ? (editorIsCreate ? t('student_family.modal.new_student') : t('student_family.modal.edit_student'))
          : (editorIsCreate ? t('student_family.modal.new_family') : t('student_family.modal.edit_family'))}
        isDirty={JSON.stringify(form) !== JSON.stringify(formBaseline)}
        onSave={saveEditor}
        maxWidth="max-w-4xl"
      >
        <form
          className="space-y-5"
          onSubmit={event => {
            event.preventDefault();
            void saveEditor();
          }}
        >
          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {saveError}
            </div>
          )}

          {editorIsStudent && (
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                <UserRound size={14} className="text-cadenza-600 dark:text-cadenza-300" />
                {t('student_family.section.student')}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>{t('student_family.field.student_name')}</span>
                  <input
                    required
                    value={form.fullName}
                    onChange={event => setForm(current => ({ ...current, fullName: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>{t('student_family.field.email')}</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>{t('student_family.field.birth_date')}</span>
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={event => setForm(current => ({ ...current, dateOfBirth: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>{t('student_family.field.grade')}</span>
                  <input
                    inputMode="numeric"
                    value={form.currentGrade}
                    onChange={event => setForm(current => ({ ...current, currentGrade: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>{t('student_family.field.student_status')}</span>
                  <select
                    value={form.profileStatus}
                    onChange={event => setForm(current => ({ ...current, profileStatus: event.target.value as Student['profileStatus'] }))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="ACTIVE">{t('student_family.status.active')}</option>
                    <option value="ARCHIVED">{t('student_family.status.archived')}</option>
                  </select>
                </label>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              <UsersRound size={14} className="text-cadenza-600 dark:text-cadenza-300" />
              {t('student_family.section.family')}
            </div>
            {editorIsStudent && (
              <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                <span>{t('student_family.field.family')}</span>
                <select
                  value={form.familyId}
                  onChange={event => {
                    const familyId = event.target.value;
                    const nextFamily = families.find(family => family.id === familyId) ?? null;
                    setForm(current => ({
                      ...current,
                      familyId,
                      familyName: nextFamily?.name ?? '',
                      guardians: nextFamily?.guardians.length ? nextFamily.guardians : [{ ...emptyGuardian(), isPrimary: true }],
                      linkedStudentIds: nextFamily?.studentIds.filter(id => id !== editorTarget?.studentId) ?? [],
                      billingNotes: nextFamily?.billingNotes ?? '',
                      isArchived: nextFamily?.isArchived ?? false,
                    }));
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value={NEW_FAMILY_VALUE}>{t('student_family.family.new_option')}</option>
                  {families.map(family => (
                    <option key={family.id} value={family.id}>{family.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                <span>{t('student_family.field.family_name')}</span>
                <input
                  required
                  value={form.familyName}
                  onChange={event => setForm(current => ({ ...current, familyName: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                <span>{t('student_family.field.billing_notes')}</span>
                <input
                  value={form.billingNotes}
                  onChange={event => setForm(current => ({ ...current, billingNotes: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
            </div>
            <label className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              <input
                type="checkbox"
                checked={form.isArchived}
                onChange={event => setForm(current => ({ ...current, isArchived: event.target.checked }))}
                className="h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
              />
              {t('student_family.field.archive_family')}
            </label>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                <UserRound size={14} className="text-cadenza-600 dark:text-cadenza-300" />
                {t('student_family.section.guardians')}
              </div>
              <button
                type="button"
                onClick={addGuardian}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Plus size={13} />
                {t('student_family.action.add_guardian')}
              </button>
            </div>
            <div className="space-y-2">
              {form.guardians.map((guardian, index) => (
                <div key={guardian.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="grid gap-2 md:grid-cols-4">
                    <input
                      required={index === 0}
                      value={guardian.fullName}
                      onChange={event => updateGuardian(index, { fullName: event.target.value })}
                      placeholder={t('student_family.field.guardian_name')}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      value={guardian.relationship ?? ''}
                      onChange={event => updateGuardian(index, { relationship: event.target.value })}
                      placeholder={t('student_family.field.relationship')}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      value={guardian.phone ?? ''}
                      onChange={event => updateGuardian(index, { phone: event.target.value })}
                      placeholder={t('student_family.field.phone')}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      type="email"
                      value={guardian.email ?? ''}
                      onChange={event => updateGuardian(index, { email: event.target.value })}
                      placeholder={t('student_family.field.guardian_email')}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <input
                        type="radio"
                        name="primary-guardian"
                        checked={guardian.isPrimary}
                        onChange={() => updateGuardian(index, { isPrimary: true })}
                      />
                      {t('student_family.field.primary_guardian')}
                    </label>
                    <button
                      type="button"
                      onClick={() => removeGuardian(index)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      {t('student_family.action.remove_guardian')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              <UsersRound size={14} className="text-cadenza-600 dark:text-cadenza-300" />
              {t('student_family.section.linked_students')}
            </div>
            {availableSiblingStudents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {t('student_family.no_siblings_available')}
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {availableSiblingStudents.map(student => (
                  <label key={student.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={form.linkedStudentIds.includes(student.id)}
                      onChange={() => toggleLinkedStudent(student.id)}
                      className="h-4 w-4 rounded border-slate-300 text-cadenza-700 focus:ring-cadenza-500"
                    />
                    <span className="min-w-0 truncate">{student.fullName}</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={closeEditor}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('btn.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-cadenza-gradient px-4 py-2 text-sm font-semibold text-white shadow-cadenza-soft texture-cadenza disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? t('student_family.saving') : t('btn.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
