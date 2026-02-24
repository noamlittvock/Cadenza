import React, { useState, useEffect } from 'react';
import { ViewState } from '../types';
import { Calendar, Users, Home, BarChart3, AlertOctagon, Music, Sun, Moon, ChevronLeft, ChevronRight, Settings, List, Zap, Plus, Menu, Smartphone, Sliders, LineChart } from 'lucide-react';
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
    className={`flex items-center w-full py-3 rounded-lg text-left ${collapsed ? 'justify-center px-3' : 'px-4 space-x-2'} ${active
      ? 'bg-blue-600 text-white'
      : 'text-slate-400 hover:text-white hover:bg-slate-800'
      }`}
    style={{ transition: 'padding 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94), background-color 200ms ease' }}
  >
    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
      <Icon size={24} />
    </div>
    <span className="font-medium whitespace-nowrap overflow-hidden"
      style={{
        opacity: collapsed ? 0 : 1,
        maxWidth: collapsed ? 0 : 200,
        transition: 'opacity 300ms ease, max-width 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}>{label}</span>
  </button>
);

export const Layout: React.FC<LayoutProps> = ({ currentView, setView, children, darkMode, toggleDarkMode, settings, isMobileMenuOpen, setIsMobileMenuOpen }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const { isAdmin, currentUser, login, logout } = useAuth(); // Moved hook up

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
      const adminViews: ViewState[] = ['GANTT', 'POWER_TOOLS', 'MANAGE', 'SETTINGS', 'FINANCIAL_ANALYSIS'];
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
          sidebar-transition
          fixed inset-y-0 left-0 z-[110] lg:relative lg:z-50
          ${isMobile ? 'shadow-2xl' : ''}
          ${isMobile ? (isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
          bg-slate-900 dark:bg-slate-950 text-white flex flex-col shadow-xl 
          ${isRtl ? 'border-l' : 'border-r'} border-slate-800
          overflow-visible
        `}
        style={{
          width: isMobile ? '256px' : (isCollapsed ? '80px' : 'min(25vw, 300px)'),
          transition: 'width 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          willChange: 'width, transform'
        }}
      >
        <div className={`p-2 flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3 rtl:space-x-reverse'} border-b border-slate-800 h-16 overflow-hidden`}
          style={{ transition: 'all 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}>
          <div className={`${isCollapsed ? 'p-1 mx-auto' : 'p-2'} bg-blue-500 rounded-lg flex-shrink-0`}
            style={{ transition: 'all 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}>
            <Music size={24} className="text-white" />
          </div>
          <div className="overflow-hidden whitespace-nowrap flex flex-col justify-center"
            style={{
              opacity: isCollapsed ? 0 : 1,
              maxWidth: isCollapsed ? 0 : 200,
              transition: 'opacity 300ms ease, max-width 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}>
            <h1 className="text-base font-bold leading-tight">Music Center</h1>
            <h1 className="text-base font-bold leading-tight">Calendar</h1>
          </div>
          {isMobile && (
            <button onClick={() => setIsMobileMenuOpen(false)} className="ml-auto p-2 text-slate-400 hover:text-white">
              <ChevronLeft size={24} />
            </button>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto overflow-x-hidden pt-4">


          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 truncate overflow-hidden"
            style={{
              opacity: isCollapsed ? 0 : 1,
              maxHeight: isCollapsed ? 0 : 24,
              marginBottom: isCollapsed ? 0 : 8,
              transition: 'opacity 200ms ease, max-height 400ms ease, margin-bottom 400ms ease',
            }}>
            {t('nav.section.operations')}
          </div>

          <NavItem
            active={['CALENDAR', 'GANTT', 'POWER_TOOLS'].includes(currentView)}
            onClick={() => { setView('CALENDAR'); setIsMobileMenuOpen(false); }}
            icon={Calendar}
            label={t('nav.calendar')}
            collapsed={isCollapsed}
          />




          {isAdmin && (
            <>
              {!isMobile && (
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 truncate overflow-hidden"
                  style={{
                    opacity: isCollapsed ? 0 : 1,
                    maxHeight: isCollapsed ? 0 : 24,
                    marginBottom: isCollapsed ? 0 : 8,
                    marginTop: isCollapsed ? 0 : 24,
                    transition: 'opacity 200ms ease, max-height 400ms ease, margin-bottom 400ms ease, margin-top 400ms ease',
                  }}>
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



              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 truncate overflow-hidden"
                style={{
                  opacity: isCollapsed ? 0 : 1,
                  maxHeight: isCollapsed ? 0 : 24,
                  marginBottom: isCollapsed ? 0 : 8,
                  marginTop: isCollapsed ? 0 : 24,
                  transition: 'opacity 200ms ease, max-height 400ms ease, margin-bottom 400ms ease, margin-top 400ms ease',
                }}>
                {t('nav.section.analytics')}
              </div>
              <NavItem
                active={currentView === 'FINANCIAL'}
                onClick={() => { setView('FINANCIAL'); setIsMobileMenuOpen(false); }}
                icon={BarChart3}
                label={t('nav.financial')}
                collapsed={isCollapsed}
              />
              <NavItem
                active={currentView === 'FINANCIAL_ANALYSIS'}
                onClick={() => { setView('FINANCIAL_ANALYSIS'); setIsMobileMenuOpen(false); }}
                icon={LineChart}
                label="Analysis"
                collapsed={isCollapsed}
              />

              {/* Super Admin Area (Only visible to the root bootstrap admin) */}
              {currentUser?.email === 'noam.littvock@gmail.com' && (
                <>
                  {/* Separator */}
                  <div className="my-2 mx-3 border-t border-red-900/50" />
                  <NavItem
                    active={currentView === 'SUPER_ADMIN'}
                    onClick={() => { setView('SUPER_ADMIN'); setIsMobileMenuOpen(false); }}
                    icon={AlertOctagon}
                    label="Super Admin"
                    collapsed={isCollapsed}
                  />
                </>
              )}

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
          {/* User Profile & Logout */}
          <div className={`mb-4 overflow-hidden ${isCollapsed ? 'text-center' : 'px-2'}`}
            style={{
              transition: 'all 500ms ease',
            }}>
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3 mb-3'}`}>
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold overflow-hidden shrink-0">
                {currentUser?.avatar ? (
                  <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
                ) : (
                  currentUser?.name.charAt(0)
                )}
              </div>
              {!isCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-white truncate">{currentUser?.name}</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">{currentUser?.role}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => logout()}
              className={`flex items-center justify-center space-x-2 py-2 w-full bg-red-950/30 hover:bg-red-900/40 text-red-400 rounded-lg transition-colors border border-red-900/20 ${isCollapsed ? 'p-2' : 'px-4'}`}
              title="Sign Out"
            >
              <Users size={16} />
              {!isCollapsed && <span className="text-sm font-medium">Sign Out</span>}
            </button>
          </div>

          <button
            onClick={toggleDarkMode}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className={`flex items-center justify-center py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors ${isCollapsed ? 'w-10 h-10 p-0' : 'w-full px-4'}`}
          >
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </div>
            <span className="overflow-hidden whitespace-nowrap"
              style={{
                opacity: isCollapsed ? 0 : 1,
                maxWidth: isCollapsed ? 0 : 150,
                marginLeft: isCollapsed ? 0 : 8,
                transition: 'opacity 300ms ease, max-width 500ms ease, margin-left 500ms ease',
              }}>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
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
              <span className="overflow-hidden whitespace-nowrap"
                style={{
                  opacity: isCollapsed ? 0 : 1,
                  maxWidth: isCollapsed ? 0 : 150,
                  marginLeft: isCollapsed ? 0 : 8,
                  transition: 'opacity 300ms ease, max-width 500ms ease, margin-left 500ms ease',
                }}>Mobile Access</span>
            </a>
          )}

          <div className="text-xs text-slate-500 text-center mt-2 overflow-hidden"
            style={{
              opacity: isCollapsed ? 0 : 1,
              maxHeight: isCollapsed ? 0 : 24,
              marginTop: isCollapsed ? 0 : 8,
              transition: 'opacity 200ms ease, max-height 400ms ease, margin-top 400ms ease',
            }}>
            &copy; 2026 Music Center
          </div>
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
