import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSignature,
  FileUp,
  Filter,
  History,
  Layers3,
  Plus,
  RotateCcw,
  ScrollText,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type { AppSettings, Student } from '../types';
import type { AcceptanceStatus, AgreementAcceptance, AgreementKind, AgreementTemplate, Family } from '../types/blueprint';
import { generateId } from '../constants';
import { listUnsignedAgreements, type RequiredAgreementTarget } from '../utils/blueprintQueries';
import { uploadAgreementPdf } from '../utils/storageUtils';
import { Modal } from './Modal';

type SyncSetter<T extends { id: string }> = (data: T[] | ((prev: T[]) => T[])) => Promise<void>;
type Language = 'en-US' | 'he-IL';
type TemplateFilter = AgreementKind | 'ALL';
type StatusFilter = 'all' | 'active' | 'inactive' | 'guardian';
type RequestTargetType = 'student' | 'family' | 'enrollment';

interface Props {
  settings: AppSettings;
  orgId: string | null;
  actorId?: string | null;
  students: Student[];
  families: Family[];
  templates: AgreementTemplate[];
  setTemplates: SyncSetter<AgreementTemplate>;
  acceptances: AgreementAcceptance[];
  setAcceptances: SyncSetter<AgreementAcceptance>;
  loading?: boolean;
}

interface TemplateFormState {
  kind: AgreementKind;
  title: string;
  version: string;
  body: string;
  requiresGuardian: boolean;
  isActive: boolean;
}

interface RequestFormState {
  templateId: string;
  targetType: RequestTargetType;
  studentId: string;
  familyId: string;
  enrollmentId: string;
  guardianId: string;
}

interface PdfCaptureState {
  signerName: string;
  reference: string;
  file: File | null;
}

export interface AgreementTemplateSummary extends AgreementTemplate {
  pendingCount: number;
  acceptedCount: number;
  declinedCount: number;
  expiredCount: number;
  supersededCount: number;
  missingCount: number;
  latestAcceptedAt: string | null;
}

const KIND_OPTIONS: AgreementKind[] = ['ENROLLMENT', 'CONSENT', 'MEDIA_RELEASE', 'INSTRUMENT_LOAN', 'FINANCIAL', 'OTHER'];
const ACCEPTANCE_STATUSES: AcceptanceStatus[] = ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED'];

