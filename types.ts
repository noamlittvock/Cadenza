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
  classification: string; // Changed from Enum to string to support dynamic lists
  start: string; // ISO Date String
  end: string;   // ISO Date String
  isCanceled: boolean;
  isHidden: boolean; 
  canceledByBlackoutId?: string; 
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

export type ViewState = 'CALENDAR' | 'TEACHERS' | 'ROOMS' | 'GANTT' | 'FINANCIAL' | 'SETTINGS' | 'LISTS';

// Financial Report Data Types
export interface TeacherFinancialSummary {
  teacherName: string;
  teacherId: string;
  totalHours: number;
  activeHours: number;
  canceledHours: number;
  breakdown: Record<string, number>;
}
