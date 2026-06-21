import React, { useState, useEffect } from 'react';
import { Room, AppSettings, CalendarSubscription, Teacher, CalendarEvent, Student, HoursReport, AdminInboxItem } from '../types';
import type { ActivityV2 } from '../types/v2';
import { RoomManager } from './RoomManager';
import { ActivityManager } from './ActivityManager';
import { CalendarSubscriptionManager } from './CalendarSubscriptionManager';
import { StaffMemberManager } from './StaffMemberManager';
import { InstrumentManager } from './InstrumentManager';
import { AgreementManager } from './AgreementManager';
import { AssessmentWorkspace } from './AssessmentWorkspace';
import { Home, Menu, Layers, Rss, Users, Guitar, ScrollText, ClipboardCheck } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import type { StaffMemberV2 } from '../types/v2';
import type { AgreementAcceptance, AgreementTemplate, Certificate, ConcertProgram, ExamSession, ExaminerSubmission, Family, ReportCard } from '../types/blueprint';

type ManageTab = 'staff' | 'rooms' | 'activities' | 'subscriptions' | 'inventory' | 'agreements' | 'assessments';

interface Props {
    rooms: Room[];
    setRooms: React.Dispatch<React.SetStateAction<Room[]>>;
    settings: AppSettings;
    activities: ActivityV2[];
    setActivities: React.Dispatch<React.SetStateAction<ActivityV2[]>>;
    subscriptions: CalendarSubscription[];
    setSubscriptions: React.Dispatch<React.SetStateAction<CalendarSubscription[]>>;
    teachers: Teacher[];
    setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
    events: CalendarEvent[];
    students: Student[];
    families: Family[];
    hoursReports: HoursReport[];
    setHoursReports: React.Dispatch<React.SetStateAction<HoursReport[]>>;
    adminInboxItems: AdminInboxItem[];
    setAdminInboxItems: React.Dispatch<React.SetStateAction<AdminInboxItem[]>>;
    agreementTemplates: AgreementTemplate[];
    setAgreementTemplates: (data: AgreementTemplate[] | ((prev: AgreementTemplate[]) => AgreementTemplate[])) => Promise<void>;
    agreementAcceptances: AgreementAcceptance[];
    setAgreementAcceptances: (data: AgreementAcceptance[] | ((prev: AgreementAcceptance[]) => AgreementAcceptance[])) => Promise<void>;
    agreementsLoading?: boolean;
    staffMembers: StaffMemberV2[];
    examSessions: ExamSession[];
    setExamSessions: (data: ExamSession[] | ((prev: ExamSession[]) => ExamSession[])) => Promise<void>;
    examinerSubmissions: ExaminerSubmission[];
    setExaminerSubmissions: (data: ExaminerSubmission[] | ((prev: ExaminerSubmission[]) => ExaminerSubmission[])) => Promise<void>;
    certificates: Certificate[];
    setCertificates: (data: Certificate[] | ((prev: Certificate[]) => Certificate[])) => Promise<void>;
    reportCards: ReportCard[];
    setReportCards: (data: ReportCard[] | ((prev: ReportCard[]) => ReportCard[])) => Promise<void>;
    assessmentsLoading?: boolean;
    canManageAssessments?: boolean;
    concertPrograms: ConcertProgram[];
    setConcertPrograms: (data: ConcertProgram[] | ((prev: ConcertProgram[]) => ConcertProgram[])) => Promise<void>;
    concertProgramsLoading?: boolean;
    orgId: string | null;
    actorId?: string | null;
    onMobileMenuOpen: () => void;
    initialTab?: ManageTab;
    onTabChange?: (tab: ManageTab) => void;
    navigateToStaffId?: string | null;
    onStaffNavigateHandled?: () => void;
}

