import type {
  StaffingAssignment,
  StaffingClass,
  StaffingClassStatus,
  StaffingPlanSummary,
  StaffingRequirementStatus,
  StaffingShortage,
  StaffingStaff,
  StaffingSubjectRequirement,
  StaffingTeacherBalance,
  StaffingTeacherQuota,
  StaffingTrackBalance,
} from '../types/staffing';

const round = (n: number) => Math.round(n * 100) / 100;

export interface RequirementIndexEntry {
  requirement: StaffingSubjectRequirement;
  classId: string;
  className: string;
  gradeLevel: string;
}

/** Map requirementId → its requirement + owning-class context (one pass). */
export function buildRequirementIndex(classes: StaffingClass[]): Map<string, RequirementIndexEntry> {
  const index = new Map<string, RequirementIndexEntry>();
  classes.forEach(cls => {
    (cls.requirements || []).forEach(requirement => {
      index.set(requirement.id, {
        requirement,
        classId: cls.id,
        className: cls.name,
        gradeLevel: cls.gradeLevel,
      });
    });
  });
  return index;
}

const sumHours = (assignments: StaffingAssignment[]) =>
  round(assignments.reduce((total, assignment) => total + (Number(assignment.hours) || 0), 0));

/**
 * The live "bank-account" balance for one teacher: total required minus assigned,
 * plus per-track sub-balances so categorized obligations (e.g. ≥10h high school)
 * are honoured.
 */
export function computeTeacherBalance(
  quota: StaffingTeacherQuota,
  assignments: StaffingAssignment[],
  requirementIndex: Map<string, RequirementIndexEntry>,
  staffName: string,
): StaffingTeacherBalance {
  const mine = assignments.filter(
    assignment => assignment.planId === quota.planId && assignment.staffMemberId === quota.staffMemberId,
  );
  const assignedHours = sumHours(mine);

  const assignedByTrack = new Map<string, number>();
  mine.forEach(assignment => {
    const track = requirementIndex.get(assignment.requirementId)?.requirement.track;
    if (!track) return;
    assignedByTrack.set(track, round((assignedByTrack.get(track) || 0) + (Number(assignment.hours) || 0)));
  });

  const byTrack: StaffingTrackBalance[] = (quota.trackRequirements || []).map(requirement => {
    const assigned = assignedByTrack.get(requirement.track) || 0;
    return {
      track: requirement.track,
      minHours: requirement.minHours,
      assignedHours: assigned,
      remainingHours: Math.max(0, round(requirement.minHours - assigned)),
      met: assigned >= requirement.minHours,
    };
  });

  const remainingHours = round(quota.totalRequiredHours - assignedHours);
  const tracksMet = byTrack.every(track => track.met);
  return {
    quotaId: quota.id,
    staffMemberId: quota.staffMemberId,
    staffName,
    totalRequiredHours: quota.totalRequiredHours,
    assignedHours,
    remainingHours,
    overAssigned: remainingHours < 0,
    complete: remainingHours === 0 && tracksMet,
    byTrack,
  };
}

export function computeTeacherBalances(
  quotas: StaffingTeacherQuota[],
  assignments: StaffingAssignment[],
  classes: StaffingClass[],
  staff: StaffingStaff[],
): StaffingTeacherBalance[] {
  const requirementIndex = buildRequirementIndex(classes);
  const nameById = new Map(staff.map(member => [member.id, member.fullName]));
  return quotas.map(quota =>
    computeTeacherBalance(quota, assignments, requirementIndex, nameById.get(quota.staffMemberId) || 'Unknown teacher'),
  );
}

export function computeRequirementStatus(
  requirement: StaffingSubjectRequirement,
  classId: string,
  className: string,
  gradeLevel: string,
  assignments: StaffingAssignment[],
): StaffingRequirementStatus {
  const assignedHours = sumHours(assignments.filter(assignment => assignment.requirementId === requirement.id));
  const missingHours = Math.max(0, round(requirement.requiredWeeklyHours - assignedHours));
  return {
    requirementId: requirement.id,
    classId,
    className,
    gradeLevel,
    subject: requirement.subject,
    track: requirement.track,
    requiredWeeklyHours: requirement.requiredWeeklyHours,
    assignedHours,
    missingHours,
    overStaffed: assignedHours > requirement.requiredWeeklyHours,
    complete: missingHours === 0 && requirement.requiredWeeklyHours > 0,
  };
}

export function computeClassStatus(cls: StaffingClass, assignments: StaffingAssignment[]): StaffingClassStatus {
  const requirements = (cls.requirements || []).map(requirement =>
    computeRequirementStatus(requirement, cls.id, cls.name, cls.gradeLevel, assignments),
  );
  const requiredHours = round(requirements.reduce((total, r) => total + r.requiredWeeklyHours, 0));
  const assignedHours = round(requirements.reduce((total, r) => total + Math.min(r.assignedHours, r.requiredWeeklyHours), 0));
  const missingHours = round(requirements.reduce((total, r) => total + r.missingHours, 0));
  return {
    classId: cls.id,
    className: cls.name,
    gradeLevel: cls.gradeLevel,
    requiredHours,
    assignedHours,
    missingHours,
    complete: requirements.length > 0 && missingHours === 0,
    requirements,
  };
}

export function computeClassStatuses(classes: StaffingClass[], assignments: StaffingAssignment[]): StaffingClassStatus[] {
  return classes.map(cls => computeClassStatus(cls, assignments));
}

/** Flat, sorted list of every unstaffed gap across the plan. */
export function computeShortages(classes: StaffingClass[], assignments: StaffingAssignment[]): StaffingShortage[] {
  return computeClassStatuses(classes, assignments)
    .flatMap(cls => cls.requirements)
    .filter(requirement => requirement.missingHours > 0)
    .map(requirement => ({
      requirementId: requirement.requirementId,
      classId: requirement.classId,
      className: requirement.className,
      gradeLevel: requirement.gradeLevel,
      subject: requirement.subject,
      track: requirement.track,
      missingHours: requirement.missingHours,
    }))
    .sort((a, b) =>
      b.missingHours - a.missingHours ||
      a.gradeLevel.localeCompare(b.gradeLevel) ||
      a.className.localeCompare(b.className),
    );
}

export function computePlanSummary(
  planId: string,
  quotas: StaffingTeacherQuota[],
  classes: StaffingClass[],
  assignments: StaffingAssignment[],
  staff: StaffingStaff[],
): StaffingPlanSummary {
  const balances = computeTeacherBalances(quotas, assignments, classes, staff);
  const classStatuses = computeClassStatuses(classes, assignments);
  return {
    planId,
    teacherCount: balances.length,
    teachersComplete: balances.filter(balance => balance.complete).length,
    classCount: classStatuses.length,
    classesComplete: classStatuses.filter(cls => cls.complete).length,
    totalRequiredHours: round(classStatuses.reduce((total, cls) => total + cls.requiredHours, 0)),
    totalAssignedHours: round(classStatuses.reduce((total, cls) => total + cls.assignedHours, 0)),
    totalMissingHours: round(classStatuses.reduce((total, cls) => total + cls.missingHours, 0)),
  };
}

/** Subjects already used in a plan, for the free-text autocomplete. */
export function collectPlanSubjects(classes: StaffingClass[]): string[] {
  const subjects = new Set<string>();
  classes.forEach(cls => (cls.requirements || []).forEach(requirement => {
    if (requirement.subject.trim()) subjects.add(requirement.subject.trim());
  }));
  return Array.from(subjects).sort((a, b) => a.localeCompare(b));
}
