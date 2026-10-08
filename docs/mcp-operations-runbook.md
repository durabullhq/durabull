# MCP operations runbook

Operator guide for deploying, validating, and troubleshooting Durabull's hosted MCP endpoint on the **unified** API + web deployment.

MCP is **always available** at `{APP_BASE_URL}/mcp` when the Durabull API process is running. There is no separate MCP service, container, or public port.

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

### TLS and reverse proxy

- Terminate TLS at your edge; forward to Durabull on the app port.
- Path-based routing: `/mcp` must reach the Durabull API process (same upstream as `/api/*`).
- Present the public hostname as `Host` to the upstream.
- No second hostname is required for MCP.
- WebSocket upgrades are not required for Streamable HTTP MCP.

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
| `DISABLE_RATE_LIMIT` | unset | When `true`, disables **all** in-memory API + MCP ingress + work-class limits (not recommended in production) |
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

For the shipped Docker setup, use `APP_BASE_URL=http://localhost:3000` (or your configured port).

Expect `resource` to equal `"${APP_BASE_URL}/mcp"` (no trailing slash unless your client requires it everywhere).

### 2. Unauthenticated challenge

```bash
HOST="${APP_BASE_URL#*://}"; HOST="${HOST%%/*}"
curl -si -X POST "$APP_BASE_URL/mcp" \
  -H "Host: $HOST" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}' \
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

## Observability

### Structured logs (`mcp_telemetry`)

Stdout JSON lines with `"type":"mcp_telemetry"`. Emitted signals today:

| Signal | Meaning | Operator action |
| --- | --- | --- |
| `policy_denied` | Org/connection boundary or missing binding | Review principal org membership and `mcp_policy_binding` rows |
| `rate_limited_ingress` | `/mcp` transport burst exhausted (600 capacity, 20 requests/sec refill) | Reduce retry storms; see limits below |
| `rate_limited_tool` | Authenticated work-class budget exhausted (discovery/read/heavy/write) | Honor `Retry-After`, reduce parallelism; see [Agent workflow rate limits](#agent-workflow-rate-limits) |
| `tool_success` / `tool_error` | Tool outcome | Correlate with `mcp_audit_event` |
| `redaction_applied` | Sanitizer redacted fields | Expected for sensitive payloads |
| `audit_dropped` / `audit_write_failed` | Audit backpressure/DB | Check Postgres load and `mcp_audit_event` health |

Auth failures (`401` / `403`) emit `auth_missing_bearer`, `auth_unauthorized` or `auth_forbidden` signals and `mcp_auth_failed` analytics. Monitor these alongside access logs and `WWW-Authenticate` challenges.

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

### Agent workflow rate limits

Enforced when `NODE_ENV=production` (skipped in local `development` / `test` unless you run with production `NODE_ENV`).

Authenticated requests share budgets by validated user plus OAuth client (or service-account client), so token refresh does not reset them. Different users and OAuth clients are isolated. Each budget refills continuously; rejected requests do not add debt. The capacity permits a burst, while refill controls sustained throughput.

| Budget | Burst capacity | Refill per second | Applies to |
| --- | --- | --- | --- |
| Discovery/setup | 120 | 10 | Protocol discovery, prompts, ping, connections, server metadata and static App shell |
| Reads | 180 | 6 | Ordinary queue/job/worker/rule reads |
| Diagnostics | 90 | 3 | Catalog `heavy` tools and connection queue/alert resources |
| Writes | 30 | 1 | All mutations together |
| Transport | 600 | 20 | HTTP ingress per bearer hash or trusted IP for anonymous requests; OPTIONS excluded |

The wildcard `/mcp/*` covers the root `/mcp` too. Register once; a per-request guard also prevents double charging. Setup has its own budget and remains available when diagnostics are exhausted. All four authenticated budgets remain subject to the transport ceiling.

On exhaustion, HTTP 429 includes the computed `Retry-After` for the next token (normally one second with these defaults). JSON-RPC errors preserve the request ID and include `data.retryAfter` and `data.bucket`. The transport response uses `retryAfter` and `bucket`. `X-RateLimit-Reset` is seconds until that bucket fills, not the required retry delay. Use Retry-After for scheduling retries, and never replay an uncertain mutation without first reading its state.

Policies live in `apps/api/src/mcp/middleware/rate-limit-policy.ts`. Storage is bounded to 4096 buckets per limiter, expires full idle entries and evicts least recently used entries when necessary. This is process-local abuse protection, not a cross-replica billing quota. OAuth registration retains its separate 20/minute limit.

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
- `mcp_telemetry` where `signal` in (`rate_limited_ingress`, `rate_limited_tool`): transport burst exhaustion and authenticated work-class budget exhaustion, respectively
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

**Cause:** A transport or work-class burst budget was exhausted; see [Agent workflow rate limits](#agent-workflow-rate-limits).

**Fix:** Honor Retry-After, use bounded concurrency and retain pagination cursors. Inspect the reported bucket; reconnecting does not increase an authenticated work budget. Do not set `DISABLE_RATE_LIMIT` in production unless you enforce limits at the edge (it disables **all** API rate limiting, not only MCP).

### Multi-replica rate limit drift

Ingress and work-class limits are **in-memory per process**. Each replica enforces its own window; adding replicas multiplies effective quota.

**Mitigation:** Terminate TLS at a shared edge limiter with global limits, or plan Redis-backed limits (not currently shipped).

## Key rotation

| Secret | Rotation |
| --- | --- |
| `BETTER_AUTH_SECRET` | Rotate per Better Auth guidance; invalidates sessions |
| OAuth client secrets | Re-register or rotate via Better Auth MCP client APIs |
| Service account secrets | Use DAL rotation APIs (`issueServiceAccountSecret` / `rotateServiceAccountSecret`); update automation immediately |
| `MCP_AUTHLESS_BEARER_TOKEN` | Lab-only; rotate if authless is used; update all MCP clients |

After rotation, run `mcp:e2e` on **staging/local** before closing the change.

## Related documentation

- User-facing: [MCP Server](../apps/docs/content/documentation/integrations/mcp-server.mdx)
- OAuth: [mcp-oauth-operator.md](./mcp-oauth-operator.md)
- Security: [Security and Hardening](../apps/docs/content/documentation/operations/security-and-hardening.mdx)

### MCP PostHog coverage

The API records the following server events when production analytics is enabled. MCP tracking uses the same HMAC user distinct ID as other identified server analytics. Each service account has its own HMAC principal distinct ID; organization groups are hashed once. Requests without a validated identity stay anonymous.

| Event | Coverage |
| --- | --- |
| `mcp_oauth_requested`, `mcp_oauth_completed` | Discovery, registration, authorization, consent, token exchange and refresh, session/userinfo/JWKS endpoints; includes HTTP failures and throttling |
| `mcp_client_registered`, `mcp_consent_granted`, `mcp_consent_denied` | Successful registration and processed consent decisions, rather than browser clicks |
| `mcp_request_completed` | Every ingress HTTP request, including GET/DELETE/OPTIONS, Host/Origin/body-limit rejection, authentication failures and ingress throttling |
| `mcp_auth_succeeded`, `mcp_auth_failed` | Validated bearer authentication per HTTP request and missing/invalid bearer or insufficient transport scopes |
| `mcp_rpc_requested`, `mcp_rpc_completed` | Every POST, including tools, resources, prompts, discovery, ping, completion, logging, notifications, invalid JSON/batches and unsupported methods |
| `$mcp_initialize` | Every initialize handshake and its outcome; this stateless transport has no persistent session or disconnect lifecycle |
| `$mcp_tool_call` | One final outcome per tools/call, including unknown tools, authentication/policy/rate rejection, SDK input/output validation errors and handler errors |
| `$mcp_tools_list` | Tool discovery, with `$mcp_listed_tool_names` from the advertised response |
| `$mcp_resources_list`, `$mcp_resource_read` | Resource/template discovery and reads; resource names use catalog URI templates to remove tenant identifiers |
| `$mcp_prompts_list`, `$mcp_prompt_get` | Prompt discovery and retrieval (PostHog declares these in its Ruby SDK contract) |
| `mcp_tool_denied`, `mcp_rate_limited` | Policy/principal/scope/connection denials and ingress/tool work budgets |
| `mcp_operational_signal` | Redaction, dropped audit events and audit write failures |

Canonical event names and property keys use the constants exported by `@posthog/mcp`, pinned to 0.22.2. See [PostHog’s wire contract](https://posthog.com/docs/mcp-analytics/events). OAuth, authentication, transport, RPC and operational events remain custom events because the contract declares no standard equivalents. Go-only unknown-tool/input-required events and the optional get_more_tools virtual tool do not apply to this server.

All MCP events carry `$mcp_source: "posthog_mcp_analytics"`, `$mcp_server_name` and `$mcp_server_version`. HTTP requests carry `$session_id` in `ses_<32-hex>` form, derived from a protocol session header when present, otherwise newly generated per stateless request; a user/principal ID is not a protocol session. Canonical outcome events carry `$mcp_duration_ms`, `$mcp_is_error` when observed, and a fixed `$mcp_error_type` on failure. Client attribution uses `$mcp_client_name`, `$mcp_client_version`, `$mcp_client_user_agent`, `$mcp_vendor_client` and `$mcp_protocol_version`; credential-shaped metadata is omitted, and strings are capped. Codex model metadata is recorded as `$mcp_llm_model` with `$mcp_llm_model_source: "client_metadata"` when present. This server does not inject model, intent or conversation arguments into application schemas.

Additional properties include `mcp_client_family` (a fixed label derived from registered OAuth name, initialize clientInfo or User-Agent), `mcp_client_key`, `mcp_principal_key`, `mcp_connection_key` for connection policy operations, and `mcp_request_key`. Keys are HMAC hashes, never raw identifiers. Client and protocol versions are validated before capture. Tool names come from the catalog; unsupported names/methods use `unknown`. User-supplied host metadata is attribution, not proof of the host's identity. Initialize metadata is scoped to that request; subsequent stateless requests use the registered OAuth client and User-Agent.

HTTP/RPC outcome events include HTTP status, duration and safe numeric JSON-RPC error codes. Response inspection is asynchronous and bounded to 64 KiB/one second; it never waits on a GET subscription. Large or incomplete responses use the handler outcome when available, otherwise `unobserved`/`accepted` with no inferred success. Following the [documented privacy hook policy](https://posthog.com/docs/mcp-analytics/privacy), `$mcp_parameters`, `$mcp_response`, raw exception messages and `$exception` payloads are intentionally excluded. Analytics never emits OAuth secrets/codes/redirect URLs, RPC arguments, payloads, job/queue names, raw connection names or error messages. Explicit consent codes and verified signed consent cookies are looked up to enrich user/client attribution when the pending consent record remains available; scope counts retain aggregate consent metadata.

OAuth body inspection and identity enrichment run concurrently with authentication, without delaying the handler. Explicit stream tee branches preserve handler request/response bodies when analytics cancels its bounded read. The MCP request-body inspection before authentication has a one-second total deadline and a 1 MiB byte cap; incomplete uploads return HTTP 408 without entering authentication, and oversized uploads return HTTP 413. Malformed JSON retains the original handler body for the SDK's syntax-error response.

Tracking remains best-effort: the bounded queue can drop events and process restarts can lose queued work. `telemetry_queue` with `queueName: "mcp_analytics"` reports `queue_dropped` for backpressure and `queue_failed` for processing, validation or upstream rejection failures. These signals must be monitored outside PostHog because an unavailable ingestion destination cannot report its own loss. There is no durable outbox or delivery retry guarantee.

After deployment, verify the register → authorize/consent → token → initialize → tools/list → tools/call funnel in PostHog; repeat with token refresh, an SDK validation error, a policy denial and a rate limit. Confirm one final tool event, matching hashed user identity, distinct service-account people with the correct organization group, consistent client/request keys and no raw credentials or tenant data. Local automated tests validate capture contracts and batch payloads; they do not establish production receipt.
