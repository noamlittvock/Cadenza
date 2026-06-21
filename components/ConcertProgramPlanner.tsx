import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  FileDown,
  Link2,
  LockKeyhole,
  Music2,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { AppSettings, CalendarEvent, Teacher } from '../types';
import type { ConcertPiece, ConcertProgram, ConcertProgramStatus } from '../types/blueprint';
import { generateId } from '../constants';
import { getProgramRunOfShow, listConcertPrograms } from '../utils/blueprintQueries';

type SyncSetter<T extends { id: string }> = (data: T[] | ((prev: T[]) => T[])) => Promise<void>;
type Language = 'en-US' | 'he-IL';
type PlannerScope =
  | { kind: 'event'; event: CalendarEvent }
  | { kind: 'activity'; activityId: string; activityName: string | null };
type PerformerStudent = { id: string; fullName: string; profileStatus?: string; isArchived?: boolean };

interface Props {
  settings: AppSettings;
  orgId: string | null;
  actorId?: string | null;
  actorStaffId?: string | null;
  readableEventIds?: string[];
  scope: PlannerScope;
  programs: ConcertProgram[];
  setPrograms: SyncSetter<ConcertProgram>;
  events: CalendarEvent[];
  students: PerformerStudent[];
  staff: Teacher[];
  loading?: boolean;
  canManage: boolean;
  compact?: boolean;
}

interface ProgramFormState {
  title: string;
  date: string;
  venue: string;
  status: ConcertProgramStatus;
  eventId: string;
  notes: string;
}

interface PieceFormState {
  order: string;
  title: string;
  composer: string;
  durationMinutes: string;
  studentId: string;
  staffId: string;
}

