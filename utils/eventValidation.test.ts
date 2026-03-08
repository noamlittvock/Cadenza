import { describe, it, expect } from 'vitest';
import {
  validateEventForm,
  isStudentEnrolled,
  detectOverlappingAssignments,
  hasBillingModuleConflict,
  EventFormInput,
  ActivityModules,
  EnrollmentRecord,
  TeachingAssignmentRecord,
} from './eventValidation';

// ─── Helpers ────────────────────────────────────────────────────────────────

const baseModules: ActivityModules = {
  curriculum: false,
  staffBilling: false,
  orgRoleBilling: false,
  revenue: false,
};

const validBase: EventFormInput = {
  activityId: 'act1',
  date: '2026-03-15',
  startTime: '10:00',
  endTime: '11:00',
  name: 'Test Event',
  eventNameMode: 'PROMPTED',
  template: 'DISCIPLINE',
  modules: { ...baseModules, curriculum: true, staffBilling: true },
  lessonMode: 'INDIVIDUAL',
  selectedStudentIds: ['s1'],
  staffParticipantCount: 1,
  externalParticipantCount: 0,
};

const fieldKeys = (errors: { field: string }[]) => errors.map(e => e.field);

// ─── Section 15: Event Form Validation ──────────────────────────────────────

describe('validateEventForm', () => {
  it('passes for a valid DISCIPLINE individual event', () => {
    expect(validateEventForm(validBase)).toEqual([]);
  });

  // Required fields
  it('requires activityId', () => {
    const errors = validateEventForm({ ...validBase, activityId: '' });
    expect(fieldKeys(errors)).toContain('activityId');
  });

  it('requires date', () => {
    const errors = validateEventForm({ ...validBase, date: '' });
    expect(fieldKeys(errors)).toContain('date');
  });

  it('requires startTime', () => {
    const errors = validateEventForm({ ...validBase, startTime: '' });
    expect(fieldKeys(errors)).toContain('startTime');
  });

  it('requires endTime', () => {
    const errors = validateEventForm({ ...validBase, endTime: '' });
    expect(fieldKeys(errors)).toContain('endTime');
  });

  // Section 15: endTime <= startTime (cross-midnight)
  it('blocks endTime <= startTime', () => {
    const errors = validateEventForm({ ...validBase, startTime: '23:00', endTime: '01:00' });
    expect(errors.some(e => e.messageKey === 'event.v2.err_end_before_start')).toBe(true);
  });

  // Section 15: durationMinutes = 0
  it('blocks zero duration (same start and end time)', () => {
    const errors = validateEventForm({ ...validBase, startTime: '10:00', endTime: '10:00' });
    expect(errors.some(e => e.messageKey === 'event.v2.err_zero_duration')).toBe(true);
  });

  // PROMPTED name required
  it('requires name when eventNameMode is PROMPTED', () => {
    const errors = validateEventForm({ ...validBase, name: '  ' });
    expect(fieldKeys(errors)).toContain('name');
  });

  it('does not require name when eventNameMode is AUTO', () => {
    const errors = validateEventForm({ ...validBase, eventNameMode: 'AUTO', name: '' });
    expect(fieldKeys(errors)).not.toContain('name');
  });

  // Section 15: DISCIPLINE individual — more than one student
  it('blocks DISCIPLINE INDIVIDUAL with >1 student', () => {
    const errors = validateEventForm({
      ...validBase,
      lessonMode: 'INDIVIDUAL',
      selectedStudentIds: ['s1', 's2'],
    });
    expect(errors.some(e => e.messageKey === 'event.v2.err_individual_max')).toBe(true);
  });

  it('allows DISCIPLINE GROUP with multiple students', () => {
    const errors = validateEventForm({
      ...validBase,
      lessonMode: 'GROUP',
      selectedStudentIds: ['s1', 's2', 's3'],
    });
    expect(errors.some(e => e.messageKey === 'event.v2.err_individual_max')).toBe(false);
  });

  // Section 15: DISCIPLINE/PROGRAM zero students
  it('blocks DISCIPLINE with zero students', () => {
    const errors = validateEventForm({
      ...validBase,
      selectedStudentIds: [],
    });
    expect(errors.some(e => e.messageKey === 'event.v2.err_students_required')).toBe(true);
  });

  it('blocks PROGRAM with zero students', () => {
    const errors = validateEventForm({
      ...validBase,
      template: 'PROGRAM',
      selectedStudentIds: [],
    });
    expect(errors.some(e => e.messageKey === 'event.v2.err_students_required')).toBe(true);
  });

  // Section 15: DISCIPLINE/PROGRAM zero staff
  it('blocks DISCIPLINE with zero staff', () => {
    const errors = validateEventForm({
      ...validBase,
      staffParticipantCount: 0,
    });
    expect(errors.some(e => e.messageKey === 'event.v2.err_staff_required')).toBe(true);
  });

  it('blocks PROGRAM with zero staff', () => {
    const errors = validateEventForm({
      ...validBase,
      template: 'PROGRAM',
      modules: { ...baseModules, curriculum: true, staffBilling: true },
      selectedStudentIds: ['s1'],
      staffParticipantCount: 0,
    });
    expect(errors.some(e => e.messageKey === 'event.v2.err_staff_required')).toBe(true);
  });

  // Section 15: ADMINISTRATIVE zero staff
  it('blocks ADMINISTRATIVE with zero staff (org role required)', () => {
    const errors = validateEventForm({
      ...validBase,
      template: 'ADMINISTRATIVE',
      modules: { ...baseModules, orgRoleBilling: true },
      selectedStudentIds: [],
      staffParticipantCount: 0,
    });
    expect(errors.some(e => e.messageKey === 'event.v2.err_role_required')).toBe(true);
  });

  // Section 15: Event with no staff for External — allowed
  it('allows EXTERNAL event with zero staff', () => {
    const errors = validateEventForm({
      ...validBase,
      template: 'EXTERNAL',
      modules: baseModules,
      selectedStudentIds: [],
      staffParticipantCount: 0,
    });
    expect(errors.some(e => e.messageKey === 'event.v2.err_staff_required')).toBe(false);
    expect(errors.some(e => e.messageKey === 'event.v2.err_role_required')).toBe(false);
  });

  // Section 15: External participant on DISCIPLINE/PROGRAM/ADMINISTRATIVE — blocked
  // (This is enforced in UI by hiding Zone 3 external controls, not in validation)
});

