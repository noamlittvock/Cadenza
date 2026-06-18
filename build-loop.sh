#!/usr/bin/env bash
# build-loop.sh - Cadenza Blueprint implementation loop.
# Runs one Codex exec session per build unit. Edits code/docs/tests; never commits.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

STATE="${BUILD_LOOP_STATE:-docs/blueprint-planning/BUILD_LOOP_STATE.md}"
LOG_DIR="${BUILD_LOOP_LOG_DIR:-.build-loop}"
MAX_ITERS="${MAX_ITERS:-40}"
CODEX_BIN="${CODEX_BIN:-codex}"
CODEX_SANDBOX="${CODEX_SANDBOX:-workspace-write}"
CODEX_REASONING_EFFORT="${CODEX_REASONING_EFFORT:-high}"

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
You are ONE iteration of an autonomous BUILD loop for the Cadenza Blueprint.

Your only durable loop memory is docs/blueprint-planning/BUILD_LOOP_STATE.md.
Read it in full first, then read the authoritative artifacts it names:
IMPLEMENTATION_HANDOFF.md, IMPLEMENTATION_ROADMAP.md, the current packet,
decision-log.md, route-nav-policy.md, and status-policy.md. Treat
BUILD_LOOP_STATE.md as the queue, not as a substitute for the specs.

Do the NEXT SINGLE unticked unit in BUILD_LOOP_STATE.md's queue - exactly one.
Do not batch ahead. If the next unit is too large for one safe iteration, split it
into smaller unchecked subunits in BUILD_LOOP_STATE.md, then complete only the
first new subunit.

Non-negotiable rules:
- This is IMPLEMENTATION. Code, tests, migrations, and docs may change only when
  required by the current queue unit.
- Preserve unrelated dirty work. Do NOT commit, stage, branch, push, or run any
  git write operation.
- D-07 is ACCEPTED for public writes: public unauthenticated submissions must go
  through a Supabase Edge Function or tightly scoped token into quarantined
  records. Never add broad anon INSERT/SELECT/UPDATE/DELETE policies on org
  tables.
- D-14 is ACCEPTED: public/tokenized surfaces must use the `public_endpoints`
  registry/control plane before launch.
- Consent is mandatory for public data-collection surfaces. Do not add a config
  path that bypasses explicit consent/setup capture.
- D-05 is ACCEPTED: EventV2 is the canonical event write-model. Use
  `utils/canonicalAdapters.ts` for CalendarEvent/EventV2 conversion and do not
  add a second inline event conversion or a broad HYBRID events rewrite.
- D-06 is ACCEPTED: teachers may self-write own attendance/hour rows, while
  payroll-affecting approval remains admin-gated. Do not broaden staff write
  scope beyond row ownership.
- D-16 is ACCEPTED for P0: guardian/contact data stays in
  `families.guardians[]` jsonb. Do not normalize guardian/contact identity or
  reopen that decision.
- D-17-D-27 remain parked. Do not build packet sections marked `BLOCKED ON D-xx`
  until the matching decision is answered and the packet/decision log are updated.
- Route/palette rule: a command-palette destination must route to a real surface
  or alias onto one. Public token routes do not get sidebar or command-palette
  entries.
- UI must match the existing app language: dense operator workflows, warm paper
  workspace, dark espresso sidebar, bordeaux/navy accents, compact headers,
  segmented controls, 8px-radius panels/cards, lucide icons, no marketing page.
- Use existing app patterns and helpers. Use `utils/canonicalAdapters.ts` for
  Student and Event legacy/V2 conversion; do not add duplicate inline conversion
  seams. Public submit must create only quarantined intake; live
  Student/Family/Enrollment records are created only by an admin-approved
  conversion.
- If live Supabase credentials are absent, add env-gated RLS tests that skip with
  a clear message, record the exact env vars in BUILD_LOOP_STATE.md, and do not
  mark RLS-LIVE or BUILD COMPLETE until those tests run against a real project.
- Never print or record secret values. Do not run `printenv`, `env`, `set`, or
  `cat .env*` when live credentials may be present. Check environment readiness
  with presence-only output such as `VAR=set` or `VAR=missing`; docs and logs may
  name required variables but must never include tokens, passwords, service-role
  keys, anon keys, or access tokens.

Verification:
- Run the most focused relevant tests for the unit.
- Before marking a queue unit complete, run:
  `npm run typecheck -- --diagnostics`
  `npx vitest run --reporter=dot`
- For UI units, add/run the relevant Playwright smoke when the workflow exists.
  If browser binaries or live services are unavailable, record the exact blocker
  in BUILD_LOOP_STATE.md and do not mark the completion checklist item done.

When the unit is done:
- Update BUILD_LOOP_STATE.md: tick the unit, refresh Next Unit, append a concise
  iteration note with changed files and verification.
- If every queue unit is done AND the completion checklist holds, make the FIRST
  LINE of BUILD_LOOP_STATE.md exactly:
  BUILD COMPLETE
EOF

if head -n 1 "$STATE" | grep -qx "BUILD COMPLETE"; then
  echo "Build loop is already complete."
  exit 0
fi

for ((i=1; i<=MAX_ITERS; i++)); do
  echo "=== build iteration $i ($(date '+%Y-%m-%dT%H:%M:%S%z')) ==="
  before="$(shasum "$STATE" | awk '{print $1}')"
  last_message="$LOG_DIR/iter-$i.last.md"

  codex_args=(
    --ask-for-approval never
    -c "model_reasoning_effort=\"$CODEX_REASONING_EFFORT\""
  )
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

  if head -n 1 "$STATE" | grep -qx "BUILD COMPLETE"; then
    echo "Build complete after $i iteration(s)."
    exit 0
  fi

  after="$(shasum "$STATE" | awk '{print $1}')"
  if [ "$after" = "$before" ]; then
    echo "BUILD_LOOP_STATE unchanged after iteration $i - stuck or blocked. Review $STATE and $LOG_DIR/iter-$i.log." >&2
    exit 1
  fi
done

echo "Hit MAX_ITERS ($MAX_ITERS) without completing. Review $STATE." >&2
exit 1
