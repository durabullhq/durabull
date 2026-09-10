# MCP operations runbook

Operator guide for deploying, validating, and troubleshooting Durabull's hosted MCP endpoint on the **unified** API + web deployment.

MCP is **always available** at `{APP_BASE_URL}/mcp` when the Durabull API process is running. There is no separate MCP service, container, or public port in phase 1.

For OAuth client setup and HTTP status semantics, see [mcp-oauth-operator.md](./mcp-oauth-operator.md).

For GA documentation (release gates, compliance, security closure, validation evidence), see [mcp-ga-index.md](./mcp-ga-index.md).

## Deployment model

| Surface | URL | Notes |
| --- | --- | --- |
| MCP transport | `{APP_BASE_URL}/mcp` | Streamable HTTP (`GET` / `POST` / `DELETE`) |
| Protected resource metadata | `GET /.well-known/oauth-protected-resource` | Same origin as API |
| OAuth (Better Auth) | `/api/auth/mcp/*` | Register, authorize, token |
| REST API | `{APP_BASE_URL}/api/*` | Unchanged |

**Cloud (Durabull):** one web service exposes `/`, `/api/*`, and `/mcp` on the app domain (for example `https://app.durabull.io/mcp`).

**Self-hosted:** publish a single app port (default `3000`). Do not expose a second port for MCP.

## Required environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_BASE_URL` | **Yes** (internet-facing / OAuth MCP) | Public origin; canonical resource `{APP_BASE_URL}/mcp` and Host allowlist |
| `VITE_PUBLIC_APP_URL` | Recommended | Browser app origin (match `APP_BASE_URL` in production) |
| `BETTER_AUTH_SECRET` | Yes when `DURABULL_AUTHLESS=false` | Session and OAuth signing |
| `DURABULL_AUTHLESS` | — | Must be `false` on internet-facing production |

Optional MCP-related toggles:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DISABLE_RATE_LIMIT` | unset | When `true`, disables **all** in-memory API + MCP ingress + per-tool limits (not recommended in production) |
| `MCP_TELEMETRY_LOG` | enabled | Set `false` to suppress stdout `mcp_telemetry` JSON lines |
| `MCP_AUTHLESS_BEARER_TOKEN` | dev-only default in non-prod | Strong secret required when `DURABULL_AUTHLESS=true` and `NODE_ENV=production` on isolated lab networks only |

## Tenancy and policy bindings

Service accounts are **org-scoped**. Tool calls still pass `connectionId` in arguments; policy enforces that the connection belongs to the principal's org.

- Grant **least-privilege** `mcp_policy_binding` rows per **`toolName` + `scope`** (service accounts are always org-scoped).
- Avoid `toolName: null` bindings — they grant the scope for **all** tools.
- OAuth scopes alone do not replace bindings for service accounts — both are required.
- Resource reads bind under `toolName = 'resource:<name>'` (`resource:server`, `resource:connections`, `resource:connection_queues`, `resource:queue`, `resource:connection_alerts`).
- Optional-evidence tools (`explain_job_failure`, `get_connection_overview`) include a section only when the service account holds **both** the token scope and a binding for that scope on that tool. Missing evidence is reported in the response, not as a denial.
- Write scopes (`mcp:jobs:retry`, `mcp:jobs:promote`, `mcp:queues:pause`, `mcp:failures:write`) are never injected into consent. Grant them to service accounts deliberately and per tool.
- `acknowledge_alert_event` is user-only; service accounts get `validation_error` because acknowledgement records who acknowledged.
- Delegated users need org membership **and** connection access; cross-org `connectionId` values are denied.

## Post-deploy validation

Run after every deploy or ingress/TLS change. Use **staging or local** for automated smoke; do not run full `mcp:e2e` against production (see below).

### 1. Health and origin

```bash
export APP_BASE_URL=https://your-staging-domain.example

curl -fsS "$APP_BASE_URL/api/health" | jq .
curl -fsS "$APP_BASE_URL/.well-known/oauth-protected-resource" | jq .resource
```

Expect `resource` to equal `"${APP_BASE_URL}/mcp"` (no trailing slash unless your client requires it everywhere).

### 2. Unauthenticated challenge

```bash
HOST="${APP_BASE_URL#*://}"; HOST="${HOST%%/*}"
curl -si -X POST "$APP_BASE_URL/mcp" \
  -H "Host: $HOST" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}' \
  | head -20
