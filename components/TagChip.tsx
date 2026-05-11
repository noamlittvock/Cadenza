import React, { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { tagColor, normalizeTag } from '../utils/tagColor';

interface TagChipProps {
  label: string;
  size?: 'sm' | 'xs';
  onRemove?: () => void;
  className?: string;
}

export const TagChip: React.FC<TagChipProps> = ({ label, size = 'sm', onRemove, className = '' }) => {
  const { classes } = tagColor(label);
  const sizeCls = size === 'xs'
    ? 'text-[9px] px-1.5 py-px gap-0.5'
    : 'text-xs px-2 py-0.5 gap-1';
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${sizeCls} ${classes} ${className}`}
      title={label}
    >
      <span className="truncate max-w-[8rem]">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-60 hover:opacity-100 -me-0.5"
          aria-label={`Remove tag ${label}`}
        >
          <X size={size === 'xs' ? 8 : 10} />
        </button>
      )}
    </span>
  );
};

interface TagChipInputProps {
  /** Currently-selected tags on the entity. */
  value: string[];
  /** Pool of all tags already in use elsewhere — used for autocomplete. */
  suggestions: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  inputClassName?: string;
}

export const TagChipInput: React.FC<TagChipInputProps> = ({
  value,
  suggestions,
  onChange,
  placeholder,
  inputClassName,
}) => {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const d = draft.trim().toLowerCase();
    const have = new Set(value.map(v => v.toLowerCase()));
    const pool = suggestions
      .filter(s => !have.has(s.toLowerCase()))
      .filter(s => d ? s.toLowerCase().includes(d) : true);
    // De-dupe by lowercase
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of pool) {
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
      if (out.length >= 8) break;
    }
    return out;
  }, [draft, suggestions, value]);

  const commit = (raw: string) => {
    const n = normalizeTag(raw);
    if (!n) return;
    if (value.some(v => v.toLowerCase() === n.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, n]);
    setDraft('');
  };

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      remove(value.length - 1);
    } else if (e.key === 'Escape') {
      setDraft('');
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative">
      <div
        className={`flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-colors ${inputClassName || ''}`}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, idx) => (
          <TagChip key={`${tag}-${idx}`} label={tag} onRemove={() => remove(idx)} />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delay to allow click-on-suggestion to fire first
            setTimeout(() => setFocused(false), 120);
            if (draft.trim()) commit(draft);
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[6rem] bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
        />
      </div>

      {focused && matches.length > 0 && (
        <div className="absolute z-20 mt-1 left-0 right-0 max-h-48 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(s); }}
              className="w-full text-start px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <TagChip label={s} size="xs" />
              <span className="text-xs text-slate-400">existing</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
