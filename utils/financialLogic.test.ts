import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveRate,
  computeDurationMinutes,
  computeEventCost,
  computePayslipItems,
  validateAssignmentDateRange,
  filterActiveAssignments,
  EventParticipantData,
  EventData,
} from './financialLogic';

// ─── Section 17: Standard Rate Resolution ───────────────────────────────────

describe('resolveEffectiveRate', () => {
  it('returns rateSnapshot value when no override', () => {
    expect(resolveEffectiveRate({ rateType: 'HOURLY', rateValue: 150 })).toBe(150);
  });

  it('returns rateSnapshot value when override is null', () => {
    expect(resolveEffectiveRate({ rateType: 'HOURLY', rateValue: 150 }, null)).toBe(150);
  });

  it('returns rateSnapshot value when override is undefined', () => {
    expect(resolveEffectiveRate({ rateType: 'HOURLY', rateValue: 150 }, undefined)).toBe(150);
  });

  it('returns override when provided', () => {
    expect(resolveEffectiveRate({ rateType: 'HOURLY', rateValue: 150 }, 200)).toBe(200);
  });

  it('allows zero as a valid override (Section 15: volunteer event)', () => {
    expect(resolveEffectiveRate({ rateType: 'PER_EVENT', rateValue: 500 }, 0)).toBe(0);
  });
});

// ─── Section 17: durationMinutes Computation ────────────────────────────────

describe('computeDurationMinutes', () => {
  it('computes 60 minutes for 10:00–11:00', () => {
    const result = computeDurationMinutes('10:00', '11:00');
    expect(result).toEqual({ durationMinutes: 60 });
  });

  it('computes 90 minutes for 14:30–16:00', () => {
    const result = computeDurationMinutes('14:30', '16:00');
    expect(result).toEqual({ durationMinutes: 90 });
  });

  it('computes 45 minutes for 09:15–10:00', () => {
    const result = computeDurationMinutes('09:15', '10:00');
    expect(result).toEqual({ durationMinutes: 45 });
  });

  it('rejects invalid HH:MM format', () => {
    const result = computeDurationMinutes('25:00', '26:00');
    expect('error' in result).toBe(true);
  });

  it('rejects non-HH:MM strings', () => {
    const result = computeDurationMinutes('10am', '11am');
    expect('error' in result).toBe(true);
  });

  it('rejects cross-midnight (endTime <= startTime)', () => {
    const result = computeDurationMinutes('23:00', '01:00');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Cross-midnight');
    }
  });

  it('rejects equal times (zero duration)', () => {
    const result = computeDurationMinutes('10:00', '10:00');
    expect('error' in result).toBe(true);
  });

  it('rejects endTime before startTime', () => {
    const result = computeDurationMinutes('14:00', '13:00');
    expect('error' in result).toBe(true);
  });
});

// ─── Section 17: Event Cost Formulas ────────────────────────────────────────

describe('computeEventCost', () => {
  describe('HOURLY billing', () => {
    it('computes cost = rate × (duration / 60)', () => {
      // 150/hr × 60min = 150
      expect(computeEventCost('HOURLY', 150, 60)).toBe(150);
    });

    it('handles partial hours', () => {
      // 120/hr × 45min = 120 × 0.75 = 90
      expect(computeEventCost('HOURLY', 120, 45)).toBe(90);
    });

    it('handles 90 minutes', () => {
      // 100/hr × 90min = 100 × 1.5 = 150
      expect(computeEventCost('HOURLY', 100, 90)).toBe(150);
    });

    it('zero rate = zero cost', () => {
      expect(computeEventCost('HOURLY', 0, 60)).toBe(0);
    });

    it('zero duration = zero cost', () => {
      expect(computeEventCost('HOURLY', 150, 0)).toBe(0);
    });
  });

  describe('PER_EVENT billing', () => {
    it('cost = effectiveRate regardless of duration', () => {
      expect(computeEventCost('PER_EVENT', 500, 60)).toBe(500);
      expect(computeEventCost('PER_EVENT', 500, 120)).toBe(500);
      expect(computeEventCost('PER_EVENT', 500, 0)).toBe(500);
    });
  });

  describe('MONTHLY_FLAT billing', () => {
    it('cost = effectiveRate (one event per month per OrgRole)', () => {
      expect(computeEventCost('MONTHLY_FLAT', 3000, 0)).toBe(3000);
      expect(computeEventCost('MONTHLY_FLAT', 3000, 60)).toBe(3000);
    });
  });
});

// ─── Section 17: Payslip Aggregation ────────────────────────────────────────

