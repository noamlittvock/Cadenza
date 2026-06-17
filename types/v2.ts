/**
 * Cadenza v2.0 Type Definitions
 *
 * All types match Section 05 (Data Schema) of the Cadenza v2.0 Final spec.
 * These are the canonical types for v2.0 — new code should import from here.
 *
 * Naming convention: types that conflict with v1.3 names use a V2 suffix.
 * Types unique to v2.0 use their canonical name from Section 03 (Glossary).
 */

import type { AppTimestamp } from '../utils/appTimestamp';

// ─── Enums ───────────────────────────────────────────────────────────────────

/** Section 06 — Activity Templates */
export type ActivityTemplate =
  | 'DISCIPLINE'
  | 'PROGRAM'
  | 'ENSEMBLE'
  | 'EXTERNAL'
  | 'ADMINISTRATIVE';

/** Section 05 — Activity.activityType (derived from template at creation) */
export type ActivityTypeV2 =
  | 'ACADEMIC'
  | 'ADMINISTRATIVE'
  | 'PERFORMANCES'
  | 'SPECIAL_EVENTS';

/** Section 05 — Event.status */
export type EventStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';

/** Section 05 — Enrollment.status */
export type EnrollmentStatus = 'ACTIVE' | 'ARCHIVED';

/** Section 05 — ImportSession.status */
export type ImportSessionStatus =
  | 'PENDING'
  | 'REVIEWING'
  | 'IMPORTING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'CANCELLED';

/** Section 05 — ImportRowResult.status */
export type ImportRowStatus =
  | 'PENDING'
  | 'VALID'
  | 'DUPLICATE'
  | 'ERROR'
  | 'IMPORTED'
  | 'SKIPPED';

/** Section 05 — EventParticipant.assignmentType (STAFF participants only) */
export type AssignmentType = 'TEACHING' | 'ORG_ROLE';

/** Section 03 / Section 13 — StaffMember.role */
export type StaffRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';

/** Section 05 — Activity.eventNameMode */
export type EventNameMode = 'AUTO' | 'PROMPTED';

/** Section 05 — ImportRowResult.duplicateAction */
export type DuplicateAction = 'OVERWRITE' | 'SKIP';

/** Section 05 — ImportSession.entityType */
export type ImportEntityType =
  | 'STUDENT'
  | 'STAFF_MEMBER'
  | 'ENROLLMENT'
  | 'EVENT'
  | 'TEACHING_ASSIGNMENT'
  | 'ROOM'
  | 'ACTIVITY'
  | 'ACTIVITY_HIERARCHY';

// ─── Sub-structures ──────────────────────────────────────────────────────────

/** Section 05 — Activity.modules */
export interface ModulesConfig {
  curriculum: boolean;
}

/** Section 05 — StaffMember.firstUseFlags */
export interface FirstUseFlags {
  activityHub: boolean;
  staffModule: boolean;
  eventCreation: boolean;
  enrollment: boolean;
}

/** Section 05 — ImportRowResult (embedded in ImportSession) */
export interface ImportRowResult {
  rowIndex: number;
  status: ImportRowStatus;
  rawData: Record<string, unknown>;
  resolvedData: Record<string, unknown> | null;
  errorMessage: string | null;
  duplicateOf: string | null;
  duplicateAction: DuplicateAction | null;
  autoCreated: string[] | null;
}

// ─── Document Entry (shared by Staff & Student) ─────────────────────────────

export interface DocumentEntry {
  id: string;
  name: string;
  type: string; // DIPLOMA | CERTIFICATE | ID | OTHER
  date: string; // ISO date
  notes: string | null;
  fileUrl: string | null;
  filePath: string | null; // Storage path for deletion
}

// ─── Entity Interfaces ───────────────────────────────────────────────────────

