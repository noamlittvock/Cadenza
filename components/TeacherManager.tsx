import React, { useState, useRef } from 'react';
import { Teacher, ListsState, PositionAssignment, RateType, AppSettings } from '../types';
import { generateId, COLORS, INITIAL_LISTS } from '../constants';
import { Plus, Edit2, Trash2, Search, CheckCircle2, Palette, X, Download, Upload, FileDown, Tag, Briefcase, Menu, DollarSign, Clock, CalendarDays, ChevronDown, ToggleLeft, ToggleRight } from 'lucide-react';

import { TRANSLATIONS } from '../constants';
import { Modal } from './Modal';
import { TagInput } from './TagInput';
interface Props {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  lists: ListsState;
  setLists?: React.Dispatch<React.SetStateAction<ListsState>>;
  onMobileMenuOpen?: () => void;
  embedded?: boolean;
  settings: AppSettings;
}

interface ImportCandidate {
  id: string; // Temporary ID
  fullName: string;
  positions: string[];
  positionAssignments: PositionAssignment[];
  tags: string[];
  phone: string;
  email: string;
  selected: boolean;
}

// Helper to create a new empty position assignment
const createEmptyAssignment = (): PositionAssignment => ({
  id: generateId(),
  positionName: '',
  category: 'Individual Lesson',
  rateType: 'HOURLY',
  rateValue: 0,
});

