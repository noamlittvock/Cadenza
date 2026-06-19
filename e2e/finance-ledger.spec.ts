import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);

async function resetFinanceData(
  page: Page,
  options: { language?: 'en-US' | 'he-IL'; familyId: string; familyName: string; guardianName: string },
) {
  await page.addInitScript(
    ({ orgId, language, familyId, familyName, guardianName }) => {
      [
        'students',
        'families',
        'charges',
        'payments',
        'adjustments',
        'balanceSnapshots',
      ].forEach(collection => {
        localStorage.removeItem(`cadenza:local:${orgId}:col:${collection}`);
      });
      localStorage.removeItem(`cadenza:local:${orgId}:cfg:settings`);
      localStorage.setItem('language', language);

      const now = '2026-06-19T09:00:00.000Z';
      localStorage.setItem(`cadenza:local:${orgId}:col:families`, JSON.stringify([{
        id: familyId,
        orgId,
        name: familyName,
        guardians: [{
          id: `${familyId}_guardian`,
          fullName: guardianName,
          relationship: 'PARENT',
          email: `${familyId}@example.test`,
          phone: '050-123-4567',
          isPrimary: true,
        }],
        studentIds: [],
        primaryContactGuardianId: `${familyId}_guardian`,
        billingNotes: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      }]));
    },
    {
      orgId: TEST_ORG,
      language: options.language ?? 'en-US',
      familyId: options.familyId,
      familyName: options.familyName,
      guardianName: options.guardianName,
    },
  );
}

async function selectOptionContaining(selectLocator: ReturnType<Page['getByLabel']>, text: string) {
  const option = selectLocator.locator('option', { hasText: text }).first();
  const value = await option.getAttribute('value');
  expect(value, `Expected an option containing "${text}"`).toBeTruthy();
  await selectLocator.selectOption(value!);
}

test.describe('Finance ledger', () => {
  test('creates a charge, records payment history, adjusts balance, and voids a charge', async ({ page }) => {
    const familyId = `finance_family_${RUN_ID}`;
    const familyName = `Finance ${RUN_ID} Family`;
    await resetFinanceData(page, { familyId, familyName, guardianName: `Rina ${RUN_ID}` });
    await loadApp(page);
    await gotoView(page, 'BILLING');

    await expect(page.getByTestId('finance-workspace')).toBeVisible();
    await page.getByTestId(`finance-family-row-${familyId}`).click();
    await expect(page.getByRole('heading', { name: familyName })).toBeVisible();

    await page.getByLabel('Description').fill(`June tuition ${RUN_ID}`);
    await page.getByLabel('Amount').fill('450');
    await page.getByLabel('Due date').fill('2026-06-30');
    await page.getByLabel('Period').fill('June 2026');
    await page.getByRole('button', { name: 'Create charge' }).click();

    await expect(page.getByText('Ledger updated.')).toBeVisible();
    await expect(page.getByTestId('finance-charges-table')).toContainText(`June tuition ${RUN_ID}`);
    await expect(page.getByTestId('finance-balance-value')).toContainText('450');

    await page.getByLabel('Amount').fill('200');
    await page.getByLabel('Reference').fill(`bank-${RUN_ID}`);
    await page.getByLabel('Note').fill('Partial payment');
    await page.getByRole('button', { name: 'Record payment' }).click();

    await expect(page.getByTestId('finance-payments-table')).toContainText(`bank-${RUN_ID}`);
    await expect(page.getByTestId('finance-payments-table')).toContainText('TRANSFER');
    await expect(page.getByTestId('finance-charges-table')).toContainText('PARTIAL');
    await expect(page.getByTestId('finance-total-paid-value')).toContainText('200');
    await expect(page.getByTestId('finance-balance-value')).toContainText('250');

    await page.getByTestId('finance-action-adjustment').click();
    await page.getByLabel('Amount').fill('-50');
    await page.getByLabel('Reason').fill('Scholarship credit');
    await selectOptionContaining(page.getByLabel('Target charge'), `June tuition ${RUN_ID}`);
    await page.getByRole('button', { name: 'Post adjustment' }).click();

    await expect(page.getByTestId('finance-adjustments-table')).toContainText('Scholarship credit');
    await expect(page.getByTestId('finance-total-adjusted-value')).toContainText('50');
    await expect(page.getByTestId('finance-balance-value')).toContainText('200');

    await page.getByTestId('finance-action-charge').click();
    await page.getByLabel('Description').fill(`Materials fee ${RUN_ID}`);
    await page.getByLabel('Amount').fill('80');
    await page.getByLabel('Due date').fill('2026-07-15');
    await page.getByRole('button', { name: 'Create charge' }).click();
    await expect(page.getByTestId('finance-balance-value')).toContainText('280');

    await page.getByTestId('finance-action-void').click();
    await selectOptionContaining(page.getByLabel('Charge to void'), `Materials fee ${RUN_ID}`);
    await page.getByRole('button', { name: 'Void charge' }).click();

    await expect(page.getByTestId('finance-charges-table')).toContainText(`Materials fee ${RUN_ID}`);
    await expect(page.getByTestId('finance-charges-table')).toContainText('VOID');
    await expect(page.getByTestId('finance-balance-value')).toContainText('200');
  });

  test('renders Hebrew RTL finance amounts with isolated currency text', async ({ page }) => {
    const familyId = `finance_he_${RUN_ID}`;
    await resetFinanceData(page, {
      language: 'he-IL',
      familyId,
      familyName: `משפחת לוי ${RUN_ID}`,
      guardianName: `רינה ${RUN_ID}`,
    });
    await page.goto(`/${TEST_ORG}/finance`);
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 });

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('finance-workspace')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'כספים' })).toBeVisible();

    await page.getByTestId(`finance-family-row-${familyId}`).click();
    await page.getByLabel('תיאור').fill(`שכר לימוד ${RUN_ID}`);
    await page.getByLabel('סכום').fill('1234.5');
    await page.getByLabel('תאריך לתשלום').fill('2026-06-30');
    await page.getByRole('button', { name: 'יצירת חיוב' }).click();

    const balance = page.getByTestId('finance-balance-value');
    await expect(balance).toContainText(/1,234|1234/);
    await expect(balance).toContainText(/₪|ILS/);
    await expect(balance.locator('bdi')).toHaveCount(1);
    await expect(page.getByTestId('finance-charges-table').locator('bdi').filter({ hasText: /₪|ILS/ }).first()).toBeVisible();
  });
});
