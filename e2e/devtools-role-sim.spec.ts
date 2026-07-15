import { test, expect } from '@playwright/test';
import { loadApp, gotoDevTools, gotoView } from './helpers/navigate';

test.describe('DevTools — Role Simulator', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoDevTools(page);
    await page.getByText('User & Role Simulator').waitFor({ state: 'visible', timeout: 8_000 });
  });

  // #53 — All 5 role preset cards render
  test('#53 all 5 role preset cards render', async ({ page }) => {
    const roleLabels = [
      'SuperAdmin',
      'Admin (Active)',
      'Viewer (Read-Only)',
      'First Admin \u2014 Pre-Gate',
      'First Admin \u2014 Post-Gate',
    ];
    for (const label of roleLabels) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  // #54 — Activating a role card shows the simulation banner
  test('#54 activating a role card shows simulation banner', async ({ page }) => {
    // No banner initially
    await expect(page.getByText(/Simulating:/).first()).not.toBeVisible();

    // Click "Admin (Active)" card
    await page.getByRole('button', { name: /^Admin \(Active\)/ }).click();

    // Banner appears with the simulated role label
    await expect(page.locator('div.bg-violet-600').getByText('Admin (Active)', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  // #55 — Re-clicking the active card deactivates the simulation
  test('#55 re-clicking active card deactivates simulation', async ({ page }) => {
    // Activate SuperAdmin preset
    const superAdminPreset = page.getByRole('button', { name: /^SuperAdmin/ });
    await superAdminPreset.click();
    await expect(page.locator('div.bg-violet-600').getByText('SuperAdmin', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Re-click the same card to toggle off
    await superAdminPreset.click();

    // Banner should disappear
    await expect(page.getByText('Simulation Active', { exact: true })).not.toBeVisible({ timeout: 3_000 });
  });

  // #56 — Exit All Simulations clears both date and role simulations
  test('#56 Exit All Simulations clears both simulations', async ({ page }) => {
    // Activate date sim (+1d)
    await page.getByRole('button', { name: '+1d' }).click();
    await expect(page.getByText('Simulation Active', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Activate role sim (Admin)
    await gotoDevTools(page);
    await page.getByRole('button', { name: /^Admin \(Active\)/ }).click();
    await expect(page.locator('div.bg-violet-600').getByText('Admin (Active)', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Exit All Simulations
    const exitBtn = page.getByRole('button', { name: 'Exit All Simulations' });
    await expect(exitBtn).toBeVisible();
    await exitBtn.click();

    // Both banners gone
    await expect(page.getByText(/Simulating:/)).not.toBeVisible({ timeout: 3_000 });

    // Exit button itself should disappear (no active simulation)
    await expect(exitBtn).not.toBeVisible();
  });

  // #57 — Simulating SuperAdmin role keeps Super Admin nav item visible
  test('#57 SuperAdmin role preset keeps Super Admin nav visible', async ({ page }) => {
    await page.getByRole('button', { name: /^SuperAdmin/ }).click();
    await expect(page.locator('div.bg-violet-600').getByText('SuperAdmin', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Super Admin nav item must still be visible
    await expect(page.getByRole('button', { name: 'Super Admin' })).toBeVisible();
  });

  // #58 — Viewer role hides write actions (Add Event button not visible)
  test('#58 Viewer role hides edit/write actions', async ({ page }) => {
    // Activate Viewer role
    await page.getByRole('button', { name: /^Viewer \(Read-Only\)/ }).click();
    await expect(page.locator('div.bg-violet-600').getByText('Viewer (Read-Only)', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Navigate to Calendar — Add Event FAB is admin-only
    await gotoView(page, 'CALENDAR');

    // The Add Event floating button should NOT be visible for Viewer
    // It's rendered only when isAdmin is true (CalendarView.tsx line ~2206)
    // We check that no + / new event button is present in the calendar area
    const addEventArea = page.locator('.fixed.bottom-6, .fixed.bottom-4').first();
    await expect(addEventArea).not.toBeVisible();

    // Verify we're in Calendar view (nav item should be active — nav still present)
    await expect(page.locator('nav').first().getByRole('button', { name: 'Smart Calendar' })).toBeVisible();
  });

  // Bonus: Clear role button removes simulation
  test('Clear role button deactivates role simulation', async ({ page }) => {
    await page.getByRole('button', { name: /^Admin \(Active\)/ }).click();
    await expect(page.locator('div.bg-violet-600').getByText('Admin (Active)', { exact: true })).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: 'Clear role' }).click();

    await expect(page.locator('div.bg-violet-600').getByText('Admin (Active)', { exact: true })).not.toBeVisible({ timeout: 3_000 });
  });
});
