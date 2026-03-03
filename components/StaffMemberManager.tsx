import React, { useState, useRef } from 'react';
import {
  Teacher, ListsState, PositionAssignment, RateType, AppSettings, Activity,
  PositionTitleAssignment, TeachingAssignment, Credential, Note, StaffDocument,
  HoursReport, Student, AdminInboxItem
} from '../types';
import { generateId, COLORS, INITIAL_LISTS, TRANSLATIONS } from '../constants';
import {
  Plus, Edit2, Trash2, Search, Palette, X, Menu,
  DollarSign, Clock, ChevronDown, ChevronUp, Archive, RotateCcw,
  Upload, FileText, GraduationCap, Music, Briefcase, User, Phone, Mail, Tag,
  ClipboardList, Copy, Check, Link2
} from 'lucide-react';
import { Modal } from './Modal';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../utils/firebase';
import { useAuth } from '../context/AuthContext';

// Helper to create a new empty position assignment
const createEmptyAssignment = (): PositionAssignment => ({
  id: generateId(),
  positionName: '',
  category: 'Individual Lesson',
  rateType: 'HOURLY',
  rateValue: 0,
});

interface Props {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  lists: ListsState;
  setLists: React.Dispatch<React.SetStateAction<ListsState>>;
  activities: Activity[];
  settings: AppSettings;
  hoursReports: HoursReport[];
  setHoursReports: React.Dispatch<React.SetStateAction<HoursReport[]>>;
  students: Student[];
  adminInboxItems: AdminInboxItem[];
  setAdminInboxItems: React.Dispatch<React.SetStateAction<AdminInboxItem[]>>;
  onMobileMenuOpen: () => void;
}

