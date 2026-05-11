/**
 * Hand-authored eval set for the Cozy Bee distill step.
 *
 * Each fixture pairs a natural-language question with the QueryIntent the
 * distill LLM should produce. These serve two purposes:
 *   1. Few-shot examples in the distill system instruction.
 *   2. Test fixtures for utils/botExecute.ts (the deterministic core),
 *      paired with synthetic data in utils/botExecute.test.ts.
 *
 * Keep this list small and varied — quality over quantity. We tune the
 * distill prompt until ≥9/10 reproduce the expected intent shape.
 */

import type { QueryIntent } from '../types/botQuery';

export interface DistillFixture {
  /** Stable id used in test names and eval reports. */
  id: string;
  question: string;
  expected: QueryIntent;
  /** One-liner that explains why this fixture is in the set. */
  rationale: string;
}

export const BOT_DISTILL_FIXTURES: DistillFixture[] = [
  {
    id: 'lookup_schedule_basic',
    question: 'What does Sarah Cohen teach on Tuesday?',
    expected: {
      intent: 'lookup_schedule',
      entityRefs: { teacherName: 'Sarah Cohen' },
      filters: { dayOfWeek: [2] },
    },
    rationale: 'Day-of-week filter + named teacher — the canonical "schedule for X" lookup.',
  },
  {
    id: 'find_free_room_at_time',
    question: 'Which rooms are free Friday at 4pm?',
    expected: {
      intent: 'find_free_room',
      entityRefs: {},
      timeRange: { relativeHint: 'this_week', timeOfDay: '16:00' },
      filters: { dayOfWeek: [5] },
    },
    rationale: 'Combines a day filter and a time-of-day for the availability scan.',
  },
  {
    id: 'who_is_where_now',
    question: "Who's in Studio A right now?",
    expected: {
      intent: 'who_is_where',
      entityRefs: { roomName: 'Studio A' },
      timeRange: { relativeHint: 'today' },
    },
    rationale: '"Right now" → today + execute uses real time. Tests timeOfDay omission.',
  },
  {
    id: 'count_events_this_week',
    question: 'How many lessons does David Levi have this week?',
    expected: {
      intent: 'count_events',
      entityRefs: { teacherName: 'David Levi' },
      timeRange: { relativeHint: 'this_week' },
    },
    rationale: 'Aggregation intent with relative window — most common "load" question.',
  },
  {
    id: 'next_event_for_teacher',
    question: "When is David's next lesson?",
    expected: {
      intent: 'next_event',
      entityRefs: { teacherName: 'David' },
    },
    rationale: 'No timeRange — execute uses now() forward. First-name only tests fuzzy resolve.',
  },
  {
    id: 'who_teaches_activity',
    question: 'Who teaches Piano?',
    expected: {
      intent: 'who_teaches',
      entityRefs: { activityName: 'Piano' },
    },
    rationale: 'Activity → list of staff. Tests activity resolution path.',
  },
  {
    id: 'list_for_day_tomorrow',
    question: "What's on the schedule tomorrow?",
    expected: {
      intent: 'list_for_day',
      entityRefs: {},
      timeRange: { relativeHint: 'tomorrow' },
    },
    rationale: 'Wide-open "show me" query — no entity, just a day.',
  },
  {
    id: 'check_conflicts_room_today',
    question: 'Any double-bookings in Room B today?',
    expected: {
      intent: 'check_conflicts',
      entityRefs: { roomName: 'Room B' },
      timeRange: { relativeHint: 'today' },
    },
    rationale: 'Conflict-detection with a room scope.',
  },
  {
    id: 'unknown_pronoun',
    question: 'What about her?',
    expected: {
      intent: 'unknown',
      entityRefs: {},
    },
    rationale: 'No resolvable entity — must classify as unknown, not guess.',
  },
  {
    id: 'unsupported_mutation',
    question: 'Cancel all events tomorrow.',
    expected: {
      intent: 'unknown',
      entityRefs: {},
    },
    rationale: 'Mutation request must be rejected at distill time, not silently mis-classified.',
  },
];
