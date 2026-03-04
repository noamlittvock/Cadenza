import React, { useState, useRef, useMemo } from 'react';
import {
  Student, Guardian, StudentAssignment, RecitalEntry, ReportCard, PedagogicalRecord,
  Note, StaffDocument, Activity, Teacher, CalendarEvent, AppSettings
} from '../types';
import { generateId, TRANSLATIONS } from '../constants';
import {
  Plus, Edit2, Search, X, Menu,
  ChevronDown, ChevronUp, Archive, RotateCcw,
  Upload, FileText, GraduationCap, User, Phone, Mail,
  Music, Users, BookOpen, ClipboardList, Calendar, Trash2, LayoutGrid, List
} from 'lucide-react';
import { Modal } from './Modal';
import { InlineSubcategoryCreator } from './InlineSubcategoryCreator';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../utils/firebase';
import { useAuth } from '../context/AuthContext';

// --- Stable Input Component (must be outside component body to avoid remounting) ---
const InputField = React.memo(({ label, value, onChange, type = 'text', placeholder, required = false }: {
  label: string; value: string; onChange: (val: string) => void; type?: string; placeholder?: string; required?: boolean;
}) => (
  <div>
    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
    />
  </div>
));

// --- Stable Section Component (must be outside component body to avoid remounting) ---
const Section = React.memo(({ id, icon: Icon, title, children, badge, isExpanded, onToggle }: {
  id: string; icon: React.ElementType; title: string; children: React.ReactNode; badge?: number;
  isExpanded: boolean; onToggle: (id: string) => void;
}) => (
  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
    <button
      type="button"
      onClick={() => onToggle(id)}
      className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
        <Icon size={16} />
        <span>{title}</span>
        {badge !== undefined && badge > 0 && (
          <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs px-1.5 py-0.5 rounded-full">{badge}</span>
        )}
      </div>
      {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
    </button>
    {isExpanded && <div className="p-3 space-y-3">{children}</div>}
  </div>
));

// --- Helpers ---

const computeAge = (dob: string): number => {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

const computeIsMinor = (dob: string): boolean => computeAge(dob) < 18;

const createEmptyStudent = (orgId: string): Partial<Student> => ({
  fullName: '',
  dateOfBirth: '',
  isMinor: false,
  governmentalId: '',
  phone: '',
  email: '',
  guardians: [],
  assignments: [],
  pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
  notes: [],
  documents: [],
  profileStatus: 'ACTIVE',
  orgId,
});

const createEmptyGuardian = (): Guardian => ({
  id: generateId(),
  fullName: '',
  relationship: '',
  phone: '',
  email: '',
  address: '',
});

const createEmptyAssignment = (): StudentAssignment => ({
  id: generateId(),
  activityId: '',
  subcategoryId: '',
  staffMemberId: '',
  teachingAssignmentId: '',
  startDate: new Date().toISOString().split('T')[0],
  status: 'ACTIVE',
});

// --- Props ---

interface Props {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  activities: Activity[];
  setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
  events: CalendarEvent[];
  settings: AppSettings;
  onMobileMenuOpen: () => void;
}

export const StudentManager: React.FC<Props> = ({
  students, setStudents, teachers, setTeachers, activities, setActivities, events, settings, onMobileMenuOpen
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const { currentUser, orgId } = useAuth();

  // --- State ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Student>>({});
  const [initialFormData, setInitialFormData] = useState<Partial<Student>>({});
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [studentViewMode, setStudentViewMode] = useState<'grid' | 'list'>('grid');
  const [error, setError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [docLabel, setDocLabel] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    identity: true, contact: true, guardians: true,
    assignments: true, pedagogical: false, notes: false, documents: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Recital / Report Card form state ---
  const [recitalForm, setRecitalForm] = useState<Partial<RecitalEntry>>({});
  const [reportCardForm, setReportCardForm] = useState<Partial<ReportCard>>({});

  // --- Helpers ---

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const isDirty = JSON.stringify(formData) !== JSON.stringify(initialFormData);

  // --- Guardian Helpers ---
  const addGuardian = () => {
    setFormData(prev => ({ ...prev, guardians: [...(prev.guardians || []), createEmptyGuardian()] }));
  };

  const removeGuardian = (id: string) => {
    setFormData(prev => ({ ...prev, guardians: (prev.guardians || []).filter(g => g.id !== id) }));
  };

  const updateGuardian = (id: string, updates: Partial<Guardian>) => {
    setFormData(prev => ({
      ...prev,
      guardians: (prev.guardians || []).map(g => g.id === id ? { ...g, ...updates } : g),
    }));
  };

  // --- Assignment Helpers ---
  const addAssignment = () => {
    setFormData(prev => ({ ...prev, assignments: [...(prev.assignments || []), createEmptyAssignment()] }));
  };

  const removeAssignment = (id: string) => {
    setFormData(prev => ({ ...prev, assignments: (prev.assignments || []).filter(a => a.id !== id) }));
  };

  const updateAssignment = (id: string, updates: Partial<StudentAssignment>) => {
    setFormData(prev => ({
      ...prev,
      assignments: (prev.assignments || []).map(a => a.id === id ? { ...a, ...updates } : a),
    }));
  };

  // --- Get filtered Staff Members for an Activity + Subcategory ---
  const getMatchingStaffMembers = (activityId: string, subcategoryId: string) => {
    if (!activityId || !subcategoryId) return [];
    return teachers.filter(teacher => {
      if (teacher.isArchived) return false;
      return (teacher.teachingAssignments || []).some(ta =>
        !ta.isArchived &&
        ta.activityId === activityId &&
        ta.subcategoryId === subcategoryId
      );
    });
  };

  // --- Get matching Teaching Assignment ID for a Staff Member + Activity + Subcategory ---
  const getTeachingAssignmentId = (staffMemberId: string, activityId: string, subcategoryId: string): string => {
    const teacher = teachers.find(t => t.id === staffMemberId);
    if (!teacher) return '';
    const ta = (teacher.teachingAssignments || []).find(
      ta => !ta.isArchived && ta.activityId === activityId && ta.subcategoryId === subcategoryId
    );
    return ta?.id || '';
  };

  // --- Check if assignment is an Ensemble ---
  const isEnsembleAssignment = (staffMemberId: string, teachingAssignmentId: string): boolean => {
    const teacher = teachers.find(t => t.id === staffMemberId);
    if (!teacher) return false;
    const ta = (teacher.teachingAssignments || []).find(ta => ta.id === teachingAssignmentId);
    return ta?.isEnsemble || false;
  };

  // --- Note Helpers ---
  const addNote = () => {
    if (!noteInput.trim()) return;
    const newNote: Note = {
      id: generateId(),
      content: noteInput.trim(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.email || 'admin',
    };
    setFormData(prev => ({ ...prev, notes: [...(prev.notes || []), newNote] }));
    setNoteInput('');
  };

  const removeNote = (id: string) => {
    setFormData(prev => ({ ...prev, notes: (prev.notes || []).filter(n => n.id !== id) }));
  };

  // --- Document Helpers ---
  const handleDocumentUpload = async (file: File) => {
    if (!docLabel.trim()) return;
    try {
      const storageRef = ref(storage, `documents/${generateId()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const newDoc: StaffDocument = {
        id: generateId(),
        label: docLabel.trim(),
        url,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.email || 'admin',
      };
      setFormData(prev => ({ ...prev, documents: [...(prev.documents || []), newDoc] }));
      setDocLabel('');
    } catch (err) {
      console.error('Document upload failed:', err);
    }
  };

  const removeDocument = (id: string) => {
    setFormData(prev => ({ ...prev, documents: (prev.documents || []).filter(d => d.id !== id) }));
  };

  // --- Recital Entry Helpers ---
  const addRecitalEntry = () => {
    if (!recitalForm.date) return;
    const entry: RecitalEntry = {
      id: generateId(),
      date: recitalForm.date,
      title: recitalForm.title || '',
      repertoire: recitalForm.repertoire || '',
      notes: recitalForm.notes || '',
      loggedAt: new Date().toISOString(),
      loggedBy: currentUser?.email || 'admin',
    };
    setFormData(prev => {
      const record = prev.pedagogicalRecord || { lessonHistory: [], recitalHistory: [], reportCards: [] };
      return { ...prev, pedagogicalRecord: { ...record, recitalHistory: [...record.recitalHistory, entry] } };
    });
    setRecitalForm({});
  };

  const removeRecitalEntry = (id: string) => {
    setFormData(prev => {
      const record = prev.pedagogicalRecord || { lessonHistory: [], recitalHistory: [], reportCards: [] };
      return { ...prev, pedagogicalRecord: { ...record, recitalHistory: record.recitalHistory.filter(r => r.id !== id) } };
    });
  };

  // --- Report Card Helpers ---
  const addReportCard = () => {
    if (!reportCardForm.date || !reportCardForm.content) return;
    const entry: ReportCard = {
      id: generateId(),
      date: reportCardForm.date,
      content: reportCardForm.content,
      loggedAt: new Date().toISOString(),
      loggedBy: currentUser?.email || 'admin',
    };
    setFormData(prev => {
      const record = prev.pedagogicalRecord || { lessonHistory: [], recitalHistory: [], reportCards: [] };
      return { ...prev, pedagogicalRecord: { ...record, reportCards: [...record.reportCards, entry] } };
    });
    setReportCardForm({});
  };

  const removeReportCard = (id: string) => {
    setFormData(prev => {
      const record = prev.pedagogicalRecord || { lessonHistory: [], recitalHistory: [], reportCards: [] };
      return { ...prev, pedagogicalRecord: { ...record, reportCards: record.reportCards.filter(r => r.id !== id) } };
    });
  };

  // --- Lesson History (live query) ---
  const getLessonHistory = (studentId: string) => {
    return events.filter(e =>
      !e.isCanceled &&
      !e.isHidden &&
      ((e as any).studentId === studentId || ((e as any).studentIds || []).includes(studentId))
    ).sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  };

  // --- Ensemble Roster Management ---
  const addToEnsembleRoster = (teacherId: string, teachingAssignmentId: string, studentId: string) => {
    setTeachers(prev => prev.map(teacher => {
      if (teacher.id !== teacherId) return teacher;
      return {
        ...teacher,
        teachingAssignments: (teacher.teachingAssignments || []).map(ta => {
          if (ta.id !== teachingAssignmentId) return ta;
          const roster = ta.roster || [];
          if (roster.some(r => r.studentId === studentId)) return ta;
          return {
            ...ta,
            roster: [...roster, { studentId, joinedAt: new Date().toISOString(), isArchived: false }],
          };
        }),
      };
    }));
  };

  const removeFromEnsembleRoster = (teacherId: string, teachingAssignmentId: string, studentId: string) => {
    setTeachers(prev => prev.map(teacher => {
      if (teacher.id !== teacherId) return teacher;
      return {
        ...teacher,
        teachingAssignments: (teacher.teachingAssignments || []).map(ta => {
          if (ta.id !== teachingAssignmentId) return ta;
          return {
            ...ta,
            roster: (ta.roster || []).filter(r => r.studentId !== studentId),
          };
        }),
      };
    }));
  };

  // --- CRUD ---

  const handleOpenModal = (student?: Student) => {
    setError(null);
    setNoteInput('');
    setDocLabel('');
    setRecitalForm({});
    setReportCardForm({});
    if (student) {
      setEditingId(student.id);
      const data = {
        ...student,
        guardians: student.guardians || [],
        assignments: student.assignments || [],
        pedagogicalRecord: student.pedagogicalRecord || { lessonHistory: [], recitalHistory: [], reportCards: [] },
        notes: student.notes || [],
        documents: student.documents || [],
      };
      setFormData(data);
      setInitialFormData(data);
    } else {
      setEditingId(null);
      const data = createEmptyStudent(orgId || '');
      setFormData(data);
      setInitialFormData(data);
    }
    setExpandedSections({
      identity: true, contact: true, guardians: true,
      assignments: true, pedagogical: false, notes: false, documents: false,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.fullName?.trim()) {
      setError(t('student.err_name_required'));
      return;
    }
    if (!formData.dateOfBirth) {
      setError(t('student.err_dob_required'));
      return;
    }

    const isMinor = computeIsMinor(formData.dateOfBirth);
    const now = new Date().toISOString();

    if (editingId) {
      setStudents(prev => prev.map(s => {
        if (s.id !== editingId) return s;
        return {
          ...s,
          ...formData,
          isMinor,
          updatedAt: now,
        } as Student;
      }));

      // Handle ensemble roster sync for assignments
      syncEnsembleRosters(editingId, formData.assignments || []);
    } else {
      const newStudent: Student = {
        id: generateId(),
        orgId: orgId || '',
        fullName: formData.fullName!.trim(),
        dateOfBirth: formData.dateOfBirth,
        isMinor,
        currentGrade: isMinor ? formData.currentGrade : undefined,
        governmentalId: formData.governmentalId || '',
        phone: !isMinor ? formData.phone || '' : '',
        email: !isMinor ? formData.email || '' : '',
        guardians: isMinor ? (formData.guardians || []) : [],
        assignments: formData.assignments || [],
        pedagogicalRecord: formData.pedagogicalRecord || { lessonHistory: [], recitalHistory: [], reportCards: [] },
        notes: formData.notes || [],
        documents: formData.documents || [],
        profileStatus: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };
      setStudents(prev => [...prev, newStudent]);

      // Sync ensemble rosters for new student
      syncEnsembleRosters(newStudent.id, newStudent.assignments);
    }
    setIsModalOpen(false);
  };

  // Sync ensemble rosters when saving student
  const syncEnsembleRosters = (studentId: string, assignments: StudentAssignment[]) => {
    assignments.forEach(assignment => {
      if (assignment.status !== 'ACTIVE') return;
      if (isEnsembleAssignment(assignment.staffMemberId, assignment.teachingAssignmentId)) {
        addToEnsembleRoster(assignment.staffMemberId, assignment.teachingAssignmentId, studentId);
      }
    });
  };

  const handleArchive = (studentId: string) => {
    if (!window.confirm(t('student.confirm_archive'))) return;
    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, profileStatus: 'ARCHIVED' as const, updatedAt: new Date().toISOString() } : s
    ));
    // Remove from ensemble rosters
    const student = students.find(s => s.id === studentId);
    if (student) {
      student.assignments.forEach(a => {
        if (isEnsembleAssignment(a.staffMemberId, a.teachingAssignmentId)) {
          removeFromEnsembleRoster(a.staffMemberId, a.teachingAssignmentId, studentId);
        }
      });
    }
  };

  const handleRestore = (studentId: string) => {
    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, profileStatus: 'ACTIVE' as const, updatedAt: new Date().toISOString() } : s
    ));
  };

  // Handle inline subcategory creation
  const handleSubcategoryCreated = (activityId: string, newSubcategory: { id: string; name: string; isArchived: boolean }) => {
    setActivities(prev => prev.map(a =>
      a.id === activityId ? { ...a, subcategories: [...a.subcategories, newSubcategory] } : a
    ));
  };

  // --- Filtering ---
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (!showArchived && s.profileStatus === 'ARCHIVED') return false;
      if (showArchived && s.profileStatus !== 'ARCHIVED') return false;
      if (search) {
        const q = search.toLowerCase();
        return s.fullName.toLowerCase().includes(q) ||
          (s.governmentalId || '').toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [students, search, showArchived]);

  // --- Resolution Helpers (for display) ---
  const getActivityName = (id: string) => activities.find(a => a.id === id)?.name || id;
  const getSubcategoryName = (activityId: string, subcategoryId: string) => {
    const activity = activities.find(a => a.id === activityId);
    return activity?.subcategories.find(s => s.id === subcategoryId)?.name || subcategoryId;
  };
  const getStaffMemberName = (id: string) => teachers.find(t => t.id === id)?.fullName || id;

  // ====================================
  // RENDER
  // ====================================

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <button onClick={onMobileMenuOpen} className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
              <Menu size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <GraduationCap size={28} className="text-blue-600" />
                {t('student.title')}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('student.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm"
          >
            <Plus size={18} />
            {t('student.add')}
          </button>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('student.search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full ps-10 pe-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              showArchived
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Archive size={16} />
            {t('student.show_archived')}
          </button>
          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setStudentViewMode('grid')}
              className={`p-2 transition-colors ${studentViewMode === 'grid' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title={t('view.grid')}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setStudentViewMode('list')}
              className={`p-2 transition-colors ${studentViewMode === 'list' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title={t('view.list')}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Student List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <GraduationCap size={48} className="mx-auto mb-3 opacity-50" />
            <p className="font-medium">{search ? t('student.no_results') : t('student.empty_state')}</p>
          </div>
        ) : studentViewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredStudents.map(student => {
              const age = student.dateOfBirth ? computeAge(student.dateOfBirth) : null;
              const activeAssignments = student.assignments.filter(a => a.status === 'ACTIVE');

              return (
                <div
                  key={student.id}
                  className={`bg-white dark:bg-slate-800 rounded-xl border ${
                    student.profileStatus === 'ARCHIVED'
                      ? 'border-amber-300 dark:border-amber-700 opacity-75'
                      : 'border-slate-200 dark:border-slate-700'
                  } shadow-sm hover:shadow-md transition-shadow p-4 cursor-pointer relative`}
                  onClick={() => handleOpenModal(student)}
                >
                  {student.profileStatus === 'ARCHIVED' && (
                    <div className="absolute top-2 end-2 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {t('student.archived_badge')}
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm shrink-0">
                      {student.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 dark:text-white truncate">{student.fullName}</h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {age !== null && <span>{age} {t('student.years_old')}</span>}
                        {student.isMinor && (
                          <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full font-medium">
                            {t('student.minor')}
                          </span>
                        )}
                        {student.currentGrade !== undefined && student.currentGrade !== null && (
                          <span className="text-slate-400">
                            {t('student.grade')} {student.currentGrade}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {activeAssignments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {activeAssignments.slice(0, 3).map(a => (
                        <span key={a.id} className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] px-2 py-0.5 rounded-full">
                          {getSubcategoryName(a.activityId, a.subcategoryId)}
                        </span>
                      ))}
                      {activeAssignments.length > 3 && (
                        <span className="text-slate-400 text-[11px] px-1">+{activeAssignments.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Quick actions */}
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-1">
                    {student.profileStatus === 'ACTIVE' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleArchive(student.id); }}
                        className="text-slate-400 hover:text-amber-600 p-1 rounded transition-colors"
                        title={t('student.archive')}
                      >
                        <Archive size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRestore(student.id); }}
                        className="text-slate-400 hover:text-green-600 p-1 rounded transition-colors"
                        title={t('student.restore')}
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-start px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">{t('student.full_name')}</th>
                  <th className="text-start px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hidden md:table-cell">{t('student.age')}</th>
                  <th className="text-start px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hidden lg:table-cell">{t('student.section_assignments')}</th>
                  <th className="text-end px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">{t('btn.edit')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map(student => {
                  const age = student.dateOfBirth ? computeAge(student.dateOfBirth) : null;
                  const activeAssignments = student.assignments.filter(a => a.status === 'ACTIVE');
                  return (
                    <tr key={student.id} className={`border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer ${student.profileStatus === 'ARCHIVED' ? 'opacity-60' : ''}`} onClick={() => handleOpenModal(student)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs flex-shrink-0">
                            {student.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">{student.fullName}</div>
                            {student.isMinor && <span className="text-[10px] text-purple-600 dark:text-purple-400">{t('student.minor')}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden md:table-cell">
                        {age !== null ? `${age}` : '—'}
                        {student.currentGrade ? ` / ${t('student.grade')} ${student.currentGrade}` : ''}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {activeAssignments.slice(0, 3).map(a => (
                            <span key={a.id} className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] px-2 py-0.5 rounded-full">
                              {getSubcategoryName(a.activityId, a.subcategoryId)}
                            </span>
                          ))}
                          {activeAssignments.length > 3 && <span className="text-slate-400 text-[11px]">+{activeAssignments.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleOpenModal(student); }} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title={t('btn.edit')}>
                            <Edit2 size={14} />
                          </button>
                          {student.profileStatus === 'ACTIVE' ? (
                            <button onClick={(e) => { e.stopPropagation(); handleArchive(student.id); }} className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors" title={t('student.archive')}>
                              <Archive size={14} />
                            </button>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); handleRestore(student.id); }} className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors" title={t('student.restore')}>
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? t('student.edit') : t('student.add_new')}
        isDirty={isDirty}
        onSave={handleSubmit as any}
        maxWidth="max-w-3xl"
        t={t}
        footerContent={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('btn.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmit as any}
              className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-6 py-2.5 rounded-xl font-semibold text-sm"
            >
              {t('btn.save')}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          {/* Identity Section */}
          <Section id="identity" icon={User} title={t('student.section_identity')} isExpanded={!!expandedSections['identity']} onToggle={toggleSection}>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <InputField
                  label={t('student.full_name')}
                  value={formData.fullName || ''}
                  onChange={val => setFormData(prev => ({ ...prev, fullName: val }))}
                  required
                  placeholder={t('student.full_name_placeholder')}
                />
              </div>
              <div>
                <InputField
                  label={t('student.date_of_birth')}
                  value={formData.dateOfBirth || ''}
                  onChange={val => {
                    const isMinor = val ? computeIsMinor(val) : false;
                    setFormData(prev => ({ ...prev, dateOfBirth: val, isMinor }));
                  }}
                  type="date"
                  required
                />
                {formData.dateOfBirth && (
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-slate-500">
                      {t('student.age')}: {computeAge(formData.dateOfBirth)}
                    </span>
                    {computeIsMinor(formData.dateOfBirth) ? (
                      <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full font-medium">
                        {t('student.minor')}
                      </span>
                    ) : (
                      <span className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                        {t('student.adult')}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {formData.dateOfBirth && computeIsMinor(formData.dateOfBirth) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.current_grade')}</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={formData.currentGrade ?? ''}
                    onChange={e => setFormData(prev => ({ ...prev, currentGrade: e.target.value ? parseInt(e.target.value) : undefined }))}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder={t('student.grade_placeholder')}
                  />
                </div>
              )}
              <div className={formData.dateOfBirth && computeIsMinor(formData.dateOfBirth) ? '' : 'col-span-1'}>
                <InputField
                  label={t('student.governmental_id')}
                  value={formData.governmentalId || ''}
                  onChange={val => setFormData(prev => ({ ...prev, governmentalId: val }))}
                  placeholder={t('student.governmental_id_placeholder')}
                />
              </div>
            </div>
          </Section>

          {/* Contact Section (Adults Only) */}
          {formData.dateOfBirth && !computeIsMinor(formData.dateOfBirth) && (
            <Section id="contact" icon={Phone} title={t('student.section_contact')} isExpanded={!!expandedSections['contact']} onToggle={toggleSection}>
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label={t('student.phone')}
                  value={formData.phone || ''}
                  onChange={val => setFormData(prev => ({ ...prev, phone: val }))}
                  type="tel"
                />
                <InputField
                  label={t('student.email')}
                  value={formData.email || ''}
                  onChange={val => setFormData(prev => ({ ...prev, email: val }))}
                  type="email"
                />
              </div>
            </Section>
          )}

          {/* Guardians Section (Minors Only) */}
          {formData.dateOfBirth && computeIsMinor(formData.dateOfBirth) && (
            <Section id="guardians" icon={Users} title={t('student.section_guardians')} badge={(formData.guardians || []).length} isExpanded={!!expandedSections['guardians']} onToggle={toggleSection}>
              {(formData.guardians || []).map((guardian, idx) => (
                <div key={guardian.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500">{t('student.guardian')} {idx + 1}</span>
                    <button type="button" onClick={() => removeGuardian(guardian.id)} className="text-red-400 hover:text-red-600 p-0.5">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <InputField
                      label={t('student.guardian_name')}
                      value={guardian.fullName}
                      onChange={val => updateGuardian(guardian.id, { fullName: val })}
                    />
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.guardian_relationship')}</label>
                      <select
                        value={guardian.relationship || ''}
                        onChange={e => updateGuardian(guardian.id, { relationship: e.target.value })}
                        className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">{t('student.select_relationship')}</option>
                        <option value="Mother">{t('student.rel_mother')}</option>
                        <option value="Father">{t('student.rel_father')}</option>
                        <option value="Guardian">{t('student.rel_guardian')}</option>
                        <option value="Other">{t('student.rel_other')}</option>
                      </select>
                    </div>
                    <InputField
                      label={t('student.guardian_phone')}
                      value={guardian.phone || ''}
                      onChange={val => updateGuardian(guardian.id, { phone: val })}
                      type="tel"
                    />
                    <InputField
                      label={t('student.guardian_email')}
                      value={guardian.email || ''}
                      onChange={val => updateGuardian(guardian.id, { email: val })}
                      type="email"
                    />
                    <div className="col-span-2">
                      <InputField
                        label={t('student.guardian_address')}
                        value={guardian.address || ''}
                        onChange={val => updateGuardian(guardian.id, { address: val })}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addGuardian}
                className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium"
              >
                <Plus size={14} /> {t('student.add_guardian')}
              </button>
            </Section>
          )}

          {/* Student Assignments Section */}
          <Section id="assignments" icon={Music} title={t('student.section_assignments')} badge={(formData.assignments || []).filter(a => a.status === 'ACTIVE').length} isExpanded={!!expandedSections['assignments']} onToggle={toggleSection}>
            {(formData.assignments || []).map((assignment, idx) => {
              const selectedActivity = activities.find(a => a.id === assignment.activityId);
              const matchingStaff = getMatchingStaffMembers(assignment.activityId, assignment.subcategoryId);
              const isEnsemble = assignment.staffMemberId && assignment.teachingAssignmentId
                ? isEnsembleAssignment(assignment.staffMemberId, assignment.teachingAssignmentId)
                : false;

              return (
                <div key={assignment.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 relative">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">{t('student.assignment')} {idx + 1}</span>
                      {assignment.status === 'ARCHIVED' && (
                        <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-600 text-[10px] px-1.5 py-0.5 rounded-full">{t('student.archived_badge')}</span>
                      )}
                      {isEnsemble && (
                        <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium">{t('student.ensemble')}</span>
                      )}
                    </div>
                    <button type="button" onClick={() => removeAssignment(assignment.id)} className="text-red-400 hover:text-red-600 p-0.5">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Activity Dropdown */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.activity')}</label>
                    <select
                      value={assignment.activityId}
                      onChange={e => updateAssignment(assignment.id, {
                        activityId: e.target.value,
                        subcategoryId: '',
                        staffMemberId: '',
                        teachingAssignmentId: '',
                      })}
                      className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">{t('student.select_activity')}</option>
                      {activities.filter(a => !a.isArchived).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Subcategory Dropdown (cascading) */}
                  {assignment.activityId && selectedActivity && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.subcategory')}</label>
                      <InlineSubcategoryCreator
                        activity={selectedActivity}
                        onSubcategoryCreated={handleSubcategoryCreated}
                        t={t}
                        selectedSubcategoryId={assignment.subcategoryId}
                        onSelect={val => updateAssignment(assignment.id, {
                          subcategoryId: val,
                          staffMemberId: '',
                          teachingAssignmentId: '',
                        })}
                      />
                    </div>
                  )}

                  {/* Staff Member Dropdown (filtered by matching Teaching Assignment) */}
                  {assignment.activityId && assignment.subcategoryId && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{t('student.staff_member')}</label>
                      {matchingStaff.length === 0 ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400 italic">{t('student.no_matching_staff')}</p>
                      ) : (
                        <select
                          value={assignment.staffMemberId}
                          onChange={e => {
                            const staffId = e.target.value;
                            const taId = getTeachingAssignmentId(staffId, assignment.activityId, assignment.subcategoryId);
                            updateAssignment(assignment.id, {
                              staffMemberId: staffId,
                              teachingAssignmentId: taId,
                            });
                          }}
                          className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="">{t('student.select_staff_member')}</option>
                          {matchingStaff.map(sm => (
                            <option key={sm.id} value={sm.id}>{sm.fullName}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Start Date */}
                  <div className="grid grid-cols-2 gap-2">
                    <InputField
                      label={t('student.assignment_start_date')}
                      value={assignment.startDate || ''}
                      onChange={val => updateAssignment(assignment.id, { startDate: val })}
                      type="date"
                    />
                    <InputField
                      label={t('student.assignment_end_date')}
                      value={assignment.endDate || ''}
                      onChange={val => updateAssignment(assignment.id, { endDate: val || undefined })}
                      type="date"
                    />
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addAssignment}
              className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium"
            >
              <Plus size={14} /> {t('student.add_assignment')}
            </button>
          </Section>

          {/* Pedagogical Record Section */}
          <Section id="pedagogical" icon={BookOpen} title={t('student.section_pedagogical')} isExpanded={!!expandedSections['pedagogical']} onToggle={toggleSection}>
            {/* Lesson History (Live Query — read-only) */}
            {editingId && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                  <Calendar size={14} /> {t('student.lesson_history')}
                </h4>
                {(() => {
                  const lessons = getLessonHistory(editingId);
                  if (lessons.length === 0) return <p className="text-xs text-slate-400 italic">{t('student.no_lessons')}</p>;
                  return (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {lessons.slice(0, 20).map(lesson => (
                        <div key={lesson.id} className="flex items-center justify-between text-xs py-1 px-2 bg-slate-50 dark:bg-slate-800 rounded">
                          <span className="text-slate-700 dark:text-slate-300">{lesson.name}</span>
                          <span className="text-slate-400">{new Date(lesson.start).toLocaleDateString()}</span>
                        </div>
                      ))}
                      {lessons.length > 20 && <p className="text-[11px] text-slate-400 text-center">{t('student.more_lessons').replace('{count}', String(lessons.length - 20))}</p>}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Recital History (Manual) */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                <Music size={14} /> {t('student.recital_history')}
              </h4>
              {(formData.pedagogicalRecord?.recitalHistory || []).map(entry => (
                <div key={entry.id} className="flex items-start justify-between text-xs py-1.5 px-2 bg-slate-50 dark:bg-slate-800 rounded mb-1">
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{entry.title || t('student.untitled_recital')}</span>
                    <span className="text-slate-400 ms-2">{entry.date}</span>
                    {entry.repertoire && <p className="text-slate-500 mt-0.5">{entry.repertoire}</p>}
                  </div>
                  <button type="button" onClick={() => removeRecitalEntry(entry.id)} className="text-red-400 hover:text-red-600 p-0.5 shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              {/* Add Recital Form */}
              <div className="mt-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={recitalForm.date || ''}
                    onChange={e => setRecitalForm({ ...recitalForm, date: e.target.value })}
                    className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t('student.recital_date')}
                  />
                  <input
                    type="text"
                    value={recitalForm.title || ''}
                    onChange={e => setRecitalForm({ ...recitalForm, title: e.target.value })}
                    className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t('student.recital_title')}
                  />
                </div>
                <input
                  type="text"
                  value={recitalForm.repertoire || ''}
                  onChange={e => setRecitalForm({ ...recitalForm, repertoire: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('student.recital_repertoire')}
                />
                <button
                  type="button"
                  onClick={addRecitalEntry}
                  disabled={!recitalForm.date}
                  className="text-xs text-blue-600 dark:text-blue-400 font-medium disabled:opacity-40 flex items-center gap-1"
                >
                  <Plus size={12} /> {t('student.add_recital')}
                </button>
              </div>
            </div>

            {/* Report Cards (Manual) */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                <ClipboardList size={14} /> {t('student.report_cards')}
              </h4>
              {(formData.pedagogicalRecord?.reportCards || []).map(entry => (
                <div key={entry.id} className="flex items-start justify-between text-xs py-1.5 px-2 bg-slate-50 dark:bg-slate-800 rounded mb-1">
                  <div>
                    <span className="text-slate-400">{entry.date}</span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">{entry.content}</p>
                  </div>
                  <button type="button" onClick={() => removeReportCard(entry.id)} className="text-red-400 hover:text-red-600 p-0.5 shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              {/* Add Report Card Form */}
              <div className="mt-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-2 space-y-2">
                <input
                  type="date"
                  value={reportCardForm.date || ''}
                  onChange={e => setReportCardForm({ ...reportCardForm, date: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
                <textarea
                  value={reportCardForm.content || ''}
                  onChange={e => setReportCardForm({ ...reportCardForm, content: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                  placeholder={t('student.report_card_content')}
                />
                <button
                  type="button"
                  onClick={addReportCard}
                  disabled={!reportCardForm.date || !reportCardForm.content}
                  className="text-xs text-blue-600 dark:text-blue-400 font-medium disabled:opacity-40 flex items-center gap-1"
                >
                  <Plus size={12} /> {t('student.add_report_card')}
                </button>
              </div>
            </div>
          </Section>

          {/* Notes Section */}
          <Section id="notes" icon={FileText} title={t('student.section_notes')} badge={(formData.notes || []).length} isExpanded={!!expandedSections['notes']} onToggle={toggleSection}>
            {(formData.notes || []).map(note => (
              <div key={note.id} className="flex items-start justify-between bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{note.content}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(note.createdAt).toLocaleString()} — {note.createdBy}</p>
                </div>
                <button type="button" onClick={() => removeNote(note.id)} className="text-red-400 hover:text-red-600 p-0.5 ms-2 shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                type="text"
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }}
                placeholder={t('student.add_note_placeholder')}
                className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addNote}
                disabled={!noteInput.trim()}
                className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft px-3 py-2 rounded-lg"
              >
                <Plus size={16} />
              </button>
            </div>
          </Section>

          {/* Documents Section */}
          <Section id="documents" icon={Upload} title={t('student.section_documents')} badge={(formData.documents || []).length} isExpanded={!!expandedSections['documents']} onToggle={toggleSection}>
            {(formData.documents || []).map(doc => (
              <div key={doc.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline min-w-0">
                  <FileText size={14} className="shrink-0" />
                  <span className="truncate">{doc.label}</span>
                </a>
                <button type="button" onClick={() => removeDocument(doc.id)} className="text-red-400 hover:text-red-600 p-0.5 ms-2 shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <input
                  type="text"
                  value={docLabel}
                  onChange={e => setDocLabel(e.target.value)}
                  placeholder={t('student.doc_label_placeholder')}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!docLabel.trim()}
                className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft px-3 py-2 rounded-lg"
              >
                <Upload size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleDocumentUpload(file);
                  e.target.value = '';
                }}
              />
            </div>
          </Section>
        </form>
      </Modal>
    </div>
  );
};
