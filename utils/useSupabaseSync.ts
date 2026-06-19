import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { CalendarEvent, Teacher, Room, GanttBlock, AppSettings } from '../types';
import { INITIAL_TEACHERS, INITIAL_ROOMS, INITIAL_EVENTS, INITIAL_GANTT, INITIAL_SETTINGS } from '../constants';
import {
    LOCAL_MODE,
    readCollection,
    writeCollection,
    collectionSubKey,
    readSettings,
    writeSettings,
    settingsSubKey,
    subscribeKey,
} from './localStore';
import { USE_SUPABASE } from './supabaseClient';
import {
    subscribeCollection as supaSubscribeCollection,
    writeCollectionItems as supaWriteCollectionItems,
    subscribeSettings as supaSubscribeSettings,
    writeSettingsDoc as supaWriteSettingsDoc,
} from './supabaseSync';

// ─── Shared listener types ──────────────────────────────────────────────────

type NotifyFn = (items: unknown[], loaded: boolean) => void;

const stableCollectionItem = (item: unknown): string => JSON.stringify(item);

export function diffCollectionWriteSet<T extends { id: string }>(
    currentData: T[],
    resolvedData: T[]
): { changedItems: T[]; deletedIds: string[] } {
    const currentById = new Map(currentData.map(item => [item.id, item] as [string, T]));
    const resolvedIds = new Set(resolvedData.map(item => item.id));
    const deletedIds = currentData.filter(item => !resolvedIds.has(item.id)).map(item => item.id);
    const changedItems = resolvedData.filter(item => {
        const existing = currentById.get(item.id);
        return !existing || stableCollectionItem(existing) !== stableCollectionItem(item);
    });

    return { changedItems, deletedIds };
}

// A generic hook for syncing a collection to React state.
export function useSupabaseSync<T extends { id: string }>(
    collectionName: string,
    initialData: T[]
) {
    const { orgId } = useAuth();
    const [data, setData] = useState<T[]>(initialData);
    const [loading, setLoading] = useState(true);

    // Keep a ref to the latest data so updateData's delete-diff is never stale
    const dataRef = useRef(data);
    dataRef.current = data;

    useEffect(() => {
        if (!orgId) {
            setData(initialData);
            setLoading(false);
            return;
        }

        // ─── Local-mode branch ─────────────────────────────────────────────
        if (LOCAL_MODE) {
            const load = () => {
                const stored = readCollection<T>(orgId, collectionName);
                setData(stored ?? initialData);
                setLoading(false);
            };
            load();
            return subscribeKey(collectionSubKey(orgId, collectionName), load);
        }

        const notify: NotifyFn = (items, loaded) => {
            setData(items as T[]);
            if (loaded) setLoading(false);
        };

        // ─── Supabase branch (default runtime backend) ─────────────────────
        if (USE_SUPABASE) {
            return supaSubscribeCollection(orgId, collectionName, notify);
        }

        console.error(`[useSupabaseSync] Supabase is not configured for ${collectionName}.`);
        notify([], true);
        return () => {};
    }, [orgId, collectionName]);

    // Wrapper for state updates to also write to the active backend.
    const updateData = async (newData: T[] | ((prev: T[]) => T[])) => {
        // 1. Calculate the new state array (use ref for latest data to avoid stale closure)
        const currentData = dataRef.current;
        const resolvedData = typeof newData === 'function' ? (newData as any)(currentData) : newData;

        // 2. Optimistic UI update
        setData(resolvedData);

        if (!orgId) return;

        // ─── Local-mode write ─────────────────────────────────────────────
        // Mirror merge semantics: multiple hooks can write
        // disjoint field sets to the same collection (e.g. v1 `events` writes
        // start/end/teacherId, V2 `events` writes date/startTime/endTime — same
        // collection name, different shapes). Read existing items from local
        // storage and merge per-id so neither hook clobbers the other's fields.
        // Items absent from `resolvedData` but present in `currentData` are
        // treated as deletes; items absent from both are left untouched.
        if (LOCAL_MODE) {
            const stored = readCollection<T>(orgId, collectionName) ?? [];
            const deletedIds = new Set<string>(
                currentData.filter(c => !resolvedData.some(r => r.id === c.id)).map(c => c.id)
            );
            const storedById = new Map<string, T>(stored.map(s => [s.id, s] as [string, T]));
            resolvedData.forEach(item => {
                const existing = storedById.get(item.id) as Record<string, unknown> | undefined;
                storedById.set(item.id, (existing ? { ...existing, ...item } : item) as T);
            });
            deletedIds.forEach(id => storedById.delete(id));
            writeCollection(orgId, collectionName, Array.from(storedById.values()));
            return;
        }

        // ─── Supabase write (upsert changed, delete removed) ───────────────
        if (USE_SUPABASE) {
            const { changedItems, deletedIds } = diffCollectionWriteSet(currentData, resolvedData);
            await supaWriteCollectionItems(orgId, collectionName, changedItems, deletedIds);
            return;
        }

        console.error(`[useSupabaseSync] Supabase is not configured; skipped saving ${collectionName}.`);
    };

    return [data, updateData, loading] as const;
}

// Single Document Sync (for Settings, Lists, etc.)
export function useSupabaseSettings<T>(docId: string, initialData: T) {
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

        // ─── Local-mode branch ─────────────────────────────────────────────
        if (LOCAL_MODE) {
            const load = () => {
                const stored = readSettings<T>(orgId, docId);
                if (stored === null) {
                    setData(initialData);
                } else if (isArrayType) {
                    setData(Array.isArray(stored) ? (stored as T) : initialData);
                } else {
                    // Merge with defaults so newly-added settings fields stay defined
                    setData({ ...(initialData as any), ...(stored as any) } as T);
                }
                setLoading(false);
            };
            load();
            return subscribeKey(settingsSubKey(orgId, docId), load);
        }

        // ─── Supabase branch (default runtime backend) ─────────────────────
        if (USE_SUPABASE) {
            return supaSubscribeSettings(orgId, docId, isArrayType, (value, loaded) => {
                if (value === null) {
                    setData(initialData);
                } else if (isArrayType) {
                    setData(Array.isArray(value) ? (value as T) : initialData);
                } else {
                    setData({ ...(initialData as any), ...(value as any) } as T);
                }
                if (loaded) setLoading(false);
            });
        }

        console.error(`[useSupabaseSettings] Supabase is not configured for ${docId}.`);
        setData(initialData);
        setLoading(false);
        return () => {};
    }, [orgId, docId]);

    const updateData = async (newData: T | ((prev: T) => T)) => {
        const resolvedData = typeof newData === 'function' ? (newData as any)(data) : newData;
        setData(resolvedData);

        if (!orgId) return;

        // ─── Local-mode write ─────────────────────────────────────────────
        if (LOCAL_MODE) {
            writeSettings(orgId, docId, resolvedData);
            return;
        }

        // ─── Supabase write ────────────────────────────────────────────────
        if (USE_SUPABASE) {
            await supaWriteSettingsDoc(orgId, docId, resolvedData);
            return;
        }

        console.error(`[useSupabaseSettings] Supabase is not configured; skipped saving ${docId}.`);
    };

    return [data, updateData, loading] as const;
}
