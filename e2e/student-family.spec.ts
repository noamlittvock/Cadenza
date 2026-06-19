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
      localStorage.removeItem(`cadenza:local:${orgId}:col:agreementTemplates`);
      localStorage.removeItem(`cadenza:local:${orgId}:col:agreementAcceptances`);
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

async function seedAgreementRows(page: Page, record: Awaited<ReturnType<typeof createStudentFamilyRecord>>) {
  await page.evaluate(
    ({ orgId, data, runId }) => {
      const read = (collection: string) => JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:${collection}`) || '[]');
      const students = read('students');
      const families = read('families');
      const student = students.find((row: { fullName?: string }) => row.fullName === data.studentName);
      const family = families.find((row: { name?: string }) => row.name === data.familyName);
      const guardianId = family?.primaryContactGuardianId ?? family?.guardians?.[0]?.id ?? null;
      if (!student || !family) throw new Error('Could not seed agreement rows without student and family records.');

      const now = '2026-06-19T10:00:00.000Z';
      const acceptedTemplateId = `student_family_agreement_accepted_${runId}`;
      const missingTemplateId = `student_family_agreement_missing_${runId}`;
      const templatesKey = `cadenza:local:${orgId}:col:agreementTemplates`;
      const acceptancesKey = `cadenza:local:${orgId}:col:agreementAcceptances`;
      localStorage.setItem(templatesKey, JSON.stringify([
        {
          id: acceptedTemplateId,
          orgId,
          kind: 'ENROLLMENT',
          title: `Enrollment Terms ${runId}`,
          version: 1,
          body: 'Enrollment terms for the student file smoke.',
          isActive: true,
          supersedesVersion: null,
          requiresGuardian: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'e2e-admin',
          updatedBy: 'e2e-admin',
        },
        {
          id: missingTemplateId,
          orgId,
          kind: 'CONSENT',
          title: `General Consent ${runId}`,
          version: 1,
          body: 'Consent terms for unsigned status.',
          isActive: true,
          supersedesVersion: null,
          requiresGuardian: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'e2e-admin',
          updatedBy: 'e2e-admin',
        },
      ]));
      localStorage.setItem(acceptancesKey, JSON.stringify([
        {
          id: `student_family_acceptance_${runId}`,
          orgId,
          templateId: acceptedTemplateId,
          templateVersion: 1,
          studentId: student.id,
          familyId: family.id,
          enrollmentId: null,
          guardianId,
          status: 'ACCEPTED',
          acceptedAt: now,
          acceptedByName: data.guardianName,
          signatureRef: `typed://agreement_acceptances/student_family_acceptance_${runId}`,
          createdAt: now,
          updatedAt: now,
          createdBy: 'e2e-admin',
          updatedBy: 'e2e-admin',
        },
      ]));
      window.dispatchEvent(new StorageEvent('storage', { key: templatesKey }));
      window.dispatchEvent(new StorageEvent('storage', { key: acceptancesKey }));
    },
    { orgId: TEST_ORG, data: record, runId: RUN_ID },
  );
}

test.describe('Student/Family Files', () => {
  test('creates a family, student, and guardian; searches guardian data; opens detail tabs', async ({ page }) => {
    await resetStudentFamilyData(page);
    await loadApp(page);
    await gotoView(page, 'STUDENTS');

    const record = await createStudentFamilyRecord(page, `SF${RUN_ID}`);
    await seedAgreementRows(page, record);

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
      ['Agreements', `Enrollment Terms ${RUN_ID}`],
      ['History', 'Created'],
    ] as const;

    for (const [tabName, expectedText] of tabExpectations) {
      await page.getByRole('tab', { name: tabName }).click();
      await expect(page.getByText(expectedText).first()).toBeVisible();
    }

    await page.getByRole('tab', { name: 'Agreements' }).click();
    const agreementPanel = page.getByTestId('student-family-agreements-panel');
    await expect(agreementPanel.getByText(`General Consent ${RUN_ID}`)).toBeVisible();
    await expect(agreementPanel.getByText('Missing').first()).toBeVisible();
    await expect(agreementPanel.getByText('Accepted').first()).toBeVisible();
    await expect(agreementPanel.getByText(record.guardianName).first()).toBeVisible();

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
