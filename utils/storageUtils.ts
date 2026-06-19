// ─── Document storage (Supabase Storage) ────────────────────────────────────
// Backend-agnostic upload/delete. Under Supabase the object path leads with the
// orgId so storage RLS (`(storage.foldername(name))[1]`) scopes by tenant — see
// supabase/migrations/0001_core_schema.sql.

import { getSupabase, DOCUMENTS_BUCKET } from './supabaseClient';

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Upload a document under the org's documents path.
 * Returns the public/download URL and the storage path (for later deletion).
 */
export async function uploadDocument(
  orgId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  const timestamp = Date.now();
  const safeName = safeFileName(file.name);

  const sb = getSupabase();
  if (!sb) throw new Error('[storageUtils] Supabase not configured');
  const path = `${orgId}/documents/${timestamp}_${safeName}`;
  const { error } = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: signedError } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signedError) throw signedError;
  const url = data.signedUrl;
  return { url, path };
}

/**
 * Upload a countersigned agreement PDF under the private agreements prefix.
 * Direct reads for this prefix are admin-only in storage RLS.
 */
export async function uploadAgreementPdf(
  orgId: string,
  agreementAcceptanceId: string,
  file: File,
): Promise<{ path: string; signatureRef: string }> {
  const timestamp = Date.now();
  const safeName = safeFileName(file.name || 'signed-agreement.pdf');

  const sb = getSupabase();
  if (!sb) throw new Error('[storageUtils] Supabase not configured');
  const path = `${orgId}/agreements/${agreementAcceptanceId}/${timestamp}_${safeName}`;
  const { error } = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/pdf',
  });
  if (error) throw error;
  return { path, signatureRef: `private://documents/${path}` };
}

/** Delete a document file by its storage path. */
export async function deleteDocument(path: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('[storageUtils] Supabase not configured');
  const { error } = await sb.storage.from(DOCUMENTS_BUCKET).remove([path]);
  if (error) throw error;
}
