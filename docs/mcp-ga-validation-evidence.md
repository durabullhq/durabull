# MCP — Validation Evidence

## Phase 2 (2026-09-09) — catalog, structured output, resources, prompts, write tools

```bash
cd packages/mcp && bunx tsc --noEmit && bun test      # 68 pass (12 files)
cd packages/auth && bun test                             # 8 pass
cd apps/api && bunx tsc --noEmit && bun test src/mcp     # 81 pass (14 files)
cd apps/web && bunx tsc --noEmit -p .                    # consent screen write-scope badge
```

New or extended coverage:

- `packages/mcp/src/tools/tool-catalog.test.ts` — every tool has title/description/annotations, read-only ⇔ no write scope, no destructive names, output schema present, scopes known.
- `packages/mcp/src/tools/docs-consistency.test.ts` — user doc and ADR list every tool, scope, resource template, and prompt.
- `packages/mcp/src/resources/resource-catalog.test.ts`, `prompts/prompt-catalog.test.ts` — URI parsing fails closed; prompts reference only real tools.
- `packages/mcp/src/routes.test.ts` — `tools/list` metadata, `structuredContent`, argument validation, `resources/*`, `prompts/*` end to end.
- `apps/api/src/mcp/policy/policy-engine.test.ts` — catalog-driven scopes, write scopes denied to the read bundle, resource operations, effective scopes.
- `apps/api/src/mcp/json-rpc-tool-call.test.ts` — `tools/call` and `resources/read` parsing.
- `apps/api/src/mcp/tools/write-handlers.test.ts`, `read-handlers.test.ts` — every new handler validated against its output schema; secrets/targets stripped; state guards return `conflict`.
- `apps/api/src/mcp/mount.test.ts` — full catalog advertised; write tools return `403 insufficient_scope` for read-bundle tokens; `resources/read` authorized and unknown URIs rejected with `400`; prompts served; `structuredContent` returned.

# Phase 1 — Validation Evidence (PR-08)

**Recorded:** 2026-05-28  
**Branch:** `feat/no-linear-mcp-pr08-ga-readiness`  
**Base:** `origin/main` (includes PR #99 PR-07)

## Commands executed

```bash
bun run --filter @durabull/mcp test
bun run --filter @durabull/api test src/mcp/
bun test packages/dal/src/repositories/mcp-policy.test.ts
bun run --filter @durabull/mcp typecheck
bun run lint --filter @durabull/docs
bun run typecheck --filter @durabull/docs
```

## Results

### `@durabull/mcp test`

- **41 pass**, 0 fail (8 files)
- Covers: transport lifecycle, host validation, bearer middleware, token validation, session expiry, output sanitization

### `@durabull/api test src/mcp/`

- **33 pass**, 0 fail (7 files)
- Covers: PRM, OAuth 401/403 paths, policy denies (scopes, SA bindings, cross-org), `list_connections` success paths, rate limit 429, explain_job_failure, audit hashing, job read handlers

### `packages/dal/.../mcp-policy.test.ts`

- **2 pass**, 0 fail
- Service account secret issue/verify and rotation

### Typecheck

| Package | Result |
| --- | --- |
| `@durabull/mcp` | Pass |
| `@durabull/api` | **Fail** — pre-existing `src/routes/alerts-global.test.ts` TS18046 (`body` unknown). Unrelated to MCP; see compliance known follow-ups. |
| `@durabull/docs` | Pass (lint + typecheck) |

### Live E2E (`mcp:e2e`)

Not re-run in PR-08 CI context (requires running API + staging/local DB). Prior merged evidence (PR-03 playbook):

```text
cd tooling/scripts && APP_BASE_URL=http://localhost:3001 bun run mcp:e2e
# Better Auth: 10/10 pass; authless: 9/9 pass
```

### Browser OAuth E2E (Playwright)

**Recorded:** 2026-05-28 (OAuth consent UI)

```text
cd apps/web && bun run test:e2e e2e/mcp-oauth.spec.ts
# 4 passed:
#   - POST /mcp 401 → WWW-Authenticate → PRM (app + auth paths) → AS metadata → register
#   - register → authorize → consent → token → MCP ping (authenticated)
#   - consent Deny → access_denied callback
#   - logged-out authorize → login → consent → token → ping
```

Uses real authorization code + PKCE (no DB token seeding). Requires `@durabull/api` + `@durabull/web` dev servers (Playwright `webServer`). Runs in CI via `bun run test:e2e`.

**Operator gate:** Re-run on staging before production GA announcement (see release checklist).

## Regression scope

MCP changes share modules with API job/queue routes via tool handlers; full API regression suite not re-run in this PR. Recommended before large releases:

```bash
bun run --filter @durabull/api test
```

## Soak / load

Not executed in PR-08. Phase 1 acceptance defers soak tests for log-heavy tools to post-GA monitoring (SLOs in release checklist).
