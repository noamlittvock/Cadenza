-- Cadenza 0005 student/family RLS refinement.
-- Tightens the Student/Family slice from broad org-member read to:
--   admin/super_admin: all Student/Family rows in org
--   finance capability: all Student/Family rows in org for finance tab context
--   staff/teacher: only roster students assigned through enrollments +
--     teaching_assignments, or legacy embedded student assignments
-- Writes remain admin-only from the original uniform policies.

create or replace function public.app_can_read_student(
  p_org text,
  p_student_id text,
  p_student_data jsonb default '{}'::jsonb
)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.app_is_org_admin(p_org)
    or public.app_has_capability(p_org, 'finance')
    or exists (
      select 1
      from public.org_members m
      where m.user_id = auth.uid()
        and m.org_id = p_org
        and m.role = 'STAFF'
        and m.staff_member_id is not null
        and (
          exists (
            select 1
            from public.enrollments e
            join public.teaching_assignments ta
              on ta.org_id = e.org_id
             and coalesce(ta.data->>'activityId', ta.data->>'activity_id') =
                 coalesce(e.data->>'activityId', e.data->>'activity_id')
            where e.org_id = p_org
              and coalesce(e.data->>'studentId', e.data->>'student_id') = p_student_id
              and coalesce(e.data->>'status', 'ACTIVE') <> 'ARCHIVED'
              and coalesce(ta.data->>'staffMemberId', ta.data->>'staff_member_id') = m.staff_member_id
              and coalesce(ta.data->>'isArchived', 'false') <> 'true'
          )
          or exists (
            select 1
            from jsonb_array_elements(
              case
                when jsonb_typeof(p_student_data->'assignments') = 'array'
                then p_student_data->'assignments'
                else '[]'::jsonb
              end
            ) assignment
            where coalesce(assignment->>'staffMemberId', assignment->>'staff_member_id') = m.staff_member_id
              and coalesce(assignment->>'status', 'ACTIVE') <> 'ARCHIVED'
          )
        )
    );
$$;

comment on function public.app_can_read_student(text, text, jsonb) is
  'Student/Family slice RLS helper: admin and finance can read all org students; staff can read only own roster students.';

create or replace function public.app_can_read_family(
  p_org text,
  p_student_ids jsonb default '[]'::jsonb
)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.app_is_org_admin(p_org)
    or public.app_has_capability(p_org, 'finance')
    or exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(p_student_ids) = 'array' then p_student_ids
          else '[]'::jsonb
        end
      ) linked(student_id)
      join public.students s
        on s.org_id = p_org
       and s.id = linked.student_id
      where public.app_can_read_student(p_org, s.id, s.data)
    );
$$;

comment on function public.app_can_read_family(text, jsonb) is
  'Student/Family slice RLS helper: family visibility follows admin/finance access or at least one readable linked student.';

drop policy if exists students_read on public.students;
create policy students_read on public.students
  for select using (public.app_can_read_student(org_id, id, data));

drop policy if exists families_read on public.families;
create policy families_read on public.families
  for select using (public.app_can_read_family(org_id, student_ids));
