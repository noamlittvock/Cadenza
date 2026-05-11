import type { ActivityTemplate, ActivityTypeV2 } from './v2';

/**
 * Derive v2.0 activityType from template (Section 06 rules).
 */
export function deriveActivityType(template: ActivityTemplate): ActivityTypeV2 {
  switch (template) {
    case 'DISCIPLINE':
    case 'PROGRAM':
    case 'ENSEMBLE':
      return 'ACADEMIC';
    case 'EXTERNAL':
      return 'PERFORMANCES';
    case 'ADMINISTRATIVE':
      return 'ADMINISTRATIVE';
  }
}
