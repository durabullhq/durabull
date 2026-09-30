# MCP Server Execution Playbook (Sequential PR Stack)

> Historical planning and handoff record. Implementation and test results below describe the
> work at the time they were recorded. For current behavior and release gates, use the
> [MCP documentation index](../docs/mcp-ga-index.md) and the
> [user guide](../apps/docs/content/documentation/integrations/mcp-server.mdx).

## Goal

Ship a production-safe, hosted MCP server for Durabull that supports read-only diagnostics for jobs, failures, logs, and root-cause context, with:

- Better Auth as the auth foundation.
- OAuth 2.1 + scoped bearer token authorization for remote MCP.
- Cloud-hosted and self-hosted deployment paths.
- Strict safety controls so destructive operations cannot run accidentally.

This playbook is designed for **sequential agent execution** with clear handoffs and a running history.

## Required Companion Document

Before executing any PR in this stack, agents must read:

- `tasks/mcp-implementation-master-plan.md`

Usage split:

- `tasks/mcp-implementation-master-plan.md` = technical implementation details ("how")
- `tasks/mcp-pr-execution-playbook.md` = sequencing, ownership, validation history ("when/who")

## Non-Negotiable Constraints

- Do not skip PR order.
- Every PR must be mergeable independently.
- Every PR must include tests and verification evidence.
- No write/destructive MCP tools in this stack (read-only GA target).
- Each PR must link to a Linear issue before merge.

## Hosting model (authoritative — read before PR-02)

MCP is **not** a separate deployable in phase 1. It runs on the **same origin and same process** as the main Durabull API + web app.

| Path | Handler |
| --- | --- |
| `/api/*` | API routes (`apps/api`) |
| `/mcp` | MCP Streamable HTTP (`apps/api/src/mcp/*` mounted in `createApiApp()`) |
| `/ingest/*` | PostHog proxy (existing) |
| `/`, `/assets/*` | Web SPA/static (`apps/api/src/index.ts`) |

Cloud example: `https://app.durabull.io/mcp` on the same Render web service as `https://app.durabull.io/api/*`.

**Agent rules:**

- Implement MCP under `apps/api/src/mcp/`, not as a standalone `apps/mcp` server.
- Mount `/mcp` in `apps/api/src/app.ts` before SPA/static fallbacks.
- Do not add a second public port (`3020`) or dual-process Docker entrypoints for MCP.
- OAuth canonical resource URI (PR-03+): `${APP_BASE_URL}/mcp`.
- Domain logic stays in shared services; MCP handlers are thin ingress only.

If a branch still has experimental `apps/mcp` or `tooling/docker/run-services.ts`, PR-02 must migrate/remove that layout as part of API ingress work (see master plan §13.1).

## Skateboard Approach (Incremental Product Slices)

Each PR must deliver a usable, testable increment:

1. Security model + contracts are explicit.
2. MCP transport is mounted at `/mcp` on the API app and is callable on the same origin.
3. Auth discovery and token validation work end-to-end.
4. Policy/scopes enforce least privilege.
5. Read-only tools deliver customer value.
6. Ops hardening and deployment complete production readiness.

---

## Global Agent Checklist (Run on Every PR)

- [ ] Agent startup checklist completed from `tasks/mcp-implementation-master-plan.md`.
- [ ] Branch is created from latest primary branch (`main`).
- [ ] PR references a Linear issue ID in branch name, PR title, or description.
- [ ] Scope is limited to this PR's checklist only.
- [ ] All new behavior has tests.
- [ ] Existing tests touched by scope still pass.
- [ ] Lint/typecheck pass for touched packages.
- [ ] Security-sensitive changes include negative tests (unauthorized/forbidden).
- [ ] Documentation updates included for behavior changes.
- [ ] PR description includes:
  - [ ] What changed
  - [ ] Why this is safe
  - [ ] How it was verified
  - [ ] Any follow-up work explicitly deferred

---

## PR Stack Overview

- PR-01: Security architecture + ADR + threat model + scope taxonomy
- PR-02: API-mounted MCP module (`/mcp`) + transport wiring + conformance harness
- PR-03: OAuth discovery (PRM/WWW-Authenticate) + MCP token validation middleware
- PR-04: Principal model (delegated users + service accounts) + policy engine
- PR-05: Read-only tool set for jobs/failures/logs/diagnostics
- PR-06: Output safety (redaction), rate limits, and audit logging
- PR-07: Cloud deployment path + self-host deployment path + runbooks
- PR-08: Production readiness verification, security review closure, GA docs

---

## Zero-Ambiguity PR Templates (Copy/Paste)

Use these templates exactly. Replace placeholders only.

### Global Naming Convention

- Branch format: `feat/<linear-id>-mcp-pr0x-<short-scope>`
- PR title format: `<linear-id>: MCP PR-0X <short scope>`

If a Linear issue is temporarily unavailable, use:

- branch: `feat/no-linear-mcp-pr0x-<short-scope>`
- title: `NO-LINEAR: MCP PR-0X <short scope>`

### Required PR Body Template (All PRs)

```md
## Objective
<copy objective from active PR section>

## Scope (In)
- [ ] <deliverable 1>
- [ ] <deliverable 2>
- [ ] <deliverable 3>

## Scope (Out)
- [ ] <explicitly deferred item 1>
- [ ] <explicitly deferred item 2>

## Implementation Notes
- <key design choices and touched files>

## Safety
- [ ] No destructive MCP tools introduced
- [ ] Org + connection boundary checks verified for touched paths
- [ ] Negative auth/authz tests added and passing
- [ ] Redaction/sensitive-output behavior preserved or improved

## Validation
- [ ] `bun run lint --filter <pkg-or-app>`
- [ ] `bun run typecheck --filter <pkg-or-app>`
- [ ] `<targeted tests command>`
- [ ] `<integration/security test command>`

## Evidence
- <paste key command outputs, test names, or screenshots/links>

## Handoff
- Next PR: `PR-0X`
- Known risks:
- Follow-ups intentionally deferred:
```