describe('computePayslipItems', () => {
  const makeEvent = (id: string, date: string, status: string, duration: number): EventData => ({
    id,
    date,
    name: `Event ${id}`,
    activityId: 'act1',
    status,
    durationMinutes: duration,
  });

  const makeParticipant = (
    eventId: string,
    rateType: 'HOURLY' | 'PER_EVENT' | 'MONTHLY_FLAT',
    rateValue: number,
    rateOverride?: number | null,
  ): EventParticipantData => ({
    eventId,
    staffMemberId: 'staff1',
    rateSnapshot: { rateType, rateValue },
    rateOverride,
  });

  it('sums HOURLY events correctly', () => {
    const events = new Map<string, EventData>([
      ['e1', makeEvent('e1', '2026-03-10', 'COMPLETED', 60)],
      ['e2', makeEvent('e2', '2026-03-12', 'COMPLETED', 90)],
    ]);
    const participants = [
      makeParticipant('e1', 'HOURLY', 100),
      makeParticipant('e2', 'HOURLY', 100),
    ];

    const result = computePayslipItems(participants, events, '2026-03-01', '2026-03-31');

    // e1: 100 × (60/60) = 100
    // e2: 100 × (90/60) = 150
    expect(result.grandTotal).toBe(250);
    expect(result.items).toHaveLength(2);
  });

  it('mixes rate types correctly', () => {
    const events = new Map<string, EventData>([
      ['e1', makeEvent('e1', '2026-03-10', 'COMPLETED', 60)],
      ['e2', makeEvent('e2', '2026-03-15', 'COMPLETED', 45)],
      ['e3', makeEvent('e3', '2026-03-20', 'COMPLETED', 0)],
    ]);
    const participants = [
      makeParticipant('e1', 'HOURLY', 120),        // 120 × 1 = 120
      makeParticipant('e2', 'PER_EVENT', 200),      // 200
      makeParticipant('e3', 'MONTHLY_FLAT', 3000),  // 3000
    ];

    const result = computePayslipItems(participants, events, '2026-03-01', '2026-03-31');
    expect(result.grandTotal).toBe(3320);
  });

  it('applies rate override', () => {
    const events = new Map<string, EventData>([
      ['e1', makeEvent('e1', '2026-03-10', 'COMPLETED', 60)],
    ]);
    const participants = [
      makeParticipant('e1', 'HOURLY', 100, 200), // override: 200/hr × 1hr = 200
    ];

    const result = computePayslipItems(participants, events, '2026-03-01', '2026-03-31');
    expect(result.grandTotal).toBe(200);
    expect(result.items[0].hasOverride).toBe(true);
    expect(result.items[0].effectiveRate).toBe(200);
  });

  it('zero override = zero cost (volunteer event)', () => {
    const events = new Map<string, EventData>([
      ['e1', makeEvent('e1', '2026-03-10', 'COMPLETED', 60)],
    ]);
    const participants = [
      makeParticipant('e1', 'HOURLY', 100, 0),
    ];

    const result = computePayslipItems(participants, events, '2026-03-01', '2026-03-31');
    expect(result.grandTotal).toBe(0);
    expect(result.items[0].hasOverride).toBe(true);
  });

  it('excludes non-COMPLETED events', () => {
    const events = new Map<string, EventData>([
      ['e1', makeEvent('e1', '2026-03-10', 'COMPLETED', 60)],
      ['e2', makeEvent('e2', '2026-03-12', 'SCHEDULED', 60)],
      ['e3', makeEvent('e3', '2026-03-14', 'CANCELED', 60)],
    ]);
    const participants = [
      makeParticipant('e1', 'HOURLY', 100),
      makeParticipant('e2', 'HOURLY', 100),
      makeParticipant('e3', 'HOURLY', 100),
    ];

    const result = computePayslipItems(participants, events, '2026-03-01', '2026-03-31');
    expect(result.items).toHaveLength(1);
    expect(result.grandTotal).toBe(100);
  });

  it('excludes events outside billing period', () => {
    const events = new Map<string, EventData>([
      ['e1', makeEvent('e1', '2026-02-28', 'COMPLETED', 60)], // before period
      ['e2', makeEvent('e2', '2026-03-15', 'COMPLETED', 60)], // in period
      ['e3', makeEvent('e3', '2026-04-01', 'COMPLETED', 60)], // after period
    ]);
    const participants = [
      makeParticipant('e1', 'HOURLY', 100),
      makeParticipant('e2', 'HOURLY', 100),
      makeParticipant('e3', 'HOURLY', 100),
    ];

    const result = computePayslipItems(participants, events, '2026-03-01', '2026-03-31');
    expect(result.items).toHaveLength(1);
    expect(result.grandTotal).toBe(100);
  });

  it('returns empty for no matching events', () => {
    const result = computePayslipItems([], new Map(), '2026-03-01', '2026-03-31');
    expect(result.items).toHaveLength(0);
    expect(result.grandTotal).toBe(0);
  });

  it('sorts items by date', () => {
    const events = new Map<string, EventData>([
      ['e1', makeEvent('e1', '2026-03-20', 'COMPLETED', 60)],
      ['e2', makeEvent('e2', '2026-03-05', 'COMPLETED', 60)],
      ['e3', makeEvent('e3', '2026-03-12', 'COMPLETED', 60)],
    ]);
    const participants = [
      makeParticipant('e1', 'HOURLY', 100),
      makeParticipant('e2', 'HOURLY', 100),
      makeParticipant('e3', 'HOURLY', 100),
    ];

    const result = computePayslipItems(participants, events, '2026-03-01', '2026-03-31');
    expect(result.items.map(i => i.eventDate)).toEqual(['2026-03-05', '2026-03-12', '2026-03-20']);
  });

  // Manual calculation verification (Section 17 DoD)
  it('manual calculation: teacher with 4 hourly lessons + 1 monthly flat in March', () => {
    const events = new Map<string, EventData>([
      ['e1', makeEvent('e1', '2026-03-03', 'COMPLETED', 60)],  // 1hr
      ['e2', makeEvent('e2', '2026-03-10', 'COMPLETED', 45)],  // 0.75hr
      ['e3', makeEvent('e3', '2026-03-17', 'COMPLETED', 60)],  // 1hr
      ['e4', makeEvent('e4', '2026-03-24', 'COMPLETED', 90)],  // 1.5hr
      ['e5', makeEvent('e5', '2026-03-01', 'COMPLETED', 0)],   // monthly flat
    ]);
    const participants = [
      makeParticipant('e1', 'HOURLY', 200),           // 200 × 1.0  = 200
      makeParticipant('e2', 'HOURLY', 200),           // 200 × 0.75 = 150
      makeParticipant('e3', 'HOURLY', 200),           // 200 × 1.0  = 200
      makeParticipant('e4', 'HOURLY', 200, 250),      // 250 × 1.5  = 375 (override)
      makeParticipant('e5', 'MONTHLY_FLAT', 5000),    // 5000
    ];

    const result = computePayslipItems(participants, events, '2026-03-01', '2026-03-31');

    // Manual: 200 + 150 + 200 + 375 + 5000 = 5925
    expect(result.grandTotal).toBe(5925);
    expect(result.items).toHaveLength(5);

    // Verify individual line items
    const hourlyItems = result.items.filter(i => i.rateType === 'HOURLY');
    expect(hourlyItems).toHaveLength(4);
    expect(hourlyItems.map(i => i.cost).sort((a, b) => a - b)).toEqual([150, 200, 200, 375]);

    const flatItem = result.items.find(i => i.rateType === 'MONTHLY_FLAT')!;
    expect(flatItem.cost).toBe(5000);
  });
});

