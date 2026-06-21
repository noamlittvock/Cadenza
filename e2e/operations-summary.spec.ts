import { expect, test, type Page } from '@playwright/test';
import { loadApp, gotoView, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);

async function seedOperationsSummary(page: Page) {
  await page.addInitScript(
    ({ orgId, runId }) => {
      [
        'events',
        'adminInboxItems',
        'hoursEntries',
        'reportDefinitions',
        'importSessions',
        'registrationIntake',
      ].forEach(collection => {
        localStorage.removeItem(`cadenza:local:${orgId}:col:${collection}`);
      });
      localStorage.setItem('language', 'en-US');

      const now = '2026-06-19T09:00:00.000Z';
      localStorage.setItem(`cadenza:local:${orgId}:col:events`, JSON.stringify([
        {
          id: `ops_conflict_a_${runId}`,
          orgId,
          name: `Ops conflict A ${runId}`,
          start: '2026-06-19T09:00:00.000Z',
          end: '2026-06-19T10:00:00.000Z',
          roomId: 'ops_room_1',
          isHidden: false,
          isCanceled: false,
          audit: { createdAt: now, updatedAt: now },
        },
        {
          id: `ops_conflict_b_${runId}`,
          orgId,
          name: `Ops conflict B ${runId}`,
          start: '2026-06-19T09:30:00.000Z',
          end: '2026-06-19T10:30:00.000Z',
          roomId: 'ops_room_1',
          isHidden: false,
          isCanceled: false,
          audit: { createdAt: now, updatedAt: now },
        },
        {
          id: `ops_today_${runId}`,
          orgId,
          name: `Ops today ${runId}`,
          start: '2026-06-19T12:00:00.000Z',
          end: '2026-06-19T13:00:00.000Z',
          roomId: 'ops_room_2',
          isHidden: false,
          isCanceled: false,
          audit: { createdAt: now, updatedAt: now },
        },
      ]));
      localStorage.setItem(`cadenza:local:${orgId}:col:adminInboxItems`, JSON.stringify([{
        id: `ops_inbox_${runId}`,
        orgId,
        type: 'NOTIFICATION',
        status: 'OPEN',
        title: `Ops inbox ${runId}`,
        message: 'Operations summary fixture',
        createdAt: now,
      }]));
      localStorage.setItem(`cadenza:local:${orgId}:col:hoursEntries`, JSON.stringify([{
        id: `ops_hours_${runId}`,
        orgId,
        staffMemberId: 'staff_ops',
        hoursReportId: null,
        date: '2026-06-19',
        reportedMinutes: 60,
        calendarMinutes: 60,
        eventId: null,
        teachingAssignmentId: null,
        orgRoleId: null,
        rate: null,
        status: 'SUBMITTED',
        note: null,
        createdAt: now,
        updatedAt: now,
      }]));
      localStorage.setItem(`cadenza:local:${orgId}:col:reportDefinitions`, JSON.stringify([{
        id: `ops_report_${runId}`,
        orgId,
        name: `Ops charge report ${runId}`,
        description: 'Operations report health fixture',
        sourceEntity: 'charges',
        filters: [],
        groupBy: null,
        aggregate: { fn: 'none', field: null },
        columns: ['id'],
        isPinned: false,
        createdAt: now,
        updatedAt: now,
      }]));
      localStorage.setItem(`cadenza:local:${orgId}:col:importSessions`, JSON.stringify([{
        id: `ops_import_${runId}`,
        orgId,
        createdBy: 'admin',
        entityType: 'STUDENT',
        status: 'COMPLETED_WITH_ERRORS',
        fileName: 'students.csv',
        totalRows: 3,
        importedRows: 1,
        skippedRows: 1,
        rowResults: [],
        createdAt: { seconds: 1718780400, nanoseconds: 0 },
        updatedAt: { seconds: 1718780500, nanoseconds: 0 },
      }]));
    },
    { orgId: TEST_ORG, runId: RUN_ID },
  );
}

