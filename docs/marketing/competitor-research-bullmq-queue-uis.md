# BullMQ / Bull queue monitoring UIs — competitor research

**Purpose:** Source notes for Durabull marketing comparison pages.  
**Research date:** 2026-10-20.  
**Rule:** No invented features, prices, or limits. Anything not confirmed on an official page is in **Unverified**.

**How this was gathered:** Official websites, first-party docs, GitHub READMEs, npm package pages, and GitHub repository metadata. Secondary blogs and Reddit are cited only when they are the *only* remaining source, and they are labeled unverified for marketing use.

**Product Hunt:** Searches for `bullmq dashboard`, `bull board`, `taskforce`, `workbench`, `queuedash`, and `upqueue` on Product Hunt did **not** return dedicated product listings for these UIs. Do not claim Product Hunt rankings.

---

## Snapshot matrix (verified only)

| Product | Type | Code change to see queues? | Auto-discovery | Multi-env / multi-Redis | Alerts | MCP | Public price | License |
|---|---|---|---|---|---|---|---|---|
| **Bull Board** | OSS embed + CLI/Docker | Embed: yes, register adapters. CLI/Docker: no | CLI/Docker: yes. Embed: no | One process; CLI one Redis URL | No built-in | No MCP. CLI exposes JSON HTTP API | Free | MIT |
| **Arena** | OSS Express UI | Yes — name each queue | No | `hostId` groups hosts; you still list queues | Not documented | Not documented | Free | MIT |
| **Taskforce.sh** | Hosted SaaS + on-prem | No app SDK. Redis URL or Connector | Yes (scan; 40s timeout) | Plans priced by connections (1 / 5 / 15) | Email, Slack, PagerDuty | Yes, hosted MCP | $19.95 / $49.95 / $99.95 mo | Commercial (connector OSS) |
| **Workbench** | OSS embed + Docker + macOS | Embed: queues **or** `redis`. Docker: `QUEUE_NAMES`. Desktop: Redis URL | Yes if `redis` set; cap default **100**. Docker lists names | One Redis per instance in published docs | Slack, Discord, webhook | Yes, `@getworkbench/mcp` | Free | MIT |
| **BullMQ Pro** | Commercial **library**, not a dashboard | Replace `bullmq` with `@taskforcesh/bullmq-pro` | N/A | N/A | N/A (library) | N/A | **Not published** on public pricing pages | Per-org commercial |
| **bull-monitor** | Archived OSS | Yes — pass Queue instances / CLI `-q` names | No | Not documented | Optional metrics collector, not alerts | Not documented | Free (unmaintained) | MIT |
| **Redis Insight** | Official Redis GUI | No. Connect a Redis DB | Discovers Redis keys/DBs, **not BullMQ queues** | Multiple Redis DBs | Not a queue alerter | Redis Copilot (not queue MCP) | Free to use | SSPL v1 (≥2.0) |
| **Upqueue** | Hosted BullMQ platform | Claims zero-code Redis connect | Claims auto-detect | Plans described by connection count | Claims alerts/monitors | Not found | **Dollar prices not verified** | Unknown |
| **QueueDash OSS** | OSS embed + Docker | Embed: list queues **or** discovery. Hosted: SDK `attach()` | OSS: Bull/BullMQ discovery | Hosted: envs/projects with plan limits | Hosted: email/webhook; Slack on paid | Not documented | OSS free. Hosted $0 / $29 / $99 | MIT (OSS) |
| **Bullstudio OSS** | OSS standalone + embed | Standalone: no. Embed: supply queues | Standalone: yes. Embed: no | Cloud docs: workspaces/envs. OSS: one process | Cloud: Pro/Enterprise. OSS: not in GitHub feature list | Not documented | OSS free. Cloud **$ not published** | MIT (OSS) |
| **Bullpane** | Self-hosted OSS core + Pro | No. Add Redis/Postgres in UI | Yes | Unlimited connections (stated for Free) | Pro: Slack/webhook | Pro: MCP + OAuth | Free; Pro **$39/mo** per install | MIT core + commercial Pro |
| **muleta** | OSS, pre-1.0 | Standalone: Redis URL. Embed: `createMuleta({ redis })` | Redis URL; no per-queue register in examples | Not documented as multi-env | Not documented | Not documented | Free | Apache-2.0 |
| **BullMQ Control Dashboard** | OSS wrapper around bull-board | No. Add Redis from UI | Yes (`SCAN:*:meta`) | Multiple Redis from UI | Not documented | Not documented | Free | Not confirmed on README |
| **nestjs-bullpen** | NestJS OSS embed | Mount module; discovers Nest queues | Nest DI, not Redis SCAN | Nest app only | Not documented | Not documented | Free | MIT |

---

## 1. Bull Board (`@bull-board` / felixmosh/bull-board)

### Official name + website + GitHub

- **Name:** Bull Board / `@bull-board`
- **Website / docs:** https://felixmosh.github.io/bull-board/
- **GitHub:** https://github.com/felixmosh/bull-board
- **npm:** https://www.npmjs.com/package/@bull-board/api (and scoped adapters)
- **Live demo:** https://felixmosh.github.io/bull-board/demo/

GitHub (visited 2026-10-20): MIT, TypeScript, topics `bull` / `redis` / `bullmq-pro`. npm `@bull-board/api` **9.10.4**, updated 2026-10-05, MIT, ~1.08M weekly downloads. `@bull-board/ui` listed ~2.0M weekly downloads. GitHub “Latest release” metadata also showed **v6.20.6** (2026-03-19); **the npm version is newer**. Do not mix those version numbers in copy.

### What it is

An open-source dashboard UI for **Bull and BullMQ** that you mount in a Node/Bun HTTP server, or run standalone via CLI/Docker. It visualizes queues and jobs and offers operator actions (retry, clean, etc.). It does not process jobs.

### How you connect / whether app code changes are required

**Embed path — code required.** Official getting started:

> “Install the core `@bull-board/api` plus one adapter for your framework.”  
> https://felixmosh.github.io/bull-board/guide/getting-started

Express example from the README:

```js
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});
app.use('/admin/queues', serverAdapter.getRouter());
```

https://github.com/felixmosh/bull-board/blob/master/README.md

NestJS `forFeature` also registers each queue by name or instance: https://www.npmjs.com/package/@bull-board/nestjs

**Standalone path — no app code.** README:

> “If you already have a Redis with queues in it, one command gets you the dashboard:  
> `npx @bull-board/cli -r redis://localhost:6379`  
> … No install and no code.”

https://github.com/felixmosh/bull-board/blob/master/README.md

CLI docs:

