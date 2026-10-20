# Generic observability for BullMQ / Redis queues

Research for Durabull marketing comparison pages.

- **Researched:** 20 October 2026
- **Method:** live official docs, first-party pricing pages, GitHub repositories, and vendor MCP pages. Secondary blogs were not used as evidence for features or prices.
- **Constraint:** do not invent prices or features. If a vendor page does not publish a capability, this document says so. If a figure could not be re-fetched, it is flagged.

This is **not** a comparison of dedicated BullMQ dashboards (Durabull, Taskforce.sh, Bull Board, Workbench). Those products operate queues. The tools below are generic observability stacks that teams often already pay for, then try to stretch onto BullMQ.

## How to use this on marketing pages

Safe claims (all sourced below):

- Generic APM/infra tools monitor **Redis as a server** (memory, ops/sec, connections) or **application traces** around producers/consumers.
- They do **not** publish first-class “discover every BullMQ queue, open a job payload, retry it” workflows.
- Datadog **does** have first-party BullMQ tracing and Data Streams Monitoring (library instrumentation, not Redis queue discovery).
- BullMQ itself ships Prometheus export and OpenTelemetry via `bullmq-otel`.
- Community Prometheus exporters exist; they are not Grafana Labs products.
- Several vendors have **MCP servers for their own telemetry**. None of Datadog, Grafana, New Relic, Sentry, or Redis Cloud publish a BullMQ operations MCP (retry/inspect/pause). Dedicated BullMQ MCP servers exist separately.

Unsafe claims (do not use):

- Any dollar figure not copied from a cited pricing page.
- “Datadog/New Relic/Sentry discovers BullMQ queues automatically” without the instrumentation caveat.
- “Grafana has an official BullMQ integration.”
- “Sentry auto-instruments BullMQ” as a product-wide statement (product Queues docs still say Celery only; NestJS SDK work exists on GitHub).

---

## Comparison matrix

| Product | What it actually monitors | Discovers BullMQ queues? | Retry / inspect job payloads? | MCP | Published pricing (see sections) | Use vs a dedicated BullMQ dashboard |
| --- | --- | --- | --- | --- | --- | --- |
| **Datadog** | Redis INFO metrics; APM traces of `bullmq` producers/consumers; optional Data Streams Monitoring | No Redis-key discovery. APM/DSM see **instrumented** `bullmq` library calls | **Not published.** No job retry, pause, or payload browser in Redis/APM docs | Yes — Datadog observability MCP, not BullMQ ops | APM host + custom metrics + optional DSM; Redis check is part of the Agent | Use for Redis health + end-to-end traces. Not a queue console |
| **Grafana + Prometheus** | Whatever you scrape: Redis exporter and/or BullMQ metrics | Only if the exporter scans Redis or you hard-code queue names | Built-in Grafana: **no**. Some community exporters bundle a queue UI | Grafana Cloud / OSS MCP query Grafana data, not Redis jobs | OSS Grafana is free (AGPLv3). Grafana Cloud is usage-based | Use for time series and alerts. Not job operations |
| **New Relic** | Redis server integration (`INFO` / key lengths); Node APM Redis/ioredis; generic background transactions | **No.** `bullmq` is not in the Node.js instrumented-modules list | **Not published** | Yes — New Relic MCP | Usage-based: data ingest + users (not per host) | Use for Redis + app APM. Instrument workers yourself |
| **Sentry** | Errors in workers; optional Queues dashboard from custom spans; Crons check-ins for **scheduled** jobs | Destinations appear from instrumented spans, not Redis scan | **Not published.** No retry/inspect of BullMQ jobs | Yes — Sentry MCP | Paid plans include 1 cron monitor; extra monitors PAYG | Use for job **errors** and missed crons. Not a queue dashboard |
| **BullMQ official metrics** | Per-queue job counts and completed/failed counters | You must construct a `Queue` per name | Metrics only | No (not in docs.bullmq.io) | Free (library feature) | Feed Grafana/Prometheus. Still need a dashboard for ops |
| **Redis Cloud observability** | Redis Cloud database metrics (ops, latency, memory, keys, connections) | **No** BullMQ awareness | **No** | Not published as Redis Cloud MCP | Included in Cloud plans; Prometheus/Datadog export is **Pro** | Use for the Redis hosting layer only |
| **OpenTelemetry (`bullmq-otel`)** | Traces of job lifecycle; optional OTel metrics | Only queues/workers you attach telemetry to | **No** | N/A (export to any OTLP backend) | Free library; backend cost is the vendor you export to | Use when you already standardized on OTel |

---

## 1. Datadog

### Redis integration

