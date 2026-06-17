# Cadenza Current State Handoff

Date: 2026-06-16
Repo: `/Users/noamlitt/Building/apps/cadenza`
Supabase project ref: `mgkhhwzqpwfvresmmytc`

## Executive Summary

The app has been migrated away from production Firebase runtime usage and now has a Supabase-backed foundation for auth, org-scoped data, storage, onboarding, translations, and Blueprint data/query contracts.

Important nuance: the Blueprint is **not** fully productized as complete end-to-end UI workflows. The implementation currently includes strong backend/schema/query foundations, a Blueprint coverage dashboard, and one substantial new usable module: Instrument Inventory. Many Blueprint domains are typed, queryable, tested, and mapped to Supabase, but still need dedicated list/detail/create/edit workflows before they should be called user-facing features.

## What Is Usable In The UI Now

- Calendar, staff, rooms, admin inbox, settings, import/export, hours/reporting-adjacent existing surfaces continue to exist and were moved toward Supabase/local-mode compatibility.
- New `Blueprint` nav item:
  - Shows Forte/Cadenza feature tree.
  - Shows status, coverage, readable-data contracts, source signals, and gaps.
  - Useful as a planning/coverage dashboard, not as module CRUD.
- New `Manage > Inventory` module:
  - Add instrument.
  - Track asset tag, name, category, condition, brand, location.
  - Availability/on-loan/overdue counters.
  - Checkout/return loan flows are wired.
  - Persists in local/e2e mode and maps to Supabase via `instruments` / `instrument_loans`.
  - Hebrew/RTL spot checked.
- Settings language switch:
  - Saves Hebrew.
  - Sets `html lang="he-IL"` and `dir="rtl"`.
  - Mobile RTL checked at 390x844 with no horizontal overflow in the smoke path.
- Local/e2e demo mode:
  - Can run without a remote Supabase session.
  - Current dev server command uses `VITE_LOCAL_MODE=true VITE_E2E_AUTH_BYPASS=true`.

## Blueprint Domain Reality Check

These domains have typed contracts, Supabase table mappings, deterministic query helpers, and tests, but most still need real product workflows:

- Public registration intake.
- Student/family files.
- Lesson details and attendance.
- Exams, certificates, report cards.
- Concert programs and performance planning.
- Payments, charges, adjustments, balances.
- Agreements, consent, template versions, acceptance tracking.
- Teacher evaluations / staff reviews.
- Query-backed reports and exports.
- Year rollover preview/apply.
- Calendar/website/tokenized endpoint registry.
- Deterministic agent-readable answers.

Do not represent these as fully shipped UI modules yet. A fair description is: "Blueprint data/query foundation implemented; selected UI surfaces added; broad productization remains."

## Supabase / Firebase State

Supabase setup was run and `supabase db push` succeeded against `mgkhhwzqpwfvresmmytc`.

Migrations:

- `supabase/migrations/0001_core_schema.sql`
- `supabase/migrations/0002_blueprint_schema.sql`
- `supabase/migrations/0003_runtime_support.sql`

Core Supabase runtime files:

- `utils/supabaseClient.ts`
- `utils/supabaseSync.ts`
- `utils/useSupabaseSync.ts`
- `utils/storageUtils.ts`
- `context/AuthContext.tsx`
- `utils/useOnboarding.ts`
- `context/TranslationContext.tsx`

Firebase removed from active production runtime:

- Top-level Firebase SDK dependency removed from `package.json`.
- `utils/firebase.ts` deleted.
- Root `firebase.json`, `firestore.rules`, and `storage.rules` deleted.
- Active `functions/` package deleted.
- Historical Firebase Functions snapshot copied under `docs/legacy-firebase-functions/`.
- Active Firebase runtime grep is clean for app paths.

Remaining Firebase references are expected in:

- Legacy documentation / old audit reports.
- `docs/legacy-firebase-functions/`.
- Ignored historical e2e specs under `e2e/firebase/`.
- Older UI-overhaul prompts or spec docs.

## Key Files To Read First

