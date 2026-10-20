# Managed job & workflow platforms — pricing research

**Purpose:** Source notes for Durabull marketing comparison pages against *paid or managed job/workflow platforms*. These products **replace the queue runtime**. They do not monitor a BullMQ/Redis fleet.

**Research date:** 2026-10-20.  
**Rule:** No invented features, prices, or limits. Anything not confirmed on an official page is in **Unverified**.

**How this was gathered:** Official pricing pages and first-party docs, visited on 2026-10-20. AWS SQS dollar rates also confirmed from the AWS Price List API (`AWSQueueService` offer, publicationDate `2026-09-11T12:46:07Z`). Restate Cloud dollar rates were read from the official pricing page's shipped JavaScript (`https://restate.dev/_next/static/chunks/app/pricing/page-2c5d570e62675e4a.js`) because the HTML cards are client-rendered.

**Durabull is not in this set.** Durabull (and Taskforce.sh) sit *beside* BullMQ. The platforms below sit *instead of* BullMQ.

---

## How to read the cost tables

Vendors do not bill the same unit. A “job” on BullMQ is not an Inngest “execution,” a Temporal “Action,” a Trigger.dev “run,” or a Cloudflare “operation.”

Shared assumptions, used only where a vendor bills per discrete unit of work:

| Assumption | Value | Why |
|---|---|---|
| Research date | 2026-10-20 | Prices change. Re-check before publishing. |
| Currency | USD list price | No enterprise commits, no volume contracts unless the public page publishes them. |
| Retries | None, unless the vendor’s formula requires them | Retries are extra billed units on several platforms. |
| Payload | Small enough not to cross a size-chunk boundary | SQS 64 KB, Cloud Tasks 32 KB, Cloudflare 64 KB, Restate 64 KiB. |
| Compute duration | Stated per row | Trigger.dev and Inngest sandboxes bill wall-clock compute. |
| Storage / observability / seats | Excluded unless named | These move bills independently. |

If a vendor is **not** per-job, the table says so and uses that vendor’s own published example or a clearly labeled compute scenario.

---

## Snapshot matrix (verified only)

| Product | What it is vs BullMQ | Public pricing model | Official pricing URL | MCP / agent surface |
|---|---|---|---|---|
| **Inngest Cloud** | Replaces the queue. Durable functions + event bus you host or they invoke. | Plans + metered **executions** (run + each step) | https://www.inngest.com/pricing | Official Cloud + Dev Server MCP |
| **Trigger.dev Cloud** | Replaces the queue. They run your task code on managed machines. | Plan + **compute-seconds** + **$0.000025/run** | https://trigger.dev/pricing | Official MCP |
| **Temporal Cloud** | Replaces the queue. You run Workers; they run the orchestration service. | **$50/million Actions** starting + storage + support % | https://temporal.io/pricing · https://docs.temporal.io/cloud/pricing | Docs MCP. Workflow-ops MCP is community, not Temporal-supported |
| **Hatchet Cloud** | Replaces the queue. You run workers; they run the engine. | First **1M runs + 1M events** free/mo, then **$30/M runs**, **$5/M events** | https://hatchet.run/pricing | Official CLI MCP |
| **Defer** | Was a TypeScript background-job SaaS | **Shut down 2024-05-01.** Domain now a DNS tool. | No live pricing | n/a |
| **Quirrel** | Was a serverless job queue SaaS | Hosted service **ended 2022**. OSS in maintenance mode. | No live hosted pricing | n/a |
| **Upstash QStash** | Replaces the queue (HTTP push). Not Redis/BullMQ. | **$1 / 100K messages** PAYG; fixed daily-quota plans | https://upstash.com/pricing/qstash | Not documented as an ops MCP |
| **Upstash Workflow** | Durable workflows on QStash | **$1 / 100K steps** PAYG | https://upstash.com/pricing/workflow | Not documented as an ops MCP |
| **Amazon SQS** | Replaces Redis-backed queue (API requests, not jobs) | **$0.40 / million Standard requests** (us-east-1, first 100B) + 1M free req/mo | https://aws.amazon.com/sqs/pricing/ | No BullMQ-style ops MCP |
| **AWS Step Functions** | Replaces the orchestrator | Standard: **$0.000025 / state transition** (us-east-1). Express: **$1/M requests** + duration | https://aws.amazon.com/step-functions/pricing/ | No BullMQ-style ops MCP |
| **Google Cloud Tasks** | Replaces the queue (HTTP/App Engine push) | First **1M billable ops/mo free**, then **$0.40 / million** | https://cloud.google.com/tasks/pricing | No BullMQ-style ops MCP |
| **Cloudflare Queues** | Replaces the queue on Workers | Workers Paid: **1M ops/mo included + $0.40/M**. Typically **3 ops/message** | https://developers.cloudflare.com/queues/platform/pricing/ | Not a queue-ops MCP in published Queues docs |
| **Graphile Worker** | Postgres job queue. Alternative runtime, not a BullMQ monitor | OSS MIT. Worker Pro **$100/mo** (launch **$25+/mo** via sponsorship) | https://worker.graphile.org/pricing | Not documented |
| **pg-boss** | Postgres job queue. Alternative runtime | OSS MIT. No product fee | https://pgboss.io/introduction | Not documented |
| **River** | Postgres/SQLite job queue (Go/Ruby/Rust/TS) | OSS MPL-2.0. River Pro **$125**/period (monthly or annual; seats cap 20) | https://riverqueue.com/pro · https://riverqueue.com/llms.txt | Not documented |
| **Sidekiq Pro / Enterprise** | Redis job runtime for **Ruby** (closest cousin to BullMQ) | Pro **$99/mo or $995/yr** unlimited. Enterprise **from $269/mo per 100 threads** | https://sidekiq.org/ | Not documented |
| **Faktory** | Polyglot job server (Redis-backed) | OSS AGPL. Enterprise **from $299/mo** (100-connection pack) | https://contribsys.com/faktory/ · https://billing.contribsys.com/fent/new.cgi | Not documented |
| **Oban Pro** | Postgres job runtime for Elixir/Python | OSS free. Pro **$150/mo** or **$135/mo** billed yearly ($1,620) | https://oban.pro/pricing | Not documented |
| **Restate Cloud** | Replaces the queue. Durable runtime you connect services to | Free **100k actions**. Starter **$75/5M**. Business **$300/20M**. Premium **$1,000/50M**. Overage **$25/M** (Premium **$15–$10/M**) | https://restate.dev/pricing | Docs MCP. Not a cluster-ops MCP in published docs |
| **DBOS Conductor** | Observability/control plane for OSS DBOS Transact (you run workers + Postgres) | Pro **$99/mo** (1M checkpoints). Teams **$499/mo** (10M). Extra **$50/M** or **$40/M** | https://www.dbos.dev/dbos-pricing | **MCP Server** listed on Pro |
| **Taskforce.sh** *(not a replacement)* | **Monitors BullMQ**, like Durabull | **$19.95 / $49.95 / $99.95** per month by Redis connections | https://taskforce.sh/pricing | Hosted MCP |

---

## Cross-vendor worked costs

Units are **not interchangeable**. Read the unit column.

### A. Per-step / per-action platforms (1M / 10M / 100M billed units)

| Vendor | Billed unit | 1M | 10M | 100M | Notes |
|---|---|---|---|---|---|
| **Inngest Cloud** | Execution = 1 function run **or** 1 step | **$99** (Pro includes 1M) | **$499** (Business includes 10M). Pro overage exists but exact tier table is not a static published grid — FAQ only states **$0.000050 down to $0.000015**/execution | **Not fully published.** At the FAQ’s high rate, 90M Pro overage would be **$4,500 + $99**; at the low rate **$1,350 + $99**. Business would be $499 + overage at unpublished Business rates | Free pauses at 50k. See §1 |
| **Temporal Cloud (Developer)** | Action | **$55** = $50 Actions + 10% support | **$550** | **$5,500** | Storage extra. No volume discount on Developer. https://docs.temporal.io/cloud/pricing |
| **Temporal Cloud (Business, excess after 2.5M included)** | Action | **$500** floor (2.5M Actions included) | **~$838** Actions overage on 7.5M excess using published tiers + **max($500, 10% of usage)** support | **~$3,350** Actions on 97.5M excess + **$500** support floor ≈ **$3,850** before storage | Worked in §3 |
| **Hatchet Cloud (card on file)** | Task run | **$0** (1M included) | **$270** (9M × $30) | **$2,970** list (99M × $30). Custom/volume discounts unpublished | Events extra at $5/M. Retries not billed. https://hatchet.run/pricing |
| **Upstash Workflow PAYG** | Step | **$10** | **$100** | **$1,000** | $1 / 100K steps. Fixed 1M/10M plans are **per day**, not per month. https://upstash.com/pricing/workflow.md |
| **Restate Cloud** | Durable action | **$75** (Starter includes 5M; Free only 100k) | **$200** on Starter (5M incl. + 5M × $25) **or $300** Business (20M included) | **$1,750** on Premium ($1,000 + 50M × $15) | Each call is **2 actions** (invoke + complete) plus intermediates. https://restate.dev/pricing |
| **DBOS Conductor Pro/Teams** | Checkpoint (workflow, step, or transaction) | **$99** (Pro includes 1M) | **$499** (Teams includes 10M) or Pro $99 + 9 × $50 = **$549** | Teams $499 + 90 × $40 = **$4,099** | You still pay for your own Postgres. https://www.dbos.dev/dbos-pricing |
| **AWS Step Functions Standard** (us-east-1) | State transition | **$24.90** (1M − 4,000 free × $0.000025) | **$249.90** | **$2,499.90** | This is 1M *transitions*, not 1M jobs. A 4-transition job (AWS’s own example) is 4× these numbers. Lambda extra. https://aws.amazon.com/step-functions/pricing/ |

