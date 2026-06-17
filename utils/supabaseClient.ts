// ─── Supabase client (app data/auth/storage) ────────────────────────────────
// The client is created lazily from Vite env vars. Local/e2e mode uses
// localStorage via the sync hooks; production runtime uses Supabase only.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when a Supabase project is configured for the current build. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const USE_SUPABASE = isSupabaseConfigured;

let client: SupabaseClient | null = null;

/** Returns the singleton Supabase client, or null when unconfigured. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** Storage bucket holding org-scoped documents. */
export const DOCUMENTS_BUCKET = 'documents';
