# MCP Readiness Review — Post PR-08 (2026-05-28)

> Historical planning and handoff record. Implementation and test results below describe the
> work at the time they were recorded. For current behavior and release gates, use the
> [MCP documentation index](../docs/mcp-ga-index.md) and the
> [user guide](../apps/docs/content/documentation/integrations/mcp-server.mdx).

**Branch:** `feat/no-linear-mcp-pr08-ga-readiness`  
**Plan position:** PR-02–PR-07 merged on `main`; PR-08 GA closure in review on branch (not merged until PR #100 lands).

---

## Executive summary

| Dimension | Verdict |
| --- | --- |
| **Read-only diagnostic catalog** | **Complete** on `main` — 11 tools + `ping` (policy PR #94; remaining tools PR #97). |
| **Authorization** | **Complete** — principals, policy engine, org/connection boundaries (PR #94). |
| **Safety hardening (PR-06)** | **Complete** — merged PR #98. |
| **Deployment / ops (PR-07)** | **Complete** — merged PR #99 (runbook + deployment docs). |
| **GA artifacts (PR-08)** | **Complete in branch** — ADR, compliance, security closure, release checklist, validation evidence. |
| **OAuth consent UI** | **Done** — `/consent` + Playwright `e2e/mcp-oauth.spec.ts` (full authorize → consent → token → `ping`). |
| **Production announcement** | **Pending operator gates** — staging `mcp:e2e` + `mcp-oauth` E2E, edge alert on register, human security sign-off. |

---

## What works today

- `/mcp` on same origin as API with OAuth bearer auth
- Full read-only diagnostic tool catalog with scope-gated policy enforcement
- Central output sanitization on all read-tool responses
- Ingress + per-tool rate limits (in-memory; per-process)
- Audit events with input hash + response class for tool invocations
- Structured `mcp_telemetry` logs for operational signals
- Operator runbook and GA checklists under `docs/mcp-ga-*.md`

---

## Remaining before production announcement

| Gate | Owner |
| --- | --- |
| Staging `mcp:e2e` smoke | Operator |
| Release checklist (`docs/mcp-ga-release-checklist.md`) | Operator |
| Human security sign-off (recommended before production announcement) | Security / owner |

---

## Quick commands

```bash
bun run --filter @durabull/mcp test
bun run --filter @durabull/api test src/mcp/

cd tooling/scripts && APP_BASE_URL=http://localhost:3001 bun run mcp:e2e   # staging/local only
```

## GA documentation index

Start at [mcp-ga-index.md](../docs/mcp-ga-index.md) for reading order and terminology.

See also [MCP Server](/documentation/integrations/mcp-server) in the docs app.
