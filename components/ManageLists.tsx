import React, { useState, useRef } from 'react';
import { ListsState, AppSettings, CategoryItem, SubCategoryItem } from '../types';
import { Plus, X, Tag, Briefcase, Bookmark, Download, Upload, FileDown, CheckCircle2, Menu, Edit2, Check, ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Modal } from './Modal';

interface Props {
  lists: ListsState;
  setLists: React.Dispatch<React.SetStateAction<ListsState>>;
  settings?: AppSettings;
  onMobileMenuOpen?: () => void;
  embedded?: boolean;
}

const ListEditor = ({
  title,
  items,
  onAdd,
  onRemove,
  icon: Icon,
  emptyLabel,
  addPlaceholder
}: {
  title: string;
  items: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  icon: React.ElementType;
  emptyLabel?: string;
  addPlaceholder?: string;
}) => {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (input.trim() && !items.includes(input.trim())) {
      onAdd(input.trim());
      setInput('');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col h-full min-h-[400px]">
      <div className="flex items-center space-x-3 rtl:space-x-reverse mb-4">
        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
          <Icon size={20} />
        </div>
        <h3 className="font-bold text-lg text-slate-800 dark:text-white">{title}</h3>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={addPlaceholder || `Add ${title}...`}
          className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleAdd}
          disabled={!input.trim()}
          className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft px-3 py-2 rounded-lg"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pe-1 custom-scrollbar max-h-[300px]">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 group">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item}</span>
            <button
              onClick={() => onRemove(item)}
              className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-4 italic">{emptyLabel || 'No items found'}</div>
        )}
      </div>
    </div>
  );
};

