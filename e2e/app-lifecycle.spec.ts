import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);
const STAMP = '2026-06-21T09:00:00.000Z';

const COLLECTIONS = [
  'teachers',
  'rooms',
  'events',
  'ganttBlocks',
  'activities',
  'students',
  'families',
  'lessonRecords',
  'registrationIntake',
  'operationalRequests',
  'examSessions',
  'examinerSubmissions',
  'certificates',
  'reportCards',
  'concertPrograms',
  'hoursEntries',
  'hoursReports',
  'charges',
  'payments',
  'adjustments',
  'balanceSnapshots',
  'agreementTemplates',
  'agreementAcceptances',
  'instruments',
  'instrumentLoans',
  'reportDefinitions',
  'importSessions',
  'staffMembers',
  'teachingAssignments',
  'orgRoles',
  'enrollments',
  'l1Subcategories',
  'l2Subcategories',
  'eventParticipants',
  'adminInboxItems',
  'calendarSubscriptions',
];

async function captureCsvDownloads(page: Page) {
  await page.addInitScript(() => {
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (value: Blob | MediaSource) => {
      if (value instanceof Blob) {
        void value.text().then(text => {
          (window as any).__cadenzaLastCsv = text;
        });
      }
      return originalCreateObjectUrl(value);
    };
  });
}

