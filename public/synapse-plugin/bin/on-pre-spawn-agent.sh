#!/usr/bin/env bash
# on-pre-spawn-agent.sh — PreToolUse hook for Task (spawning sub-agents)
# 1. Captures agent name + type from tool_input and writes a per-agent pending file
#    (SubagentStart will claim this file atomically via mv)
# 2. Reminds Team Lead to pass Synapse experiment UUIDs to sub-agents.
#
# Concurrency safety: Each PreToolUse writes a separate file under .synapse/pending/
# so parallel spawns never contend on a shared file. SubagentStart claims files
# atomically with mv (only one process can successfully mv a given file).
#
# Output: JSON with additionalContext

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

# Read event from stdin to check agent type
EVENT=""
if [ ! -t 0 ]; then
  EVENT=$(cat)
fi

if [ -z "${SYNAPSE_URL:-}" ] || [ -z "${SYNAPSE_API_KEY:-}" ]; then
  exit 0
fi

SYNAPSE_HOOK_LOG_FILE=$("$API" log-init "PreToolUse:Task" "$EVENT") || SYNAPSE_HOOK_LOG_FILE=""
export SYNAPSE_HOOK_LOG_FILE
export SYNAPSE_HOOK_NAME="PreToolUse:Task"

# Try to extract subagent_type and name from the tool input
AGENT_TYPE=""
AGENT_NAME=""
if [ -n "$EVENT" ]; then
  AGENT_TYPE=$(echo "$EVENT" | jq -r '.tool_input.subagent_type // .input.subagent_type // empty' 2>/dev/null) || true
  AGENT_NAME=$(echo "$EVENT" | jq -r '.tool_input.name // .input.name // empty' 2>/dev/null) || true
fi

# Skip non-worker types — no need to remind for Explore/Plan agents
case "$(printf '%s' "$AGENT_TYPE" | tr '[:upper:]' '[:lower:]')" in
  explore|plan|haiku|claude-code-guide|statusline-setup)
    exit 0
    ;;
esac

safe_file_component() {
  local raw="$1"
  local safe
  safe=$(printf '%s' "$raw" | tr -c 'A-Za-z0-9._-' '_' | sed 's/^_*//; s/_*$//')
  if [ -z "$safe" ]; then
    safe="agent"
  fi
  printf '%s' "${safe:0:80}"
}

short_hash() {
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum | awk '{print substr($1,1,12)}'
  elif command -v sha1sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha1sum | awk '{print substr($1,1,12)}'
  else
    date +%s
  fi
}

# Write a per-agent pending file for SubagentStart to claim.
# SubagentStart only receives agent_id + agent_type — not the name.
# CC sometimes uses the agent name as agent_type, so we store both.
#
# Each spawn gets its own file — no shared state, no concurrency issues.
# File name is the agent name (or a unique fallback if name is empty).
# SubagentStart claims by mv (atomic on same filesystem).
#
# CC may internally spawn cleanup agents that bypass PreToolUse:Task —
# SubagentStart skips those if no pending file matches.
PENDING_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse/pending"
mkdir -p "$PENDING_DIR"

# Use the raw name as the filename only when it is already path-safe and not
# colliding. Otherwise use a sanitized component plus a short hash; the original
# name is preserved inside the JSON payload.
RAW_PENDING_NAME="${AGENT_NAME:-unknown-$(date +%s)}"
if printf '%s' "$RAW_PENDING_NAME" | grep -Eq '^[A-Za-z0-9._-]+$' \
  && [ ! -e "${PENDING_DIR}/${RAW_PENDING_NAME}" ]; then
  PENDING_NAME="$RAW_PENDING_NAME"
else
  SAFE_BASE=$(safe_file_component "$RAW_PENDING_NAME")
  PENDING_NAME="${SAFE_BASE}-$(date +%s)-$(short_hash "$RAW_PENDING_NAME")"
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
TMP_FILE=$(mktemp "${PENDING_DIR}/.pending.XXXXXX")
if command -v jq >/dev/null 2>&1; then
  jq -n \
    --arg name "${AGENT_NAME:-}" \
    --arg type "${AGENT_TYPE:-}" \
    --arg ts "$TS" \
    '{name: $name, type: $type, ts: $ts}' > "$TMP_FILE"
else
  printf '{"name":"","type":"","ts":"%s"}\n' "$TS" > "$TMP_FILE"
fi
mv "$TMP_FILE" "${PENDING_DIR}/${PENDING_NAME}"

CONTEXT="[Synapse Plugin — Sub-agent Spawn]
Session auto-managed by plugin. Do NOT call synapse_create_session.
Pass the Synapse experiment UUID in the sub-agent prompt. Current Experiment workflow instructions will be auto-injected by the SubagentStart hook."

"$API" hook-output "" "$CONTEXT" "PreToolUse"
