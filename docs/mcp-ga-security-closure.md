# MCP Phase 1 — Security Review Closure

**Review date:** 2026-05-28  
**Scope:** Read-only hosted MCP (PR-02–PR-07 on `main`, PR-08 GA closure)  
**ADR:** [0001-mcp-security-architecture.md](./adr/0001-mcp-security-architecture.md)  
**Status:** **Draft** — does not replace independent security review or human sign-off.

## Review summary

Phase 1 MCP documentation and automated tests show **no critical or high** open code/doc mismatches. **Production announcement** remains gated on operator steps in [mcp-ga-release-checklist.md](./mcp-ga-release-checklist.md) and human security sign-off below.

## Findings and disposition

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| SEC-01 | — | Missing formal ADR / threat model file | **Closed** — ADR-0001 added in PR-08 |
| SEC-02 | Low | In-memory rate limits are per-process | **Accepted** — documented; Redis-backed limits phase 2 |
| SEC-03 | Low | `mcp:e2e` registers OAuth clients and writes DB tokens | **Accepted** — staging/local only; runbook warnings |
| SEC-04 | Medium (accepted) | Dynamic OAuth client registration is unauthenticated (20/min rate limit) | **Accepted** — edge monitoring + alert on `POST /api/auth/mcp/register` required before public GA announcement |
| SEC-05 | Info | Domain logic in API handlers vs `packages/mcp-domain` | **Accepted** — same tenancy checks as REST; extraction optional |
| SEC-06 | — | No write/destructive MCP tools in phase 1 | **Superseded (phase 2)** — non-destructive write tools added behind dedicated write scopes that are never auto-injected; destructive operations still have no scope (`tool-catalog.test.ts`) |
| SEC-12 | Medium | `resolve_alert_event` (phase 1) mutated state under the read scope `mcp:failures:read` | **Closed (phase 2)** — moved to `mcp:failures:write`; read-bundle tokens now receive `403 insufficient_scope` (`mount.test.ts`) |
| SEC-13 | — | `resources/read` bypassing tool policy | **Verified** — resource reads pass through the same policy engine and rate limiter; unknown URIs rejected pre-auth (`mount.test.ts`) |
| SEC-14 | — | Alert delivery targets / channel secrets in MCP output | **Verified** — omitted by projection (`read-handlers.test.ts`, `write-handlers.test.ts`) |
| SEC-07 | — | Cross-org `connectionId` denied for delegated users | **Verified** — `mount.test.ts` |
| SEC-08 | — | Service account requires policy binding + scopes | **Verified** — `mount.test.ts`, `mcp-policy.test.ts` |
| SEC-09 | — | Output redaction for secrets/Redis URLs | **Verified** — `sanitize-output.test.ts` |
| SEC-10 | — | RFC 8707 resource enforced on validation | **Verified** — `validate-token.test.ts`; issuance via Better Auth |
| SEC-11 | — | Browser OAuth consent (`/consent`) for external MCP clients | **Verified** — `apps/web/e2e/mcp-oauth.spec.ts` (authorize + `prompt=consent` → token → `ping`) |

## Negative test coverage (automated)

| Scenario | Expected | Test location |
| --- | --- | --- |
| Missing bearer | 401 + WWW-Authenticate | `bearer-middleware.test.ts`, `mount.test.ts` |
| Invalid bearer | 401 | `mount.test.ts` |
| Expired token | 401 | `mount.test.ts` |
| Wrong resource | 401 | `bearer-middleware.test.ts` |
| Missing `mcp:discover` | 403 | `mount.test.ts` |
| Missing tool scope (`mcp:jobs:read`, etc.) | 403 | `mount.test.ts` |
| SA without policy binding | 403 policy deny | `mount.test.ts` |
| Delegated user wrong connection | 403 | `mount.test.ts` |
| Invalid Host | 403 | `mount.test.ts`, `routes.test.ts` |
| Per-tool rate limit | 429 JSON-RPC | `mcp-tool-rate-limit.test.ts` |

OAuth/transport matrix for compliance: same table above; compliance checklist links here instead of duplicating rows.

## Manual / staging gates (before production announcement)

Operator gates: [Release checklist — Pre-release](./mcp-ga-release-checklist.md#pre-release).

## Security sign-off

| Reviewer | Role | Date | Approved |
| --- | --- | --- | --- |
| Engineering (MCP OAuth UI) | Engineering | 2026-05-28 | Ready — consent UI + Playwright OAuth E2E; see [validation evidence](./mcp-ga-validation-evidence.md) |
| | Security / owner | | **Pending human sign-off** |
