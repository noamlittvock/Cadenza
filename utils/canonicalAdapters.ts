/**
 * canonicalAdapters — the single conversion seam between the legacy app
 * write-models (`Student`, `CalendarEvent` in `types.ts`) and the canonical
 * Blueprint v2.0 write-models (`StudentV2`, `EventV2` in `types/v2.ts`).
 *
 * Decisions D-04 / D-05 (decision-log.md): the canonical write-model is V2;
 * legacy shapes survive only at read edges via an adapter. This module is that
 * adapter. It is the ONE place legacy↔V2 conversion is allowed to live, so the
 * "type duplication" drift the planning audit flagged cannot reappear.
 *
 * Design rules:
 * - Pure functions. Callers pass `now`/`timeZone` (no `Date.now()` here), so the
 *   helpers stay deterministic and testable — same convention as
 *   `blueprintQueries.ts`.
 * - The legacy and V2 shapes are NOT isomorphic. Conversion is lossy in both
 *   directions; the dropped fields are enumerated in `LOSSY_STUDENT_FIELDS` /
 *   `LOSSY_EVENT_FIELDS` and asserted in the tests. Reverse adapters
 *   (`*V2ToLegacy`) are READ-ONLY reconstructions for legacy UI — never persist
 *   their output back as a source of truth, or the dropped fields are lost.
 * - Persistence is NOT touched. `students`/`events` still sync as HYBRID jsonb
 *   (utils/supabaseSync.ts); D-15 defers any data migration. This seam only
 *   converts in memory.
 *
 * The query layer already reads via `MinimalStudent`/`MinimalEvent`
 * (blueprintQueries.ts), so the `*ToMinimal` projections are the safe path for
 * helpers; the full reverse adapters are only for legacy components that render
 * a whole `Student`/`CalendarEvent`.
 */

import type {
  Student,
  CalendarEvent,
  Guardian,
  StaffDocument,
  PedagogicalRecord,
} from '../types';
import type { StudentV2, EventV2, DocumentEntry, EventStatus } from '../types/v2';
import type { AppTimestamp } from './appTimestamp';
import { fromDateTimestamp } from './appTimestamp';
import type { MinimalStudent, MinimalEvent } from './blueprintQueries';

// ─── Lossy-conversion manifests (asserted by the tests) ─────────────────────

/** Legacy `Student` fields with no home in `StudentV2`; dropped by `studentToV2`. */
export const LOSSY_STUDENT_FIELDS = [
  'isMinor',
  'governmentalId',
  'phone', // student's own phone — V2 keeps only parentPhone + phone2
  'assignments', // become EnrollmentV2 rows, modelled separately
  'pedagogicalRecord',
  'notes',
  'guardians[1+]', // V2 flattens to a single parentName/parentPhone
] as const;

/** Legacy `CalendarEvent` fields with no home in `EventV2`; dropped by `eventToV2`. */
export const LOSSY_EVENT_FIELDS = [
  'description', // mapped to notes
  'teacherId',
  'staffMemberIds', // become EventParticipant rows, modelled separately
  'roomId', // an id, not EventV2's free-text `location`
  'subtypeId',
  'schemaPayload',
  'isHidden',
  'canceledByBlackoutId',
  'recurrenceRule', // V2 keeps only isRecurring + recurringGroupId
  'exceptions',
  'isExceptionEdit',
  'originalStart',
  'googleEventId',
  'teacherGoogleEventIds',
  'tags',
] as const;

// ─── Timestamp helpers (ISO string ↔ AppTimestamp) ───────────────────────────

/** ISO-8601 string → Firestore-style AppTimestamp. */
export function isoToAppTimestamp(iso: string): AppTimestamp {
  return fromDateTimestamp(new Date(iso));
}

/** Firestore-style AppTimestamp → ISO-8601 string. */
export function appTimestampToIso(ts: AppTimestamp): string {
  const ms = ts.seconds * 1000 + Math.round(ts.nanoseconds / 1_000_000);
  return new Date(ms).toISOString();
}

// ─── Document helpers (StaffDocument ↔ DocumentEntry) ────────────────────────

export function staffDocumentToEntry(doc: StaffDocument): DocumentEntry {
  return {
    id: doc.id,
    name: doc.label,
    type: 'OTHER',
    date: doc.uploadedAt,
    notes: null,
    fileUrl: doc.url,
    filePath: null,
  };
}

/** Reverse: `uploadedBy` is unrecoverable from a DocumentEntry; left blank. */
export function documentEntryToStaffDocument(entry: DocumentEntry): StaffDocument {
  return {
    id: entry.id,
    label: entry.name,
    url: entry.fileUrl ?? '',
    uploadedAt: entry.date,
    uploadedBy: '',
  };
}

