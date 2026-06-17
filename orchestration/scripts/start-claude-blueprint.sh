#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/noamlitt/Building/apps/cadenza"
cd "$ROOT"

mkdir -p orchestration/logs orchestration/reports

SESSION_NAME="${CLAUDE_SESSION_NAME:-cadenza-blueprint-builder}"
CLAUDE_MODEL="${CLAUDE_MODEL:-opus}"
CLAUDE_EFFORT="${CLAUDE_EFFORT:-medium}"
PROMPT_PATH="orchestration/prompts/claude-blueprint-build.md"
AGENTS_PATH="orchestration/prompts/claude-agents.json"
LOG_PATH="orchestration/logs/claude-blueprint-build.log"

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude CLI not found on PATH." >&2
  exit 127
fi

if [ ! -f "$PROMPT_PATH" ]; then
  echo "Missing $PROMPT_PATH" >&2
  exit 1
fi

AGENTS_JSON="$(tr -d '\n' < "$AGENTS_PATH")"

{
  echo "===== Claude Blueprint Build Start: $(date -Iseconds) ====="
  echo "Session: $SESSION_NAME"
  echo "Model: $CLAUDE_MODEL"
  echo "Effort: $CLAUDE_EFFORT"
  echo
} | tee -a "$LOG_PATH"

claude \
  --name "$SESSION_NAME" \
  --model "$CLAUDE_MODEL" \
  --effort "$CLAUDE_EFFORT" \
  --permission-mode acceptEdits \
  --agents "$AGENTS_JSON" \
  --append-system-prompt "You are the lead builder. Build end to end; do not stop at planning. Use subagents, but you remain responsible for implementation and verification." \
  "$(cat "$PROMPT_PATH")" \
  2>&1 | tee -a "$LOG_PATH"
