#!/usr/bin/env bash
# on-pre-exit-plan.sh — PreToolUse hook for ExitPlanMode
# Reminds the agent to exit planning with Experiment records, not legacy drafts.
#
# Output: JSON with additionalContext

set -euo pipefail

[ -z "${SYNAPSE_URL:-}" ] && exit 0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

CONTEXT="[Synapse Pre-Implementation Check]
Before exiting plan mode, ensure:
1. The work is represented as one or more current Synapse Experiments
2. Each Experiment has enough detail to execute without relying on legacy Experiment Design drafts
3. New human-created execution work is ready for the modern Experiment pipeline (usually `pending_start`, unless you intentionally keep it as `draft`)
4. Any sub-agent plan names the Experiment UUID each worker should execute
If no Experiment exists yet, create or propose one before implementing."

"$API" hook-output "" "$CONTEXT" "PreToolUse"
