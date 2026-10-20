# Competitor research index

**Date:** 2026-10-20  
**Rule:** Do not invent features, prices, or limits. Unverified items stay unverified.

This PR’s comparison pages are sourced from the three research memos below. If a marketing sentence is not in those files or in Durabull’s own docs, it should not ship.

## Research memos

| File | Scope |
| --- | --- |
| [competitor-research-bullmq-queue-uis.md](./competitor-research-bullmq-queue-uis.md) | Bull Board, Arena, Taskforce.sh, Workbench, BullMQ Pro, bull-monitor, QueueDash, Bullstudio, muleta, BullMQ Control Dashboard, Bullpane, nestjs-bullpen, Redis Insight, Upqueue |
| [competitor-research-managed-job-platforms.md](./competitor-research-managed-job-platforms.md) | Inngest, Trigger.dev, Temporal Cloud, Hatchet, Defer, Quirrel, QStash, SQS + Step Functions, Cloud Tasks, Cloudflare Queues, Graphile Worker, pg-boss, plus River / Sidekiq / Faktory / Oban / Restate / DBOS notes |
| [generic-observability-bullmq-comparison.md](./generic-observability-bullmq-comparison.md) | Datadog, Grafana/Prometheus, New Relic, Sentry, BullMQ metrics, Redis Cloud, OpenTelemetry, MCP search |

## Competitors on the site

**BullMQ / Redis UIs:** Bull Board, Arena, Taskforce.sh, Workbench, QueueDash, Bullpane, bull-monitor, Redis Insight, Upqueue, Bullstudio, muleta, BullMQ Control Dashboard, BullMQ Pro.

**Managed platforms:** Inngest, Trigger.dev, Temporal Cloud, Hatchet, Upstash QStash, Amazon SQS + Step Functions, Google Cloud Tasks, Cloudflare Queues, Graphile Worker, pg-boss, Defer (sunset), Quirrel (hosted ended).

**Observability:** Datadog, Grafana + Prometheus, New Relic, Sentry.

## Covered in research, no dedicated vs-page

These are in the memos. They were left as mentions, not extra URLs, to keep the hub scannable:

- nestjs-bullpen (Nest-only embed)
- River, Sidekiq Pro/Enterprise, Faktory, Oban Pro, Restate Cloud, DBOS Conductor
- Upstash Workflow (priced next to QStash)
- Community `@adamhancock/bullmq-mcp`
- Redis Cloud observability SKU
- `bullmq-otel` as a library, not a product

## Could not verify

- **Upqueue** prices, plans, MCP, and even the live homepage (geo-block on 2026-10-20).
- **Bullstudio Cloud** dollar prices (docs index 500; workspace caps exist).
- **BullMQ Pro** current public dollar price (not on taskforce.sh/pricing).
- **Taskforce.sh on-prem** list price.
- **Inngest** Pro/Business overage *breakpoints* (only $0.000050–$0.000015 range).
- **QStash retry billing** (same official markdown contradicts itself).
- **Datadog** job payload browser / retry (not published).
- **Sentry** global BullMQ auto-instrumentation (product Queues docs still say Celery).
- Product Hunt rankings (no dedicated listings found).
- Customer logos on the Durabull homepage (not reused on compare pages).

## Durabull claims used on compare pages

Only what the repo already documents:

- Redis SCAN `<prefix>:*:meta`, no worker SDK for inspection
- Metrics and `job.log()` need worker changes
- Multiple connections, env enum
- Alerts: email, signed webhooks, Linear — not native Slack/PagerDuty
- MCP: 30 tools, 9 scopes, opt-in writes, redaction
- Hosted $0/mo during beta
- ELv2, not OSI open source
- Homebrew is the **desktop cask**, not a CLI
- Cursor MCP “not fully tested”

## Gregg should confirm before treating as evergreen

1. Whether beta remains $0 with unlimited connections (homepage claim).
2. Whether to name Taskforce.sh as the closest commercial peer in paid ads (we already do on the vs page).
3. Future paid SKUs — do not invent them.
4. Whether Upqueue should stay listed after someone loads upqueue.io from a non-blocked network.
5. Linear: this workspace has no Durabull team, so no Linear issue was created.
