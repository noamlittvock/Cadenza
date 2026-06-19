import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);
const STAMP = '2026-06-19T15:00:00.000Z';
const PUBLIC_WORKFLOW_TOKEN = `agreement-workflow-token-${RUN_ID}`;

const collectionKey = (collection: string) => `cadenza:local:${TEST_ORG}:col:${collection}`;

async function installPublicAgreementHarness(page: Page) {
  await page.addInitScript(
    ({ stamp }) => {
      window.__CADENZA_PUBLIC_AGREEMENT_LOAD__ = async () => ({
        status: 'success',
        target: {
          expiresAt: '2026-06-20T15:00:00.000Z',
          endpointLabel: 'Enrollment agreement for Mobile Student',
          template: {
            id: 'agreement_template_public_e2e',
            kind: 'ENROLLMENT',
            title: 'Enrollment agreement',
            version: 1,
            body: 'Public signing body for mobile agreement smoke.',
            requiresGuardian: true,
          },
          acceptance: {
            id: 'agreement_acceptance_public_e2e',
            acceptanceId: 'agreement_acceptance_public_e2e',
            templateId: 'agreement_template_public_e2e',
            templateVersion: 1,
            studentId: 'student_public_e2e',
            familyId: 'family_public_e2e',
            enrollmentId: 'enrollment_public_e2e',
            guardianId: 'guardian_public_e2e',
            status: 'PENDING',
          },
          target: {
            label: 'Enrollment agreement for Mobile Student',
            studentId: 'student_public_e2e',
            familyId: 'family_public_e2e',
            enrollmentId: 'enrollment_public_e2e',
            guardianId: 'guardian_public_e2e',
          },
        },
      });
      window.__CADENZA_PUBLIC_AGREEMENT_SUBMIT__ = async ({ payload }) => ({
        status: 'success',
        acceptanceId: payload.target.acceptanceId,
        acceptanceStatus: payload.action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
        submittedAt: stamp,
        message: payload.action === 'ACCEPT' ? 'Agreement accepted.' : 'Agreement declined.',
      });
    },
    { stamp: STAMP },
  );
}

