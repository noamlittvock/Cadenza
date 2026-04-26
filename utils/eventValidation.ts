/**
 * eventValidation.ts — Pure event form validation functions
 *
 * Extracted from EventFormV2 for testability.
 * Covers Section 15 edge cases.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActivityTemplate = 'DISCIPLINE' | 'PROGRAM' | 'ENSEMBLE' | 'ADMINISTRATIVE' | 'EXTERNAL';
export type LessonMode = 'INDIVIDUAL' | 'GROUP';

export interface ActivityModules {
  curriculum: boolean;
  externalParticipants: boolean;
}

export interface EventFormInput {
  activityId: string;
  date: string;
  startTime: string;
  endTime: string;
  name: string;
  eventNameMode: 'AUTO' | 'PROMPTED';
  template: ActivityTemplate;
  modules: ActivityModules;
  lessonMode: LessonMode;
  selectedStudentIds: string[];
  staffParticipantCount: number;
  externalParticipantCount: number;
}

export interface ValidationError {
  field: string;
  messageKey: string;
}

// ─── Core Validation ────────────────────────────────────────────────────────

/**
 * Validates event form inputs. Returns array of validation errors.
 * Matches the validate() function in EventFormV2.tsx + Section 15 edge cases.
 */
export function validateEventForm(input: EventFormInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required fields
  if (!input.activityId) errors.push({ field: 'activityId', messageKey: 'event.v2.select_activity' });
  if (!input.date) errors.push({ field: 'date', messageKey: 'event.v2.date' });
  if (!input.startTime) errors.push({ field: 'startTime', messageKey: 'event.v2.start_time' });
  if (!input.endTime) errors.push({ field: 'endTime', messageKey: 'event.v2.end_time' });

  // Time validation
  if (input.startTime && input.endTime) {
    if (input.endTime <= input.startTime) {
      errors.push({ field: 'endTime', messageKey: 'event.v2.err_end_before_start' });
    }
    if (input.endTime === input.startTime) {
      errors.push({ field: 'endTime', messageKey: 'event.v2.err_zero_duration' });
    }
  }

  // PROMPTED name required
  if (input.eventNameMode === 'PROMPTED' && !input.name.trim()) {
    errors.push({ field: 'name', messageKey: 'event.v2.name_placeholder' });
  }

  // Curriculum validation (not for ENSEMBLE/EXTERNAL/ADMINISTRATIVE)
  if (input.modules.curriculum && input.template !== 'ENSEMBLE') {
    // DISCIPLINE individual: max 1 student
    if (input.template === 'DISCIPLINE' && input.lessonMode === 'INDIVIDUAL' && input.selectedStudentIds.length > 1) {
      errors.push({ field: 'students', messageKey: 'event.v2.err_individual_max' });
    }
    // DISCIPLINE/PROGRAM: at least 1 student required
    if ((input.template === 'DISCIPLINE' || input.template === 'PROGRAM') && input.selectedStudentIds.length === 0) {
      errors.push({ field: 'students', messageKey: 'event.v2.err_students_required' });
    }
  }

  // Staff required for DISCIPLINE/PROGRAM
  if (input.template === 'DISCIPLINE' || input.template === 'PROGRAM') {
    if (input.staffParticipantCount === 0) {
      errors.push({ field: 'staff', messageKey: 'event.v2.err_staff_required' });
    }
  }

  // Org role required for ADMINISTRATIVE
  if (input.template === 'ADMINISTRATIVE') {
    if (input.staffParticipantCount === 0) {
      errors.push({ field: 'staff', messageKey: 'event.v2.err_role_required' });
    }
  }

  return errors;
}

// ─── Enrollment Check ───────────────────────────────────────────────────────

export interface EnrollmentRecord {
  studentId: string;
  activityId: string;
  l2Id?: string;
  status: string;
  startDate: string;
  endDate?: string;
}

/**
 * Check if a student is enrolled in an activity on a given date.
 * Section 15: "Block event creation. Show error: This student is not enrolled in this activity."
 */
export function isStudentEnrolled(
  studentId: string,
  activityId: string,
  l2Id: string | undefined,
  eventDate: string,
  enrollments: EnrollmentRecord[],
): boolean {
  return enrollments.some(e =>
    e.studentId === studentId &&
    e.activityId === activityId &&
    (!l2Id || e.l2Id === l2Id) &&
    e.status === 'ACTIVE' &&
    e.startDate <= eventDate &&
    (!e.endDate || e.endDate >= eventDate)
  );
}

// ─── Teaching Assignment Overlap Detection ──────────────────────────────────

export interface TeachingAssignmentRecord {
  id: string;
  staffMemberId: string;
  activityId: string;
  l2Id: string;
  startDate: string;
  endDate?: string;
  isArchived?: boolean;
}

/**
 * Detect overlapping teaching assignments for same (staffMemberId, activityId, l2Id).
 * Section 15: "Block creation. Error: An overlapping assignment already exists..."
 */
export function detectOverlappingAssignments(
  newAssignment: { staffMemberId: string; activityId: string; l2Id: string; startDate: string; endDate?: string },
  existingAssignments: TeachingAssignmentRecord[],
  excludeId?: string,
): TeachingAssignmentRecord[] {
  return existingAssignments.filter(existing => {
    if (existing.isArchived) return false;
    if (excludeId && existing.id === excludeId) return false;
    if (existing.staffMemberId !== newAssignment.staffMemberId) return false;
    if (existing.activityId !== newAssignment.activityId) return false;
    if (existing.l2Id !== newAssignment.l2Id) return false;

    // Check date range overlap
    const newStart = newAssignment.startDate;
    const newEnd = newAssignment.endDate;
    const existStart = existing.startDate;
    const existEnd = existing.endDate;

    // Two ranges overlap if: start1 <= end2 AND start2 <= end1
    // Open-ended (no endDate) means extends to infinity
    const newEndEffective = newEnd || '9999-12-31';
    const existEndEffective = existEnd || '9999-12-31';

    return newStart <= existEndEffective && existStart <= newEndEffective;
  });
}

/**
 * Section 15: Two TeachingAssignments for same (staffMemberId, activityId) but different l2Ids — Allow.
 * This is explicitly checked by the caller: overlap detection only matches same l2Id.
 */