> “Sometimes you don't want to wire bull-board into an app at all, you just want to look at a Redis instance. `@bull-board/cli` does that: point it at a Redis URL and it finds the Bull and BullMQ queues stored there”

https://felixmosh.github.io/bull-board/guide/cli

### Auto-discovery of queues? Multi-connection/environments?

**CLI/Docker: yes, with rescan.**

> “On startup the CLI scans Redis for keys matching `::meta` (BullMQ) and `::id` (Bull) under each configured prefix… The default prefix is `bull`… By default it rescans every 10 seconds”

https://felixmosh.github.io/bull-board/guide/cli

`--queues` skips discovery. `--prefix` is a comma-separated list; **no wildcards**.

**Embed: no auto-discovery.** You pass `queues: [new BullMQAdapter(queue), …]`.

**Multi-Redis:** CLI takes one `--redis` URL (or sentinel/cluster). Not a multi-environment control plane. Multiple prefixes on one Redis: `--prefix bull,tenant-a`.

**Limits documented on CLI:** PostgreSQL-backed BullMQ v6 queues are **not** discoverable via CLI; use a server adapter. Bull 3 queues on Redis Cluster are skipped.

### Alerts?

No built-in alerting in official docs. Confirmed by first-party BullMQ comparison:

> “Alerts | None” for Bull Board  
> https://bullmq.io/articles/guides/bull-board-vs-taskforce/

Workbench’s own comparison table also says “Bull Board | No built-in alerting”: https://getworkbench.dev/docs/guides/alerts

Optional `@bull-board/metrics` (beta) is **historical metrics storage**, not alerting: https://github.com/felixmosh/bull-board/blob/master/README.md

### MCP / AI agent integration?

No MCP server documented. CLI documents a JSON HTTP API for scripts/agents (`curl http://127.0.0.1:3000/api/queues`), which is **not MCP**.

Taskforce comparison: “AI agents (MCP) | No” for Bull Board. https://bullmq.io/articles/guides/bull-board-vs-taskforce/

### Pricing

OSS / free. No paid tier on GitHub, npm, or docs.

### License

MIT: https://github.com/felixmosh/bull-board/blob/master/LICENSE

### Strengths and when you'd choose it

- Default OSS dashboard; large npm install base.
- Many first-party adapters: Express, Fastify, NestJS, Koa, Hapi, Hono, H3, Elysia, Bun.
- CLI + Docker for look-at-Redis without mounting in the app.
- Flows, schedulers, theming, optional 90-day metrics, BullMQ Pro and BullMQ v6 Postgres (embed path).
- Choose it when you already have a Node server and want a free in-process UI, or a one-shot CLI against Redis.

### Weaknesses vs a full auto-discovery multi-env dashboard with MCP

- Embed path requires registering every queue in application code.
- CLI discovers queues but is one Redis, local-dev oriented, no team auth beyond optional basic auth, no alerts, no MCP.
- No organizations, roles, or multi-environment workspace.
- No native Slack/PagerDuty monitors.

### Sources

- https://github.com/felixmosh/bull-board
- https://github.com/felixmosh/bull-board/blob/master/README.md
- https://felixmosh.github.io/bull-board/guide/getting-started
- https://felixmosh.github.io/bull-board/guide/cli
- https://felixmosh.github.io/bull-board/server-adapters/
- https://www.npmjs.com/package/@bull-board/api
- https://www.npmjs.com/package/@bull-board/ui
- https://www.npmjs.com/package/@bull-board/nestjs
- https://bullmq.io/articles/guides/bull-board-vs-taskforce/

### Unverified / could not confirm

- Exact GitHub star count fluctuated across visits (search snippets 3,269 vs 3,513). Use live GitHub at publish time.
- Whether GitHub Releases will catch up to npm 9.10.4.

---

## 2. Arena (`bee-queue/arena`, npm `bull-arena`)

### Official name + website + GitHub

- **Name:** Arena
- **GitHub:** https://github.com/bee-queue/arena
- **npm:** https://www.npmjs.com/package/bull-arena
- **Docker:** https://github.com/bee-queue/docker-arena and https://hub.docker.com/r/mixmaxhq/arena/
- No separate product marketing site. Mixmax intro post (historical): https://www.mixmax.com/blog/introducing-bull-arena

npm **4.10.0**, updated 2026-10-16, MIT, ~24k weekly downloads. GitHub search snippet: **938 stars**, latest release **v4.9.2** (2025-11-18) — npm 4.10.0 is newer than that GitHub release tag.

### What it is

An Express web GUI for **Bee Queue, Bull, and BullMQ**. Run standalone or mount as middleware.

### How you connect / whether app code changes are required

**You must list each queue by name.** README:

> “The required `name` and `hostId` in each queue object have to be present in each queue object.”

BullMQ example:

```js
Arena({
  BullMQ: Queue,
  FlowBullMQ: FlowProducer,
  queues: [{
    type: 'bullmq',
    name: 'testQueue',   // “this name must match up exactly with what you've defined in bullmq”
    hostId: 'worker',
    redis: { port, host, password },
  }],
}, { basePath: '/arena', disableListen: true });
```

https://github.com/bee-queue/arena/blob/master/README.md  
https://www.npmjs.com/package/bull-arena

Standalone is still a Node process with that config (or Docker). Not a “paste Redis URL in a SaaS UI” product.

README also says you *could* fetch queue lists yourself (e.g. from AWS) and pass them in — that is custom code, not built-in discovery.

### Auto-discovery of queues? Multi-connection/environments?

**No auto-discovery.** `hostId` is a display grouping for hosts. Multiple queue objects can point at different Redis hosts. You still enumerate every queue.

BullMQ support is described as **“preliminary support for BullMQ post 3.4.x”** (still on the current README as of this research).

### Alerts?

Not in the Features list (health glance, paginate/filter, details/stacktraces, restart/retry). No alert docs found.

### MCP / AI agent integration?

Not documented.

### Pricing

OSS / free.

### License

MIT: https://github.com/bee-queue/arena (LICENSE)

### Strengths and when you'd choose it

- One UI for Bee + Bull + BullMQ.
- Simple Express mount; Docker image exists.
- Choose it for mixed Bee/Bull estates that already know queue names.

### Weaknesses vs a full auto-discovery multi-env dashboard with MCP

- Every queue must be named in config.
- UI/stack is older (Handlebars). README still calls BullMQ support preliminary.
- No alerts, MCP, metrics history, or team RBAC in official docs.
- No first-party hosted multi-env product.

### Sources

- https://github.com/bee-queue/arena
- https://github.com/bee-queue/arena/blob/master/README.md
- https://www.npmjs.com/package/bull-arena
- https://github.com/bee-queue/arena/blob/HEAD/example/README.md

