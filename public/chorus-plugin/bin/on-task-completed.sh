#!/usr/bin/env bash
# on-task-completed.sh — TaskCompleted hook
# Triggered when a Claude Code task is marked completed (runs in team lead context).
# Checks for a Chorus task UUID in the task metadata/description (chorus:task:<uuid>).
# If found:
#   1. Checks out the session from that task
#   2. If the Chorus task is in to_verify status and team lead has admin role:
#      - AC all passed → auto-verify via chorus_admin_verify_task
#      - Otherwise → inject systemMessage reminding team lead to manually verify
#   3. Shows blocked downstream tasks count and titles
#
# Output: JSON with systemMessage (user) when a checkout/verify happens

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

# Extract task info
TASK_DESCRIPTION=$(echo "$EVENT" | jq -r '.task_description // .taskDescription // .description // empty' 2>/dev/null) || true
TASK_SUBJECT=$(echo "$EVENT" | jq -r '.task_subject // .taskSubject // .subject // empty' 2>/dev/null) || true
AGENT_ID=$(echo "$EVENT" | jq -r '.agent_id // .agentId // empty' 2>/dev/null) || true

# Look for chorus:task:<uuid> pattern in description or subject
CHORUS_TASK_UUID=""

for text in "$TASK_DESCRIPTION" "$TASK_SUBJECT"; do
  if [ -n "$text" ]; then
    MATCH=$(echo "$text" | grep -oP 'chorus:task:([0-9a-f-]{36})' | head -1 | sed 's/chorus:task://') || true
    if [ -n "$MATCH" ]; then
      CHORUS_TASK_UUID="$MATCH"
      break
    fi
  fi
done

if [ -z "$CHORUS_TASK_UUID" ]; then
  # No Chorus task linked — silent exit
  exit 0
fi

# Find the session for this agent
SESSION_UUID=""

if [ -n "$AGENT_ID" ]; then
  SESSION_UUID=$("$API" state-get "session_${AGENT_ID}" 2>/dev/null) || true
fi

# === Checkout from Chorus task (existing behavior) ===
if [ -n "$SESSION_UUID" ] && [ -n "$CHORUS_TASK_UUID" ]; then
  "$API" mcp-tool "chorus_session_checkout_task" \
    "$(printf '{"sessionUuid":"%s","taskUuid":"%s"}' "$SESSION_UUID" "$CHORUS_TASK_UUID")" \
    >/dev/null 2>&1 || true
fi

# === Fetch Chorus task details ===
TASK_DETAIL=$("$API" mcp-tool "chorus_get_task" "$(printf '{"taskUuid":"%s"}' "$CHORUS_TASK_UUID")" 2>/dev/null) || true

if [ -z "$TASK_DETAIL" ]; then
  # Can't fetch task — just report checkout
  DISPLAY_NAME="${AGENT_ID:0:8}"
  "$API" hook-output \
    "Chorus: checked out from task ${CHORUS_TASK_UUID:0:8}..." \
    "Auto-checked out from Chorus task ${CHORUS_TASK_UUID}." \
    "TaskCompleted"
  exit 0
fi

TASK_STATUS=$(echo "$TASK_DETAIL" | jq -r '.status // empty' 2>/dev/null) || true
TASK_TITLE=$(echo "$TASK_DETAIL" | jq -r '.title // empty' 2>/dev/null) || true

# Cache project_uuid for Stop hook
TASK_PROJECT_UUID=$(echo "$TASK_DETAIL" | jq -r '.project.uuid // empty' 2>/dev/null) || true
if [ -n "$TASK_PROJECT_UUID" ]; then
  "$API" state-set "project_uuid" "$TASK_PROJECT_UUID" 2>/dev/null || true
fi

