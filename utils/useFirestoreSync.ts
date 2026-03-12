import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';
import { CalendarEvent, Teacher, Room, GanttBlock, AppSettings, ListsState } from '../types';
import { ChartConfiguration } from '../types/chartBuilder';
import { INITIAL_TEACHERS, INITIAL_ROOMS, INITIAL_EVENTS, INITIAL_GANTT, INITIAL_SETTINGS, INITIAL_LISTS } from '../constants';

// ─── Shared listener registry ────────────────────────────────────────────────
// One Firestore onSnapshot per (orgId, collectionName) pair, shared across all
// hook instances. This prevents duplicate listeners that can trigger Firestore
// internal assertion failures (INTERNAL ASSERTION FAILED: Unexpected state).

type NotifyFn = (items: unknown[], loaded: boolean) => void;

interface SharedEntry {
    unsubscribe: () => void;
    observers: Set<NotifyFn>;
    latestItems: unknown[];
    loaded: boolean;
}

const sharedListeners = new Map<string, SharedEntry>();

function subscribeShared(orgId: string, collectionName: string, notify: NotifyFn): () => void {
    const key = `${orgId}:${collectionName}`;

    if (!sharedListeners.has(key)) {
        const observers = new Set<NotifyFn>();
        const entry: SharedEntry = { unsubscribe: () => {}, observers, latestItems: [], loaded: false };
        sharedListeners.set(key, entry);

        const q = query(collection(db, collectionName), where('orgId', '==', orgId));
        const unsub = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const e = sharedListeners.get(key);
            if (!e) return;
            e.latestItems = items;
            e.loaded = true;
            e.observers.forEach(cb => cb(items, true));
        }, (error) => {
            console.error(`Error syncing ${collectionName}:`, error);
            const e = sharedListeners.get(key);
            if (!e) return;
            e.loaded = true;
            e.observers.forEach(cb => cb(e.latestItems, true));
        });
        entry.unsubscribe = unsub;
    }

    const entry = sharedListeners.get(key)!;
    entry.observers.add(notify);

    // Deliver the latest snapshot immediately if already loaded
    if (entry.loaded) {
        notify(entry.latestItems, true);
    }

    return () => {
        const e = sharedListeners.get(key);
        if (!e) return;
        e.observers.delete(notify);
        // Defer the actual Firestore unsubscribe by one macrotask tick.
        // React 18 StrictMode unmounts and immediately remounts every component in
        // development. Without the delay, we'd call unsubscribe() while Firestore is
        // still delivering the initial snapshot for that target, causing
        // "INTERNAL ASSERTION FAILED: Unexpected state (ve: -1)".
        // The setTimeout lets the remount re-register its observer before we check
        // whether the listener is still needed.
        setTimeout(() => {
            const e2 = sharedListeners.get(key);
            if (e2 && e2.observers.size === 0) {
                e2.unsubscribe();
                sharedListeners.delete(key);
            }
        }, 0);
    };
}

// A generic hook for syncing a collection to React state
export function useFirestoreSync<T extends { id: string }>(
    collectionName: string,
    initialData: T[]
) {
    const { orgId } = useAuth();
    const [data, setData] = useState<T[]>(initialData);
    const [loading, setLoading] = useState(true);

    // Keep a ref to the latest data so updateData's delete-diff is never stale
    const dataRef = useRef(data);
    useEffect(() => { dataRef.current = data; }, [data]);

    useEffect(() => {
        // E2E auth bypass — skip Firestore entirely, use empty initial state
        if (import.meta.env.VITE_E2E_AUTH_BYPASS === 'true') {
            setLoading(false);
            return;
        }

        if (!orgId) {
            setData(initialData);
            setLoading(false);
            return;
        }

        const notify: NotifyFn = (items, loaded) => {
            setData(items as T[]);
            if (loaded) setLoading(false);
        };

        return subscribeShared(orgId, collectionName, notify);
    }, [orgId, collectionName]);

    // Wrapper for state updates to also write to Firestore
    const updateData = async (newData: T[] | ((prev: T[]) => T[])) => {
        // 1. Calculate the new state array (use ref for latest data to avoid stale closure)
        const currentData = dataRef.current;
        const resolvedData = typeof newData === 'function' ? (newData as any)(currentData) : newData;

        // 2. Optimistic UI update
        setData(resolvedData);

        if (!orgId) return;

        // 3. Sync to Firestore
        try {
            const batch = writeBatch(db);

            // We need to figure out what was added/updated and what was deleted.
            // In a robust app, we'd only write the specific changed doc. Because the current app 
            // passes whole arrays to `setTeachers` etc., we will batch write them.

            resolvedData.forEach(item => {
                const docRef = doc(db, collectionName, item.id);
                batch.set(docRef, { ...item, orgId }, { merge: true });
            });

            // Find deleted items — use ref for latest snapshot, not stale closure
            const newIds = new Set(resolvedData.map(i => i.id));
            currentData.forEach(oldItem => {
                if (!newIds.has(oldItem.id)) {
                    const docRef = doc(db, collectionName, oldItem.id);
                    batch.delete(docRef);
                }
            });

            await batch.commit();
        } catch (err) {
            console.error(`Error saving ${collectionName} to Firestore:`, err);
        }
    };

    return [data, updateData, loading] as const;
}

// Single Document Sync (for Settings, Lists, etc.)
export function useFirestoreSettings<T>(docId: string, initialData: T) {
    const { orgId } = useAuth();
    const [data, setData] = useState<T>(initialData);
    const [loading, setLoading] = useState(true);

    const isArrayType = Array.isArray(initialData);

    useEffect(() => {
        if (!orgId) {
            setData(initialData);
            setLoading(false);
            return;
        }

        // E2E auth bypass — skip Firestore entirely, use empty initial state
        if (import.meta.env.VITE_E2E_AUTH_BYPASS === 'true') {
            setLoading(false);
            return;
        }

        const docRef = doc(db, 'system_configs', `${orgId}_${docId}`);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const docData = docSnap.data();
                const { orgId: _, ...pureData } = docData;

                if (isArrayType) {
                    // Array-type data: unwrap from { _items: [...] } container
                    if (Array.isArray(pureData._items)) {
                        setData(pureData._items as T);
                    } else {
                        // Legacy fallback: reconstruct array from numeric-key object
                        const numericKeys = Object.keys(pureData).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
                        if (numericKeys.length > 0) {
                            setData(numericKeys.map(k => (pureData as any)[k]) as T);
                        } else {
                            setData(initialData);
                        }
                    }
                } else {
                    // Object-type data: merge with defaults to prevent missing fields
                    setData({ ...initialData, ...pureData } as T);
                }
            } else {
                setData(initialData);
            }
            setLoading(false);
        }, (error) => {
            console.error(`Error syncing config ${docId}:`, error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [orgId, docId]);

    const updateData = async (newData: T | ((prev: T) => T)) => {
        const resolvedData = typeof newData === 'function' ? (newData as any)(data) : newData;
        setData(resolvedData);

        if (!orgId) return;

        try {
            const docRef = doc(db, 'system_configs', `${orgId}_${docId}`);
            if (Array.isArray(resolvedData)) {
                // Array data: wrap in container to preserve array type in Firestore
                await setDoc(docRef, { _items: resolvedData, orgId }, { merge: false });
            } else {
                await setDoc(docRef, { ...resolvedData, orgId }, { merge: true });
            }
        } catch (err) {
            console.error(`Error saving config ${docId} to Firestore:`, err);
        }
    };

    return [data, updateData, loading] as const;
}
