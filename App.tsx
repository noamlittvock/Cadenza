import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { ViewState, Teacher, Room, CalendarEvent, GanttBlock, AppSettings, ListsState } from './types';
import { ChartConfiguration } from './types/chartBuilder';
import { INITIAL_TEACHERS, INITIAL_ROOMS, INITIAL_EVENTS, INITIAL_GANTT, INITIAL_SETTINGS, INITIAL_LISTS, TRANSLATIONS, migrateTeacher } from './constants';

const t = (key: string) => {
  const lang = document.documentElement.lang || 'en-US';
  return (TRANSLATIONS as any)[lang]?.[key] || (TRANSLATIONS as any)['en-US']?.[key] || key;
};
import { useFirestoreSync, useFirestoreSettings } from './utils/useFirestoreSync';
import { generateTestData } from './utils/dataGenerator';
import { Layout } from './components/Layout';
import { CalendarView } from './components/CalendarView';
import { GanttManager } from './components/GanttManager';
import { FinancialDashboard } from './components/FinancialDashboard';
import { FinancialAnalysis } from './components/FinancialAnalysis';
import { PowerTools } from './components/PowerTools';
import { Settings } from './components/Settings';
import { ManageHub } from './components/ManageHub';
import { SuperAdmin } from './components/SuperAdmin';

import { AuthProvider, useAuth } from './context/AuthContext';
import { UserRole } from './context/AuthContext';


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
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 text-red-900 min-h-screen flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold mb-4">{t('app.something_wrong')}</h1>
          <div className="bg-white p-4 rounded shadow-lg max-w-lg w-full overflow-auto">
            <p className="font-mono text-sm text-red-600 mb-2">{this.state.error?.toString()}</p>
            <pre className="text-xs text-slate-500 whitespace-pre-wrap">{this.state.errorInfo?.componentStack}</pre>
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

    return this.props.children;
  }
}

function AppContent() {
  const { currentUser, login, isAdmin } = useAuth();
  const [currentView, setCurrentView] = useState<ViewState>('CALENDAR');

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
          {/* Main Calendar Area — stays full width, sidebar overlaps from right */}
          <div
            className="h-full overflow-hidden"
          >
            {CalendarComponent}
          </div>

          {/* Collapse Arrow — rendered OUTSIDE the sliding panel so it doesn't appear when collapsed */}
          {showSidebar && (
            <button
              onClick={() => setCurrentView('CALENDAR')}
              className="fixed z-50 bg-slate-800 hover:bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:scale-110 border-4 border-slate-50 dark:border-slate-900 transition-all duration-200"
              style={{
                ...(isRtl ? { left: '364px' } : { right: '364px' }), /* 384px sidebar width minus half the button */
                bottom: '26%',
              }}
              title={t('app.collapse_sidebar')}
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
      case 'MANAGE':
        return (
          <ManageHub
            teachers={teachers}
            setTeachers={setTeachers}
            rooms={rooms}
            setRooms={setRooms}
            lists={lists}
            setLists={setLists}
            settings={settings}
            onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
          />
        );
      case 'FINANCIAL':
        return <FinancialDashboard events={events} teachers={teachers} settings={settings} savedCharts={savedCharts} setSavedCharts={setSavedCharts} onMobileMenuOpen={() => setIsMobileMenuOpen(true)} />;
      case 'FINANCIAL_ANALYSIS':
        return <FinancialAnalysis events={events} teachers={teachers} settings={settings} savedCharts={savedCharts} setSavedCharts={setSavedCharts} onMobileMenuOpen={() => setIsMobileMenuOpen(true)} onNavigateBack={() => setCurrentView('FINANCIAL')} />;
      case 'SUPER_ADMIN':
        return (
          <SuperAdmin
            settings={settings}
            onLoadTestData={() => {
              console.log("Generating data...");
              const data = generateTestData(settings.currency);
              setTeachers(data.teachers);
              setEvents(data.events);
              setRooms(data.rooms);
              setGanttBlocks(data.ganttBlocks);
            }}
            onWipeData={() => {
              if (window.confirm(t('app.confirm_wipe'))) {
                setTeachers([]);
                setRooms([]);
                setEvents([]);
                setGanttBlocks([]);
              }
            }}
          />
        );
      case 'SETTINGS':
        return (
          <Settings
            settings={settings}
            setSettings={setSettings}
            onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
          />
        );
      default:
        return <div>{t('app.not_found')}</div>;
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
    >
      {renderContent()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </AuthProvider>
  );
}