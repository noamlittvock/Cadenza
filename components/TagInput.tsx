import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  availableTags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder?: string;
  selectPlaceholder?: string;
  addLabel?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  tags, availableTags, onAdd, onRemove,
  placeholder = 'Type a new tag...',
  selectPlaceholder = 'Select existing tag',
  addLabel = 'Add',
}) => {
  const [inputValue, setInputValue] = useState('');

  const dropdownOptions = availableTags.filter(t => !tags.includes(t));
  const trimmed = inputValue.trim();
  const isNew = trimmed.length > 0
    && !tags.some(t => t.toLowerCase() === trimmed.toLowerCase())
    && !availableTags.some(t => t.toLowerCase() === trimmed.toLowerCase());

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val && !tags.includes(val)) {
      onAdd(val);
    }
    e.target.value = '';
  };

  const handleAddNew = () => {
    if (isNew) {
      onAdd(trimmed);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddNew();
    }
  };

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
              {tag}
              <button type="button" onClick={() => onRemove(tag)} className="hover:text-red-500"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        {dropdownOptions.length > 0 && (
          <select
            onChange={handleSelectChange}
            className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            defaultValue=""
          >
            <option value="" disabled>{selectPlaceholder}</option>
            {dropdownOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={handleAddNew}
          disabled={!isNew}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            isNew
              ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
              : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
          }`}
        >
          <Plus size={14} />
          {addLabel}
        </button>
      </div>
    </div>
  );
};
