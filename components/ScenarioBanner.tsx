import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, CheckSquare, Square, ArrowRight } from 'lucide-react';
import { QAScenario, ScenarioStep } from '../utils/testTemplates';
import { ViewState } from '../types';

interface ScenarioBannerProps {
  scenario: QAScenario;
  checkedSteps: string[];
  onToggleStep: (stepId: string) => void;
  onNavigate: (view: ViewState) => void;
  onExit: () => void;
}

const COLOR_MAP: Record<QAScenario['color'], { banner: string; badge: string; check: string; btn: string }> = {
  teal:   { banner: 'bg-teal-600',   badge: 'bg-white/20', check: 'text-teal-200',   btn: 'bg-white/20 hover:bg-white/30' },
  green:  { banner: 'bg-emerald-600', badge: 'bg-white/20', check: 'text-emerald-200', btn: 'bg-white/20 hover:bg-white/30' },
  blue:   { banner: 'bg-blue-600',   badge: 'bg-white/20', check: 'text-blue-200',   btn: 'bg-white/20 hover:bg-white/30' },
  amber:  { banner: 'bg-amber-600',  badge: 'bg-white/20', check: 'text-amber-200',  btn: 'bg-white/20 hover:bg-white/30' },
  violet: { banner: 'bg-violet-600', badge: 'bg-white/20', check: 'text-violet-200', btn: 'bg-white/20 hover:bg-white/30' },
};

export const ScenarioBanner: React.FC<ScenarioBannerProps> = ({
  scenario,
  checkedSteps,
  onToggleStep,
  onNavigate,
  onExit,
}) => {
  const [expanded, setExpanded] = useState(false);
  const colors = COLOR_MAP[scenario.color];
  const doneCount = checkedSteps.length;
  const totalCount = scenario.steps.length;
  const allDone = doneCount === totalCount;

  return (
    <div className={`sticky top-0 z-[195] ${colors.banner} text-white shadow-lg shrink-0`}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 flex items-center gap-3">
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${colors.badge} px-2 py-0.5 rounded`}>
          QA Scenario
        </span>

        <span className="font-semibold text-sm truncate flex-1">{scenario.label}</span>

        {/* Progress pill */}
        <span className={`shrink-0 text-xs font-bold ${colors.badge} px-2 py-0.5 rounded tabular-nums`}>
          {doneCount}/{totalCount}
        </span>

        {/* Thin progress bar */}
        <div className="shrink-0 w-20 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-300 ease-out"
            style={{ width: `${(doneCount / totalCount) * 100}%` }}
          />
        </div>

        {/* Toggle checklist */}
        <button
          onClick={() => setExpanded(e => !e)}
          className={`shrink-0 flex items-center gap-1 text-xs ${colors.btn} px-2.5 py-1 rounded transition-colors`}
        >
          Checklist
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {/* Exit */}
        <button
          onClick={onExit}
          className={`shrink-0 flex items-center gap-1 text-xs ${colors.btn} px-2.5 py-1 rounded transition-colors`}
        >
          <X size={13} />
          Exit
        </button>
      </div>

      {/* ── Expandable checklist ─────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-white/20 bg-black/20 px-4 py-3">
          {allDone && (
            <div className="mb-3 text-sm font-semibold text-white/90 flex items-center gap-2">
              All steps verified — scenario complete!
            </div>
          )}
          <div className="space-y-1.5">
            {scenario.steps.map((step: ScenarioStep, idx: number) => {
              const checked = checkedSteps.includes(step.id);
              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                    checked ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {/* Step number */}
                  <span className="shrink-0 text-[11px] font-bold text-white/50 w-4 text-center mt-0.5">
                    {idx + 1}
                  </span>

                  {/* Checkbox */}
                  <button
                    onClick={() => onToggleStep(step.id)}
                    className={`shrink-0 mt-0.5 ${checked ? colors.check : 'text-white/60 hover:text-white'}`}
                  >
                    {checked ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>

                  {/* Label + hint */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${checked ? 'line-through text-white/50' : 'text-white'}`}>
                      {step.label}
                    </p>
                    {step.hint && (
                      <p className="text-[11px] text-white/60 mt-0.5 leading-snug">{step.hint}</p>
                    )}
                  </div>

                  {/* Go button */}
                  <button
                    onClick={() => onNavigate(step.targetView)}
                    className={`shrink-0 flex items-center gap-1 text-[11px] font-bold ${colors.btn} px-2 py-1 rounded transition-colors`}
                  >
                    Go <ArrowRight size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
