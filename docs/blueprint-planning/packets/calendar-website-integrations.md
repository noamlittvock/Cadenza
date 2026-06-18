# Calendar And Website Integrations  (`calendar-website-integrations`)

Status: `embedded` (per `features/forteTree.ts`) -> target `implemented`.
Priority: p1
Owner-decisions still blocking this packet: **BLOCKED ON D-23** for public
website embeds, public event/calendar pages, public concert/program exposure,
student/staff performer disclosure, redaction, consent/release setup, and public
file/download scope. Authenticated integration administration, private
admin-created iCal subscriptions, Google Calendar import/sync hardening, and
unifying existing tokenized surfaces under `public_endpoints` are otherwise
unblocked by current accepted decisions.
Current accepted prerequisites: **D-01** (no new top-level route beyond current
policy), **D-05** (canonical event adapter), **D-07** (controlled public/token
path, never broad anon table writes), **D-14** (inert/admin-only
`public_endpoints` registry exists), and **D-15** (packet-local backfill).

## Current State (ground truth)
- Existing UI: `components/CalendarSubscriptionManager.tsx` is embedded in the
  Manage `subscriptions` tab and lets admins create, copy, and revoke filtered
  iCal feed URLs. `components/Settings.tsx` manages tenant Google Calendar
  connection/import settings. `components/CalendarView.tsx` pushes event creates,
  updates, and deletes to the tenant Google Calendar and per-teacher Google
  calendars when credentials/settings exist. `App.tsx` exposes the standalone
  `/report/:token` `TeacherHoursForm`, but there is no unified public endpoint
  registry UI, no Supabase iCal resolver, no endpoint audit view, and no website
  embed builder.
- Existing schema: `calendar_subscriptions`, `hours_reports`, and `events` are
  HYBRID `{id, org_id, data jsonb}` tables from `0001`. Current
  `CalendarSubscription` and `HoursReport` docs store raw `token` values in
  `data`. `public_endpoints` is a normalized `0004` table with `kind`, `label`,
  `token_hash`, `status`, `scopes jsonb`, optional `target_id`,
  `consent_agreement_id`, expiry/use/revocation timestamps, and audit columns.
  `public_endpoints` is admin-only and inert: no anon grants, no anon policy, no
  Edge Function, and no public route activated by the table alone.
- Existing RLS: `calendar_subscriptions`, `hours_reports`, and `events` inherit
  the core HYBRID policy pair: org-member read and admin write. That is too broad
  for raw tokens and external feed configuration. `public_endpoints` is already
  admin-only in `0004`; public/token reads still need an explicit Edge
  Function/security-definer resolver that returns only scoped output.
- Existing query/helpers: Google import/sync helpers live in
  `utils/googleCalendarSync.ts`. The historical Firebase `icalFeed` function is
  preserved under `docs/legacy-firebase-functions/` only; it is not active
  runtime. There are no exported deterministic helpers for
  `listActiveSubscriptions`, `resolvePublicToken`, or `listExternalSyncState` in
  `utils/blueprintQueries.ts`; `features/forteTree.consistency.test.ts`
  currently documents them as inline/stubbed.
- Existing tests: `utils/supabaseSync.test.ts` maps `calendarSubscriptions` and
  `hoursReports` as HYBRID and `publicEndpoints` as NORMALIZED.
  `utils/supabaseSchema.test.ts` verifies `public_endpoints` exists and remains
  admin-only/inert. There are no deterministic helper, Edge Function, RLS,
  iCal-output, Google-sync, endpoint-audit, or Playwright workflow tests for this
  module.
- Feature-tree declared queries: `listActiveSubscriptions`,
  `resolvePublicToken`, `listExternalSyncState` -- not implemented as exported
  deterministic helpers. `listActiveSubscriptions` behavior exists inline in the
  subscription manager; token resolution and external sync state remain gaps.

## Users And Permissions
- Actors: super_admin, admin, calendar-owning admin for Google OAuth operations,
  teacher/staff as linked calendar participants, finance only through downstream
  reporting if later scoped, and unauthenticated token holders for scoped iCal or
  hours-report routes.
- Read access: admins read subscription configs, endpoint registry rows, sync
  status, and endpoint audit. Teachers may read only their own sync/status
  context if surfaced from Staff/Calendar; they do not read all subscription
  configs or token hashes. Public/token callers read no tables directly; they
  receive only resolver output for the exact valid token and scope.
