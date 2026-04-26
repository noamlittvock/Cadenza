import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Teacher, ListsState, AppSettings, HoursReport, Student, AdminInboxItem } from '../types';
import { buildActivityMap, getActivityName } from '../utils/activityLookup';
import type {
  ActivityV2, StaffMemberV2, TeachingAssignmentV2, OrgRoleV2,
  StaffRole, RateTypeV2, L2Subcategory,
  EventV2, EventParticipant, FirstUseFlags,
} from '../types/v2';
import { ImportExportDropdown } from './ImportExportDropdown';
import { V2_COLLECTIONS } from '../types/v2';
import { generateId, TRANSLATIONS } from '../constants';
import { useFirestoreSync } from '../utils/useFirestoreSync';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';
import {
  Plus, Edit2, Archive, RotateCcw, Menu, LayoutGrid, List, X,
  Search, HelpCircle, Sparkles, Shield, ShieldCheck, User,
  Briefcase, GraduationCap, ChevronRight, Trash2, Table2, ChevronUp, ChevronDown, Filter,
  Check,
} from 'lucide-react';
import { useSortState } from '../utils/useSortState';
import { useListStyle } from '../utils/useListStyle';
import { SlideOver } from './SlideOver';
import { StaffSlideOverContent } from './StaffSlideOverContent';
import { useColumnFilters, type ColumnFilterConfig } from '../utils/useColumnFilters';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { FilterPills } from './FilterPills';
import { RateConfigFields } from './RateConfigFields';
import { DocumentSection } from './DocumentSection';

// ─── Constants ──────────────────────────────────────────────────────────────

const RATE_TYPES: RateTypeV2[] = ['HOURLY', 'PER_EVENT', 'MONTHLY_FLAT'];
const STAFF_ROLES: StaffRole[] = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];

const ROLE_CONFIG: Record<StaffRole, { icon: React.ElementType; color: string }> = {
  SUPER_ADMIN: { icon: ShieldCheck, color: 'red' },
  ADMIN: { icon: Shield, color: 'blue' },
  STAFF: { icon: User, color: 'slate' },
};

// ─── Local storage helpers ──────────────────────────────────────────────────

const PREFILL_KEY = 'cadenza_staff_prefill';
const WALKTHROUGH_KEY = 'cadenza_staff_walkthrough_done';

