#!/usr/bin/env bash
# on-subagent-start.sh — SubagentStart hook
# Triggered SYNCHRONOUSLY when a sub-agent (teammate) is spawned.
#
# Session reuse logic:
#   1. List existing sessions via MCP
#   2. If a session with the same name exists and is active → reuse
#   3. If it exists but is closed → reopen
#   4. If not found → create new
#
# Writes a per-agent session file for sub-agent self-discovery (Plan A).
# Output: JSON with systemMessage (user) + additionalContext (Claude)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/chorus-api.sh"

# Check environment
if [ -z "${CHORUS_URL:-}" ] || [ -z "${CHORUS_API_KEY:-}" ]; then
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
# (PreToolUse:Task) and stored in .chorus/pending_names.
AGENT_ID=$(echo "$EVENT" | jq -r '.agent_id // .agentId // empty' 2>/dev/null) || true
AGENT_TYPE=$(echo "$EVENT" | jq -r '.agent_type // .agentType // empty' 2>/dev/null) || true

# Skip non-worker agent types (read-only agents don't need sessions)
case "${AGENT_TYPE,,}" in
  explore|plan|haiku|claude-code-guide|statusline-setup)
    exit 0
    ;;
esac

if [ -z "$AGENT_ID" ]; then
  exit 0
fi

# Resolve agent name from pending_names file (written by PreToolUse:Task hook).
# The file acts as a "was this spawn expected?" signal:
#   - If file is missing or empty → this is an internal/cleanup agent → skip
#   - Entry "?" means no name was provided → use fallback name
#   - Otherwise, try to match agent_type to a stored name, or FIFO
#
# CC may internally re-spawn agents during cleanup (e.g., TeamDelete).
# These bypass PreToolUse:Task, so no pending entry exists.
AGENT_NAME=""
PENDING_FILE="${CLAUDE_PROJECT_DIR:-.}/.chorus/pending_names"

if [ ! -f "$PENDING_FILE" ] || [ ! -s "$PENDING_FILE" ]; then
  # No pending spawn entry → internal/cleanup agent → skip session creation
  exit 0
fi

# Consume one entry from the pending file
# Strategy 1: agent_type matches a stored name exactly (CC uses name as agent_type)
if grep -qx "$AGENT_TYPE" "$PENDING_FILE" 2>/dev/null; then
  AGENT_NAME="$AGENT_TYPE"
else
  # Strategy 2: FIFO — pop the first line
  AGENT_NAME=$(head -1 "$PENDING_FILE")
fi

# Remove the consumed line (first occurrence only)
if [ -n "$AGENT_NAME" ]; then
  TEMP=$(mktemp)
  sed "0,/^$(printf '%s' "$AGENT_NAME" | sed 's/[.[\*^$/]/\\&/g')$/{//d}" "$PENDING_FILE" > "$TEMP" 2>/dev/null || true
  mv "$TEMP" "$PENDING_FILE"
  if [ ! -s "$PENDING_FILE" ]; then
    rm -f "$PENDING_FILE"
  fi
fi

# Handle "?" placeholder (name was not provided in Task tool call)
if [ "$AGENT_NAME" = "?" ]; then
  AGENT_NAME=""
fi

# Fallback: use agent_type + short ID if no name was captured
SESSION_NAME="${AGENT_NAME:-${AGENT_TYPE:-worker}-${AGENT_ID:0:8}}"

# === Session reuse: list existing sessions, find by name ===
SESSION_UUID=""
SESSION_ACTION=""  # "reused" | "reopened" | "created"

SESSIONS_LIST=$("$API" mcp-tool "chorus_list_sessions" '{}' 2>/dev/null) || true

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
        "$API" mcp-tool "chorus_session_heartbeat" \
          "$(printf '{"sessionUuid":"%s"}' "$SESSION_UUID")" >/dev/null 2>&1 || true
      elif [ "$MATCH_STATUS" = "closed" ] || [ "$MATCH_STATUS" = "inactive" ]; then
        # Closed/inactive session — reopen
        REOPEN_RESPONSE=$("$API" mcp-tool "chorus_reopen_session" \
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
  RESPONSE=$("$API" mcp-tool "chorus_create_session" \
    "$(printf '{"name":"%s","description":"Auto-created by Chorus plugin for sub-agent %s (type: %s)"}' \
      "$SESSION_NAME" "$AGENT_ID" "${AGENT_TYPE:-unknown}")" 2>/dev/null) || {
    "$API" hook-output \
      "Chorus: failed to create session for '${SESSION_NAME}'" \
      "WARNING: Failed to create Chorus session for sub-agent '${SESSION_NAME}'. Session lifecycle will not be tracked." \
      "SubagentStart"
    exit 0
  }

  SESSION_UUID=$(echo "$RESPONSE" | jq -r '.uuid // empty' 2>/dev/null) || true

  if [ -z "$SESSION_UUID" ]; then
    SESSION_UUID=$(echo "$RESPONSE" | grep -oP '"uuid"\s*:\s*"([0-9a-f-]{36})"' | head -1 | grep -oP '[0-9a-f-]{36}') || true
  fi

  if [ -z "$SESSION_UUID" ]; then
    "$API" hook-output \
      "Chorus: session for '${SESSION_NAME}' — UUID not found in response" \
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

# === Session file: write for sub-agent self-discovery (Plan A) ===
SESSIONS_DIR="${CLAUDE_PROJECT_DIR:-.}/.chorus/sessions"
mkdir -p "$SESSIONS_DIR"

cat > "${SESSIONS_DIR}/${SESSION_NAME}.json" <<EOF
{
  "sessionUuid": "${SESSION_UUID}",
  "agentId": "${AGENT_ID}",
  "agentName": "${SESSION_NAME}",
  "agentType": "${AGENT_TYPE:-unknown}",
  "chorusUrl": "${CHORUS_URL}",
  "sessionAction": "${SESSION_ACTION}",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# === Output ===
"$API" hook-output \
  "Chorus session ${SESSION_ACTION}: '${SESSION_NAME}' (${SESSION_UUID:0:8}...)" \
  "Chorus session ${SESSION_ACTION} for sub-agent '${SESSION_NAME}':
  Session UUID: ${SESSION_UUID}
  Action: ${SESSION_ACTION} (reused existing if name matched, reopened if closed, or created new)
  Session file: .chorus/sessions/${SESSION_NAME}.json

The sub-agent can discover its session by reading .chorus/sessions/${SESSION_NAME}.json" \
  "SubagentStart"
