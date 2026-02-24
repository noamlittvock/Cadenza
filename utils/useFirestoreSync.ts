import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';
import { CalendarEvent, Teacher, Room, GanttBlock, AppSettings, ListsState } from '../types';
import { ChartConfiguration } from '../types/chartBuilder';
import { INITIAL_TEACHERS, INITIAL_ROOMS, INITIAL_EVENTS, INITIAL_GANTT, INITIAL_SETTINGS, INITIAL_LISTS } from '../constants';

// A generic hook for syncing a collection to React state
export function useFirestoreSync<T extends { id: string }>(
    collectionName: string,
    initialData: T[]
) {
    const { orgId } = useAuth();
    const [data, setData] = useState<T[]>(initialData);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!orgId) {
            setData(initialData);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, collectionName),
            where("orgId", "==", orgId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items: T[] = [];
            snapshot.forEach((doc) => {
                // Strip out orgId when passing to UI if needed, but keeping it is fine
                items.push({ id: doc.id, ...doc.data() } as T);
            });

            // If the collection is completely empty, it might be the first time this org
            // is using the app. We could optionally seed it here, but for now we just 
            // return the (empty) items or initialData if items is empty and we want defaults.
            // For a true SaaS, empty is usually correct until they add data.
            setData(items.length > 0 ? items : []);
            setLoading(false);
        }, (error) => {
            console.error(`Error syncing ${collectionName}:`, error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [orgId, collectionName]);

    // Wrapper for state updates to also write to Firestore
    const updateData = async (newData: T[] | ((prev: T[]) => T[])) => {
        // 1. Calculate the new state array
        const resolvedData = typeof newData === 'function' ? (newData as any)(data) : newData;

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

            // Find deleted items
            const newIds = new Set(resolvedData.map(i => i.id));
            data.forEach(oldItem => {
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

    useEffect(() => {
        if (!orgId) {
            setData(initialData);
            setLoading(false);
            return;
        }

        const docRef = doc(db, 'system_configs', `${orgId}_${docId}`);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const docData = docSnap.data();
                // Remove orgId overhead before passing to app state
                const { orgId: _, ...pureData } = docData;

                // Merge with defaults to prevent missing fields
                setData({ ...initialData, ...pureData } as T);
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
            await setDoc(docRef, { ...resolvedData, orgId }, { merge: true });
        } catch (err) {
            console.error(`Error saving config ${docId} to Firestore:`, err);
        }
    };

    return [data, updateData, loading] as const;
}
