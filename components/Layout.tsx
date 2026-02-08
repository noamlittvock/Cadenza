import React, { useState, useEffect } from 'react';
import { ViewState } from '../types';
import { Calendar, Users, Home, BarChart3, AlertOctagon, Music, Sun, Moon, ChevronLeft, ChevronRight, Settings, List, Zap, Plus, Menu, Smartphone, Sliders } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { TRANSLATIONS } from '../constants';
import { AppSettings } from '../types';

interface LayoutProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  children: React.ReactNode;
  darkMode: boolean;
  toggleDarkMode: () => void;
  settings: AppSettings;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (isOpen: boolean) => void;
}

const NavItem = ({
  active,
  onClick,
  icon: Icon,
  label,
  collapsed
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  collapsed: boolean;
}) => (
  <button
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={`flex items-center w-full py-3 rounded-lg transition-colors text-left ${collapsed ? 'justify-center px-3' : 'px-4 space-x-2'} ${active
      ? 'bg-blue-600 text-white'
      : 'text-slate-400 hover:text-white hover:bg-slate-800'
      }`}
  >
    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
      <Icon size={24} className="transition-all" />
    </div>
    {!collapsed && <span className="font-medium whitespace-nowrap overflow-hidden transition-all">{label}</span>}
  </button>
);