### PR-01 Template

- Branch: `feat/<linear-id>-mcp-pr01-security-baseline`
- Title: `<linear-id>: MCP PR-01 security architecture baseline`
- Must include:
  - [ ] ADR link path in PR body
  - [ ] Threat model section
  - [ ] Scope taxonomy table
  - [ ] Explicit statement: phase 1 is read-only only
- Acceptance statement to include verbatim:
  - `This PR defines security and scope contracts only; no MCP runtime behavior is introduced.`

### PR-02 Template

- Branch: `feat/<linear-id>-mcp-pr02-api-mcp-ingress`
- Title: `<linear-id>: MCP PR-02 API /mcp ingress and transport`
- Must include:
  - [ ] `apps/api/src/mcp/` module summary (not standalone `apps/mcp`)
  - [ ] mount point in `createApiApp()` at `/mcp` (before SPA fallback)
  - [ ] transport wiring explanation (`GET`/`POST`/`DELETE` on `/mcp`)
  - [ ] host-header validation proof (includes `APP_BASE_URL` host in cloud)
  - [ ] smoke tool call evidence (`ping`) against same port as API (for example `:3000/mcp`)
  - [ ] confirmation no second public MCP port in Docker/compose
- Acceptance statement to include verbatim:
  - `This PR establishes MCP transport at /mcp on the API app only and does not expose production domain tools.`

### PR-03 Template

- Branch: `feat/<linear-id>-mcp-pr03-oauth-discovery-token-validation`
- Title: `<linear-id>: MCP PR-03 OAuth discovery and token validation`
- Must include:
  - [ ] PRM endpoint proof (well-known paths on same origin as API)
  - [ ] canonical resource URI proof: `${APP_BASE_URL}/mcp`
  - [ ] `WWW-Authenticate` challenge example on `/mcp`
  - [ ] audience/resource validation proof
  - [ ] 401 vs 403 behavior evidence
- Acceptance statement to include verbatim:
  - `This PR enforces per-request bearer validation and OAuth discovery semantics for MCP transport.`

### PR-04 Template

- Branch: `feat/<linear-id>-mcp-pr04-principals-policy-engine`
- Title: `<linear-id>: MCP PR-04 principals and policy engine`
- Must include:
  - [ ] delegated principal flow evidence
  - [ ] service account flow evidence
  - [ ] schema migration references
  - [ ] policy decision log example
- Acceptance statement to include verbatim:
  - `This PR centralizes tool-level authorization decisions for delegated and machine principals.`

### PR-05 Template

- Branch: `feat/<linear-id>-mcp-pr05-readonly-tool-catalog`
- Title: `<linear-id>: MCP PR-05 read-only diagnostic tools`
- Must include:
  - [ ] list of tools implemented in this PR
  - [ ] per-tool schema references
  - [ ] pagination boundary tests
  - [ ] explain-job-failure deterministic behavior evidence
- Acceptance statement to include verbatim:
  - `This PR delivers read-only customer-facing MCP diagnostic value with bounded inputs/outputs.`

### PR-06 Template

- Branch: `feat/<linear-id>-mcp-pr06-safety-hardening`
- Title: `<linear-id>: MCP PR-06 safety hardening and auditability`
- Must include:
  - [ ] redaction strategy + tests
  - [ ] rate-limit policy + tests
  - [ ] audit event schema/example
  - [ ] anomaly signal metrics list
- Acceptance statement to include verbatim:
  - `This PR hardens MCP read operations against leakage and abuse while preserving diagnostic utility.`

### PR-07 Template

- Branch: `feat/<linear-id>-mcp-pr07-cloud-selfhost-ops`
- Title: `<linear-id>: MCP PR-07 deployment and operations`
- Must include:
  - [ ] cloud deploy evidence (single Render web service; `/mcp` on app domain)
  - [ ] self-host smoke evidence (`/api/health` and `/mcp` on same port)
  - [ ] env contract docs (`APP_BASE_URL`, `MCP_TELEMETRY_LOG`, no `MCP_PORT` publish; MCP always on)
  - [ ] operator runbook links
  - [ ] explicit note: no separate MCP container/service in phase 1
- Acceptance statement to include verbatim:
  - `This PR documents and verifies MCP on the unified API deployment at /mcp for cloud and self-hosted environments.`

### PR-08 Template

- Branch: `feat/<linear-id>-mcp-pr08-ga-readiness`
- Title: `<linear-id>: MCP PR-08 GA readiness and security closure`
- Must include:
  - [ ] spec compliance checklist completion
  - [ ] security review closure evidence
  - [ ] staged E2E delegated + service account flows
  - [ ] rollback checklist
- Acceptance statement to include verbatim:
  - `This PR closes GA readiness with verified compliance, security closure, and operational rollback readiness.`

### Merge Gate Checklist (Required in Every PR Body)

```md
## Merge Gate
- [ ] Objective achieved
- [ ] Exit criteria from playbook met
- [ ] Global agent checklist complete
- [ ] Ledger updated in `tasks/mcp-pr-execution-playbook.md`
- [ ] No unresolved critical/high security findings
- [ ] Reviewer signoff captured
```

---

## PR-01: Security Architecture Baseline

