import React, { useState } from 'react';
import { ClipboardCheck, Menu, UserRound } from 'lucide-react';
import type { AppSettings, CalendarEvent, Teacher } from '../types';
import type { HoursEntry } from '../types/blueprint';
import type { OrgRoleV2, StaffMemberV2, TeachingAssignmentV2 } from '../types/v2';
import { TRANSLATIONS } from '../constants';
import { HoursComparisonView } from './HoursComparisonView';
import { TeacherSelfReportWorkspace } from './TeacherSelfReportWorkspace';
import type { HoursPeriodHeader } from '../utils/hoursEntryService';

interface AuthUserLike {
  id: string;
  uid?: string;
  email?: string;
  name?: string;
  role?: string;
}

interface Props {
  settings: AppSettings;
  currentUser: AuthUserLike | null;
  orgId: string | null;
  staffMembers: StaffMemberV2[];
  teachers: Teacher[];
  teachingAssignments: TeachingAssignmentV2[];
  orgRoles: OrgRoleV2[];
  events: CalendarEvent[];
  hoursEntries: HoursEntry[];
  setHoursEntries: (next: HoursEntry[] | ((prev: HoursEntry[]) => HoursEntry[])) => Promise<void>;
  periodHeaders: HoursPeriodHeader[];
  setPeriodHeaders: (next: HoursPeriodHeader[] | ((prev: HoursPeriodHeader[]) => HoursPeriodHeader[])) => Promise<void>;
  canApprovePay: boolean;
  onMobileMenuOpen: () => void;
}

type PayrollTab = 'self' | 'review';

const LABELS = {
  'en-US': {
    self: 'My hours',
    review: 'Review',
    openSidebar: 'Open sidebar',
  },
  'he-IL': {
    self: 'השעות שלי',
    review: 'סקירה',
    openSidebar: 'פתח תפריט',
  },
} as const;

export const PayrollWorkspace: React.FC<Props> = ({
  settings,
  currentUser,
  orgId,
  staffMembers,
  teachers,
  teachingAssignments,
  orgRoles,
  events,
  hoursEntries,
  setHoursEntries,
  periodHeaders,
  setPeriodHeaders,
  canApprovePay,
  onMobileMenuOpen,
}) => {
  const language = settings.language === 'he-IL' ? 'he-IL' : 'en-US';
  const labels = LABELS[language];
  const t = (key: string) => TRANSLATIONS[language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const [activeTab, setActiveTab] = useState<PayrollTab>('self');

  return (
    <div className="h-full flex flex-col bg-[#f6f0e6] dark:bg-slate-950">
      <div className="sticky top-0 z-30 border-b border-[#e3d6c3] dark:border-slate-800 bg-[#f6f0e6]/95 dark:bg-slate-950/95 backdrop-blur">
        <div className="px-3 sm:px-5 py-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onMobileMenuOpen}
            className="md:hidden p-2 rounded-lg border border-[#d5c3aa] dark:border-slate-700 text-slate-700 dark:text-slate-200"
            aria-label={t('layout.open_sidebar') || labels.openSidebar}
          >
            <Menu size={18} />
          </button>
          <div className="flex rounded-lg border border-[#d5c3aa] dark:border-slate-700 bg-white/70 dark:bg-slate-900 p-1">
            <TabButton active={activeTab === 'self'} onClick={() => setActiveTab('self')} icon={UserRound} label={labels.self} />
            <TabButton active={activeTab === 'review'} onClick={() => setActiveTab('review')} icon={ClipboardCheck} label={labels.review} />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === 'self' ? (
          <TeacherSelfReportWorkspace
            settings={settings}
            currentUser={currentUser}
            orgId={orgId}
            staffMembers={staffMembers}
            teachers={teachers}
            events={events}
            hoursEntries={hoursEntries}
            setHoursEntries={setHoursEntries}
            periodHeaders={periodHeaders}
            setPeriodHeaders={setPeriodHeaders}
            onMobileMenuOpen={onMobileMenuOpen}
          />
        ) : (
          <HoursComparisonView
            settings={settings}
            currentUser={currentUser}
            orgId={orgId}
            hoursEntries={hoursEntries}
            setHoursEntries={setHoursEntries}
            periodHeaders={periodHeaders}
            setPeriodHeaders={setPeriodHeaders}
            staffMembers={staffMembers}
            teachers={teachers}
            teachingAssignments={teachingAssignments}
            orgRoles={orgRoles}
            events={events}
            canApprovePay={canApprovePay}
            canExport={true}
          />
        )}
      </div>
    </div>
  );
};

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}> = ({ active, onClick, icon: Icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
      active
        ? 'bg-[#7b2d36] text-white shadow-sm'
        : 'text-slate-600 dark:text-slate-300 hover:bg-[#efe3d1] dark:hover:bg-slate-800'
    }`}
  >
    <Icon size={15} />
    {label}
  </button>
);
