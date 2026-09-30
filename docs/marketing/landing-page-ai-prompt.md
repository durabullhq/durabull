# AI prompt: Durabull landing page

Create a landing page for Durabull, a BullMQ operations dashboard. Write for backend engineers,
platform teams, and operators who need to inspect jobs and respond to queue failures.

## Deliverables

- Provide section headings, concise copy, and CTA labels for hero, features, deployment, pricing,
  FAQ, and a final CTA.
- Use a technical, approachable tone. Explain the operator's benefit before listing features.
- Suggest screenshot placements using placeholders; use verified product screenshots when available.
- Link **Start Free** to the hosted signup and **Read the docs** to the documentation.

## Supported capabilities

Use these guides as the source of truth. Check current implementation before adding claims.

| Capability | Source |
| --- | --- |
| Queue discovery and health counts | [Queues Dashboard](../../apps/docs/content/documentation/workflows/queues-dashboard.mdx) |
| Inspect payloads, logs, stack traces; edit, retry, invoke, remove jobs | [Job Lifecycle](../../apps/docs/content/documentation/workflows/job-lifecycle-and-debugging.mdx) |
| Pause, resume, clean, purge, delete, obliterate | [Queue Operations](../../apps/docs/content/documentation/workflows/queue-operations.mdx) |
| Cron and interval schedulers | [Scheduled Jobs](../../apps/docs/content/documentation/workflows/scheduled-jobs.mdx) |
| Worker topology and connection-wide analytics | [Workers](../../apps/docs/content/documentation/workflows/workers-topology.mdx), [Metrics](../../apps/docs/content/documentation/workflows/bullmq-native-metrics.mdx) |
| Redis key inspection and health alerts | [Key Explorer](../../apps/docs/content/documentation/workflows/redis-key-explorer.mdx), [Health Alerts](../../apps/docs/content/documentation/workflows/redis-health-alerts.mdx) |
| Email, webhook, and Linear alert delivery | [Webhooks](../../apps/docs/content/documentation/integrations/webhooks.mdx), [Linear](../../apps/docs/content/documentation/integrations/linear.mdx) |
| Organizations, invitations, Redis connections | [Organizations](../../apps/docs/content/documentation/getting-started/authentication-and-organizations.mdx), [Connections](../../apps/docs/content/documentation/getting-started/connection-management.mdx) |
| Cloud, self-hosted, desktop, and authless deployment | [Deployment Modes](../../apps/docs/content/documentation/deployment/cloud-vs-self-hosted.mdx), [Desktop](../../apps/docs/content/documentation/getting-started/desktop-apps.mdx) |
| HTTP API and scoped MCP tools | [HTTP API](../../apps/docs/content/documentation/reference/http-api.mdx), [MCP](../../apps/docs/content/documentation/integrations/mcp-server.mdx) |

## Accuracy constraints

- Queue and job inspection connects directly to Redis without a worker SDK. Throughput charts
  require BullMQ metrics enabled on workers; do not promise every feature needs zero code changes.
- ELv2 is source-available. Link the [license](../../LICENSE); do not call it OSI-approved open source.
- The API and browser process job data for inspection. Self-hosting keeps that processing within
  the operator's deployment. Redis transport uses TLS only with `rediss://`.
- Built-in sanitized Durabull usage telemetry and optional operator-configured PostHog are separate;
  use the [telemetry policy](../../apps/docs/content/documentation/getting-started/environment-variables.mdx).
- PGlite persists on disk. Authless mode needs private network controls; its MCP bearer token
  does not protect the web UI or REST API.
- Purge and delete require queue-name confirmation; obliterate does not. Do not describe every
  destructive action as guarded. Purge excludes `waiting-children` and does not remove schedulers.
- Worker activity is a Redis connectivity heuristic. Linear mappings reduce duplicates but do
  not guarantee exactly-once issue creation.
- Webhooks can feed Slack or PagerDuty through middleware; do not claim native integrations.
- Verify current pricing, usage limits, supported versions, support terms, and release status
  before publication. Do not invent future prices, SLAs, compatibility guarantees, or MCP GA approval.
- Use the [public roadmap](https://durabull.io/roadmap) for planned work and preserve its horizon.
  Do not present planned features as shipped or invent delivery dates.
- Include testimonials, customer logos, performance numbers, and company history only when verified.

## Page structure

1. Hero: what Durabull does, who it helps, and signup/documentation links.
2. Features: three to five focused sections, each with a benefit, a few capabilities, and a screenshot.
3. Deployment: cloud, Docker/source, and desktop options, with links to setup guides.
4. Pricing: currently published terms and a signup CTA.
5. FAQ: short answers derived from the guides, without repeating the feature catalog.
6. Final CTA: connect Redis and start inspecting queues.

Product: https://durabull.io · Documentation: https://durabull.io/documentation
