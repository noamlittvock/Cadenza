import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const STAFF_ID = 'staff-payroll-e2e';

async function seedPayrollTeacher(page: Page, language: 'en-US' | 'he-IL' = 'en-US') {
  await page.addInitScript(
    ({ orgId, lang, staffId }) => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const eventStart = new Date(yyyy, now.getMonth(), 10, 15, 0, 0).toISOString();
      const eventEnd = new Date(yyyy, now.getMonth(), 10, 16, 30, 0).toISOString();
      localStorage.setItem('language', lang);
      localStorage.setItem(`cadenza:local:${orgId}:col:staffMembers`, JSON.stringify([
        {
          id: staffId,
          orgId,
          uid: 'e2e-uid',
          role: 'STAFF',
          fullName: 'Payroll Teacher',
          email: 'e2e@cadenza.test',
          phone: null,
          startDate: null,
          isArchived: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          isFirstAdmin: false,
          onboardingDismissed: true,
          firstUseFlags: { activityHub: true, staffModule: true, eventCreation: true, enrollment: true },
          documents: [],
        },
      ]));
      localStorage.setItem(`cadenza:local:${orgId}:col:teachers`, JSON.stringify([
        {
          id: staffId,
          fullName: 'Payroll Teacher',
          positions: ['Teacher'],
          positionAssignments: [],
          tags: [],
          phone: '',
          email: 'e2e@cadenza.test',
          color: '#7b2d36',
        },
      ]));
      localStorage.setItem(`cadenza:local:${orgId}:col:events`, JSON.stringify([
        {
          id: 'payroll-event-e2e',
          name: 'Payroll lesson',
          description: '',
          teacherId: staffId,
          staffMemberIds: [staffId],
          roomId: '',
          start: eventStart,
          end: eventEnd,
          isCanceled: false,
          isHidden: false,
        },
      ]));
      localStorage.setItem(`cadenza:local:${orgId}:col:hoursEntries`, JSON.stringify([]));
      localStorage.setItem(`cadenza:local:${orgId}:col:hoursReports`, JSON.stringify([]));
      localStorage.setItem(`cadenza:local:${orgId}:settings:settings`, JSON.stringify({
        language: lang,
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h',
        timeZone: 'Asia/Jerusalem',
        defaultEventDuration: 60,
        weekNumberDisplay: 'none',
        developerMode: false,
      }));
      sessionStorage.setItem(`payroll-seeded-${mm}`, 'true');
    },
    { orgId: TEST_ORG, lang: language, staffId: STAFF_ID },
  );
}

test.describe('Payroll teacher self-report', () => {
  test('teacher creates normalized draft rows and submits a period header', async ({ page }) => {
    await seedPayrollTeacher(page);
    await loadApp(page);
    await gotoView(page, 'PAYROLL');

    await expect(page.getByRole('heading', { name: 'Payroll Hours' })).toBeVisible();
    await page.getByLabel('Reported minutes').fill('45');
    await page.getByLabel('Note').fill('Studio prep');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('0.75 h').first()).toBeVisible();

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Payroll lesson').first()).toBeVisible();
    await page.getByRole('button', { name: 'Submit period' }).click();
    await expect(page.getByText('Submitted').first()).toBeVisible();
    await expect(page.getByText('Locked').first()).toBeVisible();

    const stored = await page.evaluate(({ orgId }) => {
      const read = (collection: string) => JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:${collection}`) || '[]');
      return {
        entries: read('hoursEntries'),
        headers: read('hoursReports'),
      };
    }, { orgId: TEST_ORG });

    expect(stored.entries).toHaveLength(2);
    expect(stored.entries.every((entry: any) => entry.staffMemberId === STAFF_ID)).toBe(true);
    expect(stored.entries.every((entry: any) => entry.status === 'SUBMITTED')).toBe(true);
    expect(stored.entries.every((entry: any) => entry.rate === null)).toBe(true);
    expect(stored.headers).toHaveLength(1);
    expect(stored.headers[0].status).toBe('SUBMITTED');
    expect(stored.headers[0].staffMemberId).toBe(STAFF_ID);
  });

  test('teacher self-report is reachable on Hebrew mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPayrollTeacher(page, 'he-IL');
    await page.goto(`/${TEST_ORG}/payroll`);

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'שעות שכר' })).toBeVisible();
    await expect(page.getByLabel('דקות מדווחות')).toBeVisible();
    await expect(page.getByRole('button', { name: 'שלח תקופה' })).toBeVisible();
  });
});
