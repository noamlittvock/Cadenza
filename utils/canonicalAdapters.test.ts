import { describe, it, expect } from 'vitest';
import type { Student, CalendarEvent } from '../types';
import type { StudentV2, EventV2 } from '../types/v2';
import type { AppTimestamp } from './appTimestamp';
import {
  isoToAppTimestamp,
  appTimestampToIso,
  staffDocumentToEntry,
  documentEntryToStaffDocument,
  studentToV2,
  studentV2ToMinimal,
  studentToMinimal,
  studentV2ToLegacy,
  eventToV2,
  eventV2ToMinimal,
  eventToMinimal,
  eventV2ToLegacy,
  LOSSY_STUDENT_FIELDS,
  LOSSY_EVENT_FIELDS,
} from './canonicalAdapters';

const NOW: AppTimestamp = { seconds: 1_700_000_000, nanoseconds: 0 };

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'stu_1',
    orgId: 'org_1',
    fullName: 'Dana Cohen',
    dateOfBirth: '2010-04-01',
    isMinor: true,
    currentGrade: 7,
    governmentalId: '123456789',
    phone: '050-1111111',
    email: 'dana@example.com',
    guardians: [
      { id: 'g1', fullName: 'Ron Cohen', phone: '050-2222222', address: '1 Herzl St' },
      { id: 'g2', fullName: 'Mia Cohen', phone: '050-3333333' },
    ],
    assignments: [
      {
        id: 'a1', activityId: 'act_1', subcategoryId: 'l2_1', staffMemberId: 'st_1',
        teachingAssignmentId: 'ta_1', startDate: '2025-09-01', status: 'ACTIVE',
      },
    ],
    pedagogicalRecord: { lessonHistory: ['x'], recitalHistory: [], reportCards: [] },
    notes: [{ id: 'n1', content: 'note', createdAt: '2025-09-01', createdBy: 'u1' }],
    documents: [
      { id: 'd1', label: 'Diploma', url: 'https://x/d1', uploadedAt: '2025-09-02', uploadedBy: 'u1' },
    ],
    profileStatus: 'ACTIVE',
    createdAt: '2025-09-01T00:00:00.000Z',
    updatedAt: '2025-09-05T12:00:00.000Z',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'ev_1',
    name: 'Piano Lesson',
    description: 'weekly',
    activityId: 'act_1',
    teacherId: 'st_1',
    roomId: 'room_1',
    staffMemberIds: ['st_1', 'st_2'],
    start: '2026-01-15T08:30:00.000Z',
    end: '2026-01-15T09:30:00.000Z',
    isCanceled: false,
    isHidden: false,
    ...overrides,
  };
}

describe('timestamp helpers', () => {
  it('round-trips whole-second ISO', () => {
    const iso = '2026-01-15T08:30:00.000Z';
    expect(appTimestampToIso(isoToAppTimestamp(iso))).toBe(iso);
  });
  it('round-trips sub-second ISO', () => {
    const iso = '2026-01-15T08:30:00.123Z';
    expect(appTimestampToIso(isoToAppTimestamp(iso))).toBe(iso);
  });
});

describe('document helpers', () => {
  it('maps StaffDocument → DocumentEntry', () => {
    const entry = staffDocumentToEntry({
      id: 'd1', label: 'Diploma', url: 'u', uploadedAt: '2025-09-02', uploadedBy: 'u1',
    });
    expect(entry).toEqual({
      id: 'd1', name: 'Diploma', type: 'OTHER', date: '2025-09-02',
      notes: null, fileUrl: 'u', filePath: null,
    });
  });
  it('loses uploadedBy on the reverse', () => {
    const back = documentEntryToStaffDocument(staffDocumentToEntry({
      id: 'd1', label: 'Diploma', url: 'u', uploadedAt: '2025-09-02', uploadedBy: 'u1',
    }));
    expect(back).toEqual({ id: 'd1', label: 'Diploma', url: 'u', uploadedAt: '2025-09-02', uploadedBy: '' });
  });
});

