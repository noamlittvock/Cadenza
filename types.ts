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

// --- Activity Registry (Phase 1) ---

export type ActivityType = 'INSTRUCTIONAL' | 'OPERATIONAL';

export interface Subcategory {
  id: string;
  name: string;
  isArchived: boolean;
}

export interface Activity {
  id: string;
  orgId: string;
  name: string;
  type: ActivityType;
  subcategories?: Subcategory[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Staff Member Nested Types (Phase 2) ---

export interface PositionTitleAssignment {
  id: string;
  positionTitle: string;
  startDate?: string;
  endDate?: string;
  isArchived: boolean;
}

export interface RosterEntry {
  studentId: string;
  joinedAt: string;
  isArchived: boolean;
}

export interface TeachingAssignment {
  id: string;
  activityId: string;
  subcategoryId: string;
  startDate?: string;
  endDate?: string;
  isEnsemble: boolean;
  roster?: RosterEntry[];
  isArchived: boolean;
}

export interface Credential {
  id: string;
  institution?: string;
  qualificationType?: string;
  year?: number;
  documents?: StaffDocument[];
}

export interface Note {
  id: string;
  content: string;
  createdAt: string;
  createdBy: string;
}

export interface StaffDocument {
  id: string;
  label: string;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface PositionAssignment {
  id: string;               // Unique ID for this assignment
  positionName: string;      // e.g. "Piano Instructor"
  category: string;          // e.g. "Individual Lesson", "Group Lesson", "Administrative"
}

export interface Teacher {
  id: string;
  fullName: string;
  positions: string[];                    // Derived from positionAssignments for backward compat
  positionAssignments: PositionAssignment[]; // Source of truth for positions
  tags: string[];
  phone: string;
  email: string;
  color: string; // Hex code
  // Phase 2 — Staff Member expansion
  dateOfBirth?: string;
  dateOfJoining?: string;
  governmentalId?: string;
  employmentType?: string;
  positionTitles?: PositionTitleAssignment[];
  teachingAssignments?: TeachingAssignment[];
  credentials?: Credential[];
  bio?: string;
  googleCalendarSyncEnabled?: boolean;
  googleCalendarId?: string;
  notes?: Note[];
  documents?: StaffDocument[];
  isArchived?: boolean;
}

export interface Room {
  id: string;
  name: string;
  itinerary: string;
  isArchived?: boolean;
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
  subtypeId?: string;
  schemaPayload?: Record<string, any>;
  audit?: { createdBy?: string; updatedBy?: string; createdAt?: string; updatedAt?: string; };
  activityId?: string;          // → Activity.id
  staffMemberIds?: string[];    // Index 0 = primary staff member
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
  // Phase 5 — Per-teacher Google Calendar sync
  teacherGoogleEventIds?: Record<string, string>; // staffMemberId → Google Event ID
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
  developerMode: boolean; // Legacy — kept for backward compat, no longer shown in UI
  googleCalendarSyncEnabled?: boolean;
  googleCalendarId?: string;
  googleCalendarConnectedBy?: string; // Email of the admin who connected GCal for this tenant
  schoolYearStartDate?: string; // ISO date: "2024-09-01"
  schoolYearEndDate?: string; // ISO date: "2025-05-31"
  schoolYearLabel?: string; // e.g., "2024-2025"
  enableSchoolYearBoundaries?: boolean; // Show year markers on calendar
}

export interface ListsState {
  positions: string[];
  tags: string[];
  employmentTypes?: string[];
  absenceReasons?: string[];
}

// --- Student Module (Phase 4) ---

export interface Guardian {
  id: string;
  fullName: string;
  relationship?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface StudentAssignment {
  id: string;
  activityId: string;
  subcategoryId: string;
  staffMemberId: string;
  teachingAssignmentId: string;
  startDate: string;
  endDate?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  endReason?: string;
}

export interface RecitalEntry {
  id: string;
  date: string;
  title?: string;
  repertoire?: string;
  notes?: string;
  loggedAt: string;
  loggedBy: string;
}

export interface ReportCard {
  id: string;
  date: string;
  content: string;
  loggedAt: string;
  loggedBy: string;
}

export interface PedagogicalRecord {
  lessonHistory: string[];
  recitalHistory: RecitalEntry[];
  reportCards: ReportCard[];
}

export interface Student {
  id: string;
  orgId: string;
  fullName: string;
  dateOfBirth: string;
  isMinor: boolean;
  currentGrade?: number;
  governmentalId?: string;
  phone?: string;
  email?: string;
  guardians: Guardian[];
  assignments: StudentAssignment[];
  pedagogicalRecord: PedagogicalRecord;
  notes: Note[];
  documents: StaffDocument[];
  profileStatus: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

// --- Calendar Subscriptions (Phase 6) ---

export interface SubscriptionFilters {
  staffMemberIds?: string[];
  tags?: string[];
  positionTitles?: string[];
  roomIds?: string[];
  activityIds?: string[];
}

export interface CalendarSubscription {
  id: string;
  orgId: string;
  name: string;
  token: string;
  filters: SubscriptionFilters;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
}

// --- Teacher Hours Reporting (Phase 7) ---

export type HoursReportStatus = 'PENDING' | 'SUBMITTED' | 'REVIEWED';
export type HoursEntryType = 'CALENDAR_CONFIRMED' | 'CALENDAR_ADJUSTED' | 'CALENDAR_NOT_COMPLETED' | 'MANUAL';

export interface HoursEntry {
  id: string;
  date: string;
  description?: string;
  hours: number;
  entryType: HoursEntryType;
  sourceEventId?: string;
  absenceReason?: string;
  activityId?: string;
  subcategoryId?: string;
}

export interface HoursReport {
  id: string;
  orgId: string;
  staffMemberId: string;
  token: string;
  periodStart: string;
  periodEnd: string;
  status: HoursReportStatus;
  submittedAt?: string;
  reportedEntries?: HoursEntry[];
  adminNotes?: string;
  createdBy: string;
  createdAt: string;
}

// --- Admin Inbox (Phase 8) ---

export type AdminInboxItemType = 'NOTIFICATION';
export type AdminInboxItemStatus = 'OPEN' | 'DONE';

export interface AdminInboxItem {
  id: string;
  orgId: string;
  type: AdminInboxItemType;
  status: AdminInboxItemStatus;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityIds?: string[];
  createdAt: string;
  markedDoneAt?: string;
  markedDoneBy?: string;
  autoResolvedReason?: 'CONFLICT_CLEARED';
}

export type ViewState = 'CALENDAR' | 'GANTT' | 'MANAGE' | 'SETTINGS' | 'POWER_TOOLS' | 'SUPER_ADMIN' | 'STAFF_MEMBERS' | 'ADMIN_INBOX';

// ─── v2.0 Type Re-exports ────────────────────────────────────────────────────
// Canonical v2.0 types from the Cadenza v2.0 Final spec (Section 05).
// New code should import from here or directly from './types/v2'.

export type {
  // Enums
  ActivityTemplate,
  ActivityTypeV2,
  EventStatus,
  EnrollmentStatus,
  ImportSessionStatus,
  ImportRowStatus,
  ParticipantType,
  AssignmentType,
  StaffRole,
  EventNameMode,
  DuplicateAction,
  ImportEntityType,
  // Sub-structures
  FirstUseFlags,
  ImportRowResult,
  // Entities
  ActivityV2,
  L1Subcategory,
  L2Subcategory,
  StaffMemberV2,
  TeachingAssignmentV2,
  AssignmentScope,
  OrgRoleV2,
  StudentV2,
  EnrollmentV2,
  EventV2,
  EventParticipant,
  EnsembleRosterMember,
  ImportSession,
  OnboardingState,
  OrgSettingsV2,
  UserProfile,
} from './types/v2';

export { V2_COLLECTIONS } from './types/v2';
