import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, Clock, DoorOpen, FlaskConical, GitBranch, LayoutGrid, Menu, Plus, Save, Table2, Trash2, TrendingUp } from 'lucide-react';
import type { AppSettings, CalendarEvent, Room } from '../types';
import type { ActivityV2, StaffMemberV2 } from '../types/v2';
import type { Scenario, ScenarioDelta } from '../types/scenario';
import { generateId } from '../constants';
import {
  buildSandboxEventSet,
  computeScenarioDiff,
  computeScenarioDrift,
  computeScenarioFinanceImpact,
  hashScenarioEventSource,
} from '../utils/scenarioEngine';
import {
  buildScenarioCalendarLayout,
  buildScenarioEventMoveDelta,
  getScenarioCalendarDays,
  type ScenarioCalendarMode,
  type ScenarioEventMovePatch,
} from '../utils/scenarioCalendarAdapter';
import { detectRoomConflicts, getConflictingEventIds } from '../utils/roomConflicts';
import { ScenarioStaffPicker } from './ScenarioStaffPicker';

interface SandboxWorkspaceProps {
  scenario: Scenario;
  scenarioDeltas: ScenarioDelta[];
  setScenarioDeltas: (data: ScenarioDelta[] | ((prev: ScenarioDelta[]) => ScenarioDelta[])) => Promise<void>;
  events: CalendarEvent[];
  rooms: Room[];
  activities: ActivityV2[];
  staff: StaffMemberV2[];
  settings: AppSettings;
  onBackToPlanning: () => void;
  onMobileMenuOpen: () => void;
}

const toDateInput = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const toTimeInput = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const combineDateAndTime = (sourceIso: string, nextDate: string, nextTime: string) => {
  const source = new Date(sourceIso);
  const [hour, minute] = nextTime.split(':').map(Number);
  const next = new Date(`${nextDate}T00:00:00`);
  next.setHours(hour, minute, 0, 0);
  if (Number.isNaN(next.getTime())) return sourceIso;
  return next.toISOString();
};

