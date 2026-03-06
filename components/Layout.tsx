import React, { useState, useEffect } from 'react';
import { ViewState } from '../types';
import { Calendar, Users, Home, BarChart3, AlertOctagon, Music, Sun, Moon, ChevronLeft, ChevronRight, Settings, List, Zap, Plus, Menu, Smartphone, Sliders, LineChart, GraduationCap, Inbox } from 'lucide-react';
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
  inboxOpenCount?: number;
}

const NavItem = ({
  active,
  onClick,
  icon: Icon,
  label,
  collapsed,
  badge
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  collapsed: boolean;
  badge?: number;
}) => (
  <button
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={`relative flex items-center w-full py-2.5 rounded-xl text-start ${collapsed ? 'justify-center px-3' : 'px-4 space-x-2 rtl:space-x-reverse'} ${active
      ? 'bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft font-semibold'
      : 'text-slate-400 hover:text-white hover:bg-white/5 hover:shadow-cadenza-soft'
      } btn-cadenza`}
    style={{ transition: 'padding 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
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
    {badge !== undefined && badge > 0 && (
      <span className={`bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 ${collapsed ? 'absolute -top-0.5 -end-0.5' : 'ms-auto'}`}>
        {badge}
      </span>
    )}
  </button>
);

export const Layout: React.FC<LayoutProps> = ({ currentView, setView, children, darkMode, toggleDarkMode, settings, isMobileMenuOpen, setIsMobileMenuOpen, inboxOpenCount }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const { isAdmin, isSuperAdmin, currentUser, orgId, logout, availableOrgs } = useAuth();
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const isRtl = settings.language === 'he-IL';

  const currentOrg = availableOrgs?.find(o => o.id === orgId);
  const displayOrgName = currentOrg?.name || (orgId ? orgId.charAt(0).toUpperCase() + orgId.slice(1) : t('layout.loading'));

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
      const adminViews: ViewState[] = ['GANTT', 'POWER_TOOLS', 'MANAGE', 'SETTINGS', 'SUPER_ADMIN', 'STAFF_MEMBERS', 'STUDENTS', 'ADMIN_INBOX'];
      if (adminViews.includes(currentView)) {
        setView('CALENDAR');
      }
    }
    // Non-superadmin admins cannot access SUPER_ADMIN
    if (isAdmin && !isSuperAdmin && currentView === 'SUPER_ADMIN') {
      setView('CALENDAR');
    }
  }, [currentUser, currentView, setView]);





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
          fixed inset-y-0 start-0 z-[110] lg:relative lg:z-50
          ${isMobile ? 'shadow-2xl' : ''}
          ${isMobile ? (isMobileMenuOpen ? 'translate-x-0' : (isRtl ? 'translate-x-full' : '-translate-x-full')) : 'translate-x-0'}
          bg-slate-900/95 backdrop-blur-2xl dark:bg-slate-950/95 text-white flex flex-col shadow-cadenza-deep 
          border-e ${orgId === 'sandbox' ? 'border-amber-500/50 shadow-amber-500/10' : 'border-white/5 dark:border-slate-800/50'}
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
          <div className={`${isCollapsed ? 'p-1 mx-auto' : 'p-1.5'} bg-transparent rounded-xl flex-shrink-0 overflow-hidden`}
            style={{ transition: 'all 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}>
            <img src="/logo.png?v=2" alt={t('layout.logo_alt')} className="w-12 h-12 object-cover rounded shadow-sm" />
          </div>
          <div className="overflow-hidden flex flex-col justify-center flex-1"
            style={{
              opacity: isCollapsed ? 0 : 1,
              maxWidth: isCollapsed ? 0 : 200,
              transition: 'opacity 300ms ease, max-width 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}>
            <h1 className="text-sm font-bold leading-snug break-words text-center flex items-center justify-center min-h-full" title={displayOrgName}>
              {displayOrgName}
            </h1>
            {orgId === 'sandbox' && !isCollapsed && (
              <div className="mt-1 flex justify-center">
                <span className="bg-amber-500 text-[10px] font-black px-1.5 py-0.5 rounded text-white animate-pulse">{t('layout.sandbox_badge')}</span>
              </div>
            )}
          </div>
          {isMobile && (
            <button onClick={() => setIsMobileMenuOpen(false)} className="ms-auto p-2 text-slate-400 hover:text-white">
              {isRtl ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
            </button>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto overflow-x-hidden pt-3">


          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 truncate overflow-hidden"
            style={{
              opacity: isCollapsed ? 0 : 1,
              maxHeight: isCollapsed ? 0 : 24,
              marginBottom: isCollapsed ? 0 : 4,
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
                    marginBottom: isCollapsed ? 0 : 4,
                    marginTop: isCollapsed ? 0 : 16,
                    transition: 'opacity 200ms ease, max-height 400ms ease, margin-bottom 400ms ease, margin-top 400ms ease',
                  }}>
                  {t('nav.section.admin')}
                </div>
              )}

              {!isMobile && (
                <NavItem
                  active={currentView === 'STAFF_MEMBERS'}
                  onClick={() => { setView('STAFF_MEMBERS'); setIsMobileMenuOpen(false); }}
                  icon={Users}
                  label={t('nav.staff_members')}
                  collapsed={isCollapsed}
                />
              )}

              {!isMobile && (
                <NavItem
                  active={currentView === 'STUDENTS'}
                  onClick={() => { setView('STUDENTS'); setIsMobileMenuOpen(false); }}
                  icon={GraduationCap}
                  label={t('nav.students')}
                  collapsed={isCollapsed}
                />
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

              {!isMobile && (
                <NavItem
                  active={currentView === 'ADMIN_INBOX'}
                  onClick={() => { setView('ADMIN_INBOX'); setIsMobileMenuOpen(false); }}
                  icon={Inbox}
                  label={t('nav.admin_inbox')}
                  collapsed={isCollapsed}
                  badge={inboxOpenCount}
                />
              )}

              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 truncate overflow-hidden"
                style={{
                  opacity: isCollapsed ? 0 : 1,
                  maxHeight: isCollapsed ? 0 : 24,
                  marginBottom: isCollapsed ? 0 : 4,
                  marginTop: isCollapsed ? 0 : 16,
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
                active={currentView === 'SETTINGS'}
                onClick={() => { setView('SETTINGS'); setIsMobileMenuOpen(false); }}
                icon={Settings}
                label={t('nav.settings')}
                collapsed={isCollapsed}
              />

              {/* Super Admin Area (Only visible to superadmin) */}
              {isSuperAdmin && (
                <>
                  {/* Separator */}
                  <div className="my-2 mx-3 border-t border-slate-800" />
                  <NavItem
                    active={currentView === 'SUPER_ADMIN'}
                    onClick={() => { setView('SUPER_ADMIN'); setIsMobileMenuOpen(false); }}
                    icon={AlertOctagon}
                    label={t('nav.super_admin')}
                    collapsed={isCollapsed}
                  />
                </>
              )}
            </>
          )}
        </nav>



        {/* Toggle Button - Half-In Half-Out - Desktop Only */}
        {!isMobile && (
          <div className="relative w-full py-4 shrink-0 flex items-center">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`absolute end-0 ${isRtl ? '-translate-x-1/2' : 'translate-x-1/2'} bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white rounded-full w-10 h-10 flex items-center justify-center shadow-cadenza-deep hover:scale-110 z-50 border-4 border-slate-50 dark:border-slate-900 transition-all duration-200 btn-cadenza`}
              title={isCollapsed ? t('layout.expand_sidebar') : t('layout.collapse_sidebar')}
            >
              {isCollapsed ? (isRtl ? <ChevronLeft size={20} /> : <ChevronRight size={20} />) : (isRtl ? <ChevronRight size={20} /> : <ChevronLeft size={20} />)}
            </button>
          </div>
        )}

        <div className={`p-4 border-t border-slate-800 flex flex-col ${isCollapsed ? 'items-center px-2' : 'items-stretch'}`}>
          {/* User Profile & Logout */}
          <div className={`mb-4 overflow-hidden ${isCollapsed ? 'text-center' : 'px-2'}`}
            style={{
              transition: 'all 500ms ease',
            }}>
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3 rtl:space-x-reverse mb-3'}`}>
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
              className={`flex items-center justify-center space-x-2 rtl:space-x-reverse py-2 w-full bg-red-950/30 hover:bg-red-900/40 text-red-400 rounded-xl border border-red-900/20 btn-cadenza ${isCollapsed ? 'p-2' : 'px-4'}`}
              title={t('common.sign_out')}
            >
              <Users size={16} />
              {!isCollapsed && <span className="text-sm font-medium">{t('layout.sign_out')}</span>}
            </button>
          </div>

          <button
            onClick={toggleDarkMode}
            title={darkMode ? t('layout.switch_light') : t('layout.switch_dark')}
            className={`flex items-center justify-center py-2 bg-slate-800/50 hover:bg-slate-700/80 rounded-xl text-slate-300 btn-cadenza ${isCollapsed ? 'w-10 h-10 p-0' : 'w-full px-4'}`}
          >
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </div>
            <span className="overflow-hidden whitespace-nowrap"
              style={{
                opacity: isCollapsed ? 0 : 1,
                maxWidth: isCollapsed ? 0 : 150,
                marginInlineStart: isCollapsed ? 0 : 8,
                transition: 'opacity 300ms ease, max-width 500ms ease, margin-inline-start 500ms ease',
              }}>{darkMode ? t('layout.light_mode') : t('layout.dark_mode')}</span>
          </button>

          {!isMobile && (
            <a
              href="/mobile-access.html"
              target="_blank"
              rel="noopener noreferrer"
              title={isCollapsed ? t('layout.mobile_access') : undefined}
              className={`flex items-center justify-center mt-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white btn-cadenza ${isCollapsed ? 'w-10 h-10 p-0' : 'w-full py-2 px-4'}`}
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
                }}>{t('layout.mobile_access_label')}</span>
            </a>
          )}

          <div className="text-xs text-slate-500 text-center mt-2 overflow-hidden"
            style={{
              opacity: isCollapsed ? 0 : 1,
              maxHeight: isCollapsed ? 0 : 24,
              marginTop: isCollapsed ? 0 : 8,
              transition: 'opacity 200ms ease, max-height 400ms ease, margin-top 400ms ease',
            }}>
            {t('layout.copyright')}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-900 absolute end-0 top-0 bottom-0"
        style={{
          width: isMobile ? '100%' : (isCollapsed ? 'calc(100% - 80px)' : 'max(calc(100% - 300px), 75vw)'),
          transition: 'width 500ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}>
        <main
          key={currentView}
          className="flex-1 flex flex-col overflow-hidden relative animate-page-turn h-full w-full"
          style={{ transition: 'background-color 300ms ease-in-out' }}
        >

          {children}
        </main>
      </div>
    </div>
  );
};
