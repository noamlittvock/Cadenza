import React, { useState, useEffect } from 'react';
import { ViewState, Teacher, Room, CalendarEvent, GanttBlock, AppSettings, ListsState } from './types';
import { ChartConfiguration } from './types/chartBuilder';
import { INITIAL_TEACHERS, INITIAL_ROOMS, INITIAL_EVENTS, INITIAL_GANTT, INITIAL_SETTINGS, INITIAL_LISTS, migrateTeacher } from './constants';
import { generateTestData } from './utils/dataGenerator';
import { Layout } from './components/Layout';
import { CalendarView } from './components/CalendarView';
import { GanttManager } from './components/GanttManager';
import { FinancialDashboard } from './components/FinancialDashboard';
import { FinancialAnalysis } from './components/FinancialAnalysis';
import { PowerTools } from './components/PowerTools';
import { Settings } from './components/Settings';
import { ManageHub } from './components/ManageHub';

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
          <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
          <div className="bg-white p-4 rounded shadow-lg max-w-lg w-full overflow-auto">
            <p className="font-mono text-sm text-red-600 mb-2">{this.state.error?.toString()}</p>
            <pre className="text-xs text-slate-500 whitespace-pre-wrap">{this.state.errorInfo?.componentStack}</pre>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reload App
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
  // Core State (Simulating Database)
  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const saved = localStorage.getItem('teachers');
    const parsed = saved ? JSON.parse(saved) : INITIAL_TEACHERS;
    return parsed.map((t: any) => migrateTeacher(t));
  });

  const [rooms, setRooms] = useState<Room[]>(() => {
    const saved = localStorage.getItem('rooms');
    return saved ? JSON.parse(saved) : INITIAL_ROOMS;
  });

  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem('events');
    return saved ? JSON.parse(saved) : INITIAL_EVENTS;
  });

  const [ganttBlocks, setGanttBlocks] = useState<GanttBlock[]>(() => {
    const saved = localStorage.getItem('ganttBlocks');
    return saved ? JSON.parse(saved) : INITIAL_GANTT;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('settings');
    // Merge with defaults so newly added fields (e.g. currency) are never undefined
    return saved ? { ...INITIAL_SETTINGS, ...JSON.parse(saved) } : INITIAL_SETTINGS;
  });

  const [lists, setLists] = useState<ListsState>(() => {
    const saved = localStorage.getItem('lists');
    return saved ? JSON.parse(saved) : INITIAL_LISTS;
  });

  // Custom Chart Builder State
  const [savedCharts, setSavedCharts] = useState<ChartConfiguration[]>(() => {
    const saved = localStorage.getItem('customCharts');
    return saved ? JSON.parse(saved) : [];
  });

  // Marquee Selection State (Lifted)
  const [selectionMode, setSelectionMode] = useState<'NORMAL' | 'MARQUEE'>('NORMAL');
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  // Persistent Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'DAY' | 'WEEK' | 'MONTH'>('WEEK');


  // Persistence Effects
  useEffect(() => localStorage.setItem('teachers', JSON.stringify(teachers)), [teachers]);
  useEffect(() => localStorage.setItem('rooms', JSON.stringify(rooms)), [rooms]);
  useEffect(() => localStorage.setItem('events', JSON.stringify(events)), [events]);
  useEffect(() => localStorage.setItem('ganttBlocks', JSON.stringify(ganttBlocks)), [ganttBlocks]);
  useEffect(() => localStorage.setItem('settings', JSON.stringify(settings)), [settings]);
  useEffect(() => localStorage.setItem('lists', JSON.stringify(lists)), [lists]);
  useEffect(() => localStorage.setItem('customCharts', JSON.stringify(savedCharts)), [savedCharts]);

  // Sync Language to DOM
  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dir = settings.language === 'he-IL' ? 'rtl' : 'ltr';
  }, [settings.language]);

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
          {/* Main Calendar Area */}
          <div
            className="sidebar-transition h-full overflow-hidden"
            style={{
              marginRight: showSidebar ? '384px' : '0px',
              transition: 'margin-right 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            {CalendarComponent}
          </div>

          {/* Secondary Sidebar - always rendered, slides in/out */}
          <div
            className="sidebar-transition absolute top-0 right-0 h-full bg-white dark:bg-slate-900 shadow-xl z-20 flex flex-col border-l border-slate-200 dark:border-slate-700"
            style={{
              width: '384px',
              transform: showSidebar ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              willChange: 'transform',
            }}
          >
            <div className="flex-1 overflow-y-auto">
              <div className="h-full overflow-y-auto">
                {currentView === 'GANTT' && (
                  <div className="p-4">
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
                )}
              </div>
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
      case 'SETTINGS':
        return (
          <Settings
            settings={settings}
            setSettings={setSettings}
            onMobileMenuOpen={() => setIsMobileMenuOpen(true)}
            onLoadTestData={() => {
              console.log("Generating data...");
              const data = generateTestData(settings.currency);
              setTeachers(data.teachers);
              setEvents(data.events);
              setRooms(data.rooms);
            }}
          />
        );
      default:
        return <div>Not found</div>;
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