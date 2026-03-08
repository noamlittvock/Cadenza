import React, { useState } from 'react';
import { ListsState, AppSettings } from '../types';
import { Plus, X, Tag, Briefcase, Bookmark, Menu, AlertCircle, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
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
          className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft p-2 min-w-[36px] flex items-center justify-center rounded-lg"
        >
          <Plus size={18} />
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
  const [showHelp, setShowHelp] = useState(false);

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
          </div>
        </div>
      )}

      {/* Help Panel */}
      <div className="mb-4">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <HelpCircle size={13} />
          {t('lists.help_title')}
          {showHelp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showHelp && (
          <div className="mt-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            <p>{t('lists.help_text')}</p>
          </div>
        )}
      </div>

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

    </div>
  );
};
