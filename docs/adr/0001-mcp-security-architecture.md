# ADR-0001: MCP Security Architecture

**Status:** Accepted  
**Date:** 2026-05-28 (phase 1); amended 2026-09-09 (phase 2 capability surface)  
**Supersedes:** N/A (initial ADR; deployable placement amended from early drafts that referenced standalone `apps/mcp`)

## Context

Durabull exposes a hosted, remote MCP server so AI clients can perform queue diagnostics (jobs, failures, logs, metrics, scheduled jobs, Redis health, alerts) and a small set of **non-destructive operations** (retry, promote, pause/resume, alert acknowledge/resolve/snooze) without direct Redis access. Remote MCP transport requires OAuth 2.1 bearer tokens, tenant isolation, and output safety because tool responses may contain customer job payloads and logs.

Phase 1 (GA 2026-05) shipped read-only tools. Phase 2 (2026-09) added descriptions, annotations, structured output, resources, prompts, more read tools, and explicitly scoped write tools. Phase 2 also corrected a phase-1 defect: `resolve_alert_event` mutated state but was gated by the read scope `mcp:failures:read`.

## Decision

### 1. Deployable placement (phase 1)

MCP runs on the **same origin, same process, and same public port** as the unified Durabull API + web app.

| Path | Handler |
| --- | --- |
| `/mcp` | Streamable HTTP MCP (`packages/mcp` + thin `apps/api/src/mcp/` mount) |
| `/api/*` | REST/RPC API |
| `/.well-known/oauth-protected-resource` | PRM fallback on app origin |

Canonical resource URI: `{APP_BASE_URL}/mcp` (no trailing slash unless client libraries require consistency everywhere).

**Not in phase 1:** standalone `apps/mcp` deployable, second public MCP port (`3020`), dual-process Docker supervisors.

### 2. Module boundaries

- **Transport, bearer validation helpers, sanitization:** `packages/mcp`
- **Ingress mount, policy, tool handlers, audit:** `apps/api/src/mcp/`
- **Persistence:** `packages/dal` (`mcp_service_account*`, `mcp_policy_binding`, `mcp_audit_event`, `oauth_*`)
- **Identity:** Better Auth MCP plugin + Durabull scope middleware

MCP route handlers must not embed BullMQ/domain logic; they call shared API lib handlers with typed DTOs.

### 3. Capability surface

The catalog in `packages/mcp/src/tools/tool-catalog.ts` is the single source of truth for tool names, descriptions, annotations, input/output schemas, required scopes, and rate-limit class. The policy engine, rate limiter, `tools/list`, and the docs tests all read from it; a tool that is not in the catalog is denied.

**Read tools** (`readOnlyHint=true`): `ping`, `list_connections`, `list_queues`, `get_queue`, `get_connection_overview`, `list_jobs`, `find_job`, `get_job`, `get_job_logs`, `get_job_stacktraces`, `explain_job_failure`, `list_scheduled_jobs`, `get_scheduled_job`, `get_workers`, `get_queue_metrics`, `get_redis_health`, `get_failure_events`, `get_alert_event`, `get_alert_summary`, `list_alert_rules`, `get_alert_rule`.

**Write tools** (`readOnlyHint=false`, `destructiveHint=false`): `resolve_alert_event`, `acknowledge_alert_event`, `unacknowledge_alert_event`, `snooze_alert_rule`, `unsnooze_alert_rule`, `retry_job`, `promote_job`, `pause_queue`, `resume_queue`. Each requires exactly one write scope. Write tools never mutate job payloads.

**Not exposed, by design:** job removal, queue clean/purge/obliterate/delete, job data edits, scheduler create/update/delete, arbitrary Redis key access, connection or alert-rule CRUD. These have no MCP scope and cannot be granted.

**Resources** (`durabull://` URIs, authorized like tools): `server`, `connections`, `connections/{id}/queues`, `connections/{id}/queues/{queueName}`, `connections/{id}/alerts`. Unknown URIs are rejected before reaching the MCP server.

**Prompts** (no data access, transport scope only): `triage_failed_jobs`, `investigate_queue_backlog`, `alert_activity_review`, `connection_health_check`.

**Structured output:** every tool except `ping` declares an `outputSchema` and returns `structuredContent` plus the same JSON as text. The SDK validates output against the schema; handler tests validate sample output against the same schema.

### 4. Authentication

- **Delegated users:** OAuth 2.1 access tokens via Better Auth MCP plugin; RFC 8707 `resource` must match `{APP_BASE_URL}/mcp`.
- **Service accounts:** OAuth-linked machine principals with org-scoped `mcp_policy_binding` rows (scopes alone are insufficient).
- **401** missing/invalid token or wrong resource; **403** insufficient scope or policy deny.
- PRM + `WWW-Authenticate` challenges on unauthenticated `/mcp` requests.

### 5. Authorization (policy engine)

Every `tools/call` and `resources/read` passes through `evaluateMcpToolPolicy`:

1. Operation must have an explicit scope mapping — catalog for tools, resource catalog for resources (fail closed if missing or unknown).
2. OAuth scopes must include the operation's required scopes.
3. **Delegated users:** `connectionId` (tool argument or URI segment) must belong to the user's org membership.
4. **Service accounts:** matching `mcp_policy_binding` for operation + org + optional connection constraint. Resource operations bind under the name `resource:<name>`.

