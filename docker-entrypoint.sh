#!/bin/sh
set -e

# Build DATABASE_URL from individual env vars if not already set
if [ -n "$DB_HOST" ] && [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

echo "Running database migrations (will retry for ~5 minutes while waiting for DB)..."
MAX_RETRIES=30
RETRY_INTERVAL=10
RETRY_COUNT=0
until pnpm db:migrate; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
    echo "Migration failed after ${MAX_RETRIES} retries. Exiting."
    exit 1
  fi
  echo "Migration failed (attempt ${RETRY_COUNT}/${MAX_RETRIES}). Retrying in ${RETRY_INTERVAL}s..."
  sleep "$RETRY_INTERVAL"
done
echo "Migration completed successfully."

echo "Starting application..."
exec "$@"