describe('studentToV2', () => {
  it('flattens the first guardian and maps grade/status/email/documents', () => {
    const v = studentToV2(makeStudent());
    expect(v.parentName).toBe('Ron Cohen');
    expect(v.parentPhone).toBe('050-2222222');
    expect(v.address).toBe('1 Herzl St');
    expect(v.grade).toBe('7'); // numeric currentGrade → string
    expect(v.email).toBe('dana@example.com');
    expect(v.isArchived).toBe(false);
    expect(v.documents).toEqual([
      { id: 'd1', name: 'Diploma', type: 'OTHER', date: '2025-09-02', notes: null, fileUrl: 'https://x/d1', filePath: null },
    ]);
    expect(v.createdAt).toEqual(isoToAppTimestamp('2025-09-01T00:00:00.000Z'));
  });

  it('maps archived status and null-empty optional fields', () => {
    const v = studentToV2(makeStudent({
      profileStatus: 'ARCHIVED', dateOfBirth: '', currentGrade: undefined, email: undefined, guardians: [],
    }));
    expect(v.isArchived).toBe(true);
    expect(v.dateOfBirth).toBeNull();
    expect(v.grade).toBeNull();
    expect(v.email).toBeNull();
    expect(v.parentName).toBeNull();
    expect(v.parentPhone).toBeNull();
  });

  it('drops every field named in the lossy manifest', () => {
    const v = studentToV2(makeStudent()) as Record<string, unknown>;
    // V2 simply has no key for these legacy concepts.
    for (const field of ['isMinor', 'governmentalId', 'assignments', 'pedagogicalRecord', 'notes']) {
      expect(v[field]).toBeUndefined();
    }
    expect(LOSSY_STUDENT_FIELDS).toContain('assignments');
    expect(LOSSY_STUDENT_FIELDS).toContain('guardians[1+]');
  });
});

describe('student minimal projections', () => {
  it('studentV2ToMinimal projects identity + archived', () => {
    const v = studentToV2(makeStudent({ profileStatus: 'ARCHIVED' }));
    expect(studentV2ToMinimal(v)).toEqual({ id: 'stu_1', fullName: 'Dana Cohen', familyId: null, isArchived: true });
  });
  it('studentToMinimal matches studentV2ToMinimal(studentToV2(s))', () => {
    const s = makeStudent();
    expect(studentToMinimal(s)).toEqual(studentV2ToMinimal(studentToV2(s)));
  });
});

describe('studentV2ToLegacy (read-only reverse)', () => {
  it('reconstructs a single guardian and drops the lossy fields', () => {
    const v = studentToV2(makeStudent());
    const back = studentV2ToLegacy(v);
    expect(back.guardians).toEqual([
      { id: 'stu_1-guardian-0', fullName: 'Ron Cohen', phone: '050-2222222', address: '1 Herzl St' },
    ]);
    expect(back.currentGrade).toBe(7); // string grade → number
    expect(back.profileStatus).toBe('ACTIVE');
    expect(back.email).toBe('dana@example.com');
    // Lossy: unrecoverable from StudentV2.
    expect(back.isMinor).toBe(false);
    expect(back.assignments).toEqual([]);
    expect(back.notes).toEqual([]);
    expect(back.pedagogicalRecord).toEqual({ lessonHistory: [], recitalHistory: [], reportCards: [] });
    expect(back.governmentalId).toBeUndefined();
  });

  it('round-trips identity, contact, status and timestamps', () => {
    const s = makeStudent();
    const back = studentV2ToLegacy(studentToV2(s));
    expect(back.id).toBe(s.id);
    expect(back.orgId).toBe(s.orgId);
    expect(back.fullName).toBe(s.fullName);
    expect(back.createdAt).toBe(s.createdAt);
    expect(back.updatedAt).toBe(s.updatedAt);
  });
});

