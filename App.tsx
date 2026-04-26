import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { ViewState, Teacher, Room, CalendarEvent, GanttBlock, AppSettings, ListsState, Student, CalendarSubscription, HoursReport, AdminInboxItem } from './types';
import type { ActivityV2 } from './types/v2';
import { INITIAL_TEACHERS, INITIAL_ROOMS, INITIAL_EVENTS, INITIAL_GANTT, INITIAL_SETTINGS, INITIAL_LISTS, TRANSLATIONS, migrateTeacher, generateId } from './constants';

const t = (key: string) => {
  const lang = document.documentElement.lang || 'en-US';
  return (TRANSLATIONS as any)[lang]?.[key] || (TRANSLATIONS as any)['en-US']?.[key] || key;
};
import { writeBatch, getDocs, collection, query, where, doc, deleteDoc } from 'firebase/firestore';
import { db } from './utils/firebase';
import { V2_COLLECTIONS } from './types/v2';
import { useFirestoreSync, useFirestoreSettings } from './utils/useFirestoreSync';
import { useOnboarding } from './utils/useOnboarding';
import { detectRoomConflicts } from './utils/roomConflicts';
import { ImportedGoogleEvent } from './utils/googleCalendarSync';
import { Layout } from './components/Layout';
import { CalendarView } from './components/CalendarView';
import { GanttManager } from './components/GanttManager';
import { PowerTools } from './components/PowerTools';
import { Settings } from './components/Settings';
import { ManageHub } from './components/ManageHub';
import { StaffMemberManager } from './components/StaffMemberManager';
import { StudentManager } from './components/StudentManager';
import { SuperAdmin } from './components/SuperAdmin';
import { AdminInbox } from './components/AdminInbox';
import { DocumentTemplates } from './components/DocumentRepository';
import { OnboardingChecklist } from './components/OnboardingChecklist';

import { TeacherHoursForm } from './components/TeacherHoursForm';

