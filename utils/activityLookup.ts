import type { ActivityV2 } from '../types/v2';

/**
 * Build a Map<activityId, ActivityV2> for O(1) lookups.
 * Consumers should call this once (usually in useMemo) rather than
 * doing .find() per event/row.
 */
export function buildActivityMap(activities: ActivityV2[]): Map<string, ActivityV2> {
  return new Map(activities.map(a => [a.id, a]));
}

/**
 * Resolve an activity name from the map with a fallback.
 * Handles undefined/null IDs gracefully.
 */
export function getActivityName(
  map: Map<string, ActivityV2>,
  id: string | undefined | null,
  fallback = 'Unclassified',
): string {
  if (!id) return fallback;
  return map.get(id)?.name ?? fallback;
}
