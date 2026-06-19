import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);

async function resetStudentFamilyData(page: Page, language: 'en-US' | 'he-IL' = 'en-US') {
  await page.addInitScript(
    ({ orgId, lang }) => {
      localStorage.removeItem(`cadenza:local:${orgId}:col:students`);
      localStorage.removeItem(`cadenza:local:${orgId}:col:families`);
      localStorage.removeItem(`cadenza:local:${orgId}:col:charges`);
      localStorage.removeItem(`cadenza:local:${orgId}:col:payments`);
      localStorage.removeItem(`cadenza:local:${orgId}:col:adjustments`);
      localStorage.removeItem(`cadenza:local:${orgId}:col:balanceSnapshots`);
      localStorage.setItem('language', lang);
    },
    { orgId: TEST_ORG, lang: language },
  );
}

async function createStudentFamilyRecord(page: Page, suffix: string) {
  const studentName = `Dana ${suffix}`;
  const familyName = `Cohen ${suffix} Family`;
  const guardianName = `Ron ${suffix}`;
  const guardianPhone = `050-${suffix.slice(-6).padStart(6, '1')}`;
  const guardianEmail = `guardian.${suffix.toLowerCase()}@example.test`;

  await page.getByTestId('student-family-new-student').click();
  await expect(page.getByRole('dialog', { name: 'New student file' })).toBeVisible();
  await page.getByLabel('Student name').fill(studentName);
  await page.getByLabel('Family name').fill(familyName);
  await page.getByPlaceholder('Guardian name').fill(guardianName);
  await page.getByPlaceholder('Relationship').fill('Parent');
  await page.getByPlaceholder('Phone', { exact: true }).fill(guardianPhone);
  await page.getByPlaceholder('Guardian email').fill(guardianEmail);
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('dialog', { name: 'New student file' })).not.toBeVisible();
  await expect(page.getByText(studentName).first()).toBeVisible();

  return { studentName, familyName, guardianName, guardianPhone, guardianEmail };
}

test.describe('Student/Family Files', () => {
  test('creates a family, student, and guardian; searches guardian data; opens detail tabs', async ({ page }) => {
    await resetStudentFamilyData(page);
    await loadApp(page);
    await gotoView(page, 'STUDENTS');

    const record = await createStudentFamilyRecord(page, `SF${RUN_ID}`);

    await page.getByPlaceholder('Search by student, family, guardian, phone, or email...').fill(record.guardianPhone);
    await expect(page.getByText(record.studentName).first()).toBeVisible();
    await expect(page.getByText(record.guardianName).first()).toBeVisible();

    await page.getByText(record.studentName).first().click();
    await expect(page.getByTestId('student-family-detail-panel')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');

    const tabExpectations = [
      ['Guardians', record.guardianEmail],
      ['Enrollments', 'No enrollments linked'],
      ['Lessons', 'No lesson history yet'],
      ['Finance', 'Family ledger summary'],
      ['Documents', 'No documents'],
      ['Agreements', 'Agreements source not connected'],
      ['History', 'Created'],
    ] as const;

    for (const [tabName, expectedText] of tabExpectations) {
      await page.getByRole('tab', { name: tabName }).click();
      await expect(page.getByText(expectedText).first()).toBeVisible();
    }

    await page.getByRole('tab', { name: 'Finance' }).click();
    await expect(page.getByText('Balance').first()).toBeVisible();
    await page.getByRole('button', { name: 'Open family ledger' }).click();
    await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible();
    await expect(page.getByRole('heading', { name: record.familyName })).toBeVisible();

    await gotoView(page, 'STUDENTS');
    await page.getByRole('button', { name: 'Families' }).click();
    await expect(page.getByPlaceholder('Search by family, guardian, student, phone, or email...')).toBeVisible();
    await expect(page.getByText(record.familyName).first()).toBeVisible();
  });

  test('renders the Student/Family workspace in Hebrew RTL', async ({ page }) => {
    await resetStudentFamilyData(page, 'he-IL');
    await loadApp(page);
    await page.locator('nav').first().getByRole('button', { name: 'תלמידים' }).click();

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const workspace = page.getByTestId('student-family-workspace');
    await expect(workspace).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'תלמידים ומשפחות' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'תלמיד חדש' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'משפחות' })).toBeVisible();
    await expect(page.getByText('אין תלמידים עדיין')).toBeVisible();
  });

  test('keeps list and profile readable at 390x844', async ({ page }) => {
    await resetStudentFamilyData(page);
    await loadApp(page);
    await gotoView(page, 'STUDENTS');

    const record = await createStudentFamilyRecord(page, `MB${RUN_ID}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('student-family-workspace')).toBeVisible();
    const mobileRow = page.getByTestId(/student-family-mobile-row-student-/).first();
    await expect(mobileRow).toBeVisible();
    await expect(mobileRow.getByText(record.studentName)).toBeVisible();

    await mobileRow.click();
    const detailPanel = page.getByTestId('student-family-detail-panel');
    await expect(detailPanel).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Profile' })).toBeVisible();
    await expect(detailPanel.getByText(record.familyName).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Guardians' }).click();
    await expect(detailPanel.getByText(record.guardianName).first()).toBeVisible();
  });
});
