# Cadenza — Firebase → Supabase Migration Map

Status: **runtime migrated**. This is the source-of-truth map between the legacy
Firebase model and the Supabase model. Production app runtime now uses Supabase
Auth, Postgres/RLS, Realtime, Storage, and deterministic app helpers. Legacy
Firebase source is preserved only under `docs/legacy-firebase-functions/`.

Project ref: `mgkhhwzqpwfvresmmytc`
Link: `supabase login && supabase link --project-ref mgkhhwzqpwfvresmmytc && supabase db push`

---

## 1. Runtime backend selection

`utils/supabaseClient.ts`:
- `isSupabaseConfigured` — true when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set.
- `USE_SUPABASE` — true when Supabase is configured.

Order of precedence in the data hooks (`utils/useSupabaseSync.ts`):
1. `LOCAL_MODE` (localStorage) — unchanged, backend-agnostic, used by e2e/dev.
2. `USE_SUPABASE` — Supabase Postgres + Realtime (`utils/supabaseSync.ts`).
3. If neither is available, the hook surfaces an explicit configuration error.

## 2. Auth

| Firebase | Supabase |
|---|---|
| `firebase/auth` `getAuth`, `GoogleAuthProvider` | `supabase.auth` + `signInWithOAuth({ provider: 'google' })` |
| `userProfiles/{uid}` (role lookup for rules) | `public.org_members(user_id, org_id, role)` |
| `access_control` docs (`email_orgSlug`) | `access_control` table + `org_members` rows, seeded on first sign-in |
| `request.auth.uid` in `firestore.rules` | `auth.uid()` in RLS via `app_is_org_member()` / `app_is_org_admin()` |
| SUPERADMIN hardcoded email escape hatch | `org_members.role = 'SUPER_ADMIN'` |

Implemented in `context/AuthContext.tsx`: Supabase OAuth session bootstrap,
access-control lookup, `org_members`/`user_profiles` provisioning, workspace
selector, and Google provider token capture for Calendar sync.

## 3. Collections → Tables

### Core (hybrid `{ id, org_id, data jsonb }` — see `0001_core_schema.sql`)

| Firestore collection | Supabase table | Notes |
|---|---|---|
| `events` | `public.events` | v1 + v2 event docs |
| `teachers` | `public.teachers` | |
| `rooms` | `public.rooms` | |
| `ganttBlocks` | `public.gantt_blocks` | |
| `adminInboxItems` | `public.admin_inbox_items` | |
| `hoursReports` | `public.hours_reports` | |
| `calendarSubscriptions` | `public.calendar_subscriptions` | |
| `students` | `public.students` | |
| `activities` | `public.activities` | |
| `l1Subcategories` | `public.l1_subcategories` | |
| `l2Subcategories` | `public.l2_subcategories` | |
| `staffMembers` | `public.staff_members` | |
| `teachingAssignments` | `public.teaching_assignments` | |
| `orgRoles` | `public.org_roles` | |
| `enrollments` | `public.enrollments` | |
| `eventParticipants` | `public.event_participants` | |
| `importSessions` | `public.import_sessions` | |
| `system_configs/{orgId}_{docId}` | `public.system_configs` | composite id retained; arrays wrapped `{_items:[…]}` |

The hybrid model is a 1:1 document migration: the React layer reads whole docs,
so the document body stays in `data jsonb`; only `id` + `org_id` are promoted.
`utils/supabaseSync.ts` (un)wraps on read/write; `utils/useSupabaseSync.ts`
provides the React state hook.

### Blueprint (normalized columns — see `0002_blueprint_schema.sql`)

