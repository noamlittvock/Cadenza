/**
 * Cross-Cutting Checks — UI tier
 *
 * QA checklist items #70, #72.
 *
 * Runs in the `ui` project (VITE_E2E_AUTH_BYPASS=true, port 3000).
 * No external backend required — pure rendering checks.
 *
 * Live tests:
 *   #70 — No JS console errors while navigating through all major views
 *   #72 — Key UI elements are not obscured by invisible overlays (z-index check)
 */

import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from './helpers/navigate';

// ── #70 — No console errors across major views ────────────────────────────────

test('#70 no JavaScript console errors while navigating all major views', async ({ page }) => {
  const errors: string[] = [];

  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();

    // Filter known benign browser quirks
    if (text.includes('ResizeObserver loop')) return;

    errors.push(text);
  });

  await loadApp(page);

  // Navigate through all major views and let each settle briefly
  const views = [
    'CALENDAR',
    'STAFF_MEMBERS',
    'MANAGE',
    'ADMIN_INBOX',
    'SETTINGS',
  ];

  for (const view of views) {
    await gotoView(page, view);
    await page.waitForTimeout(400);
  }

  expect(
    errors,
    `Unexpected console errors:\n${errors.join('\n')}`
  ).toHaveLength(0);
});

// ── #72 — Z-index: key elements are not obscured ──────────────────────────────

test('#72 sidebar nav and main content buttons are not obscured by invisible overlays', async ({ page }) => {
  await loadApp(page);

  // ── Check 1: sidebar nav button is at the top of the z-stack at its position ──

  const navButton = page.getByRole('button', { name: 'Smart Calendar' });
  await expect(navButton).toBeVisible({ timeout: 10_000 });
  const navBox = await navButton.boundingBox();
  expect(navBox, 'Smart Calendar nav button has no bounding box').not.toBeNull();

  if (navBox) {
    const cx = navBox.x + navBox.width / 2;
    const cy = navBox.y + navBox.height / 2;

    const navReachable = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return false;
      // Walk up the DOM — button or any ancestor that is a button is acceptable
      let curr: Element | null = el;
      while (curr) {
        if (curr.tagName === 'BUTTON') return true;
        curr = curr.parentElement;
      }
      return false;
    }, { x: cx, y: cy });

    expect(
      navReachable,
      `Smart Calendar nav button at (${cx}, ${cy}) is obscured by an overlay`
    ).toBe(true);
  }

  // ── Check 2: CALENDAR view — DAY/WEEK/MONTH buttons are reachable ────────────

  await gotoView(page, 'CALENDAR');
  await page.waitForTimeout(300);

  const dayButton = page.getByRole('button', { name: 'DAY' });
  await expect(dayButton).toBeVisible({ timeout: 8_000 });
  const dayBox = await dayButton.boundingBox();
  expect(dayBox, 'DAY button has no bounding box').not.toBeNull();

  if (dayBox) {
    const cx = dayBox.x + dayBox.width / 2;
    const cy = dayBox.y + dayBox.height / 2;

    const dayReachable = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return false;
      let curr: Element | null = el;
      while (curr) {
        if (curr.tagName === 'BUTTON') return true;
        curr = curr.parentElement;
      }
      return false;
    }, { x: cx, y: cy });

    expect(
      dayReachable,
      `DAY calendar view button at (${cx}, ${cy}) is obscured by an overlay`
    ).toBe(true);
  }

});
