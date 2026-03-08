import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Activity, AppSettings, CalendarEvent, Student } from '../types';
import type {
  ActivityV2, L1Subcategory, L2Subcategory, EnsembleRosterMember,
  ActivityTemplate, ModulesConfig, EventNameMode,
  EventV2, EnrollmentV2, EventStatus, EnrollmentStatus,
} from '../types/v2';
import { V2_COLLECTIONS } from '../types/v2';
import { deriveActivityType } from '../types/v2-compat';
import { generateId, TRANSLATIONS } from '../constants';
import { useFirestoreSync } from '../utils/useFirestoreSync';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';
import {
  Plus, Edit2, Archive, RotateCcw, Layers, Trash2, Menu, LayoutGrid, List, X,
  GraduationCap, Briefcase, Music, Globe, Settings2, ArrowLeft, HelpCircle,
  Users, UserPlus, UserMinus, ChevronRight, Sparkles,
} from 'lucide-react';

// ─── Template configuration (Section 06) ────────────────────────────────────

interface TemplateConfig {
  template: ActivityTemplate;
  icon: React.ElementType;
  color: string;          // Tailwind color prefix
  l1Required: boolean;
  l2Required: boolean;
  hasHierarchy: boolean;
  defaultModules: ModulesConfig;
  eventNameMode: EventNameMode;
}

const TEMPLATE_CONFIGS: Record<ActivityTemplate, TemplateConfig> = {
  DISCIPLINE: {
    template: 'DISCIPLINE', icon: GraduationCap, color: 'blue',
    l1Required: true, l2Required: true, hasHierarchy: true,
    defaultModules: { curriculum: true, staffBilling: true, revenue: false, externalParticipants: false, orgRoleBilling: false },
    eventNameMode: 'AUTO',
  },
  PROGRAM: {
    template: 'PROGRAM', icon: Layers, color: 'green',
    l1Required: true, l2Required: true, hasHierarchy: true,
    defaultModules: { curriculum: true, staffBilling: true, revenue: false, externalParticipants: false, orgRoleBilling: false },
    eventNameMode: 'AUTO',
  },
  ENSEMBLE: {
    template: 'ENSEMBLE', icon: Music, color: 'purple',
    l1Required: false, l2Required: true, hasHierarchy: true,
    defaultModules: { curriculum: true, staffBilling: true, revenue: false, externalParticipants: false, orgRoleBilling: false },
    eventNameMode: 'PROMPTED',
  },
  EXTERNAL: {
    template: 'EXTERNAL', icon: Globe, color: 'amber',
    l1Required: false, l2Required: true, hasHierarchy: true,
    defaultModules: { curriculum: false, staffBilling: false, revenue: true, externalParticipants: true, orgRoleBilling: false },
    eventNameMode: 'PROMPTED',
  },
  ADMINISTRATIVE: {
    template: 'ADMINISTRATIVE', icon: Briefcase, color: 'slate',
    l1Required: false, l2Required: false, hasHierarchy: false,
    defaultModules: { curriculum: false, staffBilling: false, revenue: false, externalParticipants: false, orgRoleBilling: true },
    eventNameMode: 'PROMPTED',
  },
};

const ALL_TEMPLATES: ActivityTemplate[] = ['DISCIPLINE', 'PROGRAM', 'ENSEMBLE', 'EXTERNAL', 'ADMINISTRATIVE'];

// ─── Local storage helpers ───────────────────────────────────────────────────

const PREFILL_KEY = 'cadenza_activity_prefill';
const WALKTHROUGH_KEY = 'cadenza_activity_walkthrough_done';