// ─── Section 15: Enrollment Enforcement ─────────────────────────────────────

describe('isStudentEnrolled', () => {
  const enrollments: EnrollmentRecord[] = [
    { studentId: 's1', activityId: 'act1', l2Id: 'l2a', status: 'ACTIVE', startDate: '2026-01-01', endDate: '2026-06-30' },
    { studentId: 's2', activityId: 'act1', l2Id: 'l2a', status: 'ACTIVE', startDate: '2026-04-01' }, // open-ended
    { studentId: 's3', activityId: 'act1', l2Id: 'l2a', status: 'SUSPENDED', startDate: '2026-01-01', endDate: '2026-12-31' },
    { studentId: 's4', activityId: 'act2', l2Id: 'l2a', status: 'ACTIVE', startDate: '2026-01-01', endDate: '2026-12-31' },
  ];

  it('returns true for enrolled student on valid date', () => {
    expect(isStudentEnrolled('s1', 'act1', 'l2a', '2026-03-15', enrollments)).toBe(true);
  });

  it('returns false for student not enrolled in this activity', () => {
    // s4 is enrolled in act2, not act1
    expect(isStudentEnrolled('s4', 'act1', 'l2a', '2026-03-15', enrollments)).toBe(false);
  });

  it('returns false for enrollment that has not started', () => {
    // s2 enrollment starts April 1
    expect(isStudentEnrolled('s2', 'act1', 'l2a', '2026-03-15', enrollments)).toBe(false);
  });

  it('returns true for enrollment that has started', () => {
    expect(isStudentEnrolled('s2', 'act1', 'l2a', '2026-05-15', enrollments)).toBe(true);
  });

  it('returns false for enrollment that has ended', () => {
    expect(isStudentEnrolled('s1', 'act1', 'l2a', '2026-07-15', enrollments)).toBe(false);
  });

  it('returns false for suspended enrollment', () => {
    expect(isStudentEnrolled('s3', 'act1', 'l2a', '2026-03-15', enrollments)).toBe(false);
  });

  it('ignores l2Id when not provided (matches any l2)', () => {
    expect(isStudentEnrolled('s1', 'act1', undefined, '2026-03-15', enrollments)).toBe(true);
  });

  it('returns false for unknown student', () => {
    expect(isStudentEnrolled('s999', 'act1', 'l2a', '2026-03-15', enrollments)).toBe(false);
  });
});