### Objective

Lock design and safety contracts before code transport/auth implementation starts.

### Deliverables

- [ ] ADR for MCP architecture and boundaries.
- [ ] Threat model for hosted MCP (token theft, confused deputy, scope escalation, tenancy boundary violations).
- [ ] Scope taxonomy (`mcp:discover`, `mcp:jobs:read`, `mcp:failures:read`, `mcp:logs:read`, `mcp:diagnostics:read`).
- [ ] Permission matrix for delegated users vs service accounts.
- [ ] Decision record for read-only GA and write-tool deferral.

### File Targets

- [ ] `docs/adr/` new ADR markdown
- [ ] `apps/docs/content/documentation/operations/` security doc updates
- [ ] `tasks/` implementation checklist references

### Verification

- [ ] Security design walkthrough completed and recorded in PR description.
- [ ] At least one reviewer signs off specifically on authz scope model.

### Exit Criteria

- [ ] All downstream PRs can reference this PR as source of truth.

---

## PR-02: API-Mounted MCP Ingress + Transport

### Objective

Mount MCP Streamable HTTP transport at `/mcp` on the existing `apps/api` Hono app (same deployment/port as API + web), with basic lifecycle and no privileged domain tools yet.

### Deliverables

- [ ] MCP module under `apps/api/src/mcp/` (server bootstrap, transport, route wiring).
- [ ] `/mcp` mounted in `createApiApp()` with correct middleware ordering (before SPA/static `*` fallbacks).
- [ ] Streamable HTTP on `/mcp` (`GET` + `POST` + `DELETE` per SDK).
- [ ] Host header validation including production host from `APP_BASE_URL`.
- [ ] MCP SDK dependencies on `@durabull/api` (not a separate MCP app package).
- [ ] Minimal smoke tool (non-domain `ping`) for transport validation.
- [ ] Remove or migrate any experimental standalone `apps/mcp` + dual-process Docker runner from the branch.

### File Targets

- [ ] `apps/api/src/mcp/server.ts` (McpServer + tool registration)
- [ ] `apps/api/src/mcp/routes.ts` or `apps/api/src/mcp/mount.ts` (transport + middleware)
- [ ] `apps/api/src/app.ts` (mount `/mcp`)
- [ ] `apps/api/package.json` (MCP SDK deps)
- [ ] `apps/api/src/mcp/*.test.ts` or `apps/api/src/app.mcp.test.ts`
- [ ] `tooling/docker/Dockerfile` (single API entrypoint; no MCP second port)
- [x] `docs/adr/0001-mcp-security-architecture.md` (landed in PR-08; unified `/mcp` placement)

### Out of scope (explicit)

- [ ] Standalone `apps/mcp` deployable package
- [ ] Separate public port `3020` in compose/production
- [ ] `tooling/docker/run-services.ts` dual-process supervisor
- [ ] Production diagnostic tools (PR-05)

### Tests

- [ ] API integration test via `createApiApp()`:
  - [ ] `POST /mcp` `initialize` succeeds with required MCP headers
  - [ ] `tools/list` includes `ping`
  - [ ] `tools/call` ping returns `pong`
- [ ] Invalid host header on `/mcp` returns 403
- [ ] Optional: stateful session header behavior test (`MCP_STATEFUL_SESSIONS` or equivalent)
- [ ] Regression: `/mcp` is not captured by SPA static fallback (`GET /mcp` not `index.html`)

### Verification Commands

- [ ] `bun run --filter @durabull/api test` (MCP tests)
- [ ] `bun run --filter @durabull/api typecheck`
- [ ] `bun run --filter @durabull/api lint`
- [ ] Local manual smoke: API port `POST http://localhost:3000/mcp` (initialize + ping)

### Exit Criteria

- [ ] Remote/local client can call `ping` at `{baseUrl}/mcp` on the **same port** as the API (for example `http://localhost:3000/mcp`).

---

## PR-03: OAuth Discovery + Token Validation Middleware

### Objective

Implement spec-aligned auth discovery and request authentication for remote MCP on `/mcp` (same origin as API).

### Deliverables

- [ ] Protected Resource Metadata endpoint (`.well-known/oauth-protected-resource` pathing on app origin).
- [ ] `WWW-Authenticate` challenge responses with metadata URL on unauthenticated `/mcp` requests.
- [ ] Bearer token requirement on **every** MCP request to `/mcp` (`GET`, `POST`, `DELETE`).
- [ ] Audience/resource binding validation against `${APP_BASE_URL}/mcp`.
- [ ] 401/403 semantics aligned to spec.
- [ ] Canonical resource URI handling documented for operators and client config.

### File Targets

- [ ] `apps/api/src/mcp/auth/*` (or equivalent)
- [ ] `apps/api/src/app.ts` (well-known routes if mounted at app root)
- [ ] tests under `apps/api/src/mcp/` or `apps/api/src/routes/`

### Tests

- [ ] Unauthenticated request gets 401 + proper challenge header.
- [ ] Invalid token gets 401.
- [ ] Wrong audience/resource token gets 401.
- [ ] Missing scope gets 403 with precise scope challenge.
- [ ] Valid token path succeeds.

### Verification

- [ ] OAuth metadata and PRM docs render correctly.
- [ ] End-to-end auth flow test from a sample MCP client fixture.

### Exit Criteria

- [ ] MCP requests cannot execute without valid scoped bearer auth.

---

## PR-04: Principals + Policy Engine (Least Privilege Core)

### Objective

Add principal resolution and authorization policy enforcement for both identity models.

### Deliverables

- [ ] Principal types:
  - [ ] Delegated user principal
  - [ ] Service account principal (org-scoped)
