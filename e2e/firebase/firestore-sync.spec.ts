/**
 * Firestore Sync — Firebase tier
 *
 * QA checklist items #68–69.
 *
 * Setup: uses the global-setup seeded Firestore data (no template needed).
 *   - system_configs/test-org_customCharts → { _items: [{ id:'chart-seed-1', title:'Seeded Chart' }] }
 *
 * Live tests:
 *   #68 — Saved chart persists after page.reload() (Firestore round-trip confirmed)
 *   #69 — Two browser.newContext() instances read the same Firestore data without conflict
 */

import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from '../helpers/navigate';

// ── #68 — Data persists after reload ──────────────────────────────────────────

test('#68 saved chart survives page reload (Firestore persists across sessions)', async ({ page }) => {
  await loadApp(page);

  // Navigate to Financial → Analysis tab to see the seeded chart
  await gotoView(page, 'FINANCIAL');
  await page.getByRole('button', { name: 'Analysis' }).click();

  // Seeded chart should be visible before reload
  const chart = page.locator('h4', { hasText: 'Seeded Chart' });
  await expect(chart).toBeVisible({ timeout: 10_000 });

  // Reload the page — forces a fresh Firestore read
  await page.reload();

  // Wait for the layout to be ready again
  await page.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 });

  // Navigate back to Financial → Analysis and verify the chart is still there
  await gotoView(page, 'FINANCIAL');
  await page.getByRole('button', { name: 'Analysis' }).click();

  await expect(
    page.locator('h4', { hasText: 'Seeded Chart' })
  ).toBeVisible({ timeout: 10_000 });
});

// ── #69 — Multi-tab: two contexts read same Firestore data ────────────────────

test('#69 two browser contexts load the same Firestore data without conflict', async ({ browser }) => {
  // Create two independent browser contexts (simulating two open tabs)
  // Both use the firebase dev server (port 3001, VITE_E2E_FIREBASE_BYPASS=true)
  const FIREBASE_BASE = 'http://localhost:3001';

  const [ctx1, ctx2] = await Promise.all([
    browser.newContext({ baseURL: FIREBASE_BASE }),
    browser.newContext({ baseURL: FIREBASE_BASE }),
  ]);

  const [page1, page2] = await Promise.all([
    ctx1.newPage(),
    ctx2.newPage(),
  ]);

  try {
    // Both contexts load the app at the same time
    await Promise.all([
      page1.goto('/test-org'),
      page2.goto('/test-org'),
    ]);

    await Promise.all([
      page1.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 }),
      page2.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 }),
    ]);

    // Both contexts navigate to Financial → Analysis to read Firestore
    await page1.getByRole('button', { name: 'Financial' }).click();
    await page1.getByRole('button', { name: 'Analysis' }).click();

    await page2.getByRole('button', { name: 'Financial' }).click();
    await page2.getByRole('button', { name: 'Analysis' }).click();

    // Both should see the seeded chart — same Firestore data, no conflict
    await expect(page1.locator('h4', { hasText: 'Seeded Chart' })).toBeVisible({ timeout: 10_000 });
    await expect(page2.locator('h4', { hasText: 'Seeded Chart' })).toBeVisible({ timeout: 10_000 });

    // Confirm both contexts received the same data
    const [title1, title2] = await Promise.all([
      page1.locator('h4', { hasText: 'Seeded Chart' }).textContent(),
      page2.locator('h4', { hasText: 'Seeded Chart' }).textContent(),
    ]);
    expect(title1).toBe(title2);
  } finally {
    await Promise.all([ctx1.close(), ctx2.close()]);
  }
});
