#!/usr/bin/env bash
# on-subagent-stop.sh — SubagentStop hook
# Triggered when a sub-agent (teammate) exits.
# Closes the Synapse session and cleans up local plugin state.
#
# Output: JSON with systemMessage (user) + additionalContext (Claude)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

# Check environment
if [ -z "${SYNAPSE_URL:-}" ] || [ -z "${SYNAPSE_API_KEY:-}" ]; then
  exit 0
fi

# Read event JSON from stdin
EVENT=""
if [ ! -t 0 ]; then
  EVENT=$(cat)
fi

if [ -z "$EVENT" ]; then
  exit 0
fi

# Extract agent ID from event
# Note: SubagentStop only provides agent_id and agent_type — NOT the name.
# We look up the name from state (stored by SubagentStart).
AGENT_ID=$(echo "$EVENT" | jq -r '.agent_id // .agentId // empty' 2>/dev/null) || true

if [ -z "$AGENT_ID" ]; then
  exit 0
fi

# Lookup session UUID and agent name from state
SESSION_UUID=$("$API" state-get "session_${AGENT_ID}" 2>/dev/null) || true
AGENT_NAME=$("$API" state-get "name_for_agent_${AGENT_ID}" 2>/dev/null) || true

if [ -z "$SESSION_UUID" ]; then
  exit 0
fi

# Close the Synapse session via MCP
CLOSE_OK=true
"$API" mcp-tool "synapse_close_session" "$(printf '{"sessionUuid":"%s"}' "$SESSION_UUID")" >/dev/null 2>&1 || CLOSE_OK=false

# Clean up state
"$API" state-delete "session_${AGENT_ID}" 2>/dev/null || true
"$API" state-delete "agent_for_session_${SESSION_UUID}" 2>/dev/null || true
"$API" state-delete "name_for_agent_${AGENT_ID}" 2>/dev/null || true
if [ -n "$AGENT_NAME" ]; then
  "$API" state-delete "session_${AGENT_NAME}" 2>/dev/null || true
fi

# Clean up session file
SESSIONS_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse/sessions"
if [ -n "$AGENT_NAME" ] && [ -f "${SESSIONS_DIR}/${AGENT_NAME}.json" ]; then
  rm -f "${SESSIONS_DIR}/${AGENT_NAME}.json"
fi

# Clean up claimed file (written by SubagentStart)
CLAIMED_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse/claimed"
if [ -n "$AGENT_ID" ] && [ -f "${CLAIMED_DIR}/${AGENT_ID}" ]; then
  rm -f "${CLAIMED_DIR}/${AGENT_ID}"
fi

# === Output ===
DISPLAY_NAME="${AGENT_NAME:-${AGENT_ID:0:8}}"
if [ "$CLOSE_OK" = true ]; then
  USER_MSG="Synapse session closed: '${DISPLAY_NAME}'"
  CONTEXT_MSG="Synapse session ${SESSION_UUID} for sub-agent '${DISPLAY_NAME}' closed. Local state and session file cleaned up."
  "$API" hook-output "$USER_MSG" "$CONTEXT_MSG" "SubagentStop"
else
  "$API" hook-output \
    "Synapse: failed to close session for '${DISPLAY_NAME}'" \
    "WARNING: Failed to close Synapse session ${SESSION_UUID} for sub-agent '${DISPLAY_NAME}'. State cleaned up locally." \
    "SubagentStop"
fi
