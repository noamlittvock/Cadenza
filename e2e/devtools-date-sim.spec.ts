import { test, expect } from '@playwright/test';
import { loadApp, gotoDevTools } from './helpers/navigate';

test.describe('DevTools — Date Simulator', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoDevTools(page);
    // Wait for DevTools to render
    await page.getByText('Date Simulator').waitFor({ state: 'visible', timeout: 8_000 });
  });

  // #48 — Relative jump buttons shift the simulated date (banner appears)
  test('#48 relative jump +1d activates simulation banner', async ({ page }) => {
    // No banner before any jump
    await expect(page.getByText(/^Simulating:/)).not.toBeVisible();

    await page.getByRole('button', { name: '+1d' }).click();

    // The action intentionally jumps to Calendar, where the global banner remains visible.
    const banner = page.getByText('Simulation Active', { exact: true });
    await expect(banner).toBeVisible({ timeout: 5_000 });
  });

  test('#48 relative jump −7d activates simulation banner', async ({ page }) => {
    await page.getByRole('button', { name: '−7d' }).click();
    await expect(page.getByText('Simulation Active', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('#48 relative jump +30d activates simulation banner', async ({ page }) => {
    await page.getByRole('button', { name: '+30d' }).click();
    await expect(page.getByText('Simulation Active', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  // #49 — Scenario jumps activate simulation
  test('#49 Month End scenario jump activates simulation', async ({ page }) => {
    await page.getByRole('button', { name: 'Month End' }).click();
    await expect(page.getByText('Simulation Active', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('#49 Quarter End scenario jump activates simulation', async ({ page }) => {
    await page.getByRole('button', { name: 'Quarter End' }).click();
    await expect(page.getByText('Simulation Active', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('#49 New Year scenario jump activates simulation', async ({ page }) => {
    await page.getByRole('button', { name: 'New Year' }).click();
    await expect(page.getByText('Simulation Active', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('#49 Sep 1 scenario jump activates simulation', async ({ page }) => {
    await page.getByRole('button', { name: 'Sep 1 (Enrollment)' }).click();
    await expect(page.getByText('Simulation Active', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  // #50 — Custom date picker sets simulation
  test('#50 custom date picker activates simulation', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible();

    // Set a known date
    await dateInput.fill('2026-06-15');
    await dateInput.press('Enter');

    // Banner should appear with the simulated date
    await expect(page.getByText('Simulation Active', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  // #51 — Violet banner is present when simulation is active
  test('#51 violet banner has correct styling when active', async ({ page }) => {
    await page.getByRole('button', { name: '+1d' }).click();

    // Banner uses violet styling
    const banner = page.locator('div.bg-violet-600').first();
    await expect(banner).toBeVisible({ timeout: 5_000 });

    await expect(page.getByText('Simulation Active', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exit Simulation' })).toBeVisible();
  });

  // #52 — Reset clears the simulation (banner disappears)
  test('#52 Reset to today clears the simulation', async ({ page }) => {
    // Activate simulation
    await page.getByRole('button', { name: '+7d' }).click();
    await expect(page.getByText('Simulation Active', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Return to Developer Tools to use its explicit date reset control.
    await gotoDevTools(page);
    await page.getByRole('button', { name: 'Reset to today' }).click();

    // Banner should disappear
    await expect(page.getByText('Simulation Active', { exact: true })).not.toBeVisible({ timeout: 3_000 });

    // "Reset to today" button itself should be gone
    await expect(page.getByRole('button', { name: 'Reset to today' })).not.toBeVisible();
  });
});
