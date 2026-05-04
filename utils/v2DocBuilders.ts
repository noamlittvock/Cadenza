// Used by DevTools for both Firestore seeds (Timestamp) and LOCAL_MODE seeds
// (epoch ms) — both go in the same `createdAt`/`updatedAt` fields, so the
// builder is generic over the timestamp shape.

import type { Teacher, Student } from '../types';
import type { Timestamp } from 'firebase/firestore';
import type {
    StaffMemberV2,
    StudentV2,
    ActivityV2,
    L1Subcategory,
    L2Subcategory,
    TeachingAssignmentV2,
    EnrollmentV2,
} from '../types/v2';
import type { GeneratedActivity } from './devDataGenerator';

type SeedTimestamp = Timestamp | number;

export interface V2SeedInputs {
    teachers: Teacher[];
    students: Student[];
    activities: GeneratedActivity[];
}

export interface V2SeedDocs {
    staffMembers: StaffMemberV2[];
    students: StudentV2[];
    activities: ActivityV2[];
    l1Subcategories: L1Subcategory[];
    l2Subcategories: L2Subcategory[];
    teachingAssignments: TeachingAssignmentV2[];
    enrollments: EnrollmentV2[];
}

export function buildV2SeedDocs(
    input: V2SeedInputs,
    orgId: string,
    now: SeedTimestamp,
): V2SeedDocs {
    const ts = now as Timestamp;
    const staffMembers: StaffMemberV2[] = input.teachers.map(t => ({
        id: t.id,
        orgId,
        uid: t.id,
        role: 'STAFF',
        fullName: t.fullName,
        email: t.email,
        phone: t.phone || null,
        isArchived: t.isArchived ?? false,
        createdAt: ts,
        updatedAt: ts,
        isFirstAdmin: false,
        onboardingDismissed: true,
        firstUseFlags: {
            activityHub: true, staffModule: true,
            eventCreation: true, enrollment: true,
        },
        startDate: null,
        documents: [],
    }));

    const students: StudentV2[] = input.students.map(s => ({
        id: s.id,
        orgId,
        fullName: s.fullName,
        dateOfBirth: s.dateOfBirth || null,
        parentName: s.guardians?.[0]?.fullName || null,
        parentPhone: s.guardians?.[0]?.phone || null,
        grade: null,
        startDate: null,
        level: null,
        tags: [],
        phone2: null,
        email: null,
        address: null,
        isArchived: s.profileStatus === 'ARCHIVED',
        documents: [],
        createdAt: ts,
        updatedAt: ts,
    }));

    const activities: ActivityV2[] = [];
    const l1Subcategories: L1Subcategory[] = [];
    const l2Subcategories: L2Subcategory[] = [];

    input.activities.forEach(act => {
        const template = act.template || (act.type === 'OPERATIONAL' ? 'ADMINISTRATIVE' : 'DISCIPLINE');
        const isAdmin = template === 'ADMINISTRATIVE' || template === 'EXTERNAL';
        activities.push({
            id: act.id,
            orgId,
            name: act.name,
            template,
            activityType: isAdmin ? 'ADMINISTRATIVE' : 'ACADEMIC',
            modules: {
                curriculum: template === 'DISCIPLINE' || template === 'PROGRAM',
            },
            location: null,
            eventNameMode: 'AUTO',
            isArchived: act.isArchived,
            createdAt: ts,
            updatedAt: ts,
        });

        if (template === 'DISCIPLINE' && act.l1Groups) {
            act.l1Groups.forEach(group => {
                const l1Id = `L1_${act.id}_${group.l1Name.replace(/\s+/g, '_')}`;
                l1Subcategories.push({
                    id: l1Id, orgId, activityId: act.id, name: group.l1Name,
                    isArchived: false, createdAt: ts, updatedAt: ts,
                });
                group.l2Names.forEach(l2Name => {
                    const l2Id = `L2_${act.id}_${l2Name.replace(/\s+/g, '_')}`;
                    l2Subcategories.push({
                        id: l2Id, orgId, activityId: act.id, l1Id,
                        name: l2Name,
                        isArchived: false, createdAt: ts, updatedAt: ts,
                    });
                });
            });
        }
        if (template === 'PROGRAM') {
            (act.subcategories || []).forEach(sub => {
                l2Subcategories.push({
                    id: sub.id, orgId, activityId: act.id, l1Id: null,
                    name: sub.name,
                    isArchived: sub.isArchived, createdAt: ts, updatedAt: ts,
                });
            });
        }
        if (template === 'ENSEMBLE' || template === 'EXTERNAL') {
            // Single default L2 so assignments have something to link to.
            const l2Id = `L2_${act.id}_default`;
            l2Subcategories.push({
                id: l2Id, orgId, activityId: act.id, l1Id: null,
                name: act.name,
                isArchived: false, createdAt: ts, updatedAt: ts,
            });
        }
    });

    const teachingAssignments: TeachingAssignmentV2[] = [];
    // Build a fast lookup: activityId → template
    const activityTemplateMap = new Map(input.activities.map(a => [a.id, a.template]));

    input.teachers.forEach(t => {
        (t.teachingAssignments || []).forEach(ta => {
            const template = activityTemplateMap.get(ta.activityId);
            // Prefer explicit scope from the seed generator. Fall back to legacy
            // inference: ADMINISTRATIVE / no subcategory → ACTIVITY, else L2.
            let scope: 'ACTIVITY' | 'L1' | 'L2';
            let l1Id: string | null = null;
            let l2Id: string | null = null;

            if (ta.scope) {
                scope = ta.scope;
                l1Id = scope === 'L1' ? (ta.l1Id ?? null) : null;
                l2Id = scope === 'L2' ? (ta.subcategoryId || null) : null;
            } else if (template === 'ADMINISTRATIVE' || !ta.subcategoryId) {
                scope = 'ACTIVITY';
            } else {
                scope = 'L2';
                l2Id = ta.subcategoryId;
            }

            teachingAssignments.push({
                id: ta.id,
                orgId,
                staffMemberId: t.id,
                scope,
                activityId: ta.activityId,
                l1Id,
                l2Id,
                startDate: ta.startDate,
                endDate: null,
                isArchived: ta.isArchived,
                createdAt: ts,
                updatedAt: ts,
            });
        });
    });

    const enrollments: EnrollmentV2[] = [];
    input.students.forEach(s => {
        (s.assignments || []).forEach(asgn => {
            enrollments.push({
                id: `EN_${asgn.id}`,
                orgId,
                studentId: s.id,
                activityId: asgn.activityId,
                l2Id: asgn.subcategoryId,
                startDate: asgn.startDate,
                endDate: null,
                status: asgn.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
                createdAt: ts,
                updatedAt: ts,
            });
        });
    });

    return {
        staffMembers,
        students,
        activities,
        l1Subcategories,
        l2Subcategories,
        teachingAssignments,
        enrollments,
    };
}
