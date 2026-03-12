/**
 * Manage Hub — Firebase tier
 *
 * QA checklist items:
 *   #17 Teachers CRUD   ✓
 *   #18 Students list   — skipped (covered by #41 in devtools-templates.spec.ts)
 *   #19 Rooms CRUD      ✓
 *   #20 Lists CRUD      ✓
 *   #21 Inline subcategory creator ✓
 *
 * Navigation: MANAGE view → segmented tab control
 * Tab labels: 'Activities', 'Rooms', 'Manage Lists', 'Subscriptions'
 */

import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from '../helpers/navigate';
import { applyTestTemplate, TEMPLATE_IDS } from '../helpers/seed';

// ── #17 Teachers CRUD ──────────────────────────────────────────────────────

test('#17 Teachers CRUD — create staff member and verify in list', async ({ page }) => {
  await loadApp(page);
  await gotoView(page, 'STAFF_MEMBERS');

  // ── Create ─────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Add Staff Member' }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

  // Labels have no htmlFor — target inputs by type within the modal dialog
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="text"]').first().fill('E2E Test Teacher');
  await dialog.locator('input[type="email"]').fill('e2e-teacher@test.com');
  await page.getByRole('button', { name: 'Save' }).click();

  // ── Verify ─────────────────────────────────────────────────────────────────
  await expect(page.getByText('E2E Test Teacher')).toBeVisible({ timeout: 8_000 });
});

// ── #18 Students list ──────────────────────────────────────────────────────

test.skip('#18 Student Manager v2: 12 students after template — deferred to Chunk 7 (template seeding)', async () => {
  // TODO Chunk 7: apply template via [data-template-id], then verify student count
});

// ── #19 Rooms CRUD ─────────────────────────────────────────────────────────

test.describe('Rooms CRUD (#19)', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoView(page, 'MANAGE');
    // Switch to Rooms tab
    await page.getByRole('button', { name: 'Rooms' }).click();
    await page.waitForTimeout(200);
  });

  test('#19a create room', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Room' }).click();

    // Modal heading
    await expect(page.getByRole('heading', { name: 'Add New Room' })).toBeVisible();

    // Fill room name
    await page.getByLabel('Room Name').fill('E2E Test Room');
    await page.getByRole('button', { name: 'Save' }).click();

    // Room should appear in list
    await expect(page.getByText('E2E Test Room')).toBeVisible();
  });

  test('#19b archive room (soft-delete)', async ({ page }) => {
    // Create a room first
    await page.getByRole('button', { name: 'Add Room' }).click();
    await page.getByLabel('Room Name').fill('E2E Archive Room');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('E2E Archive Room')).toBeVisible();

    // Archive it — button has title="Archive"
    await page.getByTitle('Archive').last().click();

    // Archived badge appears
    await expect(page.getByText('Archived')).toBeVisible();
  });
});

// ── #20 Lists CRUD ─────────────────────────────────────────────────────────

test.describe('Lists CRUD (#20)', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await gotoView(page, 'MANAGE');
    // Switch to Manage Lists tab
    await page.getByRole('button', { name: 'Manage Lists' }).click();
    await page.waitForTimeout(200);
  });

  test('#20a add item to Positions list', async ({ page }) => {
    await page.getByPlaceholder('Add Positions...').fill('E2E Position');
    await page.getByPlaceholder('Add Positions...').press('Enter');

    await expect(page.getByText('E2E Position')).toBeVisible();
  });

  test('#20b remove item from Positions list', async ({ page }) => {
    // Add an item first
    await page.getByPlaceholder('Add Positions...').fill('E2E Remove Me');
    await page.getByPlaceholder('Add Positions...').press('Enter');
    await expect(page.getByText('E2E Remove Me')).toBeVisible();

    // Hover the row to reveal X button, then accept the confirm
    page.once('dialog', d => d.accept());
    const row = page.locator('div').filter({ hasText: 'E2E Remove Me' }).last();
    await row.hover();
    await row.getByRole('button').click();

    await expect(page.getByText('E2E Remove Me')).not.toBeVisible();
  });
});

// ── #21 Inline subcategory creator ─────────────────────────────────────────

test('#21 Inline subcategory creator — add L2 section within activity detail', async ({ page }) => {
  await loadApp(page);

  // Seed activities via template
  await applyTestTemplate(page, TEMPLATE_IDS.CALENDAR_HAPPY_PATH, 4_000);

  // Navigate to Manage → Activities tab
  await gotoView(page, 'MANAGE');
  await page.getByRole('button', { name: 'Activities' }).click();
  await page.waitForTimeout(300);

  // Click the first activity card (grid: div.cursor-pointer) or table row (tr.cursor-pointer)
  // to open the activity detail view
  const firstActivity = page.locator('div.cursor-pointer, tr.cursor-pointer').first();
  await firstActivity.waitFor({ state: 'visible', timeout: 8_000 });
  await firstActivity.click();

  // L2 (Section) input is visible in detail view for SuperAdmin users
  // Placeholder: t('activities.l2_placeholder') → "e.g. Violin, Piano..."
  const l2Input = page.getByPlaceholder('e.g. Violin, Piano...');
  await l2Input.last().waitFor({ state: 'visible', timeout: 8_000 });

  // Type and submit via Enter key (onKeyDown handler calls addL2)
  await l2Input.last().fill('E2E Section');
  await l2Input.last().press('Enter');

  // Verify the new L2 subcategory appears in the list
  await expect(page.getByText('E2E Section')).toBeVisible({ timeout: 5_000 });
});