| Collection (camel) | Table (snake) | Backs deterministic queries |
|---|---|---|
| `registrationIntake` | `registration_intake` | listPendingIntake, suggestStudentDuplicates |
| `families` | `families` | listStudentsByGuardian |
| `lessonRecords` | `lesson_records` | listStudentLessonHistory, listUnmarkedAttendance |
| `operationalRequests` | `operational_requests` | listRoomRequests, listAbsencesForPeriod |
| `examSessions` | `exam_sessions` | listExamSessions |
| `examinerSubmissions` | `examiner_submissions` | getStudentAssessmentSummary |
| `certificates` | `certificates` | listPendingCertificates |
| `reportCards` | `report_cards` | (student file) |
| `concertPrograms` | `concert_programs` | listConcertPrograms, getProgramRunOfShow |
| `hoursEntries` | `hours_entries` | listPendingHoursReports, compareReportedVsCalendarHours |
| `charges` | `charges` | listOpenBalances, reconcileEnrollmentCharges |
| `payments` | `payments` | listPaymentsByFamily |
| `adjustments` | `adjustments` | listOpenBalances |
| `balanceSnapshots` | `balance_snapshots` | balance history |
| `rolloverRuns` | `rollover_runs` | rollover audit history |
| `publicEndpoints` | `public_endpoints` | token registry for public surfaces |
| `agreementTemplates` | `agreement_templates` | listUnsignedAgreements |
| `agreementAcceptances` | `agreement_acceptances` | getAgreementHistory, findAgreementByEnrollment |
| `instruments` | `instruments` | listAvailableInstruments |
| `instrumentLoans` | `instrument_loans` | listOverdueLoans, getInstrumentCustodyHistory |
| `instrumentRepairs` | `instrument_repairs` | getInstrumentCustodyHistory |
| `staffEvaluations` | `staff_evaluations` | listDueEvaluations, listEvaluationActions |
| `reportDefinitions` | `report_definitions` | runReportDefinition, getReportLineage |

Normalized tables promote filter/join/sort columns (status, foreign keys, dates,
amounts) to real indexed columns; nested arrays (guardians, pieces, criteria,
lines) stay as `jsonb`. `utils/supabaseSync.ts` case-converts top-level keys
(camel ↔ snake) and passes jsonb through unchanged.

## 4. Rules → RLS

| firestore.rules concept | Supabase RLS |
|---|---|
| `isSignedIn()` | `auth.uid() is not null` |
| org match on `orgId` | `public.app_is_org_member(org_id)` (SELECT) |
| admin-only writes | `public.app_is_org_admin(org_id)` (INSERT/UPDATE/DELETE) |
| per-collection allow rules | uniform policy pair generated per table in migrations |

`storage.rules` → `storage.objects` policies in `0001`, bucket `documents`,
tenant scope via `(storage.foldername(name))[1] = org_id`.

## 5. Storage

| Firebase Storage | Supabase Storage |
|---|---|
| `organizations/{orgId}/documents/{ts}_{name}` | `{orgId}/documents/{ts}_{name}` (orgId first for RLS) |
| signed agreement PDFs | `{orgId}/agreements/{agreementAcceptanceId}/{filename}` (admin-only direct reads; public signer file access must use an exact scoped token path) |
| `uploadBytes` / `getDownloadURL` | `storage.from('documents').upload` / `createSignedUrl` |
| `deleteObject` | `storage.from('documents').remove([path])` |

Implemented in `utils/storageUtils.ts`.

## 6. Functions

| Firebase Function | Supabase replacement |
|---|---|
| `callable/computeDuration` | pure deterministic helpers in the app layer |
| `callable/botAsk` | deterministic pipeline (`utils/botResolve.ts`, `utils/botExecute.ts`, `utils/blueprintQueries.ts`) runs client-side; optional Supabase Edge Functions `bot-distill`/`bot-wrap` |
| `triggers/syncUserProfile` | `org_members` upsert on auth bootstrap (app-side) / DB trigger |

## 7. Data migration (one-time, when going live)

1. `supabase db push` to create schema + RLS.
2. Export each Firestore collection to JSON.
3. For HYBRID tables: insert `{ id, org_id, data: <doc minus id/orgId> }`.
4. For NORMALIZED tables (if any legacy blueprint data): map camel→snake.
5. Seed `org_members`, `user_profiles`, `organizations`, and `access_control`.
6. Copy Storage objects to bucket `documents` under the orgId-first path.
7. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## 8. Firebase runtime removal

Removed from active runtime:
- Firebase SDK dependency from the top-level app package.
- `utils/firebase.ts`.
- Firebase Auth/Firestore/Storage imports from app code.
- Root Firebase deploy config and rules files.
- Active `functions/` package. Source snapshots are preserved under
  `docs/legacy-firebase-functions/` for historical reference only.
- Firebase env scaffolding and emulator scripts from the active app/e2e path.
  `.env.example` now documents Supabase variables, and Playwright's active
  project set is local/Supabase-only.
- Older Firebase-emulator Playwright specs, where present under `e2e/firebase/`,
  are non-runtime historical QA coverage only and are ignored by the active
  `ui` Playwright project.
