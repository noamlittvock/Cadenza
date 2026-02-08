export enum Classification {
  INDIVIDUAL = 'Individual Lesson',
  GROUP = 'Group Lesson',
  MASTERCLASS = 'Masterclass',
  REHEARSAL = 'Rehearsal',
  RECITAL = 'Recital',
  ADMIN = 'Administrative',
  OTHER = 'Other'
}

export interface Teacher {
  id: string;
  fullName: string;
  positions: string[];
  tags: string[]; // New: Tags like "Piano Dept", "Conductor"
  phone: string;
  email: string;
  color: string; // Hex code
}

export interface Room {
  id: string;
  name: string;
  itinerary: string;
}

export interface CalendarEvent {
  id: string;
  name: string;
  description: string;
  teacherId: string;
  roomId: string;
  classification: string;
  start: string; // ISO Date String
  end: string;   // ISO Date String
  isCanceled: boolean;
  isHidden: boolean;
  canceledByBlackoutId?: string;
  // Recurrence
  recurrenceRule?: string; // RRULE string
  recurrenceId?: string; // ID of the original series event
  exceptions?: string[]; // Dates to skip (ISO strings)
}

export interface ExternalCalendar {
  id: string;
  name: string;
  url: string; // Wrapper for API/Hebcal URL
  color: string;
  isVisible: boolean;
  type: 'GOOGLE' | 'HEBCAL' | 'OTHER';
}

export interface GanttBlock {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  isBlackout: boolean;
}

export interface AppSettings {
  language: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  timeZone: string;
  defaultEventDuration: number;
  weekNumberDisplay: 'none' | 'week-number' | 'week-of';
}

export interface ListsState {
  positions: string[];
  tags: string[];
  classifications: string[];
}

export type ViewState = 'CALENDAR' | 'GANTT' | 'MANAGE' | 'SETTINGS' | 'FINANCIAL' | 'POWER_TOOLS';

// Financial Report Data Types
export interface TeacherFinancialSummary {
  teacherName: string;
  teacherId: string;
  totalHours: number;
  activeHours: number;
  canceledHours: number;
  breakdown: Record<string, number>;
}
