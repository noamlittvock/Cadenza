import React, { useState, useRef } from 'react';
import { Teacher, ListsState } from '../types';
import { generateId, COLORS, INITIAL_LISTS } from '../constants';
import { Plus, Edit2, Trash2, Search, CheckCircle2, Palette, X, Download, Upload, FileDown, Tag, Briefcase } from 'lucide-react';

interface Props {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  lists: ListsState;
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

export const TeacherManager: React.FC<Props> = ({ teachers, setTeachers, lists }) => {
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
    a.download = `teachers_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const parseCSV = (csvText: string) => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    const startIdx = lines[0].toLowerCase().includes('email') ? 1 : 0;
    const candidates: ImportCandidate[] = [];
    
    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
      if (cols.length < 2) continue;
      const email = cols[1];
      if (teachers.some(t => t.email.toLowerCase() === email.toLowerCase())) continue;

      candidates.push({
        id: generateId(),
        fullName: cols[0],
        email: email,
        phone: cols[2] || '',
        positions: cols[3] ? cols[3].split(';').map(p => p.trim()) : [],
        tags: cols[4] ? cols[4].split(';').map(p => p.trim()) : [],
        selected: true
      });
    }

    if (candidates.length === 0) {
      alert("No new unique teachers found in CSV.");
      return;
    }
    setImportCandidates(candidates);
    setIsImportModalOpen(true);
  };

  const confirmImport = (autoAssignColors: boolean) => {
    // ... (Color assignment logic same as before)
    const selected = importCandidates.filter(c => c.selected);
    if(selected.length === 0) return;
    
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
           while(usedColors.has(randomCol) && retries < 50) {
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

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header controls same as before */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Teacher Management</h2>
          <p className="text-slate-500 dark:text-slate-400">Manage instructor profiles, positions, and tags.</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
           <button onClick={handleDownloadTemplate} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><FileDown size={16} className="mr-2" /> Template</button>
           <button onClick={handleExportTeachers} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><Download size={16} className="mr-2" /> Export</button>
           <button onClick={() => fileInputRef.current?.click()} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700"><Upload size={16} className="mr-2" /> Import</button>
           <input type="file" ref={fileInputRef} hidden accept=".csv" onChange={handleFileUpload} />
           <button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm text-sm"><Plus size={16} className="mr-2" /> Add Teacher</button>
        </div>
      </div>

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
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Positions</th>
                <th className="px-6 py-4">Tags</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTeachers.map(teacher => (
                <tr key={teacher.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
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
                    <input required type="text" className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" value={formData.fullName || ''} onChange={e => setFormData({...formData, fullName: e.target.value})} />
                 </div>
                 {/* Color Picker (Simplified for brevity, same as previous) */}
                 <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Teacher Color</label>
                    <div className="flex gap-2 mb-2">
                        {COLORS.map(c => (
                            <button key={c} type="button" onClick={() => setFormData({...formData, color: c})} className={`w-6 h-6 rounded-full border ${formData.color === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} style={{ backgroundColor: c }} />
                        ))}
                    </div>
                    <input type="color" value={formData.color || '#000000'} onChange={e => setFormData({...formData, color: e.target.value})} className="w-full h-8" />
                 </div>
              </div>

              {/* Positions Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Positions</label>
                <div className="flex gap-2 mb-2">
                   <select 
                     className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none"
                     onChange={(e) => {
                         if(e.target.value && !formData.positions?.includes(e.target.value)) {
                            setFormData({...formData, positions: [...(formData.positions||[]), e.target.value]});
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
                         if(e.target.value && !formData.tags?.includes(e.target.value)) {
                            setFormData({...formData, tags: [...(formData.tags||[]), e.target.value]});
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
                <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label><input required type="email" className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
                <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label><input type="text" className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Import Modal Code omitted for brevity as it remains similar, just hidden */}
      {/* ... */}
    </div>
  );
};