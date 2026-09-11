# MCP OAuth operator guide

Durabull hosts MCP on the same origin as the web app and API. Remote MCP clients must authenticate with OAuth 2.1 bearer tokens scoped for MCP.

Durabull uses the [Better Auth MCP plugin](https://better-auth.com/docs/plugins/mcp) for OAuth provider behavior, token validation (`getMcpSession` / `withMcpAuth`), and protected-resource metadata. Durabull adds phase-1 scope enforcement (`mcp:discover`, etc.) on top of Better Auth's session handling.

## Canonical resource URI

Use this value for RFC 8707 resource indicators and audience checks:

```text
{APP_BASE_URL}/mcp
```

Example (production): `https://app.durabull.io/mcp`

Do not add a trailing slash unless your OAuth client library requires it consistently everywhere.

`APP_BASE_URL` must be the **public origin clients use to reach `/mcp`** (same host/port as the API in production).

**Local monorepo dev:** the Vite app (`http://localhost:5173`) proxies `/mcp` and `/.well-known` to the API process. Set `APP_BASE_URL=http://localhost:5173` so PRM, tokens, and browser consent use one origin. Use `http://localhost:3001` only when calling the API directly without the web proxy (for example `tooling/scripts/mcp:e2e`).

## Browser consent flow

Durabull serves a first-party consent screen at **`/consent`** (configured via Better Auth `consentPage`).

Typical delegated-user flow:

1. MCP client opens `GET /api/auth/mcp/authorize` with **PKCE** and `resource={APP_BASE_URL}/mcp`. Durabull rewrites authorize requests for the canonical MCP resource to include all phase-1 read scopes and `prompt=consent` when the client omits them (common for Linear and other hosted MCP clients).
2. Unauthenticated users sign in at `/login` (Durabull preserves the authorize request).
3. Authenticated users review scopes at `/consent` and choose **Allow** or **Deny**.
4. Durabull redirects to the client `redirect_uri` with an authorization `code`.
5. Client exchanges the code at `POST /api/auth/mcp/token` with `resource={APP_BASE_URL}/mcp`.

Consent submission calls `POST /api/auth/oauth2/consent` (session cookie required). Deny returns `error=access_denied` to the client redirect URI.

**Not the same as Linear alerts OAuth:** [Linear integration](https://github.com/durabullhq/durabull/blob/main/apps/docs/content/documentation/integrations/linear.mdx) is Durabull acting as an OAuth **client** to Linear. MCP OAuth is Durabull acting as the **authorization server** for external MCP clients (Cursor, custom agents, etc.).

## Discovery endpoints

Better Auth serves OAuth metadata under `/api/auth/.well-known/*`. Durabull also exposes app-origin fallbacks for MCP clients that ignore `WWW-Authenticate` (per Better Auth docs):

| Endpoint | Purpose |
| --- | --- |
| `GET /.well-known/oauth-protected-resource` | PRM fallback (wraps `oAuthProtectedResourceMetadata`) |
| `GET /.well-known/oauth-authorization-server` | AS metadata fallback (wraps `oAuthDiscoveryMetadata`) |
| `GET /api/auth/.well-known/oauth-protected-resource` | PRM (Better Auth primary) |
| `GET /api/auth/.well-known/oauth-authorization-server` | Authorization Server Metadata (RFC 8414) |

Protected resource metadata advertises:

- `resource`: `{APP_BASE_URL}/mcp`
- `authorization_servers`: Better Auth base URL (e.g. `https://app.durabull.io/api/auth`); use `authorization_endpoint` from AS metadata for `/api/auth/mcp/authorize`
- `scopes_supported`: all MCP scopes — the read bundle (`mcp:discover`, `mcp:jobs:read`, `mcp:logs:read`, `mcp:failures:read`, `mcp:diagnostics:read`) and the write scopes (`mcp:jobs:retry`, `mcp:jobs:promote`, `mcp:queues:pause`, `mcp:failures:write`) — prefer PRM over AS metadata for MCP scope discovery

## Client configuration checklist

1. Register an OAuth client via `POST /api/auth/mcp/register`.
2. Complete authorization code + PKCE against `/api/auth/mcp/authorize` with `resource={APP_BASE_URL}/mcp` (Durabull injects phase-1 scopes and `prompt=consent` when missing).
3. Exchange the code at `/api/auth/mcp/token` with `resource={APP_BASE_URL}/mcp`.
4. Call MCP transport at `POST/GET/DELETE {APP_BASE_URL}/mcp` with `Authorization: Bearer <access_token>`.
5. Request at least the `mcp:discover` scope for transport smoke (`ping`). Queue/job/log tools require the read bundle (`mcp:jobs:read`, `mcp:logs:read`, `mcp:failures:read`, `mcp:diagnostics:read`). Authorize requests without explicit `mcp:*` scopes are expanded server-side to that bundle **only**.
6. Write tools need their write scope requested explicitly: `mcp:jobs:retry` (`retry_job`), `mcp:jobs:promote` (`promote_job`), `mcp:queues:pause` (`pause_queue`, `resume_queue`), `mcp:failures:write` (`resolve_alert_event`, `acknowledge_alert_event`, `unacknowledge_alert_event`, `snooze_alert_rule`, `unsnooze_alert_rule`). The consent screen labels these "can make changes".

**Linear / re-authorize:** If a connection was approved before this behavior, disconnect the MCP integration in Linear and authorize again so a new token is issued with the full scope set.

**Phase 2 migration:** `resolve_alert_event` moved from `mcp:failures:read` to `mcp:failures:write`. Tokens issued before phase 2 receive `403 insufficient_scope` on that tool until the client re-authorizes with the write scope; all read tools keep working.

Dynamic client registration (`POST /api/auth/mcp/register`) is rate-limited (**20 registrations/minute** per bearer or `cf-connecting-ip` / `x-real-ip`) but unauthenticated. Configure your edge to set one of those headers if you rely on per-IP limits behind a proxy. Monitor registration volume on public deployments and block at the edge if abused.

## HTTP semantics

| Condition | Status | Notes |
| --- | --- | --- |
| Missing / invalid bearer | `401` | Includes `WWW-Authenticate` with `resource_metadata` URL |
| Wrong resource binding | `401` | Token `resource` must match canonical URI when set |
| Missing required scope | `403` | `WWW-Authenticate` includes `error="insufficient_scope"` and required scopes |
| Invalid `Host` header | `403` | Host allowlist enforced before auth |

## Authless development

When `DURABULL_AUTHLESS=true`, use bearer token from `MCP_AUTHLESS_BEARER_TOKEN`. A built-in default exists only for **local non-production** dev (`durabull-authless-mcp`) — treat it as public knowledge and never expose authless on a reachable network without a strong rotated secret.

Never enable authless mode on Durabull Cloud (`DURABULL_CLOUD=true` refuses startup with authless enabled). **Internet-facing production must use OAuth** (`DURABULL_AUTHLESS=false`). Authless with `MCP_AUTHLESS_BEARER_TOKEN` is only for isolated lab networks, not DMZ or VPN-wide production substitutes.

Access tokens must validate against `{APP_BASE_URL}/mcp` (RFC 8707). Durabull sets the canonical resource on issuance and treats missing `resource` columns as the canonical URI during MCP ingress validation.

## Operations

MCP is enabled by default on every Durabull deployment. For post-deploy validation, telemetry signals, rate-limit behavior, and incident triage, see [mcp-operations-runbook.md](./mcp-operations-runbook.md).
