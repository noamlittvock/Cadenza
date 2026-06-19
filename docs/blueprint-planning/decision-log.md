# Cross-Module Decision Log

> **STATUS — 2026-06-18:** D-01–D-20, D-STATUS, and D-STATUS-2 are **ACCEPTED or
> IMPLEMENTED working decisions** for implementation; the concrete locked form is
> in [`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md). D-21–D-27 are newly
> surfaced packet questions with no accepted default; they are parked in
> [`LOOP_STATE.md`](LOOP_STATE.md) NEEDS NOAM and must stay marked `BLOCKED ON D-xx`
> where they affect a packet.

> **PHASE B step 5 — 2026-06-17:** The full `0004` path was selected: create
> `rollover_runs`, create inert/admin-only `public_endpoints`, add a `finance`
> capability, and refine teacher self-write RLS for attendance/hours. No public
> intake surface, anon policy, or D-04/D-05 canonical rename is activated by this.

> **PHASE B step 6 — 2026-06-17:** D-04/D-05 resolved as **adapter, not rename**,
> per Noam's confirm. The canonical write-model is V2 (`StudentV2`/`EventV2`); the
> legacy `Student`/`CalendarEvent` shapes survive only at read edges. The single
> conversion seam is [`utils/canonicalAdapters.ts`](../../utils/canonicalAdapters.ts)
> (pure, bidirectional, tested in `canonicalAdapters.test.ts`). **No wide rename,
> no UI rewire, no data migration** — persistence stays HYBRID jsonb and D-15 still
> holds. The seam is additive foundation the P0 modules write/read through.

Decisions that span more than one module. Packets cite these IDs rather than
re-deciding. D-01–D-20 have recommended defaults, explicit Noam confirmations, or
accepted configurable assumptions that are now accepted per the banner above;
D-21–D-27 intentionally have no default and are parked for Noam.

Legend: 🔴 blocks a P0 packet · 🟡 blocks P1/P2 · ⚪ infra/cleanup

---

### D-01 — Module navigation home  🔴
**Q:** Do new Blueprint modules live under `Manage` tabs, or do Students /
Registration / Finance / Reports / Academic Hub become top-level sidebar views?
**Recommended default:** Top-level views for the few high-traffic daily surfaces
(Students, Finance); Manage tabs for lower-frequency config-like modules. Resolve
together with [`route-nav-policy.md`](route-nav-policy.md).
**Blocks:** every P0 packet's UX Placement. **State:** ACCEPTED 2026-06-17 —
locked in [`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md) and
[`route-nav-policy.md`](route-nav-policy.md): top-level Students + Finance for
operator surfaces, with `PAYROLL` amended on 2026-06-18 as an authenticated
teacher self-report route because the packet requires mobile teacher reachability.
Lower-frequency modules stay in Manage/contextual/public tiers unless the route
policy is amended.

### D-02 — Dead-end command-palette entries  🔴
**Q:** STUDENTS, BILLING, ACADEMICS, INVENTORY, PAYROLL, ANALYTICS are in
`ViewState` + CommandPalette but unrouted in `App.tsx` (fall to `app.not_found`).
Hide them, route to shells, or route into Manage tabs?
**Recommended default:** Hide until each module's packet ships, then unhide as it
lands (palette entry and route ship together). INVENTORY routes to
`Manage?tab=inventory` immediately. Detail in route-nav-policy.
**Blocks:** route-nav-policy, every packet. **State:** ✅ IMPLEMENTED 2026-06-17 —
locked in [`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md) and
[`route-nav-policy.md`](route-nav-policy.md). Phase A added the routed-view
allowlist (`routing.ts`), anti-drift coverage (`routing.test.ts`), palette
filtering (`CommandPalette.tsx`), and the `INVENTORY → Manage?tab=inventory`
alias. `STUDENTS`, `BILLING`, `ACADEMICS`, `PAYROLL`, and `ANALYTICS` stay hidden
until their route and packet ship together. 2026-06-18 route-shell updates:
`STUDENTS` is routed as the Student/Family top-level shell and palette-visible.
`PAYROLL` is routed as the authenticated teacher self-report surface and
palette-visible. `BILLING`, `ACADEMICS`, and `ANALYTICS` remain hidden.

### D-03 — Family as first-class record  🔴
**Q:** Is `Family` a real editable source-of-truth table now, or a grouping
overlay deferred until finance/registration need it?
**Recommended default:** First-class now — registration, finance ledger ownership
(D-07-FIN), and guardian/sibling grouping all converge on it; deferring forces
rework. Table exists (`families`).
**Blocks:** student-family-files, public-registration-intake, payments-charges.
**State:** ACCEPTED 2026-06-17 - locked in
[`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md): `families` is already a
normalized table and the student-family module productizes it as an editable
source-of-truth record. Conversion and finance packets may depend on `familyId`;
D-07 public consent/write path and D-07-FIN ledger ownership remain separate
decisions.

