# MCP Phase 1 — Spec Compliance Checklist

**GA target:** Read-only hosted MCP at `{APP_BASE_URL}/mcp`  
**Verified on branch:** `feat/no-linear-mcp-pr08-ga-readiness` (2026-05-28)  
**Stack:** PR-02 through PR-07 merged on `main`; PR-08 closes GA.  
**Index:** [mcp-ga-index.md](./mcp-ga-index.md)

## Transport (Streamable HTTP)

| Requirement | Status | Evidence |
| --- | --- | --- |
| `GET` / `POST` / `DELETE` on `/mcp` | Done | [validation evidence](./mcp-ga-validation-evidence.md) |
| MCP `initialize` + session handling | Done | `apps/api/src/mcp/mount.test.ts` |
| Host header validation | Done | `packages/mcp` allowed-hosts tests + `mount.test.ts` |
| `/mcp` not captured by SPA static fallback | Done | `apps/api/src/mcp/mount.test.ts` |
| Request size limits (API app) | Done | `packages/mcp/src/routes.ts` — 1MB body limit |

## OAuth discovery and bearer auth

Auth negative scenarios: [security closure — Negative test coverage](./mcp-ga-security-closure.md#negative-test-coverage-automated).

| Requirement | Status | Evidence |
| --- | --- | --- |
| Protected Resource Metadata (PRM) | Done | `apps/api/src/mcp/mount.test.ts` |
| `WWW-Authenticate` on missing bearer | Done | `packages/mcp` bearer-middleware tests |
| Bearer required on all `/mcp` methods | Done | `packages/mcp/src/routes.test.ts` |
| Canonical resource `{APP_BASE_URL}/mcp` | Done | `resource-uri.test.ts` |
| Wrong resource → 401 | Done | `validate-token.test.ts` |
| Missing scope → 403 | Done | `mount.test.ts` |
| Expired token → 401 | Done | `session.test.ts`, `mount.test.ts` |

## Authorization and tenancy

| Requirement | Status | Evidence |
| --- | --- | --- |
| Per-tool scope mapping (catalog-driven) | Done | `packages/mcp/src/tools/tool-catalog.ts`, `apps/api/src/mcp/policy/policy-engine.ts` |
| Resource reads authorized like tools; unknown URIs rejected | Done | `apps/api/src/mcp/mount.test.ts`, `json-rpc-tool-call.test.ts` |
| Delegated user connection boundary | Done | `apps/api/src/mcp/mount.test.ts` |
| Service account policy bindings | Done | `packages/dal` mcp-policy tests |
| Fail closed on unmapped tools | Done | `apps/api/src/mcp/policy/policy-engine.test.ts` |
| Best-effort audit on tool calls | Done | `apps/api/src/mcp/audit/mcp-audit.test.ts`; may drop under backpressure (`audit_dropped`) |

## Tool catalog

Tool names and scopes: [ADR-0001 §3](./adr/0001-mcp-security-architecture.md) and [MCP Server user doc](../apps/docs/content/documentation/integrations/mcp-server.mdx).

| Check | Status | Evidence |
| --- | --- | --- |
| 21 read tools (incl. `ping`) + 9 write tools registered from one catalog | Done | `tool-catalog.test.ts`, `mount.test.ts` |
| Every tool has title, description, annotations, input schema; every tool except `ping` has an output schema | Done | `tool-catalog.test.ts`, `routes.test.ts` |
| `explain_job_failure` requires `mcp:diagnostics:read` + `mcp:jobs:read`; logs/alerts optional with `skippedSources` | Done | `policy-engine.test.ts`, `explain-job-failure-handler.test.ts` |
| Write tools require exactly one dedicated write scope; read bundle alone is denied | Done | `policy-engine.test.ts`, `mount.test.ts` |
| No destructive tools (remove/purge/obliterate/delete/clean) | Done | `tool-catalog.test.ts` name guard |
| Resources and prompts served from catalogs | Done | `routes.test.ts`, `mount.test.ts` |

## Safety (PR-06)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Output sanitization | Done | `sanitize-output.test.ts` |
| Per-tool rate limits (heavy set from catalog; resources limited per name) | Done | `mcp-tool-rate-limit.test.ts` |
| Alert delivery targets and channel secrets omitted from MCP output | Done | `read-handlers.test.ts`, `write-handlers.test.ts` |
| Audit `input_hash` + `response_class` | Done | `mcp-audit.test.ts` |
| `mcp_telemetry` signals | Done | `mount.test.ts` |

## Deployment and operations (PR-07)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Unified `/mcp` cloud docs | Done | `deployment/render-and-demo.mdx` |
| Self-host single-port docs | Done | `deployment/docker.mdx` |
| Operator runbook | Done | `mcp-operations-runbook.md` |

## Staging / live validation (operator)

Operator gates: [release checklist — Pre-release](./mcp-ga-release-checklist.md#pre-release).

## Known non-blocking follow-ups

| Item | Tracking |
| --- | --- |
| Redis-backed rate limits for multi-replica | Phase 2 |
| `packages/mcp-domain` extraction | Master plan §2.2 |
| Pre-existing `alerts-global.test.ts` typecheck | Blocks full `@durabull/api` typecheck |
| Staging soak / validated SLOs | Post-GA; see release checklist draft SLOs |

## Sign-off

| Role | Name | Date | Notes |
| --- | --- | --- | --- |
| Engineering | | | See [validation evidence](./mcp-ga-validation-evidence.md) |
| Security | | | See [security closure](./mcp-ga-security-closure.md) — human sign-off recommended before production announcement |
