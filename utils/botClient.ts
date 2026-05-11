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

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import type { ExecuteContext } from './botExecute';
import type { QueryIntent, QueryResult, ResolvedRefs, BotTurn } from '../types/botQuery';
import { resolveIntent } from './botResolve';
import { executeIntent } from './botExecute';

const FUNCTIONS_REGION = 'us-central1';

type Stage = BotTurn['stage'];

export interface AskBotResult {
  intent: QueryIntent;
  refs: ResolvedRefs;
  result: QueryResult;
  answer: string;
}

interface DistillResponse { intent: QueryIntent; }
interface WrapResponse { answer: string; }

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
  const fns = getFunctions(getApp(), FUNCTIONS_REGION);
  const distill = httpsCallable<{ question: string }, DistillResponse>(fns, 'botDistill');
  const wrap = httpsCallable<
    { question: string; intent: QueryIntent; result: QueryResult; lang: string },
    WrapResponse
  >(fns, 'botWrap');

  // Stage 1: distill
  onStage?.('distilling');
  const distillRes = await distill({ question });
  const intent = distillRes.data?.intent;
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
  const wrapRes = await wrap({ question, intent, result, lang: locale });
  const answer = wrapRes.data?.answer || '';
  if (!answer) throw new Error('bot.error_wrap_empty');

  onStage?.('done');
  return { intent, refs, result, answer };
}
