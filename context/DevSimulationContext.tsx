/**
 * DevSimulationContext — Date & Role simulation for QA testing
 *
 * Provides override hooks (useEffectiveAuth, useEffectiveOnboarding) that
 * wrap the real hooks and apply simulation overrides when active.
 * SuperAdmin always uses the real hooks directly so it's never locked out.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth, UserRole } from './AuthContext';
import { useOnboarding } from '../utils/useOnboarding';
import type { UseOnboardingResult, FirstUseFlags, OrgOnboardingState } from '../utils/useOnboarding';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface SimulatedRole {
  role: UserRole;
  isFirstAdmin: boolean;
  setupGateCleared: boolean;
  onboardingDismissed: boolean;
  label: string;
}

interface DevSimulationState {
  simulatedDate: Date | null;
  simulatedRole: SimulatedRole | null;
  simulationActive: boolean;
  setSimulatedDate: (d: Date | null) => void;
  setSimulatedRole: (r: SimulatedRole | null) => void;
  clearAllSimulations: () => void;
}

// ─── Context ────────────────────────────────────────────────────────────────────

const DevSimulationContext = createContext<DevSimulationState | null>(null);

export const useDevSimulation = (): DevSimulationState => {
  const ctx = useContext(DevSimulationContext);
  if (!ctx) {
    // Return a no-op implementation when outside the provider (non-superadmin)
    return {
      simulatedDate: null,
      simulatedRole: null,
      simulationActive: false,
      setSimulatedDate: () => {},
      setSimulatedRole: () => {},
      clearAllSimulations: () => {},
    };
  }
  return ctx;
};

// ─── Provider ───────────────────────────────────────────────────────────────────

export const DevSimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [simulatedDate, setSimulatedDate] = useState<Date | null>(null);
  const [simulatedRole, setSimulatedRole] = useState<SimulatedRole | null>(() => {
    try {
      const stored = sessionStorage.getItem('e2e_role_sim');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (simulatedRole) {
      sessionStorage.setItem('e2e_role_sim', JSON.stringify(simulatedRole));
    } else {
      sessionStorage.removeItem('e2e_role_sim');
    }
  }, [simulatedRole]);

  const simulationActive = simulatedDate !== null || simulatedRole !== null;

  const clearAllSimulations = useCallback(() => {
    setSimulatedDate(null);
    setSimulatedRole(null);
  }, []);

  return (
    <DevSimulationContext.Provider
      value={{
        simulatedDate,
        simulatedRole,
        simulationActive,
        setSimulatedDate,
        setSimulatedRole,
        clearAllSimulations,
      }}
    >
      {children}
    </DevSimulationContext.Provider>
  );
};

// ─── Effective Auth Hook ────────────────────────────────────────────────────────

export const useEffectiveAuth = () => {
  const real = useAuth();
  const { simulatedRole } = useDevSimulation();

  if (!simulatedRole) return real;

  return {
    ...real,
    currentUser: real.currentUser
      ? { ...real.currentUser, role: simulatedRole.role }
      : null,
    isAdmin: simulatedRole.role === 'ADMIN' || simulatedRole.role === 'SUPERADMIN',
    isSuperAdmin: simulatedRole.role === 'SUPERADMIN',
  };
};

// ─── Effective Onboarding Hook ──────────────────────────────────────────────────

const noopAsync = async () => {};

export const useEffectiveOnboarding = (): UseOnboardingResult => {
  const real = useOnboarding();
  const { simulatedRole } = useDevSimulation();

  if (!simulatedRole) return real;

  return {
    ...real,
    isFirstAdmin: simulatedRole.isFirstAdmin,
    setupGateCleared: simulatedRole.setupGateCleared,
    onboardingDismissed: simulatedRole.onboardingDismissed,
    // No-ops to prevent remote writes during simulation
    dismissOnboarding: noopAsync,
    updateFirstUseFlag: noopAsync as (key: keyof FirstUseFlags) => Promise<void>,
    syncOrgMilestones: noopAsync as (counts: { activities: number; teachers: number; students: number; events: number }) => Promise<void>,
  };
};

// ─── Role Presets ───────────────────────────────────────────────────────────────

export const ROLE_PRESETS: SimulatedRole[] = [
  { role: 'SUPERADMIN', isFirstAdmin: false, setupGateCleared: true, onboardingDismissed: true, label: 'SuperAdmin' },
  { role: 'ADMIN', isFirstAdmin: false, setupGateCleared: true, onboardingDismissed: true, label: 'Admin (Active)' },
  { role: 'VIEWER', isFirstAdmin: false, setupGateCleared: true, onboardingDismissed: true, label: 'Viewer (Read-Only)' },
  { role: 'ADMIN', isFirstAdmin: true, setupGateCleared: false, onboardingDismissed: false, label: 'First Admin \u2014 Pre-Gate' },
  { role: 'ADMIN', isFirstAdmin: true, setupGateCleared: true, onboardingDismissed: false, label: 'First Admin \u2014 Post-Gate' },
];
