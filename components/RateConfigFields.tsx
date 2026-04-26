import React from 'react';
import type { RateTypeV2 } from '../types/v2';

const RATE_TYPES: RateTypeV2[] = ['HOURLY', 'PER_EVENT', 'MONTHLY_FLAT'];

interface RateConfigFieldsProps {
  rateType: RateTypeV2;
  setRateType: (v: RateTypeV2) => void;
  rateValue: number;
  setRateValue: (v: number) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  t: (key: string) => string;
  rateLabel: (rt: RateTypeV2) => string;
}

export const RateConfigFields: React.FC<RateConfigFieldsProps> = ({
  rateType, setRateType, rateValue, setRateValue,
  startDate, setStartDate, endDate, setEndDate,
  t, rateLabel,
}) => {
  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^0-9.]/g, '');
    // Allow at most one decimal point
    const parts = cleaned.split('.');
    const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    const num = sanitized === '' || sanitized === '.' ? 0 : Number(sanitized);
    if (!isNaN(num)) setRateValue(num);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.rate_type')}</label>
        <select value={rateType} onChange={e => setRateType(e.target.value as RateTypeV2)}
          className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
          {RATE_TYPES.map(rt => <option key={rt} value={rt}>{rateLabel(rt)}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.rate_value')}</label>
        <input type="text" inputMode="decimal" value={rateValue || ''} onChange={handleRateChange}
          className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.start_date')}</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('staff.v2.end_date_optional')}</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
        </div>
      </div>
    </div>
  );
};
