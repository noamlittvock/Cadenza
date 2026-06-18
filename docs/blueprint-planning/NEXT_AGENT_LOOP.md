# Next Agent Loop Command

The active build state is seeded for `public-registration-intake`.

Copy/paste this from a fresh Codex session or terminal in the same workspace:

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
- `BUILD_LOOP_STATE.md` no longer starts with `BUILD COMPLETE`; the first queued
  unit is the `public-registration-intake` baseline audit.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless a human/orchestrator is handling an explicit migration push.
- Do not paste or print `.env.local`; the loop prompt requires presence-only env
  checks.