### D-04 — Canonical Student type  🔴
**Q:** Legacy `Student`, `StudentV2`, or a compatibility adapter going forward?
**Recommended default:** Pick one canonical write-model; adapter only at read
boundaries during transition. Needs the data-explorer's type inventory before
finalizing.
**Blocks:** student-family-files (and everything that links to students).
**State:** ✅ IMPLEMENTED 2026-06-17 — adapter, not rename. `studentToV2` is the
canonical write-model conversion; `studentV2ToMinimal`/`studentToMinimal` feed the
query helpers; `studentV2ToLegacy` is the read-only reverse for legacy UI. Lossy
drops (`isMinor`, `governmentalId`, student `phone`, `assignments`,
`pedagogicalRecord`, `notes`, `guardians[1+]`) enumerated in `LOSSY_STUDENT_FIELDS`
and asserted by tests. Seam: `utils/canonicalAdapters.ts`.

### D-05 — Canonical event type  🔴
**Q:** `CalendarEvent`, `EventV2`, or adapter?
**Recommended default:** Same shape as D-04 — one canonical model, adapter at
read edges. Attendance and payroll both bind to this.
**Blocks:** lesson-details-attendance, payroll-salaries-hours, calendar cleanup.
**State:** ✅ IMPLEMENTED 2026-06-17 — adapter, not rename. `eventToV2` is the
canonical write-model conversion (splits ISO `start`/`end` into org-tz
`date`/`startTime`/`endTime` + immutable `durationMinutes`); `eventV2ToMinimal`/
`eventToMinimal` feed the query helpers; `eventV2ToLegacy` is the read-only reverse
(tz-aware, duration-exact round-trip, verified across UTC/Asia·Jerusalem/America·
New_York incl. DST). Lossy drops in `LOSSY_EVENT_FIELDS` (`staffMemberIds` →
EventParticipant, recurrence detail, `roomId`, etc.). Seam: `utils/canonicalAdapters.ts`.

### D-06 — Teacher write access to attendance/hours  🔴
**Q:** Do teachers write attendance and hours directly, or do those route through
admin approval?
**Recommended default:** Teacher self-service write with admin approval gate on
the payroll-affecting transition (mark freely; "approved/paid" is admin-only).
Current uniform RLS makes writes admin-only, so this needs an RLS refinement.
**Blocks:** lesson-details-attendance, payroll-salaries-hours. **State:** ACCEPTED;
implemented in `0004` as row-scoped `STAFF` self-write policies for
`lesson_records` and `hours_entries`, with `hours_entries` restricted to
`DRAFT|SUBMITTED` for staff writes.

