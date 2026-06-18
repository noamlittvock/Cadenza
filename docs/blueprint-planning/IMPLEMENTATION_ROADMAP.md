# Cadenza Blueprint - Pass 4 Implementation Roadmap

Status: drafted from `features/forteTree.ts` plus the packet files on
2026-06-18. This roadmap sequences implementation; the packets remain the module
specs and `status-policy.md` remains the implemented bar.

## Guardrails

- Do not build any packet section marked `BLOCKED ON D-xx` until the matching
  Noam question is answered and the packet/decision log are updated.
- Do not promote a node to `implemented` until the packet header and
  `features/forteTree.ts` are updated together and the full implemented bar in
  `status-policy.md` is satisfied.
- Every shipped module needs real Supabase authenticated-role RLS coverage.
  Static migration tests can support this gate, but they do not replace it.
- Route and palette changes follow `route-nav-policy.md`: Students and Finance
  are the only currently planned top-level additions; Inventory remains a
  `Manage?tab=inventory` alias; dead-end entries stay hidden until routed.
- HYBRID `Student`/`CalendarEvent` storage is not globally renamed in this
  roadmap. Product slices use the accepted D-04/D-05 adapter boundary.

## Gate Markers

| Marker | Meaning |
|---|---|
| `RLS-LIVE` | Real Supabase authenticated-role tests with admin, member/teacher, finance where relevant, anon/public where relevant, and cross-org denial. Required before `implemented`. |
| `PW-SMOKE` | Playwright smoke of the packet's primary workflow. Mobile smoke is included where the packet declares a mobile-primary path. |
| `RTL-MOBILE` | EN/HE labels, RTL layout, and the packet's declared 390x844 checks. |
| `MAP-UNIT` | Deterministic helper, adapter, and Supabase camel<->snake/HYBRID mapping tests named by the packet. |
| `BACKFILL` | Packet-local D-15 backfill/migration only; no global Student/Event persistence rewrite. |

## Module Inventory

The feature tree currently has 22 modules. Six native spines are sequence 0
foundation modules; they are not rebuilt as Blueprint product packets. The 16
non-native modules have packets in `packets/` and are sequenced below.

| Seq | Module | Status | Priority | Roadmap treatment |
|---:|---|---:|---:|---|
| 0.1 | `staff-teacher-management` | native | p0 | Keep as source spine; add staff identity/RLS joins only when dependent packets require them. |
| 0.2 | `activity-program-tree` | native | p0 | Keep Activity/Enrollment/TeachingAssignment as the roster/program spine. |
| 0.3 | `calendar-schedule-engine` | native | p0 | Keep Calendar as source of truth; D-05 adapter boundary for packet reads/writes. |
| 0.4 | `org-settings-global-users` | native | p0 | Keep Settings/Auth/SuperAdmin as tenant and role spine; support setup/integration slices. |
| 0.5 | `import-export-data-portability` | native | p1 | Extend import/export only through source packets; no standalone Blueprint rebuild. |
| 0.6 | `deterministic-agent-layer` | native | p0 | Extend readable/query coverage as modules land; do not require UI scraping. |

## Epic 0 - Cross-Cutting Release Gates

| Ticket | Slice | Required verification |
|---|---|---|
| E0.1 | Live Supabase RLS harness for real users/roles and cross-org fixtures. | `RLS-LIVE`; proves local/e2e bypass is not the only security coverage. |
| E0.2 | Keep feature-tree consistency gate honest as exported helpers replace documented stubs. | `MAP-UNIT`; remove stub names only when real exports exist. |
| E0.3 | Keep route/palette allowlist synchronized with each module route ship. | `PW-SMOKE` for routed destination plus `routing.test.ts`. |
| E0.4 | Status-policy release checklist per module. | Packet header + `features/forteTree.ts` status update in same change only after all gates pass. |

## Epic 1 - P0 Keystone People

| Seq | Module | Ticket slices | Blocking markers | Required test plan |
|---:|---|---|---|---|
| 1 | `student-family-files` | Route top-level `STUDENTS` and unhide palette; build Student/Family list, create/edit/detail, guardian/family/enrollment/document tabs; wire D-04 adapter at the student write boundary; packet-local family linking backfill. | No P0 guardian-model blocker: D-16 accepts current `families.guardians[]` jsonb. Future normalized guardian/contact identity is out of scope unless reopened. | `RLS-LIVE` admin write, teacher own-roster read, finance-tab gate; `PW-SMOKE` create family+student+enrollment+guardian search; `RTL-MOBILE` list/profile at 390x844; `MAP-UNIT` adapter + family mapping; `BACKFILL`. |
| 2 | `public-registration-intake` | Build consent-gated public submit path through D-07 Edge Function/scoped token; admin review queue in Admin Inbox; duplicate suggestions; extend approval from student-only to student+family+enrollment+agreement-request+inbox history. | Guardian/contact data uses current `families.guardians[]` jsonb per D-16; public path is accepted but must not bypass consent/setup. | `RLS-LIVE` no-auth submit, no anon table write, admin-only queue; `PW-SMOKE` submit -> review -> approve graph; `RTL-MOBILE` public form; `MAP-UNIT` conversion graph; `BACKFILL` no legacy intake unless found. |

