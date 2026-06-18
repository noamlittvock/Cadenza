import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const publicSubmitStamp = '2026-06-18T12:00:00.000Z';

async function installPublicSubmitSmokeHarness(page: Page) {
  await page.addInitScript(
    ({ orgId, stamp }) => {
      const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
      const ts = { seconds: 1781784000, nanoseconds: 0 };
      const activity = {
        id: 'activity_public_strings',
        orgId,
        name: 'Youth Strings',
        template: 'DISCIPLINE',
        activityType: 'ACADEMIC',
        modules: { curriculum: false },
        location: null,
        eventNameMode: 'AUTO',
        isArchived: false,
        createdAt: ts,
        updatedAt: ts,
      };
      const l2 = {
        id: 'l2_public_cello',
        orgId,
        activityId: 'activity_public_strings',
        l1Id: null,
        name: 'Cello',
        isArchived: false,
        createdAt: ts,
        updatedAt: ts,
      };

      if (!sessionStorage.getItem('public-registration-smoke-seeded')) {
        for (const collection of [
          'activities',
          'l2Subcategories',
          'students',
          'families',
          'enrollments',
          'agreementAcceptances',
          'registrationIntake',
          'adminInboxItems',
        ]) {
          localStorage.removeItem(collectionKey(collection));
        }
        localStorage.setItem('language', 'en-US');
        localStorage.setItem(collectionKey('activities'), JSON.stringify([activity]));
        localStorage.setItem(collectionKey('l2Subcategories'), JSON.stringify([l2]));
        localStorage.setItem(collectionKey('students'), JSON.stringify([]));
        localStorage.setItem(collectionKey('families'), JSON.stringify([]));
        localStorage.setItem(collectionKey('enrollments'), JSON.stringify([]));
        localStorage.setItem(collectionKey('agreementAcceptances'), JSON.stringify([]));
        localStorage.setItem(collectionKey('registrationIntake'), JSON.stringify([]));
        localStorage.setItem(collectionKey('adminInboxItems'), JSON.stringify([]));
        sessionStorage.setItem('public-registration-smoke-seeded', 'true');
      }

      window.__CADENZA_PUBLIC_REGISTRATION_SUBMIT__ = async ({ payload }) => {
        const intakeId = 'intake_public_submit_smoke';
        const intake = {
          id: intakeId,
          orgId,
          status: 'PENDING',
          source: 'WEBSITE',
          submittedAt: stamp,
          applicantName: payload.applicant.fullName,
          applicantEmail: payload.applicant.email,
          applicantPhone: payload.applicant.phone,
          studentFullName: payload.student.fullName,
          studentDateOfBirth: payload.student.dateOfBirth,
          guardians: payload.guardians,
          requestedActivityId: null,
          instrument: payload.student.instrument,
          notes: payload.notes,
          consentAccepted: payload.consent.accepted,
          consentAgreementId: payload.consent.agreementId ?? 'agreement_template_registration',
          reviewedBy: null,
          reviewedAt: null,
          convertedStudentId: null,
          convertedFamilyId: null,
          convertedEnrollmentId: null,
          convertedAgreementRequestId: null,
          rejectionReason: null,
          duplicateOfStudentId: null,
          statusHistory: [{
            id: 'history_public_submit_smoke',
            status: 'PENDING',
            at: stamp,
            by: 'public',
            note: 'Public registration submitted.',
            relatedEntityIds: [intakeId],
          }],
          createdAt: stamp,
          updatedAt: stamp,
          createdBy: 'public',
          updatedBy: 'public',
        };
        localStorage.setItem(collectionKey('registrationIntake'), JSON.stringify([intake]));
        return {
          status: 'success',
          intakeId,
          submittedAt: stamp,
          message: 'Registration submitted for review.',
        };
      };
    },
    { orgId: TEST_ORG, stamp: publicSubmitStamp },
  );
}