/** Section 05 — activities/{activityId} */
export interface ActivityV2 {
  id: string;
  orgId: string;
  name: string;
  template: ActivityTemplate;
  activityType: ActivityTypeV2;
  modules: ModulesConfig;
  location: string | null;
  eventNameMode: EventNameMode;
  isArchived: boolean;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

/** Section 05 — l1Subcategories/{l1Id} */
export interface L1Subcategory {
  id: string;
  orgId: string;
  activityId: string;
  name: string;
  isArchived: boolean;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

/** Section 05 — l2Subcategories/{l2Id} */
export interface L2Subcategory {
  id: string;
  orgId: string;
  activityId: string;
  l1Id: string | null;
  name: string;
  isArchived: boolean;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

/** Section 05 — staffMembers/{staffId} */
export interface StaffMemberV2 {
  id: string;
  orgId: string;
  uid: string;
  role: StaffRole;
  fullName: string;
  email: string;
  phone: string | null;
  startDate: string | null;
  isArchived: boolean;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
  // Onboarding fields
  isFirstAdmin: boolean;
  onboardingDismissed: boolean;
  firstUseFlags: FirstUseFlags;
  documents: DocumentEntry[];
}

/** Scope at which a teaching assignment binds in the activity hierarchy */
export type AssignmentScope = 'ACTIVITY' | 'L1' | 'L2';

/** Section 05 — teachingAssignments/{assignmentId} */
export interface TeachingAssignmentV2 {
  id: string;
  orgId: string;
  staffMemberId: string;
  scope: AssignmentScope;
  activityId: string;
  l1Id: string | null;
  l2Id: string | null;
  startDate: string; // ISO date
  endDate: string | null;
  isArchived: boolean;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

/** Section 05 — orgRoles/{orgRoleId} */
export interface OrgRoleV2 {
  id: string;
  orgId: string;
  staffMemberId: string;
  roleTitle: string;
  startDate: string;
  endDate: string | null;
  isArchived: boolean;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

/** Section 05 — students/{studentId} */
export interface StudentV2 {
  id: string;
  orgId: string;
  fullName: string;
  dateOfBirth: string | null;
  parentName: string | null;
  parentPhone: string | null;
  grade: string | null;
  startDate: string | null;
  level: number | null;
  tags: string[];
  phone2: string | null;
  email: string | null;
  address: string | null;
  isArchived: boolean;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
  documents: DocumentEntry[];
}

/** Section 05 — enrollments/{enrollmentId} */
export interface EnrollmentV2 {
  id: string;
  orgId: string;
  studentId: string;
  activityId: string;
  l2Id: string;
  startDate: string;
  endDate: string | null;
  status: EnrollmentStatus;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

/** Section 05 — events/{eventId} */
export interface EventV2 {
  id: string;
  orgId: string;
  name: string;
  activityId: string;
  l1Id: string | null;
  l2Id: string | null;
  location: string;
  date: string; // ISO date YYYY-MM-DD in org timezone
  startTime: string; // HH:MM in org timezone
  endTime: string; // HH:MM in org timezone, must be > startTime
  durationMinutes: number; // Computed server-side, immutable snapshot (recomputed on edit)
  isRecurring: boolean;
  recurringGroupId: string | null;
  status: EventStatus;
  notes: string | null;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

/** Section 05 — eventParticipants/{participantId} (STAFF only) */
export interface EventParticipant {
  id: string;
  orgId: string;
  eventId: string;
  staffMemberId: string;
  assignmentType: AssignmentType;
  teachingAssignmentId?: string | null;
  orgRoleId?: string | null;
  notes?: string | null;
  createdAt: AppTimestamp;
}

/** Section 05 — importSessions/{sessionId} */
export interface ImportSession {
  id: string;
  orgId: string;
  createdBy: string;
  entityType: ImportEntityType;
  status: ImportSessionStatus;
  fileName: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  rowResults: ImportRowResult[];
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

/** Section 05 — onboardingState/{orgId} */
export interface OnboardingState {
  orgId: string;
  activitiesCreated: boolean;
  staffAdded: boolean;
  firstEventCreated: boolean;
  setupGateCleared: boolean;
}

/** Section 05 — orgSettings/{orgId} */
export interface OrgSettingsV2 {
  orgId: string;
  timezone: string; // IANA timezone identifier
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

// ─── Supabase Role Lookup ───────────────────────────────────────────────────

/**
 * user_profiles rows map Supabase Auth users to org roles.
 */
export interface UserProfile {
  uid: string;
  orgId: string;
  staffMemberId: string;
  role: StaffRole;
}

// ─── Collection Names ────────────────────────────────────────────────────────

export const V2_COLLECTIONS = {
  activities: 'activities',
  l1Subcategories: 'l1Subcategories',
  l2Subcategories: 'l2Subcategories',
  staffMembers: 'staffMembers',
  teachingAssignments: 'teachingAssignments',
  orgRoles: 'orgRoles',
  students: 'students',
  enrollments: 'enrollments',
  events: 'events',
  eventParticipants: 'eventParticipants',
  importSessions: 'importSessions',
  onboardingState: 'onboardingState',
  orgSettings: 'orgSettings',
  userProfiles: 'userProfiles',
} as const;
