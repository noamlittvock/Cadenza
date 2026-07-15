/**
 * Cozy Bee — entity resolution.
 *
 * Maps free-text names from the distill step (e.g. "David", "Studio A",
 * "Piano") to canonical IDs against the data already loaded in the app.
 * Pure function, deterministic, no LLM. Returns `unresolved` markers when
 * a name appears in the intent but no candidate is good enough — the
 * orchestrator surfaces this to the user as "I didn't find …" rather than
 * letting the bot guess.
 */

import type { Teacher, Room, Student } from '../types';
import type { ActivityV2 } from '../types/v2';
import type { QueryIntent, ResolvedRefs } from '../types/botQuery';

const MIN_SCORE = 0.45;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Score a free-text query against a candidate name.
 *
 * Returns 0..1 where:
 *   1.0 = exact match (post-normalize)
 *   0.9 = candidate starts with the query (or vice versa)
 *   0.7 = any whole-word in the candidate matches a query token
 *   0.55 = candidate substring contains the query
 *   <MIN_SCORE = no usable signal
 *
 * Hand-rolled rather than fuzzy-search lib — Cadenza has small lists
 * (dozens, not thousands), and we need explicit control over what counts
 * as a match so the bot doesn't confidently resolve "Sara" to "Saraj".
 */
function scoreName(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.startsWith(q) || q.startsWith(c)) return 0.9;
  const qTokens = q.split(' ').filter(Boolean);
  const cTokens = c.split(' ').filter(Boolean);
  // Token-level whole-word match (e.g. query "David" → candidate "David Levi")
  if (qTokens.some(qt => cTokens.includes(qt))) return 0.7;
  if (c.includes(q)) return 0.55;
  return 0;
}

interface BestMatch<T> {
  item: T;
  score: number;
}

function bestMatch<T>(query: string, items: T[], nameOf: (item: T) => string): BestMatch<T> | null {
  let best: BestMatch<T> | null = null;
  let tied = false;
  for (const item of items) {
    const s = scoreName(query, nameOf(item));
    if (s >= MIN_SCORE && (!best || s > best.score)) {
      best = { item, score: s };
      tied = false;
    } else if (best && s === best.score) {
      tied = true;
    }
  }
  return tied ? null : best;
}

export interface ResolveContext {
  teachers: Teacher[];
  rooms: Room[];
  students: Student[];
  activities: ActivityV2[];
}

/**
 * Resolve every free-text entity mentioned in the intent. Names that don't
 * meet MIN_SCORE are recorded in `unresolved` so the executor / wrap step
 * can produce a "I didn't find X" answer instead of pretending it found
 * something.
 */
export function resolveIntent(intent: QueryIntent, ctx: ResolveContext): ResolvedRefs {
  const refs: ResolvedRefs = {};
  const unresolved: NonNullable<ResolvedRefs['unresolved']> = [];

  if (intent.entityRefs.teacherName) {
    const m = bestMatch(intent.entityRefs.teacherName, ctx.teachers.filter(t => !t.isArchived), t => t.fullName);
    if (m) {
      refs.teacherId = m.item.id;
      refs.teacherFullName = m.item.fullName;
    } else {
      unresolved.push('teacher');
    }
  }

  if (intent.entityRefs.studentName) {
    const m = bestMatch(intent.entityRefs.studentName, ctx.students, s => s.fullName);
    if (m) {
      refs.studentId = m.item.id;
      refs.studentFullName = m.item.fullName;
    } else {
      unresolved.push('student');
    }
  }

  if (intent.entityRefs.roomName) {
    const m = bestMatch(intent.entityRefs.roomName, ctx.rooms.filter(r => !r.isArchived), r => r.name);
    if (m) {
      refs.roomId = m.item.id;
      refs.roomName = m.item.name;
    } else {
      unresolved.push('room');
    }
  }

  if (intent.entityRefs.activityName) {
    const m = bestMatch(intent.entityRefs.activityName, ctx.activities.filter(a => !a.isArchived), a => a.name);
    if (m) {
      refs.activityId = m.item.id;
      refs.activityName = m.item.name;
    } else {
      unresolved.push('activity');
    }
  }

  if (unresolved.length > 0) refs.unresolved = unresolved;
  return refs;
}
