import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, BarChart3, LineChart } from 'lucide-react';
import { ViewState, Teacher, Room, CalendarEvent, GanttBlock, AppSettings, ListsState, Activity, Student, CalendarSubscription, HoursReport, AdminInboxItem } from './types';
import { ChartConfiguration } from './types/chartBuilder';
import { INITIAL_TEACHERS, INITIAL_ROOMS, INITIAL_EVENTS, INITIAL_GANTT, INITIAL_SETTINGS, INITIAL_LISTS, TRANSLATIONS, migrateTeacher, generateId } from './constants';

const t = (key: string) => {
  const lang = document.documentElement.lang || 'en-US';
  return (TRANSLATIONS as any)[lang]?.[key] || (TRANSLATIONS as any)['en-US']?.[key] || key;
};
import { useFirestoreSync, useFirestoreSettings } from './utils/useFirestoreSync';
import { generateTestData } from './utils/dataGenerator';
import { detectRoomConflicts } from './utils/roomConflicts';
import { ImportedGoogleEvent } from './utils/googleCalendarSync';
import { Layout } from './components/Layout';
import { CalendarView } from './components/CalendarView';
import { GanttManager } from './components/GanttManager';
import { FinancialDashboard } from './components/FinancialDashboard';
import { FinancialAnalysis } from './components/FinancialAnalysis';
import { PowerTools } from './components/PowerTools';
import { Settings } from './components/Settings';
import { ManageHub } from './components/ManageHub';
import { StaffMemberManager } from './components/StaffMemberManager';
import { StudentManager } from './components/StudentManager';
import { SuperAdmin } from './components/SuperAdmin';
import { AdminInbox } from './components/AdminInbox';

import { TeacherHoursForm } from './components/TeacherHoursForm';

import { AuthProvider, useAuth } from './context/AuthContext';
import { UserRole } from './context/AuthContext';
import { TranslationProvider, useTranslation } from './context/TranslationContext';