const LABELS: Record<Language, Record<string, string>> = {
  'en-US': {
    title: 'Agreements',
    subtitle: 'Template versions, requests, and unsigned queue',
    search: 'Search templates, body, targets, or signer',
    allKinds: 'All kinds',
    allTemplates: 'All templates',
    allStatuses: 'All',
    activeOnly: 'Active',
    inactiveOnly: 'Inactive',
    guardianOnly: 'Guardian required',
    newTemplate: 'New template',
    versionTemplate: 'New version',
    activate: 'Activate',
    deactivate: 'Deactivate',
    issueRequest: 'Issue request',
    unsignedQueue: 'Unsigned queue',
    templates: 'Templates',
    requests: 'Requests',
    activeTemplates: 'Active',
    pendingRequests: 'Pending',
    acceptedRequests: 'Accepted',
    missingSignatures: 'Unsigned',
    noTemplatesTitle: 'No agreement templates yet',
    noTemplatesBody: 'Create an active template before issuing agreement requests.',
    noMatchesTitle: 'No matching agreements',
    noMatchesBody: 'Adjust search or filters to widen the list.',
    noUnsignedTitle: 'No unsigned active templates',
    noUnsignedBody: 'Current student and family targets have accepted the active templates shown here.',
    loading: 'Loading agreement records...',
    saveError: 'Agreement changes could not be saved.',
    templateBody: 'Template body',
    titleField: 'Title',
    kind: 'Kind',
    version: 'Version',
    requiresGuardian: 'Requires guardian',
    active: 'Active',
    inactive: 'Inactive',
    status: 'Status',
    target: 'Target',
    signer: 'Signer',
    signatureRef: 'Signature reference',
    capturePdf: 'Capture PDF',
    pdfTitle: 'Countersigned PDF',
    pdfSigner: 'Countersigned by',
    pdfReference: 'Private file/reference',
    pdfReferenceHint: 'Upload a PDF or paste a private storage/reference path.',
    pdfFile: 'PDF file',
    savePdf: 'Save PDF reference',
    uploadFailed: 'PDF upload failed. Use a private reference or try again.',
    history: 'History',
    emptyBodyHint: 'Paste policy, terms, or consent language. Hebrew and English text is stored as typed.',
    create: 'Create',
    saveVersion: 'Create version',
    cancel: 'Cancel',
    targetType: 'Target type',
    student: 'Student',
    family: 'Family',
    enrollment: 'Enrollment',
    enrollmentId: 'Enrollment ID',
    guardian: 'Guardian',
    optional: 'Optional',
    issue: 'Issue',
    neverAccepted: 'Never accepted',
    supersededVersion: 'Superseded version',
    accepted: 'Accepted',
    declined: 'Declined',
    expired: 'Expired',
    superseded: 'Superseded',
    pending: 'Pending',
    noTarget: 'No target selected',
    blockedNote: 'Withdrawal, media-release publication rules, assessment delivery consent, and instrument deposit terms remain blocked by pending decisions.',
  },
  'he-IL': {
    title: 'הסכמים',
    subtitle: 'גרסאות תבניות, בקשות ותור חסרים',
    search: 'חיפוש תבניות, גוף, יעדים או חותם',
    allKinds: 'כל הסוגים',
    allTemplates: 'כל התבניות',
    allStatuses: 'הכול',
    activeOnly: 'פעילות',
    inactiveOnly: 'לא פעילות',
    guardianOnly: 'דורש אפוטרופוס',
    newTemplate: 'תבנית חדשה',
    versionTemplate: 'גרסה חדשה',
    activate: 'הפעל',
    deactivate: 'כבה',
    issueRequest: 'הוצאת בקשה',
    unsignedQueue: 'תור חסרים',
    templates: 'תבניות',
    requests: 'בקשות',
    activeTemplates: 'פעילות',
    pendingRequests: 'ממתינות',
    acceptedRequests: 'חתומות',
    missingSignatures: 'חסרות',
    noTemplatesTitle: 'אין עדיין תבניות הסכם',
    noTemplatesBody: 'צור תבנית פעילה לפני הוצאת בקשות הסכם.',
    noMatchesTitle: 'אין הסכמים תואמים',
    noMatchesBody: 'שנה חיפוש או מסננים כדי להרחיב את הרשימה.',
    noUnsignedTitle: 'אין תבניות פעילות חסרות חתימה',
    noUnsignedBody: 'יעדי התלמידים והמשפחות הנוכחיים חתמו על התבניות הפעילות המוצגות כאן.',
    loading: 'טוען רשומות הסכמים...',
    saveError: 'לא ניתן לשמור את שינויי ההסכמים.',
    templateBody: 'גוף התבנית',
    titleField: 'כותרת',
    kind: 'סוג',
    version: 'גרסה',
    requiresGuardian: 'דורש אפוטרופוס',
    active: 'פעיל',
    inactive: 'לא פעיל',
    status: 'סטטוס',
    target: 'יעד',
    signer: 'חותם',
    signatureRef: 'אסמכתת חתימה',
    capturePdf: 'תיעוד PDF',
    pdfTitle: 'PDF חתום נגדית',
    pdfSigner: 'נחתם נגדית על ידי',
    pdfReference: 'קובץ/אסמכתה פרטית',
    pdfReferenceHint: 'העלה PDF או הדבק נתיב/אסמכתה פרטיים.',
    pdfFile: 'קובץ PDF',
    savePdf: 'שמור אסמכתת PDF',
    uploadFailed: 'העלאת PDF נכשלה. השתמש באסמכתה פרטית או נסה שוב.',
    history: 'היסטוריה',
    emptyBodyHint: 'הדבק מדיניות, תנאים או נוסח הסכמה. עברית ואנגלית נשמרות כפי שהוקלדו.',
    create: 'צור',
    saveVersion: 'צור גרסה',
    cancel: 'ביטול',
    targetType: 'סוג יעד',
    student: 'תלמיד',
    family: 'משפחה',
    enrollment: 'רישום',
    enrollmentId: 'מזהה רישום',
    guardian: 'אפוטרופוס',
    optional: 'אופציונלי',
    issue: 'הוצא',
    neverAccepted: 'לא נחתם',
    supersededVersion: 'גרסה הוחלפה',
    accepted: 'נחתם',
    declined: 'סורב',
    expired: 'פג תוקף',
    superseded: 'הוחלף',
    pending: 'ממתין',
    noTarget: 'לא נבחר יעד',
    blockedNote: 'ביטול הסכמה, כללי פרסום מדיה, הסכמת מסירת הערכות ותנאי פיקדון כלי עדיין חסומים בהחלטות פתוחות.',
  },
};

const nowIso = () => new Date().toISOString();
const languageOf = (settings: AppSettings): Language => settings.language === 'he-IL' ? 'he-IL' : 'en-US';
const labelFor = (language: Language, key: string) => LABELS[language][key] ?? LABELS['en-US'][key] ?? key;
const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

function familyForStudent(families: Family[], studentId: string | null | undefined): Family | null {
  if (!studentId) return null;
  return families.find(family => family.studentIds.includes(studentId)) ?? null;
}

function guardianName(family: Family | null, guardianId: string | null | undefined): string {
  if (!family || !guardianId) return '';
  return family.guardians.find(guardian => guardian.id === guardianId)?.fullName ?? guardianId;
}

function targetLabel(
  acceptance: Pick<AgreementAcceptance, 'studentId' | 'familyId' | 'enrollmentId' | 'guardianId'>,
  students: Student[],
  families: Family[],
): string {
  const parts: string[] = [];
  if (acceptance.studentId) parts.push(students.find(student => student.id === acceptance.studentId)?.fullName ?? acceptance.studentId);
  if (acceptance.familyId) parts.push(families.find(family => family.id === acceptance.familyId)?.name ?? acceptance.familyId);
  if (acceptance.enrollmentId) parts.push(acceptance.enrollmentId);
  if (acceptance.guardianId) {
    const family = acceptance.familyId ? families.find(item => item.id === acceptance.familyId) ?? null : null;
    parts.push(guardianName(family, acceptance.guardianId) || acceptance.guardianId);
  }
  return parts.join(' · ');
}

