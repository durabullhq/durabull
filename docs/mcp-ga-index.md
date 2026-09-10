# MCP — GA documentation index

**Phase 1** (GA) = read-only hosted MCP at `{APP_BASE_URL}/mcp`.  
**Phase 2** (2026-09) = same endpoint plus tool descriptions/annotations, structured output, resources, prompts, more read tools, and explicitly scoped non-destructive write tools (`retry_job`, `promote_job`, `pause_queue`, `resume_queue`, alert acknowledge/resolve/snooze). Destructive operations (remove, purge, obliterate) still have no MCP scope.  
**GA** = approved to announce to customers after operator gates in the release checklist (not the same as “merged to `main`”).

**Phase 2 migration note:** `resolve_alert_event` now requires `mcp:failures:write` instead of `mcp:failures:read`. Clients that approved consent before phase 2 must re-authorize with the write scope to keep using it.

## Reading order

| Order | Document | Audience |
| --- | --- | --- |
| 1 | [ADR-0001](./adr/0001-mcp-security-architecture.md) | Engineering, security |
| 2 | [Compliance checklist](./mcp-ga-compliance-checklist.md) | Engineering, release manager |
| 3 | [Security closure](./mcp-ga-security-closure.md) | Security, engineering |
| 4 | [Validation evidence](./mcp-ga-validation-evidence.md) | Engineering, CI |
| 5 | [Release checklist](./mcp-ga-release-checklist.md) | Operators, release manager |
| 6 | [Operations runbook](./mcp-operations-runbook.md) | Operators (day 2) |
| 7 | [OAuth operator guide](./mcp-oauth-operator.md) | Operators, integrators |

User-facing tool/scopes table: [MCP Server](../apps/docs/content/documentation/integrations/mcp-server.mdx).

## Quick links

- **Ship gates:** [Release checklist — Pre-release](./mcp-ga-release-checklist.md#pre-release)
- **Test commands:** [Validation evidence](./mcp-ga-validation-evidence.md)
- **Auth matrix (automated):** [Security closure — Negative test coverage](./mcp-ga-security-closure.md#negative-test-coverage-automated)
