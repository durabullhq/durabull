# Handoff: Analytics package split + MCP product telemetry

> Historical planning and handoff record. Implementation and test results below describe the
> work at the time they were recorded. For current behavior and release gates, use the
> [MCP documentation index](../docs/mcp-ga-index.md) and the
> [user guide](../apps/docs/content/documentation/integrations/mcp-server.mdx).

**Branch:** `main`
**Last verified:** 2026-05-28 — P3 focused telemetry/web/docs checks passed; unrelated current-main checks noted below
**Timeline:** #107 → #108 → #109 → #110 → #112 → #113 (all merged) → **P3 complete locally**

---

## Status timeline

| Stage | What shipped | State |
|-------|--------------|-------|
| **PR #107** | Server capture package + MCP PostHog telemetry | ✅ merged |
| **PR #108** | P0: server runtime on `/collect`, `/events` preflight, PostHog host allowlist | ✅ merged |
| **PR #109** | MCP org `$groups` fix, fetch timeouts, single-flight instance id, timestamp clamp, hygiene | ✅ merged |
| **PR #110** | P0-A `/collect` HMAC auth + trusted OSS runtime; P0-B XFF/proxy trust for rate limits | ✅ merged |
| **PR #112** | P1: PostHog dedupe/coalesce, connection query de-dup, async `/collect` queue, bounded `/events` queue | ✅ merged |
| **PR #113** | Dedicated `DURABULL_TELEMETRY_HMAC_SECRET`; `/collect` signature replay LRU | ✅ merged |
| **P3 (local)** | Shared bounded telemetry queue helper, queue-drop operational signal, root barrel migration to `/browser`, telemetry signal docs | ✅ done |

