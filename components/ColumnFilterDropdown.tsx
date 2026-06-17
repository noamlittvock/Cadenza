import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  /** All distinct values for this column */
  values: string[];
  /** Currently selected values */
  selected: Set<string>;
  /** Update selected values */
  onChange: (next: Set<string>) => void;
  /** Close the dropdown */
  onClose: () => void;
  /** Translations */
  t: (key: string) => string;
}

export const ColumnFilterDropdown: React.FC<Props> = ({
  values,
  selected,
  onChange,
  onClose,
  t,
}) => {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = search.trim()
    ? values.filter(v => v.toLowerCase().includes(search.toLowerCase()))
    : values;

  const toggleValue = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(filtered));
  const clearAll = () => onChange(new Set());

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 rtl:left-auto rtl:right-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden"
    >
      {/* Search */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="relative">
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('filter.search')}
            aria-label={t('filter.search')}
            className="w-full px-2 py-1.5 pr-7 text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded outline-none focus:ring-1 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label={t('filter.clear') || 'Clear search'} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Select All / Clear */}
      <div className="flex justify-between px-2 py-1.5 border-b border-slate-100 dark:border-slate-700">
        <button onClick={selectAll} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
          {t('filter.select_all')}
        </button>
        <button onClick={clearAll} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">
          {t('filter.clear')}
        </button>
      </div>

      {/* Checkbox list */}
      <div className="max-h-48 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-3">{t('filter.no_values')}</p>
        ) : (
          filtered.map(val => (
            <label
              key={val}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(val)}
                onChange={() => toggleValue(val)}
                className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{val}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
};