const CategoryEditor = ({
  categories = [],
  onUpdate,
  t
}: {
  categories: CategoryItem[];
  onUpdate: (categories: CategoryItem[]) => void;
  t: (key: string) => string;
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  const [newSubName, setNewSubName] = useState<Record<string, string>>({});
  const [editingSubId, setEditingSubId] = useState<{ catId: string, subId: string } | null>(null);
  const [editSubName, setEditSubName] = useState('');

  // Top-level Categories
  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    const newCat: CategoryItem = {
      id: `cat-${Date.now()}`,
      name: newCatName.trim(),
      subcategories: []
    };
    onUpdate([...categories, newCat]);
    setNewCatName('');
    setExpandedCats(prev => ({ ...prev, [newCat.id]: true }));
  };

  const handleRemoveCategory = (catId: string, catName: string) => {
    if (window.confirm(`${t('lists.remove_word')} "${catName}" ${t('lists.confirm_remove')}`)) {
      onUpdate(categories.filter(c => c.id !== catId));
    }
  };

  const handleSaveCategoryEdit = (catId: string) => {
    if (!editCatName.trim()) return;
    onUpdate(categories.map(c => c.id === catId ? { ...c, name: editCatName.trim() } : c));
    setEditingCatId(null);
  };

  const handleMoveCategory = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === categories.length - 1)) return;
    const newCats = [...categories];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newCats[index], newCats[swapIndex]] = [newCats[swapIndex], newCats[index]];
    onUpdate(newCats);
  };

  // Sub-categories
  const handleAddSub = (catId: string) => {
    const name = newSubName[catId]?.trim();
    if (!name) return;

    const newSub: SubCategoryItem = {
      id: `sub-${Date.now()}`,
      name
    };

    onUpdate(categories.map(c => {
      if (c.id === catId) {
        return { ...c, subcategories: [...(c.subcategories || []), newSub] };
      }
      return c;
    }));
    setNewSubName(prev => ({ ...prev, [catId]: '' }));
  };

  const handleRemoveSub = (catId: string, subId: string) => {
    onUpdate(categories.map(c => {
      if (c.id === catId) {
        return { ...c, subcategories: (c.subcategories || []).filter(s => s.id !== subId) };
      }
      return c;
    }));
  };

  const handleSaveSubEdit = (catId: string, subId: string) => {
    if (!editSubName.trim()) return;
    onUpdate(categories.map(c => {
      if (c.id === catId) {
        return {
          ...c,
          subcategories: (c.subcategories || []).map(s => s.id === subId ? { ...s, name: editSubName.trim() } : s)
        };
      }
      return c;
    }));
    setEditingSubId(null);
  };

  const handleMoveSub = (catId: string, index: number, direction: 'up' | 'down') => {
    onUpdate(categories.map(c => {
      if (c.id === catId) {
        const subs = [...(c.subcategories || [])];
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === subs.length - 1)) return c;
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        [subs[index], subs[swapIndex]] = [subs[swapIndex], subs[index]];
        return { ...c, subcategories: subs };
      }
      return c;
    }));
  };

  const toggleExpand = (catId: string) => {
    setExpandedCats(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col h-full min-h-[400px]">
      <div className="flex items-center space-x-3 rtl:space-x-reverse mb-4">
        <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
          <Bookmark size={20} />
        </div>
        <div>
          <h3 className="font-bold text-lg text-slate-800 dark:text-white">{t('lists.categories')}</h3>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
          placeholder={`${t('lists.add_placeholder').replace('{title}', t('lists.categories'))}...`}
          className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          onClick={handleAddCategory}
          disabled={!newCatName.trim()}
          className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft px-3 py-2 rounded-lg"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pe-1 custom-scrollbar max-h-[300px]">
        {categories.map((cat, idx) => (
          <div key={cat.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            {/* Category Header */}
            <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 flex items-center justify-between group">
              <div className="flex items-center flex-1 min-w-0 pr-2">
                <button
                  onClick={() => toggleExpand(cat.id)}
                  className="p-1 mr-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                >
                  {expandedCats[cat.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>

                {editingCatId === cat.id ? (
                  <div className="flex items-center flex-1 gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveCategoryEdit(cat.id)}
                      className="flex-1 w-full min-w-0 px-2 py-1 text-sm border rounded dark:bg-slate-900 dark:text-white dark:border-slate-600 outline-none focus:border-purple-500"
                    />
                    <button onClick={() => handleSaveCategoryEdit(cat.id)} className="text-green-600 p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"><Check size={14} /></button>
                    <button onClick={() => setEditingCatId(null)} className="text-red-500 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"><X size={14} /></button>
                  </div>
                ) : (
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                )}
              </div>

              {!editingCatId && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex flex-col mr-1">
                    <button disabled={idx === 0} onClick={() => handleMoveCategory(idx, 'up')} className="text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20"><ChevronDown size={12} className="rotate-180" /></button>
                    <button disabled={idx === categories.length - 1} onClick={() => handleMoveCategory(idx, 'down')} className="text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20"><ChevronDown size={12} /></button>
                  </div>
                  <button onClick={() => { setEditingCatId(cat.id); setEditCatName(cat.name); }} className="p-1 text-slate-400 hover:text-purple-600 rounded"><Edit2 size={14} /></button>
                  <button onClick={() => handleRemoveCategory(cat.id, cat.name)} className="p-1 text-slate-400 hover:text-red-500 rounded"><X size={16} /></button>
                </div>
              )}
            </div>

            {/* Sub-categories (collapsible) */}
            {expandedCats[cat.id] && (
              <div className="p-3 bg-white dark:bg-slate-900/50 space-y-2 border-t border-slate-200 dark:border-slate-700">
                {(cat.subcategories || []).map((sub, sIdx) => (
                  <div key={sub.id} className="flex justify-between items-center bg-slate-100/50 dark:bg-slate-800/50 px-3 py-1.5 rounded-md border border-slate-100 dark:border-slate-700/50 group/sub ml-5">
                    <div className="flex items-center flex-1 min-w-0 pr-2">
                      <CornerDownRight size={14} className="text-slate-300 dark:text-slate-600 mr-2 flex-shrink-0" />

                      {editingSubId?.subId === sub.id ? (
                        <div className="flex items-center flex-1 gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={editSubName}
                            onChange={(e) => setEditSubName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveSubEdit(cat.id, sub.id)}
                            className="flex-1 w-full min-w-0 px-2 py-0.5 text-sm border rounded dark:bg-slate-900 dark:text-white dark:border-slate-600 outline-none focus:border-purple-500"
                          />
                          <button onClick={() => handleSaveSubEdit(cat.id, sub.id)} className="text-green-600 p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"><Check size={14} /></button>
                          <button onClick={() => setEditingSubId(null)} className="text-red-500 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"><X size={14} /></button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400 truncate">{sub.name}</span>
                      )}
                    </div>

                    {!editingSubId && (
                      <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                        <div className="flex flex-col mr-1">
                          <button disabled={sIdx === 0} onClick={() => handleMoveSub(cat.id, sIdx, 'up')} className="text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20"><ChevronDown size={10} className="rotate-180" /></button>
                          <button disabled={sIdx === (cat.subcategories?.length || 0) - 1} onClick={() => handleMoveSub(cat.id, sIdx, 'down')} className="text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20"><ChevronDown size={10} /></button>
                        </div>
                        <button onClick={() => { setEditingSubId({ catId: cat.id, subId: sub.id }); setEditSubName(sub.name); }} className="p-1 text-slate-400 hover:text-purple-600 rounded"><Edit2 size={12} /></button>
                        <button onClick={() => handleRemoveSub(cat.id, sub.id)} className="p-1 text-slate-400 hover:text-red-500 rounded"><X size={14} /></button>
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex gap-2 ml-5 mt-2">
                  <input
                    type="text"
                    value={newSubName[cat.id] || ''}
                    onChange={(e) => setNewSubName(prev => ({ ...prev, [cat.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSub(cat.id)}
                    placeholder="Add sub-category..."
                    className="flex-1 w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <button
                    onClick={() => handleAddSub(cat.id)}
                    disabled={!(newSubName[cat.id] || '').trim()}
                    className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-4 italic">{t('lists.no_items_found') || 'No categories found'}</div>
        )}
      </div>
    </div>
  );
};

export const ManageLists: React.FC<Props> = ({ lists, setLists, settings, onMobileMenuOpen, embedded = false }) => {
  const t = (key: string) => (settings && TRANSLATIONS[settings.language]?.[key]) || TRANSLATIONS['en-US'][key] || key;
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [candidates, setCandidates] = useState<{ positions: string[], tags: string[], categories: string[] }>({ positions: [], tags: [], categories: [] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addItem = (key: keyof ListsState, item: string) => {
    setLists(prev => ({
      ...prev,
      [key]: [...(prev[key] as string[]), item]
    }));
  };

  const removeItem = (key: keyof ListsState, item: string) => {
    if (window.confirm(`${t('lists.remove_word')} "${item}" ${t('lists.confirm_remove')}`)) {
      setLists(prev => ({
        ...prev,
        [key]: (prev[key] as string[]).filter(i => i !== item)
      }));
    }
  };

  const handleCategoriesUpdate = (categories: CategoryItem[]) => {
    setLists(prev => ({ ...prev, categories }));
  };

  const handleDownloadTemplate = () => {
    const headers = "Type (Position/Tag/Category),Value";
    const example = "Position,Senior Instructor\nTag,Piano\nCategory,Private Lesson";
    const blob = new Blob([`${headers}\n${example}`], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lists_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

      const newPositions = new Set<string>();
      const newTags = new Set<string>();
      const newCategories = new Set<string>();

      // Skip header if present
      const startIdx = lines[0].toLowerCase().includes('value') ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length < 2) continue;
        const type = parts[0].trim().toLowerCase();
        const value = parts[1].trim();

        if (!value) continue;

        if (type.includes('position')) {
          if (!lists.positions.includes(value)) newPositions.add(value);
        } else if (type.includes('tag')) {
          if (!lists.tags.includes(value)) newTags.add(value);
        } else if (type.includes('class') || type.includes('category')) {
          if (!lists.categories.some(c => c.name === value)) newCategories.add(value);
        }
      }

      setCandidates({
        positions: Array.from(newPositions),
        tags: Array.from(newTags),
        categories: Array.from(newCategories)
      });
      setIsImportModalOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmImport = () => {
    setLists(prev => {
      const nextCategories = [...(prev.categories || [])];
      candidates.categories.forEach(catName => {
        if (!nextCategories.some(c => c.name === catName)) {
          nextCategories.push({
            id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: catName,
            subcategories: []
          });
        }
      });

      return {
        ...prev,
        positions: [...prev.positions, ...candidates.positions],
        tags: [...prev.tags, ...candidates.tags],
        categories: nextCategories
      };
    });
    setIsImportModalOpen(false);
    setCandidates({ positions: [], tags: [], categories: [] });
  };

  // Safe fallback if lists.categories is somehow undefined from an older state
  const currentCategories = lists.categories || (lists.classifications || []).map((name, i) => ({
    id: `legacy-${i}`,
    name,
    subcategories: []
  }));

  return (
    <div className={`${embedded ? 'h-full overflow-auto' : ''} p-8 max-w-7xl mx-auto relative`}>
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
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('lists.manage_title')}</h2>
              <p className="text-slate-500 dark:text-slate-400">{t('lists.configure_desc')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDownloadTemplate} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
              <FileDown size={16} className="me-2" /> {t('lists.template')}
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center  text-sm">
              <Upload size={16} className="me-2" /> {t('lists.import_csv')}
            </button>
            <input type="file" ref={fileInputRef} hidden accept=".csv" onChange={handleFileUpload} />
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end gap-2 mb-6">
          <button onClick={handleDownloadTemplate} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg flex items-center shadow-sm text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
            <FileDown size={16} className="me-2" /> {t('lists.template')}
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center  text-sm">
            <Upload size={16} className="me-2" /> {t('lists.import_csv')}
          </button>
          <input type="file" ref={fileInputRef} hidden accept=".csv" onChange={handleFileUpload} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ListEditor
          title={t('lists.positions')}
          icon={Briefcase}
          items={lists.positions}
          onAdd={(item) => addItem('positions', item)}
          onRemove={(item) => removeItem('positions', item)}
          emptyLabel={t('lists.no_items_found')}
          addPlaceholder={t('lists.add_placeholder').replace('{title}', t('lists.positions'))}
        />
        <ListEditor
          title={t('lists.tags')}
          icon={Tag}
          items={lists.tags}
          onAdd={(item) => addItem('tags', item)}
          onRemove={(item) => removeItem('tags', item)}
          emptyLabel={t('lists.no_items_found')}
          addPlaceholder={t('lists.add_placeholder').replace('{title}', t('lists.tags'))}
        />
        <div className="lg:col-span-1">
          <CategoryEditor
            categories={currentCategories}
            onUpdate={handleCategoriesUpdate}
            t={t}
          />
        </div>
      </div>

      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title={t('lists.import_preview')}
        isDirty={(candidates.positions.length + candidates.tags.length + candidates.categories.length) > 0}
        onSave={confirmImport}
        t={t}
        maxWidth="max-w-md"
        footerContent={
          <div className="flex justify-end space-x-3 rtl:space-x-reverse w-full">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(false)}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              {t('btn.cancel')}
            </button>
            <button
              type="button"
              onClick={confirmImport}
              disabled={(candidates.positions.length + candidates.tags.length + candidates.categories.length) === 0}
              className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg disabled:opacity-50"
            >
              {t('lists.import_all')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-500 mb-4">{t('lists.found_items').replace('{count}', String(candidates.positions.length + candidates.tags.length + candidates.categories.length))}</p>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto mb-6">
          {candidates.positions.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">{t('lists.new_positions')}</h4>
              <div className="flex flex-wrap gap-2">
                {candidates.positions.map(i => <span key={i} className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs border border-slate-200 dark:border-slate-700">{i}</span>)}
              </div>
            </div>
          )}
          {candidates.tags.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">{t('lists.new_tags')}</h4>
              <div className="flex flex-wrap gap-2">
                {candidates.tags.map(i => <span key={i} className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-1 rounded text-xs border border-blue-100 dark:border-blue-800">{i}</span>)}
              </div>
            </div>
          )}
          {candidates.categories.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">{t('lists.new_categories')}</h4>
              <div className="flex flex-wrap gap-2">
                {candidates.categories.map(i => <span key={i} className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-2 py-1 rounded text-xs border border-purple-100 dark:border-purple-800">{i}</span>)}
              </div>
            </div>
          )}
          {(candidates.positions.length + candidates.tags.length + candidates.categories.length) === 0 && (
            <p className="text-sm text-amber-500">{t('lists.csv_no_unique')}</p>
          )}
        </div>
      </Modal>
    </div>
  );
};
