import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from './helpers/navigate';

test.describe('Settings — language switch', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoView(page, 'SETTINGS');
    await page.waitForTimeout(200);
  });

  // #27 — Language switch en-US → he-IL applies globally
  test('#27 language select shows both options', async ({ page }) => {
    const langSelect = page.locator('select').filter({ has: page.locator('option[value="en-US"]') }).first();
    await expect(langSelect).toBeVisible();

    // Both locale options exist
    await expect(langSelect.locator('option[value="en-US"]')).toHaveCount(1);
    await expect(langSelect.locator('option[value="he-IL"]')).toHaveCount(1);
  });

  test('#27 switching to Hebrew shows the unsaved-changes bar', async ({ page }) => {
    // Change language to Hebrew
    const langSelect = page.locator('select').filter({ has: page.locator('option[value="en-US"]') }).first();
    await langSelect.selectOption('he-IL');

    // The floating save bar should appear (hasChanges = true)
    await expect(page.getByText('ישנם שינויים שלא נשמרו')).toBeVisible({ timeout: 5_000 });
  });

  test('#27 saving Hebrew language applies translated text', async ({ page }) => {
    const langSelect = page.locator('select').filter({ has: page.locator('option[value="en-US"]') }).first();
    await langSelect.selectOption('he-IL');

    // Wait for save bar and click save (btn.save = 'שמור' in Hebrew, but bar is not yet translated)
    // Save bar text appears in current language before save; click Save button
    const saveBtn = page.locator('button').filter({ hasText: /Save|שמור/ }).last();
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await saveBtn.click();

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'הגדרות', exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('#27 cancel discards the language change', async ({ page }) => {
    const langSelect = page.locator('select').filter({ has: page.locator('option[value="en-US"]') }).first();
    await langSelect.selectOption('he-IL');

    // Unsaved bar is visible
    await expect(page.getByText('ישנם שינויים שלא נשמרו')).toBeVisible({ timeout: 5_000 });

    // Click Cancel
    const cancelBtn = page.locator('button').filter({ hasText: /Cancel|ביטול/ }).last();
    await cancelBtn.click();

    // Bar disappears; language reverts to English
    await expect(page.getByText('ישנם שינויים שלא נשמרו')).not.toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  });
});