const LABELS: Record<Language, Record<string, string>> = {
  'en-US': {
    title: 'Concert program',
    activityTitle: 'Concert planning',
    subtitle: 'Private authenticated program, repertoire, performers, and run-of-show',
    search: 'Search programs, pieces, performers, or venue',
    loading: 'Loading concert programs...',
    emptyTitle: 'No private concert program yet',
    emptyBody: 'Create an authenticated planning record before publishing or exporting anything public.',
    noMatchesTitle: 'No matching concert programs',
    noMatchesBody: 'Adjust search or status filters.',
    noAuthorizedTitle: 'No authorized run-of-show',
    noAuthorizedBody: 'This private program is visible only to admins, linked event staff, and listed staff performers.',
    create: 'Create program',
    save: 'Save program',
    addPiece: 'Add piece',
    titleField: 'Title',
    linkedEvent: 'Linked event',
    standalone: 'Standalone draft',
    date: 'Date',
    venue: 'Venue',
    status: 'Status',
    notes: 'Notes',
    pieces: 'Pieces',
    runOfShow: 'Run of show',
    order: 'Order',
    pieceTitle: 'Piece title',
    composer: 'Composer',
    duration: 'Duration',
    studentPerformer: 'Student performer',
    staffPerformer: 'Staff performer',
    noStudent: 'No student',
    noStaff: 'No staff',
    performers: 'Performers',
    cumulative: 'Cumulative',
    unknownDuration: 'Unknown duration',
    orderConflict: 'Duplicate order',
    stalePerformer: 'Stale performer ID',
    sourceLinks: 'Source links',
    event: 'Event',
    privateExport: 'Private export reference',
    print: 'Private print',
    copyExport: 'Prepare export ref',
    copied: 'Private reference prepared',
    d23: 'D-23 provisional: public website/program exposure is off. Private names are visible here; public release later requires participant-level consent and redaction for missing media release.',
    publicBlocked: 'Public output blocked',
    mediaReleaseReview: 'Media release review required',
    cancelledEvent: 'Linked event is cancelled',
    noEvent: 'No linked event',
    saveError: 'Concert program changes could not be saved.',
    selectPrompt: 'Select or create a program to manage ordered pieces and private exports.',
    draft: 'Draft',
    published: 'Published private',
    completed: 'Completed',
    cancelled: 'Cancelled',
  },
  'he-IL': {
    title: 'תוכנית קונצרט',
    activityTitle: 'תכנון קונצרטים',
    subtitle: 'תוכנית פרטית מאומתת, רפרטואר, מבצעים וסדר מופע',
    search: 'חיפוש תוכניות, יצירות, מבצעים או אולם',
    loading: 'טוען תוכניות קונצרט...',
    emptyTitle: 'אין עדיין תוכנית קונצרט פרטית',
    emptyBody: 'צרו רשומת תכנון מאומתת לפני פרסום או יצוא ציבורי.',
    noMatchesTitle: 'אין תוכניות קונצרט תואמות',
    noMatchesBody: 'שנו חיפוש או מסנני סטטוס.',
    noAuthorizedTitle: 'אין סדר מופע מורשה',
    noAuthorizedBody: 'תוכנית פרטית זו גלויה רק למנהלים, לצוות האירוע המקושר ולמבצעי צוות רשומים.',
    create: 'צור תוכנית',
    save: 'שמור תוכנית',
    addPiece: 'הוסף יצירה',
    titleField: 'כותרת',
    linkedEvent: 'אירוע מקושר',
    standalone: 'טיוטה ללא אירוע',
    date: 'תאריך',
    venue: 'אולם',
    status: 'סטטוס',
    notes: 'הערות',
    pieces: 'יצירות',
    runOfShow: 'סדר מופע',
    order: 'סדר',
    pieceTitle: 'שם יצירה',
    composer: 'מלחין',
    duration: 'משך',
    studentPerformer: 'תלמיד מבצע',
    staffPerformer: 'איש צוות מבצע',
    noStudent: 'ללא תלמיד',
    noStaff: 'ללא צוות',
    performers: 'מבצעים',
    cumulative: 'מצטבר',
    unknownDuration: 'משך לא ידוע',
    orderConflict: 'סדר כפול',
    stalePerformer: 'מזהה מבצע לא תקף',
    sourceLinks: 'קישורי מקור',
    event: 'אירוע',
    privateExport: 'אסמכתת יצוא פרטית',
    print: 'הדפסה פרטית',
    copyExport: 'הכן אסמכתת יצוא',
    copied: 'אסמכתה פרטית הוכנה',
    d23: 'D-23 זמני: חשיפה ציבורית באתר/תוכנית כבויה. שמות פרטיים גלויים כאן; פרסום ציבורי עתידי דורש הסכמת משתתפים והשחרה לחסר אישור מדיה.',
    publicBlocked: 'פלט ציבורי חסום',
    mediaReleaseReview: 'נדרשת בדיקת אישור מדיה',
    cancelledEvent: 'האירוע המקושר מבוטל',
    noEvent: 'אין אירוע מקושר',
    saveError: 'לא ניתן לשמור שינויי תוכנית קונצרט.',
    selectPrompt: 'בחרו או צרו תוכנית כדי לנהל יצירות מסודרות ויצוא פרטי.',
    draft: 'טיוטה',
    published: 'פורסם פרטי',
    completed: 'הושלם',
    cancelled: 'בוטל',
  },
};

const STATUS_OPTIONS: ConcertProgramStatus[] = ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'];
const FIELD_CLASS = 'w-full rounded-md border border-[#d8c6ad] bg-white px-2.5 py-2 text-sm outline-none focus:border-[#1f3a5f] focus:ring-2 focus:ring-[#1f3a5f]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const BUTTON_CLASS = 'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

const languageOf = (settings: AppSettings): Language => settings.language === 'he-IL' ? 'he-IL' : 'en-US';
const labelFor = (language: Language, key: string) => LABELS[language][key] ?? LABELS['en-US'][key] ?? key;
const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const eventDate = (event: CalendarEvent) => new Date(event.start).toISOString().slice(0, 10);

function eventLabel(event: CalendarEvent): string {
  return `${eventDate(event)} · ${event.name}`;
}

function statusLabel(language: Language, status: ConcertProgramStatus): string {
  const key = status === 'DRAFT' ? 'draft' : status === 'PUBLISHED' ? 'published' : status === 'COMPLETED' ? 'completed' : 'cancelled';
  return labelFor(language, key);
}

export function programsForConcertScope(
  programs: ConcertProgram[],
  scope: PlannerScope,
  events: CalendarEvent[],
): ConcertProgram[] {
  if (scope.kind === 'event') {
    return listConcertPrograms(programs).filter(program => program.eventId === scope.event.id);
  }
  const activityEventIds = new Set(events.filter(event => event.activityId === scope.activityId).map(event => event.id));
  return listConcertPrograms(programs).filter(program => !program.eventId || activityEventIds.has(program.eventId));
}

