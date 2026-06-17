import React, { useMemo, useState } from 'react';
import type { AppSettings, Student, Teacher } from '../types';
import { generateId, TRANSLATIONS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { useSupabaseSync } from '../utils/useSupabaseSync';
import type { Instrument, InstrumentLoan, InstrumentCondition, InstrumentStatus } from '../types/blueprint';
import { listAvailableInstruments, listOverdueLoans } from '../utils/blueprintQueries';
import { Modal } from './Modal';
import { Guitar, Plus, Edit2, Archive, ArrowRightLeft, RotateCcw, AlertTriangle, Menu } from 'lucide-react';

interface Props {
  settings: AppSettings;
  students: Student[];
  teachers: Teacher[];
  onMobileMenuOpen?: () => void;
  embedded?: boolean;
}

const CATEGORIES = ['STRINGS', 'BRASS', 'WOODWIND', 'PERCUSSION', 'KEYBOARD', 'OTHER'];
const CONDITIONS: InstrumentCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR', 'REPAIR', 'RETIRED'];

const STATUS_CLASS: Record<InstrumentStatus, string> = {
  AVAILABLE: 'bg-ok-50 text-ok-700 border-ok-200 dark:bg-ok-900/30 dark:text-ok-200 dark:border-ok-700',
  ON_LOAN: 'bg-info-50 text-info-700 border-info-200 dark:bg-info-900/30 dark:text-info-200 dark:border-info-700',
  IN_REPAIR: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700',
  RETIRED: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  LOST: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export const InstrumentManager: React.FC<Props> = ({ settings, students, teachers, onMobileMenuOpen, embedded = false }) => {
  const t = (key: string) => TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS['en-US'][key] || key;
  const isRtl = settings.language === 'he-IL';
  const { orgId } = useAuth();
  const [instruments, setInstruments] = useSupabaseSync<Instrument>('instruments', []);
  const [loans, setLoans] = useSupabaseSync<InstrumentLoan>('instrumentLoans', []);

  const [editing, setEditing] = useState<Instrument | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Partial<Instrument>>({});
  const [loanFor, setLoanFor] = useState<Instrument | null>(null);
  const [loanBorrower, setLoanBorrower] = useState('');
  const [loanDue, setLoanDue] = useState('');

  const today = todayIso();
  const overdue = useMemo(() => new Set(listOverdueLoans(loans, today).map(l => l.instrumentId)), [loans, today]);
  const available = useMemo(() => listAvailableInstruments(instruments).length, [instruments]);
  const onLoan = useMemo(() => instruments.filter(i => i.status === 'ON_LOAN').length, [instruments]);

  const activeLoanByInstrument = useMemo(() => {
    const m = new Map<string, InstrumentLoan>();
    loans.filter(l => l.status === 'ACTIVE' || l.status === 'OVERDUE').forEach(l => m.set(l.instrumentId, l));
    return m;
  }, [loans]);

  const borrowerName = (l?: InstrumentLoan): string => {
    if (!l) return '—';
    if (l.borrowerStudentId) return students.find(s => s.id === l.borrowerStudentId)?.fullName ?? t('instrument.unknown');
    if (l.borrowerStaffId) return teachers.find(s => s.id === l.borrowerStaffId)?.fullName ?? t('instrument.unknown');
    return '—';
  };

  const stamp = () => new Date().toISOString();

  const openForm = (inst?: Instrument) => {
    setEditing(inst ?? null);
    setForm(inst ? { ...inst } : { category: 'OTHER', condition: 'GOOD', status: 'AVAILABLE' });
    setFormOpen(true);
  };

  const saveInstrument = (e?: React.FormEvent) => {
    e?.preventDefault();
    const assetTag = form.assetTag?.trim();
    const name = form.name?.trim();
    if (!assetTag || !name) return;
    const now = stamp();
    if (editing) {
      setInstruments(prev => prev.map(i => i.id === editing.id ? { ...i, ...form, assetTag, name, updatedAt: now } as Instrument : i));
    } else {
      const inst: Instrument = {
        id: generateId(), orgId: orgId || '', assetTag, name,
        category: form.category || 'OTHER', brand: form.brand ?? null, serialNumber: form.serialNumber ?? null,
        condition: (form.condition as InstrumentCondition) || 'GOOD', status: (form.status as InstrumentStatus) || 'AVAILABLE',
        location: form.location ?? null, acquiredAt: form.acquiredAt ?? null, valueAmount: form.valueAmount ?? null,
        notes: form.notes ?? null, createdAt: now, updatedAt: now,
      };
      setInstruments(prev => [...prev, inst]);
    }
    setFormOpen(false);
  };

  const retire = (inst: Instrument) => {
    if (!window.confirm(t('instrument.confirm_retire'))) return;
    setInstruments(prev => prev.map(i => i.id === inst.id ? { ...i, status: 'RETIRED', updatedAt: stamp() } : i));
  };

  const openLoan = (inst: Instrument) => { setLoanFor(inst); setLoanBorrower(''); setLoanDue(''); };

  const checkout = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!loanFor || !loanBorrower) return;
    const [kind, id] = loanBorrower.split(':');
    const now = stamp();
    const loan: InstrumentLoan = {
      id: generateId(), orgId: orgId || '', instrumentId: loanFor.id,
      borrowerStudentId: kind === 'student' ? id : null, borrowerStaffId: kind === 'staff' ? id : null,
      checkedOutAt: now, dueDate: loanDue || null, returnedAt: null, status: 'ACTIVE',
      conditionOut: loanFor.condition, conditionIn: null, agreementAcceptanceId: null, note: null,
      createdAt: now, updatedAt: now,
    };
    setLoans(prev => [...prev, loan]);
    setInstruments(prev => prev.map(i => i.id === loanFor.id ? { ...i, status: 'ON_LOAN', updatedAt: now } : i));
    setLoanFor(null);
  };

  const returnLoan = (inst: Instrument) => {
    const loan = activeLoanByInstrument.get(inst.id);
    if (!loan) return;
    const now = stamp();
    setLoans(prev => prev.map(l => l.id === loan.id ? { ...l, status: 'RETURNED', returnedAt: now, conditionIn: inst.condition, updatedAt: now } : l));
    setInstruments(prev => prev.map(i => i.id === inst.id ? { ...i, status: 'AVAILABLE', updatedAt: now } : i));
  };

  const visible = useMemo(
    () => [...instruments].sort((a, b) => a.assetTag.localeCompare(b.assetTag)),
    [instruments],
  );

  const isInstrumentFormValid = Boolean(form.assetTag?.trim() && form.name?.trim());

  return (
    <div className={`${embedded ? 'h-full overflow-auto' : ''} p-4 sm:p-6 max-w-6xl mx-auto`} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3 mb-4">
        {onMobileMenuOpen && (
          <button onClick={onMobileMenuOpen} className="p-2 -ms-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg lg:hidden">
            <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <Guitar size={18} className="text-cadenza-600 dark:text-cadenza-300" />
          <div>
            <h2 className="text-sm font-semibold leading-tight text-slate-800 dark:text-white">{t('instrument.title')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('instrument.subtitle')}</p>
          </div>
        </div>
        <button onClick={() => openForm()} className="ms-auto btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-3 py-2 rounded-lg flex items-center text-sm">
          <Plus size={16} className="me-1.5" /> {t('instrument.add')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label={t('instrument.stat_available')} value={available} />
        <Stat label={t('instrument.stat_on_loan')} value={onLoan} />
        <Stat label={t('instrument.stat_overdue')} value={overdue.size} alert={overdue.size > 0} />
      </div>

      {visible.length === 0 ? (
        <div className="py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          {t('instrument.empty_state')}
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="py-2 px-3 text-start font-medium">{t('instrument.col_tag')}</th>
                <th className="py-2 px-3 text-start font-medium">{t('instrument.col_name')}</th>
                <th className="py-2 px-3 text-start font-medium hidden sm:table-cell">{t('instrument.col_category')}</th>
                <th className="py-2 px-3 text-start font-medium hidden md:table-cell">{t('instrument.col_condition')}</th>
                <th className="py-2 px-3 text-start font-medium">{t('instrument.col_status')}</th>
                <th className="py-2 px-3 text-start font-medium hidden md:table-cell">{t('instrument.col_holder')}</th>
                <th className="py-2 px-3 text-end font-medium">{t('instrument.col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(inst => {
                const loan = activeLoanByInstrument.get(inst.id);
                const isOverdue = overdue.has(inst.id);
                return (
                  <tr key={inst.id} className={`border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${inst.status === 'RETIRED' ? 'opacity-60' : ''}`}>
                    <td className="py-2 px-3 font-mono text-xs text-slate-600 dark:text-slate-300">{inst.assetTag}</td>
                    <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{inst.name}</td>
                    <td className="py-2 px-3 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{t(`instrument.cat.${inst.category}`)}</td>
                    <td className="py-2 px-3 text-slate-500 dark:text-slate-400 hidden md:table-cell">{t(`instrument.cond.${inst.condition}`)}</td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[inst.status]}`}>
                        {isOverdue && <AlertTriangle size={11} />}
                        {t(`instrument.status.${inst.status}`)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300 hidden md:table-cell">
                      {borrowerName(loan)}
                      {loan?.dueDate && <span className={`ms-2 text-xs ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>{loan.dueDate}</span>}
                    </td>
                    <td className="py-2 px-3 text-end" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {inst.status === 'AVAILABLE' && (
                          <button onClick={() => openLoan(inst)} className="p-1.5 text-info-600 dark:text-info-300 hover:bg-info-50 dark:hover:bg-info-900/20 rounded-lg" title={t('instrument.checkout')}>
                            <ArrowRightLeft size={14} />
                          </button>
                        )}
                        {inst.status === 'ON_LOAN' && (
                          <button onClick={() => returnLoan(inst)} className="p-1.5 text-ok-600 dark:text-ok-300 hover:bg-ok-50 dark:hover:bg-ok-900/20 rounded-lg" title={t('instrument.return')}>
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button onClick={() => openForm(inst)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title={t('btn.edit')}>
                          <Edit2 size={14} />
                        </button>
                        {inst.status !== 'RETIRED' && (
                          <button onClick={() => retire(inst)} className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg" title={t('instrument.retire')}>
                            <Archive size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / edit instrument */}
      <Modal isOpen={isFormOpen} onClose={() => setFormOpen(false)} title={editing ? t('instrument.edit') : t('instrument.add_new')} maxWidth="max-w-md">
        <form onSubmit={saveInstrument} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('instrument.col_tag')} required value={form.assetTag || ''} onChange={v => setForm({ ...form, assetTag: v })} />
            <Field label={t('instrument.col_name')} required value={form.name || ''} onChange={v => setForm({ ...form, name: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label={t('instrument.col_category')} value={form.category || 'OTHER'} options={CATEGORIES.map(c => ({ value: c, label: t(`instrument.cat.${c}`) }))} onChange={v => setForm({ ...form, category: v })} />
            <Select label={t('instrument.col_condition')} value={form.condition || 'GOOD'} options={CONDITIONS.map(c => ({ value: c, label: t(`instrument.cond.${c}`) }))} onChange={v => setForm({ ...form, condition: v as InstrumentCondition })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('instrument.brand')} value={form.brand || ''} onChange={v => setForm({ ...form, brand: v })} />
            <Field label={t('instrument.location')} value={form.location || ''} onChange={v => setForm({ ...form, location: v })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={!isInstrumentFormValid} className="px-4 py-2 rounded-lg bg-cadenza-600 hover:bg-cadenza-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
              {editing ? t('btn.save') : t('btn.create')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Checkout */}
      <Modal isOpen={!!loanFor} onClose={() => setLoanFor(null)} title={`${t('instrument.checkout')} - ${loanFor?.name ?? ''}`} maxWidth="max-w-md">
        <form onSubmit={checkout} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('instrument.borrower')}</label>
            <select required value={loanBorrower} onChange={e => setLoanBorrower(e.target.value)} aria-label={t('instrument.borrower')} className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white">
              <option value="">{t('instrument.select_borrower')}</option>
              <optgroup label={t('nav.students')}>
                {students.map(s => <option key={s.id} value={`student:${s.id}`}>{s.fullName}</option>)}
              </optgroup>
              <optgroup label={t('nav.staff_members')}>
                {teachers.map(s => <option key={s.id} value={`staff:${s.id}`}>{s.fullName}</option>)}
              </optgroup>
            </select>
          </div>
          <Field label={t('instrument.due_date')} type="date" value={loanDue} onChange={setLoanDue} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setLoanFor(null)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
              {t('common.cancel')}
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-cadenza-600 hover:bg-cadenza-700 text-white font-semibold">
              {t('instrument.checkout')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; alert?: boolean }> = ({ label, value, alert }) => (
  <div className={`border rounded-lg px-3 py-2 bg-white dark:bg-slate-900 ${alert ? 'border-red-300 dark:border-red-700' : 'border-slate-200 dark:border-slate-800'}`}>
    <div className={`font-mono text-lg font-semibold tabular-nums ${alert ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>{value}</div>
    <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
  </div>
);

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string }> = ({ label, value, onChange, required, type = 'text' }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
    <input type={type} required={required} value={value} onChange={e => onChange(e.target.value)} aria-label={label}
      className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
  </div>
);

const Select: React.FC<{ label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
      className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);
