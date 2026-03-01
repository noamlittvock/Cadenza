export enum Classification {
  INDIVIDUAL = 'Individual Lesson',
  GROUP = 'Group Lesson',
  MASTERCLASS = 'Masterclass',
  REHEARSAL = 'Rehearsal',
  RECITAL = 'Recital',
  ADMIN = 'Administrative',
  OTHER = 'Other'
}

export type CancellationPayStatus = 'PAID_CANCELLATION' | 'NO_PAY_CANCELLATION';

export interface AddOnItem {
  id: string;
  label: string;
  amount: number;
  tagCategory?: string;
  affectsPayroll: boolean;
  notes?: string;
}

export interface RateSnapshot {
  rateValue: number;
  rateType: RateType;
  source: 'RATE_CARD' | 'MANUAL';
}

export interface RateSourceRef {
  rateCardId: string;
  rateVersionId: string;
  effectiveDateUsed: string;
}

export interface RateCardEntry {
  id: string;
  categoryId: string;
  teacherId?: string;
  positionId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  rateType: RateType;
  rateValue: number;
}

export interface RateCard {
  id: string;
  versionId: string;
  entries: RateCardEntry[];
}

export interface CategorySchemaField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'select';
  options?: string[];
  required?: boolean;
}

export interface CategorySchema {
  id: string;
  name: string;
  fields: CategorySchemaField[];
  hasSubtypes?: boolean;
  subtypes?: { id: string; name: string }[];
}

// Rate assignment types for position-based billing
export type RateType = 'HOURLY' | 'GLOBAL_MONTHLY' | 'ONE_OFF' | 'PER_EVENT';

export interface PositionAssignment {
  id: string;               // Unique ID for this assignment
  positionName: string;      // e.g. "Piano Instructor"
  category: string;          // e.g. "Individual Lesson", "Group Lesson", "Administrative"
  rateType: RateType;        // HOURLY or GLOBAL_MONTHLY or PER_EVENT
  rateValue: number;         // Rate amount (per-hour, per-event, or flat monthly fee)
  cost?: number;             // Cost per position
  vat?: { type: 'PERCENTAGE' | 'FLAT', value: number };
  overheadFeeType?: 'PERCENTAGE' | 'FLAT';
  overheadFeeValue?: number;
  socialBenefitsType?: 'PERCENTAGE' | 'FLAT';
  socialBenefitsValue?: number;
}

export interface Teacher {
  id: string;
  fullName: string;
  positions: string[];                    // Derived from positionAssignments for backward compat
  positionAssignments: PositionAssignment[]; // Source of truth for positions + rates
  tags: string[];
  phone: string;
  email: string;
  color: string; // Hex code
}

export interface ParentContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  email: string;
}

export interface StudentInstrument {
  id: string;
  name: string;
  teacherId: string;
}

export interface Student {
  id: string;
  fullName: string;
  instruments: StudentInstrument[];
  lessonDuration: number;
  parents: ParentContact[];
  linkedFolderUrl?: string;
  notes?: string;
}

export interface Room {
  id: string;
  name: string;
  itinerary: string;
}

export type DayOfWeek = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  byDay?: DayOfWeek[];
  byMonthDay?: number;
  bySetPos?: number;
  byDayOfWeek?: DayOfWeek;
  untilDate?: string;
  count?: number;
}

export interface CalendarEvent {
  id: string;
  name: string;
  description: string;
  teacherId?: string;
  roomId?: string;
  studentId?: string;
  studentIds?: string[];
  categoryId?: string;
  subtypeId?: string;
  schemaPayload?: Record<string, any>;
  pricingSnapshot?: RateSnapshot;
  rateSourceRef?: RateSourceRef;
  overrideFlags?: { isRateOverridden?: boolean, [key: string]: any };
  overrideReason?: string;
  cancellationPayStatus?: CancellationPayStatus;
  addOnItems?: AddOnItem[];
  audit?: { createdBy?: string; updatedBy?: string; createdAt?: string; updatedAt?: string; };
  positionId?: string;       // Links to a PositionAssignment.id on the teacher
  classification: string;
  start: string; // ISO Date String
  end: string;   // ISO Date String
  isCanceled: boolean;
  isHidden: boolean;
  canceledByBlackoutId?: string;
  // Recurrence
  recurrenceRule?: RecurrenceRule;
  recurrenceId?: string; // ID of the parent series event
  exceptions?: string[]; // Date strings (YYYY-MM-DD) to skip
  isExceptionEdit?: boolean;
  originalStart?: string; // Original occurrence date before modification
  googleEventId?: string;
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
  currency: string;
  developerMode: boolean; // Legacy — kept for backward compat, no longer shown in UI
  googleCalendarSyncEnabled?: boolean;
  googleCalendarId?: string;
  googleCalendarConnectedBy?: string; // Email of the admin who connected GCal for this tenant
}

export interface SubCategoryItem {
  id: string;
  name: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  subcategories: SubCategoryItem[];
}

export interface ListsState {
  positions: string[];
  tags: string[];
  classifications: string[];
  categories: CategoryItem[];
}

export type ViewState = 'CALENDAR' | 'GANTT' | 'MANAGE' | 'SETTINGS' | 'FINANCIAL' | 'FINANCIAL_ANALYSIS' | 'POWER_TOOLS' | 'SUPER_ADMIN';

// Financial Report Data Types
export interface TeacherFinancialSummary {
  teacherName: string;
  teacherId: string;
  totalHours: number;
  activeHours: number;
  canceledHours: number;
  breakdown: Record<string, number>;
  hourlyTotal: number;
  globalMonthlyTotal: number;
}
