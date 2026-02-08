import React, { useState, useRef } from 'react';
import { Teacher, ListsState } from '../types';
import { generateId, COLORS, INITIAL_LISTS } from '../constants';
import { Plus, Edit2, Trash2, Search, CheckCircle2, Palette, X, Download, Upload, FileDown, Tag, Briefcase, Menu } from 'lucide-react';

interface Props {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  lists: ListsState;
  setLists?: React.Dispatch<React.SetStateAction<ListsState>>;
  onMobileMenuOpen?: () => void;
  embedded?: boolean;
}

interface ImportCandidate {
  id: string; // Temporary ID
  fullName: string;
  positions: string[];
  tags: string[];
  phone: string;
  email: string;
  selected: boolean;
}

export const TeacherManager: React.FC<Props> = ({ teachers, setTeachers, lists, setLists, onMobileMenuOpen, embedded = false }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Teacher>>({ positions: [], tags: [] });
  const [positionInput, setPositionInput] = useState('');
  const [tagInput, setTagInput] = useState('');

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

  // --- Main Teacher Management ---

  const handleOpenModal = (teacher?: Teacher) => {
    setError(null);
    if (teacher) {
      setEditingId(teacher.id);
      setFormData(teacher);
    } else {
      setEditingId(null);
      // Pick first available color or default
      const usedColors = teachers.map(t => t.color);
      const availableColor = COLORS.find(c => !usedColors.includes(c)) || COLORS[0];

      setFormData({ positions: [], tags: [], color: availableColor });
    }
    setIsModalOpen(true);
  };

  const handleAddPosition = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !positionInput.trim()) return;
    e.preventDefault();
    if (formData.positions && !formData.positions.includes(positionInput.trim())) {
      setFormData({ ...formData, positions: [...(formData.positions || []), positionInput.trim()] });
    }
    setPositionInput('');
  };

  const removePosition = (posToRemove: string) => {
    setFormData({ ...formData, positions: formData.positions?.filter(p => p !== posToRemove) });
  };

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

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this teacher? Associated events will show warnings.')) {
      setTeachers(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.fullName || !formData.email || !formData.color) return;

    // Validation: Check if color is taken by another teacher
    const colorTaken = teachers.some(t =>
      t.color.toLowerCase() === formData.color!.toLowerCase() && t.id !== editingId
    );

    if (colorTaken) {
      setError("This color is already assigned to another teacher. Please select a unique color.");
      return;
    }

    if (editingId) {
      setTeachers(prev => prev.map(t => t.id === editingId ? { ...t, ...formData } as Teacher : t));
    } else {
      const newTeacher: Teacher = {
        id: generateId(),
        fullName: formData.fullName!,
        positions: formData.positions || [],
        tags: formData.tags || [],
        phone: formData.phone || '',
        email: formData.email!,
        color: formData.color!
      };
      setTeachers(prev => [...prev, newTeacher]);
    }
    setIsModalOpen(false);
  };

  // --- CSV Import / Export ---
  // ... (Code mostly same as before, updated to include Tags in CSV structure)

  const handleDownloadTemplate = () => {
    const headers = "FullName,Email,Phone,Positions(semicolon sep),Tags(semicolon sep)";
    const blob = new Blob([headers], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'teacher_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportTeachers = () => {
    const headers = "ID,FullName,Email,Phone,Color,Positions,Tags";
    const rows = teachers.map(t =>
      `"${t.id}","${t.fullName}","${t.email}","${t.phone}","${t.color}","${t.positions.join(';')}","${t.tags.join(';')}"`
    );
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
    console.log("Starting file read...");

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setUploadProgress(100);
      // Give UI a moment to show 100% before parsing
      setTimeout(() => {
        parseCSV(text);
        setIsAnalyzing(false);
        setUploadProgress(0);
      }, 500);
    };

    reader.onerror = () => {
      alert("Error reading file");
      setIsAnalyzing(false);
      setUploadProgress(0);
    };

    // 'UTF-8' is default but explicit for clarity regarding Hebrew support
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const parseCSV = (csvText: string) => {
    console.log("Parsing CSV...", csvText.substring(0, 100)); // Log first 100 chars
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    // More robust header detection: check if first line looks like header
    const firstLineCols = lines[0].toLowerCase().split(',');
    const hasHeader = firstLineCols.some(c => c.includes('email') || c.includes('name'));
    const startIdx = hasHeader ? 1 : 0;

    const candidates: ImportCandidate[] = [];

    for (let i = startIdx; i < lines.length; i++) {
      // Handle potentially quoted CSV fields if simple split fails, but simple split is usually okay for simple exports.
      // We will stick to split(',') but trim extra quotes.
      const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());

      // Filter out garbage rows (e.g. ",,,," or empty strings)
      // Check if at least Name OR Email is present and has length > 1
      const name = cols[0];
      const email = cols[1];

      if ((!name || name.length < 2) && (!email || email.length < 3)) {
        continue;
      }

      if (teachers.some(t => t.email.toLowerCase() === email.toLowerCase())) continue;

      candidates.push({
        id: generateId(),
        fullName: name || 'Unknown',
        email: email || '',
        phone: cols[2] || '',
        positions: cols[3] ? cols[3].split(';').map(p => p.trim()).filter(p => p) : [],
        tags: cols[4] ? cols[4].split(';').map(p => p.trim()).filter(p => p) : [],
        selected: true
      });
    }

    if (candidates.length === 0) {
      alert("No valid or new unique teachers found in CSV.\nPlease ensure the file contains columns: Name, Email, Phone, Positions, Tags");
      return;
    }
    setImportCandidates(candidates);
    setIsImportModalOpen(true);
  };

  const confirmImport = (autoAssignColors: boolean) => {
    // ... (Color assignment logic same as before)
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

      return {
        id: generateId(),
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        positions: c.positions.length > 0 ? c.positions : ['Instructor'],
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
        // Check Positions
        t.positions.forEach(p => {
          if (p && !allNewPositions.has(p)) {
            allNewPositions.add(p);
            changed = true;
          }
        });
        // Check Tags
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
      // Select all currently filtered teachers
      const allIds = new Set(filteredTeachers.map(t => t.id));
      setSelectedTeacherIds(allIds);
    } else {
      setSelectedTeacherIds(new Set());
    }
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedTeacherIds.size} teachers? This cannot be undone.`)) {
      setTeachers(prev => prev.filter(t => !selectedTeacherIds.has(t.id)));
      setSelectedTeacherIds(new Set());
    }
  };

  const isAllSelected = filteredTeachers.length > 0 && filteredTeachers.every(t => selectedTeacherIds.has(t.id));
  const isIndeterminate = selectedTeacherIds.size > 0 && !isAllSelected;

  return (
    <div className={`${embedded ? 'h-full overflow-auto' : ''} p-8 max-w-6xl mx-auto pb-24 relative`}>
      {/* Header controls - hidden when embedded */}
      {!embedded && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            {onMobileMenuOpen && (
              <button
                onClick={onMobileMenuOpen}
                className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden"
                title="Open Menu"
              >
                <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Teacher Management</h2>
              <p className="text-slate-500 dark:text-slate-400">Manage instructor profiles, positions, and tags.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {isAnalyzing && (
              <div className="mr-3 flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-800">
                <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{uploadProgress}%</span>
              </div>
            )}
            <button onClick={handleDownloadTemplate} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><FileDown size={16} className="mr-2" /> Template</button>
            <button onClick={handleExportTeachers} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><Download size={16} className="mr-2" /> Export</button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"><Upload size={16} className="mr-2" /> Import</button>
            <input type="file" ref={fileInputRef} hidden accept=".csv" onChange={handleFileUpload} />
            <button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm text-sm"><Plus size={16} className="mr-2" /> Add Teacher</button>
          </div>
        </div>
      )}

      {/* Toolbar for embedded mode */}
      {embedded && (
        <div className="flex flex-wrap gap-2 items-center mb-6">
          {isAnalyzing && (
            <div className="mr-3 flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-800">
              <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{uploadProgress}%</span>
            </div>
          )}
          <button onClick={handleDownloadTemplate} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><FileDown size={16} className="mr-2" /> Template</button>
          <button onClick={handleExportTeachers} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><Download size={16} className="mr-2" /> Export</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"><Upload size={16} className="mr-2" /> Import</button>
          <input type="file" ref={fileInputRef} hidden accept=".csv" onChange={handleFileUpload} />
          <div className="flex-1" />
          <button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm text-sm"><Plus size={16} className="mr-2" /> Add Teacher</button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Filters Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search teachers..."
              className="pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm w-full text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <select
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm px-3 py-2 outline-none"
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value as any); setFilterValue(''); }}
            >
              <option value="ALL">All Categories</option>
              <option value="POSITION">Filter by Position</option>
              <option value="TAG">Filter by Tag</option>
            </select>

            {filterType !== 'ALL' && (
              <select
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm px-3 py-2 outline-none max-w-[150px]"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
              >
                <option value="">Select {filterType === 'POSITION' ? 'Position' : 'Tag'}...</option>
                {filterType === 'POSITION'
                  ? activeLists.positions.map(p => <option key={p} value={p}>{p}</option>)
                  : activeLists.tags.map(t => <option key={t} value={t}>{t}</option>)
                }
              </select>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
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
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Positions</th>
                <th className="px-6 py-4">Tags</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-right">Actions</th>
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
                      className="w-8 h-8 rounded-full flex items-center justify-center mr-3 shadow-sm border border-slate-200 dark:border-slate-700 text-white font-bold text-xs"
                      style={{ backgroundColor: teacher.color }}
                    >
                      {teacher.fullName.charAt(0)}
                    </div>
                    {teacher.fullName}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    <div className="flex flex-wrap gap-1">
                      {teacher.positions.map((pos, i) => (
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
                          <Tag size={10} className="mr-1" />
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
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => handleOpenModal(teacher)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(teacher.id)} className="text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Add Teacher Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg p-6 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">{editingId ? 'Edit Teacher' : 'Add New Teacher'}</h3>
            {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                  <input required type="text" className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" value={formData.fullName || ''} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
                </div>
                {/* Color Picker (Simplified for brevity, same as previous) */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Teacher Color</label>
                  <div className="flex gap-2 mb-2">
                    {COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setFormData({ ...formData, color: c })} className={`w-6 h-6 rounded-full border ${formData.color === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <input type="color" value={formData.color || '#000000'} onChange={e => setFormData({ ...formData, color: e.target.value })} className="w-full h-8" />
                </div>
              </div>

              {/* Positions Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Positions</label>
                <div className="flex gap-2 mb-2">
                  <select
                    className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
                    onChange={(e) => {
                      if (e.target.value && !formData.positions?.includes(e.target.value)) {
                        setFormData({ ...formData, positions: [...(formData.positions || []), e.target.value] });
                      }
                      e.target.value = '';
                    }}
                  >
                    <option value="">Select from list...</option>
                    {activeLists.positions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input
                    type="text"
                    className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
                    value={positionInput}
                    onChange={e => setPositionInput(e.target.value)}
                    onKeyDown={handleAddPosition}
                    placeholder="Or type new..."
                  />
                  <button type="button" onClick={handleAddPosition} className="bg-slate-200 dark:bg-slate-700 px-3 py-2 rounded-lg">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.positions?.map((pos, idx) => (
                    <span key={idx} className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs flex items-center border border-slate-200 dark:border-slate-700 dark:text-slate-300">
                      {pos} <button type="button" onClick={() => removePosition(pos)} className="ml-1 hover:text-red-500"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Tags Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tags</label>
                <div className="flex gap-2 mb-2">
                  <select
                    className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
                    onChange={(e) => {
                      if (e.target.value && !formData.tags?.includes(e.target.value)) {
                        setFormData({ ...formData, tags: [...(formData.tags || []), e.target.value] });
                      }
                      e.target.value = '';
                    }}
                  >
                    <option value="">Select from list...</option>
                    {activeLists.tags.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="text"
                    className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="Or type new..."
                  />
                  <button type="button" onClick={handleAddTag} className="bg-slate-200 dark:bg-slate-700 px-3 py-2 rounded-lg">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.tags?.map((tag, idx) => (
                    <span key={idx} className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded text-xs flex items-center border border-blue-200 dark:border-blue-800">
                      {tag} <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-red-500"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Email/Phone Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label><input required type="email" className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label><input type="text" className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl p-6 border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col">
            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">Import Teachers</h3>
            <p className="text-sm text-slate-500 mb-4">Found {importCandidates.length} unique teachers. Select the ones you want to import.</p>

            <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg mb-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 sticky top-0">
                  <tr>
                    <th className="p-3 w-8"><input type="checkbox" checked={importCandidates.every(c => c.selected)} onChange={e => setImportCandidates(prev => prev.map(c => ({ ...c, selected: e.target.checked })))} /></th>
                    <th className="p-3 text-slate-500 font-medium">Name</th>
                    <th className="p-3 text-slate-500 font-medium">Email</th>
                    <th className="p-3 text-slate-500 font-medium">Positions</th>
                    <th className="p-3 text-slate-500 font-medium">Tags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {importCandidates.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="p-3"><input type="checkbox" checked={c.selected} onChange={e => setImportCandidates(prev => prev.map(p => p.id === c.id ? { ...p, selected: e.target.checked } : p))} /></td>
                      <td className="p-3 font-medium text-slate-900 dark:text-white">{c.fullName}</td>
                      <td className="p-3 text-slate-500">{c.email}</td>
                      <td className="p-3 text-slate-500">{c.positions.join(', ')}</td>
                      <td className="p-3 text-slate-500">{c.tags.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800">
              {/* Auto Assign Colors Checkbox - Mocked as always active or handled by confirm for simplicity, but could add state if needed. Passing true for now. */}
              <div className="text-xs text-slate-400">
                * Colors will be auto-assigned
              </div>
              <div className="flex space-x-3">
                <button onClick={() => setIsImportModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                <button
                  onClick={() => confirmImport(true)}
                  disabled={importCandidates.filter(c => c.selected).length === 0}
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Import {importCandidates.filter(c => c.selected).length} Teachers
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Bulk Actions Bar */}
      {selectedTeacherIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center space-x-6 z-40 animate-in slide-in-from-bottom-4">
          <span className="font-medium">{selectedTeacherIds.size} Selected</span>
          <div className="h-6 w-px bg-slate-700"></div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSelectedTeacherIds(new Set())}
              className="px-4 py-2 hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg shadow-lg transition-all text-sm font-bold flex items-center"
            >
              <Trash2 size={16} className="mr-2" />
              Delete Selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
};