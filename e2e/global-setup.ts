/**
 * Playwright globalSetup — clears and re-seeds the Firebase emulator before
 * firebase-tier tests run.
 *
 * Requires the Firebase emulator to be running:
 *   firebase emulators:start --only auth,firestore
 *
 * If the emulator is not running, this function throws with a clear error.
 */

import { clearFirestore, clearAuth, createAuthUser, seedDoc, seedCollection } from './helpers/emulator-seed';

const TEST_ORG = 'test-org';

export default async function globalSetup(): Promise<void> {
  console.log('[global-setup] Seeding Firebase emulator...');

  try {
    // Clear existing emulator state
    await clearFirestore();
    await clearAuth();

    // Create test user in Auth emulator
    await createAuthUser('e2e@cadenza.test', 'e2e-test-password-123', 'e2e-test-uid');

    // Seed org access control (composite ID = email_orgSlug)
    await seedDoc('access_control', `e2e@cadenza.test_${TEST_ORG}`, {
      allowed: true,
      orgId: TEST_ORG,
      role: 'SUPERADMIN',
    });

    // Seed organization document
    await seedDoc('organizations', TEST_ORG, {
      name: 'Test Org',
      orgId: TEST_ORG,
    });

    // Seed app settings (dateFormat + language for deterministic test assertions)
    await seedDoc('system_configs', `${TEST_ORG}_settings`, {
      orgId: TEST_ORG,
      language: 'en-US',
      dateFormat: 'DD/MM/YYYY',
      timeZone: 'UTC',
      startHour: 8,
      endHour: 20,
      weekStartDay: 0,
      darkMode: false,
      showWeekends: true,
    });

    // ── Gantt blocks ──────────────────────────────────────────────────────────

    // Regular block: Spring Semester (for test #9 — correct time ranges)
    await seedDoc('ganttBlocks', 'gb-spring', {
      id: 'gb-spring',
      orgId: TEST_ORG,
      title: 'Spring Semester',
      startDate: '2026-01-01',
      endDate: '2026-05-31',
      color: '#3b82f6',
      isBlackout: false,
    });

    // Blackout block covering current week (for tests #10 and #6)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    await seedDoc('ganttBlocks', 'gb-blackout', {
      id: 'gb-blackout',
      orgId: TEST_ORG,
      title: 'Test Blackout',
      startDate: todayStr,
      endDate: nextWeekStr,
      color: '#ef4444',
      isBlackout: true,
    });

    // ── Events ────────────────────────────────────────────────────────────────

    // Hidden event (inside blackout range — isHidden=true, for test #6)
    await seedDoc('events', 'ev-hidden', {
      id: 'ev-hidden',
      orgId: TEST_ORG,
      name: 'Hidden Lesson',
      description: '',
      start: `${todayStr}T10:00:00`,
      end: `${todayStr}T11:00:00`,
      isCanceled: false,
      isHidden: true,
      canceledByBlackoutId: 'gb-blackout',
    });

    // Visible event (outside blackout range — for #6 control)
    const tomorrowStr = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    await seedDoc('events', 'ev-visible', {
      id: 'ev-visible',
      orgId: TEST_ORG,
      name: 'Visible Lesson',
      description: '',
      start: `${tomorrowStr}T10:00:00`,
      end: `${tomorrowStr}T11:00:00`,
      isCanceled: false,
      isHidden: false,
    });

    // Editable event at today noon — for edit pre-populate (#2) and cancellation pay (#8) tests
    await seedDoc('events', 'ev-editable', {
      id: 'ev-editable',
      orgId: TEST_ORG,
      name: 'Editable Lesson',
      description: '',
      start: `${todayStr}T12:00:00`,
      end: `${todayStr}T13:00:00`,
      isCanceled: false,
      isHidden: false,
    });

    // Deletable event at today 14:00 — for delete test (#3)
    await seedDoc('events', 'ev-deletable', {
      id: 'ev-deletable',
      orgId: TEST_ORG,
      name: 'Deletable Lesson',
      description: '',
      start: `${todayStr}T14:00:00`,
      end: `${todayStr}T15:00:00`,
      isCanceled: false,
      isHidden: false,
    });

    // ── Activity ──────────────────────────────────────────────────────────────

    // Minimal ADMINISTRATIVE activity — no curriculum/staff modules required.
    // Used by calendar CRUD tests (#1) to verify form fields render after activity selection.
    await seedDoc('activities', 'act-test', {
      id: 'act-test',
      orgId: TEST_ORG,
      name: 'Test Activity',
      template: 'ADMINISTRATIVE',
      activityType: 'ADMINISTRATIVE',
      modules: {
        curriculum: false,
        staffBilling: false,
        revenue: false,
        externalParticipants: false,
        orgRoleBilling: false,
      },
      eventNameMode: 'PROMPTED',
      location: null,
      isArchived: false,
    });

    console.log('[global-setup] Emulator seeded successfully.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      console.error(
        '\n[global-setup] ERROR: Firebase emulator is not running.\n' +
        'Start it with:  firebase emulators:start --only auth,firestore\n'
      );
    }
    throw err;
  }
}
