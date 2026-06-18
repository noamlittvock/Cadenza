# Cadenza Blueprint Planning Phase Report

Date: 2026-06-17
Repo: `/Users/noamlitt/Documents/Cadenza Forte`
Branch: `blueprint-supabase`

## Executive Summary

The Blueprint is broad enough that it should not go directly from the current feature-tree/schema foundation into feature implementation. It needs a structured planning phase with multiple passes.

Current state:

- Supabase schema, TypeScript contracts, deterministic query helpers, RLS, and tests exist for most Blueprint entities.
- The user-facing Blueprint dashboard exists as a planning/coverage surface.
- Instrument Inventory is the only substantial newly productized Blueprint module in the UI.
- Several older/native app areas already cover parts of the Blueprint: calendar, staff, rooms, activities, settings, import/export, admin inbox, hours reporting, command palette, local/e2e mode, and RTL language behavior.
- Most Blueprint domains still need product planning before implementation: routes, ownership, exact workflows, permissions, conversion semantics, import/export behavior, test fixtures, and Hebrew/RTL acceptance.

Important code-level findings from the planning audit:

- `ViewState` and the command palette expose `STUDENTS`, `BILLING`, `ACADEMICS`, `INVENTORY`, `PAYROLL`, and `ANALYTICS`, but `App.tsx` does not route those views. They currently fall through to `app.not_found`.
- Manage -> Inventory is implemented, but the feature tree still marks `instrument-inventory` as `gap`; planning should define a status policy and update the tree.
- Manage and Admin Inbox are hidden from mobile sidebar navigation, while Blueprint and Settings remain visible. Mobile access to admin workflows needs an intentional plan.
- Public registration and public agreement signing cannot work with the current uniform member/admin RLS unless a public endpoint/token/edge-function strategy is planned.
- Finance and HR records currently inherit broad org-member read access from uniform RLS, which is likely too permissive for real deployment.

Recommendation:

Run a four-pass planning phase before implementation:

1. **Scope and Product Workflow Pass**: define what each module actually does for operators.
2. **Data and Security Pass**: verify table shape, joins, RLS, role behavior, lifecycle states, and audit semantics.
3. **UX and Integration Pass**: decide routes, module homes, forms, list/detail flows, cross-links, empty states, Hebrew labels, and mobile/RTL constraints.
4. **Implementation Slicing Pass**: turn the above into build tickets with acceptance tests, Playwright smoke paths, and sequencing.

Subagents are useful for the planning phase, but only in narrow lanes. Use parallel explorers for independent audits, then keep final planning synthesis centralized to avoid contradictory product direction.

## Blueprint Scope Inventory

The feature tree currently has 21 nodes:

| Node | Domain | Current status | Priority | Planning posture |
|---|---:|---:|---:|---|
| operations-command-center | command | planned | p1 | Needs aggregation plan after intake/finance/attendance exist. |
| public-registration-intake | people | gap | p0 | First major implementation candidate; needs public/admin conversion planning. |
| student-family-files | people | embedded | p0 | Needs first-class UI and family model decisions. |
| staff-teacher-management | people | native | p0 | Mostly native; needs join tightening for payroll/permissions. |
| activity-program-tree | scheduling | native | p0 | Native spine; must become anchor for enrollment, exams, finance. |
| calendar-schedule-engine | scheduling | native | p0 | Native core; needs EventV2/participants cleanup plan. |
| rooms-absence-requests | scheduling | embedded | p1 | Needs request/approval workflow design. |
| ensembles-theory-school-programs | learning | planned | p1 | Needs roster-focused views over Activity + Enrollment. |
| lesson-details-attendance | learning | gap | p0 | High-priority planning; connects calendar, students, payroll, reports. |
| exams-certificates-report-cards | learning | planned | p1 | Needs academic hub scope, document/export decisions. |
| concert-programs-events | learning | planned | p2 | Can wait until student/activity/event links are stronger. |
| payroll-salaries-hours | finance | embedded | p0 | Existing pieces need consolidation and reconciliation workflow. |
| payments-charges | finance | gap | p0 | High-risk; needs ledger/accounting decisions before UI. |
| agreements-consent | finance | gap | p1 | Needs template/signature/public-token decisions. |
| instrument-inventory | resources | gap in tree, implemented in UI | p1 | Tree status should be updated; needs repair/deposit/agreement planning. |
| teacher-evaluation-hr | people | gap | p2 | Later module; HR permissions and privacy need planning. |
| reports-analytics | command | planned | p1 | Should be query-backed after source modules mature. |
| year-rollover-setup | platform | embedded | p1 | Needs destructive-operation preview/apply planning. |
| org-settings-global-users | platform | native | p0 | Native; needs tenant health/access-control hardening. |
| import-export-data-portability | platform | native | p1 | Needs extension plan per new module. |
| calendar-website-integrations | platform | embedded | p1 | Needs unified PublicEndpoint/token registry planning. |
| deterministic-agent-layer | agent | native | p0 | Extend intents only after module workflows stabilize. |