export function buildAgreementUnsignedTargets(
  template: Pick<AgreementTemplate, 'kind'>,
  students: Student[],
  families: Family[],
): RequiredAgreementTarget[] {
  if (template.kind === 'FINANCIAL') {
    return families
      .filter(family => !family.isArchived)
      .map(family => ({ studentId: null, familyId: family.id, guardianId: family.primaryContactGuardianId ?? undefined, kind: template.kind }));
  }
  return students
    .filter(student => student.profileStatus !== 'ARCHIVED')
    .map(student => {
      const family = familyForStudent(families, student.id);
      return {
        studentId: student.id,
        familyId: family?.id ?? undefined,
        guardianId: family?.primaryContactGuardianId ?? undefined,
        kind: template.kind,
      };
    });
}

export function buildAgreementTemplateSummaries(
  templates: AgreementTemplate[],
  acceptances: AgreementAcceptance[],
  students: Student[],
  families: Family[],
): AgreementTemplateSummary[] {
  return templates
    .map(template => {
      const rows = acceptances.filter(acceptance => acceptance.templateId === template.id);
      const unsigned = listUnsignedAgreements(
        [template],
        acceptances,
        buildAgreementUnsignedTargets(template, students, families),
      );
      return {
        ...template,
        pendingCount: rows.filter(row => row.status === 'PENDING').length,
        acceptedCount: rows.filter(row => row.status === 'ACCEPTED').length,
        declinedCount: rows.filter(row => row.status === 'DECLINED').length,
        expiredCount: rows.filter(row => row.status === 'EXPIRED').length,
        supersededCount: rows.filter(row => row.status === 'SUPERSEDED').length,
        missingCount: unsigned.length,
        latestAcceptedAt: rows
          .filter(row => row.status === 'ACCEPTED' && row.acceptedAt)
          .map(row => row.acceptedAt as string)
          .sort()
          .at(-1) ?? null,
      };
    })
    .sort((a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      a.kind.localeCompare(b.kind) ||
      a.title.localeCompare(b.title) ||
      b.version - a.version ||
      a.id.localeCompare(b.id));
}

export function filterAgreementTemplateSummaries(
  summaries: AgreementTemplateSummary[],
  acceptances: AgreementAcceptance[],
  students: Student[],
  families: Family[],
  filters: { query: string; kind: TemplateFilter; status: StatusFilter },
): AgreementTemplateSummary[] {
  const query = normalize(filters.query);
  return summaries.filter(summary => {
    if (filters.kind !== 'ALL' && summary.kind !== filters.kind) return false;
    if (filters.status === 'active' && !summary.isActive) return false;
    if (filters.status === 'inactive' && summary.isActive) return false;
    if (filters.status === 'guardian' && !summary.requiresGuardian) return false;
    if (!query) return true;
    const requestText = acceptances
      .filter(acceptance => acceptance.templateId === summary.id)
      .map(acceptance => [
        acceptance.status,
        acceptance.acceptedByName,
        acceptance.signatureRef,
        targetLabel(acceptance, students, families),
      ].join(' '))
      .join(' ');
    return [
      summary.kind,
      summary.title,
      summary.body,
      summary.version,
      summary.isActive ? 'active' : 'inactive',
      requestText,
    ].some(value => normalize(String(value)).includes(query));
  });
}

export function buildNextAgreementTemplateVersion(
  current: AgreementTemplate,
  input: Pick<AgreementTemplate, 'title' | 'kind' | 'body' | 'requiresGuardian'>,
  options: { id: string; now: string; actorId?: string | null },
): AgreementTemplate {
  return {
    ...current,
    id: options.id,
    kind: input.kind,
    title: input.title.trim(),
    version: current.version + 1,
    body: input.body,
    isActive: true,
    supersedesVersion: current.version,
    requiresGuardian: input.requiresGuardian,
    createdAt: options.now,
    updatedAt: options.now,
    createdBy: options.actorId ?? current.createdBy ?? null,
    updatedBy: options.actorId ?? current.updatedBy ?? null,
  };
}

export function buildPendingAgreementRequest(
  template: AgreementTemplate,
  input: {
    id: string;
    orgId: string;
    now: string;
    actorId?: string | null;
    studentId?: string | null;
    familyId?: string | null;
    enrollmentId?: string | null;
    guardianId?: string | null;
  },
): AgreementAcceptance {
  if (!input.studentId && !input.familyId && !input.enrollmentId) {
    throw new Error('Agreement request requires a student, family, or enrollment target.');
  }
  return {
    id: input.id,
    orgId: input.orgId,
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.actorId ?? null,
    updatedBy: input.actorId ?? null,
    templateId: template.id,
    templateVersion: template.version,
    studentId: input.studentId ?? null,
    familyId: input.familyId ?? null,
    enrollmentId: input.enrollmentId ?? null,
    guardianId: input.guardianId ?? null,
    status: 'PENDING',
    acceptedAt: null,
    acceptedByName: null,
    signatureRef: null,
  };
}

export function buildAgreementPdfAcceptanceUpdate(
  acceptance: AgreementAcceptance,
  input: {
    now: string;
    actorId?: string | null;
    signerName: string;
    signatureRef: string;
  },
): AgreementAcceptance {
  const signerName = input.signerName.trim();
  const signatureRef = input.signatureRef.trim();
  if (!signerName) throw new Error('Countersigned PDF capture requires a signer name.');
  if (!signatureRef) throw new Error('Countersigned PDF capture requires a private file reference.');
  return {
    ...acceptance,
    status: 'ACCEPTED',
    acceptedAt: input.now,
    acceptedByName: signerName,
    signatureRef,
    updatedAt: input.now,
    updatedBy: input.actorId ?? acceptance.updatedBy ?? null,
  };
}

const Stat = ({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
      <Icon size={14} className="text-cadenza-600 dark:text-cadenza-300" />
      <span>{label}</span>
    </div>
    <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{value}</div>
  </div>
);

const StatePanel = ({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <Icon size={28} className="mx-auto mb-3 text-slate-400" />
    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
    <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">{body}</p>
  </div>
);

const LoadingRows = () => (
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    {Array.from({ length: 5 }).map((_, index) => (
      <div key={index} className="grid grid-cols-12 gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-slate-800">
        <div className="col-span-3 h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-3 h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-2 h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-2 h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-2 h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    ))}
  </div>
);

const Chip = ({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) => {
  const cls = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    green: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300',
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  }[tone];
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
};

export const AgreementManager: React.FC<Props> = ({
  settings,
  orgId,
  actorId,
  students,
  families,
  templates,
  setTemplates,
  acceptances,
  setAcceptances,
  loading = false,
}) => {
  const language = languageOf(settings);
  const isRtl = language === 'he-IL';
  const l = (key: string) => labelFor(language, key);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<TemplateFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateModalMode, setTemplateModalMode] = useState<'create' | 'version' | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [pdfAcceptanceId, setPdfAcceptanceId] = useState<string | null>(null);
  const [pdfCapture, setPdfCapture] = useState<PdfCaptureState>({ signerName: '', reference: '', file: null });
  const [pdfUploading, setPdfUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>({
    kind: 'ENROLLMENT',
    title: '',
    version: '1',
    body: '',
    requiresGuardian: true,
    isActive: true,
  });
  const [requestForm, setRequestForm] = useState<RequestFormState>({
    templateId: '',
    targetType: 'student',
    studentId: '',
    familyId: '',
    enrollmentId: '',
    guardianId: '',
  });

  const summaries = useMemo(
    () => buildAgreementTemplateSummaries(templates, acceptances, students, families),
    [acceptances, families, students, templates],
  );
  const filteredSummaries = useMemo(
    () => filterAgreementTemplateSummaries(summaries, acceptances, students, families, { query, kind: kindFilter, status: statusFilter }),
    [acceptances, families, kindFilter, query, statusFilter, students, summaries],
  );
  const selectedTemplate = summaries.find(template => template.id === selectedTemplateId) ?? filteredSummaries[0] ?? summaries[0] ?? null;
  const activeTemplates = summaries.filter(template => template.isActive);
  const pendingCount = acceptances.filter(row => row.status === 'PENDING').length;
  const acceptedCount = acceptances.filter(row => row.status === 'ACCEPTED').length;
  const unsignedRows = useMemo(() => {
    return activeTemplates.flatMap(template => listUnsignedAgreements(
      [template],
      acceptances,
      buildAgreementUnsignedTargets(template, students, families),
    ));
  }, [acceptances, activeTemplates, families, students]);

  const latestRequests = useMemo(() => {
    const selectedId = selectedTemplate?.id;
    return [...acceptances]
      .filter(row => !selectedId || row.templateId === selectedId)
      .sort((a, b) => (b.acceptedAt ?? b.updatedAt ?? b.createdAt).localeCompare(a.acceptedAt ?? a.updatedAt ?? a.createdAt))
      .slice(0, 10);
  }, [acceptances, selectedTemplate?.id]);

  const openCreate = () => {
    setSaveError(null);
    setForm({
      kind: 'ENROLLMENT',
      title: '',
      version: '1',
      body: '',
      requiresGuardian: true,
      isActive: true,
    });
    setTemplateModalMode('create');
  };

  const openVersion = (template: AgreementTemplate) => {
    setSaveError(null);
    setSelectedTemplateId(template.id);
    setForm({
      kind: template.kind,
      title: template.title,
      version: String(template.version + 1),
      body: template.body,
      requiresGuardian: template.requiresGuardian,
      isActive: true,
    });
    setTemplateModalMode('version');
  };

  const openRequest = (template?: AgreementTemplate) => {
    const nextTemplate = template ?? activeTemplates[0] ?? summaries[0] ?? null;
    setSaveError(null);
    setRequestForm({
      templateId: nextTemplate?.id ?? '',
      targetType: 'student',
      studentId: students.find(student => student.profileStatus !== 'ARCHIVED')?.id ?? '',
      familyId: families.find(family => !family.isArchived)?.id ?? '',
      enrollmentId: '',
      guardianId: '',
    });
    setRequestModalOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!orgId || !form.title.trim() || !form.body.trim()) return;
    const now = nowIso();
    const title = form.title.trim();
    try {
      if (templateModalMode === 'version' && selectedTemplate) {
        const next = buildNextAgreementTemplateVersion(selectedTemplate, {
          kind: form.kind,
          title,
          body: form.body,
          requiresGuardian: form.requiresGuardian,
        }, { id: generateId(), now, actorId });
        await setTemplates(prev => [
          ...prev.map(template => {
            const sameLine = template.kind === selectedTemplate.kind && template.title === selectedTemplate.title;
            return sameLine ? { ...template, isActive: false, updatedAt: now, updatedBy: actorId ?? template.updatedBy ?? null } : template;
          }),
          next,
        ]);
        setSelectedTemplateId(next.id);
      } else {
        const version = Math.max(1, Number.parseInt(form.version, 10) || 1);
        const next: AgreementTemplate = {
          id: generateId(),
          orgId,
          createdAt: now,
          updatedAt: now,
          createdBy: actorId ?? null,
          updatedBy: actorId ?? null,
          kind: form.kind,
          title,
          version,
          body: form.body,
          isActive: form.isActive,
          supersedesVersion: null,
          requiresGuardian: form.requiresGuardian,
        };
        await setTemplates(prev => [
          ...prev.map(template => {
            const sameLine = form.isActive && template.kind === next.kind && template.title === next.title;
            return sameLine ? { ...template, isActive: false, updatedAt: now, updatedBy: actorId ?? template.updatedBy ?? null } : template;
          }),
          next,
        ]);
        setSelectedTemplateId(next.id);
      }
      setTemplateModalMode(null);
    } catch {
      setSaveError(l('saveError'));
    }
  };

  const handleToggleActive = async (template: AgreementTemplate, active: boolean) => {
    const now = nowIso();
    try {
      await setTemplates(prev => prev.map(row => {
        const sameLine = row.kind === template.kind && row.title === template.title;
        if (active && sameLine) return { ...row, isActive: row.id === template.id, updatedAt: now, updatedBy: actorId ?? row.updatedBy ?? null };
        if (!active && row.id === template.id) return { ...row, isActive: false, updatedAt: now, updatedBy: actorId ?? row.updatedBy ?? null };
        return row;
      }));
    } catch {
      setSaveError(l('saveError'));
    }
  };

  const handleIssueRequest = async () => {
    if (!orgId) return;
    const template = templates.find(row => row.id === requestForm.templateId);
    if (!template) return;
    const family = requestForm.targetType === 'student'
      ? familyForStudent(families, requestForm.studentId)
      : families.find(row => row.id === requestForm.familyId) ?? null;
    const studentId = requestForm.targetType === 'student' ? requestForm.studentId : '';
    const familyId = requestForm.targetType === 'family' ? requestForm.familyId : family?.id ?? '';
    const enrollmentId = requestForm.targetType === 'enrollment' ? requestForm.enrollmentId.trim() : '';
    const guardianId = requestForm.guardianId || (template.requiresGuardian ? family?.primaryContactGuardianId ?? '' : '');
    try {
      const request = buildPendingAgreementRequest(template, {
        id: generateId(),
        orgId,
        now: nowIso(),
        actorId,
        studentId: studentId || null,
        familyId: familyId || null,
        enrollmentId: enrollmentId || null,
        guardianId: guardianId || null,
      });
      await setAcceptances(prev => [request, ...prev]);
      setSelectedTemplateId(template.id);
      setRequestModalOpen(false);
    } catch {
      setSaveError(l('saveError'));
    }
  };

  const openPdfCapture = (acceptance: AgreementAcceptance) => {
    setSaveError(null);
    setPdfAcceptanceId(acceptance.id);
    setPdfCapture({
      signerName: acceptance.acceptedByName ?? '',
      reference: acceptance.signatureRef?.startsWith('private://') ? acceptance.signatureRef : '',
      file: null,
    });
  };

  const handleCapturePdf = async () => {
    if (!orgId || !pdfAcceptanceId) return;
    const acceptance = acceptances.find(row => row.id === pdfAcceptanceId);
    if (!acceptance) return;
    setPdfUploading(true);
    setSaveError(null);
    try {
      let signatureRef = pdfCapture.reference.trim();
      if (pdfCapture.file) {
        const uploaded = await uploadAgreementPdf(orgId, acceptance.id, pdfCapture.file);
        signatureRef = uploaded.signatureRef;
      }
      const updated = buildAgreementPdfAcceptanceUpdate(acceptance, {
        now: nowIso(),
        actorId,
        signerName: pdfCapture.signerName,
        signatureRef,
      });
      await setAcceptances(prev => prev.map(row => row.id === updated.id ? updated : row));
      setPdfAcceptanceId(null);
      setPdfCapture({ signerName: '', reference: '', file: null });
    } catch {
      setSaveError(pdfCapture.file ? l('uploadFailed') : l('saveError'));
    } finally {
      setPdfUploading(false);
    }
  };

  const renderTemplateList = () => {
    if (loading) return <LoadingRows />;
    if (templates.length === 0) return <StatePanel icon={ScrollText} title={l('noTemplatesTitle')} body={l('noTemplatesBody')} />;
    if (filteredSummaries.length === 0) return <StatePanel icon={Search} title={l('noMatchesTitle')} body={l('noMatchesBody')} />;

    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {filteredSummaries.map(template => {
          const isSelected = selectedTemplate?.id === template.id;
          return (
            <button
              key={template.id}
              onClick={() => setSelectedTemplateId(template.id)}
              className={`grid w-full grid-cols-12 items-center gap-3 border-b border-slate-100 px-3 py-3 text-start transition-colors last:border-b-0 dark:border-slate-800 ${
                isSelected ? 'bg-cadenza-50/70 dark:bg-cadenza-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="col-span-12 min-w-0 md:col-span-4">
                <div className="flex min-w-0 items-center gap-2">
                  <ScrollText size={16} className="shrink-0 text-cadenza-600 dark:text-cadenza-300" />
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{template.title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Chip tone="blue">{template.kind}</Chip>
                  <Chip>{l('version')} {template.version}</Chip>
                  {template.requiresGuardian && <Chip tone="amber">{l('requiresGuardian')}</Chip>}
                </div>
              </div>
              <div className="col-span-4 md:col-span-2">
                <Chip tone={template.isActive ? 'green' : 'slate'}>{template.isActive ? l('active') : l('inactive')}</Chip>
              </div>
              <div className="col-span-4 text-xs text-slate-600 dark:text-slate-300 md:col-span-3">
                {l('pendingRequests')}: {template.pendingCount} · {l('acceptedRequests')}: {template.acceptedCount}
              </div>
              <div className="col-span-4 text-xs font-semibold text-amber-700 dark:text-amber-300 md:col-span-2">
                {l('missingSignatures')}: {template.missingCount}
              </div>
              <div className="col-span-12 flex justify-end gap-2 md:col-span-1">
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    openVersion(template);
                  }}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  title={l('versionTemplate')}
                >
                  <History size={14} />
                </button>
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    openRequest(template);
                  }}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  title={l('issueRequest')}
                >
                  <Send size={14} />
                </button>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderDetail = () => {
    if (!selectedTemplate) {
      return <StatePanel icon={ScrollText} title={l('noTemplatesTitle')} body={l('noTemplatesBody')} />;
    }
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-white">{selectedTemplate.title}</h3>
                <Chip tone={selectedTemplate.isActive ? 'green' : 'slate'}>{selectedTemplate.isActive ? l('active') : l('inactive')}</Chip>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip tone="blue">{selectedTemplate.kind}</Chip>
                <Chip>{l('version')} {selectedTemplate.version}</Chip>
                {selectedTemplate.supersedesVersion !== null && <Chip>{l('supersededVersion')} {selectedTemplate.supersedesVersion}</Chip>}
                {selectedTemplate.requiresGuardian && <Chip tone="amber">{l('requiresGuardian')}</Chip>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleToggleActive(selectedTemplate, !selectedTemplate.isActive)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RotateCcw size={14} />
                {selectedTemplate.isActive ? l('deactivate') : l('activate')}
              </button>
              <button
                onClick={() => openVersion(selectedTemplate)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <History size={14} />
                {l('versionTemplate')}
              </button>
              <button
                onClick={() => openRequest(selectedTemplate)}
                className="inline-flex items-center gap-2 rounded-lg bg-cadenza-gradient px-3 py-2 text-xs font-semibold text-white shadow-cadenza-soft"
              >
                <Send size={14} />
                {l('issueRequest')}
              </button>
            </div>
          </div>
          <div
            dir="auto"
            className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            {selectedTemplate.body}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <FileSignature size={16} className="text-cadenza-600 dark:text-cadenza-300" />
                {l('requests')}
              </h4>
              <Chip>{latestRequests.length}</Chip>
            </div>
            {latestRequests.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{l('noTarget')}</p>
            ) : (
              <div className="space-y-2">
                {latestRequests.map(row => (
                  <div key={row.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{targetLabel(row, students, families) || row.id}</span>
                      <Chip tone={row.status === 'ACCEPTED' ? 'green' : row.status === 'DECLINED' ? 'red' : row.status === 'PENDING' ? 'amber' : 'slate'}>
                        {l(row.status.toLowerCase())}
                      </Chip>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{l('version')} {row.templateVersion}</span>
                      {row.acceptedByName && <span>{l('signer')}: {row.acceptedByName}</span>}
                      <span dir="ltr">{row.acceptedAt ?? row.createdAt}</span>
                      {row.signatureRef && <span>{l('signatureRef')}: <bdi>{row.signatureRef}</bdi></span>}
                    </div>
                    {row.status !== 'DECLINED' && row.status !== 'EXPIRED' && row.status !== 'SUPERSEDED' && (
                      <button
                        type="button"
                        onClick={() => openPdfCapture(row)}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <FileUp size={14} />
                        {l('capturePdf')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <AlertTriangle size={16} className="text-amber-600 dark:text-amber-300" />
                {l('unsignedQueue')}
              </h4>
              <Chip tone="amber">{unsignedRows.filter(row => row.template.id === selectedTemplate.id).length}</Chip>
            </div>
            {unsignedRows.filter(row => row.template.id === selectedTemplate.id).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{l('noUnsignedBody')}</p>
            ) : (
              <div className="space-y-2">
                {unsignedRows.filter(row => row.template.id === selectedTemplate.id).slice(0, 8).map(row => (
                  <div key={`${row.template.id}:${row.studentId ?? ''}:${row.familyId ?? ''}:${row.enrollmentId ?? ''}:${row.guardianId ?? ''}`} className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-800 dark:bg-amber-900/10">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {targetLabel(row, students, families) || row.studentId || row.familyId || row.enrollmentId || row.guardianId}
                    </div>
                    <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      {row.reason === 'SUPERSEDED_VERSION' ? l('supersededVersion') : l('neverAccepted')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6 dark:bg-slate-950" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{l('title')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{l('subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-cadenza-gradient px-4 py-2 text-sm font-semibold text-white shadow-cadenza-soft"
            >
              <Plus size={16} />
              {l('newTemplate')}
            </button>
            <button
              onClick={() => openRequest()}
              disabled={activeTemplates.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Send size={16} />
              {l('issueRequest')}
            </button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={l('activeTemplates')} value={activeTemplates.length} icon={ShieldCheck} />
          <Stat label={l('pendingRequests')} value={pendingCount} icon={FileSignature} />
          <Stat label={l('acceptedRequests')} value={acceptedCount} icon={CheckCircle2} />
          <Stat label={l('missingSignatures')} value={unsignedRows.length} icon={AlertTriangle} />
        </div>

        {saveError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            <AlertTriangle size={16} />
            {saveError}
          </div>
        )}

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {l('blockedNote')}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(430px,0.9fr)]">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <Search size={16} className="text-slate-400" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder={l('search')}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                <Filter size={14} />
                <select value={kindFilter} onChange={event => setKindFilter(event.target.value as TemplateFilter)} className="bg-transparent font-semibold text-slate-800 outline-none dark:text-slate-100">
                  <option value="ALL">{l('allKinds')}</option>
                  {KIND_OPTIONS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                <Layers3 size={14} />
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className="bg-transparent font-semibold text-slate-800 outline-none dark:text-slate-100">
                  <option value="all">{l('allStatuses')}</option>
                  <option value="active">{l('activeOnly')}</option>
                  <option value="inactive">{l('inactiveOnly')}</option>
                  <option value="guardian">{l('guardianOnly')}</option>
                </select>
              </label>
            </div>
            {renderTemplateList()}
          </section>

          <aside className="space-y-4">
            {loading ? <LoadingRows /> : renderDetail()}
          </aside>
        </div>
      </div>

      <Modal
        isOpen={templateModalMode !== null}
        onClose={() => setTemplateModalMode(null)}
        title={templateModalMode === 'version' ? l('versionTemplate') : l('newTemplate')}
        maxWidth="max-w-3xl"
        footerContent={(
          <div className="flex w-full justify-end gap-2">
            <button onClick={() => setTemplateModalMode(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              {l('cancel')}
            </button>
            <button
              onClick={handleSaveTemplate}
              disabled={!form.title.trim() || !form.body.trim()}
              className="rounded-lg bg-cadenza-gradient px-4 py-2 text-sm font-semibold text-white shadow-cadenza-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {templateModalMode === 'version' ? l('saveVersion') : l('create')}
            </button>
          </div>
        )}
      >
        <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>{l('kind')}</span>
              <select value={form.kind} onChange={event => setForm(prev => ({ ...prev, kind: event.target.value as AgreementKind }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                {KIND_OPTIONS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200 md:col-span-2">
              <span>{l('titleField')}</span>
              <input value={form.title} onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>{l('version')}</span>
              <input value={form.version} disabled={templateModalMode === 'version'} onChange={event => setForm(prev => ({ ...prev, version: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800" />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={form.requiresGuardian} onChange={event => setForm(prev => ({ ...prev, requiresGuardian: event.target.checked }))} />
              {l('requiresGuardian')}
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={form.isActive} disabled={templateModalMode === 'version'} onChange={event => setForm(prev => ({ ...prev, isActive: event.target.checked }))} />
              {l('active')}
            </label>
          </div>
          <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>{l('templateBody')}</span>
            <textarea
              value={form.body}
              onChange={event => setForm(prev => ({ ...prev, body: event.target.value }))}
              placeholder={l('emptyBodyHint')}
              dir="auto"
              rows={12}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
        </div>
      </Modal>

      <Modal
        isOpen={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        title={l('issueRequest')}
        maxWidth="max-w-2xl"
        footerContent={(
          <div className="flex w-full justify-end gap-2">
            <button onClick={() => setRequestModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              {l('cancel')}
            </button>
            <button
              onClick={handleIssueRequest}
              disabled={!requestForm.templateId || (requestForm.targetType === 'student' && !requestForm.studentId) || (requestForm.targetType === 'family' && !requestForm.familyId) || (requestForm.targetType === 'enrollment' && !requestForm.enrollmentId.trim())}
              className="rounded-lg bg-cadenza-gradient px-4 py-2 text-sm font-semibold text-white shadow-cadenza-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {l('issue')}
            </button>
          </div>
        )}
      >
        <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>{l('templates')}</span>
            <select value={requestForm.templateId} onChange={event => setRequestForm(prev => ({ ...prev, templateId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option value="">{l('allTemplates')}</option>
              {activeTemplates.map(template => <option key={template.id} value={template.id}>{template.title} · v{template.version}</option>)}
            </select>
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>{l('targetType')}</span>
              <select value={requestForm.targetType} onChange={event => setRequestForm(prev => ({ ...prev, targetType: event.target.value as RequestTargetType }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="student">{l('student')}</option>
                <option value="family">{l('family')}</option>
                <option value="enrollment">{l('enrollment')}</option>
              </select>
            </label>
            {requestForm.targetType !== 'enrollment' && (
              <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>{requestForm.targetType === 'student' ? l('student') : l('family')}</span>
                <select
                  value={requestForm.targetType === 'student' ? requestForm.studentId : requestForm.familyId}
                  onChange={event => setRequestForm(prev => requestForm.targetType === 'student' ? { ...prev, studentId: event.target.value } : { ...prev, familyId: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {(requestForm.targetType === 'student' ? students.filter(student => student.profileStatus !== 'ARCHIVED') : families.filter(family => !family.isArchived)).map(item => (
                    <option key={item.id} value={item.id}>{'fullName' in item ? item.fullName : item.name}</option>
                  ))}
                </select>
              </label>
            )}
            {requestForm.targetType === 'enrollment' && (
              <>
                <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span>{l('enrollmentId')}</span>
                  <input value={requestForm.enrollmentId} onChange={event => setRequestForm(prev => ({ ...prev, enrollmentId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span>{l('student')} ({l('optional')})</span>
                  <select value={requestForm.studentId} onChange={event => setRequestForm(prev => ({ ...prev, studentId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                    <option value="">{l('optional')}</option>
                    {students.filter(student => student.profileStatus !== 'ARCHIVED').map(student => <option key={student.id} value={student.id}>{student.fullName}</option>)}
                  </select>
                </label>
              </>
            )}
            <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>{l('family')} ({l('optional')})</span>
              <select value={requestForm.familyId} onChange={event => setRequestForm(prev => ({ ...prev, familyId: event.target.value, guardianId: '' }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="">{l('optional')}</option>
                {families.filter(family => !family.isArchived).map(family => <option key={family.id} value={family.id}>{family.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>{l('guardian')} ({l('optional')})</span>
              <select value={requestForm.guardianId} onChange={event => setRequestForm(prev => ({ ...prev, guardianId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="">{l('optional')}</option>
                {(families.find(family => family.id === requestForm.familyId)?.guardians ?? []).map(guardian => <option key={guardian.id} value={guardian.id}>{guardian.fullName}</option>)}
              </select>
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={pdfAcceptanceId !== null}
        onClose={() => {
          if (!pdfUploading) {
            setPdfAcceptanceId(null);
            setPdfCapture({ signerName: '', reference: '', file: null });
          }
        }}
        title={l('pdfTitle')}
        maxWidth="max-w-xl"
        footerContent={(
          <div className="flex w-full justify-end gap-2">
            <button
              onClick={() => setPdfAcceptanceId(null)}
              disabled={pdfUploading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {l('cancel')}
            </button>
            <button
              onClick={handleCapturePdf}
              disabled={pdfUploading || !pdfCapture.signerName.trim() || (!pdfCapture.reference.trim() && !pdfCapture.file)}
              className="rounded-lg bg-cadenza-gradient px-4 py-2 text-sm font-semibold text-white shadow-cadenza-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pdfUploading ? l('loading') : l('savePdf')}
            </button>
          </div>
        )}
      >
        <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>{l('pdfSigner')}</span>
            <input
              value={pdfCapture.signerName}
              onChange={event => setPdfCapture(prev => ({ ...prev, signerName: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>{l('pdfFile')}</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={event => setPdfCapture(prev => ({ ...prev, file: event.target.files?.[0] ?? null }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>{l('pdfReference')}</span>
            <input
              value={pdfCapture.reference}
              onChange={event => setPdfCapture(prev => ({ ...prev, reference: event.target.value }))}
              placeholder={l('pdfReferenceHint')}
              dir="ltr"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {l('blockedNote')}
          </div>
        </div>
      </Modal>
    </div>
  );
};
