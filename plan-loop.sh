#!/usr/bin/env bash
# plan-loop.sh - Cadenza Blueprint decision-confirmation + planning loop.
# Runs one Codex exec session per planning unit. Edits docs only; never commits.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

STATE="${PLAN_LOOP_STATE:-docs/blueprint-planning/LOOP_STATE.md}"
LOG_DIR="${PLAN_LOOP_LOG_DIR:-.plan-loop}"
MAX_ITERS="${MAX_ITERS:-40}"
CODEX_BIN="${CODEX_BIN:-codex}"
CODEX_SANDBOX="${CODEX_SANDBOX:-workspace-write}"

case "$MAX_ITERS" in
  ''|*[!0-9]*)
    echo "MAX_ITERS must be a positive integer; got '$MAX_ITERS'." >&2
    exit 2
    ;;
esac

if ! command -v "$CODEX_BIN" >/dev/null 2>&1; then
  echo "Missing Codex CLI binary '$CODEX_BIN'." >&2
  exit 127
fi

if [ ! -f "$STATE" ]; then
  echo "Missing $STATE - seed it first." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
export CI=true

read -r -d '' PROMPT <<'EOF' || true
You are ONE iteration of an autonomous PLANNING loop for the Cadenza Blueprint.

Your only durable loop memory is docs/blueprint-planning/LOOP_STATE.md. Read it in
full first, then read the source docs it names. Treat LOOP_STATE.md as the queue,
not as a substitute for the real artifacts.

Do the NEXT SINGLE unticked unit in LOOP_STATE.md's queue - exactly one. Do not
batch ahead.

Non-negotiable rules:
- This is PLANNING. Edit markdown planning artifacts and, only when explicitly
  required by status-policy.md, status fields in features/forteTree.ts. Do not
  implement product UI, app logic, migrations, runtime code, or tests except for
  status-policy consistency checks already called out by the planning docs.
- Reconcile with current docs. If IMPLEMENTATION_HANDOFF.md, NEXT_SESSION_HANDOFF.md,
  decision-log.md, or another named planning artifact already records a current
  accepted/implemented decision, make the minimal doc update needed so the stale
  artifact agrees with that current source. Do not reopen settled work.
- Otherwise, resolve a decision ONLY by confirming the recommended default already
  written in decision-log.md. If there is no written default, or it is a genuine
  product/UX call without a current accepted source, or it touches public/anon/
  unauthenticated intake or personal-data collection without explicit consent
  setup, DO NOT decide it. Append the specific question to the NEEDS NOAM list in
  LOOP_STATE.md and continue within the same unit.
- A packet blocked on a parked decision is still drafted as fully as resolved
  decisions allow, with each blocked section marked "BLOCKED ON D-xx". Never lower
  a bar or invent scope.
- Derive the module work-list from features/forteTree.ts and packet files, not a
  fixed count: every non-native node lacking a packet needs one.
- Preserve unrelated dirty work. Do NOT commit, stage, branch, push, or run any git
  write operation.

When the unit is done:
- Run the consistency gate:
  `npm run typecheck -- --diagnostics`
  `npx vitest run --reporter=dot`
  Fix anything your change broke.
- Update LOOP_STATE.md: tick the unit, refresh any generated queue items, append a
  2-3 line iteration note with what changed and how it was verified, set the next
  unit, and append any NEEDS NOAM questions.
- If every queued unit is done AND the completion checklist in LOOP_STATE.md holds,
  make the FIRST LINE of LOOP_STATE.md exactly:
  PLANNING COMPLETE
EOF

if head -n 1 "$STATE" | grep -qx "PLANNING COMPLETE"; then
  echo "Planning is already complete."
  exit 0
fi

for ((i=1; i<=MAX_ITERS; i++)); do
  echo "=== planning iteration $i ($(date '+%Y-%m-%dT%H:%M:%S%z')) ==="
  before="$(shasum "$STATE" | awk '{print $1}')"
  last_message="$LOG_DIR/iter-$i.last.md"

  codex_args=(--ask-for-approval never)
  if [ -n "${CODEX_MODEL:-}" ]; then
    codex_args+=(--model "$CODEX_MODEL")
  fi
  codex_args+=(
    exec
    --cd "$ROOT"
    --sandbox "$CODEX_SANDBOX"
    --color never
    --output-last-message "$last_message"
    -
  )

  set +e
  printf '%s\n' "$PROMPT" | "$CODEX_BIN" "${codex_args[@]}" 2>&1 | tee "$LOG_DIR/iter-$i.log"
  status="${PIPESTATUS[1]}"
  set -e

  if [ "$status" -ne 0 ]; then
    echo "Codex failed in iteration $i (status $status). Review $LOG_DIR/iter-$i.log." >&2
    exit "$status"
  fi

  if head -n 1 "$STATE" | grep -qx "PLANNING COMPLETE"; then
    echo "Planning complete after $i iteration(s)."
    exit 0
  fi

  after="$(shasum "$STATE" | awk '{print $1}')"
  if [ "$after" = "$before" ]; then
    echo "LOOP_STATE unchanged after iteration $i - stuck or blocked. Review $STATE and $LOG_DIR/iter-$i.log." >&2
    exit 1
  fi
done

echo "Hit MAX_ITERS ($MAX_ITERS) without completing. Review $STATE." >&2
exit 1
