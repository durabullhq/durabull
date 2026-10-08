# MCP OAuth operator guide

Durabull hosts MCP on the same origin as the web app and API. Remote MCP clients must authenticate with OAuth 2.1 bearer tokens scoped for MCP.

Durabull uses the [Better Auth MCP plugin](https://better-auth.com/docs/plugins/mcp) for OAuth provider behavior, token validation (`getMcpSession` / `withMcpAuth`), and protected-resource metadata. Durabull adds catalog-driven read and write scope enforcement (`mcp:discover`, etc.) on top of Better Auth's session handling.

## Canonical resource URI

Use this value for RFC 8707 resource indicators and audience checks:

```text
{APP_BASE_URL}/mcp
```

Example (production): `https://app.durabull.io/mcp`

Do not add a trailing slash unless your OAuth client library requires it consistently everywhere.

`APP_BASE_URL` must be the **public origin clients use to reach `/mcp`** (same host/port as the API in production).

**Local monorepo dev:** the Vite app (`http://localhost:5173`) proxies `/mcp` and `/.well-known` to the API process. Set `APP_BASE_URL=http://localhost:5173` so PRM, tokens, and browser consent use one origin. Use `http://localhost:3001` only when calling the API directly without the web proxy (for example `bun run --filter @durabull/scripts mcp:e2e`).

## Client authorization

Durabull serves first-party consent at `/consent`.

1. Register the client with `POST /api/auth/mcp/register`.
2. Open `GET /api/auth/mcp/authorize` with authorization code + PKCE, the registered redirect URI,
   and `resource={APP_BASE_URL}/mcp`. Canonical MCP requests always include `openid` and the
   five read scopes; write scopes must be requested explicitly. An absent prompt or `prompt=none`
   becomes `prompt=consent`.
3. Unauthenticated users sign in at `/login`; the authorize request is preserved. Users then
   review scopes at `/consent` and choose **Allow** or **Deny**.
4. Exchange the returned authorization code at `POST /api/auth/mcp/token`, including the PKCE
   verifier and the same resource URI.
5. Send `Authorization: Bearer <access_token>` to `{APP_BASE_URL}/mcp` for `POST`, `GET`, or `DELETE`.

`mcp:discover` is required for transport smoke (`ping`). Queue, job, log, and diagnostic tools
require their catalog scopes; see the [MCP scope and tool tables](../apps/docs/content/documentation/integrations/mcp-server.mdx).
Write scopes must be requested explicitly and are labeled **can make changes** on the consent screen.

Consent submission uses `POST /api/auth/oauth2/consent` with a session cookie. Denial redirects
with `error=access_denied`.

This differs from [Linear alerts OAuth](../apps/docs/content/documentation/integrations/linear.mdx):
there Durabull is Linear's OAuth client; for MCP, Durabull authorizes external clients.

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

## Reauthorization and registration safety

**Linear / re-authorize:** If a connection was approved before this behavior, disconnect the MCP integration in Linear and authorize again so a new token is issued with the full scope set.

**Phase 2 migration:** `resolve_alert_event` moved from `mcp:failures:read` to `mcp:failures:write`. Tokens issued before phase 2 receive `403 insufficient_scope` on that tool until the client re-authorizes with the write scope; all read tools keep working.

Dynamic client registration (`POST /api/auth/mcp/register`) is rate-limited (**20 registrations/minute** per bearer or trusted client-IP key) but unauthenticated. Set `TRUST_PROXY=true` only behind a proxy that replaces forwarding headers (`cf-connecting-ip`, `x-real-ip`, or `x-forwarded-for`); `DURABULL_CLOUD` also enables proxy trust. Without trusted headers, unauthenticated clients share a fallback key. Monitor registration volume on public deployments and block at the edge if abused.

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
