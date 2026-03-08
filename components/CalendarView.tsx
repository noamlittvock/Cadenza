import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { CalendarEvent, Teacher, Room, GanttBlock, AppSettings, ListsState, RecurrenceRule, DayOfWeek, Activity } from '../types';
import { generateId, INITIAL_LISTS, INITIAL_RATE_CARDS } from '../constants';
import { CATEGORY_SCHEMAS } from '../utils/schemaRegistry';
import { lookupRate } from '../utils/rateLookup';
import { ChevronLeft, ChevronRight, Filter, Calendar as CalendarIcon, GripHorizontal, X, Edit, Trash2, Clock, MapPin, User, AlertOctagon, CalendarRange, Plus, Zap, List, ChevronUp, ChevronDown, Repeat, Ban, RotateCcw, HelpCircle, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { syncEventToGoogle, removeEventFromGoogle, updateEventInGoogle } from '../utils/googleCalendarSync';
import { DatePicker } from './DatePicker';
import { Modal } from './Modal';
import { EventFormV2, EventFormState } from './EventFormV2';

import { TRANSLATIONS } from '../constants';
import { detectRoomConflicts, getConflictingEventIds } from '../utils/roomConflicts';
import { ImportExportDropdown } from './ImportExportDropdown';
import { useFirestoreSync } from '../utils/useFirestoreSync';
import {
  ActivityV2, L1Subcategory, L2Subcategory, StaffMemberV2,
  TeachingAssignmentV2, OrgRoleV2, StudentV2, EnrollmentV2,
  EnsembleRosterMember, EventV2, EventParticipant, V2_COLLECTIONS,
} from '../types/v2';
interface Props {
  events: CalendarEvent[];
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  teachers: Teacher[];
  rooms: Room[];
  ganttBlocks: GanttBlock[];
  setGanttBlocks: React.Dispatch<React.SetStateAction<GanttBlock[]>>;
  settings: AppSettings;
  lists: ListsState;
  activities: Activity[];

  // Navigation & View State
  onNavigate: (view: any) => void;
  currentView: string;
  selectionMode: 'NORMAL' | 'MARQUEE';
  setSelectionMode: (mode: 'NORMAL' | 'MARQUEE') => void;
  selectedEventIds: Set<string>;
  setSelectedEventIds: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Mobile Control
  setIsMobileMenuOpen: (isOpen: boolean) => void;

  // Persistent Calendar State
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  viewMode: 'DAY' | 'WEEK' | 'MONTH';
  setViewMode: (mode: 'DAY' | 'WEEK' | 'MONTH') => void;
}

type ViewMode = 'DAY' | 'WEEK' | 'MONTH';

interface DragState {
  id: string;
  type: 'MOVE' | 'RESIZE';
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

// Module-level scroll position — survives component re-mounts (sidebar toggle, etc.)
let savedScrollTop = 7 * PIXELS_PER_HOUR; // Default: scroll to 7 AM

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
  events, setEvents, teachers, rooms, ganttBlocks, setGanttBlocks, settings, lists, activities,
  onNavigate, currentView,
  selectionMode, setSelectionMode, selectedEventIds, setSelectedEventIds,
  setIsMobileMenuOpen,
  currentDate, setCurrentDate, viewMode, setViewMode
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const isRtl = settings?.language === 'he-IL';
  const { googleAccessToken, currentUser, isAdmin, isSuperAdmin, orgId } = useAuth();

  // Google Calendar sync is locked to the tenant admin who connected it
  const isCalendarOwner = currentUser?.email?.toLowerCase() === settings.googleCalendarConnectedBy?.toLowerCase();

  // Safe Fallback for lists
  const activeLists = lists || INITIAL_LISTS;

  // ─── v2.0 Firestore hooks (Phase 5) ─────────────────────────────────────
  const [activitiesV2] = useFirestoreSync<ActivityV2>(V2_COLLECTIONS.activities, []);
  const [l1Subs] = useFirestoreSync<L1Subcategory>(V2_COLLECTIONS.l1Subcategories, []);
  const [l2Subs] = useFirestoreSync<L2Subcategory>(V2_COLLECTIONS.l2Subcategories, []);
  const [staffMembersV2] = useFirestoreSync<StaffMemberV2>(V2_COLLECTIONS.staffMembers, []);
  const [teachingAssignmentsV2] = useFirestoreSync<TeachingAssignmentV2>(V2_COLLECTIONS.teachingAssignments, []);
  const [orgRolesV2] = useFirestoreSync<OrgRoleV2>(V2_COLLECTIONS.orgRoles, []);
  const [studentsV2] = useFirestoreSync<StudentV2>(V2_COLLECTIONS.students, []);
  const [enrollmentsV2] = useFirestoreSync<EnrollmentV2>(V2_COLLECTIONS.enrollments, []);
  const [ensembleRosterV2] = useFirestoreSync<EnsembleRosterMember>(V2_COLLECTIONS.ensembleRosterMembers, []);
  const [eventsV2, setEventsV2] = useFirestoreSync<EventV2>(V2_COLLECTIONS.events, []);
  const [eventParticipantsV2, setEventParticipantsV2] = useFirestoreSync<EventParticipant>(V2_COLLECTIONS.eventParticipants, []);

  // ─── CSV Import/Export data ──────────────────────────────────────────────
  const canWriteCalendar = isSuperAdmin || isAdmin;

  const eventExportData = useMemo(() => eventsV2.map(e => ({
    activityName: activitiesV2.find(a => a.id === e.activityId)?.name || '',
    l2Name: l2Subs.find(l => l.id === e.l2Id)?.name || '',
    date: e.date || '',
    startTime: e.startTime || '',
    endTime: e.endTime || '',
    location: e.location || '',
  })), [eventsV2, activitiesV2, l2Subs]);

  const eventDupKeys = useMemo(() => new Set(eventsV2.map(e => {
    const aName = activitiesV2.find(a => a.id === e.activityId)?.name || '';
    const lName = l2Subs.find(l => l.id === e.l2Id)?.name || '';
    return `${aName}|${lName}|${e.date}|${e.startTime}`.toLowerCase();
  })), [eventsV2, activitiesV2, l2Subs]);

  const csvActivityByName = useMemo(
    () => Object.fromEntries(activitiesV2.map(a => [a.name.toLowerCase(), a.id])),
    [activitiesV2],
  );
  const csvL2ByName = useMemo(
    () => Object.fromEntries(l2Subs.map(l => [l.name.toLowerCase(), l.id])),
    [l2Subs],
  );

  const handleEventImportComplete = useCallback((rows: Record<string, string>[]) => {
    const now = Timestamp.now();
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
        revenueItems: null, notes: null,
        createdAt: now, updatedAt: now,
      };
    });
    setEventsV2(prev => [...prev, ...newEvents]);
  }, [orgId, setEventsV2, csvActivityByName, csvL2ByName]);

  // Filters
  const [filterTeacher, setFilterTeacher] = useState<string>('ALL');
  const [filterRoom, setFilterRoom] = useState<string>('ALL');
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [filterPosition, setFilterPosition] = useState<string>('ALL');
  const [filterTag, setFilterTag] = useState<string>('ALL');

  // Interaction State
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [tempEvent, setTempEvent] = useState<CalendarEvent | null>(null);
  const wasDraggingRef = useRef(false);
  const gridDaysRef = useRef<Date[]>([]);

  // Speed Dial State
  const [isSpeedDialOpen, setIsSpeedDialOpen] = useState(false);

  // Filter UI State
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [showCanceled, setShowCanceled] = useState(true);
  const [showBlackouts, setShowBlackouts] = useState(true);
  const [showOnlyOverlapping, setShowOnlyOverlapping] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Modal State (Edit/Create)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Partial<CalendarEvent>>({});
  const [initialEditingEvent, setInitialEditingEvent] = useState<Partial<CalendarEvent>>({});

  // Detail Popover State
  const [detailItem, setDetailItem] = useState<DetailItem>(null);

  // Right-click Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; event: CalendarEvent } | null>(null);

  // Recurrence Dialog State
  const [recurrenceDialog, setRecurrenceDialog] = useState<{
    type: 'EDIT' | 'DELETE' | 'CANCEL';
    event: CalendarEvent;
  } | null>(null);

  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);

  // Marquee Drag-to-Select State
  const [marqueeActive, setMarqueeActive] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number } | null>(null);
  const marqueeContainerRef = useRef<HTMLDivElement>(null);

  // Gantt Collapsible State
  const [isGanttExpanded, setIsGanttExpanded] = useState(true);

  // Preserve scroll position across re-mounts (view switching to/from Power Tools/Gantt)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Smart centering: Find peak event hour and scroll to it (±2 hours)
    const peakHour = findPeakEventHour(events, currentDate);
    const centerHour = Math.max(START_HOUR, Math.min(peakHour - 1, END_HOUR - 2)); // ±1-2 hour buffer
    const smartScrollTop = centerHour * PIXELS_PER_HOUR;

    // Use smart scroll on mount if events exist, otherwise restore saved position
    const hasEventsOnDate = events.some((e: CalendarEvent) => {
      const eStart = new Date(e.start);
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);
      return eStart >= dayStart && eStart <= dayEnd;
    });

    el.scrollTop = hasEventsOnDate ? smartScrollTop : savedScrollTop;

    // Save scroll position as user scrolls
    const handleScroll = () => { savedScrollTop = el.scrollTop; };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [viewMode, currentDate, events]); // re-run when view mode, date, or events change

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

  const filteredEvents = useMemo(() => {
    const events = expandedEvents.filter(evt => {
      // Hide blacked out events
      if (evt.isHidden && !showBlackouts) return false;

      // Hide canceled events if toggle is off
      if (evt.isCanceled && !showCanceled) return false;

      // Hide blackout-hidden events if toggle is off
      if (evt.isHidden && !showBlackouts) return false;

      const teacher = teachers.find(t => t.id === evt.teacherId);

      if (filterTeacher !== 'ALL' && evt.teacherId !== filterTeacher) return false;
      if (filterRoom !== 'ALL' && evt.roomId !== filterRoom) return false;
      if (filterClass !== 'ALL') {
        if (evt.activityId !== filterClass) return false;
      }

      if (filterPosition !== 'ALL' && teacher) {
        if (!teacher.positions.includes(filterPosition)) return false;
      }

      if (filterTag !== 'ALL' && teacher) {
        if (!teacher.tags.includes(filterTag)) return false;
      }

      if (eventSearchQuery.trim()) {
        const q = eventSearchQuery.toLowerCase();
        const nameMatch = evt.name?.toLowerCase().includes(q);
        const teacherMatch = teacher?.fullName?.toLowerCase().includes(q);
        const roomMatch = rooms.find(r => r.id === evt.roomId)?.name?.toLowerCase().includes(q);
        if (!nameMatch && !teacherMatch && !roomMatch) return false;
      }

      return true;
    });

    // If overlapping filter is ON, show only events that have time/room conflicts
    if (showOnlyOverlapping) {
      const conflicts = detectRoomConflicts(events);
      const conflictingEventIds = getConflictingEventIds(conflicts);
      return events.filter(e => conflictingEventIds.has(e.id));
    }

    return events;
  }, [expandedEvents, teachers, activities, rooms, filterTeacher, filterRoom, filterClass, filterPosition, filterTag, showCanceled, showBlackouts, showOnlyOverlapping, eventSearchQuery]);

  const conflictingIds = useMemo(() => {
    const conflicts = detectRoomConflicts(filteredEvents);
    return getConflictingEventIds(conflicts);
  }, [filteredEvents]);

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
      startY: e.clientY,
      startX: e.clientX,
      originalStart: new Date(evt.start),
      originalEnd: new Date(evt.end)
    });
    setTempEvent(evt);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState || !tempEvent) return;

      const deltaY = e.clientY - dragState.startY;
      const deltaMinutes = Math.round((deltaY / PIXELS_PER_HOUR) * 60 / SNAP_MINUTES) * SNAP_MINUTES;

      // Horizontal: calculate day offset from column width
      let dayOffset = 0;
      if (dragState.type === 'MOVE' && containerRef.current && gridDaysRef.current.length > 1) {
        const containerWidth = containerRef.current.clientWidth;
        const dayColumnWidth = (containerWidth - 50) / gridDaysRef.current.length;
        if (dayColumnWidth > 0) {
          dayOffset = Math.round((e.clientX - dragState.startX) / dayColumnWidth);
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

  const openModal = (evt?: Partial<CalendarEvent>) => {
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
    setInitialEditingEvent(newEvent);
    setIsModalOpen(true);
    setDetailItem(null);
  };

  const handleSlotClick = (date: Date, hour: number) => {
    // Only Admin+ can create events
    if (!isAdmin) return;
    // In MARQUEE mode, don't open the create-event modal when clicking empty space
    if (selectionMode === 'MARQUEE') return;
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(start.getMinutes() + settings.defaultEventDuration);

    openModal({
      start: start.toISOString(),
      end: end.toISOString(),
      roomId: rooms[0]?.id
    });
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

  const saveEvent = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingEvent.name) return;

    if (new Date(editingEvent.end!) <= new Date(editingEvent.start!)) {
      alert(t('cal.alert_end_after_start'));
      return;
    }

    if (editingEvent.id) {
      // Check if this is a virtual recurring instance (id contains _)
      const isVirtualInstance = editingEvent.id.includes('_') && editingEvent.recurrenceId;
      if (isVirtualInstance) {
        // This was triggered by "Just This One" — create exception
        const parentId = editingEvent.recurrenceId!;
        const dateKey = editingEvent.originalStart || new Date(editingEvent.start!).toISOString().split('T')[0];

        // Add date to parent's exceptions
        setEvents(prev => prev.map(ev => {
          if (ev.id === parentId) {
            return { ...ev, exceptions: [...(ev.exceptions || []), dateKey] };
          }
          return ev;
        }));

        // Create a standalone exception event
        const exceptionEvent: CalendarEvent = {
          ...editingEvent as CalendarEvent,
          id: generateId(),
          recurrenceId: parentId,
          isExceptionEdit: true,
          originalStart: dateKey,
          recurrenceRule: undefined, // Not a parent
          staffMemberIds: editingEvent.teacherId ? [editingEvent.teacherId] : (editingEvent as CalendarEvent).staffMemberIds || [],
        };
        setEvents(prev => [...prev, exceptionEvent]);
      } else {
        // Regular event or parent event edit
        const updatedEvent = {
          ...editingEvent,
          staffMemberIds: editingEvent.teacherId ? [editingEvent.teacherId] : (editingEvent as CalendarEvent).staffMemberIds || [],
        } as CalendarEvent;
        setEvents(prev => prev.map(ev => ev.id === editingEvent.id ? { ...ev, ...updatedEvent } : ev));
        setRecentlySaved(prev => new Set(prev).add(updatedEvent.id!));
        setTimeout(() => setRecentlySaved(prev => { const n = new Set(prev); n.delete(updatedEvent.id!); return n; }), 1500);

        if (updatedEvent.googleEventId) {
          handleGoogleSync(updatedEvent, true);
        }
        handleTeacherGoogleSync(updatedEvent, true);
      }
    } else {
      // New event — save with recurrence rule if set
      const newId = generateId();
      const selectedActivity = activities.find(a => a.id === editingEvent.activityId);
      const newEvent: CalendarEvent = {
        ...editingEvent,
        id: newId,
        isCanceled: false,
        isHidden: false,
        description: editingEvent.description || '',
        // Phase 3 dual-write fields
        activityId: editingEvent.activityId,
        subcategoryId: editingEvent.subcategoryId,
        eventIntent: selectedActivity?.type,
        staffMemberIds: editingEvent.teacherId ? [editingEvent.teacherId] : [],
        classification: selectedActivity?.name || '',
      } as CalendarEvent;
      setEvents(prev => [...prev, newEvent]);
      setRecentlySaved(prev => new Set(prev).add(newId));
      setTimeout(() => setRecentlySaved(prev => { const n = new Set(prev); n.delete(newId); return n; }), 1500);
      handleGoogleSync(newEvent);
      handleTeacherGoogleSync(newEvent);
    }
    setIsModalOpen(false);
  };

  // ─── Phase 5: v2.0 Event Form Save Handler ─────────────────────────────
  const handleSaveV2 = (formState: EventFormState) => {
    const now = { seconds: Date.now() / 1000, nanoseconds: 0 } as any;
    const selectedActivity = activitiesV2.find(a => a.id === formState.activityId);

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
        revenueItems: formState.revenueItems.length > 0 ? formState.revenueItems : null,
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
          subcategoryId: formState.l2Id || undefined,
          classification: selectedActivity?.name || '',
          isCanceled: formState.isCanceled,
          cancellationPayStatus: formState.cancellationPayStatus,
          recurrenceId: parentId,
          isExceptionEdit: true,
          originalStart: dateKey,
          recurrenceRule: undefined,
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
          subcategoryId: formState.l2Id || undefined,
          classification: selectedActivity?.name || '',
          isCanceled: formState.isCanceled,
          cancellationPayStatus: formState.cancellationPayStatus,
          recurrenceRule: formState.recurrenceRule,
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
        const newParticipants: EventParticipant[] = [
          ...formState.staffParticipants.map(sp => ({
            id: generateId(),
            orgId: '',
            eventId: editingEvent.id!,
            participantType: 'STAFF' as const,
            staffMemberId: sp.staffMemberId,
            assignmentType: sp.assignmentType,
            teachingAssignmentId: sp.teachingAssignmentId || null,
            orgRoleId: sp.orgRoleId || null,
            rateSnapshot: sp.rateSnapshot,
            rateOverride: sp.rateOverride ?? null,
            createdAt: now,
          })),
          ...formState.externalParticipants.map(ep => ({
            id: generateId(),
            orgId: '',
            eventId: editingEvent.id!,
            participantType: 'EXTERNAL' as const,
            externalName: ep.externalName,
            oneOffFee: ep.oneOffFee,
            notes: ep.notes || null,
            createdAt: now,
          })),
        ];
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
        subcategoryId: formState.l2Id || undefined,
        eventIntent: selectedActivity?.activityType === 'ADMINISTRATIVE' ? 'OPERATIONAL' : 'INSTRUCTIONAL',
        classification: selectedActivity?.name || '',
        isCanceled: false,
        isHidden: false,
        recurrenceRule: formState.recurrenceRule,
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
        revenueItems: formState.revenueItems.length > 0 ? formState.revenueItems : null,
        notes: formState.notes || null,
        createdAt: now,
        updatedAt: now,
      };
      setEventsV2(prev => [...prev, newEventV2]);

      // v2.0 EventParticipant documents
      const newParticipants: EventParticipant[] = [
        ...formState.staffParticipants.map(sp => ({
          id: generateId(),
          orgId: '',
          eventId: newId,
          participantType: 'STAFF' as const,
          staffMemberId: sp.staffMemberId,
          assignmentType: sp.assignmentType,
          teachingAssignmentId: sp.teachingAssignmentId || null,
          orgRoleId: sp.orgRoleId || null,
          rateSnapshot: sp.rateSnapshot,
          rateOverride: sp.rateOverride ?? null,
          createdAt: now,
        })),
        ...formState.externalParticipants.map(ep => ({
          id: generateId(),
          orgId: '',
          eventId: newId,
          participantType: 'EXTERNAL' as const,
          externalName: ep.externalName,
          oneOffFee: ep.oneOffFee,
          notes: ep.notes || null,
          createdAt: now,
        })),
      ];
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

  const handleEditEvent = (evt: CalendarEvent) => {
    // Check if this is part of a recurring series
    if (evt.recurrenceRule || evt.recurrenceId) {
      setRecurrenceDialog({ type: 'EDIT', event: evt });
      setDetailItem(null);
      return;
    }
    openModal(evt);
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
    return teacher ? teacher.color : '#4f46e5'; // Default indigo
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
      <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex flex-col transition-all duration-300 relative overflow-hidden">
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
        className={`absolute rounded-xl border shadow-sm transition-shadow select-none overflow-hidden group animate-cadenza-arrive ${selectedEventIds.has(evt.id) ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' : ''} ${isConflicting && !evt.isCanceled ? 'ring-2 ring-amber-500 ring-offset-1 dark:ring-offset-slate-900' : ''} ${recentlySaved.has(evt.id) ? 'animate-cadenza-pulse' : ''} ${evt.isCanceled
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
              {evt.isCanceled && <span className="font-bold text-red-500 flex-shrink-0" style={{ fontSize: timeFontSize }}>✕</span>}
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
              {evt.isCanceled && <div className="font-bold text-red-500 mt-1">{t('cal.canceled')}</div>}
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
                <div key={i} className="border-e border-slate-100 dark:border-slate-800 h-full relative group">
                  <div className="absolute inset-0 bg-blue-50/0 group-hover:bg-blue-50/5 pointer-events-none transition-colors" />
                  {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map(h => (
                    <div
                      key={h}
                      className="h-[60px] border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-cell"
                      onClick={() => handleSlotClick(day, h)}
                      title={t('cal.click_add')}
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
                  <div key={day.toISOString()} className="relative h-full pointer-events-auto overflow-hidden">
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
                border: '2px dashed rgba(59, 130, 246, 0.8)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
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
    return (
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 z-10 relative bg-white dark:bg-slate-900">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="p-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
              {d}
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
                {/* Layer 1: Background & Day Click (z-0) */}
                <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                  {week.map((day) => {
                    const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                    return (
                      <div
                        key={day.toISOString()}
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
                                  dayEvents.map(evt => {
                                    const baseColor = getTeacherColor(evt.teacherId);
                                    return (
                                      <div
                                        key={evt.id}
                                        data-event-id={evt.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
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
                                        className={`text-[10px] text-start px-1.5 py-1 rounded cursor-pointer border-s-2 animate-cadenza-arrive ${selectedEventIds.has(evt.id) ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' : ''} ${recentlySaved.has(evt.id) ? 'animate-cadenza-pulse' : ''} ${evt.isCanceled
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
                                        </div>
                                      </div>
                                    );
                                  })
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
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 transition-colors duration-200 relative">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 shadow-sm z-30">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button onClick={() => {
                const d = new Date(currentDate);
                if (viewMode === 'MONTH') d.setMonth(d.getMonth() - 1);
                else if (viewMode === 'WEEK') d.setDate(d.getDate() - 7);
                else d.setDate(d.getDate() - 1);
                setCurrentDate(d);
              }} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded shadow-sm transition-all text-slate-600 dark:text-slate-300">
                {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
              <div className="px-3 flex items-center relative group">
                <DatePicker type="date" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e: any) => { if (e.target.value) setCurrentDate(new Date(e.target.value)); }} />
                <div className="flex flex-col items-center justify-center min-w-[150px]">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 flex items-center">
                    {viewMode === 'MONTH'
                      ? currentDate.toLocaleDateString(settings.language, { month: 'long', year: 'numeric' })
                      : viewMode === 'WEEK'
                        ? `${t('cal.week_of')} ${getStartOfWeek(currentDate).toLocaleDateString(settings.language)}`
                        : currentDate.toLocaleDateString(settings.language, { weekday: 'long', month: 'short', day: 'numeric' })
                    }
                    <CalendarIcon size={14} className="ms-2 opacity-50" />
                  </span>
                  {settings.weekNumberDisplay !== 'none' && (
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                      {settings.weekNumberDisplay === 'week-number' ? `${t('cal.week_num')} ${getWeekNumber(currentDate)}` : `Week of ${getStartOfWeek(currentDate).toLocaleDateString()}`}
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
              }} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded shadow-sm transition-all text-slate-600 dark:text-slate-300">
                {isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>
            </div>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 text-xs font-bold rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">{t('cal.today')}</button>

            {/* Jump to Date */}
            <input
              type="date"
              title={t('cal.jump_to_date') || 'Jump to date'}
              value={currentDate.toISOString().split('T')[0]}
              onChange={(e) => { if (e.target.value) setCurrentDate(new Date(e.target.value + 'T12:00:00')); }}
              className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
            />

            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs font-medium">
              {['DAY', 'WEEK', 'MONTH'].map((m) => (
                <button key={m} onClick={() => setViewMode(m as ViewMode)} className={`px-3 py-1.5 rounded transition-all ${viewMode === m ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>{t('cal.' + m.toLowerCase())}</button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>

          {/* Canceled Status Toggle */}
          <div className="flex items-center gap-2">
            <span className={`text-[10px] leading-tight font-medium transition-colors text-end ${!showCanceled ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>{t('cal.hide_canceled').split(' ')[0]}<br />{t('cal.hide_canceled').split(' ')[1]}</span>
            <button
              onClick={() => setShowCanceled(!showCanceled)}
              className="status-toggle-track"
              role="switch"
              aria-checked={!showCanceled}
              aria-label={t('cal.aria_toggle_canceled')}
              style={{
                backgroundColor: !showCanceled ? '#ef4444' : '#cbd5e1',
              }}
            >
              <span
                className="status-toggle-thumb"
                style={{
                  transform: !showCanceled ? (isRtl ? 'translateX(-16px)' : 'translateX(16px)') : (isRtl ? 'translateX(-2px)' : 'translateX(2px)'),
                }}
              />
            </button>
          </div>

          {/* Blackouts Status Toggle */}
          <div className="flex items-center gap-2">
            <span className={`text-[10px] leading-tight font-medium transition-colors text-end ${!showBlackouts ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`}>{t('cal.hide_blackouts').split(' ')[0]}<br />{t('cal.hide_blackouts').split(' ')[1]}</span>
            <button
              onClick={() => setShowBlackouts(!showBlackouts)}
              className="status-toggle-track"
              role="switch"
              aria-checked={!showBlackouts}
              aria-label={t('cal.aria_toggle_blackouts')}
              style={{
                backgroundColor: !showBlackouts ? '#f97316' : '#cbd5e1',
              }}
            >
              <span
                className="status-toggle-thumb"
                style={{
                  transform: !showBlackouts ? (isRtl ? 'translateX(-16px)' : 'translateX(16px)') : (isRtl ? 'translateX(-2px)' : 'translateX(2px)'),
                }}
              />
            </button>
          </div>

          {/* Overlapping Lessons Toggle */}
          <div className="flex items-center gap-2">
            <span className={`text-[10px] leading-tight font-medium transition-colors text-end ${showOnlyOverlapping ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>{t('cal.overlapping').split(' ')[0]}<br />{t('cal.overlapping').split(' ')[1] || 'Lessons'}</span>
            <button
              onClick={() => setShowOnlyOverlapping(!showOnlyOverlapping)}
              className="status-toggle-track"
              role="switch"
              aria-checked={showOnlyOverlapping}
              aria-label={t('cal.aria_toggle_overlapping')}
              style={{
                backgroundColor: showOnlyOverlapping ? '#dc2626' : '#cbd5e1',
              }}
            >
              <span
                className="status-toggle-thumb"
                style={{
                  transform: showOnlyOverlapping ? (isRtl ? 'translateX(-16px)' : 'translateX(16px)') : (isRtl ? 'translateX(-2px)' : 'translateX(2px)'),
                }}
              />
            </button>
          </div>

          {/* Filter Toggle Button */}
          <button
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className={`p-2 rounded-lg border transition-colors ${isFiltersExpanded || filterTeacher !== 'ALL' || filterRoom !== 'ALL' || filterClass !== 'ALL' || filterPosition !== 'ALL' || filterTag !== 'ALL'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            title={t('cal.toggle_filters')}
          >
            <Filter size={16} />
          </button>

          {/* Event Search */}
          <div className="relative flex items-center">
            <input
              type="text"
              value={eventSearchQuery}
              onChange={(e) => setEventSearchQuery(e.target.value)}
              placeholder={t('cal.search_placeholder') || 'Search events…'}
              className="pl-7 pr-2 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none w-36 transition-all focus:w-48"
            />
            <Search size={11} className="absolute start-2 text-slate-400 pointer-events-none" />
            {eventSearchQuery && (
              <button onClick={() => setEventSearchQuery('')} className="absolute end-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={12} />
              </button>
            )}
          </div>

          <ImportExportDropdown
            entityType="EVENT"
            existingData={eventExportData}
            existingDuplicateKeys={eventDupKeys}
            dependencyMaps={{ activityByName: csvActivityByName, l2ByName: csvL2ByName, staffByEmail: {}, studentByName: {} }}
            activityNames={activitiesV2.map(a => a.name)}
            settings={settings}
            canWrite={canWriteCalendar}
            onImportComplete={handleEventImportComplete}
          />

          {/* Inline Filter Panel - always flows inline next to the filter toggle */}
          {isFiltersExpanded && (
            <div className="flex items-center gap-2 flex-nowrap">
              <select className="filter-select-uniform" value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
                <option value="ALL">{t('cal.filter.teacher_all')}</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
              <select className="filter-select-uniform" value={filterRoom} onChange={e => setFilterRoom(e.target.value)}>
                <option value="ALL">{t('cal.filter.room_all')}</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className="filter-select-uniform" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                <option value="ALL">{t('cal.filter.activity_all')}</option>
                {activities.filter(a => !a.isArchived).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select className="filter-select-uniform" value={filterPosition} onChange={e => setFilterPosition(e.target.value)}>
                <option value="ALL">{t('cal.filter.position_all')}</option>
                {activeLists.positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="filter-select-uniform" value={filterTag} onChange={e => setFilterTag(e.target.value)}>
                <option value="ALL">{t('cal.filter.tag_all')}</option>
                {activeLists.tags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          {/* Help Toggle */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="p-2 rounded-lg border bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title={t('cal.help_title')}
          >
            <HelpCircle size={16} />
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="mx-4 mt-2 mb-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          <p>{t('cal.help_text')}</p>
        </div>
      )}

      {viewMode === 'MONTH' ? renderMonthView() : renderTimeGrid(viewMode === 'DAY' ? [currentDate] : getWeekDays(currentDate))}

      {/* Speed Dial Component */}
      <div className="fixed bottom-8 end-8 z-[60] flex flex-col items-end space-y-3">
        {/* Speed Dial Actions */}
        {isSpeedDialOpen && (
          <div className="flex flex-col items-end space-y-3 mb-2" style={{ animation: 'fadeSlideUp 400ms ease-out forwards' }}>
            {/* Power Tools */}
            <div className="group flex items-center">
              <span
                className="me-3 px-3 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg shadow-lg
                  max-w-0 overflow-hidden whitespace-nowrap opacity-0 
                  group-hover:max-w-[150px] group-hover:opacity-100
                  transition-all duration-300 ease-out"
              >
                {t('speed.power_tools')}
              </span>
              <button
                onClick={() => onNavigate(currentView === 'POWER_TOOLS' ? 'CALENDAR' : 'POWER_TOOLS')}
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg 
                  ${currentView === 'POWER_TOOLS' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}
                  transition-transform duration-200 hover:scale-110`}
              >
                <Zap size={20} />
              </button>
            </div>

            {/* Gantt View */}
            <div className="group flex items-center">
              <span
                className="me-3 px-3 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg shadow-lg
                  max-w-0 overflow-hidden whitespace-nowrap opacity-0 
                  group-hover:max-w-[150px] group-hover:opacity-100
                  transition-all duration-300 ease-out"
              >
                {t('speed.gantt_view')}
              </span>
              <button
                onClick={() => onNavigate(currentView === 'GANTT' ? 'CALENDAR' : 'GANTT')}
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg 
                  ${currentView === 'GANTT' ? 'bg-purple-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}
                  transition-transform duration-200 hover:scale-110`}
              >
                <List size={20} />
              </button>
            </div>

            {/* Add Event (Admin+ only) */}
            {isAdmin && (
            <div className="group flex items-center">
              <span
                className="me-3 px-3 py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg shadow-lg
                  max-w-0 overflow-hidden whitespace-nowrap opacity-0
                  group-hover:max-w-[150px] group-hover:opacity-100
                  transition-all duration-300 ease-out"
              >
                {t('speed.new_event')}
              </span>
              <button
                onClick={() => { openModal(); }}
                className="w-12 h-12 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-transform duration-200 hover:scale-110"
              >
                <CalendarIcon size={20} />
              </button>
            </div>
            )}
          </div>
        )}

        {/* Main Floating Action Button */}
        <button
          onClick={() => setIsSpeedDialOpen(!isSpeedDialOpen)}
          className="btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft rounded-full w-14 h-14 flex items-center justify-center shadow-lg"
          style={{ transition: 'transform 400ms ease-out, background-color 200ms' }}
        >
          {isSpeedDialOpen ? <ChevronUp size={32} /> : <Plus size={32} />}
        </button>
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {detailItem && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDetailItem(null)} />
          <div className="fixed z-50 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="h-2 w-full" style={{ backgroundColor: detailItem.type === 'EVENT' ? getTeacherColor((detailItem.data as CalendarEvent).teacherId) : (detailItem.data as GanttBlock).color }} />
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{detailItem.type === 'EVENT' ? (detailItem.data as CalendarEvent).name : (detailItem.data as GanttBlock).title}</h3>
                <button onClick={() => setDetailItem(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><X size={20} /></button>
              </div>
              <div className="space-y-3 mb-6">
                {detailItem.type === 'EVENT' ? (
                  <>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-400"><Clock size={16} className="me-3 flex-shrink-0" /><span>{new Date((detailItem.data as CalendarEvent).start).toLocaleString(settings.language)} - <br />{formatTime(new Date((detailItem.data as CalendarEvent).end))}</span></div>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-400"><User size={16} className="me-3 flex-shrink-0" /><span>{teachers.find(t => t.id === (detailItem.data as CalendarEvent).teacherId)?.fullName}</span></div>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-400"><MapPin size={16} className="me-3 flex-shrink-0" /><span>{rooms.find(r => r.id === (detailItem.data as CalendarEvent).roomId)?.name}</span></div>
                    {(detailItem.data as CalendarEvent).isCanceled && <div className="mt-2 bg-red-100 text-red-700 text-xs px-2 py-1 rounded inline-block font-bold">{t('cal.canceled')}</div>}
                    {(detailItem.data as CalendarEvent).recurrenceRule && <div className="mt-2 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded inline-flex items-center gap-1 font-bold"><Repeat size={10} /> {t('cal.recurring')}</div>}
                    {(detailItem.data as CalendarEvent).recurrenceId && <div className="mt-2 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded inline-flex items-center gap-1 font-bold"><Repeat size={10} /> {t('cal.part_of_series')}</div>}
                  </>
                ) : (
                  <>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-400"><CalendarRange size={16} className="me-3 flex-shrink-0" /><span>{new Date((detailItem.data as GanttBlock).startDate).toLocaleDateString(settings.language)} - <br />{new Date((detailItem.data as GanttBlock).endDate).toLocaleDateString(settings.language)}</span></div>
                    {(detailItem.data as GanttBlock).isBlackout && <div className="mt-2 bg-red-100 text-red-700 text-xs px-2 py-1 rounded flex items-center w-fit font-bold"><AlertOctagon size={12} className="me-1" /> {t('cal.blackout_period')}</div>}
                  </>
                )}
              </div>
              <div className="flex gap-3">
                {detailItem.type === 'EVENT' && isAdmin && <button onClick={() => handleEditEvent(detailItem.data as CalendarEvent)} className="flex-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 py-2 rounded-lg flex items-center justify-center font-medium transition-colors"><Edit size={16} className="me-2" /> {t('cal.detail.edit')}</button>}
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
                onClick={() => { handleEditEvent(contextMenu.event); setContextMenu(null); }}
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
        onClose={() => setIsModalOpen(false)}
        title={editingEvent.id ? t('event.edit') : t('event.new')}
        isDirty={true}
        t={t}
        maxWidth="max-w-2xl"
        footerContent={<></>}
      >
        <EventFormV2
          activitiesV2={activitiesV2}
          l1Subcategories={l1Subs}
          l2Subcategories={l2Subs}
          staffMembers={staffMembersV2}
          teachingAssignments={teachingAssignmentsV2}
          orgRoles={orgRolesV2}
          students={studentsV2}
          enrollments={enrollmentsV2}
          ensembleRoster={ensembleRosterV2}
          rooms={rooms}
          settings={settings}
          editingEventId={editingEvent.id || null}
          existingFormState={editingEvent.id ? {
            activityId: editingEvent.activityId || '',
            l1Id: '',
            l2Id: editingEvent.subcategoryId || '',
            name: editingEvent.name || '',
            date: editingEvent.start ? new Date(editingEvent.start).toISOString().split('T')[0] : '',
            startTime: editingEvent.start ? `${String(new Date(editingEvent.start).getHours()).padStart(2, '0')}:${String(new Date(editingEvent.start).getMinutes()).padStart(2, '0')}` : '',
            endTime: editingEvent.end ? `${String(new Date(editingEvent.end).getHours()).padStart(2, '0')}:${String(new Date(editingEvent.end).getMinutes()).padStart(2, '0')}` : '',
            location: '',
            roomId: editingEvent.roomId || '',
            isCanceled: editingEvent.isCanceled || false,
            cancellationPayStatus: editingEvent.cancellationPayStatus,
            recurrenceRule: editingEvent.recurrenceRule,
            notes: '',
          } : undefined}
          isExceptionEdit={editingEvent.isExceptionEdit}
          initialStart={editingEvent.start}
          initialEnd={editingEvent.end}
          onSave={handleSaveV2}
          onCancel={() => setIsModalOpen(false)}
          onDelete={editingEvent.id ? () => { handleDeleteEvent(editingEvent.id!, editingEvent as CalendarEvent); setIsModalOpen(false); } : undefined}
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
    </div>
  );
};