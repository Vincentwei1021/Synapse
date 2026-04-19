#!/usr/bin/env bash
# on-session-end.sh — SessionEnd hook
# Fires when Claude Code session ends.
# Cleans up the .synapse/ directory if all sessions are closed and state is empty.

set -euo pipefail

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse"

# Nothing to clean up
if [ ! -d "$STATE_DIR" ]; then
  exit 0
fi

# Safety check: don't delete if there are still active session files
SESSIONS_DIR="${STATE_DIR}/sessions"
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
