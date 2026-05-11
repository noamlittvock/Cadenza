/**
 * saveEventV2 — Shared utility for applying EventFormState to CalendarEvent state.
 *
 * Used by both CalendarView (full pipeline + Google sync + v2 Firestore)
 * and ConflictResolutionPanel (lightweight: just CalendarEvent state for auto-resolution).
 */

import { CalendarEvent } from '../types';
import { generateId } from '../constants';

export interface EventFormStateLite {
  name: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  roomId: string;
  activityId: string;
  isCanceled: boolean;
  staffParticipants: { staffMemberId: string }[];
  recurrenceRule?: any;
}

export interface SaveEventResult {
  updatedEvent: CalendarEvent;
  isException: boolean;
  exceptionId?: string;
  parentId?: string;
}

/**
 * Apply form state to an existing CalendarEvent, returning the updated event.
 * Handles regular edits and recurrence exception creation.
 */
export function buildUpdatedCalendarEvent(
  editingEvent: CalendarEvent,
  formState: EventFormStateLite,
): SaveEventResult {
  const startISO = new Date(`${formState.date}T${formState.startTime}:00`).toISOString();
  const endISO = new Date(`${formState.date}T${formState.endTime}:00`).toISOString();
  const primaryStaffId = formState.staffParticipants[0]?.staffMemberId;
  const isVirtualInstance = editingEvent.id.includes('_') && editingEvent.recurrenceId;

  if (isVirtualInstance) {
    const parentId = editingEvent.recurrenceId!;
    const dateKey = editingEvent.originalStart || formState.date;
    const exceptionId = generateId();

    const exceptionEvent: CalendarEvent = {
      ...editingEvent,
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
    };

    return { updatedEvent: exceptionEvent, isException: true, exceptionId, parentId };
  }

  const updatedCE: CalendarEvent = {
    ...editingEvent,
    name: formState.name,
    start: startISO,
    end: endISO,
    teacherId: primaryStaffId,
    roomId: formState.roomId || undefined,
    staffMemberIds: formState.staffParticipants.map(sp => sp.staffMemberId),
    activityId: formState.activityId,
    isCanceled: formState.isCanceled,
    recurrenceRule: formState.recurrenceRule,
  };

  return { updatedEvent: updatedCE, isException: false };
}

/**
 * Apply a SaveEventResult to the events state setter.
 * Handles both regular updates and exception creation (adding exception date to parent).
 */
export function applyEventUpdate(
  setEvents: (updater: (prev: CalendarEvent[]) => CalendarEvent[]) => void,
  result: SaveEventResult,
  originalEventId: string,
) {
  if (result.isException && result.parentId) {
    // Add exception date to parent
    const dateKey = result.updatedEvent.originalStart || '';
    setEvents(prev => prev.map(ev => {
      if (ev.id === result.parentId) {
        return { ...ev, exceptions: [...(ev.exceptions || []), dateKey] };
      }
      return ev;
    }));
    // Add the exception event
    setEvents(prev => [...prev, result.updatedEvent]);
  } else {
    // Regular update
    setEvents(prev => prev.map(ev =>
      ev.id === originalEventId ? result.updatedEvent : ev
    ));
  }
}
