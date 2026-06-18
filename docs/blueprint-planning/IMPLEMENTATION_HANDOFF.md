# Cadenza Blueprint — Implementation Handoff

Date: 2026-06-17  ·  Branch: `blueprint-supabase`  ·  Repo: `/Users/noamlitt/Documents/Cadenza Forte`

You are continuing a planned implementation. Pass 0 (planning infra) and the five
P0 packets are done. **All "recommended defaults" in the decision log are now
ACCEPTED as working decisions** (locked below). Build against them. Revisit a
decision only if implementation surfaces a concrete conflict — and if you do,
update both [`decision-log.md`](decision-log.md) and this file.

**Progress update — 2026-06-17:** Phase A complete. Phase B step 5 implemented by
`supabase/migrations/0004_blueprint_rls_foundation.sql` (full `0004`,
`public_endpoints` inert/admin-only). **Phase B step 6 complete** — Noam confirmed
the adapter path, so D-04/D-05 are resolved as **adapter, not rename**:
`utils/canonicalAdapters.ts` is the single legacy↔V2 conversion seam (pure,
bidirectional, tested in `canonicalAdapters.test.ts`). No wide rename, no UI rewire,
no data migration (persistence stays HYBRID jsonb; D-15 holds). Phase C P0 modules
are now unblocked.

## Orientation (read in this order)

1. [`README.md`](README.md) — planning index + "what the audit changed".
2. This file — locked decisions + build order + traps.
3. The packet for the slice you're building (`packets/<node>.md`) — it is the spec.
4. [`decision-log.md`](decision-log.md) — rationale behind the locked decisions.
5. Ground-truth code (below).

## Runtime reality (do not trust HANDOFF.md — it is stale)

Runtime is **Supabase** (Auth/Postgres+RLS/Realtime/Storage), not Firebase.
`HANDOFF.md` says `cadenza-v2`/Firebase — ignore it. Authoritative:
[`../SUPABASE_MIGRATION_MAP.md`](../SUPABASE_MIGRATION_MAP.md) and
[`../CURRENT_STATE_HANDOFF.md`](../CURRENT_STATE_HANDOFF.md).

Key code:
- `types/blueprint.ts` — 21 Blueprint entity types (enums quoted in each packet).
- `utils/blueprintQueries.ts` — 45 deterministic helpers, **all implemented + unit-tested** (`blueprintQueries.test.ts`, 44 cases). Pure functions; callers pass `now`/`idFactory`.
- `utils/supabaseSync.ts` — camel↔snake mapping; HYBRID (`{id,org_id,data jsonb}`) vs NORMALIZED (real columns). **Untested — add tests.**
- `supabase/migrations/0001_core_schema.sql`, `0002_blueprint_schema.sql`,
  `0003_runtime_support.sql`, `0004_blueprint_rls_foundation.sql`.
- `features/forteTree.ts` — feature tree (21 nodes).
- `App.tsx` (routing), `types.ts` (`ViewState` @359-372), `components/CommandPalette.tsx`, `components/Layout.tsx` (sidebar/mobile), `components/ManageHub.tsx` (tabs, `?tab=`).

The deterministic foundation is largely done. The P0 work is **product UI +
RLS refinement + the missing mapping/RLS/schema tests.**

## Locked decisions (defaults accepted 2026-06-17)

| ID | Locked decision |
|---|---|
| D-01 | Top-level sidebar views for **Students** and **Finance** (high-traffic). Lower-frequency config modules → Manage tabs. |
| D-02 | Hide unrouted palette entries until each module ships; **INVENTORY aliases to `Manage?tab=inventory`**. Drive palette visibility from a single "routed-views" allowlist so palette ↔ `App.tsx` never drift. |
| D-03 | **Family is first-class now** (already a normalized `families` table; productize as editable). |
| D-04 | Canonical student write-model = **`StudentV2`** (Blueprint leans V2). Adapter only at read boundaries; queries already decoupled via `MinimalStudent`. ⚠ biggest refactor surface — contain blast radius with the adapter; confirm with Noam before a wide rename. |
| D-05 | Canonical event write-model = **`EventV2`**; adapter at read edges. |
| D-06 | **Teacher self-service write** to own attendance + own hours; **admin approval gate** on payroll-affecting transitions (`APPROVED`/`PAID`). RLS row-scoping implemented in `0004`. |
| D-07 | Public writes via **Supabase Edge Function** (or tightly-scoped token) into a quarantined `registration_intake` row. **Never** a broad anon INSERT. Consent flow required (absolute rule). |
| D-07-FIN | **Family-led ledger** with per-enrollment charge line items. Aggregation key = `familyId`. |
| D-08 | Finance read/write gated to **admin + `finance` capability**; not general members. Capability table + ledger RLS implemented in `0004`. |
| D-09 | Reports = **admin/finance only** initially. |
| D-10 | **Live balance computed on demand**; persist `balance_snapshots` only for history/audit. |
| D-11 | Agreements support **both** typed e-signature and PDF upload; `agreement_acceptances` records either. |
| D-12 | Year rollover **creates next-year records; never mutates prior-year**. |
| D-13 | Add a persisted **`rollover_runs`** audit entity. Implemented in `0004`. |
| D-14 | Add a **`public_endpoints`** / token registry table **before** any public surface ships. Implemented in `0004` as admin-only/inert. |
| D-15 | Per-module backfill defined in each packet; no global data migration until D-04/D-05 settle. |
| D-STATUS | `instrument-inventory` `gap → implemented` after the consistency check is green. |
| D-STATUS-2 | `student-family-files` + `payroll-salaries-hours` → `embedded`; registration/lesson/payments stay `gap`. |

## Build order

