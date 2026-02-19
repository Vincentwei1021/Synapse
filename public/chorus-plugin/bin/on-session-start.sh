#!/usr/bin/env bash
# on-session-start.sh — SessionStart hook
# Triggered on Claude Code session startup/resume.
# Calls chorus_checkin via MCP to inject agent context.
# Also scans for pre-created session files (Plan A: sub-agent self-discovery).
#
# Output: JSON with systemMessage (user) + additionalContext (Claude)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/chorus-api.sh"

# Read event JSON from stdin (if available)
EVENT=""
if [ ! -t 0 ]; then
  EVENT=$(cat)
fi

# Check if Chorus environment is configured
if [ -z "${CHORUS_URL:-}" ] || [ -z "${CHORUS_API_KEY:-}" ]; then
  "$API" hook-output \
    "Chorus plugin: not configured (set CHORUS_URL and CHORUS_API_KEY)" \
    "Chorus environment not configured. Set CHORUS_URL and CHORUS_API_KEY to enable Chorus integration." \
    "SessionStart"
  exit 0
fi

# Call chorus_checkin via MCP
CHECKIN_RESULT=$("$API" mcp-tool "chorus_checkin" '{}' 2>/dev/null) || {
  "$API" hook-output \
    "Chorus plugin: connection failed (${CHORUS_URL})" \
    "WARNING: Unable to reach Chorus at ${CHORUS_URL}. Session lifecycle hooks will not function." \
    "SessionStart"
  exit 0
}

# Build context for Claude (additionalContext)
CONTEXT="# Chorus Plugin — Active

Chorus is connected at ${CHORUS_URL}.
Session lifecycle hooks are enabled: SubagentStart, SubagentStop, TeammateIdle, TaskCompleted.

## Checkin Result

${CHECKIN_RESULT}

## Session Management — IMPORTANT

The Chorus Plugin **fully automates** Chorus session lifecycle:
- Sub-agent spawn → Chorus session auto-created (or reused) + session file written to .chorus/sessions/<name>.json
- Teammate idle → Chorus session heartbeat (automatic)
- Sub-agent stop → auto checkout all tasks + Chorus session closed

**Do NOT call chorus_create_session or chorus_close_session for sub-agents.** The plugin handles this.
When spawning sub-agents, pass Chorus TASK UUIDs in the prompt — NOT session UUIDs.
Sub-agents discover their session UUID by reading .chorus/sessions/<their-name>.json.

For your own session (if you are a Developer agent working directly, not via sub-agents):
call chorus_list_sessions() first, then reopen or create as needed.

To link a Claude Code task to a Chorus task, include \`chorus:task:<uuid>\` in the task description."

# Check for existing state (resumed session)
MAIN_SESSION=$("$API" state-get "main_session_uuid" 2>/dev/null) || true
if [ -n "$MAIN_SESSION" ]; then
  CONTEXT="${CONTEXT}

Resuming with existing Chorus session: ${MAIN_SESSION}"
  "$API" mcp-tool "chorus_session_heartbeat" "$(printf '{"sessionUuid":"%s"}' "$MAIN_SESSION")" >/dev/null 2>&1 || true
fi

# Plan A: Session discovery for sub-agents
SESSIONS_DIR="${CLAUDE_PROJECT_DIR:-.}/.chorus/sessions"
if [ -d "$SESSIONS_DIR" ]; then
  SESSION_FILES=$(ls "$SESSIONS_DIR"/*.json 2>/dev/null) || true
  if [ -n "$SESSION_FILES" ]; then
    SESSION_LIST="

## Pre-assigned Chorus Sessions

The following Chorus sessions were auto-created by the plugin for sub-agents.
If you are a sub-agent, find your session by matching your agent name:
"
    for f in $SESSION_FILES; do
      BASENAME=$(basename "$f" .json)
      if command -v jq &>/dev/null; then
        S_UUID=$(jq -r '.sessionUuid // empty' "$f" 2>/dev/null) || true
        S_NAME=$(jq -r '.agentName // empty' "$f" 2>/dev/null) || true
      else
        S_UUID=$(grep -o '"sessionUuid":"[^"]*"' "$f" 2>/dev/null | cut -d'"' -f4) || true
        S_NAME="$BASENAME"
      fi
      if [ -n "$S_UUID" ]; then
        SESSION_LIST="${SESSION_LIST}
- **${S_NAME:-$BASENAME}**: sessionUuid = \`${S_UUID}\`"
      fi
    done
    SESSION_LIST="${SESSION_LIST}

Use your session UUID with \`chorus_session_checkin_task\`, \`chorus_report_work\`, etc."
    CONTEXT="${CONTEXT}${SESSION_LIST}"
  fi
fi

# Build user-visible message
USER_MSG="Chorus connected at ${CHORUS_URL}"
if [ -n "$MAIN_SESSION" ]; then
  USER_MSG="${USER_MSG} (resumed session)"
fi

"$API" hook-output "$USER_MSG" "$CONTEXT" "SessionStart"
