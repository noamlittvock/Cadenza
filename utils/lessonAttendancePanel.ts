import type { LessonRecord } from '../types/blueprint';
import type { EventV2 } from '../types/v2';
import { listUnmarkedAttendance, summarizeLessonCompletion, type LessonCompletionSummary } from './blueprintQueries';

export type LessonAttendancePanelState = 'loading' | 'error' | 'empty' | 'ready';

export interface LessonAttendanceStudent {
  id: string;
  fullName: string;
}

export interface LessonAttendanceRow {
  lesson: LessonRecord;
  studentName: string;
}

export interface LessonAttendancePanelModel {
  state: LessonAttendancePanelState;
  eventId: string;
  eventDate: string;
  rows: LessonAttendanceRow[];
  summary: LessonCompletionSummary;
}

export interface LessonAttendanceWorklistStudent {
  id: string;
  fullName: string;
}

export interface LessonAttendanceWorklistEvent {
  id: string;
  name: string;
  date: string;
  startTime: string;
}

export interface LessonAttendanceWorklistItem {
  lesson: LessonRecord;
  studentName: string;
  eventName: string;
  eventDate: string;
  eventStartTime: string;
  hasEventLink: boolean;
}

const EMPTY_SUMMARY = summarizeLessonCompletion([]);

export function buildEventAttendancePanelModel(params: {
  event: EventV2;
  lessons: LessonRecord[];
  students: LessonAttendanceStudent[];
  loading?: boolean;
  loadError?: boolean;
}): LessonAttendancePanelModel {
  const { event, lessons, students, loading = false, loadError = false } = params;
  const eventLessons = lessons
    .filter(lesson => lesson.eventId === event.id)
    .sort((a, b) => {
      const nameA = students.find(student => student.id === a.studentId)?.fullName ?? a.studentId;
      const nameB = students.find(student => student.id === b.studentId)?.fullName ?? b.studentId;
      return nameA.localeCompare(nameB) || a.id.localeCompare(b.id);
    });

  const rows = eventLessons.map(lesson => ({
    lesson,
    studentName: students.find(student => student.id === lesson.studentId)?.fullName ?? lesson.studentId,
  }));

  if (loading) {
    return { state: 'loading', eventId: event.id, eventDate: event.date, rows: [], summary: EMPTY_SUMMARY };
  }
  if (loadError) {
    return { state: 'error', eventId: event.id, eventDate: event.date, rows: [], summary: EMPTY_SUMMARY };
  }
  if (rows.length === 0) {
    return { state: 'empty', eventId: event.id, eventDate: event.date, rows, summary: EMPTY_SUMMARY };
  }

  return {
    state: 'ready',
    eventId: event.id,
    eventDate: event.date,
    rows,
    summary: summarizeLessonCompletion(eventLessons),
  };
}

export function buildUnmarkedAttendanceWorklist(params: {
  lessons: LessonRecord[];
  events: LessonAttendanceWorklistEvent[];
  students: LessonAttendanceWorklistStudent[];
  upToDate?: string;
  limit?: number;
}): LessonAttendanceWorklistItem[] {
  const { lessons, events, students, upToDate, limit } = params;
  const eventById = new Map(events.map(event => [event.id, event]));
  const studentById = new Map(students.map(student => [student.id, student]));

  const rows = listUnmarkedAttendance(lessons, upToDate).map(lesson => {
    const event = eventById.get(lesson.eventId);
    return {
      lesson,
      studentName: studentById.get(lesson.studentId)?.fullName ?? lesson.studentId,
      eventName: event?.name ?? lesson.eventId,
      eventDate: event?.date ?? lesson.date,
      eventStartTime: event?.startTime ?? '',
      hasEventLink: Boolean(event),
    };
  }).sort((a, b) => {
    const timeA = a.eventStartTime || '99:99';
    const timeB = b.eventStartTime || '99:99';
    return a.eventDate.localeCompare(b.eventDate)
      || timeA.localeCompare(timeB)
      || a.studentName.localeCompare(b.studentName)
      || a.lesson.id.localeCompare(b.lesson.id);
  });

  return typeof limit === 'number' ? rows.slice(0, limit) : rows;
}
