import type { StaffMemberV2 } from './v2';

/**
 * Standalone Teaching-Load / Staffing Planner (הרכבי משרה).
 * No calendar or payroll coupling — these entities are a self-contained planning
 * sheet for next year's staffing. See spec/Staffing_Load_Planner_Spec.md.
 */

/** Seeded tracks; typed as string so orgs can extend later. */
export const STAFFING_TRACKS = ['HIGH_SCHOOL', 'JUNIOR_HIGH'] as const;
export type StaffingTrack = (typeof STAFFING_TRACKS)[number] | string;

export const STAFFING_TRACK_LABELS: Record<string, string> = {
  HIGH_SCHOOL: 'High school',
  JUNIOR_HIGH: 'Junior high',
};

export interface StaffingTrackRequirement {
  track: StaffingTrack;
  /** Minimum hours of the teacher's total that must fall in this track. */
  minHours: number;
}

export interface StaffingPlan {
  id: string;
  orgId?: string;
  name: string;
  schoolYear: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

/** A teacher's employment obligation within one plan (the "bank account"). */
export interface StaffingTeacherQuota {
  id: string;
  orgId?: string;
  planId: string;
  staffMemberId: string; // → StaffMemberV2.id
  totalRequiredHours: number;
  trackRequirements: StaffingTrackRequirement[];
  createdAt: string;
  updatedAt: string;
}

/** "This class needs N weekly hours of subject X (in track T)." */
export interface StaffingSubjectRequirement {
  id: string; // stable within its class
  subject: string;
  requiredWeeklyHours: number;
  track: StaffingTrack;
}

export interface StaffingClass {
  id: string;
  orgId?: string;
  planId: string;
  name: string;
  gradeLevel: string;
  requirements: StaffingSubjectRequirement[];
  createdAt: string;
  updatedAt: string;
}

/** An allocation of a teacher's hours to one class-subject requirement. */
export interface StaffingAssignment {
  id: string;
  orgId?: string;
  planId: string;
  classId: string; // denormalized for grouping
  requirementId: string; // → StaffingSubjectRequirement.id
  staffMemberId: string;
  hours: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Derived shapes (computed by the engine; never persisted) ────────────────

export interface StaffingTrackBalance {
  track: StaffingTrack;
  minHours: number;
  assignedHours: number;
  remainingHours: number; // minHours − assigned, clamped at 0 for display
  met: boolean;
}

export interface StaffingTeacherBalance {
  quotaId: string;
  staffMemberId: string;
  staffName: string;
  totalRequiredHours: number;
  assignedHours: number;
  remainingHours: number; // can go negative when over-assigned
  overAssigned: boolean;
  complete: boolean;
  byTrack: StaffingTrackBalance[];
}

export interface StaffingRequirementStatus {
  requirementId: string;
  classId: string;
  className: string;
  gradeLevel: string;
  subject: string;
  track: StaffingTrack;
  requiredWeeklyHours: number;
  assignedHours: number;
  missingHours: number; // required − assigned, clamped at 0
  overStaffed: boolean;
  complete: boolean;
}

export interface StaffingClassStatus {
  classId: string;
  className: string;
  gradeLevel: string;
  requiredHours: number;
  assignedHours: number;
  missingHours: number;
  complete: boolean;
  requirements: StaffingRequirementStatus[];
}

export interface StaffingShortage {
  requirementId: string;
  classId: string;
  className: string;
  gradeLevel: string;
  subject: string;
  track: StaffingTrack;
  missingHours: number;
}

export interface StaffingPlanSummary {
  planId: string;
  teacherCount: number;
  teachersComplete: number;
  classCount: number;
  classesComplete: number;
  totalRequiredHours: number;
  totalAssignedHours: number;
  totalMissingHours: number;
}

export type StaffingStaff = Pick<StaffMemberV2, 'id' | 'fullName'>;
