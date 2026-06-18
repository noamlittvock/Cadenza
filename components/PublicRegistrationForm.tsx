import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Languages,
  Loader2,
  Send,
  ShieldCheck,
  User,
  UserRound,
} from 'lucide-react';
import {
  submitPublicRegistrationIntake,
  type PublicRegistrationSubmitResult,
} from '../utils/publicRegistrationIntake';

interface Props {
  token: string;
}

type PublicLanguage = 'en-US' | 'he-IL';

type FormState = {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  studentFullName: string;
  studentDateOfBirth: string;
  instrument: string;
  requestedProgram: string;
  useApplicantAsGuardian: boolean;
  guardianFullName: string;
  guardianRelationship: string;
  guardianEmail: string;
  guardianPhone: string;
  notes: string;
  consentAccepted: boolean;
};

const INITIAL_FORM: FormState = {
  applicantName: '',
  applicantEmail: '',
  applicantPhone: '',
  studentFullName: '',
  studentDateOfBirth: '',
  instrument: '',
  requestedProgram: '',
  useApplicantAsGuardian: true,
  guardianFullName: '',
  guardianRelationship: '',
  guardianEmail: '',
  guardianPhone: '',
  notes: '',
  consentAccepted: false,
};

const COPY: Record<PublicLanguage, Record<string, string>> = {
  'en-US': {
    title: 'Registration intake',
    eyebrow: 'Cadenza',
    status: 'Public registration',
    sectionApplicant: 'Applicant',
    sectionStudent: 'Student',
    sectionGuardian: 'Guardian / contact',
    applicantName: 'Applicant name',
    applicantEmail: 'Applicant email',
    applicantPhone: 'Applicant phone',
    studentName: 'Student name',
    studentBirthDate: 'Birth date',
    instrument: 'Instrument',
    requestedProgram: 'Requested activity or program',
    useApplicantAsGuardian: 'Applicant is the primary guardian/contact',
    guardianName: 'Guardian name',
    relationship: 'Relationship',
    guardianEmail: 'Guardian email',
    guardianPhone: 'Guardian phone',
    notes: 'Notes',
    consent: 'I consent to Cadenza collecting and processing this registration intake for administrative review.',
    submit: 'Submit registration',
    submitting: 'Submitting...',
    required: 'Required',
    contactHint: 'Provide at least one phone or email for the applicant or guardian.',
    successTitle: 'Registration submitted',
    successBody: 'The office will review the intake before creating any student, family, or enrollment record.',
    reference: 'Reference',
    errorTitle: 'Registration was not submitted',
    unavailable: 'Registration submission is currently unavailable.',
    langEn: 'EN',
    langHe: 'עברית',
  },
  'he-IL': {
    title: 'קליטת הרשמה',
    eyebrow: 'קדנצה',
    status: 'הרשמה ציבורית',
    sectionApplicant: 'מגיש הבקשה',
    sectionStudent: 'תלמיד/ה',
    sectionGuardian: 'איש קשר / אפוטרופוס',
    applicantName: 'שם מגיש הבקשה',
    applicantEmail: 'אימייל מגיש הבקשה',
    applicantPhone: 'טלפון מגיש הבקשה',
    studentName: 'שם התלמיד/ה',
    studentBirthDate: 'תאריך לידה',
    instrument: 'כלי נגינה',
    requestedProgram: 'פעילות או מסלול מבוקש',
    useApplicantAsGuardian: 'מגיש הבקשה הוא איש הקשר הראשי',
    guardianName: 'שם איש הקשר',
    relationship: 'קרבה',
    guardianEmail: 'אימייל איש הקשר',
    guardianPhone: 'טלפון איש הקשר',
    notes: 'הערות',
    consent: 'אני מסכים/ה שקדנצה תאסוף ותעבד את פרטי ההרשמה לצורך בדיקה מנהלית.',
    submit: 'שליחת הרשמה',
    submitting: 'שולח...',
    required: 'חובה',
    contactHint: 'יש להזין לפחות טלפון או אימייל עבור מגיש הבקשה או איש הקשר.',
    successTitle: 'ההרשמה נשלחה',
    successBody: 'המשרד יבדוק את הבקשה לפני יצירת רשומת תלמיד, משפחה או הרשמה.',
    reference: 'מספר פניה',
    errorTitle: 'ההרשמה לא נשלחה',
    unavailable: 'שליחת הרשמה אינה זמינה כרגע.',
    langEn: 'EN',
    langHe: 'עברית',
  },
};

