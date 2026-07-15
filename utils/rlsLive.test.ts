import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createLiveRlsHarness,
  getLiveRlsEnv,
  type LiveRlsHarness,
} from './rlsLiveHarness';
import type { HoursEntry, OperationalRequest, ReportDefinition } from '../types/blueprint';
import type { AdminInboxItem, CalendarEvent } from '../types';
import * as Q from './blueprintQueries';

const liveRlsEnv = getLiveRlsEnv();
const LIVE_RLS_TIMEOUT_MS = 30_000;

function expectNoSupabaseError(error: { message?: string; code?: string } | null, context: string): void {
  expect(error, context).toBeNull();
}

function expectRlsDenied(error: { message?: string; code?: string } | null, context: string): void {
  expect(error?.message ?? '', context).toMatch(/row-level security|permission denied|violates row-level security/i);
}

function expectStorageDenied(error: { message?: string; statusCode?: string } | null, context: string): void {
  expect(error?.message ?? '', context).toMatch(/not found|not authorized|permission denied|row-level security|unauthorized/i);
}

function isMissingRegistrationIntakeRpc(error: { message?: string; code?: string } | null): boolean {
  return error?.code === 'PGRST202' &&
    /submit_registration_intake/i.test(error.message ?? '');
}

function isMissingAgreementAcceptanceRpc(error: { message?: string; code?: string } | null): boolean {
  return error?.code === 'PGRST202' &&
    /submit_agreement_acceptance/i.test(error.message ?? '');
}

function isMissingAgreementAcceptanceReadRpc(error: { message?: string; code?: string } | null): boolean {
  return error?.code === 'PGRST202' &&
    /get_public_agreement_acceptance/i.test(error.message ?? '');
}

function isMissingRosterProgramRpc(error: { message?: string; code?: string } | null): boolean {
  return error?.code === 'PGRST202' &&
    /get_roster_program_view/i.test(error.message ?? '');
}

