import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      // Supabase/local UI tests: auth bypassed, no external backend required.
      name: 'ui',
      testIgnore: ['**/firebase/**'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // UI test server — auth bypass mode (port 3000)
      name: 'ui',
      command: 'npm run dev:e2e',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        VITE_E2E_AUTH_BYPASS: 'true',
        VITE_LOCAL_MODE: 'true',
        // Keep the deterministic local suite isolated even when a developer has
        // a live Supabase project configured in .env.local.
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
      },
    },
  ],
});
