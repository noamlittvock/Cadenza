#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/noamlitt/Building/apps/cadenza"
cd "$ROOT"

mkdir -p orchestration/logs

CLAUDE_MODEL="${CLAUDE_MODEL:-opus}"
CLAUDE_EFFORT="${CLAUDE_EFFORT:-medium}"
LOG_PATH="orchestration/logs/claude-blueprint-build.log"

if [ "$#" -gt 0 ]; then
  MESSAGE="$*"
else
  MESSAGE="$(cat)"
fi

{
  echo
  echo "===== Claude Blueprint Continue: $(date -Iseconds) ====="
  echo "$MESSAGE"
  echo
} | tee -a "$LOG_PATH"

claude \
  --continue \
  --model "$CLAUDE_MODEL" \
  --effort "$CLAUDE_EFFORT" \
  --permission-mode acceptEdits \
  -p "$MESSAGE" \
  2>&1 | tee -a "$LOG_PATH"
