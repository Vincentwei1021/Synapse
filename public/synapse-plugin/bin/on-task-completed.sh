#!/usr/bin/env bash
# on-task-completed.sh — TaskCompleted hook
# Triggered when a Claude Code task is marked completed.
# Checks for a Synapse task UUID in the task metadata/description (synapse:task:<uuid>).
# If found, checks out the session from that task via MCP.
#
# Output: JSON with systemMessage (user) when a checkout happens

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

# Extract task info
TASK_DESCRIPTION=$(echo "$EVENT" | jq -r '.task_description // .taskDescription // .description // empty' 2>/dev/null) || true
TASK_SUBJECT=$(echo "$EVENT" | jq -r '.task_subject // .taskSubject // .subject // empty' 2>/dev/null) || true
AGENT_ID=$(echo "$EVENT" | jq -r '.agent_id // .agentId // empty' 2>/dev/null) || true

# Look for synapse:task:<uuid> pattern in description or subject
SYNAPSE_TASK_UUID=""

for text in "$TASK_DESCRIPTION" "$TASK_SUBJECT"; do
  if [ -n "$text" ]; then
    MATCH=$(echo "$text" | grep -oP 'synapse:task:([0-9a-f-]{36})' | head -1 | sed 's/synapse:task://') || true
    if [ -n "$MATCH" ]; then
      SYNAPSE_TASK_UUID="$MATCH"
      break
    fi
  fi
done

if [ -z "$SYNAPSE_TASK_UUID" ]; then
  # No Synapse task linked — silent exit
  exit 0
fi

# Find the session for this agent
SESSION_UUID=""

if [ -n "$AGENT_ID" ]; then
  SESSION_UUID=$("$API" state-get "session_${AGENT_ID}" 2>/dev/null) || true
fi

if [ -n "$SESSION_UUID" ] && [ -n "$SYNAPSE_TASK_UUID" ]; then
  # Checkout from the Synapse task via MCP
  "$API" mcp-tool "synapse_session_checkout_task" \
    "$(printf '{"sessionUuid":"%s","taskUuid":"%s"}' "$SESSION_UUID" "$SYNAPSE_TASK_UUID")" \
    >/dev/null 2>&1 || {
    "$API" hook-output \
      "Synapse: failed to checkout from task ${SYNAPSE_TASK_UUID:0:8}..." \
      "WARNING: Failed to checkout from Synapse task ${SYNAPSE_TASK_UUID}." \
      "TaskCompleted"
    exit 0
  }

  "$API" hook-output \
    "Synapse: checked out from task ${SYNAPSE_TASK_UUID:0:8}..." \
    "Auto-checked out from Synapse task ${SYNAPSE_TASK_UUID} (via metadata bridge synapse:task:<uuid>)." \
    "TaskCompleted"
else
  # No session found — can't checkout
  exit 0
fi
