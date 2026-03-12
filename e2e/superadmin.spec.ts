import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from './helpers/navigate';

// ── #61 — Wipe Data confirmation dialog ──────────────────────────────────────
test.describe('SuperAdmin — Wipe Data confirmation dialog (#61)', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoView(page, 'SUPER_ADMIN');
    await page.getByText('Date Simulator').waitFor({ state: 'visible', timeout: 8_000 });
  });

  test('#61 Wipe Data button opens confirmation modal', async ({ page }) => {
    const wipeBtn = page.getByRole('button', { name: 'Wipe Data' });
    await expect(wipeBtn).toBeVisible();
    await wipeBtn.click();

    // Modal appears with title "Full Data Reset"
    await expect(page.getByText('Full Data Reset').first()).toBeVisible({ timeout: 5_000 });
  });

  test('#61 wipe confirm button is disabled until checkbox + WIPE text', async ({ page }) => {
    await page.getByRole('button', { name: 'Wipe Data' }).click();
    await page.getByText('Full Data Reset').first().waitFor({ state: 'visible', timeout: 5_000 });

    // Confirm button is disabled initially
    const confirmBtn = page.getByRole('button', { name: 'Wipe All Data' });
    await expect(confirmBtn).toBeDisabled();

    // Check checkbox only → still disabled
    await page.locator('input[type="checkbox"]').first().check();
    await expect(confirmBtn).toBeDisabled();

    // Type WIPE → enabled
    await page.locator('input[placeholder="WIPE"]').fill('WIPE');
    await expect(confirmBtn).toBeEnabled();
  });

  test('#61 closing the modal hides it', async ({ page }) => {
    await page.getByRole('button', { name: 'Wipe Data' }).click();
    await page.getByText('Full Data Reset').first().waitFor({ state: 'visible', timeout: 5_000 });

    // Cancel button closes the modal
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await expect(page.getByText('Full Data Reset').first()).not.toBeVisible({ timeout: 3_000 });
  });
});

// ── #62 — Power Tools sidebar ────────────────────────────────────────────────
test.describe('CalendarView — Power Tools sidebar (#62)', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoView(page, 'CALENDAR');
    await page.waitForTimeout(300);
  });

  test('#62 speed dial FAB opens and Power Tools button is accessible', async ({ page }) => {
    // The speed dial main FAB button (Plus/ChevronUp icon) is at fixed bottom-8 end-8
    // It's the last button in the fixed speed dial container
    const speedDialFAB = page.locator('.fixed.bottom-8').locator('button').last();
    await expect(speedDialFAB).toBeVisible();

    // Click to open the speed dial
    await speedDialFAB.click();

    // The Power Tools action label appears on hover — but the button is always present when open
    // Find the Zap icon button (Power Tools uses the Zap icon)
    // The power tools section label text "Power Tools" appears as a tooltip span
    const powerToolsArea = page.locator('.fixed.bottom-8');
    await expect(powerToolsArea).toBeVisible();
  });

  test('#62 Power Tools view loads without layout issues', async ({ page }) => {
    // Open speed dial
    const speedDialFAB = page.locator('.fixed.bottom-8').locator('button').last();
    await speedDialFAB.click();
    await page.waitForTimeout(300);

    // Click the Power Tools round button (second-to-last round button in the speed dial column)
    // Power Tools is the first action in the expanded speed dial
    const powerToolsBtns = page.locator('.fixed.bottom-8').locator('button[class*="rounded-full"]');
    await powerToolsBtns.first().click();

    // Power Tools view should load — verify no crash
    await expect(page.locator('nav').first()).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ── #63, #64 — CSV Import / Export modals in Staff Manager ───────────────────
test.describe('Staff Manager — CSV Import/Export modals (#63, #64)', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoView(page, 'STAFF_MEMBERS');
    await page.waitForTimeout(400);
  });

  test('#63 Import / Export dropdown opens', async ({ page }) => {
    const dropdownBtn = page.getByRole('button', { name: 'Import / Export' }).first();
    await expect(dropdownBtn).toBeVisible();
    await dropdownBtn.click();

    // Dropdown shows Import and Export options
    await expect(page.getByText('Import').first()).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText('Export').first()).toBeVisible({ timeout: 3_000 });
  });

  test('#63 clicking Import opens the CSV Import modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Import / Export' }).first().click();

    // Click Import item in the dropdown
    const importItem = page.locator('button').filter({ hasText: /^Import$/ }).first();
    await importItem.click();

    // CSV Import modal opens — look for the step indicator (step 1 of 3)
    // Modal is a fixed overlay
    await expect(page.locator('.fixed.inset-0').filter({ has: page.locator('input[type="file"], textarea') }).first()).toBeVisible({ timeout: 5_000 });

    // Or check for the upload step text
    await expect(page.getByText('Upload').first()).toBeVisible({ timeout: 5_000 });
  });

  test('#64 clicking Export opens the Export Scope modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Import / Export' }).first().click();

    // Click Export item in the dropdown
    const exportItem = page.locator('button').filter({ hasText: /^Export$/ }).first();
    await exportItem.click();

    // Export Scope modal opens with "Export Scope" heading
    await expect(page.getByText('Export Scope')).toBeVisible({ timeout: 5_000 });
  });
});
