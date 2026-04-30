import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { AppSettings, CalendarEvent, Student } from '../types';
import type {
  ActivityV2, L1Subcategory, L2Subcategory, EnsembleRosterMember,
  ActivityTemplate, ModulesConfig, EventNameMode,
  EventV2, EnrollmentV2, EventStatus, EnrollmentStatus,
  TeachingAssignmentV2, ActivityTypeV2,
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
  Users, UserPlus, UserMinus, ChevronRight, Sparkles, ArrowUp, ArrowDown, CheckSquare,
} from 'lucide-react';
import { useListStyle } from '../utils/useListStyle';
import { useSortState } from '../utils/useSortState';
import { ImportExportDropdown } from './ImportExportDropdown';

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
    defaultModules: { curriculum: true, externalParticipants: false },
    eventNameMode: 'AUTO',
  },
  PROGRAM: {
    template: 'PROGRAM', icon: Layers, color: 'green',
    l1Required: true, l2Required: true, hasHierarchy: true,
    defaultModules: { curriculum: true, externalParticipants: false },
    eventNameMode: 'AUTO',
  },
  ENSEMBLE: {
    template: 'ENSEMBLE', icon: Music, color: 'purple',
    l1Required: false, l2Required: true, hasHierarchy: true,
    defaultModules: { curriculum: true, externalParticipants: false },
    eventNameMode: 'PROMPTED',
  },
  EXTERNAL: {
    template: 'EXTERNAL', icon: Globe, color: 'amber',
    l1Required: false, l2Required: true, hasHierarchy: true,
    defaultModules: { curriculum: false, externalParticipants: true },
    eventNameMode: 'PROMPTED',
  },
  ADMINISTRATIVE: {
    template: 'ADMINISTRATIVE', icon: Briefcase, color: 'slate',
    l1Required: false, l2Required: false, hasHierarchy: false,
    defaultModules: { curriculum: false, externalParticipants: false },
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

// ─── 4-level Tree View ──────────────────────────────────────────────────────

const ACTIVITY_TYPE_ORDER: ActivityTypeV2[] = ['ACADEMIC', 'PERFORMANCES', 'SPECIAL_EVENTS', 'ADMINISTRATIVE'];

interface TreeProps {
  activities: ActivityV2[];
  l1Subs: L1Subcategory[];
  l2Subs: L2Subcategory[];
  showArchived: boolean;
  isSuperAdmin: boolean;
  treeExpanded: Set<string>;
  onToggleExpand: (id: string) => void;
  l1InputsByActivity: Record<string, string>;
  setL1InputForActivity: (activityId: string, value: string) => void;
  l2InputsByL1: Record<string, string>;
  setL2InputForL1: (l1Id: string, value: string) => void;
  onAddL1: (activityId: string) => void;
  onAddL2: (l1Id: string | null, activityId: string) => void;
  onArchiveL1: (id: string) => void;
  onRestoreL1: (id: string) => void;
  onArchiveL2: (id: string) => void;
  onRestoreL2: (id: string) => void;
  onArchiveActivity: (a: ActivityV2) => void;
  onRestoreActivity: (id: string) => void;
  onEditActivity: (a: ActivityV2) => void;
  getActivityConfig: (a: ActivityV2) => TemplateConfig;
  t: (key: string) => string;
}

const ActivityTreeView: React.FC<TreeProps> = ({
  activities, l1Subs, l2Subs, showArchived, isSuperAdmin,
  treeExpanded, onToggleExpand,
  l1InputsByActivity, setL1InputForActivity,
  l2InputsByL1, setL2InputForL1,
  onAddL1, onAddL2,
  onArchiveL1, onRestoreL1, onArchiveL2, onRestoreL2,
  onArchiveActivity, onRestoreActivity, onEditActivity,
  getActivityConfig, t,
}) => {
  const byType = useMemo(() => {
    const m = new Map<ActivityTypeV2, ActivityV2[]>();
    for (const tp of ACTIVITY_TYPE_ORDER) m.set(tp, []);
    for (const a of activities) {
      const arr = m.get(a.activityType) ?? [];
      arr.push(a);
      m.set(a.activityType, arr);
    }
    for (const tp of ACTIVITY_TYPE_ORDER) {
      m.get(tp)!.sort((a, b) => a.name.localeCompare(b.name));
    }
    return m;
  }, [activities]);

  return (
    <div className="space-y-6">
      {ACTIVITY_TYPE_ORDER.map(type => {
        const acts = byType.get(type) ?? [];
        if (acts.length === 0) return null;
        return (
          <section key={type} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <header className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t(`activities.type_${type.toLowerCase()}`) || type}
              </h3>
            </header>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {acts.map(activity => {
                const config = getActivityConfig(activity);
                const Icon = config.icon;
                const expanded = treeExpanded.has(activity.id);
                const activityL1s = l1Subs.filter(l => l.activityId === activity.id && (showArchived || !l.isArchived));
                const directL2s = l2Subs.filter(l => l.activityId === activity.id && l.l1Id == null && (showArchived || !l.isArchived));
                return (
                  <li key={activity.id} className={activity.isArchived ? 'opacity-60' : ''}>
                    {/* Activity row */}
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <button onClick={() => onToggleExpand(activity.id)}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                      </button>
                      <div className={`p-1.5 rounded bg-${config.color}-100 dark:bg-${config.color}-900/40 text-${config.color}-600 dark:text-${config.color}-300`}>
                        <Icon size={14} />
                      </div>
                      <span className="font-medium text-slate-800 dark:text-slate-200 flex-1 truncate">
                        {activity.name}
                        {activity.isArchived && <span className="ms-2 text-xs text-amber-600 dark:text-amber-400 line-through">({t('activities.archived')})</span>}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {activityL1s.length > 0 ? `${activityL1s.length} L1` : `${directL2s.length} L2`}
                      </span>
                      {isSuperAdmin && !activity.isArchived && (
                        <>
                          <button onClick={() => onEditActivity(activity)} className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => onArchiveActivity(activity)} className="p-1 text-slate-400 hover:text-amber-500">
                            <Archive size={14} />
                          </button>
                        </>
                      )}
                      {isSuperAdmin && activity.isArchived && (
                        <button onClick={() => onRestoreActivity(activity.id)} className="p-1 text-amber-400 hover:text-green-500">
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>

                    {/* Expanded children */}
                    {expanded && config.hasHierarchy && !activity.isArchived && (
                      <div className="ps-10 pe-3 pb-3 space-y-2 bg-slate-50/50 dark:bg-slate-900/40">
                        {/* Add L1 row (when template supports L1) */}
                        {isSuperAdmin && config.l1Required !== false && (
                          <div className="flex gap-2 pt-2">
                            <input type="text"
                              value={l1InputsByActivity[activity.id] ?? ''}
                              onChange={e => setL1InputForActivity(activity.id, e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), onAddL1(activity.id))}
                              placeholder={t('activities.l1_placeholder')}
                              className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <button type="button" onClick={() => onAddL1(activity.id)}
                              disabled={!(l1InputsByActivity[activity.id] ?? '').trim()}
                              className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 px-2.5 py-1.5 rounded-lg">
                              <Plus size={14} />
                            </button>
                          </div>
                        )}

                        {/* L1 nodes with nested L2s */}
                        {activityL1s.map(l1 => {
                          const l2Children = l2Subs.filter(l => l.l1Id === l1.id && (showArchived || !l.isArchived));
                          const l2Input = l2InputsByL1[l1.id] ?? '';
                          return (
                            <div key={l1.id} className={`border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden ${l1.isArchived ? 'opacity-60' : ''}`}>
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 group">
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex-1">
                                  {l1.name}
                                  {l1.isArchived && <span className="ms-2 text-xs text-amber-600 dark:text-amber-400 line-through">({t('activities.archived')})</span>}
                                </span>
                                {isSuperAdmin && !l1.isArchived && (
                                  <button onClick={() => onArchiveL1(l1.id)} className="p-1 text-slate-400 hover:text-amber-500">
                                    <Archive size={12} />
                                  </button>
                                )}
                                {isSuperAdmin && l1.isArchived && (
                                  <button onClick={() => onRestoreL1(l1.id)} className="p-1 text-amber-400 hover:text-green-500">
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                              </div>
                              {!l1.isArchived && (
                                <div className="px-3 py-1.5 space-y-1">
                                  {l2Children.map(l2 => (
                                    <div key={l2.id} className={`flex items-center gap-2 px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 group ${l2.isArchived ? 'opacity-60' : ''}`}>
                                      <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">
                                        {l2.name}
                                        {l2.isArchived && <span className="ms-2 text-xs text-amber-600 dark:text-amber-400 line-through">({t('activities.archived')})</span>}
                                      </span>
                                      {isSuperAdmin && !l2.isArchived && (
                                        <button onClick={() => onArchiveL2(l2.id)} className="p-1 text-slate-400 hover:text-amber-500 opacity-0 group-hover:opacity-100">
                                          <Archive size={12} />
                                        </button>
                                      )}
                                      {isSuperAdmin && l2.isArchived && (
                                        <button onClick={() => onRestoreL2(l2.id)} className="p-1 text-amber-400 hover:text-green-500">
                                          <RotateCcw size={12} />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  {isSuperAdmin && (
                                    <div className="flex gap-2 pt-1">
                                      <input type="text"
                                        value={l2Input}
                                        onChange={e => setL2InputForL1(l1.id, e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), onAddL2(l1.id, activity.id))}
                                        placeholder={t('activities.l2_placeholder')}
                                        className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                                      />
                                      <button type="button" onClick={() => onAddL2(l1.id, activity.id)}
                                        disabled={!l2Input.trim()}
                                        className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 px-2 py-1 rounded">
                                        <Plus size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Direct-to-Activity L2s (when template doesn't require L1) */}
                        {(directL2s.length > 0 || (isSuperAdmin && !config.l1Required)) && (
                          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1">
                            {directL2s.map(l2 => (
                              <div key={l2.id} className={`flex items-center gap-2 px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 ${l2.isArchived ? 'opacity-60' : ''}`}>
                                <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">
                                  {l2.name}
                                  {l2.isArchived && <span className="ms-2 text-xs text-amber-600 dark:text-amber-400 line-through">({t('activities.archived')})</span>}
                                </span>
                                {isSuperAdmin && !l2.isArchived && (
                                  <button onClick={() => onArchiveL2(l2.id)} className="p-1 text-slate-400 hover:text-amber-500">
                                    <Archive size={12} />
                                  </button>
                                )}
                                {isSuperAdmin && l2.isArchived && (
                                  <button onClick={() => onRestoreL2(l2.id)} className="p-1 text-amber-400 hover:text-green-500">
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                            {isSuperAdmin && !config.l1Required && (
                              <p className="text-xs text-slate-400 dark:text-slate-500 italic px-1">
                                {t('activities.add_direct_l2_hint')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  activities: ActivityV2[];
  setActivities: React.Dispatch<React.SetStateAction<ActivityV2[]>>;
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
  const [teachingAssignments, setTeachingAssignments] = useFirestoreSync<TeachingAssignmentV2>(V2_COLLECTIONS.teachingAssignments, []);

  // ─── UI State ────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useListStyle(['tree', 'grid', 'list']);
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set()); // ids of expanded activity rows
  const [l1InputsByActivity, setL1InputsByActivity] = useState<Record<string, string>>({});
  const [showArchived, setShowArchived] = useState(false);
  const { sortDirection, toggleSort } = useSortState<'name'>('name');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailActivityId, setDetailActivityId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'hierarchy' | 'roster'>('hierarchy');

  // ─── Walkthrough state ───────────────────────────────────────────────────
  const [walkthroughActive, setWalkthroughActive] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);

  // ─── Archive cascade modal ──────────────────────────────────────────────
  const [archiveCascade, setArchiveCascade] = useState<{
    activityId: string; name: string;
    futureEventCount: number;
    l1Count: number; l2Count: number;
    assignmentCount: number;
  } | null>(null);

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
  // Per-L1 section inputs (used in tree view for l1Required templates)
  const [l2InputsByL1, setL2InputsByL1] = useState<Record<string, string>>({});

  // ─── Roster add ──────────────────────────────────────────────────────────
  const [rosterStudentSearch, setRosterStudentSearch] = useState('');

  // ─── Derived data ────────────────────────────────────────────────────────
  const visibleActivities = useMemo(() => {
    const base = activities.filter(a => showArchived || !a.isArchived);
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase()) * dir);
  }, [activities, showArchived, sortDirection]);

  const detailActivity = useMemo(() =>
    activities.find(a => a.id === detailActivityId) || null,
    [activities, detailActivityId]
  );

  const detailConfig = detailActivity?.template ? TEMPLATE_CONFIGS[detailActivity.template] : null;

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

  const openEditModal = useCallback((activity: ActivityV2) => {
    setEditingId(activity.id);
    setFormName(activity.name);
    setFormTemplate(activity.template || 'DISCIPLINE');
    setFormModules(activity.modules || { ...TEMPLATE_CONFIGS.DISCIPLINE.defaultModules });
    setFormLocation(activity.location || '');
    setFormEventNameMode(activity.eventNameMode || 'AUTO');
    setPrefillUsed(false);
    setInitialFormSnapshot(JSON.stringify({
      formName: activity.name,
      formTemplate: activity.template || 'DISCIPLINE',
      formModules: activity.modules || TEMPLATE_CONFIGS.DISCIPLINE.defaultModules,
      formLocation: activity.location || '',
      formEventNameMode: activity.eventNameMode || 'AUTO',
    }));
    setIsModalOpen(true);
  }, []);


  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formName.trim()) return;
    if (!isSuperAdmin) return;

    const now = Timestamp.now();
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
        };
      }));
    } else {
      const newActivity: ActivityV2 = {
        id: generateId(),
        orgId: '',
        name: formName.trim(),
        template: formTemplate,
        activityType: deriveActivityType(formTemplate),
        modules: formModules,
        location: formLocation || null,
        eventNameMode: formEventNameMode,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };
      setActivities(prev => [...prev, newActivity]);
    }
    setIsModalOpen(false);
  }, [formName, formTemplate, formModules, formLocation, formEventNameMode, editingId, uid, isSuperAdmin, walkthroughActive, setActivities]);

  // ─── Archive with cascade ────────────────────────────────────────────────

  const initiateArchive = useCallback((activity: ActivityV2) => {
    if (!isSuperAdmin) return;
    const today = new Date().toISOString().slice(0, 10);
    const futureEvents = eventsV2.filter(e =>
      e.activityId === activity.id && e.status === 'SCHEDULED' && e.date >= today
    );
    const l1Count = l1Subs.filter(l => l.activityId === activity.id && !l.isArchived).length;
    const l2Count = l2Subs.filter(l => l.activityId === activity.id && !l.isArchived).length;
    const assignmentCount = teachingAssignments.filter(a => a.activityId === activity.id && !a.isArchived).length;
    setArchiveCascade({
      activityId: activity.id,
      name: activity.name,
      futureEventCount: futureEvents.length,
      l1Count, l2Count, assignmentCount,
    });
  }, [eventsV2, l1Subs, l2Subs, teachingAssignments, isSuperAdmin]);

  const confirmArchive = useCallback(() => {
    if (!archiveCascade || !isSuperAdmin) return;
    const { activityId } = archiveCascade;
    const tsNow = Timestamp.now();
    const today = new Date().toISOString().slice(0, 10);

    setActivities(prev => prev.map(a =>
      a.id === activityId ? { ...a, isArchived: true, updatedAt: tsNow } : a
    ));

    // Cascade: descendant L1s and L2s
    setL1Subs(prev => prev.map(l =>
      l.activityId === activityId && !l.isArchived ? { ...l, isArchived: true, updatedAt: tsNow } : l
    ));
    setL2Subs(prev => prev.map(l =>
      l.activityId === activityId && !l.isArchived ? { ...l, isArchived: true, updatedAt: tsNow } : l
    ));

    // Cascade: ensemble roster members
    setRosterMembers(prev => prev.map(r =>
      r.activityId === activityId && !r.isArchived ? { ...r, isArchived: true, updatedAt: tsNow } : r
    ));

    // Cascade: future events
    setEventsV2(prev => prev.map(e =>
      e.activityId === activityId && e.status === 'SCHEDULED' && e.date >= today
        ? { ...e, status: 'ARCHIVED' as EventStatus, updatedAt: tsNow }
        : e
    ));

    // Cascade: enrollments
    setEnrollmentsV2(prev => prev.map(e =>
      e.activityId === activityId && e.status === 'ACTIVE'
        ? { ...e, status: 'ARCHIVED' as EnrollmentStatus, updatedAt: tsNow }
        : e
    ));

    // Cascade: teaching assignments
    setTeachingAssignments(prev => prev.map(a =>
      a.activityId === activityId && !a.isArchived ? { ...a, isArchived: true, updatedAt: tsNow } : a
    ));

    setArchiveCascade(null);
  }, [archiveCascade, isSuperAdmin, setActivities, setL1Subs, setL2Subs, setRosterMembers, setEventsV2, setEnrollmentsV2, setTeachingAssignments]);

  const handleRestore = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    setActivities(prev => prev.map(a =>
      a.id === id ? { ...a, isArchived: false, updatedAt: Timestamp.now() } : a
    ));
  }, [isSuperAdmin, setActivities]);

  const handlePermanentDelete = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    if (window.confirm(t('activities.confirm_permanent_delete'))) {
      setActivities(prev => prev.filter(a => a.id !== id));
    }
  }, [isSuperAdmin, setActivities, t]);

  // ─── Selection / Bulk actions ───────────────────────────────────────────
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkArchive = useCallback(() => {
    if (!isSuperAdmin || selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(t('activities.confirm_bulk_archive').replace('{n}', String(count)))) return;
    const ids = selectedIds;
    const tsNow = Timestamp.now();
    const today = new Date().toISOString().slice(0, 10);
    setActivities(prev => prev.map(a => ids.has(a.id) ? { ...a, isArchived: true, updatedAt: tsNow } : a));
    setRosterMembers(prev => prev.map(r => ids.has(r.activityId) ? { ...r, isArchived: true, updatedAt: tsNow } : r));
    setEventsV2(prev => prev.map(e =>
      ids.has(e.activityId) && e.status === 'SCHEDULED' && e.date >= today
        ? { ...e, status: 'ARCHIVED' as EventStatus, updatedAt: tsNow }
        : e
    ));
    exitSelectMode();
  }, [isSuperAdmin, selectedIds, setActivities, setRosterMembers, setEventsV2, t, exitSelectMode]);

  const handleBulkPermanentDelete = useCallback(() => {
    if (!isSuperAdmin || selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(t('activities.confirm_bulk_permanent_delete').replace('{n}', String(count)))) return;
    const ids = selectedIds;
    setActivities(prev => prev.filter(a => !ids.has(a.id)));
    exitSelectMode();
  }, [isSuperAdmin, selectedIds, setActivities, t, exitSelectMode]);

  const handleBulkRestore = useCallback(() => {
    if (!isSuperAdmin || selectedIds.size === 0) return;
    const ids = selectedIds;
    const tsNow = Timestamp.now();
    setActivities(prev => prev.map(a => ids.has(a.id) ? { ...a, isArchived: false, updatedAt: tsNow } : a));
    exitSelectMode();
  }, [isSuperAdmin, selectedIds, setActivities, exitSelectMode]);

  // ─── CSV Import ─────────────────────────────────────────────────────────
  const csvExistingData = useMemo<Record<string, string>[]>(
    () => activities.map(a => ({
      name: a.name,
      template: a.template || 'DISCIPLINE',
      location: a.location || '',
    })),
    [activities],
  );
  const csvDuplicateKeys = useMemo(
    () => new Set(activities.map(a => a.name.trim().toLowerCase())),
    [activities],
  );

  // Hierarchy import — existing data flattened to l1/l2/l3 rows
  const hierarchyCsvData = useMemo<Record<string, string>[]>(() => {
    const rows: Record<string, string>[] = [];
    activities.forEach(activity => {
      const actL1s = l1Subs.filter(l => l.activityId === activity.id && !l.isArchived);
      const actL2s = l2Subs.filter(l => l.activityId === activity.id && !l.isArchived);
      if (actL1s.length === 0 && actL2s.length === 0) {
        rows.push({ l1: activity.name, template: activity.template, location: activity.location ?? '', l2: '', l3: '' });
        return;
      }
      actL1s.forEach(l1 => {
        const children = actL2s.filter(l => l.l1Id === l1.id);
        if (children.length === 0) {
          rows.push({ l1: activity.name, template: activity.template, location: activity.location ?? '', l2: l1.name, l3: '' });
        } else {
          children.forEach(l2 => {
            rows.push({ l1: activity.name, template: activity.template, location: activity.location ?? '', l2: l1.name, l3: l2.name });
          });
        }
      });
      actL2s.filter(l => !l.l1Id).forEach(l2 => {
        rows.push({ l1: activity.name, template: activity.template, location: activity.location ?? '', l2: '', l3: l2.name });
      });
    });
    return rows;
  }, [activities, l1Subs, l2Subs]);

  const hierarchyDuplicateKeys = useMemo(() => {
    const set = new Set<string>();
    l2Subs.forEach(l2 => {
      const activity = activities.find(a => a.id === l2.activityId);
      const l1 = l2.l1Id ? l1Subs.find(l => l.id === l2.l1Id) : null;
      if (activity) {
        set.add([activity.name, l1?.name ?? '', l2.name].join('|').toLowerCase());
      }
    });
    return set;
  }, [activities, l1Subs, l2Subs]);

  const handleActivityImportComplete = useCallback((rows: Record<string, string>[]) => {
    if (!isSuperAdmin) return;
    const existingByName = new Map<string, ActivityV2>(
      activities.map(a => [a.name.trim().toLowerCase(), a]),
    );
    const now = Timestamp.now();
    const updates = new Map<string, Partial<ActivityV2>>();
    const additions: ActivityV2[] = [];
    rows.forEach(row => {
      const name = (row['name'] || '').trim();
      if (!name) return;
      const rawTpl = (row['template'] || '').trim().toUpperCase();
      const template = (ALL_TEMPLATES.includes(rawTpl as ActivityTemplate) ? rawTpl : 'DISCIPLINE') as ActivityTemplate;
      const config = TEMPLATE_CONFIGS[template];
      const location = (row['location'] || '').trim() || null;
      const key = name.toLowerCase();
      const existing = existingByName.get(key);
      if (existing) {
        updates.set(existing.id, { name, template, activityType: deriveActivityType(template), location, updatedAt: now });
      } else {
        additions.push({
          id: generateId(), orgId: '', name, template,
          activityType: deriveActivityType(template),
          modules: { ...config.defaultModules },
          location,
          eventNameMode: config.eventNameMode,
          isArchived: false,
          createdAt: now, updatedAt: now,
        });
      }
    });
    setActivities(prev => [
      ...prev.map(a => updates.has(a.id) ? { ...a, ...updates.get(a.id)! } : a),
      ...additions,
    ]);
  }, [activities, isSuperAdmin, setActivities]);

  const handleActivityHierarchyImportComplete = useCallback((rows: Record<string, string>[]) => {
    if (!isSuperAdmin) return;
    const now = Timestamp.now();

    const activityByName = new Map<string, ActivityV2>(
      activities.map(a => [a.name.trim().toLowerCase(), a]),
    );
    const l1ByKey = new Map<string, L1Subcategory>(
      l1Subs.map(l => [`${l.activityId}|${l.name.trim().toLowerCase()}`, l]),
    );
    const l2ByKey = new Map<string, L2Subcategory>(
      l2Subs.map(l => [`${l.activityId}|${l.l1Id ?? ''}|${l.name.trim().toLowerCase()}`, l]),
    );

    const activityAdditions: ActivityV2[] = [];
    const l1Additions: L1Subcategory[] = [];
    const l2Additions: L2Subcategory[] = [];
    const newActivityIdByName = new Map<string, string>();
    const newL1IdByKey = new Map<string, string>();

    rows.forEach(row => {
      const l1Name = (row['l1'] || '').trim();
      if (!l1Name) return;
      const rawTpl = (row['template'] || '').trim().toUpperCase();
      const template = (ALL_TEMPLATES.includes(rawTpl as ActivityTemplate) ? rawTpl : 'DISCIPLINE') as ActivityTemplate;
      const config = TEMPLATE_CONFIGS[template];
      const location = (row['location'] || '').trim() || null;
      const l2Name = (row['l2'] || '').trim();
      const l3Name = (row['l3'] || '').trim();

      const activityKey = l1Name.toLowerCase();
      let activityId: string;
      if (!activityByName.has(activityKey) && !newActivityIdByName.has(activityKey)) {
        activityId = generateId();
        newActivityIdByName.set(activityKey, activityId);
        activityAdditions.push({
          id: activityId, orgId: '', name: l1Name, template,
          activityType: deriveActivityType(template),
          modules: { ...config.defaultModules },
          location, eventNameMode: config.eventNameMode,
          isArchived: false, createdAt: now, updatedAt: now,
        });
      } else {
        activityId = activityByName.get(activityKey)?.id ?? newActivityIdByName.get(activityKey)!;
      }

      if (!l2Name) return;

      const l1Key = `${activityId}|${l2Name.toLowerCase()}`;
      let l1Id: string;
      if (!l1ByKey.has(l1Key) && !newL1IdByKey.has(l1Key)) {
        l1Id = generateId();
        newL1IdByKey.set(l1Key, l1Id);
        l1Additions.push({
          id: l1Id, orgId: '', activityId,
          name: l2Name, isArchived: false, createdAt: now, updatedAt: now,
        });
      } else {
        l1Id = l1ByKey.get(l1Key)?.id ?? newL1IdByKey.get(l1Key)!;
      }

      if (!l3Name) return;

      const l2Key = `${activityId}|${l1Id}|${l3Name.toLowerCase()}`;
      if (!l2ByKey.has(l2Key)) {
        l2ByKey.set(l2Key, {} as L2Subcategory);
        l2Additions.push({
          id: generateId(), orgId: '', activityId, l1Id,
          name: l3Name,
          isArchived: false, createdAt: now, updatedAt: now,
        });
      }
    });

    if (activityAdditions.length) setActivities(prev => [...prev, ...activityAdditions]);
    if (l1Additions.length) setL1Subs(prev => [...prev, ...l1Additions]);
    if (l2Additions.length) setL2Subs(prev => [...prev, ...l2Additions]);
  }, [activities, l1Subs, l2Subs, isSuperAdmin, setActivities, setL1Subs, setL2Subs]);

  // ─── L1 / L2 CRUD ───────────────────────────────────────────────────────

  const addL1 = useCallback((activityIdArg?: string) => {
    const activityId = activityIdArg ?? detailActivityId;
    if (!activityId || !isSuperAdmin) return;
    const value = (activityIdArg ? (l1InputsByActivity[activityId] ?? '') : l1Input).trim();
    if (!value) return;
    const exists = l1Subs.some(l => l.activityId === activityId && !l.isArchived && l.name.toLowerCase() === value.toLowerCase());
    if (exists) return;
    const now = Timestamp.now();
    const newL1: L1Subcategory = {
      id: generateId(), orgId: '', activityId,
      name: value, isArchived: false, createdAt: now, updatedAt: now,
    };
    setL1Subs(prev => [...prev, newL1]);
    if (activityIdArg) {
      setL1InputsByActivity(prev => ({ ...prev, [activityId]: '' }));
    } else {
      setL1Input('');
    }
  }, [l1Input, l1InputsByActivity, detailActivityId, isSuperAdmin, l1Subs, setL1Subs]);

  const addL2 = useCallback((l1Id: string | null, activityIdArg?: string) => {
    const activityId = activityIdArg ?? detailActivityId;
    if (!activityId || !isSuperAdmin) return;
    const input = (l1Id ? (l2InputsByL1[l1Id] ?? '') : l2Input).trim();
    if (!input) return;
    // Uniqueness scoped to (activityId, l1Id) per Q9 decisions
    const exists = l2Subs.some(l =>
      l.activityId === activityId && l.l1Id === l1Id && !l.isArchived &&
      l.name.toLowerCase() === input.toLowerCase()
    );
    if (exists) return;
    const now = Timestamp.now();
    const newL2: L2Subcategory = {
      id: generateId(), orgId: '', activityId,
      l1Id, name: input,
      isArchived: false, createdAt: now, updatedAt: now,
    };
    setL2Subs(prev => [...prev, newL2]);
    if (l1Id) {
      setL2InputsByL1(prev => ({ ...prev, [l1Id]: '' }));
    } else {
      setL2Input('');
    }
  }, [l2Input, l2InputsByL1, detailActivityId, isSuperAdmin, l2Subs, setL2Subs]);

  const archiveL1 = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    const today = new Date().toISOString().slice(0, 10);
    const tsNow = Timestamp.now();
    setL1Subs(prev => prev.map(l => l.id === id ? { ...l, isArchived: true, updatedAt: tsNow } : l));
    // Cascade: descendant L2s under this L1
    setL2Subs(prev => prev.map(l =>
      l.l1Id === id && !l.isArchived ? { ...l, isArchived: true, updatedAt: tsNow } : l
    ));
    // Cascade: future events tagged with this l1Id
    setEventsV2(prev => prev.map(e =>
      e.l1Id === id && e.status === 'SCHEDULED' && e.date >= today
        ? { ...e, status: 'ARCHIVED' as EventStatus, updatedAt: tsNow }
        : e
    ));
    // Cascade: L1-scope teaching assignments and any L2-scope assignments under this L1
    setTeachingAssignments(prev => prev.map(a => {
      if (a.isArchived) return a;
      const isL1Scope = a.scope === 'L1' && a.l1Id === id;
      const isL2Under = a.scope === 'L2' && a.l2Id != null && (
        // Resolve L2's l1Id from current L2 list
        false
      );
      if (isL1Scope) return { ...a, isArchived: true, updatedAt: tsNow };
      return a;
    }));
    // Separate pass for L2-under-L1 (needs l2Subs lookup)
    const l2sUnderL1 = l2Subs.filter(l => l.l1Id === id).map(l => l.id);
    if (l2sUnderL1.length > 0) {
      setTeachingAssignments(prev => prev.map(a =>
        !a.isArchived && a.scope === 'L2' && a.l2Id && l2sUnderL1.includes(a.l2Id)
          ? { ...a, isArchived: true, updatedAt: tsNow }
          : a
      ));
    }
  }, [isSuperAdmin, setL1Subs, setL2Subs, setEventsV2, setTeachingAssignments, l2Subs]);

  const restoreL1 = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    setL1Subs(prev => prev.map(l => l.id === id ? { ...l, isArchived: false, updatedAt: Timestamp.now() } : l));
  }, [isSuperAdmin, setL1Subs]);

  const archiveL2 = useCallback((id: string) => {
    if (!isSuperAdmin) return;
    const today = new Date().toISOString().slice(0, 10);
    const tsNow = Timestamp.now();
    setL2Subs(prev => prev.map(l => l.id === id ? { ...l, isArchived: true, updatedAt: tsNow } : l));
    setEventsV2(prev => prev.map(e =>
      e.l2Id === id && e.status === 'SCHEDULED' && e.date >= today
        ? { ...e, status: 'ARCHIVED' as EventStatus, updatedAt: tsNow }
        : e
    ));
    setEnrollmentsV2(prev => prev.map(e =>
      e.l2Id === id && e.status === 'ACTIVE'
        ? { ...e, status: 'ARCHIVED' as EnrollmentStatus, updatedAt: tsNow }
        : e
    ));
    // Cascade: L2-scope teaching assignments tied to this L2
    setTeachingAssignments(prev => prev.map(a =>
      !a.isArchived && a.scope === 'L2' && a.l2Id === id
        ? { ...a, isArchived: true, updatedAt: tsNow }
        : a
    ));
  }, [isSuperAdmin, setL2Subs, setEventsV2, setEnrollmentsV2, setTeachingAssignments]);

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
    const activeL1s = activityL1s.filter(l => !l.isArchived);
    const archivedL1s = activityL1s.filter(l => l.isArchived);
    const activeL2s = activityL2s.filter(l => !l.isArchived);
    const archivedL2s = activityL2s.filter(l => l.isArchived);
    const isEnsemble = detailActivity.template === 'ENSEMBLE';

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
              {t(`activities.template_${detailActivity.template?.toLowerCase()}`)}
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

            {/* Tree view: L1 (Categories) with nested L2 (Subcategories) — for templates with l1Required */}
            {Config.l1Required && (
              <div>
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
                  {t('activities.l1_subcategories')}
                  <span className="text-xs text-red-400">*</span>
                </h3>
                {/* Add L1 input */}
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
                {/* L1 rows with nested L2 children */}
                <div className="space-y-3">
                  {activeL1s.map(l1 => {
                    const l1Children = activeL2s.filter(l2 => l2.l1Id === l1.id);
                    const archivedL1Children = archivedL2s.filter(l2 => l2.l1Id === l1.id);
                    const l2InputForL1 = l2InputsByL1[l1.id] ?? '';
                    return (
                      <div key={l1.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        {/* L1 header */}
                        <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-800 px-3 py-2 group">
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{l1.name}</span>
                          {isSuperAdmin && (
                            <button onClick={() => archiveL1(l1.id)} className="text-slate-400 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Archive size={14} />
                            </button>
                          )}
                        </div>
                        {/* L2 children indented under this L1 */}
                        <div className="px-3 py-2 space-y-1.5 bg-white dark:bg-slate-900">
                          {l1Children.map(l2 => (
                            <div key={l2.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-700 ml-3 group">
                              <span className="text-sm text-slate-600 dark:text-slate-400">{l2.name}</span>
                              {isSuperAdmin && (
                                <button onClick={() => archiveL2(l2.id)} className="text-slate-400 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Archive size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                          {l1Children.length === 0 && (
                            <p className="text-xs text-slate-400 italic ml-3 py-0.5">{t('activities.no_l2')}</p>
                          )}
                          {showArchived && archivedL1Children.length > 0 && (
                            <div className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-700 ml-3">
                              {archivedL1Children.map(l2 => (
                                <div key={l2.id} className="flex justify-between items-center bg-amber-50 dark:bg-amber-900/10 px-3 py-1.5 rounded-lg border border-amber-100 dark:border-amber-900/30 mb-1 group opacity-60">
                                  <span className="text-sm text-amber-700 dark:text-amber-400 line-through">{l2.name}</span>
                                  {isSuperAdmin && (
                                    <button onClick={() => restoreL2(l2.id)} className="text-amber-400 hover:text-green-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <RotateCcw size={14} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Per-Category "Add Subcategory" input */}
                          {isSuperAdmin && (
                            <div className="flex gap-2 mt-1.5 ml-3">
                              <input
                                type="text" value={l2InputForL1}
                                onChange={e => setL2InputsByL1(prev => ({ ...prev, [l1.id]: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addL2(l1.id))}
                                placeholder={t('activities.l2_placeholder')}
                                className="flex-1 border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              />
                              <button type="button" onClick={() => addL2(l1.id)} disabled={!l2InputForL1.trim()}
                                className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white disabled:opacity-50 shadow-cadenza-soft px-2.5 py-1.5 rounded-lg">
                                <Plus size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {activeL1s.length === 0 && <p className="text-sm text-slate-400 italic">{t('activities.no_l1')}</p>}
                  {/* Archived L1s */}
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

            {/* Flat L2 list for templates without L1 (ENSEMBLE, EXTERNAL) */}
            {!Config.l1Required && Config.l2Required && (
              <div>
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
                  {t('activities.l2_subcategories')}
                  <span className="text-xs text-red-400">*</span>
                </h3>
                {isSuperAdmin && (
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text" value={l2Input} onChange={e => setL2Input(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addL2(null))}
                      placeholder={t('activities.l2_placeholder')}
                      className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button type="button" onClick={() => addL2(null)} disabled={!l2Input.trim()}
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

  const getActivityConfig = (activity: ActivityV2) => {
    return TEMPLATE_CONFIGS[activity.template] || TEMPLATE_CONFIGS.DISCIPLINE;
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
          <button
            onClick={() => toggleSort('name')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title={t('sort.alphabetical') || 'Sort A–Z'}
          >
            {sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            <span className="text-xs font-medium">{sortDirection === 'asc' ? 'A→Z' : 'Z→A'}</span>
          </button>
          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('tree')} title={t('activities.view_tree')}
              className={`p-2 transition-colors ${viewMode === 'tree' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
              <Layers size={16} />
            </button>
            <button onClick={() => setViewMode('grid')} className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
              <List size={16} />
            </button>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${selectMode
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <CheckSquare size={16} />
              {selectMode ? t('activities.cancel_selection') : t('activities.select')}
            </button>
          )}
          {isSuperAdmin && (
            <ImportExportDropdown
              entityType="ACTIVITY"
              label={settings.language === 'he-IL' ? 'פעילויות' : 'Activities'}
              existingData={csvExistingData}
              existingDuplicateKeys={csvDuplicateKeys}
              dependencyMaps={{ activityByName: {}, l2ByName: {}, staffByEmail: {}, studentByName: {} }}
              settings={settings}
              canWrite={true}
              onImportComplete={handleActivityImportComplete}
            />
          )}
          {isSuperAdmin && (
            <ImportExportDropdown
              entityType="ACTIVITY_HIERARCHY"
              label={settings.language === 'he-IL' ? 'היררכיה' : 'Hierarchy'}
              existingData={hierarchyCsvData}
              existingDuplicateKeys={hierarchyDuplicateKeys}
              dependencyMaps={{ activityByName: {}, l2ByName: {}, staffByEmail: {}, studentByName: {} }}
              settings={settings}
              canWrite={true}
              onImportComplete={handleActivityHierarchyImportComplete}
            />
          )}
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

      {/* Bulk Action Bar (selection mode) */}
      {selectMode && (
        <div className="sticky top-0 z-20 mb-4 flex items-center justify-between gap-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              {t('activities.selected_count').replace('{n}', String(selectedIds.size))}
            </span>
            <button
              onClick={() => {
                const allIds = new Set(visibleActivities.map(a => a.id));
                setSelectedIds(prev => prev.size === allIds.size ? new Set() : allIds);
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('activities.select_all')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {showArchived ? (
              <>
                <button
                  onClick={handleBulkRestore}
                  disabled={selectedIds.size === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <RotateCcw size={14} /> {t('activities.bulk_restore')}
                </button>
                <button
                  onClick={handleBulkPermanentDelete}
                  disabled={selectedIds.size === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Trash2 size={14} /> {t('activities.bulk_permanent_delete')}
                </button>
              </>
            ) : (
              <button
                onClick={handleBulkArchive}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Archive size={14} /> {t('activities.bulk_archive')}
              </button>
            )}
            <button
              onClick={exitSelectMode}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
              title={t('activities.cancel_selection')}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Activity Tree / Grid / List */}
      {visibleActivities.length === 0 ? (
        <div className="py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          {t('activities.empty_state')}
        </div>
      ) : viewMode === 'tree' ? (
        <ActivityTreeView
          activities={visibleActivities}
          l1Subs={l1Subs}
          l2Subs={l2Subs}
          showArchived={showArchived}
          isSuperAdmin={isSuperAdmin}
          treeExpanded={treeExpanded}
          onToggleExpand={(id) => setTreeExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          l1InputsByActivity={l1InputsByActivity}
          setL1InputForActivity={(activityId, value) =>
            setL1InputsByActivity(prev => ({ ...prev, [activityId]: value }))
          }
          l2InputsByL1={l2InputsByL1}
          setL2InputForL1={(l1Id, value) =>
            setL2InputsByL1(prev => ({ ...prev, [l1Id]: value }))
          }
          onAddL1={(activityId) => addL1(activityId)}
          onAddL2={(l1Id, activityId) => addL2(l1Id, activityId)}
          onArchiveL1={archiveL1}
          onRestoreL1={restoreL1}
          onArchiveL2={archiveL2}
          onRestoreL2={restoreL2}
          onArchiveActivity={initiateArchive}
          onRestoreActivity={handleRestore}
          onEditActivity={openEditModal}
          getActivityConfig={getActivityConfig}
          t={t}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleActivities.map(activity => {
            const config = getActivityConfig(activity);
            const Icon = config.icon;
            const l2Count = l2Subs.filter(l => l.activityId === activity.id && !l.isArchived).length;

            const isSelected = selectedIds.has(activity.id);
            return (
              <div
                key={activity.id}
                onClick={() => {
                  if (selectMode) toggleSelected(activity.id);
                  else { setDetailActivityId(activity.id); setDetailTab('hierarchy'); }
                }}
                className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm border p-6 flex flex-col hover:shadow-md transition-shadow cursor-pointer ${activity.isArchived ? 'opacity-60' : ''} ${selectMode && isSelected ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-slate-200 dark:border-slate-800'}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(activity.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    )}
                    <div className={`p-2 rounded-lg bg-${config.color}-100 dark:bg-${config.color}-900/50 text-${config.color}-600 dark:text-${config.color}-300`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 dark:text-white">{activity.name}</h3>
                      <span className={`text-xs font-semibold uppercase tracking-wider text-${config.color}-500 dark:text-${config.color}-400`}>
                        {t(`activities.template_${(activity.template || 'discipline').toLowerCase()}`)}
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
                {selectMode && (
                  <th className="px-4 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={visibleActivities.length > 0 && visibleActivities.every(a => selectedIds.has(a.id))}
                      onChange={() => {
                        const allIds = new Set(visibleActivities.map(a => a.id));
                        setSelectedIds(prev => prev.size === allIds.size ? new Set() : allIds);
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                )}
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
                const l2Count = l2Subs.filter(l => l.activityId === activity.id && !l.isArchived).length;
                const isSelected = selectedIds.has(activity.id);
                return (
                  <tr key={activity.id}
                    onClick={() => {
                      if (selectMode) toggleSelected(activity.id);
                      else { setDetailActivityId(activity.id); setDetailTab('hierarchy'); }
                    }}
                    className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer ${activity.isArchived ? 'opacity-60' : ''} ${selectMode && isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    {selectMode && (
                      <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(activity.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                    )}
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
                        {t(`activities.template_${(activity.template || 'discipline').toLowerCase()}`)}
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
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
              {archiveCascade.futureEventCount > 0
                ? t('activities.archive_cascade_message').replace('{name}', archiveCascade.name).replace('{eventCount}', String(archiveCascade.futureEventCount))
                : t('activities.archive_cascade_no_events').replace('{name}', archiveCascade.name)
              }
            </p>
            {(archiveCascade.l1Count + archiveCascade.l2Count + archiveCascade.assignmentCount) > 0 && (
              <ul className="text-xs text-slate-500 dark:text-slate-400 mb-6 space-y-1 ps-4 list-disc">
                {archiveCascade.l1Count > 0 && (
                  <li>{t('activities.cascade_l1_count').replace('{count}', String(archiveCascade.l1Count))}</li>
                )}
                {archiveCascade.l2Count > 0 && (
                  <li>{t('activities.cascade_l2_count').replace('{count}', String(archiveCascade.l2Count))}</li>
                )}
                {archiveCascade.assignmentCount > 0 && (
                  <li>{t('activities.cascade_assignment_count').replace('{count}', String(archiveCascade.assignmentCount))}</li>
                )}
              </ul>
            )}
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
        footerContent={
          <div className="flex justify-end space-x-3 rtl:space-x-reverse w-full">
            <button type="button" onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              {t('btn.cancel')}
            </button>
            <button type="button" onClick={(e) => handleSubmit(e as any)}
              className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg">
              {t('btn.save')}
            </button>
          </div>
        }
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


        </form>
      </Modal>
    </div>
  );
};