### B. Per-run / per-message platforms (1M / 10M / 100M messages or runs)

| Vendor | Billed unit | 1M | 10M | 100M | Notes |
|---|---|---|---|---|---|
| **Trigger.dev Cloud** | Run invocation **plus** compute | Invocation floor **$25**. Official 10s / small-1x example: **~$363** usage; Pro $50 plan includes $50 credit so ~**$363** total if usage ≥ credit | Invocation **$250**. Same 10s shape: **~$3,630** | Invocation **$2,500**. 10s shape: **~$36,300** | Compute-based. Duration dominates. Dev runs free. https://trigger.dev/pricing |
| **Upstash QStash PAYG** | Message (see retry contradiction in §7) | **$10** | **$100** | **$1,000** | $1 / 100K. Fixed 1M plan is **1M messages/day** at $180/mo, not 1M/month |
| **Amazon SQS Standard** (us-east-1) | API request | **$0.80** if 3 req/job (send+receive+delete), 3M−1M free × $0.40/M | **$11.60** (29M paid) | **$119.60** (299M paid) | Batching of 10 cuts this ~10×. Polling empty receives still bill. See §8 |
| **Google Cloud Tasks** | Billable operation (API call or push attempt, 32 KB chunks) | **$0.40** if 2 ops/task (enqueue + 1 delivery), 2M−1M free | **$7.60** | **$79.60** | Network extra for HTTP targets. https://cloud.google.com/tasks/pricing |
| **Cloudflare Queues** (Workers Paid) | Operation (write/read/delete per 64 KB) | **$5.80** = $5 Workers Paid + $0.80 queue ops (3M−1M × $0.40/M) | **$16.60** | **$124.60** | Official formula `((N × 3) − 1,000,000) / 1,000,000 × $0.40`. https://developers.cloudflare.com/queues/platform/pricing/ |

### C. License / not per-job (cost does not scale with 1M / 10M / 100M jobs)

| Vendor | Published price | At 1M / 10M / 100M jobs |
|---|---|---|
| **Graphile Worker** OSS | $0 | $0 product fee. You pay Postgres. |
| **Graphile Worker Pro** | $100/mo, or $25+/mo GitHub Sponsors during early-access launch | Same at all three volumes |
| **pg-boss** | $0 MIT | $0 product fee. You pay Postgres. |
| **River** OSS | $0 MPL-2.0 | $0 product fee |
| **River Pro** | $125 (monthly or annual; llms.txt says **$125/month paid annually**, up to 20 developers) | Same at all three volumes. Enterprise custom |
| **Sidekiq Pro** | $99/mo or $995/yr, unlimited usage | Same at all three volumes |
| **Sidekiq Enterprise** | From $269/mo per 100 production threads; unlimited org license **$79,500/yr** | Scales with **threads**, not jobs |
| **Faktory OSS** | $0 AGPL | $0 product fee |
| **Faktory Enterprise** | First 100-connection pack **$299/mo**, additional packs **$99/mo** | Scales with **connections**, not jobs |
| **Oban Pro** | $150/mo or $135/mo yearly ($1,620). One license per application | Same at all three volumes |
| **BullMQ Pro** | **Current public dollar price not published** on https://taskforce.sh/pricing (explicitly *not* included in dashboard plans). Historical blog: $95/mo | Unverified for marketing dollar claims |
| **Taskforce.sh** | $19.95 / $49.95 / $99.95 per month by connections | Monitors BullMQ; not a replacement |

---

## 1. Inngest

### Official name + URL

- **Inngest Cloud** — https://www.inngest.com/pricing  
- Docs: https://www.inngest.com/docs/durable-execution/limits · https://www.inngest.com/docs/learn/inngest-steps · https://www.inngest.com/docs/durable-execution/primitives/step-run · https://www.inngest.com/docs/self-hosting · https://www.inngest.com/docs/ai-dev-tools/mcp

### What it is vs BullMQ

A durable-execution platform. You write functions with `step.run()` / sleeps / waits. Inngest Cloud (or a self-hosted Inngest server) stores run state, retries steps, and invokes **your** code over HTTP or via connected workers. It **replaces** Redis + BullMQ as the orchestrator. It does not attach to an existing BullMQ deployment.

### What a “step” is

Official:

> “Inngest steps are checkpointed, retriable units of work inside Inngest functions.”  
> https://www.inngest.com/docs/learn/inngest-steps

`step.run(id, handler)` runs one named unit. On success the result is saved; a later failure retries only that step. Also billed as steps: `step.sleep`, `step.sleepUntil`, `step.waitForEvent`, `step.waitForSignal`, `step.invoke`, `step.sendEvent`.

Platform caps (all plans): 1,000 steps per function, 4 MiB step result, 32 MiB run state, step timeout up to 2 hours (host may be shorter), sleep up to 1 year within the plan’s max run length.  
https://www.inngest.com/docs/durable-execution/limits

### Pricing model (exact published numbers)

Visited https://www.inngest.com/pricing on 2026-10-20:

| Plan | Price | Executions included | Concurrent steps | Events ingested | Seats | Workers | Trace history | Max run length |
|---|---|---|---|---|---|---|---|---|
| Free | $0/mo, no card | 50,000 | 5 | 500k | 5 | 3 | 24 hours | 30 days |
| Pro | Starting at **$99/mo** | 1 million + add-on | 100 included, then **$25 per 25** | 5M+, then **$0.50 per 1M** | 15, then **$10/seat** | 20 + add-on | 7 days | 90 days |
| Business | Starting at **$499/mo** | 10 million + add-on | 500 | 50M+ | 30, then $10/seat | 100 + add-on | 14 days | 366 days |
| Enterprise | Custom | Custom | Custom | Custom | Custom | Custom | 90 days | Custom |

Other published numbers on the same page:

- Free: 100k queue depth, 50 realtime connections, 256 KiB event size, 500 MB span data, 10K scores, 30-minute metrics, 3 workers, unlimited serverless workers.
- Pro: 1M+ queue depth, 1000 realtime connections, 3 MiB event size, 5 GB span data + overages, 50K scores (then **$1.50 per 1K**), 15-minute metrics. Advanced observability add-on **$300**. HIPAA add-on (price not listed). 100 concurrent sandboxes, 24h max duration.
- Business: 10M+ queue depth, 5000 realtime connections, 25 GB span data, 250K scores, 1-minute metrics, 1,000 concurrent sandboxes. Advanced observability add-on **$300**.
- Enterprise: SAML, RBAC, audit trails, HIPAA included, dedicated Slack, dedicated account management.

**What counts as one execution** (pricing FAQ, same page):

> “An execution is metered per function run and per step inside that run. A function with 5 `step.run()` calls uses 6 executions total — 1 for the run, 5 for the steps.”

Pricing calculator copy: `Executions = runs × (steps + 1)`.

**Overage:** FAQ: “On Pro, overage is metered at tiered rates that decrease as volume grows (from **$0.000050** down to **$0.000015** per execution, based on current published rates). On Free, there's no metered overage — execution pauses once you hit the free quota.”

The FAQ does **not** publish the volume breakpoints of those tiers as a static table in the crawlable page. Do not invent a 1–5M / 5–15M grid.

**Sandbox / compute** (separate from executions), same pricing page:

| Resource | Per second | Per hour |
|---|---|---|
| 1 vCPU | $0.000011 | $0.0396 |
| 1 GB memory | $0.000003 | $0.0108 |

Hourly machine examples published: 1 vCPU / 1 GB = $0.0504/hr; 16 vCPU / 128 GB = $2.0160/hr.

### Worked cost at 1M / 10M / 100M steps

Two interpretations. State which one you use in copy.

**Interpretation 1 — 1M billed executions** (treating “steps” as Inngest’s billed execution unit):