function savePrefill(uid: string, data: { role: StaffRole; rateType: RateTypeV2; rateValue: number }) {
  try { localStorage.setItem(`${PREFILL_KEY}_${uid}`, JSON.stringify(data)); } catch { /* noop */ }
}
function loadPrefill(uid: string): { role: StaffRole; rateType: RateTypeV2; rateValue: number } | null {
  try {
    const raw = localStorage.getItem(`${PREFILL_KEY}_${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function isWalkthroughDone(uid: string): boolean {
  try { return localStorage.getItem(`${WALKTHROUGH_KEY}_${uid}`) === '1'; } catch { return false; }
}
function markWalkthroughDone(uid: string) {
  try { localStorage.setItem(`${WALKTHROUGH_KEY}_${uid}`, '1'); } catch { /* noop */ }
}

// ─── Overlap detection ──────────────────────────────────────────────────────

function datesOverlap(
  aStart: string, aEnd: string | null,
  bStart: string, bEnd: string | null,
): boolean {
  const a0 = aStart;
  const a1 = aEnd || '9999-12-31';
  const b0 = bStart;
  const b1 = bEnd || '9999-12-31';
  return a0 <= b1 && b0 <= a1;
}

// ─── Props (v1.3 compat — same interface as before for App.tsx) ─────────────

interface Props {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  lists: ListsState;
  setLists: React.Dispatch<React.SetStateAction<ListsState>>;
  activities: ActivityV2[];
  settings: AppSettings;
  hoursReports: HoursReport[];
  setHoursReports: React.Dispatch<React.SetStateAction<HoursReport[]>>;
  students: Student[];
  adminInboxItems: AdminInboxItem[];
  setAdminInboxItems: React.Dispatch<React.SetStateAction<AdminInboxItem[]>>;
  onMobileMenuOpen: () => void;
  navigateToId?: string | null;
  onNavigateHandled?: () => void;
}

export const StaffMemberManager: React.FC<Props> = ({
  activities, settings, onMobileMenuOpen, navigateToId, onNavigateHandled,
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const { currentUser, isSuperAdmin, isAdmin, orgId } = useAuth();

  // ─── v2.0 Internal collections ──────────────────────────────────────────
  const [staffMembers, setStaffMembers] = useFirestoreSync<StaffMemberV2>(V2_COLLECTIONS.staffMembers, []);
  const [assignments, setAssignments] = useFirestoreSync<TeachingAssignmentV2>(V2_COLLECTIONS.teachingAssignments, []);
  const [orgRoles, setOrgRoles] = useFirestoreSync<OrgRoleV2>(V2_COLLECTIONS.orgRoles, []);
  const [l2Subcategories] = useFirestoreSync<L2Subcategory>(V2_COLLECTIONS.l2Subcategories, []);
  const [eventsV2] = useFirestoreSync<EventV2>(V2_COLLECTIONS.events, []);
  const [eventParticipantsV2, setEventParticipantsV2] = useFirestoreSync<EventParticipant>(V2_COLLECTIONS.eventParticipants, []);

  const activityMap = useMemo(() => buildActivityMap(activities), [activities]);

  // ─── View state ─────────────────────────────────────────────────────────
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [listStyle, setListStyle] = useListStyle(['grid', 'list', 'table']);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // ─── Navigate-to from AdminInbox ──────────────────────────────────────────
  useEffect(() => {
    if (navigateToId) {
      setSelectedStaffId(navigateToId);
      onNavigateHandled?.();
    }
  }, [navigateToId]);

  // ─── Staff CRUD modal ───────────────────────────────────────────────────
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<StaffRole>('STAFF');
  const [formUid, setFormUid] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [staffError, setStaffError] = useState('');

  // ─── Walkthrough ────────────────────────────────────────────────────────
  const [walkthroughStep, setWalkthroughStep] = useState<number | null>(null);

  // ─── Onboarding wizard (create flow only) ─────────────────────────────
  const [wizardStep, setWizardStep] = useState<number | null>(null);

  // ─── Assignment modal ───────────────────────────────────────────────────
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [aFormActivityId, setAFormActivityId] = useState('');
  const [aFormL2Id, setAFormL2Id] = useState('');
  const [aFormRateType, setAFormRateType] = useState<RateTypeV2>('HOURLY');
  const [aFormRateValue, setAFormRateValue] = useState(0);
  const [aFormStartDate, setAFormStartDate] = useState('');
  const [aFormEndDate, setAFormEndDate] = useState('');
  const [assignmentError, setAssignmentError] = useState('');

  // ─── OrgRole modal ──────────────────────────────────────────────────────
  const [isOrgRoleModalOpen, setIsOrgRoleModalOpen] = useState(false);
  const [editingOrgRoleId, setEditingOrgRoleId] = useState<string | null>(null);
  const [orFormTitle, setOrFormTitle] = useState('');
  const [orFormRateType, setOrFormRateType] = useState<RateTypeV2>('MONTHLY_FLAT');
  const [orFormRateValue, setOrFormRateValue] = useState(0);
  const [orFormStartDate, setOrFormStartDate] = useState('');
  const [orFormEndDate, setOrFormEndDate] = useState('');
  const [orgRoleError, setOrgRoleError] = useState('');

  // ─── Form reset helpers ────────────────────────────────────────────────

  const resetAssignmentForm = useCallback(() => {
    setAssignmentError('');
    setEditingAssignmentId(null);
    setAFormActivityId('');
    setAFormL2Id('');
    setAFormRateType('HOURLY');
    setAFormRateValue(0);
    setAFormStartDate(new Date().toISOString().slice(0, 10));
    setAFormEndDate('');
  }, []);

  const resetOrgRoleForm = useCallback(() => {
    setOrgRoleError('');
    setOrFormTitle('');
    setOrFormRateType('MONTHLY_FLAT');
    setOrFormRateValue(0);
    setOrFormStartDate(new Date().toISOString().slice(0, 10));
    setOrFormEndDate('');
  }, []);

  // ─── Archive cascade modal ──────────────────────────────────────────────
  const [archiveCascadeStaffId, setArchiveCascadeStaffId] = useState<string | null>(null);

  // ─── Derived data ───────────────────────────────────────────────────────

  const selectedStaff = useMemo(
    () => staffMembers.find(s => s.id === selectedStaffId) || null,
    [staffMembers, selectedStaffId],
  );

  const filteredStaff = useMemo(() => {
    const q = search.toLowerCase();
    return staffMembers
      .filter(s => showArchived ? s.isArchived : !s.isArchived)
      .filter(s => !q || s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [staffMembers, search, showArchived]);

  // ─── Table view: sort + activity summary ──────────────────────────────
  type StaffSortKey = 'fullName' | 'role' | 'email' | 'assignmentCount';
  const { sortKey, sortDirection, toggleSort } = useSortState<StaffSortKey>('fullName');

  // ─── Column filters ─────────────────────────────────────────────────────
  const staffColumnConfigs: ColumnFilterConfig<StaffMemberV2>[] = useMemo(() => [
    { key: 'fullName', type: 'text' as const, label: t('staff.table.name'), getValue: s => s.fullName },
    { key: 'role', type: 'checkbox' as const, label: t('staff.table.role'), getValue: s => s.role },
    { key: 'email', type: 'text' as const, label: t('staff.table.email'), getValue: s => s.email ?? '' },
    { key: 'activities', type: 'checkbox' as const, label: t('staff.table.activities'), getValue: (s: StaffMemberV2) => {
      const active = assignments.filter(a => a.staffMemberId === s.id && !a.isArchived);
      return active.map(a => getActivityName(activityMap, a.activityId)).filter(Boolean);
    }},
  ], [t, assignments, activityMap]);

  const {
    filters: staffColumnFilters,
    setCheckboxFilter: setStaffCheckboxFilter,
    clearFilter: clearStaffColumnFilter,
    clearAll: clearAllStaffColumnFilters,
    hasActiveFilters: hasStaffActiveFilters,
    filteredData: staffColumnFilteredData,
    distinctValues: staffDistinctValues,
    activeFilterSummary: staffActiveFilterSummary,
  } = useColumnFilters(filteredStaff, staffColumnConfigs);

  const [openStaffFilterKey, setOpenStaffFilterKey] = useState<string | null>(null);

  const staffActivitySummary = useMemo(() => {
    const map = new Map<string, { names: string[]; count: number }>();
    for (const s of staffColumnFilteredData) {
      const active = assignments.filter(a => a.staffMemberId === s.id && !a.isArchived);
      const names = active.map(a => getActivityName(activityMap, a.activityId)).filter(Boolean);
      map.set(s.id, { names, count: active.length });
    }
    return map;
  }, [staffColumnFilteredData, assignments, activityMap]);

  const sortedStaff = useMemo(() => {
    if (listStyle !== 'table') return staffColumnFilteredData;
    const sorted = [...staffColumnFilteredData];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'fullName': cmp = a.fullName.localeCompare(b.fullName); break;
        case 'role': cmp = (a.role || '').localeCompare(b.role || ''); break;
        case 'email': cmp = (a.email || '').localeCompare(b.email || ''); break;
        case 'assignmentCount': {
          const ac = staffActivitySummary.get(a.id)?.count ?? 0;
          const bc = staffActivitySummary.get(b.id)?.count ?? 0;
          cmp = ac - bc;
          break;
        }
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [staffColumnFilteredData, listStyle, sortKey, sortDirection, staffActivitySummary]);

  const staffAssignments = useMemo(
    () => selectedStaffId ? assignments.filter(a => a.staffMemberId === selectedStaffId) : [],
    [assignments, selectedStaffId],
  );

  const staffOrgRoles = useMemo(
    () => selectedStaffId ? orgRoles.filter(r => r.staffMemberId === selectedStaffId) : [],
    [orgRoles, selectedStaffId],
  );

  const l2sForActivity = useMemo(
    () => aFormActivityId ? l2Subcategories.filter(l => l.activityId === aFormActivityId && !l.isArchived) : [],
    [l2Subcategories, aFormActivityId],
  );

  const canWrite = isSuperAdmin || isAdmin;

  // ─── CSV Import/Export data ──────────────────────────────────────────────

  const staffExportData = useMemo(() => staffMembers.map(s => ({
    fullName: s.fullName,
    email: s.email || '',
    phone: s.phone || '',
    role: s.role || '',
  })), [staffMembers]);

  const staffDupKeys = useMemo(
    () => new Set(staffMembers.map(s => (s.email || '').trim().toLowerCase())),
    [staffMembers],
  );

  const assignmentExportData = useMemo(() => assignments.map(a => ({
    staffEmail: staffMembers.find(s => s.id === a.staffMemberId)?.email || '',
    activityName: getActivityName(activityMap, a.activityId, ''),
    l2Name: l2Subcategories.find(l => l.id === a.l2Id)?.name || '',
    rateType: a.rateType || '',
    rateValue: String(a.rateValue || ''),
    startDate: a.startDate || '',
  })), [assignments, staffMembers, activities, l2Subcategories]);

  const assignmentDupKeys = useMemo(() => new Set(assignments.map(a => {
    const email = staffMembers.find(s => s.id === a.staffMemberId)?.email || '';
    const aName = getActivityName(activityMap, a.activityId, '');
    const lName = l2Subcategories.find(l => l.id === a.l2Id)?.name || '';
    return `${email}|${aName}|${lName}`.toLowerCase();
  })), [assignments, staffMembers, activities, l2Subcategories]);

  const csvStaffByEmail = useMemo(
    () => Object.fromEntries(staffMembers.map(s => [(s.email || '').toLowerCase(), s.id])),
    [staffMembers],
  );
  const csvActivityByName = useMemo(
    () => Object.fromEntries(activities.map(a => [a.name.toLowerCase(), a.id])),
    [activities],
  );
  const csvL2ByName = useMemo(
    () => Object.fromEntries(l2Subcategories.map(l => [l.name.toLowerCase(), l.id])),
    [l2Subcategories],
  );

  const DEFAULT_FIRST_USE_FLAGS: FirstUseFlags = {
    activityHub: false, staffModule: false, studentModule: false,
    eventCreation: false, enrollment: false, payslips: false,
  };

  const handleStaffImportComplete = useCallback((rows: Record<string, string>[]) => {
    const now = Timestamp.now();
    const newStaff: StaffMemberV2[] = rows.map(row => ({
      id: generateId(), orgId: orgId || '',
      uid: '',
      fullName: row['fullName'] || '',
      email: row['email'] || '',
      phone: row['phone'] || null,
      role: (row['role'] as StaffRole) || 'STAFF',
      isArchived: false,
      isFirstAdmin: false,
      onboardingDismissed: true,
      firstUseFlags: DEFAULT_FIRST_USE_FLAGS,
      startDate: null,
      documents: [],
      createdAt: now, updatedAt: now,
    }));
    setStaffMembers(prev => [...prev, ...newStaff]);
  }, [orgId, setStaffMembers]);

  const handleAssignmentImportComplete = useCallback((rows: Record<string, string>[]) => {
    const now = Timestamp.now();
    const newAssignments: TeachingAssignmentV2[] = rows.map(row => ({
      id: generateId(), orgId: orgId || '',
      staffMemberId: csvStaffByEmail[row['staffEmail']?.trim().toLowerCase() || ''] || selectedStaffId || '',
      activityId: csvActivityByName[row['activityName']?.trim().toLowerCase() || ''] || '',
      l2Id: csvL2ByName[row['l2Name']?.trim().toLowerCase() || ''] || '',
      rateType: (row['rateType'] as RateTypeV2) || 'HOURLY',
      rateValue: parseFloat(row['rateValue']) || 0,
      startDate: row['startDate'] || '',
      endDate: null,
      isArchived: false,
      createdAt: now, updatedAt: now,
    }));
    setAssignments(prev => [...prev, ...newAssignments]);
  }, [orgId, setAssignments, csvStaffByEmail, csvActivityByName, csvL2ByName, selectedStaffId]);

  // ─── Helpers ────────────────────────────────────────────────────────────

  const rateLabel = useCallback((rt: RateTypeV2) => {
    switch (rt) {
      case 'HOURLY': return t('staff.v2.rate_hourly');
      case 'PER_EVENT': return t('staff.v2.rate_per_event');
      case 'MONTHLY_FLAT': return t('staff.v2.rate_monthly_flat');
    }
  }, [settings.language]);

  const roleLabel = useCallback((r: StaffRole) => {
    switch (r) {
      case 'SUPER_ADMIN': return t('staff.role.super_admin');
      case 'ADMIN': return t('staff.role.admin');
      case 'STAFF': return t('staff.role.staff');
    }
  }, [settings.language]);

  const activityName = useCallback((id: string) => {
    return getActivityName(activityMap, id, id);
  }, [activityMap]);

  const l2Name = useCallback((id: string) => {
    return l2Subcategories.find(l => l.id === id)?.name || id;
  }, [l2Subcategories]);

  // ─── Staff CRUD ─────────────────────────────────────────────────────────

  const openCreateStaff = useCallback(() => {
    if (!canWrite) return;
    setEditingStaffId(null);
    setStaffError('');

    const prefill = currentUser ? loadPrefill(currentUser.uid) : null;
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormRole(prefill?.role || 'STAFF');
    setFormUid('');
    setFormStartDate('');

    // Check walkthrough
    if (currentUser && !isWalkthroughDone(currentUser.uid)) {
      setWalkthroughStep(1);
    } else {
      setWalkthroughStep(null);
    }

    setWizardStep(1);
    setIsStaffModalOpen(true);
  }, [canWrite, currentUser]);

  const openEditStaff = useCallback((staff: StaffMemberV2) => {
    if (!canWrite) return;
    setEditingStaffId(staff.id);
    setStaffError('');
    setFormName(staff.fullName);
    setFormEmail(staff.email);
    setFormPhone(staff.phone || '');
    setFormRole(staff.role);
    setFormUid(staff.uid);
    setFormStartDate(staff.startDate ?? '');
    setWalkthroughStep(null);
    setWizardStep(null);
    setIsStaffModalOpen(true);
  }, [canWrite]);

  const openGuideMe = useCallback(() => {
    setWalkthroughStep(1);
  }, []);

  const handleStaffSubmit = useCallback(() => {
    if (!canWrite || !orgId) return false;

    if (!formName.trim()) { setStaffError(t('staff.v2.name_required')); return false; }
    if (!formEmail.trim()) { setStaffError(t('staff.v2.email_required')); return false; }

    const now = Timestamp.now();

    if (editingStaffId) {
      // Edit — check role change permission
      const existing = staffMembers.find(s => s.id === editingStaffId);
      if (existing && existing.role !== formRole) {
        if (!isSuperAdmin) { setStaffError(t('staff.role_change_forbidden')); return false; }
        if (existing.uid === currentUser?.uid) { setStaffError(t('staff.role_self_change_forbidden')); return false; }
      }

      setStaffMembers(prev => prev.map(s => s.id === editingStaffId ? {
        ...s, fullName: formName.trim(), email: formEmail.trim(),
        phone: formPhone.trim() || null, role: formRole,
        startDate: formStartDate || null, updatedAt: now,
      } : s));

      // Wizard mode: advance back to step 2 after editing
      if (wizardStep === 1) {
        setWizardStep(2);
        resetAssignmentForm();
        return false; // prevent modal close
      }
    } else {
      // Create
      const newStaff: StaffMemberV2 = {
        id: generateId(), orgId, uid: crypto.randomUUID(),
        role: formRole, fullName: formName.trim(), email: formEmail.trim(),
        phone: formPhone.trim() || null, startDate: formStartDate || null,
        isArchived: false,
        createdAt: now, updatedAt: now,
        isFirstAdmin: false, onboardingDismissed: false,
        firstUseFlags: {
          activityHub: false, staffModule: false, studentModule: false,
          eventCreation: false, enrollment: false, payslips: false,
        },
        documents: [],
      };
      setStaffMembers(prev => [...prev, newStaff]);
      setSelectedStaffId(newStaff.id);

      // Save prefill
      if (currentUser) {
        savePrefill(currentUser.uid, { role: formRole, rateType: 'HOURLY', rateValue: 0 });
        markWalkthroughDone(currentUser.uid);
      }

      // Wizard mode: advance to step 2 instead of closing
      if (wizardStep === 1) {
        setWizardStep(2);
        resetAssignmentForm();
        return false; // prevent modal close
      }
    }

    setIsStaffModalOpen(false);
    return undefined;
  }, [canWrite, orgId, formName, formEmail, formPhone, formRole, formUid, editingStaffId, staffMembers, isSuperAdmin, currentUser, setStaffMembers, setSelectedStaffId, t, wizardStep]);

  const handleArchiveStaff = useCallback((staffId: string) => {
    if (!canWrite) return;
    setArchiveCascadeStaffId(staffId);
  }, [canWrite]);

  const confirmArchiveStaff = useCallback(() => {
    if (!archiveCascadeStaffId) return;
    const today = new Date().toISOString().slice(0, 10);
    const tsNow = Timestamp.now();

    // Archive the staff member
    setStaffMembers(prev => prev.map(s => s.id === archiveCascadeStaffId
      ? { ...s, isArchived: true, updatedAt: tsNow } : s));

    // Cascade: remove future EventParticipants for this staff member (Section 10)
    const futureEventIds = new Set(
      eventsV2.filter(e => e.status === 'SCHEDULED' && e.date >= today).map(e => e.id)
    );
    setEventParticipantsV2(prev => prev.filter(ep =>
      !(ep.staffMemberId === archiveCascadeStaffId && futureEventIds.has(ep.eventId))
    ));

    setArchiveCascadeStaffId(null);
    if (selectedStaffId === archiveCascadeStaffId) {
      setSelectedStaffId(null);
    }
  }, [archiveCascadeStaffId, selectedStaffId, setStaffMembers, eventsV2, setEventParticipantsV2]);

  const handleRestoreStaff = useCallback((staffId: string) => {
    if (!canWrite) return;
    setStaffMembers(prev => prev.map(s => s.id === staffId
      ? { ...s, isArchived: false, updatedAt: Timestamp.now() } : s));
  }, [canWrite, setStaffMembers]);

  // ─── Teaching Assignment CRUD ───────────────────────────────────────────

  const openCreateAssignment = useCallback(() => {
    if (!canWrite || !selectedStaffId) return;
    resetAssignmentForm();
    setIsAssignmentModalOpen(true);
  }, [canWrite, selectedStaffId, resetAssignmentForm]);

  const openEditAssignment = useCallback((a: TeachingAssignmentV2) => {
    if (!canWrite) return;
    setEditingAssignmentId(a.id);
    setAssignmentError('');
    setAFormActivityId(a.activityId);
    setAFormL2Id(a.l2Id);
    setAFormRateType(a.rateType);
    setAFormRateValue(a.rateValue);
    setAFormStartDate(a.startDate);
    setAFormEndDate(a.endDate || '');
    setIsAssignmentModalOpen(true);
  }, [canWrite]);

  const handleAssignmentSubmit = useCallback(() => {
    if (!canWrite || !orgId || !selectedStaffId) return false;

    if (!aFormActivityId) { setAssignmentError(t('staff.v2.select_activity')); return false; }
    if (!aFormL2Id) { setAssignmentError(t('staff.v2.select_l2')); return false; }
    if (!aFormStartDate) { setAssignmentError(t('staff.v2.date_start_required')); return false; }

    // Overlap check
    const overlapping = assignments.find(a =>
      a.id !== editingAssignmentId &&
      a.staffMemberId === selectedStaffId &&
      a.activityId === aFormActivityId &&
      a.l2Id === aFormL2Id &&
      !a.isArchived &&
      datesOverlap(a.startDate, a.endDate, aFormStartDate, aFormEndDate || null)
    );
    if (overlapping) { setAssignmentError(t('staff.v2.overlap_error')); return false; }

    const now = Timestamp.now();

    if (editingAssignmentId) {
      setAssignments(prev => prev.map(a => a.id === editingAssignmentId ? {
        ...a, activityId: aFormActivityId, l2Id: aFormL2Id,
        rateType: aFormRateType, rateValue: aFormRateValue,
        startDate: aFormStartDate, endDate: aFormEndDate || null, updatedAt: now,
      } : a));
    } else {
      const newAssignment: TeachingAssignmentV2 = {
        id: generateId(), orgId, staffMemberId: selectedStaffId,
        activityId: aFormActivityId, l2Id: aFormL2Id,
        rateType: aFormRateType, rateValue: aFormRateValue,
        startDate: aFormStartDate, endDate: aFormEndDate || null,
        isArchived: false, createdAt: now, updatedAt: now,
      };
      setAssignments(prev => [...prev, newAssignment]);
    }

    setIsAssignmentModalOpen(false);
    return undefined;
  }, [canWrite, orgId, selectedStaffId, aFormActivityId, aFormL2Id, aFormRateType, aFormRateValue, aFormStartDate, aFormEndDate, editingAssignmentId, assignments, setAssignments, t]);

  const toggleAssignmentArchive = useCallback((id: string, archive: boolean) => {
    if (!canWrite) return;
    setAssignments(prev => prev.map(a => a.id === id
      ? { ...a, isArchived: archive, updatedAt: Timestamp.now() } : a));
  }, [canWrite, setAssignments]);

  // ─── Org Role CRUD ──────────────────────────────────────────────────────

  const openCreateOrgRole = useCallback(() => {
    if (!canWrite || !selectedStaffId) return;
    setEditingOrgRoleId(null);
    resetOrgRoleForm();
    setIsOrgRoleModalOpen(true);
  }, [canWrite, selectedStaffId, resetOrgRoleForm]);

  const openEditOrgRole = useCallback((r: OrgRoleV2) => {
    if (!canWrite) return;
    setEditingOrgRoleId(r.id);
    setOrgRoleError('');
    setOrFormTitle(r.roleTitle);
    setOrFormRateType(r.rateType);
    setOrFormRateValue(r.rateValue);
    setOrFormStartDate(r.startDate);
    setOrFormEndDate(r.endDate || '');
    setIsOrgRoleModalOpen(true);
  }, [canWrite]);

  const handleOrgRoleSubmit = useCallback(() => {
    if (!canWrite || !orgId || !selectedStaffId) return false;
    if (!orFormTitle.trim()) { setOrgRoleError(t('staff.v2.role_title')); return false; }
    if (!orFormStartDate) { setOrgRoleError(t('staff.v2.date_start_required')); return false; }

    const now = Timestamp.now();

    if (editingOrgRoleId) {
      setOrgRoles(prev => prev.map(r => r.id === editingOrgRoleId ? {
        ...r, roleTitle: orFormTitle.trim(), rateType: orFormRateType,
        rateValue: orFormRateValue, startDate: orFormStartDate,
        endDate: orFormEndDate || null, updatedAt: now,
      } : r));
    } else {
      const newRole: OrgRoleV2 = {
        id: generateId(), orgId, staffMemberId: selectedStaffId,
        roleTitle: orFormTitle.trim(), rateType: orFormRateType,
        rateValue: orFormRateValue, startDate: orFormStartDate,
        endDate: orFormEndDate || null, isArchived: false,
        createdAt: now, updatedAt: now,
      };
      setOrgRoles(prev => [...prev, newRole]);
    }

    setIsOrgRoleModalOpen(false);
    return undefined;
  }, [canWrite, orgId, selectedStaffId, orFormTitle, orFormRateType, orFormRateValue, orFormStartDate, orFormEndDate, editingOrgRoleId, setOrgRoles, t]);

  const toggleOrgRoleArchive = useCallback((id: string, archive: boolean) => {
    if (!canWrite) return;
    setOrgRoles(prev => prev.map(r => r.id === id
      ? { ...r, isArchived: archive, updatedAt: Timestamp.now() } : r));
  }, [canWrite, setOrgRoles]);

  // ─── Document update ───────────────────────────────────────────────────

  const handleStaffDocumentsUpdate = useCallback((documents: import('../types/v2').DocumentEntry[]) => {
    if (!selectedStaffId) return;
    setStaffMembers(prev => prev.map(s => s.id === selectedStaffId
      ? { ...s, documents, updatedAt: Timestamp.now() } : s));
  }, [selectedStaffId, setStaffMembers]);

  // ─── Wizard helpers ────────────────────────────────────────────────────

  const wizardAssignments = useMemo(
    () => (wizardStep !== null && selectedStaffId) ? assignments.filter(a => a.staffMemberId === selectedStaffId && !a.isArchived) : [],
    [assignments, selectedStaffId, wizardStep],
  );

  const wizardOrgRoles = useMemo(
    () => (wizardStep !== null && selectedStaffId) ? orgRoles.filter(r => r.staffMemberId === selectedStaffId && !r.isArchived) : [],
    [orgRoles, selectedStaffId, wizardStep],
  );

  const handleWizardAssignmentAdd = useCallback(() => {
    if (!canWrite || !orgId || !selectedStaffId) return;
    if (!aFormActivityId) { setAssignmentError(t('staff.v2.select_activity')); return; }
    if (!aFormL2Id) { setAssignmentError(t('staff.v2.select_l2')); return; }
    if (!aFormStartDate) { setAssignmentError(t('staff.v2.date_start_required')); return; }

    const overlapping = wizardAssignments.find(a =>
      a.activityId === aFormActivityId &&
      a.l2Id === aFormL2Id &&
      datesOverlap(a.startDate, a.endDate, aFormStartDate, aFormEndDate || null)
    );
    if (overlapping) { setAssignmentError(t('staff.v2.overlap_error')); return; }

    const now = Timestamp.now();
    const newAssignment: TeachingAssignmentV2 = {
      id: generateId(), orgId, staffMemberId: selectedStaffId,
      activityId: aFormActivityId, l2Id: aFormL2Id,
      rateType: aFormRateType, rateValue: aFormRateValue,
      startDate: aFormStartDate, endDate: aFormEndDate || null,
      isArchived: false, createdAt: now, updatedAt: now,
    };
    setAssignments(prev => [...prev, newAssignment]);
    resetAssignmentForm();
  }, [canWrite, orgId, selectedStaffId, aFormActivityId, aFormL2Id, aFormRateType, aFormRateValue, aFormStartDate, aFormEndDate, wizardAssignments, setAssignments, t, resetAssignmentForm]);

  const handleWizardOrgRoleAdd = useCallback(() => {
    if (!canWrite || !orgId || !selectedStaffId) return;
    if (!orFormTitle.trim()) { setOrgRoleError(t('staff.v2.role_title')); return; }
    if (!orFormStartDate) { setOrgRoleError(t('staff.v2.date_start_required')); return; }

    const now = Timestamp.now();
    const newRole: OrgRoleV2 = {
      id: generateId(), orgId, staffMemberId: selectedStaffId,
      roleTitle: orFormTitle.trim(), rateType: orFormRateType,
      rateValue: orFormRateValue, startDate: orFormStartDate,
      endDate: orFormEndDate || null, isArchived: false,
      createdAt: now, updatedAt: now,
    };
    setOrgRoles(prev => [...prev, newRole]);
    resetOrgRoleForm();
  }, [canWrite, orgId, selectedStaffId, orFormTitle, orFormRateType, orFormRateValue, orFormStartDate, orFormEndDate, setOrgRoles, t, resetOrgRoleForm]);

  const handleWizardClose = useCallback(() => {
    setIsStaffModalOpen(false);
    setWizardStep(null);
  }, []);

  const wizardStepLabels = [
    t('staff.v2.wizard.step_basic_info'),
    t('staff.v2.wizard.step_assignments'),
    t('staff.v2.wizard.step_org_roles'),
    t('staff.v2.wizard.step_documents'),
  ];

  // ─── Navigation ─────────────────────────────────────────────────────────

  const openDetail = useCallback((staffId: string) => {
    setSelectedStaffId(staffId);
  }, []);

  // ─── Walkthrough steps ──────────────────────────────────────────────────

  const walkthroughSteps = [
    { title: t('staff.v2.walkthrough.step1_title'), desc: t('staff.v2.walkthrough.step1_desc') },
    { title: t('staff.v2.walkthrough.step2_title'), desc: t('staff.v2.walkthrough.step2_desc') },
    { title: t('staff.v2.walkthrough.step3_title'), desc: t('staff.v2.walkthrough.step3_desc') },
  ];

  // ─── Render: Role badge ─────────────────────────────────────────────────

  const RoleBadge: React.FC<{ role: StaffRole }> = ({ role }) => {
    const cfg = ROLE_CONFIG[role];
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-${cfg.color}-100 text-${cfg.color}-700 dark:bg-${cfg.color}-900/30 dark:text-${cfg.color}-400`}>
        <Icon size={12} /> {roleLabel(role)}
      </span>
    );
  };

  // RateConfigFields extracted to ./RateConfigFields.tsx

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // Detail view removed — replaced by SlideOver below

  // ─── Inline SortHeader for table view ───────────────────────────────────
  const SortHeader: React.FC<{
    sortKey_: StaffSortKey; sortDir: 'asc' | 'desc'; column: StaffSortKey;
    onToggle: (k: StaffSortKey) => void; align: 'start' | 'end'; children: React.ReactNode;
    filterKey?: string;
  }> = ({ sortKey_: sk, sortDir, column, onToggle, align, children, filterKey }) => (
    <th className={`py-2 px-3 text-${align} text-slate-500 dark:text-slate-400 font-medium select-none relative`}>
      <span className="inline-flex items-center gap-1">
        <span className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors" onClick={() => onToggle(column)}>
          {children}
          {sk === column && (sortDir === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
        </span>
        {filterKey && staffDistinctValues[filterKey] && (
          <button
            onClick={e => { e.stopPropagation(); setOpenStaffFilterKey(prev => prev === filterKey ? null : filterKey); }}
            className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${staffColumnFilters[filterKey]?.selected.size ? 'text-blue-600 dark:text-blue-400' : ''}`}
          >
            <Filter size={12} />
          </button>
        )}
      </span>
      {filterKey && openStaffFilterKey === filterKey && staffDistinctValues[filterKey] && (
        <ColumnFilterDropdown
          values={staffDistinctValues[filterKey]}
          selected={staffColumnFilters[filterKey]?.selected ?? new Set()}
          onChange={vals => setStaffCheckboxFilter(filterKey, vals)}
          onClose={() => setOpenStaffFilterKey(null)}
          t={t}
        />
      )}
    </th>
  );

  // ─── List View ──────────────────────────────────────────────────────────
  return (
    <>
    <div className="h-full flex">
    <div className="flex-1 min-w-0 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onMobileMenuOpen} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <Menu size={20} className="text-slate-600 dark:text-slate-400" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('staff.title')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('staff.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button onClick={() => setListStyle('grid')}
              className={`p-1.5 rounded ${listStyle === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''}`}>
              <LayoutGrid size={16} className="text-slate-600 dark:text-slate-400" />
            </button>
            <button onClick={() => setListStyle('list')}
              className={`p-1.5 rounded ${listStyle === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''}`}>
              <List size={16} className="text-slate-600 dark:text-slate-400" />
            </button>
            <button onClick={() => setListStyle('table')}
              className={`hidden md:block p-1.5 rounded ${listStyle === 'table' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''}`}>
              <Table2 size={16} className="text-slate-600 dark:text-slate-400" />
            </button>
          </div>
          {canWrite && (
            <button onClick={openCreateStaff}
              className="inline-flex items-center gap-2 px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium">
              <Plus size={16} /> {t('staff.add')}
            </button>
          )}
          <ImportExportDropdown
            entityType="STAFF_MEMBER"
            existingData={staffExportData}
            existingDuplicateKeys={staffDupKeys}
            dependencyMaps={{ activityByName: csvActivityByName, l2ByName: csvL2ByName, staffByEmail: csvStaffByEmail, studentByName: {} }}
            activityNames={activities.map(a => a.name)}
            settings={settings}
            canWrite={canWrite}
            onImportComplete={handleStaffImportComplete}
          />
        </div>
      </div>

      {!canWrite && (
        <div className="mb-4 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 text-sm">
          {t('activities.readonly_notice') || 'Read-only access. Contact a Super Admin for edit permissions.'}
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('staff.search')}
            className="w-full ps-9 pe-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
            className="rounded border-slate-300" />
          {t('staff.show_archived')}
        </label>
      </div>

      {/* Filter pills */}
      {hasStaffActiveFilters && (
        <FilterPills
          pills={staffActiveFilterSummary}
          onRemove={clearStaffColumnFilter}
          onClearAll={clearAllStaffColumnFilters}
          t={t}
        />
      )}

      {/* Staff List */}
      {staffColumnFilteredData.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 text-sm py-16 text-center">
          {search ? t('staff.no_results') : t('staff.empty_state')}
        </p>
      ) : listStyle === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {staffColumnFilteredData.map(s => (
            <button key={s.id} onClick={() => openDetail(s.id)}
              className="text-left p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
              <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{s.fullName}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">{s.email}</div>
              <div className="mt-2"><RoleBadge role={s.role} /></div>
              {s.isArchived && (
                <span className="inline-block mt-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">
                  {t('staff.archived_badge')}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : listStyle === 'table' ? (
        <>
          {/* Mobile fallback — list cards */}
          <div className="md:hidden space-y-1">
            {sortedStaff.map(s => (
              <button key={s.id} onClick={() => openDetail(s.id)}
                className="w-full text-left flex items-center gap-4 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{s.fullName}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">{s.email}</span>
                </div>
                <RoleBadge role={s.role} />
                <ChevronRight size={16} className="text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 border-b border-slate-200 dark:border-slate-700">
                  <SortHeader sortKey_={sortKey} sortDir={sortDirection} column="fullName" onToggle={toggleSort} align="start">{t('staff.table.name')}</SortHeader>
                  <SortHeader sortKey_={sortKey} sortDir={sortDirection} column="role" onToggle={toggleSort} align="start" filterKey="role">{t('staff.table.role')}</SortHeader>
                  <SortHeader sortKey_={sortKey} sortDir={sortDirection} column="email" onToggle={toggleSort} align="start">{t('staff.table.email')}</SortHeader>
                  <th className="py-2 px-3 text-start text-slate-500 dark:text-slate-400 font-medium relative">
                    <span className="inline-flex items-center gap-1">
                      {t('staff.table.activities')}
                      {staffDistinctValues['activities'] && (
                        <button
                          onClick={() => setOpenStaffFilterKey(prev => prev === 'activities' ? null : 'activities')}
                          className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${staffColumnFilters['activities']?.selected.size ? 'text-blue-600 dark:text-blue-400' : ''}`}
                        >
                          <Filter size={12} />
                        </button>
                      )}
                    </span>
                    {openStaffFilterKey === 'activities' && staffDistinctValues['activities'] && (
                      <ColumnFilterDropdown
                        values={staffDistinctValues['activities']}
                        selected={staffColumnFilters['activities']?.selected ?? new Set()}
                        onChange={vals => setStaffCheckboxFilter('activities', vals)}
                        onClose={() => setOpenStaffFilterKey(null)}
                        t={t}
                      />
                    )}
                  </th>
                  <SortHeader sortKey_={sortKey} sortDir={sortDirection} column="assignmentCount" onToggle={toggleSort} align="end">{t('staff.table.assignments')}</SortHeader>
                  <th className="py-2 px-3 text-start text-slate-500 dark:text-slate-400 font-medium">{t('staff.table.phone')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedStaff.map(s => {
                  const summary = staffActivitySummary.get(s.id);
                  const names = summary?.names ?? [];
                  const shown = names.slice(0, 3);
                  const extra = names.length - 3;
                  return (
                    <tr key={s.id} onClick={() => openDetail(s.id)}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors">
                      <td className="py-2 px-3 text-start font-medium text-slate-800 dark:text-slate-200">
                        {s.fullName}
                        {s.isArchived && (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                            {t('staff.archived_badge')}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-start"><RoleBadge role={s.role} /></td>
                      <td className="py-2 px-3 text-start text-slate-600 dark:text-slate-400">{s.email || '—'}</td>
                      <td className="py-2 px-3 text-start text-slate-600 dark:text-slate-400">
                        {shown.length > 0 ? (
                          <>
                            {shown.join(', ')}
                            {extra > 0 && <span className="text-slate-400 dark:text-slate-500 ml-1">+{extra} more</span>}
                          </>
                        ) : '—'}
                      </td>
                      <td className="py-2 px-3 text-end text-slate-600 dark:text-slate-400">{summary?.count ?? 0}</td>
                      <td className="py-2 px-3 text-start text-slate-600 dark:text-slate-400">{s.phone || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="space-y-1">
          {staffColumnFilteredData.map(s => (
            <button key={s.id} onClick={() => openDetail(s.id)}
              className="w-full text-left flex items-center gap-4 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-800 dark:text-slate-200">{s.fullName}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">{s.email}</span>
              </div>
              <RoleBadge role={s.role} />
              {s.isArchived && (
                <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">
                  {t('staff.archived_badge')}
                </span>
              )}
              <ChevronRight size={16} className="text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* ─── Staff Create/Edit Modal (with onboarding wizard) ─────────── */}
      <Modal isOpen={isStaffModalOpen} onClose={handleWizardClose}
        title={
          wizardStep !== null && wizardStep >= 2
            ? wizardStepLabels[wizardStep - 1]
            : (
              <div>
                <span>{editingStaffId ? t('staff.edit') : t('staff.add_new')}</span>
                {!editingStaffId && wizardStep === 1 && (
                  <button onClick={openGuideMe} className="ml-3 text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                    <Sparkles size={12} /> {t('staff.v2.guide_me')}
                  </button>
                )}
              </div>
            )
        }
        isDirty={wizardStep === 1 || wizardStep === null ? (!!formName || !!formEmail) : false}
        footerContent={
          wizardStep === 1 ? (
            /* Step 1: Save & Continue */
            <div className="flex justify-end w-full">
              <button onClick={() => { handleStaffSubmit(); }}
                className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium">
                {t('staff.v2.wizard.next')}
              </button>
            </div>
          ) : wizardStep !== null && wizardStep >= 2 ? (
            /* Steps 2–4: Back + Add + Skip/Next/Done */
            <div className="flex justify-between w-full">
              <button onClick={() => {
                if (wizardStep === 2) {
                  // Go back to step 1 — pre-fill form from saved staff member
                  const staff = selectedStaff;
                  if (staff) {
                    setEditingStaffId(staff.id);
                    setFormName(staff.fullName);
                    setFormEmail(staff.email);
                    setFormPhone(staff.phone || '');
                    setFormRole(staff.role);
                    setFormStartDate(staff.startDate ?? '');
                  }
                  setWizardStep(1);
                } else if (wizardStep === 3) {
                  setWizardStep(2);
                  resetAssignmentForm();
                } else if (wizardStep === 4) {
                  setWizardStep(3);
                  resetOrgRoleForm();
                }
              }}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                {t('staff.v2.wizard.back')}
              </button>
              <div className="flex gap-2">
                {wizardStep === 2 && (
                  <button onClick={handleWizardAssignmentAdd}
                    className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium">
                    {t('staff.v2.wizard.add')}
                  </button>
                )}
                {wizardStep === 3 && (
                  <button onClick={handleWizardOrgRoleAdd}
                    className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium">
                    {t('staff.v2.wizard.add')}
                  </button>
                )}
                {wizardStep < 4 ? (
                  <button onClick={() => {
                    if (wizardStep === 2) {
                      setWizardStep(3);
                      resetOrgRoleForm();
                    } else {
                      setWizardStep(4);
                    }
                  }}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                    {(wizardStep === 2 ? wizardAssignments.length : wizardOrgRoles.length) > 0
                      ? t('staff.v2.wizard.next')
                      : t('staff.v2.wizard.skip')}
                  </button>
                ) : (
                  <button onClick={handleWizardClose}
                    className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium">
                    {t('staff.v2.wizard.done')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Edit mode (no wizard): Save button */
            <div className="flex justify-end w-full">
              <button onClick={() => { handleStaffSubmit(); }}
                className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium">
                {t('common.save') || 'Save'}
              </button>
            </div>
          )
        }>
        <div className="space-y-4">
          {/* ─── Wizard step indicator ───────────────────────────────── */}
          {wizardStep !== null && !editingStaffId && (
            <div className="flex items-center justify-center gap-0 mb-2">
              {wizardStepLabels.map((label, i) => {
                const stepNum = i + 1;
                const isCurrent = stepNum === wizardStep;
                const isCompleted = stepNum < wizardStep!;
                return (
                  <React.Fragment key={stepNum}>
                    {i > 0 && (
                      <div className={`flex-1 h-0.5 mx-1 ${isCompleted ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    )}
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors ${
                        isCurrent ? 'border-blue-500 bg-blue-500 text-white'
                        : isCompleted ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                      }`}>
                        {isCompleted ? <Check size={14} /> : stepNum}
                      </div>
                      <span className={`text-xs whitespace-nowrap ${
                        isCurrent ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : isCompleted ? 'text-blue-500 dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500'
                      }`}>{label}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* ─── Step 1: Basic Info (staff form) ─────────────────────── */}
          {(wizardStep === null || wizardStep === 1) && (
            <>
              {staffError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{staffError}</div>
              )}

              {/* Walkthrough overlay */}
              {walkthroughStep !== null && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        {walkthroughStep}/{walkthroughSteps.length}
                      </span>
                      <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300">{walkthroughSteps[walkthroughStep - 1]?.title}</h4>
                    </div>
                    <button onClick={() => setWalkthroughStep(null)} className="text-blue-400 hover:text-blue-600"><X size={14} /></button>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-400">{walkthroughSteps[walkthroughStep - 1]?.desc}</p>
                  <div className="flex gap-2 mt-3">
                    {walkthroughStep > 1 && (
                      <button onClick={() => setWalkthroughStep(walkthroughStep - 1)}
                        className="text-xs px-3 py-1 border border-blue-300 dark:border-blue-700 rounded text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                        Back
                      </button>
                    )}
                    {walkthroughStep < walkthroughSteps.length ? (
                      <button onClick={() => setWalkthroughStep(walkthroughStep + 1)}
                        className="text-xs px-3 py-1 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded">
                        Next
                      </button>
                    ) : (
                      <button onClick={() => setWalkthroughStep(null)}
                        className="text-xs px-3 py-1 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded">
                        Done
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Name + Email */}
              {(walkthroughStep === null || walkthroughStep >= 1) && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.full_name')}</label>
                    <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.email')}</label>
                    <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
                  </div>
                </>
              )}

              {/* Role — only shown when editing (role is managed via Settings for new staff) */}
              {editingStaffId && (walkthroughStep === null || walkthroughStep >= 2) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.role')}</label>
                  <div className="flex gap-2">
                    {STAFF_ROLES.map(r => {
                      const cfg = ROLE_CONFIG[r];
                      const Icon = cfg.icon;
                      const disabled = !isSuperAdmin;
                      return (
                        <button key={r} onClick={() => !disabled && setFormRole(r)}
                          disabled={disabled}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${formRole === r
                            ? `border-${cfg.color}-400 bg-${cfg.color}-50 dark:bg-${cfg.color}-900/20 text-${cfg.color}-700 dark:text-${cfg.color}-400`
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <Icon size={16} /> {roleLabel(r)}
                        </button>
                      );
                    })}
                  </div>
                  {!isSuperAdmin && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{t('staff.role_change_forbidden')}</p>
                  )}
                </div>
              )}

              {/* Phone */}
              {(walkthroughStep === null || walkthroughStep >= 3) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.phone')}</label>
                  <input type="tel" value={formPhone} onChange={e => setFormPhone(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
                </div>
              )}

              {/* Start Date */}
              {(walkthroughStep === null || walkthroughStep >= 3) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.start_date_work')}</label>
                  <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
                </div>
              )}

            </>
          )}

          {/* ─── Step 2: Teaching Assignments ────────────────────────── */}
          {wizardStep === 2 && (
            <>
              {/* Added assignments list */}
              {wizardAssignments.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('staff.v2.wizard.added_count').replace('{count}', String(wizardAssignments.length))}
                  </p>
                  {wizardAssignments.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="text-sm text-slate-700 dark:text-slate-300">
                        {activityName(a.activityId)} — {l2Name(a.l2Id)}
                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">{rateLabel(a.rateType)} {a.rateValue}</span>
                      </div>
                      <button onClick={() => toggleAssignmentArchive(a.id, true)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">{t('staff.v2.wizard.none_added')}</p>
              )}

              {/* Assignment form */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-1">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t('staff.v2.wizard.add')} {t('staff.v2.wizard.step_assignments').toLowerCase()}</p>
              </div>
              {assignmentError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{assignmentError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.select_activity')}</label>
                <select value={aFormActivityId} onChange={e => { setAFormActivityId(e.target.value); setAFormL2Id(''); }}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  <option value="">{t('staff.v2.select_activity')}</option>
                  {activities.filter(a => !a.isArchived).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {aFormActivityId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.select_l2')}</label>
                  <select value={aFormL2Id} onChange={e => setAFormL2Id(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    <option value="">{t('staff.v2.select_l2')}</option>
                    {l2sForActivity.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <RateConfigFields
                rateType={aFormRateType} setRateType={setAFormRateType}
                rateValue={aFormRateValue} setRateValue={setAFormRateValue}
                startDate={aFormStartDate} setStartDate={setAFormStartDate}
                endDate={aFormEndDate} setEndDate={setAFormEndDate}
                t={t} rateLabel={rateLabel}
              />
            </>
          )}

          {/* ─── Step 3: Org Roles ───────────────────────────────────── */}
          {wizardStep === 3 && (
            <>
              {/* Added org roles list */}
              {wizardOrgRoles.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('staff.v2.wizard.added_count').replace('{count}', String(wizardOrgRoles.length))}
                  </p>
                  {wizardOrgRoles.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="text-sm text-slate-700 dark:text-slate-300">
                        {r.roleTitle}
                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">{rateLabel(r.rateType)} {r.rateValue}</span>
                      </div>
                      <button onClick={() => toggleOrgRoleArchive(r.id, true)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">{t('staff.v2.wizard.none_added')}</p>
              )}

              {/* Org role form */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-1">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t('staff.v2.wizard.add')} {t('staff.v2.wizard.step_org_roles').toLowerCase()}</p>
              </div>
              {orgRoleError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{orgRoleError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.role_title')}</label>
                <input type="text" value={orFormTitle} onChange={e => setOrFormTitle(e.target.value)}
                  placeholder={t('staff.v2.role_title_placeholder')}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
              </div>
              <RateConfigFields
                rateType={orFormRateType} setRateType={setOrFormRateType}
                rateValue={orFormRateValue} setRateValue={setOrFormRateValue}
                startDate={orFormStartDate} setStartDate={setOrFormStartDate}
                endDate={orFormEndDate} setEndDate={setOrFormEndDate}
                t={t} rateLabel={rateLabel}
              />
            </>
          )}

          {/* ─── Step 4: Documents ───────────────────────────────────── */}
          {wizardStep === 4 && selectedStaff && (
            <DocumentSection
              documents={selectedStaff.documents ?? []}
              orgId={orgId || ''}
              canWrite={canWrite}
              t={t}
              onUpdate={handleStaffDocumentsUpdate}
            />
          )}
        </div>
      </Modal>

      {/* ─── Archive Cascade Modal ──────────────────────────────────────── */}
      <Modal isOpen={!!archiveCascadeStaffId} onClose={() => setArchiveCascadeStaffId(null)}
        title={t('staff.v2.archive_cascade_title')}
        footerContent={
          <div className="flex justify-end gap-3 w-full">
            <button onClick={() => setArchiveCascadeStaffId(null)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
              {t('common.cancel') || 'Cancel'}
            </button>
            <button onClick={confirmArchiveStaff}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
              {t('staff.archive')}
            </button>
          </div>
        }>
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-300">{t('staff.v2.archive_cascade_message')}</p>
          {(() => {
            const today = new Date().toISOString().slice(0, 10);
            const futureEventIds = new Set(eventsV2.filter(e => e.status === 'SCHEDULED' && e.date >= today).map(e => e.id));
            const count = eventParticipantsV2.filter(ep => ep.staffMemberId === archiveCascadeStaffId && futureEventIds.has(ep.eventId)).length;
            return count > 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {t('staff.v2.archive_cascade_events').replace('{count}', String(count))}
              </p>
            ) : null;
          })()}
        </div>
      </Modal>

      </div>{/* end main content */}

      {/* ─── Staff Slide-Over ──────────────────────────────────────────── */}
      <SlideOver
        isOpen={!!selectedStaffId && wizardStep === null}
        onClose={() => setSelectedStaffId(null)}
        title={selectedStaff?.fullName}
      >
        {selectedStaff && (
          <StaffSlideOverContent
            staff={selectedStaff}
            assignments={staffAssignments}
            orgRoles={staffOrgRoles}
            activities={activities}
            settings={settings}
            orgId={orgId || ''}
            canWrite={canWrite}
            t={t}
            activityName={activityName}
            l2Name={l2Name}
            rateLabel={rateLabel}
            onEdit={openEditStaff}
            onArchive={handleArchiveStaff}
            onRestore={handleRestoreStaff}
            onNewAssignment={openCreateAssignment}
            onEditAssignment={openEditAssignment}
            onToggleAssignmentArchive={toggleAssignmentArchive}
            onNewOrgRole={openCreateOrgRole}
            onEditOrgRole={openEditOrgRole}
            onToggleOrgRoleArchive={toggleOrgRoleArchive}
            onDocumentsUpdate={handleStaffDocumentsUpdate}
            assignmentExportData={assignmentExportData}
            assignmentDupKeys={assignmentDupKeys}
            csvActivityByName={csvActivityByName}
            csvL2ByName={csvL2ByName}
            csvStaffByEmail={csvStaffByEmail}
            onAssignmentImportComplete={handleAssignmentImportComplete}
          />
        )}
      </SlideOver>
    </div>{/* end flex row */}

      {/* ─── Assignment Modal ─────────────────────────────────────────── */}
      <Modal isOpen={isAssignmentModalOpen} onClose={() => setIsAssignmentModalOpen(false)}
        title={editingAssignmentId ? t('staff.v2.edit_teaching_assignment') : t('staff.v2.add_teaching_assignment')}
        isDirty={!!aFormActivityId || !!aFormL2Id}
        onSave={handleAssignmentSubmit}>
        <div className="space-y-4">
          {assignmentError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{assignmentError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.select_activity')}</label>
            <select value={aFormActivityId} onChange={e => { setAFormActivityId(e.target.value); setAFormL2Id(''); }}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              <option value="">{t('staff.v2.select_activity')}</option>
              {activities.filter(a => !a.isArchived).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          {aFormActivityId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.select_l2')}</label>
              <select value={aFormL2Id} onChange={e => setAFormL2Id(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                <option value="">{t('staff.v2.select_l2')}</option>
                {l2sForActivity.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
          <RateConfigFields
            rateType={aFormRateType} setRateType={setAFormRateType}
            rateValue={aFormRateValue} setRateValue={setAFormRateValue}
            startDate={aFormStartDate} setStartDate={setAFormStartDate}
            endDate={aFormEndDate} setEndDate={setAFormEndDate}
            t={t} rateLabel={rateLabel}
          />
        </div>
      </Modal>

      {/* ─── Org Role Modal ───────────────────────────────────────────── */}
      <Modal isOpen={isOrgRoleModalOpen} onClose={() => setIsOrgRoleModalOpen(false)}
        title={editingOrgRoleId ? t('staff.v2.edit_org_role') : t('staff.v2.add_org_role')}
        isDirty={!!orFormTitle}
        onSave={handleOrgRoleSubmit}>
        <div className="space-y-4">
          {orgRoleError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{orgRoleError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.role_title')}</label>
            <input type="text" value={orFormTitle} onChange={e => setOrFormTitle(e.target.value)}
              placeholder={t('staff.v2.role_title_placeholder')}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
          </div>
          <RateConfigFields
            rateType={orFormRateType} setRateType={setOrFormRateType}
            rateValue={orFormRateValue} setRateValue={setOrFormRateValue}
            startDate={orFormStartDate} setStartDate={setOrFormStartDate}
            endDate={orFormEndDate} setEndDate={setOrFormEndDate}
            t={t} rateLabel={rateLabel}
          />
        </div>
      </Modal>
    </>
  );
};
