/**
 * Firestore + Auth Emulator seeding helpers.
 *
 * Uses the emulator REST APIs directly — no firebase-admin required.
 * Project ID: music-ctr-smart-cal (from VITE_FIREBASE_PROJECT_ID).
 *
 * Firestore REST: http://localhost:8080
 * Auth REST:      http://localhost:9099
 */

const PROJECT_ID = 'music-ctr-smart-cal';
const FS_BASE = `http://localhost:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_BASE = 'http://localhost:9099';

// ─── Firestore field encoding ─────────────────────────────────────────────────

type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { mapValue: { fields: FsFields } }
  | { arrayValue: { values: FsValue[] } };

type FsFields = Record<string, FsValue>;

function toValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
  return { nullValue: null };
}

function toFields(obj: Record<string, unknown>): FsFields {
  const fields: FsFields = {};
  for (const [key, val] of Object.entries(obj)) {
    fields[key] = toValue(val);
  }
  return fields;
}

// ─── Emulator operations ──────────────────────────────────────────────────────

/** Clear all Firestore documents in the emulator. */
export async function clearFirestore(): Promise<void> {
  const url = `http://localhost:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`clearFirestore failed: ${res.status} ${await res.text()}`);
  }
}

/** Clear all Auth accounts in the emulator. */
export async function clearAuth(): Promise<void> {
  const url = `${AUTH_BASE}/emulator/v1/projects/${PROJECT_ID}/accounts`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`clearAuth failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Create a user in the Auth emulator with a specific UID.
 * Uses the emulator-specific accounts endpoint.
 */
export async function createAuthUser(email: string, password: string, uid: string): Promise<void> {
  const url = `${AUTH_BASE}/emulator/v1/projects/${PROJECT_ID}/accounts`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, localId: uid }),
  });
  if (!res.ok) {
    throw new Error(`createAuthUser failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Write a document to the Firestore emulator at {collection}/{docId}.
 * Overwrites the entire document.
 */
export async function seedDoc(
  collection: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  const url = `${FS_BASE}/${collection}/${docId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) {
    throw new Error(`seedDoc(${collection}/${docId}) failed: ${res.status} ${await res.text()}`);
  }
}

/** Write multiple documents to the same collection. */
export async function seedCollection(
  collection: string,
  docs: Array<{ id: string } & Record<string, unknown>>
): Promise<void> {
  await Promise.all(docs.map(({ id, ...data }) => seedDoc(collection, id, { id, ...data })));
}
