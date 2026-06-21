import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);

async function resetAssessmentData(page: Page) {
  await page.addInitScript(
    ({ orgId, runId }) => {
      const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
      [
        'students',
        'staffMembers',
        'teachers',
        'activities',
        'examSessions',
        'examinerSubmissions',
        'certificates',
        'reportCards',
      ].forEach(collection => localStorage.removeItem(collectionKey(collection)));
      localStorage.removeItem(`cadenza:local:${orgId}:cfg:settings`);
      localStorage.setItem('language', 'en-US');

      const now = '2026-06-19T09:00:00.000Z';
      const stamp = { seconds: 0, nanoseconds: 0 };
      const studentId = `assessment_student_${runId}`;
      const staffId = `assessment_examiner_${runId}`;
      const activityId = `assessment_activity_${runId}`;

      localStorage.setItem(collectionKey('students'), JSON.stringify([
        {
          id: studentId,
          orgId,
          fullName: `Assessment Student ${runId}`,
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
        },
      ]));
      localStorage.setItem(collectionKey('staffMembers'), JSON.stringify([
        {
          id: staffId,
          orgId,
          uid: 'e2e-uid',
          role: 'STAFF',
          fullName: `Assessment Examiner ${runId}`,
          email: 'e2e@cadenza.test',
          phone: null,
          startDate: null,
          isArchived: false,
          createdAt: stamp,
          updatedAt: stamp,
          isFirstAdmin: false,
          onboardingDismissed: true,
          firstUseFlags: { activityHub: true, staffModule: true, eventCreation: true, enrollment: true },
          documents: [],
        },
      ]));
      localStorage.setItem(collectionKey('teachers'), JSON.stringify([
        {
          id: staffId,
          fullName: `Assessment Examiner ${runId}`,
          positions: [],
          positionAssignments: [],
          tags: [],
          phone: '',
          email: 'e2e@cadenza.test',
          color: '#8a1538',
          isArchived: false,
        },
      ]));
      localStorage.setItem(collectionKey('activities'), JSON.stringify([
        {
          id: activityId,
          orgId,
          name: `Assessment Activity ${runId}`,
          template: 'DISCIPLINE',
          activityType: 'ACADEMIC',
          modules: { curriculum: true },
          location: 'Studio A',
          eventNameMode: 'AUTO',
          isArchived: false,
          createdAt: stamp,
          updatedAt: stamp,
        },
      ]));
    },
    { orgId: TEST_ORG, runId: RUN_ID },
  );
}

