#!/usr/bin/env bash
# on-pre-enter-plan.sh — PreToolUse hook for EnterPlanMode
# Injects guidance for the current ResearchQuestion -> Experiment workflow.
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
SYNAPSE_HOOK_LOG_FILE=$("$API" log-init "PreToolUse:EnterPlanMode" "$EVENT") || SYNAPSE_HOOK_LOG_FILE=""
export SYNAPSE_HOOK_LOG_FILE
export SYNAPSE_HOOK_NAME="PreToolUse:EnterPlanMode"

CONTEXT="[Synapse Planning Workflow]
When planning implementation, follow the current Synapse research lifecycle:
1. Identify the Research Project and, if needed, the relevant Research Question
2. Create or refine Experiment records directly for the work that should be executed
3. Break work into clear Experiment units with title, description, compute needs, and expected outcome
4. Keep new work in the Experiment pipeline (`draft` -> `pending_review` -> `pending_start` -> `in_progress` -> `completed`)
5. Do NOT route new work through Experiment Design or Experiment Run unless you are intentionally handling legacy compatibility surfaces

When planning sub-agent work distribution:
- The Synapse Plugin auto-manages session lifecycle — do NOT plan to create sessions manually.
- Plan which Synapse experiment UUIDs each sub-agent should execute — that is what the prompt should pass."

"$API" hook-output "Synapse: plan mode — use the Experiment workflow" "$CONTEXT" "PreToolUse"
