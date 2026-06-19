-- ════════════════════════════════════════════════════════════════════════════
-- Cadenza · 0008 · Agreement direct-table RLS refinement
--
-- Agreement templates and acceptances contain consent text, signer lineage, and
-- signature references. Direct table access is admin/super_admin only; public
-- signing must use the D-07/D-14 scoped endpoint path added in a later slice.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists agreement_templates_read on public.agreement_templates;
create policy agreement_templates_read on public.agreement_templates
  for select using (public.app_is_org_admin(org_id));

drop policy if exists agreement_templates_write on public.agreement_templates;
create policy agreement_templates_write on public.agreement_templates
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

drop policy if exists agreement_acceptances_read on public.agreement_acceptances;
create policy agreement_acceptances_read on public.agreement_acceptances
  for select using (public.app_is_org_admin(org_id));

drop policy if exists agreement_acceptances_write on public.agreement_acceptances;
create policy agreement_acceptances_write on public.agreement_acceptances
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

comment on policy agreement_templates_read on public.agreement_templates is
  'Agreement template direct reads are admin/super_admin only. Public signers use a scoped AGREEMENT_ACCEPTANCE public_endpoints path, not table SELECT.';

comment on policy agreement_acceptances_read on public.agreement_acceptances is
  'Agreement acceptance direct reads are admin/super_admin only because rows contain consent status, target lineage, and signature references.';
