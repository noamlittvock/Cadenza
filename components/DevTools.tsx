import React, { useState } from 'react';
import { writeBatch, doc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { useAuth } from '../context/AuthContext';
import { useDevSimulation, ROLE_PRESETS } from '../context/DevSimulationContext';
import { AppSettings, CalendarEvent, Activity, Teacher, Room, Student, ListsState } from '../types';
import { StaffMemberV2, StudentV2, ActivityV2, L1Subcategory, L2Subcategory, TeachingAssignmentV2, EnrollmentV2, V2_COLLECTIONS } from '../types/v2';
import {
  Wrench, AlertTriangle, Loader2,
  Calendar, UserCog, CalendarDays, RefreshCw, ClipboardList,
} from 'lucide-react';
import { Modal } from './Modal';
import { TRANSLATIONS, INITIAL_LISTS } from '../constants';
import {
  TEST_TEMPLATES, QA_SCENARIOS, generateTemplateData, resolveTemplateDate, resolveTemplateRole,
} from '../utils/testTemplates';

interface DevToolsProps {
  settings: AppSettings;
  events: CalendarEvent[];
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  activities: Activity[];
  teachers: Teacher[];
  students: Student[];
  rooms: Room[];
  setTeachers?: (data: any[]) => void;
  setSavedCharts?: (data: any[]) => void;
  setHoursReports?: (data: any[]) => void;
  setRooms?: (data: any[]) => void;
  setGanttBlocks?: (data: any[]) => void;
  setActivities?: (data: any[]) => void;
  setStudents?: (data: any[]) => void;
  setAdminInboxItems?: (data: any[]) => void;
  lists?: ListsState;
  setLists?: (data: ListsState) => void;
  onWipeData?: () => void;
  onNavigateToView?: (view: string) => void;
  onActivateScenario?: (scenario: import('../utils/testTemplates').QAScenario) => void;
}

export const DevTools: React.FC<DevToolsProps> = ({
  settings, events, setEvents, activities, teachers, students, rooms,
  setTeachers, setSavedCharts, setHoursReports, setRooms, setGanttBlocks,
  setActivities, setStudents, setAdminInboxItems, lists, setLists, onWipeData,
  onNavigateToView, onActivateScenario,
}) => {
  const { currentUser, isSuperAdmin, orgId } = useAuth();
  const {
    simulatedDate, simulatedRole, setSimulatedDate, setSimulatedRole,
    clearAllSimulations, simulationActive,
  } = useDevSimulation();
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

  // Local state
  const [showExplainers, setShowExplainers] = useState<Record<string, boolean>>({});
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wipeCheckbox, setWipeCheckbox] = useState(false);
  const [dateInputValue, setDateInputValue] = useState('');
  const [migrationReport, setMigrationReport] = useState<{
    total: number;
    alreadyMigrated: number;
    matched: { id: string; classification: string; activityId: string }[];
    unmatched: { id: string; classification: string }[];
  } | null>(null);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [templateLoading, setTemplateLoading] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [templateProgress, setTemplateProgress] = useState<{ pct: number; label: string } | null>(null);
  const [simProgress, setSimProgress] = useState<number | null>(null);

  /** Wrap any simulation change with a quick animated progress bar */
  const withSimProgress = (fn: () => void) => {
    fn();
    setSimProgress(0);
    setTimeout(() => setSimProgress(55), 60);
    setTimeout(() => setSimProgress(90), 180);
    setTimeout(() => setSimProgress(100), 320);
    setTimeout(() => setSimProgress(null), 700);
  };

  // ── Template handler ──────────────────────────────────────────────────────
  const applyTemplate = async (templateId: string) => {
    const template = TEST_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    setTemplateLoading(templateId);
    setTemplateMessage(null);
    setTemplateProgress({ pct: 5, label: 'Wiping existing data…' });

    try {
      // 1. Wipe existing data (v1 React state)
      setTeachers?.([]);
      setEvents?.([] as any);
      setRooms?.([]);
      setGanttBlocks?.([]);
      setActivities?.([]);
      setStudents?.([]);
      setAdminInboxItems?.([]);
      setSavedCharts?.([]);
      setHoursReports?.([]);
      setLists?.({ positions: [], tags: [], classifications: [], employmentTypes: [], absenceReasons: [] });

      setTemplateProgress({ pct: 20, label: 'Clearing Firestore collections…' });

      // 1b. Wipe v2 Firestore collections so StaffMemberManager / StudentManager show fresh data
      // Wrapped in its own try/catch — Firestore errors here are non-fatal
      if (orgId) {
        try {
          const wipeV2Col = async (colName: string) => {
            const snap = await getDocs(query(collection(db, colName), where('orgId', '==', orgId)));
            if (snap.empty) return;
            const b = writeBatch(db);
            snap.docs.forEach(d => b.delete(d.ref));
            await b.commit();
          };
          await Promise.all([
            wipeV2Col(V2_COLLECTIONS.staffMembers),
            wipeV2Col(V2_COLLECTIONS.teachingAssignments),
            wipeV2Col(V2_COLLECTIONS.orgRoles),
            wipeV2Col(V2_COLLECTIONS.students),
            wipeV2Col(V2_COLLECTIONS.enrollments),
            wipeV2Col(V2_COLLECTIONS.activities),
            wipeV2Col(V2_COLLECTIONS.l1Subcategories),
            wipeV2Col(V2_COLLECTIONS.l2Subcategories),
          ]);
        } catch (firestoreErr) {
          console.warn('v2 Firestore wipe failed (non-fatal):', firestoreErr);
        }
      }

      setTemplateProgress({ pct: 45, label: 'Applying simulation settings…' });

      // 2. Resolve simulation state
      const simDate = resolveTemplateDate(template);
      const simRole = resolveTemplateRole(template);
      clearAllSimulations();
      if (simDate) setSimulatedDate(simDate);
      if (simRole) setSimulatedRole(simRole);

      setTemplateProgress({ pct: 60, label: 'Generating dataset…' });

      // 3. Generate and apply data
      const refDate = simDate ?? new Date();
      const data = generateTemplateData(template, settings.currency, refDate);

      setTeachers?.(data.teachers);
      setEvents?.(data.events as any);
      setRooms?.(data.rooms);
      setGanttBlocks?.(data.ganttBlocks);
      setActivities?.(data.activities);
      setStudents?.(data.students);
      setAdminInboxItems?.(data.adminInboxItems);
      setSavedCharts?.(data.savedCharts);
      setHoursReports?.(data.hoursReports);

      // Populate ManageLists from generated data
      if (data.teachers.length > 0) {
        const positions = [...new Set(data.teachers.flatMap(t => t.positionAssignments?.map(pa => pa.positionName) || []))];
        const tags = [...new Set(data.teachers.flatMap(t => t.tags || []))];
        const classifications = [...new Set(data.teachers.flatMap(t => t.positionAssignments?.map(pa => pa.category) || []))];
        setLists?.({ positions, tags, classifications, employmentTypes: [], absenceReasons: ['Sick Leave', 'Public Holiday', 'Student Absent', 'Other'] });
      }

      setTemplateProgress({ pct: 80, label: 'Seeding staff & student records…' });

      // 3b. Seed v2 Firestore so StaffMemberManager / StudentManager display template data
      // Also wrapped in its own try/catch — non-fatal if Firestore rules reject
      if (orgId) {
        try {
          const now = Timestamp.now();

          if (data.teachers.length > 0) {
            const batch = writeBatch(db);
            data.teachers.forEach(t => {
              const staffDoc: StaffMemberV2 = {
                id: t.id,
                orgId,
                uid: t.id,       // placeholder uid — fine for test data
                role: 'STAFF',
                fullName: t.fullName,
                email: t.email,
                phone: t.phone || null,
                isArchived: t.isArchived ?? false,
                createdAt: now,
                updatedAt: now,
                isFirstAdmin: false,
                onboardingDismissed: true,
                firstUseFlags: {
                  activityHub: true, staffModule: true, studentModule: true,
                  eventCreation: true, enrollment: true, payslips: true,
                },
              };
              batch.set(doc(db, V2_COLLECTIONS.staffMembers, t.id), staffDoc);
            });
            await batch.commit();
          }

          if (data.students.length > 0) {
            const batch = writeBatch(db);
            data.students.forEach(s => {
              const studentDoc: StudentV2 = {
                id: s.id,
                orgId,
                fullName: s.fullName,
                dateOfBirth: s.dateOfBirth || null,
                parentName: s.guardians?.[0]?.fullName || null,
                parentPhone: s.guardians?.[0]?.phone || null,
                isArchived: s.profileStatus === 'ARCHIVED',
                createdAt: now,
                updatedAt: now,
              };
              batch.set(doc(db, V2_COLLECTIONS.students, s.id), studentDoc);
            });
            await batch.commit();
          }

          // Seed v2 activities and L1 subcategories from v1.3 activity data
          if (data.activities.length > 0) {
            const batch = writeBatch(db);
            data.activities.forEach(act => {
              const templateMap: Record<string, 'DISCIPLINE' | 'PROGRAM' | 'ENSEMBLE' | 'EXTERNAL' | 'ADMINISTRATIVE'> = {
                'INSTRUCTIONAL': 'DISCIPLINE',
                'OPERATIONAL': 'ADMINISTRATIVE',
              };
              const activityDoc: ActivityV2 = {
                id: act.id,
                orgId,
                name: act.name,
                template: templateMap[act.type] || 'DISCIPLINE',
                activityType: act.type === 'OPERATIONAL' ? 'ADMINISTRATIVE' : 'ACADEMIC',
                modules: {
                  curriculum: true,
                  staffBilling: true,
                  revenue: act.type === 'OPERATIONAL',
                  externalParticipants: false,
                  orgRoleBilling: false,
                },
                location: null,
                eventNameMode: 'AUTO',
                isArchived: act.isArchived,
                createdAt: now,
                updatedAt: now,
              };
              batch.set(doc(db, V2_COLLECTIONS.activities, act.id), activityDoc);

              // Create L1 + L2 subcategory docs from v1.3 subcategories (1:1 mapping)
              (act.subcategories || []).forEach(sub => {
                const l1Doc: L1Subcategory = {
                  id: sub.id,
                  orgId,
                  activityId: act.id,
                  name: sub.name,
                  isArchived: sub.isArchived,
                  createdAt: now,
                  updatedAt: now,
                };
                batch.set(doc(db, V2_COLLECTIONS.l1Subcategories, sub.id), l1Doc);

                const l2Id = `L2_${sub.id}`;
                const l2Doc: L2Subcategory = {
                  id: l2Id,
                  orgId,
                  activityId: act.id,
                  l1Id: sub.id,
                  name: sub.name,
                  defaultRate: null,
                  isArchived: sub.isArchived,
                  createdAt: now,
                  updatedAt: now,
                };
                batch.set(doc(db, V2_COLLECTIONS.l2Subcategories, l2Id), l2Doc);
              });
            });
            await batch.commit();
          }

          // Seed v2 teachingAssignments from teacher.teachingAssignments[]
          if (data.teachers.length > 0) {
            const rateMap: Record<string, 'HOURLY' | 'PER_EVENT' | 'MONTHLY_FLAT'> = {
              HOURLY: 'HOURLY',
              PER_EVENT: 'PER_EVENT',
              GLOBAL_MONTHLY: 'MONTHLY_FLAT',
              ONE_OFF: 'HOURLY',
            };
            const batch = writeBatch(db);
            data.teachers.forEach(t => {
              const primaryPos = t.positionAssignments?.[0];
              (t.teachingAssignments || []).forEach(ta => {
                const taDoc: TeachingAssignmentV2 = {
                  id: ta.id,
                  orgId,
                  staffMemberId: t.id,
                  activityId: ta.activityId,
                  l2Id: `L2_${ta.subcategoryId}`,
                  rateType: rateMap[primaryPos?.rateType ?? ''] ?? 'HOURLY',
                  rateValue: primaryPos?.rateValue ?? 0,
                  startDate: ta.startDate,
                  endDate: null,
                  isArchived: ta.isArchived,
                  createdAt: now,
                  updatedAt: now,
                };
                batch.set(doc(db, V2_COLLECTIONS.teachingAssignments, ta.id), taDoc);
              });
            });
            await batch.commit();
          }

          // Seed v2 enrollments from student.assignments[]
          if (data.students.length > 0) {
            const batch = writeBatch(db);
            data.students.forEach(s => {
              (s.assignments || []).forEach(asgn => {
                const enrollId = `EN_${asgn.id}`;
                const enrollDoc: EnrollmentV2 = {
                  id: enrollId,
                  orgId,
                  studentId: s.id,
                  activityId: asgn.activityId,
                  l2Id: `L2_${asgn.subcategoryId}`,
                  startDate: asgn.startDate,
                  endDate: null,
                  status: asgn.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
                  createdAt: now,
                  updatedAt: now,
                };
                batch.set(doc(db, V2_COLLECTIONS.enrollments, enrollId), enrollDoc);
              });
            });
            await batch.commit();
          }
        } catch (firestoreErr) {
          console.warn('v2 Firestore seed failed (non-fatal):', firestoreErr);
        }
      }

      setTemplateProgress({ pct: 95, label: 'Navigating to view…' });

      // 4. Navigate to target view
      onNavigateToView?.(template.targetView);

      setTemplateProgress({ pct: 100, label: 'Done!' });
      setTimeout(() => setTemplateProgress(null), 500);

      setTemplateMessage({ type: 'success', text: `"${template.label}" loaded — navigating to ${template.targetView}` });
      setTimeout(() => setTemplateMessage(null), 4000);
    } catch (err) {
      console.error('Template apply error:', err);
      setTemplateProgress(null);
      const msg = err instanceof Error ? err.message : String(err);
      setTemplateMessage({ type: 'error', text: `Failed to apply template: ${msg}` });
    } finally {
      setTemplateLoading(null);
    }
  };

  // ── Date Simulator helpers ─────────────────────────────────────────────────
  const jumpDate = (days: number) => {
    withSimProgress(() => {
      const base = simulatedDate ?? new Date();
      const d = new Date(base);
      d.setDate(d.getDate() + days);
      setSimulatedDate(d);
      onNavigateToView?.('CALENDAR');
    });
  };

  const jumpToScenario = (scenario: 'month-end' | 'quarter-end' | 'new-year' | 'sept-1') => {
    withSimProgress(() => {
      const now = new Date();
      let d: Date;
      switch (scenario) {
        case 'month-end':
          d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          break;
        case 'quarter-end': {
          const q = Math.floor(now.getMonth() / 3);
          d = new Date(now.getFullYear(), (q + 1) * 3, 0);
          break;
        }
        case 'new-year':
          d = new Date(now.getFullYear() + 1, 0, 1);
          break;
        case 'sept-1': {
          const year = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
          d = new Date(year, 8, 1);
          break;
        }
      }
      setSimulatedDate(d!);
      onNavigateToView?.('CALENDAR');
    });
  };

  const handleCustomDate = (val: string) => {
    setDateInputValue(val);
    if (!val) return;
    const d = new Date(val + 'T12:00:00'); // noon to avoid TZ off-by-one
    if (!isNaN(d.getTime())) {
      withSimProgress(() => {
        setSimulatedDate(d);
        onNavigateToView?.('CALENDAR');
      });
    }
  };

  return (
    <div className="p-6">
      <div className="border-s-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-e-lg mb-6">
        <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
          ⚠️ {t('super.tools_notice')}
        </p>
      </div>

      <div className="space-y-6">

        {/* ── TEST TEMPLATES ─────────────────────────────────────────────── */}
        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-5 rounded-lg border border-emerald-200 dark:border-emerald-700/50">
          <h4 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Wrench size={16} className="text-emerald-500" />
            Test Templates
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            One click: wipe data, load a focused dataset, set any needed simulation, and jump to the target view. No manual steps required.
          </p>

          {templateProgress && (
            <div className="mb-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">{templateProgress.label}</span>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{templateProgress.pct}%</span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${templateProgress.pct}%` }}
                />
              </div>
            </div>
          )}

          {templateMessage && !templateProgress && (
            <div className={`mb-3 px-3 py-2 rounded text-xs font-medium ${
              templateMessage.type === 'success'
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
            }`}>
              {templateMessage.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEST_TEMPLATES.map(template => {
              const colorMap: Record<string, string> = {
                blue:   'border-blue-200   dark:border-blue-700/50   bg-blue-50   dark:bg-blue-900/20   hover:bg-blue-100   dark:hover:bg-blue-900/30',
                green:  'border-green-200  dark:border-green-700/50  bg-green-50  dark:bg-green-900/20  hover:bg-green-100  dark:hover:bg-green-900/30',
                violet: 'border-violet-200 dark:border-violet-700/50 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30',
                amber:  'border-amber-200  dark:border-amber-700/50  bg-amber-50  dark:bg-amber-900/20  hover:bg-amber-100  dark:hover:bg-amber-900/30',
                rose:   'border-rose-200   dark:border-rose-700/50   bg-rose-50   dark:bg-rose-900/20   hover:bg-rose-100   dark:hover:bg-rose-900/30',
                teal:   'border-teal-200   dark:border-teal-700/50   bg-teal-50   dark:bg-teal-900/20   hover:bg-teal-100   dark:hover:bg-teal-900/30',
                indigo: 'border-indigo-200 dark:border-indigo-700/50 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30',
                slate:  'border-slate-200  dark:border-slate-700/50  bg-slate-50  dark:bg-slate-800     hover:bg-slate-100  dark:hover:bg-slate-700/50',
              };
              const badgeColorMap: Record<string, string> = {
                blue:   'bg-blue-100   dark:bg-blue-900/40   text-blue-700   dark:text-blue-400',
                green:  'bg-green-100  dark:bg-green-900/40  text-green-700  dark:text-green-400',
                violet: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400',
                amber:  'bg-amber-100  dark:bg-amber-900/40  text-amber-700  dark:text-amber-400',
                rose:   'bg-rose-100   dark:bg-rose-900/40   text-rose-700   dark:text-rose-400',
                teal:   'bg-teal-100   dark:bg-teal-900/40   text-teal-700   dark:text-teal-400',
                indigo: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400',
                slate:  'bg-slate-200  dark:bg-slate-700     text-slate-700  dark:text-slate-300',
              };

              const isLoading = templateLoading === template.id;

              return (
                <button
                  key={template.id}
                  onClick={() => applyTemplate(template.id)}
                  disabled={!!templateLoading}
                  className={`text-start p-3 rounded-lg border transition-colors ${colorMap[template.color]} ${!!templateLoading && !isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                      {isLoading ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 size={13} className="animate-spin" />
                          Loading…
                        </span>
                      ) : template.label}
                    </span>
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColorMap[template.color]}`}>
                      {template.targetView.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    {template.description}
                  </p>
                  {(template.dateScenario || template.rolePreset) && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {template.dateScenario && (
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-medium">
                          📅 {template.dateScenario}
                        </span>
                      )}
                      {template.rolePreset && (
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-medium">
                          👤 {template.rolePreset}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── QA SCENARIOS ───────────────────────────────────────────────── */}
        <div className="bg-cyan-50 dark:bg-cyan-900/20 p-5 rounded-lg border border-cyan-200 dark:border-cyan-700/50">
          <h4 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <ClipboardList size={16} className="text-cyan-500" />
            QA Scenarios
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Load a dataset and follow a guided checklist across multiple views. Each scenario verifies that data dependencies flow end-to-end — not just within a single view.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QA_SCENARIOS.map(scenario => {
              const colorMap: Record<string, string> = {
                teal:   'border-teal-200   dark:border-teal-700/50   bg-teal-50   dark:bg-teal-900/20   hover:bg-teal-100   dark:hover:bg-teal-900/30',
                green:  'border-green-200  dark:border-green-700/50  bg-green-50  dark:bg-green-900/20  hover:bg-green-100  dark:hover:bg-green-900/30',
                blue:   'border-blue-200   dark:border-blue-700/50   bg-blue-50   dark:bg-blue-900/20   hover:bg-blue-100   dark:hover:bg-blue-900/30',
                amber:  'border-amber-200  dark:border-amber-700/50  bg-amber-50  dark:bg-amber-900/20  hover:bg-amber-100  dark:hover:bg-amber-900/30',
                violet: 'border-violet-200 dark:border-violet-700/50 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30',
              };
              const badgeColorMap: Record<string, string> = {
                teal:   'bg-teal-100   dark:bg-teal-900/40   text-teal-700   dark:text-teal-400',
                green:  'bg-green-100  dark:bg-green-900/40  text-green-700  dark:text-green-400',
                blue:   'bg-blue-100   dark:bg-blue-900/40   text-blue-700   dark:text-blue-400',
                amber:  'bg-amber-100  dark:bg-amber-900/40  text-amber-700  dark:text-amber-400',
                violet: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400',
              };

              return (
                <button
                  key={scenario.id}
                  onClick={() => {
                    // Load the backing template first, then activate the scenario
                    applyTemplate(scenario.templateId).then(() => {
                      onActivateScenario?.(scenario);
                    });
                  }}
                  disabled={!!templateLoading}
                  className={`text-start p-3 rounded-lg border transition-colors ${colorMap[scenario.color]} ${!!templateLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                      {scenario.label}
                    </span>
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColorMap[scenario.color]}`}>
                      {scenario.steps.length} steps
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    {scenario.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── DATE SIMULATOR ─────────────────────────────────────────────── */}
        <div className="bg-violet-50 dark:bg-violet-900/20 p-5 rounded-lg border border-violet-200 dark:border-violet-700/50">
          <h4 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Calendar size={16} className="text-violet-500" />
            Date Simulator
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Jump the calendar to any date to test time-dependent data: grades, enrollment periods, pay periods, and assignment date ranges. The simulated date appears in the purple banner and drives the calendar view.
          </p>

          {simulatedDate && (
            <div className="mb-3 px-3 py-2 bg-violet-100 dark:bg-violet-900/40 rounded-lg text-sm font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-2">
              <CalendarDays size={14} />
              Simulating: {simulatedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              <button
                onClick={() => withSimProgress(() => { setSimulatedDate(null); setDateInputValue(''); })}
                className="ms-auto text-xs text-violet-500 hover:text-violet-700 dark:hover:text-violet-200 font-normal"
              >
                Reset to today
              </button>
            </div>
          )}

          {/* Relative jumps */}
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { label: '−30d', days: -30 },
              { label: '−7d', days: -7 },
              { label: '−1d', days: -1 },
              { label: '+1d', days: 1 },
              { label: '+7d', days: 7 },
              { label: '+30d', days: 30 },
              { label: '+90d', days: 90 },
            ].map(({ label, days }) => (
              <button
                key={label}
                onClick={() => jumpDate(days)}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-bold hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => withSimProgress(() => { setSimulatedDate(new Date()); setDateInputValue(''); })}
              className="px-3 py-1.5 bg-violet-500 text-white rounded-lg text-xs font-bold hover:bg-violet-600 transition-colors flex items-center gap-1"
            >
              <RefreshCw size={12} /> Today
            </button>
          </div>

          {/* Scenario jumps */}
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 self-center">Scenarios:</span>
            {[
              { label: 'Month End', key: 'month-end' as const },
              { label: 'Quarter End', key: 'quarter-end' as const },
              { label: 'New Year', key: 'new-year' as const },
              { label: 'Sep 1 (Enrollment)', key: 'sept-1' as const },
            ].map(({ label, key }) => (
              <button
                key={key}
                onClick={() => jumpToScenario(key)}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom date */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">Custom:</span>
            <input
              type="date"
              value={dateInputValue}
              onChange={e => handleCustomDate(e.target.value)}
              className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs focus:ring-2 focus:ring-violet-500 outline-none"
            />
          </div>

          {/* Sim progress bar — shared across both simulator sections */}
          {simProgress !== null && (
            <div className="h-1 bg-violet-100 dark:bg-violet-900/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-200 ease-out"
                style={{ width: `${simProgress}%` }}
              />
            </div>
          )}
        </div>

        {/* ── ROLE / USER SIMULATOR ──────────────────────────────────────── */}
        <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-lg border border-blue-200 dark:border-blue-700/50">
          <h4 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <UserCog size={16} className="text-blue-500" />
            User &amp; Role Simulator
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Simulate any user role or onboarding state — including first-time admin before and after the setup gate — without logging out. The purple banner always lets you exit. SuperAdmin nav stays accessible regardless.
          </p>

          {simulatedRole && (
            <div className="mb-3 px-3 py-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <UserCog size={14} />
              Simulating: {simulatedRole.label}
              <button
                onClick={() => withSimProgress(() => setSimulatedRole(null))}
                className="ms-auto text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-200 font-normal"
              >
                Clear role
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {ROLE_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => withSimProgress(() => setSimulatedRole(simulatedRole?.label === preset.label ? null : preset))}
                className={`text-start px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  simulatedRole?.label === preset.label
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500'
                }`}
              >
                <div className="font-bold mb-0.5">{preset.label}</div>
                <div className={`text-[10px] ${simulatedRole?.label === preset.label ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  {preset.role} · First admin: {preset.isFirstAdmin ? 'yes' : 'no'} · Gate: {preset.setupGateCleared ? 'cleared' : 'blocked'}
                </div>
              </button>
            ))}
          </div>

          {simProgress !== null && (
            <div className="mt-3 h-1 bg-blue-100 dark:bg-blue-900/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-200 ease-out"
                style={{ width: `${simProgress}%` }}
              />
            </div>
          )}

          {simulationActive && (
            <button
              onClick={() => withSimProgress(() => clearAllSimulations())}
              className="mt-3 w-full px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              Exit All Simulations
            </button>
          )}
        </div>

        {/* ── STATE SNAPSHOTS ────────────────────────────────────────────── */}
        <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700">
          <h4 className="font-bold text-slate-900 dark:text-white mb-1">{t('sa.state_snapshot')}</h4>
          <p className="text-xs text-slate-500 mb-3">{t('sa.snapshot_desc')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                localStorage.setItem('appSnapshot', JSON.stringify({
                  teachers: localStorage.getItem('teachers'),
                  events: localStorage.getItem('events'),
                  rooms: localStorage.getItem('rooms'),
                  settings: localStorage.getItem('settings'),
                  lists: localStorage.getItem('lists'),
                }));
                alert(t('sa.snapshot_created'));
              }}
              className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
            >
              {t('sa.create_snapshot')}
            </button>
            <button
              onClick={() => {
                const snap = localStorage.getItem('appSnapshot');
                if (snap && window.confirm(t('super.confirm_restore'))) {
                  const parsed = JSON.parse(snap);
                  if (parsed.teachers) localStorage.setItem('teachers', parsed.teachers);
                  if (parsed.events) localStorage.setItem('events', parsed.events);
                  if (parsed.rooms) localStorage.setItem('rooms', parsed.rooms);
                  if (parsed.lists) localStorage.setItem('lists', parsed.lists);
                  window.location.reload();
                } else if (!snap) {
                  alert(t('sa.no_snapshot'));
                }
              }}
              className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              {t('sa.restore')}
            </button>
          </div>
        </div>

        {/* ── ACTIVITYID MIGRATION ───────────────────────────────────────── */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-lg border border-indigo-200 dark:border-indigo-700/50">
          <h4 className="font-bold text-slate-900 dark:text-white mb-1">{t('sa.migration_title')}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('sa.migration_desc')}</p>

          <div className="flex gap-2 mb-3">
            <button
              disabled={migrationRunning}
              onClick={() => {
                const nameToId = new Map<string, string>(activities.map(a => [String(a.name), String(a.id)]));
                const matched: { id: string; classification: string; activityId: string }[] = [];
                const unmatched: { id: string; classification: string }[] = [];
                let alreadyMigrated = 0;
                events.forEach(evt => {
                  if (evt.activityId) { alreadyMigrated++; return; }
                  const cls = String(evt.classification ?? '');
                  if (!cls) return;
                  const aid = nameToId.get(cls);
                  if (aid) {
                    matched.push({ id: evt.id, classification: cls, activityId: aid });
                  } else {
                    unmatched.push({ id: evt.id, classification: cls });
                  }
                });
                setMigrationReport({ total: events.length, alreadyMigrated, matched, unmatched });
              }}
              className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
            >
              {t('sa.migration_scan')}
            </button>

            {migrationReport && migrationReport.matched.length > 0 && (
              <button
                disabled={migrationRunning}
                onClick={async () => {
                  if (!setEvents || !migrationReport) return;
                  if (!window.confirm(t('sa.migration_backfill_confirm').replace('{count}', String(migrationReport.matched.length)))) return;
                  setMigrationRunning(true);
                  try {
                    const batch = writeBatch(db);
                    migrationReport.matched.forEach(m => {
                      batch.update(doc(db, 'calendarEvents', m.id), { activityId: m.activityId });
                    });
                    await batch.commit();
                    const idMap = new Map(migrationReport.matched.map(m => [m.id, m.activityId]));
                    setEvents(prev => prev.map(evt => {
                      const aid = idMap.get(evt.id);
                      return aid ? { ...evt, activityId: aid } : evt;
                    }));
                    setMigrationReport(prev => prev ? { ...prev, matched: [], alreadyMigrated: prev.alreadyMigrated + prev.matched.length } : prev);
                    alert(t('sa.migration_backfill_success').replace('{count}', String(migrationReport.matched.length)));
                  } catch (err) {
                    console.error('Migration error:', err);
                    alert(t('sa.migration_backfill_error'));
                  } finally {
                    setMigrationRunning(false);
                  }
                }}
                className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
              >
                {migrationRunning
                  ? t('sa.migration_running')
                  : t('sa.migration_backfill_btn').replace('{count}', String(migrationReport.matched.length))}
              </button>
            )}
          </div>

          {migrationReport && (
            <div className="text-xs space-y-1 bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
              <p><span className="font-medium">{t('sa.migration_total')}</span> {migrationReport.total}</p>
              <p><span className="font-medium text-emerald-600">{t('sa.migration_already')}</span> {migrationReport.alreadyMigrated}</p>
              <p><span className="font-medium text-blue-600">{t('sa.migration_matched')}</span> {migrationReport.matched.length}</p>
              <p><span className="font-medium text-amber-600">{t('sa.migration_unmatched')}</span> {migrationReport.unmatched.length}</p>
              {migrationReport.unmatched.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-amber-600 font-medium">{t('sa.migration_show_unmatched')}</summary>
                  <ul className="mt-1 ms-4 list-disc text-slate-500">
                    {[...new Set(migrationReport.unmatched.map(u => u.classification))].map(cls => (
                      <li key={cls}>{cls} ({migrationReport.unmatched.filter(u => u.classification === cls).length} events)</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* ── SYSTEM INFO ────────────────────────────────────────────────── */}
        <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700">
          <h4 className="font-bold text-slate-900 dark:text-white mb-3">{t('sa.system_info')}</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">{t('sa.super_admin_label')}</span>
              <span className="text-slate-900 dark:text-white font-mono">{currentUser?.email}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Org ID</span>
              <span className="text-slate-900 dark:text-white font-mono">{orgId || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">{t('sa.role_label')}</span>
              <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded font-bold">{t('sa.superadmin_badge')}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Simulation</span>
              <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${simulationActive ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' : 'text-slate-400'}`}>
                {simulationActive ? 'Active' : 'Off'}
              </span>
            </div>
          </div>
        </div>

        {/* ── FULL DATA RESET ────────────────────────────────────────────── */}
        <div className="bg-red-50 dark:bg-red-900/20 p-5 rounded-lg border border-red-200 dark:border-red-700/50">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500" />
                {t('super.wipe_modal_title')}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{t('super.wipe_modal_warning')}</p>
            </div>
            <button
              onClick={() => { setShowWipeModal(true); setWipeConfirmText(''); setWipeCheckbox(false); }}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold transition-colors shrink-0"
            >
              {t('super.wipe_data')}
            </button>
          </div>
        </div>

        {/* Wipe Confirmation Modal */}
        <Modal
          isOpen={showWipeModal}
          onClose={() => setShowWipeModal(false)}
          title={<span className="flex items-center gap-2 text-red-600 dark:text-red-400"><AlertTriangle size={20} /> {t('super.wipe_modal_title')}</span>}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-400 font-medium">{t('super.wipe_modal_warning')}</p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wipeCheckbox}
                onChange={e => setWipeCheckbox(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-red-300 text-red-500 focus:ring-red-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t('super.wipe_checkbox_label')}</span>
            </label>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('super.wipe_type_confirm')}</label>
              <input
                type="text"
                value={wipeConfirmText}
                onChange={e => setWipeConfirmText(e.target.value)}
                placeholder="WIPE"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none font-mono"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowWipeModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg text-sm transition-colors"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                disabled={!wipeCheckbox || wipeConfirmText !== 'WIPE'}
                onClick={() => {
                  console.warn(`[DATA WIPE] Initiated by ${currentUser?.email} at ${new Date().toISOString()}`);
                  onWipeData?.();
                  setShowWipeModal(false);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('super.wipe_confirm_btn')}
              </button>
            </div>
          </div>
        </Modal>

      </div>
    </div>
  );
};
