#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STANDALONE_DIR="${ROOT_DIR}/.next/standalone"
STATIC_SRC="${ROOT_DIR}/.next/static"
STATIC_DEST="${STANDALONE_DIR}/.next/static"
PUBLIC_SRC="${ROOT_DIR}/public"
PUBLIC_DEST="${STANDALONE_DIR}/public"

if [ ! -f "${STANDALONE_DIR}/server.js" ]; then
  echo "Standalone server not found. Run 'pnpm build' first." >&2
  exit 1
fi

mkdir -p "${STATIC_DEST}"
rm -rf "${STATIC_DEST}"
cp -R "${STATIC_SRC}" "${STATIC_DEST}"

if [ -d "${PUBLIC_SRC}" ]; then
  rm -rf "${PUBLIC_DEST}"
  cp -R "${PUBLIC_SRC}" "${PUBLIC_DEST}"
fi

cd "${STANDALONE_DIR}"
export HOSTNAME="${SYNAPSE_HOSTNAME:-127.0.0.1}"
exec node server.js
