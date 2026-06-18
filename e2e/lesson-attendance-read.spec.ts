import { expect, test, type Page } from '@playwright/test';
import { gotoView, loadApp, TEST_ORG } from './helpers/navigate';

const RUN_ID = Date.now().toString(36);

async function seedAttendanceReadData(page: Page, language: 'en-US' | 'he-IL' = 'en-US') {
  await page.addInitScript(
    ({ orgId, lang, stamp }) => {
      const collectionKey = (collection: string) => `cadenza:local:${orgId}:col:${collection}`;
      const today = new Date();
      today.setHours(11, 0, 0, 0);
      const end = new Date(today);
      end.setHours(12, 0, 0, 0);
      const openStart = new Date(today);
      openStart.setHours(13, 0, 0, 0);
      const openEnd = new Date(today);
      openEnd.setHours(14, 0, 0, 0);
      const date = today.toISOString().slice(0, 10);
      const base = { orgId, createdAt: stamp, updatedAt: stamp };

      localStorage.setItem('language', lang);
      localStorage.setItem(collectionKey('teachers'), JSON.stringify([
        {
          id: 'staff-attendance',
          fullName: 'Dana Teacher',
          positions: [],
          positionAssignments: [],
          tags: [],
          phone: '',
          email: 'dana.teacher@example.test',
          color: '#7c2d12',
        },
      ]));
      localStorage.setItem(collectionKey('rooms'), JSON.stringify([
        { id: 'room-attendance', name: 'Room 2', itinerary: '' },
      ]));
      localStorage.setItem(collectionKey('events'), JSON.stringify([
        {
          id: 'event-attendance-read',
          name: 'Attendance Read Lesson',
          description: 'Persisted attendance rows',
          teacherId: 'staff-attendance',
          roomId: 'room-attendance',
          start: today.toISOString(),
          end: end.toISOString(),
          isCanceled: false,
          isHidden: false,
        },
        {
          id: 'event-attendance-empty',
          name: 'Unprepared Lesson',
          description: 'No saved lesson rows',
          teacherId: 'staff-attendance',
          roomId: 'room-attendance',
          start: openStart.toISOString(),
          end: openEnd.toISOString(),
          isCanceled: false,
          isHidden: false,
        },
      ]));
      localStorage.setItem(collectionKey('students'), JSON.stringify([
        {
          ...base,
          id: 'student-ari',
          fullName: `Ari ${stamp}`,
          dateOfBirth: '2012-01-01',
          isMinor: true,
          currentGrade: 7,
          email: 'ari@example.test',
          guardians: [],
          assignments: [],
          pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
          notes: [],
          documents: [],
          profileStatus: 'ACTIVE',
        },
        {
          ...base,
          id: 'student-ziv',
          fullName: `Ziv ${stamp}`,
          dateOfBirth: '2011-01-01',
          isMinor: true,
          currentGrade: 8,
          email: 'ziv@example.test',
          guardians: [],
          assignments: [],
          pedagogicalRecord: { lessonHistory: [], recitalHistory: [], reportCards: [] },
          notes: [],
          documents: [],
          profileStatus: 'ACTIVE',
        },
      ]));
      localStorage.setItem(collectionKey('families'), JSON.stringify([
        {
          ...base,
          id: 'family-attendance',
          name: `Attendance ${stamp} Family`,
          guardians: [],
          studentIds: ['student-ari', 'student-ziv'],
          primaryContactGuardianId: null,
          billingNotes: null,
          isArchived: false,
        },
      ]));
      localStorage.setItem(collectionKey('lessonRecords'), JSON.stringify([
        {
          ...base,
          id: 'lesson-ari',
          eventId: 'event-attendance-read',
          studentId: 'student-ari',
          staffMemberId: 'staff-attendance',
          date,
          attendance: 'PRESENT',
          completion: 'COMPLETED',
          notes: 'Worked on phrasing',
          repertoire: ['Minuet'],
          homework: 'Scales',
          makeupOfLessonId: null,
        },
        {
          ...base,
          id: 'lesson-ziv',
          eventId: 'event-attendance-read',
          studentId: 'student-ziv',
          staffMemberId: 'staff-attendance',
          date,
          attendance: 'UNMARKED',
          completion: 'PENDING',
          notes: null,
          repertoire: [],
          homework: null,
          makeupOfLessonId: null,
        },
      ]));
    },
    { orgId: TEST_ORG, lang: language, stamp: RUN_ID },
  );
}

