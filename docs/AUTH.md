# Authentication Architecture

Synapse supports four authentication methods, all resolved through `getAuthContext()` in `src/lib/auth.ts`.

---

## Auth Context

All methods produce one of three context types:

```typescript
AuthContext = UserAuthContext | AgentAuthContext | SuperAdminAuthContext
```

| Type | `type` field | Key fields | Produced by |
|---|---|---|---|
| User | `"user"` | `companyUuid`, `actorUuid`, `email`, `name` | OIDC, Default Auth |
| Agent | `"agent"` | `companyUuid`, `actorUuid`, `roles[]`, `agentName`, `ownerUuid` | API Key |
| Super Admin | `"super_admin"` | `email` (no companyUuid) | Super Admin cookie |

Type guards: `isAgent(auth)`, `isUser(auth)`, `hasRole(auth, role)`.

---

## Resolution Cascade

`getAuthContext()` tries methods in priority order, returning on first match:

```
1. Authorization header
   ├── syn_* prefix       → API Key → AgentAuthContext
   ├── RS*/ES* algorithm  → OIDC JWT → UserAuthContext
   └── HS256 algorithm    → Synapse JWT → UserAuthContext

2. Session cookies
   └── user_session or admin_session → User or SuperAdmin

3. OIDC cookie (for SSE/EventSource)
   └── oidc_access_token cookie → UserAuthContext

4. null (unauthenticated)
```

---

## API Key (Agent)

Agents authenticate with `syn_` prefixed API keys.

**Flow**:
1. Agent sends `Authorization: Bearer syn_<base64url>`
2. Token is hashed with SHA-256
3. Lookup `ApiKey` by `keyHash`
4. Check: not revoked, not expired
5. Return `AgentAuthContext` with agent's roles, companyUuid, actorUuid

**Key generation**: `generateApiKey()` creates `syn_<32-byte-random-base64url>`. The raw key is shown once at creation; only the hash is stored.

**Security**: Uses `crypto.timingSafeEqual()` for comparison.

**Agent roles** determine MCP tool access:

| Role | Grants |
|---|---|
| `pre_research` | Literature tools, project context |
| `research` | Research question CRUD, hypothesis formulation |
| `experiment` | Experiment run claim/release/status, compute tools |
| `report` | Document CRUD, synthesis |

Old role values (`researcher_agent`, `research_lead_agent`, `pi_agent`) are accepted for backward compatibility.

**Key files**: `src/lib/api-key.ts`

---

## OIDC + PKCE (User)

Per-company OIDC configuration, stored in the `Company` table (no client secret needed).

**Flow**:
1. User enters email on login page
2. `POST /api/auth/identify` finds company by email domain
3. Frontend redirects to OIDC provider with PKCE
4. Provider redirects back with authorization code
5. Frontend exchanges code for tokens
6. `POST /api/auth/callback` verifies tokens, finds/creates user
7. Sets HTTP-only cookies: `oidc_access_token` (1h), `oidc_refresh_token` (30d), `oidc_client_id`, `oidc_issuer`

**Token verification**: Decodes JWT, fetches JWKS from `{issuer}/.well-known/jwks.json` (cached 10 min), verifies signature with `jose` library.

**OIDC config fields** (per Company):
- `oidcIssuer` — provider URL
- `oidcClientId` — client ID
- `oidcEnabled` — toggle

**Key files**: `src/lib/oidc-auth.ts`, `src/lib/oidc.ts`, `src/app/login/page.tsx`, `src/app/login/callback/page.tsx`

---

## Default Auth (User)

Simple email/password login for development and demo deployments.

**Environment variables**:
```bash
DEFAULT_USER="dev@synapse.local"
DEFAULT_PASSWORD="synapse123"
```

When both are set, the login page shows an email/password form.

**Flow**:
1. User enters email + password
2. `POST /api/auth/default-login` verifies credentials
3. `findOrCreateDefaultUser()` auto-provisions company and user
4. Creates two HS256 JWTs:

| Token | Cookie | Expiry |
|---|---|---|
| Access token | `user_session` | 1 hour |
| Refresh token | `user_refresh` | 7 days |

**Key files**: `src/lib/default-auth.ts`, `src/lib/user-session.ts`, `src/app/api/auth/default-login/route.ts`

---

## Super Admin

Platform-level administration across all tenants.

**Environment variables**:
```bash
SUPER_ADMIN_EMAIL="admin@example.com"
SUPER_ADMIN_PASSWORD_HASH="$2b$10$..."  # bcrypt hash
```

**Flow**:
1. `POST /api/auth/identify` detects super admin email
2. Redirects to `/login/admin`
3. Password verified with `bcrypt.compare()`
4. Creates HS256 JWT (`admin_session`, 24h expiry)

Super Admin has no `companyUuid` and can operate across all tenants.

**Key files**: `src/lib/super-admin.ts`, `src/app/api/admin/login/route.ts`

---

## Token Lifecycle

### Edge Middleware (`src/middleware.ts`)

Runs on every request (except static assets, `/login`, `/api/auth/*`):

- **OIDC**: Checks `oidc_access_token` expiry. If near expiry, refreshes via external token endpoint using `oidc_refresh_token`.
- **Default Auth**: Checks `user_session` expiry. If within 10 seconds, re-signs using `user_refresh` cookie (no external calls).

### Frontend Fallback (`src/app/(dashboard)/layout.tsx`)

On initial page load, `checkSession()` verifies the session via `GET /api/auth/session`. On 401, tries `POST /api/auth/refresh`. Additionally, a 45-minute proactive refresh interval prevents logout during long form sessions.

### Token Expiry Summary

| Token | Expiry | Refresh |
|---|---|---|
| OIDC access token | ~1h (provider) | Middleware -> external token endpoint |
| OIDC refresh token | ~30d (provider) | Used to refresh access token |
| Default access (`user_session`) | 1h | Middleware -> local JWT re-sign |
| Default refresh (`user_refresh`) | 7d | Used to refresh access token |
| Super Admin (`admin_session`) | 24h | `POST /api/auth/refresh` |
| API Key | Configurable / no expiry | N/A (long-lived) |

---

## Owner Scoping

Within a company, agent management enforces both `companyUuid` and `ownerUuid`:

- A user can only see/manage their own agents, API keys, and sessions
- Same-company visibility alone is not sufficient
- This is enforced in `src/services/agent.service.ts` and the agent management routes

---

## Security Patterns

| Pattern | Implementation |
|---|---|
| API key hashing | SHA-256, only hash stored |
| Timing-safe comparison | `crypto.timingSafeEqual()` |
| OIDC JWT verification | `jose` + JWKS (cached 10 min) |
| Super admin password | bcrypt hash in env var |
| HTTP-only cookies | All auth cookies |
| Secure flag | Production HTTPS only |
| SameSite=Lax | All auth cookies |
| PKCE | No client secret needed for OIDC |

---

## Key Files

| File | Purpose |
|---|---|
| `src/types/auth.ts` | `AuthContext` type definitions |
| `src/lib/auth.ts` | `getAuthContext()`, type guards, route decorators |
| `src/lib/api-key.ts` | API key generation, hashing, validation |
| `src/lib/oidc-auth.ts` | OIDC JWT verification via JWKS |
| `src/lib/oidc.ts` | OIDC client configuration |
| `src/lib/default-auth.ts` | Default auth helpers |
| `src/lib/user-session.ts` | JWT creation/verification, cookie helpers |
| `src/lib/super-admin.ts` | Super admin verification |
| `src/middleware.ts` | Edge Middleware (token auto-refresh) |
| `src/app/api/auth/default-login/route.ts` | Default login endpoint |
| `src/app/api/auth/callback/route.ts` | OIDC callback |
| `src/app/api/auth/identify/route.ts` | Email routing (OIDC vs default) |
| `src/app/api/auth/refresh/route.ts` | Token refresh endpoint |
| `src/app/api/admin/login/route.ts` | Super admin login |