| Executions / mo | Plan that covers it | List cost (executions only) |
|---|---|---|
| 1,000,000 | Pro | **$99** |
| 10,000,000 | Business | **$499** |
| 100,000,000 | Not a published included amount | **Unverified exact.** Bounds using the FAQ range on *Pro overage after 1M*: low **$99 + 99M × $0.000015 = $1,584**; high **$99 + 99M × $0.000050 = $5,049**. Business overage rates were not published as a table. |

**Interpretation 2 — 1M `step.run()` calls, 1 step per function** (official formula: executions = runs × 2):

| `step.run()` / mo | Executions | Cost using published included amounts |
|---|---|---|
| 1,000,000 | 2,000,000 | Pro $99 + 1M overage. Bounds **$114–$149** using $0.000015–$0.000050 |
| 10,000,000 | 20,000,000 | Business $499 + 10M overage at **unpublished** Business rates |
| 100,000,000 | 200,000,000 | Custom / unpublished |

Sandbox compute is **additional** if you use Inngest sandboxes. If functions run on your own hosts (the default Cloud model), you pay those hosts yourself.

### Lock-in / uptime

Cloud: Inngest must be up to start and resume runs. Function code can live on your infra (serverless or workers) or in their sandboxes. Self-host: `inngest start` (SQLite default, Postgres for production). Server/CLI license is **SSPL + Apache 2.0 after 3 years**, not OSI-approved open source. SDKs are Apache 2.0.  
https://www.inngest.com/docs/self-hosting · https://github.com/inngest/inngest/blob/main/LICENSE.md

Vs Redis + BullMQ: you give up owning the broker. You gain durable steps without Redis. Self-host still replaces Redis with Inngest’s store.

### MCP / AI agents

Official. Cloud MCP `https://api.inngest.com/mcp` (OAuth or API key). Dev Server `http://127.0.0.1:8288/mcp`. Tools include list/inspect/invoke/rerun/cancel runs, send events, Insights SQL.  
https://www.inngest.com/docs/ai-dev-tools/mcp

### When you’d still choose them

Multi-step workflows and AI agents with sleeps/waits, event-driven fan-out, and you do **not** already have BullMQ. TypeScript/Python/Go SDKs. Want Cloud MCP for agents that inspect runs.

### Sources

- https://www.inngest.com/pricing (visited 2026-10-20)
- https://www.inngest.com/docs/durable-execution/limits
- https://www.inngest.com/docs/learn/inngest-steps
- https://www.inngest.com/docs/durable-execution/primitives/step-run
- https://www.inngest.com/docs/self-hosting
- https://www.inngest.com/docs/ai-dev-tools/mcp
- https://github.com/inngest/inngest/blob/main/LICENSE.md

### Unverified

- Exact Pro/Business execution overage *breakpoints* (only the $0.000050–$0.000015 range is in the FAQ).
- HIPAA add-on dollar amount.
- Worker add-on dollar amount (“20 workers + add-on”).
- Whether retries of a step count as extra executions (docs describe retries; the pricing FAQ does not say “retries are free”). **Do not claim retries are free.**
- Inngest’s pricing FAQ compares itself to Temporal/Trigger.dev; that comparison is vendor copy, not independent measurement.

---

## 2. Trigger.dev

### Official name + URL

- **Trigger.dev Cloud** — https://trigger.dev/pricing  
- Limits: https://trigger.dev/docs/limits  
- MCP: https://trigger.dev/docs/mcp-introduction  
- Self-host: linked from the pricing FAQ  
- llms.txt (vendor, dated 2026-10-16): https://trigger.dev/llms-full.txt

### What it is vs BullMQ

An open-source (Apache 2.0) durable-task platform. On Cloud, **they execute your task code** on managed machines. That is a different contract from BullMQ (you run workers) and from Inngest’s common HTTP-invoke model. It **replaces** Redis + BullMQ. It does not monitor BullMQ.

### Pricing model (exact published numbers)

Visited https://trigger.dev/pricing on 2026-10-20:

| Plan | Price | Usage credit | Concurrent runs | Team | Schedules | Log retention | Notes |
|---|---|---|---|---|---|---|---|
| Free | $0/mo, no card | **$5**/mo | 20 | 5 | 10 | 1 day | Community support. 10 realtime connections. 1 alert destination |
| Hobby | **$10**/mo | **$10**/mo | 50 | 5 | 100 | 7 days | HIPAA BAA add-on **$500/mo** |
| Pro | **$50**/mo | **$50**/mo | 200+, then **$10/mo per 50** | 25+, then **$20/mo per seat** | 1000+, then **$10/mo per 1,000** | 30 days | Slack support. 20+ preview branches then $10/branch. 5+ dashboards then $10/dashboard. 1000+ realtime then $10 per 1,000. AWS PrivateLink. HIPAA BAA **$500/mo** |
| Enterprise | Custom | Custom | Custom | Custom | Custom | Custom | SOC 2 report, pen test, SSO, RBAC |

**Run pricing:** **$0.000025 per run** ($0.25 per 10,000). DEV environment runs are not charged.

**Compute** (only while executing; waits >5s and parent-waiting-on-subtask are checkpointed and not billed):

| Machine | vCPU | GB RAM | Cost/sec |
|---|---|---|---|
| Micro | 0.25 | 0.25 | $0.0000169 |
| **Small 1x (default)** | 0.5 | 0.5 | **$0.0000338** |
| Small 2x | 1 | 1 | $0.0000675 |
| Medium 1x | 1 | 2 | $0.0000850 |
| Medium 2x | 2 | 4 | $0.0001700 |
| Large 1x | 4 | 8 | $0.0003400 |
| Large 2x | 8 | 16 | $0.0006800 |

Official estimate formula and example (same page):

```
1 run = (seconds × machine $/sec) + $0.000025
10s on small-1x, 100 runs/day, 30 days → $1.09/mo
```

API rate limit: **1,500 requests/minute** (higher on paid by request). `batchTrigger()` up to 1,000 tasks (SDK 4.3.1+).  
https://trigger.dev/docs/limits

Free plan: after $5 credit, “you'll need to upgrade to keep running tasks.” Paid: tasks keep running; usage above credits is billed.

### Worked cost at 1M / 10M / 100M **runs**

Pricing is **compute + per-run**, not per-step. Duration dominates.

**Floor (invocation only, 0 seconds — impossible in production, useful as a lower bound):**

| Runs | Invocation | After Pro $50 credit |
|---|---|---|
| 1M | $25 | $50 plan (credit covers $25) → **$50** |
| 10M | $250 | **$250** if treating plan fee as the credit ($50 + $200 overage) |
| 100M | $2,500 | **$2,500** |

**Official-shape example: 10 seconds, small-1x default:**

`cost/run = 10 × $0.0000338 + $0.000025 = $0.000363`

| Runs | Usage | Typical Cloud bill (Pro, credit = $50) |
|---|---|---|
| 1M | $363 | **$363** |
| 10M | $3,630 | **$3,630** |
| 100M | $36,300 | **$36,300** (Enterprise discounts unpublished) |

A 1-second small-1x run is `$0.0000338 + $0.000025 = $0.0000588` → **$58.80 / $588 / $5,880** at 1M / 10M / 100M before credits.

Concurrency at 1M fast runs may force Pro add-on bundles ($10 per 50 concurrent above 200). That is **not** included in the table.

### Lock-in / uptime

Cloud: Trigger.dev must be up; **they** run your code. Self-host Apache 2.0 via Docker Compose or Kubernetes (pricing FAQ). Waits are checkpointed so you do not pay idle time, but the control plane is still theirs on Cloud.

### MCP / AI agents

Official MCP: `npx trigger.dev@latest mcp` / `install-mcp`. Docs list: search docs, init projects, list orgs/projects, get task info, **trigger runs**, deploy, monitor runs, TRQL.  
https://trigger.dev/docs/mcp-introduction

### When you’d still choose them

You want managed compute for long-running TypeScript (and Python-from-TS) agents, no worker fleet, no timeouts, and you are fine deploying task code onto their machines.

### Sources

- https://trigger.dev/pricing (visited 2026-10-20)
- https://trigger.dev/docs/limits
- https://trigger.dev/docs/mcp-introduction
- https://trigger.dev/llms-full.txt (vendor file, “Last updated: 2026-10-16”)
- https://github.com/triggerdotdev/trigger.dev/blob/main/LICENSE

### Unverified

- Exact “plan fee vs included credit” accounting if a finance team treats them as additive rather than credit-against-usage. Copy above assumes **paid plan price = included credit**, which matches “$10 / month credits included.”
- Python as a first-class task runtime: pricing page says Python **scripts inside TypeScript tasks**, not a Python SDK as the primary interface.
- Enterprise committed-use rates.

---

## 3. Temporal Cloud

### Official name + URL