## What Needs To Be Planned

### 0. Navigation And Route Reality

Before module-specific planning, resolve route/nav mismatch:

- `types.ts` includes `STUDENTS`, `BILLING`, `ACADEMICS`, `INVENTORY`, `PAYROLL`, and `ANALYTICS`.
- `components/CommandPalette.tsx` exposes those destinations.
- `App.tsx` only handles `CALENDAR`, `MANAGE`/`STAFF_MEMBERS`, `BLUEPRINT`, `SUPER_ADMIN`, `ADMIN_INBOX`, and `SETTINGS`.

Planning decision:

- Either implement shells for the exposed Blueprint destinations, route them into appropriate tabs, or remove/hide command-palette entries until their modules exist.
- Decide whether Inventory should remain only as `Manage?tab=inventory` or get a direct route for `ViewState.INVENTORY`.
- Decide whether mobile users should be able to reach Manage/Admin Inbox and how.

### 1. Product Workflow Boundaries

For every module, planning must answer:

- Who uses it: admin, teacher, superadmin, guardian/public applicant, student/family, finance operator.
- Where it lives: sidebar top-level view, Manage tab, Calendar detail panel, Student detail tab, Admin Inbox, Settings, or public token route.
- What the primary object is: intake record, student, family, lesson, charge, agreement, exam session, concert program, report definition, etc.
- What the minimum complete workflow is: list, filter/search, create, detail, edit, archive/status transition, export, and cross-link.
- What "done" means operationally, not just technically.

The current Blueprint tree gives good nouns and query names. It does not yet define enough verbs, user roles, route placement, or completion criteria.

### 2. Cross-Module Dependencies

Several modules cannot be planned in isolation:

- Public registration depends on students, families, activities, enrollments, agreements/consent, duplicate review, and possibly public token settings.
- Lesson attendance depends on calendar events, EventV2/event participants, students/enrollments, staff, rooms, and payroll/reporting rules.
- Payments depend on students/families/enrollments, agreements, ledger statuses, adjustments, receipts, and reports.
- Agreements depend on students/families/enrollments, guardians, public signing/token flows, storage/documents, and versioning.
- Reports depend on stable source workflows; otherwise reports will encode temporary data assumptions.
- Year rollover depends on students, enrollments, recurring events, agreements, balances, and auditability.

Planning should treat these as dependency clusters, not isolated features.

### 3. Data Model Decisions

The schema exists, but implementation planning still needs decisions on:

- Whether `Family` becomes a first-class source of truth or a grouping overlay on existing `Student` records.
- How existing `Student` / `StudentV2`, `Teacher` / `StaffMemberV2`, `CalendarEvent` / `EventV2`, and enrollment types converge.
- Whether `RegistrationIntake.approve` creates only a student or also family, enrollment, agreement acceptance requests, and admin inbox history.
- How `LessonRecord` handles group lessons: one record per student/event, one event-level record with student statuses, or both.
- Whether finance ledger rows are family-led, student-led, enrollment-led, or mixed; the schema supports all, but workflows need a canonical rule.
- Whether balance snapshots are persisted on every ledger mutation, generated periodically, or computed on demand.
- How document links and Supabase storage paths attach to certificates, report cards, agreements, evaluations, and receipts.
- Whether public/tokenized endpoints get a new normalized table; the feature tree references `PublicEndpoint`, but no such Blueprint table exists in migration `0002`.
- Whether status names in the feature tree should be updated now that Instrument Inventory is implemented.

### 4. Permissions And RLS

The current Blueprint migration applies uniform RLS: org members can read, org admins can write. That is useful for a foundation, but planning needs per-workflow role decisions before real product rollout.

Plan role behavior for:

- Public intake creation without authenticated org membership.
- Guardian agreement signing or intake edits through scoped public tokens.
- Teacher self-service attendance marking, absence requests, hours reports, and evaluations.
- Finance data visibility: payments, charges, adjustments, balances, and reports should likely be narrower than general member read access.
- HR evaluation visibility: staff evaluations should be restricted more tightly than ordinary org records.
- Superadmin/global user management and cross-org support access.

