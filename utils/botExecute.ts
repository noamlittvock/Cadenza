/**
 * Cozy Bee — deterministic intent execution.
 *
 * One pure function per BotIntent. Inputs: the parsed intent + resolved IDs
 * + the same React-state arrays the rest of the app uses. Output: a typed
 * QueryResult that the wrap step will turn into a sentence.
 *
 * No backend reads happen here — this layer is the contract that makes
 * the answer correct. If the data isn't already in memory, we don't
 * fabricate it.
 */

import type { CalendarEvent, Teacher, Room, Student } from '../types';
import type { ActivityV2 } from '../types/v2';
import type {
  QueryIntent,
  QueryResult,
  ResolvedRefs,
  EventSummary,
  ConflictSummary,
} from '../types/botQuery';
import { detectRoomConflicts } from './roomConflicts';

export interface ExecuteContext {
  teachers: Teacher[];
  rooms: Room[];
  students: Student[];
  activities: ActivityV2[];
  events: CalendarEvent[];
  /** Used for `now()`-style lookups; tests inject a fixed clock. */
  now: Date;
}

// ─── Time-window resolution ─────────────────────────────────────────────────

interface Window {
  start: Date;
  end: Date;
  label: string;
}

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date   { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

/** Sunday-start week to match Cadenza's existing calendar grid. */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  return addDays(x, -x.getDay());
}

function formatRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  if (startOfDay(start).getTime() === startOfDay(end).getTime()) return fmt.format(start);
  return `${fmt.format(start)}–${fmt.format(end)}`;
}

/**
 * Resolve `intent.timeRange` into an absolute [start, end] window. If the
 * intent doesn't specify a window, default to "today" — most queries imply
 * "what's happening now-ish" rather than "across all time".
 */
export function resolveWindow(intent: QueryIntent, now: Date): Window {
  const t = intent.timeRange;
  if (t?.start && t.end) {
    const start = new Date(t.start);
    const end = new Date(t.end);
    return { start, end, label: formatRange(start, end) };
  }
  switch (t?.relativeHint) {
    case 'tomorrow': {
      const d = addDays(now, 1);
      return { start: startOfDay(d), end: endOfDay(d), label: 'tomorrow' };
    }
    case 'this_week': {
      const s = startOfWeek(now);
      const e = endOfDay(addDays(s, 6));
      return { start: s, end: e, label: `this week (${formatRange(s, e)})` };
    }
    case 'next_week': {
      const s = addDays(startOfWeek(now), 7);
      const e = endOfDay(addDays(s, 6));
      return { start: s, end: e, label: `next week (${formatRange(s, e)})` };
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { start: s, end: e, label: 'this month' };
    }
    case 'today':
    default:
      return { start: startOfDay(now), end: endOfDay(now), label: 'today' };
  }
}

// ─── Filtering helpers ──────────────────────────────────────────────────────

function isVisible(e: CalendarEvent): boolean {
  return !e.isCanceled && !e.isHidden;
}

function inWindow(e: CalendarEvent, w: Window): boolean {
  const s = new Date(e.start).getTime();
  return s >= w.start.getTime() && s <= w.end.getTime();
}

function matchesDayOfWeek(e: CalendarEvent, days: number[] | undefined): boolean {
  if (!days || days.length === 0) return true;
  return days.includes(new Date(e.start).getDay());
}

function eventInvolvesTeacher(e: CalendarEvent, teacherId: string): boolean {
  if (e.teacherId === teacherId) return true;
  return Array.isArray(e.staffMemberIds) && e.staffMemberIds.includes(teacherId);
}

function teacherIdsOnEvent(e: CalendarEvent): string[] {
  const ids = new Set<string>();
  if (e.teacherId) ids.add(e.teacherId);
  for (const id of e.staffMemberIds || []) ids.add(id);
  return Array.from(ids);
}

function summarize(
  e: CalendarEvent,
  ctx: Pick<ExecuteContext, 'teachers' | 'rooms' | 'activities'>,
): EventSummary {
  const teacherId = e.teacherId || e.staffMemberIds?.[0];
  const teacherName = teacherId
    ? ctx.teachers.find(t => t.id === teacherId)?.fullName
    : undefined;
  const roomName = e.roomId
    ? ctx.rooms.find(r => r.id === e.roomId)?.name
    : undefined;
  const activityName = e.activityId
    ? ctx.activities.find(a => a.id === e.activityId)?.name
    : undefined;
  return { id: e.id, name: e.name, start: e.start, end: e.end, teacherName, roomName, activityName };
}