async function simulateRole(page: Page, role: 'finance' | 'member') {
  await page.addInitScript(({ role }) => {
    sessionStorage.setItem('e2e_role_sim', JSON.stringify({
      role: 'VIEWER',
      isFirstAdmin: false,
      setupGateCleared: true,
      onboardingDismissed: true,
      label: role === 'finance' ? 'Finance (E2E)' : 'Viewer (E2E)',
    }));
    if (role === 'finance') {
      sessionStorage.setItem('e2e_finance_capability', 'true');
    } else {
      sessionStorage.removeItem('e2e_finance_capability');
    }
  }, { role });
}

test.describe('Operations summary shell', () => {
  test('Admin Inbox renders source-authorized operations cards and blocked states', async ({ page }) => {
    await seedOperationsSummary(page);
    await loadApp(page);
    await gotoView(page, 'ADMIN_INBOX');

    await expect(page.getByTestId('operations-summary')).toBeVisible();
    await expect(page.getByTestId('operations-card-openConflicts')).toContainText('Open room conflicts');
    await expect(page.getByTestId('operations-card-todayEvents')).toContainText('Today\'s events');
    await expect(page.getByTestId('operations-card-openInboxItems')).toContainText('Open inbox items');
    await expect(page.getByTestId('operations-card-pendingHoursReports')).toContainText('Pending hours');
    await expect(page.getByTestId('operations-card-importHealth')).toContainText('Import health');
    await expect(page.getByTestId('operations-card-reportHealth')).toContainText('Report health');
    await expect(page.getByTestId('operations-card-consentRevocation')).toContainText('Consent revocation');
    await expect(page.getByText('D-24')).toBeVisible();

    await page.getByTestId('operations-open-reportHealth').click();
    await expect(page.getByTestId('reports-workspace')).toBeVisible();

    await gotoView(page, 'ADMIN_INBOX');
    await page.getByTestId('operations-open-pendingHoursReports').click();
    await expect(page.getByRole('button', { name: 'My hours' })).toBeVisible();

    await gotoView(page, 'ADMIN_INBOX');
    await page.getByTestId('operations-open-openInboxItems').click();
    await expect(page.getByTestId(`admin-inbox-item-ops_inbox_${RUN_ID}`)).toHaveAttribute('data-focused', 'true');

    await gotoView(page, 'ADMIN_INBOX');
    await page.getByTestId('operations-open-openConflicts').click();
    await expect(page.getByText(`Ops conflict A ${RUN_ID}`)).toBeVisible();
  });

  test('finance users see only finance-authorized operations cards', async ({ page }) => {
    await seedOperationsSummary(page);
    await simulateRole(page, 'finance');
    await loadApp(page);
    await gotoView(page, 'ADMIN_INBOX');

    await expect(page.getByTestId('operations-summary')).toContainText('Finance scope');
    await expect(page.getByTestId('operations-card-pendingHoursReports')).toBeVisible();
    await expect(page.getByTestId('operations-card-reportHealth')).toBeVisible();
    await expect(page.getByTestId('operations-card-openConflicts')).not.toBeVisible();
    await expect(page.getByTestId('operations-card-openInboxItems')).not.toBeVisible();
    await expect(page.getByText(`Ops inbox ${RUN_ID}`)).not.toBeVisible();
    await page.getByTestId('operations-open-reportHealth').click();
    await expect(page.getByTestId('reports-workspace')).toBeVisible();
  });

  test('plain members get a redacted denial state', async ({ page }) => {
    await seedOperationsSummary(page);
    await simulateRole(page, 'member');
    await loadApp(page);
    await gotoView(page, 'ADMIN_INBOX');

    await expect(page.getByTestId('operations-summary-denied')).toBeVisible();
    await expect(page.getByText('Operations summary is restricted')).toBeVisible();
    await expect(page.getByText(`Ops inbox ${RUN_ID}`)).not.toBeVisible();
    await expect(page.getByText(`Ops conflict A ${RUN_ID}`)).not.toBeVisible();
  });
});