test.describe('Public registration intake form', () => {
  test('renders outside authenticated navigation and validates required fields', async ({ page }) => {
    await page.goto('/registration/public-token-e2e');

    await expect(page.locator('nav')).toHaveCount(0);
    await expect(page.getByTestId('public-registration-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Registration intake' })).toBeVisible();

    await page.getByRole('button', { name: 'Submit registration' }).click();
    await expect(page.getByRole('alert')).toContainText('Please correct the highlighted registration fields.');
    await expect(page.getByText('Applicant name is required.')).toBeVisible();
    await expect(page.getByText('Student name is required.')).toBeVisible();
    await expect(page.getByText('Explicit consent must be accepted before submission.')).toBeVisible();
  });

  test('shows a clear failure state when the public submit backend is unavailable', async ({ page }) => {
    await page.goto('/registration/public-token-e2e');

    await page.getByLabel('Applicant name').fill('Dana Cohen');
    await page.getByLabel('Applicant email').fill('dana@example.test');
    await page.getByLabel('Student name').fill('Maya Cohen');
    await page.getByLabel('Instrument').fill('Cello');
    await page.getByLabel('Requested activity or program').fill('Youth Strings');
    await page.getByLabel(/I consent to Cadenza collecting/).check();
    await page.getByRole('button', { name: 'Submit registration' }).click();

    await expect(page.getByRole('alert')).toContainText('Registration submission is unavailable');
  });

  test('renders Hebrew RTL and stays usable at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/registration/public-token-e2e?lang=he-IL');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('public-registration-page')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'קליטת הרשמה' })).toBeVisible();
    await expect(page.getByLabel('שם מגיש הבקשה')).toBeVisible();
    await expect(page.getByLabel('שם התלמיד/ה')).toBeVisible();
    await expect(page.getByLabel(/אני מסכים/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'שליחת הרשמה' })).toBeVisible();
  });

  test('submits public intake, approves it in Admin Inbox, and exposes student graph links', async ({ page }) => {
    await installPublicSubmitSmokeHarness(page);
    await page.goto('/registration/public-token-e2e');

    await page.getByLabel('Applicant name').fill('Tamar Ezra');
    await page.getByLabel('Applicant email').fill('tamar@example.test');
    await page.getByLabel('Applicant phone').fill('050-4444444');
    await page.getByLabel('Student name').fill('Liora Ezra');
    await page.getByLabel('Birth date').fill('2015-04-12');
    await page.getByLabel('Instrument').fill('Cello');
    await page.getByLabel('Requested activity or program').fill('Youth Strings');
    await page.getByLabel(/I consent to Cadenza collecting/).check();
    await page.getByRole('button', { name: 'Submit registration' }).click();

    await expect(page.getByRole('status')).toContainText('Registration submitted');
    await expect(page.getByText('Reference: intake_public_submit_smoke')).toBeVisible();

    await loadApp(page);
    await gotoView(page, 'ADMIN_INBOX');

    const review = page.getByTestId('registration-intake-review');
    await expect(review.getByRole('heading', { name: 'Registration intake review' })).toBeVisible();
    await expect(review.getByRole('button', { name: /Liora Ezra/ })).toBeVisible();
    await expect(review.getByText('Audit history')).toBeVisible();
    await expect(review.getByText('Public registration submitted.')).toBeVisible();

    await review.getByRole('button', { name: /Liora Ezra/ }).click();
    await review.locator('select').filter({ hasText: 'Youth Strings' }).nth(1).selectOption('activity_public_strings');
    await review.locator('select').filter({ hasText: 'Cello' }).selectOption('l2_public_cello');
    await review.getByRole('button', { name: 'Approve' }).click();

    await expect(review.getByRole('status')).toContainText('Conversion graph persisted');
    await expect(review.getByTestId('intake-review-detail-status')).toHaveText('Converted');

    await gotoView(page, 'STUDENTS');
    const workspace = page.getByTestId('student-family-workspace');
    await expect(workspace.getByText('Liora Ezra').first()).toBeVisible();
    await expect(workspace.getByText('Ezra Family').first()).toBeVisible();
    await expect(workspace.getByText('Tamar Ezra').first()).toBeVisible();

    await workspace.getByText('Liora Ezra').first().click();
    const detail = page.getByTestId('student-family-detail-panel');
    await expect(detail.getByText('Ezra Family').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Enrollments' }).click();
    await expect(detail.getByText('Youth Strings').first()).toBeVisible();
    await expect(detail.getByText('Liora Ezra').first()).toBeVisible();

    const persisted = await page.evaluate((orgId) => {
      const read = (collection: string) => JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:${collection}`) || '[]');
      return {
        intake: read('registrationIntake'),
        inboxItems: read('adminInboxItems'),
        enrollments: read('enrollments'),
        agreementAcceptances: read('agreementAcceptances'),
      };
    }, TEST_ORG);
    expect(persisted.intake[0].status).toBe('CONVERTED');
    expect(persisted.inboxItems.some((item: { relatedEntityType?: string; relatedEntityIds?: string[] }) =>
      item.relatedEntityType === 'registration_intake' &&
      item.relatedEntityIds?.some(id => id.startsWith('student_')) &&
      item.relatedEntityIds?.some(id => id.startsWith('family_')) &&
      item.relatedEntityIds?.some(id => id.startsWith('enrollment_')),
    )).toBe(true);
    expect(persisted.enrollments).toHaveLength(1);
    expect(persisted.agreementAcceptances).toHaveLength(1);
  });
});