// ─── Teaching Assignment Date Validation ────────────────────────────────────

describe('validateAssignmentDateRange', () => {
  const assignment = { startDate: '2026-03-01', endDate: '2026-06-30' };

  it('returns null for date within range', () => {
    expect(validateAssignmentDateRange('2026-04-15', assignment)).toBeNull();
  });

  it('returns null for date on start boundary', () => {
    expect(validateAssignmentDateRange('2026-03-01', assignment)).toBeNull();
  });

  it('returns null for date on end boundary', () => {
    expect(validateAssignmentDateRange('2026-06-30', assignment)).toBeNull();
  });

  it('returns before_start for date before assignment starts', () => {
    expect(validateAssignmentDateRange('2026-02-28', assignment)).toBe('before_start');
  });

  it('returns after_end for date after assignment ends', () => {
    expect(validateAssignmentDateRange('2026-07-01', assignment)).toBe('after_end');
  });

  it('returns null for open-ended assignment (no endDate)', () => {
    const openEnded = { startDate: '2026-01-01' };
    expect(validateAssignmentDateRange('2026-12-31', openEnded)).toBeNull();
  });
});

// ─── Filter Active Assignments ──────────────────────────────────────────────

describe('filterActiveAssignments', () => {
  const assignments = [
    { id: 'a1', startDate: '2026-01-01', endDate: '2026-06-30', isArchived: false },
    { id: 'a2', startDate: '2026-01-01', endDate: '2026-03-31', isArchived: false },
    { id: 'a3', startDate: '2026-07-01', endDate: '2026-12-31', isArchived: false },
    { id: 'a4', startDate: '2026-01-01', endDate: '2026-12-31', isArchived: true },
    { id: 'a5', startDate: '2026-01-01', isArchived: false }, // open-ended
  ];

  it('returns assignments active on given date', () => {
    const active = filterActiveAssignments(assignments, '2026-04-15');
    const ids = active.map(a => a.id);
    expect(ids).toContain('a1');
    expect(ids).toContain('a5');
    expect(ids).not.toContain('a2'); // ended March 31
    expect(ids).not.toContain('a3'); // starts July 1
    expect(ids).not.toContain('a4'); // archived
  });

  it('excludes archived assignments', () => {
    const active = filterActiveAssignments(assignments, '2026-06-15');
    expect(active.every(a => !a.isArchived)).toBe(true);
  });

  it('includes open-ended assignments', () => {
    const active = filterActiveAssignments(assignments, '2099-12-31');
    expect(active.map(a => a.id)).toContain('a5');
  });
});
