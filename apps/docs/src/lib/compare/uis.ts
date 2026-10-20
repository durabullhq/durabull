import { MCP_FACTS } from '@/lib/mcp-facts'
import type { Competitor } from './types'

const sharedRows = {
  inspect: 'Inspect payloads, logs, stack traces; retry, promote, pause from the dashboard',
  mcp: `Hosted MCP with OAuth, ${MCP_FACTS.tools} tools, redaction, opt-in writes`,
  price: 'Hosted app is free to start. Self-host under Apache-2.0.',
  multi: 'Many Redis connections per org, grouped by environment',
  discover: 'Redis SCAN for `<prefix>:*:meta`. No app SDK for inspection.',
} as const

export const uiCompetitors: Competitor[] = [
  {
    slug: 'bull-board',
    name: 'Bull Board',
    shortName: 'Bull Board',
    website: 'https://github.com/felixmosh/bull-board',
    category: 'bullmq-ui',
    oneLiner: 'MIT dashboard with embedded adapters and a standalone Redis-discovery CLI.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Bull Board',
    description:
      'Compare Bull Board’s embedded and standalone BullMQ dashboards with Durabull: Redis discovery, team access, alerts, hosting, and MCP.',
    keywords: [
      'Bull Board alternative',
      'bull-board vs Durabull',
      '@bull-board',
      'BullMQ dashboard',
      'best BullMQ UI',
    ],
    alternativesTitle: 'Bull Board alternatives',
    alternativesDescription:
      'Compare Bull Board alternatives by team access, alert delivery, deployment model, and MCP. Bull Board already offers standalone Redis discovery.',
    intro:
      'Bull Board is an MIT dashboard for Bull and BullMQ. Embed it in a server with Queue adapters, or use its standalone CLI to discover queues from Redis. Durabull adds a shared workspace for connections, teams, alerting, and MCP; both can inspect and retry existing jobs.',
    howItConnects:
      'The documented embed path installs `@bull-board/api` plus a server adapter, then `createBullBoard({ queues: [new BullMQAdapter(emailQueue)] })`. The CLI and Docker path skip that: `npx @bull-board/cli -r redis://localhost:6379` scans Redis for `<prefix>:<queue>:meta` / `<prefix>:<queue>:id` keys and rescans every 10 seconds. CLI takes one Redis URL.',
    codeChanges:
      'Embed: yes. Every queue you want to see must be constructed and passed to the board. NestJS `forFeature` also registers each queue by name or instance. CLI/Docker: no app change, one Redis, optional basic auth.',
    autoDiscovery:
      'CLI/Docker: yes, SCAN under configured prefixes (default `bull`). `--queues` turns discovery off. Embed: no discovery. PostgreSQL-backed BullMQ v6 queues are not discoverable via CLI.',
    multiEnv:
      'The CLI targets one Redis deployment, with multiple prefixes supported. Embedded Queue instances can use different connections, and separate dashboards can share one server. You implement connection configuration and access control in your application.',
    alerts:
      'No built-in notification delivery. Official recipes show how to add alerts with BullMQ worker events or QueueEvents. Optional historical metrics are separate from alerting.',
    mcp: 'No official MCP server. The board exposes a JSON HTTP API with an OpenAPI description, and the docs include an AI-agent setup guide for scripting against it.',
    pricing: 'MIT, free. No paid tier on GitHub, npm, or the docs site.',
    license: 'MIT.',
    whenToChooseThem:
      'Choose Bull Board when you already have a Node server, you are fine registering queues in that process, and you want a free in-process UI with no extra service. The CLI is also a reasonable one-shot look at a single Redis.',
    whenToChooseDurabull:
      'Choose Durabull when queues live across staging and production Redis instances, you do not want to change application code just to get a UI, you need alerts, or you want Claude, ChatGPT, or Codex to inspect and retry jobs through MCP.',
    rows: [
      {
        feature: 'See queues',
        durabull: sharedRows.discover,
        competitor: 'Embed: register adapters. CLI: SCAN one Redis.',
      },
      {
        feature: 'App code change',
        durabull: 'Not for inspection',
        competitor: 'Required for the embed path',
      },
      {
        feature: 'Environments',
        durabull: sharedRows.multi,
        competitor: 'CLI: one deployment. Embed: configured Queue connections',
      },
      {
        feature: 'Alerts',
        durabull: 'Email, signed webhooks, Linear',
        competitor: 'Custom worker / QueueEvents integration',
      },
      {
        feature: 'MCP',
        durabull: sharedRows.mcp,
        competitor: 'No MCP server; JSON HTTP API (OpenAPI)',
      },
      {
        feature: 'Job ops',
        durabull: sharedRows.inspect,
        competitor:
          'Retry, promote, remove, clean, pause/resume, edit job data, add jobs, run schedulers',
      },
      { feature: 'Price', durabull: sharedRows.price, competitor: 'Free (MIT)' },
    ],
    faqs: [
      {
        question: 'Is Durabull a Bull Board alternative?',
        answer:
          'Yes. Both inspect and manage existing BullMQ jobs. Bull Board offers an MIT embed and standalone discovery CLI; Durabull offers a shared workspace with connection management, alert delivery, and hosted MCP. Choose based on hosting and team requirements.',
      },
      {
        question: 'Does Bull Board auto-discover queues?',
        answer:
          'The CLI and Docker image do: they scan Redis for Bull and BullMQ meta keys. The embed path does not. You pass each Queue adapter in application code.',
      },
      {
        question: 'Does Bull Board have an MCP server?',
        answer:
          'No. Bull Board does not ship an MCP server. It exposes a JSON HTTP API (with an OpenAPI description) and documents how to point AI agents at it; Durabull provides a hosted MCP endpoint with OAuth scopes.',
      },
    ],
    sources: [
      { label: 'Bull Board GitHub', url: 'https://github.com/felixmosh/bull-board' },
      {
        label: 'Getting started',
        url: 'https://felixmosh.github.io/bull-board/guide/getting-started',
      },
      { label: 'CLI discovery', url: 'https://felixmosh.github.io/bull-board/guide/cli' },
      {
        label: 'Multiple dashboards',
        url: 'https://felixmosh.github.io/bull-board/recipes/multiple-dashboards',
      },
      { label: 'Alerting recipe', url: 'https://felixmosh.github.io/bull-board/recipes/alerting' },
    ],
    related: ['arena', 'workbench', 'taskforce', 'queuedash'],
  },
  {
    slug: 'arena',
    name: 'Arena',
    shortName: 'Arena',
    website: 'https://github.com/bee-queue/arena',
    category: 'bullmq-ui',
    oneLiner: 'Express GUI for Bee, Bull, and BullMQ. You name every queue in config.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Arena (bull-arena)',
    description:
      'Arena is an Express UI for Bee Queue, Bull, and BullMQ that needs each queue named in config. Durabull discovers BullMQ queues from Redis and adds MCP.',
    keywords: ['bull-arena alternative', 'Arena vs Durabull', 'Bee Queue dashboard', 'BullMQ UI'],
    alternativesTitle: 'Arena alternatives',
    alternativesDescription:
      'Alternatives to Arena (bull-arena) if you have outgrown naming every queue in an Express config and need BullMQ discovery, alerts, or an MCP server.',
    intro:
      'Arena (npm `bull-arena`) is an Express GUI for Bee Queue, Bull, and BullMQ, originally built by Mixmax and now maintained in the `bee-queue` GitHub organization (latest release v4.10.0, July 2026). It remains useful for mixed Bee/Bull estates. The README still describes BullMQ support as “preliminary.”',
    howItConnects:
      'You construct `Arena({ BullMQ: Queue, queues: [{ type: "bullmq", name, hostId, redis }] })`. The `name` must match the BullMQ queue exactly. Standalone and Docker still use that config. Fetching names from AWS yourself is custom code, not built-in discovery.',
    codeChanges:
      'Queue configuration is required: each entry specifies its name and hostId. A standalone Arena service can hold this configuration without modifying worker code.',
    autoDiscovery: 'None. `hostId` only groups hosts in the UI.',
    multiEnv:
      'You can point queue objects at different Redis hosts. You still enumerate every queue. There is no organization or environment product.',
    alerts: 'Not in the documented feature list (health glance, pagination, retry).',
    mcp: 'Not documented.',
    pricing: 'MIT, free.',
    license: 'MIT.',
    whenToChooseThem:
      'Choose Arena when you already run Bee Queue alongside Bull, you know every queue name, and an Express mount is enough.',
    whenToChooseDurabull:
      'Choose Durabull for BullMQ fleets you do not want to enumerate by hand, for staging/production in one org, and for agent access through MCP. Durabull does not manage Bee Queue.',
    rows: [
      {
        feature: 'Queues supported',
        durabull: 'BullMQ',
        competitor: 'Bee, Bull, BullMQ (BullMQ still labeled preliminary)',
      },
      {
        feature: 'See queues',
        durabull: sharedRows.discover,
        competitor: 'Name each queue in config',
      },
      {
        feature: 'Environments',
        durabull: sharedRows.multi,
        competitor: 'Manual host list, no org model',
      },
      {
        feature: 'Alerts',
        durabull: 'Email, signed webhooks, Linear',
        competitor: 'Not documented',
      },
      { feature: 'MCP', durabull: sharedRows.mcp, competitor: 'Not documented' },
      { feature: 'Price', durabull: sharedRows.price, competitor: 'Free (MIT)' },
    ],
    faqs: [
      {
        question: 'Does Arena auto-discover BullMQ queues?',
        answer:
          'No. The README requires `name` and `hostId` on every queue object. The name must match the BullMQ queue exactly.',
      },
      {
        question: 'Is Arena still maintained for BullMQ?',
        answer:
          'The README describes BullMQ support as preliminary. That wording alone does not establish maintenance status or compatibility with your version; review releases and test the queue operations you need.',
      },
    ],
    sources: [
      { label: 'Arena GitHub', url: 'https://github.com/bee-queue/arena' },
      { label: 'npm bull-arena', url: 'https://www.npmjs.com/package/bull-arena' },
    ],
    related: ['bull-board', 'workbench', 'taskforce'],
  },
  {
    slug: 'taskforce',
    name: 'Taskforce.sh',
    shortName: 'Taskforce',
    website: 'https://taskforce.sh/',
    category: 'bullmq-ui',
    oneLiner:
      'Hosted dashboard by the BullMQ authors. Auto-discovers queues. Priced per Redis connection. Includes MCP.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Taskforce.sh',
    description:
      'Compare Taskforce.sh and Durabull on BullMQ discovery, alerts, MCP, self-hosting, and price. Taskforce has Slack/PagerDuty today; Durabull has email, webhooks, and Linear, with Slack and PagerDuty coming soon.',
    keywords: [
      'Taskforce.sh alternative',
      'Taskforce vs Durabull',
      'BullMQ dashboard',
      'Taskforce.sh pricing',
      'BullMQ MCP',
    ],
    alternativesTitle: 'Taskforce.sh alternatives',
    alternativesDescription:
      'Explore alternatives to Taskforce.sh by hosting model, team access, alert destinations, MCP support, and Redis connection pricing.',
    intro:
      'Taskforce.sh is the closest commercial peer. The BullMQ authors built it. It connects with a Redis URL or the Taskforce Connector, scans for queues, and includes monitors plus a hosted MCP. The honest question is where you want the control plane to live, and what you pay per Redis.',
    howItConnects:
      'Connect to reachable Redis directly or run taskforce-connector for private infrastructure. No worker SDK is needed. Taskforce’s pricing FAQ says BullMQ v6 queues stored in PostgreSQL are added through the connector; Durabull currently targets Redis-backed queues.',
    codeChanges: 'None in the app. Optional connector process next to Redis.',
    autoDiscovery:
      'Yes. Taskforce scans the Redis database. Missing queues are usually a prefix other than `bull`, or the 40s scan timeout on a huge keyspace.',
    multiEnv:
      'Plans are sold by Redis connections: Starter 1, Growing 5, Enterprise 15. All queues on one instance count as one connection. On-prem claims unlimited connections; list price is unpublished.',
    alerts:
      'Connection, failed jobs, missing workers, max memory, backlog. Email, Slack, or PagerDuty. Monitors default off and must be enabled per connection.',
    mcp: 'Yes. Hosted `https://api.taskforce.sh/mcp`, on-prem `https://<host>/mcp`, bearer `tfa_…`. Agents are org members with roles and an audit log. Hosted limits include 120 requests per 60 seconds per token and up to 3 agents per organization.',
    pricing:
      'Visited 2026-10-20: Starter $19.95/mo (1 connection), Growing $49.95/mo (5), Enterprise $99.95/mo (15). 15-day trial, no card. Yearly: $195 / $495 / $995. On-prem price is not published. BullMQ Pro is a separate subscription and is not included.',
    license: 'Commercial SaaS / on-prem. Connector is separately installable.',
    whenToChooseThem:
      'Choose Taskforce when you want the BullMQ authors’ dashboard, native Slack/PagerDuty monitors, Pro group views, or PostgreSQL-backed BullMQ support through its connector. Taskforce publishes a SOC 2 Type II report, available on request, for procurement review.',
    whenToChooseDurabull:
      'Choose Durabull when you want the same Redis-scan model plus MCP, multiple Redis connections per org, Apache-2.0 source you can self-host, and a hosted app that is free to start. Durabull alerts today are email, signed webhooks, and Linear; Slack and PagerDuty are coming soon.',
    rows: [
      {
        feature: 'See queues',
        durabull: sharedRows.discover,
        competitor: 'Redis SCAN or connector (40s timeout)',
      },
      { feature: 'App code', durabull: 'Not for inspection', competitor: 'None' },
      {
        feature: 'Connections',
        durabull: 'Multiple Redis connections per org',
        competitor: '1 / 5 / 15 on hosted plans',
      },
      {
        feature: 'Alerts',
        durabull: 'Email, signed webhooks, Linear (Slack, PagerDuty coming soon)',
        competitor: 'Email, Slack, PagerDuty',
      },
      {
        feature: 'MCP',
        durabull: sharedRows.mcp,
        competitor: 'Hosted MCP with agent tokens and audit log',
      },
      {
        feature: 'Price',
        durabull: sharedRows.price,
        competitor: '$19.95 / $49.95 / $99.95 per month',
      },
      {
        feature: 'Self-host',
        durabull: 'Docker / source, Apache-2.0',
        competitor: 'Commercial on-prem image; contact sales',
      },
    ],
    faqs: [
      {
        question: 'Does Taskforce.sh include a BullMQ Pro license?',
        answer:
          'No. Taskforce’s own pricing FAQ says a dashboard plan does not include BullMQ Pro. Pro is a separate library subscription.',
      },
      {
        question: 'Does Durabull replace Taskforce.sh?',
        answer:
          'For Redis auto-discovery, job inspection, and MCP, the two compare directly. Taskforce has native Slack/PagerDuty monitors today (Durabull’s are coming soon), a SOC 2 Type II report, and first-party BullMQ Pro group views. Durabull is open source under Apache-2.0 and free to start.',
      },
    ],
    sources: [
      { label: 'Taskforce.sh pricing', url: 'https://taskforce.sh/pricing' },
      { label: 'Taskforce.sh security', url: 'https://taskforce.sh/security' },
      { label: 'Getting started', url: 'https://docs.taskforce.sh/getting-started' },
      {
        label: 'Connector discovery',
        url: 'https://docs.taskforce.sh/getting-started/taskforce-connector',
      },
      { label: 'Monitors', url: 'https://docs.taskforce.sh/monitoring' },
      { label: 'MCP agents', url: 'https://docs.taskforce.sh/agents/' },
    ],
    related: ['bull-board', 'workbench', 'bullpane', 'bullmq-pro'],
  },
  {
    slug: 'workbench',
    name: 'Workbench',
    shortName: 'Workbench',
    website: 'https://getworkbench.dev/',
    category: 'bullmq-ui',
    oneLiner:
      'MIT BullMQ dashboard with Redis discovery, alerts, a desktop app, and local MCP. Discovery limits are configurable.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Workbench (getworkbench)',
    description:
      'Compare Workbench and Durabull for BullMQ discovery, alerts, desktop and hosted access, team workspaces, and local versus hosted MCP.',
    keywords: [
      'Workbench alternative',
      'getworkbench vs Durabull',
      'Workbench BullMQ',
      'bull-board alternative',
    ],
    alternativesTitle: 'Workbench alternatives',
    alternativesDescription:
      'Workbench alternatives for a shared workspace across Redis connections, hosted access, and OAuth-based MCP. Workbench’s discovery cap is configurable.',
    intro:
      'Workbench is an MIT BullMQ dashboard with embedded, standalone, and macOS options. It offers Redis discovery, Slack/Discord/webhook alerts, and a local MCP proxy. The main decision is whether you prefer a dashboard you deploy or a hosted workspace shared across a team.',
    howItConnects:
      'Embed default: `workbench({ queues: [emailQueue] })`. Auto-discovery: pass `redis` instead; `queues` is required unless `redis` is set. `maxQueues` defaults to 100. Docker uses `QUEUE_NAMES` (default `default`), not SCAN. The macOS app takes a Redis URL and auto-discovers. Bull (legacy) is not supported.',
    codeChanges:
      'Embed: you mount Workbench in the app. You either pass Queue instances or a Redis URL. Docker: name the queues. Desktop: no app change.',
    autoDiscovery:
      'Yes when `redis` is set, or on the macOS app. Configurable default cap of 100. Docker standalone lists names in `QUEUE_NAMES`.',
    multiEnv:
      'Published config is one Redis per Workbench process. Docs do not describe a multi-connection environment workspace.',
    alerts:
      'Slack, Discord, generic webhook. Triggers include job_failed, job_stalled, retries_exhausted, failed_backlog, no_workers_with_backlog. Rules live in Redis. Nothing sends until you configure contact points.',
    mcp: 'Yes. `@getworkbench/mcp` is a local stdio proxy to one running dashboard (`WORKBENCH_URL`). Roughly 20 inspect/operate tools (docs list 18; package 0.5.1 ships 23). Not a hosted multi-tenant MCP URL.',
    pricing: 'MIT, free. Vendor blog: no paid tier, no telemetry, no account required.',
    license: 'MIT.',
    whenToChooseThem:
      'Choose Workbench for an MIT dashboard you can embed or open on a Mac, with Slack/Discord/webhook alerts and local MCP. Raise maxQueues when discovery needs to include more than its default 100 queues.',
    whenToChooseDurabull:
      'Choose Durabull when you operate many connections, you do not want to mount a dashboard in the app, or you want Claude, ChatGPT, or Codex to use a hosted MCP URL with OAuth scopes rather than a local proxy.',
    rows: [
      {
        feature: 'See queues',
        durabull: sharedRows.discover,
        competitor: 'queues[] or redis (maxQueues default 100). Docker: QUEUE_NAMES.',
      },
      {
        feature: 'App code',
        durabull: 'Not for inspection',
        competitor: 'Embed mounts in the app; desktop does not',
      },
      {
        feature: 'Environments',
        durabull: sharedRows.multi,
        competitor: 'One Redis per process in published docs',
      },
      {
        feature: 'Alerts',
        durabull: 'Email, signed webhooks, Linear',
        competitor: 'Slack, Discord, webhook',
      },
      {
        feature: 'MCP',
        durabull: sharedRows.mcp,
        competitor: 'Local stdio proxy to one dashboard',
      },
      { feature: 'Price', durabull: sharedRows.price, competitor: 'Free (MIT)' },
    ],
    faqs: [
      {
        question: 'Does Workbench require registering queues in application code?',
        answer:
          'Sometimes. The embed quick start passes `queues: [Queue]`. Passing `redis` enables auto-discovery. Docker wants `QUEUE_NAMES`. The macOS app uses a Redis URL.',
      },
      {
        question: 'How many queues can Workbench auto-discover?',
        answer:
          'The documented default is maxQueues: 100, and you can raise it in configuration. It is a scan-cost setting, not a paid tier or a fixed product limit.',
      },
    ],
    sources: [
      { label: 'Workbench docs', url: 'https://getworkbench.dev/docs' },
      { label: 'Configuration', url: 'https://getworkbench.dev/docs/guides/configuration' },
      {
        label: 'Redis auto-discovery',
        url: 'https://getworkbench.dev/docs/guides/redis-auto-discovery',
      },
      { label: 'MCP package', url: 'https://getworkbench.dev/docs/packages/mcp' },
    ],
    related: ['bull-board', 'taskforce', 'queuedash', 'bullpane'],
  },
  {
    slug: 'queuedash',
    name: 'QueueDash',
    shortName: 'QueueDash',
    website: 'https://www.queuedash.com/',
    category: 'bullmq-ui',
    oneLiner:
      'OSS embed can discover Bull/BullMQ. Hosted product records jobs through an SDK with monthly quotas.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs QueueDash',
    description:
      'QueueDash OSS can discover BullMQ from Redis; its hosted app uses an SDK and bills by recorded jobs. Durabull reads Redis directly, with no job quota.',
    keywords: ['QueueDash alternative', 'QueueDash vs Durabull', 'BullMQ hosted dashboard'],
    intro:
      'QueueDash is two products. The MIT embed can list Queue instances or enable Bull/BullMQ discovery. The hosted app listens through `@queuedash/sdk` and charges for recorded jobs.',
    howItConnects:
      'OSS: mount middleware and pass queues, or `discovery: { type: "bullmq", connectionUrl, prefix }`. Discovery does not cover Bee-Queue, GroupMQ, or Redis Cluster. Hosted: `qd.attach(queue)` in app code. Jobs already in the queue when you attach are not sent. BullMQ 5+. Optional Redis connection on hosted for retry/promote/remove.',
    codeChanges:
      'Hosted: yes, SDK attach. OSS discovery: Redis URL in the dashboard process, no worker SDK for listing, but you still run QueueDash yourself.',
    autoDiscovery:
      'OSS: Bull/BullMQ discovery. Hosted: event stream from the SDK, not a Redis SCAN of existing jobs.',
    multiEnv:
      'Hosted plan caps (2026-10-20): projects 1 / 5 / unlimited; environments per project 1 / 3 / 10; queues per environment 5 / 20 / 100; Redis connections 1 / 5 / unlimited (Free / Pro / Business).',
    alerts:
      'Hosted: failure rate, queue depth, stuck jobs, processing time, and job success checks. Email/webhook on all plans; Slack on Pro/Business.',
    mcp: 'Not documented on the pages reviewed.',
    pricing:
      'OSS free. Hosted 2026-10-20: Free $0 (1,000 jobs/mo), Pro $29 (100,000), Business $99 (1,000,000). History 7 / 30 / 90 days.',
    license: 'MIT (OSS). Hosted is commercial.',
    whenToChooseThem:
      'Choose QueueDash OSS as another embed/discovery UI. Choose hosted if you want SaaS recording of job events and can stay inside the job and queue caps.',
    whenToChooseDurabull:
      'Choose Durabull when you do not want an SDK in the hot path, you already have jobs in Redis you need to see immediately, or you need MCP. Durabull does not bill per recorded job.',
    rows: [
      {
        feature: 'See existing jobs',
        durabull: 'Read Redis now',
        competitor: 'Hosted SDK only sees jobs after attach',
      },
      {
        feature: 'Discovery',
        durabull: sharedRows.discover,
        competitor: 'OSS: optional. Hosted: SDK events.',
      },
      {
        feature: 'Env / queue caps',
        durabull: 'Free to start',
        competitor: 'Per project: 1 / 3 / 10 envs; 5 / 20 / 100 queues per env',
      },
      { feature: 'MCP', durabull: sharedRows.mcp, competitor: 'Not documented' },
      { feature: 'Price', durabull: sharedRows.price, competitor: '$0 / $29 / $99 hosted' },
    ],
    faqs: [
      {
        question: 'Does QueueDash require code changes?',
        answer:
          'The hosted product does: you attach `@queuedash/sdk` to each Queue. The OSS dashboard can discover Bull/BullMQ from a Redis URL instead.',
      },
    ],
    sources: [
      { label: 'QueueDash pricing', url: 'https://www.queuedash.com/pricing' },
      {
        label: 'QueueDash quickstart',
        url: 'https://www.queuedash.com/docs/getting-started/quickstart',
      },
      { label: 'BullMQ integration', url: 'https://www.queuedash.com/docs/integrations/bullmq' },
      { label: 'OSS README', url: 'https://github.com/alexbudure/queuedash' },
    ],
    related: ['bull-board', 'workbench', 'taskforce'],
  },
  {
    slug: 'bullpane',
    name: 'Bullpane',
    shortName: 'Bullpane',
    website: 'https://bullpane.com/',
    category: 'bullmq-ui',
    oneLiner:
      'Self-hosted BullMQ dashboard. Free has no login. Pro adds SSO, alerts, and MCP at $39/mo per install.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Bullpane',
    description:
      'Bullpane is a self-hosted BullMQ UI: Free has no login, Pro is $39/mo per install with MCP. Durabull includes hosted MCP and org auth, free to start.',
    keywords: ['Bullpane alternative', 'Bullpane vs Durabull', 'self-hosted BullMQ dashboard'],
    intro:
      'Bullpane sits next to Durabull on the self-hosted axis. You add Redis (or BullMQ 6 Postgres) in the UI. The Free edition has no login. Pro adds roles, SSO, alerts, audit, and MCP.',
    howItConnects:
      'No app SDK. `npx bullpane --redis redis://…` or add connections in the UI. Auto-discovers queues.',
    codeChanges: 'None in the worker.',
    autoDiscovery: 'Yes.',
    multiEnv: 'Vendor copy: unlimited connections and queues on Free.',
    alerts: 'Pro only: Slack and webhook. The Free edition has no alerts.',
    mcp: 'Pro only. URL + OAuth, acts as the signed-in user.',
    pricing:
      'Free. Pro $39/month per installation, or $390/year (bullpane.com and llms.txt, 2026-10-20). 14-day refund on first payment. Pro subscription keys re-validate daily with a 7-day offline grace period; offline keys are available for air-gapped installs.',
    license: 'MIT core + commercial Pro.',
    whenToChooseThem:
      'Choose Bullpane when you want a self-hosted box with a simple Free/Pro split and you accept a per-install Pro license for MCP and SSO.',
    whenToChooseDurabull:
      'Choose Durabull for a hosted cloud option, org invitations without buying Pro, and MCP included in the hosted app. Durabull is Apache-2.0 for the whole project, not a Free/Pro split.',
    rows: [
      {
        feature: 'See queues',
        durabull: sharedRows.discover,
        competitor: 'Add Redis in the UI; auto-discover',
      },
      {
        feature: 'Auth',
        durabull: 'Better Auth, orgs, invitations; authless on private nets',
        competitor: 'Free: no login. Pro: roles/SSO.',
      },
      {
        feature: 'MCP',
        durabull: sharedRows.mcp,
        competitor: 'Pro only, OAuth as the signed-in user',
      },
      { feature: 'Price', durabull: sharedRows.price, competitor: 'Free; Pro $39/mo per install' },
    ],
    faqs: [
      {
        question: 'Is Bullpane’s MCP on the free tier?',
        answer:
          'No. MCP is listed on Pro, at $39/month per installation on the pages reviewed 2026-10-20.',
      },
    ],
    sources: [
      { label: 'Bullpane', url: 'https://bullpane.com/' },
      { label: 'Bullpane llms.txt', url: 'https://bullpane.com/llms.txt' },
    ],
    related: ['taskforce', 'workbench', 'bull-board'],
  },
  {
    slug: 'bull-monitor',
    name: 'bull-monitor',
    shortName: 'bull-monitor',
    website: 'https://github.com/s-r-x/bull-monitor',
    category: 'bullmq-ui',
    oneLiner:
      'Archived MIT dashboard with Queue-instance or named-queue configuration; evaluate maintenance needs before adopting.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs bull-monitor',
    description:
      'bull-monitor is an archived MIT Bull/BullMQ UI that requires named queues. Durabull is actively developed, discovers queues from Redis, and ships MCP.',
    keywords: ['bull-monitor alternative', 'bull-monitor vs Durabull'],
    intro:
      'bull-monitor (`s-r-x/bull-monitor`) was a Bull Board-era UI. The repository is archived. It remains in search results, which is why this page exists.',
    howItConnects:
      'Express: pass Queue instances. CLI: `bull-monitor -q queue1 queue2 --redis-uri … --bullmq`. No SCAN.',
    codeChanges: 'Yes. Name every queue.',
    autoDiscovery: 'No.',
    multiEnv: 'Not documented.',
    alerts: 'Optional metrics collector in Redis, not notification alerts.',
    mcp: 'Not documented.',
    pricing: 'Free, MIT, unmaintained.',
    license: 'MIT.',
    whenToChooseThem:
      'Existing users can keep a pinned deployment while evaluating compatibility and planning a migration; the archived repository is a maintenance consideration for new installations.',
    whenToChooseDurabull:
      'Use Durabull, Bull Board, Workbench, or Taskforce.sh instead of an archived dashboard.',
    rows: [
      { feature: 'Status', durabull: 'Active product', competitor: 'Archived (2023)' },
      {
        feature: 'See queues',
        durabull: sharedRows.discover,
        competitor: 'Pass instances or `-q` names',
      },
      { feature: 'MCP', durabull: sharedRows.mcp, competitor: 'None' },
    ],
    faqs: [
      {
        question: 'Is bull-monitor still maintained?',
        answer:
          'The GitHub repository is archived. QueueDash’s README still lists it as inspiration. Evaluate an actively maintained dashboard for new deployments.',
      },
    ],
    sources: [
      { label: 'bull-monitor GitHub', url: 'https://github.com/s-r-x/bull-monitor' },
      {
        label: 'CLI README',
        url: 'https://github.com/s-r-x/bull-monitor/blob/main/packages/cli/README.md',
      },
    ],
    related: ['bull-board', 'queuedash', 'workbench'],
  },
  {
    slug: 'redis-insight',
    complementary: true,
    name: 'Redis Insight',
    shortName: 'Redis Insight',
    website: 'https://redis.io/insight/',
    category: 'bullmq-ui',
    oneLiner: 'Official Redis GUI. Excellent for keys and slowlog. Not a BullMQ job dashboard.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Redis Insight',
    description:
      'Redis Insight is the official Redis GUI but does not model BullMQ queues, job states, or retries. Durabull adds BullMQ operations on the same Redis.',
    keywords: ['Redis Insight BullMQ', 'Redis GUI vs BullMQ dashboard', 'monitor BullMQ'],
    intro:
      'Redis Insight is the right tool for memory, keys, streams, and slow commands. BullMQ state is just keys (`bull:<queue>:…`) until a dashboard speaks queue semantics.',
    howItConnects:
      'Add a Redis database in the GUI. No application code. Can auto-discover local unauthenticated Redis.',
    codeChanges: 'None.',
    autoDiscovery: 'Discovers Redis databases, not BullMQ queues. You browse keys by hand.',
    multiEnv:
      'Multiple Redis databases can be added. Still a Redis GUI, not an environment-aware job console.',
    alerts: 'Not a BullMQ alerter.',
    mcp: 'Redis Copilot is a chatbot/query builder, not a queue-ops MCP.',
    pricing:
      'Marketed as free on desktop and Redis Cloud. Insight ≥ 2.0 is SSPLv1 for community users; paying Redis customers get a commercial license.',
    license: 'SSPL v1 (not OSI open source) for current Insight.',
    whenToChooseThem:
      'Use Redis Insight to debug Redis itself: evictions, big keys, streams, ACL, slowlog.',
    whenToChooseDurabull:
      'Use Durabull when the question is “which queue failed, what was the payload, retry it, tell my agent.” Keep Insight for the Redis layer.',
    rows: [
      {
        feature: 'Understands BullMQ',
        durabull: 'Queues, jobs, schedulers, workers',
        competitor: 'No. Keys and Redis features only.',
      },
      { feature: 'Retry a job', durabull: 'Yes', competitor: 'No BullMQ job actions' },
      { feature: 'MCP', durabull: sharedRows.mcp, competitor: 'Redis Copilot, not queue ops' },
      {
        feature: 'Price',
        durabull: sharedRows.price,
        competitor: 'Free to use; SSPL v1 for community',
      },
    ],
    faqs: [
      {
        question: 'Can I monitor BullMQ with Redis Insight?',
        answer:
          'You can browse the keys BullMQ writes. Official Insight pages do not mention Bull, BullMQ, waiting/failed states, or FlowProducer. That is not queue operations.',
      },
    ],
    sources: [
      { label: 'Redis Insight', url: 'https://redis.io/insight/' },
      { label: 'Insight docs', url: 'https://redis.io/docs/latest/develop/tools/insight/' },
      { label: 'Licenses', url: 'https://redis.io/legal/licenses/' },
    ],
    related: ['datadog', 'grafana', 'bull-board'],
  },
  {
    slug: 'upqueue',
    name: 'Upqueue',
    shortName: 'Upqueue',
    website: 'https://upqueue.io/',
    category: 'bullmq-ui',
    oneLiner:
      'Hosted BullMQ dashboard in search results. Official site could not be loaded from our research environment.',
    featured: false,
    alternativesPage: false,
    unverifiedLiveSite: true,
    researchStatus: 'limited',
    title: 'Durabull vs Upqueue',
    description:
      'Upqueue’s features and pricing could not be verified from official documentation. This limited-evidence page lists what to check before choosing.',
    keywords: ['Upqueue alternative', 'Upqueue vs Durabull', 'Upqueue.io'],
    intro:
      'We could not retrieve usable official product documentation for Upqueue during this review. A failed research fetch is not evidence that the service is unavailable. Feature and pricing claims remain unverified until official documentation is accessible.',
    howItConnects:
      'Connection and connector requirements could not be verified from official documentation.',
    codeChanges: 'Unverified.',
    autoDiscovery: 'Unverified.',
    multiEnv: 'Unverified. Snippets mentioned connection-count plans.',
    alerts: 'Unverified.',
    mcp: 'Not found in available sources.',
    pricing: 'No verified dollar prices. We will not invent them.',
    license: 'Unknown.',
    whenToChooseThem:
      'Evaluate Upqueue after confirming its current deployment model, supported BullMQ versions, access controls, and pricing with the vendor.',
    whenToChooseDurabull:
      'Evaluate Durabull if Redis discovery, team access, and hosted MCP fit your requirements. The lack of verified Upqueue evidence does not establish feature superiority.',
    rows: [
      {
        feature: 'Live docs',
        durabull: 'durabull.io + documentation',
        competitor: 'Official content unavailable to our research tool',
      },
      { feature: 'MCP', durabull: sharedRows.mcp, competitor: 'Not found' },
      { feature: 'Price', durabull: sharedRows.price, competitor: 'Unverified' },
    ],
    faqs: [
      {
        question: 'What is Upqueue’s pricing?',
        answer:
          'We could not verify it. The official site did not return product HTML from the research environment. Treat any third-party price as unconfirmed.',
      },
    ],
    sources: [
      { label: 'upqueue.io (attempted)', url: 'https://upqueue.io/' },
      {
        label: 'Upqueue blog (indexed)',
        url: 'https://upqueue.io/blog/why-your-queue-is-quiet-but-not-healthy/',
      },
    ],
    related: ['taskforce', 'queuedash', 'bull-board'],
  },
  {
    slug: 'bullstudio',
    name: 'Bullstudio',
    shortName: 'Bullstudio',
    website: 'https://bullstudio.dev/',
    category: 'bullmq-ui',
    oneLiner:
      'MIT standalone dashboard with Bull/BullMQ auto-discovery. Current Cloud plans could not be verified.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs Bullstudio',
    description:
      'Compare Bullstudio’s MIT dashboard and Redis auto-discovery with Durabull’s team operations, alerts, and MCP. Current Bullstudio Cloud plans remain unverified.',
    keywords: ['Bullstudio alternative', 'Bullstudio vs Durabull'],
    intro:
      'Bullstudio’s GitHub README is a self-hosted dashboard: `npx bullstudio -r redis://…` auto-detects Bull or BullMQ. Embed mode only shows queues you supply. Current Cloud plan details could not be verified; the comparison of standalone and embedded modes follows the public repository.',
    howItConnects: 'Standalone: Redis URL, zero worker code. Embed: pass the queues you choose.',
    codeChanges: 'None for standalone. Embed requires supplying Queue objects.',
    autoDiscovery: 'Standalone: yes. Embed: no.',
    multiEnv:
      'Current Cloud workspace and connection allowances could not be verified from accessible official documentation. Evaluate the documented OSS deployment separately.',
    alerts:
      'The reviewed OSS GitHub feature list does not document alert delivery. Current Cloud alert entitlements are unverified.',
    mcp: 'Not in the GitHub README feature list.',
    pricing:
      'OSS is MIT with no license fee. We could not verify current Cloud prices from accessible official pages; confirm them with the vendor.',
    license: 'MIT (OSS).',
    whenToChooseThem:
      'Choose the OSS binary when you want a one-command look at Redis and you do not need MCP.',
    whenToChooseDurabull:
      'Choose Durabull for documented MCP, organization-scoped Redis connections, alert delivery, and hosted or self-hosted operation.',
    rows: [
      {
        feature: 'Standalone discovery',
        durabull: sharedRows.discover,
        competitor: 'Yes (`npx bullstudio -r`)',
      },
      {
        feature: 'Cloud price',
        durabull: sharedRows.price,
        competitor: 'Not verified',
      },
      { feature: 'MCP', durabull: sharedRows.mcp, competitor: 'Not documented' },
    ],
    faqs: [
      {
        question: 'How much is Bullstudio Cloud?',
        answer:
          'We could not verify current Cloud dollar prices or plan allowances. The OSS repository is MIT licensed; confirm any hosted offer with the vendor before budgeting.',
      },
    ],
    sources: [
      { label: 'Bullstudio', url: 'https://bullstudio.dev/' },
      { label: 'GitHub README', url: 'https://github.com/emirce/bullstudio' },
    ],
    related: ['bull-board', 'workbench', 'taskforce'],
  },
  {
    slug: 'muleta',
    name: 'muleta',
    shortName: 'muleta',
    website: 'https://github.com/DipandaAser/muleta',
    category: 'bullmq-ui',
    oneLiner:
      'Pre-1.0 OSS. Docker takes a Redis URL. Authentication is on the roadmap; alerts and MCP are not documented.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs muleta',
    description:
      'muleta is a pre-1.0, Apache-2.0 BullMQ dashboard launched from a Redis URL. Durabull adds team auth, alerts, environments, and MCP.',
    keywords: ['muleta alternative', 'muleta vs Durabull'],
    intro:
      'muleta is an early dashboard (`0.x` may break). Standalone Docker uses `MULETA_REDIS_URL`. Embed examples pass a Redis URL, not a Queue list.',
    howItConnects: 'Redis URL in Docker or `createMuleta({ redis: { url } })`.',
    codeChanges: 'None for standalone.',
    autoDiscovery: 'Redis URL; no per-queue register in published examples.',
    multiEnv: 'Not documented as multi-env.',
    alerts: 'Not documented.',
    mcp: 'Not documented.',
    pricing: 'Free, Apache-2.0.',
    license: 'Apache-2.0.',
    whenToChooseThem:
      'Consider muleta when you want an Apache-2.0 dashboard and can evaluate its pre-1.0 compatibility. Add authentication and network access controls around deployments that handle production data.',
    whenToChooseDurabull: 'Production inspection, team access, alerts, and MCP.',
    rows: [
      {
        feature: 'Auth',
        durabull: 'Orgs or authless on a private network',
        competitor: 'No auth built in',
      },
      { feature: 'MCP', durabull: sharedRows.mcp, competitor: 'Not documented' },
      { feature: 'Maturity', durabull: 'Shipped product', competitor: 'Pre-1.0' },
    ],
    faqs: [
      {
        question: 'Is muleta production-ready?',
        answer:
          'The project labels itself pre-1.0 and may break. README lists auth and roles as roadmap, not shipped.',
      },
    ],
    sources: [{ label: 'muleta GitHub', url: 'https://github.com/DipandaAser/muleta' }],
    related: ['bull-board', 'workbench', 'bullstudio'],
  },
  {
    slug: 'bullmq-control-dashboard',
    name: 'BullMQ Control Dashboard',
    shortName: 'Control Dashboard',
    website: 'https://github.com/imatefx/bullmq-control-dashboard',
    category: 'bullmq-ui',
    oneLiner:
      'Wrapper around Bull Board: multiple Redis connections in the UI, SCAN discovery, basic auth. No license file published.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs BullMQ Control Dashboard',
    description:
      'BullMQ Control Dashboard wraps Bull Board with Redis discovery and multiple connections. Durabull adds alerts, worker views, and MCP to Redis scanning.',
    keywords: ['bullmq-control-dashboard', 'bull-board wrapper', 'multiple Redis BullMQ'],
    intro:
      'BullMQ Control Dashboard adds a connection-management interface around Bull Board: SCAN discovery, per-connection boards, a combined /board/all view, and HTTP basic auth. Bull Board itself also supports framework-integrated authentication and a standalone discovery CLI.',
    howItConnects: 'Add Redis connections in the UI. No worker SDK.',
    codeChanges: 'None in the app.',
    autoDiscovery: 'Yes, `SCAN <prefix>:*:meta`.',
    multiEnv: 'Multiple Redis from the UI. No org product beyond basic auth roles (admin/reader).',
    alerts: 'Not documented.',
    mcp: 'Not documented.',
    pricing:
      'No price is listed. The repository has no LICENSE file, so no reuse license is granted; confirm terms with the author before deploying.',
    license: 'None published (no LICENSE file; GitHub reports no license).',
    whenToChooseThem:
      'Choose it if you already standardized on Bull Board and only need a discovery/auth shell around it.',
    whenToChooseDurabull:
      'Choose Durabull if you want that discovery model plus alerts, schedulers, workers topology, and MCP — without running a Bull Board wrapper.',
    rows: [
      {
        feature: 'Core UI',
        durabull: 'Durabull dashboard',
        competitor: 'bull-board, with a discovery shell',
      },
      { feature: 'Discovery', durabull: sharedRows.discover, competitor: 'SCAN `<prefix>:*:meta`' },
      { feature: 'MCP', durabull: sharedRows.mcp, competitor: 'Not documented' },
    ],
    faqs: [
      {
        question: 'Is this different from Bull Board?',
        answer:
          'It is Bull Board plus connection management and SCAN. Job UI behavior is still bull-board. Durabull is a separate product.',
      },
    ],
    sources: [
      { label: 'GitHub README', url: 'https://github.com/imatefx/bullmq-control-dashboard' },
    ],
    related: ['bull-board', 'taskforce', 'workbench'],
  },
  {
    slug: 'bullmq-pro',
    complementary: true,
    name: 'BullMQ Pro',
    shortName: 'BullMQ Pro',
    website: 'https://docs.bullmq.io/bullmq-pro/introduction',
    category: 'bullmq-ui',
    oneLiner:
      'Commercial BullMQ library (groups, batches) from $139/month. Not a dashboard; Taskforce.sh is the official UI.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs BullMQ Pro',
    description:
      'BullMQ Pro is a commercial queue library (Standard from $139/month), not a dashboard. Durabull operates Redis-backed BullMQ; validate Pro-specific features.',
    keywords: ['BullMQ Pro pricing', 'BullMQ Pro vs Durabull', 'Taskforce Pro'],
    intro:
      'BullMQ Pro (`@taskforcesh/bullmq-pro`) is a drop-in library: groups, batches, observables, email support. It is not a dashboard. Comparing it to Durabull is a category error unless you are choosing whether to pay for library features versus paying for operations tooling.',
    howItConnects:
      'Replace `bullmq` with `@taskforcesh/bullmq-pro` from `https://npm.taskforce.sh/` using an org token. That is an application dependency change.',
    codeChanges: 'Yes. New package and Pro classes.',
    autoDiscovery: 'N/A — it is the runtime, not a UI. Taskforce.sh can show Pro groups.',
    multiEnv: 'N/A.',
    alerts: 'N/A (library).',
    mcp: 'N/A. Taskforce.sh MCP can operate Pro queues if you also buy Taskforce.',
    pricing:
      'bullmq.io lists Standard at $139/month or $1,395/year per deployment for organizations with fewer than 100 employees; Enterprise is custom-priced (visited 2026-10-20). Taskforce’s dashboard plans do not include BullMQ Pro.',
    license:
      'Commercial subscription. bullmq.io prices Standard per deployment; the BullMQ Pro docs describe the license as per organization. Confirm scope with the vendor.',
    whenToChooseThem:
      'Buy Pro when you need groups, batches, or first-party library support. That decision is independent of which dashboard you use.',
    whenToChooseDurabull:
      'Use Durabull to operate the queues you already run. It does not replace Pro features inside the worker. OSS BullMQ plus Durabull is enough when you do not need Pro’s library extras.',
    rows: [
      {
        feature: 'Category',
        durabull: 'Operations dashboard + MCP',
        competitor: 'Commercial queue library',
      },
      {
        feature: 'Public price',
        durabull: sharedRows.price,
        competitor: 'Standard $139/mo or $1,395/yr; Enterprise custom',
      },
      { feature: 'UI', durabull: 'Durabull', competitor: 'Taskforce.sh (separate product)' },
    ],
    faqs: [
      {
        question: 'How much is BullMQ Pro?',
        answer:
          'bullmq.io lists BullMQ Pro Standard at $139/month or $1,395/year per deployment for organizations with fewer than 100 employees, with custom Enterprise pricing (visited 2026-10-20). It is separate from Taskforce.sh dashboard plans. Confirm license scope with the vendor.',
      },
    ],
    sources: [
      { label: 'BullMQ Pro intro', url: 'https://docs.bullmq.io/bullmq-pro/introduction' },
      { label: 'BullMQ Pro pricing', url: 'https://bullmq.io/#bullmq-pro' },
      { label: 'Taskforce pricing', url: 'https://taskforce.sh/pricing' },
    ],
    related: ['taskforce', 'bull-board'],
  },
]
