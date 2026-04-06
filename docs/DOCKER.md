# Synapse Docker Deployment

Image: **`vincentwei1021/synapse`**

Architectures: `linux/amd64`, `linux/arm64`

Base image: `node:22-alpine`

---

## Quick Start (Docker Compose)

```bash
docker compose up -d
```

The included `docker-compose.yml` starts Synapse, PostgreSQL 16, and Redis 7:

```yaml
services:
  app:
    image: vincentwei1021/synapse:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://synapse:synapse@db:5432/synapse
      - REDIS_URL=redis://default:synapse-redis@redis:6379
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-synapse-docker-secret-change-in-production}
      - COOKIE_SECURE=${COOKIE_SECURE:-false}
      - DEFAULT_USER=${DEFAULT_USER:-}
      - DEFAULT_PASSWORD=${DEFAULT_PASSWORD:-}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass synapse-redis
    volumes:
      - redis-data:/data

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: synapse
      POSTGRES_PASSWORD: synapse
      POSTGRES_DB: synapse
    volumes:
      - synapse-data:/var/lib/postgresql/data
```

Open http://localhost:3000. Log in with `DEFAULT_USER`/`DEFAULT_PASSWORD` if set.

---

## Standalone Docker Run

```bash
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@your-db:5432/synapse \
  -e NEXTAUTH_SECRET=your-random-secret \
  -e DEFAULT_USER=admin@example.com \
  -e DEFAULT_PASSWORD=your-password \
  vincentwei1021/synapse:latest
```

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://user:pass@host:port/dbname`). Or use individual `DB_*` vars below. |
| `NEXTAUTH_SECRET` | Secret for signing JWT tokens. Generate with `openssl rand -base64 32`. |

### Database (alternative to DATABASE_URL)

| Variable | Description |
|---|---|
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port (default: 5432) |
| `DB_USERNAME` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_NAME` | Database name |

### Redis (optional)

Redis enables cross-instance SSE event propagation. Without it, Synapse falls back to in-memory pub/sub (single-instance only).

| Variable | Description |
|---|---|
| `REDIS_URL` | Full connection string (`redis://username:password@host:port`). Takes precedence over individual vars. |
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port (default: 6379) |
| `REDIS_USERNAME` | Redis username (default: `default`) |
| `REDIS_PASSWORD` | Redis password |

### Authentication

| Variable | Description |
|---|---|
| `DEFAULT_USER` | Email for built-in login (bypasses OIDC). Auto-provisions user and company on first login. |
| `DEFAULT_PASSWORD` | Password for default user. |
| `NEXTAUTH_URL` | Public base URL (default: `http://localhost:3000`). Set when behind a reverse proxy. |
| `COOKIE_SECURE` | `"false"` for HTTP-only deployments, `"true"` for HTTPS (default: `"false"` in docker-compose). |

### Super Admin

| Variable | Description |
|---|---|
| `SUPER_ADMIN_EMAIL` | Email for the super admin account (access to `/admin` panel). |
| `SUPER_ADMIN_PASSWORD_HASH` | Bcrypt hash. Generate: `node -e "require('bcrypt').hash('password',10).then(console.log)"` |

---

## Startup Behavior

1. The entrypoint runs `prisma migrate deploy` to apply pending database migrations
2. If the database is not ready, retries every 10 seconds (up to 30 attempts / 5 minutes)
3. Next.js server starts on port 3000

---

## Database Setup

For fresh deployments, migrations run automatically on startup. For development with the source repo:

```bash
pnpm docker:db        # Start postgres + redis only
pnpm db:migrate       # Apply migrations
pnpm dev              # Start dev server
```

---

## Production Notes

- Set `COOKIE_SECURE=true` when deploying with HTTPS
- Set a strong `NEXTAUTH_SECRET` (not the default)
- OIDC configuration is per-company, managed through the super admin panel at `/admin`
- Redis is recommended for multi-instance deployments (SSE event propagation)
- GPU telemetry is controlled per-node via the compute page toggle
