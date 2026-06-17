#!/usr/bin/env bash
set -u -o pipefail

ROOT="/Users/noamlitt/Building/apps/cadenza"
cd "$ROOT"

mkdir -p orchestration/reports

STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="orchestration/reports/codex-audit-$STAMP.md"

{
  echo "# Codex Blueprint Audit"
  echo
  echo "Date: $(date -Iseconds)"
  echo "Repo: $ROOT"
  echo
  echo "## Git Status"
  echo '```'
  git status --short
  echo '```'
  echo
  echo "## Build"
  echo '```'
} > "$REPORT"

npm run build >> "$REPORT" 2>&1
BUILD_STATUS=$?

{
  echo '```'
  echo
  echo "Build status: $BUILD_STATUS"
  echo
  echo "## Supabase / Firebase Migration Signals"
  echo
  echo "### Supabase files"
  echo '```'
  find supabase -maxdepth 3 -type f 2>/dev/null | sort || true
  echo '```'
  echo
  echo "### Firebase runtime references"
  echo '```'
  rg -n "firebase|Firestore|firestore|Firebase|onSnapshot|getDocs|collection\\(|doc\\(|writeBatch|getFunctions|getApp" App.tsx components context hooks types utils functions index.tsx package.json firebase.json firestore.rules storage.rules 2>/dev/null || true
  echo '```'
  echo
} >> "$REPORT"

if [ "${RUN_ALL_TESTS:-0}" = "1" ]; then
  {
    echo "## Full Vitest"
    echo '```'
  } >> "$REPORT"
  npm test >> "$REPORT" 2>&1
  TEST_STATUS=$?
  {
    echo '```'
    echo
    echo "Test status: $TEST_STATUS"
  } >> "$REPORT"
else
  TEST_STATUS=0
  {
    echo "## Tests"
    echo
    echo "Skipped full Vitest. Re-run with:"
    echo
    echo '```bash'
    echo "RUN_ALL_TESTS=1 bash orchestration/scripts/codex-blueprint-audit.sh"
    echo '```'
  } >> "$REPORT"
fi

{
  echo
  echo "## Blueprint Coverage Hints"
  echo '```'
  rg -n "RegistrationIntake|LessonRecord|Charge|Payment|Agreement|Instrument|Evaluation|ConcertProgram|YearRollover|PublicEndpoint" types.ts types features utils components spec 2>/dev/null || true
  echo '```'
  echo
  echo "Report: $REPORT"
} >> "$REPORT"

cat "$REPORT"

if [ "$BUILD_STATUS" -ne 0 ] || [ "$TEST_STATUS" -ne 0 ]; then
  exit 1
fi
