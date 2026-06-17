import { expect, test } from '@playwright/test';

test('mobile access page is served as a static page', async ({ page }) => {
  await page.goto('/mobile-access.html');

  await expect(page.getByRole('heading', { name: 'Mobile Access' })).toBeVisible();
  await expect(page.getByText('Scan this QR code with your phone camera')).toBeVisible();
  await expect(page.getByText('Syncing with Cadenza Cloud...')).toHaveCount(0);
});
