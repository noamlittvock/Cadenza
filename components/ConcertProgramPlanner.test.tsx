import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../types';
import type { ConcertProgram } from '../types/blueprint';
import {
  addConcertPiece,
  applyConcertProgramForm,
  buildConcertProgramDraft,
  filterConcertProgramsForActor,
  moveConcertPiece,
  programsForConcertScope,
} from './ConcertProgramPlanner';

const NOW = '2026-06-19T12:00:00.000Z';
const base = { orgId: 'org_1', createdAt: NOW, updatedAt: NOW, createdBy: 'admin_1', updatedBy: 'admin_1' };

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'event_1',
  name: 'Winter Recital',
  description: '',
  teacherId: 'staff_1',
  roomId: 'room_1',
  activityId: 'activity_1',
  start: '2026-12-01T17:00:00.000Z',
  end: '2026-12-01T19:00:00.000Z',
  isCanceled: false,
  isHidden: false,
  ...overrides,
});

const program = (overrides: Partial<ConcertProgram> = {}): ConcertProgram => ({
  ...base,
  id: 'program_1',
  title: 'Winter Recital',
  eventId: 'event_1',
  date: '2026-12-01',
  venue: 'Main Hall',
  status: 'DRAFT',
  notes: null,
  pieces: [],
  ...overrides,
});

describe('ConcertProgramPlanner helpers', () => {
  it('filters private programs by event and activity context including unlinked drafts', () => {
    const events = [
      event(),
      event({ id: 'event_2', activityId: 'activity_2', name: 'Other Activity' }),
    ];
    const programs = [
      program(),
      program({ id: 'program_2', eventId: 'event_2', title: 'Other Program' }),
      program({ id: 'program_unlinked', eventId: null, title: 'Unlinked Draft' }),
    ];

    expect(programsForConcertScope(programs, { kind: 'event', event: events[0] }, events).map(row => row.id))
      .toEqual(['program_1']);
    expect(programsForConcertScope(programs, { kind: 'activity', activityId: 'activity_1', activityName: 'Activity 1' }, events).map(row => row.id))
      .toEqual(['program_1', 'program_unlinked']);
  });

  it('creates a draft from the event source without mutating the event', () => {
    const sourceEvent = event({ id: 'event_source', name: 'Spring Showcase', start: '2026-04-05T15:00:00.000Z' });
    const draft = buildConcertProgramDraft({
      id: 'program_new',
      orgId: 'org_1',
      now: NOW,
      actorId: 'admin_2',
      scope: { kind: 'event', event: sourceEvent },
      events: [sourceEvent],
    });

    expect(draft).toMatchObject({
      id: 'program_new',
      title: 'Spring Showcase',
      eventId: 'event_source',
      date: '2026-04-05',
      status: 'DRAFT',
      pieces: [],
      createdBy: 'admin_2',
      updatedBy: 'admin_2',
    });
    expect(sourceEvent.name).toBe('Spring Showcase');
  });

  it('applies metadata edits while preserving private planning semantics', () => {
    const updated = applyConcertProgramForm(program(), {
      title: ' Winter Recital Updated ',
      date: '2026-12-02',
      venue: '  Private Hall ',
      status: 'PUBLISHED',
      eventId: '',
      notes: '  authenticated print only ',
    }, { now: '2026-06-19T13:00:00.000Z', actorId: 'admin_3' });

    expect(updated).toMatchObject({
      title: 'Winter Recital Updated',
      eventId: null,
      date: '2026-12-02',
      venue: 'Private Hall',
      status: 'PUBLISHED',
      notes: 'authenticated print only',
      updatedBy: 'admin_3',
    });
  });

  it('adds and reorders pieces with student/staff performer references', () => {
    const first = addConcertPiece(program(), {
      order: '2',
      title: 'Second Piece',
      composer: 'Composer B',
      durationMinutes: '5',
      studentId: 'student_1',
      staffId: '',
    }, { now: NOW, actorId: 'admin_1' });
    const second = addConcertPiece(first, {
      order: '1',
      title: 'First Piece',
      composer: '',
      durationMinutes: '',
      studentId: '',
      staffId: 'staff_1',
    }, { now: NOW, actorId: 'admin_1' });

    expect(second.pieces.map(piece => piece.title)).toEqual(['First Piece', 'Second Piece']);
    expect(second.pieces[0]).toMatchObject({ durationMinutes: null, performerStaffIds: ['staff_1'] });
    expect(second.pieces[1]).toMatchObject({ durationMinutes: 5, performerStudentIds: ['student_1'] });

    const moved = moveConcertPiece(second, 0, 1, { now: '2026-06-19T14:00:00.000Z', actorId: 'admin_1' });
    expect(moved.pieces.map(piece => `${piece.order}:${piece.title}`)).toEqual(['1:Second Piece', '2:First Piece']);
  });

  it('filters teacher read-only run-of-show access to linked events or staff performer pieces', () => {
    const linkedEvent = program({ id: 'program_event', eventId: 'event_1' });
    const performerPiece = program({
      id: 'program_performer',
      eventId: null,
      pieces: [{
        order: 1,
        title: 'Staff solo',
        composer: null,
        performerStudentIds: [],
        performerStaffIds: ['staff_2'],
        durationMinutes: 4,
      }],
    });
    const other = program({ id: 'program_other', eventId: 'event_other' });
    const programs = [linkedEvent, performerPiece, other];

    expect(filterConcertProgramsForActor(programs, { canManage: true }).map(row => row.id))
      .toEqual(['program_event', 'program_performer', 'program_other']);
    expect(filterConcertProgramsForActor(programs, {
      canManage: false,
      staffMemberId: 'staff_2',
      readableEventIds: ['event_1'],
    }).map(row => row.id)).toEqual(['program_event', 'program_performer']);
    expect(filterConcertProgramsForActor(programs, {
      canManage: false,
      staffMemberId: 'staff_3',
      readableEventIds: [],
    })).toEqual([]);
  });
});
