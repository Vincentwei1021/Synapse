#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STANDALONE_SERVER="${ROOT_DIR}/.next/standalone/server.js"
PORT="${PORT:-3000}"
ENV_FILE="${ROOT_DIR}/.env"

status=0

pass() {
  printf '[pass] %s\n' "$1"
}

warn() {
  printf '[warn] %s\n' "$1"
}

fail() {
  printf '[fail] %s\n' "$1" >&2
  status=1
}

check_required_env() {
  local name="$1"
  if [ -n "${!name:-}" ]; then
    pass "env ${name} is set"
  else
    fail "env ${name} is missing"
  fi
}

check_optional_env() {
  local name="$1"
  local description="$2"
  if [ -n "${!name:-}" ]; then
    pass "env ${name} is set"
  else
    warn "${description}"
  fi
}

if [ -f "${ENV_FILE}" ]; then
  while IFS= read -r line || [ -n "${line}" ]; do
    case "${line}" in
      ''|\#*)
        continue
        ;;
    esac

    if [[ "${line}" != *=* ]]; then
      continue
    fi

    name="${line%%=*}"
    value="${line#*=}"

    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "${name}=${value}"
  done < "${ENV_FILE}"
fi

check_required_env "DATABASE_URL"
check_optional_env "REDIS_URL" "REDIS_URL is not set; runtime will fall back to in-memory pub/sub if supported."

if [ -n "${DEFAULT_USER:-}" ] && [ -n "${DEFAULT_PASSWORD:-}" ]; then
  pass "default login fallback is fully configured"
elif [ -z "${DEFAULT_USER:-}" ] && [ -z "${DEFAULT_PASSWORD:-}" ]; then
  warn "default login fallback is disabled"
else
  fail "DEFAULT_USER and DEFAULT_PASSWORD must be set together"
fi

if [ -f "${STANDALONE_SERVER}" ]; then
  pass "standalone build artifact exists"
else
  fail "standalone build artifact is missing; run 'pnpm build' first"
fi

if [ "${SYNAPSE_GPU_TELEMETRY_AUTOSTART:-false}" = "true" ]; then
  pass "GPU telemetry autostart is enabled"
else
  warn "GPU telemetry autostart is disabled; compute pages will show the last persisted snapshot only"
fi

if command -v curl >/dev/null 2>&1 && curl --silent --fail --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  pass "health endpoint responded on port ${PORT}"
else
  warn "health endpoint is not reachable on port ${PORT}"
fi

exit "${status}"
