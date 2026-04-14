#!/usr/bin/env bash
# on-subagent-start.sh — SubagentStart hook
# Triggered SYNCHRONOUSLY when a sub-agent (teammate) is spawned.
#
# Name resolution: Claims a per-agent pending file written by PreToolUse:Task
# using atomic mv (only one process can successfully mv a given file).
#
# Session reuse logic:
#   1. List existing sessions via MCP
#   2. If a session with the same name exists and is active → reuse
#   3. If it exists but is closed → reopen
#   4. If not found → create new
#
# Writes minimal session metadata file for other hooks (TeammateIdle, SubagentStop).
# Injects session UUID + workflow directly into sub-agent context via additionalContext.
# Output: JSON with systemMessage (user) + additionalContext (sub-agent)

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

# Extract agent info from event
# Note: SubagentStart only provides agent_id and agent_type — NOT the name
# from the Task tool call. The name is captured by on-pre-spawn-agent.sh
# (PreToolUse:Task) and stored as a per-agent file in .synapse/pending/.
AGENT_ID=$(echo "$EVENT" | jq -r '.agent_id // .agentId // empty' 2>/dev/null) || true
AGENT_TYPE=$(echo "$EVENT" | jq -r '.agent_type // .agentType // empty' 2>/dev/null) || true

# Skip non-worker agent types (read-only agents don't need sessions)
case "$(printf '%s' "$AGENT_TYPE" | tr '[:upper:]' '[:lower:]')" in
  explore|plan|haiku|claude-code-guide|statusline-setup)
    exit 0
    ;;
esac

if [ -z "$AGENT_ID" ]; then
  exit 0
fi

# Claim a pending file written by PreToolUse:Task (on-pre-spawn-agent.sh).
# Each pending file represents one expected sub-agent spawn.
#
# Claim strategy (atomic mv — only one process can succeed per file):
#   1. Try exact match: mv .synapse/pending/{agent_type} → claimed/{agent_id}
#      (CC often sets agent_type to the name from the Task tool call)
#   2. Fallback: claim the oldest pending file (FIFO by modification time)
#
# If no pending file exists, this is an internal/cleanup agent → skip.
AGENT_NAME=""
PENDING_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse/pending"
CLAIMED_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse/claimed"
mkdir -p "$CLAIMED_DIR"

CLAIMED_FILE=""

# Strategy 1: exact match by agent_type (CC uses name as agent_type)
if [ -f "${PENDING_DIR}/${AGENT_TYPE}" ]; then
  if mv "${PENDING_DIR}/${AGENT_TYPE}" "${CLAIMED_DIR}/${AGENT_ID}" 2>/dev/null; then
    CLAIMED_FILE="${CLAIMED_DIR}/${AGENT_ID}"
    AGENT_NAME="$AGENT_TYPE"
  fi
fi

# Strategy 2: FIFO — claim oldest pending file
if [ -z "$CLAIMED_FILE" ] && [ -d "$PENDING_DIR" ]; then
  for candidate in $(ls -tr "$PENDING_DIR" 2>/dev/null); do
    if mv "${PENDING_DIR}/${candidate}" "${CLAIMED_DIR}/${AGENT_ID}" 2>/dev/null; then
      CLAIMED_FILE="${CLAIMED_DIR}/${AGENT_ID}"
      # Read name from file content if available
      FILE_NAME=$(jq -r '.name // empty' "$CLAIMED_FILE" 2>/dev/null) || true
      AGENT_NAME="${FILE_NAME:-$candidate}"
      break
    fi
    # mv failed → another process claimed it first, try next
  done
fi

# No pending file claimed → internal/cleanup agent → skip session creation
if [ -z "$CLAIMED_FILE" ]; then
  exit 0
fi

# Fallback: use agent_type + short ID if no name was captured
SESSION_NAME="${AGENT_NAME:-${AGENT_TYPE:-worker}-${AGENT_ID:0:8}}"

# === Session reuse: list existing sessions, find by name ===
SESSION_UUID=""
SESSION_ACTION=""  # "reused" | "reopened" | "created"

SESSIONS_LIST=$("$API" mcp-tool "synapse_list_sessions" '{}' 2>/dev/null) || true

