import React, { useState } from 'react';
import { Student, Teacher, AppSettings, ParentContact } from '../types';
import { generateId, TRANSLATIONS } from '../constants';
import { Plus, Edit2, Trash2, Search, Menu, GraduationCap, X, Link as LinkIcon, Star } from 'lucide-react';
import { Modal } from './Modal';

interface Props {
    students: Student[];
    setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
    teachers: Teacher[];
    onMobileMenuOpen?: () => void;
    embedded?: boolean;
    settings: AppSettings;
}

export const StudentManager: React.FC<Props> = ({ students, setStudents, teachers, onMobileMenuOpen, embedded = false, settings }) => {
    const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Student>>({ parents: [], instruments: [], lessonDuration: 45 });
    const [initialFormData, setInitialFormData] = useState<Partial<Student>>({ parents: [], instruments: [], lessonDuration: 45 });

    // Search and Filter State
    const [search, setSearch] = useState('');
    const [filterTeacher, setFilterTeacher] = useState<string>('ALL');

    // Bulk Selection 
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // --- Instrument Helpers ---
    const addInstrument = () => {
        const newInst = { id: generateId(), name: '', teacherId: teachers[0]?.id || '' };
        setFormData({ ...formData, instruments: [...(formData.instruments || []), newInst] });
    };

    const updateInstrument = (id: string, updates: Partial<{ name: string, teacherId: string }>) => {
        setFormData({
            ...formData,
            instruments: (formData.instruments || []).map(i => i.id === id ? { ...i, ...updates } : i)
        });
    };

    const removeInstrument = (id: string) => {
        setFormData({
            ...formData,
            instruments: (formData.instruments || []).filter(i => i.id !== id)
        });
    };

    // --- Parent Contact Helpers ---
    const addParentContact = () => {
        const newContact: ParentContact = { id: generateId(), name: '', relation: '', phone: '', email: '' };
        setFormData({ ...formData, parents: [...(formData.parents || []), newContact] });
    };

    const updateParentContact = (id: string, updates: Partial<ParentContact>) => {
        setFormData({
            ...formData,
            parents: (formData.parents || []).map(p => p.id === id ? { ...p, ...updates } : p)
        });
    };

    const removeParentContact = (id: string) => {
        setFormData({
            ...formData,
            parents: (formData.parents || []).filter(p => p.id !== id)
        });
    };

    // --- Main Management ---
    const handleOpenModal = (student?: Student) => {
        if (student) {
            setEditingId(student.id);
            setFormData(student);
            setInitialFormData(student);
        } else {
            setEditingId(null);
            const data: Partial<Student> = {
                fullName: '',
                instruments: [{ id: generateId(), name: '', teacherId: teachers[0]?.id || '' }],
                lessonDuration: 45,
                parents: [],
                linkedFolderUrl: '',
                notes: ''
            };
            setFormData(data);
            setInitialFormData(data);
        }
        setIsModalOpen(true);
    };

    const handleDelete = (id: string) => {
        if (window.confirm(t('student.confirm_delete'))) {
            setStudents(prev => prev.filter(s => s.id !== id));
        }
    };

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        if (window.confirm(`${t('student.confirm_bulk_prefix')} ${selectedIds.size} ${t('student.students_word')}?`)) {
            setStudents(prev => prev.filter(s => !selectedIds.has(s.id)));
            setSelectedIds(new Set());
        }
    };

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!formData.fullName || !formData.instruments || formData.instruments.length === 0) return;

        if (editingId) {
            setStudents(prev => prev.map(s => s.id === editingId ? { ...s, ...formData } as Student : s));
        } else {
            const newStudent: Student = {
                id: generateId(),
                fullName: formData.fullName,
                instruments: formData.instruments || [],
                lessonDuration: formData.lessonDuration || 45,
                parents: formData.parents || [],
                linkedFolderUrl: formData.linkedFolderUrl || '',
                notes: formData.notes || ''
            };
            setStudents(prev => [...prev, newStudent]);
        }

        setIsModalOpen(false);
    };

    // Filtering
    const filteredStudents = students.filter(s => {
        const matchesSearch = s.fullName.toLowerCase().includes(search.toLowerCase()) ||
            (s.instruments || []).some(inst => inst.name.toLowerCase().includes(search.toLowerCase()));

        if (!matchesSearch) return false;
        if (filterTeacher !== 'ALL' && !(s.instruments || []).some(inst => inst.teacherId === filterTeacher)) return false;

        return true;
    });

    // Table Selection Math
    const isAllSelected = filteredStudents.length > 0 && filteredStudents.every(s => selectedIds.has(s.id));
    const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredStudents.map(s => s.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    return (
        <div className={`${embedded ? 'h-full overflow-auto custom-scrollbar' : ''} p-8 max-w-6xl mx-auto pb-24 relative`}>
            {/* Header for non-embedded mode */}
            {!embedded && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div className="flex items-center gap-3">
                        {onMobileMenuOpen && (
                            <button onClick={onMobileMenuOpen} className="p-2 -ms-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg lg:hidden">
                                <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                            </button>
                        )}
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <GraduationCap className="text-blue-500" /> {t('nav.students')}
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400">{t('student.subtitle')}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        <button onClick={() => handleOpenModal()} className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center text-sm">
                            <Plus size={16} className="me-2" /> {t('student.add_new_student')}
                        </button>
                    </div>
                </div>
            )}

            {/* Embedded toolbars */}
            {embedded && (
                <div className="flex flex-wrap gap-2 items-center mb-6">
                    <div className="flex-1" />
                    <button onClick={() => handleOpenModal()} className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center text-sm">
                        <Plus size={16} className="me-2" /> {t('student.add_new_student')}
                    </button>
                </div>
            )}

            {/* Main Container */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                {/* Filter Bar */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row items-center gap-4">
                    <div className="relative flex-1 w-full">
                        <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder={t('placeholder.search_teachers')} // good enough reuse
                            className="ps-10 pe-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm w-full text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <select
                            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 max-w-[200px]"
                            value={filterTeacher}
                            onChange={e => setFilterTeacher(e.target.value)}
                        >
                            <option value="ALL">{t('student.all_teachers')}</option>
                            {teachers.map(tData => (
                                <option key={tData.id} value={tData.id}>{tData.fullName}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Selected Actions Bar */}
                {selectedIds.size > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900/30 px-6 py-3 flex items-center justify-between border-b border-blue-100 dark:border-blue-800">
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            {selectedIds.size} {t('student.students_word')}
                        </span>
                        <button onClick={handleBulkDelete} className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 font-medium">
                            {t('student.delete_selection')}
                        </button>
                    </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-start text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-medium">
                            <tr>
                                <th className="px-6 py-4 w-12">
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        ref={el => { if (el) el.indeterminate = isIndeterminate; }}
                                        onChange={handleSelectAll}
                                        className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                                    />
                                </th>
                                <th className="px-6 py-4">{t('student.col_name')}</th>
                                <th className="px-6 py-4">{t('student.col_instrument')} / {t('student.col_teacher')}</th>
                                <th className="px-6 py-4">{t('student.col_parents')}</th>
                                <th className="px-6 py-4 text-end">{t('student.col_actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredStudents.map(student => {
                                return (
                                    <tr key={student.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${selectedIds.has(student.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(student.id)}
                                                onChange={() => toggleSelection(student.id)}
                                                className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white flex flex-col">
                                            <span className="flex items-center gap-1.5">
                                                {student.fullName}
                                            </span>
                                            <div className="text-xs text-slate-400 mt-0.5">{t('student.duration_min').replace('{min}', String(student.lessonDuration))}</div>
                                            {student.linkedFolderUrl && (
                                                <a href={student.linkedFolderUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 flex items-center gap-1 mt-1 hover:underline">
                                                    <LinkIcon size={12} /> {t('student.linked_folder')}
                                                </a>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                                            <div className="flex flex-col gap-2">
                                                {(student.instruments || []).map(inst => {
                                                    const assignedTeacher = teachers.find(t => t.id === inst.teacherId);
                                                    return (
                                                        <div key={inst.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded border border-slate-100 dark:border-slate-700">
                                                            <span className="font-medium text-slate-700 dark:text-slate-200">{inst.name || 'Unknown'}</span>
                                                            <span className="hidden sm:inline text-slate-300 dark:text-slate-600">•</span>
                                                            {assignedTeacher ? (
                                                                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                                                    <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[8px] text-white font-bold" style={{ backgroundColor: assignedTeacher.color }}>
                                                                        {assignedTeacher.fullName.charAt(0)}
                                                                    </div>
                                                                    <span className="text-xs">{assignedTeacher.fullName}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-slate-400 italic">Unassigned</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {(!student.instruments || student.instruments.length === 0) && <span className="text-xs text-slate-400">-</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                                            <div className="flex flex-col gap-1">
                                                {student.parents.map((p, i) => (
                                                    <div key={i} className="text-xs">
                                                        <span className="font-semibold">{p.name}</span> ({p.relation})<br />
                                                        {p.phone} {p.email ? ` | ${p.email}` : ''}
                                                    </div>
                                                ))}
                                                {student.parents.length === 0 && <span className="text-xs text-slate-400">-</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-end space-x-2 rtl:space-x-reverse">
                                            <button onClick={() => handleOpenModal(student)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(student.id)} className="text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingId ? t('student.edit_student') : t('student.add_new_student')}
                isDirty={JSON.stringify(formData) !== JSON.stringify(initialFormData)}
                onSave={(e?: React.FormEvent) => handleSubmit(e)}
                t={t}
                maxWidth="max-w-2xl"
                footerContent={
                    <div className="flex justify-end space-x-3 rtl:space-x-reverse w-full">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">{t('teach.cancel')}</button>
                        <button type="button" onClick={() => handleSubmit()} className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg">{t('teach.save')}</button>
                    </div>
                }
            >
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Name */}
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('student.col_name')} (Full Name)</label>
                            <input required type="text" className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" value={formData.fullName || ''} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
                        </div>

                        {/* Duration */}
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('student.col_duration')}</label>
                            <select className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" value={formData.lessonDuration || 45} onChange={e => setFormData({ ...formData, lessonDuration: parseInt(e.target.value, 10) })}>
                                <option value={30}>30 min</option>
                                <option value={45}>45 min</option>
                                <option value={60}>60 min</option>
                                <option value={90}>90 min</option>
                            </select>
                        </div>

                        {/* Linked Folder URL */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('student.linked_folder')}</label>
                            <div className="relative">
                                <LinkIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 rtl:right-3 rtl:left-auto" />
                                <input type="url" placeholder="https://drive.google.com/..." className="w-full ps-10 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" value={formData.linkedFolderUrl || ''} onChange={e => setFormData({ ...formData, linkedFolderUrl: e.target.value })} />
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('student.notes')}</label>
                            <textarea rows={2} className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                        </div>
                    </div>

                    {/* Instruments Array */}
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="font-bold text-sm text-slate-800 dark:text-white">{t('student.col_instrument')}s</h4>
                            <button type="button" onClick={addInstrument} className="text-xs btn-cadenza bg-cadenza-gradient texture-cadenza text-white px-3 py-1.5 rounded-lg flex items-center transition-colors shadow-cadenza-soft">
                                <Plus size={12} className="me-1" /> Add Instrument
                            </button>
                        </div>

                        <div className="space-y-3">
                            {(formData.instruments || []).map((inst) => (
                                <div key={inst.id} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 relative flex flex-col gap-3">
                                    <button type="button" onClick={() => removeInstrument(inst.id)} className="absolute top-3 end-3 text-slate-400 hover:text-red-500 bg-white dark:bg-slate-900 rounded-lg p-1 shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
                                        <X size={14} />
                                    </button>

                                    <div className="grid grid-cols-2 gap-3 pe-8">
                                        <div className="col-span-2 md:col-span-1">
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('student.instrument')}</label>
                                            <input required placeholder="e.g. Piano, Violin" className="text-sm w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500" value={inst.name} onChange={e => updateInstrument(inst.id, { name: e.target.value })} />
                                        </div>
                                        <div className="col-span-2 md:col-span-1">
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('student.col_teacher')}</label>
                                            <select required className="text-sm w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500" value={inst.teacherId || ''} onChange={e => updateInstrument(inst.id, { teacherId: e.target.value })}>
                                                <option value="" disabled>-- Select Teacher --</option>
                                                {teachers.map(tData => (
                                                    <option key={tData.id} value={tData.id}>{tData.fullName}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(formData.instruments || []).length === 0 && (
                                <div className="text-center py-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 dark:text-slate-400">
                                    No instruments assigned. Click "Add Instrument" to link a teacher.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Parents Array */}
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="font-bold text-sm text-slate-800 dark:text-white">{t('student.parents_label')}</h4>
                            <button type="button" onClick={addParentContact} className="text-xs btn-cadenza bg-cadenza-gradient texture-cadenza text-white px-3 py-1.5 rounded-lg flex items-center transition-colors shadow-cadenza-soft">
                                <Plus size={12} className="me-1" /> {t('student.add_parent')}
                            </button>
                        </div>

                        <div className="space-y-3">
                            {(formData.parents || []).map((parent, index) => (
                                <div key={parent.id} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 relative flex flex-col gap-3">
                                    <button type="button" onClick={() => removeParentContact(parent.id)} className="absolute top-3 end-3 text-slate-400 hover:text-red-500 bg-white dark:bg-slate-900 rounded-lg p-1 shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
                                        <X size={14} />
                                    </button>

                                    <div className="grid grid-cols-2 gap-3 pe-8">
                                        <div className="col-span-2 sm:col-span-1">
                                            <input placeholder={t('student.parent_name')} className="text-sm w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500" value={parent.name} onChange={e => updateParentContact(parent.id, { name: e.target.value })} />
                                        </div>
                                        <div className="col-span-2 sm:col-span-1">
                                            <input placeholder={t('student.parent_relation')} className="text-sm w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500" value={parent.relation} onChange={e => updateParentContact(parent.id, { relation: e.target.value })} />
                                        </div>
                                        <div className="col-span-2 sm:col-span-1">
                                            <input type="tel" placeholder={t('teach.phone')} className="text-sm w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500" value={parent.phone} onChange={e => updateParentContact(parent.id, { phone: e.target.value })} />
                                        </div>
                                        <div className="col-span-2 sm:col-span-1">
                                            <input type="email" placeholder={t('teach.email')} className="text-sm w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500" value={parent.email} onChange={e => updateParentContact(parent.id, { email: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(formData.parents || []).length === 0 && (
                                <div className="text-center py-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 dark:text-slate-400">
                                    No parents added. Click "Add Parent" to input contact details.
                                </div>
                            )}
                        </div>
                    </div>

                </form>
            </Modal>

        </div>
    );
};
