/**
 * Onboarding Checklist — Firebase tier
 *
 * QA checklist items #65–67.
 *
 * Setup: applies the "First Admin — Pre-Gate" template via DevTools, which:
 *   - Wipes all data (empty org)
 *   - Sets role sim to "First Admin — Pre-Gate" (isSuperAdmin=false, isFirstAdmin=true)
 *   - Navigates to CALENDAR
 *
 * App gate: App.tsx `isHardGated = !isSuperAdmin && isFirstAdmin && !setupGateCleared`
 *   → CALENDAR is gated → OnboardingChecklist shown (lockedView=false for CALENDAR)
 *
 * Live tests:
 *   #65 — Checklist appears for new orgs (gate active, full checklist shown)
 *   #66 — Gate persists across page reload (role sim survives via sessionStorage)
 *   #67 — "Go to Activity Hub" CTA navigates to MANAGE
 */

import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from '../helpers/navigate';
import { applyTestTemplate, TEMPLATE_IDS } from '../helpers/seed';

// ── #65 — Checklist appears for new orgs ─────────────────────────────────────

test('#65 onboarding checklist shows for first-admin pre-gate state', async ({ page }) => {
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.FIRST_ADMIN_ONBOARDING, 3_000);

  // The "Welcome to Cadenza" setup title is the checklist heading
  await expect(
    page.getByRole('heading', { name: 'Welcome to Cadenza' })
  ).toBeVisible({ timeout: 10_000 });

  // All 4 step items should be listed
  await expect(page.getByText('Create an Activity')).toBeVisible();
  await expect(page.getByText('Add a Staff Member')).toBeVisible();
  await expect(page.getByText('Add a Student')).toBeVisible();
  await expect(page.getByText('Create Your First Event')).toBeVisible();

  // Progress indicator shows 0/4
  await expect(page.getByText('0/4')).toBeVisible();
});

// ── #66 — Gate persists across reload ────────────────────────────────────────

test('#66 onboarding gate persists across page reload', async ({ page }) => {
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.FIRST_ADMIN_ONBOARDING, 3_000);

  // Gate active before reload
  await expect(
    page.getByRole('heading', { name: 'Welcome to Cadenza' })
  ).toBeVisible({ timeout: 10_000 });

  // Reload — sessionStorage preserves the role simulation
  await page.reload();
  await page.waitForTimeout(2_000);

  // Gate must still be active after reload
  await expect(
    page.getByRole('heading', { name: 'Welcome to Cadenza' })
  ).toBeVisible({ timeout: 10_000 });
});

// ── #67 — Guide Me navigates correctly ───────────────────────────────────────

test('#67 "Go to Activity Hub" CTA navigates to MANAGE view', async ({ page }) => {
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.FIRST_ADMIN_ONBOARDING, 3_000);

  // Checklist is visible
  await expect(
    page.getByRole('heading', { name: 'Welcome to Cadenza' })
  ).toBeVisible({ timeout: 10_000 });

  // Step 1 CTA: "Go to Activity Hub" — clicks and navigates to MANAGE
  await page.getByRole('button', { name: 'Go to Activity Hub' }).click();
  await page.waitForTimeout(500);

  // MANAGE view renders ManageHub with Activities tab (the default tab)
  await expect(
    page.getByRole('button', { name: 'Activities' })
  ).toBeVisible({ timeout: 8_000 });
});
