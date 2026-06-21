-- Cadenza 0013 roster/program scoped read foundation.
-- Ensembles, theory groups, and school programs expose student roster payloads.
-- Direct HYBRID table reads are narrowed to admins; assigned teachers read only
-- their own roster slices through the scoped RPC below.

create or replace function public.app_can_read_roster_program(
  p_org text,
  p_activity_id text,
  p_l2_id text default null
)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.app_is_org_admin(p_org)
    or (
      not public.app_has_capability(p_org, 'finance')
      and exists (
        select 1
        from public.org_members m
        join public.teaching_assignments ta
          on ta.org_id = m.org_id
        where m.user_id = auth.uid()
          and m.org_id = p_org
          and m.role = 'STAFF'
          and m.staff_member_id is not null
          and coalesce(ta.data->>'staffMemberId', ta.data->>'staff_member_id') = m.staff_member_id
          and coalesce(ta.data->>'activityId', ta.data->>'activity_id') = p_activity_id
          and coalesce(ta.data->>'isArchived', 'false') <> 'true'
          and (
            coalesce(ta.data->>'scope', 'ACTIVITY') = 'ACTIVITY'
            or coalesce(ta.data->>'scope', 'ACTIVITY') = 'L1'
            or (
              coalesce(ta.data->>'scope', 'ACTIVITY') = 'L2'
              and p_l2_id is not null
              and coalesce(ta.data->>'l2Id', ta.data->>'l2_id') = p_l2_id
            )
          )
      )
    );
$$;

comment on function public.app_can_read_roster_program(text, text, text) is
  'Roster/program read helper: admins read all; non-finance staff read only activities or L2 slices assigned through teaching_assignments.';

