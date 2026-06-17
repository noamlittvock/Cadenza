/**
 * useOnboarding — Phase 11 Onboarding Flow
 *
 * Manages two Supabase records per login session:
 *   user_profiles/{uid}_{orgId} — per-user flags and role lookup
 *   onboarding_state/{orgId}    — per-org milestone flags
 *
 * Gate rule: isFirstAdmin && !setupGateCleared → hard gate (blocks CALENDAR).
 * SuperAdmin bypasses all gates.
 */

import { useState, useEffect, useRef } from 'react';
import { getSupabase } from './supabaseClient';
import { useAuth } from '../context/AuthContext';
import type { FirstUseFlags } from '../types/v2';

export type { FirstUseFlags };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgOnboardingState {
  orgId: string;
  activitiesCreated: boolean;
  staffAdded: boolean;
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
    events: number;
  }) => Promise<void>;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_FLAGS: FirstUseFlags = {
  activityHub: false,
  staffModule: false,
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
      setOnboardingDismissed(true);
      return;
    }

    const profileId = `${uid}_${orgId}`;
    const sb = getSupabase();
    if (!sb) {
      setOnboardingDismissed(true);
      return;
    }

    const initProfile = async () => {
      if (profileInitialized.current) return;
      profileInitialized.current = true;

      const { data: existing } = await sb.from('user_profiles').select('*').eq('id', profileId).maybeSingle();
      if (!existing) {
        const { count } = await sb
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId);
        const isFirst = (count ?? 0) === 0;

        await sb.from('user_profiles').upsert({
          id: profileId,
          uid,
          org_id: orgId,
          staff_member_id: '',
          role: 'ADMIN',
          is_first_admin: isFirst,
          onboarding_dismissed: false,
          first_use_flags: DEFAULT_FLAGS,
        }, { onConflict: 'id' });
      }
    };

    void initProfile();

    const applyProfile = (data: any | null) => {
      if (data) {
        setIsFirstAdmin(data.is_first_admin ?? false);
        setOnboardingDismissed(data.onboarding_dismissed ?? false);
        setFirstUseFlags({ ...DEFAULT_FLAGS, ...(data.first_use_flags ?? {}) });
      }
    };

    void sb.from('user_profiles').select('*').eq('id', profileId).maybeSingle()
      .then(({ data }) => applyProfile(data));

    const channel = sb
      .channel(`user_profiles:${profileId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles', filter: `id=eq.${profileId}` },
        payload => applyProfile(payload.new))
      .subscribe();

    return () => { void sb.removeChannel(channel); };
  }, [uid, orgId, isSuperAdmin]);

  // ── Org Onboarding State (per-org) ────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const sb = getSupabase();
    if (!sb) return;

    const applyState = (data: any | null) => {
      setOrgOnboardingState(data ? {
        orgId: data.org_id,
        activitiesCreated: data.activities_created,
        staffAdded: data.staff_added,
        firstEventCreated: data.first_event_created,
        setupGateCleared: data.setup_gate_cleared,
      } : null);
    };

    void sb.from('onboarding_state').select('*').eq('org_id', orgId).maybeSingle()
      .then(({ data }) => applyState(data));

    const channel = sb
      .channel(`onboarding_state:${orgId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'onboarding_state', filter: `org_id=eq.${orgId}` },
        payload => applyState(payload.new))
      .subscribe();

    return () => { void sb.removeChannel(channel); };
  }, [orgId]);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const dismissOnboarding = async () => {
    if (!uid || !orgId) return;
    await getSupabase()?.from('user_profiles').upsert({
      id: `${uid}_${orgId}`,
      uid,
      org_id: orgId,
      onboarding_dismissed: true,
    }, { onConflict: 'id' });
  };

  const updateFirstUseFlag = async (key: keyof FirstUseFlags) => {
    if (!uid || !orgId || firstUseFlags[key]) return; // Already flagged — skip
    const next = { ...firstUseFlags, [key]: true };
    await getSupabase()?.from('user_profiles').upsert({
      id: `${uid}_${orgId}`,
      uid,
      org_id: orgId,
      first_use_flags: next,
    }, { onConflict: 'id' });
  };

  /**
   * Reactively syncs org-level milestone flags from live data counts.
   * Called from App.tsx via useEffect whenever relevant collection sizes change.
   */
  const syncOrgMilestones = async (counts: {
    activities: number;
    teachers: number;
    events: number;
  }) => {
    if (!orgId) return;

    const activitiesCreated = counts.activities > 0;
    const staffAdded = counts.teachers > 0;
    const firstEventCreated = counts.events > 0;
    const setupGateCleared = activitiesCreated && staffAdded;

    const cur = orgOnboardingState;
    const unchanged =
      cur?.activitiesCreated === activitiesCreated &&
      cur?.staffAdded === staffAdded &&
      cur?.firstEventCreated === firstEventCreated &&
      cur?.setupGateCleared === setupGateCleared;

    if (unchanged) return;

    await getSupabase()?.from('onboarding_state').upsert({
      id: orgId,
      org_id: orgId,
      activities_created: activitiesCreated,
      staff_added: staffAdded,
      first_event_created: firstEventCreated,
      setup_gate_cleared: setupGateCleared,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
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