- [ ] Policy engine for tool-level authorization.
- [ ] Org and connection ownership checks integrated into authorization context.
- [ ] Service account credential model (secure secret hashing, rotation path).
- [ ] Policy decision audit fields (`principal`, `org`, `connection`, `scope`, `tool`, `decision`).

### Data/Schema Work

- [ ] Add required DAL schema/migration for service accounts and policy bindings.
- [ ] Add repository methods with tests.

### Tests

- [ ] User principal with proper org access succeeds.
- [ ] Cross-org access denied.
- [ ] Service account with down-scoped token can only access allowed tools.
- [ ] Revoked/rotated service account secret fails auth.

### Exit Criteria

- [ ] Every tool call passes through a centralized policy decision point.

### File Targets

- [ ] `apps/api/src/mcp/policy/*` (or `apps/api/src/mcp/*`)
- [ ] `packages/dal/*` migrations/repositories for service accounts
- [ ] tests in `apps/api` and `packages/dal`

---

## PR-05: Read-Only Diagnostic Tool Surface (Customer Value Slice)

### Objective

Ship useful read-only tools using existing Durabull domain logic.

### Tool Set (Phase 1 GA)

- [ ] `list_connections`
- [ ] `list_queues`
- [ ] `get_queue`
- [ ] `list_jobs`
- [ ] `get_job`
- [ ] `get_job_logs`
- [ ] `get_job_stacktraces`
- [ ] `get_failure_events`
- [ ] `get_queue_metrics`
- [ ] `get_workers`
- [x] `explain_job_failure` (composed diagnostic summary)

### Tool Implementation Rules

- [ ] Strict Zod schemas for every input.
- [ ] Pagination and upper bounds on list/log/stacktrace endpoints.
- [ ] Stable error taxonomy (`validation_error`, `forbidden`, `not_found`, etc.).
- [ ] Annotate read-only hints in tool metadata.
- [ ] Register tools in `apps/api/src/mcp/server.ts` (or sibling module); call shared domain services only.

### File Targets

- [ ] `apps/api/src/mcp/tools/*`
- [ ] shared domain adapters (`apps/api/src/lib/domain/*` or `packages/mcp-domain`)
- [ ] existing API route modules reused via adapters (not duplicated Hono handler logic)

### Tests

- [ ] Contract tests for each tool schema and response shape.
- [ ] Tool output tests for representative failed jobs.
- [ ] Large log pagination tests.
- [ ] Failure explanation composition tests.

### Exit Criteria

- [ ] MCP clients can perform real-world queue failure triage end-to-end.

---

## PR-06: Safety Hardening (Redaction + Rate Limits + Auditability)

### Objective

Prevent data leaks and abuse while preserving diagnostic utility.

### Deliverables

- [ ] Output redaction policy for sensitive fields (redis URLs, secrets, risky payload fields).
- [ ] Per-principal + per-tool rate limiting.
- [ ] Structured audit logs for all tool invocations.
- [ ] Correlation IDs and trace context through MCP call pipeline.
- [ ] Alerting hooks for 401/403/429 spikes and anomalous usage.

### Tests

- [ ] Redaction tests (sensitive values never returned).
- [ ] Rate-limit threshold tests.
- [ ] Audit event emission tests.
- [ ] Log integrity tests (decision + identity + scope recorded).

### Exit Criteria

- [ ] Safety controls are enforced even for valid authenticated callers.

---

## PR-07: Deployment + Operations (Cloud and Self-Host)

### Objective

Document and verify MCP on the **unified** Durabull deployment (API + web + `/mcp` on one service/port) for cloud and self-host.

### Deliverables

- [x] Cloud deployment docs updated (Render single web service; `https://app.durabull.io/mcp`).
- [x] Self-host Docker/compose docs: one port, `/mcp` path (remove `MCP_PORT` / `:3020` publish if present).
- [x] Environment variable contract (`APP_BASE_URL`, MCP telemetry/rate-limit notes; MCP always on — no enable flag).
- [x] TLS and ingress guidance: path-based `/mcp` on app domain (no second hostname required).
- [x] Operator runbook for key rotation, auth failures, and MCP client URL configuration.
- [x] Dashboards/metrics definitions for `/mcp` auth failures and tool error rates on unified service.

### File Targets

- [ ] `apps/docs/content/documentation/deployment/*`
- [ ] `apps/docs/content/documentation/getting-started/environment-variables.mdx`
- [ ] `tooling/docker/Dockerfile` and `tooling/docker/docker-compose.self-hosted.yaml`
- [ ] `render.yaml` or cloud blueprint references (if present in repo)

### Tests/Validation

- [ ] Staging deploy succeeds with `/mcp` reachable on app domain.
- [ ] Self-host smoke: `GET /api/health` and MCP `initialize` on same host/port.
- [ ] Runbook dry-run performed and documented.

### Exit Criteria

- [ ] Operators can deploy and maintain MCP at `{APP_BASE_URL}/mcp` without a separate MCP service.

---

## PR-08: GA Readiness + Security Closure

### Objective

Finalize production quality and confirm spec/safety compliance.

### Deliverables

- [x] Spec compliance checklist completed (MCP auth discovery + OAuth semantics + transport behavior).
- [x] Security review closure checklist completed (draft — human sign-off pending).
- [x] CI test duration recorded; draft SLO candidates documented (not validated on staging).
- [x] Final user/operator docs published (GA index + runbook links).
- [x] Release checklist and rollback procedure included.

### Full Validation Suite

