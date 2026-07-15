-- ════════════════════════════════════════════════════════════════════════════
-- Cadenza · 0014 · Assessment/session scoped RLS refinement
--
-- Exams, certificates, and report cards contain private student academic data.
-- This replaces the original uniform org-member read policies with:
--   - admin/super_admin full direct table access;
--   - assigned examiner read of their own session and own submissions only;
--   - assigned examiner insert/update of own submissions before final grading;
--   - admin-only certificate/report-card direct access.
--
-- Assessment document files live in the private documents bucket under:
--   {orgId}/assessments/{entityId}/{filename}
-- with legacy-safe protected prefixes for {orgId}/certificates/... and
-- {orgId}/report-cards/... as well.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.app_can_read_exam_session(
  p_org text,
  p_exam_session_id text
)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.org_members m
    join public.exam_sessions s
      on s.org_id = m.org_id
     and s.id = p_exam_session_id
    where m.user_id = auth.uid()
      and m.org_id = p_org
      and m.role = 'STAFF'
      and m.staff_member_id is not null
      and not public.app_has_capability(p_org, 'finance')
      and s.examiner_staff_ids ? m.staff_member_id
  );
$$;

create or replace function public.app_is_assigned_examiner(
  p_org text,
  p_exam_session_id text,
  p_student_id text,
  p_examiner_staff_id text
)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.org_members m
    join public.exam_sessions s
      on s.org_id = m.org_id
     and s.id = p_exam_session_id
    where m.user_id = auth.uid()
      and m.org_id = p_org
      and m.role = 'STAFF'
      and m.staff_member_id is not null
      and m.staff_member_id = p_examiner_staff_id
      and not public.app_has_capability(p_org, 'finance')
      and s.examiner_staff_ids ? p_examiner_staff_id
      and s.student_ids ? p_student_id
  );
$$;

create or replace function public.app_can_write_examiner_submission(
  p_org text,
  p_exam_session_id text,
  p_student_id text,
  p_examiner_staff_id text
)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.org_members m
    join public.exam_sessions s
      on s.org_id = m.org_id
     and s.id = p_exam_session_id
    where m.user_id = auth.uid()
      and m.org_id = p_org
      and m.role = 'STAFF'
      and m.staff_member_id is not null
      and m.staff_member_id = p_examiner_staff_id
      and not public.app_has_capability(p_org, 'finance')
      and s.examiner_staff_ids ? p_examiner_staff_id
      and s.student_ids ? p_student_id
      and s.status in ('SCHEDULED','IN_PROGRESS')
  );
$$;

drop policy if exists exam_sessions_read on public.exam_sessions;
create policy exam_sessions_read on public.exam_sessions
  for select using (
    public.app_is_org_admin(org_id)
    or public.app_can_read_exam_session(org_id, id)
  );

drop policy if exists exam_sessions_write on public.exam_sessions;
create policy exam_sessions_write on public.exam_sessions
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

drop policy if exists examiner_submissions_read on public.examiner_submissions;
create policy examiner_submissions_read on public.examiner_submissions
  for select using (
    public.app_is_org_admin(org_id)
    or public.app_is_assigned_examiner(org_id, exam_session_id, student_id, examiner_staff_id)
  );

drop policy if exists examiner_submissions_write on public.examiner_submissions;
create policy examiner_submissions_write on public.examiner_submissions
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

drop policy if exists examiner_submissions_examiner_insert on public.examiner_submissions;
create policy examiner_submissions_examiner_insert on public.examiner_submissions
  for insert with check (
    public.app_can_write_examiner_submission(org_id, exam_session_id, student_id, examiner_staff_id)
  );

drop policy if exists examiner_submissions_examiner_update on public.examiner_submissions;
create policy examiner_submissions_examiner_update on public.examiner_submissions
  for update using (
    public.app_can_write_examiner_submission(org_id, exam_session_id, student_id, examiner_staff_id)
  ) with check (
    public.app_can_write_examiner_submission(org_id, exam_session_id, student_id, examiner_staff_id)
  );

drop policy if exists certificates_read on public.certificates;
create policy certificates_read on public.certificates
  for select using (public.app_is_org_admin(org_id));

drop policy if exists certificates_write on public.certificates;
create policy certificates_write on public.certificates
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

drop policy if exists report_cards_read on public.report_cards;
create policy report_cards_read on public.report_cards
  for select using (public.app_is_org_admin(org_id));

drop policy if exists report_cards_write on public.report_cards;
create policy report_cards_write on public.report_cards
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.app_is_org_member((storage.foldername(name))[1])
    and coalesce((storage.foldername(name))[2], '') <> 'agreements'
    and coalesce((storage.foldername(name))[2], '') not in ('assessments','certificates','report-cards')
  );

drop policy if exists documents_assessments_read on storage.objects;
create policy documents_assessments_read on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] in ('assessments','certificates','report-cards')
    and public.app_is_org_admin((storage.foldername(name))[1])
  );

-- Supabase owns storage.objects. The migration role may manage its policies,
-- but COMMENT ON those policies fails with SQLSTATE 42501.
