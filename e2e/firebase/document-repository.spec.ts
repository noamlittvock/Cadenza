/**
 * Document Templates — Firebase tier
 *
 * ─── DECISION RECORD ────────────────────────────────────────────────────────
 * QA checklist items #33-36 described a full "Document Repository" with tabs,
 * search, grid/list toggle, and aggregated documents. That component exists on
 * the Claude-Overhaul branch but was NOT ported to cadenza-v2.
 *
 * The cadenza-v2 DOCUMENTS view is `DocumentTemplates` — an HTML template
 * generator with selector cards (hourly self-report, student report card),
 * an iframe preview, and a Copy HTML button.
 *
 * Decision (2026-03-12): Replace #33-36 stubs with tests for what
 * DocumentTemplates actually does. Items #33-36 are marked n/a for cadenza-v2.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tests:
 *   - DOCUMENTS view loads with template selector cards
 *   - Clicking a different card updates the active selection (border-emerald-500)
 *   - Copy HTML button is visible in the preview area
 */

import { test, expect } from '@playwright/test';
import { loadApp, gotoView } from '../helpers/navigate';

test('Documents view loads with template selector cards', async ({ page }) => {
  await loadApp(page);
  await gotoView(page, 'DOCUMENTS');

  await expect(page.getByRole('button', { name: /Hourly Self-Report/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Student Report Card/i })).toBeVisible();
});

test('Clicking a template card activates it (emerald border)', async ({ page }) => {
  await loadApp(page);
  await gotoView(page, 'DOCUMENTS');

  // Default: Hourly Self-Report is selected (border-emerald-500)
  const hourlyBtn = page.getByRole('button', { name: /Hourly Self-Report/i });
  await expect(hourlyBtn).toBeVisible();
  await expect(hourlyBtn).toHaveClass(/border-emerald-500/);

  // Click Student Report Card — it should become active
  const reportBtn = page.getByRole('button', { name: /Student Report Card/i });
  await reportBtn.click();
  await expect(reportBtn).toHaveClass(/border-emerald-500/);

  // Hourly Self-Report is no longer active
  await expect(hourlyBtn).not.toHaveClass(/border-emerald-500/);
});

test('Copy HTML button is visible in the preview area', async ({ page }) => {
  await loadApp(page);
  await gotoView(page, 'DOCUMENTS');

  // Copy HTML button sits above the iframe preview
  await expect(page.getByRole('button', { name: /Copy HTML/i })).toBeVisible();
});

// QA items #33-36 — n/a for cadenza-v2 (full DocumentRepository not ported from Claude-Overhaul)
