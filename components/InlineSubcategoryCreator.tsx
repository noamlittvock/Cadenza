import React, { useState } from 'react';
import { Activity, Subcategory } from '../types';
import { generateId } from '../constants';
import { Plus, X } from 'lucide-react';

interface InlineSubcategoryCreatorProps {
  activity: Activity;
  onSubcategoryCreated: (activityId: string, newSubcategory: Subcategory) => void;
  t: (key: string) => string;
  selectedSubcategoryId?: string;
  onSelect?: (subcategoryId: string) => void;
}

export const InlineSubcategoryCreator: React.FC<InlineSubcategoryCreatorProps> = ({
  activity,
  onSubcategoryCreated,
  t,
  selectedSubcategoryId,
  onSelect,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const activeSubcategories = (activity.subcategories || []).filter(s => !s.isArchived);

  const handleSelect = (value: string) => {
    if (value === '__ADD_NEW__') {
      setIsAdding(true);
      setNewName('');
    } else {
      onSelect?.(value);
    }
  };

  const handleConfirmAdd = () => {
    const name = newName.trim();
    if (!name) return;

    const exists = (activity.subcategories || []).some(
      s => s.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      alert(t('activities.duplicate_subcategory'));
      return;
    }

    if (!window.confirm(t('activities.confirm_add_subcategory').replace('{name}', name))) {
      return;
    }

    const newSub: Subcategory = {
      id: generateId(),
      name,
      isArchived: false,
    };

    onSubcategoryCreated(activity.id, newSub);
    onSelect?.(newSub.id);
    setIsAdding(false);
    setNewName('');
  };

  const handleCancel = () => {
    setIsAdding(false);
    setNewName('');
  };

  if (isAdding) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleConfirmAdd(); }
            if (e.key === 'Escape') handleCancel();
          }}
          placeholder={t('activities.add_subcategory_placeholder')}
          className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          autoFocus
        />
        <button
          type="button"
          onClick={handleConfirmAdd}
          disabled={!newName.trim()}
          className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft px-2.5 py-2 rounded-lg"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-2"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <select
      value={selectedSubcategoryId || ''}
      onChange={e => handleSelect(e.target.value)}
      className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">{t('activities.subcategories')}</option>
      {activeSubcategories.map(sub => (
        <option key={sub.id} value={sub.id}>{sub.name}</option>
      ))}
      <option value="__ADD_NEW__">{t('activities.add_subcategory_inline')}</option>
    </select>
  );
};
