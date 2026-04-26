/**
 * useOnboarding — Phase 11 Onboarding Flow
 *
 * Manages two Firestore documents per login session:
 *   userProfiles/{uid}_{orgId}  — per-user flags (isFirstAdmin, onboardingDismissed, firstUseFlags)
 *   onboardingState/{orgId}     — per-org milestone flags (activitiesCreated, setupGateCleared, …)
 *
 * Gate rule: isFirstAdmin && !setupGateCleared → hard gate (blocks CALENDAR/STUDENTS).
 * SuperAdmin bypasses all gates.
 */

import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FirstUseFlags {
  activityHub: boolean;
  staffModule: boolean;
  studentModule: boolean;
  eventCreation: boolean;
  enrollment: boolean;
}

export interface OrgOnboardingState {
  orgId: string;
  activitiesCreated: boolean;
  staffAdded: boolean;
  studentsAdded: boolean;
  firstEventCreated: boolean;
  setupGateCleared: boolean;
}

export interface UseOnboardingResult {
  isFirstAdmin: boolean;
  onboardingDismissed: boolean;
  firstUseFlags: FirstUseFlags;
  setupGateCleared: boolean;
  orgOnboardingState: OrgOnboardingState | null;
  dismissOnboarding: () => Promise<void>;
  updateFirstUseFlag: (key: keyof FirstUseFlags) => Promise<void>;
  syncOrgMilestones: (counts: {
    activities: number;
    teachers: number;
    students: number;
    events: number;
  }) => Promise<void>;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_FLAGS: FirstUseFlags = {
  activityHub: false,
  staffModule: false,
  studentModule: false,
  eventCreation: false,
  enrollment: false,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOnboarding(): UseOnboardingResult {
  const { currentUser, orgId, isSuperAdmin } = useAuth();

  const [isFirstAdmin, setIsFirstAdmin] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true); // Default true → no flash
  const [firstUseFlags, setFirstUseFlags] = useState<FirstUseFlags>(DEFAULT_FLAGS);
  const [orgOnboardingState, setOrgOnboardingState] = useState<OrgOnboardingState | null>(null);

  const profileInitialized = useRef(false);
  const uid = currentUser?.id;

  // ── User Profile (per-user-per-org) ──────────────────────────────────────────
  useEffect(() => {
    if (!uid || !orgId || isSuperAdmin) {
      // SuperAdmin: immediately dismiss all onboarding
      setOnboardingDismissed(true);
      return;
    }

    const profileId = `${uid}_${orgId}`;
    const profileRef = doc(db, 'userProfiles', profileId);

    // One-time initialization: determine if this is the first admin for the org
    const initProfile = async () => {
      if (profileInitialized.current) return;
      profileInitialized.current = true;

      const profileDoc = await getDoc(profileRef);
      if (!profileDoc.exists()) {
        // Check if any OTHER profile already exists for this org
        const q = query(
          collection(db, 'userProfiles'),
          where('orgId', '==', orgId)
        );
        const snap = await getDocs(q);
        const existingOthers = snap.docs.filter(d => d.id !== profileId);
        const isFirst = existingOthers.length === 0;

        await setDoc(profileRef, {
          uid,
          orgId,
          isFirstAdmin: isFirst,
          onboardingDismissed: false,
          firstUseFlags: DEFAULT_FLAGS,
          createdAt: new Date().toISOString(),
        });
      }
    };

    initProfile();

    // Live listener — reflects updates immediately
    const unsubscribe = onSnapshot(profileRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsFirstAdmin(data.isFirstAdmin ?? false);
        setOnboardingDismissed(data.onboardingDismissed ?? false);
        setFirstUseFlags({ ...DEFAULT_FLAGS, ...(data.firstUseFlags ?? {}) });
      }
    });

    return () => unsubscribe();
  }, [uid, orgId, isSuperAdmin]);

  // ── Org Onboarding State (per-org) ────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;

    const orgStateRef = doc(db, 'onboardingState', orgId);
    const unsubscribe = onSnapshot(orgStateRef, (snap) => {
      if (snap.exists()) {
        setOrgOnboardingState(snap.data() as OrgOnboardingState);
      } else {
        setOrgOnboardingState(null);
      }
    });

    return () => unsubscribe();
  }, [orgId]);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const dismissOnboarding = async () => {
    if (!uid || !orgId) return;
    await setDoc(
      doc(db, 'userProfiles', `${uid}_${orgId}`),
      { onboardingDismissed: true },
      { merge: true }
    );
  };

  const updateFirstUseFlag = async (key: keyof FirstUseFlags) => {
    if (!uid || !orgId || firstUseFlags[key]) return; // Already flagged — skip
    await setDoc(
      doc(db, 'userProfiles', `${uid}_${orgId}`),
      { firstUseFlags: { [key]: true } },
      { merge: true }
    );
  };

  /**
   * Reactively syncs org-level milestone flags from live data counts.
   * Called from App.tsx via useEffect whenever relevant collection sizes change.
   */
  const syncOrgMilestones = async (counts: {
    activities: number;
    teachers: number;
    students: number;
    events: number;
  }) => {
    if (!orgId) return;

    const activitiesCreated = counts.activities > 0;
    const staffAdded = counts.teachers > 0;
    const studentsAdded = counts.students > 0;
    const firstEventCreated = counts.events > 0;
    const setupGateCleared = activitiesCreated && staffAdded;

    const cur = orgOnboardingState;
    const unchanged =
      cur?.activitiesCreated === activitiesCreated &&
      cur?.staffAdded === staffAdded &&
      cur?.studentsAdded === studentsAdded &&
      cur?.firstEventCreated === firstEventCreated &&
      cur?.setupGateCleared === setupGateCleared;

    if (unchanged) return;

    await setDoc(
      doc(db, 'onboardingState', orgId),
      {
        orgId,
        activitiesCreated,
        staffAdded,
        studentsAdded,
        firstEventCreated,
        setupGateCleared,
      },
      { merge: true }
    );
  };

  return {
    isFirstAdmin,
    onboardingDismissed,
    firstUseFlags,
    setupGateCleared: orgOnboardingState?.setupGateCleared ?? false,
    orgOnboardingState,
    dismissOnboarding,
    updateFirstUseFlag,
    syncOrgMilestones,
  };
}