export const TeacherManager: React.FC<Props> = ({ teachers, setTeachers, lists, setLists, onMobileMenuOpen, embedded = false, settings }) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Teacher>>({ positions: [], positionAssignments: [], tags: [] });
  const [initialFormData, setInitialFormData] = useState<Partial<Teacher>>({ positions: [], positionAssignments: [], tags: [] });
  // Safe Fallback
  const activeLists = lists || INITIAL_LISTS;

  // Search State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'POSITION' | 'TAG'>('ALL');
  const [filterValue, setFilterValue] = useState('');

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Bulk Selection State
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());

  // Bulk Financial Update State
  const [isBulkFinancialModalOpen, setIsBulkFinancialModalOpen] = useState(false);
  const [bulkFinancialData, setBulkFinancialData] = useState({
    cost: '',
    vatType: 'PERCENTAGE' as 'PERCENTAGE' | 'FLAT',
    vatValue: '',
    overheadType: 'FLAT' as 'PERCENTAGE' | 'FLAT',
    overheadFee: '',
    socialBenefits: ''
  });

  // --- Position Assignment Helpers ---

  const syncPositionsFromAssignments = (assignments: PositionAssignment[]): string[] => {
    return assignments.map(pa => pa.positionName).filter(name => name.trim() !== '');
  };

  const addPositionAssignment = () => {
    const newAssignment = createEmptyAssignment();
    const newAssignments = [...(formData.positionAssignments || []), newAssignment];
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

  // --- Main Teacher Management ---

  const handleOpenModal = (teacher?: Teacher) => {
    setError(null);
    if (teacher) {
      setEditingId(teacher.id);
      const data = {
        ...teacher,
        positionAssignments: teacher.positionAssignments || [],
      };
      setFormData(data);
      setInitialFormData(data);
    } else {
      setEditingId(null);
      // Pick first available color or default
      const usedColors = teachers.map(t => t.color);
      const availableColor = COLORS.find(c => !usedColors.includes(c)) || COLORS[0];

      const data = {
        positions: [],
        positionAssignments: [createEmptyAssignment()], // Start with one empty slot
        tags: [],
        color: availableColor,
      };
      setFormData(data);
      setInitialFormData(data);
    }
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t('teachers.confirm_delete'))) {
      setTeachers(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.fullName || !formData.color) return;

    // Validation: must have at least one position with a name
    const validAssignments = (formData.positionAssignments || []).filter(pa => pa.positionName.trim() !== '');
    if (validAssignments.length === 0) {
      setError(t('teach.err_no_position'));
      return;
    }

    // Validation: Check if color is taken by another teacher
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
      const newTeacher: Teacher = {
        id: generateId(),
        fullName: formData.fullName!,
        positions: finalPositions,
        positionAssignments: validAssignments,
        tags: formData.tags || [],
        phone: formData.phone || '',
        email: formData.email || '',
        color: formData.color!
      };
      setTeachers(prev => [...prev, newTeacher]);
    }

    // Auto-populate new positions into lists
    if (setLists) {
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
    }

    setIsModalOpen(false);
  };

  // --- CSV Import / Export ---

  const handleDownloadTemplate = () => {
    const headers = "FullName,Email,Phone,Position,Category,RateType (HOURLY / GLOBAL_MONTHLY / PER_EVENT),RateValue,Tags(semicolon sep)";
    const exampleRow = "Jane Doe,jane@music.com,555-0199,Piano Instructor,Individual Lesson,HOURLY,150,Piano Dept;Senior Staff";
    const blob = new Blob([headers + '\n' + exampleRow], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'teacher_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportTeachers = () => {
    const headers = "TeacherName,Email,Phone,Color,Position,Category,RateType,RateValue,Tags";
    const rows: string[] = [];
    teachers.forEach(t => {
      if (t.positionAssignments.length === 0) {
        rows.push(`"${t.fullName}","${t.email}","${t.phone}","${t.color}","","","","","${t.tags.join(';')}"`);
      } else {
        t.positionAssignments.forEach(pa => {
          rows.push(`"${t.fullName}","${t.email}","${t.phone}","${t.color}","${pa.positionName}","${pa.category}","${pa.rateType}","${pa.rateValue}","${t.tags.join(';')}"`);
        });
      }
    });
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teachers_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setUploadProgress(0);

    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setUploadProgress(100);
      setTimeout(() => {
        parseCSV(text);
        setIsAnalyzing(false);
        setUploadProgress(0);
      }, 500);
    };

    reader.onerror = () => {
      alert(t('teach.alert_error_reading'));
      setIsAnalyzing(false);
      setUploadProgress(0);
    };

    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const parseCSV = (csvText: string) => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    const firstLineCols = lines[0].toLowerCase().split(',');
    const hasHeader = firstLineCols.some(c => c.includes('email') || c.includes('name'));
    const startIdx = hasHeader ? 1 : 0;

    // Group rows by teacher email for multi-position support
    const teacherMap: Record<string, ImportCandidate> = {};

    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());

      const name = cols[0];
      const email = cols[1];

      if ((!name || name.length < 2) && (!email || email.length < 3)) {
        continue;
      }

      const key = (email || name).toLowerCase();

      // Parse position data from CSV columns
      const positionName = cols[3] || '';
      const category = cols[4] || 'Individual Lesson';
      const parsedRateString = cols[5]?.toUpperCase();
      const rateType: RateType = parsedRateString === 'PER_EVENT' ? 'PER_EVENT' : parsedRateString === 'GLOBAL_MONTHLY' ? 'GLOBAL_MONTHLY' : 'HOURLY';
      const rateValue = parseFloat(cols[6]) || 0;
      const tags = cols[7] ? cols[7].split(';').map(t => t.trim()).filter(t => t) : [];

      if (!teacherMap[key]) {
        // Check if already exists in current teachers
        if (teachers.some(t => t.email.toLowerCase() === (email || '').toLowerCase())) continue;

        teacherMap[key] = {
          id: generateId(),
          fullName: name || 'Unknown',
          email: email || '',
          phone: cols[2] || '',
          positions: [],
          positionAssignments: [],
          tags,
          selected: true,
        };
      }

      // Add position assignment if position name is provided
      if (positionName) {
        teacherMap[key].positionAssignments.push({
          id: generateId(),
          positionName,
          category,
          rateType,
          rateValue,
        });
        if (!teacherMap[key].positions.includes(positionName)) {
          teacherMap[key].positions.push(positionName);
        }
      }

      // Merge tags
      tags.forEach(tag => {
        if (!teacherMap[key].tags.includes(tag)) {
          teacherMap[key].tags.push(tag);
        }
      });
    }

    const candidates = Object.values(teacherMap);

    if (candidates.length === 0) {
      alert(t('teach.alert_no_valid'));
      return;
    }
    setImportCandidates(candidates);
    setIsImportModalOpen(true);
  };

  const confirmImport = (autoAssignColors: boolean) => {
    const selected = importCandidates.filter(c => c.selected);
    if (selected.length === 0) return;

    const usedColors = new Set([...teachers.map(t => t.color.toLowerCase())]);
    const getRandomColor = () => {
      let color = '#';
      for (let i = 0; i < 6; i++) {
        color += Math.floor(Math.random() * 16).toString(16);
      }
      return color;
    };

    const newTeachers: Teacher[] = selected.map((c) => {
      let color = COLORS[0];
      if (autoAssignColors) {
        const available = COLORS.find(col => !usedColors.has(col.toLowerCase()));
        if (available) {
          color = available;
        } else {
          let randomCol = getRandomColor();
          let retries = 0;
          while (usedColors.has(randomCol) && retries < 50) {
            randomCol = getRandomColor();
            retries++;
          }
          color = randomCol;
        }
      }
      usedColors.add(color.toLowerCase());

      // Ensure at least one position assignment
      const assignments = c.positionAssignments.length > 0
        ? c.positionAssignments
        : [{ id: generateId(), positionName: 'Instructor', category: 'Individual Lesson', rateType: 'HOURLY' as RateType, rateValue: 0 }];

      return {
        id: generateId(),
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        positions: assignments.map(a => a.positionName),
        positionAssignments: assignments,
        tags: c.tags,
        color: color
      };
    });

    // Auto-populate new positions and tags if setLists is available
    if (setLists) {
      const allNewPositions = new Set(activeLists.positions || []);
      const allNewTags = new Set(activeLists.tags || []);
      let changed = false;

      newTeachers.forEach(t => {
        t.positions.forEach(p => {
          if (p && !allNewPositions.has(p)) {
            allNewPositions.add(p);
            changed = true;
          }
        });
        t.tags.forEach(tag => {
          if (tag && !allNewTags.has(tag)) {
            allNewTags.add(tag);
            changed = true;
          }
        });
      });

      if (changed) {
        setLists(prev => ({
          ...prev,
          positions: Array.from(allNewPositions),
          tags: Array.from(allNewTags)
        }));
      }
    }

    setTeachers(prev => [...prev, ...newTeachers]);
    setIsImportModalOpen(false);
    setImportCandidates([]);
  };

  const filteredTeachers = teachers.filter(t => {
    const matchesSearch = t.fullName.toLowerCase().includes(search.toLowerCase()) ||
      t.positions.some(p => p.toLowerCase().includes(search.toLowerCase())) ||
      t.tags.some(tg => tg.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterType === 'POSITION' && filterValue) {
      return t.positions.includes(filterValue);
    }
    if (filterType === 'TAG' && filterValue) {
      return t.tags.includes(filterValue);
    }

    return true;
  });

  // Bulk Selection Logic
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedTeacherIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedTeacherIds(newSet);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = new Set(filteredTeachers.map(t => t.id));
      setSelectedTeacherIds(allIds);
    } else {
      setSelectedTeacherIds(new Set());
    }
  };

  const handleBulkDelete = () => {
    if (window.confirm(`${t('teachers.confirm_bulk_prefix')} ${selectedTeacherIds.size} ${t('teachers.confirm_bulk_delete')}`)) {
      setTeachers(prev => prev.filter(t => !selectedTeacherIds.has(t.id)));
      setSelectedTeacherIds(new Set());
    }
  };

  const handleBulkFinancialUpdate = (e: React.FormEvent) => {
    e.preventDefault();

    setTeachers(prev => prev.map(t => {
      if (!selectedTeacherIds.has(t.id)) return t;

      const updatedTeacher = { ...t };

      updatedTeacher.positionAssignments = updatedTeacher.positionAssignments.map(pa => {
        let newPa = { ...pa };
        if (bulkFinancialData.cost !== '') newPa.cost = parseFloat(bulkFinancialData.cost) || 0;
        if (bulkFinancialData.vatValue !== '') {
          newPa.vat = { type: bulkFinancialData.vatType, value: parseFloat(bulkFinancialData.vatValue) || 0 };
        }
        if (bulkFinancialData.overheadFee !== '') {
          newPa.overheadFeeType = bulkFinancialData.overheadType;
          newPa.overheadFeeValue = parseFloat(bulkFinancialData.overheadFee) || 0;
        }
        if (bulkFinancialData.socialBenefits !== '') {
          newPa.socialBenefits = parseFloat(bulkFinancialData.socialBenefits) || 0;
        }
        return newPa;
      });

      return updatedTeacher;
    }));

    setIsBulkFinancialModalOpen(false);
    setSelectedTeacherIds(new Set());
    setBulkFinancialData({ cost: '', vatType: 'PERCENTAGE', vatValue: '', overheadType: 'FLAT', overheadFee: '', socialBenefits: '' });
  };

  const isAllSelected = filteredTeachers.length > 0 && filteredTeachers.every(t => selectedTeacherIds.has(t.id));
  const isIndeterminate = selectedTeacherIds.size > 0 && !isAllSelected;

  // --- Rate formatting helpers ---
  const formatRate = (pa: PositionAssignment) => {
    if (pa.rateType === 'HOURLY') {
      return `${settings.currency}${pa.rateValue}${t('fin.per_hr') || '/hr'}`;
    } else if (pa.rateType === 'GLOBAL_MONTHLY') {
      return `${settings.currency}${pa.rateValue.toLocaleString()}${t('fin.per_mo') || '/mo'}`;
    } else {
      return `${settings.currency}${pa.rateValue} ${t('teach.per_event') || 'per ev'}`;
    }
  };

  return (
    <div className={`${embedded ? 'h-full overflow-auto' : ''} p-8 max-w-6xl mx-auto pb-24 relative`}>
      {/* Header controls - hidden when embedded */}
      {!embedded && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            {onMobileMenuOpen && (
              <button
                onClick={onMobileMenuOpen}
                className="p-2 -ms-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden"
                title={t('tooltip.open_menu')}
              >
                <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('teach.title')}</h2>
              <p className="text-slate-500 dark:text-slate-400">{t('teach.subtitle')}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {isAnalyzing && (
              <div className="me-3 flex items-center space-x-2 rtl:space-x-reverse bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-800">
                <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{uploadProgress}%</span>
              </div>
            )}
            <button onClick={handleDownloadTemplate} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><FileDown size={16} className="me-2" /> {t('teach.template')}</button>
            <button onClick={handleExportTeachers} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><Download size={16} className="me-2" /> {t('teach.export')}</button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"><Upload size={16} className="me-2" /> {t('teach.import')}</button>
            <input type="file" ref={fileInputRef} hidden accept=".csv" onChange={handleFileUpload} />
            <button onClick={() => handleOpenModal()} className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center  text-sm"><Plus size={16} className="me-2" /> {t('teach.add')}</button>
          </div>
        </div>
      )}

      {/* Toolbar for embedded mode */}
      {embedded && (
        <div className="flex flex-wrap gap-2 items-center mb-6">
          {isAnalyzing && (
            <div className="me-3 flex items-center space-x-2 rtl:space-x-reverse bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-800">
              <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{uploadProgress}%</span>
            </div>
          )}
          <button onClick={handleDownloadTemplate} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><FileDown size={16} className="me-2" /> {t('teach.template')}</button>
          <button onClick={handleExportTeachers} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><Download size={16} className="me-2" /> {t('teach.export')}</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"><Upload size={16} className="me-2" /> {t('teach.import')}</button>
          <input type="file" ref={fileInputRef} hidden accept=".csv" onChange={handleFileUpload} />
          <div className="flex-1" />
          <button onClick={() => handleOpenModal()} className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center  text-sm"><Plus size={16} className="me-2" /> {t('teach.add')}</button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Filters Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('placeholder.search_teachers')}
              className="ps-10 pe-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm w-full text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <select
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 w-[160px]"
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value as any); setFilterValue(''); }}
            >
              <option value="ALL">{t('teacher.all_categories')}</option>
              <option value="POSITION">{t('teacher.filter_position')}</option>
              <option value="TAG">{t('teacher.filter_tag')}</option>
            </select>

            {filterType !== 'ALL' && (
              <select
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 w-[160px]"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
              >
                <option value="">{filterType === 'POSITION' ? t('teach.select_position_placeholder') : t('teach.select_tag_placeholder')}</option>
                {filterType === 'POSITION'
                  ? activeLists.positions.map(p => <option key={p} value={p}>{p}</option>)
                  : activeLists.tags.map(t => <option key={t} value={t}>{t}</option>)
                }
              </select>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-medium">
              <tr>
                <th className="px-6 py-4 w-12">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                    checked={isAllSelected}
                    ref={el => { if (el) el.indeterminate = isIndeterminate; }}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-6 py-4">{t('teach.col_name')}</th>
                <th className="px-6 py-4">{t('teach.col_positions')}</th>
                <th className="px-6 py-4">{t('teach.col_tags')}</th>
                <th className="px-6 py-4">{t('teach.col_contact')}</th>
                <th className="px-6 py-4 text-end">{t('teach.col_actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTeachers.map(teacher => (
                <tr key={teacher.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${selectedTeacherIds.has(teacher.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                      checked={selectedTeacherIds.has(teacher.id)}
                      onChange={() => toggleSelection(teacher.id)}
                    />
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white flex items-center">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center me-3 shadow-sm border border-slate-200 dark:border-slate-700 text-white font-bold text-xs"
                      style={{ backgroundColor: teacher.color }}
                    >
                      {teacher.fullName.charAt(0)}
                    </div>
                    {teacher.fullName}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    <div className="flex flex-col gap-1.5">
                      {(teacher.positionAssignments || []).map((pa, i) => (
                        <div key={pa.id || i} className="flex items-center gap-1.5">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs border border-slate-200 dark:border-slate-700 font-medium">
                            {pa.positionName}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pa.rateType === 'HOURLY'
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            : pa.rateType === 'GLOBAL_MONTHLY'
                              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                            }`}>
                            {pa.rateType === 'HOURLY' ? (
                              <span className="flex items-center gap-0.5"><Clock size={9} /> {formatRate(pa)}</span>
                            ) : pa.rateType === 'GLOBAL_MONTHLY' ? (
                              <span className="flex items-center gap-0.5"><CalendarDays size={9} /> {formatRate(pa)}</span>
                            ) : (
                              <span className="flex items-center gap-0.5"><Briefcase size={9} /> {formatRate(pa)}</span>
                            )}
                          </span>
                        </div>
                      ))}
                      {/* Fallback for teachers without assignments */}
                      {(!teacher.positionAssignments || teacher.positionAssignments.length === 0) && teacher.positions.map((pos, i) => (
                        <span key={i} className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs border border-slate-200 dark:border-slate-700">
                          {pos}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    <div className="flex flex-wrap gap-1">
                      {teacher.tags.map((tag, i) => (
                        <span key={i} className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded text-xs border border-blue-100 dark:border-blue-800 flex items-center">
                          <Tag size={10} className="me-1" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    <div className="flex flex-col">
                      <span>{teacher.email}</span>
                      <span className="text-xs text-slate-400">{teacher.phone}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-end space-x-2 rtl:space-x-reverse">
                    <button onClick={() => handleOpenModal(teacher)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(teacher.id)} className="text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Add Teacher Modal — Enhanced with Position Assignments */}
      {/* Edit/Add Teacher Modal — Enhanced with Position Assignments */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? t('teach.edit_teacher') : t('teach.add_new_teacher')}
        isDirty={JSON.stringify(formData) !== JSON.stringify(initialFormData)}
        onSave={(e?: React.FormEvent) => handleSubmit(e)}
        t={t}
        maxWidth="max-w-2xl"
        footerContent={
          <div className="flex justify-end space-x-3 rtl:space-x-reverse w-full">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">{t('teach.cancel')}</button>
            <button type="button" onClick={() => handleSubmit(undefined)} className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg">{t('teach.save')}</button>
          </div>
        }
      >
        {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name + Color Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('label.full_name')}</label>
              <input required type="text" className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" value={formData.fullName || ''} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('label.teacher_color')}</label>
              <div className="flex gap-2 mb-2">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setFormData({ ...formData, color: c })} className={`w-6 h-6 rounded-full border ${formData.color === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <input type="color" value={formData.color || '#000000'} onChange={e => setFormData({ ...formData, color: e.target.value })} className="w-full h-8" />
            </div>
          </div>

          {/* === Position Assignments Section === */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Briefcase size={16} />
                {t('teach.position_assignments_label')}
              </label>
              <button
                type="button"
                onClick={addPositionAssignment}
                className="text-xs btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors "
              >
                <Plus size={12} /> {t('teach.add_position')}
              </button>
            </div>

            <div className="space-y-3">
              {(formData.positionAssignments || []).map((pa, idx) => (
                <div
                  key={pa.id}
                  className="relative bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 transition-all hover:border-blue-300 dark:hover:border-blue-700"
                >
                  {/* Remove button */}
                  {(formData.positionAssignments || []).length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePositionAssignment(pa.id)}
                      className="absolute top-2 end-2 text-slate-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                      title={t('teacher.remove_position')}
                    >
                      <X size={14} />
                    </button>
                  )}

                  {/* Position Header: Number badge */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('teach.position_assignment')}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Position Name */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('teach.position_name')}</label>
                      <div className="relative">
                        <input
                          type="text"
                          list={`position-options-${pa.id}`}
                          placeholder={t('teach.position_placeholder')}
                          className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                          value={pa.positionName}
                          onChange={e => updatePositionAssignment(pa.id, { positionName: e.target.value })}
                        />
                        <datalist id={`position-options-${pa.id}`}>
                          {activeLists.positions.map(p => <option key={p} value={p} />)}
                        </datalist>
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('teach.category')}</label>
                      <select
                        className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                        value={pa.category}
                        onChange={e => updatePositionAssignment(pa.id, { category: e.target.value })}
                      >
                        {activeLists.classifications.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Rate Type Toggle */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('teach.rate_type')}</label>
                      <button
                        type="button"
                        onClick={() => updatePositionAssignment(pa.id, {
                          rateType: pa.rateType === 'HOURLY' ? 'GLOBAL_MONTHLY' : (pa.rateType === 'GLOBAL_MONTHLY' ? 'PER_EVENT' : 'HOURLY')
                        })}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-all ${pa.rateType === 'HOURLY'
                          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                          : pa.rateType === 'GLOBAL_MONTHLY' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                            : 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300'
                          }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {pa.rateType === 'HOURLY' ? (
                            <><Clock size={14} /> {t('teach.hourly')}</>
                          ) : pa.rateType === 'GLOBAL_MONTHLY' ? (
                            <><CalendarDays size={14} /> {t('teach.global_monthly')}</>
                          ) : (
                            <><Briefcase size={14} /> {t('teach.per_event') || 'Per Event'}</>
                          )}
                        </span>
                        {pa.rateType === 'HOURLY' ? (
                          <ToggleLeft size={18} className="text-blue-400" />
                        ) : pa.rateType === 'GLOBAL_MONTHLY' ? (
                          <ToggleRight size={18} className="text-emerald-400" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-purple-400 ms-1 me-0.5 shadow-sm" />
                        )}
                      </button>
                    </div>

                    {/* Rate Value */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        {pa.rateType === 'HOURLY' ? `${t('teach.rate_hourly_label')} (${settings.currency}${t('teach.per_hour') || '/hr'})` : pa.rateType === 'GLOBAL_MONTHLY' ? `${t('teach.monthly_fee')} (${settings.currency})` : `${t('teach.per_event') || 'Per Event'} (${settings.currency})`}
                      </label>
                      <div className="relative">
                        <DollarSign size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="number"
                          min={0}
                          step={pa.rateType === 'HOURLY' ? 10 : pa.rateType === 'GLOBAL_MONTHLY' ? 100 : 10}
                          placeholder={pa.rateType === 'HOURLY' ? '150' : pa.rateType === 'GLOBAL_MONTHLY' ? '5000' : '200'}
                          className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg ps-8 pe-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                          value={pa.rateValue !== undefined && pa.rateValue !== null ? pa.rateValue : ''}
                          onChange={e => updatePositionAssignment(pa.id, { rateValue: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <div className="col-span-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">VAT Type</label>
                      <select
                        className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg px-2 py-1.5 text-xs outline-none"
                        value={pa.vat?.type || 'PERCENTAGE'}
                        onChange={e => updatePositionAssignment(pa.id, { vat: { type: e.target.value as 'PERCENTAGE' | 'FLAT', value: pa.vat?.value || 0 } })}
                      >
                        <option value="PERCENTAGE">%</option>
                        <option value="FLAT">{settings.currency}</option>
                      </select>
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">VAT Value</label>
                      <input
                        type="number" step="0.1"
                        className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg px-2 py-1.5 text-xs outline-none"
                        value={pa.vat?.value ?? ''}
                        onChange={e => updatePositionAssignment(pa.id, { vat: { type: pa.vat?.type || 'PERCENTAGE', value: parseFloat(e.target.value) || 0 } })}
                      />
                    </div>

                    <div className="col-span-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{t('teach.overhead_fee')}</label>
                      <div className="flex bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-blue-500">
                        <select
                          className="bg-transparent text-xs px-1 border-e border-slate-300 dark:border-slate-600 outline-none w-[45px] text-slate-500 cursor-pointer"
                          value={pa.overheadFeeType || 'FLAT'}
                          onChange={e => updatePositionAssignment(pa.id, { overheadFeeType: e.target.value as 'PERCENTAGE' | 'FLAT' })}
                        >
                          <option value="PERCENTAGE">%</option>
                          <option value="FLAT">{settings.currency.substring(0, 1)}</option>
                        </select>
                        <input
                          type="number" step="0.01"
                          className="flex-1 bg-transparent px-2 py-1.5 text-xs outline-none text-slate-900 dark:text-white"
                          value={pa.overheadFeeValue ?? ''}
                          onChange={e => updatePositionAssignment(pa.id, { overheadFeeValue: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div className="col-span-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{t('teach.social_benefits')}</label>
                      <div className="flex bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-blue-500">
                        <select
                          className="bg-transparent text-xs px-1 border-e border-slate-300 dark:border-slate-600 outline-none w-[45px] text-slate-500 cursor-pointer"
                          value={pa.socialBenefitsType || 'PERCENTAGE'}
                          onChange={e => updatePositionAssignment(pa.id, { socialBenefitsType: e.target.value as 'PERCENTAGE' | 'FLAT' })}
                        >
                          <option value="PERCENTAGE">%</option>
                          <option value="FLAT">{settings.currency.substring(0, 1)}</option>
                        </select>
                        <input
                          type="number" step="0.01"
                          className="flex-1 bg-transparent px-2 py-1.5 text-xs outline-none text-slate-900 dark:text-white"
                          value={pa.socialBenefitsValue ?? ''}
                          onChange={e => updatePositionAssignment(pa.id, { socialBenefitsValue: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty state */}
            {(formData.positionAssignments || []).length === 0 && (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                <Briefcase size={24} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-400 dark:text-slate-500">{t('teach.no_positions_yet')}</p>
                <button
                  type="button"
                  onClick={addPositionAssignment}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  {t('teach.add_first_position')}
                </button>
              </div>
            )}
          </div>

          {/* Tags Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teach.tags_label')}</label>
            <TagInput
              tags={formData.tags || []}
              availableTags={activeLists.tags}
              onAdd={(tag) => setFormData({ ...formData, tags: [...(formData.tags || []), tag] })}
              onRemove={(tag) => setFormData({ ...formData, tags: (formData.tags || []).filter(t => t !== tag) })}
              placeholder={t('tag_input.type_new')}
              selectPlaceholder={t('tag_input.select_existing')}
              addLabel={t('teach.add_tag')}
            />
          </div>

          {/* Email/Phone Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teach.email')}</label><input type="email" className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} /></div>
            <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teach.phone')}</label><input type="text" className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
          </div>



        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportCandidates([]);
        }}
        title={t('teach.import_teachers')}
        isDirty={importCandidates.some(c => c.selected)}
        t={t}
        maxWidth="max-w-2xl"
        footerContent={
          <div className="flex justify-between items-center w-full">
            <div className="text-xs text-slate-400">
              {t('teach.colors_auto')}
            </div>
            <div className="flex space-x-3 rtl:space-x-reverse">
              <button onClick={() => setIsImportModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">{t('teach.cancel')}</button>
              <button
                onClick={() => confirmImport(true)}
                disabled={importCandidates.filter(c => c.selected).length === 0}
                className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('teach.import_n_teachers')} {importCandidates.filter(c => c.selected).length} {t('teach.teachers_word')}
              </button>
            </div>
          </div>
        }
      >
        <p className="text-sm text-slate-500 mb-4">{t('teach.found_prefix')} {importCandidates.length} {t('teach.unique_teachers')}</p>

        <div className="border border-slate-200 dark:border-slate-700 rounded-lg mb-4">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 sticky top-0">
              <tr>
                <th className="p-3 w-8"><input type="checkbox" checked={importCandidates.every(c => c.selected)} onChange={e => setImportCandidates(prev => prev.map(c => ({ ...c, selected: e.target.checked })))} /></th>
                <th className="p-3 text-slate-500 font-medium">{t('teach.col_name')}</th>
                <th className="p-3 text-slate-500 font-medium">{t('teach.import_col_email')}</th>
                <th className="p-3 text-slate-500 font-medium">{t('teach.import_col_positions')}</th>
                <th className="p-3 text-slate-500 font-medium">{t('teach.import_col_rates')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {importCandidates.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="p-3"><input type="checkbox" checked={c.selected} onChange={e => setImportCandidates(prev => prev.map(p => p.id === c.id ? { ...p, selected: e.target.checked } : p))} /></td>
                  <td className="p-3 font-medium text-slate-900 dark:text-white">{c.fullName}</td>
                  <td className="p-3 text-slate-500">{c.email}</td>
                  <td className="p-3 text-slate-500">{c.positionAssignments.map(pa => pa.positionName).join(', ') || c.positions.join(', ')}</td>
                  <td className="p-3 text-slate-500">
                    {c.positionAssignments.map(pa =>
                      `${pa.rateType === 'HOURLY' ? '⏱' : '📅'} ${settings.currency}${pa.rateValue}`
                    ).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Bulk Actions Bar */}
      {selectedTeacherIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center space-x-6 rtl:space-x-reverse z-40 animate-in slide-in-from-bottom-4">
          <span className="font-medium">{selectedTeacherIds.size} {t('teach.selected')}</span>
          <div className="h-6 w-px bg-slate-700"></div>
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <button
              onClick={() => setSelectedTeacherIds(new Set())}
              className="px-4 py-2 hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
            >
              {t('teach.cancel')}
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg shadow-lg transition-all text-sm font-bold flex items-center"
            >
              <Trash2 size={16} className="me-2" />
              {t('teach.delete_selection')}
            </button>
            <button
              onClick={() => setIsBulkFinancialModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg transition-all text-sm font-bold flex items-center"
            >
              <DollarSign size={16} className="me-2" />
              {t('teach.bulk_financial_update') || 'Update Financials'}
            </button>
          </div>
        </div>
      )
      }

      {/* Bulk Financial Update Modal */}
      <Modal
        isOpen={isBulkFinancialModalOpen}
        onClose={() => setIsBulkFinancialModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <DollarSign size={20} className="text-blue-500" />
            {t('teach.bulk_financial_update') || 'Bulk Financial Update'}
          </div>
        }
        isDirty={Object.values(bulkFinancialData).some(val => val !== '' && val !== 'FLAT' && val !== 'PERCENTAGE')}
        t={t}
        maxWidth="max-w-md"
      >
        <p className="text-sm text-slate-500 mb-6 flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg text-blue-700 dark:text-blue-300">
          <CheckCircle2 size={14} />
          {t('teach.applying_to_teachers_prefix') || 'Applying to'} {selectedTeacherIds.size} {t('teach.teachers_word') || 'teachers'}
        </p>

        <form onSubmit={handleBulkFinancialUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teach.cost_per_position') || 'Cost per position'} ({settings.currency})</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
              value={bulkFinancialData.cost}
              onChange={e => setBulkFinancialData({ ...bulkFinancialData, cost: e.target.value })}
              placeholder={t('teach.leave_blank_no_change') || 'Leave blank to skip'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teach.vat_type') || 'VAT Type'}</label>
              <select
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
                value={bulkFinancialData.vatType}
                onChange={e => setBulkFinancialData({ ...bulkFinancialData, vatType: e.target.value as any })}
              >
                <option value="PERCENTAGE">% {t('teach.percentage')}</option>
                <option value="FLAT">{settings.currency} {t('teach.flat_amount')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teach.vat_value') || 'VAT Value'}</label>
              <input
                type="number"
                min="0"
                step="0.1"
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
                value={bulkFinancialData.vatValue}
                onChange={e => setBulkFinancialData({ ...bulkFinancialData, vatValue: e.target.value })}
                placeholder={t('teach.leave_blank_no_change') || 'Leave blank to skip'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teach.overhead_type') || 'Overhead Type'}</label>
              <select
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
                value={bulkFinancialData.overheadType}
                onChange={e => setBulkFinancialData({ ...bulkFinancialData, overheadType: e.target.value as any })}
              >
                <option value="PERCENTAGE">% {t('teach.percentage')}</option>
                <option value="FLAT">{settings.currency} {t('teach.flat_amount')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teach.overhead_fee') || 'Overhead Fee'}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
                value={bulkFinancialData.overheadFee}
                onChange={e => setBulkFinancialData({ ...bulkFinancialData, overheadFee: e.target.value })}
                placeholder={t('teach.leave_blank_no_change') || 'Leave blank to skip'}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('teach.social_benefits') || 'Social Benefits'} ({settings.currency})</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
              value={bulkFinancialData.socialBenefits}
              onChange={e => setBulkFinancialData({ ...bulkFinancialData, socialBenefits: e.target.value })}
              placeholder={t('teach.leave_blank_no_change') || 'Leave blank to skip'}
            />
          </div>

          <div className="flex justify-end space-x-3 rtl:space-x-reverse pt-4 border-t border-slate-100 dark:border-slate-800 mt-6">
            <button
              type="button"
              onClick={() => setIsBulkFinancialModalOpen(false)}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors font-medium text-sm"
            >
              {t('teach.cancel')}
            </button>
            <button
              type="submit"
              className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-6 py-2 rounded-lg font-bold text-sm transition-all"
            >
              {t('teach.apply_updates') || 'Apply Updates'}
            </button>
          </div>
        </form>
      </Modal>
    </div >
  );
};