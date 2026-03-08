/**
 * financialLogic.ts — Pure financial calculation functions
 *
 * Extracted from cloud functions (generatePayslip, resolveRate, computeDuration)
 * for testability. Section 17: Financial Logic Register.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type RateType = 'HOURLY' | 'PER_EVENT' | 'MONTHLY_FLAT';

export interface RateSnapshot {
  rateType: RateType;
  rateValue: number;
}

export interface EventParticipantData {
  eventId: string;
  staffMemberId: string;
  rateSnapshot: RateSnapshot;
  rateOverride?: number | null;
}

export interface EventData {
  id: string;
  date: string;           // YYYY-MM-DD
  name: string;
  activityId: string;
  status: string;         // 'SCHEDULED' | 'COMPLETED' | 'CANCELED'
  durationMinutes: number;
}

export interface PayslipLineItem {
  eventId: string;
  eventDate: string;
  rateType: RateType;
  rateValue: number;
  effectiveRate: number;
  hasOverride: boolean;
  durationMinutes: number;
  cost: number;
}

// ─── Rate Resolution ────────────────────────────────────────────────────────

/**
 * Section 17: Standard rate resolution
 * effectiveRate = rateOverride ?? rateSnapshot.rateValue
 * Policy: Snapshot on event creation — immutable thereafter.
 */
export function resolveEffectiveRate(
  rateSnapshot: RateSnapshot,
  rateOverride?: number | null,
): number {
  return rateOverride != null ? rateOverride : rateSnapshot.rateValue;
}

// ─── Duration Computation ───────────────────────────────────────────────────

/**
 * Section 17: durationMinutes computation
 * durationMinutes = endTime − startTime (in minutes)
 * Validates HH:MM format and rejects cross-midnight / zero-duration events.
 */
export function computeDurationMinutes(
  startTime: string,
  endTime: string,
): { durationMinutes: number } | { error: string } {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return { error: 'startTime and endTime must be in HH:MM format.' };
  }

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (endMinutes <= startMinutes) {
    return { error: 'End time must be later than start time. Cross-midnight events are not supported.' };
  }

  return { durationMinutes: endMinutes - startMinutes };
}

// ─── Event Cost Calculation ─────────────────────────────────────────────────

/**
 * Section 17: Compute cost for a single event participant.
 * - HOURLY:       effectiveRate × (durationMinutes / 60)
 * - PER_EVENT:    effectiveRate
 * - MONTHLY_FLAT: effectiveRate
 */
export function computeEventCost(
  rateType: RateType,
  effectiveRate: number,
  durationMinutes: number,
): number {
  switch (rateType) {
    case 'HOURLY':
      return effectiveRate * (durationMinutes / 60);
    case 'PER_EVENT':
      return effectiveRate;
    case 'MONTHLY_FLAT':
      return effectiveRate;
  }
}

// ─── Payslip Aggregation ────────────────────────────────────────────────────

/**
 * Section 17: Payslip total
 * payslipTotal = SUM of eventCost for all EventParticipant records
 *   where staffMemberId = X, event.date within billingPeriod, event.status = COMPLETED
 * Policy: Recalculate on demand — not stored.
 */
export function computePayslipItems(
  participants: EventParticipantData[],
  events: Map<string, EventData>,
  periodStart: string,
  periodEnd: string,
): { items: PayslipLineItem[]; grandTotal: number } {
  const items: PayslipLineItem[] = [];
  let grandTotal = 0;

  for (const p of participants) {
    const event = events.get(p.eventId);
    if (!event) continue;

    // Only COMPLETED events
    if (event.status !== 'COMPLETED') continue;

    // Date within billing period
    if (event.date < periodStart || event.date > periodEnd) continue;

    if (!p.rateSnapshot) continue;

    const effectiveRate = resolveEffectiveRate(p.rateSnapshot, p.rateOverride);
    const hasOverride = p.rateOverride != null;
    const cost = computeEventCost(p.rateSnapshot.rateType, effectiveRate, event.durationMinutes);

    grandTotal += cost;
    items.push({
      eventId: event.id,
      eventDate: event.date,
      rateType: p.rateSnapshot.rateType,
      rateValue: p.rateSnapshot.rateValue,
      effectiveRate,
      hasOverride,
      durationMinutes: event.durationMinutes,
      cost,
    });
  }

  // Sort by date then event ID
  items.sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.eventId.localeCompare(b.eventId));

  return { items, grandTotal };
}

// ─── Teaching Assignment Date Validation ────────────────────────────────────

export interface DateRange {
  startDate: string;  // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD or undefined for open-ended
}

/**
 * Check if an event date falls within a teaching assignment's date range.
 * Returns null if valid, or an error key if invalid.
 */
export function validateAssignmentDateRange(
  eventDate: string,
  assignment: DateRange,
): null | 'before_start' | 'after_end' {
  if (eventDate < assignment.startDate) return 'before_start';
  if (assignment.endDate && eventDate > assignment.endDate) return 'after_end';
  return null;
}

/**
 * Filter assignments active on a given date (non-archived, date range check).
 */
export function filterActiveAssignments<T extends DateRange & { isArchived?: boolean }>(
  assignments: T[],
  eventDate: string,
): T[] {
  return assignments.filter(a => {
    if (a.isArchived) return false;
    if (a.startDate > eventDate) return false;
    if (a.endDate && a.endDate < eventDate) return false;
    return true;
  });
}