export const StaffMemberManager: React.FC<Props> = ({
  teachers, setTeachers, lists, setLists, activities, settings, hoursReports, setHoursReports, students, adminInboxItems, setAdminInboxItems, onMobileMenuOpen
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const { currentUser } = useAuth();
  const activeLists = lists || INITIAL_LISTS;

  // --- State ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Teacher>>({});
  const [initialFormData, setInitialFormData] = useState<Partial<Teacher>>({});
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [docLabel, setDocLabel] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    identity: true, contact: true, position_assignments: true,
    position_titles: false, teaching_assignments: false, tags: true,
    credentials: false, notes: false, documents: false, google_calendar: false, bio: false,
    hours_reports: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effective Date Prompt State ---
  const [effectiveDatePrompt, setEffectiveDatePrompt] = useState<{
    assignmentId: string;
    updates: Partial<TeachingAssignment>;
  } | null>(null);
  const [effectiveDate, setEffectiveDate] = useState('');

  // --- Hours Report State ---
  const [hrPeriodStart, setHrPeriodStart] = useState('');
  const [hrPeriodEnd, setHrPeriodEnd] = useState('');
  const [hrCopiedId, setHrCopiedId] = useState<string | null>(null);

  const generateHoursReportLink = (staffMemberId: string) => {
    if (!hrPeriodStart || !hrPeriodEnd) return;
    const token = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${generateId()}${generateId()}${generateId()}`;
    const report: HoursReport = {
      id: generateId(),
      orgId: currentUser?.orgId || '',
      staffMemberId,
      token,
      periodStart: hrPeriodStart,
      periodEnd: hrPeriodEnd,
      status: 'PENDING',
      createdBy: currentUser?.email || '',
      createdAt: new Date().toISOString(),
    };
    setHoursReports(prev => [...prev, report]);
    setHrPeriodStart('');
    setHrPeriodEnd('');
  };

  const copyReportLink = (token: string) => {
    const url = `${window.location.origin}/report/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setHrCopiedId(token);
      setTimeout(() => setHrCopiedId(null), 2000);
    }).catch(() => {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setHrCopiedId(token);
      setTimeout(() => setHrCopiedId(null), 2000);
    });
  };

  // --- Helpers ---

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const syncPositionsFromAssignments = (assignments: PositionAssignment[]): string[] => {
    return assignments.map(pa => pa.positionName).filter(name => name.trim() !== '');
  };

  // --- Position Assignment Helpers ---
  const addPositionAssignment = () => {
    const newAssignments = [...(formData.positionAssignments || []), createEmptyAssignment()];
    setFormData({
      ...formData,
      positionAssignments: newAssignments,
      positions: syncPositionsFromAssignments(newAssignments),
    });
  };

  const removePositionAssignment = (assignmentId: string) => {
    const newAssignments = (formData.positionAssignments || []).filter(pa => pa.id !== assignmentId);
    setFormData({
      ...formData,
      positionAssignments: newAssignments,
      positions: syncPositionsFromAssignments(newAssignments),
    });
  };

  const updatePositionAssignment = (assignmentId: string, updates: Partial<PositionAssignment>) => {
    const newAssignments = (formData.positionAssignments || []).map(pa =>
      pa.id === assignmentId ? { ...pa, ...updates } : pa
    );
    setFormData({
      ...formData,
      positionAssignments: newAssignments,
      positions: syncPositionsFromAssignments(newAssignments),
    });
  };

  // --- Position Title Helpers ---
  const addPositionTitle = () => {
    const newPT: PositionTitleAssignment = {
      id: generateId(),
      positionTitle: '',
      isArchived: false,
    };
    setFormData({ ...formData, positionTitles: [...(formData.positionTitles || []), newPT] });
  };

  const removePositionTitle = (id: string) => {
    setFormData({ ...formData, positionTitles: (formData.positionTitles || []).filter(pt => pt.id !== id) });
  };

  const updatePositionTitle = (id: string, updates: Partial<PositionTitleAssignment>) => {
    setFormData({
      ...formData,
      positionTitles: (formData.positionTitles || []).map(pt => pt.id === id ? { ...pt, ...updates } : pt),
    });
  };

  // --- Teaching Assignment Helpers ---
  const addTeachingAssignment = () => {
    const newTA: TeachingAssignment = {
      id: generateId(),
      activityId: '',
      subcategoryId: '',
      isEnsemble: false,
      isArchived: false,
    };
    setFormData({ ...formData, teachingAssignments: [...(formData.teachingAssignments || []), newTA] });
  };

  const removeTeachingAssignment = (id: string) => {
    setFormData({ ...formData, teachingAssignments: (formData.teachingAssignments || []).filter(ta => ta.id !== id) });
  };

  const handleTeachingAssignmentEdit = (id: string, updates: Partial<TeachingAssignment>) => {
    // If editing an existing assignment (has a startDate already set), trigger effective date prompt
    const existing = (formData.teachingAssignments || []).find(ta => ta.id === id);
    if (existing && existing.startDate && editingId) {
      setEffectiveDatePrompt({ assignmentId: id, updates });
      setEffectiveDate(new Date().toISOString().split('T')[0]);
      return;
    }
    // New assignment or no effective dating needed
    setFormData({
      ...formData,
      teachingAssignments: (formData.teachingAssignments || []).map(ta =>
        ta.id === id ? { ...ta, ...updates } : ta
      ),
    });
  };

  const confirmEffectiveDateEdit = () => {
    if (!effectiveDatePrompt || !effectiveDate) return;
    const { assignmentId, updates } = effectiveDatePrompt;

    // Close old version by setting endDate, create new version with updates
    const assignments = formData.teachingAssignments || [];
    const oldAssignment = assignments.find(ta => ta.id === assignmentId);
    if (!oldAssignment) return;

    const closedOld = { ...oldAssignment, endDate: effectiveDate };
    const newVersion: TeachingAssignment = {
      ...oldAssignment,
      ...updates,
      id: generateId(),
      startDate: effectiveDate,
      endDate: undefined,
    };

    setFormData({
      ...formData,
      teachingAssignments: assignments.map(ta => ta.id === assignmentId ? closedOld : ta).concat(newVersion),
    });
    setEffectiveDatePrompt(null);
    setEffectiveDate('');
  };

  // --- Credential Helpers ---
  const addCredential = () => {
    const newCred: Credential = { id: generateId() };
    setFormData({ ...formData, credentials: [...(formData.credentials || []), newCred] });
  };

  const removeCredential = (id: string) => {
    setFormData({ ...formData, credentials: (formData.credentials || []).filter(c => c.id !== id) });
  };

  const updateCredential = (id: string, updates: Partial<Credential>) => {
    setFormData({
      ...formData,
      credentials: (formData.credentials || []).map(c => c.id === id ? { ...c, ...updates } : c),
    });
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
    setFormData({ ...formData, notes: [...(formData.notes || []), newNote] });
    setNoteInput('');
  };

  const removeNote = (id: string) => {
    setFormData({ ...formData, notes: (formData.notes || []).filter(n => n.id !== id) });
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
      setFormData({ ...formData, documents: [...(formData.documents || []), newDoc] });
      setDocLabel('');
    } catch (err) {
      console.error('Document upload failed:', err);
    }
  };

  const removeDocument = (id: string) => {
    setFormData({ ...formData, documents: (formData.documents || []).filter(d => d.id !== id) });
  };

  // --- Tag Helpers ---
  const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !tagInput.trim()) return;
    e.preventDefault();
    if (formData.tags && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...(formData.tags || []), tagInput.trim()] });
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags?.filter(t => t !== tagToRemove) });
  };

  // --- CRUD ---

  const handleOpenModal = (teacher?: Teacher) => {
    setError(null);
    setNoteInput('');
    setDocLabel('');
    setTagInput('');
    if (teacher) {
      setEditingId(teacher.id);
      const data = {
        ...teacher,
        positionAssignments: teacher.positionAssignments || [],
        positionTitles: teacher.positionTitles || [],
        teachingAssignments: teacher.teachingAssignments || [],
        credentials: teacher.credentials || [],
        notes: teacher.notes || [],
        documents: teacher.documents || [],
      };
      setFormData(data);
      setInitialFormData(data);
    } else {
      setEditingId(null);
      const usedColors = teachers.map(t => t.color);
      const availableColor = COLORS.find(c => !usedColors.includes(c)) || COLORS[0];
      const data: Partial<Teacher> = {
        fullName: '',
        positions: [],
        positionAssignments: [createEmptyAssignment()],
        tags: [],
        phone: '',
        email: '',
        color: availableColor,
        positionTitles: [],
        teachingAssignments: [],
        credentials: [],
        notes: [],
        documents: [],
        isArchived: false,
      };
      setFormData(data);
      setInitialFormData(data);
    }
    setExpandedSections({
      identity: true, contact: true, position_assignments: true,
      position_titles: false, teaching_assignments: false, tags: true,
      credentials: false, notes: false, documents: false, google_calendar: false, bio: false,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.fullName || !formData.color) return;

    const validAssignments = (formData.positionAssignments || []).filter(pa => pa.positionName.trim() !== '');
    if (validAssignments.length === 0) {
      setError(t('teach.err_no_position'));
      return;
    }

    const colorTaken = teachers.some(t =>
      t.color.toLowerCase() === formData.color!.toLowerCase() && t.id !== editingId
    );
    if (colorTaken) {
      setError(t('teach.err_color_taken'));
      return;
    }

    const finalPositions = syncPositionsFromAssignments(validAssignments);

    if (editingId) {
      setTeachers(prev => prev.map(t => t.id === editingId ? {
        ...t,
        ...formData,
        positionAssignments: validAssignments,
        positions: finalPositions,
      } as Teacher : t));
    } else {
      const newStaff: Teacher = {
        id: generateId(),
        fullName: formData.fullName!,
        positions: finalPositions,
        positionAssignments: validAssignments,
        tags: formData.tags || [],
        phone: formData.phone || '',
        email: formData.email || '',
        color: formData.color!,
        dateOfBirth: formData.dateOfBirth,
        dateOfJoining: formData.dateOfJoining,
        governmentalId: formData.governmentalId,
        employmentType: formData.employmentType,
        positionTitles: formData.positionTitles || [],
        teachingAssignments: formData.teachingAssignments || [],
        credentials: formData.credentials || [],
        bio: formData.bio,
        googleCalendarSyncEnabled: formData.googleCalendarSyncEnabled,
        googleCalendarId: formData.googleCalendarId,
        notes: formData.notes || [],
        documents: formData.documents || [],
        isArchived: false,
      };
      setTeachers(prev => [...prev, newStaff]);
    }

    // Auto-populate new positions into lists
    const allPositions = new Set(activeLists.positions || []);
    let changed = false;
    finalPositions.forEach(p => {
      if (p && !allPositions.has(p)) {
        allPositions.add(p);
        changed = true;
      }
    });
    if (changed) {
      setLists(prev => ({ ...prev, positions: Array.from(allPositions) }));
    }

    setIsModalOpen(false);
  };

  const handleArchiveToggle = (id: string) => {
    const staff = teachers.find(t => t.id === id);
    if (!staff) return;
    const newArchived = !staff.isArchived;
    const msg = newArchived ? t('staff.confirm_archive') : t('staff.confirm_restore');
    if (window.confirm(msg)) {
      setTeachers(prev => prev.map(t => t.id === id ? { ...t, isArchived: newArchived } : t));

      // When archiving, check for active student assignments and create inbox task
      if (newArchived) {
        const affectedStudentIds = students
          .filter(s => s.profileStatus !== 'ARCHIVED' && s.assignments?.some(
            a => a.staffMemberId === id && a.status === 'ACTIVE'
          ))
          .map(s => s.id);

        if (affectedStudentIds.length > 0) {
          const task: AdminInboxItem = {
            id: generateId(),
            orgId: '',
            type: 'TASK',
            status: 'OPEN',
            title: t('inbox.unassigned_students_title'),
            message: `${staff.fullName} ${t('inbox.unassigned_students_msg').replace('{count}', String(affectedStudentIds.length))}`,
            relatedEntityType: 'Student',
            relatedEntityIds: affectedStudentIds,
            createdAt: new Date().toISOString(),
          };
          setAdminInboxItems(prev => [...prev, task]);
        }
      }
    }
  };

  // --- Filtering ---
  const filteredStaff = teachers.filter(staff => {
    if (!showArchived && staff.isArchived) return false;
    if (showArchived && !staff.isArchived) return false;
    if (search) {
      const q = search.toLowerCase();
      return staff.fullName.toLowerCase().includes(q)
        || staff.email?.toLowerCase().includes(q)
        || staff.phone?.toLowerCase().includes(q)
        || staff.positions.some(p => p.toLowerCase().includes(q));
    }
    return true;
  });

  // --- Section Header Component ---
  const SectionHeader = ({ sectionKey, icon: Icon, label }: { sectionKey: string; icon: React.ElementType; label: string }) => (
    <button
      type="button"
      onClick={() => toggleSection(sectionKey)}
      className="flex items-center justify-between w-full py-2 px-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
    >
      <span className="flex items-center gap-2">
        <Icon size={16} />
        {label}
      </span>
      {expandedSections[sectionKey] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>
  );

  // --- Render ---
  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950" style={{ transition: 'background-color 300ms ease-in-out' }}>
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 shadow-sm"
        style={{ minHeight: '52px', transition: 'background-color 300ms ease-in-out, border-color 300ms ease-in-out' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg" onClick={onMobileMenuOpen}>
              <Menu size={24} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('staff.title')}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('staff.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 text-white font-semibold py-2 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-sm"
            style={{ background: 'radial-gradient(ellipse at 65% 25%, #60a5fa 0%, #3b82f6 40%, #6366f1 100%)' }}
          >
            <Plus size={18} />
            {t('staff.add')}
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('staff.search')}
              className="w-full ps-9 pe-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600"
            />
            {t('staff.show_archived')}
          </label>
        </div>
      </div>

      {/* Staff List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredStaff.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
            <User size={48} className="mb-3 opacity-50" />
            <p className="text-lg font-medium">{search ? t('staff.no_results') : t('staff.empty_state')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredStaff.map(staff => (
              <div
                key={staff.id}
                className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${staff.isArchived ? 'opacity-60' : ''}`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: staff.color }}>
                        {staff.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{staff.fullName}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {staff.positions.join(', ') || '—'}
                        </p>
                      </div>
                    </div>
                    {staff.isArchived && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        {t('staff.archived_badge')}
                      </span>
                    )}
                  </div>

                  {/* Contact info */}
                  <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mb-3">
                    {staff.email && <div className="flex items-center gap-1.5"><Mail size={12} /> {staff.email}</div>}
                    {staff.phone && <div className="flex items-center gap-1.5"><Phone size={12} /> {staff.phone}</div>}
                    {staff.employmentType && <div className="flex items-center gap-1.5"><Briefcase size={12} /> {staff.employmentType}</div>}
                  </div>

                  {/* Tags */}
                  {staff.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {staff.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => handleOpenModal(staff)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    >
                      <Edit2 size={14} />
                      {t('btn.edit') || t('staff.edit')}
                    </button>
                    <button
                      onClick={() => handleArchiveToggle(staff.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                    >
                      {staff.isArchived ? <RotateCcw size={14} /> : <Archive size={14} />}
                      {staff.isArchived ? t('staff.restore') : t('staff.archive')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingId ? t('staff.edit') : t('staff.add_new')}
          maxWidth="max-w-3xl"
          isDirty={JSON.stringify(formData) !== JSON.stringify(initialFormData)}
          onSave={handleSubmit as any}
        >
          <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto max-h-[70vh] px-1">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* === IDENTITY SECTION === */}
            <SectionHeader sectionKey="identity" icon={User} label={t('staff.section.identity')} />
            {expandedSections.identity && (
              <div className="space-y-3 ps-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('staff.full_name')} *</label>
                    <input
                      type="text"
                      value={formData.fullName || ''}
                      onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('staff.color')} *</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formData.color || '#3b82f6'}
                        onChange={e => setFormData({ ...formData, color: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer border-0"
                      />
                      <div className="flex gap-1 flex-wrap">
                        {COLORS.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setFormData({ ...formData, color: c })}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${formData.color === c ? 'border-blue-500 scale-110' : 'border-transparent hover:scale-105'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('staff.date_of_birth')}</label>
                    <input
                      type="date"
                      value={formData.dateOfBirth || ''}
                      onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('staff.date_of_joining')}</label>
                    <input
                      type="date"
                      value={formData.dateOfJoining || ''}
                      onChange={e => setFormData({ ...formData, dateOfJoining: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('staff.governmental_id')}</label>
                    <input
                      type="text"
                      value={formData.governmentalId || ''}
                      onChange={e => setFormData({ ...formData, governmentalId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('staff.employment_type')}</label>
                  <select
                    value={formData.employmentType || ''}
                    onChange={e => setFormData({ ...formData, employmentType: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">—</option>
                    {(activeLists.employmentTypes || []).map(et => (
                      <option key={et} value={et}>{et}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* === CONTACT SECTION === */}
            <SectionHeader sectionKey="contact" icon={Phone} label={t('staff.section.contact')} />
            {expandedSections.contact && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ps-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('staff.phone')}</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('staff.email')}</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* === POSITION ASSIGNMENTS SECTION (Financial) === */}
            <SectionHeader sectionKey="position_assignments" icon={DollarSign} label={t('staff.section.position_assignments')} />
            {expandedSections.position_assignments && (
              <div className="space-y-3 ps-2">
                {(formData.positionAssignments || []).map((pa, idx) => (
                  <div key={pa.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">#{idx + 1}</span>
                      <button type="button" onClick={() => removePositionAssignment(pa.id)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('label.position')}</label>
                        <input
                          type="text"
                          list={`positions-list-${pa.id}`}
                          value={pa.positionName}
                          onChange={e => updatePositionAssignment(pa.id, { positionName: e.target.value })}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
                          placeholder="e.g. Piano Instructor"
                        />
                        <datalist id={`positions-list-${pa.id}`}>
                          {activeLists.positions.map(p => <option key={p} value={p} />)}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('label.category')}</label>
                        <select
                          value={pa.category}
                          onChange={e => updatePositionAssignment(pa.id, { category: e.target.value })}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
                        >
                          {activeLists.classifications.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('label.rate_type')}</label>
                        <select
                          value={pa.rateType}
                          onChange={e => updatePositionAssignment(pa.id, { rateType: e.target.value as RateType })}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
                        >
                          <option value="HOURLY">{t('staff.rate_hourly')}</option>
                          <option value="GLOBAL_MONTHLY">{t('staff.rate_global_monthly')}</option>
                          <option value="PER_EVENT">{t('staff.rate_per_event')}</option>
                          <option value="ONE_OFF">{t('staff.rate_one_off')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{settings.currency || '₪'} Rate</label>
                        <input
                          type="number"
                          value={pa.rateValue}
                          onChange={e => updatePositionAssignment(pa.id, { rateValue: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
                          min={0}
                          step={0.01}
                        />
                      </div>
                    </div>
                    {/* Financial extras row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('staff.cost')}</label>
                        <input type="number" value={pa.cost ?? ''} onChange={e => updatePositionAssignment(pa.id, { cost: parseFloat(e.target.value) || undefined })}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white" min={0} step={0.01} />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('staff.vat_pct')}</label>
                        <input type="number" value={pa.vat?.value ?? ''} onChange={e => updatePositionAssignment(pa.id, { vat: { type: 'PERCENTAGE', value: parseFloat(e.target.value) || 0 } })}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white" min={0} step={0.01} />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('staff.overhead')}</label>
                        <input type="number" value={pa.overheadFeeValue ?? ''} onChange={e => updatePositionAssignment(pa.id, { overheadFeeValue: parseFloat(e.target.value) || undefined })}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white" min={0} step={0.01} />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('staff.social_pct')}</label>
                        <input type="number" value={pa.socialBenefitsValue ?? ''} onChange={e => updatePositionAssignment(pa.id, { socialBenefitsValue: parseFloat(e.target.value) || undefined })}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white" min={0} step={0.01} />
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addPositionAssignment} className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">
                  <Plus size={14} /> {t('staff.add_position_assignment')}
                </button>
              </div>
            )}

            {/* === POSITION TITLES SECTION === */}
            <SectionHeader sectionKey="position_titles" icon={Briefcase} label={t('staff.section.position_titles')} />
            {expandedSections.position_titles && (
              <div className="space-y-3 ps-2">
                {(formData.positionTitles || []).map(pt => (
                  <div key={pt.id} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <select
                      value={pt.positionTitle}
                      onChange={e => updatePositionTitle(pt.id, { positionTitle: e.target.value })}
                      className="flex-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="">— {t('staff.position_title')} —</option>
                      {activeLists.positions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input type="date" value={pt.startDate || ''} onChange={e => updatePositionTitle(pt.id, { startDate: e.target.value })}
                      className="px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-900 dark:text-white" title={t('staff.start_date')} />
                    <input type="date" value={pt.endDate || ''} onChange={e => updatePositionTitle(pt.id, { endDate: e.target.value })}
                      className="px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-900 dark:text-white" title={t('staff.end_date')} />
                    {!pt.endDate && <span className="text-xs text-green-600 dark:text-green-400 font-medium whitespace-nowrap">{t('staff.current')}</span>}
                    <button type="button" onClick={() => removePositionTitle(pt.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button type="button" onClick={addPositionTitle} className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">
                  <Plus size={14} /> {t('staff.add_position_title')}
                </button>
              </div>
            )}

            {/* === TEACHING ASSIGNMENTS SECTION === */}
            <SectionHeader sectionKey="teaching_assignments" icon={Music} label={t('staff.section.teaching_assignments')} />
            {expandedSections.teaching_assignments && (
              <div className="space-y-3 ps-2">
                {(formData.teachingAssignments || []).map(ta => {
                  const activity = activities.find(a => a.id === ta.activityId);
                  const activeSubcats = activity?.subcategories.filter(s => !s.isArchived) || [];
                  return (
                    <div key={ta.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {ta.endDate ? `${ta.startDate || '?'} → ${ta.endDate}` : ta.startDate ? `${ta.startDate} → ${t('staff.current')}` : ''}
                        </span>
                        <button type="button" onClick={() => removeTeachingAssignment(ta.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('staff.activity')}</label>
                          <select
                            value={ta.activityId}
                            onChange={e => handleTeachingAssignmentEdit(ta.id, { activityId: e.target.value, subcategoryId: '' })}
                            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
                          >
                            <option value="">—</option>
                            {activities.filter(a => !a.isArchived).map(a => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('staff.subcategory')}</label>
                          <select
                            value={ta.subcategoryId}
                            onChange={e => handleTeachingAssignmentEdit(ta.id, { subcategoryId: e.target.value })}
                            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
                            disabled={!ta.activityId}
                          >
                            <option value="">—</option>
                            {activeSubcats.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ta.isEnsemble}
                            onChange={e => handleTeachingAssignmentEdit(ta.id, { isEnsemble: e.target.checked })}
                            className="rounded border-slate-300 dark:border-slate-600"
                          />
                          {t('staff.is_ensemble')}
                        </label>
                        {!ta.startDate && (
                          <div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-0.5">{t('staff.start_date')}</label>
                            <input type="date" value={ta.startDate || ''} onChange={e => {
                              setFormData({
                                ...formData,
                                teachingAssignments: (formData.teachingAssignments || []).map(t =>
                                  t.id === ta.id ? { ...t, startDate: e.target.value } : t
                                ),
                              });
                            }}
                              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-900 dark:text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <button type="button" onClick={addTeachingAssignment} className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">
                  <Plus size={14} /> {t('staff.add_teaching_assignment')}
                </button>
              </div>
            )}

            {/* === TAGS SECTION === */}
            <SectionHeader sectionKey="tags" icon={Tag} label={t('staff.section.tags')} />
            {expandedSections.tags && (
              <div className="space-y-2 ps-2">
                <div className="flex flex-wrap gap-1.5">
                  {(formData.tags || []).map(tag => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500"><X size={12} /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    list="tags-datalist"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder={t('staff.add_tag_placeholder')}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <datalist id="tags-datalist">
                    {activeLists.tags.map(t => <option key={t} value={t} />)}
                  </datalist>
                  <button type="button" onClick={handleAddTag as any} className="px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                    {t('btn.add')}
                  </button>
                </div>
              </div>
            )}

            {/* === BIO SECTION === */}
            <SectionHeader sectionKey="bio" icon={User} label={t('staff.bio')} />
            {expandedSections.bio && (
              <div className="ps-2">
                <textarea
                  value={formData.bio || ''}
                  onChange={e => setFormData({ ...formData, bio: e.target.value })}
                  placeholder={t('staff.bio_placeholder')}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            )}

            {/* === CREDENTIALS SECTION === */}
            <SectionHeader sectionKey="credentials" icon={GraduationCap} label={t('staff.section.credentials')} />
            {expandedSections.credentials && (
              <div className="space-y-3 ps-2">
                {(formData.credentials || []).map(cred => (
                  <div key={cred.id} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <input type="text" value={cred.institution || ''} onChange={e => updateCredential(cred.id, { institution: e.target.value })}
                      placeholder={t('staff.institution')} className="flex-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white" />
                    <input type="text" value={cred.qualificationType || ''} onChange={e => updateCredential(cred.id, { qualificationType: e.target.value })}
                      placeholder={t('staff.qualification_type')} className="flex-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white" />
                    <input type="number" value={cred.year ?? ''} onChange={e => updateCredential(cred.id, { year: parseInt(e.target.value) || undefined })}
                      placeholder={t('staff.year')} className="w-20 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white" />
                    <button type="button" onClick={() => removeCredential(cred.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button type="button" onClick={addCredential} className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">
                  <Plus size={14} /> {t('staff.add_credential')}
                </button>
              </div>
            )}

            {/* === NOTES SECTION === */}
            <SectionHeader sectionKey="notes" icon={FileText} label={t('staff.section.notes')} />
            {expandedSections.notes && (
              <div className="space-y-3 ps-2">
                {(formData.notes || []).map(note => (
                  <div key={note.id} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-start justify-between">
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{note.content}</p>
                      <button type="button" onClick={() => removeNote(note.id)} className="text-red-400 hover:text-red-600 ms-2 flex-shrink-0"><Trash2 size={14} /></button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{note.createdBy} — {new Date(note.createdAt).toLocaleString()}</p>
                  </div>
                ))}
                <div className="flex gap-2">
                  <textarea
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    placeholder={t('staff.note_placeholder')}
                    rows={2}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                  />
                  <button type="button" onClick={addNote} className="self-end px-3 py-2 text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                    {t('staff.add_note')}
                  </button>
                </div>
              </div>
            )}

            {/* === DOCUMENTS SECTION === */}
            <SectionHeader sectionKey="documents" icon={Upload} label={t('staff.section.documents')} />
            {expandedSections.documents && (
              <div className="space-y-3 ps-2">
                {(formData.documents || []).map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <FileText size={16} className="text-slate-400 flex-shrink-0" />
                    <a href={doc.url} target="_blank" rel="noreferrer" className="flex-1 text-sm text-blue-600 dark:text-blue-400 hover:underline truncate">{doc.label}</a>
                    <span className="text-xs text-slate-400">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                    <button type="button" onClick={() => removeDocument(doc.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={docLabel}
                    onChange={e => setDocLabel(e.target.value)}
                    placeholder={t('staff.document_label_placeholder')}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <input ref={fileInputRef} type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) handleDocumentUpload(e.target.files[0]); }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!docLabel.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                    <Upload size={14} /> {t('staff.upload_document')}
                  </button>
                </div>
              </div>
            )}

            {/* === GOOGLE CALENDAR SECTION === */}
            <SectionHeader sectionKey="google_calendar" icon={Clock} label={t('staff.section.google_calendar')} />
            {expandedSections.google_calendar && (
              <div className="space-y-3 ps-2">
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.googleCalendarSyncEnabled || false}
                    onChange={e => setFormData({ ...formData, googleCalendarSyncEnabled: e.target.checked })}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  {t('staff.google_sync_enabled')}
                </label>
                {formData.googleCalendarSyncEnabled && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('staff.google_calendar_id')}</label>
                    <input
                      type="text"
                      value={formData.googleCalendarId || ''}
                      onChange={e => setFormData({ ...formData, googleCalendarId: e.target.value })}
                      placeholder={t('staff.google_calendar_id_placeholder')}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Hours Reports Section — only when editing an existing staff member */}
            {editingId && (
              <>
                <SectionHeader sectionKey="hours_reports" icon={ClipboardList} label={t('hours.title')} />
                {expandedSections.hours_reports && (
                  <div className="space-y-4 ps-2">
                    {/* Generate New Link */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                      <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-3">{t('hours.generate_link')}</h4>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('hours.period_start')}</label>
                          <input
                            type="date"
                            value={hrPeriodStart}
                            onChange={e => setHrPeriodStart(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('hours.period_end')}</label>
                          <input
                            type="date"
                            value={hrPeriodEnd}
                            onChange={e => setHrPeriodEnd(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => generateHoursReportLink(editingId)}
                        disabled={!hrPeriodStart || !hrPeriodEnd}
                        className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Link2 size={16} />
                        {t('hours.generate')}
                      </button>
                    </div>

                    {/* Existing Reports for this Staff Member */}
                    {hoursReports
                      .filter(r => r.staffMemberId === editingId)
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map(report => (
                        <div key={report.id} className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {report.periodStart} → {report.periodEnd}
                            </span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              report.status === 'SUBMITTED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                              report.status === 'REVIEWED' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>
                              {t(`hours.${report.status.toLowerCase()}`)}
                            </span>
                          </div>
                          {report.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => copyReportLink(report.token)}
                              className="w-full px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg flex items-center justify-center gap-1.5 border border-blue-200 dark:border-blue-800"
                            >
                              {hrCopiedId === report.token ? <><Check size={14} /> {t('hours.link_copied')}</> : <><Copy size={14} /> {t('hours.copy_link')}</>}
                            </button>
                          )}
                        </div>
                      ))}

                    {hoursReports.filter(r => r.staffMemberId === editingId).length === 0 && (
                      <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-2">{t('hours.no_reports')}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </form>
        </Modal>
      )}

      {/* Effective Date Prompt Modal */}
      {effectiveDatePrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">{t('staff.effective_date_prompt')}</p>
            <input
              type="date"
              value={effectiveDate}
              onChange={e => setEffectiveDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEffectiveDatePrompt(null); setEffectiveDate(''); }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                {t('btn.cancel')}
              </button>
              <button onClick={confirmEffectiveDateEdit} disabled={!effectiveDate}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                {t('btn.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
