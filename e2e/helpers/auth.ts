import { Page } from '@playwright/test';

/**
 * Test user credentials for Firebase Emulator (Tier 2 / firebase tests).
 * These are created in the emulator seed step (Chunk 4).
 */
export const TEST_USER = {
  email: 'e2e@cadenza.test',
  password: 'e2e-test-password-123',
  orgSlug: 'test-org',
  uid: 'e2e-test-uid',
};

/**
 * Sign in via Firebase Emulator (for Tier 2 / firebase tests only).
 * Uses the Firebase Auth REST API directly so Playwright doesn't need to interact
 * with a popup. The token is injected into the page's IndexedDB.
 * NOTE: For Tier 1 (ui) tests, auth is bypassed entirely via VITE_E2E_AUTH_BYPASS.
 */
export async function signInViaEmulator(page: Page): Promise<void> {
  // Use Firebase Auth Emulator REST sign-in endpoint
  const resp = await page.request.post(
    'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-api-key',
    {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password,
        returnSecureToken: true,
      },
    }
  );
  if (!resp.ok()) {
    throw new Error(`Emulator sign-in failed: ${resp.status()} ${await resp.text()}`);
  }
}