export function canStaffReadConcertProgram(
  program: ConcertProgram,
  staffMemberId: string | null | undefined,
  readableEventIds: string[] = [],
): boolean {
  if (!staffMemberId) return false;
  if (program.eventId && readableEventIds.includes(program.eventId)) return true;
  return program.pieces.some(piece => piece.performerStaffIds.includes(staffMemberId));
}

export function filterConcertProgramsForActor(
  programs: ConcertProgram[],
  args: {
    canManage: boolean;
    staffMemberId?: string | null;
    readableEventIds?: string[];
  },
): ConcertProgram[] {
  if (args.canManage) return programs;
  return programs.filter(program => canStaffReadConcertProgram(program, args.staffMemberId, args.readableEventIds ?? []));
}

export function buildConcertProgramDraft(args: {
  id: string;
  orgId: string;
  now: string;
  actorId?: string | null;
  scope: PlannerScope;
  events: CalendarEvent[];
}): ConcertProgram {
  const linkedEvent = args.scope.kind === 'event'
    ? args.scope.event
    : (() => {
      const activityId = args.scope.activityId;
      return args.events.find(event => event.activityId === activityId && !event.isCanceled) ?? null;
    })();
  const title = linkedEvent?.name ?? (args.scope.kind === 'activity'
    ? `${args.scope.activityName ?? 'Concert'} program`
    : 'Concert program');
  return {
    id: args.id,
    orgId: args.orgId,
    title,
    eventId: linkedEvent?.id ?? null,
    date: linkedEvent ? eventDate(linkedEvent) : today(),
    venue: null,
    status: 'DRAFT',
    pieces: [],
    notes: null,
    createdAt: args.now,
    updatedAt: args.now,
    createdBy: args.actorId ?? null,
    updatedBy: args.actorId ?? null,
  };
}

export function applyConcertProgramForm(
  program: ConcertProgram,
  form: ProgramFormState,
  args: { now: string; actorId?: string | null },
): ConcertProgram {
  const title = form.title.trim();
  if (!title) throw new Error('Concert program title is required.');
  return {
    ...program,
    title,
    eventId: form.eventId || null,
    date: form.date || program.date,
    venue: form.venue.trim() || null,
    status: form.status,
    notes: form.notes.trim() || null,
    updatedAt: args.now,
    updatedBy: args.actorId ?? null,
  };
}

export function addConcertPiece(program: ConcertProgram, form: PieceFormState, args: { now: string; actorId?: string | null }): ConcertProgram {
  const title = form.title.trim();
  if (!title) throw new Error('Concert piece title is required.');
  const duration = form.durationMinutes.trim() === '' ? null : Number(form.durationMinutes);
  const piece: ConcertPiece = {
    order: Number(form.order) || program.pieces.length + 1,
    title,
    composer: form.composer.trim() || null,
    performerStudentIds: form.studentId ? [form.studentId] : [],
    performerStaffIds: form.staffId ? [form.staffId] : [],
    durationMinutes: Number.isFinite(duration) ? duration : null,
  };
  return {
    ...program,
    pieces: [...program.pieces, piece].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    updatedAt: args.now,
    updatedBy: args.actorId ?? null,
  };
}

export function moveConcertPiece(program: ConcertProgram, index: number, direction: -1 | 1, args: { now: string; actorId?: string | null }): ConcertProgram {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= program.pieces.length) return program;
  const pieces = [...program.pieces];
  const currentOrder = pieces[index].order;
  pieces[index] = { ...pieces[index], order: pieces[nextIndex].order };
  pieces[nextIndex] = { ...pieces[nextIndex], order: currentOrder };
  return {
    ...program,
    pieces: pieces.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    updatedAt: args.now,
    updatedBy: args.actorId ?? null,
  };
}

function removeConcertPiece(program: ConcertProgram, index: number, args: { now: string; actorId?: string | null }): ConcertProgram {
  return {
    ...program,
    pieces: program.pieces.filter((_, i) => i !== index).map((piece, i) => ({ ...piece, order: i + 1 })),
    updatedAt: args.now,
    updatedBy: args.actorId ?? null,
  };
}

function makeProgramForm(program: ConcertProgram): ProgramFormState {
  return {
    title: program.title,
    date: program.date,
    venue: program.venue ?? '',
    status: program.status,
    eventId: program.eventId ?? '',
    notes: program.notes ?? '',
  };
}

