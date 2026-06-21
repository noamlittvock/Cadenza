import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);

async function seedConcertPlanningData(page: Page) {
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
        'rooms',
        'events',
        'concertPrograms',
      ].forEach(collection => localStorage.removeItem(collectionKey(collection)));
      localStorage.removeItem(`cadenza:local:${orgId}:cfg:settings`);
      localStorage.setItem('language', 'en-US');

      const now = '2026-06-19T09:00:00.000Z';
      const stamp = { seconds: 0, nanoseconds: 0 };
      const start = new Date();
      start.setHours(10, 0, 0, 0);
      const end = new Date(start);
      end.setHours(12, 0, 0, 0);
      const date = start.toISOString().slice(0, 10);
      const activityId = `concert_activity_${runId}`;
      const l2Id = `concert_l2_${runId}`;
      const studentId = `concert_student_${runId}`;
      const teacherId = `concert_teacher_${runId}`;
      const eventId = `concert_event_${runId}`;

      localStorage.setItem(collectionKey('teachers'), JSON.stringify([
        {
          id: teacherId,
          fullName: `Concert Teacher ${runId}`,
          positions: [],
          positionAssignments: [],
          tags: [],
          phone: '',
          email: `concert.teacher.${runId}@example.test`,
          color: '#7f1d1d',
          isArchived: false,
        },
      ]));
      localStorage.setItem(collectionKey('staffMembers'), JSON.stringify([
        {
          id: teacherId,
          orgId,
          uid: 'e2e-uid',
          role: 'ADMIN',
          fullName: `Concert Teacher ${runId}`,
          email: `concert.teacher.${runId}@example.test`,
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
      localStorage.setItem(collectionKey('rooms'), JSON.stringify([
        { id: `concert_room_${runId}`, name: 'Recital Hall', itinerary: '' },
      ]));
      localStorage.setItem(collectionKey('activities'), JSON.stringify([
        {
          id: activityId,
          orgId,
          name: `Private Performance Program ${runId}`,
          template: 'ENSEMBLE',
          activityType: 'PERFORMANCES',
          modules: { curriculum: true },
          location: 'Recital Hall',
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
          id: studentId,
          orgId,
          fullName: `Concert Student ${runId}`,
          dateOfBirth: '2013-01-01',
          isMinor: true,
          currentGrade: 7,
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
      localStorage.setItem(collectionKey('enrollments'), JSON.stringify([
        {
          id: `concert_enrollment_${runId}`,
          orgId,
          studentId,
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
          id: `concert_assignment_${runId}`,
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
          id: eventId,
          orgId,
          name: `Private Showcase ${runId}`,
          description: 'Private concert planning smoke',
          teacherId,
          staffMemberIds: [teacherId],
          roomId: `concert_room_${runId}`,
          activityId,
          l1Id: null,
          l2Id,
          location: 'Recital Hall',
          date,
          startTime: '10:00',
          endTime: '12:00',
          durationMinutes: 120,
          status: 'SCHEDULED',
          start: start.toISOString(),
          end: end.toISOString(),
          isCanceled: false,
          isHidden: false,
          tags: ['concert'],
          createdAt: stamp,
          updatedAt: stamp,
        },
      ]));
      localStorage.setItem(collectionKey('concertPrograms'), JSON.stringify([]));
    },
    { orgId: TEST_ORG, runId: RUN_ID },
  );
}

test.describe('Concert program private planning', () => {
  test('admin creates private program pieces from Activity workspace and sees them on Calendar event detail', async ({ page }) => {
    await seedConcertPlanningData(page);
    await loadApp(page);
    await gotoView(page, 'MANAGE');
    await page.getByRole('button', { name: 'Activities' }).click();
    await page.getByRole('button', { name: 'Rosters' }).click();

    await page.getByRole('button', { name: new RegExp(`Private Performance Program ${RUN_ID}`) }).click();
    const planner = page.getByTestId('concert-program-planner');
    await expect(planner).toBeVisible();
    await expect(planner.getByText('Public output blocked')).toBeVisible();

    await planner.getByRole('button', { name: 'Create program' }).click();
    await planner.getByRole('textbox', { name: 'Title', exact: true }).fill(`Private Concert Run ${RUN_ID}`);
    await planner.getByLabel('Venue').fill('Recital Hall');
    await planner.getByLabel('Status').selectOption('PUBLISHED');
    await planner.getByRole('button', { name: 'Save program' }).click();

    await planner.getByLabel('Piece title').fill(`Nocturne ${RUN_ID}`);
    await planner.getByLabel('Composer').fill('F. Chopin');
    await planner.getByLabel('Duration').fill('7');
    await planner.getByLabel('Student performer').selectOption({ label: `Concert Student ${RUN_ID}` });
    await planner.getByLabel('Staff performer').selectOption({ label: `Concert Teacher ${RUN_ID}` });
    await planner.getByRole('button', { name: 'Add piece' }).click();

    await expect(planner.locator('tbody').getByText(`Nocturne ${RUN_ID}`).first()).toBeVisible();
    await expect(planner.locator('tbody').getByText(`Concert Student ${RUN_ID}`).first()).toBeVisible();
    await planner.getByRole('button', { name: 'Prepare export ref' }).click();
    await expect(planner.getByText('Private reference prepared')).toBeVisible();

    await gotoView(page, 'CALENDAR');
    await page.locator(`[data-event-id="concert_event_${RUN_ID}"]`).click();
    const detailPlanner = page.getByTestId('concert-program-planner');
    await expect(detailPlanner.getByText(`Private Concert Run ${RUN_ID}`).first()).toBeVisible();
    await expect(detailPlanner.getByText(`Nocturne ${RUN_ID}`).first()).toBeVisible();
    await expect(detailPlanner.getByText('Media release review required').first()).toBeVisible();

    const persisted = await page.evaluate(({ orgId }) => (
      JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:concertPrograms`) || '[]')
    ), { orgId: TEST_ORG });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].status).toBe('PUBLISHED');
    expect(persisted[0].pieces).toHaveLength(1);
  });

  test('teacher opens mobile own run-of-show from Calendar and sees unrelated event denied', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      ({ orgId, runId }) => {
        sessionStorage.setItem('e2e_role_sim', JSON.stringify({
          role: 'VIEWER',
          isFirstAdmin: false,
          setupGateCleared: true,
          onboardingDismissed: true,
          label: 'Viewer (Read-Only)',
        }));
        const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
        [
          'activities',
          'l2Subcategories',
          'enrollments',
          'teachingAssignments',
          'students',
          'teachers',
          'staffMembers',
          'rooms',
          'events',
          'concertPrograms',
        ].forEach(collection => localStorage.removeItem(collectionKey(collection)));
        localStorage.setItem('language', 'en-US');

        const now = '2026-06-19T09:00:00.000Z';
        const stamp = { seconds: 0, nanoseconds: 0 };
        const start = new Date();
        start.setHours(10, 0, 0, 0);
        const end = new Date(start);
        end.setHours(11, 0, 0, 0);
        const otherStart = new Date(start);
        otherStart.setHours(13, 0, 0, 0);
        const otherEnd = new Date(otherStart);
        otherEnd.setHours(14, 0, 0, 0);
        const date = start.toISOString().slice(0, 10);
        const teacherId = `concert_teacher_mobile_${runId}`;
        const otherTeacherId = `concert_teacher_other_${runId}`;
        const studentId = `concert_student_mobile_${runId}`;
        const activityId = `concert_activity_mobile_${runId}`;
        const l2Id = `concert_l2_mobile_${runId}`;
        const eventId = `concert_event_mobile_${runId}`;
        const otherEventId = `concert_event_other_${runId}`;

        localStorage.setItem(collectionKey('teachers'), JSON.stringify([
          {
            id: teacherId,
            fullName: `Mobile Concert Teacher ${runId}`,
            positions: [],
            positionAssignments: [],
            tags: [],
            phone: '',
            email: 'e2e@cadenza.test',
            color: '#7f1d1d',
            isArchived: false,
          },
          {
            id: otherTeacherId,
            fullName: `Other Concert Teacher ${runId}`,
            positions: [],
            positionAssignments: [],
            tags: [],
            phone: '',
            email: `other.concert.${runId}@example.test`,
            color: '#1f3a5f',
            isArchived: false,
          },
        ]));
        localStorage.setItem(collectionKey('staffMembers'), JSON.stringify([
          {
            id: teacherId,
            orgId,
            uid: 'e2e-uid',
            role: 'STAFF',
            fullName: `Mobile Concert Teacher ${runId}`,
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
          {
            id: otherTeacherId,
            orgId,
            uid: `other-${runId}`,
            role: 'STAFF',
            fullName: `Other Concert Teacher ${runId}`,
            email: `other.concert.${runId}@example.test`,
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
        localStorage.setItem(collectionKey('rooms'), JSON.stringify([
          { id: `concert_room_mobile_${runId}`, name: 'Mobile Hall', itinerary: '' },
        ]));
        localStorage.setItem(collectionKey('activities'), JSON.stringify([
          {
            id: activityId,
            orgId,
            name: `Mobile Performance ${runId}`,
            template: 'ENSEMBLE',
            activityType: 'PERFORMANCES',
            modules: { curriculum: true },
            location: 'Mobile Hall',
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
            id: studentId,
            orgId,
            fullName: `Mobile Concert Student ${runId}`,
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
        localStorage.setItem(collectionKey('events'), JSON.stringify([
          {
            id: eventId,
            orgId,
            name: `Mobile Concert Own ${runId}`,
            description: 'Teacher-owned run-of-show',
            teacherId,
            staffMemberIds: [teacherId],
            roomId: `concert_room_mobile_${runId}`,
            activityId,
            l1Id: null,
            l2Id,
            location: 'Mobile Hall',
            date,
            startTime: '10:00',
            endTime: '11:00',
            durationMinutes: 60,
            status: 'SCHEDULED',
            start: start.toISOString(),
            end: end.toISOString(),
            isCanceled: false,
            isHidden: false,
            tags: ['concert'],
            createdAt: stamp,
            updatedAt: stamp,
          },
          {
            id: otherEventId,
            orgId,
            name: `Mobile Concert Other ${runId}`,
            description: 'Unrelated run-of-show',
            teacherId: otherTeacherId,
            staffMemberIds: [otherTeacherId],
            roomId: `concert_room_mobile_${runId}`,
            activityId,
            l1Id: null,
            l2Id,
            location: 'Mobile Hall',
            date,
            startTime: '13:00',
            endTime: '14:00',
            durationMinutes: 60,
            status: 'SCHEDULED',
            start: otherStart.toISOString(),
            end: otherEnd.toISOString(),
            isCanceled: false,
            isHidden: false,
            tags: ['concert'],
            createdAt: stamp,
            updatedAt: stamp,
          },
        ]));
        localStorage.setItem(collectionKey('concertPrograms'), JSON.stringify([
          {
            id: `concert_program_mobile_${runId}`,
            orgId,
            title: `Mobile Private Run ${runId}`,
            eventId,
            date,
            venue: 'Mobile Hall',
            status: 'PUBLISHED',
            notes: 'Teacher read-only smoke',
            pieces: [
              {
                order: 1,
                title: `Mobile Nocturne ${runId}`,
                composer: 'F. Chopin',
                performerStudentIds: [studentId],
                performerStaffIds: [teacherId],
                durationMinutes: 6,
              },
            ],
            createdAt: now,
            updatedAt: now,
            createdBy: 'admin',
            updatedBy: 'admin',
          },
          {
            id: `concert_program_other_${runId}`,
            orgId,
            title: `Other Private Run ${runId}`,
            eventId: otherEventId,
            date,
            venue: 'Mobile Hall',
            status: 'PUBLISHED',
            notes: 'Should be denied to current teacher',
            pieces: [
              {
                order: 1,
                title: `Other Etude ${runId}`,
                composer: null,
                performerStudentIds: [],
                performerStaffIds: [otherTeacherId],
                durationMinutes: 5,
              },
            ],
            createdAt: now,
            updatedAt: now,
            createdBy: 'admin',
            updatedBy: 'admin',
          },
        ]));
      },
      { orgId: TEST_ORG, runId: RUN_ID },
    );

    await loadApp(page);
    await page.locator(`[data-event-id="concert_event_mobile_${RUN_ID}"]`).click();

    const ownPlanner = page.getByTestId('concert-program-planner');
    await expect(ownPlanner).toBeVisible();
    await expect(ownPlanner.getByText(`Mobile Private Run ${RUN_ID}`).first()).toBeVisible();
    await expect(ownPlanner.getByText(`Mobile Nocturne ${RUN_ID}`).first()).toBeVisible();
    await expect(ownPlanner.getByText(`Mobile Concert Student ${RUN_ID}`).first()).toBeVisible();
    await expect(ownPlanner.getByRole('button', { name: 'Create program' })).not.toBeVisible();
    await expect(ownPlanner.getByRole('button', { name: 'Prepare export ref' })).not.toBeVisible();
    await page.getByLabel('Close').click();

    await page.locator(`[data-event-id="concert_event_other_${RUN_ID}"]`).click();
    const otherPlanner = page.getByTestId('concert-program-planner');
    await expect(otherPlanner.getByText('No authorized run-of-show')).toBeVisible();
    await expect(otherPlanner.getByText(`Other Private Run ${RUN_ID}`)).not.toBeVisible();
  });
});
