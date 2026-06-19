import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileSignature,
  Languages,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  loadPublicAgreementSigningTarget,
  submitPublicAgreementAcceptance,
  type PublicAgreementLoadResult,
  type PublicAgreementSigningTarget,
  type PublicAgreementSubmitResult,
} from '../utils/publicAgreementSigning';

interface Props {
  token: string;
}

type PublicLanguage = 'en-US' | 'he-IL';

const COPY: Record<PublicLanguage, Record<string, string>> = {
  'en-US': {
    eyebrow: 'Cadenza',
    title: 'Agreement signing',
    status: 'Secure agreement link',
    loading: 'Loading agreement...',
    unavailable: 'Agreement link unavailable',
    target: 'Request',
    version: 'Version',
    expires: 'Expires',
    signerName: 'Signer full name',
    consent: 'I have read this agreement and explicitly consent to sign it electronically.',
    accept: 'Accept and sign',
    decline: 'Decline',
    submitting: 'Submitting...',
    successAccepted: 'Agreement accepted',
    successDeclined: 'Agreement declined',
    successBody: 'The office can now see this decision on the agreement history.',
    errorTitle: 'Agreement was not submitted',
    langEn: 'EN',
    langHe: 'עברית',
  },
  'he-IL': {
    eyebrow: 'קדנצה',
    title: 'חתימת הסכם',
    status: 'קישור הסכם מאובטח',
    loading: 'טוען הסכם...',
    unavailable: 'קישור ההסכם אינו זמין',
    target: 'בקשה',
    version: 'גרסה',
    expires: 'תוקף',
    signerName: 'שם מלא של החותם/ת',
    consent: 'קראתי את ההסכם ואני מסכים/ה במפורש לחתום עליו אלקטרונית.',
    accept: 'אישור וחתימה',
    decline: 'סירוב',
    submitting: 'שולח...',
    successAccepted: 'ההסכם נחתם',
    successDeclined: 'ההסכם סורב',
    successBody: 'המשרד יכול לראות כעת את ההחלטה בהיסטוריית ההסכמים.',
    errorTitle: 'ההסכם לא נשלח',
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

function isoDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export const PublicAgreementSigningForm: React.FC<Props> = ({ token }) => {
  const [language, setLanguage] = useState<PublicLanguage>(initialLanguage);
  const [loadResult, setLoadResult] = useState<PublicAgreementLoadResult | null>(null);
  const [submitResult, setSubmitResult] = useState<PublicAgreementSubmitResult | null>(null);
  const [signerName, setSignerName] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const copy = COPY[language];
  const isRtl = language === 'he-IL';
  const target = loadResult?.status === 'success' ? loadResult.target : null;
  const fieldErrors = submitResult?.status === 'error' ? submitResult.fieldErrors ?? {} : {};

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    localStorage.setItem('language', language);
  }, [language, isRtl]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadPublicAgreementSigningTarget(token).then(result => {
      if (!active) return;
      setLoadResult(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [token]);

  const submitDecision = async (action: 'ACCEPT' | 'DECLINE') => {
    if (!target) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const result = await submitPublicAgreementAcceptance({
        token,
        action,
        target: {
          acceptanceId: target.acceptance.id,
          templateId: target.template.id,
          studentId: target.acceptance.studentId,
          familyId: target.acceptance.familyId,
          enrollmentId: target.acceptance.enrollmentId,
          guardianId: target.acceptance.guardianId,
        },
        signer: {
          fullName: signerName,
        },
        consent: {
          confirmed: consentAccepted,
          accepted: action === 'ACCEPT' ? consentAccepted : false,
          agreementId: target.template.id,
        },
      });
      setSubmitResult(result);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-cadenza-500 focus:ring-2 focus:ring-cadenza-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
  const labelClass = 'mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300';

  const renderAgreement = (data: PublicAgreementSigningTarget) => (
    <form className="space-y-4" onSubmit={event => event.preventDefault()}>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <ShieldCheck size={14} className="text-cadenza-600 dark:text-cadenza-300" />
          <span>{copy.target}: {data.target.label || data.endpointLabel}</span>
          <span>{copy.version} {data.template.version}</span>
          {data.expiresAt && <span>{copy.expires}: <bdi>{isoDateTime(data.expiresAt)}</bdi></span>}
        </div>
        <h1 className="mt-3 text-xl font-bold text-slate-950 dark:text-white">{data.template.title}</h1>
        <div
          dir="auto"
          className="mt-4 max-h-[44vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          {data.template.body}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label className="block">
          <span className={labelClass}>{copy.signerName}</span>
          <input
            value={signerName}
            onChange={event => {
              setSignerName(event.target.value);
              if (submitResult?.status === 'error') setSubmitResult(null);
            }}
            className={inputClass}
            autoComplete="name"
          />
        </label>
        {fieldErrors.signer && <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-300">{fieldErrors.signer}</p>}

        <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={event => {
              setConsentAccepted(event.target.checked);
              if (submitResult?.status === 'error') setSubmitResult(null);
            }}
            className="mt-1"
          />
          <span>{copy.consent}</span>
        </label>
        {fieldErrors.consent && <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-300">{fieldErrors.consent}</p>}

        {submitResult?.status === 'error' && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle size={16} />
              {copy.errorTitle}
            </div>
            <p className="mt-1">{submitResult.message}</p>
          </div>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => submitDecision('ACCEPT')}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cadenza-gradient px-4 text-sm font-semibold text-white shadow-cadenza-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileSignature size={16} />}
            {submitting ? copy.submitting : copy.accept}
          </button>
          <button
            type="button"
            onClick={() => submitDecision('DECLINE')}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <XCircle size={16} />
            {copy.decline}
          </button>
        </div>
      </section>
    </form>
  );

  const successTitle = submitResult?.status === 'success' && submitResult.acceptanceStatus === 'ACCEPTED'
    ? copy.successAccepted
    : copy.successDeclined;

  return (
    <main
      dir={isRtl ? 'rtl' : 'ltr'}
      data-testid="public-agreement-page"
      className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-4 sm:py-8">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-cadenza-700 dark:text-cadenza-300">{copy.eyebrow}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{copy.status}</div>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <button type="button" onClick={() => setLanguage('en-US')} className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold ${language === 'en-US' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-300'}`}>
              <Languages size={13} />
              {copy.langEn}
            </button>
            <button type="button" onClick={() => setLanguage('he-IL')} className={`h-8 rounded-md px-2 text-xs font-semibold ${language === 'he-IL' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-300'}`}>
              {copy.langHe}
            </button>
          </div>
        </header>

        {loading && (
          <div role="status" className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <Loader2 size={18} className="animate-spin text-cadenza-600 dark:text-cadenza-300" />
            {copy.loading}
          </div>
        )}

        {!loading && loadResult?.status === 'error' && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            <div className="flex items-center gap-2 text-base font-semibold">
              <AlertCircle size={18} />
              {copy.unavailable}
            </div>
            <p className="mt-2">{loadResult.message}</p>
          </div>
        )}

        {!loading && submitResult?.status === 'success' && (
          <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-700 shadow-sm dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
            <div className="flex items-center gap-2 text-base font-semibold">
              <CheckCircle2 size={18} />
              {successTitle}
            </div>
            <p className="mt-2">{copy.successBody}</p>
            <p className="mt-2 text-xs"><bdi>{submitResult.acceptanceId}</bdi></p>
          </div>
        )}

        {!loading && target && submitResult?.status !== 'success' && renderAgreement(target)}
      </div>
    </main>
  );
};
