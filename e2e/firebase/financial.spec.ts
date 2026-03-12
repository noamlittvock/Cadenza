/**
 * Financial — Firebase tier
 *
 * QA checklist item: #23 (saved charts persist across page reload)
 *
 * Requires: Firebase emulator running, global-setup seeds
 * system_configs/test-org_customCharts with { _items: [{ title: 'Seeded Chart', ... }] }.
 */

import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from '../helpers/navigate';

test('#23 chart persists across page reload', async ({ page }) => {
  await loadApp(page);
  await gotoView(page, 'FINANCIAL');

  // Switch to Analysis tab
  await page.getByRole('button', { name: 'Analysis' }).click();

  // Seeded chart should be visible (allow time for Firestore read)
  await expect(page.getByText('Seeded Chart')).toBeVisible({ timeout: 8_000 });

  // Reload and re-wait for layout
  await page.reload();
  await page.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 });

  // Navigate back to Financial → Analysis
  await gotoView(page, 'FINANCIAL');
  await page.getByRole('button', { name: 'Analysis' }).click();

  // Chart must still be there after reload
  await expect(page.getByText('Seeded Chart')).toBeVisible({ timeout: 8_000 });
});
