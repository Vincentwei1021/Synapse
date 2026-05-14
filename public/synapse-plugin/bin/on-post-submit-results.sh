#!/usr/bin/env bash
# on-post-submit-results.sh — PostToolUse hook for synapse_submit_experiment_results
# Triggered immediately after the agent submits experiment results.
# Injects a hard reminder that the agent MUST now call synapse_save_experiment_report
# to write the markdown experiment report. Runs while the agent is still alive,
# so it can act on the reminder in its very next turn.
#
# Output: JSON with additionalContext (LLM-visible) + systemMessage (user toast)

set -euo pipefail

[ -z "${SYNAPSE_URL:-}" ] && exit 0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

# Read event JSON from stdin
EVENT=""
if [ ! -t 0 ]; then
  EVENT=$(cat)
fi

if [ -z "$EVENT" ]; then
  exit 0
fi

# Only act on the submit-results tool. Tool names from CC arrive in either
# the bare form ("synapse_submit_experiment_results") or the MCP-prefixed form
# ("mcp__synapse__synapse_submit_experiment_results") depending on transport.
TOOL_NAME=$(echo "$EVENT" | jq -r '.tool_name // .toolName // empty' 2>/dev/null) || true
case "$TOOL_NAME" in
  *synapse_submit_experiment_results) ;;
  *) exit 0 ;;
esac

# Pull the experiment UUID out of the tool input so the reminder can be specific.
EXPERIMENT_UUID=$(echo "$EVENT" \
  | jq -r '.tool_input.experimentUuid // .input.experimentUuid // empty' 2>/dev/null) || true

# Pull the outcome too — used only for phrasing.
OUTCOME=$(echo "$EVENT" \
  | jq -r '.tool_input.outcome // .input.outcome // empty' 2>/dev/null) || true

if [ -n "$EXPERIMENT_UUID" ]; then
  CONTEXT="[Synapse Plugin — Required next step after submitting results]
You just called synapse_submit_experiment_results for experiment ${EXPERIMENT_UUID}${OUTCOME:+ (outcome=${OUTCOME})}.
You MUST now immediately call synapse_save_experiment_report({ experimentUuid: \"${EXPERIMENT_UUID}\", title, content }) with a full markdown writeup (objective, methodology, results, analysis, charts where useful).
This is required for success, failure, and inconclusive outcomes alike. Do not finish the task, hand off, or move on until the report has been saved. Do not post the writeup as a comment — use synapse_save_experiment_report."
  USER_MSG="Synapse: results submitted for ${EXPERIMENT_UUID:0:8} — now save the experiment report"
else
  CONTEXT="[Synapse Plugin — Required next step after submitting results]
You just called synapse_submit_experiment_results. You MUST now immediately call synapse_save_experiment_report({ experimentUuid, title, content }) with a full markdown writeup (objective, methodology, results, analysis). This is required for every outcome — success, failure, and inconclusive. Do not finish the task or move on until the report has been saved."
  USER_MSG="Synapse: results submitted — now save the experiment report"
fi

"$API" hook-output "$USER_MSG" "$CONTEXT" "PostToolUse"
