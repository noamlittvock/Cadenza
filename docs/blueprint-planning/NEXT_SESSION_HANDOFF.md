# Cadenza Blueprint — Next-Session Handoff

Date: 2026-06-17 · Branch: `blueprint-supabase` · Repo:
`/Users/noamlitt/Documents/Cadenza Forte`

Nothing is committed. Repo convention still appears to be: commit only when Noam
asks. All Phase A + Phase B step 5 work is in the working tree.

Authoritative plan remains [`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md).
This file is the operational state snapshot for the next agent.

---

## Current State

Phase A is complete and verified. Phase B step 5 is complete and verified.
**Phase B step 6 (D-04/D-05 canonical-type adapter) is complete and verified** —
Noam confirmed the adapter path on 2026-06-17.

The Phase B fork was resolved by choosing **Option 1: build full migration
`0004`**, including `public_endpoints`, with the public endpoint registry created
**inert/admin-only**:

- no anon grants
- no anon RLS policy
- no Edge Function
- no public intake/consent flow wired
- no public surface activated

This was intentional. It satisfies D-14 before public surfaces ship without
bypassing the absolute consent rule.

Phase B step 6 is now done as an **adapter, not a rename** (`utils/canonicalAdapters.ts`).
It is **additive and unwired** — no UI, persistence, or data migration changed.
The next gate is **Phase C**: building the first P0 module
(`student-family-files`, the keystone), which is where the adapter actually gets
wired at a real write boundary.

---

## Decisions Made This Session

- **D-06:** Implemented teacher self-service row-scoped writes for attendance and
  hours.
  - `lesson_records`: `STAFF` users may insert/update rows where
    `staff_member_id` matches their `org_members.staff_member_id`.
  - `hours_entries`: `STAFF` users may insert/update only their own rows and only
    while status is `DRAFT` or `SUBMITTED`.
  - `APPROVED` and `PAID` remain admin-gated.
- **D-08:** Implemented finance as a capability, not a new role string.
  - Added `member_capabilities`.
  - Added `app_has_capability(org, cap)`.
  - Admins are treated as finance-capable by the ledger policies.
  - Ledger tables are no longer readable by every org member.
- **D-13:** Added persisted `rollover_runs` audit table.
- **D-14:** Added `public_endpoints` token registry, locked down to admins.
- **D-04/D-05:** ✅ Resolved as **adapter, not rename** (Noam confirmed). Canonical
  write-model is V2; legacy shapes survive only at read edges. Built the single
  conversion seam `utils/canonicalAdapters.ts` + tests. No wide rename, no UI
  rewire, no data migration (HYBRID persistence + D-15 untouched).

---

## What Was Built

### Canonical-type adapter (Phase B step 6, D-04/D-05)

`utils/canonicalAdapters.ts` — the ONE legacy↔V2 conversion seam. Pure functions
(callers pass `now`/`timeZone`), no `Date.now()`. Exports:

- `studentToV2` (canonical write-model conversion), `studentV2ToMinimal` /
  `studentToMinimal` (feed the `MinimalStudent` query helpers), `studentV2ToLegacy`
  (read-only reverse for legacy UI).
- `eventToV2` (splits ISO `start`/`end` → org-tz `date`/`startTime`/`endTime` +
  immutable `durationMinutes`), `eventV2ToMinimal` / `eventToMinimal`,
  `eventV2ToLegacy` (read-only reverse; tz-aware, duration-exact round-trip).
- Helpers: `isoToAppTimestamp`/`appTimestampToIso`, `staffDocumentToEntry`/
  `documentEntryToStaffDocument`, and internal Intl-based wall-clock↔instant tz math
  (no tz library in the repo).
- `LOSSY_STUDENT_FIELDS` / `LOSSY_EVENT_FIELDS` — the unrecoverable fields, asserted
  by tests so the lossy contract can't drift silently.

`utils/canonicalAdapters.test.ts` — 26 cases: field mappings, Minimal projections,
read-reverse reconstruction + lossy-field assertions, and tz round-trips verified
across UTC / Asia·Jerusalem / America·New_York for both winter and summer (DST).

Posture: **additive and unwired.** No production read/write path touched.
`v2DocBuilders.ts` still has its own inline student→V2 seed mapping — fold it into
`studentToV2` when seeds next change (left as-is to keep this step additive).

### New migration

`supabase/migrations/0004_blueprint_rls_foundation.sql`

Adds:

- `member_capabilities`
- `app_has_capability(p_org, p_capability)`
- `app_is_staff_self(p_org, p_staff_member_id)`
- `rollover_runs`
- `public_endpoints`
- teacher self-write policies for `lesson_records`
- teacher self insert/update policies for `hours_entries`
- finance/admin policies for:
  - `charges`
  - `payments`
  - `adjustments`
  - `balance_snapshots`
- `updated_at` triggers for the new 0004 tables

Important posture:

- `public_endpoints` stores `token_hash`, not raw tokens.
- `public_endpoints.status` defaults to `DISABLED`.
- `public_endpoints` RLS is admin-only.
- No anon access exists.

### Type/schema/sync updates

- `types/blueprint.ts`
  - Added `RolloverRun`.
  - Added `PublicEndpoint`.
  - Added corresponding status/kind types.
  - Added `rolloverRuns` and `publicEndpoints` to `BLUEPRINT_COLLECTIONS`.
- `utils/supabaseSync.ts`
  - Maps `rolloverRuns → public.rollover_runs` as `NORMALIZED`.
  - Maps `publicEndpoints → public.public_endpoints` as `NORMALIZED`.
- `utils/supabaseSync.test.ts`
  - Added assertions for the new normalized mappings.
- `utils/supabaseSchema.test.ts`
  - Added static migration tests for 0004 tables.
  - Added checks for `app_has_capability` and `app_is_staff_self`.
  - Added checks that `public_endpoints` is inert/admin-only.
  - Added checks that ledger policies use admin-or-finance, not member-read.
  - Added checks that teacher self-write is row-scoped and does not allow
    `APPROVED`/`PAID` hour transitions.
- `docs/SUPABASE_MIGRATION_MAP.md`
  - Added `rolloverRuns` and `publicEndpoints`.
- `docs/blueprint-planning/decision-log.md`
  - Recorded the Phase B decision and marked D-06/D-08/D-13/D-14 as accepted and
    implemented in 0004.
- `docs/blueprint-planning/IMPLEMENTATION_HANDOFF.md`
  - Updated to say Phase A + Phase B step 5 are complete and step 6 is still
    gated.

---

## Phase A Work Already Present

This was completed before Phase B step 5 and is still in the working tree:

- `routing.ts`
  - Single source of truth for routed views.
  - `INVENTORY → Manage?tab=inventory` alias.
  - `isPaletteVisible()`.
- `routing.test.ts`
  - Anti-drift test comparing `ROUTED_VIEWS` to real `App.tsx` cases.
- `features/forteTree.consistency.test.ts`
  - Ensures deterministic query declarations map to real exports or documented
    stubs.
- `utils/supabaseSync.test.ts`
  - HYBRID/NORMALIZED mapping tests and acronym footgun guard.
- `utils/supabaseSchema.test.ts`
  - Migration/schema consistency and RLS scaffolding checks, now extended for
    0004.
- `components/CommandPalette.tsx`
  - Filters dead-end palette entries by routed-view allowlist.
  - Resolves Inventory alias into Manage inventory tab.
- `features/forteTree.ts`
  - Added `implemented` status.
  - Moved `instrument-inventory` to `implemented`.
- `utils/forteTreeQueries.ts`
  - Added `implemented` to `STATUS_ORDER`.
- `components/ConservatoryBlueprint.tsx`
  - Added implemented status UI/filter/icon and coverage counting.
- `constants.ts`
  - Added EN/HE labels for implemented status.

---

## Verification

Latest successful verification:

```bash
npm run typecheck -- --diagnostics
CI=true npx vitest run --reporter=dot
```

Results (re-run 2026-06-17 after step 6):

- Typecheck clean.
- Vitest clean: **11 files, 155 passed, 4 todo** (+1 file / +26 tests from
  `canonicalAdapters.test.ts`).

Harness gotcha:

- Plain `npm run typecheck` and the first full Vitest attempt idled at 0% CPU in
  this desktop harness.
- `npm run typecheck -- --diagnostics` returned normally.
- `CI=true npx vitest run --reporter=dot` returned normally.
- Earlier handoff also warned that single-file Vitest runs can hang here; prefer
  the full suite with `CI=true`.

Still not run:

- Playwright e2e.
- Live Supabase authenticated-role RLS tests. The 4 `it.todo`s remain because
  they need a live Supabase test instance with real users/roles.

---

## Current Working Tree Shape

Expected uncommitted tracked modifications include:

- `components/CommandPalette.tsx`
- `components/ConservatoryBlueprint.tsx`
- `constants.ts`
- `docs/SUPABASE_MIGRATION_MAP.md`
- `features/forteTree.ts`
- `types/blueprint.ts`
- `utils/forteTreeQueries.ts`
- `utils/supabaseSync.ts`

Expected untracked additions include:

- `docs/BLUEPRINT_PLANNING_PHASE_REPORT.md`
- `docs/blueprint-planning/`
- `features/forteTree.consistency.test.ts`
- `routing.test.ts`
- `routing.ts`
- `supabase/migrations/0004_blueprint_rls_foundation.sql`
- `utils/supabaseSchema.test.ts`
- `utils/supabaseSync.test.ts`
- `utils/canonicalAdapters.ts` (Phase B step 6)
- `utils/canonicalAdapters.test.ts` (Phase B step 6)

Do not assume untracked planning docs are disposable; they are part of the
blueprint planning work.

---

## Next Agent Should Do

1. Read this file, then [`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md).
2. Run `git status --short --branch` and preserve the dirty working tree.
3. Do not re-decide Phase B migration 0004 or the D-04/D-05 adapter unless Noam
   explicitly asks.