- **Temporal Cloud** — https://temporal.io/pricing  
- Docs: https://docs.temporal.io/cloud/pricing · https://docs.temporal.io/cloud/actions · https://docs.temporal.io/evaluate/cloud  
- AI/docs MCP: https://docs.temporal.io/with-ai

### What it is vs BullMQ

A durable workflow *service*. You run **Workers** that poll Task Queues and execute Workflows/Activities. Temporal Cloud (or self-hosted Temporal) stores Event History and timers. It **replaces** Redis + BullMQ as the broker/orchestrator. It does not connect to BullMQ.

### Pricing model (exact published numbers)

https://temporal.io/pricing and https://docs.temporal.io/cloud/pricing (visited 2026-10-20):

**Actions start at $50 per million ($0.00005 per Action).**

Developer (Pay-As-You-Go):

- No base monthly fee
- **$50 / million Actions at every volume** (no self-serve volume discount)
- Active Storage **$0.042 / GBh**
- Retained Storage **$0.00105 / GBh**
- Support = **10% of usage**
- 99.9% SLA, 99.99% HA options
- SSO via SAML included; SCIM add-on
- New PAYGO: **$150 credits for 90 days**

Business:

- **Greater of $500/mo or 10% of usage**
- Includes **2.5M Actions, 2.5 GB Active Storage, 100 GB Retained Storage** per month
- Volume discounts on Actions (table below)
- P0: 2 hour, business hours

Enterprise / Mission Critical: contact sales. Includes **10M Actions, 10 GB Active, 400 GB Retained**, SCIM. P0 30 min 24/7 (15 min Mission Critical).

**Business+ volume table** (applies to Actions *in excess of* the plan allocation):

| Actions (excess) | Price per million |
|---|---|
| First 5M | $50 |
| Next 5M, up to 10M | $45 |
| Next 10M, up to 20M | $40 |
| Next 30M, up to 50M | $35 |
| Next 50M, up to 100M | $30 |
| Next 100M, up to 200M | $25 |
| Over 200M | Contact sales |

Docs example: 11.25M *excess* Actions on Business = $250 + $225 + $50 = **$525**.

