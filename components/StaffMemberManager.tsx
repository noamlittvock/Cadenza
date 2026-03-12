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
  Plus, Edit2, Archive, RotateCcw, ArrowLeft, Menu, LayoutGrid, List, X,
  Search, HelpCircle, Sparkles, Shield, ShieldCheck, User,
  Briefcase, GraduationCap, ChevronRight, Trash2, Table2, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useSortState } from '../utils/useSortState';

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
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [listStyle, setListStyle] = useState<'grid' | 'list' | 'table'>('list');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [detailTab, setDetailTab] = useState<'assignments' | 'orgRoles'>('assignments');

  // ─── Navigate-to from AdminInbox ──────────────────────────────────────────
  useEffect(() => {
    if (navigateToId) {
      setSelectedStaffId(navigateToId);
      setViewMode('detail');
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
  const [staffError, setStaffError] = useState('');

  // ─── Walkthrough ────────────────────────────────────────────────────────
  const [walkthroughStep, setWalkthroughStep] = useState<number | null>(null);

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

  const staffActivitySummary = useMemo(() => {
    const map = new Map<string, { names: string[]; count: number }>();
    for (const s of filteredStaff) {
      const active = assignments.filter(a => a.staffMemberId === s.id && !a.isArchived);
      const names = active.map(a => getActivityName(activityMap, a.activityId)).filter(Boolean);
      map.set(s.id, { names, count: active.length });
    }
    return map;
  }, [filteredStaff, assignments, activityMap]);

  const sortedStaff = useMemo(() => {
    if (listStyle !== 'table') return filteredStaff;
    const sorted = [...filteredStaff];
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
  }, [filteredStaff, listStyle, sortKey, sortDirection, staffActivitySummary]);

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

    // Check walkthrough
    if (currentUser && !isWalkthroughDone(currentUser.uid)) {
      setWalkthroughStep(1);
    } else {
      setWalkthroughStep(null);
    }

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
    setWalkthroughStep(null);
    setIsStaffModalOpen(true);
  }, [canWrite]);

  const openGuideMe = useCallback(() => {
    setWalkthroughStep(1);
  }, []);

  const handleStaffSubmit = useCallback(() => {
    if (!canWrite || !orgId) return false;

    if (!formName.trim()) { setStaffError(t('staff.v2.name_required')); return false; }
    if (!formEmail.trim()) { setStaffError(t('staff.v2.email_required')); return false; }
    // SuperAdmin must supply a UID; Admins get one auto-generated
    if (isSuperAdmin && !editingStaffId && !formUid.trim()) { setStaffError(t('staff.v2.uid_required')); return false; }

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
        phone: formPhone.trim() || null, role: formRole, updatedAt: now,
      } : s));
    } else {
      // Create
      const newStaff: StaffMemberV2 = {
        id: generateId(), orgId, uid: isSuperAdmin ? formUid.trim() : crypto.randomUUID(),
        role: formRole, fullName: formName.trim(), email: formEmail.trim(),
        phone: formPhone.trim() || null, isArchived: false,
        createdAt: now, updatedAt: now,
        isFirstAdmin: false, onboardingDismissed: false,
        firstUseFlags: {
          activityHub: false, staffModule: false, studentModule: false,
          eventCreation: false, enrollment: false, payslips: false,
        },
      };
      setStaffMembers(prev => [...prev, newStaff]);

      // Save prefill
      if (currentUser) {
        savePrefill(currentUser.uid, { role: formRole, rateType: 'HOURLY', rateValue: 0 });
        markWalkthroughDone(currentUser.uid);
      }
    }

    setIsStaffModalOpen(false);
    return undefined;
  }, [canWrite, orgId, formName, formEmail, formPhone, formRole, formUid, editingStaffId, staffMembers, isSuperAdmin, currentUser, setStaffMembers, t]);

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
      setViewMode('list');
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
    setEditingAssignmentId(null);
    setAssignmentError('');
    setAFormActivityId('');
    setAFormL2Id('');
    setAFormRateType('HOURLY');
    setAFormRateValue(0);
    setAFormStartDate(new Date().toISOString().slice(0, 10));
    setAFormEndDate('');
    setIsAssignmentModalOpen(true);
  }, [canWrite, selectedStaffId]);

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
    setOrgRoleError('');
    setOrFormTitle('');
    setOrFormRateType('MONTHLY_FLAT');
    setOrFormRateValue(0);
    setOrFormStartDate(new Date().toISOString().slice(0, 10));
    setOrFormEndDate('');
    setIsOrgRoleModalOpen(true);
  }, [canWrite, selectedStaffId]);

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

  // ─── Navigation ─────────────────────────────────────────────────────────

  const openDetail = useCallback((staffId: string) => {
    setSelectedStaffId(staffId);
    setDetailTab('assignments');
    setViewMode('detail');
  }, []);

  const backToList = useCallback(() => {
    setViewMode('list');
    setSelectedStaffId(null);
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

  // ─── Render: Rate config fields (shared) ────────────────────────────────

  const RateConfigFields: React.FC<{
    rateType: RateTypeV2; setRateType: (v: RateTypeV2) => void;
    rateValue: number; setRateValue: (v: number) => void;
    startDate: string; setStartDate: (v: string) => void;
    endDate: string; setEndDate: (v: string) => void;
  }> = ({ rateType, setRateType, rateValue, setRateValue, startDate, setStartDate, endDate, setEndDate }) => (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.rate_type')}</label>
        <select value={rateType} onChange={e => setRateType(e.target.value as RateTypeV2)}
          className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
          {RATE_TYPES.map(rt => <option key={rt} value={rt}>{rateLabel(rt)}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.rate_value')}</label>
        <input type="number" min={0} step={0.01} value={rateValue} onChange={e => setRateValue(Number(e.target.value))}
          className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.start_date')}</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.end_date_optional')}</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (viewMode === 'detail' && selectedStaff) {
    // ─── Detail View ────────────────────────────────────────────────────
    return (
      <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={backToList} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{selectedStaff.fullName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <RoleBadge role={selectedStaff.role} />
              <span className="text-sm text-slate-500 dark:text-slate-400">{selectedStaff.email}</span>
              {selectedStaff.phone && <span className="text-sm text-slate-500 dark:text-slate-400">| {selectedStaff.phone}</span>}
            </div>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <button onClick={() => openEditStaff(selectedStaff)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400">
                <Edit2 size={18} />
              </button>
              {!selectedStaff.isArchived ? (
                <button onClick={() => handleArchiveStaff(selectedStaff.id)}
                  className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-500">
                  <Archive size={18} />
                </button>
              ) : (
                <button onClick={() => handleRestoreStaff(selectedStaff.id)}
                  className="p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors text-green-600">
                  <RotateCcw size={18} />
                </button>
              )}
            </div>
          )}
        </div>

        {selectedStaff.isArchived && (
          <div className="mb-4 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 text-sm font-medium">
            {t('staff.archived_badge')}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
          <button onClick={() => setDetailTab('assignments')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === 'assignments' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
            <GraduationCap size={16} className="inline-block mr-1 -mt-0.5" />
            {t('staff.tab.teaching_assignments')}
          </button>
          <button onClick={() => setDetailTab('orgRoles')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === 'orgRoles' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
            <Briefcase size={16} className="inline-block mr-1 -mt-0.5" />
            {t('staff.tab.org_roles')}
          </button>
        </div>

        {/* Teaching Assignments Tab */}
        {detailTab === 'assignments' && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              {canWrite && (
                <button onClick={openCreateAssignment}
                  className="inline-flex items-center gap-2 px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium">
                  <Plus size={16} /> {t('staff.v2.add_teaching_assignment')}
                </button>
              )}
              <ImportExportDropdown
                entityType="TEACHING_ASSIGNMENT"
                existingData={assignmentExportData}
                existingDuplicateKeys={assignmentDupKeys}
                dependencyMaps={{ activityByName: csvActivityByName, l2ByName: csvL2ByName, staffByEmail: csvStaffByEmail, studentByName: {} }}
                activityNames={activities.map(a => a.name)}
                settings={settings}
                canWrite={canWrite}
                onImportComplete={handleAssignmentImportComplete}
              />
            </div>

            {staffAssignments.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-sm py-8 text-center">{t('staff.v2.assignment_empty')}</p>
            ) : (
              <div className="space-y-2">
                {staffAssignments.map(a => (
                  <div key={a.id} className={`flex items-center justify-between p-4 rounded-lg border ${a.isArchived ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-60' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {activityName(a.activityId)} <ChevronRight size={14} className="inline text-slate-400" /> {l2Name(a.l2Id)}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {rateLabel(a.rateType)}: {a.rateValue} | {a.startDate}{a.endDate ? ` — ${a.endDate}` : ''}
                        {a.isArchived && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">({t('staff.archived_badge')})</span>}
                      </div>
                    </div>
                    {canWrite && (
                      <div className="flex gap-1 ml-3 shrink-0">
                        <button onClick={() => openEditAssignment(a)}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Edit2 size={15} /></button>
                        {a.isArchived ? (
                          <button onClick={() => toggleAssignmentArchive(a.id, false)}
                            className="p-1.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600"><RotateCcw size={15} /></button>
                        ) : (
                          <button onClick={() => toggleAssignmentArchive(a.id, true)}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Archive size={15} /></button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Org Roles Tab */}
        {detailTab === 'orgRoles' && (
          <div>
            {canWrite && (
              <button onClick={openCreateOrgRole}
                className="mb-4 inline-flex items-center gap-2 px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium">
                <Plus size={16} /> {t('staff.v2.add_org_role')}
              </button>
            )}

            {staffOrgRoles.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-sm py-8 text-center">{t('staff.v2.org_role_empty')}</p>
            ) : (
              <div className="space-y-2">
                {staffOrgRoles.map(r => (
                  <div key={r.id} className={`flex items-center justify-between p-4 rounded-lg border ${r.isArchived ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-60' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{r.roleTitle}</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {rateLabel(r.rateType)}: {r.rateValue} | {r.startDate}{r.endDate ? ` — ${r.endDate}` : ''}
                        {r.isArchived && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">({t('staff.archived_badge')})</span>}
                      </div>
                    </div>
                    {canWrite && (
                      <div className="flex gap-1 ml-3 shrink-0">
                        <button onClick={() => openEditOrgRole(r)}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Edit2 size={15} /></button>
                        {r.isArchived ? (
                          <button onClick={() => toggleOrgRoleArchive(r.id, false)}
                            className="p-1.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600"><RotateCcw size={15} /></button>
                        ) : (
                          <button onClick={() => toggleOrgRoleArchive(r.id, true)}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Archive size={15} /></button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
              {activities.filter(a => !a.isArchived).length === 0 && (
                <p className="text-xs text-slate-500 mt-1">{t('staff.v2.no_activities')}</p>
              )}
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
                {l2sForActivity.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">{t('staff.v2.no_l2s')}</p>
                )}
              </div>
            )}
            <RateConfigFields
              rateType={aFormRateType} setRateType={setAFormRateType}
              rateValue={aFormRateValue} setRateValue={setAFormRateValue}
              startDate={aFormStartDate} setStartDate={setAFormStartDate}
              endDate={aFormEndDate} setEndDate={setAFormEndDate}
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
            />
          </div>
        </Modal>

        {/* ─── Archive Cascade Modal ────────────────────────────────────── */}
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
      </div>
    );
  }

  // ─── Inline SortHeader for table view ───────────────────────────────────
  const SortHeader: React.FC<{
    sortKey_: StaffSortKey; sortDir: 'asc' | 'desc'; column: StaffSortKey;
    onToggle: (k: StaffSortKey) => void; align: 'start' | 'end'; children: React.ReactNode;
  }> = ({ sortKey_: sk, sortDir, column, onToggle, align, children }) => (
    <th className={`py-2 px-3 text-${align} text-slate-500 dark:text-slate-400 font-medium cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors`}
      onClick={() => onToggle(column)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sk === column && (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </span>
    </th>
  );

  // ─── List View ──────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto">
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
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('staff.search')}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
            className="rounded border-slate-300" />
          {t('staff.show_archived')}
        </label>
      </div>

      {/* Staff List */}
      {filteredStaff.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 text-sm py-16 text-center">
          {search ? t('staff.no_results') : t('staff.empty_state')}
        </p>
      ) : listStyle === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredStaff.map(s => (
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
                  <SortHeader sortKey_={sortKey} sortDir={sortDirection} column="role" onToggle={toggleSort} align="start">{t('staff.table.role')}</SortHeader>
                  <SortHeader sortKey_={sortKey} sortDir={sortDirection} column="email" onToggle={toggleSort} align="start">{t('staff.table.email')}</SortHeader>
                  <th className="py-2 px-3 text-start text-slate-500 dark:text-slate-400 font-medium">{t('staff.table.activities')}</th>
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
          {filteredStaff.map(s => (
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

      {/* ─── Staff Create/Edit Modal ───────────────────────────────────── */}
      <Modal isOpen={isStaffModalOpen} onClose={() => setIsStaffModalOpen(false)}
        title={
          <div>
            <span>{editingStaffId ? t('staff.edit') : t('staff.add_new')}</span>
            {!editingStaffId && (
              <button onClick={openGuideMe} className="ml-3 text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                <Sparkles size={12} /> {t('staff.v2.guide_me')}
              </button>
            )}
          </div>
        }
        isDirty={!!formName || !!formEmail}
        onSave={handleStaffSubmit}>
        <div className="space-y-4">
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

          {/* Step 1: Name + Email */}
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

          {/* Step 2: Role */}
          {(walkthroughStep === null || walkthroughStep >= 2) && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.role')}</label>
              <div className="flex gap-2">
                {STAFF_ROLES.map(r => {
                  const cfg = ROLE_CONFIG[r];
                  const Icon = cfg.icon;
                  const disabled = !isSuperAdmin && editingStaffId != null;
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
              {!isSuperAdmin && editingStaffId && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{t('staff.role_change_forbidden')}</p>
              )}
            </div>
          )}

          {/* Step 3: Phone */}
          {(walkthroughStep === null || walkthroughStep >= 3) && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.phone')}</label>
              <input type="tel" value={formPhone} onChange={e => setFormPhone(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
            </div>
          )}

          {/* UID field — SuperAdmin only, on create only */}
          {isSuperAdmin && !editingStaffId && (walkthroughStep === null || walkthroughStep >= 3) && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.uid_label')}</label>
              <input type="text" value={formUid} onChange={e => setFormUid(e.target.value)}
                placeholder={t('staff.v2.uid_placeholder')}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-sm" />
              <p className="text-xs text-slate-500 mt-1">{t('staff.v2.uid_hint')}</p>
            </div>
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
    </div>
  );
};
