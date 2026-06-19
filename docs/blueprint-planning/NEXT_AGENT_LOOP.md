# Next Agent Loop Command

The `lesson-details-attendance` build loop is complete. `BUILD_LOOP_STATE.md`
starts with `BUILD COMPLETE`, and there is no next queued unit for this loop.

To start a new autonomous build loop, seed a new `BUILD_LOOP_STATE.md` objective
first; do not rerun the completed attendance loop as-is.

Notes:

- `build-loop.sh` defaults `CODEX_REASONING_EFFORT=high`.
- `BUILD_LOOP_STATE.md` starts with `BUILD COMPLETE` for the completed
  `lesson-details-attendance` loop.
- D-17 accepted model: one `lesson_records` row per `(eventId, studentId)`;
  group lessons are multiple rows sharing one `eventId`; event-level attendance
  views are derived from rows; do not add an embedded event-level attendance
  container.
- D-17 accepted materialization: existing-event rows/status containers are
  prepared only through explicit teacher/admin setup or preparation action. Do
  not silently materialize on event open. Batch/admin preparation is allowed only
  when explicitly initiated by an admin and audited.
- Preserve the product rule: prepared defaults may use schedule/roster facts to
  reduce work, but rows start unconfirmed (`attendance=UNMARKED`,
  `completion=PENDING`) and attendance, completion, and lesson outcomes must stay
  unconfirmed until a teacher/admin explicitly confirms them.
- Keep `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` out of child-agent
  environment unless a human/orchestrator is handling an explicit migration push.
- Do not paste or print `.env.local`; the loop prompt requires presence-only env
  checks.
- Generated `.build-loop/` logs are ignored.