Every module planning packet should include an RLS/role matrix before implementation.

### 5. UX And Navigation

The current product shape suggests these integration points:

- `Manage` tabs: staff, activities, rooms, subscriptions, inventory, possibly students/families.
- Calendar event detail: lesson attendance, room changes, program links, source event lineage.
- Admin Inbox: intake review, room/absence requests, agreement exceptions, finance approvals, rollover warnings.
- Settings/SuperAdmin: org setup, public endpoints, access control, tenant health.
- Dedicated modules: registration, students/families, finance, academic hub, reports, rollover.
- Public routes: website registration, agreement signing, maybe tokenized forms.

Planning must decide which modules deserve top-level navigation versus tabs or contextual panels. The app should avoid becoming a grid of disconnected CRUD pages.

Known UI planning risks:

- Dead-end command palette destinations create a false sense of shipped Blueprint coverage.
- There is no authoritative student/family product page even though students are used by filters, bot context, inventory checkout, and Admin Inbox mini views.
- Dense tables and modals in Blueprint, Inventory, Staff, Activity tree, and Admin Inbox need RTL/mobile verification beyond the current Settings/Inventory smoke path.
- Current sidebar hides some admin surfaces on mobile; this may be intentional, but it must be documented as a product decision.

### 6. Testing And Verification

Each planned module should specify:

- Unit tests for deterministic query helpers and conversion functions.
- Supabase mapping tests for normalized table camel/snake conversion where applicable.
- RLS tests with real roles, not just local/e2e bypass.
- Playwright smoke path for list/create/edit/status/archive or equivalent.
- Hebrew labels and RTL layout check.
- Mobile viewport check for the primary workflow.
- Import/export coverage if the module can receive or emit spreadsheet data.
- Secret scan before any commit involving Supabase config.

Existing tests cover deterministic query helpers broadly, but not full UI workflows for most modules.

Additional test gaps from the data audit:

- No Supabase mapping tests for camel/snake conversion, JSONB preservation, upsert/delete behavior, or RLS failures.
- No migration/schema tests checking SQL against generated TypeScript expectations.
- No property/edge tests for money/currency mixing, partial payment allocations, date boundaries, duplicate scoring, report aggregation, or status transitions.
- Declared feature-tree deterministic query names are not automatically checked against implemented exports.
- No report execution bridge test from `ReportDefinition.sourceEntity` to actual Supabase/local datasets.

## Recommended Planning Passes

### Pass 0: Planning Setup

Output:

- One canonical planning index under `docs/blueprint-planning/`.
- A template for module planning packets.
- A status policy for `native`, `embedded`, `planned`, `gap`, and `implemented`.
- A decision log for cross-module choices.
- A route/nav policy for top-level views, Manage tabs, command-palette entries, contextual panels, and mobile visibility.
- A role/RLS matrix template.

Do this first so later planning artifacts stay comparable.

Suggested files:

- `docs/blueprint-planning/README.md`
- `docs/blueprint-planning/module-template.md`
- `docs/blueprint-planning/decision-log.md`

### Pass 1: P0 Product Definition

Scope:

- Public registration intake.
- Student/family files.
- Lesson details and attendance.
- Payments/charges.
- Payroll/hours consolidation.
- Existing native spines: calendar, activity tree, staff, settings/access.

Output per module:

- User roles.
- Primary workflow.
- Required routes/panels.
- Data sources.
- Status lifecycle.
- Edge cases.
- Hebrew/RTL needs.
- Minimal acceptance criteria.

This pass should not implement UI. It should make implementation tickets unambiguous.

### Pass 2: Security, Data, And Conversion

Scope:

- RLS policy refinements.
- Public/tokenized endpoint registry.
- Student/family/enrollment canonicalization.
- EventV2/event participants cleanup.
- Finance ledger canonical rules.
- Agreement template/acceptance versioning.
- Audit ownership for `createdBy`, `updatedBy`, server timestamps, and status transitions.
- Whether JSONB arrays remain sufficient or need join tables for guardians, family students, concert pieces, payment allocations, report lines, and evaluation criteria.

Output:

- Role matrix.
- Entity relationship decisions.
- Migration deltas if schema needs changes.
- Conversion semantics for intake approval, attendance marking, ledger posting, agreement acceptance, and rollover apply.