### D-07 — Public unauthenticated writes  🔴
**Q:** How do public registration / agreement signing reach Supabase: direct
anon RLS policy, Edge Function, or app-mediated token route?
**Recommended default:** Edge Function (or tightly-scoped token route) writing to
a quarantined `registration_intake` row — never a broad anon INSERT policy on org
tables. **Consent rule:** any such endpoint requires an explicit consent/setup
flow; no config may bypass it.
**Blocks:** public-registration-intake, agreements-consent, D-14. **State:**
ACCEPTED 2026-06-18 — locked in
[`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md): public writes must use a
Supabase Edge Function or tightly scoped token route into quarantined
`registration_intake`; never broad anon inserts into org tables. `0004` only
creates the inert/admin-only `public_endpoints` registry, so implementation still
must add the explicit consent/setup flow and controlled write path before any
public surface activates.

### D-07-FIN — Finance ledger canonical owner  🔴
**Q:** Are charges/payments/balances family-led, student-led, enrollment-led, or
mixed? Schema allows all; workflows need one canonical rule.
**Recommended default:** Family-led ledger (charges/payments roll up to a family
account) with per-enrollment charge line items. Aligns with D-03.
**Blocks:** payments-charges, payroll? no — finance only. **State:** ACCEPTED
2026-06-18 — locked in [`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md):
family-led ledger with per-enrollment charge line items; canonical aggregation
key is `familyId`.

### D-08 — Non-admin finance visibility  🔴
**Q:** What can non-admin staff see of payments/charges/balances?
**Recommended default:** None by default; finance read gated to admin +
explicit `finance` capability. Narrower than uniform org-member read.
**Blocks:** payments-charges, reports-analytics, RLS refinement. **State:** ACCEPTED;
implemented in `0004` via `member_capabilities` + `app_has_capability()`, with
ledger table access narrowed to admin or `finance`.

### D-09 — Reports visibility  🟡
**Q:** Reports available to all members or only admin/finance?
**Recommended default:** Admin/finance only initially; per-report scoping later.
**Blocks:** reports-analytics. **State:** ACCEPTED 2026-06-18 — reconciled
with [`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md): reports are
admin/finance-only initially, with per-report scoping deferred to the
`reports-analytics` packet. No general-member analytics access ships by default.

### D-10 — Balance snapshots  🔴
**Q:** Persist balance snapshots transactionally on every ledger mutation, or
generate on demand as report output?
**Recommended default:** Compute-on-demand for live balance; persist periodic
snapshots only for history/audit (`balance_snapshots` exists for the latter).
**Blocks:** payments-charges. **State:** ACCEPTED 2026-06-18 — reconciled with
[`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md): live balances are
computed on demand from charges, payments, and adjustments; `balance_snapshots`
are persisted only as periodic/audit history, not transactionally updated as the
source of truth for current balance.

### D-11 — Agreement signature capture  🟡
**Q:** Typed e-signature, uploaded PDF, or both?
**Recommended default:** Both — typed acceptance for the common path, PDF upload
for countersigned/legacy docs; `agreement_acceptances` records either.
**Blocks:** agreements-consent. **State:** ACCEPTED 2026-06-18 — reconciled with
[`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md): agreements support both
typed e-signature and PDF upload, and `agreement_acceptances` records either
capture form. Public/tokenized agreement signing still inherits the accepted D-07
controlled-write and explicit consent/setup requirements; this decision does not
activate an unauthenticated signing surface by itself.

### D-12 — Year rollover mutation model  🟡
**Q:** Does rollover mutate existing records, or create next-year records while
preserving prior-year history?
**Recommended default:** Create next-year records; never mutate prior-year.
History is non-negotiable for a ledger-grade tool.
**Blocks:** year-rollover-setup. **State:** ACCEPTED 2026-06-18 — reconciled
with [`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md): rollover creates
next-year records while preserving prior-year history, and must not mutate
prior-year student, enrollment, schedule, ledger, or agreement records in place.

### D-13 — Rollover audit entity  🟡
**Q:** Add a persisted `rollover_runs` audit entity (current helpers are pure
preview/apply)?
**Recommended default:** Yes — destructive/bulk ops need a durable run record.
**Blocks:** year-rollover-setup. Depends on D-12. **State:** ACCEPTED;
implemented in `0004` as `rollover_runs`.