- Write access: admins create, rotate, activate, expire, and revoke endpoint
  records and subscription configs. Google sync writes remain gated to the
  connected/admin calendar owner and the existing Calendar save path. Public/token
  callers do not create subscription configs or endpoint rows.
- Public/token access: D-07/D-14 controlled resolver only. Tokenized iCal and
  hours-report endpoints must validate `public_endpoints` by token hash/scope and
  never expose raw table SELECT/INSERT/UPDATE. Public website embeds, public
  concert/program calendars, public performer lists, and public downloadable
  program files are **BLOCKED ON D-23**.
- See embedded role matrix below.

## Workflows
- List/search/filter: admin list of calendar subscriptions and public endpoints
  by kind (`CALENDAR_SUBSCRIPTION`, `HOURS_REPORT`, future accepted kinds),
  status, owner/creator, target record, filter set, expiry, last-used date,
  revoked state, and stale filter references.
- Create: admin creates a named calendar subscription with filters for staff,
  tags, position titles, rooms, and activities. The implementation generates a
  one-time raw token for the copied URL, persists only its hash in
  `public_endpoints`, links the endpoint to the subscription via `targetId`, and
  stores subscription filter metadata without a durable raw token.
- Detail: endpoint detail shows label, kind, status, target, scopes, filters,
  created/updated/revoked/expiry timestamps, last use, generated URL state,
  duplicate-token audit result, and linked Calendar/Hours records. Raw tokens are
  not shown after creation or rotation.
- Edit: admin edits subscription name/filters, rotates the token, changes expiry,
  and toggles active/revoked state. Editing feed filters does not mutate events;
  Google-synced event edits remain Calendar event edits.
- Status transitions: `DISABLED -> ACTIVE`; `ACTIVE -> REVOKED`;
  `ACTIVE -> EXPIRED` by expiry job or resolver check; `REVOKED -> ACTIVE` only
  by token rotation that creates a new hash. Legacy `CalendarSubscription.isActive`
  maps to endpoint `ACTIVE` vs `REVOKED`.
- Archive/delete: no hard delete for endpoint rows with external access history.
  Revoke or expire and retain audit. Incorrect unused drafts may be disabled.
- Import/export: authenticated admin export of endpoint audit and subscription
  config. Token resolver exports RFC 5545 iCal for valid calendar subscription
  tokens. Google Calendar import remains an authenticated Settings action.
  Website embed publication and public concert/program downloads are **BLOCKED ON
  D-23**.
- Cross-links: Manage subscriptions tab, Settings integrations panel, Calendar
  events/EventV2, Staff/teacher Google sync settings, Rooms, Activities, legacy
  `hours_reports` token forms, `public_endpoints`, reports-analytics for endpoint
  usage/audit, and concert-programs-events only if **BLOCKED ON D-23** is later
  resolved.

## Data Contract
- Primary records: `CalendarSubscription` (`types.ts`) in HYBRID
  `calendar_subscriptions`, `PublicEndpoint` (`types/blueprint.ts`) in normalized
  `public_endpoints`, and existing `HoursReport` token forms in HYBRID
  `hours_reports`.
- Linked records: `CalendarEvent`/`EventV2` through the D-05 adapter boundary,
  staff/teacher rows for staff filters and per-teacher Google sync, rooms,
  activities, system settings for tenant Google Calendar config, and optional
  `HoursReport` targets for existing `/report/:token` links.
- Required fields: subscription `id`, `orgId`, `name`, filter object,
  `createdBy`, `createdAt`, and active/revoked state; endpoint `kind`, `label`,
  `tokenHash`, `status`, `scopes[]`, and target linkage where applicable.
- Derived/computed fields: active subscription list, stale filter references,
  feed event set, iCal payload, Google sync health, last external sync state, and
  duplicate-token risk are computed from subscription filters, endpoint status,
  events, staff/room/activity records, and sync metadata.
- Audit fields: `public_endpoints.createdAt`, `updatedAt`, `createdBy`,
  `updatedBy`, `lastUsedAt`, `revokedAt`, and `expiresAt` should be server-owned.
  HYBRID subscription docs should gain or preserve explicit created/updated/
  revoked metadata during the refactor; raw-token access is not audit.
