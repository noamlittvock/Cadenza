import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { CalendarEvent, Teacher, Room, GanttBlock, AppSettings, ListsState, RecurrenceRule, DayOfWeek } from '../types';
import { generateId, INITIAL_LISTS, INITIAL_RATE_CARDS } from '../constants';
import { CATEGORY_SCHEMAS } from '../utils/schemaRegistry';
import { lookupRate } from '../utils/rateLookup';
import { ChevronLeft, ChevronRight, AlertCircle, Filter, Calendar as CalendarIcon, GripHorizontal, X, Edit, Trash2, Clock, MapPin, User, AlertOctagon, CalendarRange, Plus, Zap, List, ChevronUp, Repeat, Ban, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { syncEventToGoogle, removeEventFromGoogle, updateEventInGoogle } from '../utils/googleCalendarSync';

import { TRANSLATIONS } from '../constants';
interface Props {
  events: CalendarEvent[];
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  teachers: Teacher[];
  rooms: Room[];
  ganttBlocks: GanttBlock[];
  setGanttBlocks: React.Dispatch<React.SetStateAction<GanttBlock[]>>;
  settings: AppSettings;
  lists: ListsState;

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
  originalStart: Date;
  originalEnd: Date;
}

type DetailItem =
  | { type: 'EVENT'; data: CalendarEvent }
  | { type: 'GANTT'; data: GanttBlock }
  | null;

const START_HOUR = 7;
const END_HOUR = 22;
const PIXELS_PER_HOUR = 60;
const SNAP_MINUTES = 15;

// Module-level scroll position — survives component re-mounts (sidebar toggle, etc.)
let savedScrollTop = START_HOUR * PIXELS_PER_HOUR; // Default: scroll to 7 AM

export const CalendarView: React.FC<Props> = ({
  events, setEvents, teachers, rooms, ganttBlocks, setGanttBlocks, settings, lists,
  onNavigate, currentView,
  selectionMode, setSelectionMode, selectedEventIds, setSelectedEventIds,
  setIsMobileMenuOpen,
  currentDate, setCurrentDate, viewMode, setViewMode
}) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const { googleAccessToken, currentUser } = useAuth();

  // Google Calendar sync is locked to the tenant admin who connected it
  const isCalendarOwner = currentUser?.email?.toLowerCase() === settings.googleCalendarConnectedBy?.toLowerCase();

  // Safe Fallback for lists
  const activeLists = lists || INITIAL_LISTS;

  // Filters
  const [filterTeacher, setFilterTeacher] = useState<string>('ALL');
  const [filterRoom, setFilterRoom] = useState<string>('ALL');
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [filterPosition, setFilterPosition] = useState<string>('ALL');
  const [filterTag, setFilterTag] = useState<string>('ALL');

  // Interaction State
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [tempEvent, setTempEvent] = useState<CalendarEvent | null>(null);

  // Speed Dial State
  const [isSpeedDialOpen, setIsSpeedDialOpen] = useState(false);

  // Filter UI State
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [showCanceled, setShowCanceled] = useState(true);
  const [showBlackouts, setShowBlackouts] = useState(true);

  // Modal State (Edit/Create)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Partial<CalendarEvent>>({});

  // Detail Popover State
  const [detailItem, setDetailItem] = useState<DetailItem>(null);

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

  // Preserve scroll position across re-mounts (view switching to/from Power Tools/Gantt)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Restore saved scroll position on mount
    el.scrollTop = savedScrollTop;

    // Save scroll position as user scrolls
    const handleScroll = () => { savedScrollTop = el.scrollTop; };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [viewMode]); // re-run when view mode changes (DAY/WEEK/MONTH switches the scroll container)

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
    return expandedEvents.filter(evt => {
      // Hide blacked out events
      if (evt.isHidden && !showBlackouts) return false;

      // Hide canceled events if toggle is off
      if (evt.isCanceled && !showCanceled) return false;

      // Hide blackout-hidden events if toggle is off
      if (evt.isHidden && !showBlackouts) return false;

      const teacher = teachers.find(t => t.id === evt.teacherId);

      if (filterTeacher !== 'ALL' && evt.teacherId !== filterTeacher) return false;
      if (filterRoom !== 'ALL' && evt.roomId !== filterRoom) return false;
      if (filterClass !== 'ALL' && evt.classification !== filterClass) return false;

      if (filterPosition !== 'ALL' && teacher) {
        if (!teacher.positions.includes(filterPosition)) return false;
      }

      if (filterTag !== 'ALL' && teacher) {
        if (!teacher.tags.includes(filterTag)) return false;
      }

      return true;
    });
  }, [expandedEvents, teachers, filterTeacher, filterRoom, filterClass, filterPosition, filterTag, showCanceled, showBlackouts]);

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
      const width = Math.min(100, widthPercent + 10);
      const left = (colIndex * (100 / activeCols));

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

      if (deltaMinutes === 0) return;

      const newStart = new Date(dragState.originalStart);
      const newEnd = new Date(dragState.originalEnd);

      if (dragState.type === 'MOVE') {
        newStart.setMinutes(newStart.getMinutes() + deltaMinutes);
        newEnd.setMinutes(newEnd.getMinutes() + deltaMinutes);
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

    const defaultTeacher = teachers[0];
    setEditingEvent(evt || {
      start: defaultStart.toISOString(),
      end: defaultEnd.toISOString(),
      classification: activeLists.classifications[0], // Use activeLists
      teacherId: defaultTeacher?.id,
      roomId: rooms[0]?.id,
      positionId: defaultTeacher?.positionAssignments?.[0]?.id || undefined,
    });
    setIsModalOpen(true);
    setDetailItem(null);
  };

  const handleSlotClick = (date: Date, hour: number) => {
    // In MARQUEE mode, don't open the create-event modal when clicking empty space
    if (selectionMode === 'MARQUEE') return;
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(start.getMinutes() + settings.defaultEventDuration);

    openModal({
      start: start.toISOString(),
      end: end.toISOString(),
      classification: activeLists.classifications[0], // Use activeLists
      teacherId: teachers[0]?.id,
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

  const saveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent.name) return;

    if (new Date(editingEvent.end!) <= new Date(editingEvent.start!)) {
      alert("End time must be after start time");
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
        };
        setEvents(prev => [...prev, exceptionEvent]);
      } else {
        // Regular event or parent event edit
        const updatedEvent = { ...editingEvent } as CalendarEvent;
        setEvents(prev => prev.map(ev => ev.id === editingEvent.id ? { ...ev, ...updatedEvent } : ev));
        setRecentlySaved(prev => new Set(prev).add(updatedEvent.id!));
        setTimeout(() => setRecentlySaved(prev => { const n = new Set(prev); n.delete(updatedEvent.id!); return n; }), 1500);

        if (updatedEvent.googleEventId) {
          handleGoogleSync(updatedEvent, true);
        }
      }
    } else {
      // New event — save with recurrence rule if set
      const newId = generateId();
      const newEvent: CalendarEvent = {
        ...editingEvent,
        id: newId,
        isCanceled: false,
        isHidden: false,
        description: editingEvent.description || '',
      } as CalendarEvent;
      setEvents(prev => [...prev, newEvent]);
      setRecentlySaved(prev => new Set(prev).add(newId));
      setTimeout(() => setRecentlySaved(prev => { const n = new Set(prev); n.delete(newId); return n; }), 1500);
      handleGoogleSync(newEvent);
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

  // --- Detail View Actions ---
  const handleDeleteEvent = (id: string, evt?: CalendarEvent) => {
    const targetEvent = evt || events.find(e => e.id === id);

    // Check if this is part of a recurring series
    if (targetEvent && (targetEvent.recurrenceRule || targetEvent.recurrenceId)) {
      setRecurrenceDialog({ type: 'DELETE', event: targetEvent });
      setDetailItem(null);
      return;
    }

    if (window.confirm("Are you sure you want to delete this event?")) {
      setEvents(prev => prev.filter(e => e.id !== id));
      if (targetEvent?.googleEventId) {
        handleDeleteGoogleSync(targetEvent.googleEventId);
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
        // Delete entire series
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
    if (window.confirm("Delete this Gantt block? This may affect blackouts.")) {
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
      <div className="grid border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 relative" style={{ gridTemplateColumns: `50px 1fr` }}>
        <div className="border-e border-slate-100 dark:border-slate-800 p-2 text-[10px] text-slate-400 text-center flex items-center justify-center font-bold">
          GANTT
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
                  className={`absolute rounded px-2 flex items-center text-[10px] text-white font-medium truncate opacity-90 hover:opacity-100 transition-opacity cursor-pointer z-10 hover:shadow-cadenza-deep hover:z-20 border border-white/20 animate-cadenza-arrive ${recentlySaved.has(block.id) ? 'animate-cadenza-pulse' : ''}`}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                    top: `${laneIdx * laneHeight}px`,
                    height: `${laneHeight - 2}px`,
                    backgroundColor: block.color,
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
        className={`absolute rounded-xl border shadow-sm transition-shadow select-none overflow-hidden group animate-cadenza-arrive ${selectedEventIds.has(evt.id) ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' : ''} ${recentlySaved.has(evt.id) ? 'animate-cadenza-pulse' : ''} ${evt.isCanceled
          ? 'canceled-stripe border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500 bg-slate-50 dark:bg-slate-800'
          : isDragging
            ? 'z-50 opacity-90 shadow-cadenza-deep'
            : 'hover:shadow-cadenza-soft cursor-pointer'
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
          {layout.width < 90 && !evt.isCanceled && !isDragging && (
            <div className="absolute top-0.5 end-0.5 bg-white/80 rounded-full p-0.5 dark:bg-slate-800">
              <AlertCircle size={isCompact ? 8 : 10} color="red" />
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
              {evt.isCanceled && <span className="font-bold text-red-500 flex-shrink-0" style={{ fontSize: timeFontSize }}>✕</span>}
            </>
          ) : (
            /* Standard multi-line layout for normal events */
            <>
              <div className="font-bold truncate pr-4 text-black dark:text-white" style={{ opacity: 0.9 }}>{evt.name}</div>
              <div className="truncate opacity-75" style={{ fontSize: timeFontSize }}>
                {formatTime(start)} - {formatTime(end)}
              </div>
              <div className="truncate opacity-75 font-semibold" style={{ fontSize: timeFontSize }}>{teachers.find(t => t.id === evt.teacherId)?.fullName}</div>
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
    return (
      <div className={`flex-1 overflow-auto bg-white dark:bg-slate-900 relative ${selectionMode === 'MARQUEE' ? 'cursor-crosshair' : ''}`} ref={containerRef} onMouseDown={handleMarqueeMouseDown}>
        <div className="min-w-[800px] relative" ref={marqueeContainerRef}>
          <div className="grid border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900 z-20 shadow-sm" style={{ gridTemplateColumns: `50px repeat(${days.length}, 1fr)` }}>
            <div className="p-4 border-e border-slate-100 dark:border-slate-800"></div>
            {days.map(day => (
              <div key={day.toISOString()} className={`p-3 text-center border-e border-slate-100 dark:border-slate-800 ${day.toDateString() === new Date().toDateString() ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{day.toLocaleDateString(settings.language, { weekday: 'short' })}</div>
                <div className={`text-xl font-bold mt-1 ${day.toDateString() === new Date().toDateString() ? 'text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>
          {renderGanttStrip(days)}
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
                  <div key={day.toISOString()} className="relative h-full pointer-events-auto">
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

                {/* Layer 2: Gantt Overlay (z-10) */}
                <div className="absolute top-[32px] bottom-0 start-0 end-0 overflow-y-auto custom-scrollbar pointer-events-none z-10">
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
                          <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full cursor-default ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-300'}`}>
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
                                        <span className="font-medium text-slate-800 dark:text-slate-200 block truncate" title={evt.name || t('cal.unnamed')}>
                                          {evt.name || t('cal.unnamed')}
                                        </span>
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
                <ChevronLeft size={18} />
              </button>
              <div className="px-3 flex items-center relative group">
                <input type="date" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { if (e.target.value) setCurrentDate(new Date(e.target.value)); }} />
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
                <ChevronRight size={18} />
              </button>
            </div>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 text-xs font-bold rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">{t('cal.today')}</button>

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
                  transform: !showCanceled ? 'translateX(16px)' : 'translateX(2px)',
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
                  transform: !showBlackouts ? 'translateX(16px)' : 'translateX(2px)',
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
                <option value="ALL">{t('cal.filter.type_all')}</option>
                {activeLists.classifications.map(c => <option key={c} value={c}>{c}</option>)}
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
        </div>
      </div>

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

            {/* Add Event */}
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
          </div>
        )}

        {/* Main Floating Action Button */}
        <button
          onClick={() => setIsSpeedDialOpen(!isSpeedDialOpen)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg"
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
                {detailItem.type === 'EVENT' && <button onClick={() => handleEditEvent(detailItem.data as CalendarEvent)} className="flex-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 py-2 rounded-lg flex items-center justify-center font-medium transition-colors"><Edit size={16} className="me-2" /> {t('cal.detail.edit')}</button>}
                {detailItem.type === 'EVENT' && (
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg p-6 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">{editingEvent.id ? t('event.edit') : t('event.new')}</h3>
            <form onSubmit={saveEvent} className="space-y-4">
              {/* 1. Event Name */}
              <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('event.name')} <span className="text-red-500">*</span></label><input autoFocus required className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" value={editingEvent.name || ''} onChange={e => setEditingEvent({ ...editingEvent, name: e.target.value })} placeholder={t('event.name_placeholder')} /></div>

              {/* 2. Category */}
              <div>
                <label className="block text-sm font-medium flex justify-between text-slate-700 dark:text-slate-300 mb-1">
                  <span>{t('event.category')} <span className="text-red-500">*</span></span>
                </label>
                <select required className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none" value={editingEvent.classification || ''} onChange={e => {
                  const val = e.target.value;
                  setEditingEvent({ ...editingEvent, classification: val, teacherId: undefined, positionId: undefined, roomId: undefined, overrideFlags: { ...editingEvent.overrideFlags, isOneOffPayment: false, paymentMethod: 'NONE' }, pricingSnapshot: undefined });
                }}>
                  <option value="" disabled>{t('event.select_category')}</option>
                  <optgroup label={t('event.teacher_lessons')}>
                    {['Individual Lesson', 'Group Lesson'].map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                  <optgroup label={t('event.general_events')}>
                    {activeLists.classifications.filter(c => !['Individual Lesson', 'Group Lesson'].includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
                    {Object.values(CATEGORY_SCHEMAS).filter(s => !activeLists.classifications.includes(s.name) && !['Individual Lesson', 'Group Lesson'].includes(s.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                </select>
              </div>

              {/* 2. Teacher */}
              <div>
                <label className="block flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  <span>{t('event.teacher')} {['Individual Lesson', 'Group Lesson'].includes(editingEvent.classification || '') || editingEvent.overrideFlags?.paymentMethod === 'POSITION_RATE' ? <span className="text-red-500">*</span> : <span className="text-xs text-slate-400 font-normal">{t('event.optional')}</span>}</span>
                </label>
                <select
                  required={['Individual Lesson', 'Group Lesson'].includes(editingEvent.classification || '') || editingEvent.overrideFlags?.paymentMethod === 'POSITION_RATE'}
                  disabled={!editingEvent.classification}
                  className={`w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none ${!editingEvent.classification ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={editingEvent.teacherId || ''}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '') {
                      let newFlags = { ...editingEvent.overrideFlags };
                      if (newFlags.paymentMethod === 'POSITION_RATE') newFlags.paymentMethod = 'NONE';
                      setEditingEvent({ ...editingEvent, teacherId: undefined, positionId: undefined, roomId: undefined, overrideFlags: newFlags });
                    } else {
                      setEditingEvent({ ...editingEvent, teacherId: val, positionId: undefined, roomId: undefined });
                    }
                  }}
                >
                  <option value="">— {editingEvent.classification ? (['Individual Lesson', 'Group Lesson'].includes(editingEvent.classification) || editingEvent.overrideFlags?.paymentMethod === 'POSITION_RATE' ? 'Select Teacher' : 'Organization / No Teacher (Optional)') : 'Select Category First'} —</option>
                  {teachers.filter(t => {
                    if (!editingEvent.classification) return false;
                    if (!['Individual Lesson', 'Group Lesson'].includes(editingEvent.classification)) return true; // Show all teachers for general categories
                    return t.positionAssignments.some(pa => pa.category === editingEvent.classification || pa.category === Object.values(CATEGORY_SCHEMAS).find(s => s.id === editingEvent.classification)?.name);
                  }).map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                </select>
              </div>

              {/* 3. Position */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('event.position')} {['Individual Lesson', 'Group Lesson'].includes(editingEvent.classification || '') || editingEvent.overrideFlags?.paymentMethod === 'POSITION_RATE' ? <span className="text-red-500">*</span> : <span className="text-xs text-slate-400 font-normal">(Optional)</span>}</label>
                {(() => {
                  const teacherForPos = teachers.find(t => t.id === editingEvent.teacherId);
                  const isLesson = ['Individual Lesson', 'Group Lesson'].includes(editingEvent.classification || '');
                  const positionOptions = teacherForPos ? teacherForPos.positionAssignments.filter(pa => {
                    if (!editingEvent.classification) return false;
                    if (!isLesson) return true;
                    return pa.category === editingEvent.classification || pa.category === Object.values(CATEGORY_SCHEMAS).find(s => s.id === editingEvent.classification)?.name;
                  }) : [];

                  return (
                    <select
                      required={['Individual Lesson', 'Group Lesson'].includes(editingEvent.classification || '') || editingEvent.overrideFlags?.paymentMethod === 'POSITION_RATE'}
                      disabled={!editingEvent.teacherId || editingEvent.overrideFlags?.paymentMethod === 'ONE_OFF' || (editingEvent.teacherId && positionOptions.length === 0)}
                      className={`w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none ${(!editingEvent.teacherId || editingEvent.overrideFlags?.paymentMethod === 'ONE_OFF' || (editingEvent.teacherId && positionOptions.length === 0)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      value={editingEvent.positionId || ''}
                      onChange={e => {
                        const val = e.target.value;
                        let newFlags = { ...editingEvent.overrideFlags };
                        if (!val && newFlags.paymentMethod === 'POSITION_RATE') newFlags.paymentMethod = 'NONE';
                        setEditingEvent({ ...editingEvent, positionId: val || undefined, roomId: undefined, overrideFlags: newFlags });
                      }}
                    >
                      <option value="">
                        {!editingEvent.teacherId
                          ? '— Select Teacher First —'
                          : positionOptions.length === 0
                            ? '— No positions available for this teacher under this category —'
                            : '— Select a position —'}
                      </option>
                      {positionOptions.map(pa => (
                        <option key={pa.id} value={pa.id}>
                          {pa.positionName} ({pa.rateType === 'HOURLY' ? `${settings.currency}${pa.rateValue}/hr` : `${settings.currency}${pa.rateValue.toLocaleString()}/mo`})
                        </option>
                      ))}
                    </select>
                  );
                })()}

                {/* Payment Method for General Categories */}
                {editingEvent.classification && !['Individual Lesson', 'Group Lesson'].includes(editingEvent.classification) && (
                  <div className="mt-4 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('event.payment_method')} <span className="text-xs text-slate-400 font-normal">(Optional)</span></label>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center text-sm cursor-pointer dark:text-white">
                        <input
                          type="radio"
                          name="payMethod"
                          checked={!editingEvent.overrideFlags?.paymentMethod || editingEvent.overrideFlags?.paymentMethod === 'NONE'}
                          onChange={() => setEditingEvent({ ...editingEvent, overrideFlags: { ...editingEvent.overrideFlags, paymentMethod: 'NONE', isOneOffPayment: false }, pricingSnapshot: undefined })}
                          className="me-2 focus:ring-blue-500"
                        />
                        {t('event.no_payment')}
                      </label>
                      <label className={`flex items-center text-sm ${!editingEvent.teacherId || !editingEvent.positionId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} dark:text-white`}>
                        <input
                          type="radio"
                          name="payMethod"
                          disabled={!editingEvent.teacherId || !editingEvent.positionId}
                          checked={editingEvent.overrideFlags?.paymentMethod === 'POSITION_RATE'}
                          onChange={() => setEditingEvent({ ...editingEvent, overrideFlags: { ...editingEvent.overrideFlags, paymentMethod: 'POSITION_RATE', isOneOffPayment: false }, pricingSnapshot: undefined })}
                          className="me-2 focus:ring-blue-500"
                        />
                        {t('event.use_position_rate')} {(!editingEvent.teacherId || !editingEvent.positionId) && <span className="ms-1 text-xs text-slate-400">{t('event.requires_teacher_position')}</span>}
                      </label>
                      <label className="flex items-center text-sm cursor-pointer dark:text-white">
                        <input
                          type="radio"
                          name="payMethod"
                          checked={editingEvent.overrideFlags?.paymentMethod === 'ONE_OFF'}
                          onChange={() => setEditingEvent({ ...editingEvent, overrideFlags: { ...editingEvent.overrideFlags, paymentMethod: 'ONE_OFF', isOneOffPayment: true }, positionId: undefined })}
                          className="me-2 focus:ring-blue-500"
                        />
                        {t('event.one_off_payment')}
                      </label>
                    </div>

                    {editingEvent.overrideFlags?.paymentMethod === 'ONE_OFF' && (
                      <div className="pt-2">
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('event.one_off_price')} ({settings.currency}) <span className="text-red-500">*</span></label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                          value={editingEvent.pricingSnapshot?.rateValue ?? ''}
                          onChange={e => setEditingEvent({
                            ...editingEvent,
                            pricingSnapshot: { rateValue: Number(e.target.value), rateType: 'ONE_OFF', source: 'OVERRIDE' }
                          })}
                          placeholder={t('event.one_off_price')}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Room */}
              <div>
                <label className="block flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  <span>{t('event.room')} <span className="text-xs text-slate-400 font-normal">(Optional)</span></span>
                </label>
                <select className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none" value={editingEvent.roomId || ''} onChange={e => setEditingEvent({ ...editingEvent, roomId: e.target.value || undefined })}>
                  <option value="">— {t('event.no_room')} —</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              {/* 5. Start Time / End Time */}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('event.start_time')}</label><input type="datetime-local" required className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none" value={editingEvent.start ? new Date(new Date(editingEvent.start).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={e => setEditingEvent({ ...editingEvent, start: new Date(e.target.value).toISOString() })} /></div>
                <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('event.end_time')}</label><input type="datetime-local" required className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none" value={editingEvent.end ? new Date(new Date(editingEvent.end).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={e => setEditingEvent({ ...editingEvent, end: new Date(e.target.value).toISOString() })} /></div>
              </div>

              {/* Recurrence Section */}
              {!editingEvent.isExceptionEdit && (
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                  <label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-slate-300 dark:border-slate-600"
                      checked={!!editingEvent.recurrenceRule}
                      onChange={e => {
                        if (e.target.checked) {
                          const startDay = editingEvent.start ? DAY_ABBR[new Date(editingEvent.start).getDay()] : 'MO';
                          setEditingEvent({
                            ...editingEvent,
                            recurrenceRule: { frequency: 'WEEKLY', interval: 1, byDay: [startDay] }
                          });
                        } else {
                          const { recurrenceRule, ...rest } = editingEvent;
                          setEditingEvent(rest);
                        }
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Repeat size={16} className="text-blue-500" />
                      <span className="font-medium text-slate-900 dark:text-white">{t('recurrence.recurring_event')}</span>
                    </div>
                  </label>

                  {editingEvent.recurrenceRule && (() => {
                    const rule = editingEvent.recurrenceRule!;
                    const updateRule = (updates: Partial<RecurrenceRule>) => {
                      setEditingEvent({ ...editingEvent, recurrenceRule: { ...rule, ...updates } });
                    };

                    return (
                      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                        {/* Preset Buttons */}
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { label: t('recurrence.weekly'), rule: { frequency: 'WEEKLY' as const, interval: 1, byDay: [editingEvent.start ? DAY_ABBR[new Date(editingEvent.start).getDay()] : 'MO' as DayOfWeek] } },
                            { label: t('recurrence.biweekly'), rule: { frequency: 'WEEKLY' as const, interval: 2, byDay: [editingEvent.start ? DAY_ABBR[new Date(editingEvent.start).getDay()] : 'MO' as DayOfWeek] } },
                            { label: t('recurrence.daily'), rule: { frequency: 'DAILY' as const, interval: 1 } },
                            { label: t('recurrence.monthly'), rule: { frequency: 'MONTHLY' as const, interval: 1 } },
                          ].map(preset => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => updateRule({ ...preset.rule, untilDate: rule.untilDate, count: rule.count })}
                              className={`px-3 py-1 text-xs rounded-full border transition-colors ${rule.frequency === preset.rule.frequency && rule.interval === preset.rule.interval
                                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                                }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        {/* Frequency & Interval */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600 dark:text-slate-400">{t('recurrence.every')}</span>
                          <input
                            type="number"
                            min={1}
                            max={52}
                            className="w-16 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-sm outline-none"
                            value={rule.interval}
                            onChange={e => updateRule({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
                          />
                          <select
                            className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-sm outline-none"
                            value={rule.frequency}
                            onChange={e => updateRule({ frequency: e.target.value as RecurrenceRule['frequency'] })}
                          >
                            <option value="DAILY">{t('recurrence.days')}</option>
                            <option value="WEEKLY">{t('recurrence.weeks')}</option>
                            <option value="MONTHLY">{t('recurrence.months')}</option>
                          </select>
                        </div>

                        {/* Day-of-week selector for WEEKLY */}
                        {rule.frequency === 'WEEKLY' && (
                          <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('recurrence.on_days')}</label>
                            <div className="flex gap-1">
                              {DAY_ABBR.map(day => (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => {
                                    const current = rule.byDay || [];
                                    const next = current.includes(day)
                                      ? current.filter(d => d !== day)
                                      : [...current, day];
                                    updateRule({ byDay: next.length > 0 ? next : [day] });
                                  }}
                                  className={`w-8 h-8 text-xs rounded-full font-medium transition-colors ${(rule.byDay || []).includes(day)
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                                    }`}
                                >
                                  {day}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Monthly mode selector */}
                        {rule.frequency === 'MONTHLY' && editingEvent.start && (() => {
                          const startDate = new Date(editingEvent.start);
                          const dayNum = startDate.getDate();
                          const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][startDate.getDay()];
                          const weekOfMonth = Math.ceil(dayNum / 7);
                          const posLabels = ['', '1st', '2nd', '3rd', '4th', '5th'];
                          const isPositionalMode = !!rule.bySetPos;

                          return (
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t('recurrence.monthly_mode')}</label>
                              <div className="space-y-1">
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                                  <input
                                    type="radio"
                                    name="monthlyMode"
                                    checked={!isPositionalMode}
                                    onChange={() => updateRule({ byMonthDay: dayNum, bySetPos: undefined, byDayOfWeek: undefined })}
                                    className="text-blue-600"
                                  />
                                  On the {dayNum}{dayNum === 1 ? 'st' : dayNum === 2 ? 'nd' : dayNum === 3 ? 'rd' : 'th'} of each month
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                                  <input
                                    type="radio"
                                    name="monthlyMode"
                                    checked={isPositionalMode}
                                    onChange={() => updateRule({ bySetPos: weekOfMonth, byDayOfWeek: DAY_ABBR[startDate.getDay()], byMonthDay: undefined })}
                                    className="text-blue-600"
                                  />
                                  On the {posLabels[weekOfMonth]} {dayName} of each month
                                </label>
                              </div>
                            </div>
                          );
                        })()}

                        {/* End Condition */}
                        <div className="space-y-2">
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Ends</label>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                              <input
                                type="radio"
                                name="endMode"
                                checked={!rule.untilDate && !rule.count}
                                onChange={() => updateRule({ untilDate: undefined, count: undefined })}
                                className="text-blue-600"
                              />
                              Never
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                              <input
                                type="radio"
                                name="endMode"
                                checked={!!rule.untilDate}
                                onChange={() => {
                                  const defaultEnd = new Date();
                                  defaultEnd.setMonth(defaultEnd.getMonth() + 3);
                                  updateRule({ untilDate: defaultEnd.toISOString().split('T')[0], count: undefined });
                                }}
                                className="text-blue-600"
                              />
                              On date
                              {rule.untilDate && (
                                <input
                                  type="date"
                                  className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-sm outline-none ms-1"
                                  value={rule.untilDate}
                                  onChange={e => updateRule({ untilDate: e.target.value })}
                                />
                              )}
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                              <input
                                type="radio"
                                name="endMode"
                                checked={!!rule.count}
                                onChange={() => updateRule({ count: 12, untilDate: undefined })}
                                className="text-blue-600"
                              />
                              After
                              {rule.count !== undefined && (
                                <input
                                  type="number"
                                  min={1}
                                  max={365}
                                  className="w-16 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1 text-sm outline-none"
                                  value={rule.count}
                                  onChange={e => updateRule({ count: Math.max(1, parseInt(e.target.value) || 1) })}
                                />
                              )}
                              {rule.count !== undefined && <span>occurrences</span>}
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {editingEvent.id && !editingEvent.recurrenceRule && (
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mt-2">
                  <label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer">
                    <input type="checkbox" className="w-5 h-5 text-red-600 rounded focus:ring-red-500 border-slate-300 dark:border-slate-600" checked={editingEvent.isCanceled || false} onChange={e => setEditingEvent({ ...editingEvent, isCanceled: e.target.checked, cancellationPayStatus: e.target.checked && !editingEvent.cancellationPayStatus ? 'NO_PAY_CANCELLATION' : editingEvent.cancellationPayStatus })} />
                    <span className="font-medium text-slate-900 dark:text-white">{t('cal.mark_canceled')}</span>
                  </label>
                  {editingEvent.isCanceled && (
                    <div className="mt-3 ms-8 border-t border-slate-200 dark:border-slate-700 pt-3">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('cal.cancel_pay_status')}</label>
                      <select className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded px-2 py-1 text-sm outline-none" value={editingEvent.cancellationPayStatus || 'NO_PAY_CANCELLATION'} onChange={e => setEditingEvent({ ...editingEvent, cancellationPayStatus: e.target.value as any })}>
                        <option value="NO_PAY_CANCELLATION">{t('cal.no_pay')}</option>
                        <option value="PAID_CANCELLATION">{t('cal.paid_cancel')}</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                {editingEvent.id && <button type="button" onClick={() => { handleDeleteEvent(editingEvent.id!, editingEvent as CalendarEvent); setIsModalOpen(false); }} className="text-red-500 hover:text-red-700 text-sm font-medium">{t('cal.delete_event')}</button>}
                <div className="flex space-x-3 rtl:space-x-reverse ms-auto">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg">{t('cal.save_changes')}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recurrence Series Dialog - "Just This One" vs "All Events" */}
      {recurrenceDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                <Repeat size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {recurrenceDialog.type === 'EDIT' ? 'Edit Recurring Event' : recurrenceDialog.type === 'DELETE' ? 'Delete Recurring Event' : recurrenceDialog.event.isCanceled ? 'Restore Recurring Event' : 'Cancel Recurring Event'}
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              This is part of a recurring series. What would you like to {recurrenceDialog.type === 'EDIT' ? 'edit' : recurrenceDialog.type === 'DELETE' ? 'delete' : recurrenceDialog.event.isCanceled ? 'restore' : 'cancel'}?
            </p>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => handleSeriesAction('THIS')}
                className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 py-3 rounded-lg font-medium transition-colors text-sm"
              >
                Just This One
              </button>
              <button
                onClick={() => handleSeriesAction('ALL')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors text-sm"
              >
                All Events
              </button>
            </div>
            <button
              onClick={() => setRecurrenceDialog(null)}
              className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};