# Cadenza Blueprint Acceptance Checklist

Codex uses this checklist to decide whether Claude has actually finished the app-wide build.

## Required Backend Migration

- Supabase project initialized and linked to `mgkhhwzqpwfvresmmytc`
- Firebase runtime usage migrated to Supabase
- Firestore collections mapped to Supabase Postgres tables
- Firestore rules replaced by Supabase RLS policies
- Firebase Auth replaced by Supabase Auth and role resolution
- Firebase Storage replaced by Supabase Storage
- Firebase Functions replaced by Supabase Edge Functions, SQL functions/RPC, or deterministic app helpers
- Supabase migrations exist under `supabase/migrations`
- Collection-to-table migration map exists in repo documentation
- Generated Supabase database types exist or a documented generation command exists
- Firebase remains only as documented legacy/non-runtime code, or is removed from dependencies entirely

## Required App Domains

- Public registration intake and website submission backbone
- Students and family files surface
- Lesson details and attendance
- Rooms, absences, day requests, and Admin Inbox approvals
- Ensembles, theory, and school programs
- Exams, certificates, report cards
- Concert programs and performance planning
- Payroll/hours reconciliation
- Payments, charges, adjustments, balances
- Agreements, consent, template versions, acceptance tracking
- Instrument inventory and loans
- Teacher evaluation / staff reviews
- Query-backed reports and exports
- Year rollover preview/apply
- Settings/global user/admin integration
- Import/export extensions
- Calendar/website/tokenized endpoint registry
- Deterministic agent layer extensions

## Required For Each Domain

- Typed org-scoped data contract
- Supabase table/migration or documented table reuse
- RLS policy coverage
- Status/archive semantics as appropriate
- Created/updated/audit fields
- Explicit joins to source records
- Minimal native Cadenza UI surface
- English and Hebrew translation keys
- Deterministic query helpers
- Vitest coverage for deterministic helpers
- Local mode compatibility
- Import/export path when appropriate
- No UI scraping required for agent answers

## Final Gates

- `npm run build` passes
- Relevant Vitest suites pass
- Supabase migrations/schema are present and reviewed
- No production Firebase runtime imports remain without explicit legacy documentation
- Focused browser smoke checks pass
- RTL spot checks pass
- No unrelated destructive rewrites
- Final report lists changed files, tests, browser checks, known risks, and usable modules
