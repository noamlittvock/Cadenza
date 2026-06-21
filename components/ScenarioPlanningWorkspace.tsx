import React, { useMemo, useState } from 'react';
import { Copy, FlaskConical, Menu, Plus, Trash2, Play, Save, GitCompareArrows, AlertTriangle } from 'lucide-react';
import type { AdminInboxItem, CalendarEvent, Room, AppSettings } from '../types';
import type { ActivityV2, StaffMemberV2 } from '../types/v2';
import type { Scenario, ScenarioDelta, ScenarioExcludedRecordsBehavior, ScenarioLens, ScenarioStartMode } from '../types/scenario';
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
  HIDDEN: 'Hidden',
  LOCKED_CONTEXT: 'Locked context',
  IGNORED: 'Ignored',
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
      name: draftName.trim() || `Scenario ${scenarios.length + 1}`,
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
    if (!window.confirm(`Delete "${scenario.name}"? Scenario deltas will be discarded.`)) return;
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
            <h2 className="text-sm font-bold uppercase tracking-wide">Scenario Planning</h2>
            <p className="text-[11px] text-slate-500">Rooms and calendar sandbox setup</p>
          </div>
        </div>
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex gap-2">
          <input
            value={draftName}
            onChange={event => setDraftName(event.target.value)}
            placeholder="New scenario name"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
          />
          <button onClick={createScenario} className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white px-3 py-2 rounded-lg" title="Create scenario">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          {scenarioRows.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-5 text-sm text-slate-500">
              Create a scenario to configure a sandbox launch.
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
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-600 text-white">SANDBOX</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <span className="rounded bg-slate-100 dark:bg-slate-800 py-1">{summary.changedRecords} changed</span>
                <span className="rounded bg-slate-100 dark:bg-slate-800 py-1">{summary.conflictCount} conflicts</span>
                <span className="rounded bg-slate-100 dark:bg-slate-800 py-1">{summary.driftCount} drift</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {!selectedScenario ? (
          <div className="p-8 text-slate-500">Select or create a scenario.</div>
        ) : (
          <div className="p-6 max-w-7xl mx-auto space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <input
                    value={selectedScenario.name}
                    onChange={event => updateSelectedScenario({ name: event.target.value || 'Untitled scenario' })}
                    className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none"
                  />
                  {selectedDrift.length > 0 && <AlertTriangle size={18} className="text-amber-600" />}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Base snapshot {new Date(selectedScenario.baseSnapshotAt).toLocaleString(settings.language)}
                  {selectedPromoteRequest?.scenarioPromoteRequest && (
                    <span className="ms-2 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 px-2 py-0.5 text-xs font-semibold">
                      Promote {selectedPromoteRequest.scenarioPromoteRequest.status}
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
                      ? 'No scenario changes to request'
                      : selectedSummary.conflictCount > 0 || selectedSummary.driftCount > 0
                        ? 'Resolve conflicts and drift before requesting promotion'
                        : 'Create a scenario promote request'
                  }
                >
                  <Save size={16} /> Request promote
                </button>
                <button onClick={() => onLaunchSandbox(selectedScenario.id)} className="btn-cadenza bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
                  <Play size={16} /> Open sandbox
                </button>
              </div>
            </div>

            <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h3 className="font-bold mb-4">Launch setup</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="text-sm">
                    <span className="block text-xs font-semibold text-slate-500 mb-1">Start mode</span>
                    <select
                      value={selectedScenario.lens.startMode}
                      onChange={event => updateLens({ startMode: event.target.value as ScenarioStartMode })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                    >
                      <option value="LIVE_SNAPSHOT">Live snapshot</option>
                      <option value="BLANK_SLATE">Blank slate</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="block text-xs font-semibold text-slate-500 mb-1">Excluded records</span>
                    <select
                      value={selectedScenario.lens.excludedRecordsBehavior}
                      onChange={event => updateLens({ excludedRecordsBehavior: event.target.value as ScenarioExcludedRecordsBehavior })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                    >
                      {Object.entries(behaviorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
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

                <div className="mt-5">
                  <div className="text-xs font-semibold text-slate-500 mb-2">Included rooms</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {rooms.map(room => (
                      <label key={room.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm">
                        <input type="checkbox" checked={selectedScenario.lens.includedRoomIds.includes(room.id)} onChange={() => toggleRoom(room.id)} />
                        <span className="truncate">{room.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">No selected rooms means all rooms are included.</p>
                </div>

                <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-2">Activity filters</div>
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 p-2 space-y-1">
                      {activities.slice(0, 20).map(activity => (
                        <label key={activity.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                          <input type="checkbox" checked={selectedScenario.lens.includedActivityIds.includes(activity.id)} onChange={() => toggleActivity(activity.id)} />
                          <span className="truncate">{activity.name}</span>
                        </label>
                      ))}
                      {activities.length === 0 && <div className="text-sm text-slate-500 p-2">No activities loaded.</div>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-2">Staff filters</div>
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 p-2 space-y-1">
                      {staff.slice(0, 30).map(member => (
                        <label key={member.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                          <input type="checkbox" checked={selectedScenario.lens.includedStaffIds.includes(member.id)} onChange={() => toggleStaff(member.id)} />
                          <span className="truncate">{member.fullName}</span>
                        </label>
                      ))}
                      {staff.length === 0 && <div className="text-sm text-slate-500 p-2">No staff loaded.</div>}
                    </div>
                  </div>
                  <label className="text-sm">
                    <span className="block text-xs font-semibold text-slate-500 mb-2">Event tags</span>
                    <input
                      value={selectedScenario.lens.includedEventTags.join(', ')}
                      onChange={event => updateLens({ includedEventTags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })}
                      placeholder="Comma-separated tags"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                    />
                    <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500">
                      Editable: calendar events, room assignments. Reference-only: rooms, activities, staff.
                    </div>
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <GitCompareArrows size={17} className="text-amber-600" />
                  <h3 className="font-bold">Scenario impact</h3>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 py-3"><div className="text-xl font-bold">{selectedDiff.length}</div><div className="text-xs text-slate-500">changed</div></div>
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 py-3"><div className="text-xl font-bold">{computeScenarioSummary(base, selectedScenario, scenarioDeltas).conflictCount}</div><div className="text-xs text-slate-500">conflicts</div></div>
                  <div className="rounded-lg bg-slate-100 dark:bg-slate-800 py-3"><div className="text-xl font-bold">{selectedDrift.length}</div><div className="text-xs text-slate-500">drift</div></div>
                </div>
                {selectedFinanceImpact && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 mb-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="font-semibold text-sm">Finance impact</div>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">estimate/reference only</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-2">
                        <div className="text-lg font-bold">{selectedFinanceImpact.estimatedScheduledHoursDelta.toFixed(2)}</div>
                        <div className="text-slate-500">hours delta</div>
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
                      {selectedFinanceImpact.changedEventCount === 0 && <div className="text-slate-500">No changed calendar events to summarize.</div>}
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
                    <div className="text-sm text-slate-500 py-6 text-center">No scenario changes yet.</div>
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
