-- Cadenza 0016 rooms/absence request RLS.
-- D-21 provisional posture: approvals create review tasks/flags only. This
-- migration scopes request rows and linked Admin Inbox approval items; it does
-- not add automatic schedule, attendance, or payroll mutation.

-- ─── Operational requests: admin full access, requesting staff own pending flow ───

drop policy if exists operational_requests_read on public.operational_requests;
create policy operational_requests_read on public.operational_requests
  for select using (
    public.app_is_org_admin(org_id)
    or public.app_is_staff_self(org_id, requested_by_staff_id)
  );

drop policy if exists operational_requests_write on public.operational_requests;
create policy operational_requests_write on public.operational_requests
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

drop policy if exists operational_requests_teacher_insert on public.operational_requests;
create policy operational_requests_teacher_insert on public.operational_requests
  for insert with check (
    public.app_is_staff_self(org_id, requested_by_staff_id)
    and status = 'PENDING'
    and decided_by is null
    and decided_at is null
    and decision_note is null
  );

drop policy if exists operational_requests_teacher_cancel_pending on public.operational_requests;
create policy operational_requests_teacher_cancel_pending on public.operational_requests
  for update using (
    public.app_is_staff_self(org_id, requested_by_staff_id)
    and status = 'PENDING'
  ) with check (
    public.app_is_staff_self(org_id, requested_by_staff_id)
    and status = 'CANCELLED'
    and decided_by is null
    and decided_at is null
    and decision_note is null
  );

-- ─── Linked Admin Inbox approval requests: no broad member read of sensitive reasons ───

drop policy if exists admin_inbox_items_read on public.admin_inbox_items;
create policy admin_inbox_items_read on public.admin_inbox_items
  for select using (
    public.app_is_org_admin(org_id)
    or (
      coalesce(data->>'type', '') <> 'APPROVAL_REQUEST'
      and public.app_is_org_member(org_id)
    )
    or (
      data->>'type' = 'APPROVAL_REQUEST'
      and data->>'relatedEntityType' = 'operationalRequest'
      and public.app_is_staff_self(org_id, data->>'requestedBy')
    )
  );

drop policy if exists admin_inbox_items_write on public.admin_inbox_items;
create policy admin_inbox_items_write on public.admin_inbox_items
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

drop policy if exists admin_inbox_items_operational_request_teacher_insert on public.admin_inbox_items;
create policy admin_inbox_items_operational_request_teacher_insert on public.admin_inbox_items
  for insert with check (
    data->>'type' = 'APPROVAL_REQUEST'
    and data->>'status' = 'OPEN'
    and data->>'relatedEntityType' = 'operationalRequest'
    and public.app_is_staff_self(org_id, data->>'requestedBy')
  );
