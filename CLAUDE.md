# Cadenza

Calendar-first conservatory/music school management platform. Internal admin use only.

## Vault
Project vault: `/Users/noamlitt/Library/Mobile Documents/com~apple~CloudDocs/Obsidian/Second Brain/Work/Projects/Cadenza/`
- `brief.md` — project overview, modules, tech stack, current phase
- `decisions.md` — architecture decisions log
- `thinking-log.md` — session-by-session progress log

## Tech stack
- React 19 + TypeScript + Vite
- Firebase (Firestore, Auth, Hosting, Functions)
- Recharts, Playwright, Vitest
- RTL support + Hebrew calendar (@hebcal/core)

## Key commands
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm test` — vitest unit tests
- `npm run test:e2e` — playwright e2e tests

## Branch
`cadenza-v2`

## Architecture
- Calendar is the source of truth — compensation/billing derives from events
- `useEffectiveAuth()` for role simulation; `useAuth()` raw in Layout.tsx (SUPERADMIN escape hatch)
- See `HANDOFF.md` for type gotchas and DevTools architecture