This pass should happen before writing public forms or finance UI.

### Pass 3: P1/P2 Module Definition

Scope:

- Rooms/absence requests.
- Ensembles/theory/school programs.
- Exams/certificates/report cards.
- Agreements/consent.
- Reports/analytics.
- Year rollover.
- Calendar/website integrations.
- Instrument Inventory follow-up.
- Teacher evaluations.
- Concert programs.
- Deterministic agent expansion.

Output:

- Same packet structure as P0 modules, with dependency notes.
- Which modules are blocked by P0 decisions.
- Which can be thin views over existing data.

### Pass 4: Implementation Roadmap

Output:

- Sequenced epics.
- Ticket-sized implementation slices.
- Test plan per slice.
- Data migration needs.
- Rollout/feature flag choices.
- Release readiness checklist.

Recommended build order:

1. Planning infrastructure and decision log.
2. Student/family canonical surface, because many modules depend on it.
3. Public registration intake review and approve-to-student/family/enrollment.
4. Lesson attendance attached to calendar event detail.
5. Payroll/hours consolidation around attendance/event participants.
6. Finance ledger: charges, payments, adjustments, balance summary.
7. Agreements/consent and public token registry.
8. Reports/export builder for already-stable modules.
9. Year rollover preview/apply.
10. Academic hub, room/absence requests, ensemble rosters, concerts, staff evaluations.

## Subagent Strategy

Subagents are useful in planning, but the main agent should own final synthesis.

Recommended use:

- **Explorer: UI surface audit**: identify actual routes, screens, existing components, and likely integration points.
- **Explorer: data/schema/query audit**: verify tables, TypeScript contracts, Supabase mapping, deterministic query coverage, and tests.
- **Explorer: security/RLS audit**: inspect auth, org membership, public route patterns, storage, and role assumptions.
- **Explorer: domain packet draft**: for one module at a time, draft a planning packet using the agreed template.

Avoid:

- Multiple agents drafting competing global roadmaps.
- Letting subagents make product priority decisions independently.
- Asking subagents to implement before cross-module decisions are settled.

The planning phase should use subagents for audits and packet drafts, then consolidate in one owner-controlled report.

Subagent use in this report:

- A UI explorer audited current routes, nav, Manage Hub, Blueprint dashboard, Inventory, Admin Inbox, Settings, and mobile/RTL risks.
- A data explorer audited Blueprint types, migrations, Supabase sync mapping, deterministic queries, RLS, import/export/reporting implications, and test gaps.
- Their findings were consolidated here; the report remains the single source for next planning actions.

## Module Planning Packet Template

Each Blueprint module should get a packet with this structure:

```md
# Module Name

## Current State
- Existing UI:
- Existing data/schema:
- Existing query helpers:
- Existing tests:

## Users And Permissions
- Actors:
- Read permissions:
- Write permissions:
- Public/token access:

## Workflows
- List/search/filter:
- Create:
- Detail:
- Edit:
- Status transitions:
- Archive/delete:
- Import/export:

## Data Contract
- Primary records:
- Linked records:
- Required fields:
- Derived fields:
- Audit fields:
- Open schema decisions:

## UX Placement
- Route/tab/panel:
- Navigation entry:
- Empty/loading/error states:
- Mobile/RTL requirements:

## Acceptance Criteria
- Unit:
- RLS/security:
- Playwright:
- Hebrew/RTL:
- Data migration:

## Dependencies
- Blocks:
- Blocked by:
```

## P0 Planning Packets Needed First

### Public Registration Intake

Plan:

- Public form route and token/embed model.
- Required applicant/guardian/activity/consent fields.
- Duplicate detection UX.
- Review queue location: Admin Inbox, dedicated Registration module, or both.
- Approve/reject/duplicate/convert lifecycle.
- Conversion output: student only vs student + family + enrollment + agreements.
- Public unauthenticated insert policy or edge/API path.
- E2E smoke: submit public form, review as admin, convert, verify student/family/enrollment links.

### Student And Family Files

Plan:

- Canonical `Student` vs `StudentV2` direction.
- Whether `Family` is a real editable record.
- Guardian identity model and minor handling.
- Student detail tabs: profile, guardians, enrollments, lessons, finance, documents, agreements, history.
- Archive semantics and linked-record visibility.
- Import/export mapping.
- E2E smoke: create/edit student/family, link guardian, add enrollment, search by guardian.

### Lesson Details And Attendance

Plan:

