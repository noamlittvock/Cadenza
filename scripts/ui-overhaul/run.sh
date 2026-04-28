#!/usr/bin/env bash
# Autonomous UI overhaul runner for Cadenza v3.
# Chains 6 fresh `claude -p` calls, one per phase, with type-check + commit gates between.
# Halts on any failure. No git push, no Firebase, no destructive ops.

set -u  # NOT -e — we want to capture failures and halt explicitly with context.

PROJECT_ROOT="/Users/noamlitt/Building/apps/cadenza-v3"
cd "$PROJECT_ROOT" || { echo "Cannot cd to $PROJECT_ROOT"; exit 2; }

# Strip env that breaks claude -p subprocess (per project_cli_subprocess_env_bug memory)
unset CLAUDECODE
unset CLAUDE_CODE_ENTRYPOINT

LOG="$PROJECT_ROOT/ui-overhaul.log"
PROMPTS_DIR="$PROJECT_ROOT/scripts/ui-overhaul/prompts"
PHASES=(1 2 3 4 5 6)

ts() { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(ts)] $*" | tee -a "$LOG"; }

log "============================================================"
log "AUTONOMOUS UI OVERHAUL — Cadenza v3"
log "Branch: $(git branch --show-current)"
log "HEAD: $(git rev-parse --short HEAD)"
log "Revert anchor: a7d76b3"
log "============================================================"

PHASE_TITLES=(
  ""
  "Foundation tokens + chrome"
  "Calendar redesign"
  "Staff + Students + EventForm"
  "ManageHub + Activities + Rooms + Subscriptions + Gantt"
  "Financial + Hours"
  "Inbox + Settings + SuperAdmin + DevTools + Onboarding + residue sweep"
)

for n in "${PHASES[@]}"; do
  TITLE="${PHASE_TITLES[$n]}"
  PROMPT_FILE="$PROMPTS_DIR/phase-$n.txt"

  if [[ ! -f "$PROMPT_FILE" ]]; then
    log "FATAL: prompt file missing: $PROMPT_FILE"
    exit 3
  fi

  log ""
  log "=== Phase $n START — $TITLE ==="
  log "Prompt: $PROMPT_FILE ($(wc -l < "$PROMPT_FILE") lines)"
  log ""

  # Per-phase output capture (in addition to main log)
  PHASE_OUT="$PROJECT_ROOT/scripts/ui-overhaul/phase-$n.out"
  PHASE_ERR="$PROJECT_ROOT/scripts/ui-overhaul/phase-$n.err"

  # Dispatch claude -p with stdin prompt + --add-dir at project root
  cat "$PROMPT_FILE" | claude -p --add-dir "$PROJECT_ROOT" \
    > "$PHASE_OUT" 2> "$PHASE_ERR"
  CLAUDE_EXIT=$?

  log "Phase $n claude exit code: $CLAUDE_EXIT"
  log "Phase $n stdout bytes: $(wc -c < "$PHASE_OUT")"
  log "Phase $n stderr bytes: $(wc -c < "$PHASE_ERR")"

  # Echo last 60 lines of stdout into main log so progress is visible
  log "--- Phase $n last 60 lines of stdout ---"
  tail -n 60 "$PHASE_OUT" | tee -a "$LOG" > /dev/null

  if [[ $CLAUDE_EXIT -ne 0 ]]; then
    log ""
    log "FATAL: Phase $n claude -p failed with exit $CLAUDE_EXIT. Halting batch."
    log "See: $PHASE_OUT and $PHASE_ERR"
    exit 10
  fi

  # Type check
  log ""
  log "=== Phase $n type-check ==="
  if ! npx tsc --noEmit 2>&1 | tee -a "$LOG"; then
    log ""
    log "FATAL: Phase $n type-check failed. Halting batch."
    log "Files modified are still in working tree — review with git diff."
    exit 11
  fi
  log "Phase $n type-check OK"

  # Vite build
  log ""
  log "=== Phase $n vite build ==="
  if ! npm run build 2>&1 | tee -a "$LOG" | tail -n 40 > /dev/null; then
    log ""
    log "FATAL: Phase $n vite build failed. Halting batch."
    exit 12
  fi
  log "Phase $n vite build OK"

  # Commit (only if there are actual changes — agent may have made none)
  log ""
  log "=== Phase $n commit ==="
  git add -A
  if git diff --cached --quiet; then
    log "Phase $n produced no file changes. Skipping commit."
  else
    COMMIT_MSG="Phase $n — UI overhaul: $TITLE (autonomous batch)

Autonomous claude -p dispatch via scripts/ui-overhaul/run.sh.
Phase prompt: scripts/ui-overhaul/prompts/phase-$n.txt.
Type-check: passed. Vite build: passed.
Revert anchor: a7d76b3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    git commit -m "$COMMIT_MSG" 2>&1 | tee -a "$LOG"
    log "Phase $n committed: $(git rev-parse --short HEAD)"
  fi

  log ""
  log "=== Phase $n DONE ==="
done

log ""
log "============================================================"
log "ALL 6 PHASES COMPLETE"
log "Final HEAD: $(git rev-parse --short HEAD)"
log "Run \`git log --oneline a7d76b3..HEAD\` to see all overhaul commits."
log "Run \`git reset --hard a7d76b3\` to revert the entire overhaul."
log "============================================================"
