# Next Agent Loop Command

The active build loop target is now `payroll-salaries-hours`.

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
- `BUILD_LOOP_STATE.md` starts with `BUILD ACTIVE` for the payroll loop.
- D-18 accepted model: `HoursEntry` is payroll source of truth; `HoursReport` is
  a period/submission header, not a parallel totals ledger.
- D-19 accepted model: rates are configurable and payable rate is stamped at
  admin approval using admin override > assignment/role-department rate > staff
  default > org default.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless a human/orchestrator is handling an explicit migration push.
- Do not paste or print `.env.local`; the loop prompt requires presence-only env
  checks.
- D-21-D-27 remain parked. Do not build packet sections marked blocked on those
  decisions.
- Generated `.build-loop/` logs are ignored.