- Event detail entry point.
- One-to-one vs group lesson record model.
- Teacher permission to mark attendance.
- Completion, cancellation, makeups, notes, repertoire, homework.
- How attendance affects payroll, reports, and student history.
- Backfill/generation strategy for existing events.
- E2E smoke: open calendar event, mark attendance, verify student lesson history and unmarked counter.

### Payments And Charges

Plan:

- Ledger canonical owner: family, student, enrollment, or mixed.
- Charge creation sources: manual, enrollment, import, agreement, rollover.
- Payment application rules and partial payment handling.
- Adjustment approval and voiding.
- Balance snapshots: persisted vs computed.
- Receipt/invoice/document strategy.
- Finance permissions narrower than general org member read access.
- E2E smoke: create charge, record payment, verify open balance and family payment history.

### Payroll, Salaries, And Hours

Plan:

- Consolidate existing HoursReport with `HoursEntry`.
- Define calendar-derived vs self-reported variance workflow.
- Approval and paid statuses.
- Rate source: teaching assignment, org role, manual override.
- Teacher self-service permissions.
- E2E smoke: submit hours, compare against calendar, approve, generate payslip rows.

## P1/P2 Planning Packets

### Agreements And Consent

Requires decisions on public token registry, signatures, document storage, template versioning, and guardian identity.

### Reports And Analytics

Should wait until at least student/family, attendance, and finance source workflows are stable. Reports should be query-backed tables first, charts second.

### Year Rollover

Needs preview/apply semantics, dry-run output, rollback strategy, and role gating. Treat as high-risk even if priority is p1.

### Rooms, Absences, And Day Requests

Can reuse Admin Inbox. Needs request creation, approval side effects, and calendar mutation rules.

### Exams, Certificates, And Report Cards

Needs Academic Hub scope, score model, document generation/export plan, and student history links.

### Ensembles, Theory, And School Programs

Likely thin roster views over Activity + Enrollment, but billing and attendance differences need planning.

### Instrument Inventory Follow-Up

Existing UI covers catalog, checkout, return, counters, persistence, and RTL smoke. Still plan repairs, deposits, loan agreements, documents, and status synchronization. Also update feature-tree status from `gap`.

### Teacher Evaluation

Later module. Needs privacy-sensitive permissions and document attachment planning.

### Concert Programs

Later module. Needs event-linked run-of-show, performer selection, document export, and public display decisions.

### Public Endpoint Registry

Feature tree references `PublicEndpoint`, but schema does not define it yet. This should be planned before public registration and public signing are implemented broadly.

## Open Decisions

1. Should new Blueprint modules be grouped under `Manage`, or should Students, Registration, Finance, Reports, and Academic Hub become top-level navigation items?
2. Should command-palette entries for unimplemented views be hidden, routed to module shells, or routed into Manage tabs?
3. Should `Family` be introduced as a first-class table now, or delayed until registration/finance require it?
4. What is the canonical student type going forward: legacy `Student`, `StudentV2`, or a compatibility adapter?
5. What is the canonical event type going forward: `CalendarEvent`, `EventV2`, or a compatibility adapter?
6. Do teachers get direct write access to attendance and hours, or do those writes route through admin approval?
7. How should unauthenticated public writes reach Supabase: direct RLS policy, edge function, or app-mediated token route?
8. What finance visibility should non-admin staff have?
9. Should reports be available to all members or only admins/finance roles?
10. Should balance snapshots be persisted transactionally or generated as report output?
11. Should agreements use typed e-signature capture, uploaded PDFs, or both?
12. Should year rollover mutate existing records or create next-year records while preserving prior-year history?
13. Does year rollover need a persisted `rollover_runs`/audit entity, since the current query helpers are pure preview/apply helpers only?
14. Should `PublicEndpoint` be added as a normalized table before public intake and agreements?
15. What migration/backfill is expected for existing local/demo data?

## Immediate Next Actions

1. Create `docs/blueprint-planning/` and add the module packet template.
2. Draft P0 packets for registration, student/family, lesson attendance, payments, and payroll.
3. Draft a cross-cutting decisions document for canonical student/family/event models, public endpoints, and role matrix.
4. Draft a route/nav cleanup decision: command palette, direct views, Manage tabs, mobile visibility.
5. Update `features/forteTree.ts` statuses after confirming current UI reality, especially Instrument Inventory.
6. Add an automated consistency check that every declared feature-tree deterministic query maps to an implemented helper or explicitly documented existing utility.
7. Only then begin implementation slices.
