import React from 'react';
import { X } from 'lucide-react';
import type { StaffMemberV2 } from '../types/v2';

interface ScenarioStaffPickerProps {
  staff: StaffMemberV2[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Tighter sizing for the calendar grid cards */
  compact?: boolean;
}

/**
 * Chip-based staff picker for the planning draft. Replaces the native
 * `<select multiple>` (ctrl/cmd-click) with selected staff shown as removable
 * chips plus a single "Add staff…" dropdown — the same idiom as TagInput.
 */
export const ScenarioStaffPicker: React.FC<ScenarioStaffPickerProps> = ({
  staff, value, onChange, disabled, compact,
}) => {
  const byId = new Map(staff.map(member => [member.id, member.fullName]));
  const available = staff.filter(member => !value.includes(member.id));
  const text = compact ? 'text-[10px]' : 'text-xs';

  const add = (id: string) => { if (id && !value.includes(id)) onChange([...value, id]); };
  const remove = (id: string) => onChange(value.filter(existing => existing !== id));

  return (
    <div className="space-y-1.5">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map(id => (
            <span
              key={id}
              className={`flex items-center gap-1 ${text} font-medium px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300`}
            >
              <span className="truncate max-w-[120px]">{byId.get(id) || id}</span>
              {!disabled && (
                <button type="button" onClick={() => remove(id)} className="hover:text-red-500" title="Remove">
                  <X size={compact ? 10 : 12} />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : (
        <div className={`${text} text-slate-400`}>No staff</div>
      )}
      {!disabled && available.length > 0 && (
        <select
          defaultValue=""
          onChange={event => { add(event.target.value); event.target.value = ''; }}
          className={`w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-0.5 ${text}`}
        >
          <option value="" disabled>Add staff…</option>
          {available.map(member => <option key={member.id} value={member.id}>{member.fullName}</option>)}
        </select>
      )}
    </div>
  );
};