test.describe('Assessment workspace', () => {
  test('admin creates a private exam session, examiner submission, certificate, and report-card draft', async ({ page }) => {
    await resetAssessmentData(page);
    await loadApp(page);
    await gotoView(page, 'MANAGE');
    await page.getByRole('button', { name: 'Assessments' }).click();

    await expect(page.getByTestId('assessment-workspace')).toBeVisible();
    await expect(page.getByText('D-22 provisional')).toBeVisible();
    await page.getByLabel('Session name').fill(`Private Exam ${RUN_ID}`);
    await page.getByLabel('Date').fill('2026-07-01');
    await page.getByLabel('Activity').selectOption({ label: `Assessment Activity ${RUN_ID}` });
    await page.getByLabel(`Assessment Examiner ${RUN_ID}`).check();
    await page.getByLabel(`Assessment Student ${RUN_ID}`).check();
    await page.getByLabel('Notes').fill('Private assessment setup only.');
    await page.getByRole('button', { name: 'Save session' }).click();

    await expect(page.getByRole('button', { name: new RegExp(`Private Exam ${RUN_ID}`) })).toBeVisible();
    await page.locator('select[aria-label="Student"]').first().selectOption({ label: `Assessment Student ${RUN_ID}` });
    await page.getByLabel('Score').fill('94');
    await page.getByLabel('Grade').first().fill('A');
    await page.getByLabel('Remarks').fill('Confident performance.');
    await page.getByRole('button', { name: 'Submit mark', exact: true }).click();
    await expect(page.getByText('94')).toBeVisible();
    await expect(page.getByText('Confident performance.')).toBeVisible();
    await page.getByRole('button', { name: 'GRADED', exact: true }).click();

    await page.locator('select[aria-label="Student"]').first().selectOption({ label: `Assessment Student ${RUN_ID}` });
    await page.getByLabel('Certificate title').fill(`Grade 4 Certificate ${RUN_ID}`);
    await page.getByLabel('Level').fill('4');
    await page.getByRole('button', { name: 'Create pending certificate' }).click();
    await expect(page.getByText(`Grade 4 Certificate ${RUN_ID}`)).toBeVisible();
    await page.getByRole('button', { name: 'Issue' }).click();
    await expect(page.getByText(/ISSUED/)).toBeVisible();

    await page.locator('select[aria-label="Student"]').nth(1).selectOption({ label: `Assessment Student ${RUN_ID}` });
    await page.getByLabel('Period').fill('2026 Semester 1');
    await page.getByLabel('Subject').fill('Technique');
    await page.getByLabel('Grade').first().fill('A');
    await page.getByLabel('Comment').fill('Secure intonation.');
    await page.getByLabel('Summary').fill('Private draft prepared for review.');
    await page.getByLabel('Guardian release flag').check();
    await page.getByRole('button', { name: 'Create report-card draft' }).click();
    await expect(page.getByText('2026 Semester 1')).toBeVisible();
    await expect(page.getByText('Guardian release flag').last()).toBeVisible();

    await gotoView(page, 'STUDENTS');
    await page.getByText(`Assessment Student ${RUN_ID}`).first().click();
    await page.getByRole('tab', { name: 'History' }).click();
    const assessmentHistory = page.getByTestId('student-family-assessment-history');
    await expect(assessmentHistory).toBeVisible();
    await expect(assessmentHistory.getByText('Assessment history')).toBeVisible();
    await expect(assessmentHistory.getByText('D-22 provisional')).toBeVisible();
    await expect(assessmentHistory.getByText(`Private Exam ${RUN_ID}`)).toBeVisible();
    await expect(assessmentHistory.getByText(`Grade 4 Certificate ${RUN_ID}`)).toBeVisible();
    await expect(assessmentHistory.getByText('2026 Semester 1')).toBeVisible();
  });

  test('assigned examiner submits from the assessment context at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await resetAssessmentData(page);
    await page.addInitScript(
      ({ orgId, runId }) => {
        sessionStorage.setItem('e2e_role_sim', JSON.stringify({
          role: 'STAFF',
          isFirstAdmin: false,
          setupGateCleared: true,
          onboardingDismissed: true,
          label: 'Assigned examiner',
        }));
        const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
        const now = '2026-06-19T09:00:00.000Z';
        localStorage.setItem(collectionKey('examSessions'), JSON.stringify([
          {
            id: `mobile_exam_${runId}`,
            orgId,
            name: `Mobile Examiner Exam ${runId}`,
            activityId: `assessment_activity_${runId}`,
            date: '2026-07-02',
            status: 'IN_PROGRESS',
            examinerStaffIds: [`assessment_examiner_${runId}`],
            studentIds: [`assessment_student_${runId}`],
            notes: 'Mobile examiner context.',
            createdAt: now,
            updatedAt: now,
            createdBy: 'e2e-admin',
            updatedBy: 'e2e-admin',
          },
        ]));
        localStorage.setItem(collectionKey('examinerSubmissions'), JSON.stringify([]));
        localStorage.setItem(collectionKey('certificates'), JSON.stringify([]));
        localStorage.setItem(collectionKey('reportCards'), JSON.stringify([]));
      },
      { orgId: TEST_ORG, runId: RUN_ID },
    );

    await page.goto(`/${TEST_ORG}?tab=assessments`);
    const workspace = page.getByTestId('assessment-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByText('Assigned examiner scope')).toBeVisible();
    await expect(workspace.getByRole('heading', { name: `Mobile Examiner Exam ${RUN_ID}` })).toBeVisible();
    await workspace.locator('select[aria-label="Student"]').selectOption({ label: `Assessment Student ${RUN_ID}` });
    await workspace.getByLabel('Score').fill('91');
    await workspace.getByLabel('Grade').fill('A-');
    await workspace.getByLabel('Remarks').fill('Mobile examiner submission.');
    await workspace.getByRole('button', { name: 'Submit mark', exact: true }).click();
    await expect(workspace.getByText('91')).toBeVisible();
    await expect(workspace.getByText('Mobile examiner submission.')).toBeVisible();
  });
});
