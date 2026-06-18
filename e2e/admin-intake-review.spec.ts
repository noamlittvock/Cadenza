import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const now = '2026-06-18T10:00:00.000Z';

async function seedAdminIntake(page: Page, language: 'en-US' | 'he-IL' = 'en-US') {
  await page.addInitScript(
    ({ orgId, lang, stamp }) => {
      const ts = { seconds: 1781776800, nanoseconds: 0 };
      const activity = {
        id: 'activity_strings',
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
        id: 'l2_cello',
        orgId,
        activityId: 'activity_strings',
        l1Id: null,
        name: 'Cello',
        isArchived: false,
        createdAt: ts,
        updatedAt: ts,
      };
      const existingStudent = {
        id: 'student_existing_maya',
        orgId,
        fullName: 'Maya Cohen',
        dateOfBirth: '2014-03-01',
        isMinor: true,
        guardians: [],
        assignments: [],
        pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
        notes: [],
        documents: [],
        profileStatus: 'ACTIVE',
        createdAt: stamp,
        updatedAt: stamp,
      };
      const intakeBase = {
        orgId,
        source: 'WEBSITE',
        createdAt: stamp,
        updatedAt: stamp,
        consentAccepted: true,
        consentAgreementId: 'agreement_template_registration',
        requestedActivityId: 'activity_strings',
        instrument: 'Cello',
        notes: null,
        studentDateOfBirth: '2014-03-01',
      };
      const intake = [
        {
          ...intakeBase,
          id: 'intake_maya',
          status: 'PENDING',
          submittedAt: '2026-06-18T08:00:00.000Z',
          applicantName: 'Dana Cohen',
          applicantEmail: 'dana@example.test',
          applicantPhone: '050-1111111',
          studentFullName: 'Maya Cohen',
          guardians: [{ id: 'guardian_maya', fullName: 'Dana Cohen', relationship: 'PARENT', phone: '050-1111111', email: 'dana@example.test', isPrimary: true }],
        },
        {
          ...intakeBase,
          id: 'intake_ari',
          status: 'PENDING',
          submittedAt: '2026-06-18T08:30:00.000Z',
          applicantName: 'Ron Levi',
          applicantEmail: 'ron@example.test',
          applicantPhone: '050-2222222',
          studentFullName: 'Ari Levi',
          guardians: [{ id: 'guardian_ari', fullName: 'Ron Levi', relationship: 'PARENT', phone: '050-2222222', email: 'ron@example.test', isPrimary: true }],
        },
        {
          ...intakeBase,
          id: 'intake_noa',
          status: 'PENDING',
          submittedAt: '2026-06-18T09:00:00.000Z',
          applicantName: 'Yael Bar',
          applicantEmail: 'yael@example.test',
          applicantPhone: '050-3333333',
          studentFullName: 'Noa Bar',
          guardians: [{ id: 'guardian_noa', fullName: 'Yael Bar', relationship: 'PARENT', phone: '050-3333333', email: 'yael@example.test', isPrimary: true }],
        },
      ];

      localStorage.setItem('language', lang);
      localStorage.setItem(`cadenza:local:${orgId}:col:activities`, JSON.stringify([activity]));
      localStorage.setItem(`cadenza:local:${orgId}:col:l2Subcategories`, JSON.stringify([l2]));
      localStorage.setItem(`cadenza:local:${orgId}:col:students`, JSON.stringify([existingStudent]));
      localStorage.setItem(`cadenza:local:${orgId}:col:families`, JSON.stringify([]));
      localStorage.setItem(`cadenza:local:${orgId}:col:enrollments`, JSON.stringify([]));
      localStorage.setItem(`cadenza:local:${orgId}:col:agreementAcceptances`, JSON.stringify([]));
      localStorage.setItem(`cadenza:local:${orgId}:col:registrationIntake`, JSON.stringify(intake));
      localStorage.setItem(`cadenza:local:${orgId}:col:adminInboxItems`, JSON.stringify([]));
    },
    { orgId: TEST_ORG, lang: language, stamp: now },
  );
}