- [ ] End-to-end delegated-user flow from supported MCP client (operator — staging).
- [ ] End-to-end service-account automation flow (operator — staging).
- [x] Negative test suite (invalid token, wrong audience, wrong scope, cross-org attempt) — automated; see security closure.
- [ ] Regression suite across existing API behavior touched by shared modules.
- [ ] Soak test for logs/stacktrace-heavy usage (post-GA).

### Exit Criteria

- [ ] MCP read-only GA approved for production rollout (after operator gates + security sign-off).

---

## Running History Ledger (Update Per PR)

> Copy this block for each PR and append entries as work progresses.

### PR Record Template

- PR ID: `PR-0X`
- Branch:
- Linear issue:
- PR URL:
- Status: `not started | in progress | in review | merged | blocked`
- Agent owner:
- Start date:
- Merge date:

#### Scope Completed

- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

#### Verification Evidence

- [ ] Commands run:
  - [ ] `...`
  - [ ] `...`
- [ ] Tests added:
  - [ ] `...`
- [ ] Security checks:
  - [ ] `...`

#### Safety Signoff

- [ ] No destructive capability introduced.
- [ ] Authz boundaries verified.
- [ ] Sensitive output redaction verified.

#### Handoff To Next PR

- Next PR:
- Known risks:
- Follow-up tasks:
- Notes for next agent:

---

### PR Record: PR-01

- PR ID: `PR-01`
- Branch: `feat/no-linear-mcp-pr01-security-baseline`
- Linear issue: `NO-LINEAR (temporary; to be backfilled before merge if required)`
- PR URL:
- Status: `folded into PR-04 (docs + runtime enforcement landed in later slices)`
- Agent owner: `codex`
- Start date: `2026-05-26`
- Merge date:

#### Scope Completed

- [ ] Standalone PR was not merged; baseline security decisions were carried forward into PR-02/03.
- [ ] ADR + operations-doc finalization is intentionally folded into PR-04 before security closure.

#### Verification Evidence

- [x] Commands run:
  - [x] `bun run lint --filter @durabull/docs`
  - [x] `bun run typecheck --filter @durabull/docs`
  - [x] `git status --short --branch && git diff --name-only` (docs/tasks/adr scoped diff only)
- [x] Tests added:
  - [x] Documentation-only PR; no runtime tests introduced in PR-01.
- [x] Security checks:
  - [x] Explicitly confirmed no destructive MCP capability introduced.
  - [x] Scope taxonomy and principal boundaries documented.

#### Safety Signoff

- [x] No destructive capability introduced.
- [x] Authz boundaries verified.
- [ ] Sensitive output redaction verified.

#### Handoff To Next PR

- Next PR: `PR-04` (fold-in completion)
- Known risks: runtime enforcement is not in this PR and must be implemented in PR-02/03/04.
- Follow-up tasks:
  - backfill Linear issue link if merge policy requires it.
  - ADR-0001 unified `/mcp` placement documented in PR-08 (`docs/adr/0001-mcp-security-architecture.md`).
- Notes for next agent:
  - treat ADR-0001 as source of truth for phase-1 **security** boundaries.
  - complete remaining PR-01 docs guarantees while landing PR-04 principal/policy enforcement.
  - **do not** build standalone `apps/mcp`; mount MCP on `apps/api` at `/mcp` (see Hosting model section above).
- PR-01 acceptance statement for PR body: `This PR defines security and scope contracts only; no MCP runtime behavior is introduced.`

---

### PR Record: PR-02

- PR ID: `PR-02`
- Branch: `cursor/mcp-pr02-api-ingress`
- Linear issue: `NO-LINEAR (temporary)`
- PR URL: https://github.com/durabullhq/durabull/pull/88
- Status: `merged`
- Agent owner: `cursor`
- Start date: `2026-05-26`
- Merge date: `2026-05-26`

#### Scope Completed

- [x] `@durabull/mcp` package with transport, host validation, server bootstrap, and `ping` smoke tool.
- [x] Thin ingress at `apps/api/src/mcp/mount.ts` mounted in `createApiApp()` at `/mcp`.
- [x] Streamable HTTP on `/mcp` (`GET` + `POST` + `DELETE` via `@hono/mcp`).
- [x] Host header validation including `APP_BASE_URL` host.
- [x] Integration tests via `createApiApp()` (initialize, tools/list, tools/call ping).
- [x] No standalone `apps/mcp` deployable or second public MCP port.

#### Verification Evidence

- [x] Commands run:
  - [x] `bun run --filter @durabull/mcp test`
  - [x] `bun run --filter @durabull/api test src/mcp/mount.test.ts`
  - [x] `bun run --filter @durabull/mcp typecheck`
  - [x] `bun run --filter @durabull/mcp lint`
- [x] Tests added:
  - [x] `packages/mcp/src/config/allowed-hosts.test.ts`
  - [x] `packages/mcp/src/routes.test.ts`
  - [x] `apps/api/src/mcp/mount.test.ts`

#### Handoff To Next PR

- Next PR: `PR-03`
- Known risks: MCP transport is currently unauthenticated (auth deferred to PR-03).
- Notes for next agent: add OAuth discovery + bearer validation on `/mcp`; canonical resource URI `${APP_BASE_URL}/mcp`.

---

### PR Record: PR-03

- PR ID: `PR-03`
- Branch: `cursor/mcp-pr03-oauth-discovery-token-validation`
- Linear issue: `NO-LINEAR (temporary)`
- PR URL: https://github.com/durabullhq/durabull/pull/89
- Status: `merged`
- Agent owner: `cursor`
- Start date: `2026-05-26`
- Merge date: `2026-05-27`

