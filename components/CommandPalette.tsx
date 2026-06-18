import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Calendar, Users, GraduationCap, Cog, LayoutGrid, Inbox, Wrench, Shield, ListChecks, ListTree } from 'lucide-react';
import { ViewState, Teacher, Student, CalendarEvent } from '../types';
import type { CalendarSidebarTab } from '../types/calendarFilters';
import { isPaletteVisible, VIEW_ALIASES } from '../routing';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  setCurrentView: (v: ViewState) => void;
  setSidebarTab: (tab: CalendarSidebarTab | null) => void;
  teachers: Teacher[];
  students: Student[];
  events: CalendarEvent[];
  t: (k: string) => string;
  isRtl: boolean;
}

type ResultKind = 'navigate' | 'staff' | 'student' | 'event';

interface PaletteResult {
  id: string;
  kind: ResultKind;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

const NAV_ICONS: Record<ViewState, React.ReactNode> = {
  CALENDAR: <Calendar className="h-4 w-4" />,
  MANAGE: <ListChecks className="h-4 w-4" />,
  STAFF_MEMBERS: <Users className="h-4 w-4" />,
  ADMIN_INBOX: <Inbox className="h-4 w-4" />,
  BLUEPRINT: <ListTree className="h-4 w-4" />,
  STUDENTS: <GraduationCap className="h-4 w-4" />,
  BILLING: <ListChecks className="h-4 w-4" />,
  ACADEMICS: <ListTree className="h-4 w-4" />,
  INVENTORY: <LayoutGrid className="h-4 w-4" />,
  PAYROLL: <ListChecks className="h-4 w-4" />,
  ANALYTICS: <LayoutGrid className="h-4 w-4" />,
  SETTINGS: <Cog className="h-4 w-4" />,
  SUPER_ADMIN: <Shield className="h-4 w-4" />,
};

const NAV_KEY_BY_VIEW: Record<ViewState, string> = {
  CALENDAR: 'bl01_palette.action.calendar',
  MANAGE: 'bl01_palette.action.manage',
  STAFF_MEMBERS: 'bl01_palette.action.staff_members',
  ADMIN_INBOX: 'bl01_palette.action.admin_inbox',
  BLUEPRINT: 'bl01_palette.action.blueprint',
  STUDENTS: 'nav.students',
  BILLING: 'nav.billing',
  ACADEMICS: 'nav.academics',
  INVENTORY: 'nav.inventory',
  PAYROLL: 'nav.payroll',
  ANALYTICS: 'nav.analytics',
  SETTINGS: 'bl01_palette.action.settings',
  SUPER_ADMIN: 'bl01_palette.action.super_admin',
};

// Sidebar tab entries kept separate so they stay discoverable from the palette
const SIDEBAR_ENTRIES: Array<{ id: string; tab: CalendarSidebarTab; labelKey: string; icon: React.ReactNode }> = [
  { id: 'sidebar:GANTT', tab: 'GANTT', labelKey: 'bl01_palette.action.gantt', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'sidebar:POWER_TOOLS', tab: 'POWER_TOOLS', labelKey: 'bl01_palette.action.power_tools', icon: <Wrench className="h-4 w-4" /> },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  setCurrentView,
  setSidebarTab,
  teachers,
  students,
  events,
  t,
  isRtl,
}) => {
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const listItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Reset state on open; restore focus on close
  useEffect(() => {
    if (open) {
      previouslyFocused.current = (document.activeElement as HTMLElement) || null;
      setQuery('');
      setHighlightIdx(0);
      // Focus input on next tick so portal-mounted node is attached
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    } else {
      // Restore focus to previously focused element
      try {
        previouslyFocused.current?.focus?.();
      } catch (err) {
        console.error('[CommandPalette] focus restore failed', err);
      }
    }
  }, [open]);

  const q = query.trim().toLowerCase();

  // Navigate to a view, resolving palette aliases (e.g. INVENTORY →
  // Manage?tab=inventory). The Manage tab is selected via the `?tab=` URL param,
  // which ManageHub reads on mount — so this routes correctly when coming from
  // any other view. (Already being on Manage is the lone edge case; navigating
  // there from elsewhere is the palette's job.)
  const navigateToView = useCallback((view: ViewState) => {
    const alias = VIEW_ALIASES[view];
    if (alias) {
      if (alias.manageTab && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', alias.manageTab);
        window.history.replaceState({}, '', url.toString());
      }
      setCurrentView(alias.view);
    } else {
      setCurrentView(view);
    }
  }, [setCurrentView]);

  // Build the navigate section (always shown; filtered by label). Only views that
  // route to a real surface (or alias onto one) are listed — see routing.ts /
  // route-nav-policy.md (D-02). This is what keeps the palette from offering
  // dead-end destinations that land on Not Found.
  const navResults = useMemo<PaletteResult[]>(() => {
    const viewItems: PaletteResult[] = (Object.keys(NAV_KEY_BY_VIEW) as ViewState[])
      .filter(isPaletteVisible)
      .map(view => ({
        id: `nav:${view}`,
        kind: 'navigate',
        label: t(NAV_KEY_BY_VIEW[view]),
        icon: NAV_ICONS[view] ?? <Calendar className="h-4 w-4" />,
        onSelect: () => { navigateToView(view); onClose(); },
      }));
    const sidebarItems: PaletteResult[] = SIDEBAR_ENTRIES.map(entry => ({
      id: entry.id,
      kind: 'navigate',
      label: t(entry.labelKey),
      icon: entry.icon,
      onSelect: () => { setCurrentView('CALENDAR'); setSidebarTab(entry.tab); onClose(); },
    }));
    const all = [...viewItems, ...sidebarItems];
    if (!q) return all;
    return all.filter(r => r.label.toLowerCase().includes(q));
  }, [q, t, navigateToView, setCurrentView, setSidebarTab, onClose]);

  const staffResults = useMemo<PaletteResult[]>(() => {
    if (!q) return [];
    return teachers
      .filter(s => (s.fullName || '').toLowerCase().includes(q))
      .slice(0, 5)
      .map(s => ({
        id: `staff:${s.id}`,
        kind: 'staff',
        label: s.fullName,
        icon: <Users className="h-4 w-4" />,
        onSelect: () => {
          setCurrentView('STAFF_MEMBERS');
          onClose();
        },
      }));
  }, [q, teachers, setCurrentView, onClose]);

  const studentResults = useMemo<PaletteResult[]>(() => {
    if (!q) return [];
    return students
      .filter(s => (s.fullName || '').toLowerCase().includes(q))
      .slice(0, 5)
      .map(s => ({
        id: `student:${s.id}`,
        kind: 'student',
        label: s.fullName,
        icon: <GraduationCap className="h-4 w-4" />,
        onSelect: () => {
          setCurrentView('STUDENTS');
          onClose();
        },
      }));
  }, [q, students, setCurrentView, onClose]);

  const eventResults = useMemo<PaletteResult[]>(() => {
    if (!q) return [];
    return events
      .filter(e => (e.name || '').toLowerCase().includes(q))
      .slice(0, 5)
      .map(e => ({
        id: `event:${e.id}`,
        kind: 'event' as ResultKind,
        label: e.name || '',
        icon: <Calendar className="h-4 w-4" />,
        onSelect: () => {
          setCurrentView('CALENDAR');
          onClose();
        },
      }));
  }, [q, events, setCurrentView, onClose]);

  // Flat list for keyboard nav (in section order)
  const flat = useMemo<PaletteResult[]>(
    () => [...navResults, ...staffResults, ...studentResults, ...eventResults],
    [navResults, staffResults, studentResults, eventResults]
  );

  // Keep highlight in range
  useEffect(() => {
    if (highlightIdx >= flat.length) setHighlightIdx(0);
  }, [flat.length, highlightIdx]);

  // Scroll highlighted item into view
  useEffect(() => {
    const el = listItemRefs.current[highlightIdx];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (flat.length === 0) return;
        setHighlightIdx(i => (i + 1) % flat.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flat.length === 0) return;
        setHighlightIdx(i => (i - 1 + flat.length) % flat.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flat[highlightIdx];
        if (item) item.onSelect();
      }
    },
    [flat, highlightIdx, onClose]
  );

  if (!open) return null;

  const showEmpty = q.length > 0 && flat.length === 0;

  // Helpers to render a section
  let runningIdx = 0;
  const renderSection = (titleKey: string, items: PaletteResult[]) => {
    if (items.length === 0) return null;
    return (
      <div className="py-1">
        <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t(titleKey)}
        </div>
        <ul role="listbox" aria-label={t(titleKey)} className="flex flex-col">
          {items.map(item => {
            const idx = runningIdx;
            runningIdx += 1;
            const isActive = idx === highlightIdx;
            return (
              <li key={item.id}>
                <button
                  ref={el => {
                    listItemRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onClick={() => item.onSelect()}
                  className={
                    'w-full flex items-center gap-3 px-3 py-2 text-sm text-start transition-colors ' +
                    (isActive
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-50'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50')
                  }
                >
                  <span className="shrink-0 text-slate-500 dark:text-slate-400">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm"
      onMouseDown={e => {
        // Only close when click landed on the overlay, not bubbled from card
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('bl01_palette.aria_open')}
        dir={isRtl ? 'rtl' : 'ltr'}
        onKeyDown={handleKeyDown}
        className="mt-[20vh] w-[92vw] max-w-[640px] rounded-lg bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setHighlightIdx(0);
            }}
            placeholder={t('bl01_palette.placeholder')}
            aria-label={t('bl01_palette.placeholder')}
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('bl01_palette.aria_close')}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            esc
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {showEmpty ? (
            <div className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {t('bl01_palette.empty')}
            </div>
          ) : (
            <>
              {renderSection('bl01_palette.section.navigate', navResults)}
              {renderSection('bl01_palette.section.staff', staffResults)}
              {renderSection('bl01_palette.section.students', studentResults)}
              {renderSection('bl01_palette.section.events', eventResults)}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span>{t('bl01_palette.kbd_navigate')}</span>
            <span>{t('bl01_palette.kbd_select')}</span>
            <span>{t('bl01_palette.kbd_close')}</span>
          </div>
          <span className="font-mono">{t('bl01_palette.shortcut_label')}</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
