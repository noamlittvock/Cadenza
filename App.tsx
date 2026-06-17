import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronLeft, X, Filter, Zap, List, Sparkles } from 'lucide-react';
import { ViewState, Teacher, Room, CalendarEvent, GanttBlock, AppSettings, Student, CalendarSubscription, HoursReport, AdminInboxItem } from './types';
import type { ActivityV2, L1Subcategory, L2Subcategory, StaffMemberV2, StudentV2 } from './types/v2';
import type { CalendarSidebarTab } from './types/calendarFilters';
import { INITIAL_TEACHERS, INITIAL_ROOMS, INITIAL_EVENTS, INITIAL_GANTT, INITIAL_SETTINGS, TRANSLATIONS, migrateTeacher, generateId } from './constants';

const t = (key: string) => {
  const lang = document.documentElement.lang || 'en-US';
  return (TRANSLATIONS as any)[lang]?.[key] || (TRANSLATIONS as any)['en-US']?.[key] || key;
};
import { LOCAL_MODE, clearOrgLocalData } from './utils/localStore';
import { deleteCollectionItems } from './utils/supabaseSync';
import { V2_COLLECTIONS } from './types/v2';
import { useSupabaseSync, useSupabaseSettings } from './utils/useSupabaseSync';
import { useOnboarding } from './utils/useOnboarding';
import { detectRoomConflicts } from './utils/roomConflicts';
import { ImportedGoogleEvent } from './utils/googleCalendarSync';
import { useCalendarFilters } from './hooks/useCalendarFilters';
import { Layout } from './components/Layout';
import { CalendarView } from './components/CalendarView';
import { CalendarFilterPanel } from './components/CalendarFilterPanel';
import { GanttManager } from './components/GanttManager';
import { PowerTools } from './components/PowerTools';
import { Settings } from './components/Settings';
import { ManageHub } from './components/ManageHub';
import { ConservatoryBlueprint } from './components/ConservatoryBlueprint';
import { SuperAdmin } from './components/SuperAdmin';
import { AdminInbox } from './components/AdminInbox';
import { OnboardingChecklist } from './components/OnboardingChecklist';

import { TeacherHoursForm } from './components/TeacherHoursForm';

import { AuthProvider, useAuth } from './context/AuthContext';
import { UserRole } from './context/AuthContext';
import { TranslationProvider, useTranslation } from './context/TranslationContext';
import { DevSimulationProvider, useEffectiveAuth, useEffectiveOnboarding, useDevSimulation } from './context/DevSimulationContext';
import { DevSimulationBanner } from './components/DevSimulationBanner';
import { ScenarioBanner } from './components/ScenarioBanner';
import { CommandPalette } from './components/CommandPalette';
import { BotChatPanel } from './components/BotChatPanel';

const MANAGE_TABS = new Set(['staff', 'rooms', 'activities', 'subscriptions', 'inventory']);

const initialViewFromUrl = (): ViewState => {
  if (typeof window === 'undefined') return 'CALENDAR';
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab && MANAGE_TABS.has(tab) ? 'MANAGE' : 'CALENDAR';
};


interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    (this as any).state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    (this as any).setState({ errorInfo });
  }

  render() {
    const state = (this as any).state;
    if (state.hasError) {
      return (
        <div className="p-6 bg-red-50 text-red-900 min-h-screen flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold mb-4">{t('app.something_wrong')}</h1>
          <div className="bg-white p-4 rounded shadow-lg max-w-lg w-full overflow-auto">
            <p className="font-mono text-sm text-red-600 mb-2">{state.error?.toString()}</p>
            <pre className="text-xs text-slate-500 whitespace-pre-wrap">{state.errorInfo?.componentStack}</pre>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            {t('app.reload')}
          </button>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}

function AppContent() {
  const { currentUser, login, isAdmin, isSuperAdmin } = useEffectiveAuth();
  const { orgId } = useAuth();
  const [currentView, setCurrentView] = useState<ViewState>(initialViewFromUrl);
  const onboarding = useEffectiveOnboarding();
  const { simulatedDate } = useDevSimulation();
  const { liveTranslations } = useTranslation();

  // Initialize darkMode synchronously from localStorage to prevent flash
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    const isDark = saved === 'true';
    // Apply dark class immediately on first render
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
    return isDark;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Core State (Supabase/local sync)
  const [teachers, setTeachers] = useSupabaseSync<Teacher>('teachers', []);
  const [rooms, setRooms] = useSupabaseSync<Room>('rooms', []);
  const [events, setEvents] = useSupabaseSync<CalendarEvent>('events', []);
  const [ganttBlocks, setGanttBlocks] = useSupabaseSync<GanttBlock>('ganttBlocks', []);
  const [activities, setActivities] = useSupabaseSync<ActivityV2>('activities', []);
  const [students, setStudents] = useSupabaseSync<Student>('students', []);
  const [calendarSubscriptions, setCalendarSubscriptions] = useSupabaseSync<CalendarSubscription>('calendarSubscriptions', []);
  const [hoursReports, setHoursReports] = useSupabaseSync<HoursReport>('hoursReports', []);
  const [adminInboxItems, setAdminInboxItems] = useSupabaseSync<AdminInboxItem>('adminInboxItems', []);
  // Seed initial language from localStorage so first render matches the persisted state
  // and the useEffect below doesn't flip <html lang/dir> away from what index.tsx pre-applied.
  // useSupabaseSettings reads its initial value once at mount, so a plain inline call is enough.
  const savedLang = typeof window !== 'undefined' ? localStorage.getItem('language') : null;
  const initialSettings: AppSettings =
    savedLang === 'he-IL' || savedLang === 'en-US'
      ? { ...INITIAL_SETTINGS, language: savedLang }
      : INITIAL_SETTINGS;
  const [settings, setSettings] = useSupabaseSettings<AppSettings>('settings', initialSettings);

  // QA Scenario State
  const [activeScenario, setActiveScenario] = useState<import('./utils/testTemplates').QAScenario | null>(null);
  const [scenarioCheckedSteps, setScenarioCheckedSteps] = useState<string[]>([]);

  // Branch-Lab BL01: Command Palette (⌘K / Ctrl+K)
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Marquee Selection State (Lifted)
  const [selectionMode, setSelectionMode] = useState<'NORMAL' | 'MARQUEE'>('NORMAL');
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  // Calendar Sidebar Tab (null = closed)
  const [sidebarTab, setSidebarTab] = useState<CalendarSidebarTab | null>(null);

  // Calendar Filter State (hoisted so sidebar Filters tab shares the same instance)
  const { state: filterState, set: filterSet, clear: filterClear, isActive: filterIsActive } = useCalendarFilters(orgId || '');

  // Union of all tags across events, used for the calendar tag filter dimension.
  const allEventTagsForFilter = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of events) {
      for (const tag of e.tags || []) {
        const k = tag.toLowerCase();
        if (!seen.has(k)) seen.set(k, tag);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [events]);

  // v2 collections needed by CalendarFilterPanel (hoisted to avoid prop-drilling)
  const [l1Subs] = useSupabaseSync<L1Subcategory>(V2_COLLECTIONS.l1Subcategories, []);
  const [l2Subs] = useSupabaseSync<L2Subcategory>(V2_COLLECTIONS.l2Subcategories, []);
  const [staffMembersV2] = useSupabaseSync<StaffMemberV2>(V2_COLLECTIONS.staffMembers, []);
  const [studentsV2] = useSupabaseSync<StudentV2>(V2_COLLECTIONS.students, []);

  // Persistent Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'DAY' | 'WEEK' | 'MONTH'>('WEEK');

  // Sync simulated date → calendar date
  useEffect(() => {
    if (simulatedDate) setCurrentDate(simulatedDate);
  }, [simulatedDate]);

  // Branch-Lab BL01: register ⌘K / Ctrl+K to toggle the command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const isRtl = settings.language === 'he-IL';
  const local_t = (key: string) => (settings.language === 'he-IL' && liveTranslations[key]) || TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

  // Sync Language to DOM + persist to localStorage to prevent flash on next load
  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    localStorage.setItem('language', settings.language);
  }, [settings.language, isRtl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentView === 'MANAGE' || currentView === 'STAFF_MEMBERS') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('tab')) return;
    url.searchParams.delete('tab');
    window.history.replaceState({}, '', url.toString());
  }, [currentView]);

  // Dark Mode Effect - persist to localStorage and apply class
  useEffect(() => {
    localStorage.setItem('darkMode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Room conflict detection → admin inbox notifications + auto-resolution
  useEffect(() => {
    const conflicts = detectRoomConflicts(events);

    if (conflicts.length > 50) {
      console.warn(
        `[conflict-detection] ${conflicts.length} active room conflicts detected across ${events.length} events. ` +
        `Investigate: stale events, mass-overlap dataset, or duplicate event IDs.`
      );
    }

    const activeFingerprints = new Set(
      conflicts.map(c => [c.eventA.id, c.eventB.id].sort().join('|'))
    );

    // Only prune orphans once events have loaded — empty events on cold mount
    // would otherwise wipe legitimate DONE state before the snapshot arrives.
    const eventIdSet = events.length > 0 ? new Set(events.map(e => e.id)) : null;

    setAdminInboxItems(prev => {
      // Self-heal: drop ROOM_CONFLICT items whose referenced events are all gone.
      const pruned = eventIdSet
        ? prev.filter(item => {
            if (item.relatedEntityType !== 'ROOM_CONFLICT') return true;
            const ids = item.relatedEntityIds || [];
            return ids.length === 0 || ids.some(id => eventIdSet.has(id));
          })
        : prev;

      const existingFingerprints = new Set(
        pruned
          .filter(item => item.relatedEntityType === 'ROOM_CONFLICT')
          .map(item => (item.relatedEntityIds || []).slice().sort().join('|'))
      );

      // Auto-resolve: mark OPEN ROOM_CONFLICT items as DONE if conflict no longer active
      const now = new Date().toISOString();
      let updated = pruned.map(item => {
        if (
          item.relatedEntityType === 'ROOM_CONFLICT' &&
          item.status === 'OPEN'
        ) {
          const fp = (item.relatedEntityIds || []).slice().sort().join('|');
          if (!activeFingerprints.has(fp)) {
            return { ...item, status: 'DONE' as const, markedDoneAt: now, autoResolvedReason: 'CONFLICT_CLEARED' as const };
          }
        }
        return item;
      });

      // Add new conflict notifications
      const newItems = conflicts
        .map(c => {
          const fingerprint = [c.eventA.id, c.eventB.id].sort().join('|');
          if (existingFingerprints.has(fingerprint)) return null;
          const roomName = rooms.find(r => r.id === c.roomId)?.name || c.roomId;
          return {
            id: generateId(),
            orgId: '',
            type: 'NOTIFICATION' as const,
            status: 'OPEN' as const,
            title: `Room conflict: ${roomName}`,
            message: `"${c.eventA.name}" and "${c.eventB.name}" overlap in ${roomName}`,
            relatedEntityType: 'ROOM_CONFLICT',
            relatedEntityIds: [c.eventA.id, c.eventB.id].sort(),
            createdAt: now,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (
        newItems.length === 0 &&
        pruned.length === prev.length &&
        updated.every((item, i) => item === pruned[i])
      ) {
        return prev;
      }
      return [...updated, ...newItems];
    });
  }, [events, rooms]);

  // ── Onboarding: sync org milestones whenever data counts change ──────────────
  useEffect(() => {
    onboarding.syncOrgMilestones({
      activities: activities.length,
      teachers: teachers.length,
      events: events.length,
    });
  }, [activities.length, teachers.length, events.length]);

  // ── Onboarding: update firstUseFlags on first successful data addition ────────
  useEffect(() => {
    if (activities.length > 0) onboarding.updateFirstUseFlag('activityHub');
  }, [activities.length]);
  useEffect(() => {
    if (teachers.length > 0) onboarding.updateFirstUseFlag('staffModule');
  }, [teachers.length]);
  useEffect(() => {
    if (events.length > 0) onboarding.updateFirstUseFlag('eventCreation');
  }, [events.length]);

  // Navigate to calendar from conflict notification
  const handleNavigateToConflict = (eventIds: string[]) => {
    const conflictEvents = events.filter(e => eventIds.includes(e.id));
    if (conflictEvents.length === 0) return;
    const earliest = conflictEvents.reduce((a, b) =>
      new Date(a.start) < new Date(b.start) ? a : b
    );
    setCurrentDate(new Date(earliest.start));
    setViewMode('DAY');
    setCurrentView('CALENDAR');
  };

  // Navigate to staff member from inbox
  const [navigateToStaffId, setNavigateToStaffId] = useState<string | null>(null);
  const handleNavigateToStaff = (staffId: string) => {
    setNavigateToStaffId(staffId);
    setCurrentView('STAFF_MEMBERS');
  };

  // Import events from Google Calendar
  const handleImportGoogleEvents = (imported: ImportedGoogleEvent[]) => {
    setEvents(prev => {
      const existingGoogleIds = new Set(prev.filter(e => e.googleEventId).map(e => e.googleEventId));
      const newEvents: CalendarEvent[] = imported
        .filter(g => !existingGoogleIds.has(g.googleEventId))
        .map(g => ({
          id: generateId(),
          orgId: '',
          name: g.title,
          description: g.description || '',
          start: g.start,
          end: g.end,
          staffMemberId: '',
          roomId: '',

          isCanceled: false,
          isHidden: false,
          googleEventId: g.googleEventId,
        } as CalendarEvent));
      return [...prev, ...newEvents];
    });
  };

  // Onboarding gate: first admin is blocked from these views until setupGateCleared
  const GATED_VIEWS: ViewState[] = ['CALENDAR'];
  const isHardGated =
    !isSuperAdmin &&
    onboarding.isFirstAdmin &&
    !onboarding.setupGateCleared;

  // Route Rendering
  const renderContent = () => {
    // Hard gate — redirect gated views to checklist
    if (isHardGated && GATED_VIEWS.includes(currentView)) {
      const isLockedPrompt = currentView !== 'CALENDAR';
      return (
        <OnboardingChecklist
          orgOnboardingState={onboarding.orgOnboardingState}
          setupGateCleared={onboarding.setupGateCleared}
          settings={settings}
          onNavigate={setCurrentView}
          onDismiss={onboarding.dismissOnboarding}
          lockedView={isLockedPrompt}
        />
      );
    }

    // Gate just cleared — show celebration checklist on first visit to Calendar
    if (
      !isSuperAdmin &&
      onboarding.isFirstAdmin &&
      onboarding.setupGateCleared &&
      !onboarding.onboardingDismissed &&
      currentView === 'CALENDAR'
    ) {
      return (
        <OnboardingChecklist
          orgOnboardingState={onboarding.orgOnboardingState}
          setupGateCleared={onboarding.setupGateCleared}
          settings={settings}
          onNavigate={setCurrentView}
          onDismiss={onboarding.dismissOnboarding}
        />
      );
    }

    const isSidebarMode = ['GANTT', 'POWER_TOOLS'].includes(currentView);
    const mainViewClass = isSidebarMode ? 'flex-1 overflow-hidden transition-all duration-300' : 'w-full h-full';

    const CalendarComponent = (
      <CalendarView
        events={events}
        setEvents={setEvents}
        teachers={teachers}
        rooms={rooms}
        ganttBlocks={ganttBlocks}
        setGanttBlocks={setGanttBlocks}
        settings={settings}
        activities={activities}
        // Marquee Props
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        selectedEventIds={selectedEventIds}
        setSelectedEventIds={setSelectedEventIds}
        // Persistent State
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onNavigate={setCurrentView}
        currentView={currentView}
        // Sidebar tab
        sidebarTab={sidebarTab}
        setSidebarTab={setSidebarTab}
        // Filter state
        filterState={filterState}
        filterSet={filterSet}
        filterClear={filterClear}
        filterIsActive={filterIsActive}
        // v2 collections
        l1Subs={l1Subs}
        l2Subs={l2Subs}
        staffMembersV2={staffMembersV2}
        studentsV2={studentsV2}
      />
    );

    // Unified View for Calendar + Sidebar (Filters/Power Tools/Gantt)
    if (currentView === 'CALENDAR') {
      const showSidebar = sidebarTab !== null;

      return (
        <div className="relative w-full h-full overflow-hidden">
          {/* Main Calendar Area — compresses when sidebar is open */}
          <div
            className="h-full overflow-hidden"
            style={{
              paddingInlineEnd: showSidebar ? '384px' : '0px',
              transition: 'padding 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            {CalendarComponent}
          </div>

          {/* Collapse Arrow — rendered OUTSIDE the sliding panel */}
          {showSidebar && (
            <button
              onClick={() => setSidebarTab(null)}
              className="fixed z-50 bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white rounded-full w-10 h-10 flex items-center justify-center shadow-cadenza-deep hover:scale-110 border-4 border-slate-50 dark:border-slate-900 transition-all duration-200 btn-cadenza"
              style={{
                ...(isRtl ? { left: '364px' } : { right: '364px' }),
                bottom: '26%',
              }}
              title={local_t('app.collapse_sidebar')}
            >
              {isRtl ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
          )}

          {/* Tabbed Sidebar — always rendered, slides in/out */}
          <div
            className="sidebar-transition absolute top-0 end-0 h-full bg-white dark:bg-slate-900 shadow-xl z-40 flex flex-col border-s border-slate-200 dark:border-slate-700"
            style={{
              width: '384px',
              transform: showSidebar ? 'translateX(0)' : `translateX(${isRtl ? '-100%' : '100%'})`,
              transition: 'transform 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              willChange: 'transform',
            }}
          >
            {/* Tab strip — short labels keep all four tabs legible at 384px */}
            <div role="tablist" className="flex border-b border-slate-200 dark:border-slate-700 shrink-0">
              {([
                { tab: 'FILTERS' as const, label: local_t('cal.tab.filters'), longLabel: local_t('cal.toggle_filters'), icon: <Filter size={14} /> },
                { tab: 'POWER_TOOLS' as const, label: local_t('cal.tab.tools'), longLabel: local_t('speed.power_tools'), icon: <Zap size={14} /> },
                { tab: 'GANTT' as const, label: local_t('cal.tab.gantt'), longLabel: local_t('speed.gantt_view'), icon: <List size={14} /> },
                ...(settings.aiAssistantEnabled
                  ? [{ tab: 'BOT' as const, label: local_t('cal.tab.bot'), longLabel: local_t('bot.title'), icon: <Sparkles size={14} /> }]
                  : []),
              ] as const).map(({ tab, label, longLabel, icon }) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={sidebarTab === tab}
                  aria-label={longLabel}
                  title={longLabel}
                  onClick={() => setSidebarTab(tab)}
                  className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                    sidebarTab === tab
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="relative flex items-center">
                    {icon}
                    {tab === 'FILTERS' && filterIsActive && sidebarTab !== 'FILTERS' && (
                      <span className="absolute -top-1 -end-1 w-1.5 h-1.5 rounded-full bg-blue-600" />
                    )}
                  </span>
                  <span className="truncate max-w-full leading-none">{label}</span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div role="tabpanel" className="flex-1 overflow-y-auto custom-scrollbar">
              {sidebarTab === 'FILTERS' && (
                <CalendarFilterPanel
                  state={filterState}
                  onChange={filterSet}
                  onClear={filterClear}
                  activities={activities}
                  l1Subs={l1Subs}
                  l2Subs={l2Subs}
                  staffMembers={staffMembersV2}
                  students={studentsV2}
                  locations={[]}
                  allEventTags={allEventTagsForFilter}
                  t={local_t}
                  isRtl={isRtl}
                />
              )}
              {sidebarTab === 'POWER_TOOLS' && (
                <div className="pt-2">
                  <PowerTools
                    events={events}
                    setEvents={setEvents}
                    teachers={teachers}
                    rooms={rooms}
                    settings={settings}
                    activities={activities}
                    selectionMode={selectionMode}
                    setSelectionMode={setSelectionMode}
                    selectedEventIds={selectedEventIds}
                    setSelectedEventIds={setSelectedEventIds}
                    ganttBlocks={ganttBlocks}
                    setGanttBlocks={setGanttBlocks}
                  />
                </div>
              )}
              {sidebarTab === 'GANTT' && (
                <div className="p-4 pt-6">
                  <GanttManager
                    blocks={ganttBlocks}
                    setBlocks={setGanttBlocks}
                    events={events}
                    setEvents={setEvents}
                    settings={settings}
                  />
                </div>
              )}
              {sidebarTab === 'BOT' && settings.aiAssistantEnabled && (
                <BotChatPanel
                  active={sidebarTab === 'BOT'}
                  locale={settings.language}
                  t={local_t}
                  teachers={teachers}
                  rooms={rooms}
                  students={students}
                  activities={activities}
                  events={events}
                />
              )}
            </div>
          </div>
        </div>
      );
    }

    // Standard Full Page Views
    switch (currentView) {
      // CALENDAR handled above
      case 'STAFF_MEMBERS':
      case 'MANAGE':
        return (
          <ManageHub
            rooms={rooms}
            setRooms={setRooms}
            settings={settings}
            activities={activities}
            setActivities={setActivities}
            subscriptions={calendarSubscriptions}
            setSubscriptions={setCalendarSubscriptions}
            teachers={teachers}
            setTeachers={setTeachers}
            events={events}
            students={students}
            hoursReports={hoursReports}
            setHoursReports={setHoursReports}
            adminInboxItems={adminInboxItems}
            setAdminInboxItems={setAdminInboxItems}
            onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
            initialTab="staff"
            navigateToStaffId={navigateToStaffId}
            onStaffNavigateHandled={() => setNavigateToStaffId(null)}
          />
        );
      case 'BLUEPRINT':
        return (
          <ConservatoryBlueprint
            settings={settings}
            onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
          />
        );
      case 'SUPER_ADMIN':
        return (
          <SuperAdmin
            settings={settings}
            events={events}
            setEvents={setEvents}
            activities={activities}
            teachers={teachers}
            students={students}
            rooms={rooms}
            onWipeData={async () => {
                // 1. Clear React state immediately so UI goes blank right away
                setTeachers([]);
                setRooms([]);
                setEvents([]);
                setGanttBlocks([]);
                setStudents([]);
                setActivities([]);
                setAdminInboxItems([]);
                setHoursReports([]);
                setCalendarSubscriptions([]);

                // 2. Delete persisted data so listeners don't re-populate state.
                if (LOCAL_MODE && orgId) {
                  clearOrgLocalData(orgId);
                } else if (orgId) {
                  const wipeCol = async (colName: string) => deleteCollectionItems(orgId, colName);
                  try {
                    await Promise.all([
                      // v1.3 collections
                      wipeCol('teachers'),
                      wipeCol('rooms'),
                      wipeCol('events'),
                      wipeCol('ganttBlocks'),
                      wipeCol('adminInboxItems'),
                      wipeCol('hoursReports'),
                      wipeCol('calendarSubscriptions'),
                      // v2 collections
                      wipeCol(V2_COLLECTIONS.staffMembers),
                      wipeCol(V2_COLLECTIONS.teachingAssignments),
                      wipeCol(V2_COLLECTIONS.orgRoles),
                      wipeCol(V2_COLLECTIONS.students),
                      wipeCol(V2_COLLECTIONS.enrollments),
                      wipeCol(V2_COLLECTIONS.activities),
                      wipeCol(V2_COLLECTIONS.l1Subcategories),
                      wipeCol(V2_COLLECTIONS.l2Subcategories),
                    ]);
                  } catch (err) {
                    console.warn('[onWipeData] Supabase wipe error (non-fatal):', err);
                  }
                }
            }}
            setTeachers={setTeachers}
            setHoursReports={setHoursReports}
            setRooms={setRooms}
            setGanttBlocks={setGanttBlocks}
            setActivities={setActivities}
            setStudents={setStudents}
            setAdminInboxItems={setAdminInboxItems}
            onNavigateToView={(view) => setCurrentView(view as ViewState)}
            onSetSidebarTab={setSidebarTab}
            onActivateScenario={(scenario) => {
              setActiveScenario(scenario);
              setScenarioCheckedSteps([]);
            }}
          />
        );
      case 'ADMIN_INBOX':
        return (
          <AdminInbox
            inboxItems={adminInboxItems}
            setInboxItems={setAdminInboxItems}
            teachers={teachers}
            students={students}
            events={events}
            setEvents={setEvents}
            rooms={rooms}
            settings={settings}
            onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
            onNavigateToEvent={handleNavigateToConflict}
            onNavigateToStaff={handleNavigateToStaff}
          />
        );
      case 'SETTINGS':
        return (
          <Settings
            settings={settings}
            setSettings={setSettings}
            onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
            onImportGoogleEvents={handleImportGoogleEvents}
          />
        );
      default:
        return <div>{local_t('app.not_found')}</div>;
    }
  };

  // Soft tour banner: shown to non-first admins on first login until dismissed
  const showSoftTour =
    !isSuperAdmin &&
    !onboarding.isFirstAdmin &&
    !onboarding.onboardingDismissed;

  return (
    <Layout
      currentView={currentView}
      setView={setCurrentView}
      darkMode={darkMode}
      toggleDarkMode={() => setDarkMode(!darkMode)}
      settings={settings}
      isMobileMenuOpen={isMobileMenuOpen}
      setIsMobileMenuOpen={setIsMobileMenuOpen}
      inboxOpenCount={adminInboxItems.filter(i => i.type === 'NOTIFICATION' && i.status === 'OPEN').length}
      isGated={isHardGated}
    >
      <div className="relative w-full h-full flex flex-col overflow-hidden">
        <DevSimulationBanner language={settings.language} />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          setCurrentView={setCurrentView}
          setSidebarTab={setSidebarTab}
          teachers={teachers}
          students={students}
          events={events}
          t={local_t}
          isRtl={isRtl}
        />
        {activeScenario && (
          <ScenarioBanner
            scenario={activeScenario}
            checkedSteps={scenarioCheckedSteps}
            onToggleStep={stepId => setScenarioCheckedSteps(prev =>
              prev.includes(stepId) ? prev.filter(id => id !== stepId) : [...prev, stepId]
            )}
            onNavigate={view => setCurrentView(view as ViewState)}
            onExit={() => { setActiveScenario(null); setScenarioCheckedSteps([]); }}
          />
        )}
        {/* Soft tour banner (subsequent admins, first login) */}
        {showSoftTour && (
          <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-cadenza-gradient texture-cadenza text-white text-sm shadow-cadenza-soft z-10">
            <span className="font-semibold">{local_t('onboarding.tour_title')}</span>
            <span className="opacity-80 hidden sm:inline">{local_t('onboarding.tour_msg')}</span>
            <button
              onClick={onboarding.dismissOnboarding}
              className="ms-auto flex items-center gap-1 text-white/80 hover:text-white text-xs font-semibold transition-colors"
            >
              {local_t('onboarding.tour_dismiss')}
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </div>
    </Layout>
  );
}

export default function App() {
  // Standalone Hours Report form — no auth required
  const reportMatch = window.location.pathname.match(/^\/report\/(.+)$/);
  if (reportMatch) {
    return (
      <ErrorBoundary>
        <TeacherHoursForm token={reportMatch[1]} />
      </ErrorBoundary>
    );
  }

  return (
    <TranslationProvider>
      <AuthProvider>
        <DevSimulationProvider>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </DevSimulationProvider>
      </AuthProvider>
    </TranslationProvider>
  );
}