/** Combine HH:MM with a date to a Date, or null when no timeOfDay supplied. */
function dateAtTime(date: Date, timeOfDay: string | undefined): Date | null {
  if (!timeOfDay) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay);
  if (!m) return null;
  const d = new Date(date);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

// ─── Per-intent executors ───────────────────────────────────────────────────

function execLookupSchedule(intent: QueryIntent, refs: ResolvedRefs, ctx: ExecuteContext): QueryResult {
  if (!refs.teacherId) return { kind: 'name_not_found', missingEntity: 'teacher' };
  const w = resolveWindow(intent, ctx.now);
  const matched = ctx.events.filter(e =>
    isVisible(e) &&
    eventInvolvesTeacher(e, refs.teacherId!) &&
    inWindow(e, w) &&
    matchesDayOfWeek(e, intent.filters?.dayOfWeek),
  ).sort((a, b) => a.start.localeCompare(b.start));

  if (matched.length === 0) {
    return { kind: 'no_results', windowLabel: w.label, message: `${refs.teacherFullName} has no events in this window.` };
  }
  return { kind: 'event_list', windowLabel: w.label, events: matched.map(e => summarize(e, ctx)) };
}

function execFindFreeRoom(intent: QueryIntent, _refs: ResolvedRefs, ctx: ExecuteContext): QueryResult {
  const w = resolveWindow(intent, ctx.now);
  const probe = dateAtTime(w.start, intent.timeRange?.timeOfDay);
  // If a specific minute was given, check availability at that instant; otherwise check the whole window.
  const checkStart = probe ?? w.start;
  const checkEnd = probe ? new Date(probe.getTime() + 60 * 1000) : w.end;

  const eligibleRooms = ctx.rooms.filter(r => !r.isArchived);
  const conflictsByRoom = new Map<string, CalendarEvent>();
  for (const e of ctx.events) {
    if (!isVisible(e) || !e.roomId) continue;
    if (!matchesDayOfWeek(e, intent.filters?.dayOfWeek)) continue;
    const es = new Date(e.start).getTime();
    const ee = new Date(e.end).getTime();
    if (es < checkEnd.getTime() && ee > checkStart.getTime()) {
      conflictsByRoom.set(e.roomId, e);
    }
  }

  const availability = eligibleRooms.map(r => {
    const conflict = conflictsByRoom.get(r.id);
    return conflict
      ? { roomId: r.id, roomName: r.name, isFree: false, conflictingEventName: conflict.name }
      : { roomId: r.id, roomName: r.name, isFree: true };
  });

  return { kind: 'room_availability', windowLabel: w.label, rooms: availability };
}

function execWhoIsWhere(intent: QueryIntent, refs: ResolvedRefs, ctx: ExecuteContext): QueryResult {
  if (intent.entityRefs.roomName && !refs.roomId) {
    return { kind: 'name_not_found', missingEntity: 'room' };
  }
  const probe = dateAtTime(ctx.now, intent.timeRange?.timeOfDay) ?? ctx.now;
  const t = probe.getTime();
  const live = ctx.events.filter(e => {
    if (!isVisible(e)) return false;
    if (refs.roomId && e.roomId !== refs.roomId) return false;
    return new Date(e.start).getTime() <= t && new Date(e.end).getTime() > t;
  });
  if (live.length === 0) return { kind: 'no_results', message: 'Nothing scheduled at that moment.' };
  return { kind: 'event_list', events: live.map(e => summarize(e, ctx)) };
}

function execCountEvents(intent: QueryIntent, refs: ResolvedRefs, ctx: ExecuteContext): QueryResult {
  const w = resolveWindow(intent, ctx.now);
  const filtered = ctx.events.filter(e => {
    if (!isVisible(e)) return false;
    if (!inWindow(e, w)) return false;
    if (refs.teacherId && !eventInvolvesTeacher(e, refs.teacherId)) return false;
    if (refs.roomId && e.roomId !== refs.roomId) return false;
    if (refs.activityId && e.activityId !== refs.activityId) return false;
    if (!matchesDayOfWeek(e, intent.filters?.dayOfWeek)) return false;
    return true;
  });
  return { kind: 'count', windowLabel: w.label, count: filtered.length };
}

function execNextEvent(_intent: QueryIntent, refs: ResolvedRefs, ctx: ExecuteContext): QueryResult {
  if (!refs.teacherId) return { kind: 'name_not_found', missingEntity: 'teacher' };
  const t = ctx.now.getTime();
  const upcoming = ctx.events
    .filter(e => isVisible(e) && eventInvolvesTeacher(e, refs.teacherId!) && new Date(e.start).getTime() >= t)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (upcoming.length === 0) {
    return { kind: 'no_results', message: `${refs.teacherFullName} has no upcoming events.` };
  }
  return { kind: 'single_event', events: [summarize(upcoming[0], ctx)] };
}

