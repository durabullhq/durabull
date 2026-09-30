# AI Prompt: Generate a High-Converting Durabull Marketing Landing Page

Use this prompt with an AI copywriter or landing-page generator to produce marketing copy grounded in Durabull's product, docs, and codebase.

---

## Your role

You are a senior B2B SaaS copywriter and conversion-focused landing page designer. Create a **single long-form marketing landing page** for **Durabull** — a modern operations platform for **BullMQ** (Node.js background jobs on Redis).

**Goal:** Maximize signups and "Start Free" clicks from engineering leaders, backend engineers, and platform/SRE teams who run BullMQ in production.

**Output requirements:**

- Write complete page copy (hero → features → social proof → deployment options → pricing → FAQ → final CTA).
- Propose section structure, headlines, subheads, bullet copy, and CTA button labels.
- Suggest where product screenshots would go (use placeholder labels; do not invent fake metrics).
- Tone: confident, technical, operator-friendly — not hypey or enterprise-buzzword soup.
- Audience literacy: They know Redis, BullMQ, workers, queues, cron/repeat jobs, and on-call incidents.
- Do **not** claim features that are only on the roadmap unless labeled "Coming soon."
- Emphasize **zero code changes** to existing BullMQ workers as a primary hook.

---

## Product identity (what Durabull is)

**Durabull** is **the modern dashboard for BullMQ** — a source-available BullMQ operations platform for teams that need **visibility, control, and fast incident response** over background jobs.

**One-line pitch:**

*Monitor queues, inspect jobs, debug failures, manage schedulers, visualize workers, and operate across Redis environments — without digging through Redis internals.*

**Category:** BullMQ admin UI / queue operations / background job observability (alternative to ad-hoc Redis CLI, Bull Board, or building internal tooling).

**Built by:** Engineers who run job queues daily; positioned as **community-first**, not a VC-maximized profit play.

**License:** Elastic License 2.0 (ELv2) — source-available and self-hostable; do not describe ELv2 as an OSI-approved open-source license.

**Website:** https://durabull.io

**Hosted app:** Cloud signup

**Documentation:** https://durabull.io/documentation

---

## What makes Durabull special (differentiators to lead with)

Use these as **primary conversion angles**:

1. **Zero integration tax**
   Connects directly to Redis and reads BullMQ data structures. **No changes to existing queue/worker code.** Point at Redis and go.

2. **Incident-first UX**
   Designed for **on-call speed**: failed jobs → stack traces → logs → retry/remove/invoke in one flow, with queue name confirmation for purges and deletes. Describe obliteration separately because it lacks those safeguards.

3. **Fleet-level intelligence, not just per-queue tabs**
   **Fleet Analytics** aggregates cross-queue health: throughput trends, backlog pressure, failure rates, worker capacity signals, scheduler risk, and a fleet health score — using **BullMQ-native metrics** (no separate metrics database).

4. **BullMQ-native telemetry**
   Charts pull directly from BullMQ APIs (`getMetrics`, job counts, worker counts, pause state, rate limits, etc.). Enable with `metrics.maxDataPoints` on workers — Durabull does not run a custom metrics pipeline.

5. **Proactive alerting that meets teams where they work**
   Background alert monitor (not only when someone has the UI open). Routes to **email**, **signed webhooks** (Slack/PagerDuty/automation via middleware), and **Linear** (OAuth, deduped job→issue mapping).

6. **Deploy your way**
   - **Hosted cloud** (fastest time to value)
   - **Self-hosted** (Docker, full control, private network)
   - **Native desktop** (Apple Silicon macOS, Windows, Homebrew cask)
   - **Authless mode** for trusted local/private environments (Postgres or PGlite persistence)

7. **Multi-connection, multi-environment**
   Manage production, staging, and dev Redis instances from one org-scoped dashboard.

8. **Team-ready when you need it**
   Organizations, invitations, OAuth (Google/GitHub), role context — without forcing complexity for solo devs.

9. **Honest pricing philosophy**
   Use the currently published pricing and limits. Verify them before publication; do not promise future prices or unlimited usage.

10. **Privacy-conscious operations**
    Job data is read from **your Redis** and processed by the API and browser for inspection. Self-host when that processing must stay in your infrastructure. The built-in Durabull usage telemetry excludes Redis URLs, queue names, job data, logs, and emails; optional operator-configured PostHog is a separate analytics integration.

---

## Target audiences (write separate benefit lines for each)