async function seedLifecycleData(page: Page) {
  await page.addInitScript(
    ({ orgId, runId, stamp, collections }) => {
      const key = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
      for (const collection of collections) localStorage.removeItem(key(collection));
      localStorage.removeItem(`cadenza:local:${orgId}:cfg:settings`);
      localStorage.setItem('language', 'en-US');

      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const date = `${y}-${m}-${d}`;
      const eventStart = new Date(y, today.getMonth(), today.getDate(), 15, 0, 0).toISOString();
      const eventEnd = new Date(y, today.getMonth(), today.getDate(), 16, 0, 0).toISOString();

      const staffId = `life_staff_${runId}`;
      const studentId = `life_student_${runId}`;
      const familyId = `life_family_${runId}`;
      const guardianId = `life_guardian_${runId}`;
      const activityId = `life_activity_${runId}`;
      const roomId = `life_room_${runId}`;
      const eventId = `life_event_${runId}`;
      const agreementTemplateId = `life_agreement_template_${runId}`;
      const pendingAcceptanceId = `life_agreement_pending_${runId}`;
      const acceptedAcceptanceId = `life_agreement_accepted_${runId}`;
      const examSessionId = `life_exam_${runId}`;
      const certificateId = `life_certificate_${runId}`;
      const concertProgramId = `life_program_${runId}`;
      const chargeId = `life_charge_${runId}`;
      const paidChargeId = `life_paid_charge_${runId}`;

      localStorage.setItem(key('teachers'), JSON.stringify([{
        id: staffId,
        fullName: `Lifecycle Teacher ${runId}`,
        positions: ['Piano Teacher'],
        positionAssignments: [],
        tags: ['Lifecycle'],
        phone: '050-111-2222',
        email: `teacher.${runId}@example.test`,
        color: '#1f3a5f',
        payRate: 120,
      }]));
      localStorage.setItem(key('staffMembers'), JSON.stringify([{
        id: staffId,
        orgId,
        uid: `uid_${runId}`,
        role: 'STAFF',
        fullName: `Lifecycle Teacher ${runId}`,
        email: `teacher.${runId}@example.test`,
        phone: '050-111-2222',
        startDate: date,
        isArchived: false,
        createdAt: stamp,
        updatedAt: stamp,
        isFirstAdmin: false,
        onboardingDismissed: true,
        firstUseFlags: { activityHub: true, staffModule: true, eventCreation: true, enrollment: true },
        documents: [{ id: `staff_doc_${runId}`, name: 'Diploma', type: 'CERTIFICATE', date, notes: null, fileUrl: null, filePath: `${orgId}/staff/${staffId}/diploma.pdf` }],
      }]));
      localStorage.setItem(key('rooms'), JSON.stringify([{ id: roomId, orgId, name: `Lifecycle Room ${runId}`, capacity: 4, location: 'Main', isArchived: false }]));
      localStorage.setItem(key('activities'), JSON.stringify([{
        id: activityId,
        orgId,
        name: `Lifecycle Piano ${runId}`,
        template: 'DISCIPLINE',
        activityType: 'ACADEMIC',
        modules: { curriculum: true },
        location: 'Main',
        eventNameMode: 'AUTO',
        isArchived: false,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('l1Subcategories'), JSON.stringify([{ id: `life_l1_${runId}`, orgId, activityId, name: 'Private Lessons', isArchived: false, createdAt: stamp, updatedAt: stamp }]));
      localStorage.setItem(key('l2Subcategories'), JSON.stringify([{ id: `life_l2_${runId}`, orgId, activityId, l1Id: `life_l1_${runId}`, name: 'Level A', isArchived: false, createdAt: stamp, updatedAt: stamp }]));
      localStorage.setItem(key('teachingAssignments'), JSON.stringify([{
        id: `life_assignment_${runId}`,
        orgId,
        staffMemberId: staffId,
        activityId,
        l1Id: null,
        l2Id: `life_l2_${runId}`,
        scope: 'L2',
        startDate: date,
        endDate: null,
        isArchived: false,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('students'), JSON.stringify([{
        id: studentId,
        orgId,
        fullName: `Lifecycle Student ${runId}`,
        primaryInstrument: 'Piano',
        teacherId: staffId,
        status: 'ACTIVE',
        profileStatus: 'ACTIVE',
        dateOfBirth: '2014-01-01',
        isMinor: true,
        currentGrade: 6,
        governmentalId: '',
        phone: '',
        email: `student.${runId}@example.test`,
        guardians: [],
        assignments: [],
        pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
        notes: [],
        documents: [{ id: `student_pdf_${runId}`, label: 'ID PDF', url: `/documents/${studentId}/id.pdf`, uploadedAt: stamp, uploadedBy: 'admin' }],
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('families'), JSON.stringify([{
        id: familyId,
        orgId,
        name: `Lifecycle Family ${runId}`,
        guardians: [{ id: guardianId, fullName: `Lifecycle Guardian ${runId}`, relationship: 'PARENT', phone: '050-333-4444', email: `guardian.${runId}@example.test`, isPrimary: true }],
        studentIds: [studentId],
        primaryContactGuardianId: guardianId,
        billingNotes: 'Lifecycle billing note',
        isArchived: false,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('enrollments'), JSON.stringify([{
        id: `life_enrollment_${runId}`,
        orgId,
        studentId,
        activityId,
        l1Id: `life_l1_${runId}`,
        l2Id: `life_l2_${runId}`,
        status: 'ACTIVE',
        startDate: date,
        endDate: null,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('events'), JSON.stringify([{
        id: eventId,
        orgId,
        name: `Lifecycle Lesson ${runId}`,
        description: 'Lifecycle calendar event',
        teacherId: staffId,
        staffMemberIds: [staffId],
        roomId,
        activityId,
        start: eventStart,
        end: eventEnd,
        isCanceled: false,
        isHidden: false,
        tags: ['Lifecycle'],
        audit: { createdAt: stamp, updatedAt: stamp },
      }]));
      localStorage.setItem(key('lessonRecords'), JSON.stringify([{
        id: `life_lesson_record_${runId}`,
        orgId,
        eventId,
        studentId,
        staffMemberId: staffId,
        date,
        attendance: 'PRESENT',
        completion: 'COMPLETED',
        notes: 'Lifecycle attendance complete',
        repertoire: ['Bach Minuet'],
        homework: 'Scales',
        makeupOfLessonId: null,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('registrationIntake'), JSON.stringify([{
        id: `life_intake_${runId}`,
        orgId,
        status: 'IN_REVIEW',
        source: 'WEBSITE',
        submittedAt: stamp,
        applicantName: `Lifecycle Applicant ${runId}`,
        applicantEmail: `applicant.${runId}@example.test`,
        applicantPhone: '050-555-6666',
        studentFullName: `Lifecycle Intake Student ${runId}`,
        studentDateOfBirth: '2015-02-02',
        instrument: 'Violin',
        requestedActivityId: activityId,
        notes: 'Needs review',
        guardians: [],
        consentAccepted: true,
        consentAgreementId: agreementTemplateId,
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        duplicateOfStudentId: null,
        convertedStudentId: null,
        convertedEnrollmentId: null,
        statusHistory: [],
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('operationalRequests'), JSON.stringify([{
        id: `life_request_${runId}`,
        orgId,
        kind: 'ROOM_CHANGE',
        status: 'PENDING',
        requestedByStaffId: staffId,
        requestedFor: date,
        endDate: null,
        eventId,
        currentRoomId: roomId,
        requestedRoomId: roomId,
        reason: 'Lifecycle room request',
        createdAt: stamp,
        updatedAt: stamp,
        createdBy: staffId,
        updatedBy: staffId,
      }]));
      localStorage.setItem(key('adminInboxItems'), JSON.stringify([{
        id: `life_inbox_${runId}`,
        orgId,
        type: 'NOTIFICATION',
        status: 'OPEN',
        title: `Lifecycle inbox ${runId}`,
        message: 'Lifecycle item requiring admin review',
        createdAt: stamp,
      }]));
      localStorage.setItem(key('hoursEntries'), JSON.stringify([{
        id: `life_hours_submitted_${runId}`,
        orgId,
        staffMemberId: staffId,
        hoursReportId: null,
        date,
        reportedMinutes: 60,
        calendarMinutes: 60,
        eventId,
        teachingAssignmentId: `life_assignment_${runId}`,
        orgRoleId: null,
        rate: 120,
        status: 'SUBMITTED',
        note: 'Submitted lifecycle hour',
        createdAt: stamp,
        updatedAt: stamp,
      }, {
        id: `life_hours_approved_${runId}`,
        orgId,
        staffMemberId: staffId,
        hoursReportId: null,
        date,
        reportedMinutes: 30,
        calendarMinutes: 30,
        eventId: null,
        teachingAssignmentId: null,
        orgRoleId: null,
        rate: 120,
        status: 'APPROVED',
        note: 'Approved lifecycle hour',
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('charges'), JSON.stringify([{
        id: chargeId,
        orgId,
        studentId,
        familyId,
        enrollmentId: `life_enrollment_${runId}`,
        description: `Lifecycle tuition ${runId}`,
        amount: 500,
        currency: 'ILS',
        dueDate: date,
        status: 'OPEN',
        periodLabel: 'June 2026',
        createdAt: stamp,
        updatedAt: stamp,
      }, {
        id: paidChargeId,
        orgId,
        studentId,
        familyId,
        enrollmentId: null,
        description: `Lifecycle paid materials ${runId}`,
        amount: 75,
        currency: 'ILS',
        dueDate: date,
        status: 'PAID',
        periodLabel: 'June 2026',
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('payments'), JSON.stringify([{
        id: `life_payment_${runId}`,
        orgId,
        studentId,
        familyId,
        amount: 75,
        currency: 'ILS',
        method: 'TRANSFER',
        receivedAt: stamp,
        reference: `receipt-${runId}`,
        appliedChargeIds: [paidChargeId],
        note: null,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('agreementTemplates'), JSON.stringify([{
        id: agreementTemplateId,
        orgId,
        kind: 'ENROLLMENT',
        title: `Lifecycle Agreement ${runId}`,
        version: 1,
        body: `Lifecycle agreement body ${runId}`,
        isActive: true,
        supersedesVersion: null,
        requiresGuardian: true,
        createdAt: stamp,
        updatedAt: stamp,
        createdBy: 'admin',
        updatedBy: 'admin',
      }]));
      localStorage.setItem(key('agreementAcceptances'), JSON.stringify([{
        id: pendingAcceptanceId,
        orgId,
        templateId: agreementTemplateId,
        templateVersion: 1,
        studentId,
        familyId,
        enrollmentId: null,
        guardianId,
        status: 'PENDING',
        acceptedAt: null,
        acceptedByName: null,
        signatureRef: null,
        createdAt: stamp,
        updatedAt: stamp,
        createdBy: 'admin',
        updatedBy: 'admin',
      }, {
        id: acceptedAcceptanceId,
        orgId,
        templateId: agreementTemplateId,
        templateVersion: 1,
        studentId,
        familyId,
        enrollmentId: null,
        guardianId,
        status: 'ACCEPTED',
        acceptedAt: stamp,
        acceptedByName: `Lifecycle Guardian ${runId}`,
        signatureRef: `typed://agreement_acceptances/${acceptedAcceptanceId}`,
        createdAt: stamp,
        updatedAt: stamp,
        createdBy: 'admin',
        updatedBy: 'admin',
      }]));
      localStorage.setItem(key('examSessions'), JSON.stringify([{
        id: examSessionId,
        orgId,
        name: `Lifecycle Exam ${runId}`,
        activityId,
        date,
        status: 'GRADED',
        examinerStaffIds: [staffId],
        studentIds: [studentId],
        notes: 'Lifecycle exam complete',
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('examinerSubmissions'), JSON.stringify([{
        id: `life_exam_submission_${runId}`,
        orgId,
        examSessionId,
        studentId,
        examinerStaffId: staffId,
        score: 92,
        grade: 'A',
        remarks: 'Strong exam',
        submittedAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('certificates'), JSON.stringify([{
        id: certificateId,
        orgId,
        studentId,
        examSessionId,
        title: `Lifecycle Certificate ${runId}`,
        level: 'Level A',
        status: 'ISSUED',
        issuedAt: stamp,
        documentUrl: null,
        documentPath: `${orgId}/assessments/${certificateId}/certificate.pdf`,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('reportCards'), JSON.stringify([{
        id: `life_report_card_${runId}`,
        orgId,
        studentId,
        periodLabel: '2026 Spring',
        activityId,
        lines: [{ subject: 'Piano', grade: 'A', comment: 'Lifecycle report card' }],
        summary: 'Ready for next level',
        publishedAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('concertPrograms'), JSON.stringify([{
        id: concertProgramId,
        orgId,
        eventId,
        activityId,
        title: `Lifecycle Concert Program ${runId}`,
        date,
        venue: 'Main Hall',
        status: 'PUBLISHED',
        notes: 'Lifecycle concert PDF export path',
        pieces: [{ order: 1, title: 'Minuet', composer: 'Bach', performerStudentIds: [studentId], performerStaffIds: [staffId], durationMinutes: 4 }],
        createdAt: stamp,
        updatedAt: stamp,
        createdBy: 'admin',
        updatedBy: 'admin',
      }]));
      localStorage.setItem(key('instruments'), JSON.stringify([{
        id: `life_instrument_${runId}`,
        orgId,
        name: `Lifecycle Violin ${runId}`,
        serialNumber: `SN-${runId}`,
        status: 'LOANED',
        assignedStudentId: studentId,
        assignedStaffId: null,
        createdAt: stamp,
        updatedAt: stamp,
      }]));
      localStorage.setItem(key('reportDefinitions'), JSON.stringify([{
        id: `life_report_${runId}`,
        orgId,
        name: `Lifecycle Charges ${runId}`,
        description: 'Lifecycle charge report',
        sourceEntity: 'charges',
        filters: [{ field: 'status', op: 'neq', value: 'VOID' }],
        groupBy: 'status',
        aggregate: { fn: 'sum', field: 'amount' },
        columns: ['id', 'status', 'amount'],
        isPinned: true,
        createdAt: stamp,
        updatedAt: stamp,
        createdBy: 'admin',
        updatedBy: 'admin',
      }]));
      localStorage.setItem(key('importSessions'), JSON.stringify([{
        id: `life_import_${runId}`,
        orgId,
        createdBy: 'admin',
        entityType: 'STUDENT',
        status: 'COMPLETED_WITH_ERRORS',
        fileName: `lifecycle-students-${runId}.csv`,
        totalRows: 3,
        importedRows: 2,
        skippedRows: 1,
        rowResults: [{ rowIndex: 3, status: 'ERROR', rawData: { name: 'Duplicate' }, resolvedData: null, errorMessage: 'Duplicate student', duplicateOf: studentId, duplicateAction: 'SKIP', autoCreated: null }],
        createdAt: { seconds: 1782032400, nanoseconds: 0 },
        updatedAt: { seconds: 1782032700, nanoseconds: 0 },
      }]));
    },
    { orgId: TEST_ORG, runId: RUN_ID, stamp: STAMP, collections: COLLECTIONS },
  );
}

test.describe('Current app lifecycle coverage', () => {
  test('represents the active workflows and lifecycle states across app surfaces', async ({ page }) => {
    await seedLifecycleData(page);
    await loadApp(page);

    await expect(page.getByText(`Lifecycle Lesson ${RUN_ID}`).first()).toBeVisible();

    await gotoView(page, 'ADMIN_INBOX');
    await expect(page.getByTestId('operations-summary')).toBeVisible();
    await expect(page.getByText(`Lifecycle inbox ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByTestId('registration-intake-review')).toContainText(`Lifecycle Intake Student ${RUN_ID}`);
    await expect(page.getByTestId('operational-request-review')).toContainText('Room change');

    await gotoView(page, 'STUDENTS');
    await page.getByPlaceholder('Search by student, family, guardian, phone, or email...').fill(`Lifecycle Student ${RUN_ID}`);
    await page.getByText(`Lifecycle Student ${RUN_ID}`).first().click();
    await expect(page.getByTestId('student-family-detail-panel')).toContainText(`Lifecycle Family ${RUN_ID}`);
    await page.getByRole('tab', { name: 'Lessons' }).click();
    await expect(page.getByTestId('student-family-lesson-history-row')).toContainText('Present');
    await page.getByRole('tab', { name: 'Agreements' }).click();
    await expect(page.getByTestId('student-family-agreements-panel')).toContainText(`Lifecycle Agreement ${RUN_ID}`);
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByTestId('student-family-assessment-history')).toContainText(`Lifecycle Certificate ${RUN_ID}`);
    await page.getByRole('tab', { name: 'Finance' }).click();
    await expect(page.getByTestId('student-family-finance-panel')).toContainText(`life_charge_${RUN_ID}`);

    await gotoView(page, 'PAYROLL');
    await expect(page.getByRole('heading', { name: 'Payroll Hours' })).toBeVisible();
    await page.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByRole('heading', { name: 'Payroll Review' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`Lifecycle Teacher ${RUN_ID}`) })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`Lifecycle Teacher ${RUN_ID}`) })).toContainText('Approved');
    const hourStatuses = await page.evaluate(({ orgId }) => (
      JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:hoursEntries`) || '[]')
        .map((row: { status: string }) => row.status)
    ), { orgId: TEST_ORG });
    expect(hourStatuses).toEqual(expect.arrayContaining(['SUBMITTED', 'APPROVED']));

    await gotoView(page, 'BILLING');
    await expect(page.getByTestId('finance-workspace')).toBeVisible();
    await expect(page.getByText(`Lifecycle Family ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByTestId('finance-family-detail')).toContainText(`Lifecycle tuition ${RUN_ID}`);

    await gotoView(page, 'MANAGE');
    await page.getByRole('button', { name: 'Agreements' }).click();
    await expect(page.getByText(`Lifecycle Agreement ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText('Pending').first()).toBeVisible();
    await expect(page.getByText('Accepted').first()).toBeVisible();
    await page.getByRole('button', { name: 'Assessments' }).click();
    await expect(page.getByTestId('assessment-workspace')).toContainText(`Lifecycle Exam ${RUN_ID}`);
    await expect(page.getByTestId('assessment-workspace')).toContainText(`Lifecycle Certificate ${RUN_ID}`);
    await page.getByRole('button', { name: 'Activities' }).click();
    await expect(page.getByText(`Lifecycle Piano ${RUN_ID}`).first()).toBeVisible();
  });

  test('exports lifecycle reports as CSV', async ({ page }) => {
    await captureCsvDownloads(page);
    await seedLifecycleData(page);
    await page.goto(`/${TEST_ORG}/analytics`);
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 15_000 });

    await expect(page.getByTestId('reports-workspace')).toBeVisible();
    await page.getByTestId(`report-library-row-life_report_${RUN_ID}`).click();
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByText('Results').last()).toBeVisible();
    await page.getByRole('button', { name: 'Export CSV' }).click();

    await expect.poll(async () => page.evaluate(() => (window as any).__cadenzaLastCsv || '')).toContain(`life_charge_${RUN_ID}`);
    const csv = await page.evaluate(() => (window as any).__cadenzaLastCsv as string);
    expect(csv).toContain('id,status,amount');
    expect(csv).toContain(`life_paid_charge_${RUN_ID}`);
  });

  test('captures private PDF evidence and exposes concert PDF references', async ({ page }) => {
    await seedLifecycleData(page);
    await loadApp(page);
    await gotoView(page, 'MANAGE');

    await page.getByRole('button', { name: 'Agreements' }).click();
    await expect(page.getByText(`Lifecycle Agreement ${RUN_ID}`).first()).toBeVisible();
    await page.getByRole('button', { name: 'Capture PDF' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Countersigned PDF' });
    await dialog.getByLabel('Countersigned by').fill('Lifecycle Office');
    await dialog.getByLabel('Private file/reference').fill(`private://documents/${TEST_ORG}/agreements/life_agreement_pending_${RUN_ID}/signed.pdf`);
    await dialog.getByRole('button', { name: 'Save PDF reference' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(`private://documents/${TEST_ORG}/agreements/life_agreement_pending_${RUN_ID}/signed.pdf`).first()).toBeVisible();

    await page.getByRole('button', { name: 'Activities' }).click();
    await page.getByRole('button', { name: 'Rosters' }).click();
    await page.getByText(`Lifecycle Piano ${RUN_ID}`).first().click();
    await expect(page.getByTestId('concert-program-planner')).toContainText(`Lifecycle Concert Program ${RUN_ID}`);
    await expect(page.getByTestId('concert-program-planner')).toContainText(`private://documents/${TEST_ORG}/concert-programs/life_program_${RUN_ID}/program.pdf`);

    const persisted = await page.evaluate(({ orgId, runId }) => {
      const rows = JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:agreementAcceptances`) || '[]');
      return rows.find((row: { id: string }) => row.id === `life_agreement_pending_${runId}`);
    }, { orgId: TEST_ORG, runId: RUN_ID });
    expect(persisted).toMatchObject({
      status: 'ACCEPTED',
      acceptedByName: 'Lifecycle Office',
      signatureRef: `private://documents/${TEST_ORG}/agreements/life_agreement_pending_${RUN_ID}/signed.pdf`,
    });
  });
});