### D-14 — PublicEndpoint table  🟡
**Q:** Add a normalized `public_endpoints`/token registry table before public
intake and agreements ship? (Confirmed ghost: `features/forteTree.ts:1370`
declares `PublicEndpoint` for `calendar-website-integrations`, but no table exists
in any migration — `0002`/`0003` included.)
**Recommended default:** Yes — define it in Pass 2 before any public surface.
**Blocks:** public-registration-intake, agreements-consent,
calendar-website-integrations. Depends on D-07. **State:** ACCEPTED;
implemented in `0004` as inert/admin-only `public_endpoints` with no anon policy.

### D-15 — Existing data backfill  ⚪
**Q:** What migration/backfill is expected for existing local/demo data when
modules go live?
**Recommended default:** Define per-module backfill in each packet; no global
migration until canonical types (D-04/D-05) settle.
**Blocks:** every packet's "Data migration" acceptance. **State:** ACCEPTED
2026-06-18 — locked to packet-local backfill. D-04/D-05 settled as adapter, not
rename, so there is **no global Student/Event data migration** in Phase C:
existing HYBRID `students`/`events` data stays in place and modules convert at
read/write boundaries through `utils/canonicalAdapters.ts`. Any future whole-app
runtime/persistence migration from legacy `Student`/`CalendarEvent` to V2 remains
out of scope and needs Noam.

### D-16 — Guardian identity and storage model  🟡
**Q:** Do student/family/intake/agreement workflows continue to use
`families.guardians[]` jsonb for guardian/contact data in P0, or must a
normalized guardian/contact identity model exist before those workflows ship?
**Recommended default:** P0 continues on the existing `families.guardians[]` jsonb
contract; do not normalize guardian/contact identities before the first
student/family, intake, or agreement workflows ship.
**Blocks:** no P0 build path. Normalized guardian/contact identity migration is
explicitly deferred beyond the current P0 build unless Noam reopens it.
**State:** ACCEPTED 2026-06-18 — Noam confirmed the recommendation in the build
briefing. Student/family, public-registration-intake, and agreements-consent may
ship against `families.guardians[]` jsonb. Public intake and token signing still
inherit D-07/D-14 consent/setup and scoped-write requirements; this decision does
not activate public access by itself.

### D-17 — Lesson group record and materialization model  🔴
**Q:** Confirm whether group lessons are represented as multiple
`lesson_records` rows sharing one `eventId` (one row per event/student), or as an
event-level attendance record with embedded student statuses; also decide lazy
on-open vs batch materialization for existing events.
**Recommended default:** none recorded. The schema points toward one row per
event/student, but the packet still flags this as needing confirmation, so the
loop must not decide it.
**Product principle from Noam:** Defaults should reduce work, not invent facts.
For attendance, completeness must not become a human data-entry ritual. A default
may prefill or prepare rows from schedule/roster facts, but it must not silently
mark attendance, completion, or lesson outcomes that a teacher/admin has not
confirmed.
**Accepted model:** one `lesson_records` row per `(eventId, studentId)`. Group
lessons are multiple lesson rows sharing the same `eventId`, and event-level
attendance views are derived from those rows. Existing events should not
materialize rows silently on event open; row preparation/materialization must be
an explicit teacher/admin setup or preparation action. Prepared rows may be
created from real schedule/roster facts, but their starting state remains
unconfirmed (`attendance=UNMARKED`, `completion=PENDING`) until a teacher/admin
explicitly confirms attendance, completion, or lesson outcomes.
**Impacts:** lesson-details-attendance, payroll-salaries-hours, reports-analytics.
**State:** ACCEPTED 2026-06-18 — confirmed by Noam in the Blueprint loop. This
unblocks the lesson-details-attendance materialization/backfill unit, subject to
the explicit-preparation/no-silent-outcomes rule above.

