import { expect, test, type Page } from '@playwright/test';
import { loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);

async function resetReportsData(page: Page, language: 'en-US' | 'he-IL' = 'en-US') {
  await page.addInitScript(
    ({ orgId, runId, language }) => {
      [
        'reportDefinitions',
        'families',
        'students',
        'charges',
        'payments',
        'hoursEntries',
        'lessonRecords',
      ].forEach(collection => {
        localStorage.removeItem(`cadenza:local:${orgId}:col:${collection}`);
      });
      localStorage.removeItem(`cadenza:local:${orgId}:cfg:settings`);
      localStorage.setItem('language', language);

      const now = '2026-06-19T09:00:00.000Z';
      const familyId = `reports_family_${runId}`;
      const studentId = `reports_student_${runId}`;
      localStorage.setItem(`cadenza:local:${orgId}:col:families`, JSON.stringify([{
        id: familyId,
        orgId,
        name: `Reports ${runId} Family`,
        guardians: [{
          id: `${familyId}_guardian`,
          fullName: `Rina ${runId}`,
          relationship: 'PARENT',
          email: `${familyId}@example.test`,
          phone: '050-123-4567',
          isPrimary: true,
        }],
        studentIds: [studentId],
        primaryContactGuardianId: `${familyId}_guardian`,
        billingNotes: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      }]));
      localStorage.setItem(`cadenza:local:${orgId}:col:students`, JSON.stringify([{
        id: studentId,
        orgId,
        fullName: `Dana Reports ${runId}`,
        primaryInstrument: 'Piano',
        teacherId: null,
        status: 'ACTIVE',
        profileStatus: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      }]));
      localStorage.setItem(`cadenza:local:${orgId}:col:charges`, JSON.stringify([
        {
          id: `charge_open_${runId}`,
          orgId,
          studentId,
          familyId,
          enrollmentId: null,
          description: `June tuition ${runId}`,
          amount: 450,
          currency: 'ILS',
          dueDate: '2026-06-30',
          status: 'OPEN',
          periodLabel: 'June 2026',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `charge_paid_${runId}`,
          orgId,
          studentId,
          familyId,
          enrollmentId: null,
          description: `Paid materials ${runId}`,
          amount: 120,
          currency: 'ILS',
          dueDate: '2026-06-01',
          status: 'PAID',
          periodLabel: 'June 2026',
          createdAt: now,
          updatedAt: now,
        },
      ]));
      localStorage.setItem(`cadenza:local:${orgId}:col:payments`, JSON.stringify([{
        id: `payment_${runId}`,
        orgId,
        studentId,
        familyId,
        amount: 120,
        currency: 'ILS',
        method: 'TRANSFER',
        receivedAt: now,
        reference: `bank-${runId}`,
        appliedChargeIds: [`charge_paid_${runId}`],
        note: null,
        createdAt: now,
        updatedAt: now,
      }]));
      localStorage.setItem(`cadenza:local:${orgId}:col:hoursEntries`, JSON.stringify([{
        id: `hours_${runId}`,
        orgId,
        staffMemberId: 'staff_reports',
        hoursReportId: null,
        date: '2026-06-19',
        reportedMinutes: 90,
        calendarMinutes: 90,
        eventId: null,
        teachingAssignmentId: null,
        orgRoleId: null,
        rate: 120,
        status: 'APPROVED',
        note: null,
        createdAt: now,
        updatedAt: now,
      }]));
      localStorage.setItem(`cadenza:local:${orgId}:col:lessonRecords`, JSON.stringify([{
        id: `lesson_${runId}`,
        orgId,
        eventId: `event_${runId}`,
        studentId,
        staffMemberId: 'staff_reports',
        date: '2026-06-19',
        attendance: 'PRESENT',
        completion: 'COMPLETED',
        makeupOfLessonId: null,
        createdAt: now,
        updatedAt: now,
      }]));
      localStorage.setItem(`cadenza:local:${orgId}:col:reportDefinitions`, JSON.stringify([
        {
          id: `charges_${runId}`,
          orgId,
          name: `Pinned charges ${runId}`,
          description: 'Open balances by status',
          sourceEntity: 'charges',
          filters: [{ field: 'status', op: 'neq', value: 'VOID' }],
          groupBy: 'status',
          aggregate: { fn: 'sum', field: 'amount' },
          columns: ['id', 'status', 'amount'],
          isPinned: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'admin_1',
          updatedBy: 'admin_1',
        },
        {
          id: `hours_${runId}`,
          orgId,
          name: `Payroll hours ${runId}`,
          description: 'Approved staff hours',
          sourceEntity: 'hoursEntries',
          filters: [{ field: 'status', op: 'eq', value: 'APPROVED' }],
          groupBy: 'staffMemberId',
          aggregate: { fn: 'sum', field: 'reportedMinutes' },
          columns: ['id', 'staffMemberId', 'reportedMinutes', 'status'],
          isPinned: false,
          createdAt: now,
          updatedAt: '2026-06-18T09:00:00.000Z',
          createdBy: 'admin_1',
          updatedBy: 'admin_1',
        },
        {
          id: `students_${runId}`,
          orgId,
          name: `Student roster ${runId}`,
          description: 'Admin-only student report',
          sourceEntity: 'students',
          filters: [],
          groupBy: null,
          aggregate: { fn: 'count', field: null },
          columns: ['id', 'fullName', 'familyId'],
          isPinned: false,
          createdAt: now,
          updatedAt: '2026-06-16T09:00:00.000Z',
          createdBy: 'admin_1',
          updatedBy: 'admin_1',
        },
        {
          id: `attendance_${runId}`,
          orgId,
          name: `Attendance ${runId}`,
          description: 'Admin-only attendance report',
          sourceEntity: 'lessonRecords',
          filters: [],
          groupBy: 'attendance',
          aggregate: { fn: 'count', field: null },
          columns: ['id', 'studentId', 'attendance'],
          isPinned: false,
          createdAt: now,
          updatedAt: '2026-06-15T09:00:00.000Z',
          createdBy: 'admin_1',
          updatedBy: 'admin_1',
        },
        {
          id: `blocked_${runId}`,
          orgId,
          name: `Consent revocation ${runId}`,
          description: 'Review-only blocked report pack',
          sourceEntity: 'agreementAcceptances',
          filters: [],
          groupBy: null,
          aggregate: { fn: 'count', field: null },
          columns: ['id'],
          isPinned: false,
          createdAt: now,
          updatedAt: '2026-06-17T09:00:00.000Z',
          createdBy: 'admin_1',
          updatedBy: 'admin_1',
        },
      ]));
    },
    { orgId: TEST_ORG, runId: RUN_ID, language },
  );
}

