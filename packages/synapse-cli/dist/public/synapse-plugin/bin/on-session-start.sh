#!/usr/bin/env bash
# on-session-start.sh — SessionStart hook
# Triggered on Claude Code session startup/resume.
# Calls synapse_checkin via MCP to inject agent context.
# Also scans for existing session files (metadata for hook state lookup).
#
# Output: JSON with systemMessage (user) + additionalContext (Claude)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API="${SCRIPT_DIR}/synapse-api.sh"

# Read event JSON from stdin (if available)
EVENT=""
if [ ! -t 0 ]; then
  EVENT=$(cat)
fi

# Check if Synapse environment is configured
if [ -z "${SYNAPSE_URL:-}" ] || [ -z "${SYNAPSE_API_KEY:-}" ]; then
  "$API" hook-output \
    "Synapse plugin: not configured (set SYNAPSE_URL and SYNAPSE_API_KEY)" \
    "Synapse environment not configured. Set SYNAPSE_URL and SYNAPSE_API_KEY to enable Synapse integration." \
    "SessionStart"
  exit 0
fi

# Call synapse_checkin via MCP
CHECKIN_RESULT=$("$API" mcp-tool "synapse_checkin" '{}' 2>/dev/null) || {
  "$API" hook-output \
    "Synapse plugin: connection failed (${SYNAPSE_URL})" \
    "WARNING: Unable to reach Synapse at ${SYNAPSE_URL}. Session lifecycle hooks will not function." \
    "SessionStart"
  exit 0
}

