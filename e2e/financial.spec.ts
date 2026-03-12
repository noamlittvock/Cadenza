import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from './helpers/navigate';

test.describe('Financial Dashboard — tab switch & hours view', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoView(page, 'FINANCIAL');
    // Wait for the dashboard to settle
    await page.waitForTimeout(300);
  });

  // #22 — Dashboard / Analysis tab switch
  test('#22 Summary and Hours Comparison tabs are present', async ({ page }) => {
    const summaryTab = page.getByRole('button', { name: 'Summary' });
    const hoursTab = page.getByRole('button', { name: 'Hours Comparison' });

    await expect(summaryTab).toBeVisible();
    await expect(hoursTab).toBeVisible();
  });

  test('#22 clicking Hours Comparison tab switches view', async ({ page }) => {
    // Default is Summary tab
    const summaryTab = page.getByRole('button', { name: 'Summary' });
    await expect(summaryTab).toBeVisible();

    // Click Hours Comparison tab
    await page.getByRole('button', { name: 'Hours Comparison' }).click();

    // Hours Comparison view renders — heading unique to that tab
    await expect(page.getByRole('heading', { name: 'Hours Comparison' })).toBeVisible({ timeout: 5_000 });
  });

  test('#22 clicking back to Summary tab restores the dashboard view', async ({ page }) => {
    // Switch to hours
    await page.getByRole('button', { name: 'Hours Comparison' }).click();
    await expect(page.getByRole('heading', { name: 'Hours Comparison' })).toBeVisible({ timeout: 5_000 });

    // Switch back to Summary
    await page.getByRole('button', { name: 'Summary' }).click();

    // Hours Comparison heading is gone; Summary content is visible instead
    await expect(page.getByRole('heading', { name: 'Hours Comparison' })).not.toBeVisible({ timeout: 3_000 });
  });

  // #24 — Hours Comparison view renders without crashing
  test('#24 Hours Comparison view renders with subtitle text', async ({ page }) => {
    await page.getByRole('button', { name: 'Hours Comparison' }).click();

    // The view has a fixed subtitle regardless of data
    await expect(
      page.getByText('Compare reported hours against scheduled calendar events.')
    ).toBeVisible({ timeout: 5_000 });

    // Empty state message when no reports exist
    await expect(page.getByText('No submitted reports to compare.')).toBeVisible({ timeout: 5_000 });

    // No React error boundary
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});