export const ManageHub: React.FC<Props> = ({
    rooms,
    setRooms,
    settings,
    activities,
    setActivities,
    subscriptions,
    setSubscriptions,
    teachers,
    setTeachers,
    events,
    students,
    families,
    hoursReports,
    setHoursReports,
    adminInboxItems,
    setAdminInboxItems,
    agreementTemplates,
    setAgreementTemplates,
    agreementAcceptances,
    setAgreementAcceptances,
    agreementsLoading = false,
    staffMembers,
    examSessions,
    setExamSessions,
    examinerSubmissions,
    setExaminerSubmissions,
    certificates,
    setCertificates,
    reportCards,
    setReportCards,
    assessmentsLoading = false,
    canManageAssessments = false,
    concertPrograms,
    setConcertPrograms,
    concertProgramsLoading = false,
    orgId,
    actorId,
    onMobileMenuOpen,
    initialTab = 'staff',
    onTabChange,
    navigateToStaffId,
    onStaffNavigateHandled,
}) => {
    const [activeTab, setActiveTab] = useState<ManageTab>(initialTab);
    const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

    // Sync with URL params
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tabFromUrl = params.get('tab') as ManageTab;
        if (tabFromUrl && ['staff', 'rooms', 'activities', 'subscriptions', 'inventory', 'agreements', 'assessments'].includes(tabFromUrl)) {
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
        { id: 'staff', label: t('nav.staff_members'), icon: Users },
        { id: 'activities', label: t('nav.activities'), icon: Layers },
        { id: 'rooms', label: t('nav.rooms'), icon: Home },
        { id: 'inventory', label: t('nav.inventory'), icon: Guitar },
        { id: 'agreements', label: settings.language === 'he-IL' ? 'הסכמים' : 'Agreements', icon: ScrollText },
        { id: 'assessments', label: settings.language === 'he-IL' ? 'הערכות' : 'Assessments', icon: ClipboardCheck },
        { id: 'subscriptions', label: t('nav.subscriptions'), icon: Rss },
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
                {activeTab === 'staff' && (
                    <StaffMemberManager
                        teachers={teachers}
                        setTeachers={setTeachers}
                        activities={activities}
                        settings={settings}
                        hoursReports={hoursReports}
                        setHoursReports={setHoursReports}
                        students={students}
                        adminInboxItems={adminInboxItems}
                        setAdminInboxItems={setAdminInboxItems}
                        onMobileMenuOpen={onMobileMenuOpen}
                        navigateToId={navigateToStaffId}
                        onNavigateHandled={onStaffNavigateHandled}
                    />
                )}
                {activeTab === 'activities' && (
                    <ActivityManager
                        activities={activities}
                        setActivities={setActivities}
                        settings={settings}
                        events={events}
                        students={students}
                        teachers={teachers}
                        concertPrograms={concertPrograms}
                        setConcertPrograms={setConcertPrograms}
                        concertProgramsLoading={concertProgramsLoading}
                        orgId={orgId}
                        actorId={actorId}
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
                {activeTab === 'inventory' && (
                    <InstrumentManager
                        settings={settings}
                        students={students}
                        teachers={teachers}
                        onMobileMenuOpen={onMobileMenuOpen}
                        embedded={true}
                    />
                )}
                {activeTab === 'agreements' && (
                    <AgreementManager
                        settings={settings}
                        orgId={orgId}
                        actorId={actorId}
                        students={students}
                        families={families}
                        templates={agreementTemplates}
                        setTemplates={setAgreementTemplates}
                        acceptances={agreementAcceptances}
                        setAcceptances={setAgreementAcceptances}
                        loading={agreementsLoading}
                    />
                )}
                {activeTab === 'assessments' && (
                    <AssessmentWorkspace
                        settings={settings}
                        orgId={orgId}
                        actorId={actorId}
                        staffMembers={staffMembers}
                        students={students}
                        activities={activities}
                        examSessions={examSessions}
                        setExamSessions={setExamSessions}
                        examinerSubmissions={examinerSubmissions}
                        setExaminerSubmissions={setExaminerSubmissions}
                        certificates={certificates}
                        setCertificates={setCertificates}
                        reportCards={reportCards}
                        setReportCards={setReportCards}
                        loading={assessmentsLoading}
                        canManageAssessments={canManageAssessments}
                    />
                )}
                {activeTab === 'subscriptions' && (
                    <CalendarSubscriptionManager
                        subscriptions={subscriptions}
                        setSubscriptions={setSubscriptions}
                        teachers={teachers}
                        rooms={rooms}
                        activities={activities}
                        events={events}
                        settings={settings}
                        embedded={true}
                    />
                )}
            </div>
        </div>
    );
};