#### Scope Completed

- [x] Protected Resource Metadata at `GET /.well-known/oauth-protected-resource` on app origin.
- [x] `WWW-Authenticate` challenges on unauthenticated `/mcp` requests (`resource_metadata` URL).
- [x] Bearer required on all `/mcp` methods via Better Auth `getMcpSession` + Durabull scope middleware.
- [x] Expired access tokens rejected with `401` (`isMcpAccessTokenExpired` after `getMcpSession`).
- [x] Canonical resource URI `${APP_BASE_URL}/mcp` in PRM and validation helpers.
- [x] `401` / `403` semantics (invalid token vs insufficient scope).
- [x] Better Auth `mcp` plugin + `oauth_*` DAL tables/migration.
- [x] Session registry: new sessions only on `initialize`; cap at 256 sessions.
- [x] Operator doc `docs/mcp-oauth-operator.md`.

#### Verification Evidence

- [x] Commands run:
  - [x] `bun run --filter @durabull/mcp test` (30 pass)
  - [x] `bun run --filter @durabull/api test src/mcp/` (7 pass)
  - [x] `bun run --filter @durabull/mcp typecheck`
  - [x] `bun run --filter @durabull/auth typecheck`
  - [x] Live e2e: `cd tooling/scripts && APP_BASE_URL=http://localhost:3001 bun run mcp:e2e` (10/10 Better Auth, 9/9 authless)
- [x] Tests added:
  - [x] `packages/mcp/src/auth/validate-token.test.ts`
  - [x] `packages/mcp/src/auth/bearer-middleware.test.ts`
  - [x] `packages/mcp/src/auth/session.test.ts`
  - [x] Updated `packages/mcp/src/routes.test.ts` (401, session guard)
  - [x] Updated `apps/api/src/mcp/mount.test.ts` (401, PRM, ping flow, expired OAuth token)
  - [x] `tooling/scripts/mcp-e2e-smoke.ts` (repeatable live smoke)

#### Handoff To Next PR

- Next PR: `PR-04`
- Known risks: RFC 8707 `resource` binding on opaque tokens is not persisted at issuance yet (`resource` column ready; wire in token handler when enabling full OAuth client flows).
- Notes for next agent: add principal resolver + policy engine; enforce org/connection boundaries on tool calls.

---

### PR Record: PR-04

- PR ID: `PR-04`
- Branch: `feat/no-linear-mcp-pr04-principals-policy-engine`
- Linear issue: `NO-LINEAR (temporary)`
- PR URL: https://github.com/durabullhq/durabull/pull/94
- Status: `merged`
- Agent owner: `codex`
- Start date: `2026-05-26`
- Merge date: `2026-05-27`

#### Scope Completed

- [x] Principal resolver implemented for delegated users and OAuth-linked service accounts.
- [x] Central policy decision point added in MCP ingress middleware for every `tools/call`.
- [x] Org + connection boundary checks enforced in policy evaluation.
- [x] Service account + policy + audit DAL schema/migration added (`mcp_service_account*`, `mcp_policy_binding`, `mcp_audit_event`).
- [x] Repository support added for service-account lookup, policy bindings, and audit writes.
- [x] Service-account credential hashing + rotation path added (`mcpPolicyRepository.issueServiceAccountSecret/rotateServiceAccountSecret`).
- [x] Integration tests added for delegated and service-account policy enforcement through `/mcp`.
- [x] Request-scoped principal context plumbed into MCP tool execution path.

#### Verification Evidence

- [x] Commands run:
  - [x] `bun test packages/dal/src/repositories/mcp-policy.test.ts`
  - [x] `bun run --filter @durabull/api test src/mcp/mount.test.ts`
  - [x] `bun run --filter @durabull/dal typecheck`
  - [x] `bun run --filter @durabull/dal lint`
  - [ ] `bun run --filter @durabull/api typecheck` (blocked by pre-existing `alerts-global.test.ts` unknown-body typing errors)
- [x] Tests added:
  - [x] `packages/dal/src/repositories/mcp-policy.test.ts`
  - [x] Expanded `apps/api/src/mcp/mount.test.ts` with service-account allow/deny and delegated cross-org boundary cases.
- [x] Security checks:
  - [x] No destructive MCP tools introduced.
  - [x] Service-account policy bindings required for tool execution.
  - [x] Policy audit records persisted for allow + deny decisions.

#### Handoff To Next PR

