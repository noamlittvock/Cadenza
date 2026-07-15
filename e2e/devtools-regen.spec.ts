import { test, expect } from '@playwright/test';
import { loadApp, gotoDevTools } from './helpers/navigate';

/**
 * DevTools — Granular Regen (#59)
 * The `showExplainers` expand state is declared in DevTools.tsx but not yet
 * wired to a disclosure chevron in the current build. Test #59 is deferred
 * until the UI is implemented.
 *
 * This file contains passing smoke tests for the DevTools sections render
 * correctly, plus the todo placeholder for the chevron rotation test.
 */
test.describe('DevTools — Granular Regen / section structure', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoDevTools(page);
    await page.getByText('Date Simulator').waitFor({ state: 'visible', timeout: 8_000 });
  });

  // Smoke: all major DevTools sections render
  test('DevTools renders all expected sections', async ({ page }) => {
    await expect(page.getByText('Test Templates')).toBeVisible();
    await expect(page.getByText('QA Scenarios')).toBeVisible();
    await expect(page.getByText('Date Simulator')).toBeVisible();
    await expect(page.getByText('User & Role Simulator')).toBeVisible();
    await expect(page.getByText('Full Data Reset')).toBeVisible();
  });

  // #59 — Disclosure chevron rotates when section is expanded
  // The showExplainers accordion state is declared in DevTools.tsx (line 56) but
  // is not yet connected to any toggle button in the rendered output.
  test.skip('#59 disclosure chevron rotates when section is expanded', async () => {
    // showExplainers state is declared in DevTools.tsx but not yet wired to any toggle button.
  });
});
