#!/usr/bin/env bash
# on-user-prompt.sh — UserPromptSubmit hook
# Fires on EVERY user message. Must be ultra-fast (<100ms).
# NO MCP calls, NO network calls — only local file checks.
# Injects a brief Synapse workflow reminder into Claude's context.
#
# Output: JSON with additionalContext (for Claude)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse"
SESSIONS_DIR="${STATE_DIR}/sessions"

# Skip entirely if Synapse is not configured
if [ -z "${SYNAPSE_URL:-}" ] || [ -z "${SYNAPSE_API_KEY:-}" ]; then
  exit 0
fi

# Count active session files (fast local check)
SESSION_COUNT=0
SESSION_NAMES=""
if [ -d "$SESSIONS_DIR" ]; then
  for f in "$SESSIONS_DIR"/*.json; do
    [ -f "$f" ] || continue
    SESSION_COUNT=$((SESSION_COUNT + 1))
    NAME=$(basename "$f" .json)
    if [ -n "$SESSION_NAMES" ]; then
      SESSION_NAMES="${SESSION_NAMES}, ${NAME}"
    else
      SESSION_NAMES="$NAME"
    fi
  done
fi

# Build context — keep it concise to minimize token usage
CONTEXT="[Synapse Plugin Active]
- Sub-agent sessions are auto-managed by hooks (create/reuse/heartbeat/close).
- Do NOT call synapse_create_session or synapse_close_session for sub-agents — the plugin handles this.
- When spawning sub-agents: just pass Synapse experiment-run UUIDs. Session UUID + workflow are auto-injected by SubagentStart hook.
- Link Claude Code work items to Synapse experiment runs with \`synapse:experiment_run:<uuid>\` in the description. Legacy \`synapse:task:<uuid>\` is still supported."

if [ "$SESSION_COUNT" -gt 0 ]; then
  CONTEXT="${CONTEXT}
- Active sub-agent sessions (${SESSION_COUNT}): ${SESSION_NAMES}"
fi

# Output JSON — no systemMessage (too noisy for every turn)
if command -v jq &>/dev/null; then
  jq -n --arg ac "$CONTEXT" '{additionalContext: $ac}'
else
  # Fallback
  AC_ESCAPED="${CONTEXT//\\/\\\\}"
  AC_ESCAPED="${AC_ESCAPED//\"/\\\"}"
  AC_ESCAPED="${AC_ESCAPED//$'\n'/\\n}"
  printf '{"additionalContext":"%s"}\n' "$AC_ESCAPED"
fi
