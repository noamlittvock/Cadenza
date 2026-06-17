/**
 * Cozy Bee — client orchestrator.
 *
 *   askBot(question, locale, ctx, onStage) →
 *     [1. distill]    Cloud Function → QueryIntent
 *     [2. resolve]    in-browser fuzzy match → ResolvedRefs
 *     [3. execute]    in-browser deterministic ops → QueryResult
 *     [4. wrap]       Cloud Function → natural-language answer
 *
 * Each stage emits onStage so the UI can show fine-grained loading copy
 * ("thinking…" → "looking up…" → "answering…").
 */

import { getSupabase } from './supabaseClient';
import type { ExecuteContext } from './botExecute';
import type { QueryIntent, QueryResult, ResolvedRefs, BotTurn } from '../types/botQuery';
import { resolveIntent } from './botResolve';
import { executeIntent } from './botExecute';

type Stage = BotTurn['stage'];

export interface AskBotResult {
  intent: QueryIntent;
  refs: ResolvedRefs;
  result: QueryResult;
  answer: string;
}

interface DistillResponse { intent: QueryIntent; }
interface WrapResponse { answer: string; }

function inferTime(question: string): QueryIntent['timeRange'] {
  const q = question.toLowerCase();
  if (q.includes('tomorrow')) return { relativeHint: 'tomorrow' };
  if (q.includes('next week')) return { relativeHint: 'next_week' };
  if (q.includes('week')) return { relativeHint: 'this_week' };
  if (q.includes('month')) return { relativeHint: 'this_month' };
  const time = q.match(/\b([01]?\d|2[0-3])(?::([0-5]\d))?\b/);
  return { relativeHint: 'today', timeOfDay: time ? `${time[1].padStart(2, '0')}:${time[2] ?? '00'}` : undefined };
}

function fallbackDistill(question: string): QueryIntent {
  const q = question.toLowerCase();
  const intent: QueryIntent['intent'] =
    q.includes('free') && q.includes('room') ? 'find_free_room' :
    q.includes('conflict') || q.includes('double') ? 'check_conflicts' :
    q.includes('how many') || q.includes('count') ? 'count_events' :
    q.includes('next') ? 'next_event' :
    q.includes('who teaches') ? 'who_teaches' :
    q.includes('what') && (q.includes('today') || q.includes('tomorrow') || q.includes('friday')) ? 'list_for_day' :
    q.includes('schedule') || q.includes('teach') ? 'lookup_schedule' :
    'unknown';
  return { intent, entityRefs: {}, timeRange: inferTime(question) };
}

function fallbackWrap(result: QueryResult): string {
  if (result.kind === 'name_not_found') return `I could not find that ${result.missingEntity}.`;
  if (result.kind === 'no_results') return result.message || 'I did not find anything for that request.';
  if (result.kind === 'count') return `${result.count ?? 0} event${result.count === 1 ? '' : 's'}${result.windowLabel ? ` in ${result.windowLabel}` : ''}.`;
  if (result.kind === 'room_availability') {
    const free = (result.rooms || []).filter(r => r.isFree).map(r => r.roomName);
    return free.length ? `Free rooms: ${free.join(', ')}.` : 'No rooms are free for that time.';
  }
  if (result.kind === 'people_list') {
    const names = (result.people || []).map(p => p.name);
    return names.length ? names.join(', ') : 'No matching people found.';
  }
  if (result.events?.length) {
    return result.events.map(e => `${e.name} (${new Date(e.start).toLocaleString()})`).join('\n');
  }
  if (result.conflicts?.length) {
    return result.conflicts.map(c => `${c.roomName}: ${c.eventNames.join(', ')}`).join('\n');
  }
  return result.message || 'I can answer schedule, room, conflict, and staff questions from loaded Cadenza data.';
}

async function invokeDistill(question: string): Promise<QueryIntent> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.functions.invoke<DistillResponse>('bot-distill', { body: { question } });
      if (!error && data?.intent) return data.intent;
    } catch (err) {
      console.warn('[botClient] bot-distill edge function unavailable; using local fallback.', err);
    }
  }
  return fallbackDistill(question);
}

async function invokeWrap(question: string, intent: QueryIntent, result: QueryResult, locale: string): Promise<string> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.functions.invoke<WrapResponse>('bot-wrap', {
        body: { question, intent, result, lang: locale },
      });
      if (!error && data?.answer) return data.answer;
    } catch (err) {
      console.warn('[botClient] bot-wrap edge function unavailable; using local fallback.', err);
    }
  }
  return fallbackWrap(result);
}

/**
 * Run the full pipeline for a single question. The caller passes the same
 * teachers/rooms/students/activities/events arrays the rest of the app
 * already has — we don't fetch anything ourselves.
 */
export async function askBot(
  question: string,
  locale: string,
  ctx: Omit<ExecuteContext, 'now'>,
  onStage?: (stage: Stage) => void,
): Promise<AskBotResult> {
  // Stage 1: distill
  onStage?.('distilling');
  const intent = await invokeDistill(question);
  if (!intent || typeof intent !== 'object' || !('intent' in intent)) {
    throw new Error('bot.error_distill_invalid');
  }

  // Stage 2: resolve
  onStage?.('resolving');
  const refs = resolveIntent(intent, ctx);

  // Stage 3: execute
  onStage?.('executing');
  const result = executeIntent(intent, refs, { ...ctx, now: new Date() });

  // Stage 4: wrap
  onStage?.('wrapping');
  const answer = await invokeWrap(question, intent, result, locale);
  if (!answer) throw new Error('bot.error_wrap_empty');

  onStage?.('done');
  return { intent, refs, result, answer };
}
