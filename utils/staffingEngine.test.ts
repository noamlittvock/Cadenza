import { describe, it, expect } from 'vitest';
import type {
  StaffingAssignment,
  StaffingClass,
  StaffingStaff,
  StaffingTeacherQuota,
} from '../types/staffing';
import {
  buildRequirementIndex,
  collectPlanSubjects,
  computeClassStatus,
  computePlanSummary,
  computeShortages,
  computeTeacherBalances,
} from './staffingEngine';

const PLAN = 'plan1';
const now = '2026-01-01T00:00:00.000Z';

const staff: StaffingStaff[] = [
  { id: 't1', fullName: 'Dana' },
  { id: 't2', fullName: 'Yossi' },
];

const physicsClass: StaffingClass = {
  id: 'c1',
  planId: PLAN,
  name: '11A',
  gradeLevel: '11',
  requirements: [
    { id: 'r-phys', subject: 'Physics', requiredWeeklyHours: 5, track: 'HIGH_SCHOOL' },
    { id: 'r-lit', subject: 'Literature', requiredWeeklyHours: 3, track: 'HIGH_SCHOOL' },
  ],
  createdAt: now,
  updatedAt: now,
};

const mkAssignment = (over: Partial<StaffingAssignment>): StaffingAssignment => ({
  id: `a-${Math.random()}`,
  planId: PLAN,
  classId: 'c1',
  requirementId: 'r-phys',
  staffMemberId: 't1',
  hours: 0,
  createdAt: now,
  updatedAt: now,
  ...over,
});

describe('staffingEngine — requirement & class status', () => {
  it('reports a gap when a subject is partially staffed', () => {
    const assignments = [mkAssignment({ requirementId: 'r-phys', staffMemberId: 't1', hours: 3 })];
    const status = computeClassStatus(physicsClass, assignments);
    const phys = status.requirements.find(r => r.requirementId === 'r-phys')!;
    expect(phys.assignedHours).toBe(3);
    expect(phys.missingHours).toBe(2);
    expect(phys.complete).toBe(false);
    expect(status.complete).toBe(false);
    expect(status.missingHours).toBe(5); // 2 physics + 3 literature
  });

  it('supports hour splitting across multiple teachers', () => {
    const assignments = [
      mkAssignment({ requirementId: 'r-phys', staffMemberId: 't1', hours: 3 }),
      mkAssignment({ requirementId: 'r-phys', staffMemberId: 't2', hours: 2 }),
    ];
    const status = computeClassStatus(physicsClass, assignments);
    const phys = status.requirements.find(r => r.requirementId === 'r-phys')!;
    expect(phys.assignedHours).toBe(5);
    expect(phys.missingHours).toBe(0);
    expect(phys.complete).toBe(true);
  });

  it('flags over-staffing without going negative on missing hours', () => {
    const assignments = [mkAssignment({ requirementId: 'r-phys', hours: 7 })];
    const phys = computeClassStatus(physicsClass, assignments).requirements[0];
    expect(phys.overStaffed).toBe(true);
    expect(phys.missingHours).toBe(0);
  });
});

describe('staffingEngine — teacher balance (bank account)', () => {
  const quota: StaffingTeacherQuota = {
    id: 'q1',
    planId: PLAN,
    staffMemberId: 't1',
    totalRequiredHours: 10,
    trackRequirements: [{ track: 'HIGH_SCHOOL', minHours: 8 }],
    createdAt: now,
    updatedAt: now,
  };

  it('deducts assigned hours from the total balance', () => {
    const assignments = [mkAssignment({ staffMemberId: 't1', hours: 4 })];
    const [balance] = computeTeacherBalances([quota], assignments, [physicsClass], staff);
    expect(balance.assignedHours).toBe(4);
    expect(balance.remainingHours).toBe(6);
    expect(balance.complete).toBe(false);
    expect(balance.overAssigned).toBe(false);
  });

  it('is complete only when total is met AND track minimums are satisfied', () => {
    const assignments = [
      mkAssignment({ requirementId: 'r-phys', staffMemberId: 't1', hours: 5 }),
      mkAssignment({ requirementId: 'r-lit', staffMemberId: 't1', hours: 3 }),
      // 2 more hours in some non-HS requirement would be needed for the total,
      // but here total=10 and only 8 assigned → not complete.
    ];
    const [balance] = computeTeacherBalances([quota], assignments, [physicsClass], staff);
    expect(balance.assignedHours).toBe(8);
    expect(balance.remainingHours).toBe(2);
    expect(balance.byTrack[0].met).toBe(true); // HS min 8 satisfied
    expect(balance.complete).toBe(false); // total not yet met
  });

  it('detects over-assignment as a negative balance', () => {
    const assignments = [mkAssignment({ staffMemberId: 't1', hours: 12 })];
    const [balance] = computeTeacherBalances([quota], assignments, [physicsClass], staff);
    expect(balance.remainingHours).toBe(-2);
    expect(balance.overAssigned).toBe(true);
  });
});

describe('staffingEngine — shortages & summary', () => {
  it('lists gaps sorted by missing hours', () => {
    const assignments = [mkAssignment({ requirementId: 'r-phys', hours: 1 })];
    const shortages = computeShortages([physicsClass], assignments);
    expect(shortages.map(s => s.subject)).toEqual(['Physics', 'Literature']);
    expect(shortages[0].missingHours).toBe(4);
    expect(shortages[1].missingHours).toBe(3);
  });

  it('summarizes plan completion', () => {
    const quota: StaffingTeacherQuota = {
      id: 'q1', planId: PLAN, staffMemberId: 't1', totalRequiredHours: 8,
      trackRequirements: [], createdAt: now, updatedAt: now,
    };
    const assignments = [
      mkAssignment({ requirementId: 'r-phys', staffMemberId: 't1', hours: 5 }),
      mkAssignment({ requirementId: 'r-lit', staffMemberId: 't1', hours: 3 }),
    ];
    const summary = computePlanSummary(PLAN, [quota], [physicsClass], assignments, staff);
    expect(summary.totalRequiredHours).toBe(8);
    expect(summary.totalAssignedHours).toBe(8);
    expect(summary.totalMissingHours).toBe(0);
    expect(summary.classesComplete).toBe(1);
    expect(summary.teachersComplete).toBe(1);
  });
});

describe('staffingEngine — helpers', () => {
  it('indexes requirements by id', () => {
    const index = buildRequirementIndex([physicsClass]);
    expect(index.get('r-phys')?.className).toBe('11A');
    expect(index.size).toBe(2);
  });

  it('collects distinct subjects for autocomplete', () => {
    expect(collectPlanSubjects([physicsClass])).toEqual(['Literature', 'Physics']);
  });
});
