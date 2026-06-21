-- ════════════════════════════════════════════════════════════════════════════
-- Cadenza · 0012 · Report definition RLS refinement
--
-- Reports are D-09 admin/finance only. Admins can manage every saved
-- definition; finance-capable non-admin users can read only definitions whose
-- source is finance/payroll-authorized. Run/export source authorization remains
-- a separate application/RLS slice.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists report_definitions_read on public.report_definitions;
create policy report_definitions_read on public.report_definitions
  for select using (
    public.app_is_org_admin(org_id)
    or (
      public.app_has_capability(org_id, 'finance')
      and source_entity in ('charges', 'payments', 'hoursEntries')
    )
  );

drop policy if exists report_definitions_write on public.report_definitions;
create policy report_definitions_write on public.report_definitions
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

comment on policy report_definitions_read on public.report_definitions is
  'D-09: report definitions are admin-readable, with finance-capable non-admin reads limited to finance/payroll-authorized source entities.';

comment on policy report_definitions_write on public.report_definitions is
  'D-09: only admins/super_admins can create, edit, pin, archive, or delete shared report definitions.';