**What is an Action** (https://docs.temporal.io/cloud/actions): start Workflow, start/retry Activity, Activity Heartbeat that reaches the server, Timer start (including implicit SDK timeouts), Signal, Query (including UI call-stack), Update accept/reject, Schedule (each Schedule execution accrues **three** Actions), Nexus operations, Export, Fairness (0.1 extra Action per Action per hour enabled), Capacity TRUs. Local Activities in one Workflow Task count as one Action. Replay does not bill. Heartbeats are throttled (default 80% of Heartbeat Timeout).

### Worked cost

Assume **no storage, no heartbeats, no timers, no signals** — Actions only. Real bills are higher.

**Developer (flat $50/M + 10%):**

| Actions / mo | Actions $ | Support 10% | Total |
|---|---|---|---|
| 1,000,000 | $50 | $5 | **$55** |
| 10,000,000 | $500 | $50 | **$550** |
| 100,000,000 | $5,000 | $500 | **$5,500** |

Vendor blog example: 100,000 Actions = $5 + $0.50 support = **$5.50** before storage.  
https://temporal.io/blog/paygo-developer-support

**Business, Actions only, allocation 2.5M included:**

| Total Actions | Excess | Actions overage (published tiers) | Support | Total |
|---|---|---|---|---|
| 1,000,000 | 0 | $0 | **$500** floor | **$500** |
| 10,000,000 | 7.5M | 5M×$50 + 2.5M×$45 = **$362.50** | max($500, 10%×$362.50) = **$500** | **$862.50** + storage |
| 100,000,000 | 97.5M | 5×$50 + 5×$45 + 10×$40 + 30×$35 + 47.5×$30 = **$3,350** | max($500, $335) = **$500** | **$3,850** + storage |

If a Workflow is `start + 1 Activity` with no heartbeat, 1M such workflows ≈ **2M Actions** (plus any timers the SDK inserts).

### Lock-in / uptime

Cloud: Temporal Cloud must be reachable for starts, signals, and Worker polls. Workers you operate can keep running only while they can poll. Self-host Temporal is possible (not priced here). Namespaces, search attributes, and Event History are the lock-in. 99.9% SLA advertised on the pricing page.

### MCP / AI agents

- **Official docs/knowledge MCP:** `https://temporal.mcp.kapa.ai` (OAuth). https://docs.temporal.io/with-ai  
- **Python SDK can call MCP tools as Activities** (`temporalio-mcp`, pre-release). https://docs.temporal.io/develop/python/integrations/mcp  
- **Workflow-ops MCP** on Temporal Code Exchange is **community-donated**; Temporal says it does **not** formally support or endorse it. https://temporal.io/code-exchange/temporal-mcp-server  

Do not claim an official Temporal Cloud ops MCP.

### When you’d still choose them

Polyglot, long-running, strictly consistent workflows; you already think in Workflows/Activities; you want a dedicated orchestration cluster SLA and you will run Workers.

### Sources

- https://temporal.io/pricing
- https://docs.temporal.io/cloud/pricing
- https://docs.temporal.io/cloud/actions
- https://docs.temporal.io/evaluate/cloud
- https://temporal.io/blog/paygo-developer-support
- https://docs.temporal.io/with-ai

### Unverified

- Storage GBh for a “typical” job (depends on history size and retention).
- Heartbeat Action counts for long Activities.
- Enterprise/Mission Critical dollar amounts.
- Whether Fairness is on by default (docs describe it as a feature you enable).

---

## 4. Hatchet

### Official name + URL

- **Hatchet Cloud** — https://hatchet.run/pricing  
- Product: https://hatchet.run/  
- PAYG announcement (2026-09-29): https://hatchet.run/announcement/pay-as-you-go-pricing  
- MCP: https://docs.hatchet.run/reference/cli/mcp  
- Compute (hosted workers, separate): https://docs.hatchet.run/v1/compute/getting-started

### What it is vs BullMQ

An orchestration engine. You run **workers** that connect to Hatchet and execute tasks. Hatchet Cloud (or self-hosted Hatchet) is the broker. It **replaces** Redis + BullMQ. MIT OSS self-host is advertised on the marketing site (“Open-source. Use…”). It does not monitor BullMQ.

### Pricing model (exact published numbers)

Visited https://hatchet.run/pricing on 2026-10-20.

**Pay-as-you-go (card on file):**

- **$0 to start**
- **1M task runs and 1M events free, every month**
- Then **$30 per million runs**, **$5 per million events**
- 100 workers, 10 tenants, 50 users (then **$10/user**)
- **7-day retention** (hero)
- **10 GB/day active storage**, then **$0.03/GB-hr**
- Log/trace ingestion: 10 GB included then **$0.0004/GB-hr**
- SOC 2 Type II, community/Discord support

**No card:** 2,000 runs/day, 2,000 events/day, 10 workers, 2,000 worker slots, 10k queue backlog, 10 webhooks, 10 crons, 500 MB active storage, 500 MB logs, 3 users.

**Card-on-file other limits:** 1,000,000 scheduled runs, 10,000 worker slots, 1,000,000 queue backlog, 100 webhooks, 1,000 crons.

**Custom:** volume discounts, SLAs, dedicated capacity, multi-region, SSO, RBAC, audit logs, HIPAA, self-hosted/BYOC support. Aimed at **100M+ runs/month**.

FAQ, same page:

- Failed runs **do** count.
- Retries **do not** count (“a task that fails and is retried counts as one run”).
- A spawned task is a second run.
- Hitting a free-tier limit: tasks get dropped.

Announcement (2026-09-29) confirms the same $30/M and $5/M and that Team/Starter/Growth plans were retired.

### Worked cost

Assume 1 event per workflow, small 2 KB payloads, 1 user, logs inside free 10 GB. Hero calculator at 1M runs + 200k events = **$0**.

| Task runs / mo | Events / mo | Runs $ | Events $ | Total |
|---|---|---|---|---|
| 1,000,000 | ≤1,000,000 | $0 | $0 | **$0** |
| 10,000,000 | 1,000,000 | 9×$30 = **$270** | $0 | **$270** |
| 10,000,000 | 10,000,000 | $270 | 9×$5 = **$45** | **$315** |
| 100,000,000 | 1,000,000 | 99×$30 = **$2,970** | $0 | **$2,970** list; Custom discounts unpublished |

Hatchet Compute credits ($5/mo for free-tier users with a card) are a **different** product (they run compute). Do not fold them into run pricing.  
https://docs.hatchet.run/v1/compute/getting-started

### Lock-in / uptime

Cloud: Hatchet control plane must be up. Workers you run. Self-host/hybrid/BYOC offered. Regions listed: AWS Oregon, N. Virginia, Ireland; Sydney private beta.

### MCP / AI agents

Official CLI MCP: `hatchet mcp install` / `serve`. Tools: trigger runs, inspect status/events, list workers, replay, engine status, product feedback. Deny-by-default profile grants.  
https://docs.hatchet.run/reference/cli/mcp

### When you’d still choose them

You want Temporal-like orchestration with cheaper published per-run list prices, retries not billed, and you will run workers. TypeScript/Python mentioned in migrations (Celery, Temporal).

### Sources

- https://hatchet.run/pricing
- https://hatchet.run/announcement/pay-as-you-go-pricing
- https://docs.hatchet.run/reference/cli/mcp
- https://docs.hatchet.run/v1/compute/getting-started

### Unverified

- Which plan gets “90+ days” retention (comparison table on the pricing page rendered incompletely; hero says **7-day** for PAYG).
- Custom volume-discount schedule at 100M+.
- Self-hosted support SKU prices (a 2025 GitHub comment mentioned $500/$2k support plans; **not** on the current pricing page).

---

## 5. Defer (defer.run)

### Official name + URL

- Was **Defer** at https://www.defer.run  
- **Visited 2026-10-20:** that hostname now serves **Domain Digger** (digger.tools), a DNS/WHOIS lookup product. No Defer product, docs, or pricing remain.

### Current status

**Shut down.** Customer email reported on Hacker News (2024-03-25): service unavailable as of **May 1, 2024**. Dealroom lists the company as closed with the same date.  
https://news.ycombinator.com/item?id=39817493  
https://app.dealroom.co/companies/defer

### What it was vs BullMQ

A managed TypeScript/Node background-job platform (Next.js-oriented). It replaced DIY queues; it did not monitor BullMQ.

### Pricing

**No live official pricing.** Do not publish $15/mo or 50-runs/day figures from 2026 aggregator sites; those pages still list a dead product.

### Worked cost

Not applicable.

### Lock-in / MCP

n/a (service gone).

### When you’d still choose them

You would not. Historical footnote only.

### Sources

- https://www.defer.run (visited 2026-10-20 — not Defer)
- https://news.ycombinator.com/item?id=39817493
- https://app.dealroom.co/companies/defer

### Unverified

- Every third-party 2026 “Defer review” still quoting prices.

---

## 6. Quirrel (quirrel.dev)

### Official name + URL

- **Quirrel** — https://quirrel.dev (visited 2026-10-20: imprint-only page, “Job Queueing for Serverless,” Berlin address)  
- Docs FAQ: https://docs.quirrel.dev/netlify-acquisition-faq/  
- GitHub: https://github.com/quirrel-dev/quirrel  
- Status page still exists: https://status.quirrel.dev/ — banner: hosted instance “currently shutting down”

### Current status

Netlify acquired Quirrel. Hosted **quirrel.dev stopped accepting customers**; access through **July 31, 2022**, billing ended August 1, 2022.  
https://docs.quirrel.dev/netlify-acquisition-faq/

OSS: MIT, self-host with Redis. Author described it as **maintenance mode** after the acquisition (GitHub discussion #1169). OpenSSF scorecard (Aug 2026) **Maintained 0/10** (0 commits / 0 issue activity in 90 days).

### What it is vs BullMQ

Was a hosted HTTP job/cron queue for serverless. OSS still uses Redis. Author explicitly told self-hosters that **BullMQ is a better fit** than continuing with Quirrel. It does not monitor BullMQ.

### Pricing

**No hosted product to buy.** Self-host is free (MIT) plus your Redis.

### Worked cost

$0 product. Redis is yours.

### MCP

Not documented.

### When you’d still choose them

You would not start a new hosted project on it. Existing self-hosters should plan a move.

### Sources

- https://quirrel.dev
- https://docs.quirrel.dev/netlify-acquisition-faq/
- https://status.quirrel.dev/
- https://github.com/quirrel-dev/quirrel/discussions/1169
- https://deps.dev/project/github/quirrel-dev%2fquirrel (Maintained 0/10 as of 2026-08-24 scorecard)

### Unverified

- Whether any hosted remnant still processes jobs (status page is contradictory: “all services online” and “shutting down”).

---

## 7. Upstash QStash (and Workflow)

### Official name + URL

- **Upstash QStash** — https://upstash.com/pricing/qstash · machine-readable https://upstash.com/pricing/qstash.md  
- **Upstash Workflow** — https://upstash.com/pricing/workflow.md  
- Prod Pack docs: https://upstash.com/docs/qstash/overall/enterprise  
- GA blog (2025-10-03): https://upstash.com/blog/qstash-ga

### What it is vs BullMQ

A **serverless HTTP message queue and scheduler**. QStash *pushes* to your URL. It is not Redis and not BullMQ. Upstash Workflow adds durable steps on top of QStash. It **replaces** a queue for HTTP/serverless workers.

### Pricing model (exact published numbers)

From https://upstash.com/pricing/qstash.md (visited 2026-10-20):

| Plan | Price | Max messages/day | Bandwidth | Max message size |
|---|---|---|---|---|
| Free | $0/mo | 1,000 | 50 GB | 1 MB |
| Pay as You Go | **$1 per 100K messages** | Unlimited | 50 GB then **$0.05/GB** | 10 MB |
| Fixed 1M | **$180/mo** | **1M / day** | 1 TB | 50 MB |
| Fixed 10M | **$420/mo** | **10M / day** | 5 TB | 50 MB |
| Enterprise | Custom | 100M+ / day | Unlimited | Custom |

PAYG other: max delay 1 year, HTTP response 2 hours, DLQ 7 days, 1000 active schedules (beyond 1,000: **$0.01 per active schedule**), 100 URL groups, 100 queues, parallelism 100.

**Prod Pack** (blog + docs): **$200/month** add-on for uptime SLA, Prometheus, Datadog, encryption-at-rest, SOC-2 on PAYG/Fixed.  
https://upstash.com/blog/qstash-ga

**Workflow** (https://upstash.com/pricing/workflow.md): same plan prices; unit is **steps** at **$1 per 100K steps**. “A step is a single call from the QStash server to the Workflow URL or an external URL. Retries count as extra steps. Parallel steps count as two steps.” `context.run` / sleep / waitForEvent = 1 billed step; `context.call` / `context.invoke` = 2; parallel adds 1 extra per step.

### Retry billing contradiction (do not paper over this)

On the **same** official markdown:

- Header: “You are only charged for messages — **retries are free.**”
- PAYG bullets: “Retries: **Free** (only published messages count)”
- FAQ: “**Each delivery attempt counts as one message.** … If QStash retries and succeeds, the message is billed as **2 messages.**”

**Unverified which sentence is currently billed.** Marketing copy must either quote both or omit a “retries are free” claim.

### Worked cost (QStash PAYG, treating 1 published message = 1 bill, **if** retries free)

| Published messages / mo | PAYG | Notes |
|---|---|---|
| 1,000,000 | **$10** | ~33k/day, under PAYG unlimited daily |
| 10,000,000 | **$100** | Or Fixed 1M at **$180** if you need 1M **per day** (~30M/mo) |
| 100,000,000 | **$1,000** | Or Fixed 10M at **$420** if you need 10M **per day** (~300M/mo) |

If the FAQ is the billed rule and mean attempts = 1.2× publishes, multiply PAYG by 1.2.

**Workflow PAYG** at 1M / 10M / 100M **steps**: **$10 / $100 / $1,000**.

### Lock-in / uptime

Fully managed HTTP broker. Your worker is any HTTPS endpoint. SLA requires Prod Pack or Enterprise. Soft daily/bandwidth limits: they contact you before 429s.

### MCP / AI agents

No official QStash ops MCP found. Upstash publishes machine-readable pricing markdown for agents.

### When you’d still choose them

Serverless/edge HTTP workers, cron, fan-out to URLs, you do not want Redis. Cheap per-message list price at moderate volume.

### Sources

- https://upstash.com/pricing/qstash.md
- https://upstash.com/pricing/workflow.md
- https://upstash.com/docs/qstash/overall/enterprise
- https://upstash.com/blog/qstash-ga
- https://upstash.com/llms.txt

### Unverified

- Which retry rule is actually invoiced (see contradiction).
- Exact SLA percentage (Prod Pack says “uptime SLA” without a number in the pages fetched).

---

## 8. AWS SQS + Step Functions

### Official name + URL

- **Amazon SQS** — https://aws.amazon.com/sqs/pricing/  
- **AWS Step Functions** — https://aws.amazon.com/step-functions/pricing/  
- Price List API used for SQS dollar rates: `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSQueueService/current/index.json` (publicationDate **2026-09-11T12:46:07Z**)

### What it is vs BullMQ

SQS is a managed **message queue** (API requests, not a Node job library). Step Functions is a managed **state machine**. Together they can replace Redis + BullMQ + a workflow layer. They do not speak BullMQ.

### SQS pricing (exact)

From the official pricing page:

- **1 million requests free each month** (all commercial regions except GovCloud; no rollover).
- No minimum fee. Pay for API requests.
- Every SQS action is a request. A request may include 1–10 messages, max 1 MiB total payload.
- Each **64 KB** payload chunk = 1 request.
- FIFO send/receive/delete/change-visibility at FIFO rates; other APIs at Standard rates.
- Fair queues: Standard rate **plus** fair-queue rate when a message group ID is involved.
- Same-region data transfer to/from SQS is not charged; cross-region/internet is.

From the AWS Price List (us-east-1, OnDemand), descriptions verbatim:

| Queue | Tier (requests / month) | Published description |
|---|---|---|
| Standard | 0 – 100B | **$0.40 per million** Amazon SQS standard requests in Tier1 in US East (N Virginia) |
| Standard | 100B – 200B | **$0.30 per million** … Tier2 |
| Standard | 200B+ | **$0.24 per million** … Tier3 |
| FIFO | 0 – 100B | **$0.50 per million** … FIFO … Tier1 |
| FIFO | 100B – 200B | **$0.40 per million** … Tier2 |
| FIFO | 200B+ | **$0.35 per million** … Tier3 |
| Fair | all | **$0.10 per million** Amazon SQS fair queue requests in US East (N. Virginia) *(plus Standard)* |

The HTML pricing table is JS-rendered; the Price List SKUs are the citable dollar source. Free-tier 1M is **not** subtracted inside those SKUs (beginRange 0); it is a separate monthly credit described on the pricing page.

### Step Functions pricing (exact, us-east-1 examples on the official page)

**Standard Workflows**

- **4,000 free state transitions / month** (does not expire with the 12-month AWS Free Tier).
- us-east-1 example rate: **$0.000025 per state transition** ($25 / million).
- Charged per transition including retries.

Official example 1: 4 transitions × 100,000 executions = 400,000 − 4,000 free → 396,000 × $0.000025 = **$9.90**.

**Express Workflows**

- **$1.00 per million requests**
- Duration rounded up to 100 ms, memory in 64 MB chunks
- Official example 3: 1 million workflows × 30 s × 64 MB → request **$1.00** + duration **$31.26** = **$32.26**
- Official example 4 duration tiers shown: **$0.06000 / GB-hour** first 1,000; **$0.03000** next 4,000; **$0.01642** thereafter (us-east-1)

Lambda, VPC, and data transfer are extra.

### Worked example (SQS Standard + optional Step Functions)

**SQS only, us-east-1, payload < 64 KB, no batching, 3 requests per job (Send, Receive, Delete), no empty receives, no retries:**

| Jobs / mo | Requests | After 1M free | × $0.40/M |
|---|---|---|---|
| 1,000,000 | 3,000,000 | 2,000,000 | **$0.80** |
| 10,000,000 | 30,000,000 | 29,000,000 | **$11.60** |
| 100,000,000 | 300,000,000 | 299,000,000 | **$119.60** |

With batching of 10 on all three APIs: divide by 10 → **$0.08 / $1.16 / $11.96** (still minus the same 1M free).

**Long polling empty receives** (a real worker) can dwarf the job count. That cost is **not** in the table.

**Step Functions Standard, 1 job = 4 transitions (AWS example 1 shape), us-east-1:**

| Jobs / mo | Transitions | After 4k free | × $0.000025 | + SQS 3-req from above |
|---|---|---|---|---|
| 1,000,000 | 4,000,000 | 3,996,000 | **$99.90** | **$100.70** |
| 10,000,000 | 40,000,000 | 39,996,000 | **$999.90** | **$1,011.50** |
| 100,000,000 | 400,000,000 | 399,996,000 | **$9,999.90** | **$10,119.50** |

Lambda duration is still extra.

**Express, using AWS example 3 scaled linearly (30 s, 64 MB) — duration is *not* perfectly linear across GB-hour tiers:**

| Workflows | Requests $ | Duration (linear from $31.26 / 1M) | Total Express |
|---|---|---|---|
| 1M | $1.00 | $31.26 | **$32.26** (official) |
| 10M | $10.00 | ~$312.60 | **~$322.60** (tiering may change this) |
| 100M | $100.00 | Official example 4 (10 s, 64 MB) total **$482.97** — **do not scale example 3 to 100M** | Use example 4 as the 100M published point (**$482.97**) |

### Lock-in / uptime

AWS regional service. IAM, VPC, and account limits. Highest lock-in of this list if you also use Lambda/event patterns. You do not run Redis. You *do* run or pay for compute (Lambda/ECS/EC2) that SQS does not include.

### MCP / AI agents

No official SQS/Step Functions ops MCP equivalent to Durabull/Hatchet. AWS has generic assistant products; not verified here as queue MCP.

### When you’d still choose them

Already on AWS; need SQS FIFO, IAM, or Step Functions integrations (Athena, Glue, SageMaker, etc.); compliance with existing AWS agreements.

### Sources

- https://aws.amazon.com/sqs/pricing/
- AWS Price List `AWSQueueService` current index, publicationDate 2026-09-11T12:46:07Z
- https://aws.amazon.com/step-functions/pricing/
- https://docs.aws.amazon.com/step-functions/latest/dg/concepts-standard-vs-express.html

### Unverified

- Non-us-east-1 SQS dollars (Price List has per-region SKUs; not tabulated here).
- Typical empty-receive poll volume.
- Express duration grades at 10M workflows (only 1M and 100M official examples).

---

## 9. Google Cloud Tasks

### Official name + URL

- **Cloud Tasks** — https://cloud.google.com/tasks/pricing  
- Docs: https://cloud.google.com/tasks/docs

### What it is vs BullMQ

Managed **task dispatch** to App Engine or HTTP. You enqueue; Cloud Tasks retries and rate-limits delivery to **your** workers. Replaces Redis + BullMQ for HTTP/App Engine push. Does not monitor BullMQ.

### Pricing model (exact)

Visited https://cloud.google.com/tasks/pricing on 2026-10-20:

A **billable operation** is an API call or push delivery attempt.

| Item | Price |
|---|---|
| Billable operations, chunked at **32 KB** | **$0.00** for 0–1,000,000 / month / account |
| | **$0.40 / 1,000,000** above 1,000,000 / month / account |

Notes from the same page:

- List of 25 tasks = 25 operations.
- 96 KB add = 3 operations.
- Empty ListTasks = 1 operation.
- Batch create: max(request, response) size, 32 KB ceil.
- Google infrastructure errors that miss SLO are not billed; client errors are.
- Batch delete: 1 op per successfully deleted task (or client-error delete).
- HTTP targets: **regular network costs apply**.

### Worked cost

Assume enqueue + one successful push, payload < 32 KB, no list/delete traffic:

| Tasks / mo | Ops | After 1M free | × $0.40/M |
|---|---|---|---|
| 1,000,000 | 2,000,000 | 1,000,000 | **$0.40** |
| 10,000,000 | 20,000,000 | 19,000,000 | **$7.60** |
| 100,000,000 | 200,000,000 | 199,000,000 | **$79.60** |

Worker compute (Cloud Run, GCE, GKE) is extra.

### Lock-in / uptime

GCP account, IAM, location. Cloud Tasks is the broker; you still run the HTTP handler.

### MCP

Not documented as a Cloud Tasks MCP server.

### When you’d still choose them

GCP-native HTTP/App Engine workloads, simple push queues, you already pay a GCP bill.

### Sources

- https://cloud.google.com/tasks/pricing
- https://cloud.google.com/tasks/docs

### Unverified

- Regional SKU variance (page shows a single USD table).
- Quota vs price (quotas page not fully pulled).

---

## 10. Cloudflare Queues

### Official name + URL

- **Cloudflare Queues** — https://developers.cloudflare.com/queues/platform/pricing/ (docs last updated **Apr 21, 2026**)  
- Workers plan wrapper: https://developers.cloudflare.com/workers/platform/pricing/  
- Free-plan changelog: https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/

### What it is vs BullMQ

A managed queue for **Cloudflare Workers** (or HTTP pull consumers). Replaces Redis + BullMQ on the Workers runtime. Does not monitor BullMQ.

### Pricing model (exact)

From https://developers.cloudflare.com/queues/platform/pricing/:

- An **operation** is counted for each **64 KB** written, read, or deleted.
- KB = 1,000 bytes; ~100 bytes internal metadata per message.
- Per message, not per batch. A batch of 10 = 10 writes + 10 reads + 10 deletes if processed.
- **No egress or bandwidth charges.**

| | Workers Free | Workers Paid |
|---|---|---|
| Standard operations | **10,000 operations/day** | **1,000,000 operations/month** included + **$0.40 / million** |
| Message retention | 24 hours, non-configurable | 4 days default, configurable up to 14 days |

Official: “In most cases, it takes **3 operations** to deliver a message: 1 write, 1 read, and 1 delete.”

```
((Number of Messages * 3) - 1,000,000) / 1,000,000 * $0.40
```

Retries: extra **read** per retry. DLQ write extra. Expired unread: write + delete only.

Workers Paid subscription: **$5.00 / month** minimum.  
https://developers.cloudflare.com/workers/platform/pricing/

Official example: 1 million messages **per day** × 30 days × 3 ops − 1M included = 89M billed × $0.40/M = **$35.60** (plus Workers Paid $5).

### Worked cost (Workers Paid, <64 KB, 3 ops, no retries)

| Messages / mo | Ops | After 1M included | Queue $ | + $5 Workers Paid |
|---|---|---|---|---|
| 1,000,000 | 3,000,000 | 2,000,000 | $0.80 | **$5.80** |
| 10,000,000 | 30,000,000 | 29,000,000 | $11.60 | **$16.60** |
| 100,000,000 | 300,000,000 | 299,000,000 | $119.60 | **$124.60** |

Workers CPU time for the consumer is extra (Workers usage model).

### Lock-in / uptime

Cloudflare account. Best fit if consumers are Workers. Pull consumers can run elsewhere over HTTP. Free plan retention is 24h only.

### MCP

Queues pricing docs do not describe a Queues ops MCP. Cloudflare has other AI/docs surfaces; not verified as queue control.

### When you’d still choose them

The app is already on Workers; you want a queue in the same account without Redis.

### Sources

- https://developers.cloudflare.com/queues/platform/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/

### Unverified

- HTTP pull consumer request charges beyond queue operations.
- Exact Workers CPU $ for a given consumer.

---

## 11. Graphile Worker

### Official name + URL

- **Graphile Worker** — https://worker.graphile.org/docs  
- Worker Pro: https://worker.graphile.org/docs/pro · https://worker.graphile.org/pricing

### What it is vs BullMQ

A **PostgreSQL-backed** Node.js job queue (`SKIP LOCKED`, `LISTEN/NOTIFY`). Alternative runtime, not a BullMQ monitor. Jobs live in your database.

### Pricing

- **Graphile Worker:** MIT, free. Community-funded.  
- **Worker Pro** (`@graphile-pro/worker`): proprietary. **USD $100/mo**, or included with Graphile GitHub sponsorship at **$100/mo+**.  
- **Launch / early access:** sponsor at **$25+/mo**, keep that rate at least 18 months after launch ends (saves a minimum of $1,300 vs $100/mo per the pricing page).  
- Private Advisor / Development Support: **from $899/mo** ($10,788/yr with 10% annual).  
https://worker.graphile.org/pricing · https://worker.graphile.org/support

Pro features listed: live migration between Worker versions, crashed-worker recovery. Docs: Worker existed 5 years without these; they are “not essential.”

### Worked cost at 1M / 10M / 100M jobs

**$0** product (OSS) or **$100/mo** (Pro, or $25/mo launch). Does not scale with job count. Postgres I/O/storage is yours.

### Lock-in / uptime

You operate Postgres. No vendor control plane unless you buy support. Pro is a licensed npm package via GitHub Packages.

### MCP

Not documented.

### When you’d still choose them

Node + Postgres already, want transactional enqueue with the business write, do not want Redis.

### Sources

- https://worker.graphile.org/docs
- https://worker.graphile.org/docs/pro
- https://worker.graphile.org/pricing
- https://worker.graphile.org/support

### Unverified

- When the $25 launch offer ends.
- Graphile Store card checkout (docs said “not available at time of writing”; sponsorship is the documented path).

---

## 12. pg-boss

### Official name + URL

- **pg-boss** — https://pgboss.io/introduction  
- GitHub: https://github.com/timgit/pg-boss (MIT, Node 22.12+ / Bun, PostgreSQL 13+)

### What it is vs BullMQ

Postgres job queue for Node. `SKIP LOCKED`, optional `LISTEN/NOTIFY`, cron/RRULE, queues with policies, pub/sub, OpenTelemetry. Alternative runtime. Official intro: “no per-job charges.”

### Pricing

**MIT, $0.** No Pro SKU found.

### Worked cost

$0 product + Postgres.

### Lock-in / uptime

You operate Postgres. Jobs can be inserted in the same DB transaction as business data.

### MCP

Not documented.

### When you’d still choose them

Same as Graphile Worker: Node + Postgres, no Redis, no vendor.

### Sources

- https://pgboss.io/introduction
- https://github.com/timgit/pg-boss

### Unverified

- None material for pricing.

---

## 13. Others commonly compared

### River (Postgres / SQLite)

- **URLs:** https://riverqueue.com/ · Pro https://riverqueue.com/pro · llms.txt https://riverqueue.com/llms.txt · license https://github.com/riverqueue/river/blob/master/LICENSE  
- **What:** Transactional job queue for **Go, Ruby, Rust, TypeScript** on Postgres or SQLite. Alternative runtime, not a BullMQ monitor.  
- **OSS:** MPL 2.0. Core jobs, UI, queues, periodic jobs, unique jobs.  
- **River Pro:** workflows, batching, sequences, concurrency limits, DLQ table, durable periodic jobs, encrypted jobs, ephemeral jobs.  
  - Page: “$125” with monthly or annual subscriptions; **up to 20 developer seats**; Enterprise custom (`team@riverqueue.com`).  
  - llms.txt (stronger wording): “**$125/month paid annually** for teams up to 20 developers.”  
- **Worked cost:** license, not per job.  
- **MCP:** not documented.  
- **Unverified:** whether $125 monthly card price equals $125/mo billed annually (llms.txt vs the HTML “monthly or annual” line). Use llms.txt’s annual wording plus the HTML $125 figure, and do not invent a monthly-card total.

### Sidekiq Pro / Enterprise (Ruby, Redis)

Closest cousin to BullMQ (Redis lists, Ruby instead of Node).

- **URLs:** https://sidekiq.org/ · Pro https://sidekiq.org/products/pro/ · Enterprise https://sidekiq.org/products/enterprise/ · FAQ https://sidekiq.org/wiki/Commercial-FAQ  
- **OSS:** LGPL, free.  
- **Pro:** **$99/mo or $995/yr**, unlimited usage, per organization, credit card only. Batches, reliability, pause, expiry, metrics, UI search.  
- **Enterprise:** **starting at $269/mo per 100 production worker threads**; volume discounts; invoice/PO. Unlimited org license **$79,500/yr**. Appliance (redistribution) **$14,995/yr** Pro, **$39,995/yr** Enterprise.  
- **Worked cost:** does not scale with 1M jobs.  
- **MCP:** not documented.  
- **When:** Ruby/Rails, Redis already in the stack.

### Faktory

- **URLs:** https://contribsys.com/faktory/ · billing https://billing.contribsys.com/fent/new.cgi · wiki https://github.com/contribsys/faktory/wiki/Licensing  
- **What:** Language-agnostic job **server** (workers in any language). Replaces Sidekiq/BullMQ as the server. Redis internally.  
- **OSS:** AGPL-3.0 server; clients not AGPL.  
- **Enterprise:** first 100-connection pack **$299/mo**, additional packs **$99/mo**. Cron, unique, expiry, Redis gateway, statsd, throttling, batches, job status, white label. Production requires license; phones home daily unless unlimited license.  
- **Worked cost:** connection packs, not jobs. Wiki: 100 connections “typically enough to perform millions of jobs per day.”  
- **MCP:** not documented.

### Oban Pro (Elixir / Python, Postgres)

- **URL:** https://oban.pro/pricing  
- **OSS Oban:** free. Reliable jobs, scheduled/cron, community support. No durable workflows / global rate limits / queue partitioning.  
- **Pro:** **$150/mo** or **$135/mo** yearly (**$1,620/year**). One license per application (one production database). Unlimited nodes. Elixir **or** Python per license; both = two licenses or Universal Pro (email); 10% multi-platform discount.  
- **Enterprise:** custom bundles, invoice/PO.  
- **No free trial** (stated).  
- **Worked cost:** per application license, not per job.  
- **MCP:** not documented.

### Restate Cloud / BYOC

- **URL:** https://restate.dev/pricing (JS source of the numbers below)  
- **What:** Durable runtime (invocation journal, virtual objects, queues, RPC). You run services; Restate invokes them. Replaces the broker. OSS self-host (permissive license, FAQ).  
- **What is an action:** function invocation, function completion, `ctx.run(...)`, `ctx.awakeable()` / resolve, `ctx.sleep()`, RPC/`ctx.client()`, durable promises, `ctx.set`/`ctx.get`. Payloads: **one action per started 64 KiB**. Each call is **2 actions (invoke + complete) plus intermediates**.  
- **Cloud plans** (from official page JS, 2026-10-20):

| Plan | Price | Included actions | Burst | Included VO storage | Retention | Extra actions |
|---|---|---|---|---|---|---|
| Free | $0 | 100k | 100/sec (10/sec sustained in compare table) | 1 GB | 1 day | n/a (must upgrade) |
| Starter | **$75**/mo | 5M | 500/sec | 5 GB | 3 days | **$25 / million** |
| Business | **$300**/mo | 20M | 1,000/sec | 20 GB | 7 days | **$25 / million** |
| Premium | **$1,000**/mo | 50M | 2,000/sec | 50 GB | 30 days | **$15 / million** (50–100M), **$10 / million** (100–200M), 200M+ contact |
| Enterprise | Custom | Custom | up to 100,000s/sec | Custom | Custom | Custom |

HIPAA BAA **+$300** on Business/Premium (included Enterprise). Multi-AZ **+$200** Business / **+$500** Premium. Extra VO storage **$0.50/GB-month**. SLAs: Free best effort; Starter/Business/Premium 99.9% (Premium 99.99% with multi-AZ); Enterprise 99.99%.

**Worked Cloud cost (actions only, ignore storage):**

| Actions / mo | Cheapest published fit | Math |
|---|---|---|
| 1,000,000 | Starter | **$75** (Free only includes 100k) |
| 10,000,000 | Starter overage **or** Business | Starter $75 + 5M×$25 = **$200**; Business **$300** included |
| 100,000,000 | Premium | $1,000 + 50M×$15 = **$1,750** |

**BYOC** (same page): Production platform fee **$3,000/mo**, Mission Critical **$5,000/mo**, plus capacity license and your cloud infra. Illustrative table: 500 actions/sec **~$6–7k/mo**; 5,000/sec **~$30k/mo**. Access “on request today, public signup coming soon.”

- **MCP:** docs MCP `https://docs.restate.dev/mcp`. https://docs.restate.dev/develop/ai-assistant  
- **Unverified:** blog still saying 50k free actions (live FAQ/JS say **100k**). Use 100k.

### DBOS

- **URL:** https://www.dbos.dev/dbos-pricing · Conductor https://dbos.dev/dbos-conductor  
- **What:** OSS **DBOS Transact** library (TS/Python/Go/Java) checkpoints workflows in **your** Postgres. **Conductor** is a hosted (or Enterprise self-hosted) ops console. This is closer to “durable execution library + control plane” than a hosted queue. Workers remain yours.  
- **Pro $99/mo:** 2 seats, 3 apps, **1M checkpoints/mo**, extra **$50/million**, MCP Server, unlimited workers/concurrency, BYO database. Discord community support.  
- **Teams $499/mo:** 10 seats, 10 apps (extra apps **$50**), **10M checkpoints**, extra **$40/million**, Slack, 2-day email SLA, SOC2 & HIPAA, RBAC, OpenMetrics.  
- **Enterprise:** custom, self-host Conductor, SSO/SAML.  
- Exceeding usage: “we will **not interrupt** your service,” email to upgrade or reduce.  
- **DBOS Cloud** (serverless hosting) is listed without public dollar rates on that page.  
- **Worked Conductor cost:**

| Checkpoints / mo | Pro | Teams |
|---|---|---|
| 1M | **$99** | $499 (overbuy) |
| 10M | $99 + 9×$50 = **$549** | **$499** |
| 100M | $99 + 99×$50 = **$5,049** | $499 + 90×$40 = **$4,099** |

- **MCP:** Pro feature list includes **MCP Server** (“Monitor and debug your workflows directly from your preferred coding agent”).  
- **Unverified:** DBOS Cloud compute dollars; checkpoint vs step mapping for a given app.

### Taskforce.sh / BullMQ Pro (monitor + commercial library, not replacements)

Included because comparison pages will be asked.

- **Taskforce.sh dashboard:** https://taskforce.sh/pricing — **$19.95 / $49.95 / $99.95** per month for 1 / 5 / 15 Redis (or PG) **connections**. 15-day trial, no card. Yearly: $195 / $495 / $995. Hosted **MCP**. SOC 2 Type II. **Does not include BullMQ Pro.** On-prem licensed separately (price unpublished).  
- **BullMQ Pro:** commercial drop-in for `bullmq`. Docs: subscribe in Taskforce.sh panel, per organization. **No current dollar price on the public pricing page.** Historical blog (introductory) $95/mo — **do not use as current list price.**

### Celery / RQ / CloudAMQP

Not fully priced in this pass. Celery and RQ are OSS (you pay Redis/RabbitMQ/SQS). CloudAMQP is hosted RabbitMQ with its own plans — fetch https://www.cloudamqp.com/plans.html before quoting.

---

## Positioning notes for Durabull copy

1. **Do not compare Durabull’s price to Inngest/Temporal per-million rates.** Different SKU. Durabull does not execute jobs.  
2. **Fair cost comparison for a team that already has BullMQ:** Redis + workers + Durabull (or Taskforce.sh) vs **migrating off BullMQ** onto a managed orchestrator. Migration cost is not in any vendor’s table.  
3. **Cheapest hosted “dumb queue” at 100M small messages** among verified per-message meters: Cloud Tasks (~$80), SQS (~$120 without polling waste), Cloudflare Queues (~$125 with Workers Paid), QStash PAYG ($1,000). Orchestrators (Inngest/Temporal/Hatchet/Restate/Trigger) are **1–2 orders of magnitude more** at that volume if you count steps/actions.  
4. **Hatchet’s 1M free runs** is the most generous *orchestrator* free slice in this set (with a card). Inngest Free is 50k executions and **pauses**. Trigger Free is $5 compute credit. Temporal Developer has no included Actions (credits are a 90-day intro).  
5. **Dead products:** Defer, hosted Quirrel. Do not put them on a live comparison grid except as “discontinued.”  
6. **License-shaped cousins** (Sidekiq, Oban, River, Faktory, Graphile): same economic shape as self-hosted BullMQ — you pay Redis/Postgres + a seat/org license, not per job.

---

## Recheck checklist (before a marketing launch)

Prices move. Re-visit, in this order:

1. https://www.inngest.com/pricing — especially execution overage *table* if they publish breakpoints  
2. https://trigger.dev/pricing — machine $/sec and run fee  
3. https://temporal.io/pricing and https://docs.temporal.io/cloud/pricing  
4. https://hatchet.run/pricing  
5. https://upstash.com/pricing/qstash.md — resolve the retry contradiction  
6. https://aws.amazon.com/sqs/pricing/ and the Price List `publicationDate`  
7. https://aws.amazon.com/step-functions/pricing/  
8. https://cloud.google.com/tasks/pricing  
9. https://developers.cloudflare.com/queues/platform/pricing/  
10. https://restate.dev/pricing  
11. https://www.dbos.dev/dbos-pricing  
12. https://taskforce.sh/pricing and whatever page first publishes a current BullMQ Pro dollar amount

---

## Sources (index)

| Vendor | Primary pricing URL | Fetched |
|---|---|---|
| Inngest | https://www.inngest.com/pricing | 2026-10-20 |
| Trigger.dev | https://trigger.dev/pricing | 2026-10-20 |
| Temporal | https://temporal.io/pricing · https://docs.temporal.io/cloud/pricing | 2026-10-20 |
| Hatchet | https://hatchet.run/pricing | 2026-10-20 |
| Defer | https://www.defer.run (not Defer anymore) | 2026-10-20 |
| Quirrel | https://docs.quirrel.dev/netlify-acquisition-faq/ | 2026-10-20 |
| Upstash QStash/Workflow | https://upstash.com/pricing/qstash.md · workflow.md | 2026-10-20 |
| Amazon SQS | https://aws.amazon.com/sqs/pricing/ + Price List API | 2026-10-20 / list pub 2026-09-11 |
| AWS Step Functions | https://aws.amazon.com/step-functions/pricing/ | 2026-10-20 |
| Google Cloud Tasks | https://cloud.google.com/tasks/pricing | 2026-10-20 |
| Cloudflare Queues | https://developers.cloudflare.com/queues/platform/pricing/ | docs dated 2026-04-21, visited 2026-10-20 |
| Graphile Worker | https://worker.graphile.org/pricing | 2026-10-20 |
| pg-boss | https://pgboss.io/introduction | 2026-10-20 |
| River | https://riverqueue.com/pro · llms.txt | 2026-10-20 |
| Sidekiq | https://sidekiq.org/ | 2026-10-20 |
| Faktory | https://contribsys.com/faktory/ · billing.contribsys.com | 2026-10-20 |
| Oban Pro | https://oban.pro/pricing | 2026-10-20 |
| Restate | https://restate.dev/pricing (+ page JS chunk) | 2026-10-20 |
| DBOS | https://www.dbos.dev/dbos-pricing | 2026-10-20 |
| Taskforce.sh | https://taskforce.sh/pricing | 2026-10-20 |