function initialLanguage(): PublicLanguage {
  if (typeof window === 'undefined') return 'en-US';
  const urlLang = new URLSearchParams(window.location.search).get('lang');
  if (urlLang === 'he-IL' || urlLang === 'he') return 'he-IL';
  if (urlLang === 'en-US' || urlLang === 'en') return 'en-US';
  return localStorage.getItem('language') === 'he-IL' ? 'he-IL' : 'en-US';
}

function appendRequestedProgram(notes: string, requestedProgram: string, language: PublicLanguage): string | null {
  const trimmedNotes = notes.trim();
  const trimmedProgram = requestedProgram.trim();
  if (!trimmedProgram) return trimmedNotes || null;
  const label = language === 'he-IL' ? 'פעילות מבוקשת' : 'Requested activity/program';
  return [label + ': ' + trimmedProgram, trimmedNotes].filter(Boolean).join('\n\n');
}

export const PublicRegistrationForm: React.FC<Props> = ({ token }) => {
  const [language, setLanguage] = useState<PublicLanguage>(initialLanguage);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [result, setResult] = useState<PublicRegistrationSubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const copy = COPY[language];
  const isRtl = language === 'he-IL';

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    localStorage.setItem('language', language);
  }, [language, isRtl]);

  const fieldErrors = result?.status === 'error' ? result.fieldErrors ?? {} : {};
  const contactProvided = useMemo(
    () => Boolean(
      form.applicantEmail.trim() ||
      form.applicantPhone.trim() ||
      (!form.useApplicantAsGuardian && (form.guardianEmail.trim() || form.guardianPhone.trim())),
    ),
    [form],
  );

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (result?.status === 'error') setResult(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const submitResult = await submitPublicRegistrationIntake({
        token,
        applicant: {
          fullName: form.applicantName,
          email: form.applicantEmail,
          phone: form.applicantPhone,
        },
        student: {
          fullName: form.studentFullName,
          dateOfBirth: form.studentDateOfBirth || null,
          instrument: form.instrument,
          requestedActivityId: null,
        },
        guardians: form.useApplicantAsGuardian
          ? []
          : [{
              fullName: form.guardianFullName,
              relationship: form.guardianRelationship,
              email: form.guardianEmail,
              phone: form.guardianPhone,
              isPrimary: true,
            }],
        notes: appendRequestedProgram(form.notes, form.requestedProgram, language),
        consent: {
          accepted: form.consentAccepted,
          agreementId: null,
        },
      });
      setResult(submitResult);
      if (submitResult.status === 'success') {
        setForm(INITIAL_FORM);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
  const labelClass = 'mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300';

  return (
    <main
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100"
      data-testid="public-registration-page"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-4 flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft">
              <ShieldCheck size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-normal text-cadenza-700 dark:text-cadenza-300">{copy.eyebrow}</p>
              <h1 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">{copy.title}</h1>
            </div>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <span className="hidden rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-300 sm:inline-flex">
              {copy.status}
            </span>
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950">
              <Languages size={14} className="mx-2 text-slate-400" aria-hidden="true" />
              {(['en-US', 'he-IL'] as const).map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className={`h-8 rounded-md px-2.5 text-xs font-bold transition ${
                    language === lang
                      ? 'bg-cadenza-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                  aria-pressed={language === lang}
                >
                  {lang === 'en-US' ? copy.langEn : copy.langHe}
                </button>
              ))}
            </div>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-cadenza-soft dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex items-center gap-2">
                <User size={17} className="text-cadenza-600 dark:text-cadenza-300" aria-hidden="true" />
                <h2 className="text-sm font-bold">{copy.sectionApplicant}</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label>
                  <span className={labelClass}>{copy.applicantName}<span>{copy.required}</span></span>
                  <input
                    className={inputClass}
                    value={form.applicantName}
                    onChange={e => updateField('applicantName', e.target.value)}
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.applicant)}
                  />
                </label>
                <label>
                  <span className={labelClass}>{copy.applicantEmail}</span>
                  <input
                    className={inputClass}
                    value={form.applicantEmail}
                    onChange={e => updateField('applicantEmail', e.target.value)}
                    type="email"
                    autoComplete="email"
                  />
                </label>
                <label>
                  <span className={labelClass}>{copy.applicantPhone}</span>
                  <input
                    className={inputClass}
                    value={form.applicantPhone}
                    onChange={e => updateField('applicantPhone', e.target.value)}
                    type="tel"
                    autoComplete="tel"
                  />
                </label>
              </div>
              {fieldErrors.applicant && <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">{fieldErrors.applicant}</p>}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-cadenza-soft dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex items-center gap-2">
                <UserRound size={17} className="text-cadenza-600 dark:text-cadenza-300" aria-hidden="true" />
                <h2 className="text-sm font-bold">{copy.sectionStudent}</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>
                  <span className={labelClass}>{copy.studentName}<span>{copy.required}</span></span>
                  <input
                    className={inputClass}
                    value={form.studentFullName}
                    onChange={e => updateField('studentFullName', e.target.value)}
                    aria-invalid={Boolean(fieldErrors.student)}
                  />
                </label>
                <label>
                  <span className={labelClass}>{copy.studentBirthDate}</span>
                  <input
                    className={inputClass}
                    value={form.studentDateOfBirth}
                    onChange={e => updateField('studentDateOfBirth', e.target.value)}
                    type="date"
                  />
                </label>
                <label>
                  <span className={labelClass}>{copy.instrument}</span>
                  <input
                    className={inputClass}
                    value={form.instrument}
                    onChange={e => updateField('instrument', e.target.value)}
                  />
                </label>
                <label>
                  <span className={labelClass}>{copy.requestedProgram}</span>
                  <input
                    className={inputClass}
                    value={form.requestedProgram}
                    onChange={e => updateField('requestedProgram', e.target.value)}
                  />
                </label>
              </div>
              {fieldErrors.student && <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">{fieldErrors.student}</p>}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-cadenza-soft dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-bold">{copy.sectionGuardian}</h2>
                <label className="ms-auto inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.useApplicantAsGuardian}
                    onChange={e => updateField('useApplicantAsGuardian', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-cadenza-600 focus:ring-cadenza-600"
                  />
                  {copy.useApplicantAsGuardian}
                </label>
              </div>
              {!form.useApplicantAsGuardian && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    <span className={labelClass}>{copy.guardianName}<span>{copy.required}</span></span>
                    <input className={inputClass} value={form.guardianFullName} onChange={e => updateField('guardianFullName', e.target.value)} />
                  </label>
                  <label>
                    <span className={labelClass}>{copy.relationship}</span>
                    <input className={inputClass} value={form.guardianRelationship} onChange={e => updateField('guardianRelationship', e.target.value)} />
                  </label>
                  <label>
                    <span className={labelClass}>{copy.guardianEmail}</span>
                    <input className={inputClass} value={form.guardianEmail} onChange={e => updateField('guardianEmail', e.target.value)} type="email" />
                  </label>
                  <label>
                    <span className={labelClass}>{copy.guardianPhone}</span>
                    <input className={inputClass} value={form.guardianPhone} onChange={e => updateField('guardianPhone', e.target.value)} type="tel" />
                  </label>
                </div>
              )}
              <p className={`mt-2 text-xs font-semibold ${contactProvided ? 'text-slate-500 dark:text-slate-400' : 'text-amber-700 dark:text-amber-300'}`}>
                {copy.contactHint}
              </p>
              {fieldErrors.guardians && <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">{fieldErrors.guardians}</p>}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-cadenza-soft dark:border-slate-700 dark:bg-slate-800">
              <label>
                <span className={labelClass}>{copy.notes}</span>
                <textarea
                  className="min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={form.notes}
                  onChange={e => updateField('notes', e.target.value)}
                />
              </label>
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.consentAccepted}
                  onChange={e => updateField('consentAccepted', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-cadenza-600 focus:ring-cadenza-600"
                  aria-invalid={Boolean(fieldErrors.consent)}
                />
                <span>{copy.consent}</span>
              </label>
              {fieldErrors.consent && <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">{fieldErrors.consent}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="btn-cadenza mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cadenza-gradient texture-cadenza px-4 text-sm font-bold text-white shadow-cadenza-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
                {submitting ? copy.submitting : copy.submit}
              </button>
            </section>

            {result?.status === 'success' && (
              <section className="rounded-lg border border-success-200 bg-success-50 p-4 text-success-800 shadow-cadenza-soft dark:border-success-800 dark:bg-success-900/20 dark:text-success-200" role="status">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <CheckCircle2 size={17} aria-hidden="true" />
                  {copy.successTitle}
                </div>
                <p className="mt-2 text-sm">{copy.successBody}</p>
                <p className="mt-3 rounded border border-success-200 bg-white/70 px-2 py-1 text-xs font-bold dark:border-success-800 dark:bg-slate-950/40">
                  {copy.reference}: {result.intakeId}
                </p>
              </section>
            )}

            {result?.status === 'error' && (
              <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 shadow-cadenza-soft dark:border-red-800 dark:bg-red-900/20 dark:text-red-200" role="alert">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <AlertCircle size={17} aria-hidden="true" />
                  {copy.errorTitle}
                </div>
                <p className="mt-2 text-sm">{result.message || copy.unavailable}</p>
              </section>
            )}
          </aside>
        </form>
      </div>
    </main>
  );
};
