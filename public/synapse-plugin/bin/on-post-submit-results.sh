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

SYNAPSE_HOOK_LOG_FILE=$("$API" log-init "PostToolUse:submit_results" "$EVENT") || SYNAPSE_HOOK_LOG_FILE=""
export SYNAPSE_HOOK_LOG_FILE
export SYNAPSE_HOOK_NAME="PostToolUse:submit_results"

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
  CONTEXT="[Synapse Plugin — REQUIRED next steps after submitting results]
For experiment ${EXPERIMENT_UUID}${OUTCOME:+ (outcome=${OUTCOME})} you must do BOTH of the following before considering this experiment closed:
  1. synapse_save_experiment_report({ experimentUuid: \"${EXPERIMENT_UUID}\", title, content }) — markdown writeup covering objective, methodology, results, analysis (charts when useful). Use the report tool, NOT a comment, so the writeup lands in the dedicated experiment document.
  2. For every incident, surprise, failure, or non-trivial debugging step you hit during execution, call synapse_record_experiment_incident_lesson({ experimentUuid: \"${EXPERIMENT_UUID}\", failureType, severity, phase, rootCause, resolution, prevention, tags }). This is the shared experience library (经验库) and is the only durable place this knowledge lives — without it, future agents repeat the same mistakes. One lesson per distinct issue.

Apply both for success, failure, and inconclusive outcomes. Skip only with a documented reason (e.g. trivial sanity check the user explicitly waived)."
  USER_MSG="Synapse: results submitted for ${EXPERIMENT_UUID:0:8} — save report + record lessons"
else
  CONTEXT="[Synapse Plugin — REQUIRED next steps after submitting results]
Save the markdown report with synapse_save_experiment_report({ experimentUuid, title, content }) AND record any incidents/surprises/failures/non-trivial debugging steps via synapse_record_experiment_incident_lesson. The lesson tool writes to the shared experience library — without it, the knowledge is lost. Apply both for every outcome."
  USER_MSG="Synapse: results submitted — save report + record lessons"
fi

"$API" hook-output "$USER_MSG" "$CONTEXT" "PostToolUse"
