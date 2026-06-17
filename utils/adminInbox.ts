// ─── Admin Inbox item factory + decision helpers ─────────────────────────────
// Single place to construct inbox items so producers (room conflicts,
// operational requests, registration intake, staff evaluations) stop hand-rolling
// them. Pure functions — callers persist the returned item via useSupabaseSync.

import type { AdminInboxItem } from '../types';

export interface NewNotificationInput {
  id: string;
  orgId: string;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityIds?: string[];
  nowIso: string;
}

export function makeNotification(input: NewNotificationInput): AdminInboxItem {
  return {
    id: input.id,
    orgId: input.orgId,
    type: 'NOTIFICATION',
    status: 'OPEN',
    title: input.title,
    message: input.message,
    relatedEntityType: input.relatedEntityType,
    relatedEntityIds: input.relatedEntityIds,
    createdAt: input.nowIso,
  };
}

export interface NewApprovalInput extends NewNotificationInput {
  requestedBy?: string;
}

/** Build a pending approval-request item (operational requests, intake, etc.). */
export function makeApprovalRequest(input: NewApprovalInput): AdminInboxItem {
  return {
    id: input.id,
    orgId: input.orgId,
    type: 'APPROVAL_REQUEST',
    status: 'OPEN',
    title: input.title,
    message: input.message,
    relatedEntityType: input.relatedEntityType,
    relatedEntityIds: input.relatedEntityIds,
    requestedBy: input.requestedBy,
    createdAt: input.nowIso,
  };
}

/** Return a copy of the item with an approve/reject decision recorded. */
export function decideApproval(
  item: AdminInboxItem,
  decision: 'APPROVED' | 'REJECTED',
  opts: { decidedBy: string; nowIso: string; note?: string },
): AdminInboxItem {
  return {
    ...item,
    status: decision,
    decidedBy: opts.decidedBy,
    decidedAt: opts.nowIso,
    decisionNote: opts.note,
    markedDoneAt: opts.nowIso,
    markedDoneBy: opts.decidedBy,
  };
}

export const isPendingApproval = (i: AdminInboxItem): boolean =>
  i.type === 'APPROVAL_REQUEST' && i.status === 'OPEN';

export const isDecided = (i: AdminInboxItem): boolean =>
  i.status === 'APPROVED' || i.status === 'REJECTED';