create or replace function public.get_roster_program_view(
  p_org text,
  p_kind text default 'ALL'
)
returns table (
  activity_id text,
  kind text,
  activity jsonb,
  enrollment_ids text[],
  student_ids text[],
  students jsonb,
  l2_ids text[],
  assignment_ids text[],
  assigned_staff_member_ids text[],
  archived_enrollment_ids text[],
  missing_student_ids text[],
  archived_student_ids text[],
  duplicate_student_ids text[]
)
language sql stable security definer set search_path = public as $$
  with me as (
    select m.staff_member_id, public.app_is_org_admin(p_org) as is_admin
    from public.org_members m
    where m.user_id = auth.uid()
      and m.org_id = p_org
    limit 1
  ),
  visible_activities as (
    select
      a.id,
      a.data,
      case
        when coalesce(a.data->>'template', '') = 'ENSEMBLE' then 'ENSEMBLE'
        when coalesce(a.data->>'template', '') = 'PROGRAM' then 'PROGRAM'
        when coalesce(a.data->>'activityType', a.data->>'activity_type', '') = 'ACADEMIC'
          or coalesce(a.data->>'name', '') ~* 'theory' then 'THEORY'
        else null
      end as kind
    from public.activities a
    where a.org_id = p_org
      and coalesce(a.data->>'isArchived', 'false') <> 'true'
  ),
  filtered_activities as (
    select va.*
    from visible_activities va
    where va.kind is not null
      and (p_kind is null or p_kind = 'ALL' or va.kind = p_kind)
      and (
        public.app_is_org_admin(p_org)
        or exists (
          select 1
          from public.teaching_assignments ta
          where ta.org_id = p_org
            and coalesce(ta.data->>'activityId', ta.data->>'activity_id') = va.id
            and coalesce(ta.data->>'isArchived', 'false') <> 'true'
            and coalesce(ta.data->>'staffMemberId', ta.data->>'staff_member_id') = (select staff_member_id from me)
        )
      )
      and not (
        not public.app_is_org_admin(p_org)
        and public.app_has_capability(p_org, 'finance')
      )
  ),
  visible_enrollments as (
    select
      fa.id as activity_id,
      e.id,
      e.data,
      coalesce(e.data->>'studentId', e.data->>'student_id') as student_id,
      coalesce(e.data->>'l2Id', e.data->>'l2_id') as l2_id,
      coalesce(e.data->>'status', 'ACTIVE') as status
    from filtered_activities fa
    join public.enrollments e
      on e.org_id = p_org
     and coalesce(e.data->>'activityId', e.data->>'activity_id') = fa.id
    where public.app_is_org_admin(p_org)
      or public.app_can_read_roster_program(
        p_org,
        fa.id,
        coalesce(e.data->>'l2Id', e.data->>'l2_id')
      )
  ),
  active_enrollments as (
    select *
    from visible_enrollments
    where status = 'ACTIVE'
  ),
  active_students as (
    select
      ae.activity_id,
      ae.id as enrollment_id,
      ae.student_id,
      ae.l2_id,
      s.data as student_data,
      coalesce(s.data->>'isArchived', 'false') = 'true' as is_archived
    from active_enrollments ae
    left join public.students s
      on s.org_id = p_org
     and s.id = ae.student_id
  ),
  activity_assignments as (
    select
      fa.id as activity_id,
      ta.id,
      coalesce(ta.data->>'staffMemberId', ta.data->>'staff_member_id') as staff_member_id
    from filtered_activities fa
    join public.teaching_assignments ta
      on ta.org_id = p_org
     and coalesce(ta.data->>'activityId', ta.data->>'activity_id') = fa.id
     and coalesce(ta.data->>'isArchived', 'false') <> 'true'
    where public.app_is_org_admin(p_org)
      or coalesce(ta.data->>'staffMemberId', ta.data->>'staff_member_id') = (select staff_member_id from me)
  ),
  duplicate_students as (
    select activity_id, student_id
    from active_enrollments
    group by activity_id, student_id
    having count(*) > 1
  )
  select
    fa.id as activity_id,
    fa.kind,
    jsonb_build_object(
      'id', fa.id,
      'name', coalesce(fa.data->>'name', fa.id),
      'template', fa.data->>'template',
      'activityType', coalesce(fa.data->>'activityType', fa.data->>'activity_type'),
      'isArchived', coalesce(fa.data->>'isArchived', 'false') = 'true'
    ) as activity,
    coalesce(array_agg(distinct ae.id) filter (where ae.id is not null), '{}'::text[]) as enrollment_ids,
    coalesce(array_agg(distinct ast.student_id) filter (where ast.student_data is not null and not ast.is_archived), '{}'::text[]) as student_ids,
    coalesce(
      jsonb_agg(
        distinct jsonb_build_object(
          'id', ast.student_id,
          'fullName', coalesce(ast.student_data->>'fullName', ast.student_id),
          'familyId', coalesce(ast.student_data->>'familyId', ast.student_data->>'family_id'),
          'isArchived', ast.is_archived
        )
      ) filter (where ast.student_data is not null and not ast.is_archived),
      '[]'::jsonb
    ) as students,
    coalesce(array_agg(distinct ae.l2_id) filter (where ae.l2_id is not null), '{}'::text[]) as l2_ids,
    coalesce(array_agg(distinct aa.id) filter (where aa.id is not null), '{}'::text[]) as assignment_ids,
    coalesce(array_agg(distinct aa.staff_member_id) filter (where aa.staff_member_id is not null), '{}'::text[]) as assigned_staff_member_ids,
    coalesce(array_agg(distinct ve.id) filter (where ve.status = 'ARCHIVED'), '{}'::text[]) as archived_enrollment_ids,
    coalesce(array_agg(distinct ast.student_id) filter (where ast.student_data is null), '{}'::text[]) as missing_student_ids,
    coalesce(array_agg(distinct ast.student_id) filter (where ast.is_archived), '{}'::text[]) as archived_student_ids,
    coalesce(array_agg(distinct ds.student_id) filter (where ds.student_id is not null), '{}'::text[]) as duplicate_student_ids
  from filtered_activities fa
  left join visible_enrollments ve on ve.activity_id = fa.id
  left join active_enrollments ae on ae.activity_id = fa.id
  left join active_students ast on ast.activity_id = fa.id
  left join activity_assignments aa on aa.activity_id = fa.id
  left join duplicate_students ds on ds.activity_id = fa.id
  group by fa.id, fa.kind, fa.data
  order by coalesce(fa.data->>'name', fa.id), fa.id;
$$;

comment on function public.get_roster_program_view(text, text) is
  'Scoped roster/program read model for ensembles, theory groups, and school programs. Use instead of direct HYBRID table reads in product surfaces.';

revoke all on function public.get_roster_program_view(text, text) from public;
grant execute on function public.get_roster_program_view(text, text) to authenticated;

drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities
  for select using (public.app_is_org_admin(org_id));

drop policy if exists enrollments_read on public.enrollments;
create policy enrollments_read on public.enrollments
  for select using (public.app_is_org_admin(org_id));

drop policy if exists teaching_assignments_read on public.teaching_assignments;
create policy teaching_assignments_read on public.teaching_assignments
  for select using (public.app_is_org_admin(org_id));