### D-18 — HoursReport / HoursEntry consolidation  🔴
**Q:** Does legacy `hours_reports` become a period header for normalized
`hours_entries`, get migrated into `hours_entries` and retired, or remain as a
parallel reporting surface?
**Accepted model:** `HoursEntry` is the payroll source of truth. Each entry is an
auditable line item for staff/date/event-or-work-source/rate/status. `HoursReport`
remains as a period/submission header grouping `HoursEntry` rows for teacher
submission, admin review, approval, export, and history. It must not maintain
independent payable totals that can drift from entries. Legacy monthly workbooks
or reports may be imported as immutable archive/opening context, not as a
parallel payroll ledger.
**Impacts:** payroll-salaries-hours, import/export, reports-analytics.
**State:** ACCEPTED 2026-06-18 — configurable finance discovery assumption;
details recorded in
[`finance-configurable-model-scope.md`](finance-configurable-model-scope.md).

### D-19 — Payroll rate source and stamp timing  🔴
**Q:** What is the rate resolution order for payroll entries (teaching assignment,
org role, manual override, other), and is the rate stamped at teacher submit,
admin approve, or payment close?
**Accepted model:** rates are configurable. P0 default resolution order is:
admin-approved manual override on the entry, then staff engagement / teaching
assignment / role-department rate, then staff default rate, then org default
rate. The payable rate is stamped on each `HoursEntry` at admin approval time;
teacher draft/submission may show an estimate but does not create the final
payable rate. `PAID` entries are immutable and corrections use adjusting entries.
Fixed salaries and supplier/invoice compensation are separate compensation modes,
not forced into the same hourly-rate calculation. Statutory deductions and
employer-cost provisions stay outside P0 with the bookkeeper/payroll provider.
**Impacts:** payroll-salaries-hours, finance exports/reports.
**State:** ACCEPTED 2026-06-18 — configurable finance discovery assumption;
details recorded in
[`finance-configurable-model-scope.md`](finance-configurable-model-scope.md).

### D-20 — Ledger currency policy  🔴
**Q:** Should the ledger enforce a single currency per family/org, or explicitly
support multi-currency balances and statements?
**Accepted model:** P0 enforces single currency per organization/family ledger.
Charges, payments, adjustments, live balances, snapshots, statements, and exports
for one family must share that currency. Mixed-currency imports are rejected or
flagged for manual cleanup. The model remains future-safe for explicit
multi-currency mode: balances/statements must be partitioned by currency, and
cross-currency allocation requires explicit exchange-rate or adjustment
semantics. P0 must never silently offset one currency against another.
**Impacts:** payments-charges, reports-analytics, agreement/statement outputs.
**State:** ACCEPTED 2026-06-18 — configurable finance discovery assumption;
details recorded in
[`finance-configurable-model-scope.md`](finance-configurable-model-scope.md).

### D-21 — Operational request calendar mutation rules  🟡
**Q:** When an `ABSENCE` or `DAY_OFF` operational request is approved, what exact
calendar side effects should ship: create `GanttBlock` blackouts, cancel or
reschedule affected events, create makeup tasks, affect lesson/payroll records,
or only notify admins? How should the feature-tree "extra teaching day" case be
represented: a new `RequestKind`, a staff availability/schedule record, or out of
scope for v1?
**Recommended default:** none recorded; this is a scheduling/payroll product
semantics call.
**Blocks:** rooms-absence-requests; may also affect lesson-details-attendance,
payroll-salaries-hours, reports-analytics, and calendar-website-integrations
depending on the chosen side effects. **State:** NEEDS NOAM — parked in
[`LOOP_STATE.md`](LOOP_STATE.md); blocked packet sections are marked
**BLOCKED ON D-21**.