# Store owner info from checkin for SubagentStart hook to inject into sub-agent context
if command -v jq >/dev/null 2>&1; then
  _OWNER_NAME=$(echo "$CHECKIN_RESULT" | jq -r '.agent.owner.name // empty' 2>/dev/null) || true
  _OWNER_EMAIL=$(echo "$CHECKIN_RESULT" | jq -r '.agent.owner.email // empty' 2>/dev/null) || true
  _OWNER_UUID=$(echo "$CHECKIN_RESULT" | jq -r '.agent.owner.uuid // empty' 2>/dev/null) || true
  if [ -n "$_OWNER_UUID" ]; then
    "$API" state-set "owner_name" "$_OWNER_NAME"
    "$API" state-set "owner_email" "$_OWNER_EMAIL"
    "$API" state-set "owner_uuid" "$_OWNER_UUID"
  fi

  # Cache agent roles for other hooks.
  _ROLES=$(echo "$CHECKIN_RESULT" | jq -r '.agent.roles | join(",") // empty' 2>/dev/null) || true
  if [ -n "$_ROLES" ]; then
    "$API" state-set "agent_roles" "$_ROLES"
  fi

  # Cache the first visible project UUID for convenience in follow-up hooks.
  _PROJECT_UUID=$(echo "$CHECKIN_RESULT" | jq -r '
    (.assignments.experiments[0].projectUuid // .assignments.researchQuestions[0].project.uuid) // empty
  ' 2>/dev/null) || true
  if [ -n "$_PROJECT_UUID" ]; then
    "$API" state-set "project_uuid" "$_PROJECT_UUID"
  fi
fi

# Parse pending assignments for Claude context
ASSIGNMENTS_BLOCK=""
if command -v jq >/dev/null 2>&1; then
  EXP_COUNT=$(echo "$CHECKIN_RESULT" | jq -r '.assignments.experiments | length // 0' 2>/dev/null) || EXP_COUNT=0
  QUESTION_COUNT=$(echo "$CHECKIN_RESULT" | jq -r '.assignments.researchQuestions | length // 0' 2>/dev/null) || QUESTION_COUNT=0
  TOTAL_ASSIGNMENTS=$((EXP_COUNT + QUESTION_COUNT))

  if [ "$TOTAL_ASSIGNMENTS" -gt 0 ]; then
    ASSIGNMENTS_BLOCK="
## Pending Assignments

You have ${TOTAL_ASSIGNMENTS} pending assignment(s) from Synapse. **Ask the user before starting any of them.**
"
    if [ "$EXP_COUNT" -gt 0 ]; then
      EXP_LIST=$(echo "$CHECKIN_RESULT" | jq -r '.assignments.experiments[] | "- [Experiment] \"\(.title)\" (uuid: `\(.uuid)`) — status: \(.status), project: \"\(.projectName)\""' 2>/dev/null) || true
      if [ -n "$EXP_LIST" ]; then
        ASSIGNMENTS_BLOCK="${ASSIGNMENTS_BLOCK}
${EXP_LIST}"
      fi
    fi

    if [ "$QUESTION_COUNT" -gt 0 ]; then
      QUESTION_LIST=$(echo "$CHECKIN_RESULT" | jq -r '.assignments.researchQuestions[] | "- [Research Question] \"\(.title)\" (uuid: `\(.uuid)`) — status: \(.status), project: \"\(.project.name // "unknown")\""' 2>/dev/null) || true
      if [ -n "$QUESTION_LIST" ]; then
        ASSIGNMENTS_BLOCK="${ASSIGNMENTS_BLOCK}
${QUESTION_LIST}"
      fi
    fi
  fi
fi

# Parse research projects for Claude context
PROJECTS_BLOCK=""
if command -v jq >/dev/null 2>&1; then
  PROJECT_COUNT=$(echo "$CHECKIN_RESULT" | jq -r '.projects | length // 0' 2>/dev/null) || PROJECT_COUNT=0

  if [ "$PROJECT_COUNT" -gt 0 ]; then
    PROJECTS_BLOCK="
## Research Projects

Ask the user which project to work on:
"
    PROJECT_LIST=$(echo "$CHECKIN_RESULT" | jq -r '
      .projects | to_entries[] |
      "\(.key + 1). \"\(.value.name)\" (uuid: `\(.value.uuid)`)\n   \(.value.relatedWorksCount) papers | deep research: \(if .value.deepResearchExists then "yes" else "no" end) | \(.value.researchQuestions | length) questions | experiments: \([.value.experimentCounts | to_entries[] | "\(.key)=\(.value)"] | join(", ") | if . == "" then "none" else . end)"
    ' 2>/dev/null) || true
    if [ -n "$PROJECT_LIST" ]; then
      PROJECTS_BLOCK="${PROJECTS_BLOCK}
${PROJECT_LIST}"
    fi
  else
    PROJECTS_BLOCK="
## Research Projects

No research projects found. The user can create one on the Synapse web UI."
  fi
fi

# Compact stage-skill router. Full tool inventory lives in references/00-common-tools.md
# and each stage's SKILL.md — load them on demand instead of paying the token cost
# every SessionStart.
WORKFLOW_GUIDE="
## Stage Skill Router

When the user picks a project, call \`synapse_get_project_full_context({ researchProjectUuid })\` first, then route to the matching stage skill rather than recalling tools from memory:

| Project state / user intent | Skill to load |
|---|---|
| relatedWorksCount=0, or paper search / deep research | \`research\` skill |
| Research questions: formulate, claim, refine | \`research\` skill |
| Experiment plan, revise, execute, report, submit | \`experiments\` skill |
| Compute / GPU reservation / SSH access | \`experiments\` skill (compute section) |
| Markdown reports, embedded figures, synthesis | \`documents\` skill |
| Empty queue, autonomous loop, propose next experiment | \`autonomy\` skill |
| Plugin hook behavior, session lifecycle, parallel sub-agents | \`sessions\` skill |

Each stage skill carries its own tool inventory and execution rules. The full tool reference is at \`skills/synapse/references/00-common-tools.md\`. Tool availability depends on the agent's Synapse roles (\`pre_research\` / \`research\` / \`experiment\` / \`report\` / \`admin\`).

Respond in the same language the user uses."

# Build context for Claude (additionalContext) — kept lean. Stage-specific
# guidance loads via the matching skill when the agent actually needs it.
CONTEXT="# Synapse Plugin — Active

Synapse is connected at ${SYNAPSE_URL}.
Hooks active: SessionStart, UserPromptSubmit, PreToolUse(EnterPlan/ExitPlan/Task), PostToolUse(create_experiment/submit_results), SubagentStart, SubagentStop, TeammateIdle, TaskCompleted, SessionEnd.

## Checkin Result

${CHECKIN_RESULT}
${ASSIGNMENTS_BLOCK}
${PROJECTS_BLOCK}
${WORKFLOW_GUIDE}

## Plugin-Managed Behavior (don't replicate manually)

- **Sub-agent sessions**: SubagentStart auto-creates/reuses a Synapse session and injects the session UUID + experiment workflow into the sub-agent. SubagentStop closes it (and batch-checks-out experiment bindings). TeammateIdle keeps it alive. Do not call \`synapse_create_session\` / \`synapse_close_session\` for sub-agents.
- **Spawning sub-agents**: pass Synapse experiment UUIDs in the prompt. The plugin injects everything else.
- **Linking CC work items to experiments**: include \`synapse:experiment:<uuid>\` in the description; TaskCompleted picks it up.
- **Direct (non-sub-agent) work**: call \`synapse_list_sessions()\` first, then reopen or create.
- **Notifications**: \`synapse_get_notifications()\` fetches unread and auto-marks read; pass \`{ autoMarkRead: false }\` to peek.
- **Creating projects (admin only)**: call \`synapse_get_project_groups()\` first so the new project lands in the right group."

# Check for existing state (resumed session)
MAIN_SESSION=$("$API" state-get "main_session_uuid" 2>/dev/null) || true
if [ -n "$MAIN_SESSION" ]; then
  CONTEXT="${CONTEXT}

Resuming with existing Synapse session: ${MAIN_SESSION}"
  "$API" mcp-tool "synapse_session_heartbeat" "$(printf '{"sessionUuid":"%s"}' "$MAIN_SESSION")" >/dev/null 2>&1 || true
fi

# Plan A: Session discovery for sub-agents
SESSIONS_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse/sessions"
if [ -d "$SESSIONS_DIR" ]; then
  SESSION_FILES=$(ls "$SESSIONS_DIR"/*.json 2>/dev/null) || true
  if [ -n "$SESSION_FILES" ]; then
    SESSION_LIST="

## Pre-assigned Synapse Sessions

The following Synapse sessions were auto-created by the plugin for sub-agents.
If you are a sub-agent, find your session by matching your agent name:
"
    for f in $SESSION_FILES; do
      BASENAME=$(basename "$f" .json)
      if command -v jq &>/dev/null; then
        S_UUID=$(jq -r '.sessionUuid // empty' "$f" 2>/dev/null) || true
        S_NAME=$(jq -r '.agentName // empty' "$f" 2>/dev/null) || true
      else
        S_UUID=$(grep -o '"sessionUuid":"[^"]*"' "$f" 2>/dev/null | cut -d'"' -f4) || true
        S_NAME="$BASENAME"
      fi
      if [ -n "$S_UUID" ]; then
        SESSION_LIST="${SESSION_LIST}
- **${S_NAME:-$BASENAME}**: sessionUuid = \`${S_UUID}\`"
      fi
    done
    SESSION_LIST="${SESSION_LIST}

Pass your session UUID to \`synapse_start_experiment\` and \`synapse_submit_experiment_results\` so Synapse can attribute the active Experiment to your sub-agent session."
    CONTEXT="${CONTEXT}${SESSION_LIST}"
  fi
fi

# Build user-visible message
USER_MSG="Synapse connected at ${SYNAPSE_URL}"
if [ -n "$MAIN_SESSION" ]; then
  USER_MSG="${USER_MSG} (resumed session)"
fi

"$API" hook-output "$USER_MSG" "$CONTEXT" "SessionStart"
