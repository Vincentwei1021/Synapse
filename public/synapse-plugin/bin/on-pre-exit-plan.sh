#!/usr/bin/env bash
# on-pre-exit-plan.sh — PreToolUse hook for ExitPlanMode
# Reminds to create a Synapse Experiment Design before moving to implementation.
#
# Output: JSON with additionalContext

set -euo pipefail

[ -z "${SYNAPSE_URL:-}" ] && exit 0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

CONTEXT="[Synapse Pre-Implementation Check]
Before exiting plan mode, ensure:
1. A Synapse Experiment Design exists with the planned document drafts and experiment-run drafts
2. The experiment-run dependency DAG is properly set up (dependsOnDraftUuids)
3. The Experiment Design has been submitted for approval, or you are working on already-approved experiment runs
If no Experiment Design exists yet, create one with synapse_research_lead_create_experiment_design before implementing."

"$API" hook-output "" "$CONTEXT" "PreToolUse"
