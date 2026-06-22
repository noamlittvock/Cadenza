import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, GraduationCap, Menu, Plus,
  Trash2, UserPlus, Users, Layers, Target,
} from 'lucide-react';
import type { AppSettings } from '../types';
import type { StaffMemberV2 } from '../types/v2';
import type {
  StaffingAssignment, StaffingClass, StaffingPlan, StaffingStaff,
  StaffingSubjectRequirement, StaffingTeacherBalance, StaffingTeacherQuota,
} from '../types/staffing';
import { STAFFING_TRACKS, STAFFING_TRACK_LABELS } from '../types/staffing';
import {
  collectPlanSubjects, computeClassStatuses, computePlanSummary,
  computeShortages, computeTeacherBalances,
} from '../utils/staffingEngine';
import { generateId } from '../constants';

interface StaffingPlannerWorkspaceProps {
  plans: StaffingPlan[];
  setPlans: (data: StaffingPlan[] | ((prev: StaffingPlan[]) => StaffingPlan[])) => Promise<void>;
  quotas: StaffingTeacherQuota[];
  setQuotas: (data: StaffingTeacherQuota[] | ((prev: StaffingTeacherQuota[]) => StaffingTeacherQuota[])) => Promise<void>;
  classes: StaffingClass[];
  setClasses: (data: StaffingClass[] | ((prev: StaffingClass[]) => StaffingClass[])) => Promise<void>;
  assignments: StaffingAssignment[];
  setAssignments: (data: StaffingAssignment[] | ((prev: StaffingAssignment[]) => StaffingAssignment[])) => Promise<void>;
  staff: StaffMemberV2[];
  settings: AppSettings;
  orgId: string | null;
  onMobileMenuOpen: () => void;
}

type Tab = 'TEACHERS' | 'CLASSES' | 'RECRUITMENT';

const trackLabel = (track: string) => STAFFING_TRACK_LABELS[track] || track;

