// ─── Supabase data adapter ───────────────────────────────────────────────────
// Mirrors the legacy read/write contract consumed by useSupabaseSync, so the
// React state ergonomics ([data, updateData, loading]) are preserved while the
// backend becomes Supabase Postgres + Realtime.
//
// Two storage modes per collection (see COLLECTION_TO_TABLE):
//   HYBRID     — legacy/core collections kept as { id, org_id, data jsonb }.
//                The app document lives under `data`; we (un)wrap on read/write.
//   NORMALIZED — blueprint tables with real snake_case columns. Top-level keys
//                are case-converted; nested objects/arrays pass through as jsonb.

import { getSupabase } from './supabaseClient';

export type Mode = 'HYBRID' | 'NORMALIZED';
export interface TableSpec { table: string; mode: Mode; }

/** camelCase collection name → Postgres table + storage mode. */
export const COLLECTION_TO_TABLE: Record<string, TableSpec> = {
  // ── core (hybrid jsonb document) ──
  events: { table: 'events', mode: 'HYBRID' },
  teachers: { table: 'teachers', mode: 'HYBRID' },
  rooms: { table: 'rooms', mode: 'HYBRID' },
  ganttBlocks: { table: 'gantt_blocks', mode: 'HYBRID' },
  adminInboxItems: { table: 'admin_inbox_items', mode: 'HYBRID' },
  hoursReports: { table: 'hours_reports', mode: 'HYBRID' },
  calendarSubscriptions: { table: 'calendar_subscriptions', mode: 'HYBRID' },
  scenarios: { table: 'scenarios', mode: 'HYBRID' },
  scenarioDeltas: { table: 'scenario_deltas', mode: 'HYBRID' },
  students: { table: 'students', mode: 'HYBRID' },
  activities: { table: 'activities', mode: 'HYBRID' },
  l1Subcategories: { table: 'l1_subcategories', mode: 'HYBRID' },
  l2Subcategories: { table: 'l2_subcategories', mode: 'HYBRID' },
  staffMembers: { table: 'staff_members', mode: 'HYBRID' },
  teachingAssignments: { table: 'teaching_assignments', mode: 'HYBRID' },
  orgRoles: { table: 'org_roles', mode: 'HYBRID' },
  enrollments: { table: 'enrollments', mode: 'HYBRID' },
  eventParticipants: { table: 'event_participants', mode: 'HYBRID' },
  importSessions: { table: 'import_sessions', mode: 'HYBRID' },
  systemConfigs: { table: 'system_configs', mode: 'HYBRID' },
  // ── blueprint (normalized columns) ──
  registrationIntake: { table: 'registration_intake', mode: 'NORMALIZED' },
  families: { table: 'families', mode: 'NORMALIZED' },
  lessonRecords: { table: 'lesson_records', mode: 'NORMALIZED' },
  operationalRequests: { table: 'operational_requests', mode: 'NORMALIZED' },
  examSessions: { table: 'exam_sessions', mode: 'NORMALIZED' },
  examinerSubmissions: { table: 'examiner_submissions', mode: 'NORMALIZED' },
  certificates: { table: 'certificates', mode: 'NORMALIZED' },
  reportCards: { table: 'report_cards', mode: 'NORMALIZED' },
  concertPrograms: { table: 'concert_programs', mode: 'NORMALIZED' },
  hoursEntries: { table: 'hours_entries', mode: 'NORMALIZED' },
  charges: { table: 'charges', mode: 'NORMALIZED' },
  payments: { table: 'payments', mode: 'NORMALIZED' },
  adjustments: { table: 'adjustments', mode: 'NORMALIZED' },
  balanceSnapshots: { table: 'balance_snapshots', mode: 'NORMALIZED' },
  rolloverRuns: { table: 'rollover_runs', mode: 'NORMALIZED' },
  publicEndpoints: { table: 'public_endpoints', mode: 'NORMALIZED' },
  agreementTemplates: { table: 'agreement_templates', mode: 'NORMALIZED' },
  agreementAcceptances: { table: 'agreement_acceptances', mode: 'NORMALIZED' },
  instruments: { table: 'instruments', mode: 'NORMALIZED' },
  instrumentLoans: { table: 'instrument_loans', mode: 'NORMALIZED' },
  instrumentRepairs: { table: 'instrument_repairs', mode: 'NORMALIZED' },
  staffEvaluations: { table: 'staff_evaluations', mode: 'NORMALIZED' },
  reportDefinitions: { table: 'report_definitions', mode: 'NORMALIZED' },
};

export function tableSpecFor(collectionName: string): TableSpec {
  return COLLECTION_TO_TABLE[collectionName] ?? { table: collectionName, mode: 'HYBRID' };
}

// ─── Key-case conversion (top-level only; nested jsonb preserved) ────────────

const camelToSnake = (k: string) => k.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
const snakeToCamel = (k: string) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Exported for unit tests (supabaseSync.test.ts). Pure; no Supabase dependency.
export function rowToApp(spec: TableSpec, row: Record<string, unknown>): Record<string, unknown> {
  if (spec.mode === 'HYBRID') {
    const data = (row.data as Record<string, unknown>) ?? {};
    return { id: row.id, orgId: row.org_id, ...data };
  }
  // NORMALIZED: snake→camel for every top-level column (org_id/created_at/updated_at
  // included); nested object/array values are jsonb and pass through untouched.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out;
}

