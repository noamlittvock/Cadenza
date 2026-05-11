// ─── Local-mode persistence backend ───────────────────────────────────────────
// When VITE_LOCAL_MODE=true (or VITE_E2E_AUTH_BYPASS=true for back-compat with
// existing .env.local), useFirestoreSync/useFirestoreSettings persist to
// window.localStorage instead of Firestore. Lets dev/QA test functionality
// without a Firebase project, and survives page reloads + hot-reloads so the
// SuperAdmin DevTools can seed and inspect data locally.

export const LOCAL_MODE: boolean =
    import.meta.env.VITE_LOCAL_MODE === 'true' ||
    import.meta.env.VITE_E2E_AUTH_BYPASS === 'true';

const NAMESPACE = 'cadenza:local';

// Cache the localStorage handle once. Probing window.localStorage can throw in
// privacy-mode browsers; do it once at module load instead of on every call.
const LS: Storage | null = (() => {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
})();

function collectionKey(orgId: string, collectionName: string): string {
    return `${NAMESPACE}:${orgId}:col:${collectionName}`;
}

function settingsKey(orgId: string, docId: string): string {
    return `${NAMESPACE}:${orgId}:cfg:${docId}`;
}

// ─── Cross-tab + same-tab notification ──────────────────────────────────────
// localStorage 'storage' events only fire in *other* tabs, so we wrap writes
// with a custom notify() so listeners in the same tab also re-render. A single
// shared 'storage' listener dispatches by key — avoids one window listener per
// subscription (we mount many useFirestoreSync hooks per page).

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

if (typeof window !== 'undefined') {
    // Guard against HMR re-evaluating this module and stacking duplicate listeners.
    const w = window as Window & { __cadenzaLocalStoreInstalled?: boolean };
    if (!w.__cadenzaLocalStoreInstalled) {
        w.__cadenzaLocalStoreInstalled = true;
        window.addEventListener('storage', (e: StorageEvent) => {
            if (!e.key) return;
            const set = listeners.get(e.key);
            if (set) set.forEach(fn => fn());
        });
    }
}

function notify(key: string) {
    const set = listeners.get(key);
    if (!set) return;
    set.forEach(fn => fn());
}

export function subscribeKey(key: string, fn: Listener): () => void {
    let set = listeners.get(key);
    if (!set) {
        set = new Set();
        listeners.set(key, set);
    }
    set.add(fn);

    return () => {
        set!.delete(fn);
        if (set!.size === 0) listeners.delete(key);
    };
}

// ─── Read helpers ───────────────────────────────────────────────────────────

export function readCollection<T>(orgId: string, collectionName: string): T[] | null {
    if (!LS) return null;
    const raw = LS.getItem(collectionKey(orgId, collectionName));
    if (raw === null) return null;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch (err) {
        console.error(`[localStore] Corrupt data for ${collectionName}:`, err);
        return null;
    }
}

export function writeCollection<T>(orgId: string, collectionName: string, items: T[]): void {
    if (!LS) return;
    const key = collectionKey(orgId, collectionName);
    try {
        LS.setItem(key, JSON.stringify(items));
        notify(key);
    } catch (err) {
        console.error(`[localStore] Failed to write ${collectionName}:`, err);
    }
}

export function collectionSubKey(orgId: string, collectionName: string): string {
    return collectionKey(orgId, collectionName);
}

export function readSettings<T>(orgId: string, docId: string): T | null {
    if (!LS) return null;
    const raw = LS.getItem(settingsKey(orgId, docId));
    if (raw === null) return null;
    try {
        return JSON.parse(raw) as T;
    } catch (err) {
        console.error(`[localStore] Corrupt config ${docId}:`, err);
        return null;
    }
}

export function writeSettings<T>(orgId: string, docId: string, value: T): void {
    if (!LS) return;
    const key = settingsKey(orgId, docId);
    try {
        LS.setItem(key, JSON.stringify(value));
        notify(key);
    } catch (err) {
        console.error(`[localStore] Failed to write config ${docId}:`, err);
    }
}

export function settingsSubKey(orgId: string, docId: string): string {
    return settingsKey(orgId, docId);
}

// ─── Reset / inspect (for DevTools) ─────────────────────────────────────────

export function clearOrgLocalData(orgId: string): number {
    if (!LS) return 0;
    const prefix = `${NAMESPACE}:${orgId}:`;
    const toDelete: string[] = [];
    for (let i = 0; i < LS.length; i++) {
        const k = LS.key(i);
        if (k && k.startsWith(prefix)) toDelete.push(k);
    }
    toDelete.forEach(k => {
        LS.removeItem(k);
        notify(k);
    });
    return toDelete.length;
}
