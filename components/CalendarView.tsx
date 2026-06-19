import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { nowTimestamp } from '../utils/appTimestamp';
import { CalendarEvent, Teacher, Room, GanttBlock, AppSettings, RecurrenceRule, DayOfWeek } from '../types';
import { generateId } from '../constants';
import { ChevronLeft, ChevronRight, Filter, Calendar as CalendarIcon, GripHorizontal, X, Edit, Trash2, Clock, MapPin, User, AlertOctagon, CalendarRange, Plus, Zap, List, ChevronDown, Repeat, Ban, RotateCcw, HelpCircle, Search, Loader2, Sparkles, ClipboardCheck, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { syncEventToGoogle, removeEventFromGoogle, updateEventInGoogle } from '../utils/googleCalendarSync';
import { Modal } from './Modal';
import { EventFormV2, EventFormState, EventFormV2Handle } from './EventFormV2';

import { TRANSLATIONS } from '../constants';
import { detectRoomConflicts, getConflictingEventIds } from '../utils/roomConflicts';
import { ImportExportDropdown } from './ImportExportDropdown';
import { useSupabaseSync } from '../utils/useSupabaseSync';
import {
  ActivityV2, L1Subcategory, L2Subcategory, StaffMemberV2,
  TeachingAssignmentV2, OrgRoleV2, EventV2, EventParticipant, EnrollmentV2, StudentV2, V2_COLLECTIONS,
  AssignmentType,
} from '../types/v2';
import { BLUEPRINT_COLLECTIONS } from '../types/blueprint';
import type { AttendanceStatus, LessonCompletion, LessonRecord } from '../types/blueprint';
import { TagChip } from './TagChip';
import { hasEventDataError } from '../utils/eventValidation';
import { eventToV2 } from '../utils/canonicalAdapters';
import { buildEventAttendancePanelModel, buildUnmarkedAttendanceWorklist } from '../utils/lessonAttendancePanel';
import {
  LessonAttendanceError,
  applyLessonAttendancePreparation,
  applyLessonAttendanceUpdate,
  buildExistingLessonAttendanceUpdate,
  buildLessonAttendancePreparation,
} from '../utils/lessonAttendanceService';
import type { CalendarFilterState, CalendarSidebarTab } from '../types/calendarFilters';
interface Props {
  events: CalendarEvent[];
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  teachers: Teacher[];
  rooms: Room[];
  ganttBlocks: GanttBlock[];
  setGanttBlocks: React.Dispatch<React.SetStateAction<GanttBlock[]>>;
  settings: AppSettings;
  activities: ActivityV2[];

  // Navigation & View State
  onNavigate: (view: any) => void;
  currentView: string;
  selectionMode: 'NORMAL' | 'MARQUEE';
  setSelectionMode: (mode: 'NORMAL' | 'MARQUEE') => void;
  selectedEventIds: Set<string>;
  setSelectedEventIds: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Persistent Calendar State
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  viewMode: 'DAY' | 'WEEK' | 'MONTH';
  setViewMode: (mode: 'DAY' | 'WEEK' | 'MONTH') => void;

  // Sidebar tab (lifted to App.tsx)
  sidebarTab: CalendarSidebarTab | null;
  setSidebarTab: (tab: CalendarSidebarTab | null) => void;

  // Filter state (hoisted to App.tsx)
  filterState: CalendarFilterState;
  filterSet: (partial: Partial<CalendarFilterState>) => void;
  filterClear: () => void;
  filterIsActive: boolean;

  // v2 collections (hoisted to App.tsx)
  l1Subs: L1Subcategory[];
  l2Subs: L2Subcategory[];
  staffMembersV2: StaffMemberV2[];
  studentsV2: StudentV2[];
}

type ViewMode = 'DAY' | 'WEEK' | 'MONTH';

interface DragState {
  id: string;
  type: 'MOVE' | 'RESIZE';
  mode: 'TIME_GRID' | 'MONTH';
  startY: number;
  startX: number;
  originalStart: Date;
  originalEnd: Date;
}

type DetailItem =
  | { type: 'EVENT'; data: CalendarEvent }
  | { type: 'GANTT'; data: GanttBlock }
  | null;

const START_HOUR = 0;
const END_HOUR = 23;
const PIXELS_PER_HOUR = 60;
const SNAP_MINUTES = 15;
const ADAPTER_FALLBACK_TIMESTAMP = { seconds: 0, nanoseconds: 0 };

// Module-level scroll position — survives component re-mounts (sidebar toggle, etc.)
let savedScrollTop = 7 * PIXELS_PER_HOUR; // Default: scroll to 7 AM

const toDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateInputValue = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const next = new Date(`${value}T12:00:00`);
  return Number.isNaN(next.getTime()) ? null : next;
};

