import React from 'react';
import { AlertCircle, LockKeyhole } from 'lucide-react';

interface Props {
  token: string;
}

export const TeacherHoursForm: React.FC<Props> = ({ token }) => {
  const suffix = token ? token.slice(-6) : '';

  return (
    <div className="min-h-screen bg-[#f6f0e6] text-slate-900 flex items-center justify-center p-4" dir="auto">
      <section className="w-full max-w-md rounded-lg border border-[#d8c7ad] bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#7b2d36]/10 text-[#7b2d36] flex items-center justify-center shrink-0">
            <LockKeyhole size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-950">Hours reporting moved to Payroll</h1>
            <p className="mt-1 text-sm text-slate-600">
              Legacy token links no longer accept public payroll submissions. Sign in and open Payroll to submit or review hours.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>
            Existing legacy reports are reconciled into period headers and normalized hours entries by an admin. This link is retained only as a closed legacy reference.
          </p>
        </div>

        {suffix && (
          <p className="text-xs text-slate-500">
            Reference ending: <span className="font-mono" dir="ltr">{suffix}</span>
          </p>
        )}
      </section>
    </div>
  );
};
