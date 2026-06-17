import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type {
  CalendarFilterState,
  EventStatus, ActivityTypeV2, ActivityTemplate, AssignmentType, StaffRole,
} from '../types/calendarFilters';
import { isStatusDefault } from '../types/calendarFilters';
import type { ActivityV2, L1Subcategory, L2Subcategory, StaffMemberV2, StudentV2 } from '../types/v2';

interface Props {
  state: CalendarFilterState;
  onChange: (partial: Partial<CalendarFilterState>) => void;
  onClear: () => void;
  activities: ActivityV2[];
  l1Subs: L1Subcategory[];
  l2Subs: L2Subcategory[];
  staffMembers: StaffMemberV2[];
  students: StudentV2[];
  locations: string[];
  /** Union of all tags currently in use across events. */
  allEventTags?: string[];
  t: (key: string) => string;
  isRtl: boolean;
}

// ─── Shared sub-components ───────────────────────────────────────────────────

interface GroupProps {
  label: string;
  activeCount: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const Group: React.FC<GroupProps> = ({ label, activeCount, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-200 dark:border-slate-700 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {label}
          {activeCount > 0 && (
            <span className="ms-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
};

interface ChipRowProps<T extends string> {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}

// Tailwind JIT cannot resolve interpolated class fragments, so the active palette
// is a fixed string. Add a static color→className map here if other tones are ever needed.
function ChipRow<T extends string>({ options, selected, onChange }: ChipRowProps<T>) {
  const toggle = (v: T) => {
    if (selected.includes(v)) onChange(selected.filter(s => s !== v));
    else onChange([...selected, v]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
              active
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusChipRow({ options, selected, onChange, t }: ChipRowProps<EventStatus> & { t: (key: string) => string }) {
  const allStatuses = options.map(opt => opt.value);
  const defaultStatuses: EventStatus[] = ['SCHEDULED', 'COMPLETED'];
  const toggle = (v: EventStatus) => {
    if (isStatusDefault(selected) || selected.length === 0) {
      onChange([v]);
      return;
    }
    if (selected.includes(v)) {
      const next = selected.filter(s => s !== v);
      onChange(next.length > 0 ? next : defaultStatuses);
      return;
    }
    onChange([...selected, v]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              aria-pressed={active}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                active
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onChange(defaultStatuses)}
          className="px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
        >
          {t('cal.filter.status.default')}
        </button>
        <button
          type="button"
          onClick={() => onChange(allStatuses)}
          className="px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
        >
          {t('cal.filter.status.all')}
        </button>
      </div>
    </div>
  );
}

interface ChecklistProps {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  maxHeight?: string;
}

const Checklist: React.FC<ChecklistProps> = ({ options, selected, onChange, maxHeight = 'max-h-40' }) => {
  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter(s => s !== v));
    else onChange([...selected, v]);
  };
  if (options.length === 0) return null;
  return (
    <div className={`${maxHeight} overflow-y-auto space-y-0.5`}>
      {options.map(opt => (
        <label key={opt.value} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{opt.label}</span>
        </label>
      ))}
    </div>
  );
};

interface TriStateProps {
  value: 'ALL' | 'RECURRING' | 'ONE_OFF';
  onChange: (v: 'ALL' | 'RECURRING' | 'ONE_OFF') => void;
  labels: { ALL: string; RECURRING: string; ONE_OFF: string };
}

const TriState: React.FC<TriStateProps> = ({ value, onChange, labels }) => (
  <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 overflow-hidden text-[11px]">
    {(['ALL', 'RECURRING', 'ONE_OFF'] as const).map(opt => (
      <button
        key={opt}
        type="button"
        onClick={() => onChange(opt)}
        className={`px-2.5 py-1 font-medium transition-colors ${
          value === opt
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
        }`}
      >
        {labels[opt]}
      </button>
    ))}
  </div>
);

// ─── Main panel ──────────────────────────────────────────────────────────────

export const CalendarFilterPanel: React.FC<Props> = ({
  state, onChange, onClear,
  activities, l1Subs, l2Subs, staffMembers, students, locations,
  allEventTags = [],
  t, isRtl,
}) => {
  const ALL_STATUSES: { value: EventStatus; label: string }[] = [
    { value: 'SCHEDULED', label: t('cal.filter.status.scheduled') },
    { value: 'COMPLETED', label: t('cal.filter.status.completed') },
    { value: 'CANCELLED', label: t('cal.filter.status.cancelled') },
    { value: 'ARCHIVED', label: t('cal.filter.status.archived') },
  ];

  const ALL_ACTIVITY_TYPES: { value: ActivityTypeV2; label: string }[] = [
    { value: 'ACADEMIC', label: t('cal.filter.type.academic') },
    { value: 'ADMINISTRATIVE', label: t('cal.filter.type.administrative') },
    { value: 'PERFORMANCES', label: t('cal.filter.type.performances') },
    { value: 'SPECIAL_EVENTS', label: t('cal.filter.type.special_events') },
  ];

  const ALL_TEMPLATES: { value: ActivityTemplate; label: string }[] = [
    { value: 'DISCIPLINE', label: t('cal.filter.tmpl.discipline') },
    { value: 'PROGRAM', label: t('cal.filter.tmpl.program') },
    { value: 'ENSEMBLE', label: t('cal.filter.tmpl.ensemble') },
    { value: 'EXTERNAL', label: t('cal.filter.tmpl.external') },
    { value: 'ADMINISTRATIVE', label: t('cal.filter.tmpl.administrative') },
  ];

  const ALL_ASSIGNMENT_TYPES: { value: AssignmentType; label: string }[] = [
    { value: 'TEACHING', label: t('cal.filter.assign.teaching') },
    { value: 'ORG_ROLE', label: t('cal.filter.assign.org_role') },
  ];

  const ALL_STAFF_ROLES: { value: StaffRole; label: string }[] = [
    { value: 'SUPER_ADMIN', label: t('cal.filter.role.super_admin') },
    { value: 'ADMIN', label: t('cal.filter.role.admin') },
    { value: 'STAFF', label: t('cal.filter.role.staff') },
  ];

  // Cascading: filter activities by selected type/template
  const filteredActivities = activities.filter(a => {
    if (a.isArchived) return false;
    if (state.activityType.length > 0 && !state.activityType.includes(a.activityType)) return false;
    if (state.template.length > 0 && !state.template.includes(a.template)) return false;
    return true;
  });

  const filteredL1s = l1Subs.filter(l => {
    if (l.isArchived) return false;
    if (state.activityId.length > 0 && !state.activityId.includes(l.activityId)) return false;
    return true;
  });

  const filteredL2s = l2Subs.filter(l => {
    if (l.isArchived) return false;
    if (state.activityId.length > 0 && !state.activityId.includes(l.activityId)) return false;
    if (state.l1Id.length > 0 && l.l1Id && !state.l1Id.includes(l.l1Id)) return false;
    return true;
  });

  const activeStaff = staffMembers.filter(s => !s.isArchived);
  const activeStudents = students.filter(s => !s.isArchived);
  const allStudentTags = [...new Set(activeStudents.flatMap(s => s.tags))].sort();

  // Active count per group
  const stateACount = [
    !isStatusDefault(state.status),
    state.recurrence !== 'ALL',
  ].filter(Boolean).length;

  const stateBCount = [
    state.activityType.length > 0,
    state.template.length > 0,
    state.activityId.length > 0,
    state.l1Id.length > 0,
    state.l2Id.length > 0,
  ].filter(Boolean).length;

  const stateCCount = [
    state.staffMemberId.length > 0,
    state.assignmentType.length > 0,
    state.staffRole.length > 0,
    state.studentId.length > 0,
    state.studentTag.length > 0,
    state.eventTag.length > 0,
  ].filter(Boolean).length;

  const stateDCount = state.location.length > 0 ? 1 : 0;

  const stateECount = [state.hasRoomConflict, state.hasValidationError].filter(Boolean).length;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="flex flex-col"
    >
      <div className="flex flex-col">
        {/* Group A — State */}
        <Group label={t('cal.filter.group.state')} activeCount={stateACount}>
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t('cal.filter.status.label')}
            </p>
            <StatusChipRow
              options={ALL_STATUSES}
              selected={state.status as EventStatus[]}
              onChange={v => onChange({ status: v })}
              t={t}
            />
          </div>
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t('cal.filter.recurrence.label')}
            </p>
            <TriState
              value={state.recurrence}
              onChange={v => onChange({ recurrence: v })}
              labels={{
                ALL: t('cal.filter.recurrence.all'),
                RECURRING: t('cal.filter.recurrence.recurring'),
                ONE_OFF: t('cal.filter.recurrence.one_off'),
              }}
            />
          </div>
        </Group>

        {/* Group B — Taxonomy */}
        <Group label={t('cal.filter.group.taxonomy')} activeCount={stateBCount} defaultOpen={false}>
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t('cal.filter.type.label')}
            </p>
            <ChipRow options={ALL_ACTIVITY_TYPES} selected={state.activityType as ActivityTypeV2[]} onChange={v => onChange({ activityType: v })} />
          </div>
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t('cal.filter.tmpl.label')}
            </p>
            <ChipRow options={ALL_TEMPLATES} selected={state.template as ActivityTemplate[]} onChange={v => onChange({ template: v })} />
          </div>
          <div className="space-y-1 pt-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t('cal.filter.activity.label')}
            </p>
            <Checklist
              options={filteredActivities.map(a => ({ value: a.id, label: a.name }))}
              selected={state.activityId}
              onChange={v => {
                // Clear l1/l2 if deselected activity would orphan them
                const next: Partial<CalendarFilterState> = { activityId: v };
                if (state.l1Id.length > 0) {
                  next.l1Id = state.l1Id.filter(id => l1Subs.some(l => l.id === id && v.includes(l.activityId)));
                }
                if (state.l2Id.length > 0) {
                  next.l2Id = state.l2Id.filter(id => l2Subs.some(l => l.id === id && v.includes(l.activityId)));
                }
                onChange(next);
              }}
            />
          </div>
          {filteredL1s.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">L1</p>
              <Checklist
                options={filteredL1s.map(l => ({ value: l.id, label: l.name }))}
                selected={state.l1Id}
                onChange={v => onChange({ l1Id: v, l2Id: state.l2Id.filter(id => l2Subs.some(l => l.id === id && (l.l1Id === null || v.includes(l.l1Id)))) })}
              />
            </div>
          )}
          {filteredL2s.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">L2</p>
              <Checklist
                options={filteredL2s.map(l => ({ value: l.id, label: l.name }))}
                selected={state.l2Id}
                onChange={v => onChange({ l2Id: v })}
              />
            </div>
          )}
        </Group>

        {/* Group C — People */}
        <Group label={t('cal.filter.group.people')} activeCount={stateCCount} defaultOpen={false}>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t('cal.filter.staff.label')}
            </p>
            <Checklist
              options={activeStaff.map(s => ({ value: s.id, label: s.fullName }))}
              selected={state.staffMemberId}
              onChange={v => onChange({ staffMemberId: v })}
            />
          </div>
          {state.staffMemberId.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t('cal.filter.assign.label')}
              </p>
              <ChipRow options={ALL_ASSIGNMENT_TYPES} selected={state.assignmentType as AssignmentType[]} onChange={v => onChange({ assignmentType: v })} />
            </div>
          )}
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t('cal.filter.role.label')}
            </p>
            <ChipRow options={ALL_STAFF_ROLES} selected={state.staffRole as StaffRole[]} onChange={v => onChange({ staffRole: v })} />
          </div>
          {activeStudents.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t('cal.filter.student.label')}
              </p>
              <Checklist
                options={activeStudents.map(s => ({ value: s.id, label: s.fullName }))}
                selected={state.studentId}
                onChange={v => onChange({ studentId: v })}
              />
            </div>
          )}
          {allStudentTags.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t('cal.filter.student_tag.label')}
              </p>
              <Checklist
                options={allStudentTags.map(tag => ({ value: tag, label: tag }))}
                selected={state.studentTag}
                onChange={v => onChange({ studentTag: v })}
              />
            </div>
          )}
          {allEventTags.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t('cal.filter.event_tag.label')}
              </p>
              <Checklist
                options={allEventTags.map(tag => ({ value: tag, label: tag }))}
                selected={state.eventTag}
                onChange={v => onChange({ eventTag: v })}
              />
            </div>
          )}
        </Group>

        {/* Group D — Place */}
        <Group label={t('cal.filter.group.place')} activeCount={stateDCount} defaultOpen={false}>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t('cal.filter.location.label')}
            </p>
            {locations.length > 0 ? (
              <Checklist
                options={locations.map(l => ({ value: l, label: l }))}
                selected={state.location}
                onChange={v => onChange({ location: v })}
              />
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-1">{t('cal.filter.location.empty')}</p>
            )}
          </div>
        </Group>

        {/* Group E — Derived / operational */}
        <Group label={t('cal.filter.group.derived')} activeCount={stateECount} defaultOpen={false}>
          <label className="flex items-center gap-2 cursor-pointer py-0.5">
            <input
              type="checkbox"
              checked={state.hasRoomConflict}
              onChange={e => onChange({ hasRoomConflict: e.target.checked })}
              className="rounded border-slate-300 dark:border-slate-600 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300">{t('cal.filter.has_room_conflict')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer py-0.5">
            <input
              type="checkbox"
              checked={state.hasValidationError}
              onChange={e => onChange({ hasValidationError: e.target.checked })}
              className="rounded border-slate-300 dark:border-slate-600 text-red-600 focus:ring-red-500"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300">{t('cal.filter.has_validation_error')}</span>
          </label>
        </Group>
      </div>

      {/* Footer: Clear All */}
      <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 flex justify-end">
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:underline"
        >
          {t('bl01_calendar.filter.clear_all')}
        </button>
      </div>
    </div>
  );
};