| Persona | Pain | Durabull promise |
|--------|------|------------------|
| **Backend engineer** | Debugging failed jobs via logs/Redis manually | One UI for job payload, attempts, logs, stack traces, retry |
| **Platform / SRE** | No fleet-wide view of queue pressure | Fleet Analytics + worker topology + stall/failure alerts |
| **Eng manager / lead** | Incidents lack accountability | Linear issues from alerts; webhook routing to existing tools |
| **Security-conscious org** | SaaS can't see job data | Self-host, authless behind VPN, env-driven connections |
| **Solo founder / indie** | Bull Board feels limited | Dashboard, desktop app, and self-hosting |

---

## Core feature catalog (use for detailed sections)

Organize the landing page into **feature pillars** with 2–4 bullets each.

### 1. Unified Queue Command Center

- Connection-scoped **Queues Dashboard** with live counts: waiting, active, delayed, completed, failed, paused.
- Queue discovery via BullMQ meta keys (`<prefix>:*:meta`), with `bull` as the default prefix.
- Drill-down from fleet view → queue → jobs in seconds.
- Empty-state guidance when no BullMQ queues are found (wrong connection vs empty Redis).

### 2. Job Lifecycle & Debugging

- Paginated job lists with **status** and **job name** filters.
- **Job detail**: payload, options, progress, attempts, return value, failure reason, timestamps.
- **Logs tab** with structured parsing/highlighting when workers emit recommended formats:
  - `[timestamp] [LEVEL] [CONTEXT] message | key=value`
  - Level badges, context tags, key/value coloring, search, long-line truncation.
- **Stack traces** (paginated from job hash).
- Actions: **retry failed**, **remove**, **invoke delayed now**, **add job**; bulk ops capped at 100 IDs per request.
- Repeat/scheduled job removal nuance: option to remove scheduler to stop future runs.

### 3. Queue Operations (safe production controls)

- **Pause / resume** queue.
- **Clean** by status with grace period and limits.
- **Purge** (multi-status or `all`) — requires typing **exact queue name** to confirm.
- **Delete queue** uses a preflight check. **Obliterate** is a separate destructive endpoint without the delete preflight or queue-name confirmation.
- Explain which actions have confirmation and which require the operator to stop producers, schedulers, and workers first.

### 4. Scheduled Jobs (cron & intervals)

- Global scheduled jobs view across queues.
- Per-queue scheduler workspace: create/edit/remove.
- Supports cron + timezone, fixed intervals (`every` ms), start/end dates, run limits, template options (attempts, priority, backoff, retention).
- JSON payload editor with formatting shortcuts.
- Surfaces next run, recent failures, scheduler metadata.

### 5. Workers Topology

- Visual graph: Redis → queues → workers.
- Worker active/idle classification (idle threshold ~5s).
- Detect "waiting jobs but no workers" and post-deploy registration issues.
- Queue rollups: worker count, pause state, active/waiting counts.

### 6. Fleet Analytics (flagship differentiator)

Cross-queue operational intelligence per Redis connection:

- Selectable time windows; auto-refresh while tab visible.
- **Fleet health score** and health tone.
- Throughput series: completed/failed/finished per minute, peak rates, success/failure rates in window.
- Backlog charts (waiting vs active by queue).
- Failure rate charts and **top risk queues**.
- Worker state breakdown: active / warm / stale; top idle workers.
- Scheduler insights: total schedules, failing schedules, next-24h load.
- Warning signals and insights (actionable rows).
- Filter/sort: health, backlog, failures, throughput; "show only risky" toggle.
- Built from BullMQ-native metrics + scheduled job data — **no extra metrics DB**.

### 7. BullMQ Native Telemetry (per queue)

- On queue detail: native telemetry section.
- Requires workers configured with `metrics.maxDataPoints` (or `MetricsTime` constants).
- Pulls completed/failed metric buckets, job counts, concurrency, paused/maxed/rate-limited state, workers, schedulers, global concurrency, etc.

### 8. Redis Key Explorer

- SCAN-based pattern search with pagination.
- Type-aware value inspection: string (JSON attempt), hash, list, set, zset, stream.
- TTL and memory usage hints.
- **Blocks deletion of `bull:` / `bullmq:` keys** — BullMQ internals must be managed via queue/job APIs.

### 9. Alerts & Notifications (proactive operations)

**Alert rule types:**

- **Failure threshold** — sudden spike (e.g. "25 failures in 5 minutes").
- **Failure rate** — quality degradation with min sample size (e.g. ">12% over 15 min with 250+ jobs").
- **Queue stalled** — jobs waiting but no completions for N minutes.
- **Job failed** — per-failed-job routing (especially for Linear dedupe).

**Notification channels (per rule, up to 10 routes):**

