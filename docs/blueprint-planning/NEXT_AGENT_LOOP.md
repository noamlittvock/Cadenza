# Next Agent Loop Command

The active build loop target is now `payments-charges`.

Run from the repo root:

```bash
set -a
source .env.local
set +a
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD
CODEX_SANDBOX=danger-full-access ./build-loop.sh
```

Notes:

- `build-loop.sh` defaults `CODEX_REASONING_EFFORT=high`.
- `BUILD_LOOP_STATE.md` starts with `BUILD ACTIVE` for the payments loop.
- D-07-FIN is accepted: the P0 ledger is family-led with per-enrollment charge
  lines.
- D-08 is accepted: finance access is admin plus explicit `finance` capability,
  not broad member access.
- D-10 is accepted: live balances are computed on demand; snapshots are audit
  history only.
- D-20 is accepted: P0 uses one currency per org/family ledger and must never
  silently offset currencies.
- D-25 remains parked. Do not build instrument deposits, replacement fees,
  forfeits, or refunds.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless a human/orchestrator is handling an explicit migration push.
- Do not paste or print `.env.local`; the loop prompt requires presence-only env
  checks.
- D-21-D-27 remain parked. Do not build packet sections marked blocked on those
  decisions.
- Generated `.build-loop/` logs are ignored.