4. **Next is Phase C — the first P0 module: `student-family-files` (the keystone).**
   Ask Noam before starting it (it's a product slice, not a cleanup), then build
   per its packet, wiring `studentToV2`/`studentV2ToMinimal` from
   `utils/canonicalAdapters.ts` at the write boundary (this is where the adapter
   stops being unwired). Also resolve D-03 (Family as first-class table) up front —
   the packet is blocked on it.
5. Remember the `implemented` bar for any P0 module still requires:
   - product UI (list + create/edit/detail, empty/loading/error states)
   - Supabase persistence through the app path
   - real-role RLS tests (needs a live Supabase test project — still absent here)
   - EN/HE labels and RTL check
   - Playwright smoke for the actual workflow
6. When seeds next change, fold `v2DocBuilders.ts`'s inline student→V2 mapping into
   `studentToV2` so there's only one conversion implementation.

---

## Known Risks / Open Items

- `member_capabilities` has no UI yet. It is schema/RLS foundation only.
- `public_endpoints` is only a registry. Public intake still needs explicit
  consent/setup flow and a controlled Edge Function/token path before activation.
- Teacher self-write is DB-scoped by `org_members.staff_member_id`; future auth
  provisioning must keep that field correct.
- `hours_entries` staff updates are policy-gated by old and new row status. This
  is meant to block staff from touching approved/paid entries.
- Finance policies allow finance capability holders to write ledger rows. If Noam
  wants adjustment approval or voiding to be admin-only later, refine those
  transitions in a follow-up migration.
- Real RLS enforcement remains todo until a live Supabase test project exists.
- No commit has been made.
