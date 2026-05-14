#!/usr/bin/env bash
# on-post-create-experiment.sh — PostToolUse hook for synapse_create_experiment
# Triggered immediately after the agent creates an experiment.
# Reminds the main agent that the next step is a sub-agent self-review
# before the experiment is pushed to pending_review.
#
# Output: JSON with additionalContext (LLM-visible) + systemMessage (user toast)

set -euo pipefail

[ -z "${SYNAPSE_URL:-}" ] && exit 0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

EVENT=""
if [ ! -t 0 ]; then
  EVENT=$(cat)
fi

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
  CONTEXT="[Synapse Plugin — Required next step after creating an experiment]
You just created experiment ${EXPERIMENT_UUID}. It is in 'draft'.
DO NOT push it to pending_review yet. First, spawn a sub-agent via the Task tool to self-review this draft. The sub-agent should call synapse_get_experiment, then evaluate:
  - Is the objective specific and measurable?
  - Is the methodology sound and reproducible?
  - Are the success criteria aligned with the project's evaluationMethods?
  - Is the compute budget realistic given current availability?
The sub-agent returns its verdict to you in-session — it does NOT write to Synapse.
Apply revisions with synapse_update_experiment_plan if needed.
Then call synapse_update_experiment_status({ experimentUuid: \"${EXPERIMENT_UUID}\", status: \"pending_review\" }) and present the self-review summary plus plan summary to the user.
Wait for the user's verbal approve / reject. On approve, call synapse_review_experiment with reviewNote quoting the user's words. On reject, summarize the user's revision request (including a quoted phrase) into reviewNote and call synapse_review_experiment with decision \"rejected\" — do NOT also call synapse_add_comment, the review tool writes the comment for you.
If the autonomy skill has marked this session as full_auto, skip the user gate and call synapse_review_experiment directly with reviewNote: 'Full-auto session authorized by <ownerName> at <ISO time>. Self-review pass: <key points>.'"
  USER_MSG="Synapse: experiment ${EXPERIMENT_UUID:0:8} drafted — run self-review next"
else
  CONTEXT="[Synapse Plugin — Required next step after creating an experiment]
You just created an experiment in 'draft'. Spawn a Task sub-agent to self-review the plan, revise via synapse_update_experiment_plan if needed, then push it to pending_review with synapse_update_experiment_status. After that, present the self-review summary to the user and wait for verbal approve / reject. Approvals call synapse_review_experiment with the user's quoted words in reviewNote; rejections summarize the user's revision request into reviewNote (the review tool writes the comment automatically — do not double-write)."
  USER_MSG="Synapse: experiment drafted — run self-review next"
fi

"$API" hook-output "$USER_MSG" "$CONTEXT" "PostToolUse"
