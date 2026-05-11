# Product Understanding — Cadenza v3

## Product summary
Cadenza is a calendar-first management platform for music conservatories / music schools. Internal admin tool. Calendar is the source of truth — compensation, billing, and reporting all derive from events. Bilingual (en-US / he-IL) with full RTL support. Hebrew calendar integration via @hebcal/core.

## Audience tension flagged
Run config audience: "Musicians and creators seeking a high-performance, intuitive interface for musical composition and performance." This does NOT match the actual product, which is an admin tool for music school operators (conservatory administrators, schedulers, payroll/billing staff). Optimizing for "musicians composing/performing" would build a different app.

**Resolution:** optimize for the actual product user — the conservatory admin/operator — under the broader interpretation that they serve musicians and creators, so admin clarity and momentum compound into musician-facing program quality. Iterations targeting raw composition/performance UX are out of scope.

## Primary users
- Conservatory administrators (full admin)
- Schedulers / coordinators
- Payroll/billing operators
- Read-only viewers (e.g. department heads)
- SuperAdmins (multi-org)

## Core jobs to be done
1. Schedule lessons, ensembles, rehearsals across rooms with conflict detection
2. Manage staff (teachers, rates, hours reports) and students (guardians, assignments, pedagogical record)
3. Manage activities (4-level Category → Subcategory → Activity → Variant tree, INSTRUCTIONAL vs OPERATIONAL)
4. Hours reporting → payroll
5. Onboarding new orgs (OnboardingChecklist)
6. Power tools (CSV import, gantt blocks, blackouts)

## Main surfaces (App.tsx routes)
CALENDAR (default), GANTT, MANAGE (hub for staff/students/activities/lists/rooms), STAFF_MEMBERS, SETTINGS, POWER_TOOLS, SUPER_ADMIN, ADMIN_INBOX, ONBOARDING_CHECKLIST.

## Tech stack
React 19 + TS + Vite. Firebase (Firestore/Auth/Hosting/Functions). Recharts. Vitest + Playwright. Tailwind via design tokens (bone/graphite/lacquer OKLCH palette per design.md).

## Design system (from design.md)
"Bone & lacquer." Warm bone neutrals + single deep lacquer-red accent. Default light theme; dark theme is warm graphite. Inter Display + Inter + Heebo (Hebrew) + JetBrains Mono. 8px macro grid, 2px micro-grid for calendar density. Restrained color — accent only for primary actions, active selection, in-focus events, conflict signal. Status semantics categorical.

## i18n
Translation pattern: `local_t(key)` → looks up `TRANSLATIONS[language][key]` from `constants.ts`. Live translation overrides via `liveTranslations` (Hebrew). No `src/lib/i18n.ts` exists — TRANSLATIONS lives in `constants.ts`. Will pre-stage `bl01_*` keys directly into constants.ts.

## Success criteria
- Admins finish recurring weekly tasks (schedule changes, hours reporting, onboarding new staff) in fewer clicks
- Calendar density and conflict legibility hold up on dense weeks (300+ events)
- Bilingual UX symmetric — Hebrew RTL parity with English
- Visual hierarchy honors design.md (lacquer accent restraint, bone neutrals, 2px micro-grid)

## Constraints / risks
- Out of scope this run: backend, DB schema, auth config, payment routes
- 19,052 lines across components/. Many surfaces — focused single-file or 2-file moves preferred
- Firestore writes everywhere — UI iterations should not touch persistence boundaries
- Read-only on arrival: only `branch-lab/` (run's own dir). No product files dirty.

## Open questions (acceptable unresolved this run)
- Is there a designated "calendar density" benchmark to test against? (No — we'll eyeball from devDataGenerator stress data.)
- Is the lacquer-vs-danger overlap tested live? (Per design.md — needs icon/pattern differentiation; visual audit could flag.)