### Unverified / could not confirm

- Whether “preliminary” BullMQ support has silently become complete beyond that README wording.
- Current Docker Hub image freshness vs GitHub.

---

## 3. Taskforce.sh (by the BullMQ authors)

### Official name + website + GitHub

- **Name:** Taskforce.sh
- **Website:** https://taskforce.sh/
- **Pricing:** https://taskforce.sh/pricing
- **On-premises:** https://taskforce.sh/on-premises
- **Docs:** https://docs.taskforce.sh/
- **Company:** “The team develops Taskforce.sh at its Swedish company, BullForce Labs AB, and sells it through the US subsidiary, Taskforce.sh Inc.” (homepage FAQ)
- **Connector source:** https://github.com/taskforcesh/taskforce-connector (referenced from docs)

The dashboard itself is commercial, not an MIT GitHub app.

### What it is

Hosted (and on-prem) web dashboard for **Bull, BullMQ, and BullMQ Pro**, built by the BullMQ authors. Connect Redis (or run a connector); inspect/manage jobs; monitors and alerts; metrics; flows; teams; MCP agents.

Homepage: “Set up in minutes — Connect via a Redis URL or the lightweight Taskforce Connector, your queues appear automatically.” https://taskforce.sh/

### How you connect / whether app code changes are required

**No application SDK.** Getting started:

> “Taskforce.sh works with your existing Redis instances, there is nothing to install in your application and your queues and workers keep working as they do today. A connection in Taskforce.sh points to one Redis database, and all the queues in that database will be available from the connection.”

https://docs.taskforce.sh/getting-started

Two connection methods (same page):

1. Direct Redis URL if reachable from the internet.
2. Taskforce Connector (CLI) for private/local Redis.

Connector:

> “The taskforce connector is a small command line tool that is used for connecting securely a redis instance to taskforce.sh.”  
> `yarn global add taskforce-connector`  
> `taskforce -n "My Redis" -t <token>`

https://docs.taskforce.sh/getting-started/taskforce-connector

Direct connection docs warn Redis must use `maxmemory: noeviction` and that Taskforce.sh egress IP is **18.193.189.120**: https://docs.taskforce.sh/getting-started/direct-redis-connection

### Auto-discovery of queues? Multi-connection/environments?

**Auto-discovery: yes**, with a timeout and a manual override.

> “By default, the connector will issue a scan to find the queues that are present in the given Redis instance. … There is a maximum timeout of 40 seconds, after that, the connector will not continue trying to find more queues in the instance.”

Manual: `--queues monitoring,payments` or `--queuesFile`. Non-default prefix: `foobar:monitoring`.

https://docs.taskforce.sh/getting-started/taskforce-connector

Getting started:

> “Taskforce.sh scans the Redis database looking for queues… If a queue you expected is missing, it may not have been created yet, or it may be using a prefix other than the default `bull`”

https://docs.taskforce.sh/getting-started

**Multi-connection:** plans are priced by Redis/database connections. All queues on that instance count as one connection. FAQ:

> “A connection is one Redis instance that Taskforce.sh connects to, either directly with a Redis URL or through the Taskforce Connector. BullMQ v6 queues stored in PostgreSQL are added through the Taskforce Connector, one connection per database. All the queues in that Redis instance or database are included.”

https://taskforce.sh/pricing

Hosted limits: Starter **1**, Growing **5**, Enterprise **15** connections. More than 15: `contact@taskforce.sh`. On-prem: unlimited connections and teams.

### Alerts?

Yes. Docs:

> “Currently, we support the following monitor types: Connection monitor, Failed jobs monitor, Missing workers monitor, Max Memory monitor, Backlog monitor.”  
> “Alerts can also be sent by email, to Slack or to PagerDuty”  
> “by default the monitors are disabled and must be enabled manually on every connection.”

https://docs.taskforce.sh/monitoring

### MCP / AI agent integration?

Yes. Hosted endpoint `https://api.taskforce.sh/mcp`; on-prem `https://<your-host>/mcp`. Bearer token `tfa_…`. Agents are non-human org members with roles, read-only or full tokens, audit log.

Limits on hosted MCP (docs): 120 req / 60s per token; 256 KB body; 30s duration; 100 job ids per bulk call; 50 jobs per page.

https://docs.taskforce.sh/agents/  
https://docs.taskforce.sh/agents/connecting-an-mcp-client  
https://docs.taskforce.sh/agents/tokens  
https://docs.taskforce.sh/agents/permissions  
https://docs.taskforce.sh/agents/audit-log

Homepage: “Does a plan include a BullMQ Pro license? No.” MCP is listed as included on every hosted plan’s “what every plan includes” section: https://taskforce.sh/pricing

### Pricing (quoted from official page, visited 2026-10-20)

https://taskforce.sh/pricing

> “Plans are priced by the number of connections. Every plan includes unlimited queues and users, and starts with a 15-day free trial with no credit card required.”

Monthly:

| Plan | Price | Connections | Notes from the same page |
|---|---|---|---|
| Starter | **$19.95/mo** | 1 | Community support. Job tools, scheduled jobs, monitoring, alerts, metrics |
| Growing | **$49.95/mo** | 5 | Organizations & teams, custom roles, premium email support |
| Enterprise | **$99.95/mo** | 15 | Priority email support |

Yearly (quoted): “$195 instead of $239.40 for Starter, $495 instead of $599.40 for Growing and $995 instead of $1,199.40 for Enterprise.”

Metrics: “up to two weeks of history at one-minute resolution.”

SOC 2 Type II and GDPR claimed on homepage/pricing.

**On-premises:** same features, unlimited connections/teams. **No public dollar price.** “Subscribe to an on-premises license from the Subscriptions page of your Taskforce.sh account.” License check phones home every 15 minutes; 5 failed checks stops the container. Needs PostgreSQL, Redis 7+, Auth0, Mailgun, HTTPS. https://taskforce.sh/on-premises

BullMQ Pro is a **separate** subscription.

### License

Commercial SaaS / on-prem. Connector is installable from npm (`taskforce-connector`) and GitHub. Taskforce’s own comparison table: “License | Commercial. The connector is open source.” https://bullmq.io/articles/guides/bull-board-vs-taskforce/

### Strengths and when you'd choose it

- First-party, deepest Bull/BullMQ/Pro coverage, including groups.
- Zero app instrumentation; auto-discovery; private Redis via connector.
- Production monitors + Slack/PagerDuty + teams/roles + MCP with audit.
- Choose it when paying per Redis and sending queue data through a vendor (or running their on-prem image) is acceptable.

### Weaknesses vs a full auto-discovery multi-env dashboard with MCP

