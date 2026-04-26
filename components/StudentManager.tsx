import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Student, Teacher, CalendarEvent, AppSettings } from '../types';
import { buildActivityMap, getActivityName } from '../utils/activityLookup';
import type { ActivityV2, StudentV2, EnrollmentV2, L2Subcategory, EnrollmentStatus, EnsembleRosterMember } from '../types/v2';
import { ImportExportDropdown } from './ImportExportDropdown';
import { V2_COLLECTIONS } from '../types/v2';
import { generateId, TRANSLATIONS } from '../constants';
import { useFirestoreSync } from '../utils/useFirestoreSync';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';
import { SlideOver } from './SlideOver';
import { StudentSlideOverContent } from './StudentSlideOverContent';
import {
  Plus, Edit2, Archive, RotateCcw, Menu, LayoutGrid, List, X,
  Search, HelpCircle, Sparkles, GraduationCap, ChevronRight, Trash2,
  Table2, ChevronUp, ChevronDown, Filter,
} from 'lucide-react';
import { useSortState } from '../utils/useSortState';
import { useListStyle } from '../utils/useListStyle';
import { useColumnFilters, type ColumnFilterConfig } from '../utils/useColumnFilters';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { FilterPills } from './FilterPills';

// ─── Local storage helpers ──────────────────────────────────────────────────

const PREFILL_KEY = 'cadenza_enrollment_prefill';
const WALKTHROUGH_STUDENT_KEY = 'cadenza_student_walkthrough_done';
const WALKTHROUGH_ENROLL_KEY = 'cadenza_enrollment_walkthrough_done';