// ─── Section 15: Teaching Assignment Overlap ────────────────────────────────

describe('detectOverlappingAssignments', () => {
  const existing: TeachingAssignmentRecord[] = [
    { id: 'ta1', staffMemberId: 'sm1', activityId: 'act1', l2Id: 'l2a', startDate: '2026-01-01', endDate: '2026-06-30' },
    { id: 'ta2', staffMemberId: 'sm1', activityId: 'act1', l2Id: 'l2b', startDate: '2026-01-01', endDate: '2026-06-30' },
    { id: 'ta3', staffMemberId: 'sm2', activityId: 'act1', l2Id: 'l2a', startDate: '2026-01-01', endDate: '2026-06-30' },
    { id: 'ta4', staffMemberId: 'sm1', activityId: 'act1', l2Id: 'l2a', startDate: '2026-01-01', endDate: '2026-03-31', isArchived: true },
  ];

  it('detects overlap for same staff+activity+l2 with overlapping dates', () => {
    const newAssignment = { staffMemberId: 'sm1', activityId: 'act1', l2Id: 'l2a', startDate: '2026-03-01', endDate: '2026-09-30' };
    const overlaps = detectOverlappingAssignments(newAssignment, existing);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].id).toBe('ta1');
  });

  it('allows same staff+activity with different l2Id', () => {
    // Section 15: "Two TeachingAssignments for same (staffMemberId, activityId) but different l2Ids — Allow."
    const newAssignment = { staffMemberId: 'sm1', activityId: 'act1', l2Id: 'l2c', startDate: '2026-03-01', endDate: '2026-09-30' };
    const overlaps = detectOverlappingAssignments(newAssignment, existing);
    expect(overlaps).toHaveLength(0);
  });

  it('allows different staff member same activity+l2', () => {
    const newAssignment = { staffMemberId: 'sm3', activityId: 'act1', l2Id: 'l2a', startDate: '2026-03-01', endDate: '2026-09-30' };
    const overlaps = detectOverlappingAssignments(newAssignment, existing);
    expect(overlaps).toHaveLength(0);
  });

  it('excludes archived assignments', () => {
    // ta4 is archived, should not be detected
    const newAssignment = { staffMemberId: 'sm1', activityId: 'act1', l2Id: 'l2a', startDate: '2026-02-01', endDate: '2026-03-15' };
    const overlaps = detectOverlappingAssignments(newAssignment, existing);
    // Only ta1 should match (not ta4 which is archived)
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].id).toBe('ta1');
  });

  it('allows non-overlapping date ranges', () => {
    const newAssignment = { staffMemberId: 'sm1', activityId: 'act1', l2Id: 'l2a', startDate: '2026-07-01', endDate: '2026-12-31' };
    const overlaps = detectOverlappingAssignments(newAssignment, existing);
    expect(overlaps).toHaveLength(0);
  });

  it('detects overlap with open-ended new assignment', () => {
    const newAssignment = { staffMemberId: 'sm1', activityId: 'act1', l2Id: 'l2a', startDate: '2026-05-01' };
    const overlaps = detectOverlappingAssignments(newAssignment, existing);
    expect(overlaps).toHaveLength(1);
  });

  it('can exclude self when editing', () => {
    const newAssignment = { staffMemberId: 'sm1', activityId: 'act1', l2Id: 'l2a', startDate: '2026-01-01', endDate: '2026-06-30' };
    const overlaps = detectOverlappingAssignments(newAssignment, existing, 'ta1');
    expect(overlaps).toHaveLength(0);
  });
});

// ─── Section 15: Billing Module Conflict ────────────────────────────────────

describe('hasBillingModuleConflict', () => {
  it('returns true when both staffBilling and orgRoleBilling enabled', () => {
    expect(hasBillingModuleConflict({
      ...baseModules,
      staffBilling: true,
      orgRoleBilling: true,
    })).toBe(true);
  });

  it('returns false when only staffBilling enabled', () => {
    expect(hasBillingModuleConflict({
      ...baseModules,
      staffBilling: true,
    })).toBe(false);
  });

  it('returns false when only orgRoleBilling enabled', () => {
    expect(hasBillingModuleConflict({
      ...baseModules,
      orgRoleBilling: true,
    })).toBe(false);
  });

  it('returns false when neither enabled', () => {
    expect(hasBillingModuleConflict(baseModules)).toBe(false);
  });
});
