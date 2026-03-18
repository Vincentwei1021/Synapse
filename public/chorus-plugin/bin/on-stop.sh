#!/usr/bin/env bash
# on-stop.sh — Stop hook
# Triggered when the main agent (team lead) considers stopping.
# If the agent has admin role and there are Chorus tasks in to_verify status,
# blocks stopping and reminds the team lead to verify them first.
#
# Output: JSON with decision (approve/block) + reason + systemMessage

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/chorus-api.sh"

# Check environment — if Chorus not configured, don't interfere
if [ -z "${CHORUS_URL:-}" ] || [ -z "${CHORUS_API_KEY:-}" ]; then
  echo '{"decision":"approve"}'
  exit 0
fi

# Check if agent has admin role (cached by SessionStart hook)
AGENT_ROLES=$("$API" state-get "agent_roles" 2>/dev/null) || true

IS_ADMIN="false"
case ",$AGENT_ROLES," in
  *,admin_agent,*) IS_ADMIN="true" ;;
esac

if [ "$IS_ADMIN" != "true" ]; then
  # Not admin — don't interfere with stopping
  echo '{"decision":"approve"}'
  exit 0
fi

# Check if we have a project context (set by SessionStart or TaskCompleted)
PROJECT_UUID=$("$API" state-get "project_uuid" 2>/dev/null) || true

if [ -z "$PROJECT_UUID" ]; then
  # No project context — not in agent team scenario, don't block
  echo '{"decision":"approve"}'
  exit 0
fi

# Query for to_verify tasks in this project
TO_VERIFY_RESULT=$("$API" mcp-tool "chorus_list_tasks" \
  "$(printf '{"projectUuid":"%s","status":"to_verify"}' "$PROJECT_UUID")" 2>/dev/null) || true

if [ -z "$TO_VERIFY_RESULT" ]; then
  echo '{"decision":"approve"}'
  exit 0
fi

TO_VERIFY_COUNT=$(echo "$TO_VERIFY_RESULT" | jq -r '.total // 0' 2>/dev/null) || true

if [ "${TO_VERIFY_COUNT:-0}" -eq 0 ]; then
  echo '{"decision":"approve"}'
  exit 0
fi

# Build task list for the reminder
TASK_LIST=$(echo "$TO_VERIFY_RESULT" | jq -r '
  .tasks[] | "- \(.title) (uuid: \(.uuid), priority: \(.priority))"
' 2>/dev/null) || true

REASON="There are ${TO_VERIFY_COUNT} Chorus task(s) awaiting your verification."
SYS_MSG="Reminder: ${TO_VERIFY_COUNT} Chorus task(s) are awaiting verification:
${TASK_LIST}

You can verify with chorus_admin_verify_task or reopen with chorus_admin_reopen_task. Unverified tasks will remain in to_verify and block downstream dependencies."

# Output approve with reminder (don't block — human may have reasons to stop)
if command -v jq >/dev/null 2>&1; then
  jq -n \
    --arg decision "approve" \
    --arg reason "$REASON" \
    --arg sm "$SYS_MSG" \
    '{decision: $decision, reason: $reason, systemMessage: $sm}'
else
  # Fallback: manual JSON
  REASON_ESC="${REASON//\"/\\\"}"
  SYS_MSG_ESC="${SYS_MSG//\\/\\\\}"
  SYS_MSG_ESC="${SYS_MSG_ESC//\"/\\\"}"
  SYS_MSG_ESC="${SYS_MSG_ESC//$'\n'/\\n}"
  printf '{"decision":"approve","reason":"%s","systemMessage":"%s"}' "$REASON_ESC" "$SYS_MSG_ESC"
fi