export const SandboxWorkspace: React.FC<SandboxWorkspaceProps> = ({
  scenario,
  scenarioDeltas,
  setScenarioDeltas,
  events,
  rooms,
  activities,
  staff,
  settings,
  onBackToPlanning,
  onMobileMenuOpen,
}) => {
  const [createForm, setCreateForm] = useState({
    name: '',
    date: scenario.lens.dateRange.start,
    start: '09:00',
    end: '10:00',
    roomId: rooms[0]?.id ?? '',
  });
  const [surface, setSurface] = useState<'table' | 'grid'>('table');
  const [gridMode, setGridMode] = useState<ScenarioCalendarMode>('WEEK');
  const [gridDate, setGridDate] = useState(scenario.lens.dateRange.start);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const base = useMemo(() => ({ events, rooms, activities, staff }), [events, rooms, activities, staff]);
  const eventSet = useMemo(() => buildSandboxEventSet(base, scenario, scenarioDeltas), [base, scenario, scenarioDeltas]);
  const conflicts = useMemo(() => detectRoomConflicts(eventSet.events), [eventSet.events]);
  const conflictingIds = useMemo(() => getConflictingEventIds(conflicts), [conflicts]);
  const diff = useMemo(() => computeScenarioDiff(base, scenario, scenarioDeltas), [base, scenario, scenarioDeltas]);
  const drift = useMemo(() => computeScenarioDrift(base, scenario, scenarioDeltas), [base, scenario, scenarioDeltas]);
  const impact = useMemo(() => computeScenarioFinanceImpact(base, scenario, scenarioDeltas), [base, scenario, scenarioDeltas]);
  const liveById = useMemo(() => new Map(events.map(event => [event.id, event])), [events]);
  const scenarioDeltasByRecord = useMemo(() => {
    const map = new Map<string, ScenarioDelta>();
    scenarioDeltas
      .filter(delta => delta.scenarioId === scenario.id && delta.collection === 'events')
      .forEach(delta => {
        const existing = map.get(delta.recordId);
        if (!existing || existing.updatedAt <= delta.updatedAt) map.set(delta.recordId, delta);
      });
    return map;
  }, [scenarioDeltas, scenario.id]);
  const gridDays = useMemo(() => getScenarioCalendarDays(new Date(`${gridDate}T12:00:00`), gridMode), [gridDate, gridMode]);
  const gridLayout = useMemo(() => buildScenarioCalendarLayout(eventSet.events, gridDays, rooms), [eventSet.events, gridDays, rooms]);
  const gridLaneIds = useMemo(() => ['', ...rooms.map(room => room.id)], [rooms]);

  const updateEventDelta = (event: CalendarEvent, patch: Partial<CalendarEvent>) => {
    const source = liveById.get(event.id);
    const existing = scenarioDeltasByRecord.get(event.id);
    if (!source && existing?.operation !== 'create') return;
    const now = new Date().toISOString();
    const nextPatch = { ...(existing?.patch || {}), ...patch };
    const nextDelta: ScenarioDelta = {
      id: existing?.id || generateId(),
      scenarioId: scenario.id,
      collection: 'events',
      recordId: event.id,
      operation: existing?.operation === 'create' ? 'create' : 'patch',
      patch: nextPatch,
      baseHash: source ? (existing?.baseHash || hashScenarioEventSource(source)) : undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    void setScenarioDeltas(prev => {
      const without = prev.filter(delta => !(
        delta.scenarioId === scenario.id &&
        delta.collection === 'events' &&
        delta.recordId === event.id
      ));
      return [...without, nextDelta];
    });
  };

  const moveEventDelta = (event: CalendarEvent, move: ScenarioEventMovePatch) => {
    const nextDelta = buildScenarioEventMoveDelta({
      scenarioId: scenario.id,
      event,
      baseEvent: liveById.get(event.id),
      existingDelta: scenarioDeltasByRecord.get(event.id),
      move,
      now: new Date().toISOString(),
      idFactory: generateId,
    });
    if (!nextDelta) return;
    void setScenarioDeltas(prev => {
      const without = prev.filter(delta => !(
        delta.scenarioId === scenario.id &&
        delta.collection === 'events' &&
        delta.recordId === event.id
      ));
      return [...without, nextDelta];
    });
  };

  const createEventDelta = () => {
    const name = createForm.name.trim();
    if (!name || !createForm.date || !createForm.start || !createForm.end) return;
    const start = combineDateAndTime(new Date().toISOString(), createForm.date, createForm.start);
    const end = combineDateAndTime(start, createForm.date, createForm.end);
    if (new Date(end).getTime() <= new Date(start).getTime()) return;
    const now = new Date().toISOString();
    const eventId = generateId();
    const createdEvent: CalendarEvent = {
      id: eventId,
      name,
      description: '',
      start,
      end,
      roomId: createForm.roomId || undefined,
      activityId: activities[0]?.id,
      staffMemberIds: [],
      isCanceled: false,
      isHidden: false,
      tags: [],
    };
    const nextDelta: ScenarioDelta = {
      id: generateId(),
      scenarioId: scenario.id,
      collection: 'events',
      recordId: eventId,
      operation: 'create',
      patch: createdEvent,
      createdAt: now,
      updatedAt: now,
    };
    void setScenarioDeltas(prev => [...prev, nextDelta]);
    setCreateForm(prev => ({ ...prev, name: '' }));
  };

  const deleteEventDelta = (event: CalendarEvent) => {
    const source = liveById.get(event.id);
    const existing = scenarioDeltasByRecord.get(event.id);
    if (!source) {
      void setScenarioDeltas(prev => prev.filter(delta => !(
        delta.scenarioId === scenario.id &&
        delta.collection === 'events' &&
        delta.recordId === event.id
      )));
      return;
    }
    const now = new Date().toISOString();
    const nextDelta: ScenarioDelta = {
      id: existing?.id || generateId(),
      scenarioId: scenario.id,
      collection: 'events',
      recordId: event.id,
      operation: 'delete',
      baseHash: existing?.baseHash || hashScenarioEventSource(source),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    void setScenarioDeltas(prev => {
      const without = prev.filter(delta => !(
        delta.scenarioId === scenario.id &&
        delta.collection === 'events' &&
        delta.recordId === event.id
      ));
      return [...without, nextDelta];
    });
  };

  const roomName = (roomId?: string) => rooms.find(room => room.id === roomId)?.name || 'Unassigned';
  const staffIdsChanged = (event: CalendarEvent) => {
    const live = liveById.get(event.id);
    const before = [...new Set(live?.staffMemberIds || [])].sort();
    const after = [...new Set(event.staffMemberIds || [])].sort();
    return JSON.stringify(before) !== JSON.stringify(after);
  };
  const formatStamp = new Date(scenario.baseSnapshotAt).toLocaleString(settings.language);

  return (
    <div className="h-full overflow-hidden bg-amber-50/40 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border-[6px] border-amber-500/70">
      <div className="h-full flex">
        <aside className="w-[76px] shrink-0 bg-amber-600 text-white flex flex-col items-center py-4 gap-4 shadow-cadenza-deep">
          <div className="h-12 w-12 rounded-lg border border-white/30 flex items-center justify-center">
            <FlaskConical size={24} />
          </div>
          <div className="[writing-mode:vertical-rl] rotate-180 text-xs font-black tracking-[0.28em]">DRAFT</div>
          <div className="mt-auto [writing-mode:vertical-rl] rotate-180 text-[10px] uppercase tracking-[0.22em] opacity-80">Not live</div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 bg-white dark:bg-slate-900 border-b-2 border-amber-500 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button className="lg:hidden p-2 -ms-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onMobileMenuOpen}>
                  <Menu size={20} />
                </button>
                <div className="rounded bg-amber-600 text-white px-2 py-1 text-[11px] font-black tracking-widest">DRAFT</div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold truncate">{scenario.name}</h2>
                  <p className="text-xs text-slate-500">Copied from the live schedule on {formatStamp}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 bg-slate-50 dark:bg-slate-950">{eventSet.events.length} events</span>
                <span className={`rounded-lg border px-3 py-1.5 ${conflicts.length > 0 ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'}`}>
                  {conflicts.length} clashes
                </span>
                <span className={`rounded-lg border px-3 py-1.5 ${drift.length > 0 ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'}`}>
                  {drift.length} out of date
                </span>
                <button onClick={onBackToPlanning} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 flex items-center gap-2">
                  <ArrowLeft size={16} /> Back to plan
                </button>
              </div>
            </div>
          </div>

          <div className="shrink-0 px-4 py-2 bg-amber-100 dark:bg-amber-950/30 border-b border-amber-300 dark:border-amber-800 flex flex-wrap items-center gap-3 text-xs text-amber-900 dark:text-amber-100">
            <span className="font-bold">You're editing a draft</span>
            <span>Changes here don't affect the real calendar.</span>
            <span>{diff.length} changes</span>
            <span>{eventSet.lockedContextEventIds.length} read-only events</span>
            {eventSet.hiddenBaseEventIds.length > 0 && <span>{eventSet.hiddenBaseEventIds.length} hidden</span>}
          </div>

          {drift.length > 0 && (
            <div className="shrink-0 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-300 dark:border-amber-800 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle size={16} className="shrink-0" />
              <span>The real schedule changed since you started this plan — review the <span className="font-semibold">Out of date</span> items before applying.</span>
            </div>
          )}

          <div className="flex-1 overflow-hidden grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="overflow-auto custom-scrollbar p-4">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">Schedule & rooms</h3>
                    <p className="text-xs text-slate-500">Room, date, and time edits stay in this draft.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden flex">
                      <button
                        onClick={() => setSurface('table')}
                        className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1 ${surface === 'table' ? 'bg-amber-600 text-white' : 'bg-white dark:bg-slate-900'}`}
                      >
                        <Table2 size={14} /> Table
                      </button>
                      <button
                        onClick={() => setSurface('grid')}
                        className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1 ${surface === 'grid' ? 'bg-amber-600 text-white' : 'bg-white dark:bg-slate-900'}`}
                      >
                        <LayoutGrid size={14} /> Grid
                      </button>
                    </div>
                    <Save size={18} className="text-amber-600" />
                  </div>
                </div>
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,1fr)_140px_110px_110px_minmax(160px,220px)_auto] gap-2">
                    <input
                      value={createForm.name}
                      onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Event name"
                      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                    <input
                      type="date"
                      value={createForm.date}
                      onChange={e => setCreateForm(prev => ({ ...prev, date: e.target.value }))}
                      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                    <input
                      type="time"
                      value={createForm.start}
                      onChange={e => setCreateForm(prev => ({ ...prev, start: e.target.value }))}
                      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                    <input
                      type="time"
                      value={createForm.end}
                      onChange={e => setCreateForm(prev => ({ ...prev, end: e.target.value }))}
                      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                    <select
                      value={createForm.roomId}
                      onChange={e => setCreateForm(prev => ({ ...prev, roomId: e.target.value }))}
                      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
                    </select>
                    <button
                      onClick={createEventDelta}
                      disabled={!createForm.name.trim()}
                      className="rounded bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:text-slate-500 text-white px-3 py-2 text-sm font-semibold flex items-center justify-center gap-2"
                    >
                      <Plus size={16} /> Create
                    </button>
                  </div>
                </div>
                {surface === 'grid' && (
                  <div className="border-b border-slate-200 dark:border-slate-800">
                    <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900">
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={gridDate}
                          onChange={e => setGridDate(e.target.value)}
                          className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-sm"
                        />
                        <select
                          value={gridMode}
                          onChange={e => setGridMode(e.target.value as ScenarioCalendarMode)}
                          className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-sm"
                        >
                          <option value="DAY">Day</option>
                          <option value="WEEK">Week</option>
                        </select>
                      </div>
                      <div className="text-xs text-slate-500">Drag cards between days and rooms. Time edits stay in this draft.</div>
                    </div>
                    <div className="overflow-x-auto">
                      <div
                        className="grid min-w-[980px] border-t border-slate-200 dark:border-slate-800"
                        style={{ gridTemplateColumns: `repeat(${gridDays.length}, minmax(220px, 1fr))` }}
                      >
                        {gridDays.map(day => (
                          <div key={day.key} className="border-e border-slate-200 dark:border-slate-800 last:border-e-0">
                            <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-3 py-2">
                              <div className="text-sm font-bold">{day.label}</div>
                              <div
                                className="grid gap-1 text-[10px] text-slate-500 mt-2"
                                style={{ gridTemplateColumns: `repeat(${gridLaneIds.length}, minmax(54px, 1fr))` }}
                              >
                                {gridLaneIds.map(roomId => (
                                  <div key={roomId || 'unassigned'} className="truncate">{roomName(roomId)}</div>
                                ))}
                              </div>
                            </div>
                            <div className="relative h-[900px] bg-white dark:bg-slate-900">
                              {gridLaneIds.map((roomId, laneIndex) => (
                                <div
                                  key={`${day.key}:${roomId || 'unassigned'}`}
                                  onDragOver={e => e.preventDefault()}
                                  onDrop={e => {
                                    e.preventDefault();
                                    const eventId = e.dataTransfer.getData('text/plain') || draggingEventId;
                                    const event = eventSet.events.find(item => item.id === eventId);
                                    if (event) moveEventDelta(event, { date: day.date, roomId: roomId || undefined });
                                    setDraggingEventId(null);
                                  }}
                                  className="absolute top-0 bottom-0 border-e border-dashed border-slate-200 dark:border-slate-800/80 last:border-e-0"
                                  style={{
                                    left: `${(laneIndex / gridLaneIds.length) * 100}%`,
                                    width: `${100 / gridLaneIds.length}%`,
                                  }}
                                />
                              ))}
                              {Array.from({ length: 16 }, (_, index) => (
                                <div
                                  key={index}
                                  className="absolute start-0 end-0 border-t border-slate-100 dark:border-slate-800/70 text-[10px] text-slate-400 ps-1"
                                  style={{ top: `${(index / 15) * 100}%` }}
                                >
                                  {String(index + 7).padStart(2, '0')}:00
                                </div>
                              ))}
                              {gridLayout.filter(item => item.dayKey === day.key).map(item => {
                                const meta = eventSet.metadataByEventId[item.event.id];
                                const hasConflict = conflictingIds.has(item.event.id);
                                const laneIndex = Math.max(0, gridLaneIds.indexOf(item.roomId));
                                return (
                                  <div
                                    key={item.event.id}
                                    draggable={!meta?.lockedContext}
                                    onDragStart={e => {
                                      setDraggingEventId(item.event.id);
                                      e.dataTransfer.setData('text/plain', item.event.id);
                                    }}
                                    onDragEnd={() => setDraggingEventId(null)}
                                    className={`absolute rounded-md border p-2 text-xs shadow-sm overflow-hidden cursor-grab ${
                                      meta?.changed ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                                    } ${hasConflict ? 'ring-2 ring-red-400' : ''}`}
                                    style={{
                                      top: `${item.topPercent}%`,
                                      height: `${item.heightPercent}%`,
                                      left: `calc(${(laneIndex / gridLaneIds.length) * 100}% + 4px)`,
                                      width: `calc(${100 / gridLaneIds.length}% - 8px)`,
                                      minHeight: '72px',
                                    }}
                                  >
                                    <div className="font-semibold truncate flex items-center gap-1">
                                      {hasConflict && <AlertTriangle size={12} className="text-red-600 shrink-0" />}
                                      <span className="truncate">{item.event.name}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate">{roomName(item.event.roomId)}</div>
                                    <div className="mt-1 grid grid-cols-2 gap-1">
                                      <input
                                        type="time"
                                        value={toTimeInput(item.event.start)}
                                        disabled={meta?.lockedContext}
                                        onChange={e => moveEventDelta(item.event, { startTime: e.target.value })}
                                        className="min-w-0 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1 py-0.5 disabled:opacity-50"
                                      />
                                      <input
                                        type="time"
                                        value={toTimeInput(item.event.end)}
                                        disabled={meta?.lockedContext}
                                        onChange={e => moveEventDelta(item.event, { endTime: e.target.value })}
                                        className="min-w-0 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1 py-0.5 disabled:opacity-50"
                                      />
                                    </div>
                                    <div className="mt-1">
                                      <ScenarioStaffPicker
                                        staff={staff}
                                        value={item.event.staffMemberIds || []}
                                        onChange={ids => updateEventDelta(item.event, { staffMemberIds: ids })}
                                        disabled={meta?.lockedContext}
                                        compact
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {surface === 'table' && <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="text-start px-3 py-2 w-8"></th>
                        <th className="text-start px-3 py-2 min-w-[220px]">Event</th>
                        <th className="text-start px-3 py-2">Date</th>
                        <th className="text-start px-3 py-2">Start</th>
                        <th className="text-start px-3 py-2">End</th>
                        <th className="text-start px-3 py-2 min-w-[190px]">Room</th>
                        <th className="text-start px-3 py-2 min-w-[180px]">Staff</th>
                        <th className="text-start px-3 py-2">State</th>
                        <th className="text-start px-3 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventSet.events.map(event => {
                        const meta = eventSet.metadataByEventId[event.id];
                        const changed = Boolean(meta?.changed);
                        const locked = Boolean(meta?.lockedContext);
                        const hasConflict = conflictingIds.has(event.id);
                        const staffChanged = staffIdsChanged(event);
                        return (
                          <tr
                            key={event.id}
                            className={`border-t border-slate-100 dark:border-slate-800 ${changed ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''} ${hasConflict ? 'outline outline-1 outline-red-300 dark:outline-red-900' : ''}`}
                          >
                            <td className="px-3 py-2">
                              {changed && <span className="block h-2.5 w-2.5 rounded-full bg-amber-600" title="Changed in this plan" />}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold flex items-center gap-2">
                                {hasConflict && <AlertTriangle size={14} className="text-red-600" />}
                                <span className="truncate">{event.name}</span>
                              </div>
                              <div className="text-xs text-slate-500 truncate">{roomName(liveById.get(event.id)?.roomId)} (now)</div>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="date"
                                value={toDateInput(event.start)}
                                disabled={locked}
                                onChange={e => {
                                  const startTime = toTimeInput(event.start);
                                  const endTime = toTimeInput(event.end);
                                  updateEventDelta(event, {
                                    start: combineDateAndTime(event.start, e.target.value, startTime),
                                    end: combineDateAndTime(event.end, e.target.value, endTime),
                                  });
                                }}
                                className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 disabled:opacity-50"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                value={toTimeInput(event.start)}
                                disabled={locked}
                                onChange={e => updateEventDelta(event, { start: combineDateAndTime(event.start, toDateInput(event.start), e.target.value) })}
                                className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 disabled:opacity-50"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                value={toTimeInput(event.end)}
                                disabled={locked}
                                onChange={e => updateEventDelta(event, { end: combineDateAndTime(event.end, toDateInput(event.end), e.target.value) })}
                                className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 disabled:opacity-50"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={event.roomId || ''}
                                disabled={locked}
                                onChange={e => updateEventDelta(event, { roomId: e.target.value || undefined })}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 disabled:opacity-50"
                              >
                                <option value="">Unassigned</option>
                                {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <ScenarioStaffPicker
                                staff={staff}
                                value={event.staffMemberIds || []}
                                onChange={ids => updateEventDelta(event, { staffMemberIds: ids })}
                                disabled={locked}
                              />
                              {staff.length === 0 && <div className="text-xs text-slate-500">No staff available</div>}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {changed && <span className="rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 text-[11px] font-semibold">changed</span>}
                                {staffChanged && <span className="rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 text-[11px] font-semibold">staff</span>}
                                {meta?.delta?.operation === 'create' && <span className="rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-1.5 py-0.5 text-[11px] font-semibold">created</span>}
                                {locked && <span className="rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 text-[11px] font-semibold">read-only</span>}
                                {hasConflict && <span className="rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-1.5 py-0.5 text-[11px] font-semibold">clash</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <button
                                disabled={locked}
                                onClick={() => deleteEventDelta(event)}
                                className="p-2 rounded text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30 disabled:opacity-40"
                                title="Remove from this draft"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {eventSet.events.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-10 text-center text-slate-500">No events match this plan's setup.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>}
              </div>
            </section>

            <aside className="border-s border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 overflow-y-auto custom-scrollbar p-4 space-y-4">
              {/* Live impact — consequences come to you, no navigation (estimate only). */}
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold flex items-center gap-2"><TrendingUp size={16} className="text-indigo-600" /> Impact</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">estimate</span>
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-200 mb-3">
                  {diff.length === 0 ? (
                    <span className="text-slate-500">No changes yet — drag or edit an event to see the impact here.</span>
                  ) : (
                    <span>
                      <span className="font-semibold">{diff.length}</span> change{diff.length === 1 ? '' : 's'}
                      {conflicts.length > 0 && <> · <span className="font-semibold text-red-600">{conflicts.length} clash{conflicts.length === 1 ? '' : 'es'}</span></>}
                      {' · '}
                      <span className={`font-semibold ${impact.estimatedScheduledHoursDelta > 0 ? 'text-emerald-600' : impact.estimatedScheduledHoursDelta < 0 ? 'text-amber-600' : ''}`}>
                        {impact.estimatedScheduledHoursDelta > 0 ? '+' : ''}{impact.estimatedScheduledHoursDelta}h
                      </span>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                  <div className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-1.5"><div className="text-base font-bold">{impact.createdEventCount}</div><div className="text-slate-500">added</div></div>
                  <div className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-1.5"><div className="text-base font-bold">{impact.deletedEventCount}</div><div className="text-slate-500">removed</div></div>
                  <div className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-1.5"><div className="text-base font-bold">{impact.staffAssignmentChangeCount}</div><div className="text-slate-500">staff edits</div></div>
                </div>
                {impact.byStaff.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">By teacher</div>
                    {impact.byStaff.slice(0, 5).map(bucket => (
                      <div key={bucket.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{bucket.name}</span>
                        <span className={`font-semibold shrink-0 ${bucket.estimatedHoursDelta > 0 ? 'text-emerald-600' : bucket.estimatedHoursDelta < 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                          {bucket.estimatedHoursDelta > 0 ? '+' : ''}{bucket.estimatedHoursDelta}h
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {impact.byRoom.length > 0 && (
                  <div className="space-y-1 mt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">By room</div>
                    {impact.byRoom.slice(0, 4).map(bucket => (
                      <div key={bucket.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{bucket.name}</span>
                        <span className="font-semibold shrink-0 text-slate-500">{bucket.eventCount} event{bucket.eventCount === 1 ? '' : 's'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h3 className="font-bold mb-3 flex items-center gap-2"><GitBranch size={16} /> Plan setup</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><CalendarDays size={15} className="text-slate-400" /> {scenario.lens.dateRange.start} to {scenario.lens.dateRange.end}</div>
                  <div className="flex items-center gap-2"><DoorOpen size={15} className="text-slate-400" /> {scenario.lens.includedRoomIds.length || 'All'} rooms</div>
                  <div className="flex items-center gap-2"><Clock size={15} className="text-slate-400" /> {scenario.lens.startMode === 'BLANK_SLATE' ? 'Empty schedule' : 'Current schedule'}</div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h3 className="font-bold mb-3">Double-bookings</h3>
                <div className="space-y-2">
                  {conflicts.slice(0, 8).map(conflict => (
                    <div key={`${conflict.eventA.id}-${conflict.eventB.id}`} className="rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-2 text-xs">
                      <div className="font-semibold text-red-700 dark:text-red-300">{roomName(conflict.roomId)}</div>
                      <div>{conflict.eventA.name} / {conflict.eventB.name}</div>
                    </div>
                  ))}
                  {conflicts.length === 0 && <div className="text-sm text-slate-500">No double-bookings in this draft.</div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h3 className="font-bold mb-3">Out of date</h3>
                <div className="space-y-2">
                  {drift.map(item => (
                    <div key={item.id} className="rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs">
                      <div className="font-semibold text-amber-800 dark:text-amber-200">{item.title}</div>
                      <div>{item.message}</div>
                    </div>
                  ))}
                  {drift.length === 0 && <div className="text-sm text-slate-500">The real schedule hasn't changed since you started.</div>}
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
};
