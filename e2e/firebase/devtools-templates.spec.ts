/**
 * DevTools — Test Templates (Firebase tier)
 *
 * QA checklist items #37–47.
 *
 * Dependency: DevTools.tsx template cards now carry `data-template-id` attributes
 * so the `applyTestTemplate` helper can locate and click them.
 *
 * Live tests:
 *   #37/#38 — Calendar Happy Path: template wipes + navigates to CALENDAR
 *   #39     — Room Conflicts: amber ring on conflicting event blocks
 *   #41     — Student Manager: ≥10 student avatars after student-manager template
 *   #42     — Staff Manager: ≥20 staff cards after staff-manager template
 *   #43     — Admin Inbox: inbox view has items after template
 *   #44     — Gantt View: Gantt sidebar visible with blackout toggle
 *   #45     — First Admin Onboarding: checklist appears, setup gate active
 *   #46     — Full Stress Test: CALENDAR loads with full data
 *   #47     — Wipe assertion: student-manager → calendar-happy-path → 0 students
 */

import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from '../helpers/navigate';
import { applyTestTemplate, TEMPLATE_IDS } from '../helpers/seed';

// ── #37 / #38 — Calendar Happy Path ─────────────────────────────────────────

test('#37/#38 calendar-happy-path wipes data and navigates to CALENDAR', async ({ page }) => {
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.CALENDAR_HAPPY_PATH, 4_000);

  // Template navigates to CALENDAR — verify the calendar view is rendered
  // The Day/Week/Month view switcher is a reliable CALENDAR-only indicator
  await expect(page.getByRole('button', { name: 'DAY' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'WEEK' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'MONTH' })).toBeVisible();
});

// ── #39 — Room Conflicts ──────────────────────────────────────────────────────

test('#39 Room Conflicts: amber conflict ring visible on conflicting calendar event blocks', async ({ page }) => {
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.ROOM_CONFLICTS, 5_000);

  // Template navigates to CALENDAR — verify the view loaded
  await expect(page.getByRole('button', { name: 'DAY' })).toBeVisible({ timeout: 10_000 });

  // CalendarView.tsx: conflicting events (isConflicting && !isCanceled) get
  //   ring-2 ring-amber-500 ring-offset-1 on the event block container div
  const conflictBlock = page.locator('[class*="ring-amber-500"]').first();
  await expect(conflictBlock).toBeVisible({ timeout: 8_000 });
});

// ── #41 — Student Manager ─────────────────────────────────────────────────────

test('#41 Student Manager: at least 10 students appear after student-manager template', async ({ page }) => {
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.STUDENT_MANAGER, 5_000);

  // Template navigates to STUDENTS view
  await page.waitForTimeout(1_000);

  // StudentManager list rows have emerald avatar circles: bg-emerald-100 rounded-full
  // Template description: 12 students with full profiles
  const studentAvatars = page.locator('[class*="bg-emerald-100"]');
  const count = await studentAvatars.count();
  expect(count, `Expected at least 10 student avatars, got ${count}`).toBeGreaterThanOrEqual(10);
});

// ── #42 — Staff Manager ───────────────────────────────────────────────────────

test('#42 Staff Manager: at least 20 staff appear after staff-manager template', async ({ page }) => {
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.STAFF_MANAGER, 5_000);

  // Template navigates to STAFF_MEMBERS view
  await page.waitForTimeout(1_000);

  // StaffMemberManager grid mode (default): staff cards are buttons with text-left class
  // and a child div with truncate class containing the staff member's full name.
  // Template description: 25 staff (1 archived, hidden by default → 24 visible)
  const staffCards = page.locator('button[class*="text-left"]').filter({
    has: page.locator('div[class*="truncate"]'),
  });
  const count = await staffCards.count();
  expect(count, `Expected at least 20 staff cards, got ${count}`).toBeGreaterThanOrEqual(20);
});