import { AuthProvider, useAuth } from './context/AuthContext';
import { UserRole } from './context/AuthContext';
import { TranslationProvider, useTranslation } from './context/TranslationContext';
import { DevSimulationProvider, useEffectiveAuth, useEffectiveOnboarding, useDevSimulation } from './context/DevSimulationContext';
import { DevSimulationBanner } from './components/DevSimulationBanner';
import { ScenarioBanner } from './components/ScenarioBanner';


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
  const [currentView, setCurrentView] = useState<ViewState>('CALENDAR');
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
  // Core State (Cloud Database via Firestore)
  const [teachers, setTeachers] = useFirestoreSync<Teacher>('teachers', []);
  const [rooms, setRooms] = useFirestoreSync<Room>('rooms', []);
  const [events, setEvents] = useFirestoreSync<CalendarEvent>('events', []);
  const [ganttBlocks, setGanttBlocks] = useFirestoreSync<GanttBlock>('ganttBlocks', []);
  const [activities, setActivities] = useFirestoreSync<ActivityV2>('activities', []);
  const [students, setStudents] = useFirestoreSync<Student>('students', []);
  const [calendarSubscriptions, setCalendarSubscriptions] = useFirestoreSync<CalendarSubscription>('calendarSubscriptions', []);
  const [hoursReports, setHoursReports] = useFirestoreSync<HoursReport>('hoursReports', []);
  const [adminInboxItems, setAdminInboxItems] = useFirestoreSync<AdminInboxItem>('adminInboxItems', []);
  const [settings, setSettings] = useFirestoreSettings<AppSettings>('settings', INITIAL_SETTINGS);
  const [lists, setLists] = useFirestoreSettings<ListsState>('lists', INITIAL_LISTS);

  // QA Scenario State
  const [activeScenario, setActiveScenario] = useState<import('./utils/testTemplates').QAScenario | null>(null);
  const [scenarioCheckedSteps, setScenarioCheckedSteps] = useState<string[]>([]);

  // Marquee Selection State (Lifted)
  const [selectionMode, setSelectionMode] = useState<'NORMAL' | 'MARQUEE'>('NORMAL');
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  // Persistent Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'DAY' | 'WEEK' | 'MONTH'>('WEEK');

  // Sync simulated date → calendar date
  useEffect(() => {
    if (simulatedDate) setCurrentDate(simulatedDate);
  }, [simulatedDate]);

  const isRtl = settings.language === 'he-IL';
  const local_t = (key: string) => (settings.language === 'he-IL' && liveTranslations[key]) || TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

  // Sync Language to DOM
  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  }, [settings.language, isRtl]);

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

    // Build set of active conflict fingerprints
    const activeFingerprints = new Set(
      conflicts.map(c => [c.eventA.id, c.eventB.id].sort().join('|'))
    );

    setAdminInboxItems(prev => {
      const existingFingerprints = new Set(
        prev
          .filter(item => item.relatedEntityType === 'ROOM_CONFLICT')
          .map(item => (item.relatedEntityIds || []).sort().join('|'))
      );

      // Auto-resolve: mark OPEN ROOM_CONFLICT items as DONE if conflict no longer active
      const now = new Date().toISOString();
      let updated = prev.map(item => {
        if (
          item.relatedEntityType === 'ROOM_CONFLICT' &&
          item.status === 'OPEN'
        ) {
          const fp = (item.relatedEntityIds || []).sort().join('|');
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
            createdAt: new Date().toISOString(),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (newItems.length === 0 && updated === prev) return prev;
      return [...updated, ...newItems];
    });
  }, [events, rooms]);

  // ── Onboarding: sync org milestones whenever data counts change ──────────────
  useEffect(() => {
    onboarding.syncOrgMilestones({
      activities: activities.length,
      teachers: teachers.length,
      students: students.length,
      events: events.length,
    });
  }, [activities.length, teachers.length, students.length, events.length]);

  // ── Onboarding: update firstUseFlags on first successful data addition ────────
  useEffect(() => {
    if (activities.length > 0) onboarding.updateFirstUseFlag('activityHub');
  }, [activities.length]);
  useEffect(() => {
    if (teachers.length > 0) onboarding.updateFirstUseFlag('staffModule');
  }, [teachers.length]);
  useEffect(() => {
    if (students.length > 0) onboarding.updateFirstUseFlag('studentModule');
  }, [students.length]);
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

  // Navigate to student from inbox
  const [navigateToStudentId, setNavigateToStudentId] = useState<string | null>(null);
  const handleNavigateToStudent = (studentId: string) => {
    setNavigateToStudentId(studentId);
    setCurrentView('STUDENTS');
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
  const GATED_VIEWS: ViewState[] = ['CALENDAR', 'GANTT', 'POWER_TOOLS', 'STUDENTS'];
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
        lists={lists}
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
        // Mobile Sidebar Control
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        onNavigate={setCurrentView}
        currentView={currentView}
      />
    );

    // Unified View for Calendar + Sidebar (Gantt/Power Tools)
    if (['CALENDAR', 'GANTT', 'POWER_TOOLS'].includes(currentView)) {
      const showSidebar = currentView !== 'CALENDAR';

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

          {/* Collapse Arrow — rendered OUTSIDE the sliding panel so it doesn't appear when collapsed */}
          {showSidebar && (
            <button
              onClick={() => setCurrentView('CALENDAR')}
              className="fixed z-50 bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white rounded-full w-10 h-10 flex items-center justify-center shadow-cadenza-deep hover:scale-110 border-4 border-slate-50 dark:border-slate-900 transition-all duration-200 btn-cadenza"
              style={{
                ...(isRtl ? { left: '364px' } : { right: '364px' }), /* 384px sidebar width minus half the button */
                bottom: '26%',
              }}
              title={local_t('app.collapse_sidebar')}
            >
              {isRtl ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
          )}

          {/* Secondary Sidebar - always rendered, slides in/out */}
          <div
            className="sidebar-transition absolute top-0 end-0 h-full bg-white dark:bg-slate-900 shadow-xl z-40 flex flex-col border-s border-slate-200 dark:border-slate-700"
            style={{
              width: '384px',
              transform: showSidebar ? 'translateX(0)' : `translateX(${isRtl ? '-100%' : '100%'})`,
              transition: 'transform 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              willChange: 'transform',
            }}
          >
            {/* Scrollable Content — with top padding to prevent header cropping */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {currentView === 'GANTT' && (
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
              {currentView === 'POWER_TOOLS' && (
                <div className="pt-2">
                  <PowerTools
                    events={events}
                    setEvents={setEvents}
                    teachers={teachers}
                    rooms={rooms}
                    settings={settings}
                    lists={lists}
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
            </div>
          </div>
        </div>
      );
    }

    // Standard Full Page Views
    switch (currentView) {
      // CALENDAR handled above
      case 'STAFF_MEMBERS':
        return (
          <StaffMemberManager
            teachers={teachers}
            setTeachers={setTeachers}
            lists={lists}
            setLists={setLists}
            activities={activities}
            settings={settings}
            hoursReports={hoursReports}
            setHoursReports={setHoursReports}
            students={students}
            adminInboxItems={adminInboxItems}
            setAdminInboxItems={setAdminInboxItems}
            onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
            navigateToId={navigateToStaffId}
            onNavigateHandled={() => setNavigateToStaffId(null)}
          />
        );
      case 'STUDENTS':
        return (
          <StudentManager
            students={students}
            setStudents={setStudents}
            teachers={teachers}
            setTeachers={setTeachers}
            activities={activities}
            setActivities={setActivities}
            events={events}
            settings={settings}
            onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
            navigateToId={navigateToStudentId}
            onNavigateHandled={() => setNavigateToStudentId(null)}
          />
        );
      case 'MANAGE':
        return (
          <ManageHub
            rooms={rooms}
            setRooms={setRooms}
            lists={lists}
            setLists={setLists}
            settings={settings}
            activities={activities}
            setActivities={setActivities}
            subscriptions={calendarSubscriptions}
            setSubscriptions={setCalendarSubscriptions}
            teachers={teachers}
            events={events}
            students={students}
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
                setLists(INITIAL_LISTS);

                // 2. Delete Firestore documents so listeners don't re-populate state
                if (orgId) {
                  const wipeCol = async (colName: string) => {
                    const snap = await getDocs(query(collection(db, colName), where('orgId', '==', orgId)));
                    if (snap.empty) return;
                    const b = writeBatch(db);
                    snap.docs.forEach(d => b.delete(d.ref));
                    await b.commit();
                  };
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
                      // system_configs single-doc settings
                      deleteDoc(doc(db, 'system_configs', `${orgId}_lists`)),
                    ]);
                  } catch (err) {
                    console.warn('[onWipeData] Firestore wipe error (non-fatal):', err);
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
            lists={lists}
            setLists={setLists}
            onNavigateToView={(view) => setCurrentView(view as ViewState)}
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
            onNavigateToStudent={handleNavigateToStudent}
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
      case 'DOCUMENTS':
        return (
          <DocumentTemplates
            settings={settings}
            teachers={teachers}
            students={students}
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
      inboxOpenCount={adminInboxItems.filter(i => i.type === 'TASK' && i.status === 'OPEN').length}
      isGated={isHardGated}
    >
      <div className="relative w-full h-full flex flex-col overflow-hidden">
        <DevSimulationBanner />
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