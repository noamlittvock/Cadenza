import { describe, expect, it } from 'vitest';
import { decideApproval, isDecided, isPendingApproval, makeApprovalRequest } from './adminInbox';

describe('admin inbox approval helpers', () => {
  it('builds operational-request approval review items with requester lineage', () => {
    const item = makeApprovalRequest({
      id: 'inbox_1',
      orgId: 'org_1',
      title: 'Room change request',
      message: 'Teacher requested a larger room',
      relatedEntityType: 'operationalRequest',
      relatedEntityIds: ['request_1'],
      requestedBy: 'staff_1',
      nowIso: '2026-06-19T10:00:00.000Z',
    });

    expect(item).toMatchObject({
      id: 'inbox_1',
      orgId: 'org_1',
      type: 'APPROVAL_REQUEST',
      status: 'OPEN',
      relatedEntityType: 'operationalRequest',
      relatedEntityIds: ['request_1'],
      requestedBy: 'staff_1',
    });
    expect(isPendingApproval(item)).toBe(true);
    expect(isDecided(item)).toBe(false);
  });

  it('records decisions on the review item without adding D-21 schedule or payroll side effects', () => {
    const item = makeApprovalRequest({
      id: 'inbox_2',
      orgId: 'org_1',
      title: 'Absence request',
      message: 'Teacher requested a day off',
      relatedEntityType: 'operationalRequest',
      relatedEntityIds: ['absence_request_1'],
      requestedBy: 'staff_1',
      nowIso: '2026-06-19T10:00:00.000Z',
    });

    const decided = decideApproval(item, 'APPROVED', {
      decidedBy: 'admin_1',
      nowIso: '2026-06-19T12:00:00.000Z',
      note: 'Review schedule manually before changing lessons or payroll.',
    });

    expect(decided).toMatchObject({
      status: 'APPROVED',
      decidedBy: 'admin_1',
      decidedAt: '2026-06-19T12:00:00.000Z',
      decisionNote: 'Review schedule manually before changing lessons or payroll.',
      relatedEntityType: 'operationalRequest',
      relatedEntityIds: ['absence_request_1'],
      markedDoneAt: '2026-06-19T12:00:00.000Z',
      markedDoneBy: 'admin_1',
    });
    expect(decided).not.toHaveProperty('eventId');
    expect(decided).not.toHaveProperty('ganttBlockId');
    expect(decided).not.toHaveProperty('hoursEntryId');
    expect(isPendingApproval(decided)).toBe(false);
    expect(isDecided(decided)).toBe(true);
  });
});