// ─── Timezone helpers (instant ↔ wall-clock in an IANA zone) ─────────────────
// The codebase has no tz library; these use Intl.formatToParts, which resolves
// IANA zones correctly. DST-transition wall times (nonexistent/ambiguous) are
// resolved to a single instant via the standard two-pass offset derivation —
// good enough for scheduling, exact for all non-transition times.

interface WallClock {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
}

function instantToWallClock(iso: string, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  // hour12:false can emit "24" at midnight in some engines; normalize to "00".
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}`,
  };
}

/** Wall-clock date+time interpreted in `timeZone` → ISO-8601 instant (UTC). */
function wallClockToInstant(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  // Treat the wall time as if it were UTC, then measure how far the target zone
  // is from UTC at that instant and correct.
  const guessMs = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  const shown = instantToWallClock(new Date(guessMs).toISOString(), timeZone);
  const [sy, smo, sd] = shown.date.split('-').map(Number);
  const [sh, smi] = shown.time.split(':').map(Number);
  const shownMs = Date.UTC(sy, smo - 1, sd, sh, smi, 0, 0);
  const offset = shownMs - guessMs; // zone is `offset` ahead of UTC
  return new Date(guessMs - offset).toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════
// Student  (D-04)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Legacy `Student` → canonical `StudentV2` (the write-model).
 * Flattens the first guardian into parentName/parentPhone and maps the numeric
 * `currentGrade` to a string `grade`. See `LOSSY_STUDENT_FIELDS` for drops.
 */
export function studentToV2(s: Student): StudentV2 {
  const primaryGuardian = s.guardians?.[0];
  return {
    id: s.id,
    orgId: s.orgId,
    fullName: s.fullName,
    dateOfBirth: s.dateOfBirth || null,
    parentName: primaryGuardian?.fullName ?? null,
    parentPhone: primaryGuardian?.phone ?? null,
    grade: s.currentGrade != null ? String(s.currentGrade) : null,
    startDate: null,
    level: null,
    tags: [],
    phone2: null,
    email: s.email ?? null,
    address: primaryGuardian?.address ?? null,
    isArchived: s.profileStatus === 'ARCHIVED',
    createdAt: isoToAppTimestamp(s.createdAt),
    updatedAt: isoToAppTimestamp(s.updatedAt),
    documents: (s.documents ?? []).map(staffDocumentToEntry),
  };
}

/** Canonical `StudentV2` → `MinimalStudent` (the shape query helpers consume). */
export function studentV2ToMinimal(s: StudentV2): MinimalStudent {
  return {
    id: s.id,
    fullName: s.fullName,
    familyId: null, // family linkage is modelled by the `families` table (D-03)
    isArchived: s.isArchived,
  };
}

/** Legacy `Student` → `MinimalStudent`, for query helpers fed from legacy state. */
export function studentToMinimal(s: Student): MinimalStudent {
  return {
    id: s.id,
    fullName: s.fullName,
    familyId: null,
    isArchived: s.profileStatus === 'ARCHIVED',
  };
}

const EMPTY_PEDAGOGICAL_RECORD: PedagogicalRecord = {
  lessonHistory: [],
  recitalHistory: [],
  reportCards: [],
};

/**
 * READ-ONLY reverse adapter: `StudentV2` → legacy `Student` for legacy UI that
 * still renders a whole `Student`. Reconstructs a single guardian from
 * parentName/parentPhone; fields in `LOSSY_STUDENT_FIELDS` are unrecoverable and
 * come back empty/defaulted. DO NOT persist the result as a source of truth.
 */
export function studentV2ToLegacy(v: StudentV2): Student {
  const parsedGrade = v.grade != null ? Number(v.grade) : NaN;
  const guardians: Guardian[] = v.parentName
    ? [
        {
          id: `${v.id}-guardian-0`,
          fullName: v.parentName,
          phone: v.parentPhone ?? undefined,
          address: v.address ?? undefined,
        },
      ]
    : [];
  return {
    id: v.id,
    orgId: v.orgId,
    fullName: v.fullName,
    dateOfBirth: v.dateOfBirth ?? '',
    isMinor: false, // unrecoverable
    currentGrade: Number.isNaN(parsedGrade) ? undefined : parsedGrade,
    governmentalId: undefined,
    phone: undefined,
    email: v.email ?? undefined,
    guardians,
    assignments: [], // EnrollmentV2 rows are not part of StudentV2
    pedagogicalRecord: EMPTY_PEDAGOGICAL_RECORD,
    notes: [],
    documents: v.documents.map(documentEntryToStaffDocument),
    profileStatus: v.isArchived ? 'ARCHIVED' : 'ACTIVE',
    createdAt: appTimestampToIso(v.createdAt),
    updatedAt: appTimestampToIso(v.updatedAt),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Event  (D-05)
// ═══════════════════════════════════════════════════════════════════════════

export interface EventToV2Options {
  orgId: string;
  timeZone: string; // IANA zone the wall-clock date/times are expressed in
  /** Fallback timestamps when the legacy event carries no `audit` block. */
  now: AppTimestamp;
}

function legacyEventStatus(ce: CalendarEvent): EventStatus {
  return ce.isCanceled ? 'CANCELLED' : 'SCHEDULED';
}

/**
 * Legacy `CalendarEvent` → canonical `EventV2` (the write-model).
 * Splits the ISO `start`/`end` instants into org-tz `date`/`startTime`/`endTime`
 * + an immutable `durationMinutes` snapshot. Staff (`staffMemberIds`) and
 * recurrence detail are NOT carried — see `LOSSY_EVENT_FIELDS`.
 */
export function eventToV2(ce: CalendarEvent, opts: EventToV2Options): EventV2 {
  const { date, time: startTime } = instantToWallClock(ce.start, opts.timeZone);
  const { time: endTime } = instantToWallClock(ce.end, opts.timeZone);
  const durationMinutes = Math.round(
    (new Date(ce.end).getTime() - new Date(ce.start).getTime()) / 60000,
  );
  const createdAt = ce.audit?.createdAt ? isoToAppTimestamp(ce.audit.createdAt) : opts.now;
  const updatedAt = ce.audit?.updatedAt ? isoToAppTimestamp(ce.audit.updatedAt) : opts.now;
  return {
    id: ce.id,
    orgId: opts.orgId,
    name: ce.name,
    activityId: ce.activityId ?? '',
    l1Id: null,
    l2Id: null,
    location: '', // legacy `roomId` is an id, not EventV2's free-text location
    date,
    startTime,
    endTime,
    durationMinutes,
    isRecurring: Boolean(ce.recurrenceRule || ce.recurrenceId),
    recurringGroupId: ce.recurrenceId ?? null,
    status: legacyEventStatus(ce),
    notes: ce.description || null,
    createdAt,
    updatedAt,
  };
}

/** Canonical `EventV2` → `MinimalEvent` (the shape query helpers consume). */
export function eventV2ToMinimal(e: EventV2): MinimalEvent {
  return {
    id: e.id,
    date: e.date,
    durationMinutes: e.durationMinutes,
    activityId: e.activityId,
    name: e.name,
    roomId: null, // EventV2 has no room reference (location is free text)
  };
}

/** Legacy `CalendarEvent` → `MinimalEvent`, for query helpers fed from legacy state. */
export function eventToMinimal(ce: CalendarEvent, timeZone: string): MinimalEvent {
  const { date } = instantToWallClock(ce.start, timeZone);
  return {
    id: ce.id,
    date,
    durationMinutes: Math.round(
      (new Date(ce.end).getTime() - new Date(ce.start).getTime()) / 60000,
    ),
    activityId: ce.activityId ?? null,
    name: ce.name,
    roomId: ce.roomId ?? null,
  };
}

export interface EventV2ToLegacyOptions {
  timeZone: string; // same IANA zone the EventV2 wall-clock is expressed in
}

/**
 * READ-ONLY reverse adapter: `EventV2` → legacy `CalendarEvent` for legacy UI
 * (e.g. the calendar grid) that still renders a whole `CalendarEvent`.
 * Reconstructs ISO `start`/`end` from the org-tz wall-clock; `end` is derived
 * from `durationMinutes` so duration round-trips exactly. Fields in
 * `LOSSY_EVENT_FIELDS` come back empty. DO NOT persist as a source of truth.
 */
export function eventV2ToLegacy(e: EventV2, opts: EventV2ToLegacyOptions): CalendarEvent {
  const start = wallClockToInstant(e.date, e.startTime, opts.timeZone);
  const end = new Date(
    new Date(start).getTime() + e.durationMinutes * 60000,
  ).toISOString();
  return {
    id: e.id,
    name: e.name,
    description: e.notes ?? '',
    activityId: e.activityId || undefined,
    staffMemberIds: [],
    start,
    end,
    isCanceled: e.status === 'CANCELLED',
    isHidden: false,
    recurrenceId: e.recurringGroupId ?? undefined,
    audit: {
      createdAt: appTimestampToIso(e.createdAt),
      updatedAt: appTimestampToIso(e.updatedAt),
    },
  };
}
