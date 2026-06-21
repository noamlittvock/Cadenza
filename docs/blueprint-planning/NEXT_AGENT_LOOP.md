# Next Agent Loop Command

The active build loop target is now the bird's-eye Blueprint completion campaign.
It should continue the app-wide product build with local/static/e2e verification
while tracking live Supabase RLS as a release-hardening gate.

Paste this into the next agent:

```bash
cd "/Users/noamlitt/Documents/Cadenza Forte"
set -a
source .env.local
set +a
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD
CODEX_SANDBOX=danger-full-access ./build-loop.sh
```

Notes:

- `build-loop.sh` defaults `CODEX_REASONING_EFFORT=high`.
- `BUILD_LOOP_STATE.md` starts with `BUILD ACTIVE`.
- The next queued unit is **Agreement bird's-eye status closeout**: promote
  `agreements-consent` as product-built under bird's-eye mode, while recording
  live agreement RLS/migration skips as release-hardening gates.
- After agreement closeout, the loop should build `reports-analytics`, then
  `operations-command-center`, then first-pass bird's-eye surfaces for the
  remaining planned/deferred modules.
- Live Supabase RLS is not a build blocker in this campaign. Keep env-gated live
  tests and static schema tests, but record live skips in
  `RELEASE_HARDENING_GATES.md` instead of stopping product implementation.
- D-21-D-27 are accepted provisional defaults for the bird's-eye build. Keep
  affected features conservative, reversible, auditable, and visibly
  reviewable.
- D-07 and D-14 remain strict: public/token signing must use controlled token or
  Edge paths, never broad anon table policies.
- D-09 remains strict: reports are admin/finance only initially; finance sees
  only finance-authorized sources.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless a human/orchestrator is handling an explicit migration push.
- Do not paste or print `.env.local`; the loop prompt requires presence-only env
  checks.
- Generated `.build-loop/` logs are ignored.