**Official docs:** [https://docs.datadoghq.com/integrations/redis](https://docs.datadoghq.com/integrations/redis)

The Agent Redis check (`redisdb`) is included in the Datadog Agent (minimum Agent 6.0.0; integration version listed as 8.10.0 on the docs page fetched 20 Oct 2026). Datadog’s overview copy says it applies “whether you use Redis as a database, cache, or **message queue**.” That refers to Redis itself (performance, memory, blocked clients, persistence, expired/evicted keys), **not** BullMQ queue objects.

Setup is Agent config (`redisdb.d/conf.yaml`: host, port, optional username/password). Redis 6+ ACLs need at least `DB Viewer`, `Cluster Viewer` in cluster mode, and `+config|get +info +slowlog|get`. The check does **not** support Amazon ElastiCache IAM auth.

**Metrics (high level):** hundreds of Redis INFO-derived gauges (`redis.mem.used`, `redis.keys`, `redis.net.instantaneous_ops_per_sec`, slowlog percentiles, replication, cluster, Redis Search, Sentinel, …). Optional:

- `command_stats` → `redis.command.calls` / `redis.command.usec_per_call` tagged by command
- `keys` → `redis.key.length` for **named keys you list** (not automatic BullMQ queue discovery)

**Logs:** Redis log file tailing, disabled until `logs_enabled: true`.

**Service checks:** `redis.can_connect`, `redis.replication.master_link_status`.

**Events:** none.

**Trace collection:** “Datadog APM integrates with Redis” — that is **client tracing** of Redis commands from instrumented apps (`redis` and `ioredis` are fully supported data stores), not BullMQ job APIs.

**Does it discover BullMQ queues?** No. Listing specific Redis keys can give list lengths, but BullMQ state is not a single LIST key, and Datadog does not document scanning `bull:*` prefixes.

**Retry / inspect payloads?** Not in the Redis integration docs. The check collects metrics and service checks only.

### BullMQ integration (APM + Data Streams Monitoring)

Datadog **does** have first-party BullMQ support in `dd-trace`.

| Source | What it states |
| --- | --- |
| [Node.js compatibility](https://docs.datadoghq.com/tracing/trace_collection/compatibility/nodejs.md) | Worker compatibility: `bullmq` `>=5.66.0`, fully supported |
| [Node.js SDK config](https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/) | `DD_TRACE_BULLMQ_ENABLED` (boolean, default `true`, since `v5.83.0`) |
| [Data Streams Monitoring for BullMQ](https://docs.datadoghq.com/data_streams/setup/technologies/bullmq.md) | Node.js library `bullmq`; **minimal tracer 5.82.0**; Agent v7.34.0+ |
| [DSM Node.js setup](https://docs.datadoghq.com/data_streams/setup/language/nodejs.md) | Same table; enable with `DD_DATA_STREAMS_ENABLED=true` |
| [dd-trace plugin API](https://datadoghq.dev/dd-trace-js/interfaces/plugins.bullmq.html) | Auto-instruments BullMQ. Options: `enabled`, `measured`, `service`, `producerFilter` on `Queue.add` / `addBulk` / `FlowProducer.add` (can skip span creation using job `data`/`name`/`opts`/`queueName`). Consumer (`Worker`) instrumentation is unaffected by that filter |
| [dd-trace-js PR #7123](https://github.com/DataDog/dd-trace-js/pull/7123) | APM tracing + DSM: production and consumption, ESM/CJS, context propagation, peer-service tagging |

**Code changes required:**

1. Install `dd-trace` and initialize it **before** importing BullMQ (`NODE_OPTIONS='--require dd-trace/init'` or equivalent).
2. For DSM, set `DD_DATA_STREAMS_ENABLED=true` (and Datadog recommends `DD_TRACE_REMOVE_INTEGRATION_SERVICE_NAMES_ENABLED=true`).
3. No Redis sidecar required for tracing; this is in-process library instrumentation.

**What this is not:** DSM setup copy describes measuring end-to-end latencies and relationships between queues and services via auto-instrumentation. It does not describe browsing waiting/failed jobs, reading payloads, or retrying. DSM is **not supported** on Datadog gov sites (`app.ddog-gov.com`, `us2.ddog-gov.com`) per the product callout.

**BullMQ Pro caveat (not Datadog docs):** Taskforce.sh support issue [#135](https://github.com/taskforcesh/bullmq-pro-support/issues/135) reports that Datadog’s first-party plugin may not wrap BullMQ Pro the same way as OSS `bullmq`. That is a third-party support thread, not a Datadog guarantee.

### APM for queues

APM treats BullMQ as a **worker/messaging library**: producer and consumer spans, optional DSM topology. Redis datastore spans are a separate plugin (`redis` / `ioredis`). Together you can see “this HTTP request enqueued a job” and “this worker processed it,” plus Redis command time if the worker talks to Redis through an instrumented client (BullMQ uses ioredis internally — **whether those internal Redis commands appear as child spans was not verified** in public docs).

### MCP

**Official:** [https://docs.datadoghq.com/mcp_server/](https://docs.datadoghq.com/mcp_server/) and [setup](https://docs.datadoghq.com/mcp_server/setup/)

- Remote endpoint example: `https://mcp.datadoghq.com/v1/mcp` (site-specific hosts exist, e.g. EU `mcp.datadoghq.eu`).
- Purpose: query Datadog (logs, metrics, traces, monitors, dashboards, security signals).
- Auth: OAuth 2.0 preferred; PAT/SAT bearer as fallback.
- **Not a BullMQ operations API.** No published tools to retry jobs or read Redis payloads.

### Pricing (published)

Sources: [pricing list](https://www.datadoghq.com/pricing/list/), [APM billing](https://docs.datadoghq.com/account_management/billing/apm_distributed_tracing/), [custom metrics billing](https://docs.datadoghq.com/account_management/billing/custom_metrics/).

Figures below are **list prices as published on those pages on 20 Oct 2026**. Contracts can differ. Existing customers are told to use their billing agreement.

**Infrastructure (needed for the Redis Agent check):**

| Product | Unit | Annual | Month-to-month | On-demand |
| --- | --- | --- | --- | --- |
| Infrastructure Pro | per infra host / month | $15 | $18 | $18 |
| Infrastructure Enterprise | per infra host / month | $23 | $27 | $27 |

**APM:**

| Product | Unit | Annual | Month-to-month | On-demand |
| --- | --- | --- | --- | --- |
| APM | per APM host / month | $31 | $36 | $36 |
| APM Pro (APM + Data Streams Monitoring) | per APM host / month | $35 | $42 | $42 |
| APM Enterprise (APM + DSM + Continuous Profiler) | per APM host / month | $40 | $48 | $48 |
| Data Streams Monitoring (standalone SKU on the list) | per client host / month | $15 | $18 | $18 |
| APM Ingestion | per ingested GB / month | $0.10 | $0.10 | $0.10 |

APM billing docs (annual-style examples) also state:

- **$31** per underlying APM host / month, with **1 million indexed spans** and **150 GB ingested spans** included per host per month.
- Excess indexed spans: **$1.70 per million / month** (15-day retention in the billing-doc table; the public list also publishes 7-day $1.27 and 30-day $2.50 annual).
- Excess ingested spans: **$0.10 per GB / month**.
- Fargate APM: **$6** per concurrent task / month (195,000 indexed spans and 30 GB ingested included) — from APM billing docs.
- Hosts are billed on a high-watermark plan (9th highest hourly measurement; 8th in February).
- Universal Service Monitoring is included in all APM tiers at no additional cost (billing docs).
- DSM and Continuous Profiler can be purchased standalone — “contact Sales” for that packaging; the public list still shows DSM at $15 / client host / month annual.

**Custom metrics** (relevant if you scrape BullMQ Prometheus into Datadog or emit DogStatsD queue gauges):

- Public list: **$5 per 100 custom metrics / month**; **$0.10 per 100 ingested custom metrics / month**.
- Allotment ([custom metrics billing](https://docs.datadoghq.com/account_management/billing/custom_metrics/)): **Pro 100 indexed + 100 ingested custom metrics per host**; **Enterprise 200 + 200**. Pooled across licensed hosts.
- Indexed overage: “an amount specified in your current contract” (docs do not always equal the $5 list). Ingested overage with Metrics without Limits™: **$0.10 per 100**.

The Redis integration metrics are **standard integration metrics**, not custom metrics. Homegrown BullMQ gauges sent via DogStatsD **are** custom metrics.

### When to use Datadog vs a dedicated BullMQ dashboard

**Use Datadog** when you already run Datadog for infra/APM and need: Redis saturation, worker process traces, producer→consumer latency via DSM, correlation with logs.

**Use a dedicated dashboard** when you need to list failed jobs, read/redact payloads, retry/promote, pause a queue, or let an agent do those things over MCP. Datadog does not document those operations.

---

## 2. Grafana + Prometheus exporters for BullMQ

### Official Grafana Labs BullMQ product?

**Not found.** Grafana Labs does not publish a first-party “BullMQ integration.” What exists:

1. **Grafana OSS** — visualization/alerting. [Download OSS](https://grafana.com/grafana/download?edition=oss) (AGPLv3, free). [OSS overview](https://grafana.com/oss/grafana/).
2. **Grafana Cloud** — hosted Grafana + metrics/logs/traces. [Pricing](https://grafana.com/pricing/).
3. **Community dashboards** on grafana.com (not Grafana Labs–maintained).
4. **Prometheus exporters** on GitHub (community).
5. **BullMQ’s own** `exportPrometheusMetrics()` (section 5).

Do not describe Grafana as having official BullMQ discovery.

### How the stack works

Typical path:

1. Something exposes Prometheus text format (`/metrics`).
2. Prometheus (or Grafana Cloud Metrics / Alloy) scrapes it.
3. Grafana dashboards PromQL. Alerting is Grafana-managed or Alertmanager.

### Path A — BullMQ built-in exporter (application code)

**Docs:** [https://docs.bullmq.io/guide/metrics/prometheus](https://docs.bullmq.io/guide/metrics/prometheus)

**Code changes: yes.** You add an HTTP endpoint in **your** Node process that holds `Queue` instances and call `queue.exportPrometheusMetrics()`. Optional `globalVariables` add labels (`env`, `server`) for Grafana aggregation.

Metrics documented in the example:

```
bullmq_job_count{queue="my-queue", state="waiting|active|completed|failed"}  <gauge>
```

Source also exports completed/failed **counters** from `getMetrics()` (`bullmq_job_completed_total`, `bullmq_job_failed_total`) — see [queue-getters.ts](https://github.com/taskforcesh/bullmq/blob/master/src/classes/queue-getters.ts) and [PR #3026](https://github.com/taskforcesh/bullmq/pull/3026).

**Discovery:** none. You must instantiate each `Queue` you care about. Multiple queues ⇒ concatenate or serve multiple metric blobs.

**Retry/inspect:** no.

### Path B — Sidecar exporters (usually no app code)

GitHub search for `bullmq prometheus exporter` (20 Oct 2026). Star counts change; treat them as snapshot, not a ranking.

| Repo | What it is | App code changes? | Discovery | Notes |
| --- | --- | --- | --- | --- |
| [igrek8/bullmq-prometheus](https://github.com/igrek8/bullmq-prometheus) | Node Docker exporter | No. Env: `REDIS_*`, `BULL_PREFIX`, optional `BULL_QUEUES` | If `BULL_QUEUES` is unset it scans Redis (README warns scans are costly). If set, uses that list | Metrics: `active_total`, `wait_total`, `waiting_children_total`, `prioritized_total`, `delayed_total`, `failed_total`, `completed_total` (completed = last 1 minute). `/health` |
| [antonmd/bullmq-exporter](https://github.com/antonmd/bullmq-exporter) | Go exporter + Docker | No | README: auto-discovery **or** specific queues | Gauges/counters for waiting/active/completed/failed/delayed/paused/prioritized; scrape success/duration. TLS, Sentinel, Cluster. **Very new / low adoption on fetch** — do not market as “standard” |
| [okerx/bullmq-metrics](https://github.com/okerx/bullmq-metrics) | Sidecar; Docker `okerx/bullmq-monitor` | No | Auto-discovers from Redis | Metrics include `bullmq_job_count{queue,state}`, completed/failed totals and last-minute, `bullmq_exporter_queues_discovered`. Grafana dashboard ID **[25072](https://grafana.com/grafana/dashboards/25072-bullmq-overview/)** (“BullMQ Overview”, published by **okerx**, 26 Mar 2026, Prometheus datasource). Community dashboard, not Grafana Labs |
| [ron96g/bullmq-exporter](https://github.com/ron96g/bullmq-exporter) | Prometheus **plus** a BullMQ dashboard behind login | No (separate service using `bullmq`) | Per configured queues; uses `QueueEvents` | Histograms `bullmq_processed_duration`, `bullmq_completed_duration`; gauges for completed/active/delayed/failed/waiting. Influenced by `bull_exporter`. **This is the rare exporter that also offers a queue UI** — still a community project, not Grafana |

**Not BullMQ** (easy marketing mistake):

- [UpHabit/bull_exporter](https://github.com/UpHabit/bull_exporter) — Prometheus exporter for **Bull**, not BullMQ.
- Grafana dashboard [14537 “Bull Queue Dashboard”](https://grafana.com/grafana/dashboards/14537-queue-dashboard/) — for `ejhayes/nodejs-bull-monitor` (**Bull**).

Generic Redis Prometheus: [oliver006/redis_exporter](https://github.com/oliver006/redis_exporter) (standard Redis INFO exporter). Redis metrics only.

### Grafana Cloud pricing (if you do not self-host)

Source: [https://grafana.com/pricing/](https://grafana.com/pricing/) and [metrics pricing docs](https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/metrics/) (docs explain the meter; **rates** are on the pricing page).

**Free:** $0. Includes (among other free-tier caps) **10k active series / month**, 14-day metrics retention, community support. Also advertised: 50 GB logs, 50 GB traces, 50 GB profiles, 50k frontend sessions, 500 VUh k6, 3 users — from the OSS/Cloud marketing pages.

**Pro:** **From $19 / month + usage**. Platform fee **$19 / month includes 10k active series**, then PAYG. Metrics **starts at $6.50 / 1k series** with volume discounts ($5.90 then $5.50 in the on-page calculator bands). 13-month metrics retention; 8×5 email support.

**Enterprise:** **Starts at $25,000 / year** spend commit. Metrics “as low as $3 / 1k series.”

**Application Observability** (if you send OTel traces of workers): Pro **starts at $0.025 / host hour (~$18 / host)**; free tier limited to **2,232 host hours / month**. Telemetry is billed separately.

**Grafana Cloud docs** are explicit that metrics are billed on **active series + DPM**, 95th percentile, **not** per metric name. High-cardinality labels (`queue`, `state`, `env`, `job_name`) increase series count.

Self-hosted Prometheus + Grafana OSS: **no Grafana Labs subscription**. You pay only for the machines.

### MCP

- Hosted: [Grafana Cloud MCP](https://grafana.com/docs/grafana-cloud/ai-tools/mcp-servers/cloud-mcp/) — `https://mcp.grafana.com/mcp`, OAuth 2.1, Grafana Cloud only.
- Self-managed: [OSS Grafana MCP](https://grafana.com/docs/grafana/latest/developer-resources/mcp/) — `uvx mcp-grafana` with `GRAFANA_URL` + service account token.

These query Grafana (dashboards, Prometheus datasources, alerts). They do **not** retry BullMQ jobs unless you built that into Grafana somehow (not published).

### When to use vs a dedicated dashboard

**Use Grafana/Prometheus** for SLO-style charts: queue depth, fail rate, scrape alerts. Sidecar exporters can avoid instrumenting the app.

**Still need a dedicated dashboard** for payloads, retries, pause/resume, worker topology, and safe agent operations. Grafana charts will not show why a job failed or let you replay it.

---

## 3. New Relic

### Redis (infrastructure)

**Official:** [Redis monitoring integration](https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/redis/redis-integration/)

- Compatible with Redis **3.0–7.0** (docs statement).
- Uses `INFO`, `CONFIG GET` (disable with `config_inventory: false` on ElastiCache-like hosts), and optional key-length commands (`LLEN`/`SCARD`/`ZCOUNT`/`HLEN`) for a **configured key list** (default limit 30).
- Metrics on `RedisSample` / `RedisKeyspaceSample` (memory, CPU, clients, commands/sec, keyspace hits/misses, replication, pub/sub, per-DB keys/TTL).
- Inventory = `CONFIG GET` except `requirepass`.
- **Not BullMQ-aware.** Configuring `KEYS` for known Redis keys is not queue discovery.

OpenTelemetry path: [Monitor Redis on a host (OpenTelemetry)](https://docs.newrelic.com/docs/opentelemetry/integrations/redis/host/) — Collector `redis` receiver (INFO) or Prometheus receiver + `redis_exporter`.

### Node.js APM / background jobs

**Instrumented modules** ([compatibility](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/getting-started/compatibility-requirements-nodejs-agent/)): includes `redis` (≥3.1.0) and `ioredis` (≥4.0.0). **`bullmq` is not listed.** Message libraries that **are** listed include `amqplib` and `kafkajs`, not BullMQ.

Background work: [non-web transactions](https://docs.newrelic.com/docs/apm/transactions/intro-transactions/monitor-background-processes-other-non-web-transactions/) and [custom instrumentation](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/extend-your-instrumentation/nodejs-custom-instrumentation/) — Node uses `startBackgroundTransaction()` around job handlers. **You write that wrapper.** New Relic does not document auto-creating a transaction per BullMQ job.

**Discover queues?** No.

**Retry / inspect payloads?** Not published.

### MCP

[Set up New Relic MCP](https://docs.newrelic.com/docs/agentic-ai/mcp/setup/) — `https://mcp.newrelic.com/mcp/` (EU/JP regional URLs exist). OAuth. Tools for New Relic data (`include-tags` filter). Not BullMQ ops.

### Pricing (published)

Source: [https://newrelic.com/info/pricing](https://newrelic.com/info/pricing) (20 Oct 2026).

New Relic’s **current** public model is **not per host**. “Unlimited hosts, agents, containers… no additional cost.” You pay data ingest and users (or data ingest + compute).

| Item | Published figure |
| --- | --- |
| Free ingest | **100 GB / month** (ingest stops at the cap until upgrade / next month) |
| Original data | **$0.40 / GB** beyond 100 GB |
| Data Plus | **$0.60 / GB** beyond 100 GB |
| EU data center storage add-on | **$0.05 / GB / month** |
| Basic users | **$0** |
| Core users | **$49 / user** (Standard/Pro/Enterprise) |
| Full platform — Standard | **$10 first user**, **$99 additional** (max 5 full platform users) |
| Full platform — Pro | **$349 / user** annual commitment, or **$418.80 / user** monthly PAYG |
| Full platform — Enterprise | Contact Sales |
| Extra synthetic checks | **$0.005 / check** beyond edition included amounts (Free 500, Standard 10k, Pro 1M, Enterprise 10M) |

**Do not use** the legacy “APM Pro Host Annual $149” table for new-customer marketing. That lives on the [original product-based pricing](https://docs.newrelic.com/docs/licenses/license-information/usage-plans/product-based-pricing-usage-new-relic-platform-pricing-usage-plan/) page for **existing** contracts.

Advanced Compute (CCU) is mentioned as unlocking Transaction 360, Security RX, New Relic AI, etc. **Per-CCU list prices were not on the FAQ page fetched**; do not invent them.

### When to use vs a dedicated dashboard

**Use New Relic** if it is already the APM standard: Redis saturation, wrap workers as non-web transactions, alert on apdex/error rate of those transactions.

**Dedicated dashboard** for BullMQ semantics (states, delayed, stalled, payloads, retries). New Relic will not show BullMQ job JSON unless you copy it into custom attributes (not recommended; not documented as a product feature).

---

## 4. Sentry

Sentry covers **errors**, optional **tracing/Queues**, and **Cron monitors**. These are different products.

### Queues (performance)

**Product docs:** [https://docs.sentry.io/product/dashboards/sentry-dashboards/backend/queues/](https://docs.sentry.io/product/dashboards/sentry-dashboards/backend/queues/)

Quote: “Queues currently supports **auto instrumentation for the Celery Distributed Task Queue in Python**. Other messaging systems can be monitored using **custom instrumentation**.”

Node custom instrumentation: [Instrument Queues for Node.js](https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/queues-module/)

- Producer spans: `op: queue.publish` plus `messaging.message.id`, `messaging.destination.name`, `messaging.message.body.size`; propagate `sentry-trace` / baggage.
- Consumer spans: `op: queue.process` plus retry count and receive latency; `Sentry.continueTrace`.

The sample code uses Redis lists (`lPush`/`lPop`), **not** the `bullmq` API. You must map that onto `Queue.add` / `Worker`.

Dashboard metrics (once spans exist): avg time in queue, processing time, error rate, published vs processed, processed/min, time spent. Sample traces, not job payloads stored as queue state.

**NestJS + BullMQ auto-instrumentation — verify carefully:**

- Product Queues page (fetched 20 Oct 2026): still **Celery-only** auto instrumentation.
- GitHub [getsentry/sentry-javascript#19759](https://github.com/getsentry/sentry-javascript/commit/84a9768a3d72ebb31241a23caadda674ab84adbc) (released in **10.44.0** per issue automation): wraps `@Processor()` from `@nestjs/bullmq` with `queue.process` transactions and exception capture.
- NestJS platform docs mention BullMQ only for **isolation scopes** ([async context](https://docs.sentry.io/platforms/javascript/guides/nestjs/features/async-context/)), not as a Queues auto-instrumentation product feature.

**Marketing rule:** do not say “Sentry auto-instruments BullMQ” globally. You may say NestJS `@nestjs/bullmq` processor wrapping shipped in sentry-javascript 10.44.0, while the Queues product page still lists Celery as the auto-instrumented system.

**Discover queues?** Only destinations that emit correctly attributed spans.

**Retry / inspect payloads?** Not published. Issues may include error context if the SDK captured the exception.

### Cron monitors (scheduled jobs)

**Docs:** [Cron Monitoring](https://docs.sentry.io/product/monitors-and-alerts/monitors/crons/), [Job Monitoring](https://docs.sentry.io/product/monitors-and-alerts/monitors/crons/job-monitoring/), [Set up](https://docs.sentry.io/product/monitors-and-alerts/monitors/crons/getting-started/), [Node Crons](https://docs.sentry.io/platforms/javascript/guides/node/crons/)

Crons watch **recurring, scheduled** units of work via check-ins: missed, failed, successful, timeout. Examples in docs: invoice generation, server cleanup — crontab/interval shaped jobs, **not** every BullMQ queue job.

Node automatic cron instrumentation: `cron`, `node-cron`, `node-schedule` only. **BullMQ Job Schedulers are not in that list.** For a BullMQ repeatable/scheduler job you would wrap the processor with `Sentry.withMonitor()` or `captureCheckIn()` yourself.

Check-in rate limit: **6 check-ins per minute per monitor environment**. Check-in retention: **90 days** (troubleshooting page).

Pausing a Sentry monitor **does not pause the job**. Automatic muting of broken monitors does **not** stop billing.

### Quotas and pricing

Sources: [docs.sentry.io/pricing](https://docs.sentry.io/pricing/), [sentry.io/pricing](https://sentry.io/pricing/), [manage cron monitors](https://docs.sentry.io/pricing/quotas/manage-cron-monitors/), [help: annual vs monthly](https://www.sentry.help/en/articles/13964764-the-price-on-the-manage-subscription-page-differs-from-what-is-shown-on-the-pricing-page-why)

**Plan list prices (pricing page, annual + default prepaid data):**

| Plan | Published price |
| --- | --- |
| Developer | **Free** (1 user; MCP access listed) |
| Team | **$26 / month** billed annually |
| Business | **$80 / month** billed annually |
| Enterprise | Contact |

Help Center: monthly (non-annual) Team **$29 / month**, Business **$89 / month**. Use both figures and attribute them.

**Included monthly volume on paid plans (docs):** 50k errors, 5 GB logs, 5 GB application metrics, 5M spans, 50 replays, **1 uptime monitor**, **1 cron monitor**, 100 size analysis builds, 1 GB attachments. Continuous/UI profiling and Seer are extra.

**Cron monitors:** all plans include **one**. Additional only via PAYG: **$0.78 / monitor** (Team and Business PAYG tables). Uptime extra: **$1.00 / monitor**. Developer/free cannot add PAYG monitors (help article).

Other PAYG examples (do not dump the entire catalog on a comparison page): logs/metrics **$0.50 / GB**; Team error PAYG starts at **$0.0003625 / error** in the 50k–100k band.

Queue tracing consumes **spans**, billed under Tracing, not under Cron monitors.

### MCP

[https://mcp.sentry.dev/](https://mcp.sentry.dev/) — `https://mcp.sentry.dev/mcp`, optional org/project scope. OAuth. Search errors, performance, issues, docs — **not** Redis/BullMQ job mutation.

### When to use vs a dedicated dashboard

**Use Sentry** to know a worker threw, a cron did not check in, or (with custom spans) processing latency by destination.

**Dedicated dashboard** for backlog, stalled jobs, payload inspection, retry. Sentry Crons is a poor fit for high-volume non-cron BullMQ queues (check-in rate limits and per-monitor pricing).

---

## 5. BullMQ official metrics (Prometheus)

### Built-in minute metrics (Redis-backed)

**Docs:** [https://docs.bullmq.io/guide/metrics](https://docs.bullmq.io/guide/metrics)

Workers can store completed/failed counts per minute in Redis:

```ts
metrics: { maxDataPoints: MetricsTime.ONE_WEEK * 2 }
```

Must be set **the same on all workers**. Claimed RAM: ~**120 KB per queue** for 2 weeks. Query with `queue.getMetrics('completed' | 'failed', start, end)`. `meta.count` is lifetime completed/failed, not just the window.

This is **not** Prometheus by itself. Durabull and other UIs can read it. Prometheus needs Path A or a sidecar.

### Prometheus helper

**Docs:** [https://docs.bullmq.io/guide/metrics/prometheus](https://docs.bullmq.io/guide/metrics/prometheus)

API: `exportPrometheusMetrics(globalVariables?: Record<string, string>): Promise<string>`

**Code changes:** HTTP `/metrics` in your app; one `Queue` instance per queue name.

**Does not:** auto-discover queues, expose job payloads, retry, pause, or list workers.

**MCP:** not documented on docs.bullmq.io (search of that site for MCP returned only product/guide pages).

### Telemetry metrics (OpenTelemetry meters)

Covered in section 7. Different from Redis `getMetrics()` and from `exportPrometheusMetrics()`.

---

## 6. Redis Cloud observability

Redis Cloud monitors **the database**, not BullMQ.

### Console metrics and alerts

**Docs:** [Monitor database performance](https://redis.io/docs/latest/operate/rc/databases/monitor-performance/)

Graphs: ops/sec, reads/writes/other cmds, latency (overall/read/write/other), used memory, total keys, connections, evicted/expired objects, hit ratio, network in/out.

Alerts (plan-dependent): dataset size (Pro), plan dataset size (Essentials), throughput high/low (paid Essentials or Pro), latency (paid Essentials or Pro), connections (Essentials), Replica Of sync (Pro). Email to users with alert notifications enabled.

**No BullMQ queue names, job payloads, or retries.**

### Prometheus / Grafana

**Docs:** [Prometheus and Grafana with Redis Cloud](https://redis.io/docs/latest/integrate/prometheus-with-redis-cloud/)

- Prometheus endpoint on **port 8070**, **internal network only**.
- Requires VPC peering, Private Service Connect, AWS Transit Gateway, or AWS PrivateLink.
- **Pro only. Not available on Essentials.**
- Covers **all databases in a subscription**; add/remove DB is automatic.
- Redis publishes Grafana dashboards: subscription status, database status (needs Infinity plugin), Active-Active.

### Datadog integration (Redis Cloud → Datadog)

**Docs:** [Datadog with Redis Cloud](https://redis.io/docs/latest/integrate/datadog-with-redis-cloud/)

Install “Redis Cloud by Redis, Inc.”; Agent `redis_cloud.d` + VPC. Namespace `rdsc` (example metric `rdsc.bdb_up`). Dashboards: Overview, Database, Network. Still Redis Cloud metrics, not BullMQ.

KB: [Monitoring Redis Cloud with Prometheus and Datadog](https://support.redislabs.com/hc/en-us/articles/27439035939730-Monitoring-Redis-Cloud-with-Prometheus-and-Datadog) — Essentials cannot reach the internal metrics endpoint.

Plan matrix from Redis KB [Monitoring Setup](https://support.redislabs.com/hc/en-us/articles/28281114508178-Monitoring-Setup-in-Redis-Cloud):

| Feature | Essentials | Pro |
| --- | --- | --- |
| Console metrics | yes | yes |
| Email alerts | limited | yes |
| Prometheus export | no | yes |
| Grafana / Datadog / APM | no | yes |
| Metrics via REST API | yes | yes |

### Cloud plan prices (hosting, not an observability SKU)

**https://redis.io/pricing/** (20 Oct 2026):

| Plan | Published |
| --- | --- |
| Free | **$0**, up to 30 MB |
| Essentials | From **$0.007 / hour**, “Total $5 / month” |
| Pro | From **$0.014 / hour**, “First $200 free”, **minimum $200 / month** |

Observability is **included or gated by plan**, not a separately priced “Redis Cloud APM” SKU on that page. Do not invent a Datadog-export surcharge.

### MCP

No Redis Cloud BullMQ MCP was found in official Redis docs.

### When to use vs a dedicated dashboard

**Use Redis Cloud monitoring** for memory, ops/sec, latency, eviction — the reasons BullMQ would stall because Redis is sick.

**Dedicated dashboard** for queue/job operations. Redis “total keys” is not “jobs waiting.”

---

## 7. OpenTelemetry for BullMQ

### Official BullMQ telemetry

**Docs:**

- [Telemetry](https://docs.bullmq.io/guide/telemetry/)
- [Getting started](https://docs.bullmq.io/guide/telemetry/getting-started)
- [Metrics](https://docs.bullmq.io/guide/telemetry/metrics)
- [Running a simple example](https://docs.bullmq.io/guide/telemetry/running-a-simple-example)
- Package: [`bullmq-otel`](https://github.com/taskforcesh/bullmq-otel) (`npm add bullmq-otel`)

BullMQ defines a telemetry interface; **OpenTelemetry is the supported implementation**.

**Code changes: yes.** Pass `telemetry: new BullMQOtel("service-name")` (or options object) into **every** `Queue` and `Worker`. Start the OpenTelemetry SDK **first** (`node --import` / `tsx --import` instrumentation files). Export OTLP to Jaeger, Grafana, Datadog, New Relic, etc.

**Traces:** job lifecycle spans; bulk `addBulk` is used in the official example to show producer/consumer links.

**OTel metrics** (`enableMetrics: true`, default **false**):

Counters: `bullmq.jobs.completed`, `.failed`, `.delayed`, `.retried`, `.waiting`, `.waiting_children`

Histogram: `bullmq.job.duration` (milliseconds)

Gauge: `bullmq.queue.jobs` by state — recorded when **`recordJobCountsMetric()`** is called (not automatic on every scrape).

**Discover queues?** Only instances you constructed with telemetry.

**Retry / inspect?** No.

**Pricing:** library is free. Backend pricing is whoever receives OTLP (Datadog ingested spans, Grafana traces GB, New Relic ingest, …).

### OpenTelemetry Redis (not BullMQ)

[`@opentelemetry/instrumentation-redis`](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-redis) instruments the **`redis` npm client**, not BullMQ. Included in `@opentelemetry/auto-instrumentations-node`. That yields Redis command spans (`db.statement`), which can be noisy and sensitive if you serialize arguments. Separate from `bullmq-otel`.

There is **no** `opentelemetry-instrumentation-bullmq` in contrib; Taskforce.sh’s `bullmq-otel` is the official add-on.

---

## 8. “Is there a BullMQ MCP server?”

Search performed: `is there a bullmq MCP server`, plus vendor MCP docs.

### Generic observability MCPs (not BullMQ ops)

| Vendor | Official MCP? | Endpoint / install | Can retry BullMQ jobs? |
| --- | --- | --- | --- |
| Datadog | Yes | `https://mcp.datadoghq.com/v1/mcp` | Not published |
| Grafana | Yes (Cloud + OSS) | `https://mcp.grafana.com/mcp` / `uvx mcp-grafana` | Not published |
| New Relic | Yes | `https://mcp.newrelic.com/mcp/` | Not published |
| Sentry | Yes | `https://mcp.sentry.dev/mcp` | Not published |
| Redis Cloud | **Not found** | — | — |

### Dedicated BullMQ MCPs (not generic observability)

These are **out of scope** as “generic observability” but answer the search query honestly:

| Server | Who | Mechanism | Notes |
| --- | --- | --- | --- |
| [taskforce.sh/mcp](https://taskforce.sh/mcp) | Taskforce.sh (BullMQ company) | `https://api.taskforce.sh/mcp` Bearer token | List queues/jobs, read data/logs/flow, retry/promote, pause, clean (permissions + audit). **Hosted product MCP**, not docs.bullmq.io |
| [Durabull MCP](https://durabull.io/mcp/) | Durabull | `https://app.durabull.io/mcp` (OAuth 2.1) | First-party Durabull; inspect/operate with redaction. Use Durabull docs for tool counts — do not mix into competitor feature lists |
| [adamhancock/bullmq-mcp](https://github.com/adamhancock/bullmq-mcp) (`@adamhancock/bullmq-mcp`) | Community | Local `npx`; talks **directly to Redis** | Connect, list queues, add/retry/promote, logs. **Third-party; not Taskforce.sh.** Security/audit are yours |
| [Workbench `@getworkbench/mcp`](https://getworkbench.dev/blog/bullmq-mcp-server) | Workbench | stdio → HTTP to a running Workbench dashboard | Does not open its own Redis connection |

**docs.bullmq.io does not document an official MCP server.** Closest first-party MCP from the BullMQ vendor is Taskforce.sh’s hosted endpoint.

---

## 9. When generic observability is enough vs a dedicated BullMQ dashboard

### Prefer Datadog / New Relic / Grafana / Sentry / Redis Cloud when

- The question is **Redis or host health** (memory, CPU, ops/sec, saturation).
- You need **distributed traces** from HTTP → enqueue → worker → DB.
- You already pay for the platform and only need alerts on depth/error rate (Prometheus gauges).
- You need **error grouping** (Sentry) or **missed cron check-ins** for a handful of schedulers.

### Prefer a dedicated BullMQ dashboard (and/or BullMQ MCP) when

- You must **see job data**, stack traces, attempts, and logs for a specific `jobId`.
- You must **retry, promote, remove, drain, pause** with RBAC and audit.
- You must **discover queues** from Redis without deploying `dd-trace` on every worker.
- Agents should operate queues **without** dumping raw Redis into a generic APM MCP.

### Typical honest architecture (safe to describe)

1. Redis Cloud or Datadog Redis check → infrastructure.
2. `dd-trace` or `bullmq-otel` → traces.
3. `exportPrometheusMetrics` or a sidecar → Grafana depth/rate alerts.
4. Sentry → unhandled exceptions (and Crons only for true schedules).
5. Dedicated dashboard/MCP → the operator loop generic tools do not publish.

Do not claim any generic vendor replaces (5) unless their current docs say so. None of the official pages above do.

---

## 10. Could not verify / do not claim

Flag these internally; do not put them on marketing pages as facts.

| Topic | Why unverified |
| --- | --- |
| Datadog UI showing BullMQ **job payloads** | Plugin can *read* `job.data` for `producerFilter`. No Datadog doc says payloads are indexed or displayed |
| Datadog child spans for BullMQ’s **internal ioredis** commands | `ioredis` is supported; whether BullMQ’s client is wrapped is not documented |
| Datadog DSM **queue inventory** matching Redis `KEYS bull:*` | DSM is library instrumentation of produce/consume, not a Redis scanner |
| Exact Datadog **indexed-span overage** on a given contract | Billing docs vs pricing-list retention SKUs differ; use “see current list / contract” |
| Grafana dashboard **25072 panel inventory** | Community JSON; not opened panel-by-panel in Grafana Cloud |
| Community exporter **star counts / maintenance** | Snapshots from GitHub search; antonmd repo is new; igrek8 fetch vs search disagreed on stars |
| New Relic **CCU list price** | FAQ describes Advanced Compute, no public per-CCU number on the fetched page |
| Sentry **product** auto-instrumentation of OSS `bullmq` (non-NestJS) | Not on Queues docs. NestJS work is SDK changelog/GitHub |
| Redis Cloud **per-metric Datadog ingest cost** | Redis documents the integration; Datadog bills the destination metrics as Datadog usage — split not published as a Redis SKU |
| OpenTelemetry semantic conventions stability for BullMQ span names | Official guide shows usage; no spec URL claiming OTel semantic-convention registration |
| “Official BullMQ MCP” on docs.bullmq.io | Not present. Taskforce.sh MCP is a separate product page |
| Any **future** price after 20 Oct 2026 | Re-fetch before publishing |

---

## Source index (live URLs)

### Datadog

- https://docs.datadoghq.com/integrations/redis
- https://docs.datadoghq.com/tracing/trace_collection/compatibility/nodejs.md
- https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/
- https://docs.datadoghq.com/tracing/trace_collection/dd_libraries/nodejs/
- https://docs.datadoghq.com/data_streams/setup/technologies/bullmq.md
- https://docs.datadoghq.com/data_streams/setup/language/nodejs.md
- https://docs.datadoghq.com/account_management/billing/apm_distributed_tracing/
- https://docs.datadoghq.com/account_management/billing/custom_metrics/
- https://www.datadoghq.com/pricing/
- https://www.datadoghq.com/pricing/list/
- https://docs.datadoghq.com/mcp_server/
- https://docs.datadoghq.com/mcp_server/setup/
- https://datadoghq.dev/dd-trace-js/interfaces/plugins.bullmq.html
- https://github.com/DataDog/dd-trace-js/pull/7123

### Grafana / Prometheus / exporters

- https://grafana.com/pricing/
- https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/
- https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/metrics/
- https://grafana.com/grafana/download?edition=oss
- https://grafana.com/oss/grafana/
- https://grafana.com/docs/grafana/latest/developer-resources/mcp/
- https://grafana.com/docs/grafana-cloud/ai-tools/mcp-servers/cloud-mcp/
- https://grafana.com/grafana/dashboards/25072-bullmq-overview/
- https://grafana.com/grafana/dashboards/14537-queue-dashboard/ (Bull, not BullMQ)
- https://github.com/igrek8/bullmq-prometheus
- https://github.com/antonmd/bullmq-exporter
- https://github.com/okerx/bullmq-metrics
- https://github.com/ron96g/bullmq-exporter
- https://github.com/UpHabit/bull_exporter (Bull)

### New Relic

- https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/redis/redis-integration/
- https://docs.newrelic.com/docs/opentelemetry/integrations/redis/host/
- https://docs.newrelic.com/docs/apm/agents/nodejs-agent/getting-started/compatibility-requirements-nodejs-agent/
- https://docs.newrelic.com/docs/apm/transactions/intro-transactions/monitor-background-processes-other-non-web-transactions/
- https://docs.newrelic.com/docs/apm/agents/nodejs-agent/extend-your-instrumentation/nodejs-custom-instrumentation/
- https://docs.newrelic.com/docs/agentic-ai/mcp/setup/
- https://newrelic.com/info/pricing
- https://docs.newrelic.com/docs/licenses/license-information/usage-plans/product-based-pricing-usage-new-relic-platform-pricing-usage-plan/ (legacy)

### Sentry

- https://docs.sentry.io/product/dashboards/sentry-dashboards/backend/queues/
- https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/queues-module/
- https://docs.sentry.io/platforms/javascript/guides/nestjs/features/async-context/
- https://docs.sentry.io/product/monitors-and-alerts/monitors/crons/
- https://docs.sentry.io/product/monitors-and-alerts/monitors/crons/job-monitoring/
- https://docs.sentry.io/product/monitors-and-alerts/monitors/crons/getting-started/
- https://docs.sentry.io/platforms/javascript/guides/node/crons/
- https://docs.sentry.io/pricing/
- https://docs.sentry.io/pricing/quotas/manage-cron-monitors/
- https://sentry.io/pricing/
- https://mcp.sentry.dev/
- https://github.com/getsentry/sentry-javascript/commit/84a9768a3d72ebb31241a23caadda674ab84adbc

### BullMQ official

- https://docs.bullmq.io/guide/metrics
- https://docs.bullmq.io/guide/metrics/prometheus
- https://docs.bullmq.io/guide/telemetry/
- https://docs.bullmq.io/guide/telemetry/getting-started
- https://docs.bullmq.io/guide/telemetry/metrics
- https://docs.bullmq.io/guide/telemetry/running-a-simple-example
- https://github.com/taskforcesh/bullmq/blob/master/src/classes/queue-getters.ts
- https://github.com/taskforcesh/bullmq/pull/3026
- https://github.com/taskforcesh/bullmq-otel

### Redis Cloud

- https://redis.io/docs/latest/operate/rc/databases/monitor-performance/
- https://redis.io/docs/latest/integrate/prometheus-with-redis-cloud/
- https://redis.io/docs/latest/integrate/datadog-with-redis-cloud/
- https://redis.io/pricing/
- https://support.redislabs.com/hc/en-us/articles/27439035939730-Monitoring-Redis-Cloud-with-Prometheus-and-Datadog
- https://support.redislabs.com/hc/en-us/articles/28281114508178-Monitoring-Setup-in-Redis-Cloud

### OpenTelemetry Redis

- https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-redis

### BullMQ MCP (dedicated, not generic APM)

- https://taskforce.sh/mcp
- https://durabull.io/mcp/
- https://github.com/adamhancock/bullmq-mcp
- https://getworkbench.dev/blog/bullmq-mcp-server