On this axis Taskforce.sh **already is** that category. Remaining gaps vs a self-hosted auto-discovery dashboard:

- Hosted plans cap connections at 1/5/15.
- On-prem price is unpublished; still requires license check to taskforce.sh.
- Hosted path: job traffic goes through Taskforce (they state they do not store job payloads — that claim is theirs, not independently audited here).
- Discovery scan can stop at 40 seconds on huge Redis.
- Monitors default off.

### Sources

- https://taskforce.sh/
- https://taskforce.sh/pricing
- https://taskforce.sh/on-premises
- https://docs.taskforce.sh/
- https://docs.taskforce.sh/getting-started
- https://docs.taskforce.sh/getting-started/taskforce-connector
- https://docs.taskforce.sh/getting-started/direct-redis-connection
- https://docs.taskforce.sh/monitoring
- https://docs.taskforce.sh/agents/
- https://docs.taskforce.sh/agents/connecting-an-mcp-client
- https://docs.taskforce.sh/bullmq-pro
- https://bullmq.io/articles/guides/bull-board-vs-taskforce/

### Unverified / could not confirm

- On-premises list price.
- Whether “we never store your job payloads” is true for all job actions/logs (vendor statement only).
- Current connector GitHub star/license string (docs link only; README of connector not fully fetched this session).

---

## 4. Workbench (`getworkbench` / pontusab/workbench)

### Official name + website + GitHub

- **Name:** Workbench
- **Website:** https://getworkbench.dev/
- **Docs:** https://getworkbench.dev/docs
- **GitHub:** https://github.com/pontusab/workbench
- **npm:** `@getworkbench/*` (core, adapters, cli, mcp)

GitHub snippet: **452 stars**, MIT, homepage getworkbench.dev, created 2026-04-21. Positions itself as a bull-board alternative.

### What it is

Open-source **BullMQ-only** dashboard. Three runtimes: native **macOS** app, embed in a Node/Bun app (13 adapters), or standalone Docker.

Docs intro:

> “Zero extra infrastructure — mount as a route in your existing app, or run as a standalone Docker container”  
> “13 framework adapters — Hono, Elysia, Express, Fastify, Koa, NestJS, AdonisJS, Next.js, TanStack Start, Astro, Nuxt, Bun.serve, and h3”  
> “Built-in alerting — Slack and webhook contact points”  
> “MCP server”  
> “MIT licensed, no telemetry”

https://getworkbench.dev/docs

FAQ: **“Is it BullMQ-only? Yes. Bull (legacy) is not supported.”** https://github.com/pontusab/workbench/blob/main/README.md

### How you connect / whether app code changes are required — **verified answer**

**It depends on the runtime:**

1. **Embedded adapters — usually register queues in code, unless you pass `redis`.**

Quick start:

```
workbench({
  queues: [emailQueue],
  basePath: "/jobs",
  auth: { username, password },
});
```

https://getworkbench.dev/docs/getting-started/quick-start

Configuration table (authoritative):

> `queues` | BullMQ `Queue` instances to display. **Required unless `redis` is set.**  
> `redis` | Redis connection for auto-discovery.  
> `prefix` | BullMQ key prefix during auto-discovery. Default: `"bull"`.  
> `maxQueues` | Cap on discovered queues. Default: `100`.

https://getworkbench.dev/docs/guides/configuration

2. **Auto-discovery path — no Queue instances in app code, but you still mount Workbench and give it Redis:**

```
workbench({
  redis: process.env.REDIS_URL!,
  prefix: "bull",
  maxQueues: 100,
});
```

https://getworkbench.dev/docs/guides/redis-auto-discovery

3. **Standalone Docker — queue names, not Redis SCAN.** Env:

> `QUEUE_NAMES` | Default `default` | Comma-separated queue names  
> `REDIS_URL` | Redis connection URL

https://getworkbench.dev/docs/getting-started/environment-variables  
https://getworkbench.dev/docs/deployment/standalone-docker

Homepage Docker example uses `-e QUEUE_NAMES=default`.

4. **macOS app — Redis URL, auto-discover, no app code.**

> “Local-first. Auto-discovers queues from any Redis URL. Stores credentials in the OS keychain.”  
> https://getworkbench.dev/

Desktop docs: macOS 11+, Apple-signed. https://getworkbench.dev/docs/deployment/desktop

**How many queues?** Documented cap **`maxQueues` default 100** on the Redis auto-discovery path. No other published hard cap for the explicit `queues: []` path. Docker is whatever you put in `QUEUE_NAMES`.

**Multi-env?** Published config is **one Redis per Workbench process** (`REDIS_URL` or one `queues` list). Desktop docs do not describe a multi-connection environment switcher. Multi-env in practice = multiple app mounts or multiple desktop connections — **the latter is not documented**. Do not claim first-class multi-environment workspaces.

### Auto-discovery of queues?

Yes, when `redis` is set (embed/core) or on the macOS app. Not the default Docker path (`QUEUE_NAMES`).

### Alerts?

Yes. Slack, Discord, generic webhook. Triggers: `job_failed`, `job_stalled`, `retries_exhausted`, `failed_backlog`, `no_workers_with_backlog`. Persisted in Redis at `{prefix}:workbench:alerts:*`. Nothing is sent until contact points + rules exist.

https://getworkbench.dev/docs/guides/alerts

### MCP / AI agent integration?

Yes. `@getworkbench/mcp` is a **local stdio proxy** to a running dashboard (`WORKBENCH_URL`). 18 tools (inspect + operate). Not a hosted multi-tenant MCP URL. Inherits dashboard `readonly` and basic auth.

https://getworkbench.dev/docs/packages/mcp

### Pricing

MIT, free. Blog: “There is no paid tier, no telemetry, and no account required.” https://getworkbench.dev/blog/workbench-vs-bull-board

### License

MIT © Pontus Abrahamsson. https://github.com/pontusab/workbench/blob/main/README.md

### Strengths and when you'd choose it

- Modern OSS bull-board alternative with flows, schedulers, error grouping, keyboard UI.
- Optional Redis auto-discovery (cap 100).
- Built-in alerts + local MCP.
- macOS app for local debugging without embedding.
- Choose it for **BullMQ-only** teams that want OSS in-process or local desktop.

### Weaknesses vs a full auto-discovery multi-env dashboard with MCP

- Default embed still wants `queues: [Queue]`.
- Auto-discovery capped at **100** queues unless you raise `maxQueues`.
- Docker standalone wants **named** queues (`QUEUE_NAMES`).
- **No documented multi-Redis / multi-env control plane.**
- MCP is a local proxy to one dashboard URL, not org-scoped hosted MCP with audit tokens.
- Bull/Bee not supported.
- Auth is HTTP basic, not orgs/roles/SSO.

