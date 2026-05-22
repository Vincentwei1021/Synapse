#!/usr/bin/env bash
# Behavioral regression tests for Synapse Claude Code plugin hooks.
#
# Usage:
#   bash public/synapse-plugin/bin/test-behavior.sh

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
FAILED=""

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/synapse-plugin-behavior.XXXXXX")
cleanup() { rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

fail() {
  local name="$1"
  local message="$2"
  printf "  FAIL  %s\n" "$name"
  printf "        %s\n" "$message"
  FAIL=$((FAIL + 1))
  FAILED="$FAILED $name"
}

pass() {
  local name="$1"
  printf "  PASS  %s\n" "$name"
  PASS=$((PASS + 1))
}

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required for behavior tests" >&2
    exit 1
  fi
}

test_mcp_http_errors_fail() {
  local name="mcp http/json-rpc errors fail"
  local tmp="$TMP_ROOT/api-error"
  local fakebin="$tmp/fakebin"
  mkdir -p "$fakebin" "$tmp/project"

  cat > "$fakebin/curl" <<'CURL'
#!/usr/bin/env bash
out_file=""
write_code=""
for ((i = 1; i <= $#; i++)); do
  arg="${!i}"
  case "$arg" in
    -o)
      next=$((i + 1))
      out_file="${!next}"
      ;;
    -w)
      next=$((i + 1))
      write_code="${!next}"
      ;;
  esac
done

if [ -n "$out_file" ]; then
  printf '{"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"unauthorized"}}' > "$out_file"
  if [ -n "$write_code" ]; then
    printf '401'
  fi
  exit 0
fi

printf '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26"}}'
CURL
  chmod +x "$fakebin/curl"

  if PATH="$fakebin:$PATH" \
    SYNAPSE_URL="http://synapse.invalid" \
    SYNAPSE_API_KEY="syn_test" \
    CLAUDE_PROJECT_DIR="$tmp/project" \
    "$DIR/synapse-api.sh" mcp-tool synapse_checkin '{}' >"$tmp/out" 2>"$tmp/err"; then
    fail "$name" "synapse-api.sh returned success for HTTP 401 JSON-RPC error"
    return
  fi

  pass "$name"
}

test_pre_spawn_safe_names() {
  local name="pre-spawn safely stores quoted/slashed names"
  local tmp="$TMP_ROOT/safe-name"
  local project="$tmp/project"
  local agent_name='worker "alpha" / beta'
  mkdir -p "$project"

  if ! SYNAPSE_URL="http://synapse.invalid" \
    SYNAPSE_API_KEY="syn_test" \
    CLAUDE_PROJECT_DIR="$project" \
    bash "$DIR/on-pre-spawn-agent.sh" >"$tmp/out" 2>"$tmp/err" <<JSON
{"tool_input":{"subagent_type":"general-purpose","name":"worker \"alpha\" / beta"}}
JSON
  then
    fail "$name" "on-pre-spawn-agent.sh failed for a valid agent name containing quotes/slashes"
    return
  fi

  local pending_dir="$project/.synapse/pending"
  local count
  count=$(find "$pending_dir" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" != "1" ]; then
    fail "$name" "expected exactly one pending file, found ${count:-0}"
    return
  fi

  local pending_file
  pending_file=$(find "$pending_dir" -type f | head -1)
  if ! jq -e --arg expected "$agent_name" '.name == $expected and .type == "general-purpose"' "$pending_file" >/dev/null; then
    fail "$name" "pending file JSON did not preserve the original agent name/type"
    return
  fi

  pass "$name"
}

test_inactive_session_heartbeats_instead_of_reopen() {
  local name="inactive session heartbeat instead of reopen/create"
  local tmp="$TMP_ROOT/inactive-session"
  local bin="$tmp/bin"
  local project="$tmp/project"
  mkdir -p "$bin" "$project/.synapse/pending"
  ln -s "$DIR/on-subagent-start.sh" "$bin/on-subagent-start.sh"

  cat > "$bin/synapse-api.sh" <<'API'
#!/usr/bin/env bash
cmd="${1:-}"
shift || true
: "${CALL_LOG:?CALL_LOG is required}"
case "$cmd" in
  mcp-tool)
    tool="${1:-}"
    args="${2:-}"
    printf '%s %s\n' "$tool" "$args" >> "$CALL_LOG"
    case "$tool" in
      synapse_list_sessions)
        printf '[{"uuid":"session-inactive-0000-0000-0000-000000000001","name":"worker-one","status":"inactive","updatedAt":"2026-05-22T00:00:00Z"}]\n'
        ;;
      synapse_session_heartbeat)
        printf '{"ok":true}\n'
        ;;
      synapse_reopen_session)
        printf '{"error":"inactive sessions should not be reopened"}\n'
        ;;
      synapse_create_session)
        printf '{"uuid":"session-created-0000-0000-0000-000000000001"}\n'
        ;;
    esac
    ;;
  state-set)
    printf 'state-set %s %s\n' "${1:-}" "${2:-}" >> "$CALL_LOG"
    ;;
  state-get)
    ;;
  hook-output)
    printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "${1:-}" "${3:-}" "${2:-}"
    ;;
  *)
    ;;
esac
API
  chmod +x "$bin/synapse-api.sh"

  printf '{"name":"worker-one","type":"general-purpose","ts":"2026-05-22T00:00:00.000Z"}\n' \
    > "$project/.synapse/pending/worker-one"
  : > "$tmp/calls.log"

  if ! SYNAPSE_URL="http://synapse.invalid" \
    SYNAPSE_API_KEY="syn_test" \
    CLAUDE_PROJECT_DIR="$project" \
    CALL_LOG="$tmp/calls.log" \
    bash "$bin/on-subagent-start.sh" >"$tmp/out" 2>"$tmp/err" <<'JSON'
{"agent_id":"agent-001","agent_type":"worker-one"}
JSON
  then
    fail "$name" "on-subagent-start.sh failed for inactive reusable session"
    return
  fi

  if grep -q 'synapse_reopen_session' "$tmp/calls.log"; then
    fail "$name" "inactive session incorrectly called synapse_reopen_session"
    return
  fi
  if grep -q 'synapse_create_session' "$tmp/calls.log"; then
    fail "$name" "inactive session incorrectly created a duplicate session"
    return
  fi
  if ! grep -q 'synapse_session_heartbeat' "$tmp/calls.log"; then
    fail "$name" "inactive session was not heartbeated back to active"
    return
  fi

  pass "$name"
}

test_missing_api_key_does_not_write_pending() {
  local name="missing api key does not write pending state"
  local tmp="$TMP_ROOT/missing-key"
  local project="$tmp/project"
  mkdir -p "$project"

  if ! env -u SYNAPSE_API_KEY \
    SYNAPSE_URL="http://synapse.invalid" \
    CLAUDE_PROJECT_DIR="$project" \
    bash "$DIR/on-pre-spawn-agent.sh" >"$tmp/out" 2>"$tmp/err" <<'JSON'
{"tool_input":{"subagent_type":"general-purpose","name":"worker"}}
JSON
  then
    fail "$name" "on-pre-spawn-agent.sh should exit cleanly when API key is missing"
    return
  fi

  if [ -e "$project/.synapse/pending/worker" ]; then
    fail "$name" "pending file was written despite missing SYNAPSE_API_KEY"
    return
  fi

  pass "$name"
}

require_jq
echo "Running Synapse plugin behavior tests"
echo ""

test_mcp_http_errors_fail
test_pre_spawn_safe_names
test_inactive_session_heartbeats_instead_of_reopen
test_missing_api_key_does_not_write_pending

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED"
  exit 1
fi
