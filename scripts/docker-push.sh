#!/usr/bin/env bash
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
IMAGE="synapseaidlc/synapse-app"
PLATFORMS="linux/amd64,linux/arm64"
BUILDER_NAME="synapse-multiarch"

# ─── Resolve tag ─────────────────────────────────────────────────────────────
# Usage:
#   ./scripts/docker-push.sh              → tags: latest + git short SHA
#   ./scripts/docker-push.sh v1.2.3       → tags: v1.2.3 + latest
#   ./scripts/docker-push.sh --no-push    → build only, don't push
NO_PUSH=false
TAG=""

for arg in "$@"; do
  case "$arg" in
    --no-push) NO_PUSH=true ;;
    *)         TAG="$arg" ;;
  esac
done

GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

if [ -z "$TAG" ]; then
  TAG="$GIT_SHA"
fi

TAGS="-t ${IMAGE}:${TAG} -t ${IMAGE}:latest"

echo "============================================"
echo "  Synapse Docker Multi-Arch Build & Push"
echo "============================================"
echo "  Image:      ${IMAGE}"
echo "  Tag:        ${TAG}"
echo "  Platforms:  ${PLATFORMS}"
echo "  Git SHA:    ${GIT_SHA}"
echo "  Git Branch: ${GIT_BRANCH}"
echo "  Push:       $( [ "$NO_PUSH" = true ] && echo 'NO' || echo 'YES' )"
echo "============================================"
echo ""

# ─── Ensure buildx builder exists ───────────────────────────────────────────
if ! docker buildx inspect "$BUILDER_NAME" &>/dev/null; then
  echo "Creating buildx builder: ${BUILDER_NAME} ..."
  docker buildx create --name "$BUILDER_NAME" --driver docker-container --use
else
  echo "Using existing builder: ${BUILDER_NAME}"
  docker buildx use "$BUILDER_NAME"
fi

# Bootstrap the builder (pulls the buildkit image if needed)
docker buildx inspect --bootstrap

# ─── Build & Push ────────────────────────────────────────────────────────────
echo ""
echo "Building for platforms: ${PLATFORMS} ..."

BUILD_CMD="docker buildx build \
  --platform ${PLATFORMS} \
  --target production \
  --label org.opencontainers.image.source=https://github.com/synapseaidlc/synapse-app \
  --label org.opencontainers.image.revision=${GIT_SHA} \
  --label org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  ${TAGS}"

if [ "$NO_PUSH" = true ]; then
  # --load only works for single platform; for multi-arch without push, use --output
  echo "(--no-push mode: building without pushing)"
  eval "$BUILD_CMD --output type=image,push=false ."
else
  # Ensure logged in
  if ! docker info 2>/dev/null | grep -q "Username"; then
    echo "Not logged in to Docker Hub. Run 'docker login' first."
    exit 1
  fi
  eval "$BUILD_CMD --push ."
fi

echo ""
echo "Done! Image: ${IMAGE}:${TAG}"
if [ "$NO_PUSH" = false ]; then
  echo "Pushed: ${IMAGE}:${TAG} and ${IMAGE}:latest"
  echo ""
  echo "Pull with:"
  echo "  docker pull ${IMAGE}:${TAG}"
fi
