import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);

async function resetAgreementAdminData(page: Page) {
  await page.addInitScript(
    ({ orgId, runId }) => {
      [
        'students',
        'families',
        'agreementTemplates',
        'agreementAcceptances',
      ].forEach(collection => {
        localStorage.removeItem(`cadenza:local:${orgId}:col:${collection}`);
      });
      localStorage.removeItem(`cadenza:local:${orgId}:cfg:settings`);
      localStorage.setItem('language', 'en-US');

      const now = '2026-06-19T09:00:00.000Z';
      const studentId = `agreement_student_${runId}`;
      const familyId = `agreement_family_${runId}`;
      const guardianId = `agreement_guardian_${runId}`;
      localStorage.setItem(`cadenza:local:${orgId}:col:students`, JSON.stringify([{
        id: studentId,
        orgId,
        fullName: `Agreement Student ${runId}`,
        dateOfBirth: '2014-01-01',
        isMinor: true,
        currentGrade: 6,
        governmentalId: '',
        phone: '',
        email: '',
        guardians: [],
        assignments: [],
        pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
        notes: [],
        documents: [],
        profileStatus: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      }]));
      localStorage.setItem(`cadenza:local:${orgId}:col:families`, JSON.stringify([{
        id: familyId,
        orgId,
        name: `Agreement ${runId} Family`,
        guardians: [{
          id: guardianId,
          fullName: `Agreement Guardian ${runId}`,
          relationship: 'PARENT',
          phone: '050-123-4567',
          email: `agreement.${runId}@example.test`,
          isPrimary: true,
        }],
        studentIds: [studentId],
        primaryContactGuardianId: guardianId,
        billingNotes: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      }]));
    },
    { orgId: TEST_ORG, runId: RUN_ID },
  );
}

test.describe('Agreement admin surface', () => {
  test('creates and versions a template, then issues a pending student request', async ({ page }) => {
    await resetAgreementAdminData(page);
    await loadApp(page);
    await gotoView(page, 'MANAGE');
    await page.getByRole('button', { name: 'Agreements' }).click();

    await expect(page.getByRole('heading', { name: 'Agreements' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No agreement templates yet' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'New template' }).click();
    let dialog = page.getByRole('dialog', { name: 'New template' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Kind').selectOption('ENROLLMENT');
    await dialog.getByLabel('Title').fill(`Enrollment Terms ${RUN_ID}`);
    await dialog.getByLabel('Template body').fill(`Enrollment body ${RUN_ID}`);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByText(`Enrollment Terms ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText('Version 1').first()).toBeVisible();
    await expect(page.getByText('Unsigned: 1').first()).toBeVisible();

    await page.getByRole('button', { name: 'New version' }).last().click();
    dialog = page.getByRole('dialog', { name: 'New version' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Template body').fill(`Updated enrollment body ${RUN_ID}`);
    await dialog.getByRole('button', { name: 'Create version' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Version 2').first()).toBeVisible();
    await expect(page.getByText(`Updated enrollment body ${RUN_ID}`).first()).toBeVisible();

    await page.getByRole('button', { name: 'Issue request' }).last().click();
    dialog = page.getByRole('dialog', { name: 'Issue request' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Target type').selectOption('student');
    await dialog.locator('select').nth(2).selectOption({ label: `Agreement Student ${RUN_ID}` });
    await dialog.getByRole('button', { name: 'Issue', exact: true }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByText(`Agreement Student ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText('Pending').first()).toBeVisible();
    await expect(page.getByText('Pending: 1').first()).toBeVisible();
  });
});