### Sources

- https://getworkbench.dev/
- https://getworkbench.dev/docs
- https://getworkbench.dev/docs/getting-started/quick-start
- https://getworkbench.dev/docs/guides/configuration
- https://getworkbench.dev/docs/guides/redis-auto-discovery
- https://getworkbench.dev/docs/guides/alerts
- https://getworkbench.dev/docs/packages/mcp
- https://getworkbench.dev/docs/deployment/desktop
- https://getworkbench.dev/docs/deployment/standalone-docker
- https://getworkbench.dev/docs/getting-started/environment-variables
- https://github.com/pontusab/workbench/blob/main/README.md
- https://getworkbench.dev/blog/workbench-vs-bull-board

### Unverified / could not confirm

- Whether the macOS app supports multiple saved Redis environments in one window.
- Runtime behavior if `maxQueues` is raised far above 100.
- Exact GitHub star count at publish time.

---

## 5. BullMQ Pro / Taskforce Pro tooling

### Official name + website + GitHub

- **Name:** BullMQ Pro
- **Docs:** https://docs.bullmq.io/bullmq-pro/introduction
- **Install:** https://docs.bullmq.io/bullmq-pro/install
- **Taskforce page:** https://docs.taskforce.sh/bullmq-pro
- **Package:** `@taskforcesh/bullmq-pro` from `https://npm.taskforce.sh/` (token required)
- **Support tracker:** https://github.com/taskforcesh/bullmq-pro-support (release comments issue #86)

This is a **commercial queue library**, not a dashboard. Taskforce.sh is the official frontend and can show Pro features (groups).

### What it is

Drop-in commercial edition of BullMQ with extra features and email support from the authors (`support@taskforce.sh`). Per-organization license, unlimited use across that org’s projects.

https://docs.bullmq.io/bullmq-pro/introduction  
https://docs.taskforce.sh/bullmq-pro

Verified Pro-only capabilities from official docs (non-exhaustive of the full Pro TOC):

- **Groups** (virtual per-id queues, round-robin): https://docs.bullmq.io/bullmq-pro/groups
- **Batches** (`batch.size`, `minSize`, `timeout`, `groupAffinity`): https://docs.bullmq.io/bullmq-pro/batches
- **Observables** (cancelable workers, TTL): https://docs.bullmq.io/bullmq-pro/observables/
- **Telemetry** via `BullMQOtel` on Pro classes: https://docs.bullmq.io/bullmq-pro/telemetry
- NestJS: `@taskforcesh/nestjs-bullmq-pro`

OSS vs Pro feature table (library README): https://github.com/taskforcesh/bullmq — Pro columns include Observables, Group Rate Limit, Group Support, Batches Support.

### How you connect / whether app code changes are required

**Yes, application dependency change.** `.npmrc` with org token, then:

```
yarn add @taskforcesh/bullmq-pro
import { QueuePro, WorkerPro } from '@taskforcesh/bullmq-pro';
```

https://docs.bullmq.io/bullmq-pro/install

Taskforce.sh dashboard: “Taskforce.sh works with BullMQ Pro queues, including groups.” A dashboard plan does **not** include the Pro library license. https://taskforce.sh/pricing

### Auto-discovery / multi-env / alerts / MCP?

N/A for the library. Use Taskforce.sh (or another UI that understands Pro groups, e.g. Bullpane claims groups — see §10).

### Pricing

**No current public dollar price on taskforce.sh/pricing or docs.bullmq.io.**

Official wording:

> “You can request a free trial token on this page… consider subscribing under the 'Subscriptions' tab.”  
> https://docs.bullmq.io/bullmq-pro/introduction

> “Does a plan include a BullMQ Pro license? No. BullMQ Pro is a separate subscription.”  
> https://taskforce.sh/pricing

Historical / unofficial (do **not** use in marketing as current price):

- Taskforce blog “introductory price of 95$/mo (or 995$ yearly)”: https://blog.taskforce.sh/bullmq-pro-edition/
- Indie Hackers post by the founder mentioning $139/month: https://www.indiehackers.com/post/charging-enterprise-customers-3f1fe4823a

Support overview (not a price): aim to respond within one business day. https://docs.bullmq.io/bullmq-pro/support

### License

Per-organization commercial. Tokens must not be shared outside the paying org. https://docs.taskforce.sh/bullmq-pro

### Strengths and when you'd choose it

- Groups, batches, observables when OSS BullMQ is not enough.
- Same authors as Taskforce.sh UI.
- Choose it for **library** features, not as a monitoring UI.

### Weaknesses vs a full auto-discovery multi-env dashboard with MCP

- It is not a dashboard. Comparing it to Durabull as a UI is a category error.
- Price is gated behind the Taskforce account UI.

### Sources

- https://docs.bullmq.io/bullmq-pro/introduction
- https://docs.bullmq.io/bullmq-pro/install
- https://docs.bullmq.io/bullmq-pro/groups
- https://docs.bullmq.io/bullmq-pro/batches
- https://docs.bullmq.io/bullmq-pro/observables/
- https://docs.bullmq.io/bullmq-pro/telemetry
- https://docs.bullmq.io/bullmq-pro/support
- https://docs.taskforce.sh/bullmq-pro
- https://taskforce.sh/pricing
- https://github.com/taskforcesh/bullmq

### Unverified / could not confirm

