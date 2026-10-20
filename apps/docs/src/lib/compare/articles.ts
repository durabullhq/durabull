import type { Article } from './types'

export const articles: Article[] = [
  {
    slug: 'how-to-monitor-bullmq-in-production',
    title: 'How to monitor BullMQ in production',
    description:
      'A practical production checklist for BullMQ: Redis discovery, metrics, alerts, multi-environment dashboards, and MCP for AI agents.',
    keywords: [
      'how to monitor BullMQ',
      'BullMQ production monitoring',
      'BullMQ dashboard',
      'BullMQ alerts',
    ],
    datePublished: '2026-10-20',
    intro:
      'BullMQ stores queue state in Redis. Production monitoring is the ability to find every queue, see failed jobs, page a human, and let an agent pull the same evidence. Most teams stop at an embedded UI on one app process.',
    sections: [
      {
        heading: 'What “monitor” has to mean',
        body: [
          'Counts on one queue you already constructed in code are not production coverage. Queues appear when workers start. Prefixes differ. Staging and production are different Redis databases. A dashboard that only sees the queues one service imported will miss the rest.',
          'Minimum bar: list queues without changing workers, open a failed payload and stack trace, retry or pause, and fire an alert when failure rate or Redis memory crosses a line.',
        ],
      },
      {
        heading: 'Discover queues from Redis, do not register them',
        body: [
          'BullMQ writes meta keys. Durabull SCANs `<prefix>:*:meta` (default prefix `bull`). Bull Board’s CLI does a similar scan. Arena and the Bull Board embed do not: you pass names or adapters.',
          'If empty Redis, the wrong logical database, or the wrong prefix shows no queues, the dashboard is working. Fix the connection, not the UI.',
        ],
      },
      {
        heading: 'Metrics are optional and they need worker config',
        body: [
          'Throughput charts are not free. BullMQ records them when workers set `metrics.maxDataPoints`. Durabull and Prometheus export both depend on that. Do not promise “zero code forever” if you need graphs.',
          'Job logs appear when workers call `job.log()`. Console output does not show up in the dashboard.',
        ],
      },
      {
        heading: 'Alert on queue and Redis health, not only process crashes',
        body: [
          'A worker crash is an APM event. A silent backlog with completions stopped is a queue event. Durabull ships failure threshold, failure rate, queue stalled, per-job failed, and Redis INFO health (memory %, evictions, rejected connections). Delivery today is email, HMAC-signed webhooks, and Linear. Slack and PagerDuty are coming soon.',
          'Datadog, Grafana, and Sentry are still useful. They do not replace a retry console.',
        ],
      },
      {
        heading: 'Give the pager to an agent with MCP',
        body: [
          'Durabull MCP exposes 30 tools at `https://app.durabull.io/mcp`: list connections and queues, explain failures, retry or promote, pause, manage alert events. Write scopes are opt-in. Payloads are redacted on the server.',
          'Taskforce.sh and Workbench also ship MCP. Generic APM MCPs query telemetry. They do not operate BullMQ.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Do I need to change BullMQ workers to monitor them?',
        answer:
          'Not to list queues or inspect jobs. Durabull connects to Redis. Enable BullMQ metrics on workers if you want throughput charts. Call `job.log()` if you want in-job logs.',
      },
      {
        question: 'Is Redis Insight enough?',
        answer:
          'No. Insight is a Redis GUI. It does not speak waiting/active/failed, retries, or schedulers.',
      },
    ],
    relatedCompare: ['bull-board', 'taskforce', 'datadog', 'grafana'],
  },
  {
    slug: 'best-bullmq-dashboards-2026',
    title: 'Best BullMQ dashboards in 2026',
    description:
      'Compared Bull Board, Arena, Taskforce.sh, Workbench, QueueDash, Bullpane, Redis Insight, and Durabull using official docs from October 2026.',
    keywords: [
      'best BullMQ dashboard',
      'BullMQ UI 2026',
      'Bull Board alternative',
      'BullMQ monitoring tools',
    ],
    datePublished: '2026-10-20',
    intro:
      '“Best” depends on whether you will mount a UI in the app, pay per Redis connection, or point a control plane at Redis and keep going. These are the living options as of 20 October 2026.',
    sections: [
      {
        heading: 'If you want a free embed',
        body: [
          'Bull Board is still the default. Adapters for Express, Fastify, Nest, Hono, and more. You register each queue. CLI/Docker can SCAN one Redis without an embed.',
          'Workbench is the modern MIT alternative, BullMQ-only. Pass `queues` or `redis` (`maxQueues` default 100). Docker wants `QUEUE_NAMES`. Local MCP proxy. Slack/Discord alerts.',
          'Arena still covers Bee + Bull + BullMQ if you name every queue. README still says BullMQ support is preliminary.',
        ],
      },
      {
        heading: 'If you want Redis URL, no app SDK',
        body: [
          'Taskforce.sh (BullMQ authors): auto-discovery, Slack/PagerDuty monitors, hosted MCP. $19.95 / $49.95 / $99.95 per month for 1 / 5 / 15 connections.',
          'Durabull: SCAN discovery, many connections per org, email/webhook/Linear alerts (Slack and PagerDuty coming soon), hosted MCP with OAuth, cloud + desktop app (Homebrew cask on Apple Silicon macOS, not a CLI) + Docker. Free to start. ELv2, not OSI open source.',
          'Bullpane: self-hosted, Free without login, Pro $39/mo per install for SSO/MCP/alerts.',
          'QueueDash hosted is the exception: SDK `attach()`, job quotas, env/queue caps. OSS QueueDash can discover Bull/BullMQ.',
        ],
      },
      {
        heading: 'What not to pick',
        body: [
          'bull-monitor is archived. Redis Insight is not a queue UI. Upqueue.io did not load from our research environment — do not trust third-party prices. BullMQ Pro is a library, not a dashboard. Defer and hosted Quirrel are gone.',
        ],
      },
      {
        heading: 'The MCP split',
        body: [
          'Dashboards with a BullMQ MCP in official docs: Durabull, Taskforce.sh, Workbench (local proxy), Bullpane Pro. Inngest, Trigger.dev, Hatchet, Datadog, Sentry have MCPs for *their* products. That is a different job.',
        ],
      },
    ],
    faqs: [
      {
        question: 'What is the best Bull Board alternative in 2026?',
        answer:
          'For OSS in-process: Workbench. For a Redis-connected control plane: Durabull or Taskforce.sh. For a Bull Board shell with SCAN: BullMQ Control Dashboard.',
      },
    ],
    relatedCompare: ['bull-board', 'workbench', 'taskforce', 'queuedash', 'bullpane'],
  },
  {
    slug: 'bullmq-mcp-server-for-ai-agents',
    title: 'BullMQ MCP server for AI agents',
    description:
      'How Durabull MCP lets Cursor, Claude, and ChatGPT inspect queues, explain failures, retry jobs, and manage alerts — and which other BullMQ MCPs exist.',
    keywords: [
      'BullMQ MCP',
      'MCP server BullMQ',
      'Cursor BullMQ',
      'Claude queue monitoring',
      'Durabull MCP',
    ],
    datePublished: '2026-10-20',
    intro:
      'Model Context Protocol is how agents call tools. A BullMQ MCP is not “chat about Redis.” It is list queues, explain a failure, retry, pause, snooze an alert — with scopes so the model cannot obliterate a queue.',
    sections: [
      {
        heading: 'What Durabull MCP actually exposes',
        body: [
          'Hosted URL: `https://app.durabull.io/mcp`. 30 tools (21 read, 9 write), 9 OAuth scopes, 4 prompts (`triage_failed_jobs`, `investigate_queue_backlog`, `alert_activity_review`, `connection_health_check`).',
          'Writes are opt-in: retry, promote, pause/resume, alert acknowledge/resolve/snooze. Deletes, purges, obliterates, payload edits, and raw Redis commands are not on MCP.',
          'Responses are redacted server-side. Each teammate signs in as themselves. Cursor is a first-class supported client; Claude, ChatGPT, and other MCP clients use the same remote URL.',
        ],
      },
      {
        heading: 'How to connect',
        body: [
          'Claude / Cowork: Settings → Connectors. ChatGPT / Codex: add a custom MCP server. Claude Code: `/plugin marketplace add durabullhq/durabull` then install the plugin (9 skills). Cursor: `mcp.json` `{ "durabull": { "url": "https://app.durabull.io/mcp" } }`.',
          'Self-host: same protocol at `/mcp` on your Durabull origin. Authless mode still requires a bearer token for MCP.',
        ],
      },
      {
        heading: 'Other BullMQ MCPs',
        body: [
          'Taskforce.sh: `https://api.taskforce.sh/mcp`, bearer `tfa_…`, audit log, 120 req/60s hosted limit. Workbench: `@getworkbench/mcp` stdio proxy to one dashboard. Bullpane Pro: OAuth as the signed-in user. Community `@adamhancock/bullmq-mcp` talks to Redis/BullMQ directly — review its auth model before production.',
          'docs.bullmq.io does not document an official library MCP.',
        ],
      },
      {
        heading: 'What APM MCPs are not',
        body: [
          'Datadog, New Relic, Sentry, and Grafana MCPs query those products. They cannot retry a BullMQ job. Inngest and Trigger.dev MCPs operate those platforms, not your Redis.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can an agent delete jobs through Durabull MCP?',
        answer:
          'No. Destructive operations are omitted. Writes are retry, promote, pause/resume, and alert state changes, each behind a scope.',
      },
      {
        question: 'Does the model see secrets in payloads?',
        answer:
          'Durabull redacts secrets, tokens, URLs, and long strings on the server and reports how many values were removed.',
      },
    ],
    relatedCompare: ['taskforce', 'workbench', 'bullpane', 'inngest'],
  },
  {
    slug: 'inngest-vs-bullmq-durabull-cost',
    title: 'Inngest vs BullMQ + Durabull cost breakdown',
    description:
      'Worked Inngest execution costs at 1M, 10M, and 100M units using the 20 October 2026 pricing page, versus Redis + BullMQ + Durabull.',
    keywords: ['Inngest pricing', 'Inngest vs BullMQ', 'Inngest cost', 'durable functions cost'],
    datePublished: '2026-10-20',
    intro:
      'Inngest bills executions. BullMQ bills Redis and your workers. Durabull hosted is free to start. The units are not the same, so the table below states the unit on every row.',
    sections: [
      {
        heading: 'What Inngest meters',
        body: [
          'Official FAQ: an execution is a function run or a step. Five `step.run()` calls = six executions. Calculator copy: `Executions = runs × (steps + 1)`.',
          'Free: 50,000 executions, then pause. Pro: $99/mo includes 1M. Business: $499/mo includes 10M. Pro overage FAQ: $0.000050 down to $0.000015; breakpoints not published as a static grid. Sandbox vCPU/memory is extra.',
        ],
      },
      {
        heading: 'Worked executions-only bill',
        body: [
          '1M executions: $99 on Pro (included). 10M: $499 on Business (included). 100M: not an included amount. Using the published Pro overage range after 1M: about $1,584–$5,049. Business overage rates were not a public table.',
          'If you meant 1M `step.run()` calls with one step per function, double the executions (official formula) and the Pro 1M allotment no longer covers it.',
        ],
      },
      {
        heading: 'What BullMQ + Durabull meters',
        body: [
          'BullMQ has no per-job SaaS fee. You pay Redis and compute you already run. Durabull hosted is free to start. Self-host is ELv2.',
          'The hidden cost of Inngest is not only dollars. Cloud must be up to start and resume runs. Self-host Inngest is SSPL. You give up owning the broker.',
        ],
      },
      {
        heading: 'When the Inngest bill is still the right bill',
        body: [
          'You do not have BullMQ. You want sleeps, waits, and fan-out as product features. You want their Cloud MCP for runs. Then pay executions and do not pretend Durabull is an Inngest-compatible runtime. It is not.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Does Durabull replace Inngest?',
        answer:
          'No. Durabull monitors BullMQ. Inngest is a different orchestrator. The comparison is cost and lock-in if you are choosing a runtime, or “keep BullMQ” if you already have one.',
      },
    ],
    relatedCompare: ['inngest', 'trigger-dev', 'temporal', 'hatchet'],
  },
  {
    slug: 'self-hosted-vs-managed-job-queues',
    title: 'Self-hosted vs managed job queues',
    description:
      'When to keep Redis + BullMQ versus paying Inngest, Trigger.dev, Temporal Cloud, Hatchet, or QStash — with published 2026 list prices and lock-in notes.',
    keywords: [
      'self-hosted vs managed job queue',
      'BullMQ vs Inngest',
      'BullMQ vs Trigger.dev',
      'managed queue lock-in',
    ],
    datePublished: '2026-10-20',
    intro:
      'Managed platforms sell the broker. Self-hosted BullMQ sells you Redis operational work. Durabull does not change that trade: it makes the Redis you kept inspectable.',
    sections: [
      {
        heading: 'What you are actually buying',
        body: [
          'Inngest: durable steps, they invoke you. Trigger.dev: they run your code, compute-seconds. Temporal Cloud: Actions + storage, you run Workers. Hatchet: $30/M runs after 1M free. QStash: $1/100K HTTP messages. SQS: $0.40/M requests after 1M free.',
          'BullMQ: you run Redis and workers. Durabull: you add a dashboard. Taskforce.sh: you add a commercial dashboard per Redis connection.',
        ],
      },
      {
        heading: 'Uptime and lock-in',
        body: [
          'If the SaaS is down, Inngest/Trigger/Temporal Cloud cannot start work the way your own Redis can (you still need Redis HA). Defer shut down. Hosted Quirrel ended. That is not theoretical.',
          'Rewrites are the lock-in. `step.run`, Workflows, or `Queue.add` are not portable. A dashboard you can self-host is removable. A runtime is not.',
        ],
      },
      {
        heading: 'A simple decision',
        body: [
          'Already on BullMQ? Add Durabull or Taskforce. Do not re-platform to get a UI.',
          'Greenfield durable workflows with sleeps and signals? Temporal or Inngest are in-category. Price the units they publish.',
          'Greenfield HTTP/edge? QStash or Cloudflare Queues. Still not BullMQ.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Is self-hosting cheaper at 100M jobs?',
        answer:
          'Often the product fee is. You still pay Redis and workers. Managed platforms add a second meter that grows with retries, steps, or compute seconds. Use their official units, not a one-to-one “job” label.',
      },
    ],
    relatedCompare: ['inngest', 'trigger-dev', 'temporal', 'qstash', 'aws-sqs'],
  },
  {
    slug: 'replace-bull-board',
    title: 'How to replace Bull Board',
    description:
      'Leave an embedded @bull-board route without rewriting workers. What changes if you move to Durabull, Workbench, or Taskforce.sh.',
    keywords: ['replace Bull Board', 'Bull Board alternative', 'migrate from bull-board'],
    datePublished: '2026-10-20',
    intro:
      'Replacing Bull Board is removing a route and a list of adapters, not migrating jobs. Jobs stay in Redis. The new tool either mounts somewhere else or reads Redis on its own.',
    sections: [
      {
        heading: 'What you can delete',
        body: [
          '`createBullBoard`, server adapters, and `/admin/queues`. Workers do not change. Prefixes do not change. If you depended on the embed process to construct queues, the new tool must discover them instead.',
        ],
      },
      {
        heading: 'Paths',
        body: [
          'Durabull: create an org, paste the Redis URL, confirm prefix. Queues appear from SCAN. Add staging/production as more connections. Connect MCP if you want agents. Install the desktop app from GitHub releases or Homebrew (`brew install --cask durabullhq/tap/durabull`); Homebrew installs the desktop app, not a CLI.',
          'Taskforce.sh: Redis URL or connector. Pay per connection. Enable monitors (they default off).',
          'Workbench: mount with `redis` instead of `queues`, or use the Mac app. Raise `maxQueues` if you have more than 100. Docker still wants names.',
          'Stay on Bull Board CLI if one Redis and no team auth is enough.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Will replacing Bull Board drop jobs?',
        answer: 'No. Bull Board is not the broker. Redis is.',
      },
    ],
    relatedCompare: ['bull-board', 'workbench', 'taskforce', 'arena'],
  },
  {
    slug: 'trigger-dev-vs-bullmq-cost',
    title: 'Trigger.dev vs BullMQ cost at production volume',
    description:
      'Trigger.dev Cloud charges $0.000025 per run plus machine time. Worked 10-second small-1x examples at 1M, 10M, and 100M runs from the official 2026 pricing page.',
    keywords: ['Trigger.dev pricing', 'Trigger.dev vs BullMQ', 'Trigger.dev cost'],
    datePublished: '2026-10-20',
    intro:
      'Trigger.dev’s own example is the honest one: `1 run = (seconds × machine $/sec) + $0.000025`. Duration dominates. BullMQ duration is your compute bill, not theirs.',
    sections: [
      {
        heading: 'Published machines',
        body: [
          'Default small-1x: 0.5 vCPU, 0.5 GB, $0.0000338/sec. Ten seconds + run fee = $0.000363/run. 1M ≈ $363. 10M ≈ $3,630. 100M ≈ $36,300. Invocation-only floors ($25 / $250 / $2,500) are not realistic production bills.',
          'Plan fees (Free $0+$5 credit, Hobby $10, Pro $50) are included credits. DEV runs are free. Concurrency above 200 on Pro is $10 per 50.',
        ],
      },
      {
        heading: 'BullMQ + Durabull',
        body: [
          'You already pay workers. Durabull hosted is free to start and does not bill per run. The comparison is “keep that fleet” versus “move task bodies onto Trigger.dev machines.”',
        ],
      },
    ],
    faqs: [
      {
        question: 'Does Trigger.dev monitor BullMQ?',
        answer: 'No. Official MCP operates Trigger.dev projects and runs.',
      },
    ],
    relatedCompare: ['trigger-dev', 'inngest', 'hatchet'],
  },
  {
    slug: 'redis-insight-is-not-a-bullmq-dashboard',
    title: 'Why Redis Insight is not a BullMQ dashboard',
    description:
      'Redis Insight is the official Redis GUI. It does not list BullMQ queues, retry jobs, or speak waiting/failed. Use it beside Durabull, not instead.',
    keywords: ['Redis Insight BullMQ', 'Redis GUI queue monitoring', 'monitor BullMQ Redis'],
    datePublished: '2026-10-20',
    intro:
      'Operators open Insight, see `bull:email:wait`, and think they have a queue UI. They have a key browser.',
    sections: [
      {
        heading: 'What Insight does well',
        body: [
          'Memory, big keys, slowlog, Streams consumer groups, CLI, Redis Copilot. Free to use on desktop and Redis Cloud. Current Insight is SSPLv1 for community users.',
        ],
      },
      {
        heading: 'What it does not do',
        body: [
          'Official pages do not mention Bull or BullMQ. There is no retry, pause, scheduler editor, or failed-job workflow. Copilot is not a queue MCP.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Should I run both?',
        answer: 'Yes. Insight for Redis. Durabull for BullMQ.',
      },
    ],
    relatedCompare: ['redis-insight', 'datadog', 'bull-board'],
  },
]

const bySlug = new Map(articles.map((item) => [item.slug, item]))

export function getArticle(slug: string): Article | undefined {
  return bySlug.get(slug)
}

export function articlePath(slug: string): string {
  return `/blog/${slug}`
}