### D-22 — Academic Hub assessment scope and document pipeline  🟡
**Q:** For exams/certificates/report cards, should v1 use the current normalized
`ExamSession`/`ExaminerSubmission`/`Certificate`/`ReportCard` schema as simple
admin-managed assessment records with authenticated examiner submissions, or must
it implement the older Academic Hub add-on model: configurable scoring rubrics,
explicit pass/fail thresholds and overrides, AI-assisted summaries, generated PDF
templates, guardian email delivery, and/or tokenized examiner or guardian-facing
links? If the richer model is required, what exact stored fields, document paths,
consent/setup steps, and public-token rules should ship?
**Recommended default:** none recorded; this is a product/scope and
consent-sensitive data-access call.
**Blocks:** exams-certificates-report-cards; may also affect
calendar-website-integrations, reports-analytics, student-family-files assessment
history, and agreements/consent language if guardian-facing delivery is required.
**State:** NEEDS NOAM — parked in [`LOOP_STATE.md`](LOOP_STATE.md); blocked packet
sections are marked **BLOCKED ON D-22**.

### D-23 — Concert public program exposure and consent  🟡
**Q:** May concert/event publishing expose event details, venue, repertoire,
student/staff performer names, and downloadable or embeddable program files to
unauthenticated website/calendar visitors? If yes, what consent/release setup,
redaction rules, performer display names, revocation/unpublish behavior, and
`public_endpoints`/calendar-website integration scope should ship?
**Recommended default:** none recorded; this is a public exposure and student
personal-data disclosure call, so the loop must not decide it.
**Blocks:** public/website-facing concert-program pages, public program PDFs,
public embeds, and public performer lists in concert-programs-events; may also
affect calendar-website-integrations, agreements-consent consent language, and
reports-analytics if public publication/audit reports are required.
**State:** NEEDS NOAM — parked in [`LOOP_STATE.md`](LOOP_STATE.md); blocked packet
sections are marked **BLOCKED ON D-23**.

### D-24 — Agreement consent withdrawal / revocation semantics  🟡
**Q:** Should agreement/consent v1 support guardian/family withdrawal or
revocation after acceptance, and if yes what status value, audit fields
(`revokedAt`, revokedBy, reason), public-token behavior, and downstream effects
should ship for enrollments, media/public releases, instrument loans, and
reports?
**Recommended default:** none recorded; this is a consent/personal-data policy
call and the current `AgreementAcceptance` schema has no `REVOKED` status or
`revokedAt` field, so the loop must not decide it.
**Blocks:** agreements-consent revocation/withdrawal workflow and any downstream
module that relies on revoking previously accepted media, public-performance,
instrument-loan, enrollment, or report-card consent.
**State:** NEEDS NOAM — parked in [`LOOP_STATE.md`](LOOP_STATE.md); blocked packet
sections are marked **BLOCKED ON D-24**.

### D-25 — Instrument deposit model  🟡
**Q:** Should instrument deposits, replacement fees, and refunds be represented
as finance ledger rows, agreement-only terms, standalone fields on
`instrument_loans`, or a mixed model; what lifecycle states, refund/forfeit
rules, document links, and family/student/staff ownership should ship?
**Recommended default:** none recorded; this is a money/product policy call, so
the loop must not decide it. Any accepted deposit/fee/refund ledger rows will use
D-20 P0 single-currency semantics unless a future explicit multi-currency mode is
configured.
**Blocks:** instrument-inventory deposit/fee/refund workflow, payments-charges
ledger integration for instrument custody, agreements-consent loan/deposit terms,
and reports-analytics deposit/refund reporting.
**State:** NEEDS NOAM — parked in [`LOOP_STATE.md`](LOOP_STATE.md); blocked packet
sections are marked **BLOCKED ON D-25**.

