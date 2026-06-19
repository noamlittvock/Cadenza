# Next Agent Loop Command

The active build loop target is now the combined P1 campaign:
`agreements-consent` -> `reports-analytics` -> `operations-command-center`.

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
- `BUILD_LOOP_STATE.md` starts with `BUILD ACTIVE` for the combined P1 campaign.
- The first queued unit is baseline audit and queue splitting only.
- Build order is agreements first, reports second, operations command center
  last.
- D-07 and D-14 are accepted: public/token signing must use controlled token or
  Edge paths, never broad anon table policies.
- D-09 is accepted: reports are admin/finance only initially; finance sees only
  finance-authorized sources.
- D-11 is accepted: agreements support typed e-signature and PDF upload.
- D-21-D-27 remain parked. Do not build packet sections marked blocked on those
  decisions.
- Especially preserve D-24: no consent withdrawal/revocation semantics unless
  Noam answers that decision and the packet/decision log are updated.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless a human/orchestrator is handling an explicit migration push.
- Do not paste or print `.env.local`; the loop prompt requires presence-only env
  checks.
- Generated `.build-loop/` logs are ignored.
