import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from './helpers/navigate';

/**
 * Admin Inbox — pure UI tier.
 * Tests #28–32 require inbox items to be present. In bypass mode (no Firebase),
 * the inbox starts empty. Tests here verify UI structure and empty states.
 * Data-dependent modal tests (#28–31) are covered in the firebase tier.
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

  test('Tasks tab shows empty state when no tasks exist', async ({ page }) => {
    // Default tab is Tasks; with no data, the empty state renders
    await expect(page.getByText('No open tasks')).toBeVisible({ timeout: 5_000 });
  });

  test('switching to Notifications tab works', async ({ page }) => {
    await page.getByRole('button', { name: 'Notifications' }).click();
    // Notifications tab active — no crash, nav still visible
    await expect(page.locator('nav').first()).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('Show Completed toggle appears on Tasks tab', async ({ page }) => {
    // The show/hide completed toggle is visible even with no tasks
    const toggle = page.getByText(/Show Completed|Hide Completed/);
    await expect(toggle).toBeVisible();
  });

  // #28–31: require data — deferred to e2e/firebase/admin-inbox.spec.ts
  test.skip('#28 teacher detail modal shows avatar / contact / positions / tags', async () => {});
  test.skip('#29 Go to full profile navigates to Staff Manager', async () => {});
  test.skip('#30 STUDENT task view button opens student detail modal', async () => {});
  test.skip('#31 student detail modal shows guardian and notes', async () => {});

  // #32 — Full end-to-end mark done requires seeded data (firebase tier)
  test.skip('#32 mark done / mark resolved (requires seeded data — firebase tier)', async () => {});
});
