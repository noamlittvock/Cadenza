# Next Agent Loop Command

The active build state is on `lesson-details-attendance`, but the next unit is
blocked until Noam answers D-17. Do not run the loop again just to recheck the
blocker; it has already been rechecked three times.

If Noam provides the D-17 answer in the next session, start with this command
from a fresh Codex session or terminal in the same workspace:

```bash
cd "/Users/noamlitt/Documents/Cadenza Forte"
set -a
source .env.local
set +a
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD
CODEX_SANDBOX=danger-full-access MAX_ITERS=1 ./build-loop.sh
```

Notes:

- `build-loop.sh` defaults `CODEX_REASONING_EFFORT=high`.
- `BUILD_LOOP_STATE.md` does not start with `BUILD COMPLETE`; the first queued
  unit is `D-17 answer intake`.
- If D-17 is still unanswered, stop and ask Noam. Do not append another blocker
  note or run the loop repeatedly.
- D-17 exact answer needed: one `lesson_records` row per event/student vs an
  event-level attendance container, plus lazy vs batch/admin vs explicit setup
  materialization for existing events.
- Preserve the product rule already recorded by Noam: prepared defaults may use
  schedule/roster facts to reduce work, but attendance, completion, and lesson
  outcomes must stay unconfirmed until a teacher/admin explicitly confirms them.
- After Noam answers D-17, the first loop iteration should only record the
  decision in `decision-log.md` and
  `packets/lesson-details-attendance.md`; subsequent iterations may implement the
  accepted materialization/backfill strategy.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless a human/orchestrator is handling an explicit migration push.
- Do not paste or print `.env.local`; the loop prompt requires presence-only env
  checks.
- The branch `blueprint-supabase` was clean and pushed at commit `37ad4df`
  before this handoff update; generated `.build-loop/` logs are ignored.
