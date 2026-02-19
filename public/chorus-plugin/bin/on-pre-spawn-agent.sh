#!/usr/bin/env bash
# on-pre-spawn-agent.sh — PreToolUse hook for Task (spawning sub-agents)
# 1. Captures agent name + type from tool_input and stores in pending_names
#    (SubagentStart will pick this up since it doesn't receive the name field)
# 2. Reminds Team Lead to pass Chorus task info to sub-agents.
#
# Output: JSON with additionalContext

set -euo pipefail

[ -z "${CHORUS_URL:-}" ] && exit 0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/chorus-api.sh"

# Read event from stdin to check agent type
EVENT=""
if [ ! -t 0 ]; then
  EVENT=$(cat)
fi

# Try to extract subagent_type and name from the tool input
AGENT_TYPE=""
AGENT_NAME=""
if [ -n "$EVENT" ]; then
  AGENT_TYPE=$(echo "$EVENT" | jq -r '.tool_input.subagent_type // .input.subagent_type // empty' 2>/dev/null) || true
  AGENT_NAME=$(echo "$EVENT" | jq -r '.tool_input.name // .input.name // empty' 2>/dev/null) || true
fi

# Skip non-worker types — no need to remind for Explore/Plan agents
case "${AGENT_TYPE,,}" in
  explore|plan|haiku|claude-code-guide|statusline-setup)
    exit 0
    ;;
esac

# Store pending agent name for SubagentStart to pick up.
# SubagentStart only receives agent_id + agent_type — not the name.
# Note: agent_type in SubagentStart may differ from subagent_type here
# (CC sometimes uses the agent name as agent_type), so we store just the name.
#
# IMPORTANT: Always write an entry, even without a name (use "?" placeholder).
# SubagentStart uses the file as a "was this spawn expected?" signal.
# CC may internally spawn cleanup agents that bypass PreToolUse:Task —
# SubagentStart skips those if no pending entry exists.
PENDING_FILE="${CLAUDE_PROJECT_DIR:-.}/.chorus/pending_names"
mkdir -p "$(dirname "$PENDING_FILE")"
echo "${AGENT_NAME:-?}" >> "$PENDING_FILE"

CONTEXT="[Chorus Plugin — Sub-agent Spawn Checklist]
A Chorus session will be auto-created (or reused) for this sub-agent by the plugin.
Do NOT call chorus_create_session — the plugin handles session lifecycle.

When writing the sub-agent prompt, include:
1. The Chorus task UUID(s) this sub-agent should work on
2. Tag \`chorus:task:<uuid>\` in any TaskCreate descriptions for auto-checkout
3. Instruct the sub-agent: read .chorus/sessions/<agent-name>.json for its Chorus session UUID
4. Instruct the sub-agent: call chorus_session_checkin_task before starting work on a task
5. Instruct the sub-agent: call chorus_report_work with sessionUuid when reporting progress
Do NOT include a session UUID in the prompt — the sub-agent discovers it from the session file."

"$API" hook-output "" "$CONTEXT" "PreToolUse"
