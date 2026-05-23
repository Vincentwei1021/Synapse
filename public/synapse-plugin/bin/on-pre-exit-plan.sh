#!/usr/bin/env bash
# on-pre-exit-plan.sh — PreToolUse hook for ExitPlanMode
# Reminds the agent to exit planning with Experiment records, not legacy drafts.
#
# Output: JSON with additionalContext

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
SYNAPSE_HOOK_LOG_FILE=$("$API" log-init "PreToolUse:ExitPlanMode" "$EVENT") || SYNAPSE_HOOK_LOG_FILE=""
export SYNAPSE_HOOK_LOG_FILE
export SYNAPSE_HOOK_NAME="PreToolUse:ExitPlanMode"

CONTEXT="[Synapse Pre-Implementation Check]
Before exiting plan mode, ensure:
1. The work is represented as one or more current Synapse Experiments
2. Each Experiment has enough detail to execute without relying on legacy Experiment Design drafts
3. New human-created execution work is ready for the modern Experiment pipeline (usually `pending_start`, unless you intentionally keep it as `draft`)
4. Any sub-agent plan names the Experiment UUID each worker should execute
If no Experiment exists yet, create or propose one before implementing."

"$API" hook-output "" "$CONTEXT" "PreToolUse"
