import { test, expect } from '@playwright/test';
import { loadApp, gotoView, TEST_ORG } from './helpers/navigate';

test.describe('Navigation — routing, sidebar, dark mode, mobile', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  // #11 — All nav items are visible and present
  test('#11 all nav items are visible', async ({ page }) => {
    const nav = page.getByRole('navigation');
    const labels = [
      'Smart Calendar',
      'Finance',
      'Students',
      'Blueprint',
      'Manage',
      'Inbox',
      'Settings',
    ];
    for (const label of labels) {
      await expect(nav.getByRole('button', { name: label })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Super Admin' })).toBeVisible();
  });

  // #12 — Clicking nav items switches views without crashing
  test('#12 clicking nav items switches views', async ({ page }) => {
    const views = [
      'STUDENTS',
      'BILLING',
      'MANAGE',
      'ADMIN_INBOX',
      'SETTINGS',
      'SUPER_ADMIN',
      'CALENDAR',
    ] as const;

    for (const view of views) {
      await gotoView(page, view);
      // Nav must still be present (no crash/unmount)
      await expect(page.locator('nav').first()).toBeVisible();
      await expect(page.getByText('Not found')).not.toBeVisible();
    }
  });

  test('#12c Finance opens the routed ledger surface', async ({ page }) => {
    await gotoView(page, 'BILLING');
    await expect(page.getByTestId('finance-workspace')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible();
    await expect(page.getByText('Family-led ledger')).toBeVisible();
    await expect(page.getByText('No ledger rows yet')).toBeVisible();
    await expect(page.getByText('Not found')).not.toBeVisible();
  });

  test('#12b Students opens the Student/Family route shell', async ({ page }) => {
    await gotoView(page, 'STUDENTS');
    await expect(page.getByTestId('student-family-workspace')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Student/Family Files' })).toBeVisible();
    await expect(page.getByPlaceholder('Search by student, family, guardian, phone, or email...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New student' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New family' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Families' })).toBeVisible();
    await expect(page.getByText('No students yet')).toBeVisible();
    await page.getByRole('button', { name: 'New student' }).click();
    await expect(page.getByRole('dialog', { name: 'New student file' })).toBeVisible();
    await page.getByLabel('Student name').fill('Dana Cohen');
    await page.getByLabel('Family name').fill('Cohen Family');
    await page.getByPlaceholder('Guardian name').fill('Ron Cohen');
    await page.getByPlaceholder('Phone', { exact: true }).fill('050-1111111');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog', { name: 'New student file' })).not.toBeVisible();
    await expect(page.getByText('Dana Cohen').first()).toBeVisible();
    await page.getByText('Dana Cohen').first().click();
    await expect(page.getByTestId('student-family-detail-panel')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Guardians' }).click();
    await expect(page.getByTestId('student-family-detail-panel').getByText('Ron Cohen')).toBeVisible();
    await page.getByRole('tab', { name: 'Enrollments' }).click();
    await expect(page.getByText('No enrollments linked')).toBeVisible();
    await page.getByRole('tab', { name: 'Finance' }).click();
    await expect(page.getByText('Family ledger summary')).toBeVisible();
    await page.getByRole('tab', { name: 'Documents' }).click();
    await expect(page.getByText('No documents')).toBeVisible();
    await page.getByRole('button', { name: 'Families' }).click();
    await expect(page.getByPlaceholder('Search by family, guardian, student, phone, or email...')).toBeVisible();
    await expect(page.getByText('Cohen Family').first()).toBeVisible();
  });

  // #13 — Sidebar collapses and expands (desktop)
  test('#13 sidebar collapses and expands', async ({ page }) => {
    // Initial state: expanded → collapse button visible
    const collapseBtn = page.getByRole('button', { name: 'Collapse Sidebar' });
    await expect(collapseBtn).toBeVisible();

    await collapseBtn.click();

    // Collapsed state: expand button now visible
    const expandBtn = page.getByRole('button', { name: 'Expand Sidebar' });
    await expect(expandBtn).toBeVisible();

    // Nav item labels should be hidden (aria-hidden or width ~0)
    await expect(page.getByRole('navigation').getByText('Smart Calendar')).not.toBeVisible();

    await expandBtn.click();

    // Back to expanded
    await expect(collapseBtn).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Smart Calendar' })).toBeVisible();
  });

  // #14 — Dark mode toggle switches theme class
  test('#14 dark mode toggle switches theme', async ({ page }) => {
    // Default is light mode — button text is "Dark Mode"
    const darkToggle = page.getByRole('button', { name: 'Dark Mode' });
    await expect(darkToggle).toBeVisible();

    await darkToggle.click();

    // Dark mode active: html gains dark class, button text becomes "Light Mode"
    await expect(page.locator('html')).toHaveClass(/dark/);
    const lightToggle = page.getByRole('button', { name: 'Light Mode' });
    await expect(lightToggle).toBeVisible();

    // Toggle back to light
    await lightToggle.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect(darkToggle).toBeVisible();
  });

  // #15 — Mobile menu opens sidebar overlay and can be closed
  test('#15 mobile menu opens and closes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${TEST_ORG}/finance`);
    await expect(page.getByTestId('finance-workspace')).toBeVisible();

    // On mobile the sidebar is hidden; the routed workspace header button opens it.
    const openBtn = page.getByRole('button', { name: 'Open sidebar' }).first();
    const sidebar = page.locator('.fixed.inset-0').first();

    // The sidebar overlay should not be visible initially
    await expect(sidebar).not.toBeVisible();

    await openBtn.click();

    // Sidebar overlay should appear
    await expect(sidebar).toBeVisible({ timeout: 3_000 });

    // Tap outside to close
    await page.mouse.click(320, 10);
    await expect(sidebar).not.toBeVisible({ timeout: 3_000 });
  });

});
