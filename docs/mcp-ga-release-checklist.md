# MCP Phase 1 — Release and Rollback Checklist

Use this checklist when enabling or announcing MCP GA on Durabull Cloud or self-hosted installs (read tools by default; write tools behind explicit scopes, see ADR-0001 §6).

**Index:** [mcp-ga-index.md](./mcp-ga-index.md)

## Pre-release

- [x] `main` includes PR-02 through PR-08 (GA docs + ADR) plus OAuth consent UI follow-up.
- [x] Automated tests green — commands and results: [validation evidence](./mcp-ga-validation-evidence.md) (includes Playwright `mcp-oauth.spec.ts`).
- [ ] [Compliance checklist](./mcp-ga-compliance-checklist.md) reviewed.
- [ ] [Security closure](./mcp-ga-security-closure.md) reviewed (human sign-off if required).
- [ ] Staging: PRM + health checks per [mcp-operations-runbook.md](./mcp-operations-runbook.md).
- [ ] Staging: `cd tooling/scripts && APP_BASE_URL=<staging> bun run mcp:e2e` (staging DB only).
- [ ] Staging: `cd apps/web && bun run test:e2e e2e/mcp-oauth.spec.ts` (browser OAuth consent path).
- [ ] Staging: alert or edge rate limit on `POST /api/auth/mcp/register` (SEC-04).
- [ ] Production config: `APP_BASE_URL` matches public URL; `DURABULL_AUTHLESS=false`.
- [x] Docs published: [MCP Server](https://github.com/durabullhq/durabull/blob/main/apps/docs/content/documentation/integrations/mcp-server.mdx) (consent flow), [GA index](./mcp-ga-index.md), [OAuth operator guide](./mcp-oauth-operator.md).

## Release steps

1. Deploy unified API/web service (MCP is always on at `/mcp`).
2. Verify `GET /.well-known/oauth-protected-resource` returns `resource: {APP_BASE_URL}/mcp`.
3. Verify `POST /mcp` without bearer returns `401` with `WWW-Authenticate`.
4. Smoke `ping` with a valid OAuth token scoped `mcp:discover`.
5. Enable customer comms / docs link for MCP integration.
6. Monitor `mcp_telemetry` for `policy_denied`, `rate_limited_*`, `tool_error` spikes (see runbook).

## CI test suite duration (2026-05-28)

Local automated run wall-clock (not MCP request latency):

| Suite | Duration | Count |
| --- | --- | --- |
| `@durabull/mcp` unit tests | ~105 ms | 41 tests |
| `@durabull/api` MCP integration | ~870 ms | 33 tests (includes PG migrations) |

Details: [validation evidence](./mcp-ga-validation-evidence.md).

## Draft SLO candidates (not validated)

**Do not** wire production alerts to these thresholds until after a staging soak or production baseline week. Unit/integration test duration above is **not** an SLO input.

| Signal | Draft target | Notes |
| --- | --- | --- |
| MCP tool p95 latency | < 5s for `list_jobs`; < 15s for `explain_job_failure` | Depends on Redis/queue size, log volume, alert table size |
| MCP tool error rate | < 1% excluding client 4xx | Exclude 401/403 from numerator |
| Auth failure rate | Stable vs baseline | Spike may indicate misconfigured clients |
| Rate limit 429 rate | < 0.1% of tool calls | Per-process limits — scaling replicas **multiplies** effective quota unless edge limiting is configured |

## Rollback

MCP shares the API deployable — rollback is **revert/deploy previous API image**, not a separate MCP service.

| Scenario | Action |
| --- | --- |
| MCP-specific regression | Revert MCP commits or deploy previous release tag; `/api/*` rolls back with same artifact |
| Auth storm / abuse | Block `/mcp` at edge temporarily; rotate OAuth secrets; review `mcp_audit_event`; rate-limit `POST /api/auth/mcp/register` at edge |
| Data leak concern | Disable public ingress to app; rotate credentials; inspect audit + telemetry |
| Rate limit false positives | Prefer edge/WAF throttling first. **Last resort:** `DISABLE_RATE_LIMIT=true` disables **all** in-memory API + MCP rate limits (not MCP-only). Time-box, revert ASAP, require perimeter limits |

After rollback:

1. Confirm `GET /api/health` on previous version.
2. Confirm clients receive expected 404/401 if MCP removed (if full revert).
3. Post-incident: update compliance checklist and open follow-up PR.

## Post-release (7 days)

- [ ] Capture baseline: `mcp_telemetry` deny/limit/error rates and tool latency (dashboard or export) for comparison.
- [ ] Review `mcp_audit_event` volume and deny reasons vs baseline.
- [ ] Review `mcp_telemetry` deny/limit rates vs baseline.
- [ ] Confirm no unexpected OAuth client registration volume.
- [ ] Capture customer feedback on scope/tool gaps for phase 2 planning.
