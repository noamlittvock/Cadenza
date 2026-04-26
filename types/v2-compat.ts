/**
 * Cadenza v1.3 ↔ v2.0 Compatibility Helpers
 *
 * Conversion functions for transitioning between v1.3 and v2.0 type shapes.
 * Used during the incremental refactor — components still on v1.3 types can
 * interoperate with new v2.0 Firestore collections.
 */

import { Timestamp } from 'firebase/firestore';
import type { Teacher, Activity, Subcategory } from '../types';
import type {
  StaffMemberV2,
  ActivityV2,
  L2Subcategory,
  ActivityTemplate,
  ActivityTypeV2,
  ModulesConfig,
  FirstUseFlags,
  StaffRole,
} from './v2';

const DEFAULT_FIRST_USE_FLAGS: FirstUseFlags = {
  activityHub: false,
  staffModule: false,
  studentModule: false,
  eventCreation: false,
  enrollment: false,
};

const DEFAULT_MODULES: ModulesConfig = {
  curriculum: true,
  externalParticipants: false,
};

/**
 * Map v1.3 ActivityType to v2.0 ActivityTemplate.
 * Default mapping — may need manual override per activity.
 */
export function inferTemplateFromV1(type: 'INSTRUCTIONAL' | 'OPERATIONAL'): ActivityTemplate {
  return type === 'INSTRUCTIONAL' ? 'DISCIPLINE' : 'ADMINISTRATIVE';
}

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

/**
 * Convert a v1.3 Teacher to a v2.0 StaffMember shape.
 * Fields not present in v1.3 are set to safe defaults.
 */
export function teacherToStaffMember(
  t: Teacher,
  orgId: string,
  uid: string = '',
  role: StaffRole = 'STAFF',
): StaffMemberV2 {
  const now = Timestamp.now();
  return {
    id: t.id,
    orgId,
    uid,
    role,
    fullName: t.fullName,
    email: t.email,
    phone: t.phone || null,
    isArchived: t.isArchived ?? false,
    createdAt: now,
    updatedAt: now,
    isFirstAdmin: false,
    onboardingDismissed: false,
    firstUseFlags: { ...DEFAULT_FIRST_USE_FLAGS },
    startDate: null,
    documents: [],
  };
}

/**
 * Convert a v2.0 StaffMember back to a v1.3 Teacher shape.
 * For components that haven't been migrated yet.
 */
export function staffMemberToTeacher(sm: StaffMemberV2): Teacher {
  return {
    id: sm.id,
    fullName: sm.fullName,
    positions: [],
    positionAssignments: [],
    tags: [],
    phone: sm.phone || '',
    email: sm.email,
    color: '#3b82f6',
    isArchived: sm.isArchived,
  };
}

/**
 * Convert a v1.3 Activity (with embedded subcategories) to v2.0 shapes.
 * Returns the ActivityV2 document and separate L2Subcategory documents.
 * v1.3 subcategories become L2s (v1.3 had no L1 concept).
 */
export function activityV1ToV2(
  a: Activity,
): { activity: ActivityV2; l2s: L2Subcategory[] } {
  const template = inferTemplateFromV1(a.type);
  const now = Timestamp.now();

  const activity: ActivityV2 = {
    id: a.id,
    orgId: a.orgId,
    name: a.name,
    template,
    activityType: deriveActivityType(template),
    modules: { ...DEFAULT_MODULES },
    location: null,
    eventNameMode: template === 'DISCIPLINE' || template === 'PROGRAM' ? 'AUTO' : 'PROMPTED',
    isArchived: a.isArchived,
    createdAt: now,
    updatedAt: now,
  };

  const l2s: L2Subcategory[] = (a.subcategories || []).map((sub: Subcategory) => ({
    id: sub.id,
    orgId: a.orgId,
    activityId: a.id,
    l1Id: null,
    name: sub.name,
    defaultRate: null,
    isArchived: sub.isArchived,
    createdAt: now,
    updatedAt: now,
  }));

  return { activity, l2s };
}
