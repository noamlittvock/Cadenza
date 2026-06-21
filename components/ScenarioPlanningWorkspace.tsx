import React, { useMemo, useState } from 'react';
import { Copy, FlaskConical, Menu, Plus, Trash2, Play, Save, GitCompareArrows, AlertTriangle, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import type { AdminInboxItem, CalendarEvent, Room, AppSettings } from '../types';
import type { ActivityV2, StaffMemberV2 } from '../types/v2';
import type { Scenario, ScenarioDateRange, ScenarioDelta, ScenarioExcludedRecordsBehavior, ScenarioLens, ScenarioStartMode } from '../types/scenario';
import { generateId } from '../constants';
import { buildScenarioPromoteRequest, computeScenarioDiff, computeScenarioDrift, computeScenarioFinanceImpact, computeScenarioSummary } from '../utils/scenarioEngine';

interface ScenarioPlanningWorkspaceProps {
  scenarios: Scenario[];
  setScenarios: (data: Scenario[] | ((prev: Scenario[]) => Scenario[])) => Promise<void>;
  scenarioDeltas: ScenarioDelta[];
  setScenarioDeltas: (data: ScenarioDelta[] | ((prev: ScenarioDelta[]) => ScenarioDelta[])) => Promise<void>;
  adminInboxItems: AdminInboxItem[];
  setAdminInboxItems: (data: AdminInboxItem[] | ((prev: AdminInboxItem[]) => AdminInboxItem[])) => Promise<void>;
  events: CalendarEvent[];
  rooms: Room[];
  activities: ActivityV2[];
  staff: StaffMemberV2[];
  settings: AppSettings;
  orgId: string | null;
  actorId: string | null;
  onLaunchSandbox: (scenarioId: string) => void;
  onMobileMenuOpen: () => void;
}

const todayInput = () => new Date().toISOString().slice(0, 10);
const addDaysInput = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const ymdLocal = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthRange = (monthOffset: number): ScenarioDateRange => {
  const now = new Date();
  return {
    start: ymdLocal(new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)),
    end: ymdLocal(new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0)),
  };
};
const DATE_PRESETS: Array<{ label: string; range: () => ScenarioDateRange }> = [
  { label: 'This month', range: () => monthRange(0) },
  { label: 'Next month', range: () => monthRange(1) },
  { label: 'Next 30 days', range: () => ({ start: todayInput(), end: addDaysInput(30) }) },
];

const defaultLens = (): ScenarioLens => ({
  startMode: 'LIVE_SNAPSHOT',
  dateRange: { start: todayInput(), end: addDaysInput(30) },
  includedRoomIds: [],
  includedActivityIds: [],
  includedStaffIds: [],
  includedEventTags: [],
  excludedRecordsBehavior: 'HIDDEN',
  editableCollections: ['calendarEvents', 'roomAssignments'],
  referenceOnlyCollections: ['rooms', 'activities', 'staff'],
});

const behaviorLabels: Record<ScenarioExcludedRecordsBehavior, string> = {
  HIDDEN: 'Hide them',
  LOCKED_CONTEXT: "Show, but don't allow edits",
  IGNORED: 'Leave them out',
};