// --- Financial Hub: Tabbed container for Dashboard + Analysis ---
const FinancialHub: React.FC<{
  financialTab: 'dashboard' | 'analysis';
  setFinancialTab: (tab: 'dashboard' | 'analysis') => void;
  events: CalendarEvent[];
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  settings: AppSettings;
  savedCharts: ChartConfiguration[];
  setSavedCharts: React.Dispatch<React.SetStateAction<ChartConfiguration[]>>;
  hoursReports: HoursReport[];
  setHoursReports: React.Dispatch<React.SetStateAction<HoursReport[]>>;
  activities: Activity[];
  onMobileMenuOpen: () => void;
}> = ({ financialTab, setFinancialTab, events, teachers, setTeachers, settings, savedCharts, setSavedCharts, hoursReports, setHoursReports, activities, onMobileMenuOpen }) => (
  <div className="flex flex-col h-full">
    <div className="flex items-center gap-1 px-4 pt-3 pb-1">
      {[
        { key: 'dashboard' as const, icon: BarChart3, label: t('nav.financial_dashboard') || 'Dashboard' },
        { key: 'analysis' as const, icon: LineChart, label: t('nav.financial_analysis') || 'Analysis' },
      ].map(tab => (
        <button
          key={tab.key}
          onClick={() => setFinancialTab(tab.key)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            financialTab === tab.key
              ? 'bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <tab.icon size={16} />
          {tab.label}
        </button>
      ))}
    </div>
    <div className="flex-1 overflow-auto">
      {financialTab === 'dashboard' ? (
        <FinancialDashboard events={events} teachers={teachers} setTeachers={setTeachers} settings={settings} savedCharts={savedCharts} setSavedCharts={setSavedCharts} hoursReports={hoursReports} setHoursReports={setHoursReports} activities={activities} onMobileMenuOpen={onMobileMenuOpen} />
      ) : (
        <FinancialAnalysis events={events} teachers={teachers} settings={settings} savedCharts={savedCharts} setSavedCharts={setSavedCharts} activities={activities} onMobileMenuOpen={onMobileMenuOpen} onNavigateBack={() => setFinancialTab('dashboard')} />
      )}
    </div>
  </div>
);

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
  const { currentUser, login, isAdmin } = useAuth();
  const [currentView, setCurrentView] = useState<ViewState>('CALENDAR');
  const [financialTab, setFinancialTab] = useState<'dashboard' | 'analysis'>('dashboard');
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
  const [activities, setActivities] = useFirestoreSync<Activity>('activities', []);
  const [students, setStudents] = useFirestoreSync<Student>('students', []);
  const [calendarSubscriptions, setCalendarSubscriptions] = useFirestoreSync<CalendarSubscription>('calendarSubscriptions', []);
  const [hoursReports, setHoursReports] = useFirestoreSync<HoursReport>('hoursReports', []);
  const [adminInboxItems, setAdminInboxItems] = useFirestoreSync<AdminInboxItem>('adminInboxItems', []);
  const [settings, setSettings] = useFirestoreSettings<AppSettings>('settings', INITIAL_SETTINGS);
  const [lists, setLists] = useFirestoreSettings<ListsState>('lists', INITIAL_LISTS);
  const [savedCharts, setSavedCharts] = useFirestoreSettings<ChartConfiguration[]>('customCharts', []);

  // Marquee Selection State (Lifted)
  const [selectionMode, setSelectionMode] = useState<'NORMAL' | 'MARQUEE'>('NORMAL');
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  // Persistent Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'DAY' | 'WEEK' | 'MONTH'>('WEEK');

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

  // Room conflict detection → admin inbox notifications
  useEffect(() => {
    const conflicts = detectRoomConflicts(events);
    if (conflicts.length === 0) return;

    // Use functional updater to read latest adminInboxItems without stale closure
    setAdminInboxItems(prev => {
      const existingFingerprints = new Set(
        prev
          .filter(item => item.relatedEntityType === 'ROOM_CONFLICT')
          .map(item => (item.relatedEntityIds || []).sort().join('|'))
      );

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

      if (newItems.length === 0) return prev;
      return [...prev, ...newItems];
    });
  }, [events, rooms]);

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
  const handleNavigateToStaff = (_staffId: string) => {
    setCurrentView('STAFF_MEMBERS');
  };

  // Navigate to student from inbox
  const handleNavigateToStudent = (_studentId: string) => {
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
          classification: 'OTHER',
          isCanceled: false,
          isHidden: false,
          googleEventId: g.googleEventId,
        } as CalendarEvent));
      return [...prev, ...newEvents];
    });
  };

  // Route Rendering
  const renderContent = () => {
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
            onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
          />
        );
      case 'FINANCIAL':
        return (
          <FinancialHub
            financialTab={financialTab}
            setFinancialTab={setFinancialTab}
            events={events}
            teachers={teachers}
            setTeachers={setTeachers}
            settings={settings}
            savedCharts={savedCharts}
            setSavedCharts={setSavedCharts}
            hoursReports={hoursReports}
            setHoursReports={setHoursReports}
            activities={activities}
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
            onLoadTestData={() => {
              console.log("Generating data...");
              const data = generateTestData(settings.currency);
              setTeachers(data.teachers);
              setEvents(data.events);
              setRooms(data.rooms);
              setGanttBlocks(data.ganttBlocks);
              setActivities(data.activities);
              setStudents(data.students);
              if (data.adminInboxItems) {
                setAdminInboxItems(data.adminInboxItems);
              }
              if (data.savedCharts) {
                setSavedCharts(data.savedCharts);
              }
              if (data.hoursReports) {
                setHoursReports(data.hoursReports);
              }
              if (data.subscriptions) {
                setCalendarSubscriptions(data.subscriptions);
              }
              // Seed FinancialAnalysis localStorage keys
              localStorage.setItem('financial-analysis-custom-insights', JSON.stringify([
                { id: 'ci_1', title: 'Top Earner Active Hours', metric: 'maxEarner' },
                { id: 'ci_2', title: 'Avg Monthly Payroll', metric: 'avgGrandTotal' },
                { id: 'ci_3', title: 'Cancellation Rate Trend', metric: 'cancellationRate' },
              ]));
              localStorage.removeItem('financial-analysis-visible-insights');
            }}
            onWipeData={() => {
                setTeachers([]);
                setRooms([]);
                setEvents([]);
                setGanttBlocks([]);
                setStudents([]);
                setActivities([]);
                setAdminInboxItems([]);
                setSavedCharts([]);
                setHoursReports([]);
                setCalendarSubscriptions([]);
                localStorage.removeItem('financial-analysis-custom-insights');
                localStorage.removeItem('financial-analysis-visible-insights');
            }}
            setTeachers={setTeachers}
            setSavedCharts={setSavedCharts}
            setHoursReports={setHoursReports}
            setRooms={setRooms}
            setGanttBlocks={setGanttBlocks}
            setActivities={setActivities}
            setStudents={setStudents}
            setAdminInboxItems={setAdminInboxItems}
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
      default:
        return <div>{local_t('app.not_found')}</div>;
    }
  };

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
    >
      {renderContent()}
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
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </AuthProvider>
    </TranslationProvider>
  );
}