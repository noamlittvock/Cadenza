import React from 'react';
import { X } from 'lucide-react';

interface FilterPill {
  key: string;
  label: string;
  display: string;
}

interface Props {
  pills: FilterPill[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
  t: (key: string) => string;
}

export const FilterPills: React.FC<Props> = ({ pills, onRemove, onClearAll, t }) => {
  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {pills.map(pill => (
        <span
          key={pill.key}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs"
        >
          <span className="font-medium">{pill.label}:</span> {pill.display}
          <button
            onClick={() => onRemove(pill.key)}
            className="ml-0.5 hover:text-blue-900 dark:hover:text-blue-100"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline"
      >
        {t('filter.clear_all')}
      </button>
    </div>
  );
};
