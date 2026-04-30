/**
 * Teaching-assignment scope helpers.
 *
 * Assignments can bind at three levels: ACTIVITY, L1, or L2.
 * Vertical overlap (ancestor ↔ descendant in the same Activity branch with
 * overlapping date ranges) is forbidden. Sibling assignments coexist freely.
 */

import type { TeachingAssignmentV2, AssignmentScope, L2Subcategory } from '../types/v2';

const FAR_FUTURE = '9999-12-31';

function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const aE = aEnd ?? FAR_FUTURE;
  const bE = bEnd ?? FAR_FUTURE;
  return aStart <= bE && bStart <= aE;
}

/**
 * Returns the L1 ancestor of a given L2, or null if the L2 has no L1 parent.
 */
function l1OfL2(l2Id: string, l2s: L2Subcategory[]): string | null {
  return l2s.find(l => l.id === l2Id)?.l1Id ?? null;
}

/**
 * True if `a` is a vertical ancestor or descendant of `b` (or identical scope).
 * Both assignments are assumed to share the same `staffMemberId` and `activityId`.
 */
function isVerticallyNested(
  a: { scope: AssignmentScope; l1Id: string | null; l2Id: string | null },
  b: { scope: AssignmentScope; l1Id: string | null; l2Id: string | null },
  l2s: L2Subcategory[],
): boolean {
  // Activity-scope contains everything below it under this activity
  if (a.scope === 'ACTIVITY' || b.scope === 'ACTIVITY') return true;

  // Resolve effective L1 for each: explicit l1Id, or l1Id of the L2's parent
  const aL1 = a.scope === 'L1' ? a.l1Id : (a.l2Id ? l1OfL2(a.l2Id, l2s) : null);
  const bL1 = b.scope === 'L1' ? b.l1Id : (b.l2Id ? l1OfL2(b.l2Id, l2s) : null);

  // L1 vs L1: nested only if same L1 (which is identical scope, treat as overlap)
  if (a.scope === 'L1' && b.scope === 'L1') return aL1 === bL1;

  // L1 vs L2: nested only if the L2's L1 parent matches the L1
  if (a.scope === 'L1' && b.scope === 'L2') return aL1 != null && aL1 === bL1;
  if (b.scope === 'L1' && a.scope === 'L2') return bL1 != null && bL1 === aL1;

  // L2 vs L2: only identical L2 ids count as nested (siblings coexist)
  if (a.scope === 'L2' && b.scope === 'L2') return a.l2Id === b.l2Id;

  return false;
}

export interface OverlapConflict {
  conflicting: TeachingAssignmentV2;
}

/**
 * Find any existing active assignment that vertically conflicts with the
 * candidate assignment (same staff, same activity, vertically nested, dates overlap).
 *
 * Pass `excludeId` when editing an existing assignment so it doesn't conflict
 * with itself.
 */
export function findOverlapConflict(
  candidate: {
    staffMemberId: string;
    activityId: string;
    scope: AssignmentScope;
    l1Id: string | null;
    l2Id: string | null;
    startDate: string;
    endDate: string | null;
  },
  existing: TeachingAssignmentV2[],
  l2s: L2Subcategory[],
  excludeId?: string,
): OverlapConflict | null {
  for (const a of existing) {
    if (a.isArchived) continue;
    if (excludeId && a.id === excludeId) continue;
    if (a.staffMemberId !== candidate.staffMemberId) continue;
    if (a.activityId !== candidate.activityId) continue;
    if (!isVerticallyNested(a, candidate, l2s)) continue;
    if (!rangesOverlap(a.startDate, a.endDate, candidate.startDate, candidate.endDate)) continue;
    return { conflicting: a };
  }
  return null;
}

/**
 * True if a teaching assignment grants eligibility for an event tagged at the
 * given (activityId, l1Id, l2Id) — ancestor-chain match.
 */
export function assignmentCoversEvent(
  a: TeachingAssignmentV2,
  evt: { activityId: string; l1Id: string | null; l2Id: string | null },
  l2s: L2Subcategory[],
): boolean {
  if (a.isArchived) return false;
  if (a.activityId !== evt.activityId) return false;
  if (a.scope === 'ACTIVITY') return true;

  const evtL1 = evt.l1Id ?? (evt.l2Id ? l1OfL2(evt.l2Id, l2s) : null);

  if (a.scope === 'L1') {
    return a.l1Id != null && a.l1Id === evtL1;
  }
  // L2 scope: must match exactly
  return a.l2Id != null && a.l2Id === evt.l2Id;
}

/**
 * Backfill missing scope fields for legacy assignments. Existing v2 records
 * have only `(activityId, l2Id)` — treat them as L2-scope.
 */
export function migrateLegacyAssignment(a: TeachingAssignmentV2): TeachingAssignmentV2 {
  if (a.scope) return a;
  return {
    ...a,
    scope: 'L2',
    l1Id: a.l1Id ?? null,
    l2Id: a.l2Id ?? null,
  };
}