export function appToRow(spec: TableSpec, orgId: string, item: Record<string, unknown>): Record<string, unknown> {
  if (spec.mode === 'HYBRID') {
    const { id, orgId: _omit, ...rest } = item as Record<string, unknown> & { id: string };
    return { id, org_id: orgId, data: rest };
  }
  const out: Record<string, unknown> = { org_id: orgId };
  for (const [k, v] of Object.entries(item)) {
    if (k === 'orgId') continue;
    if (v === undefined) continue;
    out[camelToSnake(k)] = v;
  }
  return out;
}

// ─── Read + Realtime subscribe ───────────────────────────────────────────────

type NotifyFn = (items: unknown[], loaded: boolean) => void;

async function fetchAll(spec: TableSpec, orgId: string): Promise<unknown[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from(spec.table).select('*').eq('org_id', orgId);
  if (error) {
    console.error(`[supabaseSync] fetch ${spec.table}:`, error.message);
    return [];
  }
  return (data ?? []).map(r => rowToApp(spec, r as Record<string, unknown>));
}

/**
 * Subscribes to a collection: emits the full set on load and on any change.
 * Returns an unsubscribe function.
 */
export function subscribeCollection(orgId: string, collectionName: string, notify: NotifyFn): () => void {
  const spec = tableSpecFor(collectionName);
  const sb = getSupabase();
  if (!sb) { notify([], true); return () => {}; }

  let cancelled = false;
  const refresh = () => { void fetchAll(spec, orgId).then(items => { if (!cancelled) notify(items, true); }); };
  refresh();

  const channel = sb
    .channel(`${spec.table}:${orgId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: spec.table, filter: `org_id=eq.${orgId}` },
      () => refresh())
    .subscribe();

  return () => {
    cancelled = true;
    void sb.removeChannel(channel);
  };
}

// ─── Write (upsert changed, delete removed) ──────────────────────────────────

export async function writeCollectionItems(
  orgId: string,
  collectionName: string,
  items: Array<{ id: string }>,
  deletedIds: string[],
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const spec = tableSpecFor(collectionName);

  if (items.length) {
    const rows = items.map(i => appToRow(spec, orgId, i as Record<string, unknown>));
    const { error } = await sb.from(spec.table).upsert(rows, { onConflict: 'id' });
    if (error) console.error(`[supabaseSync] upsert ${spec.table}:`, error.message);
  }
  if (deletedIds.length) {
    const { error } = await sb.from(spec.table).delete().in('id', deletedIds).eq('org_id', orgId);
    if (error) console.error(`[supabaseSync] delete ${spec.table}:`, error.message);
  }
}

export async function fetchCollectionItems<T extends { id: string }>(
  orgId: string,
  collectionName: string,
): Promise<T[]> {
  const spec = tableSpecFor(collectionName);
  return (await fetchAll(spec, orgId)) as T[];
}

export async function upsertCollectionItems<T extends { id: string }>(
  orgId: string,
  collectionName: string,
  items: T[],
): Promise<void> {
  await writeCollectionItems(orgId, collectionName, items, []);
}

export async function addCollectionItem<T extends { id: string }>(
  orgId: string,
  collectionName: string,
  item: T,
): Promise<T> {
  await writeCollectionItems(orgId, collectionName, [item], []);
  return item;
}

export async function patchCollectionItem<T extends { id: string }>(
  orgId: string,
  collectionName: string,
  id: string,
  patch: Partial<T>,
): Promise<void> {
  const existing = (await fetchCollectionItems<T>(orgId, collectionName)).find(item => item.id === id);
  const next = { ...(existing ?? { id } as T), ...patch, id };
  await writeCollectionItems(orgId, collectionName, [next], []);
}

export async function deleteCollectionItems(
  orgId: string,
  collectionName: string,
  ids?: string[],
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const spec = tableSpecFor(collectionName);
  const q = sb.from(spec.table).delete().eq('org_id', orgId);
  const { error } = ids && ids.length ? await q.in('id', ids) : await q;
  if (error) console.error(`[supabaseSync] delete ${spec.table}:`, error.message);
}

// ─── Settings (system_configs/{orgId}_{docId}) ───────────────────────────────

const ARRAY_WRAP_KEY = '_items';

export function subscribeSettings(
  orgId: string,
  docId: string,
  isArray: boolean,
  notify: (value: unknown | null, loaded: boolean) => void,
): () => void {
  const sb = getSupabase();
  if (!sb) { notify(null, true); return () => {}; }
  let cancelled = false;

  const refresh = () => {
    void sb.from('system_configs').select('data').eq('org_id', orgId).eq('doc_id', docId).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error(`[supabaseSync] settings ${docId}:`, error.message); notify(null, true); return; }
        const payload = (data?.data as Record<string, unknown> | undefined) ?? null;
        if (payload && isArray) notify(Array.isArray(payload[ARRAY_WRAP_KEY]) ? payload[ARRAY_WRAP_KEY] : null, true);
        else notify(payload, true);
      });
  };
  refresh();

  const channel = sb
    .channel(`system_configs:${orgId}:${docId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'system_configs', filter: `org_id=eq.${orgId}` },
      () => refresh())
    .subscribe();

  return () => { cancelled = true; void sb.removeChannel(channel); };
}

export async function writeSettingsDoc(orgId: string, docId: string, value: unknown): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const data = Array.isArray(value) ? { [ARRAY_WRAP_KEY]: value } : (value as Record<string, unknown>);
  const { error } = await sb.from('system_configs')
    .upsert({ id: `${orgId}_${docId}`, org_id: orgId, doc_id: docId, data }, { onConflict: 'id' });
  if (error) console.error(`[supabaseSync] write settings ${docId}:`, error.message);
}