- **Email**
- **Webhook** — versioned JSON (`schemaVersion: 1`), HMAC signing optional, idempotency headers, dashboard/job/mute links in payload (no full job payloads in webhooks).
- **Linear** — OAuth integration; creates issues for alert events; **one Linear issue per failed job** with durable mapping to prevent duplicates.

**Operator features:**

- Alert rule builder with examples per type.
- Test webhook / test delivery flows.
- Global alerts view across connections.
- Background alert monitor polls Redis/BullMQ independently of active UI sessions.

### 10. Team & Organizations

- Multi-tenant **organizations** with slug-scoped routes.
- **Invitations** (accept → sign-in/sign-up → org activation).
- OAuth: Google, GitHub; account linking in settings.
- Team management UI for members.

### 11. Connections & Environments

- Multiple Redis connections per org.
- **DB-managed connections** (UI CRUD) or **env-driven connections** (`DURABULL_REDIS_URL_*`, read-only in UI) for reproducible deploys.
- Connection troubleshooting docs positioning.

### 12. Deployment modes (technical buyers care)

| Mode | Best for |
|------|----------|
| **Durabull Cloud** | Fastest onboarding, no infra ops |
| **Self-hosted Docker** | Private network, custom security |
| **Desktop app** | Local-first, encrypted saved Redis URLs, bundled Bun API + web UI |
| **Authless** | Trusted LAN/VPN; auto local org |
| **Postgres** | Full team persistence |
| **PGlite** | Persistent local database without a PostgreSQL service |

**Desktop specifics:**

- Apple Silicon macOS (.dmg), Windows installer/portable zip, Homebrew: `brew install --cask durabullhq/tap/durabull`
- Electron shell around production web + API; local defaults: authless, PGlite in userData.

### 13. HTTP API

- Full REST API under `/api` for connections, queues, jobs, schedulers, workers, redis-keys, alerts, auth, telemetry status.
- Useful for automation and integrators (mention "API-ready" without dumping endpoint lists on the landing page).

### 14. MCP for AI-assisted operations (position carefully)

Durabull implements an **MCP server** at `{APP_BASE_URL}/mcp` (same origin as API), with scoped OAuth bearer tokens, diagnostic tools, resources, prompts, and explicitly scoped write tools such as retry, promote, pause, and resume. Destructive queue/job removal is not exposed over MCP. See the current tool catalog in the documentation.

**Landing page guidance:** Separate implemented capabilities from rollout status. Confirm the MCP release checklist and operator approval before making a general-availability claim.

---

## Roadmap items (label "Coming soon" only)

From public roadmap — do **not** present as shipped:

- Role-based access controls
- Saved views and filters
- Slack notifications (native)
- Plugin marketplace
- Advanced audit logging

**Now / recently emphasized (safe to mention as current focus):**

- Latency improvements for large queues
- Queue health alerts, webhooks
- Faster job replays

---

## Pricing & commercial positioning

- Verify current prices, beta status, usage limits, and support terms against the published product page before writing copy.
- Do not promise future pricing, unlimited usage, or paid support that has not been announced.
- Source is available on GitHub under ELv2; self-hosting is supported within the license terms.

**Primary CTA:** "Start Free" → hosted signup

**Secondary CTAs:** "Read Documentation", "Download macOS App", "Self-Host with Docker", "View on GitHub"

---

## Trust, security & compliance talking points

- TLS connections to Redis when configured with `rediss://`; saved Redis URLs are encrypted at rest.
- **Does not store job payloads** in Durabull's database for display purposes — reads from your Redis.
- Purge and delete require queue name confirmation; obliteration has no equivalent preflight or confirmation.
- Blocks raw deletion of `bull:` and `bullmq:` Redis keys. Custom prefixes are not covered by this safeguard.
- Authless mode warning: only for private/trusted networks.
- Verify compatibility claims against the tested BullMQ version. Job Scheduler features require BullMQ versions that implement those APIs.
- Telemetry transparency: anonymous usage telemetry in production/self-hosted; no Redis URLs, queue names, job data, logs, PII in telemetry payload.

---

## Competitive positioning (subtle, no trash-talk)

Durabull vs. **Bull Board / DIY scripts**:

- Deeper incident workflows (logs, stack traces, fleet analytics, alerts, Linear).
- Team/org model and cloud + desktop + self-host.
- Scheduler management and worker topology visualization.
- Production safety on destructive ops.

Do **not** name competitors aggressively; speak to "scattered tools" and "built for production operators."

---

## Visual & brand direction for the page

