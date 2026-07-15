import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from './helpers/navigate';

/**
 * Admin Inbox — pure UI tier.
 * In local bypass mode the inbox starts empty. Tests here verify UI structure
 * and empty states.
 */
test.describe('Admin Inbox — UI structure', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoView(page, 'ADMIN_INBOX');
    await page.waitForTimeout(200);
  });

  // Basic view structure
  test('inbox view renders Tasks and Notifications tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Tasks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
  });

  test('empty inbox shows request and notification empty states', async ({ page }) => {
    await expect(page.getByText('No operational requests yet')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('No notifications')).toBeVisible({ timeout: 5_000 });
  });

  test('switching to Notifications tab works', async ({ page }) => {
    await page.getByRole('button', { name: 'Notifications' }).click();
    // Notifications tab active — no crash, nav still visible
    await expect(page.locator('nav').first()).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('Show resolved toggle appears for notifications', async ({ page }) => {
    const toggle = page.getByText(/Show resolved|Hide resolved/);
    await expect(toggle).toBeVisible();
  });

  // #28–31: require seeded data.
  test.skip('#28 teacher detail modal shows avatar / contact / positions / tags', async () => {});
  test.skip('#29 Go to full profile navigates to Staff Manager', async () => {});
  test.skip('#30 STUDENT task view button opens student detail modal', async () => {});
  test.skip('#31 student detail modal shows guardian and notes', async () => {});

  // #32 — Full end-to-end mark done requires seeded data.
  test.skip('#32 mark done / mark resolved (requires seeded data)', async () => {});
});
