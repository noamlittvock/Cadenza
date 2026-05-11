import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from '../helpers/navigate';

/**
 * Gantt View — Firebase tier (items #9, #10, #6)
 *
 * Requires: Firebase emulator running + global-setup seeded data.
 * Seeded in global-setup.ts:
 *   - gb-spring:   Spring Semester (2026-01-01 → 2026-05-31)
 *   - gb-blackout: Test Blackout (today → today+7, isBlackout=true)
 *   - ev-hidden:   Hidden Lesson (today 10:00, isHidden=true, canceledByBlackoutId='gb-blackout')
 *   - ev-visible:  Visible Lesson (tomorrow 10:00)
 */

/** Open the speed dial and click the Gantt View button (2nd round button). */
async function gotoGanttView(page: import('@playwright/test').Page): Promise<void> {
  const speedDialFAB = page.locator('.fixed.bottom-8').locator('button').last();
  await speedDialFAB.click();
  await page.waitForTimeout(300);
  const roundBtns = page.locator('.fixed.bottom-8').locator('button[class*="rounded-full"]');
  await roundBtns.nth(1).click();
  await page.waitForTimeout(300);
}

// ── #9 — Gantt blocks display correct time ranges ─────────────────────────────
test.describe('Gantt — block time ranges (#9)', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoGanttView(page);
  });

  test('#9 Spring Semester block is visible in GanttManager', async ({ page }) => {
    await expect(page.getByText('Spring Semester')).toBeVisible({ timeout: 8_000 });
  });

  test('#9 Spring Semester shows correct date range', async ({ page }) => {
    // formatDate('2026-01-01', 'DD/MM/YYYY') = '01/01/2026'
    // formatDate('2026-05-31', 'DD/MM/YYYY') = '31/05/2026'
    await expect(page.getByText('Spring Semester')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('01/01/2026')).toBeVisible();
    await expect(page.getByText('31/05/2026')).toBeVisible();
  });
});

// ── #10 — Blackout blocks visible when Hide Blackouts toggle is off ───────────
test.describe('Gantt — blackout block visibility (#10)', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoGanttView(page);
    await page.getByText('Test Blackout').waitFor({ state: 'visible', timeout: 8_000 });
  });

  test('#10 blackout block shows with Blackout badge in GanttManager', async ({ page }) => {
    await expect(page.getByText('Test Blackout')).toBeVisible();
    // Blackout badge text
    await expect(page.getByText('Blackout').first()).toBeVisible();
  });

  test('#10 blackout block remains visible after enabling Hide Blackouts toggle', async ({ page }) => {
    // Click the Hide Blackouts toggle (in CalendarView, always rendered alongside GanttManager)
    await page.getByRole('switch', { name: 'Toggle blackout events visibility' }).click();
    await page.waitForTimeout(200);
    // GanttManager block is unaffected by the calendar filter
    await expect(page.getByText('Test Blackout')).toBeVisible();
    await expect(page.getByText('Blackout').first()).toBeVisible();
  });
});

// ── #6 — isHidden events absent from calendar; Gantt bar stays visible ────────
test.describe('Calendar — isHidden events (#6)', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    // Start in Calendar view (default)
    await page.waitForTimeout(500);
  });

  test('#6 hidden event is in DOM by default (showBlackouts=true)', async ({ page }) => {
    // Default: showBlackouts=true → isHidden events are NOT filtered
    await expect(page.locator('[data-event-id="ev-hidden"]')).toBeVisible({ timeout: 8_000 });
  });

  test('#6 hidden event removed from calendar when Hide Blackouts is toggled on', async ({ page }) => {
    // Confirm event exists first
    await expect(page.locator('[data-event-id="ev-hidden"]')).toBeVisible({ timeout: 8_000 });

    // Enable Hide Blackouts toggle (showBlackouts=true → false)
    await page.getByRole('switch', { name: 'Toggle blackout events visibility' }).click();
    await page.waitForTimeout(300);

    // isHidden=true event should be gone from DOM
    await expect(page.locator('[data-event-id="ev-hidden"]')).not.toBeAttached();
  });

  test('#6 Gantt blackout bar is still visible after Hide Blackouts toggle', async ({ page }) => {
    // Enable Hide Blackouts
    await page.getByRole('switch', { name: 'Toggle blackout events visibility' }).click();
    await page.waitForTimeout(200);

    // Open Gantt view — blackout block should be visible in GanttManager
    await gotoGanttView(page);
    await expect(page.getByText('Test Blackout')).toBeVisible({ timeout: 8_000 });
  });
});
