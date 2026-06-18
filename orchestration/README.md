# Cadenza Blueprint Orchestration

This folder lets Codex GPT-5.5 orchestrate Claude Opus medium as the lead builder for the app-wide Blueprint implementation and full Firebase-to-Supabase migration.

## Files

- `prompts/codex-gpt55-one-paste.md` — paste this into Codex to start orchestration.
- `prompts/claude-blueprint-build.md` — Claude's full end-to-end build prompt.
- `prompts/claude-agents.json` — named Claude subagents for architecture, data, UI, deterministic queries, QA, and review.
- `checklists/blueprint-acceptance.md` — Codex acceptance contract.
- `scripts/start-claude-blueprint.sh` — launches Claude with the build prompt and agents.
- `scripts/setup-supabase.sh` — runs Supabase login/init/link for project `mgkhhwzqpwfvresmmytc`.
- `scripts/continue-claude-blueprint.sh` — resumes Claude with a focused blocker prompt.
- `scripts/codex-blueprint-audit.sh` — writes build/status/coverage reports under `orchestration/reports/`.

## One-Paste Start

Open Codex CLI in this repo and paste the contents of:

```bash
/Users/noamlitt/Building/apps/cadenza/orchestration/prompts/codex-gpt55-one-paste.md
```

Codex should then launch Claude with:

```bash
bash orchestration/scripts/setup-supabase.sh
CLAUDE_MODEL=opus CLAUDE_EFFORT=medium bash orchestration/scripts/start-claude-blueprint.sh
```

## Manual Audit

```bash
bash orchestration/scripts/codex-blueprint-audit.sh
RUN_ALL_TESTS=1 bash orchestration/scripts/codex-blueprint-audit.sh
```

## Codex Planning Loop

The docs-only planning loop is driven by:

```bash
MAX_ITERS=1 ./plan-loop.sh   # first-iteration validation
./plan-loop.sh               # full loop, up to 40 iterations by default
```

It runs `codex exec` once per queue item, using
`docs/blueprint-planning/LOOP_STATE.md` as the cross-iteration state file. Logs are
written under `.plan-loop/` and are intentionally ignored by git. Optional
overrides: `CODEX_MODEL`, `CODEX_SANDBOX`, `CODEX_BIN`, `MAX_ITERS`.

## Manual Continue

```bash
bash orchestration/scripts/continue-claude-blueprint.sh <<'PROMPT'
Continue the Blueprint build. Do not re-plan. Fix these blockers next:
1. ...
2. ...
3. ...
PROMPT
```
