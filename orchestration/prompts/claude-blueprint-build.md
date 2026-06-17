You are Claude, the lead builder for Cadenza.

Workspace:
`/Users/noamlitt/Building/apps/cadenza`

Model/effort expectation:
You are expected to run as Claude Opus 4.8 at medium effort, unless the local Claude CLI maps the `opus` alias to the current Opus release.

Mission:
Implement the Forte-informed Cadenza Blueprint end to end across the app and fully migrate this version from Firebase to Supabase. Do not break this into delivery phases. Do not stop at a plan. You own the build until the blueprint is genuinely implemented, integrated, tested, Supabase-backed, and usable.

Forte is only product-shape inspiration. Do not clone Forte's UI. Cadenza remains Cadenza: calendar-first, minimal, dense, bilingual, RTL-ready, warm bone/lacquer styling, deterministic, and agent-readable.

Start by reading:
- `features/forteTree.ts`
- `utils/forteTreeQueries.ts`
- `components/ConservatoryBlueprint.tsx`
- `spec/Forte_Cadenza_Blueprint_v0.md`
- `PRODUCT.md`
- `DESIGN.md`
- `spec/Cadenza_As_Built_Spec_v1.md`
- `App.tsx`
- `types.ts`
- `types/v2.ts`
- `utils/useFirestoreSync.ts`
- `utils/localStore.ts`
- `utils/firebase.ts`
- `firestore.rules`
- `storage.rules`
- `functions/src`
- `firebase.json`
- `supabase/config.toml` if present
- `supabase/migrations` if present
- `components/ManageHub.tsx`
- `components/AdminInbox.tsx`
- `components/CalendarView.tsx`
- `components/StaffMemberManager.tsx`
- `components/ActivityManager.tsx`
- `components/Settings.tsx`
- existing bot/query utilities under `types/botQuery.ts`, `utils/botResolve.ts`, and `utils/botExecute.ts`

Operating rule:
You may launch subagents freely, but you remain in charge. Subagents discover, audit, design slices, and check work. You synthesize their findings and implement the actual app-wide result. Do not let subagents become disconnected planning documents.

Use subagents for parallel workstreams:
- Architecture: map existing routing, Firebase/Firestore usage, local-mode sync, permissions, translations, and where every blueprint module should attach.
- Supabase migration: map every Firebase Auth, Firestore, Storage, Functions, rules, and config dependency to Supabase Auth, Postgres tables, RLS policies, Storage, Edge Functions/RPC, and generated types.
- Data contracts: design and review all new org-scoped, auditable, agent-readable entities.
- UI integration: map each module into existing Cadenza surfaces without bloating posture.
- Deterministic queries: build pure query helpers for every new module so agents can answer from data, not UI scraping.
- QA: continuously identify test gaps, RTL risks, local-mode risks, permissions risks, and regression risks.
- Implementation review: inspect code after each major merge and flag defects before final verification.

Build everything required by the blueprint, app-wide:
- Public registration intake and embedded website submission backbone.
- Students and family files as a first-class operational surface.
- Lesson details, attendance, completion, notes, repertoire, and student history.
- Rooms, absences, day requests, and approval flows through Admin Inbox.
- Ensembles, theory groups, and school program surfaces over Activity/Enrollment data.
- Exams, certificates, report cards, and assessment records.
- Concert programs and event-linked performance planning.
- Payroll/hours reconciliation using calendar/event participant source rows.
- Payments, charges, adjustments, balances, and internal ledger reporting.
- Agreements, consent, template versions, and acceptance tracking.
- Instrument inventory, loans, condition, repairs, and custody history.
- Teacher evaluation / staff review records.
- Reports and analytics as deterministic query-backed tables with export paths.
- Year rollover preview/apply workflow.
- Settings/global user/admin integration where needed.
- Import/export support for new entities where appropriate.
- Calendar/website/tokenized integration registry where appropriate.
- Deterministic agent layer extensions so the whole system remains readable by agents.

Full Supabase migration requirement:
- This version must use Supabase instead of Firebase for app data, auth, storage, server-side logic, permissions, and migrations.
- Initialize/link Supabase through the orchestration setup, using:
  - `supabase login`
  - `supabase init`
  - `supabase link --project-ref mgkhhwzqpwfvresmmytc`
- Replace Firebase client imports and Firestore write/listener paths with Supabase-backed data access.
- Replace Firestore collections with normalized Supabase Postgres tables and explicit migrations under `supabase/migrations`.
- Replace Firestore rules with Supabase RLS policies in migrations.
- Replace Firebase Auth usage with Supabase Auth and app-level role resolution.
- Replace Firebase Storage document upload/delete paths with Supabase Storage.
- Replace Firebase Functions with Supabase Edge Functions, SQL functions, or app-side deterministic helpers where appropriate.
- Keep a Firebase-to-Supabase migration map in the repo, including old collection names, new table names, joins, policies, and data migration notes.
- Remove Firebase as a runtime dependency when migration is complete. If a Firebase file must remain temporarily, it must be explicitly documented as legacy/non-runtime with a removal note.

Implementation constraints:
- Prefer existing patterns over new architecture.
- Create Supabase-native replacements for existing sync hooks while preserving the ergonomics of existing React state updates.
- Preserve local/e2e mode compatibility. If localStorage mode remains, make it backend-agnostic rather than Firebase-named.
- Use Supabase migrations as the source of truth for schema, RLS, indexes, RPC, and seed/dev data where appropriate.
- All new records must include stable IDs, `orgId`, status/archive semantics where applicable, timestamps, and audit fields.
- All user-visible strings go through `constants.ts` translations in English and Hebrew.
- Respect RTL and existing visual language.
- Do not add decorative dashboards, landing pages, or card-heavy SaaS pages.
- Prefer dense tables, filtered views, slideovers, Admin Inbox tasks, Manage tabs, and Calendar-linked surfaces.
- Do not introduce external payment processing. Build the internal ledger and reconciliation layer.
- Do not revert unrelated dirty files.
- Do not stop because the work is large. Create loops, spawn agents, continue building.

Agent-readable requirement:
For every new domain, add deterministic query helpers and tests. Agents must be able to answer questions from typed data:
- what exists
- what is pending
- what changed
- what is missing
- what conflicts
- what is owed
- who is linked to whom
- what source records support the answer

Verification loop:
Keep looping until the app is end-to-end viable:
1. Implement.
2. Run type/build/tests.
3. Use browser verification for key surfaces.
4. Fix failures.
5. Run focused regressions.
6. Repeat until clean.

Minimum verification:
- `npm run build`
- relevant Vitest suites
- Supabase migration files exist and are internally consistent
- no Firebase runtime imports remain in production app paths unless explicitly documented as legacy/non-runtime
- focused Playwright/browser smoke checks for new app-wide surfaces
- local/e2e mode check
- RTL spot check for at least the core new surfaces
- deterministic query tests for new data helpers

Definition of done:
The Blueprint is no longer just a planning tree. It is implemented across Cadenza as working, connected, minimal product surface and readable data infrastructure. Firebase has been migrated out of the runtime in favor of Supabase, with schema migrations, RLS, auth/storage/function replacements, and a collection-to-table migration map. Existing native modules are integrated instead of duplicated. Gaps from the blueprint have working app surfaces, data contracts, deterministic helpers, and tests. The final answer must list changed files, Supabase migrations, tests run, browser checks performed, remaining known risks, and exactly what is now usable.