function saveEnrollmentPrefill(uid: string, data: { activityId: string; l2Id: string }) {
  try { localStorage.setItem(`${PREFILL_KEY}_${uid}`, JSON.stringify(data)); } catch { /* noop */ }
}
function loadEnrollmentPrefill(uid: string): { activityId: string; l2Id: string } | null {
  try {
    const raw = localStorage.getItem(`${PREFILL_KEY}_${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function isStudentWalkthroughDone(uid: string): boolean {
  try { return localStorage.getItem(`${WALKTHROUGH_STUDENT_KEY}_${uid}`) === '1'; } catch { return false; }
}
function markStudentWalkthroughDone(uid: string) {
  try { localStorage.setItem(`${WALKTHROUGH_STUDENT_KEY}_${uid}`, '1'); } catch { /* noop */ }
}
function isEnrollmentWalkthroughDone(uid: string): boolean {
  try { return localStorage.getItem(`${WALKTHROUGH_ENROLL_KEY}_${uid}`) === '1'; } catch { return false; }
}
function markEnrollmentWalkthroughDone(uid: string) {
  try { localStorage.setItem(`${WALKTHROUGH_ENROLL_KEY}_${uid}`, '1'); } catch { /* noop */ }
}

// ─── Props (v1.3 compat — same interface as before for App.tsx) ─────────────

interface Props {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  activities: ActivityV2[];
  setActivities: React.Dispatch<React.SetStateAction<ActivityV2[]>>;
  events: CalendarEvent[];
  settings: AppSettings;
  onMobileMenuOpen: () => void;
  navigateToId?: string | null;
  onNavigateHandled?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const StudentManager: React.FC<Props> = ({
  activities, settings, onMobileMenuOpen, navigateToId, onNavigateHandled,
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const { currentUser, orgId, isSuperAdmin, isAdmin } = useAuth();
  const canWrite = isSuperAdmin || isAdmin;
  const uid = currentUser?.uid || '';

  const activityMap = useMemo(() => buildActivityMap(activities), [activities]);

  // ─── V2.0 Firestore collections ────────────────────────────────────────────
  const [studentsV2, setStudentsV2] = useFirestoreSync<StudentV2>(V2_COLLECTIONS.students, []);
  const [enrollments, setEnrollments] = useFirestoreSync<EnrollmentV2>(V2_COLLECTIONS.enrollments, []);
  const [l2Subcategories] = useFirestoreSync<L2Subcategory>(V2_COLLECTIONS.l2Subcategories, []);
  const [rosterMembers, setRosterMembers] = useFirestoreSync<EnsembleRosterMember>(V2_COLLECTIONS.ensembleRosterMembers, []);

  // ─── View state ────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listStyle, setListStyle] = useListStyle(['grid', 'list', 'table']);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // ─── Student form state ────────────────────────────────────────────────────
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState({ fullName: '', dateOfBirth: '', parentName: '', parentPhone: '', grade: '', startDate: '', level: '', tags: [] as string[], phone2: '', email: '', address: '' });
  const [studentError, setStudentError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  // ─── Enrollment form state ─────────────────────────────────────────────────
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [editingEnrollmentId, setEditingEnrollmentId] = useState<string | null>(null);
  const [enrollForm, setEnrollForm] = useState({ activityId: '', l2Id: '', startDate: '', endDate: '' });
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollPrefilled, setEnrollPrefilled] = useState(false);

  // ─── Archive cascade state ─────────────────────────────────────────────────
  const [archiveCascadeTarget, setArchiveCascadeTarget] = useState<StudentV2 | null>(null);

  // ─── Walkthrough state ─────────────────────────────────────────────────────
  const [studentWalkStep, setStudentWalkStep] = useState<number | null>(null);
  const [enrollWalkStep, setEnrollWalkStep] = useState<number | null>(null);

  // ─── Detail tab ────────────────────────────────────────────────────────────

  // ─── Navigate-to from AdminInbox ──────────────────────────────────────────
  useEffect(() => {
    if (navigateToId) {
      setSelectedId(navigateToId);
      onNavigateHandled?.();
    }
  }, [navigateToId]);

  // ─── Derived data ──────────────────────────────────────────────────────────
  const selectedStudent = useMemo(
    () => studentsV2.find(s => s.id === selectedId) || null,
    [studentsV2, selectedId],
  );

  const filteredStudents = useMemo(() => {
    let list = studentsV2.filter(s => showArchived ? s.isArchived : !s.isArchived);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.fullName.toLowerCase().includes(q) ||
        (s.parentName && s.parentName.toLowerCase().includes(q)) ||
        (s.parentPhone && s.parentPhone.includes(q))
      );
    }
    return list.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [studentsV2, showArchived, search]);

  // ─── Table view: sort + activity summary ──────────────────────────────
  type StudentSortKey = 'fullName' | 'age' | 'grade' | 'level' | 'parentName' | 'enrollmentCount';
  const { sortKey, sortDirection, toggleSort } = useSortState<StudentSortKey>('fullName');

  // ─── Column filters ─────────────────────────────────────────────────────
  const GRADE_ORDER: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 1; i <= 12; i++) map[t(`student.v2.grade.${i}`)] = i;
    map[t('student.v2.grade.graduate')] = 13;
    return map;
  }, [t]);

  const studentColumnConfigs: ColumnFilterConfig<StudentV2>[] = useMemo(() => [
    { key: 'fullName', type: 'text' as const, label: t('student.table.name'), getValue: s => s.fullName },
    { key: 'grade', type: 'checkbox' as const, label: t('student.table.grade'), getValue: s => s.grade ?? '' },
    { key: 'level', type: 'checkbox' as const, label: t('student.table.level'), getValue: s => s.level != null ? String(s.level) : '' },
    { key: 'parentName', type: 'text' as const, label: t('student.table.parent'), getValue: s => s.parentName ?? '' },
    { key: 'tags', type: 'checkbox' as const, label: t('student.table.tags'), getValue: s => s.tags ?? [] },
    { key: 'enrollments', type: 'checkbox' as const, label: t('student.table.enrollments'), getValue: (s: StudentV2) => {
      const active = enrollments.filter(e => e.studentId === s.id && e.status === 'ACTIVE');
      return active.map(e => {
        const actName = getActivityName(activityMap, e.activityId);
        const l2 = l2Subcategories.find(l => l.id === e.l2Id);
        return l2 ? `${actName} (${l2.name})` : actName;
      }).filter(Boolean);
    }},
  ], [t, enrollments, activityMap, l2Subcategories]);

  const {
    filters: columnFilters,
    setCheckboxFilter,
    clearFilter: clearColumnFilter,
    clearAll: clearAllColumnFilters,
    hasActiveFilters,
    filteredData: columnFilteredStudents,
    distinctValues,
    activeFilterSummary,
  } = useColumnFilters(filteredStudents, studentColumnConfigs);

  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);

  const computeAge = useCallback((dob: string | null | undefined): number | null => {
    if (!dob) return null;
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }, []);

  const studentActivitySummary = useMemo(() => {
    const map = new Map<string, { labels: string[]; count: number }>();
    for (const s of columnFilteredStudents) {
      const active = enrollments.filter(e => e.studentId === s.id && e.status === 'ACTIVE');
      const labels = active.map(e => {
        const actName = getActivityName(activityMap, e.activityId);
        const l2 = l2Subcategories.find(l => l.id === e.l2Id);
        return l2 ? `${actName} (${l2.name})` : actName;
      }).filter(Boolean);
      map.set(s.id, { labels, count: active.length });
    }
    return map;
  }, [columnFilteredStudents, enrollments, activityMap, l2Subcategories]);

  const sortedStudents = useMemo(() => {
    if (listStyle !== 'table') return columnFilteredStudents;
    const sorted = [...columnFilteredStudents];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'fullName': cmp = a.fullName.localeCompare(b.fullName); break;
        case 'age': {
          const aa = computeAge(a.dateOfBirth) ?? -1;
          const ba = computeAge(b.dateOfBirth) ?? -1;
          cmp = aa - ba;
          break;
        }
        case 'grade': {
          const ag = GRADE_ORDER[a.grade ?? ''] ?? 99;
          const bg = GRADE_ORDER[b.grade ?? ''] ?? 99;
          cmp = ag - bg;
          break;
        }
        case 'level': {
          const al = a.level ?? -1;
          const bl = b.level ?? -1;
          cmp = al - bl;
          break;
        }
        case 'parentName': cmp = (a.parentName || '').localeCompare(b.parentName || ''); break;
        case 'enrollmentCount': {
          const ac = studentActivitySummary.get(a.id)?.count ?? 0;
          const bc = studentActivitySummary.get(b.id)?.count ?? 0;
          cmp = ac - bc;
          break;
        }
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [columnFilteredStudents, listStyle, sortKey, sortDirection, computeAge, studentActivitySummary, GRADE_ORDER]);

  const studentEnrollments = useMemo(
    () => selectedId ? enrollments.filter(e => e.studentId === selectedId) : [],
    [enrollments, selectedId],
  );

  const activeEnrollmentCount = useCallback(
    (studentId: string) => enrollments.filter(e => e.studentId === studentId && e.status === 'ACTIVE').length,
    [enrollments],
  );

  const l2sForActivity = useCallback(
    (activityId: string) => l2Subcategories.filter(l => l.activityId === activityId && !l.isArchived),
    [l2Subcategories],
  );

  const getActName = useCallback(
    (id: string) => getActivityName(activityMap, id, id),
    [activityMap],
  );

  const getL2Name = useCallback(
    (id: string) => l2Subcategories.find(l => l.id === id)?.name || id,
    [l2Subcategories],
  );

  // ─── CSV Import/Export data ─────────────────────────────────────────────────

  const studentExportData = useMemo(() => studentsV2.map(s => ({
    fullName: s.fullName,
    dateOfBirth: s.dateOfBirth || '',
    parentName: s.parentName || '',
    parentPhone: s.parentPhone || '',
    grade: s.grade || '',
    startDate: s.startDate || '',
    level: s.level != null ? String(s.level) : '',
    tags: (s.tags ?? []).join(', '),
    phone2: s.phone2 || '',
    email: s.email || '',
    address: s.address || '',
  })), [studentsV2]);

  const studentDupKeys = useMemo(
    () => new Set(studentsV2.map(s => s.fullName.trim().toLowerCase())),
    [studentsV2],
  );

  const enrollmentExportData = useMemo(() => enrollments.map(e => ({
    studentFullName: studentsV2.find(s => s.id === e.studentId)?.fullName || '',
    activityName: getActivityName(activityMap, e.activityId, ''),
    l2Name: l2Subcategories.find(l => l.id === e.l2Id)?.name || '',
    startDate: e.startDate || '',
  })), [enrollments, studentsV2, activities, l2Subcategories]);

  const enrollmentDupKeys = useMemo(() => new Set(enrollments.map(e => {
    const sName = studentsV2.find(s => s.id === e.studentId)?.fullName || '';
    const aName = getActivityName(activityMap, e.activityId, '');
    const lName = l2Subcategories.find(l => l.id === e.l2Id)?.name || '';
    return `${sName}|${aName}|${lName}`.toLowerCase();
  })), [enrollments, studentsV2, activities, l2Subcategories]);

  const csvActivityByName = useMemo(
    () => Object.fromEntries(activities.map(a => [a.name.toLowerCase(), a.id])),
    [activities],
  );
  const csvL2ByName = useMemo(
    () => Object.fromEntries(l2Subcategories.map(l => [l.name.toLowerCase(), l.id])),
    [l2Subcategories],
  );
  const csvStudentByName = useMemo(
    () => Object.fromEntries(studentsV2.map(s => [s.fullName.toLowerCase(), s.id])),
    [studentsV2],
  );

  const handleStudentImportComplete = useCallback((rows: Record<string, string>[]) => {
    const now = Timestamp.now();
    const newStudents: StudentV2[] = rows.map(row => ({
      id: generateId(), orgId: orgId || '',
      fullName: row['fullName'] || '',
      dateOfBirth: row['dateOfBirth'] || null,
      parentName: row['parentName'] || null,
      parentPhone: row['parentPhone'] || null,
      grade: row['grade'] || null,
      startDate: row['startDate'] || null,
      level: row['level'] ? parseInt(row['level'], 10) || null : null,
      tags: row['tags'] ? row['tags'].split(',').map(t => t.trim()).filter(Boolean) : [],
      phone2: row['phone2'] || null,
      email: row['email'] || null,
      address: row['address'] || null,
      isArchived: false,
      documents: [],
      createdAt: now, updatedAt: now,
    }));
    setStudentsV2(prev => [...prev, ...newStudents]);
  }, [orgId, setStudentsV2]);

  const handleEnrollmentImportComplete = useCallback((rows: Record<string, string>[]) => {
    const now = Timestamp.now();
    const newEnrollments: EnrollmentV2[] = rows.map(row => ({
      id: generateId(), orgId: orgId || '',
      studentId: csvStudentByName[row['studentFullName']?.trim().toLowerCase() || ''] || '',
      activityId: csvActivityByName[row['activityName']?.trim().toLowerCase() || ''] || '',
      l2Id: csvL2ByName[row['l2Name']?.trim().toLowerCase() || ''] || '',
      startDate: row['startDate'] || '',
      endDate: null,
      status: 'ACTIVE' as EnrollmentStatus,
      createdAt: now, updatedAt: now,
    }));
    setEnrollments(prev => [...prev, ...newEnrollments]);
  }, [orgId, setEnrollments, csvStudentByName, csvActivityByName, csvL2ByName]);

  // ─── Student CRUD ──────────────────────────────────────────────────────────

  const openNewStudent = useCallback(() => {
    setEditingStudentId(null);
    setStudentForm({ fullName: '', dateOfBirth: '', parentName: '', parentPhone: '', grade: '', startDate: '', level: '', tags: [], phone2: '', email: '', address: '' });
    setTagInput('');
    setStudentError(null);
    if (!isStudentWalkthroughDone(uid)) {
      setStudentWalkStep(1);
    } else {
      setStudentWalkStep(null);
    }
    setShowStudentModal(true);
  }, [uid]);

  const openEditStudent = useCallback((s: StudentV2) => {
    setEditingStudentId(s.id);
    setStudentForm({
      fullName: s.fullName,
      dateOfBirth: s.dateOfBirth || '',
      parentName: s.parentName || '',
      parentPhone: s.parentPhone || '',
      grade: s.grade || '',
      startDate: s.startDate || '',
      level: s.level != null ? String(s.level) : '',
      tags: s.tags ?? [],
      phone2: s.phone2 || '',
      email: s.email || '',
      address: s.address || '',
    });
    setTagInput('');
    setStudentError(null);
    setStudentWalkStep(null);
    setShowStudentModal(true);
  }, []);

  const handleSaveStudent = useCallback(() => {
    if (!studentForm.fullName.trim()) {
      setStudentError(t('student.err_name_required'));
      return;
    }
    const now = Timestamp.now();
    if (editingStudentId) {
      setStudentsV2(prev => prev.map(s => s.id === editingStudentId ? {
        ...s,
        fullName: studentForm.fullName.trim(),
        dateOfBirth: studentForm.dateOfBirth || null,
        parentName: studentForm.parentName.trim() || null,
        parentPhone: studentForm.parentPhone.trim() || null,
        grade: studentForm.grade || null,
        startDate: studentForm.startDate || null,
        level: studentForm.level ? parseInt(studentForm.level, 10) || null : null,
        tags: studentForm.tags,
        phone2: studentForm.phone2.trim() || null,
        email: studentForm.email.trim() || null,
        address: studentForm.address.trim() || null,
        updatedAt: now,
      } : s));
    } else {
      const newStudent: StudentV2 = {
        id: generateId(),
        orgId: orgId || '',
        fullName: studentForm.fullName.trim(),
        dateOfBirth: studentForm.dateOfBirth || null,
        parentName: studentForm.parentName.trim() || null,
        parentPhone: studentForm.parentPhone.trim() || null,
        grade: studentForm.grade || null,
        startDate: studentForm.startDate || null,
        level: studentForm.level ? parseInt(studentForm.level, 10) || null : null,
        tags: studentForm.tags,
        phone2: studentForm.phone2.trim() || null,
        email: studentForm.email.trim() || null,
        address: studentForm.address.trim() || null,
        isArchived: false,
        documents: [],
        createdAt: now,
        updatedAt: now,
      };
      setStudentsV2(prev => [...prev, newStudent]);
      markStudentWalkthroughDone(uid);
    }
    setShowStudentModal(false);
    setSearch('');
  }, [studentForm, editingStudentId, orgId, uid, t, setStudentsV2]);

  const handleArchiveStudent = useCallback((student: StudentV2) => {
    const activeEnrollments = enrollments.filter(e => e.studentId === student.id && e.status === 'ACTIVE').length;
    const activeRosterMembers = rosterMembers.filter(r => r.studentId === student.id && !r.isArchived).length;
    if (activeEnrollments > 0 || activeRosterMembers > 0) {
      setArchiveCascadeTarget(student);
    } else {
      setStudentsV2(prev => prev.map(s => s.id === student.id
        ? { ...s, isArchived: true, updatedAt: Timestamp.now() } : s));
    }
  }, [enrollments, rosterMembers, setStudentsV2]);

  const confirmArchiveCascade = useCallback(() => {
    if (!archiveCascadeTarget) return;
    const sid = archiveCascadeTarget.id;
    const now = Timestamp.now();
    // Archive the student
    setStudentsV2(prev => prev.map(s => s.id === sid ? { ...s, isArchived: true, updatedAt: now } : s));
    // Cascade: archive active enrollments (Section 10)
    setEnrollments(prev => prev.map(e => e.studentId === sid && e.status === 'ACTIVE'
      ? { ...e, status: 'ARCHIVED' as EnrollmentStatus, updatedAt: now } : e));
    // Cascade: archive ensemble roster members (Section 10)
    setRosterMembers(prev => prev.map(r => r.studentId === sid && !r.isArchived
      ? { ...r, isArchived: true, updatedAt: now } : r));
    setArchiveCascadeTarget(null);
    if (selectedId === sid) { setSelectedId(null); }
  }, [archiveCascadeTarget, selectedId, setStudentsV2, setEnrollments, setRosterMembers]);

  const handleRestoreStudent = useCallback((student: StudentV2) => {
    setStudentsV2(prev => prev.map(s => s.id === student.id
      ? { ...s, isArchived: false, updatedAt: Timestamp.now() } : s));
  }, [setStudentsV2]);

  // ─── Document update ───────────────────────────────────────────────────────

  const handleStudentDocumentsUpdate = useCallback((documents: import('../types/v2').DocumentEntry[]) => {
    if (!selectedId) return;
    setStudentsV2(prev => prev.map(s => s.id === selectedId
      ? { ...s, documents, updatedAt: Timestamp.now() } : s));
  }, [selectedId, setStudentsV2]);

  // ─── Enrollment CRUD ───────────────────────────────────────────────────────

  const openNewEnrollment = useCallback(() => {
    setEditingEnrollmentId(null);
    setEnrollError(null);
    const prefill = loadEnrollmentPrefill(uid);
    let form = { activityId: '', l2Id: '', startDate: new Date().toISOString().split('T')[0], endDate: '' };
    let prefilled = false;
    if (prefill) {
      const activityExists = activities.some(a => a.id === prefill.activityId && !a.isArchived);
      const l2Exists = l2Subcategories.some(l => l.id === prefill.l2Id && !l.isArchived);
      if (activityExists && l2Exists) {
        form.activityId = prefill.activityId;
        form.l2Id = prefill.l2Id;
        prefilled = true;
      }
    }
    setEnrollForm(form);
    setEnrollPrefilled(prefilled);
    if (!isEnrollmentWalkthroughDone(uid)) {
      setEnrollWalkStep(1);
    } else {
      setEnrollWalkStep(null);
    }
    setShowEnrollmentModal(true);
  }, [uid, activities, l2Subcategories]);

  const openEditEnrollment = useCallback((e: EnrollmentV2) => {
    setEditingEnrollmentId(e.id);
    setEnrollForm({
      activityId: e.activityId,
      l2Id: e.l2Id,
      startDate: e.startDate,
      endDate: e.endDate || '',
    });
    setEnrollError(null);
    setEnrollPrefilled(false);
    setEnrollWalkStep(null);
    setShowEnrollmentModal(true);
  }, []);

  const handleSaveEnrollment = useCallback(() => {
    if (!enrollForm.activityId) { setEnrollError(t('student.v2.enrollment.err_activity')); return; }
    if (!enrollForm.l2Id) { setEnrollError(t('student.v2.enrollment.err_l2')); return; }
    if (!enrollForm.startDate) { setEnrollError(t('student.v2.enrollment.err_start')); return; }
    if (!selectedId) return;

    const now = Timestamp.now();
    if (editingEnrollmentId) {
      setEnrollments(prev => prev.map(e => e.id === editingEnrollmentId ? {
        ...e,
        activityId: enrollForm.activityId,
        l2Id: enrollForm.l2Id,
        startDate: enrollForm.startDate,
        endDate: enrollForm.endDate || null,
        updatedAt: now,
      } : e));
    } else {
      const newEnroll: EnrollmentV2 = {
        id: generateId(),
        orgId: orgId || '',
        studentId: selectedId,
        activityId: enrollForm.activityId,
        l2Id: enrollForm.l2Id,
        startDate: enrollForm.startDate,
        endDate: enrollForm.endDate || null,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };
      setEnrollments(prev => [...prev, newEnroll]);
      saveEnrollmentPrefill(uid, { activityId: enrollForm.activityId, l2Id: enrollForm.l2Id });
      markEnrollmentWalkthroughDone(uid);
    }
    setShowEnrollmentModal(false);
  }, [enrollForm, editingEnrollmentId, selectedId, orgId, uid, t, setEnrollments]);

  const handleArchiveEnrollment = useCallback((enrollment: EnrollmentV2) => {
    setEnrollments(prev => prev.map(e => e.id === enrollment.id
      ? { ...e, status: 'ARCHIVED' as EnrollmentStatus, updatedAt: Timestamp.now() } : e));
  }, [setEnrollments]);

  const handleReinstateEnrollment = useCallback((enrollment: EnrollmentV2) => {
    setEnrollments(prev => prev.map(e => e.id === enrollment.id
      ? { ...e, status: 'ACTIVE' as EnrollmentStatus, updatedAt: Timestamp.now() } : e));
  }, [setEnrollments]);

  // ─── Navigation helpers ────────────────────────────────────────────────────

  const selectStudent = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  // ─── Walkthrough helpers ───────────────────────────────────────────────────

  const WalkthroughBanner: React.FC<{ step: number; total: number; message: string; onNext: () => void; onSkip: () => void }> = ({ step, total, message, onNext, onSkip }) => (
    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="flex items-start gap-2">
        <Sparkles size={16} className="text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-blue-800 dark:text-blue-200">{message}</p>
          <p className="text-xs text-blue-500 mt-1">{t('staff.v2.walkthrough.step')} {step} / {total}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onSkip} className="text-xs text-blue-400 hover:text-blue-600">Skip</button>
          <button onClick={onNext} className="text-xs font-medium text-blue-600 dark:text-blue-300 hover:underline">
            {step < total ? 'Next →' : 'Done ✓'}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Inline SortHeader for table view ───────────────────────────────────
  const StudentSortHeader: React.FC<{
    sortKey_: StudentSortKey; sortDir: 'asc' | 'desc'; column: StudentSortKey;
    onToggle: (k: StudentSortKey) => void; align: 'start' | 'end'; children: React.ReactNode;
    filterKey?: string;
  }> = ({ sortKey_: sk, sortDir, column, onToggle, align, children, filterKey }) => (
    <th className={`py-2 px-3 text-${align} text-slate-500 dark:text-slate-400 font-medium select-none relative`}>
      <span className="inline-flex items-center gap-1">
        <span className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors" onClick={() => onToggle(column)}>
          {children}
          {sk === column && (sortDir === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
        </span>
        {filterKey && distinctValues[filterKey] && (
          <button
            onClick={e => { e.stopPropagation(); setOpenFilterKey(prev => prev === filterKey ? null : filterKey); }}
            className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${columnFilters[filterKey]?.selected.size ? 'text-blue-600 dark:text-blue-400' : ''}`}
          >
            <Filter size={12} />
          </button>
        )}
      </span>
      {filterKey && openFilterKey === filterKey && distinctValues[filterKey] && (
        <ColumnFilterDropdown
          values={distinctValues[filterKey]}
          selected={columnFilters[filterKey]?.selected ?? new Set()}
          onChange={vals => setCheckboxFilter(filterKey, vals)}
          onClose={() => setOpenFilterKey(null)}
          t={t}
        />
      )}
    </th>
  );

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="h-full flex">
    <div className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onMobileMenuOpen}>
          <Menu size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <GraduationCap size={24} />
            {t('student.title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('student.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <button
              onClick={openNewStudent}
              className="flex items-center gap-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Plus size={16} /> {t('student.add')}
            </button>
          )}
          <ImportExportDropdown
            entityType="STUDENT"
            existingData={studentExportData}
            existingDuplicateKeys={studentDupKeys}
            dependencyMaps={{ activityByName: csvActivityByName, l2ByName: csvL2ByName, staffByEmail: {}, studentByName: csvStudentByName }}
            activityNames={activities.map(a => a.name)}
            settings={settings}
            canWrite={canWrite}
            onImportComplete={handleStudentImportComplete}
          />
        </div>
      </div>

      {/* ── List View (always visible) ── */}
      <>
          {/* Search & filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('student.search')}
                className="w-full ps-9 pe-8 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${showArchived ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
              >
                <Archive size={14} className="inline mr-1" /> {t('student.show_archived')}
              </button>
              <div className="flex border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
                <button onClick={() => setListStyle('list')} className={`p-2 ${listStyle === 'list' ? 'bg-slate-200 dark:bg-slate-700' : 'bg-white dark:bg-slate-800'}`}>
                  <List size={14} className="text-slate-600 dark:text-slate-400" />
                </button>
                <button onClick={() => setListStyle('grid')} className={`p-2 ${listStyle === 'grid' ? 'bg-slate-200 dark:bg-slate-700' : 'bg-white dark:bg-slate-800'}`}>
                  <LayoutGrid size={14} className="text-slate-600 dark:text-slate-400" />
                </button>
                <button onClick={() => setListStyle('table')} className={`hidden md:block p-2 ${listStyle === 'table' ? 'bg-slate-200 dark:bg-slate-700' : 'bg-white dark:bg-slate-800'}`}>
                  <Table2 size={14} className="text-slate-600 dark:text-slate-400" />
                </button>
              </div>
            </div>
          </div>

          {/* Filter pills */}
          {hasActiveFilters && (
            <FilterPills
              pills={activeFilterSummary}
              onRemove={clearColumnFilter}
              onClearAll={clearAllColumnFilters}
              t={t}
            />
          )}

          {/* Student list */}
          {columnFilteredStudents.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <GraduationCap size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? t('student.no_results') : t('student.empty_state')}</p>
            </div>
          ) : listStyle === 'table' ? (
            <>
              {/* Mobile fallback — list cards */}
              <div className="md:hidden space-y-2">
                {sortedStudents.map(student => {
                  const count = activeEnrollmentCount(student.id);
                  return (
                    <button key={student.id} onClick={() => selectStudent(student.id)}
                      className={`w-full text-left flex items-center gap-4 p-3 rounded-lg border transition-colors hover:border-blue-300 dark:hover:border-blue-700 ${
                        student.isArchived ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                      }`}>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-slate-900 dark:text-white">{student.fullName}</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">{student.parentName || ''}</span>
                      </div>
                      {count > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          {count}
                        </span>
                      )}
                      <ChevronRight size={16} className="text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 border-b border-slate-200 dark:border-slate-700">
                      <StudentSortHeader sortKey_={sortKey} sortDir={sortDirection} column="fullName" onToggle={toggleSort} align="start">{t('student.table.name')}</StudentSortHeader>
                      <StudentSortHeader sortKey_={sortKey} sortDir={sortDirection} column="age" onToggle={toggleSort} align="end">{t('student.table.age')}</StudentSortHeader>
                      <StudentSortHeader sortKey_={sortKey} sortDir={sortDirection} column="grade" onToggle={toggleSort} align="start" filterKey="grade">{t('student.table.grade')}</StudentSortHeader>
                      <StudentSortHeader sortKey_={sortKey} sortDir={sortDirection} column="level" onToggle={toggleSort} align="end" filterKey="level">{t('student.table.level')}</StudentSortHeader>
                      <StudentSortHeader sortKey_={sortKey} sortDir={sortDirection} column="parentName" onToggle={toggleSort} align="start">{t('student.table.parent')}</StudentSortHeader>
                      <th className="py-2 px-3 text-start text-slate-500 dark:text-slate-400 font-medium">{t('student.table.phone')}</th>
                      <th className="py-2 px-3 text-start text-slate-500 dark:text-slate-400 font-medium relative">
                        <span className="inline-flex items-center gap-1">
                          {t('student.table.tags')}
                          {distinctValues['tags'] && (
                            <button
                              onClick={() => setOpenFilterKey(prev => prev === 'tags' ? null : 'tags')}
                              className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${columnFilters['tags']?.selected.size ? 'text-blue-600 dark:text-blue-400' : ''}`}
                            >
                              <Filter size={12} />
                            </button>
                          )}
                        </span>
                        {openFilterKey === 'tags' && distinctValues['tags'] && (
                          <ColumnFilterDropdown
                            values={distinctValues['tags']}
                            selected={columnFilters['tags']?.selected ?? new Set()}
                            onChange={vals => setCheckboxFilter('tags', vals)}
                            onClose={() => setOpenFilterKey(null)}
                            t={t}
                          />
                        )}
                      </th>
                      <StudentSortHeader sortKey_={sortKey} sortDir={sortDirection} column="enrollmentCount" onToggle={toggleSort} align="start" filterKey="enrollments">{t('student.table.enrollments')}</StudentSortHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStudents.map(student => {
                      const summary = studentActivitySummary.get(student.id);
                      const labels = summary?.labels ?? [];
                      const age = computeAge(student.dateOfBirth);
                      const tags = student.tags ?? [];
                      return (
                        <tr key={student.id} onClick={() => selectStudent(student.id)}
                          className="border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors">
                          <td className="py-2 px-3 text-start font-medium text-slate-800 dark:text-slate-200">
                            {student.fullName}
                            {student.isArchived && (
                              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                                {t('student.archived_badge')}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-end text-slate-600 dark:text-slate-400">{age != null ? age : '—'}</td>
                          <td className="py-2 px-3 text-start text-slate-600 dark:text-slate-400">{student.grade || '—'}</td>
                          <td className="py-2 px-3 text-end text-slate-600 dark:text-slate-400">{student.level != null ? student.level : '—'}</td>
                          <td className="py-2 px-3 text-start text-slate-600 dark:text-slate-400">{student.parentName || '—'}</td>
                          <td className="py-2 px-3 text-start text-slate-600 dark:text-slate-400">{student.parentPhone || '—'}</td>
                          <td className="py-2 px-3 text-start text-slate-600 dark:text-slate-400">
                            {tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {tags.slice(0, 2).map((tag, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">{tag}</span>
                                ))}
                                {tags.length > 2 && <span className="text-xs text-slate-400">+{tags.length - 2}</span>}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="py-2 px-3 text-start text-slate-600 dark:text-slate-400 relative group">
                            {labels.length > 0 ? (
                              <>
                                <span>{labels[0]}</span>
                                {labels.length > 1 && (
                                  <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-default">
                                    +{labels.length - 1}
                                  </span>
                                )}
                                {labels.length > 1 && (
                                  <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2 hidden group-hover:block min-w-[160px]" onClick={e => e.stopPropagation()}>
                                    {labels.map((label, i) => (
                                      <p key={i} className="text-xs text-slate-700 dark:text-slate-300 py-0.5">{label}</p>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className={listStyle === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
              : 'space-y-2'
            }>
              {columnFilteredStudents.map(student => {
                const count = activeEnrollmentCount(student.id);
                return (
                  <button
                    key={student.id}
                    onClick={() => selectStudent(student.id)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors hover:border-blue-300 dark:hover:border-blue-700 ${
                      student.isArchived
                        ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                          <GraduationCap size={16} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-white truncate">{student.fullName}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            {student.dateOfBirth && <span>{student.dateOfBirth}</span>}
                            {student.parentName && <span>· {student.parentName}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {student.isArchived && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">{t('student.archived_badge')}</span>
                        )}
                        {count > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                            {count} {t('student.v2.active_enrollments')}
                          </span>
                        )}
                        <ChevronRight size={16} className="text-slate-400" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>

      </div>{/* end main content */}

      {/* ── Student Slide-Over ── */}
      <SlideOver
        isOpen={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={selectedStudent?.fullName}
      >
        {selectedStudent && (
          <StudentSlideOverContent
            student={selectedStudent}
            enrollments={studentEnrollments}
            activities={activities}
            settings={settings}
            canWrite={canWrite}
            t={t}
            getActName={getActName}
            getL2Name={getL2Name}
            onEdit={openEditStudent}
            onArchive={handleArchiveStudent}
            onRestore={handleRestoreStudent}
            onNewEnrollment={openNewEnrollment}
            onEditEnrollment={openEditEnrollment}
            onArchiveEnrollment={handleArchiveEnrollment}
            onReinstateEnrollment={handleReinstateEnrollment}
            enrollmentExportData={enrollmentExportData}
            enrollmentDupKeys={enrollmentDupKeys}
            csvActivityByName={csvActivityByName}
            csvL2ByName={csvL2ByName}
            csvStudentByName={csvStudentByName}
            onEnrollmentImportComplete={handleEnrollmentImportComplete}
            orgId={orgId || ''}
            onDocumentsUpdate={handleStudentDocumentsUpdate}
            uid={uid}
            isEnrollmentWalkthroughDone={isEnrollmentWalkthroughDone}
            enrollWalkStep={enrollWalkStep}
            setEnrollWalkStep={setEnrollWalkStep}
            markEnrollmentWalkthroughDone={markEnrollmentWalkthroughDone}
            WalkthroughBanner={WalkthroughBanner}
          />
        )}
      </SlideOver>
    </div>{/* end flex row */}

    {/* ── Student Modal ── */}
      <Modal
        isOpen={showStudentModal}
        onClose={() => setShowStudentModal(false)}
        title={editingStudentId ? t('student.edit') : t('student.add_new')}
        onSave={handleSaveStudent}
      >
        <div className="space-y-4">
          {/* Guide Me link */}
          {!studentWalkStep && isStudentWalkthroughDone(uid) && (
            <button onClick={() => setStudentWalkStep(1)} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400">
              <HelpCircle size={12} /> {t('student.v2.guide_me')}
            </button>
          )}

          {/* Walkthrough step 1 */}
          {studentWalkStep === 1 && (
            <WalkthroughBanner
              step={1} total={3}
              message={t('student.v2.walkthrough.step1')}
              onNext={() => setStudentWalkStep(2)}
              onSkip={() => { setStudentWalkStep(null); markStudentWalkthroughDone(uid); }}
            />
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {t('student.full_name')} <span className="text-red-500">*</span>
            </label>
            <input
              value={studentForm.fullName}
              onChange={e => setStudentForm(p => ({ ...p, fullName: e.target.value }))}
              placeholder={t('student.full_name_placeholder')}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Walkthrough step 2 */}
          {studentWalkStep === 2 && (
            <WalkthroughBanner
              step={2} total={3}
              message={t('student.v2.walkthrough.step2')}
              onNext={() => setStudentWalkStep(3)}
              onSkip={() => { setStudentWalkStep(null); markStudentWalkthroughDone(uid); }}
            />
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.date_of_birth')}</label>
            <input
              type="date"
              value={studentForm.dateOfBirth}
              onChange={e => setStudentForm(p => ({ ...p, dateOfBirth: e.target.value }))}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.v2.parent_name')}</label>
            <input
              value={studentForm.parentName}
              onChange={e => setStudentForm(p => ({ ...p, parentName: e.target.value }))}
              placeholder={t('student.v2.parent_name_placeholder')}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.v2.parent_phone')}</label>
            <input
              value={studentForm.parentPhone}
              onChange={e => setStudentForm(p => ({ ...p, parentPhone: e.target.value }))}
              placeholder={t('student.v2.parent_phone_placeholder')}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* ── New fields (Phase 1) ── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.grade')}</label>
              <select
                value={studentForm.grade}
                onChange={e => setStudentForm(p => ({ ...p, grade: e.target.value }))}
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">{t('student.v2.grade_select')}</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={t(`student.v2.grade.${i + 1}`)}>{t(`student.v2.grade.${i + 1}`)}</option>
                ))}
                <option value={t('student.v2.grade.graduate')}>{t('student.v2.grade.graduate')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.v2.level')}</label>
              <input
                type="number"
                min={1}
                max={7}
                value={studentForm.level}
                onChange={e => setStudentForm(p => ({ ...p, level: e.target.value }))}
                placeholder={t('student.v2.level_placeholder')}
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.v2.start_date')}</label>
            <input
              type="date"
              value={studentForm.startDate}
              onChange={e => setStudentForm(p => ({ ...p, startDate: e.target.value }))}
              placeholder={t('student.v2.start_date_placeholder')}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.v2.phone2')}</label>
            <input
              value={studentForm.phone2}
              onChange={e => setStudentForm(p => ({ ...p, phone2: e.target.value }))}
              placeholder={t('student.v2.phone2_placeholder')}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.v2.email')}</label>
            <input
              type="email"
              value={studentForm.email}
              onChange={e => setStudentForm(p => ({ ...p, email: e.target.value }))}
              placeholder={t('student.v2.email_placeholder')}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.v2.address')}</label>
            <input
              value={studentForm.address}
              onChange={e => setStudentForm(p => ({ ...p, address: e.target.value }))}
              placeholder={t('student.v2.address_placeholder')}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.v2.tags')}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {studentForm.tags.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs">
                  {tag}
                  <button type="button" onClick={() => setStudentForm(p => ({ ...p, tags: p.tags.filter((_, j) => j !== i) }))} className="hover:text-red-500">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  e.preventDefault();
                  if (!studentForm.tags.includes(tagInput.trim())) {
                    setStudentForm(p => ({ ...p, tags: [...p.tags, tagInput.trim()] }));
                  }
                  setTagInput('');
                }
              }}
              placeholder={t('student.v2.tags') + '...'}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Walkthrough step 3 */}
          {studentWalkStep === 3 && (
            <WalkthroughBanner
              step={3} total={3}
              message={t('student.v2.walkthrough.step3')}
              onNext={() => { setStudentWalkStep(null); markStudentWalkthroughDone(uid); }}
              onSkip={() => { setStudentWalkStep(null); markStudentWalkthroughDone(uid); }}
            />
          )}

          {studentError && (
            <p className="text-sm text-red-600 dark:text-red-400">{studentError}</p>
          )}
        </div>
      </Modal>

      {/* ── Enrollment Modal ── */}
      <Modal
        isOpen={showEnrollmentModal}
        onClose={() => setShowEnrollmentModal(false)}
        title={editingEnrollmentId ? t('student.v2.enrollment.edit') : t('student.v2.enrollment.add')}
        onSave={handleSaveEnrollment}
      >
        <div className="space-y-4">
          {/* Guide Me link */}
          {!enrollWalkStep && isEnrollmentWalkthroughDone(uid) && (
            <button onClick={() => setEnrollWalkStep(1)} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400">
              <HelpCircle size={12} /> {t('student.v2.guide_me')}
            </button>
          )}

          {/* Pre-fill notice */}
          {enrollPrefilled && !editingEnrollmentId && (
            <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1">
                <Sparkles size={12} /> {t('student.v2.prefill.notice')}
              </p>
            </div>
          )}

          {/* Walkthrough step 1 */}
          {enrollWalkStep === 1 && (
            <WalkthroughBanner
              step={1} total={3}
              message={t('student.v2.walkthrough.enrollment1')}
              onNext={() => setEnrollWalkStep(2)}
              onSkip={() => { setEnrollWalkStep(null); markEnrollmentWalkthroughDone(uid); }}
            />
          )}

          {/* Activity select */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {t('student.v2.enrollment.activity')} <span className="text-red-500">*</span>
            </label>
            <select
              value={enrollForm.activityId}
              onChange={e => {
                const val = e.target.value;
                setEnrollForm(p => ({ ...p, activityId: val, l2Id: '' }));
              }}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">{t('student.v2.enrollment.select_activity')}</option>
              {activities.filter(a => !a.isArchived).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Walkthrough step 2 */}
          {enrollWalkStep === 2 && (
            <WalkthroughBanner
              step={2} total={3}
              message={t('student.v2.walkthrough.enrollment2')}
              onNext={() => setEnrollWalkStep(3)}
              onSkip={() => { setEnrollWalkStep(null); markEnrollmentWalkthroughDone(uid); }}
            />
          )}

          {/* L2 select */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {t('student.v2.enrollment.l2')} <span className="text-red-500">*</span>
            </label>
            {enrollForm.activityId ? (
              l2sForActivity(enrollForm.activityId).length > 0 ? (
                <select
                  value={enrollForm.l2Id}
                  onChange={e => setEnrollForm(p => ({ ...p, l2Id: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">{t('student.v2.enrollment.select_l2')}</option>
                  {l2sForActivity(enrollForm.activityId).map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-slate-400">{t('student.v2.enrollment.no_l2')}</p>
              )
            ) : (
              <select disabled className="w-full border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-lg px-3 py-2 text-sm">
                <option>{t('student.v2.enrollment.select_l2')}</option>
              </select>
            )}
          </div>

          {/* Walkthrough step 3 */}
          {enrollWalkStep === 3 && (
            <WalkthroughBanner
              step={3} total={3}
              message={t('student.v2.walkthrough.enrollment3')}
              onNext={() => { setEnrollWalkStep(null); markEnrollmentWalkthroughDone(uid); }}
              onSkip={() => { setEnrollWalkStep(null); markEnrollmentWalkthroughDone(uid); }}
            />
          )}

          {/* Start date */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {t('student.v2.enrollment.start_date')} <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={enrollForm.startDate}
              onChange={e => setEnrollForm(p => ({ ...p, startDate: e.target.value }))}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* End date */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {t('student.v2.enrollment.end_date')}
            </label>
            <input
              type="date"
              value={enrollForm.endDate}
              onChange={e => setEnrollForm(p => ({ ...p, endDate: e.target.value }))}
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {enrollError && (
            <p className="text-sm text-red-600 dark:text-red-400">{enrollError}</p>
          )}
        </div>
      </Modal>

      {/* ── Archive Cascade Confirmation ── */}
      <Modal
        isOpen={!!archiveCascadeTarget}
        onClose={() => setArchiveCascadeTarget(null)}
        title={t('student.v2.archive_cascade.title')}
        onSave={confirmArchiveCascade}
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {archiveCascadeTarget
              ? t('student.v2.archive_cascade.message').replace(
                  '{count}',
                  String(enrollments.filter(e => e.studentId === archiveCascadeTarget.id && e.status === 'ACTIVE').length)
                )
              : ''}
          </p>
          {archiveCascadeTarget && (() => {
            const rosterCount = rosterMembers.filter(r => r.studentId === archiveCascadeTarget.id && !r.isArchived).length;
            return rosterCount > 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {t('student.v2.archive_cascade.roster').replace('{count}', String(rosterCount))}
              </p>
            ) : null;
          })()}
        </div>
      </Modal>
    </>
  );
};
