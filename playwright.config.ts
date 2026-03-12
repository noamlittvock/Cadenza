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
      // Pure UI tests — auth bypassed, no Firebase required
      name: 'ui',
      testIgnore: ['**/firebase/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Firebase-dependent tests — emulator required
      // Dev server uses port 3001 (dev:e2e-firebase) to avoid conflict with ui server
      name: 'firebase',
      testMatch: ['**/firebase/**/*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3001',
      },
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
      env: {},
    },
    {
      // Firebase test server — emulator mode (port 3001)
      name: 'firebase',
      command: 'npm run dev:e2e-firebase',
      url: 'http://localhost:3001',
      reuseExistingServer: true,
      timeout: 60_000,
      env: {},
    },
  ],
});
