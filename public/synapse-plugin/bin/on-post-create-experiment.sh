#!/usr/bin/env bash
# on-post-create-experiment.sh — PostToolUse hook for synapse_create_experiment
# Triggered immediately after the agent creates an experiment.
# Reminds the main agent that the next step is a sub-agent self-review
# before the experiment is pushed to pending_review.
#
# Output: JSON with additionalContext (LLM-visible) + systemMessage (user toast)

set -euo pipefail

if [ -z "${SYNAPSE_URL:-}" ] || [ -z "${SYNAPSE_API_KEY:-}" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

EVENT=""
if [ ! -t 0 ]; then
  EVENT=$(cat)
fi

SYNAPSE_HOOK_LOG_FILE=$("$API" log-init "PostToolUse:create_experiment" "$EVENT") || SYNAPSE_HOOK_LOG_FILE=""
export SYNAPSE_HOOK_LOG_FILE
export SYNAPSE_HOOK_NAME="PostToolUse:create_experiment"

if [ -z "$EVENT" ]; then
  exit 0
fi

TOOL_NAME=$(echo "$EVENT" | jq -r '.tool_name // .toolName // empty' 2>/dev/null) || true
case "$TOOL_NAME" in
  *synapse_create_experiment) ;;
  *) exit 0 ;;
esac

# Try to extract the new experiment UUID from the tool response.
EXPERIMENT_UUID=$(echo "$EVENT" \
  | jq -r '.tool_response.experiment.uuid // .tool_response.uuid // .response.experiment.uuid // empty' 2>/dev/null) || true

if [ -z "$EXPERIMENT_UUID" ]; then
  EXPERIMENT_UUID=$(echo "$EVENT" \
    | jq -r '.tool_response.content[0].text // empty' 2>/dev/null \
    | jq -r '.experiment.uuid // .uuid // empty' 2>/dev/null) || true
fi

if [ -n "$EXPERIMENT_UUID" ]; then
  CONTEXT="[Synapse Plugin — REQUIRED next step after creating an experiment]
**Before doing anything else this turn, invoke \`Skill(\"experiments\")\`** so you load the full Create → Self-Review → Verbal Approve flow. The hook only ships a summary; the skill carries the exact tool call shapes, the rejected-revision template, and the full-auto branch.

Quick recap of what the skill will tell you to do for experiment ${EXPERIMENT_UUID}:
  1. Spawn a Task sub-agent to self-review the draft (read with synapse_get_experiment; verdict reports in-session, do NOT write to Synapse).
  2. Apply revisions via synapse_update_experiment_plan if needed.
  3. Push to pending_review with synapse_update_experiment_status({ experimentUuid: \"${EXPERIMENT_UUID}\", status: \"pending_review\" }) and surface the self-review + plan summary to the user.
  4. **The user can approve/reject directly in this terminal — do not tell them to go to the Synapse web UI.** On verbal approve, call synapse_review_experiment with decision \"approved\" and the user's quoted words in reviewNote. On verbal reject, summarize their revision request into reviewNote and call synapse_review_experiment with decision \"rejected\". The review tool writes the comment automatically — no separate synapse_add_comment.
  5. If the autonomy skill marked this session as full_auto, skip the user gate and call synapse_review_experiment directly with the full-auto template.

If you skip the self-review, document the reason in the review note. Lessons from incidents during execution must be recorded via synapse_record_experiment_incident_lesson — this is the shared experience library and is what feeds future agents (the loop skill explains when to record)."
  USER_MSG="Synapse: experiment ${EXPERIMENT_UUID:0:8} drafted — load /experiments skill and self-review next"
else
  CONTEXT="[Synapse Plugin — REQUIRED next step after creating an experiment]
**Invoke \`Skill(\"experiments\")\` before doing anything else this turn.** That skill carries the full Create → Self-Review → Verbal Approve flow with the exact tool shapes for synapse_update_experiment_plan, synapse_update_experiment_status, and synapse_review_experiment.

The user can approve or reject directly in this terminal — do not redirect them to the web UI. On verbal approve, call synapse_review_experiment with decision \"approved\" and the user's quoted words in reviewNote. On verbal reject, summarize the revision request into reviewNote and call synapse_review_experiment with decision \"rejected\" (the review tool writes the comment for you)."
  USER_MSG="Synapse: experiment drafted — load /experiments skill and self-review next"
fi

"$API" hook-output "$USER_MSG" "$CONTEXT" "PostToolUse"