- **Aesthetic:** Dark, modern, developer-tool — emerald/teal accent on deep slate/black (think Vercel/Linear meets ops dashboard).
- **Motifs:** Grid backgrounds, subtle aurora/glow, glassy cards, gradient headline accent on key phrase.
- **Hero visual:** Overlapping screenshots — **Fleet Analytics throughput** + **Fleet Analytics dashboard** (primary), floating callouts: "Failure Replay", "Scheduled Control", "Fleet Throughput".
- **Screenshot carousel topics:** Queue overview, scheduled jobs, failure debugging, job inspection, live logs, fleet analytics overview, fleet throughput trends.
- **Trust chips:** Live Queue Telemetry, Fleet Analytics Insights, Incident-Ready Visibility, Self-Hosted or Managed Rollout.
- **Motion:** Subtle scroll parallax on hero (optional); respect reduced motion.

---

## Recommended landing page structure (conversion-optimized)

1. **Nav:** Product, Features, Pricing, Docs, GitHub, Sign in, **Start Free** (primary button).
2. **Hero:** Headline + subhead + dual CTA + desktop availability strip + 4 trust signals + hero screenshots.
3. **Logo strip / social proof** (if available — otherwise "Built for teams running BullMQ in production" + beta badge).
4. **Problem → Solution:** "Your queues fail silently until someone checks Redis."
5. **Feature bento grid** (7 panels mirroring marketing site):
   - Unified Queue Command Center
   - Failure Analysis with Full Context
   - Cron Visibility That Scales
   - Worker and Connection Awareness
   - Redis Insight Without Guesswork
   - Throughput Trends Across Queues
   - Developer-First Security Posture
6. **Deep dive: Fleet Analytics** (full-width section with 3 bullets + screenshot).
7. **Deep dive: Incident workflow** (failed job → logs → retry → alert → Linear issue).
8. **Deep dive: Scheduled jobs & workers** (two columns).
9. **Alerts & integrations** (email, webhook, Linear diagram).
10. **Deploy your way** (Cloud | Self-hosted | Desktop | Authless) — comparison cards.
11. **Zero code changes** — 3-step "Connect Redis → See queues → Fix failures".
12. **Source & community** — ELv2, GitHub, contribution guide.
13. **Pricing** — current published plans and limits, verified before publication.
14. **FAQ** (see FAQ data below).
15. **Final CTA:** "Ready to roll out Durabull your way?" + benefits list (cloud, native apps, Homebrew, self-host docs).

---

## Copy constraints & words to use

**Use:** clarity, control, incidents, on-call, throughput, backlog, workers, schedulers, fleet, native metrics, zero integration, source-available, self-host, community.

**Avoid:** "revolutionary", "AI-powered" (except MCP strip), "enterprise-grade" without substance, claiming SOC2/ISO unless verified.

**Keywords for SEO (weave naturally):** BullMQ dashboard, BullMQ monitoring, Redis queue admin, background job debugging, queue operations, job queue observability, self-hosted BullMQ UI.

---

## FAQ data (verbatim-friendly)

Include these answers in the FAQ section:

1. **What is Durabull?** Modern dashboard for BullMQ: monitoring, debugging, workers, team collaboration, developer-focused UI.
2. **Code changes?** None — connects to Redis, reads BullMQ structures.
3. **Data security?** Redis remains the source of job data. The API and browser read payloads for inspection. TLS is available with `rediss://`; self-host to keep processing in your infrastructure.
4. **Multiple Redis?** Yes — prod/staging/dev in one place.
5. **Pricing?** Use current published pricing and limits; make no promise about future prices.
6. **Install?** Hosted web, desktop (macOS/Windows/Homebrew), Docker, source.
7. **Authless?** Yes; Postgres or PGlite; not for public internet.
8. **BullMQ versions?** Verify the tested version and required APIs before claiming a minimum supported version.

---

## Deliverables from you (the AI)

1. Full landing page markdown or HTML section copy.
2. 5 headline variants for A/B testing (hero).
3. Meta title + meta description (155 chars).
4. 3 testimonial-style quotes (clearly labeled **illustrative** unless real quotes provided).
5. Microcopy for all buttons and form labels.
6. Alt text for each screenshot placeholder.
7. One short "For engineering leaders" paragraph and one "For platform teams" paragraph.

---

## Do not invent

- Customer logos, revenue numbers, uptime SLAs, or named enterprise customers.
- Features not listed above (e.g. native Slack app, RBAC) unless marked **Coming soon**.
- Claims that Durabull stores or analyzes full job payloads in the cloud database.

---

## Reference URLs

- Product site: https://durabull.io
- Docs: https://durabull.io/documentation
- Signup: hosted web app `/signup`
- GitHub: durabullhq/durabull (source-available under ELv2)
- Contact: hello@durabull.io
