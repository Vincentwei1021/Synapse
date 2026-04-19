#!/usr/bin/env bash
# on-task-completed.sh — TaskCompleted lifecycle hook
# Triggered when a Claude Code work item is marked completed.
# Checks for a Synapse experiment UUID marker in the metadata/description and
# reminds the agent to finish the corresponding Experiment lifecycle in Synapse.
#
# Output: JSON with systemMessage (user) when a checkout happens

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

# Check environment
if [ -z "${SYNAPSE_URL:-}" ] || [ -z "${SYNAPSE_API_KEY:-}" ]; then
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

# Extract work-item info
TASK_DESCRIPTION=$(echo "$EVENT" | jq -r '.task_description // .taskDescription // .description // empty' 2>/dev/null) || true
TASK_SUBJECT=$(echo "$EVENT" | jq -r '.task_subject // .taskSubject // .subject // empty' 2>/dev/null) || true
AGENT_ID=$(echo "$EVENT" | jq -r '.agent_id // .agentId // empty' 2>/dev/null) || true

# Look for synapse:experiment:<uuid> (preferred) with quiet fallback support
# for older metadata bridges.
SYNAPSE_EXPERIMENT_UUID=""
MATCH_PREFIX=""

for text in "$TASK_DESCRIPTION" "$TASK_SUBJECT"; do
  if [ -n "$text" ]; then
    MATCH=$(echo "$text" | grep -oP 'synapse:(?:experiment|experiment_run|task):([0-9a-f-]{36})' | head -1) || true
    if [ -n "$MATCH" ]; then
      MATCH_PREFIX=$(echo "$MATCH" | cut -d: -f2)
      SYNAPSE_EXPERIMENT_UUID=$(echo "$MATCH" | sed -E 's/synapse:(experiment|experiment_run|task)://')
      break
    fi
  fi
done

if [ -z "$SYNAPSE_EXPERIMENT_UUID" ]; then
  exit 0
fi

if [ "$MATCH_PREFIX" = "experiment" ]; then
  CONTEXT="Claude Code work item references Synapse experiment ${SYNAPSE_EXPERIMENT_UUID}.
If the experiment is complete, call synapse_submit_experiment_results.
If work is still ongoing, call synapse_report_experiment_progress and keep the Experiment status current."
else
  CONTEXT="Legacy Synapse metadata marker detected for ${SYNAPSE_EXPERIMENT_UUID}.
Translate this work item back to the current Experiment workflow and finish with synapse_report_experiment_progress or synapse_submit_experiment_results."
fi

"$API" hook-output \
  "Synapse: work item linked to experiment ${SYNAPSE_EXPERIMENT_UUID:0:8}..." \
  "$CONTEXT" \
  "TaskCompleted"
