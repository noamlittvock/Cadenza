import type { CalendarEvent, Room } from '../types';
import type { ScenarioDelta } from '../types/scenario';
import { hashScenarioEventSource } from './scenarioEngine';

export type ScenarioCalendarMode = 'DAY' | 'WEEK';

export interface ScenarioCalendarDay {
  key: string;
  label: string;
  date: string;
}

export interface ScenarioCalendarLayoutItem {
  event: CalendarEvent;
  dayKey: string;
  roomId: string;
  topPercent: number;
  heightPercent: number;
}

export interface ScenarioEventMovePatch {
  date?: string;
  startTime?: string;
  endTime?: string;
  roomId?: string;
}

const START_HOUR = 7;
const END_HOUR = 22;
const MINUTES_PER_DAY = (END_HOUR - START_HOUR) * 60;

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const combineDateAndTime = (sourceIso: string, dateKey: string, time: string): string => {
  const [hour, minute] = time.split(':').map(Number);
  const next = new Date(`${dateKey}T00:00:00`);
  next.setHours(hour, minute, 0, 0);
  return Number.isNaN(next.getTime()) ? sourceIso : next.toISOString();
};

const timeInput = (iso: string): string => {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const minutesFromGridStart = (iso: string): number => {
  const date = new Date(iso);
  return (date.getHours() - START_HOUR) * 60 + date.getMinutes();
};

export function getScenarioCalendarDays(anchorDate: Date, mode: ScenarioCalendarMode): ScenarioCalendarDay[] {
  const start = new Date(anchorDate);
  start.setHours(12, 0, 0, 0);
  if (mode === 'WEEK') {
    const day = start.getDay();
    start.setDate(start.getDate() - day);
  }
  const count = mode === 'DAY' ? 1 : 7;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = toDateKey(date);
    return {
      key,
      date: key,
      label: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    };
  });
}

export function buildScenarioCalendarLayout(events: CalendarEvent[], days: ScenarioCalendarDay[], rooms: Room[]): ScenarioCalendarLayoutItem[] {
  const dayKeys = new Set(days.map(day => day.key));
  const roomIds = new Set(rooms.map(room => room.id));
  return events.flatMap(event => {
    const start = new Date(event.start);
    const dayKey = toDateKey(start);
    if (!dayKeys.has(dayKey)) return [];
    const roomId = event.roomId || '';
    if (roomId && rooms.length > 0 && !roomIds.has(roomId)) return [];
    const startMinutes = Math.max(0, minutesFromGridStart(event.start));
    const endMinutes = Math.min(MINUTES_PER_DAY, minutesFromGridStart(event.end));
    const duration = Math.max(15, endMinutes - startMinutes);
    return [{
      event,
      dayKey,
      roomId,
      topPercent: Math.max(0, Math.min(100, (startMinutes / MINUTES_PER_DAY) * 100)),
      heightPercent: Math.max(3, Math.min(100, (duration / MINUTES_PER_DAY) * 100)),
    }];
  });
}

export function buildMovedScenarioEvent(event: CalendarEvent, move: ScenarioEventMovePatch): CalendarEvent {
  const date = move.date ?? toDateKey(new Date(event.start));
  const startTime = move.startTime ?? timeInput(event.start);
  const endTime = move.endTime ?? timeInput(event.end);
  const hasRoomMove = Object.prototype.hasOwnProperty.call(move, 'roomId');
  return {
    ...event,
    start: combineDateAndTime(event.start, date, startTime),
    end: combineDateAndTime(event.end, date, endTime),
    roomId: hasRoomMove ? move.roomId : event.roomId,
  };
}

export function buildScenarioEventMoveDelta(params: {
  scenarioId: string;
  event: CalendarEvent;
  baseEvent?: CalendarEvent;
  existingDelta?: ScenarioDelta;
  move: ScenarioEventMovePatch;
  now: string;
  idFactory: () => string;
}): ScenarioDelta | null {
  const moved = buildMovedScenarioEvent(params.event, params.move);
  const source = params.baseEvent;
  const existing = params.existingDelta;
  if (!source && existing?.operation !== 'create') return null;

  const patch: Partial<CalendarEvent> = existing?.operation === 'create'
    ? { ...(existing.patch || {}), ...moved }
    : {
        ...(existing?.patch || {}),
        start: moved.start,
        end: moved.end,
        roomId: moved.roomId,
      };

  return {
    id: existing?.id || params.idFactory(),
    scenarioId: params.scenarioId,
    collection: 'events',
    recordId: params.event.id,
    operation: existing?.operation === 'create' ? 'create' : 'patch',
    patch,
    baseHash: source ? (existing?.baseHash || hashScenarioEventSource(source)) : undefined,
    createdAt: existing?.createdAt || params.now,
    updatedAt: params.now,
  };
}
