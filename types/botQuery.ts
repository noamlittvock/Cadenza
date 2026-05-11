/**
 * Cozy Bee — types for the natural-language Q&A bot.
 *
 * The QueryIntent below is the contract that prevents the LLM from inventing
 * facts: it can only translate language → structured intent. The data layer
 * answers the intent deterministically.
 */

import type { EventStatus } from './v2';

export type BotIntent =
  | 'lookup_schedule'   // "when does X teach?"
  | 'find_free_room'    // "which rooms are free at 3pm?"
  | 'who_is_where'      // "who's in Room A right now?"
  | 'count_events'      // "how many lessons does X have this week?"
  | 'next_event'        // "when is X's next lesson?"
  | 'who_teaches'       // "who teaches Activity Y?"
  | 'list_for_day'      // "what's on Friday?"
  | 'check_conflicts'   // "any double-bookings in Room B today?"
  | 'unknown';

export type RelativeTimeHint =
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'next_week'
  | 'this_month';

export interface QueryIntent {
  intent: BotIntent;
  entityRefs: {
    teacherName?: string;
    studentName?: string;
    roomName?: string;
    activityName?: string;
  };
  timeRange?: {
    start?: string;        // ISO date (YYYY-MM-DD) or full ISO datetime
    end?: string;          // ISO date or full ISO datetime
    relativeHint?: RelativeTimeHint;
    timeOfDay?: string;    // HH:MM (24h) — used by find_free_room / who_is_where
  };
  filters?: {
    status?: EventStatus[];
    dayOfWeek?: number[];  // 0..6 (Sun..Sat)
  };
}

/**
 * Resolution layer: the strings on QueryIntent.entityRefs are mapped to
 * canonical IDs against currently-loaded org data. A missing match becomes
 * a `nameNotFound` error rather than a silent miss.
 */
export interface ResolvedRefs {
  teacherId?: string;
  teacherFullName?: string;
  studentId?: string;
  studentFullName?: string;
  roomId?: string;
  roomName?: string;
  activityId?: string;
  activityName?: string;
  unresolved?: Array<'teacher' | 'student' | 'room' | 'activity'>;
}

export type QueryResultKind =
  | 'event_list'
  | 'room_availability'
  | 'count'
  | 'single_event'
  | 'people_list'
  | 'conflict_list'
  | 'no_results'
  | 'name_not_found'
  | 'unsupported'
  | 'error';

/** A lightweight event projection sent to the wrap LLM — just what it needs. */
export interface EventSummary {
  id: string;
  name: string;
  start: string;
  end: string;
  teacherName?: string;
  roomName?: string;
  activityName?: string;
}

export interface RoomAvailability {
  roomId: string;
  roomName: string;
  isFree: boolean;
  conflictingEventName?: string;
}

export interface ConflictSummary {
  roomName: string;
  startsAt: string;
  endsAt: string;
  eventNames: string[];
}

export interface QueryResult {
  kind: QueryResultKind;
  /** Human-readable hint about the time window (e.g. "this week" → "Mar 9–15") */
  windowLabel?: string;
  events?: EventSummary[];
  rooms?: RoomAvailability[];
  count?: number;
  people?: Array<{ id: string; name: string }>;
  conflicts?: ConflictSummary[];
  /** When kind === 'name_not_found', which entity type was missing */
  missingEntity?: 'teacher' | 'student' | 'room' | 'activity';
  /** Plain-English error context for the wrap step (never user-facing directly) */
  message?: string;
}

export interface BotTurn {
  id: string;
  /** ISO datetime when the question was sent */
  askedAt: string;
  question: string;
  answer?: string;
  /** What the distill step parsed the question as */
  intent?: QueryIntent;
  /** Result of the deterministic execute step */
  result?: QueryResult;
  /** Stage the turn is currently in (drives loading copy in the UI) */
  stage: 'distilling' | 'resolving' | 'executing' | 'wrapping' | 'done' | 'error';
  /** When stage === 'error', a translatable key to render */
  errorKey?: string;
}