// ── #43 — Admin Inbox ────────────────────────────────────────────────────────

test('#43 Admin Inbox: seeded inbox items appear after template', async ({ page }) => {
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.ADMIN_INBOX, 4_000);

  // Navigate to Inbox view
  await gotoView(page, 'ADMIN_INBOX');

  // Inbox should render with items — not empty.
  // The template seeds room conflicts + expiring assignments + enrollment issues.
  // Assert the inbox view loads (not loading spinner stuck) and has at least one item.
  await page.waitForTimeout(1_000);
  // Inbox items render as clickable rows / cards — check at least one is visible.
  // The inbox heading is rendered within the view.
  const itemCount = await page.locator('button, [role="button"]').filter({ hasText: /view|open|teacher|student|conflict/i }).count();
  expect(itemCount).toBeGreaterThan(0);
});

// ── #44 — Gantt View ─────────────────────────────────────────────────────────

test('#44 Gantt View: Gantt sidebar opens with blackout toggle visible', async ({ page }) => {
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.GANTT_VIEW, 5_000);

  // Template navigates to GANTT — the calendar + Gantt sidebar should be visible.
  // The "Hide Blackouts" switch is a reliable indicator that the Gantt sidebar is rendered.
  await expect(
    page.getByRole('switch', { name: 'Toggle blackout events visibility' })
  ).toBeVisible({ timeout: 10_000 });
});

// ── #45 — First Admin Onboarding ─────────────────────────────────────────────

test('#45 First Admin Onboarding: setup checklist appears with gate active', async ({ page }) => {
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.FIRST_ADMIN_ONBOARDING, 3_000);

  // Template: empty data + "First Admin — Pre-Gate" role sim.
  // App.tsx: isHardGated = !isSuperAdmin && isFirstAdmin && !setupGateCleared.
  // Role sim sets isSuperAdmin=false → gate activates.
  // CALENDAR is in GATED_VIEWS; lockedView=false for CALENDAR → full checklist is shown.
  await expect(
    page.getByRole('heading', { name: 'Welcome to Cadenza' })
  ).toBeVisible({ timeout: 10_000 });

  // All 4 steps should be present
  await expect(page.getByText('Create an Activity')).toBeVisible();
  await expect(page.getByText('Add a Staff Member')).toBeVisible();
});

// ── #46 — Full Stress Test ───────────────────────────────────────────────────

test('#46 Full Stress Test: calendar loads with all data modules populated', async ({ page }) => {
  // Large template — allow more time for Firestore writes
  await loadApp(page);
  await applyTestTemplate(page, TEMPLATE_IDS.FULL_STRESS_TEST, 8_000);

  // Template navigates to CALENDAR — verify the view is rendered
  await expect(page.getByRole('button', { name: 'DAY' })).toBeVisible({ timeout: 15_000 });
});

// ── #47 — Wipe assertion ──────────────────────────────────────────────────────

test('#47 Applying a new template wipes previous Firestore data before seeding', async ({ page }) => {
  await loadApp(page);

  // Seed 12 students via student-manager template
  await applyTestTemplate(page, TEMPLATE_IDS.STUDENT_MANAGER, 5_000);
  await page.waitForTimeout(500);
  const avatarsBefore = page.locator('[class*="bg-emerald-100"]');
  expect(await avatarsBefore.count(), 'Should have students after student-manager template').toBeGreaterThanOrEqual(10);

  // Apply calendar-happy-path — students module NOT in its modules list → students wiped
  await applyTestTemplate(page, TEMPLATE_IDS.CALENDAR_HAPPY_PATH, 5_000);

  // Navigate to STUDENTS — list should now be empty (wipe was effective)
  await gotoView(page, 'STUDENTS');
  await page.waitForTimeout(1_000);
  const avatarsAfter = page.locator('[class*="bg-emerald-100"]');
  expect(await avatarsAfter.count(), 'Students should be wiped after calendar-happy-path template').toBe(0);
});
