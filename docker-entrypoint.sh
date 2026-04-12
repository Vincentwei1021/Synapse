#!/bin/sh
set -e

# Build DATABASE_URL from individual env vars if not already set
if [ -n "$DB_HOST" ] && [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

echo "Pushing database schema (will retry for ~5 minutes while waiting for DB)..."
MAX_RETRIES=30
RETRY_INTERVAL=10
RETRY_COUNT=0
until prisma db push --skip-generate --accept-data-loss; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
    echo "Schema push failed after ${MAX_RETRIES} retries. Exiting."
    exit 1
  fi
  echo "Schema push failed (attempt ${RETRY_COUNT}/${MAX_RETRIES}). Retrying in ${RETRY_INTERVAL}s..."
  sleep "$RETRY_INTERVAL"
done
echo "Schema push completed successfully."

echo "Starting application..."
exec "$@"
