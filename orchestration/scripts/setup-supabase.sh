#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/noamlitt/Building/apps/cadenza"
PROJECT_REF="mgkhhwzqpwfvresmmytc"

cd "$ROOT"

mkdir -p orchestration/logs orchestration/reports
LOG_PATH="orchestration/logs/supabase-setup.log"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found on PATH. Install it before continuing." >&2
  exit 127
fi

{
  echo "===== Supabase Setup: $(date -Iseconds) ====="
  echo "Project ref: $PROJECT_REF"
  echo "Supabase CLI: $(command -v supabase)"
  supabase --version || true
  echo
} | tee -a "$LOG_PATH"

echo "Running supabase login..." | tee -a "$LOG_PATH"
supabase login 2>&1 | tee -a "$LOG_PATH"

if [ ! -f "supabase/config.toml" ]; then
  echo "Running supabase init..." | tee -a "$LOG_PATH"
  supabase init 2>&1 | tee -a "$LOG_PATH"
else
  echo "Supabase already initialized at supabase/config.toml; skipping init." | tee -a "$LOG_PATH"
fi

echo "Linking Supabase project $PROJECT_REF..." | tee -a "$LOG_PATH"
supabase link --project-ref "$PROJECT_REF" 2>&1 | tee -a "$LOG_PATH"

echo "Supabase setup complete." | tee -a "$LOG_PATH"
