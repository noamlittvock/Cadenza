import React, { useState, useMemo } from 'react';
import { Teacher, Student, AppSettings } from '../types';
import { TRANSLATIONS } from '../constants';
import { FileText, Copy, Check, Clock, DollarSign, GraduationCap, Eye } from 'lucide-react';

type TemplateId = 'hourly_self_report' | 'financial_summary' | 'student_report_card';

interface Props {
  settings: AppSettings;
  teachers: Teacher[];
  students: Student[];
}

const SAMPLE_HOURS = [
  { date: '2026-03-01', activity: 'Piano — Grade 5', hours: 2, room: 'Room A' },
  { date: '2026-03-02', activity: 'Music Theory — Beginners', hours: 1.5, room: 'Room B' },
  { date: '2026-03-03', activity: 'Piano — Grade 3', hours: 1, room: 'Room A' },
  { date: '2026-03-04', activity: 'Ensemble Rehearsal', hours: 2, room: 'Hall' },
  { date: '2026-03-05', activity: 'Piano — Grade 5', hours: 2, room: 'Room A' },
];

function buildHourlyReportHTML(teacher: { name: string; id: string }, orgName: string, period: string): string {
  const totalHours = SAMPLE_HOURS.reduce((s, h) => s + h.hours, 0);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Hourly Self-Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 0 auto; padding: 24px; color: #1e293b; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #64748b; font-size: 13px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
  .total-row td { font-weight: 700; border-top: 2px solid #e2e8f0; background: #f8fafc; }
  .sig-block { margin-top: 32px; display: flex; gap: 80px; }
  .sig-line { border-top: 1px solid #cbd5e1; padding-top: 4px; font-size: 11px; color: #94a3b8; min-width: 160px; }
</style></head>
<body>
  <h1>Hourly Self-Report Form</h1>
  <div class="subtitle">${orgName} &mdash; ${period}</div>
  <p style="font-size:14px;"><strong>Teacher:</strong> ${teacher.name}</p>
  <table>
    <thead><tr><th>Date</th><th>Activity</th><th>Hours</th><th>Room</th></tr></thead>
    <tbody>
      ${SAMPLE_HOURS.map(h => `<tr><td>${h.date}</td><td>${h.activity}</td><td>${h.hours}</td><td>${h.room}</td></tr>`).join('\n      ')}
      <tr class="total-row"><td colspan="2">Total</td><td>${totalHours}</td><td></td></tr>
    </tbody>
  </table>
  <div class="sig-block">
    <div><div class="sig-line">Teacher Signature</div></div>
    <div><div class="sig-line">Admin Signature</div></div>
    <div><div class="sig-line">Date</div></div>
  </div>
</body></html>`;
}

function buildFinancialSummaryHTML(teacher: { name: string; rate: number; vat: number }, orgName: string, period: string): string {
  const totalHours = SAMPLE_HOURS.reduce((s, h) => s + h.hours, 0);
  const gross = totalHours * teacher.rate;
  const vatAmount = gross * (teacher.vat / 100);
  const net = gross + vatAmount;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Financial Summary</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #64748b; font-size: 13px; margin-bottom: 20px; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .row.total { font-weight: 700; font-size: 16px; border-top: 2px solid #e2e8f0; margin-top: 8px; padding-top: 12px; }
  .label { color: #64748b; }
</style></head>
<body>
  <h1>Teacher Financial Summary</h1>
  <div class="subtitle">${orgName} &mdash; ${period}</div>
  <p style="font-size:14px;"><strong>Teacher:</strong> ${teacher.name}</p>
  <div class="card">
    <div class="row"><span class="label">Total Hours</span><span>${totalHours}</span></div>
    <div class="row"><span class="label">Hourly Rate</span><span>₪${teacher.rate.toFixed(2)}</span></div>
    <div class="row"><span class="label">Gross Amount</span><span>₪${gross.toFixed(2)}</span></div>
    <div class="row"><span class="label">VAT (${teacher.vat}%)</span><span>₪${vatAmount.toFixed(2)}</span></div>
    <div class="row total"><span>Net Payable</span><span>₪${net.toFixed(2)}</span></div>
  </div>
  <p style="font-size:11px; color:#94a3b8; margin-top:24px;">This is an automatically generated summary. For discrepancies, contact administration.</p>
</body></html>`;
}

function buildReportCardHTML(student: { name: string; instrument: string }, orgName: string, period: string): string {
  const subjects = [
    { name: student.instrument || 'Piano', grade: 'A', remarks: 'Excellent progress in technique and expression' },
    { name: 'Music Theory', grade: 'B+', remarks: 'Strong understanding of fundamentals' },
    { name: 'Ear Training', grade: 'A-', remarks: 'Good pitch recognition, continue interval work' },
    { name: 'Ensemble', grade: 'A', remarks: 'Great collaboration and stage presence' },
  ];
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Student Report Card</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; color: #1e293b; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #64748b; font-size: 13px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
  td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
  .grade { font-weight: 700; color: #059669; font-size: 15px; }
  .remarks { color: #64748b; font-size: 12px; }
  .overall { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; text-align: center; }
  .overall-grade { font-size: 28px; font-weight: 800; color: #059669; }
  .sig-block { margin-top: 32px; display: flex; gap: 80px; }
  .sig-line { border-top: 1px solid #cbd5e1; padding-top: 4px; font-size: 11px; color: #94a3b8; min-width: 140px; }
</style></head>
<body>
  <h1>Student Report Card</h1>
  <div class="subtitle">${orgName} &mdash; ${period}</div>
  <p style="font-size:14px;"><strong>Student:</strong> ${student.name}</p>
  <table>
    <thead><tr><th>Subject</th><th>Grade</th><th>Remarks</th></tr></thead>
    <tbody>
      ${subjects.map(s => `<tr><td>${s.name}</td><td class="grade">${s.grade}</td><td class="remarks">${s.remarks}</td></tr>`).join('\n      ')}
    </tbody>
  </table>
  <div class="overall">
    <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Overall Performance</div>
    <div class="overall-grade">A-</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px;">Excellent</div>
  </div>
  <div class="sig-block">
    <div><div class="sig-line">Teacher</div></div>
    <div><div class="sig-line">Director</div></div>
    <div><div class="sig-line">Date</div></div>
  </div>
</body></html>`;
}

const TEMPLATES: { id: TemplateId; icon: React.ElementType; color: string }[] = [
  { id: 'hourly_self_report', icon: Clock, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' },
  { id: 'financial_summary', icon: DollarSign, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/30' },
  { id: 'student_report_card', icon: GraduationCap, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' },
];

export const DocumentTemplates: React.FC<Props> = ({ settings, teachers, students }) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const [selected, setSelected] = useState<TemplateId>('hourly_self_report');
  const [copied, setCopied] = useState(false);

  const orgName = 'Cadenza Music Academy';
  const period = 'March 2026';

  const sampleTeacher = teachers[0] || { fullName: 'Sarah Cohen', id: 'sample' };
  const sampleStudent = students[0] || { fullName: 'David Levy', id: 'sample' };

  const teacherRate = useMemo(() => {
    const pa = (sampleTeacher as Teacher).positionAssignments?.[0];
    return { rate: pa?.rateValue || 150, vat: pa?.vat?.value || 17 };
  }, [sampleTeacher]);

  const html = useMemo(() => {
    switch (selected) {
      case 'hourly_self_report':
        return buildHourlyReportHTML({ name: sampleTeacher.fullName, id: sampleTeacher.id }, orgName, period);
      case 'financial_summary':
        return buildFinancialSummaryHTML({ name: sampleTeacher.fullName, ...teacherRate }, orgName, period);
      case 'student_report_card':
        return buildReportCardHTML({ name: sampleStudent.fullName, instrument: (sampleStudent as Student).assignments?.[0]?.subcategoryId || 'Piano' }, orgName, period);
    }
  }, [selected, sampleTeacher, sampleStudent, teacherRate]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <FileText size={20} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">{t('templates.title')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('templates.subtitle')}</p>
        </div>
      </div>

      {/* Template selector cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {TEMPLATES.map(tmpl => {
          const Icon = tmpl.icon;
          const isActive = selected === tmpl.id;
          return (
            <button
              key={tmpl.id}
              onClick={() => setSelected(tmpl.id)}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-start ${
                isActive
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tmpl.color}`}>
                <Icon size={18} />
              </div>
              <div>
                <div className="font-semibold text-sm text-slate-800 dark:text-white">{t(`templates.${tmpl.id}`)}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{t(`templates.${tmpl.id}_desc`)}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Preview + Copy */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Eye size={15} />
          <span className="font-medium">{t('templates.preview')}</span>
          <span className="text-xs text-slate-400">({t('templates.sample_data')})</span>
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            copied
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? t('templates.copied') : t('templates.copy_html')}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <iframe
          srcDoc={html}
          title="Template preview"
          className="w-full border-0"
          style={{ height: 500 }}
          sandbox=""
        />
      </div>
    </div>
  );
};