## Epic 2 - P0 Calendar, Payroll, And Finance

| Seq | Module | Ticket slices | Blocking markers | Required test plan |
|---:|---|---|---|---|
| 3 | `lesson-details-attendance` | Calendar event detail panel; mobile teacher attendance marking; unmarked worklist; student lesson history; D-05 event adapter at module boundary. | Group row/materialization and lazy-vs-batch strategy `BLOCKED ON D-17`; do not ship implemented status until settled. | `RLS-LIVE` teacher own insert/update vs other denied; `PW-SMOKE` event -> mark attendance -> history/counter; `RTL-MOBILE` attendance 390x844; `MAP-UNIT` attendance helpers; `BACKFILL` lesson-record generation only after D-17. |
| 4 | `payroll-salaries-hours` | Teacher self-report path; admin approval/pay flow; variance worklist; payslip rows; finance read/export path. | HoursReport/HoursEntry consolidation `BLOCKED ON D-18`; rate source/stamp timing `BLOCKED ON D-19`. | `RLS-LIVE` teacher own DRAFT/SUBMITTED only, finance read/export only, admin approve/pay; `PW-SMOKE` submit -> compare -> approve -> payslip; `RTL-MOBILE` teacher submit; `MAP-UNIT` variance/rate tests after D-19; `BACKFILL` only after D-18. |
| 5 | `payments-charges` | Route top-level Finance using `BILLING`; family-led ledger list/detail; charge/payment/adjustment posting; live balance on demand and audit snapshots. | Currency invariant/model `BLOCKED ON D-20`; instrument deposit rows `BLOCKED ON D-25`. | `RLS-LIVE` admin/finance only, plain member denied, cross-org denied; `PW-SMOKE` charge -> payment -> balance -> void; `RTL-MOBILE` readable finance states; `MAP-UNIT` partial allocation, currency property tests after D-20; `BACKFILL` familyId ledger linking. |

## Epic 3 - Agreements, Programs, Assessments, And Resources

| Seq | Module | Ticket slices | Blocking markers | Required test plan |
|---:|---|---|---|---|
| 6 | `agreements-consent` | Template/version manager; student/family/enrollment agreement tabs; typed e-signature and PDF upload; D-07/D-14 token signing path for accepted request targets. | Currency-specific terms `BLOCKED ON D-20`; assessment delivery consent `BLOCKED ON D-22`; public performance/media release `BLOCKED ON D-23`; revocation `BLOCKED ON D-24`; instrument deposit terms `BLOCKED ON D-25`. Guardian/contact data uses D-16 jsonb path. | `RLS-LIVE` admin-only tables, valid token target-only sign, anon direct access denied; `PW-SMOKE` issue request -> mobile typed sign -> accepted history plus PDF upload; `RTL-MOBILE` signer page; `MAP-UNIT` agreement helpers/mapping; `BACKFILL` templates/PDF history only. |
| 7 | `ensembles-theory-school-programs` | Filtered Activity/Enrollment roster surfaces; program detail; roster import/export; assigned-teacher read path. | Group attendance materialization `BLOCKED ON D-17`. | `RLS-LIVE` assigned teacher own roster only, plain member denied; `PW-SMOKE` create ensemble -> assign teacher -> add students -> teacher own roster; `RTL-MOBILE` teacher read; `MAP-UNIT` roster helpers; `BACKFILL` existing Activity/Enrollment rosters. |
| 8 | `exams-certificates-report-cards` | Authenticated exam sessions; assigned examiner submission; certificate queue; report-card history in Student detail; private storage links. | Rich Academic Hub/PDF/email/tokenized guardian or examiner flows `BLOCKED ON D-22`. | `RLS-LIVE` assigned examiner own submissions only, storage scoped, no anon; `PW-SMOKE` session -> submission -> graded -> issue certificate; `RTL-MOBILE` examiner submit; `MAP-UNIT` assessment helpers/mapping; `BACKFILL` existing normalized rows. |
| 9 | `concert-programs-events` | Private authenticated concert program list/detail; Calendar event link; run-of-show editor; private print/export; teacher own read. | Public event/program exposure, performer names, files, embeds, and consent rules `BLOCKED ON D-23`. | `RLS-LIVE` admin full, performer/teacher own read, plain member denied, private storage scoped; `PW-SMOKE` event -> program -> pieces -> publish authenticated -> teacher own read; `RTL-MOBILE` teacher run-of-show; `MAP-UNIT`; `BACKFILL` existing concert rows. |
| 10 | `instrument-inventory` follow-up | Add detail drawer, loan/repair/document hardening, checkout/return invariants, borrower self read if shipped; preserve Manage alias. | Currency `BLOCKED ON D-20`; agreement withdrawal effects `BLOCKED ON D-24`; deposit/fee/refund model `BLOCKED ON D-25`. | `RLS-LIVE` borrower detail scope, plain member denied from loans/repairs, admin write; `PW-SMOKE` inventory add/edit/checkout/overdue/return/retire; `RTL-MOBILE` borrower card only if shipped; `MAP-UNIT` status/custody invariants; `BACKFILL` loans/repairs only. |

