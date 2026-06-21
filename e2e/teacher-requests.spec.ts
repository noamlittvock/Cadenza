import { expect, test } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);

test.describe('Teacher room and absence requests', () => {
  test('teacher creates and cancels mobile requests with linked approval items only', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      ({ orgId, runId }) => {
        sessionStorage.setItem('e2e_role_sim', JSON.stringify({
          role: 'VIEWER',
          isFirstAdmin: false,
          setupGateCleared: true,
          onboardingDismissed: true,
          label: 'Viewer (Read-Only)',
        }));
        const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
        [
          'teachers',
          'staffMembers',
          'rooms',
          'events',
          'adminInboxItems',
          'operationalRequests',
          'ganttBlocks',
        ].forEach(collection => localStorage.removeItem(collectionKey(collection)));
        localStorage.removeItem(`cadenza:local:${orgId}:cfg:settings`);
        localStorage.setItem('language', 'en-US');

        const teacherId = `request_teacher_${runId}`;
        const eventId = `request_event_${runId}`;
        const roomA = `request_room_a_${runId}`;
        const roomB = `request_room_b_${runId}`;
        const stamp = { seconds: 0, nanoseconds: 0 };
        const start = new Date();
        start.setHours(10, 0, 0, 0);
        const end = new Date(start);
        end.setHours(11, 0, 0, 0);
        const date = start.toISOString().slice(0, 10);

        localStorage.setItem(collectionKey('teachers'), JSON.stringify([
          {
            id: teacherId,
            fullName: `Request Teacher ${runId}`,
            positions: [],
            positionAssignments: [],
            tags: [],
            phone: '',
            email: 'e2e@cadenza.test',
            color: '#7f1d1d',
            isArchived: false,
          },
        ]));
        localStorage.setItem(collectionKey('staffMembers'), JSON.stringify([
          {
            id: teacherId,
            orgId,
            uid: 'e2e-uid',
            role: 'STAFF',
            fullName: `Request Teacher ${runId}`,
            email: 'e2e@cadenza.test',
            phone: null,
            startDate: null,
            isArchived: false,
            createdAt: stamp,
            updatedAt: stamp,
            isFirstAdmin: false,
            onboardingDismissed: true,
            firstUseFlags: { activityHub: true, staffModule: true, eventCreation: true, enrollment: true },
            documents: [],
          },
        ]));
        localStorage.setItem(collectionKey('rooms'), JSON.stringify([
          { id: roomA, name: 'Studio A', itinerary: '' },
          { id: roomB, name: 'Studio B', itinerary: '' },
        ]));
        localStorage.setItem(collectionKey('events'), JSON.stringify([
          {
            id: eventId,
            orgId,
            name: `Request Lesson ${runId}`,
            description: 'Teacher request smoke',
            teacherId,
            staffMemberIds: [teacherId],
            roomId: roomA,
            activityId: '',
            l1Id: null,
            l2Id: null,
            location: 'Studio A',
            date,
            startTime: '10:00',
            endTime: '11:00',
            durationMinutes: 60,
            status: 'SCHEDULED',
            start: start.toISOString(),
            end: end.toISOString(),
            isCanceled: false,
            isHidden: false,
            tags: [],
            createdAt: stamp,
            updatedAt: stamp,
          },
        ]));
        localStorage.setItem(collectionKey('adminInboxItems'), JSON.stringify([]));
        localStorage.setItem(collectionKey('operationalRequests'), JSON.stringify([]));
        localStorage.setItem(collectionKey('ganttBlocks'), JSON.stringify([]));
      },
      { orgId: TEST_ORG, runId: RUN_ID },
    );

    await loadApp(page);
    await page.locator(`[data-event-id="request_event_${RUN_ID}"]`).click();

    const panel = page.getByTestId('teacher-requests-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Review task only')).toBeVisible();

    await panel.getByLabel('Requested room').selectOption({ label: 'Studio B' });
    await panel.getByLabel('Reason').fill('Needs grand piano');
    await panel.getByTestId('submit-teacher-request').click();

    await expect(panel.getByTestId('teacher-request-row')).toHaveCount(1);
    await expect(panel.getByText('Pending')).toBeVisible();
    await expect(panel.getByText('Studio A -> Studio B')).toBeVisible();

    let persisted = await page.evaluate(({ orgId }) => ({
      requests: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:operationalRequests`) || '[]'),
      inbox: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:adminInboxItems`) || '[]'),
      events: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:events`) || '[]'),
      ganttBlocks: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:ganttBlocks`) || '[]'),
    }), { orgId: TEST_ORG });
    expect(persisted.requests).toHaveLength(1);
    expect(persisted.requests[0]).toMatchObject({
      kind: 'ROOM_CHANGE',
      status: 'PENDING',
      eventId: `request_event_${RUN_ID}`,
      reason: 'Needs grand piano',
      adminInboxItemId: persisted.inbox[0].id,
    });
    expect(persisted.inbox).toHaveLength(1);
    expect(persisted.inbox[0]).toMatchObject({
      type: 'APPROVAL_REQUEST',
      status: 'OPEN',
      relatedEntityType: 'operationalRequest',
      requestedBy: `request_teacher_${RUN_ID}`,
    });
    expect(persisted.events[0].roomId).toBe(`request_room_a_${RUN_ID}`);
    expect(persisted.ganttBlocks).toHaveLength(0);

    await panel.getByRole('button', { name: 'Cancel request' }).click();
    await expect(panel.getByText('Cancelled')).toBeVisible();

    await panel.getByTestId('request-kind-ABSENCE').click();
    await panel.getByLabel('Reason').fill('Medical appointment');
    await panel.getByTestId('submit-teacher-request').click();
    await expect(panel.getByTestId('teacher-request-row')).toHaveCount(2);
    await expect(panel.getByTestId('teacher-request-row').filter({ hasText: 'Absence' })).toBeVisible();

    persisted = await page.evaluate(({ orgId }) => ({
      requests: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:operationalRequests`) || '[]'),
      inbox: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:adminInboxItems`) || '[]'),
      events: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:events`) || '[]'),
      ganttBlocks: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:ganttBlocks`) || '[]'),
    }), { orgId: TEST_ORG });
    expect(persisted.requests).toHaveLength(2);
    expect(persisted.requests.find((row: any) => row.kind === 'ROOM_CHANGE')).toMatchObject({ status: 'CANCELLED' });
    expect(persisted.requests.find((row: any) => row.kind === 'ABSENCE')).toMatchObject({
      status: 'PENDING',
      eventId: null,
      currentRoomId: null,
      requestedRoomId: null,
      reason: 'Medical appointment',
    });
    expect(persisted.inbox).toHaveLength(2);
    expect(persisted.events[0].roomId).toBe(`request_room_a_${RUN_ID}`);
    expect(persisted.ganttBlocks).toHaveLength(0);
  });

  test('admin approves a teacher room-change request from Admin Inbox and updates the event room', async ({ page }) => {
    await page.addInitScript(
      ({ orgId, runId }) => {
        sessionStorage.setItem('e2e_role_sim', JSON.stringify({
          role: 'ADMIN',
          isFirstAdmin: false,
          setupGateCleared: true,
          onboardingDismissed: true,
          label: 'Admin (E2E)',
        }));
        const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
        [
          'teachers',
          'staffMembers',
          'rooms',
          'events',
          'adminInboxItems',
          'operationalRequests',
          'ganttBlocks',
        ].forEach(collection => localStorage.removeItem(collectionKey(collection)));
        localStorage.removeItem(`cadenza:local:${orgId}:cfg:settings`);
        localStorage.setItem('language', 'en-US');

        const teacherId = `approve_teacher_${runId}`;
        const eventId = `approve_event_${runId}`;
        const requestId = `approve_request_${runId}`;
        const inboxId = `approve_inbox_${runId}`;
        const roomA = `approve_room_a_${runId}`;
        const roomB = `approve_room_b_${runId}`;
        const now = '2026-06-19T09:00:00.000Z';
        const stamp = { seconds: 0, nanoseconds: 0 };

        localStorage.setItem(collectionKey('teachers'), JSON.stringify([{
          id: teacherId,
          fullName: `Approval Teacher ${runId}`,
          positions: [],
          positionAssignments: [],
          tags: [],
          phone: '',
          email: 'approval@cadenza.test',
          color: '#1d4ed8',
          isArchived: false,
        }]));
        localStorage.setItem(collectionKey('staffMembers'), JSON.stringify([{
          id: teacherId,
          orgId,
          uid: 'approval-teacher-uid',
          role: 'STAFF',
          fullName: `Approval Teacher ${runId}`,
          email: 'approval@cadenza.test',
          phone: null,
          startDate: null,
          isArchived: false,
          createdAt: stamp,
          updatedAt: stamp,
          isFirstAdmin: false,
          onboardingDismissed: true,
          firstUseFlags: { activityHub: true, staffModule: true, eventCreation: true, enrollment: true },
          documents: [],
        }]));
        localStorage.setItem(collectionKey('rooms'), JSON.stringify([
          { id: roomA, name: 'Approval Studio A', itinerary: '' },
          { id: roomB, name: 'Approval Studio B', itinerary: '' },
        ]));
        localStorage.setItem(collectionKey('events'), JSON.stringify([{
          id: eventId,
          orgId,
          name: `Approval Lesson ${runId}`,
          description: 'Admin approval smoke',
          teacherId,
          staffMemberIds: [teacherId],
          roomId: roomA,
          activityId: '',
          l1Id: null,
          l2Id: null,
          location: 'Approval Studio A',
          date: '2026-06-20',
          startTime: '10:00',
          endTime: '11:00',
          durationMinutes: 60,
          status: 'SCHEDULED',
          start: '2026-06-20T10:00:00.000Z',
          end: '2026-06-20T11:00:00.000Z',
          isCanceled: false,
          isHidden: false,
          tags: [],
          createdAt: stamp,
          updatedAt: stamp,
        }]));
        localStorage.setItem(collectionKey('operationalRequests'), JSON.stringify([{
          id: requestId,
          orgId,
          kind: 'ROOM_CHANGE',
          status: 'PENDING',
          requestedByStaffId: teacherId,
          requestedFor: '2026-06-20',
          endDate: null,
          eventId,
          currentRoomId: roomA,
          requestedRoomId: roomB,
          reason: 'Needs grand piano',
          decidedBy: null,
          decidedAt: null,
          decisionNote: null,
          adminInboxItemId: inboxId,
          createdAt: now,
          updatedAt: now,
          createdBy: teacherId,
          updatedBy: teacherId,
        }]));
        localStorage.setItem(collectionKey('adminInboxItems'), JSON.stringify([{
          id: inboxId,
          orgId,
          type: 'APPROVAL_REQUEST',
          status: 'OPEN',
          title: `Room change request: Approval Teacher ${runId}`,
          message: '2026-06-20 · Approval Lesson · Approval Studio A -> Approval Studio B · Needs grand piano',
          relatedEntityType: 'operationalRequest',
          relatedEntityIds: [requestId, eventId, roomB],
          requestedBy: teacherId,
          createdAt: now,
        }]));
        localStorage.setItem(collectionKey('ganttBlocks'), JSON.stringify([]));
      },
      { orgId: TEST_ORG, runId: RUN_ID },
    );

    await loadApp(page);
    await gotoView(page, 'ADMIN_INBOX');

    const review = page.getByTestId('operational-request-review');
    await expect(review).toBeVisible();
    await review.getByLabel('Request status').selectOption('ALL');
    const row = review.getByTestId('operational-request-row').filter({ hasText: `Approval Teacher ${RUN_ID}` });
    await expect(row).toContainText('Room change');
    await expect(row).toContainText('Approval Studio A -> Approval Studio B');
    await row.getByLabel('Decision note').fill('Approved for recital setup');
    await row.getByRole('button', { name: 'Approve' }).click();

    await expect(row.getByTestId(`operational-request-status-approve_request_${RUN_ID}`)).toContainText('Approved');
    await expect(row).toContainText('Approved for recital setup');

    const persisted = await page.evaluate(({ orgId }) => ({
      requests: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:operationalRequests`) || '[]'),
      inbox: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:adminInboxItems`) || '[]'),
      events: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:events`) || '[]'),
      ganttBlocks: JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:ganttBlocks`) || '[]'),
    }), { orgId: TEST_ORG });
    expect(persisted.requests[0]).toMatchObject({
      id: `approve_request_${RUN_ID}`,
      status: 'APPROVED',
      decisionNote: 'Approved for recital setup',
    });
    expect(persisted.inbox[0]).toMatchObject({
      id: `approve_inbox_${RUN_ID}`,
      status: 'APPROVED',
      decisionNote: 'Approved for recital setup',
    });
    expect(persisted.events[0]).toMatchObject({
      id: `approve_event_${RUN_ID}`,
      roomId: `approve_room_b_${RUN_ID}`,
      location: 'Approval Studio B',
    });
    expect(persisted.ganttBlocks).toHaveLength(0);
  });
});
