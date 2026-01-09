import React, { useState } from 'react';
import { ViewState } from '../types';
import { Calendar, Users, Home, BarChart3, AlertOctagon, Music, Sun, Moon, ChevronLeft, ChevronRight, Settings, List } from 'lucide-react';

interface LayoutProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  children: React.ReactNode;
  darkMode: boolean;
  toggleDarkMode: () => void;
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
    className={`flex items-center ${collapsed ? 'justify-center px-2' : 'space-x-2 px-4'} py-3 rounded-lg transition-colors w-full text-left ${
      active 
        ? 'bg-blue-600 text-white' 
        : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`}
  >
    <Icon size={20} className="flex-shrink-0" />
    {!collapsed && <span className="font-medium whitespace-nowrap overflow-hidden transition-all">{label}</span>}
  </button>
);

export const Layout: React.FC<LayoutProps> = ({ currentView, setView, children, darkMode, toggleDarkMode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors duration-200">
      {/* Sidebar */}
      <div 
        className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-900 dark:bg-slate-950 text-white flex flex-col shadow-xl z-20 border-r border-slate-800 transition-all duration-300 ease-in-out relative`}
      >
        <div className={`p-4 flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} border-b border-slate-800 h-20`}>
          <div className="bg-blue-500 p-2 rounded-lg flex-shrink-0">
            <Music size={24} className="text-white" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden whitespace-nowrap">
              <h1 className="text-lg font-bold leading-none">Music Center</h1>
              <p className="text-xs text-slate-400 mt-1">Management v1.0</p>
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto overflow-x-hidden">
          {!isCollapsed && (
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-2 px-4 truncate">
              Operations
            </div>
          )}
          <NavItem 
            active={currentView === 'CALENDAR'} 
            onClick={() => setView('CALENDAR')} 
            icon={Calendar} 
            label="Smart Calendar"
            collapsed={isCollapsed}
          />
           <NavItem 
            active={currentView === 'GANTT'} 
            onClick={() => setView('GANTT')} 
            icon={AlertOctagon} 
            label="Gantt & Blackout" 
            collapsed={isCollapsed}
          />

          {!isCollapsed && (
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-6 px-4 truncate">
              Administration
            </div>
          )}
          <NavItem 
            active={currentView === 'TEACHERS'} 
            onClick={() => setView('TEACHERS')} 
            icon={Users} 
            label="Teachers" 
            collapsed={isCollapsed}
          />
          <NavItem 
            active={currentView === 'ROOMS'} 
            onClick={() => setView('ROOMS')} 
            icon={Home} 
            label="Rooms" 
            collapsed={isCollapsed}
          />
          <NavItem 
            active={currentView === 'LISTS'} 
            onClick={() => setView('LISTS')} 
            icon={List} 
            label="Manage Lists" 
            collapsed={isCollapsed}
          />

          {!isCollapsed && (
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-6 px-4 truncate">
              Analytics
            </div>
          )}
          <NavItem 
            active={currentView === 'FINANCIAL'} 
            onClick={() => setView('FINANCIAL')} 
            icon={BarChart3} 
            label="Financial Dashboard" 
            collapsed={isCollapsed}
          />
          
          {/* Separator */}
          <div className="my-2 border-t border-slate-800" />
          
           <NavItem 
            active={currentView === 'SETTINGS'} 
            onClick={() => setView('SETTINGS')} 
            icon={Settings} 
            label="Settings" 
            collapsed={isCollapsed}
          />
        </nav>
        
        {/* Toggle Button - Centered between nav and footer */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-5 bottom-40 bg-blue-600 hover:bg-blue-500 text-white rounded-full w-10 h-10 flex items-center justify-center shadow-xl border-4 border-slate-50 dark:border-slate-800 z-50 transition-transform hover:scale-110"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>

        <div className="p-4 border-t border-slate-800 flex flex-col items-center">
           <button 
             onClick={toggleDarkMode}
             title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
             className={`flex items-center justify-center w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors mb-4 ${isCollapsed ? 'px-0' : 'px-4'}`}
           >
             {darkMode ? <Sun size={18} className={!isCollapsed ? "mr-2" : ""} /> : <Moon size={18} className={!isCollapsed ? "mr-2" : ""} />}
             {!isCollapsed && (darkMode ? 'Light Mode' : 'Dark Mode')}
           </button>
           
          {!isCollapsed && (
            <div className="text-xs text-slate-500 text-center mt-2">
              &copy; 2026 Music Center
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 transition-colors duration-200">
          {children}
        </main>
      </div>
    </div>
  );
};
