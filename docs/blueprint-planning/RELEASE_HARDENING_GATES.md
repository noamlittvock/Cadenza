# Release Hardening Gates

This file tracks work that must be cleared before production use with real data.
The bird's-eye Blueprint build may continue while these remain open, but release
claims must not say production security is complete until the relevant gates are
closed.

## Live Supabase RLS

Agreement product surfaces are built and promoted for the bird's-eye app, but
agreement production security remains open until these live gates pass without
skips:

- [ ] Apply remote migrations `0008_agreement_direct_table_rls.sql`,
  `0009_agreement_acceptance_public_submit.sql`,
  `0010_agreement_private_pdf_storage_rls.sql`, and
  `0011_agreement_acceptance_public_read.sql` to project
  `mgkhhwzqpwfvresmmytc`.
- [ ] Fix `SUPABASE_DB_PASSWORD` for the linked project without recording the
  secret value. Current blocker: `npx supabase migration list` fails Postgres
  SASL password authentication even though the variable is present by
  presence-only check.
- [ ] Rerun `npx vitest run utils/rlsLive.test.ts --reporter=verbose
  --testTimeout=30000` and confirm agreement cases pass without skips.
- [ ] Run the full suite with live RLS credentials available from a networked
  environment. In the restricted 2026-06-19 loop sandbox,
  `npx vitest run --reporter=dot` reached the live harness and failed DNS lookup
  for `mgkhhwzqpwfvresmmytc.supabase.co` (`getaddrinfo ENOTFOUND`); rerunning
  with live RLS variables unset passed the local/static suite with the live RLS
  file skipped.
- [x] Add equivalent live RLS release gates for reports and operations as those
  modules are built.

Reports definition direct-table RLS has static schema coverage and an env-gated
live assertion, but report definition production security remains open until
this live gate passes without skips:

- [ ] Apply remote migration `0012_report_definition_rls.sql` to project
  `mgkhhwzqpwfvresmmytc`.
- [ ] Rerun `npx vitest run utils/rlsLive.test.ts --reporter=verbose
  --testTimeout=30000` and confirm the D-09 report definition case passes
  without the `0012_report_definition_rls.sql` skip.

Operations command-center source authorization has pure snapshot coverage,
static schema coverage, local UI/e2e coverage, and an env-gated live assertion,
but production security remains open until this live gate passes without skips:

- [ ] Apply remote migration `0012_report_definition_rls.sql` to project
  `mgkhhwzqpwfvresmmytc`; the operations live assertion depends on the report
  definition RLS foundation because report-health cards include private report
  definitions.
- [ ] Rerun `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t
  "operations snapshot source authorization"` and confirm the operations case
  passes without the `0012_report_definition_rls.sql` skip.

Ensembles/programs roster scope has pure model coverage, static schema coverage,
local UI/e2e coverage, and an env-gated live assertion, but production security
remains open until this live gate passes without skips:

- [ ] Apply remote migration `0013_roster_program_scoped_read.sql` to project
  `mgkhhwzqpwfvresmmytc`.
- [ ] Rerun `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t
  "scoped roster/program"` and confirm the roster/program case passes without
  the `0013_roster_program_scoped_read.sql` skip.

Exams/certificates/report-cards assessment scope has helper/mapping coverage,
static schema coverage, and an env-gated live assertion, but production security
remains open until this live gate passes without skips:

- [ ] Apply remote migration `0014_assessment_scoped_rls.sql` to project
  `mgkhhwzqpwfvresmmytc`.
- [ ] Rerun `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t
  "assessment table and private document scope"` and confirm the assessment case
  passes without the `0014_assessment_scoped_rls.sql` skip.

Concert programs/events scope has helper/mapping coverage, static schema
coverage, and an env-gated live assertion, but production security remains open
until this live gate passes without skips:

- [ ] Apply remote migration `0015_concert_program_scoped_rls.sql` to project
  `mgkhhwzqpwfvresmmytc`.
- [ ] Rerun `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t
  "concert program table and private document scope"` and confirm the concert
  case passes without the `0015_concert_program_scoped_rls.sql` skip.

Rooms/absence request scope has helper/mapping coverage, static schema coverage,
and an env-gated live assertion, but production security remains open until this
live gate passes without skips:

- [ ] Apply remote migration `0016_rooms_absence_request_rls.sql` to project
  `mgkhhwzqpwfvresmmytc`.
- [ ] Rerun `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t
  "rooms/absence operational request"` and confirm the operational request case
  passes without the `0016_rooms_absence_request_rls.sql` skip.

Calendar subscription endpoint scope has helper/mapping coverage, static schema
coverage, and an env-gated live resolver assertion, but production security
remains open until this live gate passes without skips:

- [ ] Apply remote migration `0017_calendar_subscription_endpoint_resolver.sql`
  to project `mgkhhwzqpwfvresmmytc`.
- [ ] Rerun `npx vitest run utils/rlsLive.test.ts --reporter=verbose -t
  "calendar subscription resolver"` and confirm the calendar resolver case
  passes without the `0017_calendar_subscription_endpoint_resolver.sql` skip.

## Local Browser Smoke

- [ ] Rerun the agreement Playwright smoke in an environment where the dev server
  can bind locally. In the restricted 2026-06-19 loop sandbox,
  `npm run test:e2e -- e2e/agreement-signing-capture.spec.ts` failed before
  browser execution because Vite could not listen on `0.0.0.0:3000`
  (`EPERM`), and a manual loopback attempt on `127.0.0.1:3000` failed with the
  same `EPERM`. The same smoke had passed in the previous agreement iteration.

## Provisional Product Decisions

- [ ] D-21 absence/day-off side effects: review whether operational request
  approval should mutate schedules/payroll automatically or remain task-first.
- [ ] D-22 assessment/report delivery: review guardian release, audit, and
  storage/export policy before production guardian delivery.
- [ ] D-23 public event/media exposure: review participant-level media and public
  performance release rules before public surfaces go live.
- [ ] D-24 consent revocation: review downstream effects, notifications, and
  audit retention before revocation workflows affect production data.
- [ ] D-25 instrument deposits/refunds: review liability, refund, forfeiture, and
  ledger treatment with finance/bookkeeping policy before production billing.
- [ ] D-26 HR/evaluation: review privacy, access, retention, export, and
  acknowledgment policy before real staff evaluation data is stored.
- [ ] D-27 rollover: review grade/year advancement and recurring-event copy
  rules before applying rollover to production records.
