# Cadenza Blueprint + Supabase Migration Final Report

Date: 2026-06-16T17:01:12+03:00
Supabase project: `mgkhhwzqpwfvresmmytc`

## Outcome

The Blueprint implementation is wired into the app, and production runtime data/auth/storage/function paths are migrated from Firebase to Supabase or deterministic app helpers. Firebase SDK dependency, root config/rules, runtime client file, and active Functions package were removed from the production app path. Historical Firebase Functions are preserved under `docs/legacy-firebase-functions/` only.

## Supabase Work

- Supabase CLI setup completed, project linked, and migrations pushed.
- Migrations present:
  - `supabase/migrations/0001_core_schema.sql`
  - `supabase/migrations/0002_blueprint_schema.sql`
  - `supabase/migrations/0003_runtime_support.sql`
- Runtime support covers org/auth profile tables, access control, onboarding, translations, app tables, storage bucket, and RLS policies.
- Migration map updated at `docs/SUPABASE_MIGRATION_MAP.md`.

## Main Changed Areas

- Supabase runtime: `utils/supabaseClient.ts`, `utils/supabaseSync.ts`, `utils/useSupabaseSync.ts`, `utils/storageUtils.ts`.
- Auth/onboarding/translations: `context/AuthContext.tsx`, `utils/useOnboarding.ts`, `context/TranslationContext.tsx`, `components/TranslationManager.tsx`.
- Blueprint domains/types/queries: `types/blueprint.ts`, `features/forteTree.ts`, `utils/blueprintQueries.ts`, `utils/forteTreeQueries.ts`.
- UI surfaces: `components/ConservatoryBlueprint.tsx`, `components/InstrumentManager.tsx`, `components/ManageHub.tsx`, existing calendar/staff/admin/settings integrations.
- Local/e2e mode: `utils/localStore.ts`, `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/settings.spec.ts`.
- Env/template cleanup: `.env.example` now documents Supabase variables; Firebase e2e env scaffold removed.

## Verification

- `supabase db push`: passed and applied migrations.
- `npm run typecheck`: passed.
- `RUN_ALL_TESTS=1 bash orchestration/scripts/codex-blueprint-audit.sh`: passed.
  - Build passed.
  - Full Vitest passed: 6 files, 96 tests.
  - Firebase runtime reference scan: empty.
  - Report: `orchestration/reports/codex-audit-20260616-170112.md`.
- `npm run test:e2e -- e2e/settings.spec.ts e2e/static-pages.spec.ts`: passed, 5 tests.
- Browser smoke:
  - `/test-org` loaded in local/e2e mode as E2E superadmin.
  - Blueprint view opened and displayed Forte feature coverage/readable data contract.
  - Manage > Inventory opened; Add Instrument modal had fields plus fixed Create/Cancel actions.
  - Created `Browser Smoke Violin`; table counters updated and data survived reload.
  - Settings switched to Hebrew, saved `lang="he-IL"` and `dir="rtl"`.
  - RTL Inventory rendered Hebrew labels and retained the smoke-created instrument.
  - Mobile RTL viewport 390x844 had no horizontal overflow.
  - Browser console errors: none.

## Known Risks

- Production OAuth callback/provider settings still need to be maintained in the Supabase dashboard for Google sign-in.
- Bot edge functions are optional; deterministic app fallback is implemented when Supabase Edge Functions are unavailable.
- Vite still warns that the main bundle exceeds 500 kB after minification.
- Historical Firebase emulator specs remain under `e2e/firebase/` as ignored legacy QA context, documented as non-runtime.
- Revoke the temporary Supabase access token used during setup.

## Usable Modules

Native and/or readable-data backed coverage now includes registration intake, students/families, lessons/attendance, rooms/absence/admin inbox workflows, ensembles/programs, exams/certificates/report cards, concerts, payroll/hours, payments/charges/balances, agreements/consent, instrument inventory/loans, staff evaluations, query-backed reports, year rollover, settings/admin integration, import/export, public/tokenized endpoints, and deterministic agent query helpers.