- `docs/SUPABASE_MIGRATION_MAP.md`
- `orchestration/reports/codex-final-blueprint-report-20260616-170112.md`
- `orchestration/reports/codex-audit-20260616-170112.md`
- `types/blueprint.ts`
- `features/forteTree.ts`
- `utils/blueprintQueries.ts`
- `utils/supabaseSync.ts`
- `components/ConservatoryBlueprint.tsx`
- `components/InstrumentManager.tsx`
- `components/ManageHub.tsx`

## Verification Already Run

Passed:

- `supabase db push`
- `npm run typecheck`
- `RUN_ALL_TESTS=1 bash orchestration/scripts/codex-blueprint-audit.sh`
- `npm run test:e2e -- e2e/settings.spec.ts e2e/static-pages.spec.ts`

Latest audit report:

- `orchestration/reports/codex-audit-20260616-170112.md`

Audit included:

- Production build passed.
- Vitest passed: 6 files, 96 tests.
- Firebase runtime reference section empty.

Browser smoke passed:

- `/test-org` loaded in local/e2e mode as E2E superadmin.
- Blueprint page opened and rendered.
- Manage > Inventory opened.
- Add Instrument modal had fields and Create/Cancel actions.
- Created `Browser Smoke Violin`; table and counters updated.
- Reloaded and verified local persistence after navigating back to Inventory.
- Settings switched to Hebrew and saved RTL.
- RTL Inventory rendered Hebrew labels and retained instrument.
- Mobile RTL 390x844 had no horizontal overflow.
- Browser console errors: none.

## Current Dev Server / Phone Access

At the time of this handoff, a Vite dev server was started with:

```bash
VITE_LOCAL_MODE=true VITE_E2E_AUTH_BYPASS=true npm run dev -- --host 0.0.0.0 --port 3000
```

Try on the same network:

- `http://10.0.0.2:3000/test-org`
- `http://10.0.0.1:3000/test-org`

Try over the same Tailscale/VPN:

- `http://100.77.158.32:3000/test-org`

Do not expose this current server through a public tunnel without disabling the local/e2e superadmin bypass.

## Known Risks And Gaps

- The main product gap is UI productization of Blueprint modules. Most module work is currently schema/types/query/helper level, not end-to-end UI.
- Supabase OAuth callback/provider settings must be confirmed in the Supabase dashboard for real Google sign-in.
- RLS exists, but every new productized workflow should be tested with real authenticated roles, not only local/e2e bypass.
- Bot Supabase Edge Functions are optional; deterministic app fallback is implemented.
- Vite build still warns that the main bundle is over 500 kB after minification.
- `e2e/firebase/` still exists as historical ignored QA context. It should either be migrated to Supabase/local fixtures or removed in a cleanup pass.
- The worktree is very dirty because the orchestration/build touched many files and added reports/docs. Do not assume every dirty file belongs to the latest handoff-only change.
- `.firebase/hosting...cache` was already dirty and unrelated to the Supabase migration.
- Revoke the temporary Supabase access token used during setup.

## Recommended Next Implementation Pass

Goal: make Blueprint modules genuinely usable end-to-end in the UI.

Stricter acceptance per module:

- Dedicated route/tab or integration point.
- List view with filters/search and empty/loading/error states.
- Create/edit/detail flow.
- Supabase persistence with org scoping.
- RLS/role behavior checked.
- Archive/status semantics.
- Links to source records.
- Import/export path where relevant.
- English and Hebrew labels.
- RTL layout check.
- Deterministic query/helper coverage.
- Playwright smoke for the actual workflow.

Suggested build order:

1. Registration intake: public submission -> review queue -> approve into student/family/enrollment.
2. Student/family files: guardians, documents, notes, enrollments, linked records.
3. Lesson details and attendance: event detail panel -> attendance/notes/completion.
4. Payments/charges/balances: charge creation, payment recording, balance summary.
5. Agreements/consent: template versions, acceptance tracking, unsigned lists.
6. Exams/certificates/report cards.
7. Concert programs and run-of-show.
8. Staff evaluations.
9. Reports/export builder.
10. Year rollover preview/apply.
11. Public/tokenized endpoint registry.

## Security Notes

- Do not paste or commit Supabase access tokens or service-role keys.
- The anon key is acceptable for frontend configuration, but service-role keys are not.
- Re-run a secret scan before committing.
- Revoke the temporary Supabase access token from the setup session.
