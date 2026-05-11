import {
  CalendarFilterState,
  DEFAULT_FILTER_STATE,
  EVENT_STATUSES,
  ACTIVITY_TYPES,
  ACTIVITY_TEMPLATES,
  ASSIGNMENT_TYPES,
  STAFF_ROLES,
  isStatusDefault,
} from '../types/calendarFilters';

// Keys whose value is a string[] in CalendarFilterState — both enum-bounded and free-form.
const ARRAY_KEYS = [
  'status', 'activityType', 'template', 'activityId', 'l1Id', 'l2Id',
  'staffMemberId', 'assignmentType', 'staffRole', 'studentId', 'studentTag', 'eventTag', 'location',
] as const satisfies readonly (keyof CalendarFilterState)[];

// Map of enum-bounded array keys to their canonical allowlists. Anything not listed here
// is treated as free-form (id / tag / location strings).
const ENUM_ALLOWLISTS: Partial<Record<typeof ARRAY_KEYS[number], readonly string[]>> = {
  status: EVENT_STATUSES,
  activityType: ACTIVITY_TYPES,
  template: ACTIVITY_TEMPLATES,
  assignmentType: ASSIGNMENT_TYPES,
  staffRole: STAFF_ROLES,
};

function sanitizeArray(key: typeof ARRAY_KEYS[number], raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowlist = ENUM_ALLOWLISTS[key];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    if (allowlist && !allowlist.includes(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Encode only non-default dimensions into a compact JSON string. */
export function serializeFilters(state: CalendarFilterState): string | null {
  const out: Record<string, unknown> = {};

  if (!isStatusDefault(state.status)) out.status = state.status;
  if (state.search) out.search = state.search;
  if (state.recurrence !== 'ALL') out.recurrence = state.recurrence;

  for (const key of ARRAY_KEYS) {
    if (key === 'status') continue;
    const val = state[key] as string[];
    if (val.length > 0) out[key] = val;
  }

  if (state.hasRoomConflict) out.hasRoomConflict = true;
  if (state.hasValidationError) out.hasValidationError = true;

  if (Object.keys(out).length === 0) return null;
  return JSON.stringify(out);
}

/** Decode a serialized filter object (already JSON-parsed) into a validated CalendarFilterState. */
export function fromParsedObject(parsed: Record<string, unknown>): CalendarFilterState {
  const state: CalendarFilterState = { ...DEFAULT_FILTER_STATE };

  for (const key of ARRAY_KEYS) {
    const cleaned = sanitizeArray(key, parsed[key]);
    if (key === 'status') {
      // Empty status from URL means "all" → keep defaults; non-empty replaces.
      if (cleaned.length > 0) state.status = cleaned as CalendarFilterState['status'];
    } else {
      (state[key] as string[]) = cleaned;
    }
  }

  if (typeof parsed.search === 'string') state.search = parsed.search;
  if (parsed.recurrence === 'RECURRING' || parsed.recurrence === 'ONE_OFF') state.recurrence = parsed.recurrence;
  if (parsed.hasRoomConflict === true) state.hasRoomConflict = true;
  if (parsed.hasValidationError === true) state.hasValidationError = true;

  return state;
}

/** Decode a serialized filter string back to CalendarFilterState. Returns defaults on parse error. */
export function parseFilters(raw: string): CalendarFilterState {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_FILTER_STATE };
    }
    return fromParsedObject(parsed as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_FILTER_STATE };
  }
}
