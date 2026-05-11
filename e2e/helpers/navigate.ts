import { Page } from '@playwright/test';

export const TEST_ORG = 'test-org';
export const BASE_URL = `http://localhost:3000/${TEST_ORG}`;

/** Map of ViewState → English nav label as rendered by the app */
const NAV_LABELS: Record<string, string> = {
  CALENDAR: 'Smart Calendar',
  STAFF_MEMBERS: 'Staff Members',
  MANAGE: 'Manage',
  ADMIN_INBOX: 'Inbox',
  SETTINGS: 'Settings',
  SUPER_ADMIN: 'Super Admin',
};

/**
 * Navigate to a ViewState by clicking its sidebar nav item.
 * Waits for the nav button to be visible before clicking.
 */
export async function gotoView(page: Page, view: string): Promise<void> {
  const label = NAV_LABELS[view] ?? view;
  await page.getByRole('button', { name: label }).click();
  // Brief settle time for React state update
  await page.waitForTimeout(200);
}

/** Load the app at the test org URL and wait for the main layout to appear. */
export async function loadApp(page: Page): Promise<void> {
  // Use relative URL so Playwright uses the project's baseURL (3000 for ui, 3001 for firebase)
  await page.goto(`/${TEST_ORG}`);
  // Wait for the sidebar to be visible — signals auth + layout are ready
  await page.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 });
}