```

Expect HTTP `401` and a `WWW-Authenticate` header with `resource_metadata`.

Production: steps 1–2 are sufficient for a lightweight check. Skip step 3 unless you are on a disposable staging database.

### 3. Automated smoke (staging / local only)

**Warning:** `mcp:e2e` registers an OAuth client (`POST /api/auth/mcp/register`) and, when `DATABASE_URL` is set, inserts access tokens into `oauth_access_token`. It does not clean up. **Never** point this at production or a production `DATABASE_URL`.

From repo root with API running:

```bash
cd tooling/scripts
APP_BASE_URL="$APP_BASE_URL" bun run mcp:e2e
```

Better Auth mode expects `DATABASE_URL` on a **staging** database. Authless mode (Docker/production image): `DURABULL_AUTHLESS=true MCP_AUTHLESS_BEARER_TOKEN=... APP_BASE_URL=... bun run mcp:e2e`.

### 4. Self-host Docker quick check

After `docker compose up`:

```bash
export APP_BASE_URL=http://localhost:3000
curl -fsS "$APP_BASE_URL/api/health"
curl -fsS "$APP_BASE_URL/.well-known/oauth-protected-resource" | jq .resource
```

## Observability

### Structured logs (`mcp_telemetry`)

Stdout JSON lines with `"type":"mcp_telemetry"`. Emitted signals today:

| Signal | Meaning | Operator action |
| --- | --- | --- |
| `policy_denied` | Org/connection boundary or missing binding | Review principal org membership and `mcp_policy_binding` rows |
| `rate_limited_ingress` | `/mcp` burst exceeded (120 req/min per key) | Fix client retry storms; add edge rate limiting — scaling replicas **increases** effective quota (per-process counters) |
| `rate_limited_tool` | Per-tool cap hit | Reduce parallelism; see heavy-tool list below |
| `tool_success` / `tool_error` | Tool outcome | Correlate with `mcp_audit_event` |
| `redaction_applied` | Sanitizer redacted fields | Expected for sensitive payloads |
| `audit_dropped` / `audit_write_failed` | Audit backpressure/DB | Check Postgres load and `mcp_audit_event` health |

Auth failures (`401` / `403`) are returned on the HTTP response; monitor access logs and `WWW-Authenticate` challenges until dedicated auth telemetry is wired.

Disable stdout telemetry only if your platform duplicates logs elsewhere: `MCP_TELEMETRY_LOG=false`.

### Structured logs (`telemetry_queue`)

Telemetry ingestion is best-effort and protected by bounded in-process queues. When a telemetry queue is full, the API emits a stdout JSON line with `"type":"telemetry_queue"` and `"signal":"queue_dropped"` before dropping the new item.

| Queue name | Source | Meaning | Operator action |
| --- | --- | --- | --- |
| `telemetry_collect` | `POST /api/telemetry/collect` cloud ingestion | Cloud collector cannot enqueue another forwarded batch | Check API CPU/network saturation and PostHog ingestion latency |
| `telemetry_events` | `POST /api/telemetry/events` local browser telemetry | Self-host/local instance cannot enqueue another product event | Check local API saturation; telemetry loss should not affect product behavior |
| `mcp_analytics` | MCP product analytics forwarding | MCP analytics event dropped under backpressure | Check MCP traffic spikes and PostHog ingestion latency |

Example log shape:

```json
{"type":"telemetry_queue","signal":"queue_dropped","queueName":"mcp_analytics","count":1,"dropped":3,"inFlight":8,"queued":512}
```

### Per-tool rate limits (60/min default, 30/min heavy tools)

Enforced when `NODE_ENV=production` (skipped in local `development` / `test` unless you run with production `NODE_ENV`).

Heavy tools (**30/min**, flagged `heavy` in the catalog): `get_job_logs`, `get_job_stacktraces`, `explain_job_failure`, `get_failure_events`, `get_queue_metrics`, `find_job`, `get_connection_overview`, `list_scheduled_jobs`, `get_redis_health`, `get_alert_summary`. All other tools default to **60/min per tool name**. `resources/read` is limited at **60/min per resource name** (`resource:<name>`).

Draft SLO targets: [release checklist — Draft SLO candidates](./mcp-ga-release-checklist.md#draft-slo-candidates-not-validated).

Ingress limit (**120/min**) applies to all `/mcp` HTTP methods (initialize, session traffic, and `tools/call`), not only tool calls.

### Audit table (`mcp_audit_event`)

Successful `tools/call` and `resources/read` paths **best-effort** write a row with principal, tool name (or `resource:<name>`), SHA-256 input hash, `granted`, and `response_class` (`success`, `tool_error`, `policy_denied`, `rate_limited`). Under backpressure, events may be dropped (`audit_dropped` in `mcp_telemetry`). Transport auth failures (`401`/`403` before tool execution) are not recorded here.

Example triage query (Postgres):

```sql
SELECT created_at, tool_name, granted, response_class, denial_reason
FROM mcp_audit_event
ORDER BY created_at DESC
LIMIT 50;
```

### Suggested metrics (log-derived)

Wire your aggregator to count per hour:

- `mcp_telemetry` where `signal` = `policy_denied`
- `mcp_telemetry` where `signal` in (`rate_limited_ingress`, `rate_limited_tool`)
- `mcp_telemetry` where `signal` = `tool_error`
- `telemetry_queue` where `signal` = `queue_dropped`, grouped by `queueName`
- HTTP `401` / `403` / `429` on `/mcp` (access logs or edge metrics)
- `POST /api/auth/mcp/register` volume (dynamic client registration is rate-limited but unauthenticated)

Alert thresholds are environment-specific; start with sustained 5× baseline on rate limits and policy denies.

### SEC-04 edge alert (pre-GA)

Before announcing customer MCP GA, configure an edge or access-log alert on **`POST /api/auth/mcp/register`** (unauthenticated dynamic registration). Example thresholds:

- **Warning:** > 50 registrations / 5 min per environment (adjust to baseline)
- **Critical:** sustained > 200 / 5 min or spike > 10× 7-day median

Mitigation: block path at edge, rotate compromised clients, review `oauth_client` rows and `mcp_audit_event`.

## Common incidents

### Clients receive `403` on `Host`

**Cause:** `Host` header does not match allowlist derived from `APP_BASE_URL` and localhost dev hosts.

**Fix:** Set `APP_BASE_URL` to the exact public origin (scheme + host + port). Configure the reverse proxy so the upstream receives the **public** hostname as `Host` (do not rely on a mismatched internal hostname).

### OAuth works in API but MCP client cannot connect

Full checklist: see [mcp-oauth-operator.md](./mcp-oauth-operator.md). Common causes: wrong `resource`, missing scopes, missing service-account bindings, wrong `Host`.

### `429` on diagnostic tools

**Cause:** Ingress **120 req/min** per bearer (or IP), or per-tool limits — **60/min** default, **30/min** for heavy tools listed above.

**Fix:** Reduce client parallelism. Do not set `DISABLE_RATE_LIMIT` in production unless you enforce limits at the edge (it disables **all** API rate limiting, not only MCP).

### Multi-replica rate limit drift

Ingress and per-tool limits are **in-memory per process**. Each replica enforces its own window; adding replicas multiplies effective quota.

**Mitigation:** Terminate TLS at a shared edge limiter with global limits, or plan Redis-backed limits (not shipped in phase 1).

## Key rotation

| Secret | Rotation |
| --- | --- |
| `BETTER_AUTH_SECRET` | Rotate per Better Auth guidance; invalidates sessions |
| OAuth client secrets | Re-register or rotate via Better Auth MCP client APIs |
| Service account secrets | Use DAL rotation APIs (`issueServiceAccountSecret` / `rotateServiceAccountSecret`); update automation immediately |
| `MCP_AUTHLESS_BEARER_TOKEN` | Lab-only; rotate if authless is used; update all MCP clients |

After rotation, run `mcp:e2e` on **staging/local** before closing the change.

## TLS and reverse proxy

- Terminate TLS at your edge; forward to Durabull on the app port.
- Path-based routing: `/mcp` must reach the Durabull API process (same upstream as `/api/*`).
- Present the public hostname as `Host` to the upstream.
- No second hostname is required for MCP in phase 1.
- WebSocket upgrades are not required for Streamable HTTP MCP in phase 1.

## Related documentation

- User-facing: `apps/docs/content/documentation/integrations/mcp-server.mdx`
- OAuth: [mcp-oauth-operator.md](./mcp-oauth-operator.md)
- Security: `apps/docs/content/documentation/operations/security-and-hardening.mdx`