test.describe('Calendar event attendance read panel', () => {
  test('marks an existing event row and updates history plus the unmarked counter', async ({ page }) => {
    await seedAttendanceReadData(page);
    await loadApp(page);

    const worklistToggle = page.getByRole('button', { name: 'Unmarked attendance' });
    await expect(worklistToggle.locator('span').filter({ hasText: /^1$/ })).toBeVisible();

    await page.locator('[data-event-id="event-attendance-read"]').click();
    const panel = page.getByTestId('event-attendance-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Attendance')).toBeVisible();
    await expect(panel.getByText(`Ari ${RUN_ID}`)).toBeVisible();
    await expect(panel.getByText(`Ziv ${RUN_ID}`)).toBeVisible();
    await expect(panel.locator('span').filter({ hasText: /^Present$/ })).toBeVisible();
    await expect(panel.locator('span').filter({ hasText: /^Unmarked$/ })).toBeVisible();
    await expect(panel.getByText('Minuet')).toBeVisible();

    const zivRow = panel.getByTestId('attendance-lesson-row').filter({ hasText: `Ziv ${RUN_ID}` });
    await zivRow.getByRole('button', { name: new RegExp(`Ziv ${RUN_ID}.*Present`) }).click();
    await expect(zivRow.locator('span').filter({ hasText: /^Present$/ })).toBeVisible();

    const persisted = await page.evaluate((orgId) => {
      return JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:lessonRecords`) || '[]');
    }, TEST_ORG);
    expect(persisted).toHaveLength(2);
    expect(persisted.find((lesson: { id: string }) => lesson.id === 'lesson-ziv')?.attendance).toBe('PRESENT');

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(worklistToggle.locator('span').filter({ hasText: /^1$/ })).toHaveCount(0);

    await worklistToggle.click();
    const worklist = page.getByTestId('attendance-worklist-panel');
    await expect(worklist).toBeVisible();
    await expect(worklist.getByText('No unmarked rows')).toBeVisible();

    await gotoView(page, 'STUDENTS');
    await page.getByText(`Ziv ${RUN_ID}`).first().click();
    const detail = page.getByTestId('student-family-detail-panel');
    await page.getByRole('tab', { name: 'Lessons' }).click();
    await expect(detail.getByTestId('student-family-lesson-history-row')).toBeVisible();
    await expect(detail.getByText('Attendance Read Lesson')).toBeVisible();
    await expect(detail.getByText('Present')).toBeVisible();
  });

  test('shows the no-prepared-rows state without creating lesson records', async ({ page }) => {
    await seedAttendanceReadData(page);
    await loadApp(page);

    await page.locator('[data-event-id="event-attendance-empty"]').click();
    const panel = page.getByTestId('event-attendance-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('No prepared attendance rows')).toBeVisible();

    const persisted = await page.evaluate((orgId) => {
      return JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:lessonRecords`) || '[]');
    }, TEST_ORG);
    expect(persisted).toHaveLength(2);
  });

  test('keeps Hebrew RTL attendance marking usable at 390x844 for existing rows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAttendanceReadData(page, 'he-IL');
    await loadApp(page);

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('[data-event-id="event-attendance-read"]').click();

    const panel = page.getByTestId('event-attendance-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('dir', 'rtl');
    await expect(panel.getByText('נוכחות')).toBeVisible();
    await expect(panel.getByText('מעדכן רק רשומות שיעור שמורות. אין הכנת רשומות או הסקת תוצאות.')).toBeVisible();

    const zivRow = panel.getByTestId('attendance-lesson-row').filter({ hasText: `Ziv ${RUN_ID}` });
    await expect(zivRow).toBeVisible();
    await expect(zivRow.getByText('סימון')).toBeVisible();
    await expect(zivRow.getByTestId('attendance-mark-controls')).toBeVisible();
    await zivRow.getByRole('button', { name: new RegExp(`Ziv ${RUN_ID}.*נוכח`) }).click();
    await expect(zivRow.locator('span').filter({ hasText: /^נוכח$/ })).toBeVisible();

    const persisted = await page.evaluate((orgId) => {
      return JSON.parse(localStorage.getItem(`cadenza:local:${orgId}:col:lessonRecords`) || '[]');
    }, TEST_ORG);
    expect(persisted.find((lesson: { id: string }) => lesson.id === 'lesson-ziv')?.attendance).toBe('PRESENT');

    await page.getByRole('button', { name: 'סגירה' }).click();
    await page.getByRole('button', { name: 'נוכחות שלא סומנה' }).click();
    const worklist = page.getByTestId('attendance-worklist-panel');
    await expect(worklist).toBeVisible();
    await expect(worklist).toHaveAttribute('dir', 'rtl');
    await expect(worklist.getByText('אין רשומות שלא סומנו')).toBeVisible();
  });
});