test.describe('Admin registration intake review', () => {
  test('reviews, corrects, rejects, marks duplicate, and persists approval graph', async ({ page }) => {
    await seedAdminIntake(page);
    await loadApp(page);
    await gotoView(page, 'ADMIN_INBOX');

    const review = page.getByTestId('registration-intake-review');
    await expect(review.getByRole('heading', { name: 'Registration intake review' })).toBeVisible();
    await expect(review.getByText('Possible duplicate: Maya Cohen')).toBeVisible();
    await expect(review.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await review.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^registration_intake_\d{4}-\d{2}-\d{2}\.csv$/);

    await review.getByLabel('Applicant email').fill('corrected@example.test');
    await review.getByRole('button', { name: 'Save corrections' }).click();
    await expect(review.getByTestId('intake-review-detail-status')).toHaveText('In review');
    await expect(review.getByText('Audit history')).toBeVisible();
    await expect(review.getByText('Moved into admin review with corrections.')).toBeVisible();

    await review.getByText('Maya Cohen').first().click();
    await review.getByRole('radio', { name: /Maya Cohen/ }).check();
    await review.getByLabel('Decision note').fill('Existing student confirmed.');
    await review.getByRole('button', { name: 'Mark duplicate' }).click();
    await expect(review.getByTestId('intake-review-detail-status')).toHaveText('Duplicate');

    await review.getByText('Noa Bar').click();
    await review.getByLabel('Decision note').fill('Program is full.');
    await review.getByRole('button', { name: 'Reject' }).click();
    await expect(review.getByTestId('intake-review-detail-status')).toHaveText('Rejected');

    await review.getByText('Ari Levi').click();
    await review.getByLabel('Section').selectOption('l2_cello');
    await review.getByRole('button', { name: 'Approve' }).click();
    await expect(review.getByRole('status')).toContainText('Conversion graph persisted');
    await expect(review.getByTestId('intake-review-detail-status')).toHaveText('Converted');

    const persisted = await page.evaluate((orgId) => {
      const read = (collection: string) => JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:${collection}`) || '[]');
      return {
        students: read('students'),
        families: read('families'),
        enrollments: read('enrollments'),
        agreementAcceptances: read('agreementAcceptances'),
        inboxItems: read('adminInboxItems'),
      };
    }, TEST_ORG);

    const newStudent = persisted.students.find((student: { fullName?: string }) => student.fullName === 'Ari Levi');
    expect(newStudent).toBeTruthy();
    expect(newStudent.assignments[0]).toMatchObject({
      activityId: 'activity_strings',
      subcategoryId: 'l2_cello',
      status: 'ACTIVE',
    });
    expect(persisted.families.some((family: { studentIds?: string[] }) => family.studentIds?.includes(newStudent.id))).toBe(true);
    expect(persisted.enrollments.some((enrollment: { studentId?: string }) => enrollment.studentId === newStudent.id)).toBe(true);
    expect(persisted.agreementAcceptances.some((agreement: { studentId?: string; status?: string }) => agreement.studentId === newStudent.id && agreement.status === 'PENDING')).toBe(true);
    expect(persisted.inboxItems.some((item: { relatedEntityIds?: string[] }) => item.relatedEntityIds?.includes(newStudent.id))).toBe(true);
  });

  test('renders the review queue in Hebrew RTL', async ({ page }) => {
    await seedAdminIntake(page, 'he-IL');
    await loadApp(page);
    await page.locator('nav').first().getByRole('button', { name: 'תיבת דואר' }).click();

    const review = page.getByTestId('registration-intake-review');
    await expect(review).toHaveAttribute('dir', 'rtl');
    await expect(review.getByRole('heading', { name: 'סקירת קליטת הרשמה' })).toBeVisible();
    await expect(review.getByLabel('סינון סטטוס')).toBeVisible();
    await expect(review.getByRole('button', { name: 'ייצוא CSV' })).toBeVisible();
    await expect(review.getByText('היסטוריית ביקורת')).toBeVisible();
    await expect(review.getByRole('button', { name: 'שמור תיקונים' })).toBeVisible();
  });
});