The decision also carries **effective scopes**: token scopes for delegated users; for service accounts, token scopes that also have a binding for the operation. Tools with optional evidence (`explain_job_failure`, `get_connection_overview`) include or omit sections based on effective scopes and report what was skipped, instead of failing.

Policy decisions are audited to `mcp_audit_event`.

### 6. Scope taxonomy

| Scope | Kind | Purpose |
| --- | --- | --- |
| `mcp:discover` | read | Transport, `ping`, `tools/list`, prompts, `durabull://server` |
| `mcp:jobs:read` | read | Connections, queues, jobs, workers, scheduled jobs, connection overview |
| `mcp:logs:read` | read | Job logs and stacktraces; optional enrichment for `explain_job_failure` |
| `mcp:failures:read` | read | Alert events, rules, summaries; optional enrichment for `explain_job_failure` and `get_connection_overview` |
| `mcp:diagnostics:read` | read | Queue metrics, Redis health; required (with `mcp:jobs:read`) for `explain_job_failure` |
| `mcp:jobs:retry` | write | `retry_job` |
| `mcp:jobs:promote` | write | `promote_job` |
| `mcp:queues:pause` | write | `pause_queue`, `resume_queue` |
| `mcp:failures:write` | write | `resolve_alert_event`, `acknowledge_alert_event`, `unacknowledge_alert_event`, `snooze_alert_rule`, `unsnooze_alert_rule` |

The five read scopes form the bundle injected into authorize requests that omit `mcp:*` scopes. **Write scopes are never injected**; clients must request them and the consent screen labels them "can make changes". Tokens issued before phase 2 hold only read scopes, so `resolve_alert_event` now returns `403 insufficient_scope` for them until the user re-authorizes with `mcp:failures:write`. This is intentional.

`acknowledge_alert_event` records the acknowledging user and is therefore available to delegated users only; service accounts receive `validation_error`.

### 7. Data safety

- Central `sanitizeMcpOutput` on all tool and resource responses (text and `structuredContent`).
- Denylist: Redis URLs, credential-like keys, bearer/JWT patterns.
- `_mcpSafety.redactionCount` metadata on responses.
- Alert deliveries omit `target` (email address / webhook URL) and provider metadata; notification channels are reduced to routing identity (`type`, `target`, `url`, `destinationId`, `teamId`, `projectId`) with secrets and secret hints dropped.
- Typed domain errors (`not_found`, `validation_error`, `conflict`, `forbidden`) pass their curated message through redaction to the client; anything else collapses to a generic `internal_error`.

### 8. Operational controls

- Host header allowlist on `/mcp` (includes `APP_BASE_URL` host).
- Ingress + per-operation in-memory rate limits (per-process; shared backend deferred for multi-replica). `resources/read` is limited under `resource:<name>`; heavy tools are flagged in the catalog.
- Structured `mcp_telemetry` JSON logs for policy denies, rate limits, tool outcomes.

## Threat model (summary)

| Threat | Mitigation |
| --- | --- |
| Token theft / replay | Short-lived OAuth tokens; expiry enforced; TLS required at ingress/platform (not enforced inside MCP handlers) |
| Confused deputy (wrong audience) | RFC 8707 resource binding to `{APP_BASE_URL}/mcp` |
| Scope escalation | Explicit per-tool scope map; 403 with `insufficient_scope` |
| Cross-tenant data access | Org membership + connection checks; service-account bindings |
| Secret leakage via tool output | Central sanitizer + tests |
| Abuse / DoS | Rate limits on ingress and heavy tools |
| Host header attacks | Strict Host allowlist before auth |
| Accidental write actions | Write tools require dedicated write scopes that are never auto-injected; all are non-destructive and idempotent or state-guarded (`conflict` on wrong state); destructive operations have no MCP scope |
| Resource URI probing | `resources/read` is parsed against the resource catalog before auth; unknown URIs return `400` and never reach the server |

## Consequences

**Positive**

- Single deployment simplifies TLS, OAuth resource URI, and operator docs.
- Clear security boundary in code despite unified process.
- Read tools remain the default grant; write capability is opt-in per scope and visible on consent.
- One catalog drives registration, policy, rate limiting, and docs, so they cannot drift.

**Negative / accepted debt**

- In-memory rate limits are not coordinated across replicas. The deployment has no application-level Redis (the `REDIS_URL` env var is unused by the API), so a shared store would be a new infrastructure dependency; deferred.
- Domain logic still lives in API handlers rather than `packages/mcp-domain` (optional extraction).
- Full staging `mcp:e2e` requires operator-run credentials (documented in runbook).
- Existing tokens must re-authorize to keep using `resolve_alert_event` (see §6).

## References

- `tasks/mcp-implementation-master-plan.md`
- `docs/mcp-oauth-operator.md`
- `docs/mcp-operations-runbook.md`
- `docs/mcp-ga-index.md`
- `docs/mcp-ga-compliance-checklist.md`
- `docs/mcp-ga-security-closure.md`
- `docs/mcp-ga-release-checklist.md`
