/**
 * Cozy Bee — chat state hook.
 *
 * Single-turn / stateless across page reloads is the v1 contract — no
 * conversation memory is sent to the LLM. We keep an in-memory turn list
 * for display only, so the user can see the last few Q→A pairs in the
 * panel without reconstructing them.
 */

import { useCallback, useState } from 'react';
import { askBot } from '../utils/botClient';
import type { BotTurn } from '../types/botQuery';
import type { ExecuteContext } from '../utils/botExecute';

interface UseBotChatArgs {
  locale: string;
  ctx: Omit<ExecuteContext, 'now'>;
}

interface UseBotChatReturn {
  turns: BotTurn[];
  pending: boolean;
  ask: (question: string) => Promise<void>;
  clear: () => void;
}

let turnSeq = 0;

export function useBotChat({ locale, ctx }: UseBotChatArgs): UseBotChatReturn {
  const [turns, setTurns] = useState<BotTurn[]>([]);
  const [pending, setPending] = useState(false);

  const updateTurn = useCallback((id: string, patch: Partial<BotTurn>) => {
    setTurns(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    const id = `t${++turnSeq}-${Date.now()}`;
    const turn: BotTurn = {
      id,
      question: trimmed,
      askedAt: new Date().toISOString(),
      stage: 'distilling',
    };
    setTurns(prev => [...prev, turn]);
    setPending(true);
    try {
      const out = await askBot(trimmed, locale, ctx, stage => updateTurn(id, { stage }));
      updateTurn(id, { stage: 'done', intent: out.intent, result: out.result, answer: out.answer });
    } catch (err) {
      console.error('[bot] ask failed', err);
      const errorKey = err instanceof Error && err.message.startsWith('bot.')
        ? err.message
        : 'bot.error_generic';
      updateTurn(id, { stage: 'error', errorKey });
    } finally {
      setPending(false);
    }
  }, [ctx, locale, pending, updateTurn]);

  const clear = useCallback(() => setTurns([]), []);

  return { turns, pending, ask, clear };
}
