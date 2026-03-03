import React, { useState, useEffect } from 'react';
import { Room, ListsState, AppSettings, Activity } from '../types';
import { RoomManager } from './RoomManager';
import { ManageLists } from './ManageLists';
import { ActivityManager } from './ActivityManager';
import { Home, List, Menu, Layers } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

type ManageTab = 'rooms' | 'lists' | 'activities';

interface Props {
    rooms: Room[];
    setRooms: React.Dispatch<React.SetStateAction<Room[]>>;
    lists: ListsState;
    setLists: React.Dispatch<React.SetStateAction<ListsState>>;
    settings: AppSettings;
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    onMobileMenuOpen: () => void;
    initialTab?: ManageTab;
    onTabChange?: (tab: ManageTab) => void;
}

export const ManageHub: React.FC<Props> = ({
    rooms,
    setRooms,
    lists,
    setLists,
    settings,
    activities,
    setActivities,
    onMobileMenuOpen,
    initialTab = 'activities',
    onTabChange
}) => {
    const [activeTab, setActiveTab] = useState<ManageTab>(initialTab);
    const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

    // Sync with URL params
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tabFromUrl = params.get('tab') as ManageTab;
        if (tabFromUrl && ['rooms', 'lists', 'activities'].includes(tabFromUrl)) {
            setActiveTab(tabFromUrl);
        }
    }, []);

    // Update URL when tab changes
    const handleTabChange = (tab: ManageTab) => {
        setActiveTab(tab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState({}, '', url.toString());
        onTabChange?.(tab);
    };

    const tabs: { id: ManageTab; label: string; icon: React.ElementType }[] = [
        { id: 'activities', label: t('nav.activities'), icon: Layers },
        { id: 'rooms', label: t('nav.rooms'), icon: Home },
        { id: 'lists', label: t('nav.lists'), icon: List },
    ];

    return (
        <div
            className="flex flex-col h-full bg-slate-50 dark:bg-slate-950"
            style={{ transition: 'background-color 300ms ease-in-out' }}
        >
            {/* Header with Segmented Control - matches CalendarView header height */}
            <div
                className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2 shadow-sm"
                style={{ minHeight: '52px', transition: 'background-color 300ms ease-in-out, border-color 300ms ease-in-out' }}
            >
                <div className="flex items-center gap-3 px-2 h-full">
                    {/* Mobile Menu Button */}
                    <button
                        className="lg:hidden p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                        onClick={onMobileMenuOpen}
                    >
                        <Menu size={24} />
                    </button>

                    {/* Segmented Control - on the left */}
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => handleTabChange(tab.id)}
                                    className={`
                                        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                                        ${isActive
                                            ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                        }
                                    `}
                                >
                                    <Icon size={18} />
                                    <span className="hidden sm:inline">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'activities' && (
                    <ActivityManager
                        activities={activities}
                        setActivities={setActivities}
                        settings={settings}
                        onMobileMenuOpen={onMobileMenuOpen}
                        embedded={true}
                    />
                )}
                {activeTab === 'rooms' && (
                    <RoomManager
                        rooms={rooms}
                        setRooms={setRooms}
                        settings={settings}
                        onMobileMenuOpen={onMobileMenuOpen}
                        embedded={true}
                    />
                )}
                {activeTab === 'lists' && (
                    <ManageLists
                        lists={lists}
                        setLists={setLists}
                        settings={settings}
                        onMobileMenuOpen={onMobileMenuOpen}
                        embedded={true}
                    />
                )}
            </div>
        </div>
    );
};
