import React, { useState, useRef } from 'react';
import { ListsState, AppSettings } from '../types';
import { Plus, X, Tag, Briefcase, Bookmark, Download, Upload, FileDown, CheckCircle2, Menu, AlertCircle } from 'lucide-react';
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
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col h-full">
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

export const ManageLists: React.FC<Props> = ({ lists, setLists, settings, onMobileMenuOpen, embedded = false }) => {
  const t = (key: string) => (settings && TRANSLATIONS[settings.language]?.[key]) || TRANSLATIONS['en-US'][key] || key;
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [candidates, setCandidates] = useState<{ positions: string[], tags: string[], classifications: string[] }>({ positions: [], tags: [], classifications: [] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addItem = (key: keyof ListsState, item: string) => {
    setLists(prev => ({
      ...prev,
      [key]: [...prev[key], item]
    }));
  };

  const removeItem = (key: keyof ListsState, item: string) => {
    if (window.confirm(`${t('lists.remove_word')} "${item}" ${t('lists.confirm_remove')}`)) {
      setLists(prev => ({
        ...prev,
        [key]: prev[key].filter(i => i !== item)
      }));
    }
  };

  const handleDownloadTemplate = () => {
    const headers = "Type (Position/Tag/Classification),Value";
    const example = "Position,Senior Instructor\nTag,Piano\nClassification,Private Lesson";
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
      const newClassifications = new Set<string>();

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
        } else if (type.includes('class')) {
          if (!lists.classifications.includes(value)) newClassifications.add(value);
        }
      }

      setCandidates({
        positions: Array.from(newPositions),
        tags: Array.from(newTags),
        classifications: Array.from(newClassifications)
      });
      setIsImportModalOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmImport = () => {
    setLists(prev => ({
      ...prev,
      positions: [...prev.positions, ...candidates.positions],
      tags: [...prev.tags, ...candidates.tags],
      classifications: [...prev.classifications, ...candidates.classifications]
    }));
    setIsImportModalOpen(false);
    setCandidates({ positions: [], tags: [], classifications: [] });
  };

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
        <ListEditor
          title={t('lists.classifications')}
          icon={Bookmark}
          items={lists.classifications}
          onAdd={(item) => addItem('classifications', item)}
          onRemove={(item) => removeItem('classifications', item)}
          emptyLabel={t('lists.no_items_found')}
          addPlaceholder={t('lists.add_placeholder').replace('{title}', t('lists.classifications'))}
        />
        <ListEditor
          title={t('lists.absence_reasons')}
          icon={AlertCircle}
          items={lists.absenceReasons || []}
          onAdd={(item) => addItem('absenceReasons', item)}
          onRemove={(item) => removeItem('absenceReasons', item)}
          emptyLabel={t('lists.no_items_found')}
          addPlaceholder={t('lists.add_placeholder').replace('{title}', t('lists.absence_reasons'))}
        />
      </div>

      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title={t('lists.import_preview')}
        isDirty={(candidates.positions.length + candidates.tags.length + candidates.classifications.length) > 0}
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
              disabled={(candidates.positions.length + candidates.tags.length + candidates.classifications.length) === 0}
              className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg disabled:opacity-50"
            >
              {t('lists.import_all')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-500 mb-4">{t('lists.found_items').replace('{count}', String(candidates.positions.length + candidates.tags.length + candidates.classifications.length))}</p>

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
          {candidates.classifications.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">{t('lists.new_classifications')}</h4>
              <div className="flex flex-wrap gap-2">
                {candidates.classifications.map(i => <span key={i} className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-2 py-1 rounded text-xs border border-purple-100 dark:border-purple-800">{i}</span>)}
              </div>
            </div>
          )}
          {(candidates.positions.length + candidates.tags.length + candidates.classifications.length) === 0 && (
            <p className="text-sm text-amber-500">{t('lists.csv_no_unique')}</p>
          )}
        </div>
      </Modal>
    </div>
  );
};