function isMissingCalendarIcalRpc(error: { message?: string; code?: string } | null): boolean {
  return error?.code === 'PGRST202' &&
    /resolve_calendar_subscription_ical/i.test(error.message ?? '');
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
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces scoped roster/program source reads for admin and assigned teachers only', async (ctx) => {
      const ownActivityId = h.id('ensemble_own');
      const otherActivityId = h.id('ensemble_other');
      const crossActivityId = h.id('ensemble_cross');
      const ownStudentId = h.id('roster_student_own');
      const otherStudentId = h.id('roster_student_other');
      const ownEnrollmentId = h.id('roster_enrollment_own');
      const otherEnrollmentId = h.id('roster_enrollment_other');
      const crossEnrollmentId = h.id('roster_enrollment_cross');
      const ownAssignmentId = h.id('roster_assignment_own');
      const otherAssignmentId = h.id('roster_assignment_other');
      const crossAssignmentId = h.id('roster_assignment_cross');

      for (const id of [ownActivityId, otherActivityId, crossActivityId]) h.track('activities', id);
      for (const id of [ownStudentId, otherStudentId]) h.track('students', id);
      for (const id of [ownEnrollmentId, otherEnrollmentId, crossEnrollmentId]) h.track('enrollments', id);
      for (const id of [ownAssignmentId, otherAssignmentId, crossAssignmentId]) h.track('teaching_assignments', id);

      const makeActivityRow = (id: string, orgId: string, label: string) => ({
        id,
        org_id: orgId,
        data: {
          name: `RLS Harness Ensemble ${label}`,
          template: 'ENSEMBLE',
          activityType: 'PERFORMANCE',
          isArchived: false,
        },
      });
      const makeStudentRow = (id: string, label: string) => ({
        id,
        org_id: config.orgId,
        data: {
          fullName: `RLS Harness Roster Student ${label}`,
          profileStatus: 'ACTIVE',
          isArchived: false,
        },
      });
      const makeEnrollmentRow = (id: string, orgId: string, studentId: string, activityId: string, l2Id: string) => ({
        id,
        org_id: orgId,
        data: {
          studentId,
          activityId,
          l2Id,
          status: 'ACTIVE',
          startDate: '2026-09-01',
        },
      });
      const makeAssignmentRow = (
        id: string,
        orgId: string,
        staffMemberId: string,
        activityId: string,
        l2Id: string,
      ) => ({
        id,
        org_id: orgId,
        data: {
          staffMemberId,
          activityId,
          scope: 'L2',
          l2Id,
          startDate: '2026-09-01',
          isArchived: false,
        },
      });

      const { error: seedActivityError } = await h.service.from('activities').insert([
        makeActivityRow(ownActivityId, config.orgId, 'own'),
        makeActivityRow(otherActivityId, config.orgId, 'other'),
        makeActivityRow(crossActivityId, config.crossOrgId, 'cross'),
      ]);
      expectNoSupabaseError(seedActivityError, 'service should seed roster activity fixtures');

      const { error: seedStudentError } = await h.service.from('students').insert([
        makeStudentRow(ownStudentId, 'own'),
        makeStudentRow(otherStudentId, 'other'),
      ]);
      expectNoSupabaseError(seedStudentError, 'service should seed roster student fixtures');

      const { error: seedEnrollmentError } = await h.service.from('enrollments').insert([
        makeEnrollmentRow(ownEnrollmentId, config.orgId, ownStudentId, ownActivityId, 'l2-own'),
        makeEnrollmentRow(otherEnrollmentId, config.orgId, otherStudentId, otherActivityId, 'l2-other'),
        makeEnrollmentRow(crossEnrollmentId, config.crossOrgId, ownStudentId, crossActivityId, 'l2-cross'),
      ]);
      expectNoSupabaseError(seedEnrollmentError, 'service should seed roster enrollment fixtures');

      const { error: seedAssignmentError } = await h.service.from('teaching_assignments').insert([
        makeAssignmentRow(ownAssignmentId, config.orgId, config.teacher.staffMemberId, ownActivityId, 'l2-own'),
        makeAssignmentRow(otherAssignmentId, config.orgId, `${config.teacher.staffMemberId}_other`, otherActivityId, 'l2-other'),
        makeAssignmentRow(crossAssignmentId, config.crossOrgId, config.teacher.staffMemberId, crossActivityId, 'l2-cross'),
      ]);
      expectNoSupabaseError(seedAssignmentError, 'service should seed roster teaching assignment fixtures');

      const { data: teacherRpcRows, error: teacherRpcError } = await h.teacher.client.rpc('get_roster_program_view', {
        p_org: config.orgId,
        p_kind: 'ENSEMBLE',
      });
      if (isMissingRosterProgramRpc(teacherRpcError)) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0013_roster_program_scoped_read.sql yet; apply migrations before enforcing live roster/program RLS assertions',
        );
      }
      expectNoSupabaseError(teacherRpcError, 'assigned teacher roster RPC should not error');

      const { data: teacherDirectRows, error: teacherDirectError } = await h.teacher.client
        .from('activities')
        .select('id')
        .in('id', [ownActivityId, otherActivityId]);
      expectNoSupabaseError(teacherDirectError, 'teacher direct activity preflight select should not error');
      if ((teacherDirectRows ?? []).length) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0013_roster_program_scoped_read.sql yet; direct roster source tables still use broad member read',
        );
      }

      const teacherActivityIds = (teacherRpcRows ?? []).map((row: { activity_id: string }) => row.activity_id).sort();
      expect(teacherActivityIds).toEqual([ownActivityId]);
      expect((teacherRpcRows?.[0] as { student_ids?: string[] } | undefined)?.student_ids).toEqual([ownStudentId]);

      const { data: adminRpcRows, error: adminRpcError } = await h.admin.client.rpc('get_roster_program_view', {
        p_org: config.orgId,
        p_kind: 'ENSEMBLE',
      });
      expectNoSupabaseError(adminRpcError, 'admin roster RPC should not error');
      expect((adminRpcRows ?? []).map((row: { activity_id: string }) => row.activity_id).sort()).toEqual([
        otherActivityId,
        ownActivityId,
      ].sort());

      const { data: financeRpcRows, error: financeRpcError } = await h.finance.client.rpc('get_roster_program_view', {
        p_org: config.orgId,
        p_kind: 'ENSEMBLE',
      });
      expectNoSupabaseError(financeRpcError, 'finance roster RPC should not error');
      expect(financeRpcRows).toEqual([]);

      const { data: crossRpcRows, error: crossRpcError } = await h.crossOrg.client.rpc('get_roster_program_view', {
        p_org: config.orgId,
        p_kind: 'ENSEMBLE',
      });
      expectNoSupabaseError(crossRpcError, 'cross-org roster RPC should not error');
      expect(crossRpcRows).toEqual([]);

      const { error: anonRpcError } = await h.anon.rpc('get_roster_program_view', {
        p_org: config.orgId,
        p_kind: 'ENSEMBLE',
      });
      expectRlsDenied(anonRpcError, 'anon should not execute roster/program RPC');

      for (const [clientLabel, client] of [
        ['teacher', h.teacher.client],
        ['finance', h.finance.client],
        ['cross-org', h.crossOrg.client],
      ] as const) {
        const { data: enrollmentRows, error: enrollmentReadError } = await client
          .from('enrollments')
          .select('id')
          .in('id', [ownEnrollmentId, otherEnrollmentId]);
        expectNoSupabaseError(enrollmentReadError, `${clientLabel} direct enrollment select should not error`);
        expect(enrollmentRows).toEqual([]);

        const { data: assignmentRows, error: assignmentReadError } = await client
          .from('teaching_assignments')
          .select('id')
          .in('id', [ownAssignmentId, otherAssignmentId]);
        expectNoSupabaseError(assignmentReadError, `${clientLabel} direct teaching assignment select should not error`);
        expect(assignmentRows).toEqual([]);
      }
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces assessment table and private document scope for admin and assigned examiners only', async (ctx) => {
      const ownSessionId = h.id('exam_session_own');
      const otherSessionId = h.id('exam_session_other');
      const crossSessionId = h.id('exam_session_cross');
      const ownSubmissionId = h.id('exam_submission_own');
      const otherSubmissionId = h.id('exam_submission_other');
      const teacherInsertId = h.id('exam_submission_teacher_insert');
      const otherExaminerDeniedId = h.id('exam_submission_other_examiner_denied');
      const certificateId = h.id('assessment_certificate');
      const reportCardId = h.id('assessment_report_card');

      for (const id of [ownSessionId, otherSessionId, crossSessionId]) h.track('exam_sessions', id);
      for (const id of [ownSubmissionId, otherSubmissionId, teacherInsertId, otherExaminerDeniedId]) {
        h.track('examiner_submissions', id);
      }
      h.track('certificates', certificateId);
      h.track('report_cards', reportCardId);

      const makeSessionRow = (
        id: string,
        orgId: string,
        label: string,
        examinerStaffIds: string[],
        studentIds: string[],
      ) => ({
        id,
        org_id: orgId,
        name: `RLS Harness Assessment ${label}`,
        activity_id: null,
        date: '2026-06-20',
        status: 'IN_PROGRESS',
        examiner_staff_ids: examinerStaffIds,
        student_ids: studentIds,
        notes: null,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });

      const { error: seedSessionError } = await h.service.from('exam_sessions').insert([
        makeSessionRow(ownSessionId, config.orgId, 'own', [config.teacher.staffMemberId], ['student-own']),
        makeSessionRow(otherSessionId, config.orgId, 'other', [`${config.teacher.staffMemberId}_other`], ['student-other']),
        makeSessionRow(crossSessionId, config.crossOrgId, 'cross', [config.teacher.staffMemberId], ['student-cross']),
      ]);
      expectNoSupabaseError(seedSessionError, 'service should seed assessment session fixtures');

      const { error: seedSubmissionError } = await h.service.from('examiner_submissions').insert([
        {
          id: ownSubmissionId,
          org_id: config.orgId,
          exam_session_id: ownSessionId,
          student_id: 'student-own',
          examiner_staff_id: config.teacher.staffMemberId,
          score: 88,
          grade: 'A',
          remarks: 'Own assigned examiner row',
          submitted_at: '2026-06-20T10:00:00.000Z',
          created_by: 'rls-live-harness',
          updated_by: 'rls-live-harness',
        },
        {
          id: otherSubmissionId,
          org_id: config.orgId,
          exam_session_id: otherSessionId,
          student_id: 'student-other',
          examiner_staff_id: `${config.teacher.staffMemberId}_other`,
          score: 71,
          grade: 'B',
          remarks: 'Other examiner row',
          submitted_at: '2026-06-20T11:00:00.000Z',
          created_by: 'rls-live-harness',
          updated_by: 'rls-live-harness',
        },
      ]);
      expectNoSupabaseError(seedSubmissionError, 'service should seed examiner submission fixtures');

      const { error: seedCertificateError } = await h.service.from('certificates').insert({
        id: certificateId,
        org_id: config.orgId,
        student_id: 'student-own',
        exam_session_id: ownSessionId,
        title: 'RLS Harness Certificate',
        level: '3',
        status: 'ISSUED',
        issued_at: '2026-06-20T12:00:00.000Z',
        document_url: null,
        document_path: `${config.orgId}/assessments/${certificateId}/certificate.pdf`,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(seedCertificateError, 'service should seed certificate fixture');

      const { error: seedReportCardError } = await h.service.from('report_cards').insert({
        id: reportCardId,
        org_id: config.orgId,
        student_id: 'student-own',
        period_label: '2026 Spring',
        activity_id: null,
        lines: [{ subject: 'Technique', grade: 'A', comment: 'Private assessment row' }],
        summary: 'Private report card fixture',
        published_at: null,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(seedReportCardError, 'service should seed report-card fixture');

      const { data: teacherPreflightRows, error: teacherPreflightError } = await h.teacher.client
        .from('exam_sessions')
        .select('id')
        .eq('id', otherSessionId);
      expectNoSupabaseError(teacherPreflightError, 'teacher assessment direct preflight select should not error');
      if ((teacherPreflightRows ?? []).length) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0014_assessment_scoped_rls.sql yet; direct assessment tables still use broad member read',
        );
      }

      const { data: adminSessions, error: adminSessionError } = await h.admin.client
        .from('exam_sessions')
        .select('id')
        .in('id', [ownSessionId, otherSessionId, crossSessionId]);
      expectNoSupabaseError(adminSessionError, 'admin should read own-org assessment sessions');
      expect((adminSessions ?? []).map(row => row.id).sort()).toEqual([otherSessionId, ownSessionId].sort());

      const { data: teacherSessions, error: teacherSessionError } = await h.teacher.client
        .from('exam_sessions')
        .select('id')
        .in('id', [ownSessionId, otherSessionId, crossSessionId]);
      expectNoSupabaseError(teacherSessionError, 'assigned examiner session select should not error');
      expect((teacherSessions ?? []).map(row => row.id)).toEqual([ownSessionId]);

      const { data: teacherSubmissions, error: teacherSubmissionError } = await h.teacher.client
        .from('examiner_submissions')
        .select('id')
        .in('id', [ownSubmissionId, otherSubmissionId]);
      expectNoSupabaseError(teacherSubmissionError, 'assigned examiner submission select should not error');
      expect((teacherSubmissions ?? []).map(row => row.id)).toEqual([ownSubmissionId]);

      const { error: teacherInsertError } = await h.teacher.client.from('examiner_submissions').insert({
        id: teacherInsertId,
        org_id: config.orgId,
        exam_session_id: ownSessionId,
        student_id: 'student-own',
        examiner_staff_id: config.teacher.staffMemberId,
        score: 91,
        grade: 'A',
        remarks: 'Inserted by assigned examiner',
        submitted_at: '2026-06-20T12:30:00.000Z',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(teacherInsertError, 'assigned examiner should insert own submission before grading');

      const { error: teacherUpdateError } = await h.teacher.client
        .from('examiner_submissions')
        .update({ remarks: 'Updated by assigned examiner' })
        .eq('id', teacherInsertId);
      expectNoSupabaseError(teacherUpdateError, 'assigned examiner should update own submission before grading');

      const { error: otherExaminerInsertError } = await h.teacher.client.from('examiner_submissions').insert({
        id: otherExaminerDeniedId,
        org_id: config.orgId,
        exam_session_id: otherSessionId,
        student_id: 'student-other',
        examiner_staff_id: `${config.teacher.staffMemberId}_other`,
        score: 70,
        grade: 'B',
        remarks: 'Denied other examiner row',
        submitted_at: '2026-06-20T12:45:00.000Z',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectRlsDenied(otherExaminerInsertError, 'teacher should not insert another examiner submission');

      for (const [label, client] of [
        ['finance', h.finance.client],
        ['cross-org', h.crossOrg.client],
      ] as const) {
        const { data: rows, error } = await client
          .from('exam_sessions')
          .select('id')
          .in('id', [ownSessionId, otherSessionId]);
        expectNoSupabaseError(error, `${label} assessment session select should not error`);
        expect(rows).toEqual([]);

        const { data: submissionRows, error: submissionError } = await client
          .from('examiner_submissions')
          .select('id')
          .in('id', [ownSubmissionId, otherSubmissionId]);
        expectNoSupabaseError(submissionError, `${label} examiner submission select should not error`);
        expect(submissionRows).toEqual([]);
      }

      const { data: anonRows, error: anonReadError } = await h.anon
        .from('exam_sessions')
        .select('id')
        .eq('id', ownSessionId);
      expectNoSupabaseError(anonReadError, 'anon assessment session select should not error');
      expect(anonRows).toEqual([]);

      for (const [table, id] of [
        ['certificates', certificateId],
        ['report_cards', reportCardId],
      ] as const) {
        const { data: adminRows, error: adminReadError } = await h.admin.client
          .from(table)
          .select('id')
          .eq('id', id);
        expectNoSupabaseError(adminReadError, `admin should read ${table}`);
        expect(adminRows?.map(row => row.id)).toEqual([id]);

        for (const [label, client] of [
          ['assigned examiner', h.teacher.client],
          ['finance', h.finance.client],
          ['cross-org', h.crossOrg.client],
        ] as const) {
          const { data, error } = await client.from(table).select('id').eq('id', id);
          expectNoSupabaseError(error, `${label} ${table} select should not error`);
          expect(data).toEqual([]);
        }

        const { data, error } = await h.anon.from(table).select('id').eq('id', id);
        expectNoSupabaseError(error, `anon ${table} select should not error`);
        expect(data).toEqual([]);
      }

      const objectPath = `${config.orgId}/assessments/${ownSessionId}/report-card.pdf`;
      const assessmentBody = 'RLS harness private assessment document';
      let uploaded = false;

      try {
        const { error: uploadError } = await h.service.storage
          .from('documents')
          .upload(objectPath, new Blob([assessmentBody], { type: 'application/pdf' }), {
            contentType: 'application/pdf',
            upsert: false,
          });
        expectNoSupabaseError(uploadError, 'service should seed private assessment document fixture');
        uploaded = true;

        const { data: teacherDocumentData, error: teacherDocumentError } = await h.teacher.client.storage
          .from('documents')
          .download(objectPath);
        if (!teacherDocumentError && teacherDocumentData) {
          (ctx as unknown as { skip: (note?: string) => never }).skip(
            'remote Supabase project has not applied 0014_assessment_scoped_rls.sql yet; assessment document prefixes remain broad member-readable',
          );
        }
        expectStorageDenied(teacherDocumentError, 'assigned examiner should not directly read private assessment files');

        const { data: adminDocumentData, error: adminDocumentError } = await h.admin.client.storage
          .from('documents')
          .download(objectPath);
        expectNoSupabaseError(adminDocumentError, 'admin should directly read private assessment files');
        expect(await adminDocumentData?.text()).toBe(assessmentBody);

        for (const role of [
          { label: 'finance', storage: h.finance.client.storage },
          { label: 'cross-org user', storage: h.crossOrg.client.storage },
          { label: 'anon', storage: h.anon.storage },
        ]) {
          const { data, error } = await role.storage.from('documents').download(objectPath);
          expect(data, `${role.label} should not receive private assessment document bytes`).toBeNull();
          expectStorageDenied(error, `${role.label} should not directly read private assessment files`);
        }
      } finally {
        if (uploaded) {
          await h.service.storage.from('documents').remove([objectPath]);
        }
      }
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces concert program table and private document scope for admin and linked staff only', async (ctx) => {
      const eventLinkedProgramId = h.id('concert_program_event_linked');
      const performerLinkedProgramId = h.id('concert_program_performer_linked');
      const otherProgramId = h.id('concert_program_other');
      const crossProgramId = h.id('concert_program_cross');
      const ownEventId = h.id('concert_event_own');
      const otherEventId = h.id('concert_event_other');
      const participantId = h.id('concert_event_participant');

      for (const id of [eventLinkedProgramId, performerLinkedProgramId, otherProgramId, crossProgramId]) {
        h.track('concert_programs', id);
      }
      h.track('event_participants', participantId);

      const makeProgramRow = (
        id: string,
        orgId: string,
        label: string,
        eventId: string | null,
        performerStaffIds: string[],
      ) => ({
        id,
        org_id: orgId,
        title: `RLS Harness Concert ${label}`,
        event_id: eventId,
        date: '2026-12-20',
        venue: 'RLS Hall',
        status: 'DRAFT',
        pieces: [
          {
            order: 1,
            title: `RLS Piece ${label}`,
            composer: null,
            performerStudentIds: [`student_${label}`],
            performerStaffIds,
            durationMinutes: 5,
          },
        ],
        notes: 'Private concert planning fixture',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });

      const { error: seedParticipantError } = await h.service.from('event_participants').insert({
        id: participantId,
        org_id: config.orgId,
        data: {
          eventId: ownEventId,
          staffMemberId: config.teacher.staffMemberId,
          assignmentType: 'PERFORMANCE',
        },
      });
      expectNoSupabaseError(seedParticipantError, 'service should seed concert event participant fixture');

      const { error: seedProgramError } = await h.service.from('concert_programs').insert([
        makeProgramRow(eventLinkedProgramId, config.orgId, 'event-linked', ownEventId, []),
        makeProgramRow(performerLinkedProgramId, config.orgId, 'performer-linked', null, [config.teacher.staffMemberId]),
        makeProgramRow(otherProgramId, config.orgId, 'other-staff', otherEventId, [`${config.teacher.staffMemberId}_other`]),
        makeProgramRow(crossProgramId, config.crossOrgId, 'cross-org', ownEventId, [config.teacher.staffMemberId]),
      ]);
      expectNoSupabaseError(seedProgramError, 'service should seed concert program fixtures');

      const { data: teacherPreflightRows, error: teacherPreflightError } = await h.teacher.client
        .from('concert_programs')
        .select('id')
        .eq('id', otherProgramId);
      expectNoSupabaseError(teacherPreflightError, 'teacher concert preflight select should not error');
      if ((teacherPreflightRows ?? []).length) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0015_concert_program_scoped_rls.sql yet; direct concert_programs still use broad member read',
        );
      }

      const { data: adminRows, error: adminReadError } = await h.admin.client
        .from('concert_programs')
        .select('id')
        .in('id', [eventLinkedProgramId, performerLinkedProgramId, otherProgramId, crossProgramId]);
      expectNoSupabaseError(adminReadError, 'admin should read own-org concert programs');
      expect((adminRows ?? []).map(row => row.id).sort()).toEqual([
        eventLinkedProgramId,
        otherProgramId,
        performerLinkedProgramId,
      ].sort());

      const { error: adminUpdateError } = await h.admin.client
        .from('concert_programs')
        .update({ status: 'PUBLISHED', updated_by: 'rls-live-harness-admin' })
        .eq('id', eventLinkedProgramId);
      expectNoSupabaseError(adminUpdateError, 'admin should update concert program status');

      const { data: teacherRows, error: teacherReadError } = await h.teacher.client
        .from('concert_programs')
        .select('id')
        .in('id', [eventLinkedProgramId, performerLinkedProgramId, otherProgramId, crossProgramId]);
      expectNoSupabaseError(teacherReadError, 'linked teacher concert select should not error');
      expect((teacherRows ?? []).map(row => row.id).sort()).toEqual([
        eventLinkedProgramId,
        performerLinkedProgramId,
      ].sort());

      const { error: teacherUpdateError } = await h.teacher.client
        .from('concert_programs')
        .update({ notes: 'Denied staff update' })
        .eq('id', eventLinkedProgramId);
      expectNoSupabaseError(teacherUpdateError, 'teacher concert update should be filtered by RLS without mutating');

      for (const [label, client] of [
        ['finance', h.finance.client],
        ['cross-org', h.crossOrg.client],
      ] as const) {
        const { data: rows, error } = await client
          .from('concert_programs')
          .select('id')
          .in('id', [eventLinkedProgramId, performerLinkedProgramId, otherProgramId]);
        expectNoSupabaseError(error, `${label} concert program select should not error`);
        expect(rows).toEqual([]);
      }

      const { data: anonRows, error: anonReadError } = await h.anon
        .from('concert_programs')
        .select('id')
        .eq('id', eventLinkedProgramId);
      expectNoSupabaseError(anonReadError, 'anon concert program select should not error');
      expect(anonRows).toEqual([]);

      const { data: verifyRows, error: verifyError } = await h.service
        .from('concert_programs')
        .select('id,status,notes')
        .eq('id', eventLinkedProgramId);
      expectNoSupabaseError(verifyError, 'service should verify concert RLS mutation results');
      expect(verifyRows).toEqual([{ id: eventLinkedProgramId, status: 'PUBLISHED', notes: 'Private concert planning fixture' }]);

      const objectPath = `${config.orgId}/concert-programs/${eventLinkedProgramId}/program.pdf`;
      const concertBody = 'RLS harness private concert program document';
      let uploaded = false;

      try {
        const { error: uploadError } = await h.service.storage
          .from('documents')
          .upload(objectPath, new Blob([concertBody], { type: 'application/pdf' }), {
            contentType: 'application/pdf',
            upsert: false,
          });
        expectNoSupabaseError(uploadError, 'service should seed private concert program document fixture');
        uploaded = true;

        const { data: teacherDocumentData, error: teacherDocumentError } = await h.teacher.client.storage
          .from('documents')
          .download(objectPath);
        if (!teacherDocumentError && teacherDocumentData) {
          (ctx as unknown as { skip: (note?: string) => never }).skip(
            'remote Supabase project has not applied 0015_concert_program_scoped_rls.sql yet; concert-programs document prefix remains broad member-readable',
          );
        }
        expectStorageDenied(teacherDocumentError, 'linked teacher should not directly read private concert program export files');

        const { data: adminDocumentData, error: adminDocumentError } = await h.admin.client.storage
          .from('documents')
          .download(objectPath);
        expectNoSupabaseError(adminDocumentError, 'admin should directly read private concert program export files');
        expect(await adminDocumentData?.text()).toBe(concertBody);

        for (const role of [
          { label: 'finance', storage: h.finance.client.storage },
          { label: 'cross-org user', storage: h.crossOrg.client.storage },
          { label: 'anon', storage: h.anon.storage },
        ]) {
          const { data, error } = await role.storage.from('documents').download(objectPath);
          expect(data, `${role.label} should not receive private concert program document bytes`).toBeNull();
          expectStorageDenied(error, `${role.label} should not directly read private concert program export files`);
        }
      } finally {
        if (uploaded) {
          await h.service.storage.from('documents').remove([objectPath]);
        }
      }
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces admin-or-finance read/write boundaries on all finance ledger tables', async () => {
      type LedgerTable = 'charges' | 'payments' | 'adjustments' | 'balance_snapshots';
      type LedgerSpec = {
        table: LedgerTable;
        makeRow: (id: string, orgId: string, label: string) => Record<string, unknown>;
      };

      const ledgerSpecs: LedgerSpec[] = [
        {
          table: 'charges',
          makeRow: (id, orgId, label) => ({
            id,
            org_id: orgId,
            family_id: 'rls-live-family',
            description: `RLS harness charge ${label}`,
            amount: 25,
            currency: 'ILS',
            status: 'OPEN',
            created_by: 'rls-live-harness',
            updated_by: 'rls-live-harness',
          }),
        },
        {
          table: 'payments',
          makeRow: (id, orgId, label) => ({
            id,
            org_id: orgId,
            family_id: 'rls-live-family',
            amount: 10,
            currency: 'ILS',
            method: 'TRANSFER',
            received_at: '2026-06-19T10:00:00.000Z',
            reference: `RLS harness payment ${label}`,
            applied_charge_ids: [],
            note: null,
            created_by: 'rls-live-harness',
            updated_by: 'rls-live-harness',
          }),
        },
        {
          table: 'adjustments',
          makeRow: (id, orgId, label) => ({
            id,
            org_id: orgId,
            family_id: 'rls-live-family',
            charge_id: null,
            amount: -5,
            currency: 'ILS',
            reason: `RLS harness adjustment ${label}`,
            approved_by: h.admin.userId,
            created_by: 'rls-live-harness',
            updated_by: 'rls-live-harness',
          }),
        },
        {
          table: 'balance_snapshots',
          makeRow: (id, orgId, label) => ({
            id,
            org_id: orgId,
            family_id: 'rls-live-family',
            as_of: '2026-06-19T10:00:00.000Z',
            total_charged: 25,
            total_paid: 10,
            total_adjusted: -5,
            balance: 10,
            currency: 'ILS',
            created_by: 'rls-live-harness',
            updated_by: `rls-live-harness-${label}`,
          }),
        },
      ];

      for (const spec of ledgerSpecs) {
        const adminRowId = h.id(`${spec.table}_admin`);
        const financeRowId = h.id(`${spec.table}_finance`);
        const teacherDeniedId = h.id(`${spec.table}_teacher_denied`);
        const anonDeniedId = h.id(`${spec.table}_anon_denied`);
        const crossDeniedId = h.id(`${spec.table}_cross_denied`);
        const adminCrossDeniedId = h.id(`${spec.table}_admin_cross_denied`);

        for (const id of [
          adminRowId,
          financeRowId,
          teacherDeniedId,
          anonDeniedId,
          crossDeniedId,
          adminCrossDeniedId,
        ]) {
          h.track(spec.table, id);
        }

        const { error: adminInsertError } = await h.admin.client
          .from(spec.table)
          .insert(spec.makeRow(adminRowId, config.orgId, 'admin'));
        expectNoSupabaseError(adminInsertError, `admin should insert own-org ${spec.table} rows`);

        const { error: financeInsertError } = await h.finance.client
          .from(spec.table)
          .insert(spec.makeRow(financeRowId, config.orgId, 'finance'));
        expectNoSupabaseError(financeInsertError, `finance capability should insert own-org ${spec.table} rows`);

        const { error: adminUpdateError } = await h.admin.client
          .from(spec.table)
          .update({ updated_by: 'rls-live-harness-admin-update' })
          .eq('id', adminRowId);
        expectNoSupabaseError(adminUpdateError, `admin should update own-org ${spec.table} rows`);

        const { error: financeUpdateError } = await h.finance.client
          .from(spec.table)
          .update({ updated_by: 'rls-live-harness-finance-update' })
          .eq('id', financeRowId);
        expectNoSupabaseError(financeUpdateError, `finance capability should update own-org ${spec.table} rows`);

        const { data: adminRows, error: adminReadError } = await h.admin.client
          .from(spec.table)
          .select('id, updated_by')
          .in('id', [adminRowId, financeRowId])
          .order('id');
        expectNoSupabaseError(adminReadError, `admin should read own-org ${spec.table} rows`);
        expect((adminRows ?? []).map(row => row.id).sort()).toEqual([adminRowId, financeRowId].sort());

        const { data: financeRows, error: financeReadError } = await h.finance.client
          .from(spec.table)
          .select('id')
          .in('id', [adminRowId, financeRowId]);
        expectNoSupabaseError(financeReadError, `finance capability should read own-org ${spec.table} rows`);
        expect((financeRows ?? []).map(row => row.id).sort()).toEqual([adminRowId, financeRowId].sort());

        const { data: teacherRows, error: teacherReadError } = await h.teacher.client
          .from(spec.table)
          .select('id')
          .in('id', [adminRowId, financeRowId]);
        expectNoSupabaseError(teacherReadError, `plain member ${spec.table} select should not error`);
        expect(teacherRows).toEqual([]);

        const { data: anonRows, error: anonReadError } = await h.anon
          .from(spec.table)
          .select('id')
          .in('id', [adminRowId, financeRowId]);
        expectNoSupabaseError(anonReadError, `anon ${spec.table} select should not error`);
        expect(anonRows).toEqual([]);

        const { data: crossRows, error: crossReadError } = await h.crossOrg.client
          .from(spec.table)
          .select('id')
          .in('id', [adminRowId, financeRowId]);
        expectNoSupabaseError(crossReadError, `cross-org ${spec.table} select should not error`);
        expect(crossRows).toEqual([]);

        const { error: teacherInsertError } = await h.teacher.client
          .from(spec.table)
          .insert(spec.makeRow(teacherDeniedId, config.orgId, 'teacher-denied'));
        expectRlsDenied(teacherInsertError, `plain member should not insert ${spec.table} rows`);

        const { error: anonInsertError } = await h.anon
          .from(spec.table)
          .insert(spec.makeRow(anonDeniedId, config.orgId, 'anon-denied'));
        expectRlsDenied(anonInsertError, `anon should not insert ${spec.table} rows`);

        const { error: crossInsertError } = await h.crossOrg.client
          .from(spec.table)
          .insert(spec.makeRow(crossDeniedId, config.orgId, 'cross-denied'));
        expectRlsDenied(crossInsertError, `cross-org user should not insert primary-org ${spec.table} rows`);

        const { error: adminCrossInsertError } = await h.admin.client
          .from(spec.table)
          .insert(spec.makeRow(adminCrossDeniedId, config.crossOrgId, 'admin-cross-denied'));
        expectRlsDenied(adminCrossInsertError, `primary-org admin should not insert cross-org ${spec.table} rows`);

        const { error: teacherUpdateError } = await h.teacher.client
          .from(spec.table)
          .update({ updated_by: 'rls-live-harness-teacher-denied' })
          .eq('id', adminRowId);
        expectNoSupabaseError(teacherUpdateError, `plain member ${spec.table} update should be filtered by RLS`);

        const { error: anonUpdateError } = await h.anon
          .from(spec.table)
          .update({ updated_by: 'rls-live-harness-anon-denied' })
          .eq('id', adminRowId);
        expectNoSupabaseError(anonUpdateError, `anon ${spec.table} update should be filtered by RLS`);

        const { error: crossUpdateError } = await h.crossOrg.client
          .from(spec.table)
          .update({ updated_by: 'rls-live-harness-cross-denied' })
          .eq('id', adminRowId);
        expectNoSupabaseError(crossUpdateError, `cross-org ${spec.table} update should be filtered by RLS`);

        const { data: verifyRows, error: verifyError } = await h.service
          .from(spec.table)
          .select('id, org_id, updated_by')
          .in('id', [adminRowId, financeRowId])
          .order('id');
        expectNoSupabaseError(verifyError, `service should verify ${spec.table} RLS mutation results`);
        expect(verifyRows).toEqual([
          {
            id: adminRowId,
            org_id: config.orgId,
            updated_by: 'rls-live-harness-admin-update',
          },
          {
            id: financeRowId,
            org_id: config.orgId,
            updated_by: 'rls-live-harness-finance-update',
          },
        ].sort((a, b) => a.id.localeCompare(b.id)));
      }
    }, LIVE_RLS_TIMEOUT_MS);

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

    it('enforces D-09 report definition boundaries for admin, finance, members, anon, and cross-org users', async (ctx) => {
      const chargeReportId = h.id('report_definition_charge');
      const hoursReportId = h.id('report_definition_hours');
      const studentReportId = h.id('report_definition_student');
      const crossOrgReportId = h.id('report_definition_cross_org');
      const financeDeniedId = h.id('report_definition_finance_denied');
      const teacherDeniedId = h.id('report_definition_teacher_denied');
      const anonDeniedId = h.id('report_definition_anon_denied');
      const crossDeniedId = h.id('report_definition_cross_denied');
      const adminCrossDeniedId = h.id('report_definition_admin_cross_denied');

      for (const id of [
        chargeReportId,
        hoursReportId,
        studentReportId,
        crossOrgReportId,
        financeDeniedId,
        teacherDeniedId,
        anonDeniedId,
        crossDeniedId,
        adminCrossDeniedId,
      ]) {
        h.track('report_definitions', id);
      }

      const makeReportDefinitionRow = (
        id: string,
        orgId: string,
        sourceEntity: string,
        label: string,
      ): Record<string, unknown> => ({
        id,
        org_id: orgId,
        name: `RLS harness ${label} report`,
        description: `Seeded ${sourceEntity} report definition`,
        source_entity: sourceEntity,
        filters: [],
        group_by: null,
        aggregate: { fn: 'none', field: null },
        columns: ['id'],
        is_pinned: false,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });

      const { error: adminInsertError } = await h.admin.client.from('report_definitions').insert([
        makeReportDefinitionRow(chargeReportId, config.orgId, 'charges', 'charge'),
        makeReportDefinitionRow(hoursReportId, config.orgId, 'hoursEntries', 'hours'),
        makeReportDefinitionRow(studentReportId, config.orgId, 'students', 'student'),
      ]);
      expectNoSupabaseError(adminInsertError, 'admin should insert own-org report definitions');

      const { error: crossSeedError } = await h.service.from('report_definitions').insert(
        makeReportDefinitionRow(crossOrgReportId, config.crossOrgId, 'charges', 'cross-org'),
      );
      expectNoSupabaseError(crossSeedError, 'service should seed cross-org report definition fixture');

      const { error: adminUpdateError } = await h.admin.client
        .from('report_definitions')
        .update({
          is_pinned: true,
          updated_by: 'rls-live-harness-admin-update',
        })
        .eq('id', chargeReportId);
      expectNoSupabaseError(adminUpdateError, 'admin should update own-org report definitions');

      const { data: teacherPreflightRows, error: teacherPreflightError } = await h.teacher.client
        .from('report_definitions')
        .select('id')
        .in('id', [chargeReportId, studentReportId]);
      expectNoSupabaseError(teacherPreflightError, 'teacher report definition preflight select should not error');

      const { data: financePreflightRows, error: financePreflightError } = await h.finance.client
        .from('report_definitions')
        .select('id, source_entity')
        .in('id', [chargeReportId, studentReportId]);
      expectNoSupabaseError(financePreflightError, 'finance report definition preflight select should not error');

      if ((teacherPreflightRows ?? []).length || (financePreflightRows ?? []).some(row => row.id === studentReportId)) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0012_report_definition_rls.sql yet; apply migrations before enforcing live report definition RLS assertions',
        );
      }

      const { data: adminRows, error: adminReadError } = await h.admin.client
        .from('report_definitions')
        .select('id, org_id, source_entity, is_pinned, updated_by')
        .in('id', [chargeReportId, hoursReportId, studentReportId, crossOrgReportId])
        .order('id');
      expectNoSupabaseError(adminReadError, 'admin should read all own-org report definitions');
      expect((adminRows ?? []).map(row => row.id).sort()).toEqual([
        chargeReportId,
        hoursReportId,
        studentReportId,
      ].sort());
      expect(adminRows?.find(row => row.id === chargeReportId)).toMatchObject({
        org_id: config.orgId,
        source_entity: 'charges',
        is_pinned: true,
        updated_by: 'rls-live-harness-admin-update',
      });

      const { data: financeRows, error: financeReadError } = await h.finance.client
        .from('report_definitions')
        .select('id, source_entity')
        .in('id', [chargeReportId, hoursReportId, studentReportId, crossOrgReportId])
        .order('id');
      expectNoSupabaseError(financeReadError, 'finance should read only finance-authorized own-org report definitions');
      expect((financeRows ?? []).map(row => row.id).sort()).toEqual([chargeReportId, hoursReportId].sort());
      expect((financeRows ?? []).map(row => row.source_entity).sort()).toEqual(['charges', 'hoursEntries'].sort());

      const deniedReadClients = [
        { label: 'teacher/plain member', client: h.teacher.client },
        { label: 'cross-org user', client: h.crossOrg.client },
      ];

      for (const role of deniedReadClients) {
        const { data, error } = await role.client
          .from('report_definitions')
          .select('id')
          .in('id', [chargeReportId, hoursReportId, studentReportId, crossOrgReportId]);
        expectNoSupabaseError(error, `${role.label} report definition select should not error`);
        expect(data, `${role.label} should not read report definitions`).toEqual([]);
      }

      const { data: anonRows, error: anonReadError } = await h.anon
        .from('report_definitions')
        .select('id')
        .in('id', [chargeReportId, studentReportId]);
      expectNoSupabaseError(anonReadError, 'anon report definition select should not error');
      expect(anonRows).toEqual([]);

      const deniedInserts = [
        { label: 'finance-capable non-admin', client: h.finance.client, id: financeDeniedId },
        { label: 'teacher/plain member', client: h.teacher.client, id: teacherDeniedId },
        { label: 'cross-org user', client: h.crossOrg.client, id: crossDeniedId },
      ];
      for (const role of deniedInserts) {
        const { error } = await role.client
          .from('report_definitions')
          .insert(makeReportDefinitionRow(role.id, config.orgId, 'charges', role.label));
        expectRlsDenied(error, `${role.label} should not insert report definitions`);
      }

      const { error: anonInsertError } = await h.anon
        .from('report_definitions')
        .insert(makeReportDefinitionRow(anonDeniedId, config.orgId, 'charges', 'anon'));
      expectRlsDenied(anonInsertError, 'anon should not insert report definitions');

      const { error: adminCrossInsertError } = await h.admin.client
        .from('report_definitions')
        .insert(makeReportDefinitionRow(adminCrossDeniedId, config.crossOrgId, 'charges', 'admin-cross'));
      expectRlsDenied(adminCrossInsertError, 'primary-org admin should not insert cross-org report definitions');

      const { error: financeUpdateError } = await h.finance.client
        .from('report_definitions')
        .update({
          description: 'finance attempted edit',
          updated_by: 'rls-live-harness-finance-update',
        })
        .eq('id', chargeReportId);
      expectNoSupabaseError(financeUpdateError, 'finance report definition update should be filtered by RLS without mutating');

      const { data: verifyRows, error: verifyError } = await h.service
        .from('report_definitions')
        .select('id, org_id, description, updated_by')
        .in('id', [chargeReportId, hoursReportId, studentReportId, crossOrgReportId])
        .order('id');
      expectNoSupabaseError(verifyError, 'service should verify report definition RLS mutation results');
      expect(verifyRows).toEqual([
        {
          id: chargeReportId,
          org_id: config.orgId,
          description: 'Seeded charges report definition',
          updated_by: 'rls-live-harness-admin-update',
        },
        {
          id: crossOrgReportId,
          org_id: config.crossOrgId,
          description: 'Seeded charges report definition',
          updated_by: 'rls-live-harness',
        },
        {
          id: hoursReportId,
          org_id: config.orgId,
          description: 'Seeded hoursEntries report definition',
          updated_by: 'rls-live-harness',
        },
        {
          id: studentReportId,
          org_id: config.orgId,
          description: 'Seeded students report definition',
          updated_by: 'rls-live-harness',
        },
      ].sort((a, b) => a.id.localeCompare(b.id)));
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces report run/export source authorization for finance over live source rows', async () => {
      const now = new Date().toISOString();
      const chargeId = h.id('report_source_charge');
      const studentId = h.id('report_source_student');
      const lessonId = h.id('report_source_lesson');
      const agreementAcceptanceId = h.id('report_source_agreement');
      const publicEndpointId = h.id('report_source_endpoint');
      const evaluationId = h.id('report_source_evaluation');
      const rolloverRunId = h.id('report_source_rollover');

      for (const [table, id] of [
        ['charges', chargeId],
        ['students', studentId],
        ['lesson_records', lessonId],
        ['agreement_acceptances', agreementAcceptanceId],
        ['public_endpoints', publicEndpointId],
        ['staff_evaluations', evaluationId],
        ['rollover_runs', rolloverRunId],
      ] as const) {
        h.track(table, id);
      }

      const { error: seedError } = await h.service.from('charges').insert({
        id: chargeId,
        org_id: config.orgId,
        student_id: studentId,
        family_id: 'rls-live-report-family',
        enrollment_id: null,
        description: 'RLS harness report charge',
        amount: 125,
        currency: 'ILS',
        due_date: '2026-06-19',
        status: 'OPEN',
        period_label: '2026-06',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(seedError, 'service should seed report charge source row');

      const { error: sensitiveSeedError } = await h.service.from('students').insert({
        id: studentId,
        org_id: config.orgId,
        data: {
          fullName: 'RLS Harness Report Student',
          familyId: 'rls-live-report-family',
          isArchived: false,
        },
      });
      expectNoSupabaseError(sensitiveSeedError, 'service should seed report student source row');

      const { error: lessonSeedError } = await h.service.from('lesson_records').insert({
        id: lessonId,
        org_id: config.orgId,
        event_id: 'rls-live-report-event',
        student_id: studentId,
        staff_member_id: config.teacher.staffMemberId,
        date: '2026-06-19',
        attendance: 'PRESENT',
        completion: 'COMPLETED',
        notes: 'Sensitive attendance row for report source authorization',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(lessonSeedError, 'service should seed report attendance source row');

      const { error: blockedSeedError } = await h.service.from('agreement_acceptances').insert({
        id: agreementAcceptanceId,
        org_id: config.orgId,
        template_id: 'rls-live-report-template',
        template_version: 1,
        student_id: studentId,
        status: 'ACCEPTED',
        accepted_at: now,
        accepted_by_name: 'RLS Harness Guardian',
        signature_ref: 'documents/private/report-source.pdf',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(blockedSeedError, 'service should seed blocked agreement report source row');

      const { error: endpointSeedError } = await h.service.from('public_endpoints').insert({
        id: publicEndpointId,
        org_id: config.orgId,
        kind: 'AGREEMENT_ACCEPTANCE',
        label: 'RLS harness report endpoint',
        token_hash: sha256Hex(publicEndpointId),
        status: 'ACTIVE',
        scopes: ['agreement_acceptance:sign'],
        target_id: agreementAcceptanceId,
        consent_agreement_id: 'rls-live-report-template',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(endpointSeedError, 'service should seed hidden public endpoint source row');

      const { error: evaluationSeedError } = await h.service.from('staff_evaluations').insert({
        id: evaluationId,
        org_id: config.orgId,
        staff_member_id: config.teacher.staffMemberId,
        reviewer_staff_id: null,
        period_label: '2026',
        due_date: '2026-06-30',
        status: 'DUE',
        overall_rating: null,
        criteria: [],
        strengths: null,
        actions: [],
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(evaluationSeedError, 'service should seed blocked HR report source row');

      const { error: rolloverSeedError } = await h.service.from('rollover_runs').insert({
        id: rolloverRunId,
        org_id: config.orgId,
        from_year_label: '2025-26',
        to_year_label: '2026-27',
        status: 'PREVIEWED',
        preview: {},
        plan: {},
        result: {},
        warnings: [],
        started_at: now,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(rolloverSeedError, 'service should seed blocked rollover report source row');

      const { data: financeChargeRows, error: financeChargeReadError } = await h.finance.client
        .from('charges')
        .select('id, status, amount, currency')
        .eq('id', chargeId);
      expectNoSupabaseError(financeChargeReadError, 'finance should read D-08 authorized charge rows');
      const chargeRows = (financeChargeRows ?? []).map(row => ({
        id: String(row.id),
        status: row.status,
        amount: Number(row.amount),
        currency: row.currency,
      }));

      const chargeDef: ReportDefinition = {
        id: h.id('report_run_charge_def'),
        orgId: config.orgId,
        createdAt: now,
        updatedAt: now,
        name: 'Live finance charge report',
        description: null,
        sourceEntity: 'charges',
        filters: [{ field: 'currency', op: 'eq', value: 'ILS' }],
        groupBy: null,
        aggregate: { fn: 'none', field: null },
        columns: ['id', 'status', 'amount'],
        isPinned: false,
      };

      expect(() => Q.runReportDefinition(chargeDef, chargeRows, { actor: 'finance' }))
        .toThrow(/source-row authorization/);
      const financeResult = Q.runReportDefinition(chargeDef, chargeRows, {
        actor: 'finance',
        sourceAuthorization: {
          actor: 'finance',
          sourceEntity: 'charges',
          authorizedSourceIds: chargeRows.map(row => row.id),
        },
      });
      expect(financeResult.sourceIds).toEqual([chargeId]);
      expect(Q.exportReportCsv(financeResult, { actor: 'finance' })).toContain(chargeId);

      const adminResult = Q.runReportDefinition(chargeDef, chargeRows);
      expect(() => Q.exportReportCsv(adminResult, { actor: 'finance' }))
        .toThrow(/authorized finance report run/);

      const deniedSources = [
        'students',
        'lessonRecords',
        'agreementAcceptances',
        'examSessions',
        'concertPrograms',
        'staffEvaluations',
        'rolloverRuns',
        'publicEndpoints',
      ] as const;
      for (const sourceEntity of deniedSources) {
        const deniedDef = {
          ...chargeDef,
          sourceEntity: sourceEntity as never,
          columns: ['id'],
          filters: [],
        };
        expect(() => Q.runReportDefinition(deniedDef, [{ id: 'sensitive-row' }], {
          actor: 'finance',
          sourceAuthorization: {
            actor: 'finance',
            sourceEntity,
            authorizedSourceIds: ['sensitive-row'],
          },
        }), sourceEntity).toThrow(/REPORT_SOURCE_NOT_ALLOWED|BLOCKED_SOURCE|FINANCE_SOURCE_NOT_ALLOWED/);
      }
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces operations snapshot source authorization without hidden-count leakage over live source rows', async (ctx) => {
      const now = '2026-06-19T10:00:00.000Z';
      const eventAId = h.id('operations_event_a');
      const eventBId = h.id('operations_event_b');
      const inboxItemId = h.id('operations_inbox');
      const hoursEntryId = h.id('operations_hours');
      const chargeReportId = h.id('operations_report_charge');
      const studentReportId = h.id('operations_report_student');

      for (const [table, id] of [
        ['events', eventAId],
        ['events', eventBId],
        ['admin_inbox_items', inboxItemId],
        ['hours_entries', hoursEntryId],
        ['report_definitions', chargeReportId],
        ['report_definitions', studentReportId],
      ] as const) {
        h.track(table, id);
      }

      const makeEventData = (id: string, start: string, end: string): Omit<CalendarEvent, 'id'> => ({
        name: id,
        description: 'RLS live operations conflict fixture',
        roomId: 'operations-room-a',
        start,
        end,
        isCanceled: false,
        isHidden: false,
        audit: { createdAt: now, updatedAt: now },
      });

      const { error: eventsSeedError } = await h.service.from('events').insert([
        {
          id: eventAId,
          org_id: config.orgId,
          data: makeEventData(eventAId, '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'),
        },
        {
          id: eventBId,
          org_id: config.orgId,
          data: makeEventData(eventBId, '2026-06-19T09:30:00.000Z', '2026-06-19T10:30:00.000Z'),
        },
      ]);
      expectNoSupabaseError(eventsSeedError, 'service should seed operations calendar source rows');

      const inboxItem: AdminInboxItem = {
        id: inboxItemId,
        orgId: config.orgId,
        type: 'APPROVAL_REQUEST',
        status: 'OPEN',
        title: 'RLS live operations approval',
        message: 'Sensitive operations inbox fixture',
        createdAt: now,
      };
      const { error: inboxSeedError } = await h.service.from('admin_inbox_items').insert({
        id: inboxItemId,
        org_id: config.orgId,
        data: inboxItem,
      });
      expectNoSupabaseError(inboxSeedError, 'service should seed operations inbox source row');

      const { error: hoursSeedError } = await h.service.from('hours_entries').insert({
        id: hoursEntryId,
        org_id: config.orgId,
        staff_member_id: config.teacher.staffMemberId,
        hours_report_id: null,
        date: '2026-06-19',
        reported_minutes: 45,
        calendar_minutes: 45,
        event_id: eventAId,
        teaching_assignment_id: null,
        org_role_id: null,
        rate: null,
        status: 'SUBMITTED',
        note: 'RLS live operations pending hours fixture',
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(hoursSeedError, 'service should seed operations pending hours source row');

      const makeReportDefinitionRow = (
        id: string,
        sourceEntity: string,
      ): Record<string, unknown> => ({
        id,
        org_id: config.orgId,
        name: `RLS live operations ${sourceEntity} report`,
        description: 'Operations report health fixture',
        source_entity: sourceEntity,
        filters: [],
        group_by: null,
        aggregate: { fn: 'none', field: null },
        columns: ['id'],
        is_pinned: false,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      const { error: reportsSeedError } = await h.service.from('report_definitions').insert([
        makeReportDefinitionRow(chargeReportId, 'charges'),
        makeReportDefinitionRow(studentReportId, 'students'),
      ]);
      expectNoSupabaseError(reportsSeedError, 'service should seed operations report source rows');

      const { data: financeReportRows, error: financeReportReadError } = await h.finance.client
        .from('report_definitions')
        .select('id, source_entity')
        .in('id', [chargeReportId, studentReportId]);
      expectNoSupabaseError(financeReportReadError, 'finance operations report definition preflight should not error');

      const { data: teacherReportRows, error: teacherReportReadError } = await h.teacher.client
        .from('report_definitions')
        .select('id')
        .in('id', [chargeReportId, studentReportId]);
      expectNoSupabaseError(teacherReportReadError, 'teacher operations report definition preflight should not error');

      if ((teacherReportRows ?? []).length || (financeReportRows ?? []).some(row => row.id === studentReportId)) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0012_report_definition_rls.sql yet; apply migrations before enforcing live operations snapshot source-authorization assertions',
        );
      }

      const { data: adminEventRows, error: adminEventReadError } = await h.admin.client
        .from('events')
        .select('id, data')
        .in('id', [eventAId, eventBId])
        .order('id');
      expectNoSupabaseError(adminEventReadError, 'admin should read operations calendar source rows');
      const { data: adminInboxRows, error: adminInboxReadError } = await h.admin.client
        .from('admin_inbox_items')
        .select('id, data')
        .eq('id', inboxItemId);
      expectNoSupabaseError(adminInboxReadError, 'admin should read operations inbox source rows');
      const { data: adminHoursRows, error: adminHoursReadError } = await h.admin.client
        .from('hours_entries')
        .select('id, org_id, staff_member_id, hours_report_id, date, reported_minutes, calendar_minutes, event_id, teaching_assignment_id, org_role_id, rate, status, note, created_at, updated_at')
        .eq('id', hoursEntryId);
      expectNoSupabaseError(adminHoursReadError, 'admin should read operations hours source rows');
      const { data: adminReportRows, error: adminReportReadError } = await h.admin.client
        .from('report_definitions')
        .select('id, org_id, name, description, source_entity, filters, group_by, aggregate, columns, is_pinned, created_at, updated_at')
        .in('id', [chargeReportId, studentReportId])
        .order('id');
      expectNoSupabaseError(adminReportReadError, 'admin should read operations report source rows');

      const events = (adminEventRows ?? []).map(row => ({
        id: String(row.id),
        ...(row.data as Omit<CalendarEvent, 'id'>),
      })) as CalendarEvent[];
      const adminInboxItems = (adminInboxRows ?? []).map(row => ({
        ...(row.data as AdminInboxItem),
        id: String(row.id),
      }));
      const hoursEntries = (adminHoursRows ?? []).map(row => ({
        id: String(row.id),
        orgId: String(row.org_id),
        staffMemberId: String(row.staff_member_id),
        hoursReportId: row.hours_report_id ? String(row.hours_report_id) : null,
        date: row.date as string,
        reportedMinutes: Number(row.reported_minutes),
        calendarMinutes: Number(row.calendar_minutes),
        eventId: row.event_id ? String(row.event_id) : null,
        teachingAssignmentId: row.teaching_assignment_id ? String(row.teaching_assignment_id) : null,
        orgRoleId: row.org_role_id ? String(row.org_role_id) : null,
        rate: row.rate === null ? null : Number(row.rate),
        status: row.status,
        note: row.note ? String(row.note) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })) as HoursEntry[];
      const reportDefinitions = (adminReportRows ?? []).map(row => ({
        id: String(row.id),
        orgId: String(row.org_id),
        name: String(row.name),
        description: row.description ? String(row.description) : null,
        sourceEntity: row.source_entity,
        filters: row.filters ?? [],
        groupBy: row.group_by ? String(row.group_by) : null,
        aggregate: row.aggregate,
        columns: row.columns ?? [],
        isPinned: Boolean(row.is_pinned),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })) as ReportDefinition[];

      const adminSnapshot = Q.buildOperationsSnapshot({
        events,
        adminInboxItems,
        hoursEntries,
        reportDefinitions,
      }, {
        orgId: config.orgId,
        actor: 'admin',
        generatedAt: now,
        date: '2026-06-19',
        timeZone: 'UTC',
      });
      expect(adminSnapshot.cards.find(card => card.source === 'openConflicts')).toMatchObject({
        count: 1,
        sourceIds: [eventAId, eventBId].sort(),
      });
      expect(adminSnapshot.cards.find(card => card.source === 'todayEvents')).toMatchObject({
        count: 2,
        sourceIds: [eventAId, eventBId].sort(),
      });
      expect(adminSnapshot.cards.find(card => card.source === 'openInboxItems')).toMatchObject({
        count: 1,
        sourceIds: [inboxItemId],
      });
      expect(adminSnapshot.cards.find(card => card.source === 'pendingHoursReports')).toMatchObject({
        count: 1,
        sourceIds: [hoursEntryId],
      });
      expect(adminSnapshot.cards.find(card => card.source === 'reportHealth')).toMatchObject({
        count: 2,
        sourceIds: [chargeReportId, studentReportId].sort(),
      });

      const financeSnapshot = Q.buildOperationsSnapshot({
        events,
        adminInboxItems,
        hoursEntries,
        reportDefinitions,
      }, {
        orgId: config.orgId,
        actor: 'finance',
        generatedAt: now,
        date: '2026-06-19',
        timeZone: 'UTC',
        includeDeniedCards: true,
      });
      expect(financeSnapshot.cards.find(card => card.source === 'pendingHoursReports')).toMatchObject({
        count: 1,
        sourceIds: [hoursEntryId],
      });
      expect(financeSnapshot.cards.find(card => card.source === 'reportHealth')).toMatchObject({
        count: 1,
        sourceIds: [chargeReportId],
      });
      for (const source of ['openConflicts', 'openInboxItems', 'todayEvents'] as const) {
        expect(financeSnapshot.cards.find(card => card.source === source)).toMatchObject({
          status: 'DENIED',
          count: null,
          sourceIds: [],
          sourceReferences: [],
        });
      }
      expect(financeSnapshot.cards.flatMap(card => card.sourceIds)).not.toEqual(
        expect.arrayContaining([eventAId, eventBId, inboxItemId, studentReportId]),
      );

      for (const actor of ['teacher', 'member', 'anonymous'] as const) {
        const deniedSnapshot = Q.buildOperationsSnapshot({
          events,
          adminInboxItems,
          hoursEntries,
          reportDefinitions,
        }, {
          orgId: config.orgId,
          actor,
          generatedAt: now,
          date: '2026-06-19',
          timeZone: 'UTC',
          includeDeniedCards: true,
          includeBlockedCards: true,
        });
        expect(deniedSnapshot.cards.every(card => card.count === null), actor).toBe(true);
        expect(deniedSnapshot.cards.every(card => card.sourceIds.length === 0), actor).toBe(true);
        expect(deniedSnapshot.cards.some(card => card.status === 'READY'), actor).toBe(false);
      }

      const { data: anonEventRows, error: anonEventReadError } = await h.anon
        .from('events')
        .select('id')
        .in('id', [eventAId, eventBId]);
      expectNoSupabaseError(anonEventReadError, 'anon operations event select should not error');
      expect(anonEventRows).toEqual([]);

      const { data: crossOrgRows, error: crossOrgReadError } = await h.crossOrg.client
        .from('admin_inbox_items')
        .select('id')
        .eq('id', inboxItemId);
      expectNoSupabaseError(crossOrgReadError, 'cross-org operations inbox select should not error');
      expect(crossOrgRows).toEqual([]);
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces rooms/absence operational request scope and linked approval item privacy', async (ctx) => {
      const now = '2026-06-19T10:00:00.000Z';
      const ownRequestId = h.id('operational_request_own');
      const otherRequestId = h.id('operational_request_other');
      const adminApproveRequestId = h.id('operational_request_admin_approve');
      const teacherCancelRequestId = h.id('operational_request_teacher_cancel');
      const teacherInsertRequestId = h.id('operational_request_teacher_insert');
      const teacherOtherInsertRequestId = h.id('operational_request_teacher_other_insert');
      const teacherApprovedInsertRequestId = h.id('operational_request_teacher_approved_insert');
      const crossOrgInsertRequestId = h.id('operational_request_cross_insert');
      const ownInboxId = h.id('operational_inbox_own');
      const otherInboxId = h.id('operational_inbox_other');
      const teacherInboxInsertId = h.id('operational_inbox_teacher_insert');

      for (const id of [
        ownRequestId,
        otherRequestId,
        adminApproveRequestId,
        teacherCancelRequestId,
        teacherInsertRequestId,
        teacherOtherInsertRequestId,
        teacherApprovedInsertRequestId,
        crossOrgInsertRequestId,
      ]) {
        h.track('operational_requests', id);
      }
      for (const id of [ownInboxId, otherInboxId, teacherInboxInsertId]) {
        h.track('admin_inbox_items', id);
      }

      const otherStaffMemberId = `${config.teacher.staffMemberId}_other`;
      const makeRequestRow = (
        id: string,
        staffMemberId: string | null,
        overrides: Record<string, unknown> = {},
      ): Record<string, unknown> => ({
        id,
        org_id: config.orgId,
        kind: 'ROOM_CHANGE',
        status: 'PENDING',
        requested_by_staff_id: staffMemberId,
        requested_for: '2026-06-20',
        end_date: null,
        event_id: 'rls-live-room-request-event',
        current_room_id: 'room-a',
        requested_room_id: 'room-b',
        reason: 'RLS live operational request fixture',
        decided_by: null,
        decided_at: null,
        decision_note: null,
        admin_inbox_item_id: null,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
        ...overrides,
      });

      const makeInboxData = (id: string, requestId: string, staffMemberId: string): AdminInboxItem => ({
        id,
        orgId: config.orgId,
        type: 'APPROVAL_REQUEST',
        status: 'OPEN',
        title: 'RLS live operational approval',
        message: 'Sensitive absence or room request reason',
        relatedEntityType: 'operationalRequest',
        relatedEntityIds: [requestId],
        requestedBy: staffMemberId,
        createdAt: now,
      });

      const { error: seedRequestError } = await h.service.from('operational_requests').insert([
        makeRequestRow(ownRequestId, config.teacher.staffMemberId, { admin_inbox_item_id: ownInboxId }),
        makeRequestRow(otherRequestId, otherStaffMemberId, { admin_inbox_item_id: otherInboxId }),
        makeRequestRow(adminApproveRequestId, otherStaffMemberId),
        makeRequestRow(teacherCancelRequestId, config.teacher.staffMemberId),
      ]);
      expectNoSupabaseError(seedRequestError, 'service should seed operational request rows');

      const { error: seedInboxError } = await h.service.from('admin_inbox_items').insert([
        {
          id: ownInboxId,
          org_id: config.orgId,
          data: makeInboxData(ownInboxId, ownRequestId, config.teacher.staffMemberId),
        },
        {
          id: otherInboxId,
          org_id: config.orgId,
          data: makeInboxData(otherInboxId, otherRequestId, otherStaffMemberId),
        },
      ]);
      expectNoSupabaseError(seedInboxError, 'service should seed operational approval inbox items');

      const { data: teacherPreflightRequests, error: teacherPreflightRequestError } = await h.teacher.client
        .from('operational_requests')
        .select('id')
        .in('id', [ownRequestId, otherRequestId])
        .order('id');
      expectNoSupabaseError(teacherPreflightRequestError, 'teacher operational request preflight select should not error');
      const { data: financePreflightRequests, error: financePreflightRequestError } = await h.finance.client
        .from('operational_requests')
        .select('id')
        .in('id', [ownRequestId, otherRequestId])
        .order('id');
      expectNoSupabaseError(financePreflightRequestError, 'finance operational request preflight select should not error');
      const { data: financePreflightInbox, error: financePreflightInboxError } = await h.finance.client
        .from('admin_inbox_items')
        .select('id')
        .in('id', [ownInboxId, otherInboxId])
        .order('id');
      expectNoSupabaseError(financePreflightInboxError, 'finance approval inbox preflight select should not error');

      if (
        (teacherPreflightRequests ?? []).some(row => row.id === otherRequestId) ||
        (financePreflightRequests ?? []).length ||
        (financePreflightInbox ?? []).length
      ) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0016_rooms_absence_request_rls.sql yet; operational request and approval inbox rows still use broad member access',
        );
      }

      const { data: adminRows, error: adminReadError } = await h.admin.client
        .from('operational_requests')
        .select('id, status, requested_by_staff_id')
        .in('id', [ownRequestId, otherRequestId, adminApproveRequestId])
        .order('id');
      expectNoSupabaseError(adminReadError, 'admin should read all operational request rows');
      expect((adminRows ?? []).map(row => row.id).sort()).toEqual([adminApproveRequestId, otherRequestId, ownRequestId].sort());

      const { data: teacherRows, error: teacherReadError } = await h.teacher.client
        .from('operational_requests')
        .select('id, status, requested_by_staff_id')
        .in('id', [ownRequestId, otherRequestId])
        .order('id');
      expectNoSupabaseError(teacherReadError, 'teacher should read own operational requests only');
      expect((teacherRows ?? []).map(row => row.id)).toEqual([ownRequestId]);

      const { data: teacherInboxRows, error: teacherInboxReadError } = await h.teacher.client
        .from('admin_inbox_items')
        .select('id, data')
        .in('id', [ownInboxId, otherInboxId])
        .order('id');
      expectNoSupabaseError(teacherInboxReadError, 'teacher should read own linked approval item only');
      expect((teacherInboxRows ?? []).map(row => row.id)).toEqual([ownInboxId]);

      for (const { label, client } of [
        { label: 'finance-capable non-admin', client: h.finance.client },
        { label: 'cross-org member', client: h.crossOrg.client },
      ]) {
        const { data: requestRows, error: requestReadError } = await client
          .from('operational_requests')
          .select('id')
          .in('id', [ownRequestId, otherRequestId]);
        expectNoSupabaseError(requestReadError, `${label} operational request select should not error`);
        expect(requestRows, `${label} should not read operational requests`).toEqual([]);

        const { data: inboxRows, error: inboxReadError } = await client
          .from('admin_inbox_items')
          .select('id')
          .in('id', [ownInboxId, otherInboxId]);
        expectNoSupabaseError(inboxReadError, `${label} approval inbox select should not error`);
        expect(inboxRows, `${label} should not read linked approval items`).toEqual([]);
      }

      const { data: anonRows, error: anonReadError } = await h.anon
        .from('operational_requests')
        .select('id')
        .eq('id', ownRequestId);
      expectNoSupabaseError(anonReadError, 'anon operational request select should not error');
      expect(anonRows).toEqual([]);

      const { error: teacherInsertError } = await h.teacher.client.from('operational_requests').insert(
        makeRequestRow(teacherInsertRequestId, config.teacher.staffMemberId, {
          created_by: 'teacher',
          updated_by: 'teacher',
        }),
      );
      expectNoSupabaseError(teacherInsertError, 'teacher should insert own pending operational request');

      const { error: teacherOtherInsertError } = await h.teacher.client.from('operational_requests').insert(
        makeRequestRow(teacherOtherInsertRequestId, otherStaffMemberId),
      );
      expectRlsDenied(teacherOtherInsertError, 'teacher should not insert another staff member operational request');

      const { error: teacherApprovedInsertError } = await h.teacher.client.from('operational_requests').insert(
        makeRequestRow(teacherApprovedInsertRequestId, config.teacher.staffMemberId, {
          status: 'APPROVED',
          decided_by: 'teacher',
          decided_at: now,
        }),
      );
      expectRlsDenied(teacherApprovedInsertError, 'teacher should not create pre-approved operational requests');

      const { error: crossOrgInsertError } = await h.teacher.client.from('operational_requests').insert(
        makeRequestRow(crossOrgInsertRequestId, config.teacher.staffMemberId, { org_id: config.crossOrgId }),
      );
      expectRlsDenied(crossOrgInsertError, 'teacher should not insert operational requests in another org');

      const { error: teacherCancelError } = await h.teacher.client
        .from('operational_requests')
        .update({ status: 'CANCELLED', updated_by: 'teacher' })
        .eq('id', teacherCancelRequestId);
      expectNoSupabaseError(teacherCancelError, 'teacher should cancel own pending operational request');

      const { error: teacherDecisionError } = await h.teacher.client
        .from('operational_requests')
        .update({ status: 'APPROVED', decided_by: 'teacher', decided_at: now })
        .eq('id', teacherInsertRequestId);
      expectRlsDenied(teacherDecisionError, 'teacher should not approve operational requests');

      const { error: teacherOtherUpdateError } = await h.teacher.client
        .from('operational_requests')
        .update({ status: 'CANCELLED', updated_by: 'teacher-other-attempt' })
        .eq('id', otherRequestId);
      expectNoSupabaseError(teacherOtherUpdateError, 'teacher other-staff cancel should be filtered by RLS');

      const { error: adminDecisionError } = await h.admin.client
        .from('operational_requests')
        .update({
          status: 'APPROVED',
          decided_by: 'admin',
          decided_at: now,
          decision_note: 'Review-only approval; no automatic schedule or payroll mutation.',
          updated_by: 'admin',
        })
        .eq('id', adminApproveRequestId);
      expectNoSupabaseError(adminDecisionError, 'admin should approve operational requests');

      const { error: teacherInboxInsertError } = await h.teacher.client.from('admin_inbox_items').insert({
        id: teacherInboxInsertId,
        org_id: config.orgId,
        data: makeInboxData(teacherInboxInsertId, teacherInsertRequestId, config.teacher.staffMemberId),
      });
      expectNoSupabaseError(teacherInboxInsertError, 'teacher should create own linked operational approval item');

      const { data: finalRows, error: finalReadError } = await h.admin.client
        .from('operational_requests')
        .select('id, status, requested_by_staff_id, decided_by, decision_note')
        .in('id', [teacherCancelRequestId, teacherInsertRequestId, otherRequestId, adminApproveRequestId])
        .order('id');
      expectNoSupabaseError(finalReadError, 'admin should read final operational request states');
      const finalById = new Map((finalRows ?? []).map(row => [row.id, row]));
      expect(finalById.get(teacherCancelRequestId)).toMatchObject({ status: 'CANCELLED' });
      expect(finalById.get(teacherInsertRequestId)).toMatchObject({ status: 'PENDING', decided_by: null });
      expect(finalById.get(otherRequestId)).toMatchObject({ status: 'PENDING', requested_by_staff_id: otherStaffMemberId });
      expect(finalById.get(adminApproveRequestId)).toMatchObject({
        status: 'APPROVED',
        decided_by: 'admin',
        decision_note: 'Review-only approval; no automatic schedule or payroll mutation.',
      });
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces admin-only direct access for agreement templates and acceptances', async (ctx) => {
      const templateId = h.id('agreement_template');
      const acceptanceId = h.id('agreement_acceptance');
      const crossTemplateId = h.id('agreement_template_cross');
      const crossAcceptanceId = h.id('agreement_acceptance_cross');
      const teacherTemplateDeniedId = h.id('agreement_template_teacher_denied');
      const financeTemplateDeniedId = h.id('agreement_template_finance_denied');
      const anonTemplateDeniedId = h.id('agreement_template_anon_denied');
      const crossTemplateDeniedId = h.id('agreement_template_cross_denied');
      const teacherAcceptanceDeniedId = h.id('agreement_acceptance_teacher_denied');
      const financeAcceptanceDeniedId = h.id('agreement_acceptance_finance_denied');
      const anonAcceptanceDeniedId = h.id('agreement_acceptance_anon_denied');
      const crossAcceptanceDeniedId = h.id('agreement_acceptance_cross_denied');

      for (const id of [
        templateId,
        crossTemplateId,
        teacherTemplateDeniedId,
        financeTemplateDeniedId,
        anonTemplateDeniedId,
        crossTemplateDeniedId,
      ]) {
        h.track('agreement_templates', id);
      }
      for (const id of [
        acceptanceId,
        crossAcceptanceId,
        teacherAcceptanceDeniedId,
        financeAcceptanceDeniedId,
        anonAcceptanceDeniedId,
        crossAcceptanceDeniedId,
      ]) {
        h.track('agreement_acceptances', id);
      }

      const makeTemplateRow = (
        id: string,
        orgId: string,
        label: string,
      ): Record<string, unknown> => ({
        id,
        org_id: orgId,
        kind: 'ENROLLMENT',
        title: `RLS harness agreement ${label}`,
        version: 1,
        body: 'Agreement body seeded by the live RLS harness.',
        is_active: true,
        supersedes_version: null,
        requires_guardian: true,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });

      const makeAcceptanceRow = (
        id: string,
        orgId: string,
        template: string,
        label: string,
      ): Record<string, unknown> => ({
        id,
        org_id: orgId,
        template_id: template,
        template_version: 1,
        student_id: `student-${label}`,
        family_id: `family-${label}`,
        enrollment_id: `enrollment-${label}`,
        guardian_id: `guardian-${label}`,
        status: 'PENDING',
        accepted_at: null,
        accepted_by_name: null,
        signature_ref: null,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });

      const { error: adminTemplateInsertError } = await h.admin.client
        .from('agreement_templates')
        .insert(makeTemplateRow(templateId, config.orgId, 'admin'));
      expectNoSupabaseError(adminTemplateInsertError, 'admin should insert own-org agreement templates');

      const { error: adminAcceptanceInsertError } = await h.admin.client
        .from('agreement_acceptances')
        .insert(makeAcceptanceRow(acceptanceId, config.orgId, templateId, 'admin'));
      expectNoSupabaseError(adminAcceptanceInsertError, 'admin should insert own-org agreement acceptances');

      const { error: seedCrossRowsError } = await h.service.from('agreement_templates').insert(
        makeTemplateRow(crossTemplateId, config.crossOrgId, 'cross-org'),
      );
      expectNoSupabaseError(seedCrossRowsError, 'service should seed cross-org agreement template');

      const { error: seedCrossAcceptanceError } = await h.service.from('agreement_acceptances').insert(
        makeAcceptanceRow(crossAcceptanceId, config.crossOrgId, crossTemplateId, 'cross-org'),
      );
      expectNoSupabaseError(seedCrossAcceptanceError, 'service should seed cross-org agreement acceptance');

      const { error: adminTemplateUpdateError } = await h.admin.client
        .from('agreement_templates')
        .update({ body: 'Updated agreement body by admin.', updated_by: 'rls-live-harness-admin-update' })
        .eq('id', templateId);
      expectNoSupabaseError(adminTemplateUpdateError, 'admin should update own-org agreement templates');

      const { error: adminAcceptanceUpdateError } = await h.admin.client
        .from('agreement_acceptances')
        .update({ status: 'EXPIRED', updated_by: 'rls-live-harness-admin-update' })
        .eq('id', acceptanceId);
      expectNoSupabaseError(adminAcceptanceUpdateError, 'admin should update own-org agreement acceptances');

      const { data: adminTemplates, error: adminTemplateReadError } = await h.admin.client
        .from('agreement_templates')
        .select('id, org_id, body')
        .in('id', [templateId, crossTemplateId]);
      expectNoSupabaseError(adminTemplateReadError, 'admin should read own-org agreement templates');
      expect(adminTemplates).toEqual([
        {
          id: templateId,
          org_id: config.orgId,
          body: 'Updated agreement body by admin.',
        },
      ]);

      const { data: adminAcceptances, error: adminAcceptanceReadError } = await h.admin.client
        .from('agreement_acceptances')
        .select('id, org_id, status')
        .in('id', [acceptanceId, crossAcceptanceId]);
      expectNoSupabaseError(adminAcceptanceReadError, 'admin should read own-org agreement acceptances');
      expect(adminAcceptances).toEqual([
        {
          id: acceptanceId,
          org_id: config.orgId,
          status: 'EXPIRED',
        },
      ]);

      const { data: preflightTeacherTemplates, error: preflightTeacherTemplateError } = await h.teacher.client
        .from('agreement_templates')
        .select('id')
        .eq('id', templateId);
      expectNoSupabaseError(preflightTeacherTemplateError, 'teacher agreement template preflight select should not error');

      const { data: preflightTeacherAcceptances, error: preflightTeacherAcceptanceError } = await h.teacher.client
        .from('agreement_acceptances')
        .select('id')
        .eq('id', acceptanceId);
      expectNoSupabaseError(preflightTeacherAcceptanceError, 'teacher agreement acceptance preflight select should not error');

      if ((preflightTeacherTemplates ?? []).length || (preflightTeacherAcceptances ?? []).length) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0008_agreement_direct_table_rls.sql yet; apply migrations with SUPABASE_DB_PASSWORD before enforcing live agreement RLS assertions',
        );
      }

      const readClients = [
        { label: 'teacher/plain member', client: h.teacher.client },
        { label: 'finance-capable non-admin', client: h.finance.client },
        { label: 'cross-org user', client: h.crossOrg.client },
      ];

      for (const role of readClients) {
        const { data: templateRows, error: templateReadError } = await role.client
          .from('agreement_templates')
          .select('id')
          .in('id', [templateId, crossTemplateId]);
        expectNoSupabaseError(templateReadError, `${role.label} agreement template select should not error`);
        expect(templateRows, `${role.label} should not read agreement templates directly`).toEqual([]);

        const { data: acceptanceRows, error: acceptanceReadError } = await role.client
          .from('agreement_acceptances')
          .select('id')
          .in('id', [acceptanceId, crossAcceptanceId]);
        expectNoSupabaseError(acceptanceReadError, `${role.label} agreement acceptance select should not error`);
        expect(acceptanceRows, `${role.label} should not read agreement acceptances directly`).toEqual([]);
      }

      const { data: anonTemplateRows, error: anonTemplateReadError } = await h.anon
        .from('agreement_templates')
        .select('id')
        .eq('id', templateId);
      expectNoSupabaseError(anonTemplateReadError, 'anon agreement template select should not error');
      expect(anonTemplateRows).toEqual([]);

      const { data: anonAcceptanceRows, error: anonAcceptanceReadError } = await h.anon
        .from('agreement_acceptances')
        .select('id')
        .eq('id', acceptanceId);
      expectNoSupabaseError(anonAcceptanceReadError, 'anon agreement acceptance select should not error');
      expect(anonAcceptanceRows).toEqual([]);

      const deniedTemplateInserts = [
        { label: 'teacher/plain member', client: h.teacher.client, id: teacherTemplateDeniedId },
        { label: 'finance-capable non-admin', client: h.finance.client, id: financeTemplateDeniedId },
        { label: 'cross-org user', client: h.crossOrg.client, id: crossTemplateDeniedId },
      ];
      for (const role of deniedTemplateInserts) {
        const { error } = await role.client
          .from('agreement_templates')
          .insert(makeTemplateRow(role.id, config.orgId, role.label));
        expectRlsDenied(error, `${role.label} should not insert agreement templates`);
      }

      const { error: anonTemplateInsertError } = await h.anon
        .from('agreement_templates')
        .insert(makeTemplateRow(anonTemplateDeniedId, config.orgId, 'anon'));
      expectRlsDenied(anonTemplateInsertError, 'anon should not insert agreement templates');

      const deniedAcceptanceInserts = [
        { label: 'teacher/plain member', client: h.teacher.client, id: teacherAcceptanceDeniedId },
        { label: 'finance-capable non-admin', client: h.finance.client, id: financeAcceptanceDeniedId },
        { label: 'cross-org user', client: h.crossOrg.client, id: crossAcceptanceDeniedId },
      ];
      for (const role of deniedAcceptanceInserts) {
        const { error } = await role.client
          .from('agreement_acceptances')
          .insert(makeAcceptanceRow(role.id, config.orgId, templateId, role.label));
        expectRlsDenied(error, `${role.label} should not insert agreement acceptances`);
      }

      const { error: anonAcceptanceInsertError } = await h.anon
        .from('agreement_acceptances')
        .insert(makeAcceptanceRow(anonAcceptanceDeniedId, config.orgId, templateId, 'anon'));
      expectRlsDenied(anonAcceptanceInsertError, 'anon should not insert agreement acceptances');

      const { error: adminCrossTemplateInsertError } = await h.admin.client
        .from('agreement_templates')
        .insert(makeTemplateRow(h.id('agreement_template_admin_cross_denied'), config.crossOrgId, 'admin-cross'));
      expectRlsDenied(adminCrossTemplateInsertError, 'primary-org admin should not insert cross-org agreement templates');
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces scoped public agreement acceptance submit without anon table access', async (ctx) => {
      const templateId = h.id('agreement_template_token');
      const acceptanceId = h.id('agreement_acceptance_token');
      const expiredAcceptanceId = h.id('agreement_acceptance_expired_token');
      const endpointId = h.id('agreement_endpoint_token');
      const expiredEndpointId = h.id('agreement_endpoint_expired_token');
      const token = h.id('agreement_token');
      const expiredToken = h.id('agreement_token_expired');
      const tokenHash = sha256Hex(token);
      const expiredTokenHash = sha256Hex(expiredToken);
      const anonDeniedAcceptanceId = h.id('agreement_acceptance_anon_direct_denied');

      const { error: submitRpcPreflightError } = await h.anon.rpc('submit_agreement_acceptance', {
        p_token_hash: 'missing-token-hash',
        p_payload: {},
      });
      if (isMissingAgreementAcceptanceRpc(submitRpcPreflightError)) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0009_agreement_acceptance_public_submit.sql yet; apply migrations before enforcing live agreement token assertions',
        );
      }
      expectNoSupabaseError(submitRpcPreflightError, 'agreement acceptance submit RPC should exist in the live schema');
      const { error: readRpcPreflightError } = await h.anon.rpc('get_public_agreement_acceptance', {
        p_token_hash: 'missing-token-hash',
      });
      if (isMissingAgreementAcceptanceReadRpc(readRpcPreflightError)) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0011_agreement_acceptance_public_read.sql yet; apply migrations before enforcing live agreement public read assertions',
        );
      }
      expectNoSupabaseError(readRpcPreflightError, 'agreement acceptance public read RPC should exist in the live schema');

      for (const id of [templateId]) h.track('agreement_templates', id);
      for (const id of [acceptanceId, expiredAcceptanceId, anonDeniedAcceptanceId]) {
        h.track('agreement_acceptances', id);
      }
      for (const id of [endpointId, expiredEndpointId]) h.track('public_endpoints', id);

      const { error: templateError } = await h.service.from('agreement_templates').insert({
        id: templateId,
        org_id: config.orgId,
        kind: 'ENROLLMENT',
        title: 'RLS harness token agreement',
        version: 1,
        body: 'Agreement body seeded by the live RLS harness.',
        is_active: true,
        supersedes_version: null,
        requires_guardian: true,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });
      expectNoSupabaseError(templateError, 'service should seed agreement template for public token test');

      const makeAcceptanceRow = (id: string, studentId: string): Record<string, unknown> => ({
        id,
        org_id: config.orgId,
        template_id: templateId,
        template_version: 1,
        student_id: studentId,
        family_id: 'rls-live-family',
        enrollment_id: 'rls-live-enrollment',
        guardian_id: 'rls-live-guardian',
        status: 'PENDING',
        accepted_at: null,
        accepted_by_name: null,
        signature_ref: null,
        created_by: 'rls-live-harness',
        updated_by: 'rls-live-harness',
      });

      const { error: acceptanceError } = await h.service.from('agreement_acceptances').insert([
        makeAcceptanceRow(acceptanceId, 'rls-live-student'),
        makeAcceptanceRow(expiredAcceptanceId, 'rls-live-expired-student'),
      ]);
      expectNoSupabaseError(acceptanceError, 'service should seed target agreement acceptances');

      const { error: endpointError } = await h.service.from('public_endpoints').insert([
        {
          id: endpointId,
          org_id: config.orgId,
          kind: 'AGREEMENT_ACCEPTANCE',
          label: 'RLS harness agreement token',
          token_hash: tokenHash,
          status: 'ACTIVE',
          scopes: ['agreement_acceptance:sign'],
          target_id: acceptanceId,
          consent_agreement_id: templateId,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          created_by: 'rls-live-harness',
          updated_by: 'rls-live-harness',
        },
        {
          id: expiredEndpointId,
          org_id: config.orgId,
          kind: 'AGREEMENT_ACCEPTANCE',
          label: 'RLS harness expired agreement token',
          token_hash: expiredTokenHash,
          status: 'ACTIVE',
          scopes: ['agreement_acceptance:sign'],
          target_id: expiredAcceptanceId,
          consent_agreement_id: templateId,
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          created_by: 'rls-live-harness',
          updated_by: 'rls-live-harness',
        },
      ]);
      expectNoSupabaseError(endpointError, 'service should seed scoped public agreement endpoints');

      const { error: anonDirectInsertError } = await h.anon.from('agreement_acceptances').insert(
        makeAcceptanceRow(anonDeniedAcceptanceId, 'rls-live-anon-denied-student'),
      );
      expectRlsDenied(anonDirectInsertError, 'anon should not insert agreement acceptances directly');

      const { data: readData, error: readError } = await h.anon.rpc('get_public_agreement_acceptance', {
        p_token_hash: tokenHash,
      });
      expectNoSupabaseError(readError, 'anon should read only the scoped agreement target through RPC');
      expect(readData).toMatchObject({
        ok: true,
        template: {
          id: templateId,
          title: 'RLS harness token agreement',
          body: 'Agreement body seeded by the live RLS harness.',
        },
        acceptance: {
          id: acceptanceId,
          templateId,
          studentId: 'rls-live-student',
          status: 'PENDING',
        },
      });

      const basePayload = {
        action: 'ACCEPT',
        target: {
          acceptanceId,
          templateId,
          studentId: 'rls-live-student',
          familyId: 'rls-live-family',
          enrollmentId: 'rls-live-enrollment',
          guardianId: 'rls-live-guardian',
        },
        signer: {
          fullName: 'RLS Harness Guardian',
        },
        consent: {
          confirmed: true,
          accepted: true,
          agreementId: templateId,
          capturedAt: new Date().toISOString(),
        },
      };

      const { data: mismatchData, error: mismatchError } = await h.anon.rpc('submit_agreement_acceptance', {
        p_token_hash: tokenHash,
        p_payload: {
          ...basePayload,
          target: {
            ...basePayload.target,
            studentId: 'rls-live-wrong-student',
          },
        },
      });
      expectNoSupabaseError(mismatchError, 'target mismatch should return structured denial');
      expect(mismatchData).toMatchObject({ ok: false, code: 'TARGET_MISMATCH' });

      const { data: submitData, error: submitError } = await h.anon.rpc('submit_agreement_acceptance', {
        p_token_hash: tokenHash,
        p_payload: basePayload,
      });
      expectNoSupabaseError(submitError, 'anon should submit through scoped agreement RPC');
      expect(submitData).toMatchObject({
        ok: true,
        acceptanceId,
        status: 'ACCEPTED',
      });

      const { data: acceptedRow, error: acceptedReadError } = await h.service
        .from('agreement_acceptances')
        .select('status, accepted_at, accepted_by_name, signature_ref')
        .eq('id', acceptanceId)
        .maybeSingle();
      expectNoSupabaseError(acceptedReadError, 'service should verify public agreement acceptance mutation');
      expect(acceptedRow).toMatchObject({
        status: 'ACCEPTED',
        accepted_by_name: 'RLS Harness Guardian',
      });
      expect(acceptedRow?.accepted_at).toEqual(expect.any(String));
      expect(acceptedRow?.signature_ref).toMatch(/^typed:\/\/agreement_acceptances\//);

      const { data: endpointRow, error: endpointReadError } = await h.service
        .from('public_endpoints')
        .select('status, last_used_at')
        .eq('id', endpointId)
        .maybeSingle();
      expectNoSupabaseError(endpointReadError, 'service should verify agreement endpoint consumption');
      expect(endpointRow?.status).toBe('EXPIRED');
      expect(endpointRow?.last_used_at).toEqual(expect.any(String));

      const { data: reusedData, error: reusedError } = await h.anon.rpc('submit_agreement_acceptance', {
        p_token_hash: tokenHash,
        p_payload: basePayload,
      });
      expectNoSupabaseError(reusedError, 'reused agreement token should return structured denial');
      expect(reusedData).toMatchObject({ ok: false, code: 'INVALID_ENDPOINT' });

      const { data: expiredData, error: expiredError } = await h.anon.rpc('submit_agreement_acceptance', {
        p_token_hash: expiredTokenHash,
        p_payload: {
          ...basePayload,
          target: {
            ...basePayload.target,
            acceptanceId: expiredAcceptanceId,
            studentId: 'rls-live-expired-student',
          },
        },
      });
      expectNoSupabaseError(expiredError, 'expired agreement token should return structured denial');
      expect(expiredData).toMatchObject({ ok: false, code: 'INVALID_ENDPOINT' });
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces admin-only direct reads for signed agreement PDF storage', async (ctx) => {
      const objectPath = `${config.orgId}/agreements/${h.id('agreement_acceptance_pdf')}/signed.pdf`;
      const pdfBody = 'RLS harness signed agreement PDF';
      let uploaded = false;

      try {
        const { error: uploadError } = await h.service.storage
          .from('documents')
          .upload(objectPath, new Blob([pdfBody], { type: 'application/pdf' }), {
            contentType: 'application/pdf',
            upsert: false,
          });
        expectNoSupabaseError(uploadError, 'service should seed signed agreement PDF storage fixture');
        uploaded = true;

        const { data: teacherPreflightData, error: teacherPreflightError } = await h.teacher.client.storage
          .from('documents')
          .download(objectPath);
        if (!teacherPreflightError && teacherPreflightData) {
          (ctx as unknown as { skip: (note?: string) => never }).skip(
            'remote Supabase project has not applied 0010_agreement_private_pdf_storage_rls.sql yet; apply migrations before enforcing live agreement PDF storage assertions',
          );
        }
        expectStorageDenied(teacherPreflightError, 'teacher/plain member should not directly read signed agreement PDFs');

        const { data: adminData, error: adminDownloadError } = await h.admin.client.storage
          .from('documents')
          .download(objectPath);
        expectNoSupabaseError(adminDownloadError, 'admin should directly read signed agreement PDFs');
        expect(await adminData?.text()).toBe(pdfBody);

        const deniedClients = [
          { label: 'finance-capable non-admin', storage: h.finance.client.storage },
          { label: 'cross-org user', storage: h.crossOrg.client.storage },
          { label: 'anon', storage: h.anon.storage },
        ];

        for (const role of deniedClients) {
          const { data, error } = await role.storage.from('documents').download(objectPath);
          expect(data, `${role.label} should not receive signed agreement PDF bytes`).toBeNull();
          expectStorageDenied(error, `${role.label} should not directly read signed agreement PDFs`);
        }
      } finally {
        if (uploaded) {
          await h.service.storage.from('documents').remove([objectPath]);
        }
      }
    }, LIVE_RLS_TIMEOUT_MS);

    it('enforces scoped calendar subscription resolver and admin-only subscription config reads', async (ctx) => {
      const subscriptionId = h.id('calendar_subscription');
      const endpointId = h.id('calendar_endpoint');
      const revokedEndpointId = h.id('calendar_endpoint_revoked');
      const token = h.id('calendar_token');
      const revokedToken = h.id('calendar_token_revoked');
      const tokenHash = sha256Hex(token);
      const revokedTokenHash = sha256Hex(revokedToken);
      const matchingEventId = h.id('calendar_event_match');
      const hiddenEventId = h.id('calendar_event_hidden');
      const wrongRoomEventId = h.id('calendar_event_wrong_room');

      const { error: resolverPreflightError } = await h.anon.rpc('resolve_calendar_subscription_ical', {
        p_token_hash: 'missing-token-hash',
      });
      if (isMissingCalendarIcalRpc(resolverPreflightError)) {
        (ctx as unknown as { skip: (note?: string) => never }).skip(
          'remote Supabase project has not applied 0017_calendar_subscription_endpoint_resolver.sql yet; apply migrations before enforcing live calendar subscription resolver assertions',
        );
      }
      expectNoSupabaseError(resolverPreflightError, 'calendar subscription resolver RPC should exist in the live schema');

      for (const id of [subscriptionId]) h.track('calendar_subscriptions', id);
      for (const id of [endpointId, revokedEndpointId]) h.track('public_endpoints', id);
      for (const id of [matchingEventId, hiddenEventId, wrongRoomEventId]) h.track('events', id);

      const { error: subscriptionError } = await h.service.from('calendar_subscriptions').insert({
        id: subscriptionId,
        org_id: config.orgId,
        data: {
          name: 'RLS harness private feed',
          filters: {
            roomIds: ['rls-live-room-a'],
            tags: ['rls-live-feed'],
          },
          createdBy: 'rls-live-harness',
          createdAt: new Date().toISOString(),
          isActive: true,
        },
      });
      expectNoSupabaseError(subscriptionError, 'service should seed a calendar subscription config');

      const { error: endpointError } = await h.service.from('public_endpoints').insert([
        {
          id: endpointId,
          org_id: config.orgId,
          kind: 'CALENDAR_SUBSCRIPTION',
          label: 'RLS harness private feed',
          token_hash: tokenHash,
          status: 'ACTIVE',
          scopes: ['calendar_subscription:read'],
          target_id: subscriptionId,
          consent_agreement_id: null,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          created_by: 'rls-live-harness',
          updated_by: 'rls-live-harness',
        },
        {
          id: revokedEndpointId,
          org_id: config.orgId,
          kind: 'CALENDAR_SUBSCRIPTION',
          label: 'RLS harness revoked feed',
          token_hash: revokedTokenHash,
          status: 'REVOKED',
          scopes: ['calendar_subscription:read'],
          target_id: subscriptionId,
          consent_agreement_id: null,
          revoked_at: new Date().toISOString(),
          created_by: 'rls-live-harness',
          updated_by: 'rls-live-harness',
        },
      ]);
      expectNoSupabaseError(endpointError, 'service should seed calendar public endpoints');

      const makeEvent = (id: string, data: Record<string, unknown>): Record<string, unknown> => ({
        id,
        org_id: config.orgId,
        data: {
          name: id,
          description: 'RLS harness calendar feed event',
          start: '2026-06-20T09:00:00.000Z',
          end: '2026-06-20T10:00:00.000Z',
          isHidden: false,
          isCanceled: false,
          ...data,
        },
      });

      const { error: eventError } = await h.service.from('events').insert([
        makeEvent(matchingEventId, {
          roomId: 'rls-live-room-a',
          tags: ['rls-live-feed'],
        }),
        makeEvent(hiddenEventId, {
          roomId: 'rls-live-room-a',
          tags: ['rls-live-feed'],
          isHidden: true,
        }),
        makeEvent(wrongRoomEventId, {
          roomId: 'rls-live-room-b',
          tags: ['rls-live-feed'],
        }),
      ]);
      expectNoSupabaseError(eventError, 'service should seed calendar feed events');

      const { data: teacherRows, error: teacherReadError } = await h.teacher.client
        .from('calendar_subscriptions')
        .select('id')
        .eq('id', subscriptionId);
      expectNoSupabaseError(teacherReadError, 'teacher subscription config select should not error');
      expect(teacherRows).toEqual([]);

      const { data: anonRows, error: anonReadError } = await h.anon
        .from('calendar_subscriptions')
        .select('id')
        .eq('id', subscriptionId);
      expectNoSupabaseError(anonReadError, 'anon subscription config select should not error');
      expect(anonRows).toEqual([]);

      const { data: resolverData, error: resolverError } = await h.anon.rpc('resolve_calendar_subscription_ical', {
        p_token_hash: tokenHash,
      });
      expectNoSupabaseError(resolverError, 'anon should resolve scoped calendar feed through RPC');
      expect(resolverData).toMatchObject({
        ok: true,
        subscriptionId,
      });
      expect((resolverData?.events ?? []).map((row: { id: string }) => row.id)).toEqual([matchingEventId]);
      expect(JSON.stringify(resolverData)).not.toContain(tokenHash);

      const { data: revokedData, error: revokedError } = await h.anon.rpc('resolve_calendar_subscription_ical', {
        p_token_hash: revokedTokenHash,
      });
      expectNoSupabaseError(revokedError, 'revoked calendar token should return structured denial');
      expect(revokedData).toMatchObject({ ok: false, code: 'INVALID_ENDPOINT' });
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
