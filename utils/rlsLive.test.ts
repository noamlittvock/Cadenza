import { createHash } from 'node:crypto';
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

function isMissingRegistrationIntakeRpc(error: { message?: string; code?: string } | null): boolean {
  return error?.code === 'PGRST202' &&
    /submit_registration_intake/i.test(error.message ?? '');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

    it('enforces teacher self-write scope for lesson and payroll hours rows', async () => {
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

    it('enforces payroll hours role boundaries for teacher, admin, finance, anon, and cross-org users', async () => {
      const teacherDraftId = h.id('hours_teacher_draft');
      const teacherSubmittedId = h.id('hours_teacher_submitted');
      const otherStaffId = h.id('hours_other_staff');
      const teacherApprovedId = h.id('hours_teacher_approved');
      const teacherPaidId = h.id('hours_teacher_paid');
      const adminApproveId = h.id('hours_admin_approve');
      const adminPayId = h.id('hours_admin_pay');
      const crossOrgHoursId = h.id('hours_cross_org');
      const deniedTeacherOtherInsertId = h.id('hours_teacher_other_denied');
      const deniedTeacherApprovedInsertId = h.id('hours_teacher_approved_denied');
      const deniedTeacherPaidInsertId = h.id('hours_teacher_paid_denied');
      const deniedFinanceInsertId = h.id('hours_finance_denied');
      const deniedAnonInsertId = h.id('hours_anon_denied');
      const deniedTeacherCrossOrgInsertId = h.id('hours_teacher_cross_org_denied');

      for (const id of [
        teacherDraftId,
        teacherSubmittedId,
        otherStaffId,
        teacherApprovedId,
        teacherPaidId,
        adminApproveId,
        adminPayId,
        crossOrgHoursId,
        deniedTeacherOtherInsertId,
        deniedTeacherApprovedInsertId,
        deniedTeacherPaidInsertId,
        deniedFinanceInsertId,
        deniedAnonInsertId,
        deniedTeacherCrossOrgInsertId,
      ]) {
        h.track('hours_entries', id);
      }

      const otherStaffMemberId = `${config.teacher.staffMemberId}_other`;
      const makeHoursRow = (
        id: string,
        status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID',
        overrides: Record<string, unknown> = {},
      ): Record<string, unknown> => ({
        id,
        org_id: config.orgId,
        staff_member_id: config.teacher.staffMemberId,
        date: '2026-06-18',
        reported_minutes: 45,
        calendar_minutes: 45,
        rate: status === 'APPROVED' || status === 'PAID' ? 100 : null,
        status,
        note: `seeded ${status}`,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
        ...overrides,
      });

      const { error: seedError } = await h.service.from('hours_entries').insert([
        makeHoursRow(teacherSubmittedId, 'SUBMITTED'),
        makeHoursRow(otherStaffId, 'SUBMITTED', { staff_member_id: otherStaffMemberId, note: 'other staff seed' }),
        makeHoursRow(teacherApprovedId, 'APPROVED'),
        makeHoursRow(teacherPaidId, 'PAID'),
        makeHoursRow(adminApproveId, 'SUBMITTED', { rate: null, note: 'awaiting admin approval' }),
        makeHoursRow(adminPayId, 'APPROVED', { rate: 120, note: 'awaiting admin payment' }),
        makeHoursRow(crossOrgHoursId, 'SUBMITTED', { org_id: config.crossOrgId, note: 'cross org seed' }),
      ]);
      expectNoSupabaseError(seedError, 'service should seed payroll RLS fixtures');

      const { error: teacherDraftInsertError } = await h.teacher.client.from('hours_entries').insert(
        makeHoursRow(teacherDraftId, 'DRAFT', { reported_minutes: 30, calendar_minutes: 30, note: 'teacher draft insert' }),
      );
      expectNoSupabaseError(teacherDraftInsertError, 'teacher should insert own DRAFT hours rows');

      const { error: teacherDraftUpdateError } = await h.teacher.client
        .from('hours_entries')
        .update({
          reported_minutes: 50,
          status: 'SUBMITTED',
          note: 'teacher submitted own draft',
          updated_by: 'rls-live-harness',
        })
        .eq('id', teacherDraftId);
      expectNoSupabaseError(teacherDraftUpdateError, 'teacher should update and submit own DRAFT hours rows');

      const { error: teacherSubmittedUpdateError } = await h.teacher.client
        .from('hours_entries')
        .update({
          reported_minutes: 60,
          note: 'teacher edited own submitted row',
          updated_by: 'rls-live-harness',
        })
        .eq('id', teacherSubmittedId);
      expectNoSupabaseError(teacherSubmittedUpdateError, 'teacher should edit own SUBMITTED hours rows');

      const { error: teacherOtherInsertError } = await h.teacher.client.from('hours_entries').insert(
        makeHoursRow(deniedTeacherOtherInsertId, 'SUBMITTED', { staff_member_id: otherStaffMemberId }),
      );
      expectRlsDenied(teacherOtherInsertError, 'teacher should not insert another staff member hours row');

      const { error: teacherApprovedInsertError } = await h.teacher.client.from('hours_entries').insert(
        makeHoursRow(deniedTeacherApprovedInsertId, 'APPROVED'),
      );
      expectRlsDenied(teacherApprovedInsertError, 'teacher should not insert APPROVED hours rows');

      const { error: teacherPaidInsertError } = await h.teacher.client.from('hours_entries').insert(
        makeHoursRow(deniedTeacherPaidInsertId, 'PAID'),
      );
      expectRlsDenied(teacherPaidInsertError, 'teacher should not insert PAID hours rows');

      const { error: teacherOtherUpdateError } = await h.teacher.client
        .from('hours_entries')
        .update({ note: 'teacher attempted other staff update', updated_by: 'rls-live-harness' })
        .eq('id', otherStaffId);
      expectNoSupabaseError(teacherOtherUpdateError, 'other-staff hours update should be filtered by RLS without mutating');

      const { error: teacherApprovedUpdateError } = await h.teacher.client
        .from('hours_entries')
        .update({ status: 'SUBMITTED', note: 'teacher attempted approved reset', updated_by: 'rls-live-harness' })
        .eq('id', teacherApprovedId);
      expectNoSupabaseError(teacherApprovedUpdateError, 'APPROVED hours update should be filtered by RLS without mutating');

      const { error: teacherPaidUpdateError } = await h.teacher.client
        .from('hours_entries')
        .update({ status: 'SUBMITTED', note: 'teacher attempted paid reset', updated_by: 'rls-live-harness' })
        .eq('id', teacherPaidId);
      expectNoSupabaseError(teacherPaidUpdateError, 'PAID hours update should be filtered by RLS without mutating');

      const { error: adminApproveError } = await h.admin.client
        .from('hours_entries')
        .update({
          status: 'APPROVED',
          rate: 130,
          note: 'admin approved with stamped rate',
          updated_by: 'rls-live-harness',
        })
        .eq('id', adminApproveId);
      expectNoSupabaseError(adminApproveError, 'admin should approve own-org hours rows');

      const { error: adminPayError } = await h.admin.client
        .from('hours_entries')
        .update({
          status: 'PAID',
          note: 'admin marked paid',
          updated_by: 'rls-live-harness',
        })
        .eq('id', adminPayId);
      expectNoSupabaseError(adminPayError, 'admin should mark own-org approved hours rows paid');

      const { data: financeRows, error: financeReadError } = await h.finance.client
        .from('hours_entries')
        .select('id')
        .in('id', [teacherDraftId, teacherSubmittedId, adminApproveId, adminPayId]);
      expectNoSupabaseError(financeReadError, 'finance should read payroll rows for export');
      expect((financeRows ?? []).map(row => row.id).sort()).toEqual([
        adminApproveId,
        adminPayId,
        teacherDraftId,
        teacherSubmittedId,
      ].sort());

      const { error: financeInsertError } = await h.finance.client.from('hours_entries').insert(
        makeHoursRow(deniedFinanceInsertId, 'APPROVED'),
      );
      expectRlsDenied(financeInsertError, 'finance-capable non-admin should not insert payroll rows');

      const { error: financeUpdateError } = await h.finance.client
        .from('hours_entries')
        .update({ status: 'PAID', note: 'finance attempted payment', updated_by: 'rls-live-harness' })
        .eq('id', adminApproveId);
      expectNoSupabaseError(financeUpdateError, 'finance update should be filtered by RLS without mutating');

      const { error: financeDeleteError } = await h.finance.client
        .from('hours_entries')
        .delete()
        .eq('id', adminPayId);
      expectNoSupabaseError(financeDeleteError, 'finance delete should be filtered by RLS without mutating');

      const { data: anonRows, error: anonReadError } = await h.anon
        .from('hours_entries')
        .select('id')
        .eq('id', teacherSubmittedId);
      expectNoSupabaseError(anonReadError, 'anon payroll select should not error');
      expect(anonRows).toEqual([]);

      const { error: anonInsertError } = await h.anon.from('hours_entries').insert(
        makeHoursRow(deniedAnonInsertId, 'SUBMITTED'),
      );
      expectRlsDenied(anonInsertError, 'anon should not insert payroll rows');

      const { data: crossRows, error: crossReadError } = await h.crossOrg.client
        .from('hours_entries')
        .select('id')
        .eq('id', teacherSubmittedId);
      expectNoSupabaseError(crossReadError, 'cross-org payroll select should not error');
      expect(crossRows).toEqual([]);

      const { error: crossUpdateError } = await h.crossOrg.client
        .from('hours_entries')
        .update({ note: 'cross-org attempted update', updated_by: 'rls-live-harness' })
        .eq('id', teacherSubmittedId);
      expectNoSupabaseError(crossUpdateError, 'cross-org update should be filtered by RLS without mutating');

      const { error: teacherCrossOrgInsertError } = await h.teacher.client.from('hours_entries').insert(
        makeHoursRow(deniedTeacherCrossOrgInsertId, 'SUBMITTED', { org_id: config.crossOrgId }),
      );
      expectRlsDenied(teacherCrossOrgInsertError, 'teacher should not insert payroll rows in another org');

      const { data: rows, error: verifyError } = await h.service
        .from('hours_entries')
        .select('id, org_id, staff_member_id, status, reported_minutes, rate, note')
        .in('id', [
          teacherDraftId,
          teacherSubmittedId,
          otherStaffId,
          teacherApprovedId,
          teacherPaidId,
          adminApproveId,
          adminPayId,
          crossOrgHoursId,
        ]);
      expectNoSupabaseError(verifyError, 'service should verify payroll RLS mutation results');

      const byId = new Map((rows ?? []).map(row => [row.id, row]));
      expect(byId.get(teacherDraftId)).toMatchObject({
        org_id: config.orgId,
        staff_member_id: config.teacher.staffMemberId,
        status: 'SUBMITTED',
        reported_minutes: 50,
        note: 'teacher submitted own draft',
      });
      expect(byId.get(teacherSubmittedId)).toMatchObject({
        org_id: config.orgId,
        staff_member_id: config.teacher.staffMemberId,
        status: 'SUBMITTED',
        reported_minutes: 60,
        note: 'teacher edited own submitted row',
      });
      expect(byId.get(otherStaffId)).toMatchObject({
        org_id: config.orgId,
        staff_member_id: otherStaffMemberId,
        status: 'SUBMITTED',
        note: 'other staff seed',
      });
      expect(byId.get(teacherApprovedId)).toMatchObject({
        org_id: config.orgId,
        status: 'APPROVED',
        note: 'seeded APPROVED',
      });
      expect(byId.get(teacherPaidId)).toMatchObject({
        org_id: config.orgId,
        status: 'PAID',
        note: 'seeded PAID',
      });
      expect(byId.get(adminApproveId)).toMatchObject({
        org_id: config.orgId,
        status: 'APPROVED',
        rate: 130,
        note: 'admin approved with stamped rate',
      });
      expect(byId.get(adminPayId)).toMatchObject({
        org_id: config.orgId,
        status: 'PAID',
        note: 'admin marked paid',
      });
      expect(byId.get(crossOrgHoursId)).toMatchObject({
        org_id: config.crossOrgId,
        status: 'SUBMITTED',
        note: 'cross org seed',
      });
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces attendance marking boundaries for lesson rows', async () => {
      const ownLessonId = h.id('lesson_attendance_own');
      const otherLessonId = h.id('lesson_attendance_other');
      const crossOrgLessonId = h.id('lesson_attendance_cross_org');
      const financeDeniedLessonId = h.id('lesson_attendance_finance_denied');
      const anonDeniedLessonId = h.id('lesson_attendance_anon_denied');
      const teacherCrossOrgDeniedLessonId = h.id('lesson_attendance_teacher_cross_org_denied');

      h.track('lesson_records', ownLessonId);
      h.track('lesson_records', otherLessonId);
      h.track('lesson_records', crossOrgLessonId);
      h.track('lesson_records', financeDeniedLessonId);
      h.track('lesson_records', anonDeniedLessonId);
      h.track('lesson_records', teacherCrossOrgDeniedLessonId);

      const otherStaffMemberId = `${config.teacher.staffMemberId}_other`;

      const { error: seedError } = await h.service.from('lesson_records').insert([
        {
          id: ownLessonId,
          org_id: config.orgId,
          event_id: 'rls-live-attendance-event',
          student_id: 'rls-live-attendance-student',
          staff_member_id: config.teacher.staffMemberId,
          date: '2026-06-18',
          attendance: 'UNMARKED',
          completion: 'PENDING',
          notes: null,
          repertoire: [],
          homework: null,
          makeup_of_lesson_id: null,
          created_by: 'rls-live-harness',
          updated_by: 'rls-live-harness',
        },
        {
          id: otherLessonId,
          org_id: config.orgId,
          event_id: 'rls-live-attendance-event-other',
          student_id: 'rls-live-attendance-student-other',
          staff_member_id: otherStaffMemberId,
          date: '2026-06-18',
          attendance: 'UNMARKED',
          completion: 'PENDING',
          notes: null,
          repertoire: [],
          homework: null,
          makeup_of_lesson_id: null,
          created_by: 'rls-live-harness',
          updated_by: 'rls-live-harness',
        },
        {
          id: crossOrgLessonId,
          org_id: config.crossOrgId,
          event_id: 'rls-live-attendance-event-cross',
          student_id: 'rls-live-attendance-student-cross',
          staff_member_id: config.teacher.staffMemberId,
          date: '2026-06-18',
          attendance: 'UNMARKED',
          completion: 'PENDING',
          notes: null,
          repertoire: [],
          homework: null,
          makeup_of_lesson_id: null,
          created_by: 'rls-live-harness',
          updated_by: 'rls-live-harness',
        },
      ]);
      expectNoSupabaseError(seedError, 'service should seed lesson rows for attendance RLS fixtures');

      const { error: teacherMarkError } = await h.teacher.client
        .from('lesson_records')
        .update({
          attendance: 'PRESENT',
          completion: 'COMPLETED',
          notes: 'Marked by teacher in live RLS harness',
          updated_by: 'rls-live-harness',
        })
        .eq('id', ownLessonId);
      expectNoSupabaseError(teacherMarkError, 'teacher should mark their own lesson row');

      const { error: teacherOtherUpdateError } = await h.teacher.client
        .from('lesson_records')
        .update({
          attendance: 'ABSENT',
          completion: 'NO_SHOW',
          updated_by: 'rls-live-harness',
        })
        .eq('id', otherLessonId);
      expectNoSupabaseError(teacherOtherUpdateError, 'other-staff update should be filtered by RLS without mutating');

      const { error: teacherCrossOrgUpdateError } = await h.teacher.client
        .from('lesson_records')
        .update({
          attendance: 'EXCUSED',
          updated_by: 'rls-live-harness',
        })
        .eq('id', crossOrgLessonId);
      expectNoSupabaseError(teacherCrossOrgUpdateError, 'cross-org update should be filtered by RLS without mutating');

      const { error: adminOverrideError } = await h.admin.client
        .from('lesson_records')
        .update({
          attendance: 'LATE',
          completion: 'COMPLETED',
          notes: 'Admin override in live RLS harness',
          updated_by: 'rls-live-harness',
        })
        .eq('id', otherLessonId);
      expectNoSupabaseError(adminOverrideError, 'admin should override any own-org lesson row');

      const { error: financeInsertError } = await h.finance.client.from('lesson_records').insert({
        id: financeDeniedLessonId,
        org_id: config.orgId,
        event_id: 'rls-live-attendance-event-finance-denied',
        student_id: 'rls-live-attendance-student-finance-denied',
        staff_member_id: config.teacher.staffMemberId,
        date: '2026-06-18',
        attendance: 'PRESENT',
        completion: 'COMPLETED',
        notes: null,
        repertoire: [],
        homework: null,
        makeup_of_lesson_id: null,
      });
      expectRlsDenied(financeInsertError, 'finance-capable non-admin should not insert lesson rows');

      const { error: anonInsertError } = await h.anon.from('lesson_records').insert({
        id: anonDeniedLessonId,
        org_id: config.orgId,
        event_id: 'rls-live-attendance-event-anon-denied',
        student_id: 'rls-live-attendance-student-anon-denied',
        staff_member_id: config.teacher.staffMemberId,
        date: '2026-06-18',
        attendance: 'PRESENT',
        completion: 'COMPLETED',
        notes: null,
        repertoire: [],
        homework: null,
        makeup_of_lesson_id: null,
      });
      expectRlsDenied(anonInsertError, 'anon should not insert lesson rows');

      const { error: teacherCrossOrgInsertError } = await h.teacher.client.from('lesson_records').insert({
        id: teacherCrossOrgDeniedLessonId,
        org_id: config.crossOrgId,
        event_id: 'rls-live-attendance-event-teacher-cross-org-denied',
        student_id: 'rls-live-attendance-student-teacher-cross-org-denied',
        staff_member_id: config.teacher.staffMemberId,
        date: '2026-06-18',
        attendance: 'PRESENT',
        completion: 'COMPLETED',
        notes: null,
        repertoire: [],
        homework: null,
        makeup_of_lesson_id: null,
      });
      expectRlsDenied(teacherCrossOrgInsertError, 'teacher should not insert lesson rows in another org');

      const { data: rows, error: verifyError } = await h.service
        .from('lesson_records')
        .select('id, org_id, attendance, completion, notes')
        .in('id', [ownLessonId, otherLessonId, crossOrgLessonId])
        .order('id');
      expectNoSupabaseError(verifyError, 'service should verify lesson RLS mutation results');
      expect(rows).toEqual([
        {
          id: crossOrgLessonId,
          org_id: config.crossOrgId,
          attendance: 'UNMARKED',
          completion: 'PENDING',
          notes: null,
        },
        {
          id: otherLessonId,
          org_id: config.orgId,
          attendance: 'LATE',
          completion: 'COMPLETED',
          notes: 'Admin override in live RLS harness',
        },
        {
          id: ownLessonId,
          org_id: config.orgId,
          attendance: 'PRESENT',
          completion: 'COMPLETED',
          notes: 'Marked by teacher in live RLS harness',
        },
      ]);
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces controlled public registration submit and admin-only intake review', async (ctx) => {
      const endpointId = h.id('public_endpoint');
      const token = h.id('registration_token');
      const tokenHash = sha256Hex(token);
      const deniedStudentId = h.id('anon_student_denied');
      const deniedFamilyId = h.id('anon_family_denied');
      const deniedEnrollmentId = h.id('anon_enrollment_denied');
      const crossOrgIntakeId = h.id('cross_intake');

      const { error: submitRpcPreflightError } = await h.anon.rpc('submit_registration_intake', {
        p_token_hash: 'missing-token-hash',
        p_payload: {},
      });
      if (isMissingRegistrationIntakeRpc(submitRpcPreflightError)) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0006_registration_intake_public_submit.sql yet; run the RLS-LIVE migration unit before enforcing public intake RPC assertions',
        );
      }
      expectNoSupabaseError(submitRpcPreflightError, 'registration intake submit RPC should exist in the live schema');

      h.track('public_endpoints', endpointId);
      h.track('students', deniedStudentId);
      h.track('families', deniedFamilyId);
      h.track('enrollments', deniedEnrollmentId);
      h.track('registration_intake', crossOrgIntakeId);

      const { error: endpointError } = await h.service.from('public_endpoints').insert({
        id: endpointId,
        org_id: config.orgId,
        kind: 'REGISTRATION_INTAKE',
        label: 'RLS harness registration',
        token_hash: tokenHash,
        status: 'ACTIVE',
        scopes: ['registration_intake:submit'],
        target_id: 'rls-live-activity',
        consent_agreement_id: 'rls-live-consent',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(endpointError, 'service should seed a scoped public registration endpoint');

      const { error: crossSeedError } = await h.service.from('registration_intake').insert({
        id: crossOrgIntakeId,
        org_id: config.crossOrgId,
        status: 'PENDING',
        source: 'WEBSITE',
        student_full_name: 'Cross Org Intake',
        guardians: [],
        consent_accepted: true,
        consent_agreement_id: 'rls-live-consent',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(crossSeedError, 'service should seed cross-org intake fixture');

      const { error: anonStudentError } = await h.anon.from('students').insert({
        id: deniedStudentId,
        org_id: config.orgId,
        data: { fullName: 'Denied Anon Student', profileStatus: 'ACTIVE' },
      });
      expectRlsDenied(anonStudentError, 'anon should not insert live student rows directly');

      const { error: anonFamilyError } = await h.anon.from('families').insert({
        id: deniedFamilyId,
        org_id: config.orgId,
        name: 'Denied Anon Family',
        guardians: [],
        student_ids: [],
        primary_contact_guardian_id: null,
        billing_notes: null,
        is_archived: false,
      });
      expectRlsDenied(anonFamilyError, 'anon should not insert live family rows directly');

      const { error: anonEnrollmentError } = await h.anon.from('enrollments').insert({
        id: deniedEnrollmentId,
        org_id: config.orgId,
        data: { studentId: deniedStudentId, activityId: 'rls-live-activity', status: 'ACTIVE' },
      });
      expectRlsDenied(anonEnrollmentError, 'anon should not insert live enrollment rows directly');

      const { data: submitData, error: submitError } = await h.anon.rpc('submit_registration_intake', {
        p_token_hash: tokenHash,
        p_payload: {
          applicant: {
            fullName: 'RLS Harness Applicant',
            email: 'rls.intake.applicant@example.test',
            phone: null,
          },
          student: {
            fullName: 'RLS Harness Intake Student',
            dateOfBirth: '2014-02-03',
            instrument: 'Piano',
            requestedActivityId: null,
          },
          guardians: [
            {
              id: 'guardian_1',
              fullName: 'RLS Harness Guardian',
              relationship: 'PARENT',
              email: 'rls.intake.guardian@example.test',
              phone: null,
              isPrimary: true,
            },
          ],
          notes: 'Submitted by live RLS harness.',
          consent: {
            accepted: true,
            agreementId: 'rls-live-consent',
            capturedAt: new Date().toISOString(),
          },
        },
      });
      expectNoSupabaseError(submitError, 'anon should submit through the scoped registration RPC');
      expect(submitData).toMatchObject({ ok: true });
      const intakeId = (submitData as { intakeId?: string } | null)?.intakeId;
      expect(typeof intakeId).toBe('string');
      h.track('registration_intake', intakeId as string);

      const { data: anonRows, error: anonReadError } = await h.anon
        .from('registration_intake')
        .select('id')
        .eq('id', intakeId as string);
      expectNoSupabaseError(anonReadError, 'anon intake select should not error');
      expect(anonRows).toEqual([]);

      const { data: teacherRows, error: teacherReadError } = await h.teacher.client
        .from('registration_intake')
        .select('id')
        .eq('id', intakeId as string);
      expectNoSupabaseError(teacherReadError, 'non-admin member intake select should not error');
      expect(teacherRows).toEqual([]);

      const { data: financeRows, error: financeReadError } = await h.finance.client
        .from('registration_intake')
        .select('id')
        .eq('id', intakeId as string);
      expectNoSupabaseError(financeReadError, 'finance-capable non-admin intake select should not error');
      expect(financeRows).toEqual([]);

      const { data: crossRows, error: crossReadError } = await h.crossOrg.client
        .from('registration_intake')
        .select('id')
        .eq('id', intakeId as string);
      expectNoSupabaseError(crossReadError, 'cross-org intake select should not error');
      expect(crossRows).toEqual([]);

      const { data: adminRows, error: adminReadError } = await h.admin.client
        .from('registration_intake')
        .select('id, org_id, status, student_full_name, consent_accepted')
        .in('id', [intakeId as string, crossOrgIntakeId])
        .order('id');
      expectNoSupabaseError(adminReadError, 'admin should read own-org intake queue rows');
      expect(adminRows).toEqual([
        {
          id: intakeId,
          org_id: config.orgId,
          status: 'PENDING',
          student_full_name: 'RLS Harness Intake Student',
          consent_accepted: true,
        },
      ]);

      const { error: adminUpdateError } = await h.admin.client
        .from('registration_intake')
        .update({
          status: 'IN_REVIEW',
          reviewed_by: h.admin.userId,
          reviewed_at: new Date().toISOString(),
          updated_by: 'rls-live-harness',
        })
        .eq('id', intakeId as string);
      expectNoSupabaseError(adminUpdateError, 'admin should update intake review status');

      const { error: teacherUpdateError } = await h.teacher.client
        .from('registration_intake')
        .update({ status: 'REJECTED' })
        .eq('id', intakeId as string);
      if (teacherUpdateError) {
        expectRlsDenied(teacherUpdateError, 'non-admin member should not update intake review rows');
      }

      const { data: reviewedRow, error: reviewedReadError } = await h.admin.client
        .from('registration_intake')
        .select('status')
        .eq('id', intakeId as string)
        .maybeSingle();
      expectNoSupabaseError(reviewedReadError, 'admin should verify non-admin update did not mutate intake');
      expect(reviewedRow?.status).toBe('IN_REVIEW');
    }, LIVE_RLS_TIMEOUT_MS);
  });
}