// Helper: Find the hour with the most events for smart centering
const findPeakEventHour = (eventsToCheck: CalendarEvent[], displayDate: Date): number => {
  const dayStart = new Date(displayDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(displayDate);
  dayEnd.setHours(23, 59, 59, 999);

  const hourCounts = new Array(24).fill(0);
  eventsToCheck.forEach(event => {
    const eventStart = new Date(event.start);
    if (eventStart >= dayStart && eventStart <= dayEnd) {
      const hour = eventStart.getHours();
      hourCounts[hour]++;
    }
  });

  let peakHour = 7; // Default fallback
  let maxCount = 0;
  hourCounts.forEach((count, hour) => {
    if (count > maxCount) {
      maxCount = count;
      peakHour = hour;
    }
  });

  return peakHour;
};

export const CalendarView: React.FC<Props> = ({
  events, setEvents, teachers, rooms, ganttBlocks, setGanttBlocks, settings, activities,
  onNavigate, currentView,
  selectionMode, setSelectionMode, selectedEventIds, setSelectedEventIds,
  currentDate, setCurrentDate, viewMode, setViewMode,
  sidebarTab, setSidebarTab,
  filterState, filterSet, filterClear, filterIsActive,
  l1Subs, l2Subs, staffMembersV2, studentsV2,
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const isRtl = settings?.language === 'he-IL';
  const { googleAccessToken, currentUser, isAdmin, isSuperAdmin, orgId } = useAuth();

  // Google Calendar sync is locked to the tenant admin who connected it
  const isCalendarOwner = currentUser?.email?.toLowerCase() === settings.googleCalendarConnectedBy?.toLowerCase();


  // ─── v2.0 Supabase hooks (Phase 5) ──────────────────────────────────────
  // l1Subs, l2Subs, staffMembersV2, studentsV2 are hoisted to App.tsx
  // activities prop is already ActivityV2[] from App.tsx — no redundant sync needed
  const [teachingAssignmentsV2] = useSupabaseSync<TeachingAssignmentV2>(V2_COLLECTIONS.teachingAssignments, []);
  const [orgRolesV2] = useSupabaseSync<OrgRoleV2>(V2_COLLECTIONS.orgRoles, []);
  const [eventsV2, setEventsV2] = useSupabaseSync<EventV2>(V2_COLLECTIONS.events, []);
  const [eventParticipantsV2, setEventParticipantsV2] = useSupabaseSync<EventParticipant>(V2_COLLECTIONS.eventParticipants, []);
  const [enrollments] = useSupabaseSync<EnrollmentV2>(V2_COLLECTIONS.enrollments, []);
  const [lessonRecords, setLessonRecords, lessonRecordsLoading] = useSupabaseSync<LessonRecord>(BLUEPRINT_COLLECTIONS.lessonRecords, []);
  const students = studentsV2;

  // ─── CSV Import/Export data ──────────────────────────────────────────────
  const canWriteCalendar = isSuperAdmin || isAdmin;

  const eventExportData = useMemo(() => eventsV2.map(e => ({
    activityName: activities.find(a => a.id === e.activityId)?.name || '',
    l2Name: l2Subs.find(l => l.id === e.l2Id)?.name || '',
    date: e.date || '',
    startTime: e.startTime || '',
    endTime: e.endTime || '',
    location: e.location || '',
  })), [eventsV2, activities, l2Subs]);

  const eventDupKeys = useMemo(() => new Set(eventsV2.map(e => {
    const aName = activities.find(a => a.id === e.activityId)?.name || '';
    const lName = l2Subs.find(l => l.id === e.l2Id)?.name || '';
    return `${aName}|${lName}|${e.date}|${e.startTime}`.toLowerCase();
  })), [eventsV2, activities, l2Subs]);

  const csvActivityByName = useMemo(
    () => Object.fromEntries(activities.map(a => [a.name.toLowerCase(), a.id])),
    [activities],
  );
  const csvL2ByName = useMemo(
    () => Object.fromEntries(l2Subs.map(l => [l.name.toLowerCase(), l.id])),
    [l2Subs],
  );

  const handleEventImportComplete = useCallback((rows: Record<string, string>[]) => {
    const now = nowTimestamp();
    const newEvents: EventV2[] = rows.map(row => {
      const actId = csvActivityByName[row['activityName']?.trim().toLowerCase() || ''] || '';
      const l2Id = csvL2ByName[row['l2Name']?.trim().toLowerCase() || ''] || null;
      const start = row['startTime'] || '09:00';
      const end = row['endTime'] || '10:00';
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
      return {
        id: generateId(), orgId: orgId || '',
        name: row['activityName'] || '',
        activityId: actId,
        l1Id: null, l2Id,
        location: row['location'] || '',
        date: row['date'] || '',
        startTime: start, endTime: end,
        durationMinutes: Math.max(0, durationMinutes),
        isRecurring: false, recurringGroupId: null,
        status: 'SCHEDULED' as const,
        notes: null,
        createdAt: now, updatedAt: now,
      };
    });
    setEventsV2(prev => [...prev, ...newEvents]);
  }, [orgId, setEventsV2, csvActivityByName, csvL2ByName]);

  // Interaction State
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [tempEvent, setTempEvent] = useState<CalendarEvent | null>(null);
  const wasDraggingRef = useRef(false);
  const gridDaysRef = useRef<Date[]>([]);

  const [showHelp, setShowHelp] = useState(false);

  // Modal State (Edit/Create)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAnchorPosition, setModalAnchorPosition] = useState<{ x: number; y: number } | null>(null);
  const [editingEvent, setEditingEvent] = useState<Partial<CalendarEvent>>({});

  // Detail Popover State
  const [detailItem, setDetailItem] = useState<DetailItem>(null);
  const [attendanceWorklistOpen, setAttendanceWorklistOpen] = useState(false);
  const [attendanceSavingId, setAttendanceSavingId] = useState<string | null>(null);
  const [attendancePreparing, setAttendancePreparing] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const attendanceEventsV2 = useMemo(() => events.map(event => eventToV2(event, {
    orgId: orgId || '',
    timeZone: settings.timeZone || 'UTC',
    now: ADAPTER_FALLBACK_TIMESTAMP,
  })), [events, orgId, settings.timeZone]);
  const unmarkedAttendanceWorklist = useMemo(() => buildUnmarkedAttendanceWorklist({
    lessons: lessonRecords,
    events: attendanceEventsV2.map(event => ({
      id: event.id,
      name: event.name,
      date: event.date,
      startTime: event.startTime,
    })),
    students: students.map(student => ({ id: student.id, fullName: student.fullName })),
    limit: 25,
  }), [attendanceEventsV2, lessonRecords, students]);
  const eventAttendancePanel = useMemo(() => {
    if (detailItem?.type !== 'EVENT') return null;
    const eventV2 = attendanceEventsV2.find(event => event.id === detailItem.data.id) ?? eventToV2(detailItem.data, {
      orgId: orgId || '',
      timeZone: settings.timeZone || 'UTC',
      now: ADAPTER_FALLBACK_TIMESTAMP,
    });
    return buildEventAttendancePanelModel({
      event: eventV2,
      lessons: lessonRecords,
      students: students.map(student => ({ id: student.id, fullName: student.fullName })),
      loading: lessonRecordsLoading,
    });
  }, [attendanceEventsV2, detailItem, lessonRecords, lessonRecordsLoading, orgId, settings.timeZone, students]);
  const currentStaffMemberId = useMemo(() => {
    const email = currentUser?.email?.toLowerCase();
    const uid = currentUser?.uid ?? currentUser?.id;
    return staffMembersV2.find(staff => (
      (uid && staff.uid === uid)
      || (email && staff.email?.toLowerCase() === email)
    ))?.id ?? null;
  }, [currentUser, staffMembersV2]);

  // Right-click Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; event: CalendarEvent } | null>(null);

  // Recurrence Dialog State
  const [recurrenceDialog, setRecurrenceDialog] = useState<{
    type: 'EDIT' | 'DELETE' | 'CANCEL';
    event: CalendarEvent;
  } | null>(null);

  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const [jumpDateValue, setJumpDateValue] = useState(() => toDateInputValue(currentDate));
  const [eventFormCanSave, setEventFormCanSave] = useState(false);

  // Marquee Drag-to-Select State
  const [marqueeActive, setMarqueeActive] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number } | null>(null);
  const marqueeContainerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<EventFormV2Handle>(null);

  // Gantt Collapsible State
  const [isGanttExpanded, setIsGanttExpanded] = useState(true);

  // Month sub-mode: EVENTS (inline event list; Gantt rubric on hover) or GANTT (overlay; events on hover).
  // Always defaults to EVENTS on mount — no persistence.
  const [monthSubMode, setMonthSubMode] = useState<'GANTT' | 'EVENTS'>('EVENTS');

  // Latest events for scroll-centering — read inside the view/date effect without
  // forcing it to re-run on every event mutation (which would scroll-jump mid-edit).
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Preserve scroll position across re-mounts (view switching to/from Power Tools/Gantt)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const evts = eventsRef.current;
    const peakHour = findPeakEventHour(evts, currentDate);
    const centerHour = Math.max(START_HOUR, Math.min(peakHour - 1, END_HOUR - 2));
    const smartScrollTop = centerHour * PIXELS_PER_HOUR;

    const hasEventsOnDate = evts.some((e: CalendarEvent) => {
      const eStart = new Date(e.start);
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);
      return eStart >= dayStart && eStart <= dayEnd;
    });

    el.scrollTop = hasEventsOnDate ? smartScrollTop : savedScrollTop;

    const handleScroll = () => { savedScrollTop = el.scrollTop; };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [viewMode, currentDate]);

  useEffect(() => {
    setJumpDateValue(toDateInputValue(currentDate));
  }, [currentDate]);

  const commitJumpDate = useCallback((value: string) => {
    const next = parseDateInputValue(value);
    if (!next) {
      setJumpDateValue(toDateInputValue(currentDate));
      return;
    }
    setCurrentDate(next);
  }, [currentDate, setCurrentDate]);

  const DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const DAY_ABBR: DayOfWeek[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  const expandRecurrence = useCallback((parentEvent: CalendarEvent, windowStart: Date, windowEnd: Date): CalendarEvent[] => {
    const rule = parentEvent.recurrenceRule;
    if (!rule) return [];

    const occurrences: CalendarEvent[] = [];
    const eventStart = new Date(parentEvent.start);
    const eventEnd = new Date(parentEvent.end);
    const duration = eventEnd.getTime() - eventStart.getTime();
    const exceptions = new Set(parentEvent.exceptions || []);

    let currentDate = new Date(eventStart);
    let count = 0;
    const maxIterations = 500;

    while (count < maxIterations) {
      const dateKey = currentDate.toISOString().split('T')[0];

      // Check termination
      if (rule.untilDate && currentDate > new Date(rule.untilDate)) break;
      if (rule.count && count >= rule.count) break;
      if (currentDate > windowEnd) break;

      // Generate occurrence if within window and not an exception
      if (currentDate >= windowStart && !exceptions.has(dateKey)) {
        const occStart = new Date(currentDate);
        occStart.setHours(eventStart.getHours(), eventStart.getMinutes(), 0, 0);
        const occEnd = new Date(occStart.getTime() + duration);

        occurrences.push({
          ...parentEvent,
          id: `${parentEvent.id}_${dateKey}`,
          start: occStart.toISOString(),
          end: occEnd.toISOString(),
          recurrenceId: parentEvent.id,
        });
      }

      count++;

      // Advance to next occurrence
      const nextDate = new Date(currentDate);
      switch (rule.frequency) {
        case 'DAILY':
          nextDate.setDate(nextDate.getDate() + rule.interval);
          break;
        case 'WEEKLY':
          if (rule.byDay && rule.byDay.length > 0) {
            // Find next matching day
            let found = false;
            for (let d = 1; d <= 7 * rule.interval; d++) {
              const tryDate = new Date(currentDate);
              tryDate.setDate(tryDate.getDate() + d);
              const dayAbbr = DAY_ABBR[tryDate.getDay()];
              if (rule.byDay.includes(dayAbbr)) {
                nextDate.setTime(tryDate.getTime());
                found = true;
                break;
              }
            }
            if (!found) nextDate.setDate(nextDate.getDate() + 7 * rule.interval);
          } else {
            nextDate.setDate(nextDate.getDate() + 7 * rule.interval);
          }
          break;
        case 'MONTHLY':
          if (rule.bySetPos && rule.byDayOfWeek) {
            // "Nth weekday of month" mode
            const nextMonth = new Date(nextDate);
            nextMonth.setMonth(nextMonth.getMonth() + rule.interval, 1);
            const targetDay = DAY_MAP[rule.byDayOfWeek];
            let matchCount = 0;
            let found = false;
            for (let d = 1; d <= 31; d++) {
              const tryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), d);
              if (tryDate.getMonth() !== nextMonth.getMonth()) break;
              if (tryDate.getDay() === targetDay) {
                matchCount++;
                if (matchCount === rule.bySetPos) {
                  nextDate.setTime(tryDate.getTime());
                  found = true;
                  break;
                }
              }
            }
            if (!found) {
              // Skip this month (e.g., no 5th Friday)
              nextDate.setMonth(nextDate.getMonth() + rule.interval, 1);
            }
          } else {
            // "Same date" mode
            nextDate.setMonth(nextDate.getMonth() + rule.interval);
            // Handle month-end overflow
            const targetDay = rule.byMonthDay || eventStart.getDate();
            const daysInMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
            nextDate.setDate(Math.min(targetDay, daysInMonth));
          }
          break;
      }

      currentDate = nextDate;
    }

    return occurrences;
  }, []);

  // Expand recurring events and merge with regular events
  const expandedEvents = useMemo(() => {
    // Determine the visible window based on viewMode
    let windowStart = new Date(currentDate);
    let windowEnd = new Date(currentDate);

    if (viewMode === 'DAY') {
      windowStart.setHours(0, 0, 0, 0);
      windowEnd.setHours(23, 59, 59, 999);
    } else if (viewMode === 'WEEK') {
      const dayOfWeek = windowStart.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      windowStart.setDate(windowStart.getDate() + diff);
      windowStart.setHours(0, 0, 0, 0);
      windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + 6);
      windowEnd.setHours(23, 59, 59, 999);
    } else {
      windowStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      windowEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // Add buffer
    const bufferStart = new Date(windowStart);
    bufferStart.setDate(bufferStart.getDate() - 7);
    const bufferEnd = new Date(windowEnd);
    bufferEnd.setDate(bufferEnd.getDate() + 7);

    const nonRecurring = events.filter(e => !e.recurrenceRule);
    const recurring = events.filter(e => e.recurrenceRule && !e.recurrenceId);
    const exceptionEdits = events.filter(e => e.isExceptionEdit);

    const expanded: CalendarEvent[] = [];
    for (const parent of recurring) {
      expanded.push(...expandRecurrence(parent, bufferStart, bufferEnd));
    }

    // Override expanded instances with exception edits
    const exceptionMap = new Map(exceptionEdits.map(e => [e.originalStart, e]));
    const finalExpanded = expanded.map(occ => {
      const dateKey = new Date(occ.start).toISOString().split('T')[0];
      const exception = exceptionMap.get(dateKey);
      return exception || occ;
    });

    return [...nonRecurring, ...finalExpanded];
  }, [events, currentDate, viewMode, expandRecurrence]);

  // --- Format Helpers ---
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(settings.language, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: settings.timeFormat === '12h'
    });
  };

  // --- Date Helpers ---

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day;
    const newDate = new Date(date.setDate(diff));
    newDate.setHours(0, 0, 0, 0);
    return newDate;
  };

  const getWeekDays = (baseDate: Date) => {
    const start = getStartOfWeek(baseDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  };

  const getMonthDays = (baseDate: Date) => {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const startDay = firstDayOfMonth.getDay(); // 0 is Sunday

    // Start from the previous Sunday for week consistency
    const startDate = new Date(firstDayOfMonth);
    const diff = startDay;
    startDate.setDate(startDate.getDate() - diff);

    const days = [];
    // 6 weeks * 7 days = 42 grid cells covers all months
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const getWeekNumber = (d: Date) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // --- Filtering & Derived Data ---

  // Pre-computed lookup indexes — stable unless their source arrays change
  const eventsV2ById = useMemo(() => new Map(eventsV2.map(e => [e.id, e])), [eventsV2]);

  const participantsByEventId = useMemo(() => {
    const map = new Map<string, EventParticipant[]>();
    for (const p of eventParticipantsV2) {
      const arr = map.get(p.eventId) ?? [];
      arr.push(p);
      map.set(p.eventId, arr);
    }
    return map;
  }, [eventParticipantsV2]);

  // Resolve participants for an event, falling back to legacy single-teacher events
  // that predate the EventParticipant table.
  const resolveParticipants = useCallback(
    (parentId: string, legacyTeacherId?: string): EventParticipant[] =>
      participantsByEventId.get(parentId) ??
      (legacyTeacherId
        ? [{ staffMemberId: legacyTeacherId, assignmentType: 'TEACHING' as AssignmentType } as EventParticipant]
        : []),
    [participantsByEventId]
  );

  const activityById = useMemo(() => new Map(activities.map(a => [a.id, a])), [activities]);

  const staffById = useMemo(() => new Map(staffMembersV2.map(s => [s.id, s])), [staffMembersV2]);

  const enrollmentsByActivityL2 = useMemo(() => {
    const map = new Map<string, EnrollmentV2[]>();
    for (const e of enrollments) {
      const key = `${e.activityId}|${e.l2Id}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [enrollments]);

  const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

  // Union of all tags across events — used for autocomplete in EventFormV2 and the calendar tag filter.
  const allEventTags = useMemo(() => {
    const seen = new Map<string, string>(); // lower → original-case
    for (const e of events) {
      for (const t of e.tags || []) {
        const k = t.toLowerCase();
        if (!seen.has(k)) seen.set(k, t);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const fs = filterState;

    const evts = expandedEvents.filter(evt => {
      // Resolve the parent event ID (recurring instances have id = `${parentId}_YYYY-MM-DD`)
      const parentId = evt.recurrenceId || evt.id;
      const v2 = eventsV2ById.get(parentId);

      // Coerce status from v2 or legacy boolean fields
      const status = v2?.status ?? (evt.isCanceled ? 'CANCELLED' : evt.isHidden ? 'ARCHIVED' : 'SCHEDULED');

      if (fs.status.length > 0 && !fs.status.includes(status)) return false;

      // Recurrence
      const isRec = !!(evt.recurrenceRule || evt.recurrenceId);
      if (fs.recurrence === 'RECURRING' && !isRec) return false;
      if (fs.recurrence === 'ONE_OFF' && isRec) return false;

      // Taxonomy
      const actId = evt.activityId || v2?.activityId || '';
      if (fs.activityId.length > 0 && !fs.activityId.includes(actId)) return false;

      const l1Id = v2?.l1Id ?? null;
      if (fs.l1Id.length > 0 && (l1Id === null || !fs.l1Id.includes(l1Id))) return false;

      const l2Id = v2?.l2Id ?? null;
      if (fs.l2Id.length > 0 && (l2Id === null || !fs.l2Id.includes(l2Id))) return false;

      if (fs.activityType.length > 0) {
        const act = activityById.get(actId);
        if (!act || !fs.activityType.includes(act.activityType)) return false;
      }
      if (fs.template.length > 0) {
        const act = activityById.get(actId);
        if (!act || !fs.template.includes(act.template)) return false;
      }

      // Location (v2 field, no legacy equivalent)
      const location = v2?.location ?? '';
      if (fs.location.length > 0 && !fs.location.includes(location)) return false;

      // Staff via EventParticipant (with legacy teacherId fallback)
      if (fs.staffMemberId.length > 0 || fs.assignmentType.length > 0 || fs.staffRole.length > 0) {
        const participants = resolveParticipants(parentId, evt.teacherId);

        if (fs.staffMemberId.length > 0) {
          if (!participants.some(p => fs.staffMemberId.includes(p.staffMemberId))) return false;
        }
        if (fs.assignmentType.length > 0) {
          if (!participants.some(p => fs.assignmentType.includes(p.assignmentType))) return false;
        }
        if (fs.staffRole.length > 0) {
          if (!participants.some(p => {
            const staff = staffById.get(p.staffMemberId);
            return staff && fs.staffRole.includes(staff.role);
          })) return false;
        }
      }

      // Student / Student Tag via EnrollmentV2
      if (fs.studentId.length > 0 || fs.studentTag.length > 0) {
        const key = `${actId}|${l2Id}`;
        const active = (enrollmentsByActivityL2.get(key) ?? []).filter(e => e.status === 'ACTIVE');
        if (fs.studentId.length > 0) {
          if (!active.some(e => fs.studentId.includes(e.studentId))) return false;
        }
        if (fs.studentTag.length > 0) {
          if (!active.some(e => {
            const stu = studentById.get(e.studentId);
            return stu && stu.tags.some(tag => fs.studentTag.includes(tag));
          })) return false;
        }
      }

      // Event tag filter — match if event has any of the selected tags
      if (fs.eventTag.length > 0) {
        const evtTags = evt.tags || [];
        if (!evtTags.some(tag => fs.eventTag.includes(tag))) return false;
      }

      // Validation error derived filter
      if (fs.hasValidationError && !hasEventDataError(evt)) return false;

      // Text search — matches name, location/room, notes, activity, L1/L2,
      // staff/teacher names, and enrolled student names.
      if (fs.search.trim()) {
        const q = fs.search.toLowerCase();
        const haystack: string[] = [
          evt.name ?? '',
          location,
          v2?.notes ?? '',
        ];

        const act = activityById.get(actId);
        if (act?.name) haystack.push(act.name);

        if (l1Id) {
          const l1 = l1Subs.find(l => l.id === l1Id);
          if (l1?.name) haystack.push(l1.name);
        }
        if (l2Id) {
          const l2 = l2Subs.find(l => l.id === l2Id);
          if (l2?.name) haystack.push(l2.name);
        }

        const participants = resolveParticipants(parentId, evt.teacherId);
        for (const p of participants) {
          const staff = staffById.get(p.staffMemberId);
          if (staff?.fullName) haystack.push(staff.fullName);
        }

        if (l2Id) {
          const enrollKey = `${actId}|${l2Id}`;
          const active = (enrollmentsByActivityL2.get(enrollKey) ?? []).filter(e => e.status === 'ACTIVE');
          for (const e of active) {
            const stu = studentById.get(e.studentId);
            if (stu?.fullName) haystack.push(stu.fullName);
          }
        }

        if (!haystack.some(s => s.toLowerCase().includes(q))) return false;
      }

      return true;
    });

    // Room conflict filter — post-filter set operation (expensive, run last)
    if (fs.hasRoomConflict) {
      const conflicts = detectRoomConflicts(evts);
      const conflictingIds = getConflictingEventIds(conflicts);
      return evts.filter(e => conflictingIds.has(e.id));
    }

    return evts;
  }, [
    expandedEvents, filterState,
    eventsV2ById, activityById, resolveParticipants, staffById,
    enrollmentsByActivityL2, studentById, l1Subs, l2Subs,
  ]);

  const conflictingIds = useMemo(() => {
    const conflicts = detectRoomConflicts(filteredEvents);
    return getConflictingEventIds(conflicts);
  }, [filteredEvents]);

  // BL01: Total unresolved room-conflict count across all (unfiltered) expanded events.
  // Distinct from conflictingIds (which is scoped to the current filtered view) — the badge
  // represents conflicts in the system, not within the current filter window.
  const unresolvedConflictCount = useMemo(() => {
    return detectRoomConflicts(expandedEvents).length;
  }, [expandedEvents]);

  // BL01: Active filter pill descriptors — one entry per non-default dimension.
  const activeFilterPills = useMemo(() => {
    const pills: Array<{ key: string; label: string; clear: () => void }> = [];
    const fs = filterState;
    const joinLabels = <T extends string>(values: T[], labels: Record<T, string>) =>
      values.map(value => labels[value] ?? value).join(', ');
    const statusLabels = {
      SCHEDULED: t('cal.filter.status.scheduled'),
      COMPLETED: t('cal.filter.status.completed'),
      CANCELLED: t('cal.filter.status.cancelled'),
      ARCHIVED: t('cal.filter.status.archived'),
    };
    const recurrenceLabels = {
      ALL: t('cal.filter.recurrence.all'),
      RECURRING: t('cal.filter.recurrence.recurring'),
      ONE_OFF: t('cal.filter.recurrence.one_off'),
    };
    const activityTypeLabels = {
      ACADEMIC: t('cal.filter.type.academic'),
      ADMINISTRATIVE: t('cal.filter.type.administrative'),
      PERFORMANCES: t('cal.filter.type.performances'),
      SPECIAL_EVENTS: t('cal.filter.type.special_events'),
    };
    const templateLabels = {
      DISCIPLINE: t('cal.filter.tmpl.discipline'),
      PROGRAM: t('cal.filter.tmpl.program'),
      ENSEMBLE: t('cal.filter.tmpl.ensemble'),
      EXTERNAL: t('cal.filter.tmpl.external'),
      ADMINISTRATIVE: t('cal.filter.tmpl.administrative'),
    };
    const assignmentTypeLabels = {
      TEACHING: t('cal.filter.assign.teaching'),
      ORG_ROLE: t('cal.filter.assign.org_role'),
    };
    const staffRoleLabels = {
      SUPER_ADMIN: t('cal.filter.role.super_admin'),
      ADMIN: t('cal.filter.role.admin'),
      STAFF: t('cal.filter.role.staff'),
    };
    const defaultStatus = new Set(['SCHEDULED', 'COMPLETED']);
    const stateStatus = new Set(fs.status);
    if (stateStatus.size !== defaultStatus.size || [...stateStatus].some(s => !defaultStatus.has(s as string))) {
      const statusText = fs.status.length > 0
        ? joinLabels(fs.status, statusLabels)
        : t('cal.filter.status.none');
      pills.push({ key: 'status', label: `${t('cal.filter.status.label')}: ${statusText}`, clear: () => filterSet({ status: ['SCHEDULED', 'COMPLETED'] }) });
    }
    if (fs.recurrence !== 'ALL') {
      pills.push({ key: 'recurrence', label: `${t('cal.filter.recurrence.label')}: ${recurrenceLabels[fs.recurrence]}`, clear: () => filterSet({ recurrence: 'ALL' }) });
    }
    if (fs.activityType.length > 0) {
      pills.push({ key: 'activityType', label: `${t('cal.filter.type.label')}: ${joinLabels(fs.activityType, activityTypeLabels)}`, clear: () => filterSet({ activityType: [] }) });
    }
    if (fs.template.length > 0) {
      pills.push({ key: 'template', label: `${t('cal.filter.tmpl.label')}: ${joinLabels(fs.template, templateLabels)}`, clear: () => filterSet({ template: [] }) });
    }
    if (fs.activityId.length > 0) {
      const names = fs.activityId.map(id => activityById.get(id)?.name ?? id);
      pills.push({ key: 'activityId', label: `${t('cal.filter.activity.label')}: ${names.join(', ')}`, clear: () => filterSet({ activityId: [], l1Id: [], l2Id: [] }) });
    }
    if (fs.l1Id.length > 0) {
      const names = fs.l1Id.map(id => l1Subs.find(l => l.id === id)?.name ?? id);
      pills.push({ key: 'l1Id', label: `L1: ${names.join(', ')}`, clear: () => filterSet({ l1Id: [], l2Id: [] }) });
    }
    if (fs.l2Id.length > 0) {
      const names = fs.l2Id.map(id => l2Subs.find(l => l.id === id)?.name ?? id);
      pills.push({ key: 'l2Id', label: `L2: ${names.join(', ')}`, clear: () => filterSet({ l2Id: [] }) });
    }
    if (fs.staffMemberId.length > 0) {
      const names = fs.staffMemberId.map(id => staffById.get(id)?.fullName ?? id);
      pills.push({ key: 'staff', label: `${t('cal.filter.staff.label')}: ${names.join(', ')}`, clear: () => filterSet({ staffMemberId: [], assignmentType: [] }) });
    }
    if (fs.assignmentType.length > 0) {
      pills.push({ key: 'assignmentType', label: `${t('cal.filter.assign.label')}: ${joinLabels(fs.assignmentType, assignmentTypeLabels)}`, clear: () => filterSet({ assignmentType: [] }) });
    }
    if (fs.staffRole.length > 0) {
      pills.push({ key: 'staffRole', label: `${t('cal.filter.role.label')}: ${joinLabels(fs.staffRole, staffRoleLabels)}`, clear: () => filterSet({ staffRole: [] }) });
    }
    if (fs.studentId.length > 0) {
      const names = fs.studentId.map(id => studentById.get(id)?.fullName ?? id);
      pills.push({ key: 'studentId', label: `${t('cal.filter.student.label')}: ${names.join(', ')}`, clear: () => filterSet({ studentId: [] }) });
    }
    if (fs.studentTag.length > 0) {
      pills.push({ key: 'studentTag', label: `${t('cal.filter.student_tag.label')}: ${fs.studentTag.join(', ')}`, clear: () => filterSet({ studentTag: [] }) });
    }
    if (fs.eventTag.length > 0) {
      pills.push({ key: 'eventTag', label: `${t('cal.filter.event_tag.label')}: ${fs.eventTag.join(', ')}`, clear: () => filterSet({ eventTag: [] }) });
    }
    if (fs.location.length > 0) {
      pills.push({ key: 'location', label: `${t('cal.filter.location.label')}: ${fs.location.join(', ')}`, clear: () => filterSet({ location: [] }) });
    }
    if (fs.hasRoomConflict) {
      pills.push({ key: 'roomConflict', label: t('cal.filter.has_room_conflict'), clear: () => filterSet({ hasRoomConflict: false }) });
    }
    if (fs.hasValidationError) {
      pills.push({ key: 'validationError', label: t('cal.filter.has_validation_error'), clear: () => filterSet({ hasValidationError: false }) });
    }
    if (fs.search) {
      pills.push({ key: 'search', label: `"${fs.search}"`, clear: () => filterSet({ search: '' }) });
    }
    return pills;
  }, [filterState, activityById, l1Subs, l2Subs, staffById, studentById, t, filterSet]);

  const attendanceLabels: Record<AttendanceStatus, string> = {
    UNMARKED: t('attendance.status.unmarked'),
    PRESENT: t('attendance.status.present'),
    ABSENT: t('attendance.status.absent'),
    LATE: t('attendance.status.late'),
    EXCUSED: t('attendance.status.excused'),
    MAKEUP: t('attendance.status.makeup'),
  };

  const completionLabels: Record<LessonCompletion, string> = {
    PENDING: t('attendance.completion.pending'),
    COMPLETED: t('attendance.completion.completed'),
    CANCELLED: t('attendance.completion.cancelled'),
    NO_SHOW: t('attendance.completion.no_show'),
  };

  const attendanceBadgeClass: Record<AttendanceStatus, string> = {
    UNMARKED: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-300 dark:border-emerald-800',
    ABSENT: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/25 dark:text-red-300 dark:border-red-800',
    LATE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/25 dark:text-amber-300 dark:border-amber-800',
    EXCUSED: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/25 dark:text-blue-300 dark:border-blue-800',
    MAKEUP: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/25 dark:text-indigo-300 dark:border-indigo-800',
  };
  const attendanceActionStatuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'MAKEUP', 'UNMARKED'];
  const canMarkLesson = (lesson: LessonRecord) => (
    isAdmin || isSuperAdmin || Boolean(currentStaffMemberId && lesson.staffMemberId === currentStaffMemberId)
  );
  const selectedEventParticipants = useMemo(() => {
    if (detailItem?.type !== 'EVENT') return [];
    const parentId = detailItem.data.recurrenceId || detailItem.data.id;
    return resolveParticipants(parentId, detailItem.data.teacherId);
  }, [detailItem, resolveParticipants]);
  const canPrepareSelectedEvent = useMemo(() => {
    if (detailItem?.type !== 'EVENT') return false;
    if (isAdmin || isSuperAdmin) return true;
    if (!currentStaffMemberId) return false;
    return selectedEventParticipants.some(participant => participant.staffMemberId === currentStaffMemberId)
      || detailItem.data.staffMemberIds?.includes(currentStaffMemberId)
      || detailItem.data.teacherId === currentStaffMemberId;
  }, [currentStaffMemberId, detailItem, isAdmin, isSuperAdmin, selectedEventParticipants]);
  const markAttendanceAria = (studentName: string, status: AttendanceStatus) => (
    t('attendance.panel.mark_aria')
      .replace('{student}', studentName)
      .replace('{status}', attendanceLabels[status])
  );

  const handleLessonAttendanceMark = async (lesson: LessonRecord, status: AttendanceStatus) => {
    if (detailItem?.type !== 'EVENT' || lesson.attendance === status) return;
    setAttendanceSavingId(lesson.id);
    setAttendanceError(null);
    const updatedAt = new Date().toISOString();
    try {
      const plan = buildExistingLessonAttendanceUpdate({
        event: detailItem.data,
        lessons: lessonRecords,
        lessonId: lesson.id,
        patch: { attendance: status },
        context: {
          orgId: orgId || '',
          timeZone: settings.timeZone || 'UTC',
          adapterNow: nowTimestamp(),
          updatedAt,
          actor: {
            userId: currentUser?.id ?? currentUser?.uid ?? null,
            staffMemberId: currentStaffMemberId,
            canAdminOverride: isAdmin || isSuperAdmin,
          },
        },
      });
      const nextLessons = applyLessonAttendanceUpdate(lessonRecords, plan.lesson);
      await setLessonRecords(nextLessons);
    } catch (error) {
      const code = error instanceof LessonAttendanceError ? error.code : 'UNKNOWN';
      setAttendanceError(`${t('attendance.panel.mark_error')} (${code})`);
    } finally {
      setAttendanceSavingId(null);
    }
  };

  const handlePrepareAttendanceRows = async () => {
    if (detailItem?.type !== 'EVENT' || attendancePreparing) return;
    setAttendancePreparing(true);
    setAttendanceError(null);
    const updatedAt = new Date().toISOString();
    try {
      const plan = buildLessonAttendancePreparation({
        event: detailItem.data,
        eventV2: eventsV2ById.get(detailItem.data.id) ?? null,
        lessons: lessonRecords,
        enrollments,
        participants: selectedEventParticipants,
        context: {
          orgId: orgId || '',
          timeZone: settings.timeZone || 'UTC',
          adapterNow: nowTimestamp(),
          updatedAt,
          actor: {
            userId: currentUser?.id ?? currentUser?.uid ?? null,
            staffMemberId: currentStaffMemberId,
            canAdminOverride: isAdmin || isSuperAdmin,
          },
        },
        idFactory: generateId,
      });
      if (plan.preparedLessons.length === 0) {
        setAttendanceError(t('attendance.panel.prepare_none'));
        return;
      }
      const nextLessons = applyLessonAttendancePreparation(lessonRecords, plan.preparedLessons);
      await setLessonRecords(nextLessons);
    } catch (error) {
      const code = error instanceof LessonAttendanceError ? error.code : 'UNKNOWN';
      setAttendanceError(`${t('attendance.panel.prepare_error')} (${code})`);
    } finally {
      setAttendancePreparing(false);
    }
  };

  const renderAttendancePanel = () => {
    if (!eventAttendancePanel) return null;

    const shellClass = 'mt-5 rounded-lg border border-stone-200 bg-stone-50/80 p-3 text-start dark:border-slate-700 dark:bg-slate-800/45';

    if (eventAttendancePanel.state === 'loading') {
      return (
        <section data-testid="event-attendance-panel" dir={isRtl ? 'rtl' : 'ltr'} className={shellClass}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Loader2 size={16} className="animate-spin text-blue-600" />
            {t('attendance.panel.loading')}
          </div>
        </section>
      );
    }

    if (eventAttendancePanel.state === 'error') {
      return (
        <section data-testid="event-attendance-panel" dir={isRtl ? 'rtl' : 'ltr'} className={shellClass}>
          <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertOctagon size={16} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">{t('attendance.panel.error_title')}</p>
              <p className="text-xs text-red-600/85 dark:text-red-300/80">{t('attendance.panel.error_body')}</p>
            </div>
          </div>
        </section>
      );
    }

    if (eventAttendancePanel.state === 'empty') {
      return (
        <section data-testid="event-attendance-panel" dir={isRtl ? 'rtl' : 'ltr'} className={shellClass}>
          <div className="flex items-start gap-2">
            <ClipboardCheck size={16} className="mt-0.5 flex-shrink-0 text-slate-500 dark:text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('attendance.panel.no_rows_title')}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('attendance.panel.no_rows_body')}</p>
              {attendanceError && (
                <div data-testid="attendance-mark-error" className="mt-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {attendanceError}
                </div>
              )}
              <button
                type="button"
                onClick={handlePrepareAttendanceRows}
                disabled={!canPrepareSelectedEvent || attendancePreparing}
                className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-cadenza-200 bg-cadenza-50 px-3 py-1.5 text-xs font-semibold text-cadenza-800 transition-colors hover:border-cadenza-300 hover:bg-cadenza-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cadenza-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cadenza-900/70 dark:bg-cadenza-950/30 dark:text-cadenza-200"
              >
                {attendancePreparing ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />}
                {attendancePreparing ? t('attendance.panel.preparing') : t('attendance.panel.prepare_rows')}
              </button>
              {!canPrepareSelectedEvent && (
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{t('attendance.panel.prepare_not_allowed')}</p>
              )}
            </div>
          </div>
        </section>
      );
    }

    return (
      <section data-testid="event-attendance-panel" dir={isRtl ? 'rtl' : 'ltr'} className={shellClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardCheck size={16} className="flex-shrink-0 text-blue-700 dark:text-blue-300" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{t('attendance.panel.title')}</h4>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {eventAttendancePanel.rows.length} {t('attendance.panel.rows_suffix')}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {t('attendance.panel.mark_hint')}
          </p>
          {canPrepareSelectedEvent && (
            <button
              type="button"
              onClick={handlePrepareAttendanceRows}
              disabled={attendancePreparing}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:border-cadenza-300 hover:bg-cadenza-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cadenza-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
            >
              {attendancePreparing ? <Loader2 size={13} className="animate-spin" /> : <ClipboardList size={13} />}
              {attendancePreparing ? t('attendance.panel.preparing') : t('attendance.panel.prepare_missing_rows')}
            </button>
          )}
        </div>
        {attendanceError && (
          <div data-testid="attendance-mark-error" className="mt-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {attendanceError}
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-md border border-stone-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">{t('attendance.panel.unmarked')}</p>
            <p className="text-base font-bold text-slate-900 dark:text-white">{eventAttendancePanel.summary.attendance.UNMARKED}</p>
          </div>
          <div className="min-w-0 rounded-md border border-stone-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">{t('attendance.panel.present')}</p>
            <p className="text-base font-bold text-slate-900 dark:text-white">{eventAttendancePanel.summary.attendance.PRESENT}</p>
          </div>
          <div className="min-w-0 rounded-md border border-stone-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">{t('attendance.panel.completed')}</p>
            <p className="text-base font-bold text-slate-900 dark:text-white">{eventAttendancePanel.summary.completed}</p>
          </div>
        </div>

        <div className="mt-3 max-h-[52vh] space-y-2 overflow-y-auto pe-1 custom-scrollbar sm:max-h-64">
          {eventAttendancePanel.rows.map(({ lesson, studentName }) => (
            <div key={lesson.id} data-testid="attendance-lesson-row" className="rounded-md border border-stone-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{studentName}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{completionLabels[lesson.completion]}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${attendanceBadgeClass[lesson.attendance]}`}>
                  {attendanceLabels[lesson.attendance]}
                </span>
              </div>
              {(lesson.repertoire.length > 0 || lesson.homework || lesson.notes) && (
                <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {lesson.repertoire.length > 0 && <p className="truncate">{t('attendance.panel.repertoire')}: {lesson.repertoire.join(', ')}</p>}
                  {lesson.homework && <p className="truncate">{t('attendance.panel.homework')}: {lesson.homework}</p>}
                  {lesson.notes && <p className="line-clamp-2">{t('attendance.panel.notes')}: {lesson.notes}</p>}
                </div>
              )}
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">{t('attendance.panel.mark_label')}</p>
                <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3" data-testid="attendance-mark-controls">
                  {attendanceActionStatuses.map(status => {
                    const isActive = lesson.attendance === status;
                    const isSaving = attendanceSavingId === lesson.id;
                    const allowed = canMarkLesson(lesson);
                    return (
                      <button
                        key={status}
                        type="button"
                        disabled={!allowed || isSaving || isActive}
                        onClick={() => handleLessonAttendanceMark(lesson, status)}
                        aria-label={markAttendanceAria(studentName, status)}
                        title={!allowed ? t('attendance.panel.not_allowed') : attendanceLabels[status]}
                        className={`min-h-9 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cadenza-700 disabled:cursor-not-allowed ${
                          isActive
                            ? attendanceBadgeClass[status]
                            : 'border-stone-200 bg-stone-50 text-slate-700 hover:border-cadenza-300 hover:bg-cadenza-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-cadenza-700 dark:hover:bg-slate-800/70'
                        } ${!allowed || isSaving ? 'opacity-60' : ''}`}
                      >
                        {isSaving ? t('attendance.panel.marking') : attendanceLabels[status]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const openAttendanceWorklistItem = (eventId: string) => {
    const event = events.find(item => item.id === eventId);
    if (!event) return;
    setCurrentDate(new Date(event.start));
    setDetailItem({ type: 'EVENT', data: event });
    setAttendanceWorklistOpen(false);
  };

  const renderAttendanceWorklist = () => (
    <div data-testid="attendance-worklist-panel" dir={isRtl ? 'rtl' : 'ltr'} className="p-4 pt-5 text-start">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('attendance.worklist.title')}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('attendance.worklist.subtitle')}</p>
        </div>
        <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-semibold text-stone-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {unmarkedAttendanceWorklist.length}
        </span>
      </div>

      {lessonRecordsLoading ? (
        <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Loader2 size={15} className="me-2 inline animate-spin text-blue-600" />
          {t('attendance.worklist.loading')}
        </div>
      ) : unmarkedAttendanceWorklist.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-950">
          <ClipboardCheck size={20} className="mx-auto text-cadenza-600 dark:text-cadenza-300" />
          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{t('attendance.worklist.empty_title')}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('attendance.worklist.empty_body')}</div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {unmarkedAttendanceWorklist.map(item => (
            <button
              key={item.lesson.id}
              type="button"
              disabled={!item.hasEventLink}
              onClick={() => openAttendanceWorklistItem(item.lesson.eventId)}
              data-testid="attendance-worklist-row"
              className="w-full rounded-lg border border-stone-200 bg-white p-3 text-start shadow-sm transition-colors hover:border-cadenza-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cadenza-800 dark:hover:bg-slate-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.studentName}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{item.eventName}</div>
                </div>
                <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-semibold text-stone-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {t('attendance.status.unmarked')}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                {item.eventDate}{item.eventStartTime ? ` · ${item.eventStartTime}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const clearAllFilters = useCallback(() => filterClear(), [filterClear]);

  const displayEvents = useMemo(() => {
    if (tempEvent) {
      return filteredEvents.map(e => e.id === tempEvent.id ? tempEvent : e);
    }
    return filteredEvents;
  }, [filteredEvents, tempEvent]);

  // --- Layout Algorithm for Overlaps ---

  const getDailyLayout = (dayEvents: CalendarEvent[]) => {
    const sorted = [...dayEvents].sort((a, b) => {
      const startA = new Date(a.start).getTime();
      const startB = new Date(b.start).getTime();
      if (startA !== startB) return startA - startB;
      const durA = new Date(a.end).getTime() - startA;
      const durB = new Date(b.end).getTime() - startB;
      return durB - durA;
    });

    const columns: CalendarEvent[][] = [];
    const layout: Record<string, { left: number; width: number; zIndex: number }> = {};

    sorted.forEach(evt => {
      const evtStart = new Date(evt.start).getTime();

      let placed = false;
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const lastInCol = col[col.length - 1];
        const lastEnd = new Date(lastInCol.end).getTime();

        if (lastEnd <= evtStart) {
          col.push(evt);
          placed = true;
          break;
        }
      }

      if (!placed) {
        columns.push([evt]);
      }
    });

    sorted.forEach(evt => {
      const evtStart = new Date(evt.start).getTime();
      const evtEnd = new Date(evt.end).getTime();

      let colIndex = 0;
      for (let i = 0; i < columns.length; i++) {
        if (columns[i].includes(evt)) {
          colIndex = i;
          break;
        }
      }

      let activeCols = 0;
      for (let i = 0; i < columns.length; i++) {
        const hasOverlap = columns[i].some(cEvt => {
          const cS = new Date(cEvt.start).getTime();
          const cE = new Date(cEvt.end).getTime();
          return (evtStart < cE && evtEnd > cS);
        });
        if (hasOverlap) activeCols++;
      }

      const widthPercent = 100 / activeCols;
      const left = (colIndex * (100 / activeCols));
      const width = Math.min(widthPercent + 10, 100 - left);

      layout[evt.id] = { left, width, zIndex: colIndex + 10 };
    });

    return layout;
  };

  // --- Interaction Handlers ---

  const handleMouseDown = (e: React.MouseEvent, evt: CalendarEvent, type: 'MOVE' | 'RESIZE') => {
    // In MARQUEE mode, let clicks pass through to onClick for selection toggling
    if (selectionMode === 'MARQUEE') return;
    e.stopPropagation();
    e.preventDefault();
    // Close detail if dragging starts
    setDetailItem(null);
    setDragState({
      id: evt.id,
      type,
      mode: 'TIME_GRID',
      startY: e.clientY,
      startX: e.clientX,
      originalStart: new Date(evt.start),
      originalEnd: new Date(evt.end)
    });
    setTempEvent(evt);
  };

  const handleMonthChipMouseDown = (e: React.MouseEvent, evt: CalendarEvent) => {
    if (selectionMode === 'MARQUEE') return;
    e.stopPropagation();
    e.preventDefault();
    setDetailItem(null);
    setDragState({
      id: evt.id,
      type: 'MOVE',
      mode: 'MONTH',
      startY: e.clientY,
      startX: e.clientX,
      originalStart: new Date(evt.start),
      originalEnd: new Date(evt.end),
    });
    setTempEvent(evt);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState || !tempEvent) return;

      // Month view: date changes by hit-testing the cell under the cursor.
      if (dragState.mode === 'MONTH') {
        const elem = document.elementFromPoint(e.clientX, e.clientY);
        const cell = (elem as HTMLElement | null)?.closest('[data-month-day]') as HTMLElement | null;
        if (!cell?.dataset.monthDay) return;

        const targetDate = new Date(cell.dataset.monthDay);
        if (Number.isNaN(targetDate.getTime())) return;

        const currentStart = new Date(tempEvent.start);
        if (
          currentStart.getFullYear() === targetDate.getFullYear() &&
          currentStart.getMonth() === targetDate.getMonth() &&
          currentStart.getDate() === targetDate.getDate()
        ) return;

        const original = dragState.originalStart;
        const duration = dragState.originalEnd.getTime() - dragState.originalStart.getTime();
        const newStart = new Date(targetDate);
        newStart.setHours(
          original.getHours(),
          original.getMinutes(),
          original.getSeconds(),
          original.getMilliseconds(),
        );
        const newEnd = new Date(newStart.getTime() + duration);

        setTempEvent({
          ...tempEvent,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
        });
        return;
      }

      const deltaY = e.clientY - dragState.startY;
      const deltaMinutes = Math.round((deltaY / PIXELS_PER_HOUR) * 60 / SNAP_MINUTES) * SNAP_MINUTES;

      // Horizontal: calculate day offset from column width — also enabled in
      // single-column DAY view, where one column-width drag = ±1 day.
      // RTL: columns flow right-to-left, so dragging right means earlier day.
      let dayOffset = 0;
      if (dragState.type === 'MOVE' && containerRef.current && gridDaysRef.current.length >= 1) {
        const containerWidth = containerRef.current.clientWidth;
        const dayColumnWidth = (containerWidth - 50) / gridDaysRef.current.length;
        if (dayColumnWidth > 0) {
          const rawOffset = Math.round((e.clientX - dragState.startX) / dayColumnWidth);
          dayOffset = isRtl ? -rawOffset : rawOffset;
        }
      }

      if (deltaMinutes === 0 && dayOffset === 0) return;

      const newStart = new Date(dragState.originalStart);
      const newEnd = new Date(dragState.originalEnd);

      if (dragState.type === 'MOVE') {
        newStart.setMinutes(newStart.getMinutes() + deltaMinutes);
        newEnd.setMinutes(newEnd.getMinutes() + deltaMinutes);
        if (dayOffset !== 0) {
          newStart.setDate(newStart.getDate() + dayOffset);
          newEnd.setDate(newEnd.getDate() + dayOffset);
        }
      } else {
        newEnd.setMinutes(newEnd.getMinutes() + deltaMinutes);
        if (newEnd.getTime() - newStart.getTime() < 15 * 60 * 1000) return;
      }

      setTempEvent({
        ...tempEvent,
        start: newStart.toISOString(),
        end: newEnd.toISOString()
      });
    };

    const handleMouseUp = () => {
      if (dragState && tempEvent) {
        const didMove = tempEvent.start !== dragState.originalStart.toISOString() ||
                        tempEvent.end !== dragState.originalEnd.toISOString();
        if (didMove) {
          wasDraggingRef.current = true;
          setTimeout(() => { wasDraggingRef.current = false; }, 100);
        }
        setEvents(prev => prev.map(e => e.id === dragState.id ? tempEvent : e));
      }
      setDragState(null);
      setTempEvent(null);
    };

    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, tempEvent, setEvents]);

  // --- Marquee Drag-to-Select ---
  useEffect(() => {
    if (selectionMode !== 'MARQUEE' || !marqueeActive) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMarqueeEnd({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (marqueeStart && marqueeEnd) {
        // Calculate the marquee rectangle in viewport coords
        const rect = {
          left: Math.min(marqueeStart.x, e.clientX),
          right: Math.max(marqueeStart.x, e.clientX),
          top: Math.min(marqueeStart.y, e.clientY),
          bottom: Math.max(marqueeStart.y, e.clientY),
        };

        // Only select if the drag was significant (not just a click)
        const dragWidth = rect.right - rect.left;
        const dragHeight = rect.bottom - rect.top;
        if (dragWidth > 5 || dragHeight > 5) {
          // Find all event elements that intersect the marquee rect
          const container = marqueeContainerRef.current || containerRef.current;
          if (container) {
            const eventElements = container.querySelectorAll('[data-event-id]');
            const newSelected = new Set(selectedEventIds);
            eventElements.forEach(el => {
              const elRect = el.getBoundingClientRect();
              // Check intersection
              if (
                elRect.left < rect.right &&
                elRect.right > rect.left &&
                elRect.top < rect.bottom &&
                elRect.bottom > rect.top
              ) {
                const eventId = el.getAttribute('data-event-id');
                if (eventId) {
                  newSelected.add(eventId);
                }
              }
            });
            setSelectedEventIds(newSelected);
          }
        }
      }
      setMarqueeActive(false);
      setMarqueeStart(null);
      setMarqueeEnd(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectionMode, marqueeActive, marqueeStart, marqueeEnd, selectedEventIds, setSelectedEventIds]);

  const handleMarqueeMouseDown = useCallback((e: React.MouseEvent) => {
    if (selectionMode !== 'MARQUEE') return;
    // Only start marquee on left mouse button, not on event elements
    if (e.button !== 0) return;
    e.preventDefault();
    setMarqueeStart({ x: e.clientX, y: e.clientY });
    setMarqueeEnd({ x: e.clientX, y: e.clientY });
    setMarqueeActive(true);
  }, [selectionMode]);

  // --- Event Editor (Modal) ---

  const openModal = (evt?: Partial<CalendarEvent>, anchor?: { x: number; y: number } | null) => {
    const defaultStart = new Date();
    defaultStart.setMinutes(0, 0, 0);
    const defaultEnd = new Date(defaultStart);
    defaultEnd.setMinutes(defaultStart.getMinutes() + settings.defaultEventDuration);

    let newEvent: Partial<CalendarEvent>;
    if (evt) {
      newEvent = { ...evt };
    } else {
      newEvent = {
        start: defaultStart.toISOString(),
        end: defaultEnd.toISOString(),
        roomId: rooms[0]?.id,
      };
    }
    setEditingEvent(newEvent);
    setEventFormCanSave(false);
    setModalAnchorPosition(anchor ?? null);
    setIsModalOpen(true);
    setDetailItem(null);
  };

  // Open the create-event modal for a click anywhere inside a day column. The
  // column is exactly (END_HOUR - START_HOUR + 1) * 60 px tall, so 1 px == 1 min.
  // Snap to the nearest 15-minute boundary (Google-Calendar style) and create a
  // 1-hour event. A single column-level handler avoids React's per-cell offsetY
  // quirks that broke the previous slot-by-slot implementation.
  const handleColumnClick = (date: Date, e: React.MouseEvent) => {
    if (!isAdmin) return;
    if (selectionMode === 'MARQUEE') return;

    const cell = e.currentTarget.getBoundingClientRect();
    const offsetY = Math.max(0, e.clientY - cell.top);
    const totalMinutes = Math.round(offsetY / 15) * 15; // snap to 15-min boundary
    const startMinutesSinceStart = Math.min(totalMinutes, (END_HOUR - START_HOUR + 1) * 60 - 15);

    const snappedHour = START_HOUR + Math.floor(startMinutesSinceStart / 60);
    const snappedMinute = startMinutesSinceStart % 60;

    const start = new Date(date);
    start.setHours(snappedHour, snappedMinute, 0, 0);
    const end = new Date(start);
    end.setMinutes(start.getMinutes() + settings.defaultEventDuration);

    openModal({
      start: start.toISOString(),
      end: end.toISOString(),
      roomId: rooms[0]?.id,
    }, null);
  };

  // Month-view "+" button: opens the create-event modal at a fixed time on the
  // clicked day. No fine-grained snap because there's no minute-level resolution
  // in the month grid.
  const handleSlotClick = (date: Date, hour: number) => {
    if (!isAdmin) return;
    if (selectionMode === 'MARQUEE') return;
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(start.getMinutes() + settings.defaultEventDuration);
    openModal({
      start: start.toISOString(),
      end: end.toISOString(),
      roomId: rooms[0]?.id,
    }, null);
  };

  const handleGoogleSync = async (eventToSync: CalendarEvent, isUpdate: boolean = false) => {
    // Only sync if the currently logged-in user is the admin who connected the calendar
    if (settings.googleCalendarSyncEnabled && settings.googleCalendarId && googleAccessToken && isCalendarOwner) {
      try {
        const payload = {
          title: eventToSync.name,
          start: eventToSync.start,
          end: eventToSync.end,
          description: eventToSync.description,
          location: rooms.find(r => r.id === eventToSync.roomId)?.name
        };

        if (isUpdate && eventToSync.googleEventId) {
          await updateEventInGoogle(googleAccessToken, settings.googleCalendarId, eventToSync.googleEventId, payload);
        } else {
          const gId = await syncEventToGoogle(googleAccessToken, settings.googleCalendarId, payload);
          // Update the event with the newly assigned google Event ID
          setEvents(prev => prev.map(ev => ev.id === eventToSync.id ? { ...ev, googleEventId: gId } : ev));
        }
      } catch (err) {
        console.error("Failed to sync to Google Calendar:", err);
      }
    }
  };

  // ─── Phase 5: v2.0 Event Form Save Handler ─────────────────────────────
  const handleSaveV2 = (formState: EventFormState) => {
    const now = { seconds: Date.now() / 1000, nanoseconds: 0 } as any;
    const selectedActivity = activities.find(a => a.id === formState.activityId);

    if (editingEvent.id) {
      // ── Edit existing event ──
      const isVirtualInstance = editingEvent.id.includes('_') && (editingEvent as CalendarEvent).recurrenceId;

      // Build v2.0 EventV2 document
      const eventV2Update: Partial<EventV2> = {
        name: formState.name,
        activityId: formState.activityId,
        l1Id: formState.l1Id || null,
        l2Id: formState.l2Id || null,
        location: formState.location,
        date: formState.date,
        startTime: formState.startTime,
        endTime: formState.endTime,
        status: formState.isCanceled ? 'CANCELLED' : 'SCHEDULED',
        notes: formState.notes || null,
        updatedAt: now,
      };

      // Build compat CalendarEvent for rendering
      const startISO = new Date(`${formState.date}T${formState.startTime}:00`).toISOString();
      const endISO = new Date(`${formState.date}T${formState.endTime}:00`).toISOString();
      const primaryStaffId = formState.staffParticipants[0]?.staffMemberId;

      if (isVirtualInstance) {
        // Create exception edit (same as v1.3 pattern)
        const parentId = (editingEvent as CalendarEvent).recurrenceId!;
        const dateKey = (editingEvent as CalendarEvent).originalStart || formState.date;

        setEvents(prev => prev.map(ev => {
          if (ev.id === parentId) {
            return { ...ev, exceptions: [...(ev.exceptions || []), dateKey] };
          }
          return ev;
        }));

        const exceptionId = generateId();
        const exceptionEvent: CalendarEvent = {
          ...(editingEvent as CalendarEvent),
          id: exceptionId,
          name: formState.name,
          start: startISO,
          end: endISO,
          teacherId: primaryStaffId,
          roomId: formState.roomId || undefined,
          staffMemberIds: formState.staffParticipants.map(sp => sp.staffMemberId),
          activityId: formState.activityId,
          isCanceled: formState.isCanceled,
          recurrenceId: parentId,
          isExceptionEdit: true,
          originalStart: dateKey,
          recurrenceRule: undefined,
          tags: formState.tags,
        };
        setEvents(prev => [...prev, exceptionEvent]);

        // Write v2.0 event
        setEventsV2(prev => [...prev, { ...eventV2Update, id: exceptionId, orgId: '', isRecurring: false, recurringGroupId: parentId, durationMinutes: 0, createdAt: now } as EventV2]);
      } else {
        // Regular event edit
        const updatedCE: CalendarEvent = {
          ...(editingEvent as CalendarEvent),
          name: formState.name,
          start: startISO,
          end: endISO,
          teacherId: primaryStaffId,
          roomId: formState.roomId || undefined,
          staffMemberIds: formState.staffParticipants.map(sp => sp.staffMemberId),
          activityId: formState.activityId,
          isCanceled: formState.isCanceled,
          recurrenceRule: formState.recurrenceRule,
          tags: formState.tags,
        };
        setEvents(prev => prev.map(ev => ev.id === editingEvent.id ? { ...ev, ...updatedCE } : ev));
        setRecentlySaved(prev => new Set(prev).add(editingEvent.id!));
        setTimeout(() => setRecentlySaved(prev => { const n = new Set(prev); n.delete(editingEvent.id!); return n; }), 1500);

        // Update v2.0 event
        setEventsV2(prev => prev.map(ev => ev.id === editingEvent.id ? { ...ev, ...eventV2Update } : ev));

        // Google sync
        if (updatedCE.googleEventId) handleGoogleSync(updatedCE, true);
        handleTeacherGoogleSync(updatedCE, true);
      }

      // Update v2.0 participants (delete old, add new)
      setEventParticipantsV2(prev => {
        const withoutOld = prev.filter(p => p.eventId !== editingEvent.id);
        const newParticipants: EventParticipant[] = formState.staffParticipants.map(sp => ({
          id: generateId(),
          orgId: '',
          eventId: editingEvent.id!,
          staffMemberId: sp.staffMemberId,
          assignmentType: sp.assignmentType,
          teachingAssignmentId: sp.teachingAssignmentId || null,
          orgRoleId: sp.orgRoleId || null,
          createdAt: now,
        }));
        return [...withoutOld, ...newParticipants];
      });
    } else {
      // ── New event ──
      const newId = generateId();
      const startISO = new Date(`${formState.date}T${formState.startTime}:00`).toISOString();
      const endISO = new Date(`${formState.date}T${formState.endTime}:00`).toISOString();
      const primaryStaffId = formState.staffParticipants[0]?.staffMemberId;

      // CalendarEvent for rendering compat
      const newCE: CalendarEvent = {
        id: newId,
        name: formState.name,
        description: '',
        start: startISO,
        end: endISO,
        teacherId: primaryStaffId,
        roomId: formState.roomId || undefined,
        staffMemberIds: formState.staffParticipants.map(sp => sp.staffMemberId),
        activityId: formState.activityId,
        isCanceled: false,
        isHidden: false,
        recurrenceRule: formState.recurrenceRule,
        tags: formState.tags,
      };
      setEvents(prev => [...prev, newCE]);
      setRecentlySaved(prev => new Set(prev).add(newId));
      setTimeout(() => setRecentlySaved(prev => { const n = new Set(prev); n.delete(newId); return n; }), 1500);

      // v2.0 EventV2 document
      const newEventV2: EventV2 = {
        id: newId,
        orgId: '',
        name: formState.name,
        activityId: formState.activityId,
        l1Id: formState.l1Id || null,
        l2Id: formState.l2Id || null,
        location: formState.location,
        date: formState.date,
        startTime: formState.startTime,
        endTime: formState.endTime,
        durationMinutes: 0, // Computed server-side via computeDuration
        isRecurring: !!formState.recurrenceRule,
        recurringGroupId: null,
        status: 'SCHEDULED',
        notes: formState.notes || null,
        createdAt: now,
        updatedAt: now,
      };
      setEventsV2(prev => [...prev, newEventV2]);

      // v2.0 EventParticipant documents
      const newParticipants: EventParticipant[] = formState.staffParticipants.map(sp => ({
        id: generateId(),
        orgId: '',
        eventId: newId,
        staffMemberId: sp.staffMemberId,
        assignmentType: sp.assignmentType,
        teachingAssignmentId: sp.teachingAssignmentId || null,
        orgRoleId: sp.orgRoleId || null,
        createdAt: now,
      }));
      setEventParticipantsV2(prev => [...prev, ...newParticipants]);

      // Google sync
      handleGoogleSync(newCE);
      handleTeacherGoogleSync(newCE);
    }

    setIsModalOpen(false);
  };

  const handleDeleteGoogleSync = async (gId: string) => {
    if (settings.googleCalendarSyncEnabled && settings.googleCalendarId && googleAccessToken && isCalendarOwner && gId) {
      try {
        await removeEventFromGoogle(googleAccessToken, settings.googleCalendarId, gId);
      } catch (err) {
        console.error("Failed to delete from Google Calendar", err);
      }
    }
  };

  // --- Phase 5: Per-Teacher Google Calendar Sync ---
  const handleTeacherGoogleSync = async (eventToSync: CalendarEvent, isUpdate: boolean = false) => {
    if (!googleAccessToken) return;

    const staffMemberIds = eventToSync.staffMemberIds || (eventToSync.teacherId ? [eventToSync.teacherId] : []);
    if (staffMemberIds.length === 0) return;

    const existingTeacherEventIds = eventToSync.teacherGoogleEventIds || {};
    const newTeacherEventIds = { ...existingTeacherEventIds };

    const payload = {
      title: eventToSync.name,
      start: eventToSync.start,
      end: eventToSync.end,
      description: eventToSync.description,
      location: rooms.find(r => r.id === eventToSync.roomId)?.name
    };

    // Sync to each assigned staff member's personal calendar
    for (const memberId of staffMemberIds) {
      const teacher = teachers.find(t => t.id === memberId);
      if (!teacher?.googleCalendarSyncEnabled || !teacher?.googleCalendarId) continue;

      try {
        const existingGoogleEventId = existingTeacherEventIds[memberId];
        if (isUpdate && existingGoogleEventId) {
          await updateEventInGoogle(googleAccessToken, teacher.googleCalendarId, existingGoogleEventId, payload);
        } else if (!existingGoogleEventId) {
          const gId = await syncEventToGoogle(googleAccessToken, teacher.googleCalendarId, payload);
          newTeacherEventIds[memberId] = gId;
        }
      } catch (err) {
        console.error(`Failed to sync to ${teacher.fullName}'s Google Calendar:`, err);
      }
    }

    // Remove from calendars of staff members no longer assigned to this event
    for (const [oldMemberId, oldGoogleEventId] of Object.entries(existingTeacherEventIds)) {
      if (!staffMemberIds.includes(oldMemberId) && oldGoogleEventId) {
        const teacher = teachers.find(t => t.id === oldMemberId);
        if (teacher?.googleCalendarId) {
          try {
            await removeEventFromGoogle(googleAccessToken, teacher.googleCalendarId, oldGoogleEventId);
          } catch (err) {
            console.error(`Failed to remove from ${teacher.fullName}'s Google Calendar:`, err);
          }
        }
        delete newTeacherEventIds[oldMemberId];
      }
    }

    // Persist the updated teacher Google Event IDs
    if (JSON.stringify(newTeacherEventIds) !== JSON.stringify(existingTeacherEventIds)) {
      setEvents(prev => prev.map(ev => ev.id === eventToSync.id ? { ...ev, teacherGoogleEventIds: newTeacherEventIds } : ev));
    }
  };

  const handleDeleteTeacherGoogleSync = async (event: CalendarEvent) => {
    if (!googleAccessToken) return;
    const teacherEventIds = event.teacherGoogleEventIds || {};

    for (const [memberId, googleEventId] of Object.entries(teacherEventIds)) {
      if (!googleEventId) continue;
      const teacher = teachers.find(t => t.id === memberId);
      if (!teacher?.googleCalendarId) continue;

      try {
        await removeEventFromGoogle(googleAccessToken, teacher.googleCalendarId, googleEventId);
      } catch (err) {
        console.error(`Failed to delete from ${teacher.fullName}'s Google Calendar:`, err);
      }
    }
  };

  // --- Detail View Actions ---
  const handleDeleteEvent = (id: string, evt?: CalendarEvent) => {
    const targetEvent = evt || events.find(e => e.id === id);

    // Check if this is part of a recurring series
    if (targetEvent && (targetEvent.recurrenceRule || targetEvent.recurrenceId)) {
      setRecurrenceDialog({ type: 'DELETE', event: targetEvent });
      setDetailItem(null);
      return;
    }

    if (window.confirm(t('cal.confirm_delete_event'))) {
      setEvents(prev => prev.filter(e => e.id !== id));
      if (targetEvent?.googleEventId) {
        handleDeleteGoogleSync(targetEvent.googleEventId);
      }
      if (targetEvent) {
        handleDeleteTeacherGoogleSync(targetEvent);
      }
      setDetailItem(null);
    }
  };

  const handleEditEvent = (evt: CalendarEvent, anchor?: { x: number; y: number } | null) => {
    // Check if this is part of a recurring series
    if (evt.recurrenceRule || evt.recurrenceId) {
      setRecurrenceDialog({ type: 'EDIT', event: evt });
      setDetailItem(null);
      return;
    }
    openModal(evt, anchor);
  };

  const handleCancelEvent = (evt: CalendarEvent) => {
    // Check if this is part of a recurring series
    if (evt.recurrenceRule || evt.recurrenceId) {
      setRecurrenceDialog({ type: 'CANCEL', event: evt });
      setDetailItem(null);
      return;
    }

    // Non-recurring: toggle directly
    setEvents(prev => prev.map(e => e.id === evt.id ? { ...e, isCanceled: !e.isCanceled } : e));
    setDetailItem(null);
  };

  const handleSeriesAction = (scope: 'THIS' | 'ALL') => {
    if (!recurrenceDialog) return;
    const { type, event } = recurrenceDialog;
    const parentId = event.recurrenceId || event.id;
    const isVirtual = event.id.includes('_');
    const dateKey = isVirtual ? event.id.split('_').pop()! : new Date(event.start).toISOString().split('T')[0];

    if (type === 'DELETE') {
      if (scope === 'ALL') {
        // Delete entire series — also clean up teacher Google Calendar entries
        const parentEvent = events.find(e => e.id === parentId);
        if (parentEvent?.googleEventId) {
          handleDeleteGoogleSync(parentEvent.googleEventId);
        }
        if (parentEvent) {
          handleDeleteTeacherGoogleSync(parentEvent);
        }
        setEvents(prev => prev.filter(e => e.id !== parentId && e.recurrenceId !== parentId));
      } else {
        // Delete just this one — add to exceptions
        setEvents(prev => prev.map(ev => {
          if (ev.id === parentId) {
            return { ...ev, exceptions: [...(ev.exceptions || []), dateKey] };
          }
          return ev;
        }));
        // Also remove any existing exception edit for this date
        setEvents(prev => prev.filter(e => !(e.isExceptionEdit && e.originalStart === dateKey && e.recurrenceId === parentId)));
      }
    } else if (type === 'EDIT') {
      if (scope === 'ALL') {
        // Edit the parent
        const parent = events.find(e => e.id === parentId);
        if (parent) openModal(parent);
      } else {
        // Edit just this one — open modal with virtual instance data
        const editData: Partial<CalendarEvent> = {
          ...event,
          originalStart: dateKey,
          recurrenceId: parentId,
        };
        openModal(editData);
      }
    } else if (type === 'CANCEL') {
      const newCanceledState = !event.isCanceled;
      if (scope === 'ALL') {
        // Toggle cancel on the parent event
        setEvents(prev => prev.map(e => e.id === parentId ? { ...e, isCanceled: newCanceledState } : e));
        // Also update any exception edits for this series
        setEvents(prev => prev.map(e => e.recurrenceId === parentId && e.isExceptionEdit ? { ...e, isCanceled: newCanceledState } : e));
      } else {
        // Cancel/restore just this one — create exception edit
        // First check if there's already an exception edit for this date
        const existingException = events.find(e => e.isExceptionEdit && e.originalStart === dateKey && e.recurrenceId === parentId);
        if (existingException) {
          // Toggle isCanceled on existing exception
          setEvents(prev => prev.map(e => e.id === existingException.id ? { ...e, isCanceled: newCanceledState } : e));
        } else {
          // Add date to parent's exceptions
          setEvents(prev => prev.map(ev => {
            if (ev.id === parentId) {
              return { ...ev, exceptions: [...(ev.exceptions || []), dateKey] };
            }
            return ev;
          }));
          // Create a canceled exception event
          const exceptionEvent: CalendarEvent = {
            ...event,
            id: generateId(),
            recurrenceId: parentId,
            isExceptionEdit: true,
            originalStart: dateKey,
            recurrenceRule: undefined,
            isCanceled: newCanceledState,
          };
          setEvents(prev => [...prev, exceptionEvent]);
        }
      }
    }

    setRecurrenceDialog(null);
    setDetailItem(null);
  };

  const handleDeleteGantt = (id: string) => {
    if (window.confirm(t('cal.confirm_delete_gantt'))) {
      const block = ganttBlocks.find(b => b.id === id);
      if (block && block.isBlackout) {
        // Restore hidden events
        setEvents(prev => prev.map(evt => {
          if (evt.canceledByBlackoutId === id) {
            return { ...evt, isHidden: false, canceledByBlackoutId: undefined };
          }
          return evt;
        }));
      }
      setGanttBlocks(prev => prev.filter(b => b.id !== id));
      setDetailItem(null);
    }
  };


  // --- Helper for Teacher Colors ---
  const getTeacherColor = (teacherId: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    return teacher ? teacher.color : '#6E1A1A'; // Default bordeaux
  };

  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // --- Render Sub-Components ---

  const renderGanttStrip = (days: Date[]) => {
    const viewStart = new Date(days[0]);
    viewStart.setHours(0, 0, 0, 0);
    const viewEnd = new Date(days[days.length - 1]);
    viewEnd.setHours(23, 59, 59, 999);

    const relevantBlocks = ganttBlocks.filter(block => {
      const blockStart = new Date(block.startDate);
      const blockEnd = new Date(block.endDate);
      return blockEnd >= viewStart && blockStart <= viewEnd;
    }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const lanes: GanttBlock[][] = [];
    relevantBlocks.forEach(block => {
      let placed = false;
      for (let i = 0; i < lanes.length; i++) {
        const hasOverlap = lanes[i].some(b => {
          const bS = new Date(b.startDate).getTime();
          const bE = new Date(b.endDate).getTime();
          const currS = new Date(block.startDate).getTime();
          const currE = new Date(block.endDate).getTime();
          return Math.max(bS, viewStart.getTime()) <= Math.min(currE, viewEnd.getTime()) &&
            Math.max(currS, viewStart.getTime()) <= Math.min(bE, viewEnd.getTime());
        });
        if (!hasOverlap) {
          lanes[i].push(block);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([block]);
    });

    const laneHeight = 22;
    const totalHeight = Math.max(30, lanes.length * laneHeight + 10);

    return (
      <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex flex-col transition-all duration-150 relative overflow-hidden">
        {/* Collapsed Header */}
        {!isGanttExpanded && (
          <div
            className="flex items-center px-3 py-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 transition-colors"
            onClick={() => setIsGanttExpanded(true)}
          >
            <ChevronRight size={14} className={`opacity-70 ${isRtl ? 'ms-1 rotate-180' : 'me-1'}`} />
            <span className="tracking-wider uppercase">GANTT</span>
          </div>
        )}

        {/* Expanded Content Grid */}
        <div
          className={`grid transition-all duration-300 overflow-hidden ${isGanttExpanded ? 'opacity-100' : 'opacity-0'}`}
          style={{
            gridTemplateColumns: `50px 1fr`,
            height: isGanttExpanded ? 'auto' : 0,
            visibility: isGanttExpanded ? 'visible' : 'hidden'
          }}
        >
          <div
            className="border-e border-slate-100 dark:border-slate-800 p-2 text-[10px] text-slate-400 text-center flex flex-col items-center justify-center font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            onClick={() => setIsGanttExpanded(false)}
            title={t('btn.collapse')}
          >
            <ChevronDown size={14} className="opacity-70 mb-0.5" />
            <span>GANTT</span>
          </div>
          <div className="relative py-1" style={{ height: `${totalHeight}px` }}>
            {lanes.map((lane, laneIdx) => (
              lane.map(block => {
                const blockStart = new Date(block.startDate);
                const blockEnd = new Date(block.endDate);

                const totalDuration = viewEnd.getTime() - viewStart.getTime();
                const effectiveStart = Math.max(blockStart.getTime(), viewStart.getTime());
                const effectiveEnd = Math.min(blockEnd.getTime(), viewEnd.getTime());

                const leftPercent = ((effectiveStart - viewStart.getTime()) / totalDuration) * 100;
                const widthPercent = ((effectiveEnd - effectiveStart) / totalDuration) * 100;

                return (
                  <div
                    key={block.id}
                    onClick={(e) => { e.stopPropagation(); setDetailItem({ type: 'GANTT', data: block }); }}
                    className={`absolute rounded px-2 flex items-center text-[10px] text-white font-medium truncate opacity-90 hover:opacity-100 transition-opacity cursor-pointer z-5 hover:shadow-cadenza-deep hover:z-10 border border-white/20 animate-cadenza-arrive ${recentlySaved.has(block.id) ? 'animate-cadenza-pulse' : ''}`}
                    style={{
                      insetInlineStart: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                      top: `${laneIdx * laneHeight}px`,
                      height: `${laneHeight - 2}px`,
                      backgroundColor: block.color,
                      transformOrigin: isRtl ? 'right center' : 'left center',
                    }}
                    title={block.title}
                  >
                    {block.title} {block.isBlackout && '(Blackout)'}
                  </div>
                );
              })
            ))}
          </div>
        </div>
      </div>
    );
  }

  const renderEvent = (evt: CalendarEvent, layout: { left: number, width: number, zIndex: number }) => {
    const start = new Date(evt.start);
    const end = new Date(evt.end);

    const startMinutes = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

    const top = Math.max(0, startMinutes);
    const height = durationMinutes;

    const isDragging = dragState?.id === evt.id;
    const isConflicting = conflictingIds.has(evt.id);
    const baseColor = getTeacherColor(evt.teacherId);

    // Dynamic text scaling thresholds
    const isUltraCompact = durationMinutes < 30;
    const isCompact = durationMinutes < 45;
    const isShort = durationMinutes < 60;

    // Calculate font sizes and padding based on duration
    const fontSize = isUltraCompact ? '9px' : isCompact ? '10px' : '12px';
    const timeFontSize = isUltraCompact ? '8px' : isCompact ? '9px' : '10px';
    const padding = isUltraCompact ? '1px 4px' : isCompact ? '2px 4px' : undefined; // default p-2

    return (
      <div
        key={evt.id}
        data-event-id={evt.id}
        tabIndex={0}
        role="button"
        aria-label={`${evt.name} — ${t('bl01_calendar.event.aria_focused')}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDetailItem({ type: 'EVENT', data: evt });
          }
        }}
        onMouseDown={(e) => handleMouseDown(e, evt, 'MOVE')}
        onClick={(e) => {
          e.stopPropagation();
          if (wasDraggingRef.current) return;
          if (selectionMode === 'MARQUEE') {
            setSelectedEventIds(prev => {
              const next = new Set(prev);
              next.has(evt.id) ? next.delete(evt.id) : next.add(evt.id);
              return next;
            });
          } else {
            setDetailItem({ type: 'EVENT', data: evt });
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ x: e.clientX, y: e.clientY, event: evt });
        }}
        className={`pointer-events-auto absolute rounded-xl border shadow-sm transition-shadow select-none overflow-hidden group animate-cadenza-arrive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 ${selectedEventIds.has(evt.id) ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' : ''} ${isConflicting && !evt.isCanceled ? 'ring-2 ring-amber-500 ring-offset-1 dark:ring-offset-slate-900' : ''} ${recentlySaved.has(evt.id) ? 'animate-cadenza-pulse' : ''} ${evt.isCanceled
          ? 'canceled-stripe border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500 bg-slate-50 dark:bg-slate-800'
          : isDragging
            ? 'z-50 opacity-90 shadow-cadenza-deep cursor-grabbing'
            : 'hover:shadow-cadenza-soft cursor-grab'
          }`}
        style={{
          top: `${top}px`,
          height: `${height}px`,
          left: `${layout.left}%`,
          width: `${layout.width}%`,
          zIndex: isDragging ? 50 : layout.zIndex,
          backgroundColor: !evt.isCanceled ? hexToRgba(baseColor, 0.2) : undefined,
          borderColor: !evt.isCanceled ? baseColor : undefined,
          color: !evt.isCanceled ? baseColor : undefined,
          padding: padding,
          fontSize,
        }}
      >
        <div style={{ color: !evt.isCanceled ? baseColor : undefined }} className={`h-full ${isShort ? 'flex items-center gap-1' : 'flex flex-col'} overflow-hidden`}>
          {isConflicting && !evt.isCanceled && (
            <div className="absolute top-0.5 start-0.5 bg-amber-100 dark:bg-amber-900/60 rounded-full p-0.5" title={t('cal.room_conflict')}>
              <AlertOctagon size={isCompact ? 8 : 10} className="text-amber-600 dark:text-amber-400" />
            </div>
          )}

          {isShort ? (
            /* Compact single-line layout for short events */
            <>
              <span className="font-bold truncate text-black dark:text-white" style={{ opacity: 0.9, fontSize, lineHeight: 1.2 }}>{evt.name}</span>
              {!isUltraCompact && (
                <span className="truncate opacity-70 flex-shrink-0" style={{ fontSize: timeFontSize, lineHeight: 1.2 }}>
                  {formatTime(start)}-{formatTime(end)}
                </span>
              )}
              {!isUltraCompact && evt.teacherId && (
                <span className="truncate opacity-70 flex-shrink-0 flex items-center gap-0.5" style={{ fontSize: timeFontSize, lineHeight: 1.2 }}>
                  <User size={8} /> {teachers.find(t => t.id === evt.teacherId)?.fullName?.split(' ')[0]}
                </span>
              )}
              {evt.roomId && !isUltraCompact && (
                <span className="truncate opacity-70 flex-shrink-0 flex items-center gap-0.5" style={{ fontSize: timeFontSize, lineHeight: 1.2 }}>
                  <MapPin size={8} /> {rooms.find(r => r.id === evt.roomId)?.name}
                </span>
              )}
              {evt.isCanceled && <span className="font-bold text-slate-500 dark:text-slate-400 flex-shrink-0" style={{ fontSize: timeFontSize }}>✕</span>}
            </>
          ) : (
            /* Standard multi-line layout for normal events */
            <>
              <div className="font-bold truncate pe-4 text-black dark:text-white" style={{ opacity: 0.9 }}>{evt.name}</div>
              <div className="truncate opacity-75" style={{ fontSize: timeFontSize }}>
                {formatTime(start)} - {formatTime(end)}
              </div>
              <div className="truncate opacity-75 font-semibold flex items-center gap-1" style={{ fontSize: timeFontSize }}>
                <User size={10} className="flex-shrink-0" />
                <span className="truncate">{teachers.find(t => t.id === evt.teacherId)?.fullName}</span>
              </div>
              {evt.roomId && (
                <div className="truncate opacity-75 font-medium flex items-center gap-1 mt-0.5 text-slate-700 dark:text-slate-300" style={{ fontSize: timeFontSize }}>
                  <MapPin size={10} className="flex-shrink-0" />
                  <span className="truncate">{rooms.find(r => r.id === evt.roomId)?.name}</span>
                </div>
              )}
              {evt.isCanceled && <div className="font-bold text-slate-500 dark:text-slate-400 mt-1">{t('cal.canceled')}</div>}
            </>
          )}
        </div>

        {!evt.isCanceled && (
          <div
            onMouseDown={(e) => handleMouseDown(e, evt, 'RESIZE')}
            className="absolute bottom-0 start-0 end-0 h-3 cursor-ns-resize flex justify-center items-end pb-1 opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <GripHorizontal size={12} className="text-slate-400" />
          </div>
        )}
      </div>
    );
  };

  const renderTimeGrid = (days: Date[]) => {
    gridDaysRef.current = days;
    return (
      <div className={`flex-1 overflow-auto bg-white dark:bg-slate-900 relative ${selectionMode === 'MARQUEE' ? 'cursor-crosshair' : ''}`} ref={containerRef} onMouseDown={handleMarqueeMouseDown}>
        <div className="min-w-[800px] relative" ref={marqueeContainerRef}>
          <div className="sticky top-0 z-20 flex flex-col shadow-sm">
            <div className="grid border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" style={{ gridTemplateColumns: `50px repeat(${days.length}, 1fr)` }}>
              <div className="p-4 border-e border-slate-100 dark:border-slate-800"></div>
              {days.map(day => (
                <div key={day.toISOString()} className={`p-3 text-center border-e border-slate-100 dark:border-slate-800 ${day.toDateString() === new Date().toDateString() ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{day.toLocaleDateString(settings.language, { weekday: 'short' })}</div>
                  <div
                    className={`text-xl font-bold mt-1 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${day.toDateString() === new Date().toDateString() ? 'text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}
                    onClick={() => { setCurrentDate(day); setViewMode('DAY'); }}
                  >
                    {day.getDate()}
                  </div>
                </div>
              ))}
            </div>
            {renderGanttStrip(days)}
          </div>
          <div className="relative" style={{ height: `${(END_HOUR - START_HOUR + 1) * 60}px` }}>
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `50px repeat(${days.length}, 1fr)` }}>
              <div className="border-e border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map(h => (
                  <div key={h} className="h-[60px] border-b border-slate-200 dark:border-slate-800 text-xs text-slate-400 text-end pe-2 pt-1">
                    {h}:00
                  </div>
                ))}
              </div>
              {days.map((day, i) => (
                <div
                  key={i}
                  className="border-e border-slate-100 dark:border-slate-800 h-full relative"
                  onClick={(e) => handleColumnClick(day, e)}
                >
                  {/* Hour gridlines (visual only) */}
                  {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, j) => START_HOUR + j).map(h => (
                    <div
                      key={h}
                      className="h-[60px] border-b border-slate-100 dark:border-slate-800 pointer-events-none"
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `50px repeat(${days.length}, 1fr)` }}>
              <div />
              {days.map(day => {
                const dayEvents = displayEvents.filter(e => {
                  const eDate = new Date(e.start);
                  return eDate.getDate() === day.getDate() &&
                    eDate.getMonth() === day.getMonth() &&
                    eDate.getFullYear() === day.getFullYear();
                });
                const layout = getDailyLayout(dayEvents);
                return (
                  <div key={day.toISOString()} className="relative h-full pointer-events-none overflow-hidden">
                    {dayEvents.map(evt => renderEvent(evt, layout[evt.id] || { left: 0, width: 100, zIndex: 1 }))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Marquee Selection Rectangle */}
        {marqueeActive && marqueeStart && marqueeEnd && (() => {
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (!containerRect) return null;
          const scrollLeft = containerRef.current?.scrollLeft || 0;
          const scrollTop = containerRef.current?.scrollTop || 0;
          const left = Math.min(marqueeStart.x, marqueeEnd.x) - containerRect.left + scrollLeft;
          const top = Math.min(marqueeStart.y, marqueeEnd.y) - containerRect.top + scrollTop;
          const width = Math.abs(marqueeEnd.x - marqueeStart.x);
          const height = Math.abs(marqueeEnd.y - marqueeStart.y);
          return (
            <div
              className="absolute pointer-events-none z-50"
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                border: '2px dashed rgba(60, 81, 112, 0.85)',
                backgroundColor: 'rgba(60, 81, 112, 0.10)',
                borderRadius: '4px',
              }}
            />
          );
        })()}
      </div>
    );
  };

  const renderMonthView = () => {
    const days = getMonthDays(currentDate);
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    const renderEventChip = (evt: CalendarEvent) => {
      const baseColor = getTeacherColor(evt.teacherId);
      return (
        <div
          key={evt.id}
          data-event-id={evt.id}
          tabIndex={0}
          role="button"
          aria-label={`${evt.name} — ${t('bl01_calendar.event.aria_focused')}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDetailItem({ type: 'EVENT', data: evt });
            }
          }}
          onMouseDown={(e) => handleMonthChipMouseDown(e, evt)}
          onClick={(e) => {
            e.stopPropagation();
            if (wasDraggingRef.current) return;
            if (selectionMode === 'MARQUEE') {
              setSelectedEventIds(prev => {
                const next = new Set(prev);
                next.has(evt.id) ? next.delete(evt.id) : next.add(evt.id);
                return next;
              });
            } else {
              setDetailItem({ type: 'EVENT', data: evt });
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY, event: evt });
          }}
          className={`text-[10px] text-start px-1.5 py-1 rounded ${dragState?.id === evt.id ? 'cursor-grabbing opacity-90 shadow-cadenza-deep' : 'cursor-grab'} border-s-2 animate-cadenza-arrive select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 ${selectedEventIds.has(evt.id) ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' : ''} ${recentlySaved.has(evt.id) ? 'animate-cadenza-pulse' : ''} ${evt.isCanceled
            ? 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-600 border-slate-400'
            : 'hover:opacity-90 hover:shadow-cadenza-soft transition-all'
            }`}
          style={!evt.isCanceled ? {
            backgroundColor: hexToRgba(baseColor, 0.1),
            borderColor: baseColor,
            color: 'inherit'
          } : {}}
        >
          <span style={{ color: !evt.isCanceled ? baseColor : undefined }} className="font-bold flex justify-between items-center gap-2 brightness-75 dark:brightness-100">
            <span>{formatTime(new Date(evt.start))}</span>
            {evt.teacherId && (
              <span className="text-[9px] uppercase tracking-wider opacity-70 truncate text-end">
                {teachers.find(t => t.id === evt.teacherId)?.fullName.split(' ')[0]}
              </span>
            )}
          </span>
          <div className="flex flex-col mt-0.5">
            <span className="font-medium text-slate-800 dark:text-slate-200 block truncate" title={evt.name || t('cal.unnamed')}>
              {evt.name || t('cal.unnamed')}
            </span>
            {evt.roomId && (
              <span className="text-[9px] text-slate-600 dark:text-slate-400 mt-px flex items-center gap-1 truncate" title={rooms.find(r => r.id === evt.roomId)?.name}>
                <MapPin size={8} className="flex-shrink-0" />
                {rooms.find(r => r.id === evt.roomId)?.name}
              </span>
            )}
            {evt.tags && evt.tags.length > 0 && (
              <div className="flex flex-wrap gap-0.5 mt-1">
                {evt.tags.slice(0, 2).map(tag => (
                  <TagChip key={tag} label={tag} size="xs" />
                ))}
                {evt.tags.length > 2 && (
                  <span
                    className="text-[9px] text-slate-500 dark:text-slate-400 px-1"
                    title={evt.tags.slice(2).join(', ')}
                  >
                    +{evt.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 z-10 relative bg-white dark:bg-slate-900">
          {(weeks[0] ?? days.slice(0, 7)).map(d => (
            <div key={d.toISOString()} className="p-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
              {d.toLocaleDateString(settings.language, { weekday: 'short' })}
            </div>
          ))}
        </div>
        <div className="flex-1 grid grid-rows-6 min-h-0">
          {weeks.map((week, wIdx) => {
            const isBottomRow = wIdx >= 4;

            const weekStart = new Date(week[0]);
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(week[6]);
            weekEnd.setHours(23, 59, 59, 999);

            const weekGantts = ganttBlocks.filter(b => {
              const bStart = new Date(b.startDate);
              const bEnd = new Date(b.endDate);
              return bStart <= weekEnd && bEnd >= weekStart;
            }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

            const lanes: (string | null)[][] = [];
            const ganttLanes = new Map<string, number>();

            weekGantts.forEach(block => {
              const bStart = new Date(block.startDate); bStart.setHours(0, 0, 0, 0);
              const bEnd = new Date(block.endDate); bEnd.setHours(23, 59, 59, 999);

              let startIdx = week.findIndex(d => {
                const dStart = new Date(d); dStart.setHours(0, 0, 0, 0);
                return dStart.getTime() === bStart.getTime();
              });
              let endIdx = week.findIndex(d => {
                const dStart = new Date(d); dStart.setHours(0, 0, 0, 0);
                return dStart.getTime() === bEnd.getTime();
              });

              if (startIdx === -1) startIdx = 0;
              if (endIdx === -1) endIdx = 6;
              if (startIdx > 6) startIdx = 6;
              if (endIdx > 6) endIdx = 6;

              let laneIdx = 0;
              while (true) {
                if (!lanes[laneIdx]) lanes[laneIdx] = Array(7).fill(null);
                let overlap = false;
                for (let i = startIdx; i <= endIdx; i++) {
                  if (lanes[laneIdx][i] !== null) { overlap = true; break; }
                }
                if (!overlap) {
                  for (let i = startIdx; i <= endIdx; i++) {
                    lanes[laneIdx][i] = block.id;
                  }
                  ganttLanes.set(block.id, laneIdx);
                  break;
                }
                laneIdx++;
              }
            });

            return (
              <div key={wIdx} className="relative min-h-0 border-b border-slate-100 dark:border-slate-800 last:border-0 h-full group/week hover:z-50">
                {monthSubMode === 'GANTT' ? (
                <>
                {/* Layer 1: Background & Day Click (z-0) */}
                <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                  {week.map((day) => {
                    const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                    return (
                      <div
                        key={day.toISOString()}
                        data-month-day={day.toISOString()}
                        className={`border-e border-slate-100 dark:border-slate-800 last:border-0 pointer-events-auto cursor-pointer ${!isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-950/50' : 'bg-transparent'}`}
                        onClick={() => { setCurrentDate(day); setViewMode('DAY'); }}
                      />
                    );
                  })}
                </div>

                {/* Layer 2: Gantt Overlay (z-5) */}
                <div className="absolute top-[32px] bottom-0 start-0 end-0 overflow-y-auto custom-scrollbar pointer-events-none z-5">
                  <div className="grid grid-cols-7 gap-y-1 relative pointer-events-auto pb-1" style={{ gridAutoRows: 'min-content' }}>
                    {weekGantts.map(block => {
                      const bStart = new Date(block.startDate); bStart.setHours(0, 0, 0, 0);
                      const bEnd = new Date(block.endDate); bEnd.setHours(23, 59, 59, 999);

                      let startIdx = week.findIndex(d => {
                        const dStart = new Date(d); dStart.setHours(0, 0, 0, 0);
                        return dStart.getTime() === bStart.getTime();
                      });
                      let endIdx = week.findIndex(d => {
                        const dStart = new Date(d); dStart.setHours(0, 0, 0, 0);
                        return dStart.getTime() === bEnd.getTime();
                      });

                      if (startIdx === -1) startIdx = 0;
                      if (endIdx === -1) endIdx = 6;

                      const colStart = startIdx + 1;
                      const colSpan = endIdx - startIdx + 1;
                      const laneIdx = ganttLanes.get(block.id)!;

                      const isStartCut = bStart < weekStart;
                      const isEndCut = bEnd > weekEnd;

                      let roundedClass = 'rounded';
                      let marginClass = 'mx-1';
                      let bdrClass = 'border border-black/10 dark:border-white/10';

                      if (isStartCut && isEndCut) {
                        roundedClass = 'rounded-none';
                        marginClass = 'mx-0';
                        bdrClass = 'border-y border-black/10 dark:border-white/10';
                      } else if (isStartCut) {
                        roundedClass = 'rounded-e';
                        marginClass = 'me-1 ms-0';
                        bdrClass = 'border border-s-0 border-black/10 dark:border-white/10';
                      } else if (isEndCut) {
                        roundedClass = 'rounded-s';
                        marginClass = 'ms-1 me-0';
                        bdrClass = 'border border-e-0 border-black/10 dark:border-white/10';
                      }

                      return (
                        <div
                          key={block.id}
                          onClick={(e) => { e.stopPropagation(); setDetailItem({ type: 'GANTT', data: block }); }}
                          className={`px-2 py-0.5 text-[10px] text-white font-medium truncate cursor-pointer hover:opacity-90 flex-shrink-0 ${roundedClass} ${marginClass} ${bdrClass}`}
                          style={{
                            gridColumn: `${colStart} / span ${colSpan}`,
                            gridRow: laneIdx + 1,
                            backgroundColor: block.color,
                          }}
                          title={block.title}
                        >
                          {block.title}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Layer 3: Date Headers & Popups (z-20) */}
                <div className="absolute top-0 start-0 end-0 h-[32px] grid grid-cols-7 pointer-events-none z-20">
                  {week.map((day, dIdx) => {
                    const isToday = day.toDateString() === new Date().toDateString();
                    const isRightEdge = dIdx >= 5;
                    const dayEvents = displayEvents.filter(e => {
                      const d = new Date(e.start);
                      return d.getDate() === day.getDate() && d.getMonth() === day.getMonth();
                    }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

                    return (
                      <div key={day.toISOString()} className="p-1 flex justify-between items-start pointer-events-auto group/cell">
                        <div className="group relative z-30">
                          <span
                            className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors ${isToday ? 'bg-blue-600 text-white hover:bg-blue-700' : dayEvents.filter(e => !e.isGanttBlock).length > 0 ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setCurrentDate(day); setViewMode('DAY'); }}
                          >
                            {day.getDate()}
                          </span>

                          {/* Hover Popup Wrapper with Bridge */}
                          <div
                            className={`absolute ${isBottomRow ? 'bottom-full pb-1' : 'top-full pt-1'} ${isRightEdge ? '-end-2' : '-start-2'} z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all`}
                          >
                            <div className="w-48 max-h-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                              <div className="p-2 border-b border-slate-100 dark:border-slate-700 font-bold text-xs sticky top-0 bg-white dark:bg-slate-800 z-10 text-slate-800 dark:text-slate-200">
                                {day.toLocaleDateString(settings.language, { weekday: 'short', month: 'short', day: 'numeric' })}
                              </div>
                              <div className="overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
                                {dayEvents.length === 0 ? (
                                  <div className="text-xs text-slate-400 p-2 text-center">{t('cal.no_events')}</div>
                                ) : (
                                  dayEvents.map(evt => renderEventChip(evt))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <button onClick={(e) => { e.stopPropagation(); handleSlotClick(day, 10); }} className="text-slate-300 hover:text-blue-500 opacity-0 group-hover/cell:opacity-100 transition-opacity relative z-30">
                          <Plus size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                </>
                ) : (
                  /* Events mode: full-cell with inline event list + Gantt rubric on date hover */
                  <div className="absolute inset-0 grid grid-cols-7 z-10">
                    {week.map((day, dIdx) => {
                      const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                      const isToday = day.toDateString() === new Date().toDateString();
                      const isRightEdge = dIdx >= 5;
                      const dayEvents = displayEvents.filter(e => {
                        const d = new Date(e.start);
                        return d.getDate() === day.getDate() && d.getMonth() === day.getMonth();
                      }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
                      const dayRef = new Date(day); dayRef.setHours(12, 0, 0, 0);
                      const dayBlocks = ganttBlocks.filter(b => {
                        return new Date(b.startDate) <= dayRef && new Date(b.endDate) >= dayRef;
                      });

                      return (
                        <div
                          key={day.toISOString()}
                          data-month-day={day.toISOString()}
                          className={`relative flex flex-col border-e border-slate-100 dark:border-slate-800 last:border-0 min-h-0 group/cell cursor-pointer ${!isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-950/50' : 'bg-transparent'}`}
                          onClick={() => { setCurrentDate(day); setViewMode('DAY'); }}
                        >
                          {/* Header: date circle + plus button */}
                          <div className="h-[32px] flex justify-between items-start p-1 flex-shrink-0">
                            <div className="group relative z-30">
                              <span
                                className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors ${isToday ? 'bg-blue-600 text-white hover:bg-blue-700' : dayEvents.filter(e => !e.isGanttBlock).length > 0 ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setCurrentDate(day); setViewMode('DAY'); }}
                              >
                                {day.getDate()}
                              </span>

                              {/* Hover popup: Gantt rubric for this date */}
                              <div
                                className={`absolute ${isBottomRow ? 'bottom-full pb-1' : 'top-full pt-1'} ${isRightEdge ? '-end-2' : '-start-2'} z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all`}
                              >
                                <div className="w-56 max-h-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                                  <div className="p-2 border-b border-slate-100 dark:border-slate-700 font-bold text-xs sticky top-0 bg-white dark:bg-slate-800 z-10 text-slate-800 dark:text-slate-200">
                                    {day.toLocaleDateString(settings.language, { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </div>
                                  <div className="overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
                                    {dayBlocks.length === 0 ? (
                                      <div className="text-xs text-slate-400 p-2 text-center">{t('cal.no_gantt_blocks')}</div>
                                    ) : (
                                      dayBlocks.map(b => (
                                        <div
                                          key={b.id}
                                          onClick={(e) => { e.stopPropagation(); setDetailItem({ type: 'GANTT', data: b }); }}
                                          className="text-[10px] text-start px-1.5 py-1 rounded cursor-pointer border-s-2 hover:opacity-90 hover:shadow-cadenza-soft transition-all"
                                          style={{ backgroundColor: hexToRgba(b.color, 0.12), borderColor: b.color }}
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: b.color }} />
                                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate" title={b.title}>{b.title}</span>
                                          </div>
                                          <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-px ms-3.5">
                                            {new Date(b.startDate).toLocaleDateString(settings.language, { month: 'short', day: 'numeric' })} – {new Date(b.endDate).toLocaleDateString(settings.language, { month: 'short', day: 'numeric' })}
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <button onClick={(e) => { e.stopPropagation(); handleSlotClick(day, 10); }} className="text-slate-300 hover:text-blue-500 opacity-0 group-hover/cell:opacity-100 transition-opacity relative z-30">
                              <Plus size={14} />
                            </button>
                          </div>

                          {/* Inline scrollable event list */}
                          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1 pt-0 space-y-1">
                            {dayEvents.map(evt => renderEventChip(evt))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 transition-colors duration-75 relative">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 shadow-sm z-30">
        <div className="flex items-center gap-2 flex-wrap">

          {/* Group A — WHEN: date navigation, today, jump-to-date */}
          <div className="flex items-center h-8 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button onClick={() => {
              const d = new Date(currentDate);
              if (viewMode === 'MONTH') d.setMonth(d.getMonth() - 1);
              else if (viewMode === 'WEEK') d.setDate(d.getDate() - 7);
              else d.setDate(d.getDate() - 1);
              setCurrentDate(d);
            }} className="h-7 w-7 flex items-center justify-center hover:bg-white dark:hover:bg-slate-700 rounded-md transition-all text-slate-600 dark:text-slate-300" aria-label={t('cal.prev')}>
              {isRtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            <div className="px-2 flex items-center justify-center min-w-[150px] h-7">
              <div className="flex flex-col items-center justify-center leading-tight">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  {viewMode === 'MONTH'
                    ? currentDate.toLocaleDateString(settings.language, { month: 'long', year: 'numeric' })
                    : viewMode === 'WEEK'
                      ? `${t('cal.week_of')} ${getStartOfWeek(currentDate).toLocaleDateString(settings.language)}`
                      : currentDate.toLocaleDateString(settings.language, { weekday: 'long', month: 'short', day: 'numeric' })
                  }
                </span>
                {settings.weekNumberDisplay !== 'none' && (
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider">
                    {settings.weekNumberDisplay === 'week-number' ? `${t('cal.week_num')} ${getWeekNumber(currentDate)}` : `${t('cal.week_of')} ${getStartOfWeek(currentDate).toLocaleDateString(settings.language)}`}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => {
              const d = new Date(currentDate);
              if (viewMode === 'MONTH') d.setMonth(d.getMonth() + 1);
              else if (viewMode === 'WEEK') d.setDate(d.getDate() + 7);
              else d.setDate(d.getDate() + 1);
              setCurrentDate(d);
            }} className="h-7 w-7 flex items-center justify-center hover:bg-white dark:hover:bg-slate-700 rounded-md transition-all text-slate-600 dark:text-slate-300" aria-label={t('cal.next')}>
              {isRtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>

          <button onClick={() => setCurrentDate(new Date())} className="h-8 px-3 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 text-xs font-bold rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
            {t('cal.today')}
          </button>

          <div className="relative group/tt flex items-center">
            <CalendarIcon size={14} className="absolute start-2 text-slate-400 pointer-events-none" />
            <input
              type="date"
              aria-label={t('cal.jump_to_date')}
              value={jumpDateValue}
              onChange={(e) => {
                setJumpDateValue(e.target.value);
                commitJumpDate(e.target.value);
              }}
              onInput={(e) => {
                setJumpDateValue(e.currentTarget.value);
                commitJumpDate(e.currentTarget.value);
              }}
              onBlur={(e) => commitJumpDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitJumpDate(e.currentTarget.value);
                }
              }}
              className="h-8 w-[9.25rem] rounded-lg border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 ps-7 pe-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span role="tooltip" className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[11px] font-medium bg-slate-900 dark:bg-slate-700 text-white whitespace-nowrap opacity-0 group-hover/tt:opacity-100 transition-opacity z-50 shadow-lg">
              {t('cal.jump_to_date')}
            </span>
          </div>

          {/* Divider — separates WHEN from VIEW */}
          <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

          {/* Group B — VIEW: granularity (day / week / month) */}
          <div className="flex items-center h-8 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-xs font-medium">
            {['DAY', 'WEEK', 'MONTH'].map((m) => (
              <button key={m} onClick={() => setViewMode(m as ViewMode)} className={`h-7 px-3 rounded-md transition-all ${viewMode === m ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>{t('cal.' + m.toLowerCase())}</button>
            ))}
          </div>

          {/* Group B' — Month sub-mode (Gantt vs Events). Only visible in Month view. */}
          {viewMode === 'MONTH' && (
            <>
              <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />
              <div className="flex items-center h-8 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-xs font-medium">
                {(['EVENTS', 'GANTT'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMonthSubMode(m)}
                    className={`h-7 px-3 rounded-md transition-all ${monthSubMode === m ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    {t(m === 'GANTT' ? 'cal.month_mode_gantt' : 'cal.month_mode_events')}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Divider — separates VIEW from NARROW */}
          <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

          {/* Group C — NARROW: search + filter / power tools / gantt */}
          <div className="relative flex items-center">
            <input
              type="text"
              value={filterState.search}
              onChange={(e) => filterSet({ search: e.target.value })}
              placeholder={t('cal.search_placeholder') || 'Search events…'}
              aria-label={t('cal.search_placeholder') || 'Search events'}
              className="h-8 ps-7 pe-6 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none w-36 transition-all focus:w-48"
            />
            <Search size={12} className="absolute start-2 text-slate-400 pointer-events-none" />
            {filterState.search && (
              <button onClick={() => filterSet({ search: '' })} aria-label={t('filter.clear') || 'Clear search'} className="absolute end-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center h-8 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="relative group/tt h-full">
              <button
                onClick={() => setSidebarTab(sidebarTab === 'FILTERS' ? null : 'FILTERS')}
                className={`relative h-full w-9 flex items-center justify-center text-xs font-medium transition-colors rounded-s-lg ${
                  sidebarTab === 'FILTERS'
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : filterIsActive
                    ? 'bg-slate-100 dark:bg-slate-800 text-blue-500 dark:text-blue-400 hover:text-slate-700 dark:hover:text-slate-200'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                aria-label={t('cal.toggle_filters')}
              >
                <Filter size={14} />
                {activeFilterPills.length > 0 && (
                  <span className="absolute -top-1 -end-1 z-10 min-w-[14px] h-3.5 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none ring-2 ring-white dark:ring-slate-900">
                    {activeFilterPills.length}
                  </span>
                )}
              </button>
              <span role="tooltip" className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[11px] font-medium bg-slate-900 dark:bg-slate-700 text-white whitespace-nowrap opacity-0 group-hover/tt:opacity-100 transition-opacity z-50 shadow-lg">
                {t('cal.toggle_filters')}
              </span>
            </div>
            <div className="w-px h-full bg-slate-200 dark:bg-slate-700" />
            <div className="relative group/tt h-full">
              <button
                type="button"
                onClick={() => setAttendanceWorklistOpen(open => !open)}
                className={`relative h-full w-9 flex items-center justify-center text-xs font-medium transition-colors ${
                  attendanceWorklistOpen
                    ? 'bg-cadenza-600/10 dark:bg-cadenza-600/30 text-cadenza-700 dark:text-cadenza-200'
                    : unmarkedAttendanceWorklist.length > 0
                    ? 'bg-slate-100 dark:bg-slate-800 text-cadenza-700 dark:text-cadenza-200 hover:text-slate-700 dark:hover:text-slate-200'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                aria-label={t('attendance.worklist.toggle')}
                aria-expanded={attendanceWorklistOpen}
              >
                <ClipboardList size={14} />
                {unmarkedAttendanceWorklist.length > 0 && (
                  <span className="absolute -top-1 -end-1 z-10 min-w-[14px] h-3.5 rounded-full bg-cadenza-700 text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none ring-2 ring-white dark:ring-slate-900">
                    {unmarkedAttendanceWorklist.length}
                  </span>
                )}
              </button>
              <span role="tooltip" className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[11px] font-medium bg-slate-900 dark:bg-slate-700 text-white whitespace-nowrap opacity-0 group-hover/tt:opacity-100 transition-opacity z-50 shadow-lg">
                {t('attendance.worklist.toggle')}
              </span>
            </div>
            <div className="w-px h-full bg-slate-200 dark:bg-slate-700" />
            <div className="relative group/tt h-full">
              <button
                onClick={() => setSidebarTab(sidebarTab === 'POWER_TOOLS' ? null : 'POWER_TOOLS')}
                className={`h-full w-9 flex items-center justify-center text-xs font-medium transition-colors ${
                  sidebarTab === 'POWER_TOOLS'
                    ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                aria-label={t('speed.power_tools')}
              >
                <Zap size={14} />
              </button>
              <span role="tooltip" className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[11px] font-medium bg-slate-900 dark:bg-slate-700 text-white whitespace-nowrap opacity-0 group-hover/tt:opacity-100 transition-opacity z-50 shadow-lg">
                {t('speed.power_tools')}
              </span>
            </div>
            <div className="w-px h-full bg-slate-200 dark:bg-slate-700" />
            <div className="relative group/tt h-full">
              <button
                onClick={() => setSidebarTab(sidebarTab === 'GANTT' ? null : 'GANTT')}
                className={`h-full w-9 flex items-center justify-center text-xs font-medium transition-colors ${
                  !settings.aiAssistantEnabled ? 'rounded-e-lg' : ''
                } ${
                  sidebarTab === 'GANTT'
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                aria-label={t('speed.gantt_view')}
              >
                <List size={14} />
              </button>
              <span role="tooltip" className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[11px] font-medium bg-slate-900 dark:bg-slate-700 text-white whitespace-nowrap opacity-0 group-hover/tt:opacity-100 transition-opacity z-50 shadow-lg">
                {t('speed.gantt_view')}
              </span>
            </div>
            {settings.aiAssistantEnabled && (
              <>
                <div className="w-px h-full bg-slate-200 dark:bg-slate-700" />
                <div className="relative group/tt h-full">
                  <button
                    onClick={() => setSidebarTab(sidebarTab === 'BOT' ? null : 'BOT')}
                    className={`h-full w-9 flex items-center justify-center text-xs font-medium transition-colors rounded-e-lg ${
                      sidebarTab === 'BOT'
                        ? 'bg-cadenza-600/10 dark:bg-cadenza-600/30 text-cadenza-600 dark:text-cadenza-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                    aria-label={t('bot.title')}
                  >
                    <Sparkles size={14} />
                  </button>
                  <span role="tooltip" className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[11px] font-medium bg-slate-900 dark:bg-slate-700 text-white whitespace-nowrap opacity-0 group-hover/tt:opacity-100 transition-opacity z-50 shadow-lg">
                    {t('bot.title')}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Group D — STATUS & TOOLS: pushed to trailing edge */}
          {unresolvedConflictCount > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('ADMIN_INBOX')}
              aria-label={t('bl01_calendar.conflicts_badge.aria').replace('{count}', String(unresolvedConflictCount))}
              title={t('bl01_calendar.conflicts_badge.aria').replace('{count}', String(unresolvedConflictCount))}
              className="ms-auto inline-flex items-center gap-1 h-6 ps-2 pe-2.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/60 dark:hover:bg-red-900/50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700"
            >
              <AlertOctagon size={12} aria-hidden="true" />
              <span>{t('bl01_calendar.conflicts_badge.label')}: {unresolvedConflictCount}</span>
            </button>
          )}

          <div className={`flex items-center gap-2 ${unresolvedConflictCount > 0 ? '' : 'ms-auto'}`}>
            <ImportExportDropdown
              entityType="EVENT"
              iconOnly
              existingData={eventExportData}
              existingDuplicateKeys={eventDupKeys}
              dependencyMaps={{ activityByName: csvActivityByName, l2ByName: csvL2ByName, staffByEmail: {}, studentByName: {} }}
              activityNames={activities.map(a => a.name)}
              settings={settings}
              canWrite={canWriteCalendar}
              onImportComplete={handleEventImportComplete}
            />

            <div className="relative group/tt">
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="h-8 w-8 rounded-lg border bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors flex items-center justify-center"
                aria-label={t('cal.help_title')}
              >
                <HelpCircle size={16} />
              </button>
              <span role="tooltip" className="pointer-events-none absolute top-full mt-1.5 right-0 px-2 py-1 rounded text-[11px] font-medium bg-slate-900 dark:bg-slate-700 text-white whitespace-nowrap opacity-0 group-hover/tt:opacity-100 transition-opacity z-50 shadow-lg">
                {t('cal.help_title')}
              </span>
            </div>
          </div>

        </div>
      </div>

      {attendanceWorklistOpen && (
        <div className="absolute end-4 top-16 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white shadow-cadenza-deep dark:border-slate-800 dark:bg-slate-900">
          {renderAttendanceWorklist()}
        </div>
      )}

      {/* BL01: Active filter pills row — visible only when at least one select-style filter is active. */}
      {activeFilterPills.length > 0 && (
        <div
          className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 px-4 py-2"
          role="region"
          aria-label={t('bl01_calendar.filter.active_label')}
        >
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 me-1">
              {t('bl01_calendar.filter.active_label')}
            </span>
            {activeFilterPills.map(pill => (
              <span
                key={pill.key}
                className="inline-flex items-center gap-1 ps-2.5 pe-1 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-800 border border-stone-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
              >
                <span className="truncate max-w-[180px]">{pill.label}</span>
                <button
                  type="button"
                  onClick={pill.clear}
                  aria-label={`${t('bl01_calendar.filter.pill_remove')}: ${pill.label}`}
                  title={t('bl01_calendar.filter.pill_remove')}
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full text-stone-500 hover:text-stone-900 hover:bg-stone-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700"
                >
                  <X size={10} aria-hidden="true" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="ms-auto text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-500 rounded-sm"
            >
              {t('bl01_calendar.filter.clear_all')}
            </button>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="mx-4 mt-2 mb-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          <p>{t('cal.help_text')}</p>
        </div>
      )}

      {viewMode === 'MONTH' ? renderMonthView() : renderTimeGrid(viewMode === 'DAY' ? [currentDate] : getWeekDays(currentDate))}

      {detailItem && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDetailItem(null)} />
          <div className="fixed z-50 top-1/2 left-1/2 w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] transform -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 dark:border-slate-700 dark:bg-slate-900">
            <div className="h-2 w-full" style={{ backgroundColor: detailItem.type === 'EVENT' ? getTeacherColor((detailItem.data as CalendarEvent).teacherId) : (detailItem.data as GanttBlock).color }} />
            <div className="max-h-[calc(90vh-0.5rem)] overflow-y-auto p-5 sm:p-6 custom-scrollbar">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{detailItem.type === 'EVENT' ? (detailItem.data as CalendarEvent).name : (detailItem.data as GanttBlock).title}</h3>
                <button onClick={() => setDetailItem(null)} aria-label={t('common.close') || 'Close'} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><X size={20} /></button>
              </div>
              <div className="space-y-3 mb-6">
                {detailItem.type === 'EVENT' ? (
                  <>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-400"><Clock size={16} className="me-3 flex-shrink-0" /><span>{new Date((detailItem.data as CalendarEvent).start).toLocaleString(settings.language)} - <br />{formatTime(new Date((detailItem.data as CalendarEvent).end))}</span></div>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-400"><User size={16} className="me-3 flex-shrink-0" /><span>{teachers.find(t => t.id === (detailItem.data as CalendarEvent).teacherId)?.fullName}</span></div>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-400"><MapPin size={16} className="me-3 flex-shrink-0" /><span>{rooms.find(r => r.id === (detailItem.data as CalendarEvent).roomId)?.name}</span></div>
                    {(detailItem.data as CalendarEvent).isCanceled && <div className="mt-2 bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 text-xs px-2 py-1 rounded inline-block font-bold">{t('cal.canceled')}</div>}
                    {(detailItem.data as CalendarEvent).recurrenceRule && <div className="mt-2 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded inline-flex items-center gap-1 font-bold"><Repeat size={10} /> {t('cal.recurring')}</div>}
                    {(detailItem.data as CalendarEvent).recurrenceId && <div className="mt-2 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded inline-flex items-center gap-1 font-bold"><Repeat size={10} /> {t('cal.part_of_series')}</div>}
                    {renderAttendancePanel()}
                  </>
                ) : (
                  <>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-400"><CalendarRange size={16} className="me-3 flex-shrink-0" /><span>{new Date((detailItem.data as GanttBlock).startDate).toLocaleDateString(settings.language)} - <br />{new Date((detailItem.data as GanttBlock).endDate).toLocaleDateString(settings.language)}</span></div>
                    {(detailItem.data as GanttBlock).isBlackout && <div className="mt-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-1 rounded flex items-center w-fit font-bold"><AlertOctagon size={12} className="me-1" /> {t('cal.blackout_period')}</div>}
                  </>
                )}
              </div>
              <div className="flex gap-3">
                {detailItem.type === 'EVENT' && isAdmin && <button onClick={(e) => handleEditEvent(detailItem.data as CalendarEvent, { x: e.clientX, y: e.clientY })} className="flex-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 py-2 rounded-lg flex items-center justify-center font-medium transition-colors"><Edit size={16} className="me-2" /> {t('cal.detail.edit')}</button>}
                {detailItem.type === 'EVENT' && isAdmin && (
                  <button
                    onClick={() => handleCancelEvent(detailItem.data as CalendarEvent)}
                    className={`flex-1 py-2 rounded-lg flex items-center justify-center font-medium transition-colors ${(detailItem.data as CalendarEvent).isCanceled
                      ? 'bg-green-50 hover:bg-green-100 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300'
                      : 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300'
                      }`}
                  >
                    {(detailItem.data as CalendarEvent).isCanceled
                      ? <><RotateCcw size={16} className="me-2" /> {t('cal.detail.restore')}</>
                      : <><Ban size={16} className="me-2" /> {t('cal.detail.cancel_event')}</>
                    }
                  </button>
                )}
                <button onClick={() => detailItem.type === 'EVENT' ? handleDeleteEvent(detailItem.data.id, detailItem.data as CalendarEvent) : handleDeleteGantt(detailItem.data.id)} className="flex-1 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 py-2 rounded-lg flex items-center justify-center font-medium transition-colors"><Trash2 size={16} className="me-2" /> {t('cal.detail.delete')}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Right-click Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-[201] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-cadenza-deep py-1 min-w-[160px] animate-cadenza-arrive"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-700 mb-1">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[180px]">{contextMenu.event.name}</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => { handleEditEvent(contextMenu.event, { x: contextMenu.x, y: contextMenu.y }); setContextMenu(null); }}
                className="w-full text-start px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <Edit size={14} className="text-blue-500" /> {t('cal.detail.edit')}
              </button>
            )}
            {isAdmin && !contextMenu.event.isCanceled && (
              <button
                onClick={() => { handleCancelEvent(contextMenu.event); setContextMenu(null); }}
                className="w-full text-start px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <Ban size={14} className="text-amber-500" /> {t('cal.detail.cancel_event')}
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => { handleDeleteEvent(contextMenu.event.id, contextMenu.event); setContextMenu(null); }}
                className="w-full text-start px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
              >
                <Trash2 size={14} /> {t('cal.detail.delete')}
              </button>
            )}
          </div>
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalAnchorPosition(null); }}
        title={editingEvent.id ? t('event.edit') : t('event.new')}
        anchorPosition={modalAnchorPosition}
        isDirty={true}
        maxWidth="max-w-2xl"
        footerContent={
          <div className="flex justify-between w-full">
            <div>
              {editingEvent.id && (
                <button type="button" onClick={() => { handleDeleteEvent(editingEvent.id!, editingEvent as CalendarEvent); setIsModalOpen(false); }} className="text-red-500 hover:text-red-700 text-sm font-medium">
                  {t('cal.delete_event')}
                </button>
              )}
            </div>
            <div className="flex space-x-3 rtl:space-x-reverse">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors"
              >
                {t('btn.cancel')}
              </button>
              <button
                type="button"
                onClick={() => formRef.current?.triggerSave()}
                disabled={!eventFormCanSave || formRef.current?.isSaving}
                className="px-4 py-2 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-lg text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {formRef.current?.isSaving && <Loader2 size={14} className="animate-spin" />}
                {t('cal.save_changes')}
              </button>
            </div>
          </div>
        }
      >
        <EventFormV2
          ref={formRef}
          activitiesV2={activities}
          l1Subcategories={l1Subs}
          l2Subcategories={l2Subs}
          staffMembers={staffMembersV2}
          teachingAssignments={teachingAssignmentsV2}
          orgRoles={orgRolesV2}
          rooms={rooms}
          settings={settings}
          editingEventId={editingEvent.id || null}
          existingFormState={editingEvent.id ? {
            activityId: editingEvent.activityId || '',
            l1Id: '',
            l2Id: (editingEvent as any).l2Id || (editingEvent as any).subcategoryId || '',
            name: editingEvent.name || '',
            date: editingEvent.start ? new Date(editingEvent.start).toISOString().split('T')[0] : '',
            startTime: editingEvent.start ? `${String(new Date(editingEvent.start).getHours()).padStart(2, '0')}:${String(new Date(editingEvent.start).getMinutes()).padStart(2, '0')}` : '',
            endTime: editingEvent.end ? `${String(new Date(editingEvent.end).getHours()).padStart(2, '0')}:${String(new Date(editingEvent.end).getMinutes()).padStart(2, '0')}` : '',
            location: '',
            roomId: editingEvent.roomId || '',
            isCanceled: editingEvent.isCanceled || false,
            recurrenceRule: editingEvent.recurrenceRule,
            notes: '',
            tags: (editingEvent as CalendarEvent).tags || [],
          } : undefined}
          tagSuggestions={allEventTags}
          isExceptionEdit={editingEvent.isExceptionEdit}
          initialStart={editingEvent.start}
          initialEnd={editingEvent.end}
          onSave={handleSaveV2}
          onValidityChange={setEventFormCanSave}
          t={t}
        />
      </Modal>

      {/* Recurrence Series Dialog - "Just This One" vs "All Events" */}
      <Modal
        isOpen={!!recurrenceDialog}
        onClose={() => setRecurrenceDialog(null)}
        title={recurrenceDialog ? (recurrenceDialog.type === 'EDIT' ? t('recurrence.edit_series_title') : recurrenceDialog.type === 'DELETE' ? t('recurrence.delete_series_title') : recurrenceDialog.event.isCanceled ? t('recurrence.restore_series_title') : t('recurrence.cancel_series_title')) : ''}
        isDirty={false}
        t={t}
        maxWidth="max-w-sm"
        footerContent={<></>}
      >
        {recurrenceDialog && (
          <div>
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex-shrink-0">
                <Repeat size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {recurrenceDialog.type === 'EDIT' ? t('recurrence.series_desc_edit') : recurrenceDialog.type === 'DELETE' ? t('recurrence.series_desc_delete') : recurrenceDialog.event.isCanceled ? t('recurrence.series_desc_restore') : t('recurrence.series_desc_cancel')}
              </p>
            </div>
            <div className="flex gap-3 mb-4 mt-6">
              <button
                onClick={() => handleSeriesAction('THIS')}
                className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 py-3 rounded-lg font-medium transition-colors text-sm"
              >
                {t('recurrence.just_this_one')}
              </button>
              <button
                onClick={() => handleSeriesAction('ALL')}
                className="flex-1 btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft py-3 rounded-lg font-medium transition-colors text-sm"
              >
                {t('recurrence.all_events')}
              </button>
            </div>
            <button
              onClick={() => setRecurrenceDialog(null)}
              className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-2 transition-colors"
            >
              {t('btn.cancel')}
            </button>
          </div>
        )}
      </Modal>

      {/* Floating New Event FAB (admins only) — bottom-end (right LTR / left RTL) */}
      {isAdmin && (
        <button
          onClick={() => openModal()}
          aria-label={t('speed.new_event')}
          title={t('speed.new_event')}
          className="absolute bottom-6 end-6 z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950"
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};
