/**
 * Cozy Bee — chat content for the calendar sidebar.
 *
 * No floating launcher, no overlay, no slide-over. This is the panel body
 * that mounts as the fourth tab inside the existing calendar sidebar
 * (Filters / Power Tools / Gantt / Bot). The sidebar wrapper handles the
 * slide animation and width — we just fill it.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, Trash2 } from 'lucide-react';
// Note: useRef is still used for listRef; useEffect for scroll-on-update.
import type { Teacher, Room, Student, CalendarEvent } from '../types';
import type { ActivityV2 } from '../types/v2';
import { useBotChat } from '../hooks/useBotChat';
import type { BotTurn } from '../types/botQuery';

interface BotChatPanelProps {
  active: boolean;
  locale: string;
  t: (key: string) => string;
  teachers: Teacher[];
  rooms: Room[];
  students: Student[];
  activities: ActivityV2[];
  events: CalendarEvent[];
}

const STAGE_LABEL_KEY: Record<BotTurn['stage'], string> = {
  distilling: 'bot.stage.thinking',
  resolving: 'bot.stage.looking_up',
  executing: 'bot.stage.computing',
  wrapping: 'bot.stage.answering',
  done: 'bot.stage.done',
  error: 'bot.stage.error',
};

export const BotChatPanel: React.FC<BotChatPanelProps> = ({
  active,
  locale,
  t,
  teachers,
  rooms,
  students,
  activities,
  events,
}) => {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const ctx = useMemo(
    () => ({ teachers, rooms, students, activities, events }),
    [teachers, rooms, students, activities, events],
  );

  const { turns, pending, ask, clear } = useBotChat({ locale, ctx });

  // Keep the latest message visible.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [turns]);

  // No auto-focus on mount — the parent sidebar is mid-slide when this
  // component mounts, and calling .focus() during the slide makes the
  // browser scroll the element into view, which fights the transition.
  // Eat the eslint warning by referencing `active` so a future change
  // can re-introduce focus once the slide is settled.
  void active;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || pending) return;
    ask(draft);
    setDraft('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Sparkles size={14} className="text-cadenza-600" />
          <span className="uppercase tracking-wider font-semibold">{t('bot.title')}</span>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <Trash2 size={12} />
            {t('bot.clear')}
          </button>
        )}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {turns.length === 0 && (
          <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            <p className="mb-2">{t('bot.empty_state')}</p>
            <ul className="list-disc ms-5 space-y-1 text-xs">
              <li>{t('bot.example_1')}</li>
              <li>{t('bot.example_2')}</li>
              <li>{t('bot.example_3')}</li>
            </ul>
          </div>
        )}

        {turns.map(turn => (
          <div key={turn.id} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-cadenza-600 text-white px-3 py-2 text-sm shadow-sm">
                {turn.question}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm shadow-sm">
                {turn.stage === 'error' && (
                  <span className="text-red-600 dark:text-red-400">{t(turn.errorKey || 'bot.error_generic')}</span>
                )}
                {turn.stage !== 'error' && turn.stage !== 'done' && (
                  <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                    <span>{t(STAGE_LABEL_KEY[turn.stage])}</span>
                  </span>
                )}
                {turn.stage === 'done' && (
                  <span className="whitespace-pre-wrap">{turn.answer}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="border-t border-slate-200 dark:border-slate-700 p-3 flex gap-2 shrink-0">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={t('bot.placeholder')}
          disabled={pending}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cadenza-600 disabled:opacity-50"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="px-3 py-2 rounded-lg bg-cadenza-600 text-white disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center"
          aria-label={t('bot.send_aria')}
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
};
