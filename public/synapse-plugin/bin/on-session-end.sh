#!/usr/bin/env bash
# on-session-end.sh — SessionEnd hook
# Fires when Claude Code session ends.
# Best-effort closes any sub-agent sessions that did not get a SubagentStop
# (hard CC exits, Ctrl+D, crash) so they don't sit "active" in Synapse for an
# hour waiting for heartbeat timeout. Then cleans up .synapse/ when safe.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"
STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse"

# Capture the stdin event for optional debug logging
EVENT=""
if [ ! -t 0 ]; then
  EVENT=$(cat)
fi
SYNAPSE_HOOK_LOG_FILE=$("$API" log-init "SessionEnd" "$EVENT") || SYNAPSE_HOOK_LOG_FILE=""
export SYNAPSE_HOOK_LOG_FILE
export SYNAPSE_HOOK_NAME="SessionEnd"

# Nothing to clean up
if [ ! -d "$STATE_DIR" ]; then
  exit 0
fi

SESSIONS_DIR="${STATE_DIR}/sessions"

# Best-effort: close any leftover sub-agent sessions if Synapse is reachable.
# Skipped silently when env is missing — local cleanup still runs below.
if [ -n "${SYNAPSE_URL:-}" ] && [ -n "${SYNAPSE_API_KEY:-}" ] && [ -d "$SESSIONS_DIR" ]; then
  for f in "$SESSIONS_DIR"/*.json; do
    [ -f "$f" ] || continue
    if command -v jq >/dev/null 2>&1; then
      LEFTOVER_UUID=$(jq -r '.sessionUuid // empty' "$f" 2>/dev/null) || LEFTOVER_UUID=""
    else
      LEFTOVER_UUID=$(grep -o '"sessionUuid":"[^"]*"' "$f" 2>/dev/null | cut -d'"' -f4) || LEFTOVER_UUID=""
    fi
    if [ -n "$LEFTOVER_UUID" ]; then
      "$API" mcp-tool "synapse_close_session" \
        "$(printf '{"sessionUuid":"%s"}' "$LEFTOVER_UUID")" >/dev/null 2>&1 || true
    fi
    rm -f "$f"
  done
fi

# Clean up only the artifacts this plugin created. NEVER `rm -rf` $STATE_DIR
# itself — when CLAUDE_PROJECT_DIR is the user's home (e.g. claude code launched
# from ~), $STATE_DIR resolves to ~/.synapse, which is also where the Synapse
# CLI stores its persistent PGlite database (~/.synapse/data). Wiping that
# directory destroys the user's database.

# Remove our session JSONs only if no live ones remain (ones we couldn't close).
if [ -d "$SESSIONS_DIR" ]; then
  REMAINING=0
  for f in "$SESSIONS_DIR"/*.json; do
    [ -f "$f" ] || continue
    REMAINING=$((REMAINING + 1))
  done
  if [ "$REMAINING" -eq 0 ]; then
    rmdir "$SESSIONS_DIR" 2>/dev/null || true
  fi
fi

# Remove our state.json if it's empty ({}). Never touch siblings.
if [ -f "${STATE_DIR}/state.json" ]; then
  if command -v jq >/dev/null 2>&1; then
    KEY_COUNT=$(jq 'length' "${STATE_DIR}/state.json" 2>/dev/null) || KEY_COUNT=1
    if [ "$KEY_COUNT" -eq 0 ]; then
      rm -f "${STATE_DIR}/state.json"
    fi
  fi
fi

# Best-effort: drop the .synapse directory only if it's now completely empty.
# Use rmdir (fails if non-empty) — never rm -rf — so any user data, CLI db,
# or unrelated tooling living in this directory is preserved.
rmdir "$STATE_DIR" 2>/dev/null || true