function makePieceForm(program: ConcertProgram): PieceFormState {
  return {
    order: String(program.pieces.length + 1),
    title: '',
    composer: '',
    durationMinutes: '',
    studentId: '',
    staffId: '',
  };
}

function isStudentArchived(student: PerformerStudent): boolean {
  return student.isArchived === true || student.profileStatus === 'ARCHIVED';
}

export const ConcertProgramPlanner: React.FC<Props> = ({
  settings,
  orgId,
  actorId,
  actorStaffId = null,
  readableEventIds = [],
  scope,
  programs,
  setPrograms,
  events,
  students,
  staff,
  loading = false,
  canManage,
  compact = false,
}) => {
  const language = languageOf(settings);
  const t = (key: string) => labelFor(language, key);
  const isRtl = language === 'he-IL';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConcertProgramStatus | 'ALL'>('ALL');
  const allScopedPrograms = useMemo(() => programsForConcertScope(programs, scope, events), [events, programs, scope]);
  const scopedPrograms = useMemo(() => filterConcertProgramsForActor(allScopedPrograms, {
    canManage,
    staffMemberId: actorStaffId,
    readableEventIds,
  }), [actorStaffId, allScopedPrograms, canManage, readableEventIds]);
  const hasUnauthorizedPrograms = !canManage && allScopedPrograms.length > 0 && scopedPrograms.length === 0;
  const filteredPrograms = useMemo(() => {
    const q = normalize(search);
    return scopedPrograms.filter(program => {
      if (statusFilter !== 'ALL' && program.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        program.title,
        program.venue,
        program.notes,
        program.status,
        ...program.pieces.flatMap(piece => [
          piece.title,
          piece.composer,
          ...piece.performerStudentIds.map(id => students.find(student => student.id === id)?.fullName ?? id),
          ...piece.performerStaffIds.map(id => staff.find(member => member.id === id)?.fullName ?? id),
        ]),
      ].map(normalize).join(' ');
      return haystack.includes(q);
    });
  }, [scopedPrograms, search, staff, statusFilter, students]);

  const [selectedId, setSelectedId] = useState<string | null>(filteredPrograms[0]?.id ?? null);
  const selected = filteredPrograms.find(program => program.id === selectedId)
    ?? filteredPrograms[0]
    ?? scopedPrograms.find(program => program.id === selectedId)
    ?? null;
  const [form, setForm] = useState<ProgramFormState | null>(selected ? makeProgramForm(selected) : null);
  const [pieceForm, setPieceForm] = useState<PieceFormState | null>(selected ? makePieceForm(selected) : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exportRef, setExportRef] = useState<string | null>(null);

  const scopeEvents = useMemo(() => {
    if (scope.kind === 'event') return [scope.event];
    return events.filter(event => event.activityId === scope.activityId).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  }, [events, scope]);

  const openProgram = (program: ConcertProgram) => {
    setSelectedId(program.id);
    setForm(makeProgramForm(program));
    setPieceForm(makePieceForm(program));
    setExportRef(null);
    setSaveError(null);
  };

  const createProgram = async () => {
    if (!orgId || !canManage) return;
    const draft = buildConcertProgramDraft({
      id: generateId(),
      orgId,
      now: nowIso(),
      actorId,
      scope,
      events,
    });
    try {
      await setPrograms(prev => [...prev, draft]);
      openProgram(draft);
    } catch {
      setSaveError(t('saveError'));
    }
  };

  const saveProgram = async () => {
    if (!selected || !form || !canManage) return;
    try {
      const updated = applyConcertProgramForm(selected, form, { now: nowIso(), actorId });
      await setPrograms(prev => prev.map(program => program.id === updated.id ? updated : program));
      openProgram(updated);
    } catch {
      setSaveError(t('saveError'));
    }
  };

  const addPiece = async () => {
    if (!selected || !pieceForm || !canManage) return;
    try {
      const updated = addConcertPiece(selected, pieceForm, { now: nowIso(), actorId });
      await setPrograms(prev => prev.map(program => program.id === updated.id ? updated : program));
      openProgram(updated);
    } catch {
      setSaveError(t('saveError'));
    }
  };

  const updateProgramPieces = async (updated: ConcertProgram) => {
    if (!canManage) return;
    try {
      await setPrograms(prev => prev.map(program => program.id === updated.id ? updated : program));
      openProgram(updated);
    } catch {
      setSaveError(t('saveError'));
    }
  };

  const runOfShow = selected ? getProgramRunOfShow(selected, {
    students: students.map(student => ({ id: student.id, fullName: student.fullName, isArchived: isStudentArchived(student) })),
    staff: staff.map(member => ({ id: member.id, fullName: member.fullName, isArchived: member.isArchived })),
  }) : [];
  const linkedEvent = selected?.eventId ? events.find(event => event.id === selected.eventId) ?? null : null;
  const privateRef = selected && orgId ? `private://documents/${orgId}/concert-programs/${selected.id}/program.pdf` : '';

  return (
    <section data-testid="concert-program-planner" dir={isRtl ? 'rtl' : 'ltr'} className={`rounded-lg border border-[#d8c6ad] bg-[#f7f0e6] text-start dark:border-slate-700 dark:bg-slate-950/70 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Music2 size={16} className="text-[#7f1d1d]" />
            {scope.kind === 'event' ? t('title') : t('activityTitle')}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{t('subtitle')}</p>
        </div>
        {canManage && (
          <button type="button" onClick={createProgram} className={`${BUTTON_CLASS} bg-[#1f3a5f] text-white hover:bg-[#172d49]`}>
            <Plus size={15} />
            {t('create')}
          </button>
        )}
      </div>

      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="mb-1 flex items-center gap-1.5 font-semibold">
          <ShieldAlert size={14} />
          {t('publicBlocked')}
        </div>
        {t('d23')}
      </div>

      {saveError && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle size={15} />
          {saveError}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('search')} className={`${FIELD_CLASS} ps-9`} />
        </div>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as ConcertProgramStatus | 'ALL')} className="rounded-md border border-[#d8c6ad] bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
          <option value="ALL">{t('status')}</option>
          {STATUS_OPTIONS.map(status => <option key={status} value={status}>{statusLabel(language, status)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white/70 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60">
          {t('loading')}
        </div>
      ) : scopedPrograms.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white/70 p-5 text-center dark:border-slate-700 dark:bg-slate-900/60">
          <LockKeyhole size={24} className="mx-auto mb-2 text-slate-300" />
          <div className="font-semibold text-slate-900 dark:text-white">{hasUnauthorizedPrograms ? t('noAuthorizedTitle') : t('emptyTitle')}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hasUnauthorizedPrograms ? t('noAuthorizedBody') : t('emptyBody')}</div>
        </div>
      ) : filteredPrograms.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white/70 p-5 text-center dark:border-slate-700 dark:bg-slate-900/60">
          <div className="font-semibold text-slate-900 dark:text-white">{t('noMatchesTitle')}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('noMatchesBody')}</div>
        </div>
      ) : (
        <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'lg:grid-cols-[280px_minmax(0,1fr)]'}`}>
          <div className="overflow-hidden rounded-md border border-[#d8c6ad] bg-white dark:border-slate-800 dark:bg-slate-900">
            {filteredPrograms.map(program => {
              const programEvent = program.eventId ? events.find(event => event.id === program.eventId) : null;
              return (
                <button
                  key={program.id}
                  type="button"
                  onClick={() => openProgram(program)}
                  className={`w-full border-b border-stone-100 px-3 py-2.5 text-start last:border-b-0 hover:bg-stone-50 dark:border-slate-800 dark:hover:bg-slate-800/70 ${selected?.id === program.id ? 'bg-[#f7f0e6] dark:bg-slate-800' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{program.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded border border-stone-200 px-1.5 py-0.5 text-slate-600 dark:border-slate-700 dark:text-slate-300">{statusLabel(language, program.status)}</span>
                        {programEvent?.isCanceled && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t('cancelledEvent')}</span>}
                        {!program.eventId && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{t('noEvent')}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{program.pieces.length}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selected && form ? (
            <div className="rounded-md border border-[#d8c6ad] bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('titleField')}
                  <input disabled={!canManage} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className={`mt-1 ${FIELD_CLASS}`} />
                </label>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('linkedEvent')}
                  <select disabled={!canManage || scope.kind === 'event'} value={form.eventId} onChange={event => {
                    const nextEvent = events.find(item => item.id === event.target.value);
                    setForm({
                      ...form,
                      eventId: event.target.value,
                      date: nextEvent ? eventDate(nextEvent) : form.date,
                    });
                  }} className={`mt-1 ${FIELD_CLASS}`}>
                    <option value="">{t('standalone')}</option>
                    {scopeEvents.map(event => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('date')}
                  <input disabled={!canManage} type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} className={`mt-1 ${FIELD_CLASS}`} />
                </label>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('venue')}
                  <input disabled={!canManage} value={form.venue} onChange={event => setForm({ ...form, venue: event.target.value })} className={`mt-1 ${FIELD_CLASS}`} />
                </label>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('status')}
                  <select disabled={!canManage} value={form.status} onChange={event => setForm({ ...form, status: event.target.value as ConcertProgramStatus })} className={`mt-1 ${FIELD_CLASS}`}>
                    {STATUS_OPTIONS.map(status => <option key={status} value={status}>{statusLabel(language, status)}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 md:col-span-2">
                  {t('notes')}
                  <textarea disabled={!canManage} rows={2} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} className={`mt-1 ${FIELD_CLASS}`} />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {canManage && (
                  <button type="button" onClick={saveProgram} className={`${BUTTON_CLASS} bg-[#7f1d1d] text-white hover:bg-[#661717]`}>
                    {t('save')}
                  </button>
                )}
                {canManage && (
                  <>
                    <button type="button" onClick={() => setExportRef(privateRef)} className={`${BUTTON_CLASS} border border-[#d8c6ad] bg-white text-slate-700 hover:bg-stone-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`}>
                      <FileDown size={15} />
                      {t('copyExport')}
                    </button>
                    <button type="button" className={`${BUTTON_CLASS} border border-[#d8c6ad] bg-white text-slate-700 hover:bg-stone-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`}>
                      <Printer size={15} />
                      {t('print')}
                    </button>
                  </>
                )}
              </div>

              {exportRef && (
                <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                  {t('copied')}: <span className="font-mono" dir="ltr">{exportRef}</span>
                </div>
              )}

              <div className="mt-4 grid gap-3 2xl:grid-cols-[minmax(0,1fr)_280px]">
                <section>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
                    <Music2 size={15} />
                    {t('pieces')}
                  </div>
                  {canManage && pieceForm && (
                    <div className="mb-3 grid gap-2 rounded-md border border-stone-200 bg-stone-50 p-2 dark:border-slate-800 dark:bg-slate-950/50 md:grid-cols-6">
                      <input aria-label={t('order')} value={pieceForm.order} onChange={event => setPieceForm({ ...pieceForm, order: event.target.value })} className={`${FIELD_CLASS} md:col-span-1`} />
                      <input aria-label={t('pieceTitle')} placeholder={t('pieceTitle')} value={pieceForm.title} onChange={event => setPieceForm({ ...pieceForm, title: event.target.value })} className={`${FIELD_CLASS} md:col-span-2`} />
                      <input aria-label={t('composer')} placeholder={t('composer')} value={pieceForm.composer} onChange={event => setPieceForm({ ...pieceForm, composer: event.target.value })} className={`${FIELD_CLASS} md:col-span-2`} />
                      <input aria-label={t('duration')} placeholder="min" value={pieceForm.durationMinutes} onChange={event => setPieceForm({ ...pieceForm, durationMinutes: event.target.value })} className={`${FIELD_CLASS} md:col-span-1`} />
                      <select aria-label={t('studentPerformer')} value={pieceForm.studentId} onChange={event => setPieceForm({ ...pieceForm, studentId: event.target.value })} className={`${FIELD_CLASS} md:col-span-3`}>
                        <option value="">{t('noStudent')}</option>
                        {students.filter(student => !isStudentArchived(student)).map(student => <option key={student.id} value={student.id}>{student.fullName}</option>)}
                      </select>
                      <select aria-label={t('staffPerformer')} value={pieceForm.staffId} onChange={event => setPieceForm({ ...pieceForm, staffId: event.target.value })} className={`${FIELD_CLASS} md:col-span-2`}>
                        <option value="">{t('noStaff')}</option>
                        {staff.filter(member => !member.isArchived).map(member => <option key={member.id} value={member.id}>{member.fullName}</option>)}
                      </select>
                      <button type="button" onClick={addPiece} className={`${BUTTON_CLASS} bg-[#1f3a5f] text-white hover:bg-[#172d49] md:col-span-1`}>
                        <Plus size={14} />
                        {t('addPiece')}
                      </button>
                    </div>
                  )}

                  <div className="overflow-auto rounded-md border border-stone-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-stone-50 text-xs uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                        <tr>
                          <th className="px-2 py-2 text-start">{t('order')}</th>
                          <th className="px-2 py-2 text-start">{t('pieceTitle')}</th>
                          <th className="px-2 py-2 text-start">{t('performers')}</th>
                          <th className="px-2 py-2 text-end">{t('duration')}</th>
                          {canManage && <th className="px-2 py-2 text-end" />}
                        </tr>
                      </thead>
                      <tbody>
                        {runOfShow.length === 0 ? (
                          <tr><td colSpan={canManage ? 5 : 4} className="px-2 py-5 text-center text-slate-400">{t('selectPrompt')}</td></tr>
                        ) : runOfShow.map((line, index) => (
                          <tr key={`${line.order}-${line.title}-${index}`} className="border-t border-stone-100 dark:border-slate-800">
                            <td className="px-2 py-2 font-mono text-xs text-slate-500">{line.order}</td>
                            <td className="px-2 py-2">
                              <div className="font-semibold text-slate-900 dark:text-white">{line.title}</div>
                              {line.composer && <div className="text-xs text-slate-500">{line.composer}</div>}
                              <div className="mt-1 flex flex-wrap gap-1">
                                {line.orderConflict && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700 dark:bg-red-900/30 dark:text-red-200">{t('orderConflict')}</span>}
                                {(line.staleStudentIds.length > 0 || line.staleStaffIds.length > 0) && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">{t('stalePerformer')}</span>}
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t('mediaReleaseReview')}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{line.performerNames.join(', ') || '—'}</td>
                            <td className="px-2 py-2 text-end text-slate-600 dark:text-slate-300">
                              {line.durationMinutes ?? t('unknownDuration')}
                            </td>
                            {canManage && (
                              <td className="px-2 py-2">
                                <div className="flex justify-end gap-1">
                                  <button type="button" onClick={() => updateProgramPieces(moveConcertPiece(selected, index, -1, { now: nowIso(), actorId }))} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Move up">
                                    <ArrowUp size={14} />
                                  </button>
                                  <button type="button" onClick={() => updateProgramPieces(moveConcertPiece(selected, index, 1, { now: nowIso(), actorId }))} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Move down">
                                    <ArrowDown size={14} />
                                  </button>
                                  <button type="button" onClick={() => updateProgramPieces(removeConcertPiece(selected, index, { now: nowIso(), actorId }))} className="rounded p-1 text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30" title="Remove">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <aside className="space-y-3">
                  <section className="rounded-md border border-stone-200 p-3 text-xs dark:border-slate-800">
                    <div className="mb-2 flex items-center gap-2 font-semibold text-slate-800 dark:text-white">
                      <CalendarDays size={14} />
                      {t('runOfShow')}
                    </div>
                    <div className="space-y-1 text-slate-600 dark:text-slate-300">
                      {runOfShow.map(line => (
                        <div key={`${line.order}-${line.title}`} className="flex justify-between gap-2">
                          <span className="truncate">{line.order}. {line.title}</span>
                          <span className="shrink-0">{line.cumulativeMinutes === null ? '—' : `${line.cumulativeMinutes}m`}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-md border border-stone-200 p-3 text-xs dark:border-slate-800">
                    <div className="mb-2 flex items-center gap-2 font-semibold text-slate-800 dark:text-white">
                      <Link2 size={14} />
                      {t('sourceLinks')}
                    </div>
                    <div className="space-y-1 text-slate-600 dark:text-slate-300">
                      <div>{t('event')}: <span className="font-mono">{linkedEvent?.id ?? t('noEvent')}</span></div>
                      {linkedEvent?.isCanceled && <div className="text-amber-700 dark:text-amber-300">{t('cancelledEvent')}</div>}
                      {canManage && <div>{t('privateExport')}: <span className="font-mono break-all" dir="ltr">{privateRef || '—'}</span></div>}
                    </div>
                  </section>
                </aside>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60">
              {t('selectPrompt')}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
