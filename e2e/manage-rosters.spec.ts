import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);

async function resetRosterData(page: Page) {
  await page.addInitScript(
    ({ orgId, runId }) => {
      [
        'activities',
        'l2Subcategories',
        'enrollments',
        'teachingAssignments',
        'students',
        'teachers',
      ].forEach(collection => {
        localStorage.removeItem(`cadenza:local:${orgId}:col:${collection}`);
      });
      localStorage.removeItem(`cadenza:local:${orgId}:cfg:settings`);
      localStorage.setItem('language', 'en-US');

      const now = '2026-06-19T09:00:00.000Z';
      localStorage.setItem(`cadenza:local:${orgId}:col:students`, JSON.stringify([
        {
          id: `roster_student_a_${runId}`,
          orgId,
          fullName: `Roster Student A ${runId}`,
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
        {
          id: `roster_student_b_${runId}`,
          orgId,
          fullName: `Roster Student B ${runId}`,
          dateOfBirth: '2015-01-01',
          isMinor: true,
          currentGrade: 5,
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
      localStorage.setItem(`cadenza:local:${orgId}:col:teachers`, JSON.stringify([
        {
          id: `roster_teacher_a_${runId}`,
          fullName: `Roster Teacher A ${runId}`,
          positions: [],
          positionAssignments: [],
          tags: [],
          phone: '',
          email: `teacher.a.${runId}@example.test`,
          color: '#1d4ed8',
          isArchived: false,
        },
        {
          id: `roster_teacher_b_${runId}`,
          fullName: `Roster Teacher B ${runId}`,
          positions: [],
          positionAssignments: [],
          tags: [],
          phone: '',
          email: `teacher.b.${runId}@example.test`,
          color: '#7f1d1d',
          isArchived: false,
        },
      ]));
    },
    { orgId: TEST_ORG, runId: RUN_ID },
  );
}

test.describe('Manage roster programs', () => {
  test('admin creates, edits source-linked roster records, and archives the program', async ({ page }) => {
    await resetRosterData(page);
    await loadApp(page);
    await gotoView(page, 'MANAGE');
    await page.getByRole('button', { name: 'Activities' }).click();
    await page.getByRole('button', { name: 'Rosters' }).click();

    await expect(page.getByTestId('roster-program-workspace')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No roster programs found' })).toBeVisible();

    await page.getByRole('button', { name: 'New roster' }).click();
    const dialog = page.getByRole('dialog', { name: 'New roster' });
    await dialog.locator('select').first().selectOption('ENSEMBLE');
    await dialog.getByLabel('Activity Name').fill(`E2E Ensemble ${RUN_ID}`);
    await dialog.getByLabel('Default Location').fill('Studio A');
    await dialog.getByLabel('Initial group').fill('Main group');
    await dialog.getByLabel('Initial staff').selectOption({ label: `Roster Teacher A ${RUN_ID}` });
    await dialog.getByLabel(`Roster Student A ${RUN_ID}`).check();
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(`E2E Ensemble ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText(`Roster Student A ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText(`Roster Teacher A ${RUN_ID}`).first()).toBeVisible();
    await expect(page.getByText('Activity:').first()).toBeVisible();
    await expect(page.getByText('Enrollments:').first()).toBeVisible();
    await expect(page.getByText('Teaching assignments:').first()).toBeVisible();

    await page.getByRole('combobox').filter({ hasText: 'Choose student' }).selectOption({ label: `Roster Student B ${RUN_ID}` });
    await page.getByRole('button', { name: 'Add student' }).click();
    await expect(page.getByText(`Roster Student B ${RUN_ID}`).first()).toBeVisible();

    await page.getByRole('combobox').filter({ hasText: 'Choose staff' }).selectOption({ label: `Roster Teacher B ${RUN_ID}` });
    await page.getByRole('button', { name: 'Add staff' }).click();
    await expect(page.getByText(`Roster Teacher B ${RUN_ID}`).first()).toBeVisible();

    await page.getByRole('button', { name: 'Archive program' }).click();
    await expect(page.getByRole('button', { name: new RegExp(`E2E Ensemble ${RUN_ID}.*Archived`) })).toBeVisible();
  });

  test('teacher reaches assigned roster from a mobile calendar event with only prepared attendance rows linked', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      ({ orgId, runId }) => {
        const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
        [
          'activities',
          'l2Subcategories',
          'enrollments',
          'teachingAssignments',
          'students',
          'teachers',
          'staffMembers',
          'events',
          'rooms',
          'lessonRecords',
        ].forEach(collection => {
          localStorage.removeItem(collectionKey(collection));
        });
        localStorage.setItem('language', 'en-US');
        const now = '2026-06-19T09:00:00.000Z';
        const stamp = { seconds: 0, nanoseconds: 0 };
        const eventStart = new Date();
        eventStart.setHours(10, 0, 0, 0);
        const eventEnd = new Date(eventStart);
        eventEnd.setHours(11, 0, 0, 0);
        const date = eventStart.toISOString().slice(0, 10);
        const teacherId = `roster_teacher_mobile_${runId}`;
        const activityId = `roster_activity_mobile_${runId}`;
        const l2Id = `roster_l2_mobile_${runId}`;
        const preparedStudentId = `roster_mobile_prepared_${runId}`;
        const unpreparedStudentId = `roster_mobile_unprepared_${runId}`;

        localStorage.setItem(collectionKey('teachers'), JSON.stringify([
          {
            id: teacherId,
            fullName: `Mobile Roster Teacher ${runId}`,
            positions: [],
            positionAssignments: [],
            tags: [],
            phone: '',
            email: 'e2e@cadenza.test',
            color: '#7f1d1d',
            isArchived: false,
          },
        ]));
        localStorage.setItem(collectionKey('staffMembers'), JSON.stringify([
          {
            id: teacherId,
            orgId,
            uid: 'e2e-uid',
            role: 'STAFF',
            fullName: `Mobile Roster Teacher ${runId}`,
            email: 'e2e@cadenza.test',
            phone: null,
            startDate: null,
            isArchived: false,
            createdAt: stamp,
            updatedAt: stamp,
            isFirstAdmin: false,
            onboardingDismissed: false,
            firstUseFlags: { activityHub: true, staffModule: true, eventCreation: true, enrollment: true },
            documents: [],
          },
        ]));
        localStorage.setItem(collectionKey('rooms'), JSON.stringify([
          { id: `roster_room_mobile_${runId}`, name: 'Studio R', itinerary: '' },
        ]));
        localStorage.setItem(collectionKey('activities'), JSON.stringify([
          {
            id: activityId,
            orgId,
            name: `Mobile Ensemble ${runId}`,
            template: 'ENSEMBLE',
            activityType: 'PERFORMANCES',
            modules: { curriculum: true },
            location: 'Studio R',
            eventNameMode: 'PROMPTED',
            isArchived: false,
            createdAt: stamp,
            updatedAt: stamp,
          },
        ]));
        localStorage.setItem(collectionKey('l2Subcategories'), JSON.stringify([
          {
            id: l2Id,
            orgId,
            activityId,
            l1Id: null,
            name: 'Main group',
            isArchived: false,
            createdAt: stamp,
            updatedAt: stamp,
          },
        ]));
        localStorage.setItem(collectionKey('students'), JSON.stringify([
          {
            id: preparedStudentId,
            orgId,
            fullName: `Prepared Roster Student ${runId}`,
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
            isArchived: false,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: unpreparedStudentId,
            orgId,
            fullName: `Unprepared Roster Student ${runId}`,
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
            isArchived: false,
            createdAt: now,
            updatedAt: now,
          },
        ]));
        localStorage.setItem(collectionKey('enrollments'), JSON.stringify([
          {
            id: `roster_enrollment_prepared_${runId}`,
            orgId,
            studentId: preparedStudentId,
            activityId,
            l2Id,
            startDate: date,
            endDate: null,
            status: 'ACTIVE',
            createdAt: stamp,
            updatedAt: stamp,
          },
          {
            id: `roster_enrollment_unprepared_${runId}`,
            orgId,
            studentId: unpreparedStudentId,
            activityId,
            l2Id,
            startDate: date,
            endDate: null,
            status: 'ACTIVE',
            createdAt: stamp,
            updatedAt: stamp,
          },
        ]));
        localStorage.setItem(collectionKey('teachingAssignments'), JSON.stringify([
          {
            id: `roster_assignment_mobile_${runId}`,
            orgId,
            staffMemberId: teacherId,
            activityId,
            scope: 'L2',
            l1Id: null,
            l2Id,
            startDate: date,
            endDate: null,
            isArchived: false,
            createdAt: stamp,
            updatedAt: stamp,
          },
        ]));
        localStorage.setItem(collectionKey('events'), JSON.stringify([
          {
            id: `event_roster_mobile_${runId}`,
            orgId,
            name: `Mobile Roster Lesson ${runId}`,
            description: 'Teacher roster read',
            teacherId,
            staffMemberIds: [teacherId],
            roomId: `roster_room_mobile_${runId}`,
            activityId,
            l1Id: null,
            l2Id,
            location: 'Studio R',
            date,
            startTime: '10:00',
            endTime: '11:00',
            durationMinutes: 60,
            status: 'SCHEDULED',
            start: eventStart.toISOString(),
            end: eventEnd.toISOString(),
            isCanceled: false,
            isHidden: false,
            tags: [],
            createdAt: stamp,
            updatedAt: stamp,
          },
        ]));
        localStorage.setItem(collectionKey('lessonRecords'), JSON.stringify([
          {
            id: `lesson_roster_prepared_${runId}`,
            orgId,
            eventId: `event_roster_mobile_${runId}`,
            studentId: preparedStudentId,
            staffMemberId: teacherId,
            date,
            attendance: 'UNMARKED',
            completion: 'PENDING',
            notes: null,
            repertoire: [],
            homework: null,
            makeupOfLessonId: null,
            createdAt: now,
            updatedAt: now,
          },
        ]));
      },
      { orgId: TEST_ORG, runId: RUN_ID },
    );

    await loadApp(page);
    await page.locator(`[data-event-id="event_roster_mobile_${RUN_ID}"]`).click();

    const rosterPanel = page.getByTestId('teacher-roster-panel');
    await expect(rosterPanel).toBeVisible();
    await expect(rosterPanel.getByText(`Mobile Ensemble ${RUN_ID}`)).toBeVisible();
    await expect(rosterPanel.getByTestId('teacher-roster-row')).toHaveCount(2);
    await expect(rosterPanel.getByTestId('roster-attendance-link')).toHaveCount(1);
    await expect(rosterPanel.getByTestId('roster-attendance-missing')).toHaveCount(1);
    await expect(page.getByTestId('event-attendance-panel').getByTestId('attendance-lesson-row')).toHaveCount(1);

    const persistedLessons = await page.evaluate(({ orgId }) => (
      JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:lessonRecords`) || '[]')
    ), { orgId: TEST_ORG });
    expect(persistedLessons).toHaveLength(1);
  });
});
