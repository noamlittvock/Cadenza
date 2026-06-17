/**
 * GuideMeButton — Phase 11
 *
 * A small "Guide me" link rendered below form titles.
 * Clicking it opens a slide-in panel with step-by-step walkthrough guidance.
 * Partial form data is preserved because the panel is a UI overlay only.
 */

import React, { useState } from 'react';
import { HelpCircle, X, ChevronRight } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { AppSettings } from '../types';

export interface GuideMeStep {
  title: string;
  description: string;
}

interface Props {
  steps: GuideMeStep[];
  settings: AppSettings;
}

export const GuideMeButton: React.FC<Props> = ({ steps, settings }) => {
  const [open, setOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const t = (key: string) =>
    TRANSLATIONS[settings.language]?.[key] ?? TRANSLATIONS['en-US'][key] ?? key;

  const isRtl = settings.language === 'he-IL';

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(true); setActiveStep(0); }}
        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cadenza-accent dark:hover:text-blue-400 transition-colors"
      >
        <HelpCircle size={12} />
        {t('guide_me')}
      </button>

      {/* Slide-in panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-[200]"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div
            className={`fixed top-0 ${isRtl ? 'left-0' : 'right-0'} h-full w-80 max-w-full bg-white dark:bg-slate-900 shadow-2xl z-[210] flex flex-col`}
            style={{ borderInlineStart: '1px solid', borderColor: 'rgba(148,163,184,0.2)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <HelpCircle size={16} className="text-cadenza-accent" />
                <span className="text-sm font-semibold text-slate-800 dark:text-white">
                  {t('guide_me')}
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>

            {/* Step tabs */}
            <div className="flex items-center gap-1 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveStep(i)}
                  className={`w-7 h-7 rounded-full text-xs font-bold transition-all ${
                    i === activeStep
                      ? 'bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft'
                      : i < activeStep
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            {/* Active step content */}
            <div className="flex-1 px-5 py-6 overflow-y-auto">
              {steps[activeStep] && (
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-white mb-3">
                    {steps[activeStep].title}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                    {steps[activeStep].description}
                  </p>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={() => setActiveStep(s => Math.max(0, s - 1))}
                disabled={activeStep === 0}
                className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors"
              >
                {isRtl ? '' : '← '}{t('guide.prev')}{isRtl ? ' ←' : ''}
              </button>
              <span className="text-xs text-slate-400">
                {activeStep + 1} / {steps.length}
              </span>
              {activeStep < steps.length - 1 ? (
                <button
                  onClick={() => setActiveStep(s => Math.min(steps.length - 1, s + 1))}
                  className="flex items-center gap-1 text-xs text-cadenza-accent font-semibold hover:underline"
                >
                  {t('guide.next')} <ChevronRight size={12} />
                </button>
              ) : (
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs text-emerald-600 font-semibold hover:underline"
                >
                  {t('guide.done')}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};
