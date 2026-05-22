#!/usr/bin/env bash
# on-post-submit-results.sh — PostToolUse hook for synapse_submit_experiment_results
# Triggered immediately after the agent submits experiment results.
# Injects a hard reminder that the agent MUST now call synapse_save_experiment_report
# to write the markdown experiment report. Runs while the agent is still alive,
# so it can act on the reminder in its very next turn.
#
# Output: JSON with additionalContext (LLM-visible) + systemMessage (user toast)

set -euo pipefail

if [ -z "${SYNAPSE_URL:-}" ] || [ -z "${SYNAPSE_API_KEY:-}" ]; then
  exit 0
fi

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
  CONTEXT="[Synapse Plugin — Suggested next step after submitting results]
You just submitted results for experiment ${EXPERIMENT_UUID}${OUTCOME:+ (outcome=${OUTCOME})}.
The expected follow-up is synapse_save_experiment_report({ experimentUuid: \"${EXPERIMENT_UUID}\", title, content }) with a markdown writeup covering objective, methodology, results, and analysis (plus charts where useful). Apply this for success, failure, and inconclusive outcomes — the report is what makes the result legible to the rest of the project. Use synapse_save_experiment_report rather than posting the writeup as a comment so it lands in the dedicated experiment document. Skip only with a documented reason (e.g. result is a trivial sanity check the user explicitly waived)."
  USER_MSG="Synapse: results submitted for ${EXPERIMENT_UUID:0:8} — save the experiment report next"
else
  CONTEXT="[Synapse Plugin — Suggested next step after submitting results]
You just submitted experiment results. The expected follow-up is synapse_save_experiment_report({ experimentUuid, title, content }) with a markdown writeup (objective, methodology, results, analysis). Recommended for every outcome — success, failure, and inconclusive. Skip only with a documented reason."
  USER_MSG="Synapse: results submitted — save the experiment report next"
fi

"$API" hook-output "$USER_MSG" "$CONTEXT" "PostToolUse"
