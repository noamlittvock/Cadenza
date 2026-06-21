import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Room } from '../types';
import type { OperationalRequest } from '../types/blueprint';
import {
  OperationalRequestError,
  attachApprovalItemToOperationalRequest,
  buildOperationalRequestApprovalItem,
  buildOperationalRequestDraft,
  cancelOwnPendingOperationalRequest,
  decideOperationalRequest,
  roomNameById,
} from './operationalRequestService';

const NOW = '2026-06-19T12:00:00.000Z';
const event: CalendarEvent = {
  id: 'event_1',
  name: 'Piano Lesson',
  description: '',
  teacherId: 'staff_1',
  staffMemberIds: ['staff_1'],
  roomId: 'room_1',
  start: '2026-06-20T10:00:00.000Z',
  end: '2026-06-20T11:00:00.000Z',
  isCanceled: false,
  isHidden: false,
};

describe('operational request service', () => {
  it('builds a pending room-change request with source lineage', () => {
    const request = buildOperationalRequestDraft({
      id: 'request_1',
      orgId: 'org_1',
      nowIso: NOW,
      actorId: 'user_1',
      staffMemberId: 'staff_1',
      kind: 'ROOM_CHANGE',
      requestedFor: '2026-06-20',
      event,
      requestedRoomId: 'room_2',
      reason: '  grand piano needed  ',
    });

    expect(request).toMatchObject({
      id: 'request_1',
      kind: 'ROOM_CHANGE',
      status: 'PENDING',
      requestedByStaffId: 'staff_1',
      eventId: 'event_1',
      currentRoomId: 'room_1',
      requestedRoomId: 'room_2',
      reason: 'grand piano needed',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdBy: 'user_1',
    });
  });

  it('rejects room changes without a real requested room delta', () => {
    expect(() => buildOperationalRequestDraft({
      id: 'request_1',
      orgId: 'org_1',
      nowIso: NOW,
      staffMemberId: 'staff_1',
      kind: 'ROOM_CHANGE',
      requestedFor: '2026-06-20',
      event,
      requestedRoomId: 'room_1',
    })).toThrow(OperationalRequestError);
  });

  it('builds absence and day-off requests without calendar or payroll side effects', () => {
    const absence = buildOperationalRequestDraft({
      id: 'request_absence',
      orgId: 'org_1',
      nowIso: NOW,
      staffMemberId: 'staff_1',
      kind: 'ABSENCE',
      requestedFor: '2026-06-21',
      endDate: '2026-06-22',
      reason: 'doctor',
    });
    const dayOff = buildOperationalRequestDraft({
      id: 'request_day_off',
      orgId: 'org_1',
      nowIso: NOW,
      staffMemberId: 'staff_1',
      kind: 'DAY_OFF',
      requestedFor: '2026-06-23',
    });

    expect(absence).toMatchObject({
      kind: 'ABSENCE',
      status: 'PENDING',
      eventId: null,
      currentRoomId: null,
      requestedRoomId: null,
      endDate: '2026-06-22',
    });
    expect(dayOff).toMatchObject({
      kind: 'DAY_OFF',
      status: 'PENDING',
      eventId: null,
      currentRoomId: null,
      requestedRoomId: null,
    });
  });

  it('creates linked approval-request inbox items with exact operational-request lineage', () => {
    const request = buildOperationalRequestDraft({
      id: 'request_1',
      orgId: 'org_1',
      nowIso: NOW,
      staffMemberId: 'staff_1',
      kind: 'ROOM_CHANGE',
      requestedFor: '2026-06-20',
      event,
      requestedRoomId: 'room_2',
      reason: 'needs piano',
    });
    const item = buildOperationalRequestApprovalItem({
      id: 'inbox_1',
      orgId: 'org_1',
      nowIso: NOW,
      request,
      staffName: 'Ada Teacher',
      eventName: 'Piano Lesson',
      currentRoomName: 'Room A',
      requestedRoomName: 'Room B',
    });

    expect(item).toMatchObject({
      id: 'inbox_1',
      type: 'APPROVAL_REQUEST',
      status: 'OPEN',
      relatedEntityType: 'operationalRequest',
      relatedEntityIds: ['request_1', 'event_1', 'room_2'],
      requestedBy: 'staff_1',
    });
    expect(attachApprovalItemToOperationalRequest(request, item.id).adminInboxItemId).toBe('inbox_1');
  });

  it('cancels only own pending requests and leaves decision lineage untouched', () => {
    const request: OperationalRequest = {
      id: 'request_1',
      orgId: 'org_1',
      kind: 'DAY_OFF',
      status: 'PENDING',
      requestedByStaffId: 'staff_1',
      requestedFor: '2026-06-20',
      endDate: null,
      eventId: null,
      currentRoomId: null,
      requestedRoomId: null,
      reason: null,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    expect(cancelOwnPendingOperationalRequest({
      request,
      staffMemberId: 'staff_1',
      actorId: 'user_1',
      nowIso: '2026-06-19T13:00:00.000Z',
    })).toMatchObject({
      status: 'CANCELLED',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      updatedBy: 'user_1',
    });
    expect(() => cancelOwnPendingOperationalRequest({
      request,
      staffMemberId: 'staff_2',
      nowIso: NOW,
    })).toThrow(OperationalRequestError);
    expect(() => cancelOwnPendingOperationalRequest({
      request: { ...request, status: 'APPROVED' },
      staffMemberId: 'staff_1',
      nowIso: NOW,
    })).toThrow(OperationalRequestError);
  });

  it('resolves room names with id fallback for stale linked rooms', () => {
    const rooms: Room[] = [{ id: 'room_1', name: 'Room A', itinerary: '' }];
    expect(roomNameById(rooms, 'room_1')).toBe('Room A');
    expect(roomNameById(rooms, 'missing_room')).toBe('missing_room');
    expect(roomNameById(rooms, null)).toBeNull();
  });

  it('approves room changes through the linked inbox item and returns only the event room mutation', () => {
    const request = attachApprovalItemToOperationalRequest(buildOperationalRequestDraft({
      id: 'request_approve',
      orgId: 'org_1',
      nowIso: NOW,
      staffMemberId: 'staff_1',
      kind: 'ROOM_CHANGE',
      requestedFor: '2026-06-20',
      event,
      requestedRoomId: 'room_2',
    }), 'inbox_approve');
    const inboxItem = buildOperationalRequestApprovalItem({
      id: 'inbox_approve',
      orgId: 'org_1',
      nowIso: NOW,
      request,
      staffName: 'Ada Teacher',
    });

    const result = decideOperationalRequest({
      request,
      inboxItem,
      decision: 'APPROVED',
      decidedBy: 'admin_1',
      nowIso: '2026-06-19T13:00:00.000Z',
      note: 'Approved after checking the room chart.',
      eventIds: ['event_1'],
      roomIds: ['room_1', 'room_2'],
    });

    expect(result.request).toMatchObject({
      status: 'APPROVED',
      decidedBy: 'admin_1',
      decidedAt: '2026-06-19T13:00:00.000Z',
      decisionNote: 'Approved after checking the room chart.',
      updatedBy: 'admin_1',
    });
    expect(result.inboxItem).toMatchObject({
      status: 'APPROVED',
      decidedBy: 'admin_1',
      decisionNote: 'Approved after checking the room chart.',
    });
    expect(result.eventUpdate).toEqual({ eventId: 'event_1', roomId: 'room_2' });
    expect(result).not.toHaveProperty('ganttBlock');
    expect(result).not.toHaveProperty('hoursEntry');
  });

  it('rejects pending requests without mutating events or D-21 side-effect records', () => {
    const request = attachApprovalItemToOperationalRequest(buildOperationalRequestDraft({
      id: 'request_reject',
      orgId: 'org_1',
      nowIso: NOW,
      staffMemberId: 'staff_1',
      kind: 'ABSENCE',
      requestedFor: '2026-06-21',
      reason: 'medical',
    }), 'inbox_reject');
    const inboxItem = buildOperationalRequestApprovalItem({
      id: 'inbox_reject',
      orgId: 'org_1',
      nowIso: NOW,
      request,
      staffName: 'Ada Teacher',
    });

    const result = decideOperationalRequest({
      request,
      inboxItem,
      decision: 'REJECTED',
      decidedBy: 'admin_1',
      nowIso: '2026-06-19T13:00:00.000Z',
      note: 'Coverage unavailable.',
    });

    expect(result.request).toMatchObject({
      status: 'REJECTED',
      decisionNote: 'Coverage unavailable.',
      eventId: null,
    });
    expect(result.inboxItem.status).toBe('REJECTED');
    expect(result.eventUpdate).toBeNull();
    expect(result).not.toHaveProperty('ganttBlock');
    expect(result).not.toHaveProperty('hoursEntry');
  });

  it('approves absence and day-off rows as review decisions only', () => {
    const request = attachApprovalItemToOperationalRequest(buildOperationalRequestDraft({
      id: 'request_day_off',
      orgId: 'org_1',
      nowIso: NOW,
      staffMemberId: 'staff_1',
      kind: 'DAY_OFF',
      requestedFor: '2026-06-21',
    }), 'inbox_day_off');
    const inboxItem = buildOperationalRequestApprovalItem({
      id: 'inbox_day_off',
      orgId: 'org_1',
      nowIso: NOW,
      request,
      staffName: 'Ada Teacher',
    });

    const result = decideOperationalRequest({
      request,
      inboxItem,
      decision: 'APPROVED',
      decidedBy: 'admin_1',
      nowIso: '2026-06-19T13:00:00.000Z',
      note: 'Review schedule manually before changing lessons or payroll.',
    });

    expect(result.request).toMatchObject({
      kind: 'DAY_OFF',
      status: 'APPROVED',
      decisionNote: 'Review schedule manually before changing lessons or payroll.',
    });
    expect(result.eventUpdate).toBeNull();
    expect(result).not.toHaveProperty('ganttBlockId');
    expect(result).not.toHaveProperty('hoursEntryId');
  });

  it('blocks room-change approval when linked event or room ids are stale', () => {
    const request = attachApprovalItemToOperationalRequest(buildOperationalRequestDraft({
      id: 'request_stale',
      orgId: 'org_1',
      nowIso: NOW,
      staffMemberId: 'staff_1',
      kind: 'ROOM_CHANGE',
      requestedFor: '2026-06-20',
      event,
      requestedRoomId: 'room_2',
    }), 'inbox_stale');
    const inboxItem = buildOperationalRequestApprovalItem({
      id: 'inbox_stale',
      orgId: 'org_1',
      nowIso: NOW,
      request,
      staffName: 'Ada Teacher',
    });

    expect(() => decideOperationalRequest({
      request,
      inboxItem,
      decision: 'APPROVED',
      decidedBy: 'admin_1',
      nowIso: '2026-06-19T13:00:00.000Z',
      eventIds: ['event_1'],
      roomIds: ['room_1'],
    })).toThrow(OperationalRequestError);
  });
});