# === Verify reminder logic (only for to_verify tasks) ===
if [ "$TASK_STATUS" = "to_verify" ]; then
  # Read cached agent roles
  AGENT_ROLES=$("$API" state-get "agent_roles" 2>/dev/null) || true
  IS_ADMIN="false"

  # Check if roles contain admin_agent
  case ",$AGENT_ROLES," in
    *,admin_agent,*) IS_ADMIN="true" ;;
  esac

  # Check downstream dependencies (dependedBy)
  DOWNSTREAM_INFO=""
  DEPENDED_BY_COUNT=$(echo "$TASK_DETAIL" | jq -r '.dependedBy | length // 0' 2>/dev/null) || true
  if [ "${DEPENDED_BY_COUNT:-0}" -gt 0 ]; then
    DEPENDED_BY_LIST=$(echo "$TASK_DETAIL" | jq -r '
      .dependedBy[] | "  - \(.title) (\(.status))"
    ' 2>/dev/null) || true
    DOWNSTREAM_INFO="
Verifying this task will unblock ${DEPENDED_BY_COUNT} downstream task(s):
${DEPENDED_BY_LIST}"
  fi

  if [ "$IS_ADMIN" = "true" ]; then
    # Two-layer verification:
    #   devStatus  = developer self-check (marked by sub-agent)
    #   status     = admin verification (marked by human/admin after review)
    # NEVER auto-mark admin criteria — that defeats the purpose of dual verification.

    AC_TOTAL=$(echo "$TASK_DETAIL" | jq -r '.acceptanceSummary.required // 0' 2>/dev/null) || true
    ADMIN_PASSED=$(echo "$TASK_DETAIL" | jq -r '.acceptanceSummary.requiredPassed // 0' 2>/dev/null) || true
    DEV_PASSED=$(echo "$TASK_DETAIL" | jq -r '
      [.acceptanceCriteriaItems[]? | select(.required == true and .devStatus == "passed")] | length
    ' 2>/dev/null) || true

    # Case 1: Admin already reviewed all criteria (but forgot to call verify_task)
    if [ "${AC_TOTAL:-0}" -gt 0 ] && [ "$AC_TOTAL" = "$ADMIN_PASSED" ]; then
      VERIFY_RESULT=$("$API" mcp-tool "chorus_admin_verify_task" \
        "$(printf '{"taskUuid":"%s"}' "$CHORUS_TASK_UUID")" 2>/dev/null) || true

      VERIFY_STATUS=$(echo "$VERIFY_RESULT" | jq -r '.status // empty' 2>/dev/null) || true

      if [ "$VERIFY_STATUS" = "done" ]; then
        "$API" hook-output \
          "Chorus: auto-verified task '${TASK_TITLE}' (admin AC all passed)" \
          "Task '${TASK_TITLE}' (${CHORUS_TASK_UUID}) — all required acceptance criteria were already admin-verified. Auto-called chorus_admin_verify_task to move to done.${DOWNSTREAM_INFO}" \
          "TaskCompleted"
      else
        "$API" hook-output \
          "Chorus: auto-verify failed for '${TASK_TITLE}'" \
          "All admin AC are passed but chorus_admin_verify_task failed for '${TASK_TITLE}' (${CHORUS_TASK_UUID}). Please verify manually.${DOWNSTREAM_INFO}" \
          "TaskCompleted"
      fi

    # Case 2: Dev self-check all passed, but admin hasn't reviewed yet → remind
    elif [ "${AC_TOTAL:-0}" -gt 0 ] && [ "${DEV_PASSED:-0}" = "$AC_TOTAL" ]; then
      "$API" hook-output \
        "Chorus: task '${TASK_TITLE}' ready for your review" \
        "ACTION REQUIRED: Task '${TASK_TITLE}' (${CHORUS_TASK_UUID}) — dev self-check passed all ${AC_TOTAL} required criteria (admin verified: ${ADMIN_PASSED}/${AC_TOTAL}). Please review each criterion with chorus_get_task, mark them with chorus_mark_acceptance_criteria, then call chorus_admin_verify_task.${DOWNSTREAM_INFO}" \
        "TaskCompleted"

    # Case 3: Dev self-check incomplete → warn, likely needs reopen
    elif [ "${AC_TOTAL:-0}" -gt 0 ]; then
      "$API" hook-output \
        "Chorus: task '${TASK_TITLE}' — dev self-check INCOMPLETE (${DEV_PASSED}/${AC_TOTAL})" \
        "WARNING: Task '${TASK_TITLE}' (${CHORUS_TASK_UUID}) was submitted for verify but dev self-check only passed ${DEV_PASSED}/${AC_TOTAL} required criteria. This likely means the work is incomplete. Review with chorus_get_task and consider chorus_admin_reopen_task to send it back for rework.${DOWNSTREAM_INFO}" \
        "TaskCompleted"

    # Case 4: No structured AC (legacy task) → generic reminder
    else
      "$API" hook-output \
        "Chorus: task '${TASK_TITLE}' needs your verification" \
        "ACTION REQUIRED: Task '${TASK_TITLE}' (${CHORUS_TASK_UUID}) is in to_verify status (no structured acceptance criteria). You have admin role — please review and call chorus_admin_verify_task to verify, or chorus_admin_reopen_task if changes are needed.${DOWNSTREAM_INFO}" \
        "TaskCompleted"
    fi
  else
    # Not admin — just inform about to_verify status
    "$API" hook-output \
      "Chorus: task '${TASK_TITLE}' submitted for verification" \
      "Task '${TASK_TITLE}' (${CHORUS_TASK_UUID}) is now in to_verify status. An admin needs to verify it.${DOWNSTREAM_INFO}" \
      "TaskCompleted"
  fi
else
  # Not to_verify — just report checkout
  "$API" hook-output \
    "Chorus: checked out from task ${CHORUS_TASK_UUID:0:8}... (status: ${TASK_STATUS})" \
    "Auto-checked out from Chorus task '${TASK_TITLE}' (${CHORUS_TASK_UUID}). Current status: ${TASK_STATUS}." \
    "TaskCompleted"
fi