function savePrefill(uid: string, data: { template: ActivityTemplate; modules: ModulesConfig; location: string }) {
  try { localStorage.setItem(`${PREFILL_KEY}_${uid}`, JSON.stringify(data)); } catch { /* noop */ }
}
function loadPrefill(uid: string): { template: ActivityTemplate; modules: ModulesConfig; location: string } | null {
  try {
    const raw = localStorage.getItem(`${PREFILL_KEY}_${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function isWalkthroughDone(uid: string): boolean {
  try { return localStorage.getItem(`${WALKTHROUGH_KEY}_${uid}`) === 'true'; } catch { return false; }
}
function markWalkthroughDone(uid: string) {
  try { localStorage.setItem(`${WALKTHROUGH_KEY}_${uid}`, 'true'); } catch { /* noop */ }
}

// ─── Color utility ───────────────────────────────────────────────────────────

function templateBg(color: string, dark = false) {
  if (dark) return `bg-${color}-900/50 text-${color}-300`;
  return `bg-${color}-100 text-${color}-600`;
}
function templateBorder(color: string) {
  return `border-${color}-400 dark:border-${color}-500`;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  activities: Activity[];
  setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
  settings: AppSettings;
  events: CalendarEvent[];
  students: Student[];
  onMobileMenuOpen?: () => void;
  embedded?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ActivityManager: React.FC<Props> = ({
  activities, setActivities, settings, events, students,
  onMobileMenuOpen, embedded = false,
}) => {
  const { currentUser, isSuperAdmin } = useAuth();
  const uid = currentUser?.id || '';
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;

  // ─── Internal Firestore hooks for v2.0 collections ───────────────────────
  const [l1Subs, setL1Subs] = useFirestoreSync<L1Subcategory>(V2_COLLECTIONS.l1Subcategories, []);
  const [l2Subs, setL2Subs] = useFirestoreSync<L2Subcategory>(V2_COLLECTIONS.l2Subcategories, []);
  const [rosterMembers, setRosterMembers] = useFirestoreSync<EnsembleRosterMember>(V2_COLLECTIONS.ensembleRosterMembers, []);
  const [eventsV2, setEventsV2] = useFirestoreSync<EventV2>(V2_COLLECTIONS.events, []);
  const [enrollmentsV2, setEnrollmentsV2] = useFirestoreSync<EnrollmentV2>(V2_COLLECTIONS.enrollments, []);

  // ─── UI State ────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showArchived, setShowArchived] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailActivityId, setDetailActivityId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'hierarchy' | 'roster'>('hierarchy');

  // ─── Walkthrough state ───────────────────────────────────────────────────
  const [walkthroughActive, setWalkthroughActive] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);

  // ─── Archive cascade modal ──────────────────────────────────────────────
  const [archiveCascade, setArchiveCascade] = useState<{ activityId: string; name: string; futureEventCount: number } | null>(null);

  // ─── Form state ──────────────────────────────────────────────────────────
  const [formName, setFormName] = useState('');
  const [formTemplate, setFormTemplate] = useState<ActivityTemplate>('DISCIPLINE');
  const [formModules, setFormModules] = useState<ModulesConfig>({ ...TEMPLATE_CONFIGS.DISCIPLINE.defaultModules });
  const [formLocation, setFormLocation] = useState('');
  const [formEventNameMode, setFormEventNameMode] = useState<EventNameMode>('AUTO');
  const [initialFormSnapshot, setInitialFormSnapshot] = useState('');
  const [prefillUsed, setPrefillUsed] = useState(false);

  // ─── L1/L2 inline inputs ────────────────────────────────────────────────
  const [l1Input, setL1Input] = useState('');
  const [l2Input, setL2Input] = useState('');

  // ─── Roster add ──────────────────────────────────────────────────────────
  const [rosterStudentSearch, setRosterStudentSearch] = useState('');

  // ─── Derived data ────────────────────────────────────────────────────────
  const visibleActivities = useMemo(() =>
    activities.filter(a => showArchived || !a.isArchived),
    [activities, showArchived]
  );

  const detailActivity = useMemo(() =>
    activities.find(a => a.id === detailActivityId) || null,
    [activities, detailActivityId]
  );

  // Cast to v2 shape for template-aware operations
  const detailAsV2 = detailActivity as unknown as ActivityV2 | null;
  const detailConfig = detailAsV2?.template ? TEMPLATE_CONFIGS[detailAsV2.template] : null;

  const activityL1s = useMemo(() =>
    detailActivityId ? l1Subs.filter(l => l.activityId === detailActivityId) : [],
    [l1Subs, detailActivityId]
  );
  const activityL2s = useMemo(() =>
    detailActivityId ? l2Subs.filter(l => l.activityId === detailActivityId) : [],
    [l2Subs, detailActivityId]
  );
  const activityRoster = useMemo(() =>
    detailActivityId ? rosterMembers.filter(r => r.activityId === detailActivityId && !r.isArchived) : [],
    [rosterMembers, detailActivityId]
  );

  // ─── Form helpers ────────────────────────────────────────────────────────

  const formSnapshot = () => JSON.stringify({ formName, formTemplate, formModules, formLocation, formEventNameMode });
  const isDirty = formSnapshot() !== initialFormSnapshot;

  const resetForm = useCallback(() => {
    setFormName('');
    setFormTemplate('DISCIPLINE');
    setFormModules({ ...TEMPLATE_CONFIGS.DISCIPLINE.defaultModules });
    setFormLocation('');
    setFormEventNameMode('AUTO');
    setPrefillUsed(false);
    setL1Input('');
    setL2Input('');
  }, []);

  const openCreateModal = useCallback((template: ActivityTemplate) => {
    setEditingId(null);
    setTemplatePickerOpen(false);

    const config = TEMPLATE_CONFIGS[template];
    const prefill = loadPrefill(uid);

    if (prefill && prefill.template === template) {
      setFormName('');
      setFormTemplate(template);
      setFormModules({ ...prefill.modules });
      setFormLocation(prefill.location);
      setFormEventNameMode(config.eventNameMode);
      setPrefillUsed(true);
    } else {
      setFormName('');
      setFormTemplate(template);
      setFormModules({ ...config.defaultModules });
      setFormLocation('');
      setFormEventNameMode(config.eventNameMode);
      setPrefillUsed(false);
    }

    // Check if first use — show walkthrough
    if (!isWalkthroughDone(uid)) {
      setWalkthroughActive(true);
      setWalkthroughStep(0);
    }

    setInitialFormSnapshot(JSON.stringify({ formName: '', formTemplate: template, formModules: prefill && prefill.template === template ? prefill.modules : config.defaultModules, formLocation: prefill && prefill.template === template ? prefill.location : '', formEventNameMode: config.eventNameMode }));
    setIsModalOpen(true);
  }, [uid]);

  const openEditModal = useCallback((activity: Activity) => {
    const v2 = activity as unknown as ActivityV2;
    setEditingId(activity.id);
    setFormName(activity.name);
    setFormTemplate(v2.template || 'DISCIPLINE');
    setFormModules(v2.modules || { ...TEMPLATE_CONFIGS.DISCIPLINE.defaultModules });
    setFormLocation(v2.location || '');
    setFormEventNameMode(v2.eventNameMode || 'AUTO');
    setPrefillUsed(false);
    setInitialFormSnapshot(JSON.stringify({
      formName: activity.name,
      formTemplate: v2.template || 'DISCIPLINE',
      formModules: v2.modules || TEMPLATE_CONFIGS.DISCIPLINE.defaultModules,
      formLocation: v2.location || '',
      formEventNameMode: v2.eventNameMode || 'AUTO',
    }));
    setIsModalOpen(true);
  }, []);

  // ─── Module mutex enforcement (Section 15) ──────────────────────────────
  const toggleModule = useCallback((key: keyof ModulesConfig) => {
    setFormModules(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // staffBilling + orgRoleBilling are mutually exclusive
      if (key === 'staffBilling' && next.staffBilling) next.orgRoleBilling = false;
      if (key === 'orgRoleBilling' && next.orgRoleBilling) next.staffBilling = false;
      return next;
    });
  }, []);

  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formName.trim()) return;
    if (!isSuperAdmin) return;

    const now = new Date().toISOString();
    const config = TEMPLATE_CONFIGS[formTemplate];

    // Save prefill for next time
    savePrefill(uid, { template: formTemplate, modules: formModules, location: formLocation });

    // Mark walkthrough as done
    if (walkthroughActive) {
      markWalkthroughDone(uid);
      setWalkthroughActive(false);
    }

    if (editingId) {
      setActivities(prev => prev.map(a => {
        if (a.id !== editingId) return a;
        return {
          ...a,
          name: formName.trim(),
          template: formTemplate,
          activityType: deriveActivityType(formTemplate),
          modules: formModules,
          location: formLocation || null,
          eventNameMode: formEventNameMode,
          updatedAt: now,
        } as any;
      }));
    } else {
      const newActivity = {
        id: generateId(),
        orgId: '',
        name: formName.trim(),
        type: formTemplate === 'ADMINISTRATIVE' ? 'OPERATIONAL' : 'INSTRUCTIONAL',
        template: formTemplate,
        activityType: deriveActivityType(formTemplate),
        modules: formModules,
        location: formLocation || null,
        eventNameMode: formEventNameMode,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      } as any;
      setActivities(prev => [...prev, newActivity]);
    }
    setIsModalOpen(false);
  }, [formName, formTemplate, formModules, formLocation, formEventNameMode, editingId, uid, isSuperAdmin, walkthroughActive, setActivities]);

  // ─── Archive with cascade ────────────────────────────────────────────────

  const initiateArchive = useCallback((activity: Activity) => {
    if (!isSuperAdmin) return;
    const today = new Date().toISOString().slice(0, 10);
    const futureEvents = eventsV2.filter(e =>
      e.activityId === activity.id && e.status === 'SCHEDULED' && e.date >= today
    );
    setArchiveCascade({
      activityId: activity.id,
      name: activity.name,
      futureEventCount: futureEvents.length,
    });
  }, [eventsV2, isSuperAdmin]);

  const confirmArchive = useCallback(() => {
    if (!archiveCascade || !isSuperAdmin) return;
    const { activityId } = archiveCascade;
    const now = new Date().toISOString();
    const tsNow = Timestamp.now();
    const today = now.slice(0, 10);

    // Archive the activity
    setActivities(prev => prev.map(a =>
      a.id === activityId ? { ...a, isArchived: true, updatedAt: now } : a
    ));

    // Cascade: archive ensemble roster members
    const actRoster = rosterMembers.filter(r => r.activityId === activityId);
    if (actRoster.length > 0) {
      setRosterMembers(prev => prev.map(r =>
        r.activityId === activityId ? { ...r, isArchived: true, updatedAt: tsNow } : r
      ));
    }

    // Cascade: archive future events with this activityId (Section 10)
    setEventsV2(prev => prev.map(e =>
      e.activityId === activityId && e.status === 'SCHEDULED' && e.date >= today
        ? { ...e, status: 'ARCHIVED' as EventStatus, updatedAt: tsNow }
        : e
    ));

    setArchiveCascade(null);
  }, [archiveCascade, isSuperAdmin, rosterMembers, setActivities, setRosterMembers, setEventsV2]);

  const handleRestore = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    setActivities(prev => prev.map(a =>
      a.id === id ? { ...a, isArchived: false, updatedAt: new Date().toISOString() } : a
    ));
  }, [isSuperAdmin, setActivities]);

  const handlePermanentDelete = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    if (window.confirm(t('activities.confirm_permanent_delete'))) {
      setActivities(prev => prev.filter(a => a.id !== id));
    }
  }, [isSuperAdmin, setActivities, t]);

  // ─── L1 / L2 CRUD ───────────────────────────────────────────────────────

  const addL1 = useCallback(() => {
    if (!l1Input.trim() || !detailActivityId || !isSuperAdmin) return;
    const exists = activityL1s.some(l => l.name.toLowerCase() === l1Input.trim().toLowerCase());
    if (exists) return;
    const now = Timestamp.now();
    const newL1: L1Subcategory = {
      id: generateId(), orgId: '', activityId: detailActivityId,
      name: l1Input.trim(), isArchived: false, createdAt: now, updatedAt: now,
    };
    setL1Subs(prev => [...prev, newL1]);
    setL1Input('');
  }, [l1Input, detailActivityId, isSuperAdmin, activityL1s, setL1Subs]);

  const addL2 = useCallback(() => {
    if (!l2Input.trim() || !detailActivityId || !isSuperAdmin) return;
    const exists = activityL2s.some(l => l.name.toLowerCase() === l2Input.trim().toLowerCase());
    if (exists) return;
    const now = Timestamp.now();
    const newL2: L2Subcategory = {
      id: generateId(), orgId: '', activityId: detailActivityId,
      l1Id: null, name: l2Input.trim(), defaultRate: null,
      isArchived: false, createdAt: now, updatedAt: now,
    };
    setL2Subs(prev => [...prev, newL2]);
    setL2Input('');
  }, [l2Input, detailActivityId, isSuperAdmin, activityL2s, setL2Subs]);

  const archiveL1 = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    const today = new Date().toISOString().slice(0, 10);
    const tsNow = Timestamp.now();
    setL1Subs(prev => prev.map(l => l.id === id ? { ...l, isArchived: true, updatedAt: tsNow } : l));
    // Cascade: archive future events with this l1Id (Section 10)
    setEventsV2(prev => prev.map(e =>
      e.l1Id === id && e.status === 'SCHEDULED' && e.date >= today
        ? { ...e, status: 'ARCHIVED' as EventStatus, updatedAt: tsNow }
        : e
    ));
  }, [isSuperAdmin, setL1Subs, setEventsV2]);

  const restoreL1 = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    setL1Subs(prev => prev.map(l => l.id === id ? { ...l, isArchived: false, updatedAt: Timestamp.now() } : l));
  }, [isSuperAdmin, setL1Subs]);

  const archiveL2 = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    const today = new Date().toISOString().slice(0, 10);
    const tsNow = Timestamp.now();
    setL2Subs(prev => prev.map(l => l.id === id ? { ...l, isArchived: true, updatedAt: tsNow } : l));
    // Cascade: archive future events with this l2Id (Section 10)
    setEventsV2(prev => prev.map(e =>
      e.l2Id === id && e.status === 'SCHEDULED' && e.date >= today
        ? { ...e, status: 'ARCHIVED' as EventStatus, updatedAt: tsNow }
        : e
    ));
    // Cascade: archive active enrollments with this l2Id (Section 10)
    setEnrollmentsV2(prev => prev.map(e =>
      e.l2Id === id && e.status === 'ACTIVE'
        ? { ...e, status: 'ARCHIVED' as EnrollmentStatus, updatedAt: tsNow }
        : e
    ));
  }, [isSuperAdmin, setL2Subs, setEventsV2, setEnrollmentsV2]);

  const restoreL2 = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    setL2Subs(prev => prev.map(l => l.id === id ? { ...l, isArchived: false, updatedAt: Timestamp.now() } : l));
  }, [isSuperAdmin, setL2Subs]);

  // ─── Ensemble Roster CRUD ────────────────────────────────────────────────

  const addToRoster = useCallback((studentId: string) => {
    if (!detailActivityId || !isSuperAdmin) return;
    const exists = activityRoster.some(r => r.studentId === studentId);
    if (exists) return;
    const now = Timestamp.now();
    const member: EnsembleRosterMember = {
      id: generateId(), orgId: '', activityId: detailActivityId,
      studentId, startDate: new Date().toISOString().split('T')[0],
      endDate: null, isArchived: false, createdAt: now, updatedAt: now,
    };
    setRosterMembers(prev => [...prev, member]);
    setRosterStudentSearch('');
  }, [detailActivityId, isSuperAdmin, activityRoster, setRosterMembers]);

  const removeFromRoster = useCallback((memberId: string) => {
    if (!isSuperAdmin) return;
    const member = rosterMembers.find(r => r.id === memberId);
    if (!member) return;
    const studentName = students.find(s => s.id === member.studentId)?.fullName || '';
    if (!window.confirm(t('activities.roster_remove_confirm').replace('{name}', studentName))) return;
    setRosterMembers(prev => prev.map(r =>
      r.id === memberId ? { ...r, isArchived: true, updatedAt: Timestamp.now() } : r
    ));
  }, [isSuperAdmin, rosterMembers, students, t, setRosterMembers]);

  // ─── Walkthrough helpers ─────────────────────────────────────────────────
  const walkthroughSteps = [
    t('activities.walkthrough_step1'),
    t('activities.walkthrough_step2'),
    t('activities.walkthrough_step3'),
    t('activities.walkthrough_step4'),
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — Detail View
  // ═══════════════════════════════════════════════════════════════════════════

  if (detailActivity && detailConfig) {
    const Config = detailConfig;
    const v2 = detailActivity as unknown as ActivityV2;
    const activeL1s = activityL1s.filter(l => !l.isArchived);
    const archivedL1s = activityL1s.filter(l => l.isArchived);
    const activeL2s = activityL2s.filter(l => !l.isArchived);
    const archivedL2s = activityL2s.filter(l => l.isArchived);
    const isEnsemble = v2.template === 'ENSEMBLE';

    const rosterStudents = activityRoster.map(r => {
      const student = students.find(s => s.id === r.studentId);
      return { ...r, studentName: student?.fullName || r.studentId };
    });
    const availableStudents = students.filter(s =>
      s.profileStatus === 'ACTIVE' && !activityRoster.some(r => r.studentId === s.id)
    ).filter(s =>
      !rosterStudentSearch || s.fullName.toLowerCase().includes(rosterStudentSearch.toLowerCase())
    );

    return (
      <div className={`${embedded ? 'h-full overflow-auto' : ''} p-8 max-w-5xl mx-auto`}>
        {/* Back button + title */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => { setDetailActivityId(null); setDetailTab('hierarchy'); }}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <div className={`p-2 rounded-lg bg-${Config.color}-100 dark:bg-${Config.color}-900/50 text-${Config.color}-600 dark:text-${Config.color}-300`}>
            <Config.icon size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">{detailActivity.name}</h2>
            <span className={`text-xs font-semibold uppercase tracking-wider text-${Config.color}-500 dark:text-${Config.color}-400`}>
              {t(`activities.template_${v2.template?.toLowerCase()}`)}
            </span>
          </div>
          {isSuperAdmin && !detailActivity.isArchived && (
            <button onClick={() => openEditModal(detailActivity)} className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <Edit2 size={18} />
            </button>
          )}
        </div>

        {!isSuperAdmin && (
          <div className="mb-4 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-300">
            {t('activities.read_only')}
          </div>
        )}

        {/* Module badges */}
        {v2.modules && (
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(v2.modules).filter(([, v]) => v).map(([k]) => (
              <span key={k} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {t(`activities.module_${k}`)}
              </span>
            ))}
          </div>
        )}

        {/* Tabs for Ensemble */}
        {isEnsemble && (
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 mb-6 w-fit">
            {(['hierarchy', 'roster'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setDetailTab(tab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  detailTab === tab
                    ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'hierarchy' ? <Layers size={16} /> : <Users size={16} />}
                {tab === 'hierarchy' ? t('activities.l2_subcategories') : t('activities.roster')}
              </button>
            ))}
          </div>
        )}

        {/* Hierarchy Tab (L1 / L2) */}
        {(detailTab === 'hierarchy' || !isEnsemble) && Config.hasHierarchy && (
          <div className="space-y-8">
            {/* L1 Section */}
            {(Config.l1Required || activityL1s.length > 0) && (
              <div>
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
                  {t('activities.l1_subcategories')}
                  {Config.l1Required && <span className="text-xs text-red-400">*</span>}
                </h3>
                {isSuperAdmin && (
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text" value={l1Input} onChange={e => setL1Input(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addL1())}
                      placeholder={t('activities.l1_placeholder')}
                      className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button type="button" onClick={addL1} disabled={!l1Input.trim()}
                      className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft px-3 py-2 rounded-lg">
                      <Plus size={18} />
                    </button>
                  </div>
                )}
                <div className="space-y-1.5">
                  {activeL1s.map(l1 => (
                    <div key={l1.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 group">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{l1.name}</span>
                      {isSuperAdmin && (
                        <button onClick={() => archiveL1(l1.id)} className="text-slate-400 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Archive size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {activeL1s.length === 0 && <p className="text-sm text-slate-400 italic">{t('activities.no_l1')}</p>}
                  {showArchived && archivedL1s.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <h5 className="text-xs font-semibold uppercase text-amber-500 mb-1.5">{t('activities.archived_badge')}</h5>
                      {archivedL1s.map(l1 => (
                        <div key={l1.id} className="flex justify-between items-center bg-amber-50 dark:bg-amber-900/10 px-3 py-2 rounded-lg border border-amber-100 dark:border-amber-900/30 mb-1.5 group opacity-60">
                          <span className="text-sm font-medium text-amber-700 dark:text-amber-400 line-through">{l1.name}</span>
                          {isSuperAdmin && (
                            <button onClick={() => restoreL1(l1.id)} className="text-amber-400 hover:text-green-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* L2 Section */}
            {Config.l2Required && (
              <div>
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
                  {t('activities.l2_subcategories')}
                  <span className="text-xs text-red-400">*</span>
                </h3>
                {isSuperAdmin && (
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text" value={l2Input} onChange={e => setL2Input(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addL2())}
                      placeholder={t('activities.l2_placeholder')}
                      className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button type="button" onClick={addL2} disabled={!l2Input.trim()}
                      className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft px-3 py-2 rounded-lg">
                      <Plus size={18} />
                    </button>
                  </div>
                )}
                <div className="space-y-1.5">
                  {activeL2s.map(l2 => (
                    <div key={l2.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 group">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{l2.name}</span>
                      {isSuperAdmin && (
                        <button onClick={() => archiveL2(l2.id)} className="text-slate-400 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Archive size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {activeL2s.length === 0 && <p className="text-sm text-slate-400 italic">{t('activities.no_l2')}</p>}
                  {showArchived && archivedL2s.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <h5 className="text-xs font-semibold uppercase text-amber-500 mb-1.5">{t('activities.archived_badge')}</h5>
                      {archivedL2s.map(l2 => (
                        <div key={l2.id} className="flex justify-between items-center bg-amber-50 dark:bg-amber-900/10 px-3 py-2 rounded-lg border border-amber-100 dark:border-amber-900/30 mb-1.5 group opacity-60">
                          <span className="text-sm font-medium text-amber-700 dark:text-amber-400 line-through">{l2.name}</span>
                          {isSuperAdmin && (
                            <button onClick={() => restoreL2(l2.id)} className="text-amber-400 hover:text-green-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ensemble Roster Tab */}
        {detailTab === 'roster' && isEnsemble && (
          <div>
            {isSuperAdmin && (
              <div className="mb-4">
                <div className="flex gap-2 mb-2">
                  <input
                    type="text" value={rosterStudentSearch}
                    onChange={e => setRosterStudentSearch(e.target.value)}
                    placeholder={t('activities.roster_add') + '...'}
                    className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                </div>
                {rosterStudentSearch && availableStudents.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg max-h-40 overflow-y-auto shadow-lg">
                    {availableStudents.slice(0, 10).map(s => (
                      <button key={s.id} onClick={() => addToRoster(s.id)}
                        className="w-full text-start px-3 py-2 text-sm hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center gap-2 transition-colors">
                        <UserPlus size={14} className="text-purple-500" />
                        <span className="text-slate-700 dark:text-slate-300">{s.fullName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              {rosterStudents.length === 0 ? (
                <p className="text-sm text-slate-400 italic py-4 text-center">{t('activities.roster_empty')}</p>
              ) : (
                rosterStudents.map(r => (
                  <div key={r.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 px-3 py-2.5 rounded-lg border border-slate-100 dark:border-slate-700 group">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-purple-500" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{r.studentName}</span>
                    </div>
                    {isSuperAdmin && (
                      <button onClick={() => removeFromRoster(r.id)}
                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title={t('activities.roster_remove')}>
                        <UserMinus size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — Activity List View
  // ═══════════════════════════════════════════════════════════════════════════

  const getActivityConfig = (activity: Activity) => {
    const v2 = activity as unknown as ActivityV2;
    return TEMPLATE_CONFIGS[v2.template] || TEMPLATE_CONFIGS.DISCIPLINE;
  };

  return (
    <div className={`${embedded ? 'h-full overflow-auto' : ''} p-8 max-w-6xl mx-auto`}>
      {/* Toolbar */}
      <div className={`flex ${embedded ? 'justify-end' : 'justify-between items-center'} gap-3 mb-6`}>
        {!embedded && (
          <div className="flex items-center gap-3">
            {onMobileMenuOpen && (
              <button onClick={onMobileMenuOpen} className="p-2 -ms-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden">
                <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('activities.title')}</h2>
              <p className="text-slate-500 dark:text-slate-400">{t('activities.subtitle')}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${showArchived
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Archive size={16} />
            {t('activities.show_archived')}
          </button>
          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
              <List size={16} />
            </button>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => setTemplatePickerOpen(true)}
              className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-4 py-2 rounded-lg flex items-center"
            >
              <Plus size={18} className="me-2" /> {t('activities.add')}
            </button>
          )}
        </div>
      </div>

      {/* Activity Grid / List */}
      {visibleActivities.length === 0 ? (
        <div className="py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          {t('activities.empty_state')}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleActivities.map(activity => {
            const config = getActivityConfig(activity);
            const Icon = config.icon;
            const v2 = activity as unknown as ActivityV2;
            const l2Count = l2Subs.filter(l => l.activityId === activity.id && !l.isArchived).length;

            return (
              <div
                key={activity.id}
                onClick={() => { setDetailActivityId(activity.id); setDetailTab('hierarchy'); }}
                className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col hover:shadow-md transition-shadow cursor-pointer ${activity.isArchived ? 'opacity-60' : ''}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <div className={`p-2 rounded-lg bg-${config.color}-100 dark:bg-${config.color}-900/50 text-${config.color}-600 dark:text-${config.color}-300`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 dark:text-white">{activity.name}</h3>
                      <span className={`text-xs font-semibold uppercase tracking-wider text-${config.color}-500 dark:text-${config.color}-400`}>
                        {t(`activities.template_${(v2.template || 'discipline').toLowerCase()}`)}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2 rtl:space-x-reverse" onClick={e => e.stopPropagation()}>
                    {isSuperAdmin && !activity.isArchived && (
                      <button onClick={() => openEditModal(activity)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                        <Edit2 size={16} />
                      </button>
                    )}
                    {activity.isArchived ? (
                      <>
                        {isSuperAdmin && <button onClick={() => handleRestore(activity.id)} className="text-slate-400 hover:text-green-600 dark:hover:text-green-400"><RotateCcw size={16} /></button>}
                        {isSuperAdmin && <button onClick={() => handlePermanentDelete(activity.id)} className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 size={16} /></button>}
                      </>
                    ) : (
                      isSuperAdmin && <button onClick={() => initiateArchive(activity)} className="text-slate-400 hover:text-amber-600 dark:hover:text-amber-400"><Archive size={16} /></button>
                    )}
                  </div>
                </div>
                {activity.isArchived && (
                  <span className="inline-flex items-center self-start px-2 py-0.5 mb-2 rounded text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                    {t('activities.archived_badge')}
                  </span>
                )}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-400">{l2Count} {t('activities.subcategories').toLowerCase()}</span>
                  <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List view */
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <th className="text-start px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">{t('activities.name')}</th>
                <th className="text-start px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hidden md:table-cell">{t('activities.type')}</th>
                <th className="text-start px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hidden lg:table-cell">{t('activities.subcategories')}</th>
                <th className="text-end px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">{t('btn.edit')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleActivities.map(activity => {
                const config = getActivityConfig(activity);
                const Icon = config.icon;
                const v2 = activity as unknown as ActivityV2;
                const l2Count = l2Subs.filter(l => l.activityId === activity.id && !l.isArchived).length;
                return (
                  <tr key={activity.id}
                    onClick={() => { setDetailActivityId(activity.id); setDetailTab('hierarchy'); }}
                    className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer ${activity.isArchived ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg bg-${config.color}-100 dark:bg-${config.color}-900/50 text-${config.color}-600 dark:text-${config.color}-300`}>
                          <Icon size={16} />
                        </div>
                        <div>
                          <span className="font-medium text-slate-900 dark:text-white">{activity.name}</span>
                          {activity.isArchived && <span className="ms-2 text-xs text-amber-600 dark:text-amber-400">{t('activities.archived_badge')}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-xs font-semibold uppercase text-${config.color}-500 dark:text-${config.color}-400`}>
                        {t(`activities.template_${(v2.template || 'discipline').toLowerCase()}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden lg:table-cell">
                      <span className="text-xs">{l2Count} {t('activities.subcategories').toLowerCase()}</span>
                    </td>
                    <td className="px-4 py-3 text-end" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {isSuperAdmin && !activity.isArchived && (
                          <button onClick={() => openEditModal(activity)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                            <Edit2 size={14} />
                          </button>
                        )}
                        {activity.isArchived ? (
                          <>
                            {isSuperAdmin && <button onClick={() => handleRestore(activity.id)} className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"><RotateCcw size={14} /></button>}
                            {isSuperAdmin && <button onClick={() => handlePermanentDelete(activity.id)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 size={14} /></button>}
                          </>
                        ) : (
                          isSuperAdmin && <button onClick={() => initiateArchive(activity)} className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"><Archive size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Template Picker Dialog ═══ */}
      {templatePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setTemplatePickerOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-2xl mx-4">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('activities.choose_template')}</h3>
              <button onClick={() => setTemplatePickerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {ALL_TEMPLATES.map(tmpl => {
                const cfg = TEMPLATE_CONFIGS[tmpl];
                const Icon = cfg.icon;
                return (
                  <button key={tmpl} onClick={() => openCreateModal(tmpl)}
                    className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-${cfg.color}-400 dark:hover:border-${cfg.color}-500 hover:bg-${cfg.color}-50 dark:hover:bg-${cfg.color}-900/20 transition-all group`}>
                    <div className={`p-3 rounded-xl bg-${cfg.color}-100 dark:bg-${cfg.color}-900/50 text-${cfg.color}-600 dark:text-${cfg.color}-300 group-hover:scale-110 transition-transform`}>
                      <Icon size={28} />
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-slate-800 dark:text-white">{t(`activities.template_${tmpl.toLowerCase()}`)}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t(`activities.template_${tmpl.toLowerCase()}_desc`)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Archive Cascade Confirmation ═══ */}
      {archiveCascade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setArchiveCascade(null)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3">{t('activities.archive_cascade_title')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
              {archiveCascade.futureEventCount > 0
                ? t('activities.archive_cascade_message').replace('{name}', archiveCascade.name).replace('{eventCount}', String(archiveCascade.futureEventCount))
                : t('activities.archive_cascade_no_events').replace('{name}', archiveCascade.name)
              }
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setArchiveCascade(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                {t('btn.cancel')}
              </button>
              <button onClick={confirmArchive}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors">
                {t('activities.archive')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Create / Edit Modal ═══ */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? t('activities.edit') : t('activities.add_new')}
        isDirty={isDirty}
        onSave={(e?: React.FormEvent) => handleSubmit(e)}
        t={t}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Guide Me link (Section 21 — Layer 3) */}
          <button
            type="button"
            onClick={() => { setWalkthroughActive(true); setWalkthroughStep(0); }}
            className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <HelpCircle size={14} />
            {t('activities.guide_me')}
          </button>

          {/* Walkthrough overlay (Section 21 — Layer 1) */}
          {walkthroughActive && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={16} className="text-blue-500" />
                <h4 className="text-sm font-bold text-blue-700 dark:text-blue-300">{t('activities.walkthrough_title')}</h4>
              </div>
              <p className="text-sm text-blue-600 dark:text-blue-300 mb-3">
                {walkthroughSteps[walkthroughStep]}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {walkthroughSteps.map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full ${i === walkthroughStep ? 'bg-blue-500' : 'bg-blue-200 dark:bg-blue-800'}`} />
                  ))}
                </div>
                <div className="flex gap-2">
                  {walkthroughStep < walkthroughSteps.length - 1 ? (
                    <button type="button" onClick={() => setWalkthroughStep(s => s + 1)}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      Next
                    </button>
                  ) : (
                    <button type="button" onClick={() => { setWalkthroughActive(false); markWalkthroughDone(uid); }}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      {t('activities.walkthrough_dismiss')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pre-fill notice */}
          {prefillUsed && (
            <div className="text-xs text-slate-400 italic flex items-center gap-1">
              <Sparkles size={12} />
              {t('activities.prefill_notice')}
            </div>
          )}

          {/* Template badge (read-only for new, shown for edit) */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('activities.type')}:</span>
            {(() => {
              const cfg = TEMPLATE_CONFIGS[formTemplate];
              const Icon = cfg.icon;
              return (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold bg-${cfg.color}-100 dark:bg-${cfg.color}-900/50 text-${cfg.color}-700 dark:text-${cfg.color}-300`}>
                  <Icon size={14} />
                  {t(`activities.template_${formTemplate.toLowerCase()}`)}
                </span>
              );
            })()}
          </div>

          {/* Activity Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('activities.name')}
            </label>
            <input
              required type="text"
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder={t('activities.name_placeholder')}
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('activities.location')}
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formLocation}
              onChange={e => setFormLocation(e.target.value)}
              placeholder={t('activities.location_placeholder')}
            />
          </div>

          {/* Event Name Mode */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('activities.event_name_mode')}
            </label>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              {(['AUTO', 'PROMPTED'] as EventNameMode[]).map(mode => (
                <button key={mode} type="button"
                  onClick={() => setFormEventNameMode(mode)}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    formEventNameMode === mode
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}>
                  {mode === 'AUTO' ? t('activities.event_name_auto') : t('activities.event_name_prompted')}
                </button>
              ))}
            </div>
          </div>

          {/* Modules Configuration */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('activities.modules')}
            </label>
            <div className="space-y-2">
              {(Object.keys(formModules) as (keyof ModulesConfig)[]).map(key => (
                <label key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={formModules[key]}
                    onChange={() => toggleModule(key)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{t(`activities.module_${key}`)}</span>
                </label>
              ))}
            </div>
            {formModules.staffBilling && formModules.orgRoleBilling && (
              <p className="text-xs text-red-500 mt-1">{t('activities.modules_mutex_warning')}</p>
            )}
          </div>

          {/* Form actions */}
          <div className="flex justify-end space-x-3 rtl:space-x-reverse mt-6">
            <button type="button" onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              {t('btn.cancel')}
            </button>
            <button type="submit"
              className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg">
              {t('btn.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