- **Conversion semantics:** D-14 ACCEPTED -- `public_endpoints` stores token
  hashes only. Creating or rotating a calendar subscription generates a raw token
  once, hashes it, writes or updates the `public_endpoints` row, links it to the
  subscription, and copies the raw URL to the admin without storing the raw token
  long-term. Resolving a token hashes the presented value, checks org/kind/status/
  scope/expiry, loads only the target subscription or hours report, updates
  `lastUsedAt`, and returns only scoped feed/form data. D-07 ACCEPTED -- this is
  an Edge Function or tightly scoped resolver path, not direct anon access to org
  tables. D-15 ACCEPTED -- backfill is packet-local: existing raw
  `CalendarSubscription.token` and `HoursReport.token` values are converted into
  `public_endpoints.tokenHash` rows, duplicate tokens are flagged, revoked/inactive
  docs become `REVOKED`, and raw token fields are removed or ignored by the new
  resolver after cutover. No global Student/Event migration is created.
- Open schema decisions: public website embeds, public event detail pages,
  public concert/program calendars, performer-name disclosure, consent/release
  setup, redaction/revocation behavior, and public downloadable files are
  **BLOCKED ON D-23**. V1 may harden private/admin-created iCal and hours-report
  token mechanics under D-07/D-14, but does not decide public website publication.

## UX Placement (obey route-nav-policy.md)
- Home: existing **Manage tab / subscriptions** for calendar subscription
  administration; existing **Settings / integrations** for Google Calendar
  connection/import; Calendar event detail for per-event sync status. Public token
  routes are resolver endpoints, not sidebar views.
- Navigation entry: no new sidebar or command-palette destination in v1. Keep the
  existing Manage `subscriptions` tab and Settings entry points. Do not unhide or
  route `ANALYTICS`, `ACADEMICS`, or any new website integration top-level view.
- Mobile visibility: admin subscription and Google integration management are
  desktop-first because Manage/Settings are operator/config surfaces. Token
  error/success pages for hours forms must remain mobile-safe at 390x844. Public
  website embeds or public calendars are **BLOCKED ON D-23**.
- Empty / loading / error states: no subscriptions, no active endpoints, stale
  staff/room/activity filter, duplicate token found during backfill, invalid
  token, expired token, revoked token, no feed events, malformed iCal request,
  Google account disconnected, Google token expired, sync API failure, and action
  blocked by **BLOCKED ON D-23**.
- Hebrew/RTL requirements: Manage subscription labels, filter summaries, endpoint
  statuses, Google sync errors, invalid-token screens, and audit labels must have
  EN/HE strings. URLs, token fragments, hashes, Google IDs, and RFC 5545 snippets
  should be LTR-isolated inside RTL layouts.

## Role / RLS Matrix
| Operation | super_admin | admin | teacher (self) | teacher (others) | finance | guardian/public | RLS mechanism / refinement needed |
|---|---|---|---|---|---|---|---|
| List/read | ✓ | ✓ | own | — | — | — | Refine `calendar_subscriptions` and token-bearing `hours_reports` from uniform member-read to admin-only for config/audit lists. Teacher self may read only own sync status through a scoped Staff/Calendar path. |
| Read detail | ✓ | ✓ | own | — | — | ✓ | Admin detail for configs/endpoints. Public/token read returns only resolver output for a valid scoped token; no direct table SELECT. Teacher own is sync/status only, not token config. |
| Create | ✓ | ✓ | — | — | — | — | Admin creates subscription configs and `public_endpoints`; public callers cannot create endpoint rows. |
| Edit | ✓ | ✓ | — | — | — | — | Admin edits filters, labels, expiry, and endpoint metadata; Google sync settings stay admin/calendar-owner gated. |
| Status transition (non-financial) | ✓ | ✓ | — | — | — | — | Admin activates, expires, revokes, or rotates endpoints. Expiry may also be enforced by resolver/job using server time. |
| Status transition (payroll/finance-affecting) | — | — | — | — | — | — | No direct payroll/finance mutation. Hours-report submission semantics remain in payroll packets; this packet only moves token lookup under `public_endpoints`. |
| Archive/delete | ✓ | ✓ | — | — | — | — | Revoke/expire and retain audit; no hard delete after a token was issued or used. |
| Export | ✓ | ✓ | — | — | — | — | Admin-only config/audit export. Public iCal output is covered by the token resolver below, not broad export permission. |
| Public submit/sign | — | — | — | — | — | ✓ | D-07/D-14 controlled resolver validates `public_endpoints` hash/scope/status/expiry and returns only scoped iCal or target form data. Public website/concert/embed exposure is **BLOCKED ON D-23**. |

