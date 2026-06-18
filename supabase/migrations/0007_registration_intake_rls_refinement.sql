-- ════════════════════════════════════════════════════════════════════════════
-- Cadenza · 0007 · Registration intake RLS refinement
--
-- Public registration intake rows contain applicant, student, guardian, and
-- consent data. The queue is admin/super_admin only; public applicants submit
-- through public.submit_registration_intake(), not direct table policies.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists registration_intake_read on public.registration_intake;
create policy registration_intake_read on public.registration_intake
  for select using (public.app_is_org_admin(org_id));

drop policy if exists registration_intake_write on public.registration_intake;
create policy registration_intake_write on public.registration_intake
  for all using (public.app_is_org_admin(org_id)) with check (public.app_is_org_admin(org_id));

comment on policy registration_intake_read on public.registration_intake is
  'Registration intake queue is admin/super_admin only. Public applicants use the D-07 submit_registration_intake RPC and receive no direct row readback.';