**Phase A — decision-free cleanups (do first, no product risk):**
1. Route/nav cleanup per [`route-nav-policy.md`](route-nav-policy.md): hide the 6 unrouted palette entries (`STUDENTS, BILLING, ACADEMICS, INVENTORY, PAYROLL, ANALYTICS`) behind a single routed-views allowlist; alias `INVENTORY → Manage?tab=inventory` instead of `app.not_found`.
2. Feature-tree consistency check (status-policy §"Consistency check"): a test asserting every `node.deterministicQueries` maps to a real export or a documented stub. Make it green.
3. Apply D-STATUS + D-STATUS-2 status corrections in `features/forteTree.ts`.
4. Add the missing test layers as failing/stub-then-green: `supabaseSync.ts` camel↔snake mapping tests, a migration/schema-consistency test, and RLS tests with **real roles** (not the local/e2e bypass).

**Phase B — cross-cutting foundation (unblocks the modules):**
5. ✅ Migration `0004`: `public_endpoints` (D-14), `rollover_runs` (D-13), and RLS helper refinements for **teacher row-scope** (D-06) and a **`finance` capability** (D-08). Keep the uniform member-read/admin-write default for everything else.
6. ✅ Canonical-type adapter (D-04/D-05): `utils/canonicalAdapters.ts` — `studentToV2`/`eventToV2` as the canonical write-model conversion, `*ToMinimal` projections for the query helpers, `*V2ToLegacy` read-only reverse adapters for legacy UI. Lossy fields enumerated in `LOSSY_STUDENT_FIELDS`/`LOSSY_EVENT_FIELDS` and asserted by tests. Additive only — `MinimalStudent`/`MinimalEvent` already decouple the queries, so nothing else changed. **Not yet wired into any UI** (no V2 write boundary exists until the P0 modules are built); the calendar/student components still run on legacy shapes by design.

**Phase C — P0 modules (each = its packet + the `implemented` bar):**
7. **student-family-files** (keystone — most modules link to it).
8. **public-registration-intake** (depends on 7 as conversion target; D-07/D-14 ready from Phase B). Extend `approveIntakeRecord` from student-only → student+family+enrollment+agreement-request+inbox-history, transactionally.
9. **lesson-details-attendance** (Calendar event-detail panel; mobile-reachable marking).
10. **payroll-salaries-hours** (consolidate `hours_reports` ↔ `hours_entries`; teacher self-report).
11. **payments-charges** (Finance top-level view + gated student/family ledger tab).

P1/P2 modules (Pass 3) come after — packets not yet written.

## Definition of done per slice (the `implemented` bar)

From [`status-policy.md`](status-policy.md). A module is not done until **all**:
dedicated route/tab/panel · list with filter/search + empty/loading/error · create/edit/detail ·
org-scoped Supabase persistence with **real RLS** · status/archive semantics · links to source
records · EN + HE labels + RTL check · deterministic query/helper unit coverage · Playwright smoke
of the actual primary workflow. Update the `forteTree` node status + packet header in the same change.

## Verification gates (run before declaring any slice done)

- `npm run typecheck` — clean.
- `npm test` (vitest) — incl. new mapping/RLS/consistency tests.
- `npm run test:e2e -- e2e/<slice>.spec.ts` — the module's smoke path.
- RTL/Hebrew check + mobile 390×844 for any mobile-primary workflow (attendance marking, teacher self-report, student lookup).
- **RLS tested with real authenticated roles**, not `VITE_LOCAL_MODE`/`VITE_E2E_AUTH_BYPASS`.
- Secret scan before any commit touching Supabase config; never commit service-role keys (anon key OK).

## Traps (learned in the audit)

- **Uniform RLS today:** every write is admin-only (`app_is_org_admin`), every read is any-member (`app_is_org_member`). Teacher self-write, finance-only read, and public submit each need an explicit refinement — they do **not** work out of the box.
- **6 dead-end ViewStates** route to `app.not_found`; don't unhide a palette entry until its view is actually routed.
- **`PublicEndpoint` is a ghost** (`forteTree.ts:1370`, no table) — Phase B `0004` creates it.
- **Hybrid vs normalized mapping:** core tables store the doc under `data jsonb`; Blueprint tables use real columns with nested arrays as jsonb. `supabaseSync.ts` handles both — but it's untested, so a key typo silently corrupts normalized data.
- **Type duplication:** `Student`/`StudentV2`, `Teacher`/`StaffMemberV2`, `CalendarEvent`/`EventV2`. Blueprint references V2; legacy hybrid tables may carry old shapes. **Student/Event conversion now lives in exactly one place — `utils/canonicalAdapters.ts`; route all legacy↔V2 conversion through it, never inline a second copy.** (`v2DocBuilders.ts` still has its own inline `Student→StudentV2` + `Teacher→StaffMemberV2` seed mapping — fold the student half into `studentToV2` when seeds next change; left as-is now to keep step 6 additive. Staff `Teacher`/`StaffMemberV2` has no D-04/D-05 mandate yet.)
- **Consent rule is absolute:** public intake / tokenized endpoints / any data-collection surface must route through an explicit consent/setup flow. No config may bypass it.
- **Money:** `Charge.currency` has no mixing guard — enforce single-currency-per-family or handle multi-currency explicitly; add a property test.

## Open items that still need Noam (not blocking Phase A/B)

- D-04/D-05 resolved (adapter, not rename) — the conversion seam exists. The
  separate question of *whether/when* to migrate the app's runtime state + HYBRID
  persistence off legacy `Student`/`CalendarEvent` onto V2 is still deferred (D-15);
  needs Noam before any such migration.
- Final placement of `PAYROLL` (Manage tab vs Finance sub-view) and `ACADEMICS` (Academic Hub tier) when those modules are built.
