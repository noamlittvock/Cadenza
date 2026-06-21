import React, { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  LockKeyhole,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type { AppSettings, Student } from '../types';
import type { ActivityV2, StaffMemberV2 } from '../types/v2';
import type { Certificate, ExamSession, ExaminerSubmission, ReportCard, ReportCardLine } from '../types/blueprint';
import { generateId } from '../constants';
import { listExamSessions, listPendingCertificates } from '../utils/blueprintQueries';

type SyncSetter<T extends { id: string }> = (data: T[] | ((prev: T[]) => T[])) => Promise<void>;
type Language = 'en-US' | 'he-IL';
type SessionFilter = ExamSession['status'] | 'ALL';

interface Props {
  settings: AppSettings;
  orgId: string | null;
  actorId?: string | null;
  staffMembers: StaffMemberV2[];
  students: Student[];
  activities: ActivityV2[];
  examSessions: ExamSession[];
  setExamSessions: SyncSetter<ExamSession>;
  examinerSubmissions: ExaminerSubmission[];
  setExaminerSubmissions: SyncSetter<ExaminerSubmission>;
  certificates: Certificate[];
  setCertificates: SyncSetter<Certificate>;
  reportCards: ReportCard[];
  setReportCards: SyncSetter<ReportCard>;
  loading?: boolean;
  canManageAssessments: boolean;
}

interface SessionFormState {
  name: string;
  date: string;
  activityId: string;
  examinerStaffIds: string[];
  studentIds: string[];
  notes: string;
}

interface SubmissionFormState {
  studentId: string;
  score: string;
  grade: string;
  remarks: string;
}

interface CertificateFormState {
  studentId: string;
  title: string;
  level: string;
}

interface ReportCardFormState {
  studentId: string;
  periodLabel: string;
  activityId: string;
  subject: string;
  grade: string;
  comment: string;
  summary: string;
  guardianReleased: boolean;
}

const LABELS: Record<Language, Record<string, string>> = {
  'en-US': {
    title: 'Academic Assessments',
    subtitle: 'Private exam sessions, examiner submissions, certificates, and report-card drafts',
    search: 'Search sessions, students, examiners, or notes',
    allStatuses: 'All statuses',
    newSession: 'New session',
    saveSession: 'Save session',
    sessions: 'Sessions',
    examinerWorkspace: 'Examiner submissions',
    certificates: 'Certificates',
    reportCards: 'Report cards',
    name: 'Session name',
    date: 'Date',
    activity: 'Activity',
    examiners: 'Examiners',
    students: 'Students',
    notes: 'Notes',
    status: 'Status',
    student: 'Student',
    examiner: 'Examiner',
    score: 'Score',
    grade: 'Grade',
    remarks: 'Remarks',
    submit: 'Submit mark',
    createCertificate: 'Create pending certificate',
    issue: 'Issue',
    revoke: 'Revoke',
    level: 'Level',
    certificateTitle: 'Certificate title',
    createDraft: 'Create report-card draft',
    period: 'Period',
    subject: 'Subject',
    comment: 'Comment',
    summary: 'Summary',
    guardianRelease: 'Guardian release flag',
    privateDelivery: 'D-22 provisional: delivery remains private and guardian-facing output requires explicit release.',
    noSessionsTitle: 'No assessment sessions yet',
    noSessionsBody: 'Create a private session before collecting examiner submissions.',
    noMatchesTitle: 'No matching sessions',
    noMatchesBody: 'Adjust search or status filters.',
    loading: 'Loading assessment records...',
    deniedTitle: 'Assessment workspace is private',
    deniedBody: 'Admins manage assessment records. Assigned examiners can submit only their own session marks.',
    selectPrompt: 'Select a session to manage submissions, certificates, and report-card drafts.',
    saveError: 'Assessment change could not be saved.',
    missingProfile: 'No staff profile is linked to this user.',
    ownOnly: 'Assigned examiner scope',
    adminScope: 'Admin assessment scope',
    privateFileNote: 'Certificate and report-card documents stay in private storage. No public or tokenized delivery is enabled.',
  },
  'he-IL': {
    title: 'הערכות אקדמיות',
    subtitle: 'מועדי בחינה פרטיים, ציוני בוחנים, תעודות וטיוטות תעודות הערכה',
    search: 'חיפוש מועדים, תלמידים, בוחנים או הערות',
    allStatuses: 'כל הסטטוסים',
    newSession: 'מועד חדש',
    saveSession: 'שמירת מועד',
    sessions: 'מועדים',
    examinerWorkspace: 'הגשות בוחנים',
    certificates: 'תעודות',
    reportCards: 'תעודות הערכה',
    name: 'שם מועד',
    date: 'תאריך',
    activity: 'פעילות',
    examiners: 'בוחנים',
    students: 'תלמידים',
    notes: 'הערות',
    status: 'סטטוס',
    student: 'תלמיד',
    examiner: 'בוחן',
    score: 'ציון',
    grade: 'דרגה',
    remarks: 'הערות בוחן',
    submit: 'שליחת ציון',
    createCertificate: 'יצירת תעודה ממתינה',
    issue: 'הנפקה',
    revoke: 'ביטול',
    level: 'רמה',
    certificateTitle: 'כותרת תעודה',
    createDraft: 'יצירת טיוטת תעודת הערכה',
    period: 'תקופה',
    subject: 'נושא',
    comment: 'הערה',
    summary: 'סיכום',
    guardianRelease: 'דגל שחרור לאפוטרופוס',
    privateDelivery: 'D-22 זמני: המסירה נשארת פרטית ופלט לאפוטרופוס דורש שחרור מפורש.',
    noSessionsTitle: 'אין עדיין מועדי הערכה',
    noSessionsBody: 'צרו מועד פרטי לפני איסוף ציוני בוחנים.',
    noMatchesTitle: 'אין מועדים תואמים',
    noMatchesBody: 'שנו חיפוש או סטטוס.',
    loading: 'טוען רשומות הערכה...',
    deniedTitle: 'מרחב ההערכות פרטי',
    deniedBody: 'מנהלים מנהלים רשומות הערכה. בוחנים משויכים יכולים לשלוח רק ציונים למועדים שלהם.',
    selectPrompt: 'בחרו מועד לניהול הגשות, תעודות וטיוטות תעודות הערכה.',
    saveError: 'לא ניתן לשמור שינוי הערכה.',
    missingProfile: 'אין פרופיל צוות משויך למשתמש הזה.',
    ownOnly: 'היקף בוחן משויך',
    adminScope: 'היקף מנהל הערכות',
    privateFileNote: 'מסמכי תעודות והערכות נשארים באחסון פרטי. אין מסירה ציבורית או מבוססת אסימון.',
  },
};

const STATUS_OPTIONS: ExamSession['status'][] = ['SCHEDULED', 'IN_PROGRESS', 'GRADED', 'CANCELLED'];
const FIELD_CLASS = 'w-full rounded-md border border-[#d8c6ad] bg-white px-2.5 py-2 text-sm outline-none focus:border-[#1f3a5f] focus:ring-2 focus:ring-[#1f3a5f]/15 dark:border-slate-700 dark:bg-slate-900';
const BUTTON_CLASS = 'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition';

const languageOf = (settings: AppSettings): Language => settings.language === 'he-IL' ? 'he-IL' : 'en-US';
const labelFor = (language: Language, key: string) => LABELS[language][key] ?? LABELS['en-US'][key] ?? key;
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

function displayNameById<T extends { id: string; fullName?: string; name?: string }>(items: T[], id: string | null | undefined): string {
  if (!id) return '';
  const item = items.find(row => row.id === id);
  return item?.fullName ?? item?.name ?? id;
}

function resolveActorStaffId(staffMembers: StaffMemberV2[], actorId?: string | null): string | null {
  if (!actorId) return null;
  const actor = staffMembers.find(staff => staff.id === actorId || staff.uid === actorId);
  return actor?.id ?? null;
}

function makeBase(orgId: string, actorId?: string | null) {
  const now = nowIso();
  return {
    orgId,
    createdAt: now,
    updatedAt: now,
    createdBy: actorId ?? null,
    updatedBy: actorId ?? null,
  };
}

export const AssessmentWorkspace: React.FC<Props> = ({
  settings,
  orgId,
  actorId,
  staffMembers,
  students,
  activities,
  examSessions,
  setExamSessions,
  examinerSubmissions,
  setExaminerSubmissions,
  certificates,
  setCertificates,
  reportCards,
  setReportCards,
  loading = false,
  canManageAssessments,
}) => {
  const language = languageOf(settings);
  const tr = (key: string) => labelFor(language, key);
  const isRtl = language === 'he-IL';
  const actorStaffId = useMemo(() => resolveActorStaffId(staffMembers, actorId), [actorId, staffMembers]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SessionFilter>('ALL');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(examSessions[0]?.id ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<SessionFormState>({
    name: '',
    date: today(),
    activityId: '',
    examinerStaffIds: [],
    studentIds: [],
    notes: '',
  });
  const [submissionForm, setSubmissionForm] = useState<SubmissionFormState>({ studentId: '', score: '', grade: '', remarks: '' });
  const [certificateForm, setCertificateForm] = useState<CertificateFormState>({ studentId: '', title: '', level: '' });
  const [reportForm, setReportForm] = useState<ReportCardFormState>({
    studentId: '',
    periodLabel: '',
    activityId: '',
    subject: '',
    grade: '',
    comment: '',
    summary: '',
    guardianReleased: false,
  });

  const permittedSessions = useMemo(() => {
    if (canManageAssessments) return examSessions;
    if (!actorStaffId) return [];
    return examSessions.filter(session => session.examinerStaffIds.includes(actorStaffId));
  }, [actorStaffId, canManageAssessments, examSessions]);

  const rows = useMemo(() => {
    const q = normalize(query);
    return listExamSessions(permittedSessions, statusFilter === 'ALL' ? undefined : statusFilter)
      .filter(session => {
        if (!q) return true;
        const haystack = [
          session.name,
          session.notes ?? '',
          session.status,
          displayNameById(activities, session.activityId),
          ...session.studentIds.map(id => displayNameById(students, id)),
          ...session.examinerStaffIds.map(id => displayNameById(staffMembers, id)),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
  }, [activities, permittedSessions, query, staffMembers, statusFilter, students]);

  const selectedSession = useMemo(
    () => rows.find(session => session.id === selectedSessionId) ?? rows[0] ?? null,
    [rows, selectedSessionId],
  );

  const selectedSubmissions = useMemo(() => {
    if (!selectedSession) return [];
    return examinerSubmissions
      .filter(submission => submission.examSessionId === selectedSession.id)
      .sort((a, b) =>
        displayNameById(students, a.studentId).localeCompare(displayNameById(students, b.studentId))
        || displayNameById(staffMembers, a.examinerStaffId).localeCompare(displayNameById(staffMembers, b.examinerStaffId))
        || a.id.localeCompare(b.id),
      );
  }, [examinerSubmissions, selectedSession, staffMembers, students]);

  const pendingCertificates = useMemo(() => listPendingCertificates(certificates), [certificates]);
  const canSubmitForSelected = Boolean(selectedSession && actorStaffId && selectedSession.examinerStaffIds.includes(actorStaffId) && selectedSession.status !== 'GRADED' && selectedSession.status !== 'CANCELLED');
  const canEditSelected = canManageAssessments && selectedSession?.status !== 'GRADED';

  const saveSession = async () => {
    if (!orgId || !canManageAssessments || !sessionForm.name.trim() || !sessionForm.date || sessionForm.studentIds.length === 0) return;
    setSaveError(null);
    const base = makeBase(orgId, actorId);
    const next: ExamSession = {
      id: generateId(),
      ...base,
      name: sessionForm.name.trim(),
      date: sessionForm.date,
      activityId: sessionForm.activityId || null,
      status: 'SCHEDULED',
      examinerStaffIds: sessionForm.examinerStaffIds,
      studentIds: sessionForm.studentIds,
      notes: sessionForm.notes.trim() || null,
    };
    try {
      await setExamSessions(prev => [...prev, next]);
      setSelectedSessionId(next.id);
      setSessionForm({ name: '', date: today(), activityId: '', examinerStaffIds: [], studentIds: [], notes: '' });
    } catch {
      setSaveError(tr('saveError'));
    }
  };

  const updateSessionStatus = async (status: ExamSession['status']) => {
    if (!canManageAssessments || !selectedSession) return;
    const stamp = nowIso();
    await setExamSessions(prev => prev.map(session => session.id === selectedSession.id ? { ...session, status, updatedAt: stamp, updatedBy: actorId ?? null } : session));
  };

  const submitMark = async () => {
    if (!orgId || !selectedSession || !actorStaffId || !submissionForm.studentId || !canSubmitForSelected) return;
    const score = submissionForm.score.trim() === '' ? null : Number(submissionForm.score);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) return;
    const existing = examinerSubmissions.find(row =>
      row.examSessionId === selectedSession.id
      && row.studentId === submissionForm.studentId
      && row.examinerStaffId === actorStaffId,
    );
    const stamp = nowIso();
    const next: ExaminerSubmission = {
      ...(existing ?? {
        id: generateId(),
        ...makeBase(orgId, actorId),
        examSessionId: selectedSession.id,
        studentId: submissionForm.studentId,
        examinerStaffId: actorStaffId,
      }),
      score,
      grade: submissionForm.grade.trim() || null,
      remarks: submissionForm.remarks.trim() || null,
      submittedAt: stamp,
      updatedAt: stamp,
      updatedBy: actorId ?? null,
    };
    await setExaminerSubmissions(prev => existing ? prev.map(row => row.id === existing.id ? next : row) : [...prev, next]);
    setSubmissionForm({ studentId: '', score: '', grade: '', remarks: '' });
  };

  const createCertificate = async () => {
    if (!orgId || !canManageAssessments || !certificateForm.studentId || !certificateForm.title.trim()) return;
    const next: Certificate = {
      id: generateId(),
      ...makeBase(orgId, actorId),
      studentId: certificateForm.studentId,
      examSessionId: selectedSession?.id ?? null,
      title: certificateForm.title.trim(),
      level: certificateForm.level.trim() || null,
      status: 'PENDING',
      issuedAt: null,
      documentUrl: null,
      documentPath: null,
    };
    await setCertificates(prev => [...prev, next]);
    setCertificateForm({ studentId: '', title: '', level: '' });
  };

  const updateCertificateStatus = async (certificateId: string, status: Certificate['status']) => {
    if (!canManageAssessments) return;
    const stamp = nowIso();
    await setCertificates(prev => prev.map(cert => cert.id === certificateId ? {
      ...cert,
      status,
      issuedAt: status === 'ISSUED' ? (cert.issuedAt ?? stamp) : cert.issuedAt,
      updatedAt: stamp,
      updatedBy: actorId ?? null,
    } : cert));
  };

  const createReportCard = async () => {
    if (!orgId || !canManageAssessments || !reportForm.studentId || !reportForm.periodLabel.trim() || !reportForm.subject.trim()) return;
    const line: ReportCardLine = {
      subject: reportForm.subject.trim(),
      grade: reportForm.grade.trim() || null,
      comment: reportForm.comment.trim() || null,
    };
    const next: ReportCard = {
      id: generateId(),
      ...makeBase(orgId, actorId),
      studentId: reportForm.studentId,
      periodLabel: reportForm.periodLabel.trim(),
      activityId: reportForm.activityId || null,
      lines: [line],
      summary: reportForm.summary.trim() || null,
      publishedAt: reportForm.guardianReleased ? nowIso() : null,
    };
    await setReportCards(prev => [...prev, next]);
    setReportForm({ studentId: '', periodLabel: '', activityId: '', subject: '', grade: '', comment: '', summary: '', guardianReleased: false });
  };

  const toggleMulti = <T extends string,>(values: T[], value: T) =>
    values.includes(value) ? values.filter(item => item !== value) : [...values, value];

  if (loading) {
    return <div className="p-6 text-sm text-slate-600 dark:text-slate-300">{tr('loading')}</div>;
  }

  if (!canManageAssessments && !actorStaffId) {
    return (
      <div className="h-full overflow-auto bg-[#f7f1e8] p-6 dark:bg-slate-950" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-center gap-2 font-bold"><LockKeyhole size={18} />{tr('deniedTitle')}</div>
          <p className="mt-1 text-sm">{tr('missingProfile')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[#f7f1e8] text-slate-900 dark:bg-slate-950 dark:text-slate-100" dir={isRtl ? 'rtl' : 'ltr'} data-testid="assessment-workspace">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:p-6">
        <header className="flex flex-col gap-3 border-b border-[#d8c6ad] pb-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-[#8a1538] dark:text-rose-200">
              <ShieldCheck size={16} /> {canManageAssessments ? tr('adminScope') : tr('ownOnly')}
            </div>
            <h1 className="mt-1 text-xl font-bold text-[#2f241b] dark:text-white">{tr('title')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{tr('subtitle')}</p>
          </div>
          <div className="rounded-md border border-[#d8c6ad] bg-white/70 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <div className="flex items-center gap-2 font-semibold"><LockKeyhole size={14} />{tr('privateDelivery')}</div>
            <div className="mt-1">{tr('privateFileNote')}</div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
          <section className="rounded-lg border border-[#d8c6ad] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-[#eadcc8] p-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute start-2.5 top-2.5 text-slate-400" size={16} />
                  <input className={`${FIELD_CLASS} ps-8`} value={query} onChange={event => setQuery(event.target.value)} placeholder={tr('search')} />
                </div>
                <select className={FIELD_CLASS} value={statusFilter} onChange={event => setStatusFilter(event.target.value as SessionFilter)}>
                  <option value="ALL">{tr('allStatuses')}</option>
                  {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto p-2">
              {rows.length === 0 && (
                <div className="rounded-lg border border-dashed border-[#d8c6ad] p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  <h2 className="font-bold text-slate-900 dark:text-white">{permittedSessions.length === 0 ? tr('noSessionsTitle') : tr('noMatchesTitle')}</h2>
                  <p className="mt-1">{permittedSessions.length === 0 ? tr('noSessionsBody') : tr('noMatchesBody')}</p>
                </div>
              )}
              {rows.map(session => {
                const submitted = examinerSubmissions.filter(row => row.examSessionId === session.id && row.submittedAt).length;
                const expected = session.studentIds.length * Math.max(1, session.examinerStaffIds.length);
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`mb-2 w-full rounded-lg border p-3 text-start transition ${selectedSession?.id === session.id ? 'border-[#8a1538] bg-[#8a1538]/5' : 'border-[#eadcc8] bg-white hover:border-[#8a1538]/40 dark:border-slate-800 dark:bg-slate-900'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#2f241b] dark:text-white">{session.name}</span>
                      <span className="rounded border border-[#d8c6ad] px-2 py-0.5 text-[11px] font-bold text-[#1f3a5f] dark:border-slate-700 dark:text-sky-200">{session.status}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{session.date} · {displayNameById(activities, session.activityId) || '-'}</div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <UserCheck size={14} /> {session.studentIds.length} {tr('students')} · {submitted}/{expected} {tr('submit')}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <main className="space-y-4">
            {canManageAssessments && (
              <section className="rounded-lg border border-[#d8c6ad] bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase text-[#1f3a5f] dark:text-sky-200"><Plus size={16} />{tr('newSession')}</h2>
                {saveError && <p className="mt-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-sm text-rose-800">{saveError}</p>}
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <label className="text-sm font-semibold">{tr('name')}<input className={FIELD_CLASS} value={sessionForm.name} onChange={event => setSessionForm(prev => ({ ...prev, name: event.target.value }))} /></label>
                  <label className="text-sm font-semibold">{tr('date')}<input type="date" className={FIELD_CLASS} value={sessionForm.date} onChange={event => setSessionForm(prev => ({ ...prev, date: event.target.value }))} /></label>
                  <label className="text-sm font-semibold lg:col-span-2">{tr('activity')}
                    <select className={FIELD_CLASS} value={sessionForm.activityId} onChange={event => setSessionForm(prev => ({ ...prev, activityId: event.target.value }))}>
                      <option value="">-</option>
                      {activities.map(activity => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
                    </select>
                  </label>
                  <div className="rounded-md border border-[#eadcc8] p-3 dark:border-slate-800">
                    <div className="mb-2 text-sm font-bold">{tr('examiners')}</div>
                    <div className="max-h-32 space-y-1 overflow-auto">
                      {staffMembers.map(staff => (
                        <label key={staff.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={sessionForm.examinerStaffIds.includes(staff.id)} onChange={() => setSessionForm(prev => ({ ...prev, examinerStaffIds: toggleMulti(prev.examinerStaffIds, staff.id) }))} />
                          <span>{staff.fullName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-md border border-[#eadcc8] p-3 dark:border-slate-800">
                    <div className="mb-2 text-sm font-bold">{tr('students')}</div>
                    <div className="max-h-32 space-y-1 overflow-auto">
                      {students.map(student => (
                        <label key={student.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={sessionForm.studentIds.includes(student.id)} onChange={() => setSessionForm(prev => ({ ...prev, studentIds: toggleMulti(prev.studentIds, student.id) }))} />
                          <span>{student.fullName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="text-sm font-semibold lg:col-span-2">{tr('notes')}<textarea className={FIELD_CLASS} rows={2} value={sessionForm.notes} onChange={event => setSessionForm(prev => ({ ...prev, notes: event.target.value }))} /></label>
                </div>
                <button className={`${BUTTON_CLASS} mt-3 bg-[#8a1538] text-white hover:bg-[#6f102c]`} onClick={saveSession}><Plus size={16} />{tr('saveSession')}</button>
              </section>
            )}

            {!selectedSession && (
              <section className="rounded-lg border border-dashed border-[#d8c6ad] bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {tr('selectPrompt')}
              </section>
            )}

            {selectedSession && (
              <>
                <section className="rounded-lg border border-[#d8c6ad] bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-[#2f241b] dark:text-white">{selectedSession.name}</h2>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{selectedSession.date} · {displayNameById(activities, selectedSession.activityId) || '-'}</p>
                      <p className="mt-1 text-sm">{selectedSession.notes}</p>
                    </div>
                    {canManageAssessments && (
                      <div className="flex flex-wrap gap-2">
                        {STATUS_OPTIONS.map(status => (
                          <button key={status} className={`${BUTTON_CLASS} border border-[#d8c6ad] ${selectedSession.status === status ? 'bg-[#1f3a5f] text-white' : 'bg-white text-slate-700 dark:bg-slate-950 dark:text-slate-200'}`} onClick={() => updateSessionStatus(status)}>
                            {status}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-[#d8c6ad] bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="flex items-center gap-2 text-sm font-bold uppercase text-[#1f3a5f] dark:text-sky-200"><ClipboardCheck size={16} />{tr('examinerWorkspace')}</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="text-xs uppercase text-slate-500">
                        <tr><th className="p-2 text-start">{tr('student')}</th><th className="p-2 text-start">{tr('examiner')}</th><th className="p-2 text-start">{tr('score')}</th><th className="p-2 text-start">{tr('grade')}</th><th className="p-2 text-start">{tr('remarks')}</th></tr>
                      </thead>
                      <tbody className="divide-y divide-[#eadcc8] dark:divide-slate-800">
                        {selectedSubmissions.map(row => (
                          <tr key={row.id}>
                            <td className="p-2 font-semibold">{displayNameById(students, row.studentId)}</td>
                            <td className="p-2">{displayNameById(staffMembers, row.examinerStaffId)}</td>
                            <td className="p-2">{row.score ?? '-'}</td>
                            <td className="p-2">{row.grade ?? '-'}</td>
                            <td className="p-2">{row.remarks ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {canSubmitForSelected ? (
                    <div className="mt-3 grid gap-2 rounded-md border border-[#eadcc8] p-3 dark:border-slate-800 lg:grid-cols-[1fr_120px_120px_1fr_auto]">
                      <select aria-label={tr('student')} className={FIELD_CLASS} value={submissionForm.studentId} onChange={event => setSubmissionForm(prev => ({ ...prev, studentId: event.target.value }))}>
                        <option value="">{tr('student')}</option>
                        {selectedSession.studentIds.map(id => <option key={id} value={id}>{displayNameById(students, id)}</option>)}
                      </select>
                      <input aria-label={tr('score')} className={FIELD_CLASS} value={submissionForm.score} onChange={event => setSubmissionForm(prev => ({ ...prev, score: event.target.value }))} placeholder={tr('score')} />
                      <input aria-label={tr('grade')} className={FIELD_CLASS} value={submissionForm.grade} onChange={event => setSubmissionForm(prev => ({ ...prev, grade: event.target.value }))} placeholder={tr('grade')} />
                      <input aria-label={tr('remarks')} className={FIELD_CLASS} value={submissionForm.remarks} onChange={event => setSubmissionForm(prev => ({ ...prev, remarks: event.target.value }))} placeholder={tr('remarks')} />
                      <button className={`${BUTTON_CLASS} bg-[#1f3a5f] text-white hover:bg-[#162b47]`} onClick={submitMark}><Send size={16} />{tr('submit')}</button>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-md border border-[#eadcc8] bg-[#fbf7ef] p-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">{tr('deniedBody')}</p>
                  )}
                </section>

                {canManageAssessments && (
                  <section className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border border-[#d8c6ad] bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <h2 className="flex items-center gap-2 text-sm font-bold uppercase text-[#1f3a5f] dark:text-sky-200"><Award size={16} />{tr('certificates')}</h2>
                      <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1fr_100px_auto]">
                        <select aria-label={tr('student')} className={FIELD_CLASS} value={certificateForm.studentId} onChange={event => setCertificateForm(prev => ({ ...prev, studentId: event.target.value }))}>
                          <option value="">{tr('student')}</option>
                          {selectedSession.studentIds.map(id => <option key={id} value={id}>{displayNameById(students, id)}</option>)}
                        </select>
                        <input aria-label={tr('certificateTitle')} className={FIELD_CLASS} value={certificateForm.title} onChange={event => setCertificateForm(prev => ({ ...prev, title: event.target.value }))} placeholder={tr('certificateTitle')} />
                        <input aria-label={tr('level')} className={FIELD_CLASS} value={certificateForm.level} onChange={event => setCertificateForm(prev => ({ ...prev, level: event.target.value }))} placeholder={tr('level')} />
                        <button className={`${BUTTON_CLASS} bg-[#8a1538] text-white`} onClick={createCertificate}><Plus size={16} />{tr('createCertificate')}</button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {certificates.filter(cert => cert.examSessionId === selectedSession.id || pendingCertificates.some(p => p.id === cert.id)).map(cert => (
                          <div key={cert.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#eadcc8] p-2 text-sm dark:border-slate-800">
                            <span><strong>{cert.title}</strong> · {displayNameById(students, cert.studentId)} · {cert.status}</span>
                            <span className="flex gap-2">
                              {cert.status === 'PENDING' && <button className={`${BUTTON_CLASS} border border-emerald-300 text-emerald-700`} onClick={() => updateCertificateStatus(cert.id, 'ISSUED')}><CheckCircle2 size={14} />{tr('issue')}</button>}
                              {cert.status !== 'REVOKED' && <button className={`${BUTTON_CLASS} border border-amber-300 text-amber-700`} onClick={() => updateCertificateStatus(cert.id, 'REVOKED')}>{tr('revoke')}</button>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-[#d8c6ad] bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <h2 className="flex items-center gap-2 text-sm font-bold uppercase text-[#1f3a5f] dark:text-sky-200"><FileText size={16} />{tr('reportCards')}</h2>
                      <div className="mt-3 grid gap-2 lg:grid-cols-2">
                        <select aria-label={tr('student')} className={FIELD_CLASS} value={reportForm.studentId} onChange={event => setReportForm(prev => ({ ...prev, studentId: event.target.value }))}>
                          <option value="">{tr('student')}</option>
                          {selectedSession.studentIds.map(id => <option key={id} value={id}>{displayNameById(students, id)}</option>)}
                        </select>
                        <input aria-label={tr('period')} className={FIELD_CLASS} value={reportForm.periodLabel} onChange={event => setReportForm(prev => ({ ...prev, periodLabel: event.target.value }))} placeholder={tr('period')} />
                        <input aria-label={tr('subject')} className={FIELD_CLASS} value={reportForm.subject} onChange={event => setReportForm(prev => ({ ...prev, subject: event.target.value }))} placeholder={tr('subject')} />
                        <input aria-label={tr('grade')} className={FIELD_CLASS} value={reportForm.grade} onChange={event => setReportForm(prev => ({ ...prev, grade: event.target.value }))} placeholder={tr('grade')} />
                        <input aria-label={tr('comment')} className={`${FIELD_CLASS} lg:col-span-2`} value={reportForm.comment} onChange={event => setReportForm(prev => ({ ...prev, comment: event.target.value }))} placeholder={tr('comment')} />
                        <textarea aria-label={tr('summary')} className={`${FIELD_CLASS} lg:col-span-2`} rows={2} value={reportForm.summary} onChange={event => setReportForm(prev => ({ ...prev, summary: event.target.value }))} placeholder={tr('summary')} />
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <input type="checkbox" checked={reportForm.guardianReleased} onChange={() => setReportForm(prev => ({ ...prev, guardianReleased: !prev.guardianReleased }))} />
                          {tr('guardianRelease')}
                        </label>
                      </div>
                      <button className={`${BUTTON_CLASS} mt-3 bg-[#8a1538] text-white`} onClick={createReportCard}><Plus size={16} />{tr('createDraft')}</button>
                      <div className="mt-3 space-y-2">
                        {reportCards.filter(card => selectedSession.studentIds.includes(card.studentId)).map(card => (
                          <div key={card.id} className="rounded-md border border-[#eadcc8] p-2 text-sm dark:border-slate-800">
                            <strong>{displayNameById(students, card.studentId)}</strong> · {card.periodLabel} · {card.publishedAt ? tr('guardianRelease') : 'Private draft'}
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