- Next PR: `PR-05`
- Known risks (historical):
  - Domain read tools landed in PR-05 (#97).
  - RFC 8707 issuance binding follow-up from PR-03 still open.
- Follow-up tasks:
  - finalize PR-01 documentation fold-in artifacts before/with PR-04 PR description.
  - attach Linear issue IDs retroactively if required by merge policy.
- Notes for next agent:
  - keep policy as the single authorization gate for MCP tool calls.
  - register PR-05 read-only tools with explicit scope requirements and connection-bound checks.

---

### PR Record: PR-05

- PR ID: `PR-05`
- Branch: `feat/mcp-pr05-remaining-read-tools` (+ earlier work on PR-04 branch)
- Linear issue: `NO-LINEAR (temporary)`
- PR URL: https://github.com/durabullhq/durabull/pull/97
- Status: `merged`
- Agent owner: `codex`
- Start date: `2026-05-26`
- Merge date: `2026-05-27`

#### Scope Completed

- [x] Read-tool registration plumbing added to `@durabull/mcp` (`readTools` option in server/routes/registry).
- [x] Async request-context bridge added so tool handlers can read resolved principal/correlation metadata.
- [x] `list_connections` MCP tool implemented with pagination (`cursor`, `pageSize`) and structured output.
- [x] `list_queues` MCP tool implemented (`connectionId`, cursor/pageSize) with queue status + counts.
- [x] `get_queue` MCP tool implemented (`connectionId`, `queueName`) with workers/schedulers/counts snapshot.
- [x] `list_jobs` MCP tool implemented (`connectionId`, `queueName`, filters, cursor/pageSize).
- [x] `get_job` MCP tool implemented (`connectionId`, `queueName`, `jobId`) with safe job detail fields.
- [x] `get_job_logs` MCP tool implemented (`connectionId`, `queueName`, `jobId`, cursor/pageSize).
- [x] `get_job_stacktraces` MCP tool implemented (`connectionId`, `queueName`, `jobId`, cursor/pageSize).
- [x] API-backed tool handler added (`apps/api/src/mcp/tools/list-connections-handler.ts`).
- [x] API-backed queue/job handlers added (`list-queues-handler.ts`, `get-queue-handler.ts`, `list-jobs-handler.ts`).
- [x] Job/queue scope gates mapped:
  - [x] `list_connections`, `list_queues`, `get_queue`, `list_jobs`, `get_job` -> `mcp:jobs:read`
  - [x] `get_job_logs`, `get_job_stacktraces` -> `mcp:logs:read`
- [x] Integration tests for delegated pagination + service-account scoped access.

#### Verification Evidence

- [x] Commands run:
  - [x] `bun run --filter @durabull/mcp typecheck`
  - [x] `bun run --filter @durabull/mcp test`
  - [x] `bun run --filter @durabull/mcp lint`
  - [x] `bun run --filter @durabull/api test src/mcp/mount.test.ts`
  - [x] `bun test packages/dal/src/repositories/mcp-policy.test.ts`
  - [x] `bun run --filter @durabull/dal typecheck`
  - [x] `bun run --filter @durabull/dal lint`
  - [x] `bun run --filter @durabull/api test src/mcp/mount.test.ts` (updated: 14 pass)
- [x] Tests added:
  - [x] expanded `apps/api/src/mcp/mount.test.ts` with `list_connections` delegated + service-account scenarios.
  - [x] expanded `apps/api/src/mcp/mount.test.ts` with `mcp:jobs:read` denial path and tool list assertions for new tools.

#### Handoff To Next PR

- Next PR: `PR-06` (safety hardening)
- Known risks (historical — superseded by PR-06):
  - MCP output redaction was minimal before PR-06 central sanitizer.
- Follow-up tasks:
  - land remaining tools on `feat/mcp-pr05-remaining-read-tools` (`get_failure_events`, `get_queue_metrics`, `get_workers`, `explain_job_failure`).
- Notes for next agent:
  - keep all MCP tools read-only and route through existing policy middleware.
  - preserve request-context bridge; do not bypass principal/policy/audit path when adding tools.

#### PR-05 continuation (`feat/mcp-pr05-remaining-read-tools`)

- [x] `get_failure_events` (`mcp:failures:read`) with paginated alert events + sanitized context.
- [x] `get_queue_metrics` (`mcp:diagnostics:read`) with bounded summary (no Prometheus/raw series export).
- [x] `get_workers` (`mcp:jobs:read`) with queue-scoped worker snapshots.
- [x] `explain_job_failure` (`mcp:diagnostics:read` + `mcp:jobs:read` + `mcp:logs:read` + `mcp:failures:read`) deterministic composed summary.
- [x] Policy scope mappings + `tools/list` integration tests updated.
- [x] Unit tests: `explain-job-failure-handler.test.ts`, policy scope mapping test.

---

### PR Record: PR-06

- PR ID: `PR-06`
- Branch: `feat/no-linear-mcp-pr06-safety-hardening`
- Linear issue: `NO-LINEAR`
- PR URL: https://github.com/durabullhq/durabull/pull/98
- Status: `merged`
- Agent owner: `cursor`
- Start date: `2026-05-28`
- Merge date: `2026-05-28`

#### Scope Completed

- [x] Central output sanitizer in `@durabull/mcp` applied to all read-tool responses with `_mcpSafety.redactionCount` metadata.
- [x] Per-tool rate limiting middleware (60/min default, 30/min for heavy diagnostic tools) with JSON-RPC `429` responses.
- [x] Ingress MCP rate limit telemetry hooks (`rate_limited_ingress`).
- [x] Audit schema expansion (`input_hash`, `response_class`) and invocation audit on successful tool calls.
- [x] Structured `mcp_telemetry` JSON logging for policy denies, rate limits, and tool outcomes.
- [x] Docs app page: `integrations/mcp-server` + security/env var updates.

#### Verification Evidence

- [x] Commands run:
  - [x] `bun run --filter @durabull/mcp test` (39 pass)
  - [x] `bun run --filter @durabull/api test src/mcp/` (32 pass)
  - [x] `bun run --filter @durabull/mcp typecheck`
- [x] Tests added:
  - [x] `packages/mcp/src/safety/sanitize-output.test.ts`
  - [x] `apps/api/src/mcp/middleware/mcp-tool-rate-limit.test.ts`
  - [x] `apps/api/src/mcp/audit/mcp-audit.test.ts`
  - [x] `apps/api/src/mcp/tools/mcp-sanitize.test.ts`

#### Handoff To Next PR

- Next PR: `PR-07`
- Known risks: in-memory rate limits are per-process; multi-replica deployments should plan Redis-backed limits.
- Notes for next agent: document unified `/mcp` deployment for cloud/self-host and operator runbooks.

---

### PR Record: PR-07

- PR ID: `PR-07`
- Branch: `feat/no-linear-mcp-pr07-cloud-selfhost-ops`
- Linear issue: `NO-LINEAR`
- PR URL: https://github.com/durabullhq/durabull/pull/99
- Status: `merged`
- Agent owner: `cursor`
- Start date: `2026-05-28`
- Merge date: `2026-05-28`

#### Scope Completed

- [x] Cloud deployment docs: Render section in `deployment/render-and-demo.mdx` (unified `/mcp` on web service).
- [x] Self-host Docker/compose docs: MCP validation in `deployment/docker.mdx`; compose header comment (single port).
- [x] Environment contract: MCP always on; `MCP_TELEMETRY_LOG` documented; no `DURABULL_MCP_ENABLED`.
- [x] TLS/ingress guidance in `docs/mcp-operations-runbook.md` (path-based `/mcp`, same upstream as API).
- [x] Operator runbook: `docs/mcp-operations-runbook.md` (smoke, telemetry, audit, incidents, rotation).
- [x] Metrics definitions: `mcp_telemetry` signal table and suggested alerts in runbook.
- [x] Cross-links: deployment pages, troubleshooting MCP section, `mcp-oauth-operator.md`, `integrations/mcp-server.mdx`.
- [x] Parallel review fixes: scopes, runbook SQL/telemetry, `mcp:e2e` staging-only warnings, compose doc alignment, GitHub operator links, deduped user vs operator content.

#### Verification Evidence

- [x] Commands run:
  - [x] `bun run lint --filter @durabull/docs`
  - [x] `bun run typecheck --filter @durabull/docs`
- [x] Docs-only PR; runtime tests unchanged.
- [x] Runbook dry-run steps documented (curl PRM, `mcp:e2e`).

#### Handoff To Next PR

- Next PR: `PR-08`
- Known risks: staging deploy smoke must be run by operator with live credentials (not automated in CI for this PR).
- Notes for next agent: PR-08 GA docs; operator E2E on staging per release checklist.

---

### PR Record: PR-08

- PR ID: `PR-08`
- Branch: `feat/no-linear-mcp-pr08-ga-readiness`
- Linear issue: `NO-LINEAR`
- PR URL: https://github.com/durabullhq/durabull/pull/100
- Status: `in review`
- Agent owner: `cursor`
- Start date: `2026-05-28`
- Merge date:

#### Scope Completed

- [x] ADR-0001: `docs/adr/0001-mcp-security-architecture.md` (threat model, scopes, unified `/mcp` placement).
- [x] Spec compliance checklist: `docs/mcp-ga-compliance-checklist.md`.
- [x] Security review closure: `docs/mcp-ga-security-closure.md`.
- [x] Release + rollback checklist + draft SLO candidates (not validated): `docs/mcp-ga-release-checklist.md`.
- [x] Validation evidence: `docs/mcp-ga-validation-evidence.md` (76 automated tests: 41 + 33 + 2 DAL).
- [x] GA doc index: `docs/mcp-ga-index.md`; parallel review fixes applied.
- [x] Task docs updated: master plan §15, readiness review, playbook ledger.
- [x] User docs: GA links on `integrations/mcp-server.mdx`.

#### Verification Evidence

- [x] Commands run:
  - [x] `bun run --filter @durabull/mcp test` (41 pass)
  - [x] `bun run --filter @durabull/api test src/mcp/` (33 pass)
  - [x] `bun test packages/dal/src/repositories/mcp-policy.test.ts` (2 pass)
  - [x] `bun run --filter @durabull/mcp typecheck`
  - [x] `bun run lint --filter @durabull/docs`
  - [x] `bun run typecheck --filter @durabull/docs`
- [x] Security checks:
  - [x] No destructive MCP tools.
  - [x] Negative auth/authz coverage documented in compliance + security closure docs.
- [ ] Staging `mcp:e2e` re-run (operator gate — documented in release checklist).

#### Handoff To Next PR

- Next PR: _none — phase 1 stack complete after merge_
- Known risks: in-memory rate limits per replica; full API typecheck blocked by unrelated `alerts-global.test.ts`.
- Follow-ups: `packages/mcp-domain` extraction (optional); Redis-backed rate limits (phase 2); staging E2E before prod announcement.

---

## Live PR Tracker

- [ ] PR-01 Security architecture baseline (folded into PR-04 + ADR in PR-08)
- [x] PR-02 API `/mcp` ingress + transport (`@durabull/mcp` package + thin API mount)
- [x] PR-03 OAuth discovery + token validation (merged — PR #89)
- [x] PR-04 Principals + policy engine (merged — PR #94)
- [x] PR-05 Read-only diagnostic tools (merged — PR #97)
- [x] PR-06 Safety hardening (merged — PR #98)
- [x] PR-07 Deployment + operations (merged — PR #99)
- [ ] PR-08 GA readiness + security closure (in review — PR #100)

---

## Definition Of Done (Program-Level)

- [x] Hosted MCP available at `{APP_BASE_URL}/mcp` on unified deployment (cloud + self-host).
- [x] Read-only jobs/failures/logs/diagnostics tools fully functional.
- [x] Delegated users and service accounts both supported.
- [x] OAuth/tokening and least-privilege permissions enforced.
- [x] Security review documented with no open critical/high code findings (human sign-off pending — see `docs/mcp-ga-security-closure.md`).
- [x] Operational dashboards/runbooks in place (`docs/mcp-operations-runbook.md`).
- [x] Documentation complete for users, operators, and future implementers.
- [ ] Production announcement executed per `docs/mcp-ga-release-checklist.md` (staging smoke + operator sign-off).
