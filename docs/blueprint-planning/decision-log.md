# Cross-Module Decision Log

> **STATUS — 2026-06-17:** All recommended defaults below are **ACCEPTED as working
> decisions** for implementation; the concrete locked form is in
> [`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md). The per-entry text is kept
> for rationale and may be revisited only if implementation surfaces a conflict
> (update both files if so). D-04 (canonical student rename) needs a final confirm
> from Noam before a wide refactor.

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
re-deciding. Each has a *recommended default* — now accepted per the banner above.

Legend: 🔴 blocks a P0 packet · 🟡 blocks P1/P2 · ⚪ infra/cleanup

---

### D-01 — Module navigation home  🔴
**Q:** Do new Blueprint modules live under `Manage` tabs, or do Students /
Registration / Finance / Reports / Academic Hub become top-level sidebar views?
**Recommended default:** Top-level views for the few high-traffic daily surfaces
(Students, Finance); Manage tabs for lower-frequency config-like modules. Resolve
together with [`route-nav-policy.md`](route-nav-policy.md).
**Blocks:** every P0 packet's UX Placement. **State:** OPEN.

### D-02 — Dead-end command-palette entries  🔴
**Q:** STUDENTS, BILLING, ACADEMICS, INVENTORY, PAYROLL, ANALYTICS are in
`ViewState` + CommandPalette but unrouted in `App.tsx` (fall to `app.not_found`).
Hide them, route to shells, or route into Manage tabs?
**Recommended default:** Hide until each module's packet ships, then unhide as it
lands (palette entry and route ship together). INVENTORY routes to
`Manage?tab=inventory` immediately. Detail in route-nav-policy.
**Blocks:** route-nav-policy, every packet. **State:** OPEN.

### D-03 — Family as first-class record  🔴
**Q:** Is `Family` a real editable source-of-truth table now, or a grouping
overlay deferred until finance/registration need it?
**Recommended default:** First-class now — registration, finance ledger ownership
(D-07-FIN), and guardian/sibling grouping all converge on it; deferring forces
rework. Table exists (`families`).
**Blocks:** student-family-files, public-registration-intake, payments-charges.
**State:** OPEN.

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
**Blocks:** public-registration-intake, agreements-consent, D-14. **State:** OPEN.

### D-07-FIN — Finance ledger canonical owner  🔴
**Q:** Are charges/payments/balances family-led, student-led, enrollment-led, or
mixed? Schema allows all; workflows need one canonical rule.
**Recommended default:** Family-led ledger (charges/payments roll up to a family
account) with per-enrollment charge line items. Aligns with D-03.
**Blocks:** payments-charges, payroll? no — finance only. **State:** OPEN.

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
**Blocks:** reports-analytics. **State:** OPEN.

### D-10 — Balance snapshots  🔴
**Q:** Persist balance snapshots transactionally on every ledger mutation, or
generate on demand as report output?
**Recommended default:** Compute-on-demand for live balance; persist periodic
snapshots only for history/audit (`balance_snapshots` exists for the latter).
**Blocks:** payments-charges. **State:** OPEN.

### D-11 — Agreement signature capture  🟡
**Q:** Typed e-signature, uploaded PDF, or both?
**Recommended default:** Both — typed acceptance for the common path, PDF upload
for countersigned/legacy docs; `agreement_acceptances` records either.
**Blocks:** agreements-consent. **State:** OPEN.

### D-12 — Year rollover mutation model  🟡
**Q:** Does rollover mutate existing records, or create next-year records while
preserving prior-year history?
**Recommended default:** Create next-year records; never mutate prior-year.
History is non-negotiable for a ledger-grade tool.
**Blocks:** year-rollover-setup. **State:** OPEN.

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
**Blocks:** every packet's "Data migration" acceptance. **State:** OPEN.

### D-STATUS-2 — P0 node status drift  ⚪
**Q:** `features/forteTree.ts` marks `student-family-files`, `lesson-details-attendance`,
`payments-charges`, `payroll-salaries-hours` as `gap`, but per
[`status-policy.md`](status-policy.md) some are `embedded` (students live inside
calendar/inventory/inbox; hours reporting + `hours_reports` exist). Correct the
tree to match the policy?
**Recommended default:** Set `student-family-files` and `payroll-salaries-hours`
to `embedded`; keep `public-registration-intake`, `lesson-details-attendance`,
`payments-charges` as `gap`. Apply with the consistency check, alongside D-STATUS.
**Blocks:** nothing; cleanup. **State:** OPEN.

### D-STATUS — Instrument Inventory tree status  ⚪
**Q:** Update `instrument-inventory` from `gap` to `implemented`?
**Recommended default:** Yes, after the feature-tree consistency check is green
(see [`status-policy.md`](status-policy.md)).
**Blocks:** nothing; cleanup. **State:** OPEN.

---

## Resolution order (suggested)

1. D-02 + D-01 (route/nav) — unblocks all UX placement.
2. D-04 + D-05 (canonical types) — pending data audit, then unblocks student/event packets.
3. D-03 + D-07-FIN (family + ledger ownership) — unblocks student/finance.
4. D-06 + D-08 (RLS refinements) — unblocks attendance/payroll/finance security.
5. D-07 + D-14 (public write + endpoint registry) — unblocks registration/agreements.
6. Remainder during Pass 2/3.