### D-26 — Staff HR evaluation privacy, consent/notice, and access scope  🟡
**Q:** For teacher evaluation/HR, may Cadenza collect and store staff
self-evaluations, manager reviews, reviewer-only notes, ratings, follow-up
actions, acknowledgments, and document attachments without a separate staff
notice/consent or HR policy setup? If yes, what exact privacy scope should ship:
all admins, a dedicated HR capability, assigned reviewers, subject staff
self-read/self-edit/acknowledgment, storage visibility, retention/deletion, and
export rules?
**Recommended default:** none recorded; this is staff personal-performance data
with privacy, retention, and employment-policy implications, so the loop must not
decide it.
**Blocks:** teacher-evaluation-hr workflow, RLS/storage scope for
`staff_evaluations`, evaluation document attachments, HR exports, and any
reports-analytics or operations-command-center rollups that expose staff
evaluation data.
**State:** NEEDS NOAM — parked in [`LOOP_STATE.md`](LOOP_STATE.md); blocked packet
sections are marked **BLOCKED ON D-26**.

### D-27 — Year rollover grade and recurring-event copy rules  🟡
**Q:** For year rollover, should Cadenza automatically advance
`StudentV2.grade` and copy recurring schedule/event records into the new school
year; if yes, what grade vocabulary/increment rules, non-graded/adult-student
exceptions, manual override behavior, date-shift method, holiday/blackout
handling, room/staff conflict behavior, and predecessor/successor lineage fields
should ship?
**Recommended default:** none recorded; this is a school-operations product and
data-model call, and it affects student grade data plus schedule generation.
**Blocks:** year-rollover-setup grade advancement, next-year student copy
lineage, recurring-event/schedule copy, and any rollover backfill for those
records. **State:** NEEDS NOAM — parked in [`LOOP_STATE.md`](LOOP_STATE.md);
blocked packet sections are marked **BLOCKED ON D-27**.

### D-STATUS-2 — P0 node status drift  ⚪
**Q:** `features/forteTree.ts` marks `student-family-files`, `lesson-details-attendance`,
`payments-charges`, `payroll-salaries-hours` as `gap`, but per
[`status-policy.md`](status-policy.md) some are `embedded` (students live inside
calendar/inventory/inbox; hours reporting + `hours_reports` exist). Correct the
tree to match the policy?
**Recommended default:** Set `student-family-files` and `payroll-salaries-hours`
to `embedded`; keep `public-registration-intake`, `lesson-details-attendance`,
`payments-charges` as `gap`. Apply with the consistency check, alongside D-STATUS.
**Blocks:** nothing; cleanup. **State:** ✅ IMPLEMENTED 2026-06-18 —
`features/forteTree.ts` initially marked `student-family-files` and
`payroll-salaries-hours` as `embedded`; `public-registration-intake`,
`lesson-details-attendance`, and `payments-charges` remained `gap`. Later Phase C
work promoted `student-family-files` and `public-registration-intake` to
`implemented`; the attendance build loop then promoted
`lesson-details-attendance` to `implemented`; `payments-charges` remains `gap`.
The packet headers are reconciled with current tree statuses, and
`features/forteTree.consistency.test.ts` is the status-policy gate.

### D-STATUS — Instrument Inventory tree status  ⚪
**Q:** Update `instrument-inventory` from `gap` to `implemented`?
**Recommended default:** Yes, after the feature-tree consistency check is green
(see [`status-policy.md`](status-policy.md)).
**Blocks:** nothing; cleanup. **State:** ✅ IMPLEMENTED 2026-06-18 —
`features/forteTree.ts` marks `instrument-inventory` as `implemented`, with the
D-STATUS comment at the node and the deterministic-query consistency check in
`features/forteTree.consistency.test.ts`.

---

## Resolution order (suggested)

1. D-02 + D-01 (route/nav) — unblocks all UX placement.
2. D-04 + D-05 (canonical types) — implemented as the adapter seam; no wide rename
   and no global Student/Event data migration.
3. D-03 + D-07-FIN (family + ledger ownership) — unblocks student/finance.
4. D-06 + D-08 (RLS refinements) — unblocks attendance/payroll/finance security.
5. D-07 + D-14 (public write + endpoint registry) — unblocks registration/agreements.
6. Remainder during Pass 2/3.
