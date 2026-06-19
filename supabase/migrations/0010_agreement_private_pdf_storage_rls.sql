-- ════════════════════════════════════════════════════════════════════════════
-- Cadenza · 0010 · Agreement private PDF storage RLS refinement
--
-- Signed agreement PDFs live under the existing private documents bucket using
-- the path convention:
--   {orgId}/agreements/{agreementAcceptanceId}/{filename}
--
-- The original documents bucket read policy was org-member readable. Agreement
-- PDFs contain signed consent evidence, so direct storage reads for that prefix
-- are admin/super_admin only. Public signers must use a future exact scoped
-- token path rather than broad object reads.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.app_is_org_member((storage.foldername(name))[1])
    and coalesce((storage.foldername(name))[2], '') <> 'agreements'
  );

drop policy if exists documents_agreements_read on storage.objects;
create policy documents_agreements_read on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = 'agreements'
    and public.app_is_org_admin((storage.foldername(name))[1])
  );

comment on policy documents_read on storage.objects is
  'General document reads remain org-member scoped except signed agreement PDFs under {orgId}/agreements/..., which are protected by documents_agreements_read.';

comment on policy documents_agreements_read on storage.objects is
  'Signed agreement/PDF direct storage reads are admin/super_admin only. Public signer file access must use an exact scoped AGREEMENT_ACCEPTANCE token path, not broad object SELECT.';
