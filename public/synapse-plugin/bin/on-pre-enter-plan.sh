#!/usr/bin/env bash
# on-pre-enter-plan.sh — PreToolUse hook for EnterPlanMode
# Injects Synapse experiment-design workflow guidance when Claude enters plan mode.
#
# Output: JSON with additionalContext

set -euo pipefail

[ -z "${SYNAPSE_URL:-}" ] && exit 0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

CONTEXT="[Synapse Planning Workflow]
When planning implementation, follow the Synapse AI-DLC lifecycle:
1. Identify or create a Synapse Research Question for this requirement
2. Create an Experiment Design with document drafts (PRD) and experiment-run drafts
3. Set up the experiment-run dependency DAG (dependsOnDraftUuids) — frontend depends on backend API, tests depend on both
4. Submit the Experiment Design for PI approval
5. After approval, experiment runs materialize and can be claimed or assigned
Do NOT start coding without an approved Synapse Experiment Design unless you are already working on an approved experiment run.

When planning sub-agent work distribution:
- The Synapse Plugin auto-manages session lifecycle — do NOT plan to create sessions manually.
- Plan which Synapse experiment-run UUIDs each sub-agent will work on — that is what the prompt needs."

"$API" hook-output "Synapse: plan mode — follow experiment-design workflow" "$CONTEXT" "PreToolUse"