**Lesson:** Branch from latest `origin/main` before starting. Parallel PRs (#109 vs #110) touched the same files — rebase/merge required.

---

## Completed on P2

### Dedicated telemetry HMAC secret

- `configure-server-analytics.ts` now uses **only** `DURABULL_TELEMETRY_HMAC_SECRET` for distinct_id / instance_key HMAC.
- `BETTER_AUTH_SECRET` fallback removed — cloud/OSS deploys must set the dedicated secret explicitly.
- `POSTHOG_KEY` fallback for Durabull telemetry PostHog key remains unchanged.

### `/collect` signature replay protection

- `collect-auth.ts`: bounded in-process replay LRU (4096 entries, TTL = signature tolerance window).
- Replayed signatures within ±300s return `{ ok: false, error: 'replay' }` → route responds **401**.
- `resetTelemetryCollectReplayCacheForTests()` exported for test isolation.

## Completed on P3

### Shared bounded telemetry queue

- Added `createBoundedAsyncQueue` and moved `/collect`, `/events`, and MCP analytics onto it.
- Each queue keeps its existing in-flight/depth limits and test-only reset helpers.
- Queue-full paths emit a `telemetry_queue` stdout JSON signal with `signal: "queue_dropped"`, queue name, dropped count, in-flight count, and queued count.

### Root barrel migration

- Browser-side analytics imports now use `@durabull/analytics/browser`.
- Analytics constants/types now use `@durabull/analytics/events`.
- No TypeScript source/test files import the deprecated root `@durabull/analytics` barrel.

### Telemetry signal docs

- `docs/mcp-operations-runbook.md` documents `telemetry_queue` operational signals and suggested log-derived metrics.
- Docs environment reference now lists telemetry HMAC/collect secrets and privacy boundaries.
- HTTP API docs now call out `202` enqueue behavior, `503` backpressure, and queue-drop signal contents.

### Parallel review loop

- Four-lens review found one High correctness issue: stale in-flight queue work could mutate counters after `resetForTests()`.
- `createBoundedAsyncQueue` now uses an epoch guard to ignore stale completions after reset and wraps processors so synchronous throws still release capacity.
- Re-review across security, performance, correctness, and maintainability reported **no remaining Critical/High issues**.

---

## Remaining deferrals

| Priority | Item |
|----------|------|
| P1 | ✅ Done (PR #112): PostHog dedupe/coalesce, delegated connection query de-dup, async `/collect` queue, bounded `/events` queue |
| P2 | ✅ Done (2026-05-28): Dedicated `DURABULL_TELEMETRY_HMAC_SECRET`, signature replay LRU |
| P3 | ✅ Done (2026-05-28): Barrel migration, shared queue helper, telemetry queue-drop signal/docs |

**Parallel review loop (P2):** Pass 1 found Medium replay-cache TTL misalignment and unguarded test reset exports. Fixed both, plus off-by-one at tolerance boundary. Pass 3 reported **no Critical/High issues**.

---

## Verification

```bash
bun test \
  packages/analytics/src/server/collect-auth.test.ts \
  packages/analytics/src/server/capture.test.ts \
  packages/analytics/src/server/validate.test.ts \
  packages/analytics/src/server/identifiers.test.ts \
  packages/analytics/src/server/posthog-batch.test.ts \
  apps/api/src/lib/bounded-async-queue.test.ts \
  apps/api/src/routes/telemetry-collect-queue.test.ts \
  apps/api/src/mcp/observability/mcp-analytics-queue.test.ts \
  apps/api/src/mcp/tools/shared.test.ts \
  apps/api/src/routes/telemetry-events-queue.test.ts \
  apps/api/src/routes/telemetry.test.ts \
  apps/api/src/routes/telemetry-collect.test.ts \
  apps/api/src/mcp/observability/mcp-analytics.test.ts \
  apps/api/src/middleware/rate-limit.test.ts
```

**Gotcha:** `apps/api/src/app.test.ts` fails in sandbox with `CI=true` / missing `MCP_AUTHLESS_BEARER_TOKEN`.

Additional P3 verification:

- `bun run test:unit src/components/app-update-banner.test.tsx src/routes/settings.test.tsx src/routes/queue-detail-scheduled-create.test.tsx src/routes/queue-detail-remove.test.tsx src/routes/job-detail-remove.test.tsx` in `apps/web` ✅
- `bun run typecheck` in `apps/web` ✅
- `bun run lint` in `apps/docs` ✅
- `bun test apps/api/src/lib/bounded-async-queue.test.ts apps/api/src/routes/telemetry-events-queue.test.ts apps/api/src/routes/telemetry-collect-queue.test.ts apps/api/src/mcp/observability/mcp-analytics-queue.test.ts` ✅ after review-loop fix
- `rg "from ['\"]@durabull/analytics['\"]|vi\.mock\(['\"]@durabull/analytics['\"]|importActual<typeof import\(['\"]@durabull/analytics['\"]\)>"` ✅ no matches

Current-main verification caveats, unrelated to P3:

- `bun run typecheck` in `apps/api` fails in `src/mcp/tools/shared.test.ts` and `src/routes/alerts-global.test.ts`.
- `bun run lint` in `apps/api` reports pre-existing warnings in `src/lib/alert-webhook-payload.ts` and `src/mcp/auth/authless-metadata.ts`.
- `bun run lint` in `apps/web` reports pre-existing hook dependency warnings in queue/consent/login routes.
- `bun run typecheck` in `apps/docs` fails on stale `.next/types/app/home-2/*` generated references.

---

## Environment reference

| Variable | Purpose |
|----------|---------|
| `DURABULL_TELEMETRY_COLLECT_SECRET` | HMAC signing for `/collect` (OSS + cloud) |
| `DURABULL_TELEMETRY_HMAC_SECRET` | **Required** for distinct_id / instance_key HMAC (no auth-secret fallback) |
| `TRUST_PROXY` | Honor forwarding headers for rate limits |
| `DURABULL_CLOUD` | Enables `/collect` + trusted proxy |

**Cloud deploy note:** Set `DURABULL_TELEMETRY_HMAC_SECRET` explicitly — it is no longer derived from `BETTER_AUTH_SECRET`.

---

## Lessons

- **Always `git fetch origin main` and rebase/merge before opening a telemetry PR** — parallel PRs (#109 vs #110) touched the same files.
- **Do not `git stash` to peek** while holding uncommitted work — use a worktree or WIP commit.
- **One deferral item per PR** — P3 should split barrel migration, shared queue helper, and signal docs if they grow large.