export const ScenarioPlanningWorkspace: React.FC<ScenarioPlanningWorkspaceProps> = ({
  scenarios,
  setScenarios,
  scenarioDeltas,
  setScenarioDeltas,
  adminInboxItems,
  setAdminInboxItems,
  events,
  rooms,
  activities,
  staff,
  settings,
  orgId,
  actorId,
  onLaunchSandbox,
  onMobileMenuOpen,
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(scenarios[0]?.id ?? null);
  const [draftName, setDraftName] = useState('');
  const [showRefine, setShowRefine] = useState(false);
  const base = useMemo(() => ({ events, rooms, activities, staff }), [events, rooms, activities, staff]);
  const selectedScenario = scenarios.find(scenario => scenario.id === selectedScenarioId) ?? scenarios[0] ?? null;

  const scenarioRows = useMemo(() => scenarios
    .filter(scenario => scenario.status !== 'ARCHIVED')
    .map(scenario => ({ scenario, summary: computeScenarioSummary(base, scenario, scenarioDeltas) }))
    .sort((a, b) => b.scenario.updatedAt.localeCompare(a.scenario.updatedAt)), [base, scenarios, scenarioDeltas]);

  const selectedDiff = useMemo(
    () => selectedScenario ? computeScenarioDiff(base, selectedScenario, scenarioDeltas) : [],
    [base, selectedScenario, scenarioDeltas],
  );
  const selectedDrift = useMemo(
    () => selectedScenario ? computeScenarioDrift(base, selectedScenario, scenarioDeltas) : [],
    [base, selectedScenario, scenarioDeltas],
  );
  const selectedFinanceImpact = useMemo(
    () => selectedScenario ? computeScenarioFinanceImpact(base, selectedScenario, scenarioDeltas) : null,
    [base, selectedScenario, scenarioDeltas],
  );
  const selectedSummary = useMemo(
    () => selectedScenario ? computeScenarioSummary(base, selectedScenario, scenarioDeltas) : null,
    [base, selectedScenario, scenarioDeltas],
  );
  const selectedPromoteRequest = useMemo(() => {
    if (!selectedScenario) return null;
    return adminInboxItems
      .filter(item => item.relatedEntityType === 'SCENARIO_PROMOTE_REQUEST' && item.relatedEntityIds?.includes(selectedScenario.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }, [adminInboxItems, selectedScenario]);

  const createScenario = () => {
    const now = new Date().toISOString();
    const scenario: Scenario = {
      id: generateId(),
      orgId: orgId || undefined,
      name: draftName.trim() || `Plan ${scenarios.length + 1}`,
      createdAt: now,
      updatedAt: now,
      baseSnapshotAt: now,
      lens: defaultLens(),
      status: 'SAVED',
    };
    void setScenarios(prev => [scenario, ...prev]);
    setSelectedScenarioId(scenario.id);
    setDraftName('');
  };

  const updateSelectedScenario = (patch: Partial<Scenario>) => {
    if (!selectedScenario) return;
    const updatedAt = new Date().toISOString();
    void setScenarios(prev => prev.map(scenario => (
      scenario.id === selectedScenario.id ? { ...scenario, ...patch, updatedAt } : scenario
    )));
  };

  const updateLens = (patch: Partial<ScenarioLens>) => {
    if (!selectedScenario) return;
    updateSelectedScenario({ lens: { ...selectedScenario.lens, ...patch } });
  };

  const duplicateScenario = (scenario: Scenario) => {
    const now = new Date().toISOString();
    const copyId = generateId();
    const copy: Scenario = {
      ...scenario,
      id: copyId,
      name: `${scenario.name} copy`,
      createdAt: now,
      updatedAt: now,
      baseSnapshotAt: now,
    };
    const copiedDeltas = scenarioDeltas
      .filter(delta => delta.scenarioId === scenario.id)
      .map(delta => ({ ...delta, id: generateId(), scenarioId: copyId, createdAt: now, updatedAt: now }));
    void setScenarios(prev => [copy, ...prev]);
    if (copiedDeltas.length > 0) void setScenarioDeltas(prev => [...prev, ...copiedDeltas]);
    setSelectedScenarioId(copyId);
  };

  const deleteScenario = (scenario: Scenario) => {
    if (!window.confirm(`Delete "${scenario.name}"? Any changes in this plan will be discarded.`)) return;
    void setScenarios(prev => prev.filter(item => item.id !== scenario.id));
    void setScenarioDeltas(prev => prev.filter(delta => delta.scenarioId !== scenario.id));
    setSelectedScenarioId(null);
  };

  const requestPromote = () => {
    if (!selectedScenario || !selectedSummary) return;
    if (selectedSummary.changedRecords === 0 || selectedSummary.conflictCount > 0 || selectedSummary.driftCount > 0) return;
    const request = buildScenarioPromoteRequest({
      scenario: selectedScenario,
      base,
      deltas: scenarioDeltas,
      requestedBy: actorId,
      requestedAt: new Date().toISOString(),
      orgId: orgId || 'local',
      idFactory: generateId,
    });
    void setAdminInboxItems(prev => [request, ...prev]);
  };

  const toggleRoom = (roomId: string) => {
    if (!selectedScenario) return;
    const current = new Set<string>(selectedScenario.lens.includedRoomIds);
    if (current.has(roomId)) current.delete(roomId);
    else current.add(roomId);
    updateLens({ includedRoomIds: Array.from(current) });
  };

  const toggleActivity = (activityId: string) => {
    if (!selectedScenario) return;
    const current = new Set<string>(selectedScenario.lens.includedActivityIds);
    if (current.has(activityId)) current.delete(activityId);
    else current.add(activityId);
    updateLens({ includedActivityIds: Array.from(current) });
  };

  const toggleStaff = (staffId: string) => {
    if (!selectedScenario) return;
    const current = new Set<string>(selectedScenario.lens.includedStaffIds);
    if (current.has(staffId)) current.delete(staffId);
    else current.add(staffId);
    updateLens({ includedStaffIds: Array.from(current) });
  };

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <aside className="w-[360px] shrink-0 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <button className="lg:hidden p-2 -ms-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onMobileMenuOpen}>
            <Menu size={20} />
          </button>
          <FlaskConical size={19} className="text-amber-600" />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">What-if Plans</h2>
            <p className="text-[11px] text-slate-500">Try schedule changes without affecting the real calendar</p>
          </div>
        </div>
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex gap-2">
          <input
            value={draftName}
            onChange={event => setDraftName(event.target.value)}
            placeholder="New plan name"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
          />
          <button onClick={createScenario} className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white px-3 py-2 rounded-lg" title="Create plan">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          {scenarioRows.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-5 text-sm text-slate-500">
              Create a plan to start trying out schedule changes.
            </div>
          )}
          {scenarioRows.map(({ scenario, summary }) => (
            <button
              key={scenario.id}
              onClick={() => setSelectedScenarioId(scenario.id)}
              className={`w-full text-start rounded-lg border p-3 transition-colors ${
                selectedScenario?.id === scenario.id
                  ? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{scenario.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{scenario.lens.dateRange.start} to {scenario.lens.dateRange.end}</div>
                </div>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-600 text-white">DRAFT</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <span className="rounded bg-slate-100 dark:bg-slate-800 py-1">{summary.changedRecords} changes</span>
                <span className="rounded bg-slate-100 dark:bg-slate-800 py-1">{summary.conflictCount} clashes</span>
                <span className="rounded bg-slate-100 dark:bg-slate-800 py-1">{summary.driftCount} out of date</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {!selectedScenario ? (
          <div className="p-8 text-slate-500">Select or create a plan.</div>
        ) : (
          <div className="p-6 max-w-7xl mx-auto space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <input
                    value={selectedScenario.name}
                    onChange={event => updateSelectedScenario({ name: event.target.value || 'Untitled plan' })}
                    className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none"
                  />
                  {selectedDrift.length > 0 && <AlertTriangle size={18} className="text-amber-600" />}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Copied from the live schedule on {new Date(selectedScenario.baseSnapshotAt).toLocaleString(settings.language)}
                  {selectedPromoteRequest?.scenarioPromoteRequest && (
                    <span className="ms-2 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 px-2 py-0.5 text-xs font-semibold">
                      Approval {selectedPromoteRequest.scenarioPromoteRequest.status}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => duplicateScenario(selectedScenario)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm flex items-center gap-2">
                  <Copy size={16} /> Duplicate
                </button>
                <button onClick={() => deleteScenario(selectedScenario)} className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 text-sm flex items-center gap-2">
                  <Trash2 size={16} /> Delete
                </button>
                <button
                  disabled={
                    !selectedSummary ||
                    selectedSummary.changedRecords === 0 ||
                    selectedSummary.conflictCount > 0 ||
                    selectedSummary.driftCount > 0 ||
                    selectedPromoteRequest?.scenarioPromoteRequest?.status === 'pending'
                  }
                  onClick={requestPromote}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 disabled:border-slate-200 disabled:dark:border-slate-800 disabled:text-slate-400 text-sm flex items-center gap-2 disabled:cursor-not-allowed"
                  title={
                    !selectedSummary || selectedSummary.changedRecords === 0
                      ? 'No changes to send yet'
                      : selectedSummary.conflictCount > 0 || selectedSummary.driftCount > 0
                        ? 'Resolve clashes and out-of-date items before sending'
                        : 'Send these changes for approval'
                  }
                >
                  <Save size={16} /> Send for approval
                </button>
                <button onClick={() => onLaunchSandbox(selectedScenario.id)} className="btn-cadenza bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
                  <Play size={16} /> Open draft
                </button>
              </div>
            </div>

            <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h3 className="font-bold mb-1">Plan dates</h3>
                <p className="text-xs text-slate-500 mb-3">Choose the time period you want to plan, then open the draft to start making changes.</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {DATE_PRESETS.map(preset => {
                    const range = preset.range();
                    const active = selectedScenario.lens.dateRange.start === range.start && selectedScenario.lens.dateRange.end === range.end;
                    return (
                      <button
                        key={preset.label}
                        onClick={() => updateLens({ dateRange: range })}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                          active
                            ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-600'
                            : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="text-sm">
                    <span className="block text-xs font-semibold text-slate-500 mb-1">Start date</span>
                    <input
                      type="date"
                      value={selectedScenario.lens.dateRange.start}
                      onChange={event => updateLens({ dateRange: { ...selectedScenario.lens.dateRange, start: event.target.value } })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block text-xs font-semibold text-slate-500 mb-1">End date</span>
                    <input
                      type="date"
                      value={selectedScenario.lens.dateRange.end}
                      onChange={event => updateLens({ dateRange: { ...selectedScenario.lens.dateRange, end: event.target.value } })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                    />
                  </label>
                </div>

                <button
                  onClick={() => setShowRefine(value => !value)}
                  className="mt-5 w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <span className="flex items-center gap-2"><SlidersHorizontal size={15} className="text-slate-400" /> Refine — focus on specific rooms, teachers, or activities</span>
                  {showRefine ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showRefine && (
                  <div className="mt-4 space-y-5 border-t border-slate-200 dark:border-slate-800 pt-4">
                    <p className="text-xs text-slate-500">All optional. By default your plan covers the whole schedule within the dates above.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="text-sm">
                        <span className="block text-xs font-semibold text-slate-500 mb-1">Start from</span>
                        <select
                          value={selectedScenario.lens.startMode}
                          onChange={event => updateLens({ startMode: event.target.value as ScenarioStartMode })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                        >
                          <option value="LIVE_SNAPSHOT">The current schedule</option>
                          <option value="BLANK_SLATE">An empty schedule</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="block text-xs font-semibold text-slate-500 mb-1">Events outside this plan</span>
                        <select
                          value={selectedScenario.lens.excludedRecordsBehavior}
                          onChange={event => updateLens({ excludedRecordsBehavior: event.target.value as ScenarioExcludedRecordsBehavior })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                        >
                          {Object.entries(behaviorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-500 mb-2">Rooms in this plan</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {rooms.map(room => (
                          <label key={room.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm">
                            <input type="checkbox" checked={selectedScenario.lens.includedRoomIds.includes(room.id)} onChange={() => toggleRoom(room.id)} />
                            <span className="truncate">{room.name}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">Leave empty to include all rooms.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">Activities</div>
                        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 p-2 space-y-1">
                          {activities.slice(0, 20).map(activity => (
                            <label key={activity.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                              <input type="checkbox" checked={selectedScenario.lens.includedActivityIds.includes(activity.id)} onChange={() => toggleActivity(activity.id)} />
                              <span className="truncate">{activity.name}</span>
                            </label>
                          ))}
                          {activities.length === 0 && <div className="text-sm text-slate-500 p-2">No activities available.</div>}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">Teachers & staff</div>
                        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 p-2 space-y-1">
                          {staff.slice(0, 30).map(member => (
                            <label key={member.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                              <input type="checkbox" checked={selectedScenario.lens.includedStaffIds.includes(member.id)} onChange={() => toggleStaff(member.id)} />
                              <span className="truncate">{member.fullName}</span>
                            </label>
                          ))}
                          {staff.length === 0 && <div className="text-sm text-slate-500 p-2">No staff available.</div>}
                        </div>
                      </div>
                      <label className="text-sm">
                        <span className="block text-xs font-semibold text-slate-500 mb-2">Event tags</span>
                        <input
                          value={selectedScenario.lens.includedEventTags.join(', ')}
                          onChange={event => updateLens({ includedEventTags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })}
                          placeholder="e.g. recital, makeup"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                        />
                      </label>
                    </div>

                    <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500">
                      You can edit events and their rooms, dates, times, and staff. Rooms, activities, and staff lists themselves stay read-only.
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <GitCompareArrows size={17} className="text-amber-600" />
                  <h3 className="font-bold">Plan summary</h3>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 py-3"><div className="text-xl font-bold">{selectedDiff.length}</div><div className="text-xs text-slate-500">changes</div></div>
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 py-3"><div className="text-xl font-bold">{computeScenarioSummary(base, selectedScenario, scenarioDeltas).conflictCount}</div><div className="text-xs text-slate-500">clashes</div></div>
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 py-3"><div className="text-xl font-bold">{selectedDrift.length}</div><div className="text-xs text-slate-500">out of date</div></div>
                </div>
                {selectedFinanceImpact && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 mb-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="font-semibold text-sm">Cost & hours preview</div>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">estimate/reference only</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-2">
                        <div className="text-lg font-bold">{selectedFinanceImpact.estimatedScheduledHoursDelta.toFixed(2)}</div>
                        <div className="text-slate-500">hours change</div>
                      </div>
                      <div className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-2">
                        <div className="text-lg font-bold">{selectedFinanceImpact.createdEventCount}</div>
                        <div className="text-slate-500">created</div>
                      </div>
                      <div className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-2">
                        <div className="text-lg font-bold">{selectedFinanceImpact.staffAssignmentChangeCount}</div>
                        <div className="text-slate-500">staff edits</div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-xs">
                      {selectedFinanceImpact.byRoom.slice(0, 3).map(bucket => (
                        <div key={bucket.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{bucket.name}</span>
                          <span className="font-semibold">{bucket.estimatedHoursDelta.toFixed(2)}h / {bucket.eventCount} events</span>
                        </div>
                      ))}
                      {selectedFinanceImpact.changedEventCount === 0 && <div className="text-slate-500">No changes to summarize yet.</div>}
                    </div>
                  </div>
                )}
                <div className="space-y-2 max-h-[480px] overflow-y-auto custom-scrollbar">
                  {selectedDrift.map(item => (
                    <div key={item.id} className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
                      <div className="font-semibold">{item.title}</div>
                      <div className="text-xs text-amber-700 dark:text-amber-300">{item.message}</div>
                    </div>
                  ))}
                  {selectedDiff.map(item => (
                    <div key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-sm">
                      <div className="font-semibold truncate">{item.title}</div>
                      <div className="text-xs text-slate-500 mt-1">{item.changedFields.join(', ') || 'No material field changes'}</div>
                    </div>
                  ))}
                  {selectedDiff.length === 0 && selectedDrift.length === 0 && (
                    <div className="text-sm text-slate-500 py-6 text-center">No changes yet.</div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
