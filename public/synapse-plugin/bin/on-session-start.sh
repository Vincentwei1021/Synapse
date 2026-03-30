#!/usr/bin/env bash
# on-session-start.sh — SessionStart hook
# Triggered on Claude Code session startup/resume.
# Calls synapse_checkin via MCP to inject agent context.
# Also scans for existing session files (metadata for hook state lookup).
#
# Output: JSON with systemMessage (user) + additionalContext (Claude)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

# Read event JSON from stdin (if available)
EVENT=""
if [ ! -t 0 ]; then
  EVENT=$(cat)
fi

# Check if Synapse environment is configured
if [ -z "${SYNAPSE_URL:-}" ] || [ -z "${SYNAPSE_API_KEY:-}" ]; then
  "$API" hook-output \
    "Synapse plugin: not configured (set SYNAPSE_URL and SYNAPSE_API_KEY)" \
    "Synapse environment not configured. Set SYNAPSE_URL and SYNAPSE_API_KEY to enable Synapse integration." \
    "SessionStart"
  exit 0
fi

# Call synapse_checkin via MCP
CHECKIN_RESULT=$("$API" mcp-tool "synapse_checkin" '{}' 2>/dev/null) || {
  "$API" hook-output \
    "Synapse plugin: connection failed (${SYNAPSE_URL})" \
    "WARNING: Unable to reach Synapse at ${SYNAPSE_URL}. Session lifecycle hooks will not function." \
    "SessionStart"
  exit 0
}

# Store owner info from checkin for SubagentStart hook to inject into sub-agent context
if command -v jq >/dev/null 2>&1; then
  _OWNER_NAME=$(echo "$CHECKIN_RESULT" | jq -r '.agent.owner.name // empty' 2>/dev/null) || true
  _OWNER_EMAIL=$(echo "$CHECKIN_RESULT" | jq -r '.agent.owner.email // empty' 2>/dev/null) || true
  _OWNER_UUID=$(echo "$CHECKIN_RESULT" | jq -r '.agent.owner.uuid // empty' 2>/dev/null) || true
  if [ -n "$_OWNER_UUID" ]; then
    "$API" state-set "owner_name" "$_OWNER_NAME"
    "$API" state-set "owner_email" "$_OWNER_EMAIL"
    "$API" state-set "owner_uuid" "$_OWNER_UUID"
  fi

  # Cache agent roles for TaskCompleted and Stop hooks (e.g. "researcher_agent,research_lead_agent,pi_agent")
  _ROLES=$(echo "$CHECKIN_RESULT" | jq -r '.agent.roles | join(",") // empty' 2>/dev/null) || true
  if [ -n "$_ROLES" ]; then
    "$API" state-set "agent_roles" "$_ROLES"
  fi

  # Cache first assignment's projectUuid for Stop hook (to scope to_verify experiment run lookup)
  _PROJECT_UUID=$(echo "$CHECKIN_RESULT" | jq -r '
    (.assignments.tasks[0].project.uuid // .assignments.ideas[0].project.uuid) // empty
  ' 2>/dev/null) || true
  if [ -n "$_PROJECT_UUID" ]; then
    "$API" state-set "project_uuid" "$_PROJECT_UUID"
  fi
fi

# Build context for Claude (additionalContext)
CONTEXT="# Synapse Plugin — Active

Synapse is connected at ${SYNAPSE_URL}.
Session lifecycle hooks are enabled: SubagentStart, SubagentStop, TeammateIdle, TaskCompleted.

## Checkin Result

${CHECKIN_RESULT}

## Session Management — IMPORTANT

The Synapse Plugin **fully automates** Synapse session lifecycle:
- Sub-agent spawn → Synapse session auto-created (or reused) + session UUID and workflow auto-injected into sub-agent context
- Teammate idle → Synapse session heartbeat (automatic)
- Sub-agent stop → auto checkout all experiment runs + Synapse session closed

**Do NOT call synapse_create_session or synapse_close_session for sub-agents.** The plugin handles this.
When spawning sub-agents, just pass Synapse EXPERIMENT RUN UUIDs in the prompt. Session UUID + workflow are auto-injected by SubagentStart hook.

For your own session (if you are a Researcher agent working directly, not via sub-agents):
call synapse_list_sessions() first, then reopen or create as needed.

To link a Claude Code work item to a Synapse experiment run, include \`synapse:experiment_run:<uuid>\` in the description. Legacy \`synapse:task:<uuid>\` is also accepted.

## Notifications

When you or your sub-agents receive @mentions or other notifications:
- \`synapse_get_notifications()\` — fetches unread notifications and **auto-marks them as read**
- \`synapse_get_notifications({ autoMarkRead: false })\` — peek without marking read
- No need to call \`synapse_mark_notification_read\` separately after reading

## Project Groups

Projects are organized into Project Groups. Before creating a new project, call \`synapse_get_project_groups()\` to see existing groups and pass the \`groupUuid\` to \`synapse_admin_create_project()\` to assign the project to the correct group. Creating a project without specifying a group puts it in Ungrouped."

# Check for existing state (resumed session)
MAIN_SESSION=$("$API" state-get "main_session_uuid" 2>/dev/null) || true
if [ -n "$MAIN_SESSION" ]; then
  CONTEXT="${CONTEXT}

Resuming with existing Synapse session: ${MAIN_SESSION}"
  "$API" mcp-tool "synapse_session_heartbeat" "$(printf '{"sessionUuid":"%s"}' "$MAIN_SESSION")" >/dev/null 2>&1 || true
fi

# Plan A: Session discovery for sub-agents
SESSIONS_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse/sessions"
if [ -d "$SESSIONS_DIR" ]; then
  SESSION_FILES=$(ls "$SESSIONS_DIR"/*.json 2>/dev/null) || true
  if [ -n "$SESSION_FILES" ]; then
    SESSION_LIST="

## Pre-assigned Synapse Sessions

The following Synapse sessions were auto-created by the plugin for sub-agents.
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

Use your session UUID with \`synapse_session_checkin_experiment_run\`, \`synapse_report_work\`, etc."
    CONTEXT="${CONTEXT}${SESSION_LIST}"
  fi
fi

# Build user-visible message
USER_MSG="Synapse connected at ${SYNAPSE_URL}"
if [ -n "$MAIN_SESSION" ]; then
  USER_MSG="${USER_MSG} (resumed session)"
fi

"$API" hook-output "$USER_MSG" "$CONTEXT" "SessionStart"
