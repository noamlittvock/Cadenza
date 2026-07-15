-- Cadenza · 0015 · Concert program scoped RLS refinement
--
-- Concert programs expose student/staff performer lists and private planning
-- notes. Replace the original broad org-member read with:
--   - admin/super_admin full direct table access;
--   - assigned or performing staff read for programs linked to their event or
--     listing them in a piece performerStaffIds array;
--   - admin-only writes and private export/document reads.
--
-- Private concert program exports live in the documents bucket under:
--   {orgId}/concert-programs/{programId}/{filename}
-- Public website/program exposure remains D-23 provisional and must not use
-- direct table or storage grants.

create or replace function public.app_can_read_concert_program(
  p_org text,
  p_event_id text,
  p_pieces jsonb
)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_is_org_admin(p_org)
    or exists (
      select 1
      from public.org_members m
      where m.user_id = auth.uid()
        and m.org_id = p_org
        and m.role = 'STAFF'
        and m.staff_member_id is not null
        and not public.app_has_capability(p_org, 'finance')
        and (
          (
            p_event_id is not null
            and exists (
              select 1
              from public.event_participants ep
              where ep.org_id = p_org
                and coalesce(ep.data->>'eventId', ep.data->>'event_id') = p_event_id
                and coalesce(ep.data->>'staffMemberId', ep.data->>'staff_member_id') = m.staff_member_id
            )
          )
          or exists (
            select 1
            from jsonb_array_elements(coalesce(p_pieces, '[]'::jsonb)) piece
            where coalesce(piece->'performerStaffIds', '[]'::jsonb) ? m.staff_member_id
          )
        )
    );
$$;

comment on function public.app_can_read_concert_program(text, text, jsonb) is
  'Concert program read helper: admins read all; non-finance staff read only event-linked or performer-linked programs. D-23 public exposure is not enabled.';

drop policy if exists concert_programs_read on public.concert_programs;
create policy concert_programs_read on public.concert_programs
  for select using (
    public.app_is_org_admin(org_id)
    or public.app_can_read_concert_program(org_id, event_id, pieces)
  );

drop policy if exists concert_programs_write on public.concert_programs;
create policy concert_programs_write on public.concert_programs
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.app_is_org_member((storage.foldername(name))[1])
    and coalesce((storage.foldername(name))[2], '') <> 'agreements'
    and coalesce((storage.foldername(name))[2], '') not in ('assessments','certificates','report-cards','concert-programs')
  );

drop policy if exists documents_concert_programs_read on storage.objects;
create policy documents_concert_programs_read on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = 'concert-programs'
    and public.app_is_org_admin((storage.foldername(name))[1])
  );

-- Supabase owns storage.objects. The migration role may manage its policies,
-- but COMMENT ON those policies fails with SQLSTATE 42501.