async function switchToFinanceUser(page: Page) {
  await page.evaluate(() => {
    sessionStorage.setItem('e2e_role_sim', JSON.stringify({
      role: 'VIEWER',
      isFirstAdmin: false,
      setupGateCleared: true,
      onboardingDismissed: true,
      label: 'Finance (E2E)',
    }));
    sessionStorage.setItem('e2e_finance_capability', 'true');
  });
}

async function runAndDownloadActiveReport(page: Page, expectedFilename: RegExp) {
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByText('Results').last()).toBeVisible();
  await expect(page.getByText('Grouped').last()).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(expectedFilename);
}

test.describe('Reports library shell', () => {
  test('routes Analytics from the command palette and filters the report library', async ({ page }) => {
    await resetReportsData(page);
    await loadApp(page);

    await page.keyboard.press('Meta+K');
    await expect(page.getByRole('dialog', { name: 'Open command palette' })).toBeVisible();
    await page.getByLabel('Search commands, staff, students, events…').fill('analytics');
    await page.getByRole('option', { name: 'Analytics' }).click();

    await expect(page.getByTestId('reports-workspace')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByText('Saved report library')).toBeVisible();
    await expect(page.getByTestId(`report-library-row-charges_${RUN_ID}`)).toBeVisible();
    await expect(page.getByText(`Consent revocation ${RUN_ID}`)).toBeVisible();
    await expect(page.getByText('Some definitions need review')).toBeVisible();

    await page.getByPlaceholder('Search definitions, descriptions, sources, or fields').fill('payroll');
    await expect(page.getByTestId(`report-library-row-hours_${RUN_ID}`)).toBeVisible();
    await expect(page.getByTestId(`report-library-row-charges_${RUN_ID}`)).not.toBeVisible();

    await page.getByPlaceholder('Search definitions, descriptions, sources, or fields').fill('');
    await page.locator('select').nth(1).selectOption('blocked');
    await expect(page.getByTestId(`report-library-row-blocked_${RUN_ID}`)).toBeVisible();
    await expect(page.getByTestId(`report-library-row-hours_${RUN_ID}`)).not.toBeVisible();
    await expect(page.getByTestId('report-definition-detail')).toContainText('D-24');
  });

  test('opens the direct Hebrew route with RTL-safe report values', async ({ page }) => {
    await resetReportsData(page, 'he-IL');
    await page.goto(`/${TEST_ORG}/analytics`);
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 });

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('reports-workspace')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'דוחות' })).toBeVisible();
    await expect(page.getByPlaceholder('חיפוש הגדרות, תיאורים, מקורות או שדות')).toBeVisible();
    await expect(page.getByTestId(`report-library-row-charges_${RUN_ID}`).locator('bdi')).toHaveCount(1);
    await expect(page.getByText('חלק מההגדרות דורשות בדיקה')).toBeVisible();
  });

  test('admin creates, runs, exports, and opens a linked finance report', async ({ page }) => {
    await resetReportsData(page);
    await loadApp(page);
    await page.goto(`/${TEST_ORG}/analytics`);
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 });

    const reportName = `Charge status ${RUN_ID}`;
    await page.getByRole('button', { name: 'New report' }).click();
    const builder = page.getByTestId('report-builder');
    await builder.getByLabel('Report name').fill(reportName);
    await builder.getByLabel('Source').selectOption('charges');
    await builder.getByLabel('Report name').fill(reportName);
    await builder.getByRole('textbox', { name: 'Description' }).fill('Pinned charge status report');
    await builder.getByRole('checkbox', { name: 'Pinned' }).check();
    await builder.locator('label').filter({ hasText: 'amount' }).getByRole('checkbox').check();
    await builder.locator('label').filter({ hasText: 'status' }).getByRole('checkbox').check();
    await builder.getByLabel('Group').selectOption('status');
    await builder.getByLabel('Aggregate').selectOption('sum');
    await builder.getByLabel('No field').selectOption('amount');
    await page.getByRole('button', { name: 'Save definition' }).click();

    await expect(page.getByRole('heading', { name: reportName })).toBeVisible();
    await expect(page.getByTestId('report-definition-detail')).toContainText('Pinned charge status report');
    await runAndDownloadActiveReport(page, /charge-status-.*\.csv/);
    await expect(page.getByRole('table')).toContainText(`charge_open_${RUN_ID}`);

    await page.getByRole('button', { name: new RegExp(`Open source\\s+charge_open_${RUN_ID}`) }).click();
    await expect(page.getByTestId('finance-workspace')).toBeVisible();
    await expect(page.getByTestId(`finance-family-row-reports_family_${RUN_ID}`)).toBeVisible();
    await expect(page.getByTestId('finance-family-detail')).toContainText(`Reports ${RUN_ID} Family`);
    await expect(page.getByTestId('finance-charges-table')).toContainText(`June tuition ${RUN_ID}`);
  });

  test('finance can run and export finance reports without creating or seeing denied sources', async ({ page }) => {
    await resetReportsData(page);
    await loadApp(page);
    await switchToFinanceUser(page);
    await page.goto(`/${TEST_ORG}/analytics`);
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 });

    await expect(page.getByTestId('reports-workspace')).toBeVisible();
    await expect(page.getByText('Finance-limited')).toBeVisible();
    await expect(page.getByText('Finance users can run and export authorized finance reports')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New report' })).not.toBeVisible();

    await expect(page.getByTestId(`report-library-row-charges_${RUN_ID}`)).toContainText(`Pinned charges ${RUN_ID}`);
    await expect(page.getByTestId(`report-library-row-hours_${RUN_ID}`)).toContainText(`Payroll hours ${RUN_ID}`);
    await expect(page.getByText(`Student roster ${RUN_ID}`)).not.toBeVisible();
    await expect(page.getByText(`Attendance ${RUN_ID}`)).not.toBeVisible();
    await expect(page.getByText(`Consent revocation ${RUN_ID}`)).not.toBeVisible();

    await page.getByTestId(`report-library-row-charges_${RUN_ID}`).click();
    await runAndDownloadActiveReport(page, /pinned-charges-.*\.csv/);

    const sourceFilter = page.locator('select').first();
    await expect(sourceFilter.locator('option', { hasText: 'Students' })).toHaveCount(0);
    await expect(sourceFilter.locator('option', { hasText: 'Lesson records' })).toHaveCount(0);
  });
});
