import { Page } from '@playwright/test';

export const TEST_ORG = 'test-org';
export const BASE_URL = `http://localhost:3000/${TEST_ORG}`;

/** Map of ViewState → English nav label as rendered by the app */
const NAV_LABELS: Record<string, string> = {
  CALENDAR: 'Smart Calendar',
  PAYROLL: 'Payroll',
  BILLING: 'Finance',
  STUDENTS: 'Students',
  STAFF_MEMBERS: 'Manage',
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
  const scope = view === 'SUPER_ADMIN' ? page : page.locator('nav').first();
  await scope.getByRole('button', { name: label }).click();
  // Brief settle time for React state update
  await page.waitForTimeout(200);
}

/** Open the Developer Tools tab inside the Super Admin console. */
export async function gotoDevTools(page: Page): Promise<void> {
  await gotoView(page, 'SUPER_ADMIN');
  await page.getByRole('button', { name: 'Developer Tools' }).click();
  await page.waitForTimeout(200);
}

/** Load the app at the test org URL and wait for the main layout to appear. */
export async function loadApp(page: Page): Promise<void> {
  // Use relative URL so Playwright uses the project's baseURL (3000 for ui, 3001 for firebase)
  await page.goto(`/${TEST_ORG}`);
  // Wait for the sidebar to be visible — signals auth + layout are ready
  await page.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 });
}