describe('eventToV2', () => {
  it('splits ISO instants into UTC wall-clock + duration', () => {
    const e = eventToV2(makeEvent(), { orgId: 'org_1', timeZone: 'UTC', now: NOW });
    expect(e.date).toBe('2026-01-15');
    expect(e.startTime).toBe('08:30');
    expect(e.endTime).toBe('09:30');
    expect(e.durationMinutes).toBe(60);
    expect(e.status).toBe('SCHEDULED');
    expect(e.notes).toBe('weekly');
    expect(e.activityId).toBe('act_1');
    expect(e.location).toBe('');
  });

  it('expresses wall-clock in the supplied IANA zone (winter +2)', () => {
    const e = eventToV2(makeEvent(), { orgId: 'org_1', timeZone: 'Asia/Jerusalem', now: NOW });
    expect(e.date).toBe('2026-01-15');
    expect(e.startTime).toBe('10:30'); // UTC+2 in January
    expect(e.endTime).toBe('11:30');
  });

  it('marks recurrence and cancellation', () => {
    const e = eventToV2(
      makeEvent({ isCanceled: true, recurrenceId: 'series_9' }),
      { orgId: 'org_1', timeZone: 'UTC', now: NOW },
    );
    expect(e.status).toBe('CANCELLED');
    expect(e.isRecurring).toBe(true);
    expect(e.recurringGroupId).toBe('series_9');
  });

  it('falls back to opts.now when the legacy event has no audit block', () => {
    const e = eventToV2(makeEvent(), { orgId: 'org_1', timeZone: 'UTC', now: NOW });
    expect(e.createdAt).toEqual(NOW);
    expect(e.updatedAt).toEqual(NOW);
  });

  it('uses audit timestamps when present', () => {
    const e = eventToV2(
      makeEvent({ audit: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' } }),
      { orgId: 'org_1', timeZone: 'UTC', now: NOW },
    );
    expect(e.createdAt).toEqual(isoToAppTimestamp('2026-01-01T00:00:00.000Z'));
    expect(e.updatedAt).toEqual(isoToAppTimestamp('2026-01-02T00:00:00.000Z'));
  });

  it('drops staffMemberIds (lossy manifest)', () => {
    expect(LOSSY_EVENT_FIELDS).toContain('staffMemberIds');
    expect(LOSSY_EVENT_FIELDS).toContain('recurrenceRule');
  });
});

describe('event minimal projections', () => {
  it('eventV2ToMinimal projects date/duration/activity', () => {
    const e = eventToV2(makeEvent(), { orgId: 'org_1', timeZone: 'UTC', now: NOW });
    expect(eventV2ToMinimal(e)).toEqual({
      id: 'ev_1', date: '2026-01-15', durationMinutes: 60, activityId: 'act_1', name: 'Piano Lesson', roomId: null,
    });
  });
  it('eventToMinimal keeps the legacy roomId', () => {
    expect(eventToMinimal(makeEvent(), 'UTC')).toEqual({
      id: 'ev_1', date: '2026-01-15', durationMinutes: 60, activityId: 'act_1', name: 'Piano Lesson', roomId: 'room_1',
    });
  });
});

describe('eventV2ToLegacy (read-only reverse)', () => {
  it.each(['UTC', 'Asia/Jerusalem', 'America/New_York'])(
    'round-trips start/end instants and duration through zone %s (winter)',
    (tz) => {
      const original = makeEvent();
      const v = eventToV2(original, { orgId: 'org_1', timeZone: tz, now: NOW });
      const back = eventV2ToLegacy(v, { timeZone: tz });
      expect(new Date(back.start).toISOString()).toBe(original.start);
      expect(new Date(back.end).toISOString()).toBe(original.end);
    },
  );

  it.each(['UTC', 'Asia/Jerusalem', 'America/New_York'])(
    'round-trips a summer instant through zone %s (DST)',
    (tz) => {
      const original = makeEvent({ start: '2026-07-15T08:30:00.000Z', end: '2026-07-15T10:00:00.000Z' });
      const v = eventToV2(original, { orgId: 'org_1', timeZone: tz, now: NOW });
      const back = eventV2ToLegacy(v, { timeZone: tz });
      expect(new Date(back.start).toISOString()).toBe(original.start);
      expect(new Date(back.end).toISOString()).toBe(original.end);
      expect(v.durationMinutes).toBe(90);
    },
  );

  it('reconstructs description/status and leaves lossy fields empty', () => {
    const v = eventToV2(makeEvent({ isCanceled: true }), { orgId: 'org_1', timeZone: 'UTC', now: NOW });
    const back = eventV2ToLegacy(v, { timeZone: 'UTC' });
    expect(back.isCanceled).toBe(true);
    expect(back.description).toBe('weekly');
    expect(back.staffMemberIds).toEqual([]);
    expect(back.isHidden).toBe(false);
  });
});