/** A balance bar that turns green when settled, red when overdrawn — the bank-account metaphor. */
const BalanceBar: React.FC<{ assigned: number; required: number; over?: boolean }> = ({ assigned, required, over }) => {
  const pct = required > 0 ? Math.min(100, (assigned / required) * 100) : 0;
  const color = over ? 'bg-red-500' : pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500';
  return (
    <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${over ? 100 : pct}%` }} />
    </div>
  );
};

export const StaffingPlannerWorkspace: React.FC<StaffingPlannerWorkspaceProps> = ({
  plans, setPlans, quotas, setQuotas, classes, setClasses, assignments, setAssignments,
  staff, settings, orgId, onMobileMenuOpen,
}) => {
  const activeStaff = useMemo<StaffMemberV2[]>(() => staff.filter(member => !member.isArchived), [staff]);
  const staffOptions = useMemo<StaffingStaff[]>(
    () => activeStaff.map(member => ({ id: member.id, fullName: member.fullName })), [activeStaff],
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(plans[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>('TEACHERS');
  const [planName, setPlanName] = useState('');

  const plan = plans.find(p => p.id === selectedPlanId) ?? plans[0] ?? null;
  const planId = plan?.id ?? null;

  const planQuotas = useMemo(() => quotas.filter(q => q.planId === planId), [quotas, planId]);
  const planClasses = useMemo(() => classes.filter(c => c.planId === planId), [classes, planId]);
  const planAssignments = useMemo(() => assignments.filter(a => a.planId === planId), [assignments, planId]);

  const balances = useMemo(
    () => computeTeacherBalances(planQuotas, planAssignments, planClasses, staffOptions),
    [planQuotas, planAssignments, planClasses, staffOptions],
  );
  const balanceByStaff = useMemo(
    () => new Map(balances.map(b => [b.staffMemberId, b])), [balances],
  );
  const classStatuses = useMemo(() => computeClassStatuses(planClasses, planAssignments), [planClasses, planAssignments]);
  const shortages = useMemo(() => computeShortages(planClasses, planAssignments), [planClasses, planAssignments]);
  const summary = useMemo(
    () => planId ? computePlanSummary(planId, planQuotas, planClasses, planAssignments, staffOptions) : null,
    [planId, planQuotas, planClasses, planAssignments, staffOptions],
  );
  const knownSubjects = useMemo(() => collectPlanSubjects(planClasses), [planClasses]);

  // ─── Plan CRUD ────────────────────────────────────────────────────────────
  const createPlan = () => {
    const now = new Date().toISOString();
    const year = new Date().getFullYear();
    const newPlan: StaffingPlan = {
      id: generateId(), orgId: orgId || undefined,
      name: planName.trim() || `Staffing ${plans.length + 1}`,
      schoolYear: `${year}-${year + 1}`,
      status: 'DRAFT', createdAt: now, updatedAt: now,
    };
    void setPlans(prev => [newPlan, ...prev]);
    setSelectedPlanId(newPlan.id);
    setPlanName('');
  };
  const deletePlan = (target: StaffingPlan) => {
    if (!window.confirm(`Delete "${target.name}"? Its teachers, classes, and assignments will be removed.`)) return;
    void setPlans(prev => prev.filter(p => p.id !== target.id));
    void setQuotas(prev => prev.filter(q => q.planId !== target.id));
    void setClasses(prev => prev.filter(c => c.planId !== target.id));
    void setAssignments(prev => prev.filter(a => a.planId !== target.id));
    setSelectedPlanId(null);
  };

  // ─── Quota CRUD ───────────────────────────────────────────────────────────
  const addQuota = (staffMemberId: string, totalRequiredHours: number) => {
    if (!planId || !staffMemberId) return;
    const now = new Date().toISOString();
    void setQuotas(prev => [...prev, {
      id: generateId(), orgId: orgId || undefined, planId, staffMemberId,
      totalRequiredHours, trackRequirements: [], createdAt: now, updatedAt: now,
    }]);
  };
  const updateQuota = (id: string, patch: Partial<StaffingTeacherQuota>) => {
    void setQuotas(prev => prev.map(q => q.id === id ? { ...q, ...patch, updatedAt: new Date().toISOString() } : q));
  };
  const removeQuota = (quota: StaffingTeacherQuota) => {
    void setQuotas(prev => prev.filter(q => q.id !== quota.id));
    void setAssignments(prev => prev.filter(a => !(a.planId === quota.planId && a.staffMemberId === quota.staffMemberId)));
  };
  const setTrackMin = (quota: StaffingTeacherQuota, track: string, minHours: number) => {
    const others = quota.trackRequirements.filter(t => t.track !== track);
    const next = minHours > 0 ? [...others, { track, minHours }] : others;
    updateQuota(quota.id, { trackRequirements: next });
  };

  // ─── Class & requirement CRUD ─────────────────────────────────────────────
  const addClass = (name: string, gradeLevel: string) => {
    if (!planId || !name.trim()) return;
    const now = new Date().toISOString();
    void setClasses(prev => [...prev, {
      id: generateId(), orgId: orgId || undefined, planId, name: name.trim(),
      gradeLevel: gradeLevel.trim(), requirements: [], createdAt: now, updatedAt: now,
    }]);
  };
  const removeClass = (cls: StaffingClass) => {
    void setClasses(prev => prev.filter(c => c.id !== cls.id));
    void setAssignments(prev => prev.filter(a => a.classId !== cls.id));
  };
  const patchClass = (id: string, patch: Partial<StaffingClass>) => {
    void setClasses(prev => prev.map(c => c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c));
  };
  const addRequirement = (cls: StaffingClass, req: Omit<StaffingSubjectRequirement, 'id'>) => {
    if (!req.subject.trim()) return;
    const requirement: StaffingSubjectRequirement = { ...req, subject: req.subject.trim(), id: generateId() };
    patchClass(cls.id, { requirements: [...cls.requirements, requirement] });
  };
  const removeRequirement = (cls: StaffingClass, requirementId: string) => {
    patchClass(cls.id, { requirements: cls.requirements.filter(r => r.id !== requirementId) });
    void setAssignments(prev => prev.filter(a => a.requirementId !== requirementId));
  };

  // ─── Assignment CRUD (the bank-account deductions) ────────────────────────
  const assign = (cls: StaffingClass, requirementId: string, staffMemberId: string, hours: number) => {
    if (!planId || !staffMemberId || hours <= 0) return;
    const now = new Date().toISOString();
    void setAssignments(prev => [...prev, {
      id: generateId(), orgId: orgId || undefined, planId, classId: cls.id,
      requirementId, staffMemberId, hours, createdAt: now, updatedAt: now,
    }]);
  };
  const unassign = (id: string) => void setAssignments(prev => prev.filter(a => a.id !== id));

  if (plans.length === 0 || !plan) {
    return (
      <PlannerShell onMobileMenuOpen={onMobileMenuOpen} plans={plans} selectedPlanId={selectedPlanId}
        setSelectedPlanId={setSelectedPlanId} planName={planName} setPlanName={setPlanName} createPlan={createPlan}>
        <div className="p-10 max-w-xl mx-auto text-center">
          <GraduationCap size={40} className="mx-auto text-indigo-500 mb-4" />
          <h3 className="text-xl font-bold mb-2">Plan next year's teaching staff</h3>
          <p className="text-slate-500">
            Give each teacher their required hours, map every class's subjects, then assign teachers and
            watch each balance fall to zero. Anything still unstaffed shows up in Recruitment.
          </p>
        </div>
      </PlannerShell>
    );
  }

  return (
    <PlannerShell onMobileMenuOpen={onMobileMenuOpen} plans={plans} selectedPlanId={selectedPlanId}
      setSelectedPlanId={setSelectedPlanId} planName={planName} setPlanName={setPlanName} createPlan={createPlan}>
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <input
              value={plan.name}
              onChange={e => void setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, name: e.target.value || 'Untitled plan' } : p))}
              className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none"
            />
            <span className="text-xs text-slate-500">{plan.schoolYear}</span>
          </div>
          <button onClick={() => deletePlan(plan)} className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 text-sm flex items-center gap-2">
            <Trash2 size={16} /> Delete plan
          </button>
        </div>

        {/* The one thing to do next — lead with the task, not the dashboard */}
        {summary && (() => {
          const gapClasses = new Set(shortages.map(s => s.className)).size;
          if (summary.totalMissingHours > 0) {
            return (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Target size={22} className="text-amber-600 shrink-0" />
                  <p className="text-sm sm:text-base font-semibold text-amber-900 dark:text-amber-100">
                    You have {summary.totalMissingHours} unstaffed hour{summary.totalMissingHours === 1 ? '' : 's'} across {gapClasses} class{gapClasses === 1 ? '' : 'es'}.
                  </p>
                </div>
                <button onClick={() => setTab('RECRUITMENT')} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 shrink-0">
                  See the gaps <ChevronRight size={16} />
                </button>
              </div>
            );
          }
          const teachersLeft = summary.teacherCount - summary.teachersComplete;
          if (summary.teacherCount > 0 && teachersLeft > 0) {
            return (
              <div className="rounded-xl border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Users size={22} className="text-indigo-600 shrink-0" />
                  <p className="text-sm sm:text-base font-semibold text-indigo-900 dark:text-indigo-100">
                    Every class is staffed. {teachersLeft} teacher{teachersLeft === 1 ? '' : 's'} still {teachersLeft === 1 ? 'has' : 'have'} hours left to assign.
                  </p>
                </div>
                <button onClick={() => setTab('TEACHERS')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 shrink-0">
                  Review teachers <ChevronRight size={16} />
                </button>
              </div>
            );
          }
          if (summary.classCount > 0 || summary.teacherCount > 0) {
            return (
              <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex items-center gap-3">
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                <p className="text-sm sm:text-base font-semibold text-emerald-800 dark:text-emerald-200">Every class is fully staffed and every teacher is settled — nothing to do here.</p>
              </div>
            );
          }
          return null;
        })()}

        {/* Summary strip — every number drills into the rows that produced it */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryStat label="Teachers settled" value={`${summary.teachersComplete}/${summary.teacherCount}`} done={summary.teacherCount > 0 && summary.teachersComplete === summary.teacherCount} explain="See teachers" onClick={() => setTab('TEACHERS')} />
            <SummaryStat label="Classes staffed" value={`${summary.classesComplete}/${summary.classCount}`} done={summary.classCount > 0 && summary.classesComplete === summary.classCount} explain="See classes" onClick={() => setTab('CLASSES')} />
            <SummaryStat label="Hours assigned" value={`${summary.totalAssignedHours}/${summary.totalRequiredHours}`} explain="See teachers" onClick={() => setTab('TEACHERS')} />
            <SummaryStat label="Hours to hire" value={`${summary.totalMissingHours}`} warn={summary.totalMissingHours > 0} explain={summary.totalMissingHours > 0 ? 'See the gaps' : undefined} onClick={() => setTab('RECRUITMENT')} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-slate-200 dark:border-slate-800 p-1 w-fit">
          {([['TEACHERS', 'Teachers', Users], ['CLASSES', 'Classes', Layers], ['RECRUITMENT', 'Recruitment', Target]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 ${tab === key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              <Icon size={15} /> {label}
              {key === 'RECRUITMENT' && shortages.length > 0 && (
                <span className="ms-1 rounded-full bg-amber-500 text-slate-900 text-[10px] font-bold px-1.5">{shortages.length}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'TEACHERS' && (
          <TeachersTab balances={balances} quotas={planQuotas} staff={staffOptions} assignedStaffIds={new Set(planQuotas.map(q => q.staffMemberId))}
            addQuota={addQuota} updateQuota={updateQuota} removeQuota={removeQuota} setTrackMin={setTrackMin} />
        )}
        {tab === 'CLASSES' && (
          <ClassesTab classes={planClasses} statuses={classStatuses} assignments={planAssignments} staff={staffOptions}
            balanceByStaff={balanceByStaff} knownSubjects={knownSubjects} addClass={addClass} removeClass={removeClass}
            patchClass={patchClass} addRequirement={addRequirement} removeRequirement={removeRequirement} assign={assign} unassign={unassign} />
        )}
        {tab === 'RECRUITMENT' && <RecruitmentTab shortages={shortages} />}
      </div>
    </PlannerShell>
  );
};

// ─── Shell with the plan list rail ──────────────────────────────────────────
const PlannerShell: React.FC<{
  children: React.ReactNode; onMobileMenuOpen: () => void; plans: StaffingPlan[];
  selectedPlanId: string | null; setSelectedPlanId: (id: string) => void;
  planName: string; setPlanName: (v: string) => void; createPlan: () => void;
}> = ({ children, onMobileMenuOpen, plans, selectedPlanId, setSelectedPlanId, planName, setPlanName, createPlan }) => (
  <div className="flex h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <aside className="w-[300px] shrink-0 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
      <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
        <button className="lg:hidden p-2 -ms-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onMobileMenuOpen}><Menu size={20} /></button>
        <GraduationCap size={19} className="text-indigo-600" />
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide">Staffing Plans</h2>
          <p className="text-[11px] text-slate-500">Plan teaching load for the year</p>
        </div>
      </div>
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex gap-2">
        <input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="New plan name"
          onKeyDown={e => { if (e.key === 'Enter') createPlan(); }}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
        <button onClick={createPlan} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg" title="Create plan"><Plus size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {plans.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-5 text-sm text-slate-500">Create a plan to begin.</div>}
        {plans.filter(p => p.status !== 'ARCHIVED').map(p => (
          <button key={p.id} onClick={() => setSelectedPlanId(p.id)}
            className={`w-full text-start rounded-lg border p-3 transition-colors ${selectedPlanId === p.id ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/30' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'}`}>
            <div className="font-semibold truncate">{p.name}</div>
            <div className="text-xs text-slate-500">{p.schoolYear}</div>
          </button>
        ))}
      </div>
    </aside>
    <main className="flex-1 overflow-y-auto custom-scrollbar">{children}</main>
  </div>
);

const SummaryStat: React.FC<{ label: string; value: string; done?: boolean; warn?: boolean; explain?: string; onClick?: () => void }> = ({ label, value, done, warn, explain, onClick }) => {
  const tone = done ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : warn ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
  const content = (
    <>
      <div className="text-xl font-bold flex items-center gap-1.5">{done && <CheckCircle2 size={18} className="text-emerald-600" />}{value}</div>
      <div className="text-xs text-slate-500 flex items-center justify-between gap-1">
        <span>{label}</span>
        {explain && <span className="text-indigo-600 dark:text-indigo-300 font-semibold flex items-center gap-0.5">{explain}<ChevronRight size={12} /></span>}
      </div>
    </>
  );
  if (!onClick) return <div className={`rounded-lg border p-3 ${tone}`}>{content}</div>;
  return (
    <button type="button" onClick={onClick} className={`group text-start rounded-lg border p-3 transition-shadow hover:shadow-cadenza-soft hover:border-indigo-300 dark:hover:border-indigo-700 ${tone}`}>
      {content}
    </button>
  );
};

// ─── Teachers tab ───────────────────────────────────────────────────────────
const TeachersTab: React.FC<{
  balances: StaffingTeacherBalance[]; quotas: StaffingTeacherQuota[]; staff: StaffingStaff[];
  assignedStaffIds: Set<string>;
  addQuota: (staffMemberId: string, total: number) => void;
  updateQuota: (id: string, patch: Partial<StaffingTeacherQuota>) => void;
  removeQuota: (q: StaffingTeacherQuota) => void;
  setTrackMin: (q: StaffingTeacherQuota, track: string, min: number) => void;
}> = ({ balances, quotas, staff, assignedStaffIds, addQuota, updateQuota, removeQuota, setTrackMin }) => {
  const [newStaffId, setNewStaffId] = useState('');
  const [newHours, setNewHours] = useState(22);
  const [showHours, setShowHours] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const available = staff.filter(s => !assignedStaffIds.has(s.id));
  const quotaById = new Map<string, StaffingTeacherQuota>(quotas.map(q => [q.id, q]));

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Teachers come from your staff list. Pick one and add them — you can fine-tune their hours target any time.</p>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-slate-500 mb-1">Add teacher</span>
          <select value={newStaffId} onChange={e => setNewStaffId(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm min-w-[200px]">
            <option value="">Choose a teacher…</option>
            {available.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
        </label>
        <button onClick={() => { if (newStaffId) { addQuota(newStaffId, newHours); setNewStaffId(''); } }}
          disabled={!newStaffId} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5">
          <UserPlus size={16} /> Add
        </button>
        {showHours ? (
          <label className="text-sm" title="A planning target for this plan — not a payroll contract. You can change it later.">
            <span className="block text-xs font-semibold text-slate-500 mb-1">Hours target</span>
            <input type="number" min={0} value={newHours} onChange={e => setNewHours(Number(e.target.value))} className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
          </label>
        ) : (
          <button type="button" onClick={() => setShowHours(true)} className="text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-300 pb-2.5">
            Target: {newHours}h · Adjust
          </button>
        )}
        {available.length === 0 && staff.length > 0 && <span className="text-xs text-slate-500">All staff added.</span>}
      </div>

      {balances.length === 0 && <div className="text-sm text-slate-500 py-8 text-center">No teachers yet. Add one above to start tracking their hour balance.</div>}

      <div className="space-y-2">
        {balances.map(balance => {
          const quota = quotaById.get(balance.quotaId);
          if (!quota) return null;
          const open = expanded === balance.quotaId;
          return (
            <div key={balance.quotaId} className={`rounded-lg border ${balance.complete ? 'border-emerald-300 dark:border-emerald-800' : balance.overAssigned ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-800'} bg-white dark:bg-slate-900`}>
              <div className="p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold truncate ${balance.complete ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{balance.staffName}</span>
                    {balance.complete && <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />}
                    {balance.overAssigned && <AlertTriangle size={15} className="text-red-600 shrink-0" />}
                  </div>
                  <div className="mt-1.5"><BalanceBar assigned={balance.assignedHours} required={balance.totalRequiredHours} over={balance.overAssigned} /></div>
                </div>
                <div className="text-end shrink-0">
                  <div className={`text-lg font-bold ${balance.overAssigned ? 'text-red-600' : balance.complete ? 'text-emerald-600' : ''}`}>
                    {balance.remainingHours > 0 ? `${balance.remainingHours}h left` : balance.remainingHours < 0 ? `${Math.abs(balance.remainingHours)}h over` : 'Settled'}
                  </div>
                  <div className="text-xs text-slate-500">{balance.assignedHours} of {balance.totalRequiredHours}h</div>
                </div>
                <button onClick={() => setExpanded(open ? null : balance.quotaId)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
              </div>
              {open && (
                <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-3 bg-slate-50/60 dark:bg-slate-950/40">
                  <label className="text-sm flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Total required hours</span>
                    <input type="number" min={0} value={quota.totalRequiredHours} onChange={e => updateQuota(quota.id, { totalRequiredHours: Number(e.target.value) })} className="w-24 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1" />
                  </label>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-1.5">Track minimums (optional)</div>
                    <div className="flex flex-wrap gap-3">
                      {STAFFING_TRACKS.map(track => {
                        const tb = balance.byTrack.find(t => t.track === track);
                        const min = quota.trackRequirements.find(t => t.track === track)?.minHours ?? 0;
                        return (
                          <label key={track} className="text-sm flex items-center gap-1.5">
                            <span className="text-slate-600 dark:text-slate-300">{trackLabel(track)} ≥</span>
                            <input type="number" min={0} value={min} onChange={e => setTrackMin(quota, track, Number(e.target.value))} className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1" />
                            {tb && min > 0 && <span className={`text-xs ${tb.met ? 'text-emerald-600' : 'text-amber-600'}`}>{tb.assignedHours}/{min}h</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <button onClick={() => removeQuota(quota)} className="text-sm text-red-600 hover:underline flex items-center gap-1"><Trash2 size={14} /> Remove teacher from plan</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Classes tab ────────────────────────────────────────────────────────────
const ClassesTab: React.FC<{
  classes: StaffingClass[]; statuses: ReturnType<typeof computeClassStatuses>; assignments: StaffingAssignment[];
  staff: StaffingStaff[]; balanceByStaff: Map<string, StaffingTeacherBalance>; knownSubjects: string[];
  addClass: (name: string, grade: string) => void; removeClass: (c: StaffingClass) => void;
  patchClass: (id: string, patch: Partial<StaffingClass>) => void;
  addRequirement: (c: StaffingClass, req: Omit<StaffingSubjectRequirement, 'id'>) => void;
  removeRequirement: (c: StaffingClass, reqId: string) => void;
  assign: (c: StaffingClass, reqId: string, staffId: string, hours: number) => void;
  unassign: (id: string) => void;
}> = ({ classes, statuses, assignments, staff, balanceByStaff, knownSubjects, addClass, removeClass, addRequirement, removeRequirement, assign, unassign }) => {
  const [newClassName, setNewClassName] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const statusById = new Map(statuses.map(s => [s.classId, s]));
  const nameById = new Map(staff.map(s => [s.id, s.fullName]));

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 font-semibold">Added here</span>
        Classes and the subjects they need are entered for this plan — they aren't linked to the live calendar yet.
      </p>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-slate-500 mb-1">Class name</span>
          <input value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="e.g. 11A" className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-slate-500 mb-1">Grade level</span>
          <input value={newGrade} onChange={e => setNewGrade(e.target.value)} placeholder="e.g. 11" className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
        </label>
        <button onClick={() => { if (newClassName.trim()) { addClass(newClassName, newGrade); setNewClassName(''); setNewGrade(''); } }}
          disabled={!newClassName.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5"><Plus size={16} /> Add class</button>
      </div>

      {classes.length === 0 && <div className="text-sm text-slate-500 py-8 text-center">No classes yet. Add a class, then list the subjects it needs.</div>}

      <div className="space-y-3">
        {classes.map(cls => {
          const status = statusById.get(cls.id);
          return (
            <ClassCard key={cls.id} cls={cls} status={status} assignments={assignments.filter(a => a.classId === cls.id)}
              staff={staff} nameById={nameById} balanceByStaff={balanceByStaff} knownSubjects={knownSubjects}
              removeClass={removeClass} addRequirement={addRequirement} removeRequirement={removeRequirement} assign={assign} unassign={unassign} />
          );
        })}
      </div>
    </div>
  );
};

const ClassCard: React.FC<{
  cls: StaffingClass; status?: ReturnType<typeof computeClassStatuses>[number]; assignments: StaffingAssignment[];
  staff: StaffingStaff[]; nameById: Map<string, string>; balanceByStaff: Map<string, StaffingTeacherBalance>; knownSubjects: string[];
  removeClass: (c: StaffingClass) => void;
  addRequirement: (c: StaffingClass, req: Omit<StaffingSubjectRequirement, 'id'>) => void;
  removeRequirement: (c: StaffingClass, reqId: string) => void;
  assign: (c: StaffingClass, reqId: string, staffId: string, hours: number) => void;
  unassign: (id: string) => void;
}> = ({ cls, status, assignments, staff, nameById, balanceByStaff, knownSubjects, removeClass, addRequirement, removeRequirement, assign, unassign }) => {
  const [subject, setSubject] = useState('');
  const [hours, setHours] = useState(2);
  const [track, setTrack] = useState<string>(STAFFING_TRACKS[0]);

  return (
    <div className={`rounded-lg border ${status?.complete ? 'border-emerald-300 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-800'} bg-white dark:bg-slate-900`}>
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-bold truncate ${status?.complete ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{cls.name}</span>
          {cls.gradeLevel && <span className="text-xs rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">Grade {cls.gradeLevel}</span>}
          {status?.complete ? <CheckCircle2 size={16} className="text-emerald-600" /> : status && status.missingHours > 0 && <span className="text-xs text-amber-600 font-semibold">{status.missingHours}h unstaffed</span>}
        </div>
        <button onClick={() => removeClass(cls)} className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={15} /></button>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {(status?.requirements || []).map(req => {
          const reqAssignments = assignments.filter(a => a.requirementId === req.requirementId);
          return (
            <div key={req.requirementId} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{req.subject}</span>
                  <span className="text-xs text-slate-400">{trackLabel(req.track)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-semibold ${req.complete ? 'text-emerald-600' : req.overStaffed ? 'text-red-600' : 'text-amber-600'}`}>
                    {req.assignedHours}/{req.requiredWeeklyHours}h
                  </span>
                  <button onClick={() => removeRequirement(cls, req.requirementId)} className="p-1 rounded text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
              </div>
              {/* Assigned teachers (splitting shows as multiple chips) */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {reqAssignments.map(a => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 text-xs">
                    {nameById.get(a.staffMemberId) || 'Unknown'} · {a.hours}h
                    <button onClick={() => unassign(a.id)} className="hover:text-red-600">×</button>
                  </span>
                ))}
                {reqAssignments.length === 0 && <span className="text-xs text-slate-400">Unassigned</span>}
              </div>
              {/* Assign control */}
              {req.missingHours > 0 && (
                <AssignControl req={req} staff={staff} balanceByStaff={balanceByStaff} onAssign={(staffId, h) => assign(cls, req.requirementId, staffId, h)} />
              )}
            </div>
          );
        })}
      </div>

      {/* Add requirement */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Subject</span>
          <input list={`subjects-${cls.id}`} value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Physics" className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm" />
          <datalist id={`subjects-${cls.id}`}>{knownSubjects.map(s => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="text-sm">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Weekly hours</span>
          <input type="number" min={1} value={hours} onChange={e => setHours(Number(e.target.value))} className="w-20 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Track</span>
          <select value={track} onChange={e => setTrack(e.target.value)} className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm">
            {STAFFING_TRACKS.map(t => <option key={t} value={t}>{trackLabel(t)}</option>)}
          </select>
        </label>
        <button onClick={() => { if (subject.trim() && hours > 0) { addRequirement(cls, { subject, requiredWeeklyHours: hours, track }); setSubject(''); setHours(2); } }}
          disabled={!subject.trim()} className="border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-40 px-2.5 py-1.5 rounded text-sm font-semibold flex items-center gap-1"><Plus size={14} /> Add subject</button>
      </div>
    </div>
  );
};

const AssignControl: React.FC<{
  req: ReturnType<typeof computeClassStatuses>[number]['requirements'][number];
  staff: StaffingStaff[]; balanceByStaff: Map<string, StaffingTeacherBalance>;
  onAssign: (staffId: string, hours: number) => void;
}> = ({ req, staff, balanceByStaff, onAssign }) => {
  const [staffId, setStaffId] = useState('');
  const [hours, setHours] = useState(req.missingHours);
  const balance = staffId ? balanceByStaff.get(staffId) : undefined;
  const willOverdraw = balance ? hours > balance.remainingHours : false;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select value={staffId} onChange={e => { setStaffId(e.target.value); }} className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-sm">
        <option value="">Assign teacher…</option>
        {staff.map(s => {
          const b = balanceByStaff.get(s.id);
          return <option key={s.id} value={s.id}>{s.fullName}{b ? ` (${b.remainingHours}h left)` : ' (no quota)'}</option>;
        })}
      </select>
      <input type="number" min={0.5} step={0.5} max={req.missingHours} value={hours} onChange={e => setHours(Number(e.target.value))} className="w-20 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-sm" />
      <button onClick={() => { if (staffId && hours > 0) { onAssign(staffId, Math.min(hours, req.missingHours)); setStaffId(''); setHours(req.missingHours); } }}
        disabled={!staffId || hours <= 0} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-2.5 py-1 rounded text-sm font-semibold">Assign</button>
      {willOverdraw && <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle size={12} /> Over this teacher's remaining hours — allowed, but they'll be overdrawn.</span>}
    </div>
  );
};

// ─── Recruitment tab ────────────────────────────────────────────────────────
const RecruitmentTab: React.FC<{ shortages: ReturnType<typeof computeShortages> }> = ({ shortages }) => {
  const totalMissing = shortages.reduce((sum, s) => sum + s.missingHours, 0);
  if (shortages.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-8 text-center">
        <CheckCircle2 size={36} className="mx-auto text-emerald-600 mb-3" />
        <h3 className="font-bold text-emerald-800 dark:text-emerald-200">Fully staffed</h3>
        <p className="text-sm text-emerald-700 dark:text-emerald-300">Every subject in every class has its required hours assigned.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
        <Target size={16} /> <span className="font-semibold">{totalMissing}h</span> still need hiring across <span className="font-semibold">{shortages.length}</span> positions.
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950 text-xs uppercase text-slate-500">
            <tr><th className="text-start px-4 py-2">Class</th><th className="text-start px-4 py-2">Grade</th><th className="text-start px-4 py-2">Subject</th><th className="text-start px-4 py-2">Track</th><th className="text-end px-4 py-2">Missing</th></tr>
          </thead>
          <tbody>
            {shortages.map(s => (
              <tr key={s.requirementId} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2 font-medium">{s.className}</td>
                <td className="px-4 py-2 text-slate-500">{s.gradeLevel || '—'}</td>
                <td className="px-4 py-2">{s.subject}</td>
                <td className="px-4 py-2 text-slate-500">{trackLabel(s.track)}</td>
                <td className="px-4 py-2 text-end font-bold text-amber-600">{s.missingHours}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
