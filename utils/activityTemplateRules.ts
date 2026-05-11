import type { ActivityTemplate } from '../types/v2';

/**
 * Per-template rules used outside ActivityManager (e.g., to drive the
 * teaching-assignment scope picker). The full TemplateConfig in
 * ActivityManager.tsx adds icon/color/modules; those are not needed here.
 */
export interface TemplateRules {
  l1Required: boolean;
  l2Required: boolean;
  hasHierarchy: boolean;
}

export const TEMPLATE_RULES: Record<ActivityTemplate, TemplateRules> = {
  DISCIPLINE: { l1Required: true, l2Required: true, hasHierarchy: true },
  PROGRAM: { l1Required: true, l2Required: true, hasHierarchy: true },
  ENSEMBLE: { l1Required: false, l2Required: true, hasHierarchy: true },
  EXTERNAL: { l1Required: false, l2Required: true, hasHierarchy: true },
  ADMINISTRATIVE: { l1Required: false, l2Required: false, hasHierarchy: false },
};
