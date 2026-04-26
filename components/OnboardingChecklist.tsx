/**
 * OnboardingChecklist — Phase 11
 *
 * Two roles:
 *  1. "Hard gate" screen — shown instead of locked views (CALENDAR/STUDENTS)
 *     when isFirstAdmin && !setupGateCleared.
 *  2. "Gate cleared" celebration — shown once setup is complete with a dismiss CTA.
 *
 * Soft tour banner for subsequent admins is rendered inline in App.tsx.
 */

import React from 'react';
import { CheckCircle2, Circle, ArrowRight, Lock, Sparkles } from 'lucide-react';
import { ViewState } from '../types';
import { TRANSLATIONS } from '../constants';
import { AppSettings } from '../types';
import { OrgOnboardingState } from '../utils/useOnboarding';

interface Props {
  orgOnboardingState: OrgOnboardingState | null;
  setupGateCleared: boolean;
  settings: AppSettings;
  onNavigate: (view: ViewState) => void;
  onDismiss: () => void;
  /** When true, shows the "locked" view prompt (with back CTA) instead of full checklist */
  lockedView?: boolean;
}

export const OnboardingChecklist: React.FC<Props> = ({
  orgOnboardingState,
  setupGateCleared,
  settings,
  onNavigate,
  onDismiss,
  lockedView = false,
}) => {
  const t = (key: string) =>
    TRANSLATIONS[settings.language]?.[key] ?? TRANSLATIONS['en-US'][key] ?? key;

  const st = orgOnboardingState;

  const steps = [
    {
      label: t('onboarding.step_1'),
      done: st?.activitiesCreated ?? false,
      cta: t('onboarding.step_create_activity'),
      view: 'MANAGE' as ViewState,
    },
    {
      label: t('onboarding.step_2'),
      done: st?.staffAdded ?? false,
      cta: t('onboarding.step_add_staff'),
      view: 'STAFF_MEMBERS' as ViewState,
    },
    {
      label: t('onboarding.step_3'),
      done: st?.studentsAdded ?? false,
      cta: null, // Unlocked after gate clears
      view: 'STUDENTS' as ViewState,
    },
    {
      label: t('onboarding.step_4'),
      done: st?.firstEventCreated ?? false,
      cta: t('onboarding.step_create_event'),
      view: 'CALENDAR' as ViewState,
    },
  ];

  // ── Locked view shortcut (shown when navigating to a gated view) ──────────────
  if (lockedView && !setupGateCleared) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-5">
          <Lock size={28} className="text-slate-400 dark:text-slate-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
          {t('onboarding.locked_title')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
          {t('onboarding.locked_msg')}
        </p>
        <button
          onClick={() => onNavigate('MANAGE')}
          className="flex items-center gap-2 px-5 py-2.5 bg-cadenza-gradient texture-cadenza text-white rounded-xl text-sm font-semibold shadow-cadenza-soft btn-cadenza"
        >
          {t('onboarding.view_checklist')}
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  // ── Gate-cleared celebration ──────────────────────────────────────────────────
  if (setupGateCleared) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-6 shadow-inner">
          <Sparkles size={36} className="text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
          {t('onboarding.gate_cleared_title')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-8">
          {t('onboarding.gate_cleared_msg')}
        </p>
        {/* Show remaining optional steps */}
        <div className="w-full max-w-xs space-y-2 mb-8">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"
            >
              {step.done ? (
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
              ) : (
                <Circle size={18} className="text-slate-300 dark:text-slate-600 shrink-0" />
              )}
              <span
                className={`text-sm ${
                  step.done
                    ? 'text-slate-400 dark:text-slate-500 line-through'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={onDismiss}
          className="flex items-center gap-2 px-6 py-3 bg-cadenza-gradient texture-cadenza text-white rounded-xl text-sm font-semibold shadow-cadenza-soft btn-cadenza"
        >
          {t('onboarding.dismiss')}
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  // ── Full setup checklist (hard gate active) ───────────────────────────────────
  const nextStep = steps.find(s => !s.done);

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-16">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cadenza-gradient texture-cadenza shadow-cadenza-soft mb-5">
            <img src="/logo.png?v=2" alt="Cadenza" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
            {t('onboarding.setup_title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('onboarding.setup_subtitle')}
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-8">
          {steps.map((step, i) => {
            const isNext = !step.done && step === nextStep;
            const isLocked = !step.done && !isNext;
            return (
              <div
                key={i}
                className={`flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all ${
                  step.done
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40'
                    : isNext
                    ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-transparent opacity-60'
                }`}
              >
                {/* Icon */}
                <div className="shrink-0">
                  {step.done ? (
                    <CheckCircle2 size={22} className="text-emerald-500" />
                  ) : isLocked ? (
                    <Lock size={18} className="text-slate-300 dark:text-slate-600" />
                  ) : (
                    <Circle size={22} className="text-slate-300 dark:text-slate-600" />
                  )}
                </div>

                {/* Label + step number */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                      Step {i + 1}
                    </span>
                  </div>
                  <p
                    className={`text-sm font-semibold mt-0.5 ${
                      step.done
                        ? 'text-emerald-600 dark:text-emerald-400 line-through'
                        : isNext
                        ? 'text-slate-800 dark:text-white'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {step.label}
                  </p>
                </div>

                {/* CTA button for the next incomplete step */}
                {isNext && step.cta && (
                  <button
                    onClick={() => onNavigate(step.view)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-cadenza-gradient texture-cadenza text-white rounded-lg text-xs font-semibold shadow-cadenza-soft btn-cadenza"
                  >
                    {step.cta}
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 px-1">
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-cadenza-gradient transition-all duration-700"
              style={{ width: `${(steps.filter(s => s.done).length / steps.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {steps.filter(s => s.done).length}/{steps.length}
          </span>
        </div>
      </div>
    </div>
  );
};
