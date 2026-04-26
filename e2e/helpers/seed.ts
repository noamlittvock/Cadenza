import { Page } from '@playwright/test';

/** Known template IDs from utils/testTemplates.ts */
export const TEMPLATE_IDS = {
  CALENDAR_HAPPY_PATH: 'calendar-happy-path',
  ROOM_CONFLICTS: 'room-conflicts',
  STUDENT_MANAGER: 'student-manager',
  STAFF_MANAGER: 'staff-manager',
  ADMIN_INBOX: 'admin-inbox',
  GANTT_VIEW: 'gantt-view',
  FIRST_ADMIN_ONBOARDING: 'first-admin-onboarding',
  FULL_STRESS_TEST: 'full-stress-test',
} as const;

/**
 * Apply a DevTools test template by clicking its card in the SuperAdmin view.
 * Navigates to SUPER_ADMIN, clicks the template card, and waits for navigation.
 * Assumes the user has SuperAdmin access.
 *
 * @param page - Playwright page
 * @param templateId - one of TEMPLATE_IDS values
 * @param waitMs - how long to wait after clicking for async ops to complete (default 3s)
 */
export async function applyTestTemplate(
  page: Page,
  templateId: string,
  waitMs = 3_000
): Promise<void> {
  // Navigate to Super Admin
  await page.getByRole('button', { name: 'Super Admin' }).click();

  // Wait for templates section
  await page.getByText('Test Templates').waitFor({ state: 'visible', timeout: 10_000 });

  // Scroll to template card and click it
  const templateCard = page.locator(`[data-template-id="${templateId}"]`);
  await templateCard.scrollIntoViewIfNeeded();
  await templateCard.click();

  // Wait for async wipe + seed + navigation
  await page.waitForTimeout(waitMs);
}