## Epic 4 - Operations, Integrations, Rollover, And Reporting

| Seq | Module | Ticket slices | Blocking markers | Required test plan |
|---:|---|---|---|---|
| 11 | `rooms-absence-requests` | Teacher own room-change/absence/day request form; Admin Inbox approval; room-change side-effect transaction; operational request export. | Absence/day-off/extra-day calendar/payroll side effects `BLOCKED ON D-21`. | `RLS-LIVE` teacher own pending only, admin decide, plain member denied; `PW-SMOKE` room change request -> approval -> event room update; `RTL-MOBILE` teacher request; `MAP-UNIT`; `BACKFILL` no conflict-notification conversion unless true requests. |
| 12 | `calendar-website-integrations` | Harden Manage subscriptions and Settings Google sync; move raw tokens to `public_endpoints`; resolver for private iCal/hours-report scopes; endpoint audit. | Public website/calendar/concert/program exposure `BLOCKED ON D-23`. | `RLS-LIVE` admin config, no anon direct table access, valid token scoped resolver; `PW-SMOKE` create iCal -> resolve -> revoke -> denied/empty; `RTL-MOBILE` token states; `MAP-UNIT` helper exports and token hashing; `BACKFILL` raw tokens to hashes. |
| 13 | `year-rollover-setup` | Settings Academic Calendar rollover preview; `rollover_runs` audit row; cancel/failed/apply lifecycle; setup milestone readiness. | Finance carry-forward `BLOCKED ON D-20`; consent revocation effects `BLOCKED ON D-24`; grade advancement and recurring-event copy rules `BLOCKED ON D-27`. | `RLS-LIVE` admin-only rollover runs, cross-org isolation; `PW-SMOKE` settings -> preview -> warnings -> cancel; apply smoke only after D-20/D-24/D-27; `RTL-MOBILE` setup gate read; `MAP-UNIT`; `BACKFILL` no historical runs without evidence. |
| 14 | `reports-analytics` | Route `ANALYTICS` as Reports workspace; report library; definition builder with source/field allowlists; run, lineage, CSV export; finance-only report subset. | Source-specific packs `BLOCKED ON D-17` through `BLOCKED ON D-27` as listed in packet. Guardian/contact reports may use D-16 jsonb path only after student/family source authorization exists. | `RLS-LIVE` admin full, finance allowed sources only, plain member/teacher/anon denied, no source bypass; `PW-SMOKE` finance report create/run/export/link; `RTL-MOBILE` readable states; `MAP-UNIT` invalid columns, filters, grouping; `BACKFILL` seed only settled definitions. |
| 15 | `operations-command-center` | Admin Inbox operations summary; pure source-authorized snapshot cards; open conflicts, today events, inbox/import/report-health cards; finance-only card subset. | Source-specific cards `BLOCKED ON D-17` through `BLOCKED ON D-27`; pending-hours card waits on D-18. Guardian/contact cards may use D-16 jsonb path only after student/family source authorization exists. | `RLS-LIVE` admin full, finance allowed cards only, no hidden-count leakage, no anon; `PW-SMOKE` Admin Inbox summary -> card drill-downs; `RTL-MOBILE` permission/blocked states; `MAP-UNIT` exported command helpers; no dashboard backfill. |

## Epic 5 - HR And Later P2 Scope

| Seq | Module | Ticket slices | Blocking markers | Required test plan |
|---:|---|---|---|---|
| 16 | `teacher-evaluation-hr` | Staff detail evaluation tab; due list; review/action workflow; optional self/acknowledgment/attachments only after policy is settled. | HR privacy, notice/consent, reviewer/subject scope, attachments, retention, deletion, and export `BLOCKED ON D-26`. | `RLS-LIVE` no broad member read, exact D-26 scopes, no finance/public; `PW-SMOKE` staff -> evaluation -> complete -> action list after D-26; `RTL-MOBILE` subject-facing path if accepted; `MAP-UNIT`; `BACKFILL` no HR history synthesis without D-26. |

## Keystone-First Summary

1. Build and verify `student-family-files` first. It is the authoritative link
   target for intake, finance, attendance, agreements, instruments, assessments,
   rollover, reports, and dashboard drill-downs.
2. Build `public-registration-intake` after Student/Family because approval writes
   into the student/family/enrollment/agreement graph.
3. Keep P0 attendance, payroll, and finance next, but do not ship their blocked
   sections until D-17, D-18, D-19, and D-20 are answered.
4. Build P1/P2 modules around the native spines and already-routed homes. Do not
   add new top-level destinations except the accepted Students, Finance, and the
   Reports route when `reports-analytics` ships.
5. Put `reports-analytics` and `operations-command-center` after their source
   modules because they must not infer or expose data the source modules have not
   authorized.