async function seedAgreementPdfCapture(page: Page) {
  await page.addInitScript(
    ({ orgId, runId, stamp }) => {
      const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
      for (const collection of ['students', 'families', 'agreementTemplates', 'agreementAcceptances']) {
        localStorage.removeItem(collectionKey(collection));
      }
      localStorage.setItem('language', 'en-US');
      localStorage.setItem(collectionKey('students'), JSON.stringify([{
        id: `agreement_pdf_student_${runId}`,
        orgId,
        fullName: `PDF Student ${runId}`,
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
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(collectionKey('families'), JSON.stringify([{
        id: `agreement_pdf_family_${runId}`,
        orgId,
        name: `PDF Family ${runId}`,
        guardians: [{
          id: `agreement_pdf_guardian_${runId}`,
          fullName: `PDF Guardian ${runId}`,
          relationship: 'PARENT',
          phone: null,
          email: `pdf.${runId}@example.test`,
          isPrimary: true,
        }],
        studentIds: [`agreement_pdf_student_${runId}`],
        primaryContactGuardianId: `agreement_pdf_guardian_${runId}`,
        billingNotes: null,
        isArchived: false,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(collectionKey('agreementTemplates'), JSON.stringify([{
        id: `agreement_pdf_template_${runId}`,
        orgId,
        kind: 'ENROLLMENT',
        title: `PDF Terms ${runId}`,
        version: 1,
        body: `PDF body ${runId}`,
        isActive: true,
        supersedesVersion: null,
        requiresGuardian: true,
        createdAt: stamp,
        updatedAt: stamp,
        createdBy: 'admin',
        updatedBy: 'admin',
      }]));
      localStorage.setItem(collectionKey('agreementAcceptances'), JSON.stringify([{
        id: `agreement_pdf_acceptance_${runId}`,
        orgId,
        templateId: `agreement_pdf_template_${runId}`,
        templateVersion: 1,
        studentId: `agreement_pdf_student_${runId}`,
        familyId: `agreement_pdf_family_${runId}`,
        enrollmentId: null,
        guardianId: `agreement_pdf_guardian_${runId}`,
        status: 'PENDING',
        acceptedAt: null,
        acceptedByName: null,
        signatureRef: null,
        createdAt: stamp,
        updatedAt: stamp,
        createdBy: 'admin',
        updatedBy: 'admin',
      }]));
    },
    { orgId: TEST_ORG, runId: RUN_ID, stamp: STAMP },
  );
}

async function seedAgreementWorkflowBase(page: Page) {
  await page.goto('/');
  await page.evaluate(
    ({ orgId, runId, stamp }) => {
      const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
      for (const collection of ['students', 'families', 'agreementTemplates', 'agreementAcceptances']) {
        localStorage.removeItem(collectionKey(collection));
      }
      localStorage.removeItem(`cadenza:local:${orgId}:cfg:settings`);
      localStorage.setItem('language', 'en-US');
      localStorage.setItem(collectionKey('students'), JSON.stringify([{
        id: `agreement_workflow_student_${runId}`,
        orgId,
        fullName: `Workflow Student ${runId}`,
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
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(collectionKey('families'), JSON.stringify([{
        id: `agreement_workflow_family_${runId}`,
        orgId,
        name: `Workflow Family ${runId}`,
        guardians: [{
          id: `agreement_workflow_guardian_${runId}`,
          fullName: `Workflow Guardian ${runId}`,
          relationship: 'PARENT',
          phone: '050-222-3333',
          email: `workflow.${runId}@example.test`,
          isPrimary: true,
        }],
        studentIds: [`agreement_workflow_student_${runId}`],
        primaryContactGuardianId: `agreement_workflow_guardian_${runId}`,
        billingNotes: null,
        isArchived: false,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
    },
    { orgId: TEST_ORG, runId: RUN_ID, stamp: STAMP },
  );
}

async function installLinkedPublicAgreementHarness(page: Page, ids: { templateId: string; acceptanceId: string }) {
  await page.addInitScript(
    ({ orgId, token, stamp, templateId, acceptanceId }) => {
      const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
      const read = (collection: string) => JSON.parse(localStorage.getItem(collectionKey(collection)) || '[]');

      window.__CADENZA_PUBLIC_AGREEMENT_LOAD__ = async ({ token: requestedToken }) => {
        if (requestedToken !== token) {
          return { status: 'error', code: 'INVALID_ENDPOINT', message: 'This agreement link is unavailable or expired.' };
        }
        const templates = read('agreementTemplates');
        const acceptances = read('agreementAcceptances');
        const students = read('students');
        const families = read('families');
        const template = templates.find((row: { id: string }) => row.id === templateId);
        const acceptance = acceptances.find((row: { id: string }) => row.id === acceptanceId);
        const student = students.find((row: { id: string }) => row.id === acceptance?.studentId);
        const family = families.find((row: { id: string }) => row.id === acceptance?.familyId);
        const guardian = family?.guardians?.find((row: { id: string }) => row.id === acceptance?.guardianId);
        if (!template || !acceptance || acceptance.status !== 'PENDING') {
          return { status: 'error', code: 'TARGET_NOT_FOUND', message: 'This agreement request no longer exists.' };
        }
        return {
          status: 'success',
          target: {
            expiresAt: '2026-06-20T15:00:00.000Z',
            endpointLabel: `Enrollment agreement for ${student?.fullName ?? acceptance.studentId}`,
            template: {
              id: template.id,
              kind: template.kind,
              title: template.title,
              version: template.version,
              body: template.body,
              requiresGuardian: template.requiresGuardian,
            },
            acceptance: {
              id: acceptance.id,
              acceptanceId: acceptance.id,
              templateId: acceptance.templateId,
              templateVersion: acceptance.templateVersion,
              studentId: acceptance.studentId,
              familyId: acceptance.familyId,
              enrollmentId: acceptance.enrollmentId,
              guardianId: acceptance.guardianId,
              status: 'PENDING',
            },
            target: {
              label: [student?.fullName, family?.name, guardian?.fullName].filter(Boolean).join(' · '),
              studentId: acceptance.studentId,
              familyId: acceptance.familyId,
              enrollmentId: acceptance.enrollmentId,
              guardianId: acceptance.guardianId,
            },
          },
        };
      };

      window.__CADENZA_PUBLIC_AGREEMENT_SUBMIT__ = async ({ payload }) => {
        const key = collectionKey('agreementAcceptances');
        const acceptances = read('agreementAcceptances');
        const updated = acceptances.map((row: { id: string }) => row.id === acceptanceId
          ? {
              ...row,
              status: payload.action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
              acceptedAt: stamp,
              acceptedByName: payload.signer.fullName,
              signatureRef: `typed://agreement_acceptances/${acceptanceId}`,
              updatedAt: stamp,
              updatedBy: 'public-token',
            }
          : row);
        localStorage.setItem(key, JSON.stringify(updated));
        return {
          status: 'success',
          acceptanceId,
          acceptanceStatus: payload.action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
          submittedAt: stamp,
          message: payload.action === 'ACCEPT' ? 'Agreement accepted.' : 'Agreement declined.',
        };
      };
    },
    {
      orgId: TEST_ORG,
      token: PUBLIC_WORKFLOW_TOKEN,
      stamp: STAMP,
      templateId: ids.templateId,
      acceptanceId: ids.acceptanceId,
    },
  );
}

test.describe('Agreement signing and PDF capture', () => {
  test('admin request can be signed on mobile and clears contextual unsigned status', async ({ page }) => {
    await seedAgreementWorkflowBase(page);
    await loadApp(page);
    await gotoView(page, 'MANAGE');
    await page.getByRole('button', { name: 'Agreements' }).click();

    await page.getByRole('button', { name: 'New template' }).click();
    let dialog = page.getByRole('dialog', { name: 'New template' });
    await dialog.getByLabel('Kind').selectOption('ENROLLMENT');
    await dialog.getByLabel('Title').fill(`Workflow Enrollment Terms ${RUN_ID}`);
    await dialog.getByLabel('Template body').fill(`Workflow enrollment body ${RUN_ID}`);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(`Workflow Enrollment Terms ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText('Unsigned: 1').first()).toBeVisible();

    await page.getByRole('button', { name: 'Issue request' }).last().click();
    dialog = page.getByRole('dialog', { name: 'Issue request' });
    await dialog.getByLabel('Target type').selectOption('student');
    await dialog.locator('select').nth(2).selectOption({ label: `Workflow Student ${RUN_ID}` });
    await dialog.getByRole('button', { name: 'Issue', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(`Workflow Student ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText('Pending').first()).toBeVisible();

    const ids = await page.evaluate(({ title }) => {
      const templates = JSON.parse(localStorage.getItem(`cadenza:local:test-org:col:agreementTemplates`) || '[]');
      const acceptances = JSON.parse(localStorage.getItem(`cadenza:local:test-org:col:agreementAcceptances`) || '[]');
      const template = templates.find((row: { title: string }) => row.title === title);
      const acceptance = acceptances.find((row: { templateId: string }) => row.templateId === template?.id);
      if (!template || !acceptance) throw new Error('Expected issued agreement request to be persisted.');
      return { templateId: template.id as string, acceptanceId: acceptance.id as string };
    }, { title: `Workflow Enrollment Terms ${RUN_ID}` });

    await installLinkedPublicAgreementHarness(page, ids);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/agreement/${PUBLIC_WORKFLOW_TOKEN}`);

    await expect(page.locator('nav')).toHaveCount(0);
    await expect(page.getByTestId('public-agreement-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: `Workflow Enrollment Terms ${RUN_ID}` })).toBeVisible();
    await page.getByLabel('Signer full name').fill(`Workflow Guardian ${RUN_ID}`);
    await page.getByLabel(/I have read this agreement/).check();
    await page.getByRole('button', { name: 'Accept and sign' }).click();
    await expect(page.getByRole('status')).toContainText('Agreement accepted');
    await expect(page.getByText(ids.acceptanceId)).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 720 });
    await loadApp(page);
    await gotoView(page, 'MANAGE');
    await page.getByRole('button', { name: 'Agreements' }).click();
    await expect(page.getByText(`Workflow Enrollment Terms ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText('Accepted: 1').first()).toBeVisible();
    await expect(page.getByText('Unsigned: 0').first()).toBeVisible();
    await expect(page.getByText(`Workflow Guardian ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText(`typed://agreement_acceptances/${ids.acceptanceId}`).first()).toBeVisible();

    await gotoView(page, 'STUDENTS');
    await page.getByPlaceholder('Search by student, family, guardian, phone, or email...').fill(`Workflow Student ${RUN_ID}`);
    await page.getByText(`Workflow Student ${RUN_ID}`).first().click();
    await page.getByRole('tab', { name: 'Agreements' }).click();
    const agreementPanel = page.getByTestId('student-family-agreements-panel');
    await expect(agreementPanel.getByText(`Workflow Enrollment Terms ${RUN_ID}`)).toBeVisible();
    await expect(agreementPanel.getByText('Accepted').first()).toBeVisible();
    await expect(agreementPanel.getByText(`Workflow Guardian ${RUN_ID}`).first()).toBeVisible();
    await expect(agreementPanel.getByText(`typed://agreement_acceptances/${ids.acceptanceId}`).first()).toBeVisible();
    await expect(agreementPanel.getByTestId('student-family-unsigned-agreement-row')).toHaveCount(0);

    const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), collectionKey('agreementAcceptances'));
    expect(persisted.find((row: { id: string }) => row.id === ids.acceptanceId)).toMatchObject({
      status: 'ACCEPTED',
      acceptedByName: `Workflow Guardian ${RUN_ID}`,
      signatureRef: `typed://agreement_acceptances/${ids.acceptanceId}`,
    });
  });

  test('typed signing works on the public mobile agreement route', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installPublicAgreementHarness(page);
    await page.goto('/agreement/public-agreement-token-e2e');

    await expect(page.locator('nav')).toHaveCount(0);
    await expect(page.getByTestId('public-agreement-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enrollment agreement' })).toBeVisible();
    await expect(page.getByText('Public signing body for mobile agreement smoke.')).toBeVisible();

    await page.getByLabel('Signer full name').fill('Dana Cohen');
    await page.getByLabel(/I have read this agreement/).check();
    await page.getByRole('button', { name: 'Accept and sign' }).click();

    await expect(page.getByRole('status')).toContainText('Agreement accepted');
    await expect(page.getByText('agreement_acceptance_public_e2e')).toBeVisible();
  });

  test('admin captures a countersigned PDF reference on an agreement request', async ({ page }) => {
    await seedAgreementPdfCapture(page);
    await loadApp(page);
    await gotoView(page, 'MANAGE');
    await page.getByRole('button', { name: 'Agreements' }).click();

    await expect(page.getByText(`PDF Terms ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText(`PDF Student ${RUN_ID}`).first()).toBeVisible();
    await page.getByRole('button', { name: 'Capture PDF' }).click();

    const dialog = page.getByRole('dialog', { name: 'Countersigned PDF' });
    await dialog.getByLabel('Countersigned by').fill('Office Manager');
    await dialog.getByLabel('Private file/reference').fill(`private://documents/${TEST_ORG}/agreements/agreement_pdf_acceptance_${RUN_ID}/signed.pdf`);
    await dialog.getByRole('button', { name: 'Save PDF reference' }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByText('Accepted').first()).toBeVisible();
    await expect(page.getByText('Office Manager').first()).toBeVisible();
    await expect(page.getByText(`private://documents/${TEST_ORG}/agreements/agreement_pdf_acceptance_${RUN_ID}/signed.pdf`).first()).toBeVisible();

    const persisted = await page.evaluate((orgId) => JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:agreementAcceptances`) || '[]'), TEST_ORG);
    expect(persisted[0]).toMatchObject({
      status: 'ACCEPTED',
      acceptedByName: 'Office Manager',
      signatureRef: `private://documents/${TEST_ORG}/agreements/agreement_pdf_acceptance_${RUN_ID}/signed.pdf`,
    });
  });
});
