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

# Static workflow guide for Research Copilot
WORKFLOW_GUIDE="
## Research Copilot — Workflow Guide

When the user selects a project:

1. Call \`synapse_get_project_full_context({ researchProjectUuid })\` to load full context.
2. Present the project's current state to the user:
   - Collected papers (count + highlights if any)
   - Deep research status
   - Research questions (list titles)
   - Experiments (count by status, key results if completed)
3. Explain the full research lifecycle:
   a. **Paper Search** — find and collect relevant papers
   b. **Deep Research** — synthesize papers into a literature review
   c. **Research Questions** — formulate specific research questions
   d. **Experiments** — design, execute, and submit results
   e. **Analysis & Iteration** — analyze results, identify gaps, loop back
4. Based on current state, suggest the most natural next step:
   - relatedWorksCount = 0 → suggest starting with Paper Search
   - relatedWorksCount > 0 but deepResearchExists = false → suggest Deep Research
   - no research questions → suggest formulating Research Questions
   - no experiments → suggest proposing Experiments
   - some experiments completed → suggest analyzing results and planning next iteration
5. Tell the user they can jump to any stage — the suggestion is a guide, not a constraint.

### Tool Reference by Stage

Tool availability depends on the agent's Synapse roles. Public read/comment/notification/session tools are broadly available, while literature tools usually require \`pre_research\`, experiment execution tools require \`experiment\`, and project / question mutation tools depend on \`research\` or \`admin\`.

**Paper Search:**
  - \`synapse_search_papers({ query })\` — search for papers
  - \`synapse_read_paper_brief({ arxivId })\` — quick summary (~500 tokens)
  - \`synapse_read_paper_head({ arxivId })\` — section structure (~1-2k tokens)
  - \`synapse_read_paper_section({ arxivId, sectionName })\` — full section
  - \`synapse_add_related_work({ researchProjectUuid, ... })\` — add paper to project
  - \`synapse_get_related_works({ researchProjectUuid })\` — list collected papers

**Deep Research:**
  - \`synapse_get_related_works\` — review collected papers
  - \`synapse_get_deep_research_report({ researchProjectUuid })\` — get existing report
  - \`synapse_save_deep_research_report({ researchProjectUuid, title, content })\` — create/update report
  - \`synapse_complete_task({ researchProjectUuid, taskType: \"deep_research\" })\` — clear the active task when you are fulfilling a Synapse-triggered deep research request

**Research Questions:**
  - \`synapse_get_research_project({ researchProjectUuid })\` — project context
  - \`synapse_get_research_questions({ researchProjectUuid })\` — inspect the current question set
  - Claim / status-update tools are available only when the agent has the matching research-oriented role

**Experiment Planning / Revision:**
  - \`synapse_get_experiment({ experimentUuid })\` — inspect the current experiment
  - \`synapse_get_comments({ targetType: \"experiment\", targetUuid })\` — read review feedback or @mention threads
  - \`synapse_update_experiment_status({ experimentUuid, status: \"draft\", liveStatus: \"writing\", liveMessage })\` — mark that you are drafting or revising the plan
  - \`synapse_update_experiment_plan({ experimentUuid, title?, description?, researchQuestionUuid?, priority? })\` — save the fleshed-out plan
  - \`synapse_update_experiment_status({ experimentUuid, status: \"pending_review\" })\` — hand the revised plan back for review

**Experiment Execution:**
  - \`synapse_list_compute_nodes({ onlyAvailable: true, researchProjectUuid? })\` — inspect available compute
  - \`synapse_reserve_gpus({ experimentUuid, gpuUuids })\` — reserve GPUs before running
  - \`synapse_start_experiment({ experimentUuid })\` — begin execution
  - \`synapse_report_experiment_progress({ experimentUuid, message, phase?, liveStatus? })\` — report progress or queueing state
  - \`synapse_get_node_access_bundle({ experimentUuid, nodeUuid })\` — fetch managed SSH credentials
  - \`synapse_submit_experiment_results({ experimentUuid, outcome?, experimentResults, experimentBranch?, commitSha? })\` — submit results and finish execution
  - \`synapse_save_experiment_report({ experimentUuid, title?, content })\` — save the dedicated experiment report document when requested

**Analysis:**
  - \`synapse_get_project_full_context({ researchProjectUuid })\` — reload full state
  - Review experiment outcomes, compute availability, and synthesis state before proposing next steps

### Language

Respond in the same language the user uses. If the user writes in Chinese, respond in Chinese. If in English, respond in English."

# Build context for Claude (additionalContext)
CONTEXT="# Synapse Plugin — Active

Synapse is connected at ${SYNAPSE_URL}.
Session lifecycle hooks are enabled: SubagentStart, SubagentStop, TeammateIdle, TaskCompleted.

## Checkin Result

${CHECKIN_RESULT}
${ASSIGNMENTS_BLOCK}
${PROJECTS_BLOCK}
${WORKFLOW_GUIDE}

## Session Management — IMPORTANT

The Synapse Plugin **fully automates** Synapse session lifecycle:
- Sub-agent spawn → Synapse session auto-created (or reused) + session UUID and workflow auto-injected into sub-agent context
- Teammate idle → Synapse session heartbeat (automatic)
- Sub-agent stop → Synapse session closed

**Do NOT call synapse_create_session or synapse_close_session for sub-agents.** The plugin handles this.
When spawning sub-agents, pass Synapse EXPERIMENT UUIDs in the prompt. Session UUID + Experiment workflow are auto-injected by SubagentStart hook.

For your own session (if you are working directly, not via sub-agents):
call synapse_list_sessions() first, then reopen or create as needed.

To link a Claude Code work item to a Synapse experiment, include \`synapse:experiment:<uuid>\` in the description.

## Notifications

When you or your sub-agents receive @mentions or other notifications:
- \`synapse_get_notifications()\` — fetches unread notifications and **auto-marks them as read**
- \`synapse_get_notifications({ autoMarkRead: false })\` — peek without marking read
- No need to call \`synapse_mark_notification_read\` separately after reading

## Project Groups

Projects are organized into Project Groups. If your agent has admin capabilities and needs to create a project, call \`synapse_get_project_groups()\` first so the new project lands in the correct group."

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

Use your session UUID for session observability only. Execute assigned work with \`synapse_get_experiment\`, \`synapse_start_experiment\`, \`synapse_report_experiment_progress\`, and \`synapse_submit_experiment_results\`."
    CONTEXT="${CONTEXT}${SESSION_LIST}"
  fi
fi

# Build user-visible message
USER_MSG="Synapse connected at ${SYNAPSE_URL}"
if [ -n "$MAIN_SESSION" ]; then
  USER_MSG="${USER_MSG} (resumed session)"
fi

"$API" hook-output "$USER_MSG" "$CONTEXT" "SessionStart"
