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

# Re-check after best-effort cleanup: anything left we shouldn't blow away?
if [ -d "$SESSIONS_DIR" ]; then
  REMAINING=0
  for f in "$SESSIONS_DIR"/*.json; do
    [ -f "$f" ] || continue
    REMAINING=$((REMAINING + 1))
  done
  if [ "$REMAINING" -gt 0 ]; then
    exit 0
  fi
fi

# Safety check: don't delete if state.json has meaningful content
if [ -f "${STATE_DIR}/state.json" ]; then
  if command -v jq &>/dev/null; then
    KEY_COUNT=$(jq 'length' "${STATE_DIR}/state.json" 2>/dev/null) || KEY_COUNT=0
    if [ "$KEY_COUNT" -gt 0 ]; then
      exit 0
    fi
  fi
fi

# All clear — remove .synapse/ directory
rm -rf "$STATE_DIR"