export const Layout: React.FC<LayoutProps> = ({ currentView, setView, children, darkMode, toggleDarkMode, settings, isMobileMenuOpen, setIsMobileMenuOpen }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const { isAdmin, currentUser, login } = useAuth(); // Moved hook up

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setIsCollapsed(false); // Mobile sidebar is always "full width" when open
      } else {
        // Desktop defaults
        if (!isCollapsed) setIsCollapsed(false);
      }
    };

    // Initial check
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Redirect Viewers from Admin Pages
  useEffect(() => {
    if (currentUser?.role === 'VIEWER') {
      const adminViews: ViewState[] = ['GANTT', 'POWER_TOOLS', 'MANAGE', 'SETTINGS'];
      if (adminViews.includes(currentView)) {
        setView('CALENDAR');
      }
    }
  }, [currentUser, currentView, setView]);



  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const isRtl = settings.language === 'he-IL';

  return (
    <div
      className="flex h-screen supports-[height:100dvh]:h-[100dvh] bg-slate-50 dark:bg-slate-900 overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ transition: 'background-color 300ms ease-in-out' }}
    >
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[105] lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-[110] lg:relative lg:z-50
          ${isMobile ? 'w-64 shadow-2xl' : (isCollapsed ? 'w-20' : 'w-[25vw] max-w-[300px]')}
          ${isMobile ? (isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
          bg-slate-900 dark:bg-slate-950 text-white flex flex-col shadow-xl 
          ${isRtl ? 'border-l' : 'border-r'} border-slate-800 transition-all duration-300 ease-in-out
          overflow-visible
        `}
      >
        <div className={`p-2 flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3 rtl:space-x-reverse'} border-b border-slate-800 h-16 transition-all overflow-hidden`}>
          <div className={`${isCollapsed ? 'p-1 mx-auto' : 'p-2'} bg-blue-500 rounded-lg flex-shrink-0 transition-all`}>
            <Music size={24} className="text-white transform transition-transform" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden whitespace-nowrap flex flex-col justify-center">
              <h1 className="text-base font-bold leading-tight">Music Center</h1>
              <h1 className="text-base font-bold leading-tight">Calendar</h1>
            </div>
          )}
          {isMobile && (
            <button onClick={() => setIsMobileMenuOpen(false)} className="ml-auto p-2 text-slate-400 hover:text-white">
              <ChevronLeft size={24} />
            </button>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto overflow-x-hidden pt-4">


          {!isCollapsed && (
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-4 truncate">
              {t('nav.section.operations')}
            </div>
          )}

          <NavItem
            active={['CALENDAR', 'GANTT', 'POWER_TOOLS'].includes(currentView)}
            onClick={() => { setView('CALENDAR'); setIsMobileMenuOpen(false); }}
            icon={Calendar}
            label={t('nav.calendar')}
            collapsed={isCollapsed}
          />




          {isAdmin && (
            <>
              {!isCollapsed && !isMobile && (
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-6 px-4 truncate">
                  {t('nav.section.admin')}
                </div>
              )}

              {!isMobile && (
                <NavItem
                  active={currentView === 'MANAGE'}
                  onClick={() => { setView('MANAGE'); setIsMobileMenuOpen(false); }}
                  icon={Sliders}
                  label={t('nav.manage')}
                  collapsed={isCollapsed}
                />
              )}



              {!isCollapsed && (
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-6 px-4 truncate">
                  {t('nav.section.analytics')}
                </div>
              )}
              <NavItem
                active={currentView === 'FINANCIAL'}
                onClick={() => { setView('FINANCIAL'); setIsMobileMenuOpen(false); }}
                icon={BarChart3}
                label={t('nav.financial')}
                collapsed={isCollapsed}
              />

              {/* Separator */}
              <div className="my-2 mx-3 border-t border-slate-800" />

              <NavItem
                active={currentView === 'SETTINGS'}
                onClick={() => { setView('SETTINGS'); setIsMobileMenuOpen(false); }}
                icon={Settings}
                label={t('nav.settings')}
                collapsed={isCollapsed}
              />
            </>
          )}
        </nav>



        {/* Toggle Button - Half-In Half-Out - Desktop Only */}
        {!isMobile && (
          <div className="relative w-full py-4 shrink-0 flex items-center">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="absolute right-0 translate-x-1/2 bg-blue-600 hover:bg-blue-500 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-xl transition-transform hover:scale-110 z-50 border-[6px] border-slate-50 dark:border-slate-900"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isCollapsed ? (isRtl ? <ChevronLeft size={24} /> : <ChevronRight size={24} />) : (isRtl ? <ChevronRight size={24} /> : <ChevronLeft size={24} />)}
            </button>
          </div>
        )}

        <div className={`p-4 border-t border-slate-800 flex flex-col ${isCollapsed ? 'items-center px-2' : 'items-stretch'}`}>

          {!isCollapsed && (
            <div className="flex flex-col gap-2 w-full mb-4">
              <div className="flex gap-1 text-xs bg-slate-800 p-1 rounded-lg">
                <button
                  onClick={() => login('ADMIN')}
                  className={`flex-1 py-1 rounded transition-colors ${currentUser?.role === 'ADMIN' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Admin
                </button>
                <button
                  onClick={() => login('VIEWER')}
                  className={`flex-1 py-1 rounded transition-colors ${currentUser?.role === 'VIEWER' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Viewer
                </button>
              </div>
            </div>
          )}

          <button
            onClick={toggleDarkMode}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className={`flex items-center justify-center py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors ${isCollapsed ? 'w-10 h-10 p-0' : 'w-full px-4'}`}
          >
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </div>
            {!isCollapsed && <span className="ml-2">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {!isMobile && (
            <a
              href="/mobile-access.html"
              target="_blank"
              rel="noopener noreferrer"
              title={isCollapsed ? "Mobile Access" : undefined}
              className={`flex items-center justify-center mt-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors ${isCollapsed ? 'w-10 h-10 p-0' : 'w-full py-2 px-4'}`}
            >
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                <Smartphone size={18} />
              </div>
              {!isCollapsed && <span className="ml-2">Mobile Access</span>}
            </a>
          )}

          {!isCollapsed && (
            <div className="text-xs text-slate-500 text-center mt-2">
              &copy; 2026 Music Center
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main
          className="flex-1 flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-900 relative"
          style={{ transition: 'background-color 300ms ease-in-out' }}
        >

          {children}
        </main>
      </div>
    </div>
  );
};
