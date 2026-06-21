import type { CalendarEvent, AdminInboxItem, Room } from '../types';
import type { OperationalRequest, RequestKind } from '../types/blueprint';
import { decideApproval, makeApprovalRequest } from './adminInbox';
import { applyApprovedRoomChange } from './blueprintQueries';

export class OperationalRequestError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'OperationalRequestError';
  }
}

export interface OperationalRequestDraftInput {
  id: string;
  orgId: string;
  nowIso: string;
  actorId?: string | null;
  staffMemberId?: string | null;
  kind: RequestKind;
  requestedFor: string;
  endDate?: string | null;
  event?: CalendarEvent | null;
  requestedRoomId?: string | null;
  reason?: string | null;
}

export function buildOperationalRequestDraft(input: OperationalRequestDraftInput): OperationalRequest {
  const staffMemberId = input.staffMemberId?.trim();
  if (!staffMemberId) {
    throw new OperationalRequestError('STAFF_REQUIRED', 'A requesting staff member is required.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.requestedFor)) {
    throw new OperationalRequestError('DATE_REQUIRED', 'A valid request date is required.');
  }

  const normalizedReason = input.reason?.trim() || null;
  const common = {
    id: input.id,
    orgId: input.orgId,
    kind: input.kind,
    status: 'PENDING' as const,
    requestedByStaffId: staffMemberId,
    requestedFor: input.requestedFor,
    endDate: input.endDate || null,
    reason: normalizedReason,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
    createdBy: input.actorId ?? staffMemberId,
    updatedBy: input.actorId ?? staffMemberId,
  };

  if (input.kind === 'ROOM_CHANGE') {
    if (!input.event) {
      throw new OperationalRequestError('EVENT_REQUIRED', 'Room-change requests require a linked event.');
    }
    const currentRoomId = input.event.roomId || null;
    const requestedRoomId = input.requestedRoomId?.trim() || null;
    if (!currentRoomId || !requestedRoomId) {
      throw new OperationalRequestError('ROOM_REQUIRED', 'Current and requested rooms are required.');
    }
    if (currentRoomId === requestedRoomId) {
      throw new OperationalRequestError('ROOM_UNCHANGED', 'Requested room must differ from the current room.');
    }

    return {
      ...common,
      eventId: input.event.id,
      currentRoomId,
      requestedRoomId,
    };
  }

  return {
    ...common,
    eventId: null,
    currentRoomId: null,
    requestedRoomId: null,
  };
}

export function attachApprovalItemToOperationalRequest(
  request: OperationalRequest,
  approvalItemId: string,
): OperationalRequest {
  return {
    ...request,
    adminInboxItemId: approvalItemId,
  };
}

export function buildOperationalRequestApprovalItem(input: {
  id: string;
  orgId: string;
  nowIso: string;
  request: OperationalRequest;
  staffName: string;
  eventName?: string | null;
  currentRoomName?: string | null;
  requestedRoomName?: string | null;
}): AdminInboxItem {
  const title = input.request.kind === 'ROOM_CHANGE'
    ? `Room change request: ${input.staffName}`
    : `${input.request.kind === 'DAY_OFF' ? 'Day-off' : 'Absence'} request: ${input.staffName}`;
  const dateRange = input.request.endDate && input.request.endDate !== input.request.requestedFor
    ? `${input.request.requestedFor} - ${input.request.endDate}`
    : input.request.requestedFor;
  const roomLine = input.request.kind === 'ROOM_CHANGE'
    ? ` · ${input.currentRoomName || input.request.currentRoomId || 'Current room'} -> ${input.requestedRoomName || input.request.requestedRoomId || 'Requested room'}`
    : '';
  const eventLine = input.eventName ? ` · ${input.eventName}` : '';
  const reasonLine = input.request.reason ? ` · ${input.request.reason}` : '';

  return makeApprovalRequest({
    id: input.id,
    orgId: input.orgId,
    title,
    message: `${dateRange}${eventLine}${roomLine}${reasonLine}`,
    relatedEntityType: 'operationalRequest',
    relatedEntityIds: [
      input.request.id,
      ...(input.request.eventId ? [input.request.eventId] : []),
      ...(input.request.requestedRoomId ? [input.request.requestedRoomId] : []),
    ],
    requestedBy: input.request.requestedByStaffId ?? undefined,
    nowIso: input.nowIso,
  });
}

export function cancelOwnPendingOperationalRequest(input: {
  request: OperationalRequest;
  staffMemberId?: string | null;
  actorId?: string | null;
  nowIso: string;
}): OperationalRequest {
  const staffMemberId = input.staffMemberId?.trim();
  if (!staffMemberId || input.request.requestedByStaffId !== staffMemberId) {
    throw new OperationalRequestError('NOT_OWNER', 'Only the requesting staff member can cancel this request.');
  }
  if (input.request.status !== 'PENDING') {
    throw new OperationalRequestError('NOT_PENDING', 'Only pending requests can be cancelled.');
  }
  return {
    ...input.request,
    status: 'CANCELLED',
    updatedAt: input.nowIso,
    updatedBy: input.actorId ?? staffMemberId,
  };
}

export interface OperationalRequestDecisionResult {
  request: OperationalRequest;
  inboxItem: AdminInboxItem;
  eventUpdate: { eventId: string; roomId: string } | null;
}

export function decideOperationalRequest(input: {
  request: OperationalRequest;
  inboxItem: AdminInboxItem;
  decision: 'APPROVED' | 'REJECTED';
  decidedBy: string;
  nowIso: string;
  note?: string | null;
  eventIds?: readonly string[];
  roomIds?: readonly string[];
  currentEventRoomId?: string | null;
}): OperationalRequestDecisionResult {
  if (input.request.status !== 'PENDING') {
    throw new OperationalRequestError('NOT_PENDING', 'Only pending requests can be decided.');
  }
  if (input.inboxItem.type !== 'APPROVAL_REQUEST' || input.inboxItem.status !== 'OPEN') {
    throw new OperationalRequestError('INBOX_NOT_OPEN', 'The linked approval item is no longer open.');
  }
  const linkedRequestIds = input.inboxItem.relatedEntityIds ?? [];
  if (input.request.adminInboxItemId && input.inboxItem.id !== input.request.adminInboxItemId) {
    throw new OperationalRequestError('INBOX_MISMATCH', 'The linked approval item does not match this request.');
  }
  if (!linkedRequestIds.includes(input.request.id)) {
    throw new OperationalRequestError('INBOX_MISMATCH', 'The linked approval item is missing request lineage.');
  }

  const note = input.note?.trim() || null;
  const inboxItem = decideApproval(input.inboxItem, input.decision, {
    decidedBy: input.decidedBy,
    nowIso: input.nowIso,
    note: note ?? undefined,
  });

  if (input.decision === 'REJECTED') {
    return {
      request: {
        ...input.request,
        status: 'REJECTED',
        decidedBy: input.decidedBy,
        decidedAt: input.nowIso,
        decisionNote: note,
        updatedAt: input.nowIso,
        updatedBy: input.decidedBy,
      },
      inboxItem,
      eventUpdate: null,
    };
  }

  if (input.request.kind === 'ROOM_CHANGE') {
    if (
      input.currentEventRoomId !== undefined &&
      input.currentEventRoomId !== input.request.currentRoomId
    ) {
      throw new OperationalRequestError('STALE_LINKS', 'The linked event or room changed before this request could be approved.');
    }
    const roomChange = applyApprovedRoomChange(input.request, {
      now: input.nowIso,
      decidedBy: input.decidedBy,
      eventIds: input.eventIds,
      roomIds: input.roomIds,
    });
    if (!roomChange) {
      throw new OperationalRequestError('STALE_LINKS', 'The linked event or room changed before this request could be approved.');
    }
    return {
      request: {
        ...roomChange.request,
        decisionNote: note,
        updatedBy: input.decidedBy,
      },
      inboxItem,
      eventUpdate: { eventId: roomChange.eventId, roomId: roomChange.newRoomId },
    };
  }

  return {
    request: {
      ...input.request,
      status: 'APPROVED',
      decidedBy: input.decidedBy,
      decidedAt: input.nowIso,
      decisionNote: note,
      updatedAt: input.nowIso,
      updatedBy: input.decidedBy,
    },
    inboxItem,
    eventUpdate: null,
  };
}

export function roomNameById(rooms: Room[], roomId: string | null | undefined): string | null {
  if (!roomId) return null;
  return rooms.find(room => room.id === roomId)?.name ?? roomId;
}
