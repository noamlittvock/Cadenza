import { Teacher, Room, CalendarEvent, GanttBlock, Classification, AppSettings, ListsState } from './types';

export const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f97316', // orange
  '#64748b', // slate
];

export const INITIAL_SETTINGS: AppSettings = {
  language: 'en-US',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  defaultEventDuration: 60,
  weekNumberDisplay: 'none'
};

export const INITIAL_LISTS: ListsState = {
  positions: ['Piano Instructor', 'Voice Coach', 'Violin Teacher', 'Choir Director', 'Theory Teacher'],
  tags: ['Piano Dept', 'Strings Dept', 'Vocal Dept', 'Senior Staff', 'Junior Staff'],
  classifications: Object.values(Classification) as string[]
};

export const INITIAL_TEACHERS: Teacher[] = [
  { id: 'T1', fullName: 'John Smith', positions: ['Piano Instructor'], tags: ['Piano Dept', 'Senior Staff'], phone: '555-0101', email: 'john@music.com', color: '#3b82f6' },
  { id: 'T2', fullName: 'Sarah Jones', positions: ['Voice Coach', 'Choir Director'], tags: ['Vocal Dept'], phone: '555-0102', email: 'sarah@music.com', color: '#ef4444' },
  { id: 'T3', fullName: 'Michael Brown', positions: ['Violin Teacher'], tags: ['Strings Dept'], phone: '555-0103', email: 'mike@music.com', color: '#10b981' },
];

export const INITIAL_ROOMS: Room[] = [
  { id: 'R1', name: 'Studio A', itinerary: 'Grand Piano, roughly 20 person capacity.' },
  { id: 'R2', name: 'Studio B', itinerary: 'Upright Piano, soundproofed.' },
  { id: 'R3', name: 'Practice Room 1', itinerary: 'Small room for individual practice.' },
];

// Helper to generate some initial events relative to "today"
const today = new Date();
const getIso = (daysOffset: number, hour: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: 'E1',
    name: 'Piano Lesson - Alice',
    description: 'Weekly lesson',
    teacherId: 'T1',
    roomId: 'R1',
    classification: Classification.INDIVIDUAL,
    start: getIso(0, 10),
    end: getIso(0, 11),
    isCanceled: false,
    isHidden: false,
  },
  {
    id: 'E2',
    name: 'Voice Coaching - Bob',
    description: 'Prep for recital',
    teacherId: 'T2',
    roomId: 'R2',
    classification: Classification.INDIVIDUAL,
    start: getIso(0, 10), // INTENTIONAL CONFLICT with time, different room
    end: getIso(0, 11),
    isCanceled: false,
    isHidden: false,
  },
  {
    id: 'E3',
    name: 'Group Theory',
    description: 'Beginner theory',
    teacherId: 'T1', // INTENTIONAL CONFLICT: T1 is also in E1 at this time
    roomId: 'R3',
    classification: Classification.GROUP,
    start: getIso(0, 10),
    end: getIso(0, 11),
    isCanceled: false,
    isHidden: false,
  }
];

export const INITIAL_GANTT: GanttBlock[] = [
  {
    id: 'G1',
    title: 'Winter Semester',
    startDate: new Date(today.getFullYear(), 0, 1).toISOString(),
    endDate: new Date(today.getFullYear(), 3, 30).toISOString(),
    color: '#3b82f6',
    isBlackout: false,
  }
];

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const formatDateForInput = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().slice(0, 16);
};
