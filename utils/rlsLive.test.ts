import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createLiveRlsHarness,
  getLiveRlsEnv,
  type LiveRlsHarness,
} from './rlsLiveHarness';

const liveRlsEnv = getLiveRlsEnv();
const LIVE_RLS_TIMEOUT_MS = 30_000;

function expectNoSupabaseError(error: { message?: string; code?: string } | null, context: string): void {
  expect(error, context).toBeNull();
}

function expectRlsDenied(error: { message?: string; code?: string } | null, context: string): void {
  expect(error?.message ?? '', context).toMatch(/row-level security|permission denied|violates row-level security/i);
}

if (!liveRlsEnv.ready) {
  const { skipReason } = liveRlsEnv;
  describe('live Supabase RLS enforcement', () => {
    it.skip(`skipped: ${skipReason}`, () => undefined);
  });
} else {
  describe('live Supabase RLS enforcement', () => {
    let h: LiveRlsHarness;
    const { config } = liveRlsEnv;

    beforeAll(async () => {
      h = await createLiveRlsHarness(config);
    }, LIVE_RLS_TIMEOUT_MS);

    afterEach(async () => {
      await h.cleanupTrackedRows();
    }, LIVE_RLS_TIMEOUT_MS);

    afterAll(async () => {
      if (h) await h.signOut();
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces admin writes, teacher own-roster reads, member write denial, and cross-org isolation for Student/Family rows', async () => {
      const activityId = h.id('activity');
      const ownStudentId = h.id('student_own');
      const otherStudentId = h.id('student_other');
      const deniedStudentId = h.id('student_denied');
      const ownEnrollmentId = h.id('enrollment_own');
      const otherEnrollmentId = h.id('enrollment_other');
      const assignmentId = h.id('teaching_assignment');
      const ownFamilyId = h.id('family_own');
      const otherFamilyId = h.id('family_other');
      const deniedFamilyId = h.id('family_denied');

      h.track('families', ownFamilyId);
      h.track('families', otherFamilyId);
      h.track('families', deniedFamilyId);
      h.track('students', ownStudentId);
      h.track('students', otherStudentId);
      h.track('students', deniedStudentId);
      h.track('enrollments', ownEnrollmentId);
      h.track('enrollments', otherEnrollmentId);
      h.track('teaching_assignments', assignmentId);

      const { error: adminStudentInsertError } = await h.admin.client.from('students').insert([
        {
          id: ownStudentId,
          org_id: config.orgId,
          data: {
            fullName: 'RLS Harness Own Student',
            profileStatus: 'ACTIVE',
            assignments: [],
          },
        },
        {
          id: otherStudentId,
          org_id: config.orgId,
          data: {
            fullName: 'RLS Harness Other Student',
            profileStatus: 'ACTIVE',
            assignments: [],
          },
        },
      ]);
      expectNoSupabaseError(adminStudentInsertError, 'admin should insert own-org student rows');

      const { error: rosterSeedError } = await h.admin.client.from('teaching_assignments').insert({
        id: assignmentId,
        org_id: config.orgId,
        data: {
          staffMemberId: config.teacher.staffMemberId,
          activityId,
          isArchived: false,
        },
      });
      expectNoSupabaseError(rosterSeedError, 'admin should seed the teacher roster assignment');

      const { error: enrollmentSeedError } = await h.admin.client.from('enrollments').insert([
        {
          id: ownEnrollmentId,
          org_id: config.orgId,
          data: {
            studentId: ownStudentId,
            activityId,
            status: 'ACTIVE',
          },
        },
        {
          id: otherEnrollmentId,
          org_id: config.orgId,
          data: {
            studentId: otherStudentId,
            activityId: `${activityId}_other`,
            status: 'ACTIVE',
          },
        },
      ]);
      expectNoSupabaseError(enrollmentSeedError, 'admin should seed student enrollment rows');

      const { error: adminInsertError } = await h.admin.client.from('families').insert({
        id: ownFamilyId,
        org_id: config.orgId,
        name: 'RLS Harness Own Family',
        guardians: [
          {
            id: 'guardian_rls_own',
            fullName: 'RLS Harness Guardian',
            relationship: 'PARENT',
            phone: '050-000-0000',
            email: 'rls.guardian@example.test',
            isPrimary: true,
          },
        ],
        student_ids: [ownStudentId],
        primary_contact_guardian_id: null,
        billing_notes: null,
        is_archived: false,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(adminInsertError, 'admin should insert an own-org family');

      const { error: adminOtherFamilyError } = await h.admin.client.from('families').insert({
        id: otherFamilyId,
        org_id: config.orgId,
        name: 'RLS Harness Other Family',
        guardians: [],
        student_ids: [otherStudentId],
        primary_contact_guardian_id: null,
        billing_notes: null,
        is_archived: false,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(adminOtherFamilyError, 'admin should insert an unrelated family for scoping');

      const { data: teacherStudentRows, error: teacherStudentReadError } = await h.teacher.client
        .from('students')
        .select('id, org_id')
        .in('id', [ownStudentId, otherStudentId]);
      expectNoSupabaseError(teacherStudentReadError, 'teacher roster student select should not error');
      expect((teacherStudentRows ?? []).map(row => row.id).sort()).toEqual([ownStudentId]);

      const { data: teacherFamilyRows, error: teacherFamilyReadError } = await h.teacher.client
        .from('families')
        .select('id, org_id')
        .in('id', [ownFamilyId, otherFamilyId]);
      expectNoSupabaseError(teacherFamilyReadError, 'teacher roster family select should not error');
      expect((teacherFamilyRows ?? []).map(row => row.id).sort()).toEqual([ownFamilyId]);

      const { data: crossRows, error: crossReadError } = await h.crossOrg.client
        .from('families')
        .select('id')
        .eq('id', ownFamilyId);
      expectNoSupabaseError(crossReadError, 'cross-org family select should not error');
      expect(crossRows).toEqual([]);

      const { data: anonRows, error: anonReadError } = await h.anon
        .from('families')
        .select('id')
        .eq('id', ownFamilyId);
      expectNoSupabaseError(anonReadError, 'anon family select should not error');
      expect(anonRows).toEqual([]);

      const { error: teacherStudentInsertError } = await h.teacher.client.from('students').insert({
        id: deniedStudentId,
        org_id: config.orgId,
        data: {
          fullName: 'Denied RLS Harness Student',
          profileStatus: 'ACTIVE',
        },
      });
      expectRlsDenied(teacherStudentInsertError, 'teacher/member should not insert student rows');

      const { error: teacherInsertError } = await h.teacher.client.from('families').insert({
        id: deniedFamilyId,
        org_id: config.orgId,
        name: 'Denied RLS Harness Family',
        guardians: [],
        student_ids: [],
        primary_contact_guardian_id: null,
        billing_notes: null,
        is_archived: false,
      });
      expectRlsDenied(teacherInsertError, 'teacher/member should not insert family rows');
    });

    it('enforces finance capability access on ledger rows', async () => {
      const chargeId = h.id('charge');
      h.track('charges', chargeId);

      const { error: adminInsertError } = await h.admin.client.from('charges').insert({
        id: chargeId,
        org_id: config.orgId,
        family_id: 'rls-live-family',
        description: 'RLS harness charge',
        amount: 25,
        currency: 'ILS',
        status: 'OPEN',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(adminInsertError, 'admin should insert ledger charge rows');

      const { data: financeRows, error: financeReadError } = await h.finance.client
        .from('charges')
        .select('id')
        .eq('id', chargeId);
      expectNoSupabaseError(financeReadError, 'finance capability should read ledger rows');
      expect(financeRows).toHaveLength(1);

      const { data: teacherRows, error: teacherReadError } = await h.teacher.client
        .from('charges')
        .select('id')
        .eq('id', chargeId);
      expectNoSupabaseError(teacherReadError, 'plain teacher/member ledger select should not error');
      expect(teacherRows).toEqual([]);

      const { data: crossRows, error: crossReadError } = await h.crossOrg.client
        .from('charges')
        .select('id')
        .eq('id', chargeId);
      expectNoSupabaseError(crossReadError, 'cross-org ledger select should not error');
      expect(crossRows).toEqual([]);

      const { data: anonRows, error: anonReadError } = await h.anon
        .from('charges')
        .select('id')
        .eq('id', chargeId);
      expectNoSupabaseError(anonReadError, 'anon ledger select should not error');
      expect(anonRows).toEqual([]);
    });

    it('enforces teacher self-write scope for lesson and hours rows', async () => {
      const lessonId = h.id('lesson');
      const deniedLessonId = h.id('lesson_denied');
      const hoursId = h.id('hours');
      const deniedHoursId = h.id('hours_denied');
      h.track('lesson_records', lessonId);
      h.track('lesson_records', deniedLessonId);
      h.track('hours_entries', hoursId);
      h.track('hours_entries', deniedHoursId);

      const { error: ownLessonError } = await h.teacher.client.from('lesson_records').insert({
        id: lessonId,
        org_id: config.orgId,
        event_id: 'rls-live-event',
        student_id: 'rls-live-student',
        staff_member_id: config.teacher.staffMemberId,
        date: '2026-06-18',
        attendance: 'PRESENT',
        completion: 'COMPLETED',
        notes: null,
        repertoire: [],
        homework: null,
        makeup_of_lesson_id: null,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(ownLessonError, 'teacher should insert own lesson rows');

      const { error: otherLessonError } = await h.teacher.client.from('lesson_records').insert({
        id: deniedLessonId,
        org_id: config.orgId,
        event_id: 'rls-live-event',
        student_id: 'rls-live-student',
        staff_member_id: `${config.teacher.staffMemberId}_other`,
        date: '2026-06-18',
        attendance: 'PRESENT',
        completion: 'COMPLETED',
        notes: null,
        repertoire: [],
        homework: null,
        makeup_of_lesson_id: null,
      });
      expectRlsDenied(otherLessonError, 'teacher should not insert another staff member lesson row');

      const { error: ownHoursError } = await h.teacher.client.from('hours_entries').insert({
        id: hoursId,
        org_id: config.orgId,
        staff_member_id: config.teacher.staffMemberId,
        date: '2026-06-18',
        reported_minutes: 45,
        calendar_minutes: 45,
        status: 'SUBMITTED',
        note: 'RLS harness hours',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(ownHoursError, 'teacher should insert own draft/submitted hours rows');

      const { error: approvedHoursError } = await h.teacher.client.from('hours_entries').insert({
        id: deniedHoursId,
        org_id: config.orgId,
        staff_member_id: config.teacher.staffMemberId,
        date: '2026-06-18',
        reported_minutes: 45,
        calendar_minutes: 45,
        status: 'APPROVED',
        note: 'Denied RLS harness hours',
      });
      expectRlsDenied(approvedHoursError, 'teacher should not insert approved/payroll-final hours rows');
    });
  });
}
