/**
 * Calendar CRUD & Event Form — Firebase tier
 *
 * QA checklist items: #1 (create event form), #2 (edit pre-populated),
 *                     #3 (delete removes from calendar), #4 (view switch),
 *                     #8 (cancellation pay status options)
 *
 * Requires: Firebase emulator running, global-setup seeds ev-editable,
 * ev-deletable, and act-test activity.
 */

import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from '../helpers/navigate';

test.describe('Calendar CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoView(page, 'CALENDAR');
  });

  test('#1 create event form opens with required fields', async ({ page }) => {
    // Open speed dial
    await page.locator('.fixed.bottom-8 button:last-child').click();
    await page.waitForTimeout(300);

    // Click New Event (third speed dial button — admin-only CalendarIcon)
    await page.locator('button[class*="rounded-full"]').nth(2).click();
    await page.waitForTimeout(300);

    // Modal heading
    await expect(page.getByRole('heading', { name: 'New Event' })).toBeVisible();

    // Required form fields always rendered
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await expect(page.locator('input[type="time"]').first()).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('#2 edit event — form pre-populated with seeded times', async ({ page }) => {
    // Click seeded editable event (today 12:00–13:00)
    await page.locator('[data-event-id="ev-editable"]').click();
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: 'Edit' }).click();

    // Edit Event modal visible
    await expect(page.getByRole('heading', { name: 'Edit Event' })).toBeVisible();

    // Time inputs pre-populated from seeded event
    const timeInputs = page.locator('input[type="time"]');
    await expect(timeInputs.first()).toHaveValue('12:00');
    await expect(timeInputs.nth(1)).toHaveValue('13:00');
  });

  test('#3 delete event — removed from calendar', async ({ page }) => {
    // Register dialog handler BEFORE triggering it
    page.once('dialog', d => d.accept());

    // Click seeded deletable event (today 14:00–15:00)
    await page.locator('[data-event-id="ev-deletable"]').click();
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: 'Delete' }).click();

    // Event element should be gone from the DOM
    await expect(page.locator('[data-event-id="ev-deletable"]')).not.toBeAttached();
  });

  test('#4a view switch — DAY view activates', async ({ page }) => {
    await page.getByRole('button', { name: 'DAY' }).click();
    await expect(page.getByRole('button', { name: 'DAY' })).toHaveClass(/bg-white/);
  });

  test('#4b view switch — MONTH view activates', async ({ page }) => {
    await page.getByRole('button', { name: 'MONTH' }).click();
    await expect(page.getByRole('button', { name: 'MONTH' })).toHaveClass(/bg-white/);
  });

  test('#4c view switch — WEEK view activates', async ({ page }) => {
    await page.getByRole('button', { name: 'WEEK' }).click();
    await expect(page.getByRole('button', { name: 'WEEK' })).toHaveClass(/bg-white/);
  });
});

test.describe('Event Form — cancellation', () => {
  test('#8 cancellation pay status options visible after marking canceled', async ({ page }) => {
    await loadApp(page);
    await gotoView(page, 'CALENDAR');

    // Open edit modal for seeded editable event
    await page.locator('[data-event-id="ev-editable"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Edit' }).click();

    // Edit Event modal must be open
    await expect(page.getByRole('heading', { name: 'Edit Event' })).toBeVisible();

    // Check the Mark as Canceled checkbox
    await page.getByLabel('Mark as Canceled').check();

    // Cancellation Pay Status section now visible
    await expect(page.getByText('Cancellation Pay Status')).toBeVisible();

    // Both pay status options present
    await expect(page.locator('select option[value="NO_PAY_CANCELLATION"]')).toBeAttached();
    await expect(page.locator('select option[value="PAID_CANCELLATION"]')).toBeAttached();
  });
});
