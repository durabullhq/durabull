# Competitor research index

**Date:** 2026-10-20  
**Rule:** Do not invent features, prices, or limits. Unverified items stay unverified.

The memos below record the initial research. The follow-up audit below corrects several assumptions in that snapshot. Published comparison data and guide sections link their primary references directly; verify those sources and Durabull’s implementation before updating claims.

## Follow-up audit and publishing method

The October 20 follow-up checked vendor documentation and the local implementation, then revised the catalog and all eight guides. It is a documentation review, not a performance benchmark or independent ranking. Important corrections:

- **Bull Board deployment modes:** the embedded UI accepts Queue instances that can use different Redis connections. The CLI supports Redis discovery and multiple prefixes. Optional historical metrics are distinct from alert delivery. See [the current README](https://github.com/felixmosh/bull-board) and [CLI guide](https://felixmosh.github.io/bull-board/docs/cli).
- **Backend compatibility:** [BullMQ now documents PostgreSQL](https://docs.bullmq.io/guide/postgresql). Durabull currently discovers Redis-backed queues; a BullMQ brand match alone does not establish compatibility.
- **Workbench limits:** its discovery limit is configurable, not a paid-plan restriction. Validate the chosen embedded, desktop, or Docker deployment mode against [official documentation](https://getworkbench.com/docs).
- **Monitoring signals:** [BullMQ historical metrics](https://docs.bullmq.io/guide/metrics) need worker configuration. Live queue counts and [Prometheus count export](https://docs.bullmq.io/guide/metrics/prometheus) are different signals. Missing historical data is not zero throughput.
- **Runtime costs:** compare billed units and included responsibilities. Durabull’s beta dashboard fee excludes Redis, workers, networking, and operational work. A managed execution fee may include compute or orchestration. Never label their difference as measured savings.
- **Inngest:** count the function run plus steps. Do not fabricate an exact 100M-execution quote from a published overage range without tier breakpoints. See [pricing](https://www.inngest.com/pricing).
- **Trigger.dev:** small-1x uses $0.0000338 per executing second plus $0.000025 per run. The guide and calculator model this usage only. Credits, concurrency, checkpoint behavior, and add-ons must be accounted for separately. See [pricing](https://trigger.dev/pricing).
- **MCP:** opt-in scopes do not make writes harmless. Retries can repeat external side effects. Redaction is pattern-based, and accepted actions need verification. The guide cites the [implemented tool catalog](../../packages/mcp/src/tools/tool-catalog.ts) and [security architecture](../adr/0001-mcp-security-architecture.md).
- **Limited evidence:** Defer and Upqueue remain explicitly qualified research context. Their pages are `noindex, follow` and excluded from the sitemap and LLM exports. A failed fetch is not evidence that a product is discontinued.

Each article has a short answer, named organizational author, publication/review dates, section citations, and complete source links. Pricing models state their assumptions. Native FAQ disclosures keep answers in the static HTML. The sitemap includes documentation routes and uses content dates rather than build timestamps. Page-specific social images are generated from the same catalog.

Search and AI discovery depend on useful, accessible, consistent content, not special markup promises. Follow [Google’s AI feature guidance](https://developers.google.com/search/docs/appearance/ai-features), [Article guidance](https://developers.google.com/search/docs/appearance/structured-data/article), and [lastmod guidance](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping). Structured data must match visible content; neither schema nor llms.txt guarantees inclusion or rankings.

## Research memos

| File | Scope |
| --- | --- |
| [competitor-research-bullmq-queue-uis.md](./competitor-research-bullmq-queue-uis.md) | Bull Board, Arena, Taskforce.sh, Workbench, BullMQ Pro, bull-monitor, QueueDash, Bullstudio, muleta, BullMQ Control Dashboard, Bullpane, nestjs-bullpen, Redis Insight, Upqueue |
| [competitor-research-managed-job-platforms.md](./competitor-research-managed-job-platforms.md) | Inngest, Trigger.dev, Temporal Cloud, Hatchet, Defer, Quirrel, QStash, SQS + Step Functions, Cloud Tasks, Cloudflare Queues, Graphile Worker, pg-boss, plus River / Sidekiq / Faktory / Oban / Restate / DBOS notes |
| [generic-observability-bullmq-comparison.md](./generic-observability-bullmq-comparison.md) | Datadog, Grafana/Prometheus, New Relic, Sentry, BullMQ metrics, Redis Cloud, OpenTelemetry, MCP search |

## Competitors on the site

**BullMQ / Redis UIs:** Bull Board, Arena, Taskforce.sh, Workbench, QueueDash, Bullpane, bull-monitor, Redis Insight, Upqueue, Bullstudio, muleta, BullMQ Control Dashboard, BullMQ Pro.

**Managed platforms:** Inngest, Trigger.dev, Temporal Cloud, Hatchet, Upstash QStash, Amazon SQS + Step Functions, Google Cloud Tasks, Cloudflare Queues, Graphile Worker, pg-boss, Defer (current status unverified), Quirrel (hosted ended).

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
- **Sentry** automatic BullMQ instrumentation: Node queue monitoring can be instrumented manually; do not confuse this with an automatic BullMQ integration.
- Product Hunt rankings (no dedicated listings found).
- Customer logos on the Durabull homepage (not reused on compare pages).

## Durabull claims used on compare pages

Only what the repo already documents:

- Redis SCAN `<prefix>:*:meta`, no worker SDK for inspection
- Historical completion metrics and `job.log()` need worker configuration; live counts do not
- Multiple connections, env enum
- Alerts: email, signed webhooks, Linear — not native Slack/PagerDuty
- MCP: 30 tools, 9 scopes, opt-in writes, redaction
- Hosted $0/mo during beta
- ELv2, not OSI open source
- Homebrew is the **desktop cask**, not a CLI
- Cursor MCP “not fully tested”

## Facts to recheck before future publication

1. Whether beta remains $0 with unlimited connections (homepage claim).
2. Whether to name Taskforce.sh as the closest commercial peer in paid ads (we already do on the vs page).
3. Future paid SKUs — do not invent them.
4. Whether Upqueue should stay listed after someone loads upqueue.io from a non-blocked network.
5. Backend support, MCP tool counts, and vendor deployment modes as new releases ship.
