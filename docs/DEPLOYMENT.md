# Deployment Guide

## Authentication Options

Synapse supports three auth modes. Choose based on your use case.

### Option 1: Default Auth (Development / Personal Use)

Single-user email/password login. No external dependencies.

```bash
DEFAULT_USER="yourname@example.com"
DEFAULT_PASSWORD="your-strong-password"
```

Set these in `.env` and restart. The login page shows an email/password form. User and company are auto-provisioned on first login.

**Limitation**: Only one user account. Everyone shares the same login.

### Option 2: Default Auth with Multiple Users

For small teams (2-5 people) without OIDC infrastructure. Extend Default Auth to support a JSON list of users:

```bash
DEFAULT_USERS='[
  {"email":"alice@example.com","password":"xxx","name":"Alice"},
  {"email":"bob@example.com","password":"yyy","name":"Bob"}
]'
```

> **Note**: This requires a code change to `src/lib/default-auth.ts` — not yet implemented as a built-in feature.

### Option 3: OIDC (Production / Team Use)

Standard OpenID Connect with PKCE. Synapse doesn't store passwords — authentication is delegated to an external identity provider.

**Supported providers**: Any OIDC-compliant provider — Google Workspace, Auth0, Okta, Keycloak, AWS Cognito, Microsoft Entra ID, etc.

**How it works**:

1. User enters email on login page (e.g. `alice@yourcompany.com`)
2. Synapse looks up the email domain to find the matching Company in the database
3. Browser redirects to the company's configured OIDC provider
4. User authenticates there (password, SSO, MFA — whatever the provider requires)
5. Provider redirects back to Synapse with an authorization code
6. Synapse exchanges the code for user info, creates/matches the user, sets session cookies

**Multi-tenant routing**: Different companies can use different providers. The email domain determines which provider to redirect to:

| Email domain | Company | Provider |
|---|---|---|
| `@yourcompany.com` | Your Company | Google Workspace |
| `@partner.org` | Partner Org | Auth0 |
| `@university.edu` | University Lab | Keycloak |

#### Setting up OIDC

**Step 1**: Create an OAuth 2.0 / OIDC client in your provider:

- Application type: **Public client** (no client secret needed — Synapse uses PKCE)
- Redirect URI: `https://your-synapse-domain.com/login/callback`
- You'll get a **Client ID** and know the **Issuer URL**

Common issuer URLs:
| Provider | Issuer URL |
|---|---|
| Google | `https://accounts.google.com` |
| Auth0 | `https://your-tenant.auth0.com` |
| Cognito | `https://cognito-idp.{region}.amazonaws.com/{userPoolId}` |
| Keycloak | `https://your-host/realms/{realm}` |
| Okta | `https://your-org.okta.com` |

**Step 2**: In Synapse Super Admin panel (`/admin`), create a Company with:

- `oidcIssuer`: the issuer URL from above
- `oidcClientId`: the client ID from above
- `oidcEnabled`: true

**Step 3**: Remove `DEFAULT_USER` and `DEFAULT_PASSWORD` from your environment to disable the fallback login.

#### AWS Cognito Setup (for Amazon / AWS environments)

If you're in an AWS environment and want to use Cognito as your OIDC provider:

1. Create a **Cognito User Pool** in the AWS Console
2. Add users manually or enable self-registration
3. Create an **App Client**:
   - Type: Public client
   - Auth flows: Authorization code grant
   - Callback URL: `https://your-synapse-domain.com/login/callback`
   - Scopes: `openid`, `email`, `profile`
4. Configure in Synapse:
   - `oidcIssuer`: `https://cognito-idp.{region}.amazonaws.com/{userPoolId}`
   - `oidcClientId`: the App Client ID

**Optional — Corporate SSO federation**: If you want users to log in with corporate SSO (e.g. Amazon Midway, Okta), add a SAML or OIDC identity provider to the Cognito User Pool. Users click login → Cognito → corporate SSO → back to Synapse.

---

## Production Deployment

### Build and Start

```bash
pnpm build          # Prisma generate + Next.js build
pnpm start          # Standalone server via scripts/start-standalone.sh
```

Or with Docker:

```bash
pnpm docker:build   # Build image
pnpm docker:up      # Start all services
```

### Environment Variables

```bash
# Required
DATABASE_URL="postgresql://user:pass@host:5432/synapse"
NEXTAUTH_SECRET="<random-32-char-string>"    # JWT signing key
SYNAPSE_HOSTNAME="0.0.0.0"                   # Bind address

# Super Admin
SUPER_ADMIN_EMAIL="admin@yourorg.com"
SUPER_ADMIN_PASSWORD_HASH="$2b$10$..."       # bcrypt hash

# Optional
REDIS_URL="redis://host:6379"                # Required for multi-instance
SEMANTIC_SCHOLAR_API_KEY="..."               # Improves paper search rate limit
OPENALEX_EMAIL="your@email.com"             # OpenAlex polite pool (higher rate limit)
```

### Database

- Use `pnpm db:migrate` (not `db:push`) for production
- Recommended: managed PostgreSQL (AWS RDS, Supabase, Neon, etc.)
- Run `pnpm db:generate` after any schema change

### HTTPS

Synapse should run behind a reverse proxy with TLS:

- **Nginx + Let's Encrypt**: standard setup
- **Caddy**: automatic HTTPS
- **Cloudflare Tunnel**: no open ports needed

Auth cookies use `Secure` flag in production, so HTTPS is required.

### Connecting AI Agents

See [README — Connect AI Agents](../README.md#connect-ai-agents) for OpenClaw and Claude Code plugin setup.

Agent API keys (`syn_*` prefix) are created in the Agents page. Each key is scoped to a user and company.
