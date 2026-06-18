import { describe, it, expect } from 'vitest';
import { FORTE_FEATURE_TREE } from './forteTree';
import * as blueprintQueries from '../utils/blueprintQueries';
import * as forteTreeQueries from '../utils/forteTreeQueries';
import * as botExecute from '../utils/botExecute';

/**
 * Feature-tree consistency check (status-policy.md "Consistency check", brief
 * item 6). Asserts that every `node.deterministicQueries` name either maps to a
 * real, callable export (in a documented utility) or is explicitly listed as a
 * known-unimplemented stub. This stops the tree from advertising deterministic
 * coverage that does not exist — a precondition for promoting any node to
 * `implemented`.
 */

// The real, callable exports a deterministicQueries name is allowed to map to.
// Computed from the actual module exports at runtime, so a rename in any source
// module is reflected here automatically (and surfaces as a failure below).
const IMPLEMENTED: Set<string> = new Set(
  [blueprintQueries, forteTreeQueries, botExecute].flatMap(mod =>
    Object.entries(mod)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
  )
);

/**
 * Deterministic-query names the tree references that are NOT yet backed by a real
 * export. Each is a documented intention for a native or not-yet-built module.
 * Listing one here is what keeps the tree honest:
 *   - a name that is neither implemented nor listed here fails the test, and
 *   - a name listed here that later BECOMES implemented also fails the test,
 * forcing this list to shrink as modules ship rather than silently rot.
 */
const KNOWN_UNIMPLEMENTED_STUBS: Record<string, string> = {
  // operations-command-center — native dashboards compute these inline today.
  countOpenConflicts: 'operations-command-center — derived in CalendarView, not a standalone export',
  listTodayEvents: 'operations-command-center — calendar filtering inline, no export yet',
  countPendingHoursReports: 'operations-command-center — see listPendingHoursReports; count not extracted',
  // staff-teacher-management (native)
  resolveStaffByName: 'staff-teacher-management (native) — name lookup inline',
  listTeachingAssignments: 'staff-teacher-management (native) — assignments rendered inline',
  whoTeachesActivity: 'staff-teacher-management (native) — reverse lookup not extracted',
  // activity-program-tree (native)
  listActivityHierarchy: 'activity-program-tree (native) — tree built inline in ActivityManager',
  listActiveActivities: 'activity-program-tree (native) — filtered inline',
  findAssignableStaff: 'activity-program-tree (native) — assignment picker inline',
  // calendar-schedule-engine (native)
  listForDay: 'calendar-schedule-engine (native) — CalendarView day view',
  findFreeRoom: 'calendar-schedule-engine (native) — see roomConflicts.detectRoomConflicts',
  checkRoomConflicts: 'calendar-schedule-engine (native) — see roomConflicts.detectRoomConflicts',
  lookupSchedule: 'calendar-schedule-engine (native) — schedule read inline',
  // calendar-website-integrations (p1)
  listActiveSubscriptions: 'calendar-website-integrations — subscriptions listed inline in ManageHub',
  listExternalSyncState: 'calendar-website-integrations — gap, no sync-state store yet',
  // import-export-data-portability (p1)
  listImportSessions: 'import-export-data-portability — gap, no session store yet',
  getImportErrors: 'import-export-data-portability — gap',
  exportEntityCsv: 'import-export-data-portability — see csvUtils; per-entity export not extracted',
  // org-settings-global-users
  listOrgUsers: 'org-settings-global-users — users managed via SuperAdmin, no export',
  getOrgSettingsHealth: 'org-settings-global-users — gap',
  resolveUserAccess: 'org-settings-global-users — RLS/Phase B (D-06/D-08), no client export',
  // deterministic-agent-layer — naming drift: real export is buildForteEmbeddingRecords
  buildFeatureEmbeddingRecords:
    'deterministic-agent-layer — tree references this name; actual export is buildForteEmbeddingRecords',
};

const ALL_QUERY_NAMES: string[] = [
  ...new Set(FORTE_FEATURE_TREE.flatMap(node => node.deterministicQueries)),
].sort();

describe('forteTree deterministicQueries consistency', () => {
  it('every deterministicQueries name maps to a real export or a documented stub', () => {
    const unaccounted = ALL_QUERY_NAMES.filter(
      name => !IMPLEMENTED.has(name) && !(name in KNOWN_UNIMPLEMENTED_STUBS)
    );
    expect(unaccounted).toEqual([]);
  });

  it('no documented stub is actually implemented (stub list stays honest)', () => {
    const nowImplemented = Object.keys(KNOWN_UNIMPLEMENTED_STUBS).filter(name => IMPLEMENTED.has(name));
    expect(nowImplemented).toEqual([]);
  });

  it('every documented stub is still referenced by the tree (no dead entries)', () => {
    const referenced = new Set(ALL_QUERY_NAMES);
    const orphanStubs = Object.keys(KNOWN_UNIMPLEMENTED_STUBS).filter(name => !referenced.has(name));
    expect(orphanStubs).toEqual([]);
  });
});