function execWhoTeaches(_intent: QueryIntent, refs: ResolvedRefs, ctx: ExecuteContext): QueryResult {
  if (!refs.activityId) return { kind: 'name_not_found', missingEntity: 'activity' };
  // Forward window only — "who currently teaches this" is more useful than "who ever did".
  const upcoming = ctx.events.filter(e =>
    isVisible(e) &&
    e.activityId === refs.activityId &&
    new Date(e.start).getTime() >= ctx.now.getTime(),
  );
  const teacherIds = new Set<string>();
  for (const e of upcoming) for (const id of teacherIdsOnEvent(e)) teacherIds.add(id);

  const people = Array.from(teacherIds)
    .map(id => ctx.teachers.find(t => t.id === id))
    .filter((t): t is Teacher => Boolean(t))
    .map(t => ({ id: t.id, name: t.fullName }));

  if (people.length === 0) {
    return { kind: 'no_results', message: `No upcoming events for ${refs.activityName}.` };
  }
  return { kind: 'people_list', people };
}

function execListForDay(intent: QueryIntent, _refs: ResolvedRefs, ctx: ExecuteContext): QueryResult {
  const w = resolveWindow(intent, ctx.now);
  const list = ctx.events.filter(e =>
    isVisible(e) && inWindow(e, w) && matchesDayOfWeek(e, intent.filters?.dayOfWeek),
  ).sort((a, b) => a.start.localeCompare(b.start));
  if (list.length === 0) return { kind: 'no_results', windowLabel: w.label, message: 'Nothing scheduled.' };
  return { kind: 'event_list', windowLabel: w.label, events: list.map(e => summarize(e, ctx)) };
}

function execCheckConflicts(intent: QueryIntent, refs: ResolvedRefs, ctx: ExecuteContext): QueryResult {
  const w = resolveWindow(intent, ctx.now);
  const scoped = ctx.events.filter(e =>
    isVisible(e) && inWindow(e, w) && (!refs.roomId || e.roomId === refs.roomId),
  );
  const raw = detectRoomConflicts(scoped);
  if (raw.length === 0) {
    return { kind: 'no_results', windowLabel: w.label, message: 'No conflicts found.' };
  }
  // Collapse by overlap window + room so the same double-booking isn't reported twice.
  const byKey = new Map<string, ConflictSummary>();
  for (const c of raw) {
    const key = `${c.roomId}|${c.overlapStart.toISOString()}|${c.overlapEnd.toISOString()}`;
    const roomName = ctx.rooms.find(r => r.id === c.roomId)?.name ?? c.roomId;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.eventNames.includes(c.eventA.name)) existing.eventNames.push(c.eventA.name);
      if (!existing.eventNames.includes(c.eventB.name)) existing.eventNames.push(c.eventB.name);
    } else {
      byKey.set(key, {
        roomName,
        startsAt: c.overlapStart.toISOString(),
        endsAt: c.overlapEnd.toISOString(),
        eventNames: [c.eventA.name, c.eventB.name],
      });
    }
  }
  return { kind: 'conflict_list', windowLabel: w.label, conflicts: Array.from(byKey.values()) };
}

// ─── Public dispatcher ──────────────────────────────────────────────────────

export function executeIntent(
  intent: QueryIntent,
  refs: ResolvedRefs,
  ctx: ExecuteContext,
): QueryResult {
  // Surface unresolved names before running any executor — they signal
  // "the question pointed at something we can't find" and the wrap step
  // handles them with a tailored "I didn't find …" message.
  if (refs.unresolved && refs.unresolved.length > 0) {
    return { kind: 'name_not_found', missingEntity: refs.unresolved[0] };
  }
  switch (intent.intent) {
    case 'lookup_schedule':  return execLookupSchedule(intent, refs, ctx);
    case 'find_free_room':   return execFindFreeRoom(intent, refs, ctx);
    case 'who_is_where':     return execWhoIsWhere(intent, refs, ctx);
    case 'count_events':     return execCountEvents(intent, refs, ctx);
    case 'next_event':       return execNextEvent(intent, refs, ctx);
    case 'who_teaches':      return execWhoTeaches(intent, refs, ctx);
    case 'list_for_day':     return execListForDay(intent, refs, ctx);
    case 'check_conflicts':  return execCheckConflicts(intent, refs, ctx);
    case 'unknown':
    default:                 return { kind: 'unsupported' };
  }
}
