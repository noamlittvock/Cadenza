# Forte-Informed Cadenza Blueprint v0

Date: 2026-06-16
Source inspected: https://forte-cons.com/

## 1. Extracted Shape

Forte presents as a Hebrew conservatory and culture-center management platform. Public metadata names the core promise: students, teachers, scheduling, payments, ensembles, and reporting in one system. The bundled app text reveals a broader product tree:

| Area | Extracted modules |
|---|---|
| Command | Dashboard, notifications, real-time reports |
| People | Students, family files, teachers, global users |
| Scheduling | Calendar, schedule, rooms, room requests, day requests, absences |
| Learning | Ensembles, theory, school programs, exams, certificates, concert programs, lesson details |
| Finance | Salaries, extra hours, payments, charges, agreements |
| Resources | Instrument inventory, documents |
| Platform | Setup wizard, year rollover, conservatory settings, multi-conservatory administration |
| Integration | Website registration embed, calendar sync/subscriptions |

## 2. Industry Standard

A viable industry-standard conservatory app needs these minimum standards:

- Calendar source of truth: lessons, rooms, attendance, conflicts, payroll, and reports must trace back to event records.
- People lifecycle: students, guardians, families, staff, roles, assignments, documents, archive state, and effective dating must be first-class.
- Finance reconciliation: payroll, payments, charges, agreements, and balances must be auditable line items, not only totals.
- Pedagogical record: attendance, lesson notes, exams, certificates, recitals, and report cards must attach to students over time.
- Public intake: website forms should create structured reviewable records before becoming official students/enrollments.
- Operational resilience: recurrence, holidays, school-year rollover, import/export, RTL, permissions, and audit trails are baseline requirements.
- Agent-readable data: stable IDs, explicit joins, deterministic query families, source lineage, and embedding-ready text must exist outside rendered UI.

## 3. Cadenza Fit

Cadenza should not become a Forte clone. Its native shape is calendar-first, minimal, warm, dense, and operator-focused. The addition therefore starts as a typed feature tree and a compact Blueprint view.

Already native or close:

- Calendar/scheduling engine
- Activity/program tree
- Staff and roles
- Rooms, conflicts, admin inbox
- Hours reports and tokenized form pattern
- Calendar subscriptions and Google import/sync
- Setup/onboarding, settings, super admin
- Deterministic assistant query pipeline

Important gaps:

- Public registration intake
- First-class student/family surface
- Lesson attendance/details
- Payment/charge ledger
- Agreements/consent
- Instrument inventory
- Teacher evaluation
- Concert/exam/certificate add-ons

## 4. Planned Addition

Phase 0, implemented here:

- `features/forteTree.ts`: stable feature ontology with source signals, statuses, next steps, data entities, query names, and embedding text.
- `utils/forteTreeQueries.ts`: deterministic query helpers for lookup, filtering, coverage, industry gaps, and embedding records.
- `components/ConservatoryBlueprint.tsx`: native Cadenza view for scanning the tree.
- `ViewState.BLUEPRINT`: sidebar and command-palette access.

Phase 1:

- Add public registration intake using the tokenized public-page pattern.
- Create `RegistrationIntake` records with duplicate review and approve-to-student conversion.

Phase 2:

- Expose first-class Students/Family Files using existing student schemas.
- Add family grouping and enrollment history surfaces.

Phase 3:

- Add LessonRecord linked to EventV2 for attendance, notes, repertoire, completion, and makeups.

Phase 4:

- Add finance ledger primitives: Charge, Payment, Adjustment, BalanceSnapshot.

Phase 5:

- Add Agreements, Instrument Inventory, Academic Hub, Teacher Evaluation, and Concert Programs as thin modules over the same readable-data contract.