if [ -n "$SESSIONS_LIST" ]; then
  # Find a session with matching name
  # The list may be an array or an object with a sessions array
  MATCH=$(echo "$SESSIONS_LIST" | jq -r --arg name "$SESSION_NAME" '
    (if type == "array" then . else (.sessions // []) end)
    | map(select(.name == $name))
    | sort_by(.updatedAt // .createdAt)
    | last
    // empty
  ' 2>/dev/null) || true

  if [ -n "$MATCH" ] && [ "$MATCH" != "null" ]; then
    MATCH_UUID=$(echo "$MATCH" | jq -r '.uuid // empty' 2>/dev/null) || true
    MATCH_STATUS=$(echo "$MATCH" | jq -r '.status // empty' 2>/dev/null) || true

    if [ -n "$MATCH_UUID" ]; then
      if [ "$MATCH_STATUS" = "active" ]; then
        # Active session found — reuse directly
        SESSION_UUID="$MATCH_UUID"
        SESSION_ACTION="reused"
        # Send heartbeat to refresh lastActiveAt
        "$API" mcp-tool "synapse_session_heartbeat" \
          "$(printf '{"sessionUuid":"%s"}' "$SESSION_UUID")" >/dev/null 2>&1 || true
      elif [ "$MATCH_STATUS" = "closed" ] || [ "$MATCH_STATUS" = "inactive" ]; then
        # Closed/inactive session — reopen
        REOPEN_RESPONSE=$("$API" mcp-tool "synapse_reopen_session" \
          "$(printf '{"sessionUuid":"%s"}' "$MATCH_UUID")" 2>/dev/null) || true
        REOPEN_UUID=$(echo "$REOPEN_RESPONSE" | jq -r '.uuid // empty' 2>/dev/null) || true
        if [ -n "$REOPEN_UUID" ]; then
          SESSION_UUID="$REOPEN_UUID"
          SESSION_ACTION="reopened"
        fi
      fi
    fi
  fi
fi

# === No existing session found — create new ===
if [ -z "$SESSION_UUID" ]; then
  RESPONSE=$("$API" mcp-tool "synapse_create_session" \
    "$(printf '{"name":"%s","description":"Auto-created by Synapse plugin for sub-agent %s (type: %s)"}' \
      "$SESSION_NAME" "$AGENT_ID" "${AGENT_TYPE:-unknown}")" 2>/dev/null) || {
    "$API" hook-output \
      "Synapse: failed to create session for '${SESSION_NAME}'" \
      "WARNING: Failed to create Synapse session for sub-agent '${SESSION_NAME}'. Session lifecycle will not be tracked." \
      "SubagentStart"
    exit 0
  }

  SESSION_UUID=$(echo "$RESPONSE" | jq -r '.uuid // empty' 2>/dev/null) || true

  if [ -z "$SESSION_UUID" ]; then
    SESSION_UUID=$(echo "$RESPONSE" | grep -oP '"uuid"\s*:\s*"([0-9a-f-]{36})"' | head -1 | grep -oP '[0-9a-f-]{36}') || true
  fi

  if [ -z "$SESSION_UUID" ]; then
    "$API" hook-output \
      "Synapse: session for '${SESSION_NAME}' — UUID not found in response" \
      "WARNING: Could not extract session UUID from response for sub-agent '${SESSION_NAME}'." \
      "SubagentStart"
    exit 0
  fi

  SESSION_ACTION="created"
fi

# === State: store mapping for other hooks (TeammateIdle, SubagentStop) ===
"$API" state-set "session_${AGENT_ID}" "$SESSION_UUID"
"$API" state-set "agent_for_session_${SESSION_UUID}" "$AGENT_ID"
"$API" state-set "session_${SESSION_NAME}" "$SESSION_UUID"
"$API" state-set "name_for_agent_${AGENT_ID}" "$SESSION_NAME"

# === Session file: minimal metadata for other hooks (TeammateIdle, SubagentStop) ===
SESSIONS_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse/sessions"
mkdir -p "$SESSIONS_DIR"

cat > "${SESSIONS_DIR}/${SESSION_NAME}.json" <<SESSIONEOF
{
  "sessionUuid": "${SESSION_UUID}",
  "agentId": "${AGENT_ID}",
  "agentName": "${SESSION_NAME}",
  "agentType": "${AGENT_TYPE:-unknown}",
  "sessionAction": "${SESSION_ACTION}",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
SESSIONEOF

# === Owner info: read from state (stored by on-session-start.sh from checkin response) ===
OWNER_SECTION=""
OWNER_UUID=$("$API" state-get "owner_uuid" 2>/dev/null) || true
if [ -n "$OWNER_UUID" ]; then
  OWNER_NAME=$("$API" state-get "owner_name" 2>/dev/null) || true
  OWNER_EMAIL=$("$API" state-get "owner_email" 2>/dev/null) || true
  OWNER_SECTION="
## Owner Info

Your owner (the human who created your API key): ${OWNER_NAME} (${OWNER_EMAIL}), UUID: ${OWNER_UUID}
Use this info when you need to @mention your owner in comments."
fi

# === Output: inject workflow directly into sub-agent context via additionalContext ===
WORKFLOW="## Synapse Session (Auto-injected by plugin)

Your Synapse session UUID is: ${SESSION_UUID}
Your session name is: ${SESSION_NAME}
The plugin manages session lifecycle (heartbeat, close). Do NOT call synapse_create_session or synapse_close_session.

### Workflow — follow these steps for each assigned experiment:

**Before starting:**
1. Read the experiment: synapse_get_experiment({ experimentUuid: \"<EXPERIMENT_UUID>\" })
2. If the experiment is ready to execute, start it: synapse_start_experiment({ experimentUuid: \"<EXPERIMENT_UUID>\" })

**While working:**
3. Report major milestones with synapse_report_experiment_progress({ experimentUuid: \"<EXPERIMENT_UUID>\", message: \"...\", phase: \"setup|training|evaluation|analysis\" })
4. Add comments for durable decisions or findings with synapse_add_comment({ targetType: \"experiment\", targetUuid: \"<EXPERIMENT_UUID>\", content: \"...\" })

**After completing:**
5. Submit the outcome with synapse_submit_experiment_results({ experimentUuid: \"<EXPERIMENT_UUID>\", outcome: \"success|failure|inconclusive\", experimentResults: \"...\" })

Replace <EXPERIMENT_UUID> with the actual Synapse experiment UUID from your prompt.${OWNER_SECTION}"

"$API" hook-output \
  "Synapse session ${SESSION_ACTION}: '${SESSION_NAME}' (${SESSION_UUID:0:8}...)" \
  "$WORKFLOW" \
  "SubagentStart"
