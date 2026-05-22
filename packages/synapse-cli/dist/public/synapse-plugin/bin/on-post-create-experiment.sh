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
  CONTEXT="[Synapse Plugin — Suggested next step after creating an experiment]
You just created experiment ${EXPERIMENT_UUID} in 'draft'. The recommended flow before pushing to pending_review:
  1. Spawn a Task sub-agent to self-review the draft. The sub-agent calls synapse_get_experiment and evaluates objective specificity, methodology soundness, alignment with the project's evaluationMethods, and compute realism. It reports back in-session — it does not write to Synapse.
  2. Apply revisions via synapse_update_experiment_plan if the review surfaces issues.
  3. Move to pending_review with synapse_update_experiment_status({ experimentUuid: \"${EXPERIMENT_UUID}\", status: \"pending_review\" }) and surface the self-review summary plus plan summary to the user.
  4. On user approve, call synapse_review_experiment with reviewNote quoting the user's words. On reject, summarize the user's revision request into reviewNote and call synapse_review_experiment with decision \"rejected\" (the review tool writes the comment for you — no separate synapse_add_comment needed).
If the autonomy skill marked this session as full_auto, the self-review is still useful but the user gate is skipped — call synapse_review_experiment directly with reviewNote: 'Full-auto session authorized by <ownerName> at <ISO time>. Self-review pass: <key points>.'
Skip the self-review only if you have a strong reason (e.g. trivial follow-up identical to a recently approved plan) — note the reason in the review note."
  USER_MSG="Synapse: experiment ${EXPERIMENT_UUID:0:8} drafted — self-review recommended"
else
  CONTEXT="[Synapse Plugin — Suggested next step after creating an experiment]
You just created an experiment in 'draft'. The recommended flow: spawn a Task sub-agent to self-review the plan, revise via synapse_update_experiment_plan if needed, then push it to pending_review with synapse_update_experiment_status. Surface the self-review summary to the user and wait for verbal approve / reject. Approvals call synapse_review_experiment with the user's quoted words in reviewNote; rejections summarize the user's revision request into reviewNote (the review tool writes the comment automatically). Skip the self-review only with a documented reason."
  USER_MSG="Synapse: experiment drafted — self-review recommended"
fi

"$API" hook-output "$USER_MSG" "$CONTEXT" "PostToolUse"