Required RLS refinements/tests:
- Narrow `calendar_subscriptions` from uniform org-member read to admin-only
  because current docs store raw tokens and feed filters. Do the same for
  `hours_reports` token lookup unless payroll implementation replaces it with a
  normalized/token-safe table first.
- Keep direct `public_endpoints` access admin-only. Public resolution must be an
  Edge Function or security-definer RPC that accepts a raw token, hashes it, checks
  scope/status/expiry, and returns only the scoped response.
- Verify anon/public users cannot SELECT `calendar_subscriptions`, `hours_reports`,
  `events`, or `public_endpoints` directly, and cannot infer endpoint existence
  through distinguishable errors.
- Verify the resolver never returns event rows outside the subscription filters,
  cross-org data, hidden/cancelled/archived events, raw token hashes, or private
  audit fields.

## Acceptance Criteria
- Unit: add deterministic helper coverage for `listActiveSubscriptions`,
  `resolvePublicToken`, `listExternalSyncState`, stale filter detection, duplicate
  token detection, active/revoked/expired ordering, iCal event filtering, and
  RFC 5545 escaping/folding. Existing inline behavior should be extracted or
  wrapped so the feature-tree query names map to real exports.
- Supabase mapping: preserve HYBRID `calendarSubscriptions`, `hoursReports`, and
  `events`; verify NORMALIZED camel<->snake mapping for `publicEndpoints`;
  preserve nested `filters`/`scopes` jsonb; store only token hashes in normalized
  endpoint rows.
- RLS/security: real-role tests for admin full config access, plain member denied,
  teacher own sync-status-only access, finance denied by default, cross-org
  isolation, no direct anon table access, valid token scoped response, invalid/
  expired/revoked token denied or empty per explicit resolver contract, and no
  raw token/hash leakage.
- Playwright smoke: admin opens Manage -> subscriptions, creates a filtered iCal
  subscription, copies the generated URL, resolver returns an `.ics` containing
  only matching active events, admin revokes the endpoint, and the same URL returns
  the revoked/empty response. Google sync smoke may mock Google API responses:
  connect settings -> import one event -> duplicate import skipped -> sync failure
  is surfaced. Public website/embed smoke is **BLOCKED ON D-23**.
- Hebrew/RTL: subscription manager, endpoint detail/audit states, invalid-token
  screen, Google sync/import errors, and copied-link feedback.
- Mobile viewport: `/report/:token` invalid/expired/submitted states at 390x844;
  admin subscription management can remain desktop-first unless route policy
  changes.
- Data migration/backfill: D-15 ACCEPTED -- packet-local only. Backfill existing
  active/revoked `calendar_subscriptions` and pending/submitted `hours_reports`
  into `public_endpoints` with `CALENDAR_SUBSCRIPTION` and `HOURS_REPORT` kinds,
  `targetId`, scopes, expiry where known, and status derived from `isActive` or
  report status. Flag duplicate raw tokens, stale filter references, missing
  `orgId`, missing target rows, and subscriptions that would expose hidden or
  cancelled events. Do not create a global Event migration; EventV2 boundaries use
  the accepted D-05 adapter/projection path.

## Dependencies
- Blocks: reports-analytics for endpoint usage/security reports, payroll-
  salaries-hours for moving legacy hours-report token lookup behind the endpoint
  registry, concert-programs-events only if **BLOCKED ON D-23** accepts public
  event/program exposure, agreements-consent only for shared endpoint audit
  patterns, and operations-command-center for integration health/status rollups.
- Blocked by: native calendar-schedule-engine, org-settings-global-users for
  tenant Google Calendar settings, staff-teacher-management for staff sync
  identities, real-role RLS/Edge Function implementation, and **BLOCKED ON D-23**
  for any public website calendar/embed, public event/program page, public
  performer list, or public downloadable program/file surface. D-07/D-14/D-15 are
  accepted prerequisites, not open blockers.