- **Current BullMQ Pro list price.** Do not publish $95 or $139 without a live Subscriptions-page screenshot.
- Full Pro feature checklist vs OSS (roadmap URL 404’d: https://docs.bullmq.io/bullmq-pro/roadmap).

---

## 6. bull-monitor (`s-r-x/bull-monitor`)

### Official name + website + GitHub

- **Name:** bull-monitor
- **GitHub:** https://github.com/s-r-x/bull-monitor — **Status: ARCHIVED**
- **Homepage:** https://s-r-x.github.io/bull-monitor/
- **npm:** `@bull-monitor/ui`, `@bull-monitor/express`, `@bull-monitor/cli`, etc.
- Last GitHub feature release in changelog: **5.4.0 (2023-08-27)**. npm `@bull-monitor/ui` updated **2023-12-07**. `@bull-monitor/cli` 5.4.0 published Aug 27, 2023.

GitHub snippet: ~129–130 stars, MIT.

### What it is

Archived “Standard UI for Bull and BullMQ” with Express/Koa/Hapi/Fastify/Nest adapters plus a CLI. GraphQL + Material UI stack.

### How you connect / whether app code changes are required

**Yes.** Express adapter:

```ts
const monitor = new BullMonitorExpress({
  queues: [
    new BullAdapter(new Queue('1', 'REDIS_URI')),
    new BullAdapter(new Queue('2', 'REDIS_URI'), { readonly: true }),
  ],
});
await monitor.init();
app.use('/my/url', monitor.router);
```

https://github.com/s-r-x/bull-monitor/tree/main/packages/express

CLI requires **named queues**, not SCAN:

```
Usage: bull-monitor -q queue1 queue2
  --redis-uri <uri>   (default redis://localhost:6379)
  -q, --queue <queues...>
  --bullmq            use bullmq instead of bull
```

https://github.com/s-r-x/bull-monitor/blob/main/packages/cli/README.md

### Auto-discovery? Multi-env?

No discovery. CLI needs `-q`. No multi-env product.

### Alerts?

Optional **metrics collector** (Redis list `bull_monitor::metrics::{{queue}}`), not notification alerts.

### MCP?

Not documented.

### Pricing / license

Free, MIT. Unmaintained.

### Strengths and when you'd choose it

- Do not choose it for new work. Historical alternative to bull-board; QueueDash README still lists it as inspiration.

### Weaknesses vs a full auto-discovery multi-env dashboard with MCP

- Archived since 2023.
- Must name queues.
- No MCP, no modern alerts, no multi-env.

### Sources

- https://github.com/s-r-x/bull-monitor
- https://github.com/s-r-x/bull-monitor/blob/main/README.md
- https://github.com/s-r-x/bull-monitor/blob/main/packages/cli/README.md
- https://github.com/s-r-x/bull-monitor/blob/main/packages/express/README.md
- https://www.npmjs.com/package/@bull-monitor/ui
- https://www.npmjs.com/package/@bull-monitor/cli

### Unverified / could not confirm

- Whether any fork is now the de facto successor (Workbench/QueueDash/Bullstudio all exist independently).

---

## 7. Other GitHub / npm dashboards

### 7a. QueueDash (OSS + hosted)

- **OSS GitHub:** https://github.com/alexbudure/queuedash (~453 stars, MIT)
- **Hosted:** https://www.queuedash.com/ · pricing https://www.queuedash.com/pricing
- **Docs:** https://www.queuedash.com/docs/getting-started/quickstart

**What it is:** Dashboard for **Bull, BullMQ, Bee-Queue, GroupMQ**. Two products: MIT embeddable dashboard, and a hosted product that records jobs via `@queuedash/sdk`.

**Connect (OSS):** Mount middleware and pass queue instances, **or** enable discovery:

```ts
discovery: { type: "bullmq", connectionUrl: "redis://localhost:6379", prefix: "bull" }
```

README: discovery covers Bull/BullMQ, not Bee-Queue, GroupMQ, or Redis Cluster. https://github.com/alexbudure/queuedash/blob/main/README.md

**Connect (hosted):** **App code required.** SDK:

```
const qd = new Queuedash({ apiKey: process.env.QUEUEDASH_API_KEY! });
qd.attach(queue);
```

> “Jobs already in the queue when you attach aren't sent; the SDK sends a job when it hears an event for it.”  
> BullMQ **5+**. Attach `Queue`, not `Worker`.  
> https://www.queuedash.com/docs/integrations/bullmq

Optional Redis connection on hosted for retry/promote/remove.

**Multi-env (hosted, quoted):**

| Limit | Free $0 | Pro $29 | Business $99 |
|---|---|---|---|
| Jobs recorded / month | 1,000 | 100,000 | 1,000,000 |
| History | 7 days | 30 days | 90 days |
| Members | 3 | 10 | 50 |
| Projects | 1 | 5 | Unlimited |
| Environments per project | 1 | 3 | 10 |
| Queues per environment | 5 | 20 | 100 |
| Redis connections | 1 | 5 | Unlimited |
| Alerts by Slack | No | Yes | Yes |

https://www.queuedash.com/pricing

**Alerts (hosted):** failure rate, queue depth, stuck jobs, processing time, success checks; email or webhook on all plans; Slack on Pro/Business.

**MCP:** not documented on pages visited.

**Pricing:** OSS free. Hosted as table above. No card for Free.

**Weaknesses vs auto-discovery multi-env MCP dashboard:** Hosted path is an **SDK**, not Redis SCAN, with monthly job quotas and per-env queue caps. OSS path can discover Bull/BullMQ but is still a self-hosted embed, not a multi-tenant ops console with MCP.

### 7b. Bullstudio (OSS + cloud docs)

- **Website:** https://bullstudio.dev/
- **GitHub:** https://github.com/emirce/bullstudio (~123 stars, MIT)
- **Cloud docs:** https://docs.bullstudio.dev/ (index fetch returned HTTP 500 on 2026-10-20; subpages from search still resolved)

**OSS:** Standalone `npx bullstudio -r redis://localhost:6379` — **zero code, auto-detects Bull or BullMQ**. Embed: **supply only the queues you choose**.

https://github.com/emirce/bullstudio/blob/main/README.md  
https://bullstudio.dev/

**Cloud docs** describe workspaces (dev/staging/prod), auto-discovery on a Redis connection, alerts on Pro/Enterprise:

| Feature | Free | Pro | Enterprise |
|---|---|---|---|
| Workspaces | 1 | 5 | 10 |
| Connections per workspace | 1 | 5 | 10 |
| Alerts | No | Yes | Yes |
| Members | Unlimited | Unlimited | Unlimited |

https://docs.bullstudio.dev/platform/organizations

**Dollar prices for cloud: not published on pages successfully fetched.** Do not invent them.

**MCP:** not in GitHub README feature list.

**OSS vs cloud:** GitHub README is the self-hosted dashboard. `docs.bullstudio.dev` introduction calls it a “cloud-hosted observability” product. Treat them as two surfaces of the same brand.

### 7c. muleta (`DipandaAser/muleta`)

- **GitHub:** https://github.com/DipandaAser/muleta
- **Demo:** https://demo.muleta.dev
- **npm:** `@muleta-dev/server`, `@muleta-dev/core`
- **License:** Apache-2.0
- **Status:** Pre-1.0 (`0.x` may break)

Standalone:

```
docker run ... -e MULETA_REDIS_URL=redis://... ghcr.io/muleta-dev/muleta:edge
```

Embed: `createMuleta({ redis: { url } })` — Redis URL, not a Queue list in the published example.

**No auth built in.** No alerts/MCP in README. Roadmap includes viewer/admin roles, prefix config, bearer auth, Fastify adapter.

### 7d. BullMQ Control Dashboard (`imatefx/bullmq-control-dashboard`)

- **GitHub:** https://github.com/imatefx/bullmq-control-dashboard
- **Docker Hub:** `imatefx/bullmq-control-dashboard`

Central UI **built on bull-board**. Add multiple Redis connections in the UI. Auto-discover via `SCAN:*:meta`. Per-connection boards + combined `/board/all`. HTTP basic auth admin/reader required to start.

> “bull-board renders live Queue objects — it has no Redis discovery, config, or auth of its own. This app supplies all three around it.”

No alerts/MCP in README. License string not quoted in README (confirm LICENSE file before claiming MIT).

### 7e. Bullpane (`bullpane.com` / `madmorett/bullpane`)

- **Website:** https://bullpane.com/
- **llms.txt:** https://bullpane.com/llms.txt
- **GitHub:** https://github.com/madmorett/bullpane
- **npm:** `npx bullpane --redis redis://localhost:6379`

Self-hosted dashboard for BullMQ and BullMQ Pro on Redis or BullMQ 6 Postgres. Free edition: no login. Pro: roles, SSO, alerts, folders, flow graph, audit log, MCP.

**Pricing (quoted from bullpane.com, 2026-10-20):**

Comparison table: “Free · Pro $39/mo per installation”

llms.txt: “Pro (USD 39/month or USD 390/year, one installation, unlimited users)”

Free: “Unlimited connections and queues”, jobs/search/bulk, Pro groups, read-only mode, no login.

Pro MCP: URL + OAuth, acts as the signed-in user. Homepage also: 14-day refund on first payment; license phones home daily, 7-day offline grace.

**Category:** closest OSS-core self-hosted competitor with Pro MCP. Not a hosted SaaS.

### 7f. nestjs-bullpen (`NicolasCV/nestjs-bullpen`)

- **GitHub:** https://github.com/NicolasCV/nestjs-bullpen
- **npm:** `nestjs-bullpen`
- **License:** MIT

NestJS-native. Discovers queues from **Nest DI**, not Redis SCAN:

```ts
BullpenModule.forRoot(); // every queue above shows up automatically
```

Read-only by default; `writable: true` for mutations. No MCP/alerts in README. Nest-only, not multi-env.

### 7g. Other names that appeared and were **not** first-class BullMQ ops dashboards

| Name | Why it is out of the comparison set |
|---|---|
| **Another Redis Desktop Manager** https://github.com/qishibo/AnotherRedisDesktopManager | General Redis GUI |
| **Redis Commander / RedisInsight** | Redis key browsers (Insight covered in §8) |
| **Stormix/workbench** | Fork of pontusab/workbench |
| **Trigger.dev** | Different job platform, not a BullMQ UI |
| GitHub code search for `bullmq-dashboard` / `bullmq-ui` | Mostly wrappers around bull-board or dead packages; no additional official product with docs/pricing found |

### Sources (section 7)

- https://github.com/alexbudure/queuedash/blob/main/README.md
- https://www.queuedash.com/ · https://www.queuedash.com/pricing · https://www.queuedash.com/docs/integrations/bullmq
- https://github.com/emirce/bullstudio/blob/main/README.md · https://bullstudio.dev/ · https://docs.bullstudio.dev/platform/organizations
- https://github.com/DipandaAser/muleta/blob/main/README.md
- https://github.com/imatefx/bullmq-control-dashboard/blob/main/README.md
- https://bullpane.com/ · https://bullpane.com/llms.txt
- https://github.com/NicolasCV/nestjs-bullpen/blob/main/README.md

---

## 8. Redis Insight (Redis official GUI)

### Official name + website + GitHub

- **Name:** Redis Insight
- **Website:** https://redis.io/insight/
- **Docs:** https://redis.io/docs/latest/develop/tools/insight/
- **GitHub:** https://github.com/redis/RedisInsight
- **License page:** https://redis.io/legal/licenses/

### What it is

Official Redis developer GUI/CLI: browse keys, CLI/Workbench, profiler, slow log, database analysis, Redis Streams consumer groups, Redis Copilot. **Not a BullMQ/Bull queue dashboard.** No mention of Bull, BullMQ, job states (waiting/active/failed), or FlowProducer on the pages visited.

### How you connect / whether app code changes are required

No app code. Add a Redis database in the GUI (or auto-discover local unauthenticated standalone Redis). Docker/desktop/K8s/EC2 install options. https://redis.io/insight/

### Auto-discovery? Multi-connection?

Discovers local Redis databases and Redis Cloud/Software subscriptions. Multiple databases can be added. That is **Redis instance** discovery, not BullMQ queue discovery. BullMQ data appears as Redis keys (`bull:<queue>:…`) you would browse manually.

### Alerts?

Not a BullMQ alerting product. Database analysis / slow log are Redis diagnostics.

### MCP / AI?

**Redis Copilot** (chatbot / query builder), not a queue MCP server. https://redis.io/docs/latest/develop/tools/insight/

### Pricing

> “Best of all, it’s 100% free and available on desktop and the Redis Cloud console.”  
> https://redis.io/insight/

Redis legal:

> “Redis Insight and Redis for VS Code are provided under a commercial license to paying Redis customers. Community users and non-paying individuals use these tools under the SSPLv1 license.”  
> Insight ≥ 2.0: **SSPLv1**. Insight < 2.0: separate legacy terms.  
> https://redis.io/legal/licenses/

### License

SSPL v1 (source-available, not OSI open source). https://github.com/redis/RedisInsight

### Strengths and when you'd choose it

- Inspect Redis memory, keys, streams, slow commands.
- Choose it to debug **Redis**, not to operate BullMQ jobs.

### Weaknesses vs a full auto-discovery multi-env dashboard with MCP

- No queue semantics (retry job, pause queue, schedulers, flows).
- No BullMQ monitors.
- Copilot ≠ queue MCP.

### Sources

- https://redis.io/insight/
- https://redis.io/docs/latest/develop/tools/insight/
- https://redis.io/docs/latest/develop/tools/insight/insight-stream-consumer/
- https://github.com/redis/RedisInsight
- https://redis.io/legal/licenses/

### Unverified / could not confirm

- Whether any Redis Insight plugin visualizes BullMQ keys as queues (none documented on official Insight pages).

---

## 9. Upqueue

### Official name + website + GitHub

- **Name:** Upqueue / Upqueue.io
- **Claimed site:** https://upqueue.io/
- **Backup URL indexed by search:** https://upqueue.io/home-backup-30-june/
- **Blog:** https://upqueue.io/blog/why-your-queue-is-quiet-but-not-healthy/
- **Contact in search snippets:** support@upqueue.io

**Live fetch from this research environment failed.** Both `https://upqueue.io/` and `https://upqueue.io/home-backup-30-june/` returned a geo-block page (“SKY88 … not available in your country or region”). There is **no GitHub org** confirmed. Treat all Upqueue marketing claims below as **search-index excerpts**, not independently loaded HTML.

### What it is (from search excerpts of the official-looking backup page)

A hosted BullMQ management/monitoring dashboard: connections, auto-populate queues from Redis, alerts, job management, workers, dashboards, schedulers. Positions as zero-code Redis connect.

### How you connect (search excerpts — quote with caution)

Indexed FAQ:

> “How do I access my queues? Queues are accessible by specifying a Redis connection (Soon we’ll deploy the Upqueue.io connector for seamless integration with private networks or local environments).”

> “Zero-Code Integration — Upqueue.io doesn’t require you to change your codebase… Just connect your Redis instance, and Upqueue.io will automatically detect your queues”

Do not publish these quotes on Durabull pages until someone loads upqueue.io successfully from a non-blocked network and re-copies them.

### Auto-discovery / multi-env / alerts / MCP

Search excerpts described plans of **1 / 5 / 20 connections**, unlimited queues, metrics dashboard, alerts, monitors. **No MCP mentioned.** Connector described as “Soon.”

### Pricing

**No verified dollar prices.** Search snippets mentioned “Affordable Plans” and an “Unlimited” label without numbers. A Reddit post (not official pricing) mentioned a 14-day trial: https://www.reddit.com/r/nestjs/comments/1m78j6s/built_a_bullmq_platform_would_really_love_your/

**Do not put Upqueue prices on comparison pages.**

### License

Unknown (hosted product).

### Strengths / weaknesses

Cannot be honestly compared until the live site loads. If the indexed copy is accurate, it would sit in the Taskforce/Durabull “hosted Redis URL, auto-detect, alerts” bucket, without verified MCP or pricing.

### Sources actually attempted

- https://upqueue.io/ — **failed (geo-block)**
- https://upqueue.io/home-backup-30-june/ — **failed (geo-block)**
- Web search snippets of those URLs (not a substitute for a page load)
- https://upqueue.io/blog/why-your-queue-is-quiet-but-not-healthy/
- https://dev.to/lbd/bullmq-ui-why-bull-board-may-not-be-enough-and-how-upqueueio-helps-1nd (vendor blog, not pricing)

### Unverified / could not confirm

- **Everything commercial:** prices, plan names, connection limits, trial length, TLS, Redis providers, MCP, GitHub, company entity.
- Whether upqueue.io is even still the product domain globally (geo-block content was unrelated gambling branding).

---

## 10. Search log (queries run)

Official and web searches executed for this memo:

- `bull board felixmosh github @bull-board npm`
- `bee-queue arena bull-arena github documentation`
- `taskforce.sh pricing BullMQ dashboard official`
- `getworkbench.com workbench bullmq dashboard`
- `BullMQ Pro Taskforce Pro official documentation pricing`
- `bull-monitor s-r-x github npm`
- `bullmq dashboard github UI alternative`
- `Redis Insight official GUI Redis queue monitoring`
- `upqueue bullmq official site`
- `upqueue.io pricing official` / `site:upqueue.io pricing`
- `queuedash bullmq dashboard official site pricing`
- `bullstudio.dev github pricing dashboard`
- `site:docs.bullmq.io bullmq pro pricing subscription`
- `site:docs.taskforce.sh MCP model context protocol`
- `Product Hunt bullmq dashboard bull board alternative`
- `npm bullmq-ui bullmq-dashboard github`
- `Redis Insight GitHub license free download official`
- `site:getworkbench.dev MCP auto-discovery maxQueues environments`
- `site:docs.taskforce.sh connector Redis URL nothing to install application`
- `site:getworkbench.dev desktop macOS connections environments multiple redis`
- `github bullmq dashboard bullpane muleta queuedash bullmq-ui stars`
- `github nestjs bull-board redis-commander another-redis-desktop-manager bullmq ui`
- `bullstudio cloud pricing $ per month Pro Enterprise`
- GitHub repo search: `bullmq dashboard OR bull-board OR bullmq-ui OR bull-monitor` (very noisy; includes the BullMQ library itself)

---

## Marketing guidance (facts only)

**Closest like-for-like competitors to “auto-discovery + multi-env + MCP”:**

1. **Taskforce.sh** — hosted/on-prem, auto-discovery, connections as environments, alerts, first-party MCP. Publish their **current** $19.95 / $49.95 / $99.95 figures with date + URL.
2. **Bullpane Pro** — self-hosted, unlimited connections (vendor claim), Pro MCP at **$39/mo per install**. Free tier has no login/MCP.
3. **Workbench** — OSS MCP + optional auto-discovery, but **one Redis**, **maxQueues default 100**, Docker wants named queues, no org multi-env.
4. **QueueDash hosted** — multi-env exists, but **SDK attach**, job quotas, queue caps; MCP not found.
5. **Bullstudio cloud** — workspaces/envs in docs; **no public $**; MCP not found.

**Do not call these “Taskforce alternatives” without the caveats above:** Bull Board (embed), Arena (named queues), Redis Insight (not BullMQ), bull-monitor (archived), BullMQ Pro (library).

**Workbench-specific FAQ for comparison pages:**

- *Does it require registering queues in application code?* **Sometimes.** Embedded default is `queues: [Queue]`. Passing `redis` enables SCAN-style discovery. Docker uses `QUEUE_NAMES`. macOS app uses a Redis URL.
- *How many queues?* Auto-discovery **default cap 100** (`maxQueues`). Not an advertised unlimited hosted plan.
- *Multi-env?* **Not documented** as a first-class multi-connection workspace.

**Never publish without re-checking on the day of launch:** Taskforce prices, QueueDash limits, Bullpane Pro price, BullMQ Pro price (still hidden), Upqueue anything, Bullstudio cloud dollars.

---

## Durabull comparison hygiene

Durabull’s own docs (not competitors) already claim Redis-key discovery (`<prefix>:*:meta`), multiple connections, alerts, and MCP — see `apps/docs/content/documentation/workflows/queues-dashboard.mdx` and `docs/marketing/landing-page-ai-prompt.md`. When writing vs-pages:

- Contrast **embed-in-app** (bull-board, Arena, default Workbench, nestjs-bullpen) vs **point at Redis** (Taskforce, Bull Board CLI, Workbench `redis`/`desktop`, Bullstudio standalone, muleta Docker, Bullpane, Durabull).
- Contrast **SDK telemetry** (QueueDash hosted) vs **Redis inspection**.
- Quote competitor prices only from URLs in this file, with access date.
- Do not claim Product Hunt awards.
- Do not use the unofficial $95 / $139 BullMQ Pro figures.
