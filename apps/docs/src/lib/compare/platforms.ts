import type { Competitor } from './types'

const durabullOps =
  'Stay on Redis + BullMQ. Durabull is the operations layer: discovery, alerts, MCP. The hosted dashboard is free during beta; Redis, workers, and their operation remain your responsibility.'

export const platformCompetitors: Competitor[] = [
  {
    slug: 'inngest',
    name: 'Inngest',
    shortName: 'Inngest',
    website: 'https://www.inngest.com/pricing',
    category: 'managed-platform',
    oneLiner:
      'Replaces BullMQ. Cloud bills executions (run + each step). Official MCP inspects Inngest runs, not Redis queues.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Inngest',
    description:
      'Inngest replaces Redis + BullMQ and bills each function run and step. Durabull monitors the BullMQ you already run, with no per-job meter during beta, plus a BullMQ MCP server.',
    keywords: [
      'Inngest alternative',
      'Inngest vs BullMQ',
      'Inngest pricing',
      'Inngest vs Durabull',
      'self-hosted vs Inngest',
    ],
    alternativesTitle: 'Inngest alternatives',
    alternativesDescription:
      'Inngest alternatives if you already run BullMQ, want to avoid per-step execution billing, or need an operations MCP for Redis queues rather than Inngest runs.',
    intro:
      'Inngest is a durable-execution platform. You write `step.run()` functions. Inngest Cloud (or a self-hosted Inngest server) stores run state and invokes your code. It does not attach to existing BullMQ. The cost conversation is about executions, not Redis.',
    howItConnects:
      'You adopt the Inngest SDK. Cloud invokes your functions over HTTP or connected workers. Self-host: `inngest start` (SQLite default, Postgres for production). Server/CLI license is SSPL + Apache 2.0 after 3 years.',
    codeChanges: 'Yes. This is a new runtime, not a dashboard for current queues.',
    autoDiscovery: 'N/A. There are no BullMQ queues to discover.',
    multiEnv: 'Inngest environments and apps, not Redis connections.',
    alerts: 'Platform observability on Inngest Cloud. Not BullMQ monitors.',
    mcp: 'Official Cloud MCP `https://api.inngest.com/mcp` and Dev Server `http://127.0.0.1:8288/mcp`. Tools list/inspect/invoke/rerun/cancel Inngest runs. That is not a BullMQ ops MCP.',
    pricing:
      '2026-10-20: Free $0 / 50k executions. Pro from $99/mo includes 1M executions. Business from $499/mo includes 10M. An execution is one function run or one step (`Executions = runs × (steps + 1)`). Pro overage FAQ: $0.000050 down to $0.000015 per execution; breakpoints not published as a static table. Sandbox compute is extra. Free pauses at the quota.',
    license: 'Cloud commercial. Server SSPL + Apache 2.0 after 3 years. SDKs Apache 2.0.',
    whenToChooseThem:
      'Choose Inngest when durable steps, sleeps, event-driven waits, and managed orchestration justify adopting its SDK. Existing BullMQ teams can also adopt it for workflows whose requirements exceed their current queue design.',
    whenToChooseDurabull:
      'Choose Durabull when production already runs on Redis + BullMQ. Keep the broker you operate. Add a dashboard and MCP instead of rewriting jobs onto a metered platform.',
    rows: [
      { feature: 'Relationship to BullMQ', durabull: 'Monitors it', competitor: 'Replaces it' },
      {
        feature: 'Billed unit',
        durabull: 'No job meter in beta',
        competitor: 'Execution = run or step',
      },
      {
        feature: '1M billed executions',
        durabull: '$0 beta + your infrastructure',
        competitor: '$99 Pro (included 1M)',
      },
      {
        feature: '10M executions',
        durabull: '$0 beta + your infrastructure',
        competitor: '$499 Business (included 10M)',
      },
      {
        feature: '100M executions',
        durabull: '$0 beta + your infrastructure',
        competitor: 'Use the vendor calculator or request a quote',
      },
      { feature: 'MCP', durabull: 'BullMQ queue ops', competitor: 'Inngest run ops' },
      {
        feature: 'State and hosting',
        durabull: 'Your Redis',
        competitor: 'Inngest stores workflow state; Cloud or self-hosted server',
      },
    ],
    costs: {
      caption:
        'Inngest executions only (2026-10-20 pricing page). Sandbox compute, seats, and span overages excluded. No 100M estimate is supplied because the published range alone does not define the tier breakpoints. This is an orchestration charge, not equivalent functionality to a dashboard; execution hosting is separate.',
      rows: [
        {
          volume: '1M executions',
          competitor: '$99 (Pro included)',
          durabull: '$0 beta + your infrastructure',
          unit: 'execution',
        },
        {
          volume: '10M executions',
          competitor: '$499 (Business included)',
          durabull: '$0 beta + your infrastructure',
          unit: 'execution',
        },
        {
          volume: '100M executions',
          competitor: 'Quote / calculator required',
          durabull: '$0 beta + your infrastructure',
          unit: 'execution',
        },
      ],
    },
    faqs: [
      {
        question: 'What does Inngest count as an execution?',
        answer:
          'Official FAQ: one function run and each step inside that run. A function with five `step.run()` calls uses six executions. Formula on the pricing calculator: runs × (steps + 1).',
      },
      {
        question: 'Can Inngest monitor my existing BullMQ queues?',
        answer:
          'No. It is a different orchestrator. Durabull connects to the Redis BullMQ already uses.',
      },
    ],
    sources: [
      { label: 'Inngest pricing', url: 'https://www.inngest.com/pricing' },
      {
        label: 'Inngest server license',
        url: 'https://github.com/inngest/inngest/blob/main/LICENSE.md',
      },
      { label: 'Steps', url: 'https://www.inngest.com/docs/durable-execution/durable-workflows' },
      { label: 'Limits', url: 'https://www.inngest.com/docs/durable-execution/limits' },
      { label: 'MCP', url: 'https://www.inngest.com/docs/ai-dev-tools/mcp' },
    ],
    related: ['trigger-dev', 'temporal', 'hatchet', 'qstash'],
  },
  {
    slug: 'trigger-dev',
    name: 'Trigger.dev',
    shortName: 'Trigger.dev',
    website: 'https://trigger.dev/pricing',
    category: 'managed-platform',
    oneLiner:
      'Replaces BullMQ. They run your task code. Bills compute-seconds plus $0.000025 per run.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Trigger.dev',
    description:
      'Trigger.dev Cloud runs your tasks on their machines and bills compute plus $0.000025/run. Durabull does not run jobs. It operates the BullMQ workers you already pay for.',
    keywords: [
      'Trigger.dev alternative',
      'Trigger.dev vs BullMQ',
      'Trigger.dev pricing',
      'Trigger.dev vs Durabull',
    ],
    alternativesTitle: 'Trigger.dev alternatives',
    alternativesDescription:
      'Trigger.dev alternatives if you want to keep running workers on your own Redis + BullMQ instead of paying compute-seconds on a managed task runtime.',
    intro:
      'Trigger.dev Cloud is a different contract from BullMQ: they execute your task code on managed machines. Duration dominates the bill. Official MCP triggers and monitors Trigger.dev runs, not BullMQ jobs.',
    howItConnects:
      'Trigger.dev SDK and deploy. Cloud machines run tasks. Self-host is Apache 2.0 via Docker Compose or Kubernetes.',
    codeChanges: 'Yes. New runtime.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Trigger.dev environments (DEV runs are not charged).',
    alerts: 'Plan-limited alert destinations on Cloud.',
    mcp: 'Official `npx trigger.dev@latest mcp`. Tools include trigger runs, deploy, monitor, TRQL. Not BullMQ.',
    pricing:
      '2026-10-20: Free $0 with $5 credit. Hobby $10 / $10 credit. Pro $50 / $50 credit. Run fee $0.000025. Default small-1x machine $0.0000338/sec. Official 10s example: $0.000363/run. Concurrency add-ons $10 per 50 above 200 on Pro. HIPAA BAA $500/mo on Hobby/Pro.',
    license: 'Apache 2.0 OSS. Cloud commercial.',
    whenToChooseThem:
      'Choose Trigger.dev when you want managed compute for long TypeScript tasks, no worker fleet, and you accept deploying task code onto their machines.',
    whenToChooseDurabull: durabullOps,
    rows: [
      {
        feature: 'Who runs the job',
        durabull: 'Your workers',
        competitor: 'Trigger.dev Cloud machines',
      },
      {
        feature: '1M × 10s small-1x',
        durabull: '$0 beta + your Redis/compute',
        competitor: '~$363 usage (Pro $50 credit)',
      },
      { feature: '10M × 10s', durabull: '$0 beta + your infra', competitor: '~$3,630' },
      { feature: '100M × 10s', durabull: '$0 beta + your infra', competitor: '~$36,300' },
      { feature: 'MCP', durabull: 'BullMQ ops', competitor: 'Trigger.dev runs and deploy' },
    ],
    costs: {
      caption:
        'Illustrative compute scenario: 10 executing seconds per run on small-1x at $0.0000338/sec plus $0.000025/run. Excludes add-ons and discounts; plan credits apply. Trigger.dev includes execution compute here. Durabull does not: add Redis, worker compute, and operations to its dashboard fee. No throughput benchmark is implied.',
      rows: [
        {
          volume: '1M runs × 10s',
          competitor: '~$363',
          durabull: '$0 product fee in beta',
          unit: 'run + compute',
        },
        {
          volume: '10M runs × 10s',
          competitor: '~$3,630',
          durabull: '$0 product fee in beta',
          unit: 'run + compute',
        },
        {
          volume: '100M runs × 10s',
          competitor: '~$36,300',
          durabull: '$0 product fee in beta',
          unit: 'run + compute',
        },
      ],
    },
    faqs: [
      {
        question: 'Is Trigger.dev cheaper than BullMQ + Durabull?',
        answer:
          'There is no universal cheaper option. In the stated ten-second small-1x example, 10M Trigger.dev runs generate about $3,630 in usage. Compare that with Redis, equivalent worker capacity, hosting, and engineering operations for BullMQ. Durabull’s hosted dashboard fee is $0 during beta; it does not include job execution.',
      },
    ],
    sources: [
      { label: 'Trigger.dev pricing', url: 'https://trigger.dev/pricing' },
      { label: 'Self-hosting overview', url: 'https://trigger.dev/docs/self-hosting/overview' },
      { label: 'Limits', url: 'https://trigger.dev/docs/limits' },
      { label: 'MCP', url: 'https://trigger.dev/docs/mcp-introduction' },
    ],
    related: ['inngest', 'temporal', 'hatchet'],
  },
  {
    slug: 'temporal',
    name: 'Temporal Cloud',
    shortName: 'Temporal',
    website: 'https://temporal.io/pricing',
    category: 'managed-platform',
    oneLiner:
      'Replaces BullMQ with Workflows/Activities. Actions start at $50 per million on Developer.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Temporal Cloud',
    description:
      'Temporal Cloud orchestrates Workflows and bills Actions from $50/million. Durabull does not replace your broker. It operates BullMQ on Redis you already run.',
    keywords: [
      'Temporal alternative',
      'Temporal vs BullMQ',
      'Temporal Cloud pricing',
      'Temporal vs Durabull',
    ],
    alternativesTitle: 'Temporal Cloud alternatives',
    alternativesDescription:
      'Temporal alternatives if you need a job queue, not a workflow engine — or you already run BullMQ and want operations tooling instead of a second orchestrator bill.',
    intro:
      'Temporal is a durable workflow service. You run Workers; Cloud stores Event History. That architecture supports durable workflow state, timers, and recovery across process failures. It is not a BullMQ dashboard, and a “job” is not one Action.',
    howItConnects:
      'Temporal SDK. Workers poll Task Queues. Cloud or self-hosted Temporal is the service.',
    codeChanges: 'Yes. Workflows and Activities, not Queue.add.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Namespaces, not Redis environments.',
    alerts: 'Cloud observability. Not BullMQ alerts.',
    mcp: 'Official docs MCP (`https://temporal.mcp.kapa.ai`). The workflow-operations example on Code Exchange is community-contributed; assess its support and permissions separately.',
    pricing:
      'Actions start at $50/million. Developer: $50/M at every volume + 10% support + storage. Business: greater of $500/mo or 10% of usage, includes 2.5M Actions. Volume discounts on Business excess. Storage GBh extra. New PAYGO: $150 credits for 90 days.',
    license: 'Cloud commercial. Self-host Temporal separately.',
    whenToChooseThem:
      'Choose Temporal when you think in Workflows/Activities, need timers/signals/queries, and will run Workers against a dedicated orchestration cluster.',
    whenToChooseDurabull:
      'Choose Durabull when BullMQ already meets your execution requirements and the missing piece is operational visibility. Choose Temporal separately if workflow durability, signals, or long-running orchestration warrant a runtime change.',
    rows: [
      { feature: 'Model', durabull: 'BullMQ jobs on Redis', competitor: 'Workflows + Activities' },
      {
        feature: '1M Actions (Developer)',
        durabull: '$0 beta + your infrastructure',
        competitor: '$55 ($50 + 10% support)',
      },
      {
        feature: '10M Actions (Developer)',
        durabull: '$0 beta + your infrastructure',
        competitor: '$550',
      },
      {
        feature: '100M Actions (Developer)',
        durabull: '$0 beta + your infrastructure',
        competitor: '$5,500',
      },
      {
        feature: 'Official ops MCP',
        durabull: 'Yes',
        competitor: 'Docs MCP only; ops MCP is community',
      },
    ],
    costs: {
      caption:
        'Developer-plan illustration: $50 per million Actions plus 10% support, excluding storage and worker compute. Higher plans have different allowances and discounts. Actions are not jobs: model your workflow operations first. Durabull’s $0 beta dashboard fee excludes Redis, workers, and operations.',
      rows: [
        {
          volume: '1M Actions',
          competitor: '$55',
          durabull: '$0 beta + your infrastructure',
          unit: 'Action',
        },
        {
          volume: '10M Actions',
          competitor: '$550',
          durabull: '$0 beta + your infrastructure',
          unit: 'Action',
        },
        {
          volume: '100M Actions',
          competitor: '$5,500',
          durabull: '$0 beta + your infrastructure',
          unit: 'Action',
        },
      ],
    },
    faqs: [
      {
        question: 'Is one Temporal Action one job?',
        answer:
          'No. Starting a Workflow, starting/retrying an Activity, many heartbeats, timers, signals, and queries each count. A Schedule execution accrues three Actions. Compare units before comparing dollars.',
      },
    ],
    sources: [
      { label: 'Temporal pricing', url: 'https://temporal.io/pricing' },
      { label: 'Cloud pricing docs', url: 'https://docs.temporal.io/cloud/pricing' },
      { label: 'What is an Action', url: 'https://docs.temporal.io/evaluate/cloud/actions' },
      {
        label: 'Community MCP listing',
        url: 'https://temporal.io/code-exchange/temporal-mcp-server',
      },
    ],
    related: ['inngest', 'hatchet', 'trigger-dev'],
  },
  {
    slug: 'hatchet',
    name: 'Hatchet',
    shortName: 'Hatchet',
    website: 'https://hatchet.run/pricing',
    category: 'managed-platform',
    oneLiner: 'Replaces BullMQ. First 1M runs and 1M events free each month, then $30/M runs.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Hatchet',
    description:
      'Hatchet Cloud is an orchestration engine priced at $30 per million task runs after a 1M free allotment. Durabull monitors BullMQ instead of replacing the broker.',
    keywords: [
      'Hatchet alternative',
      'Hatchet vs BullMQ',
      'Hatchet pricing',
      'Hatchet vs Durabull',
    ],
    alternativesTitle: 'Hatchet alternatives',
    alternativesDescription:
      'Hatchet alternatives if you already run BullMQ on Redis and want a dashboard plus MCP, not a new engine with per-run billing after 1M tasks.',
    intro:
      'Hatchet is closer to Temporal than to Bull Board: you run workers, they run the engine. MIT self-host is advertised. Cloud PAYG retired the old Team/Starter/Growth SKUs (2026-09-29).',
    howItConnects: 'Hatchet SDK. Workers connect to Cloud or self-hosted Hatchet.',
    codeChanges: 'Yes if you leave BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Tenants on Cloud (10 on PAYG), not Redis environments.',
    alerts: 'Platform product, not BullMQ rules.',
    mcp: 'Official CLI MCP (`hatchet mcp install`). Trigger, inspect, replay Hatchet runs. Deny-by-default grants.',
    pricing:
      'Card on file: 1M task runs + 1M events free every month, then $30/M runs and $5/M events. Failed runs count; retries do not. No-card: 2,000 runs/day. Custom discounts unpublished at 100M+.',
    license: 'MIT OSS. Cloud commercial.',
    whenToChooseThem:
      'Choose Hatchet when you want durable task orchestration with workers you control, Cloud or MIT self-hosting, and published per-task pricing that excludes retries. A Hatchet run and a Temporal Action are different billing units.',
    whenToChooseDurabull: durabullOps,
    rows: [
      {
        feature: '1M task runs',
        durabull: '$0 beta + your infrastructure',
        competitor: '$0 (included)',
      },
      {
        feature: '10M task runs',
        durabull: '$0 beta + your infrastructure',
        competitor: '$270 (9×$30)',
      },
      {
        feature: '100M task runs',
        durabull: '$0 beta + your infrastructure',
        competitor: '$2,970 list',
      },
      { feature: 'Monitors BullMQ', durabull: 'Yes', competitor: 'No' },
    ],
    costs: {
      caption:
        'Hatchet Cloud PAYG task-run charges with a card on file; assumes events stay within 1M free. Storage, logs, worker compute, and volume discounts are excluded. Durabull’s $0 beta dashboard fee also excludes Redis, workers, and operations.',
      rows: [
        {
          volume: '1M runs',
          competitor: '$0',
          durabull: '$0 beta + your infrastructure',
          unit: 'task run',
        },
        {
          volume: '10M runs',
          competitor: '$270',
          durabull: '$0 beta + your infrastructure',
          unit: 'task run',
        },
        {
          volume: '100M runs',
          competitor: '$2,970 list',
          durabull: '$0 beta + your infrastructure',
          unit: 'task run',
        },
      ],
    },
    faqs: [
      {
        question: 'Do Hatchet retries cost extra?',
        answer:
          'Official pricing FAQ: retries do not count. Failed runs do. A spawned task is a second run.',
      },
    ],
    sources: [
      { label: 'Hatchet pricing', url: 'https://hatchet.run/pricing' },
      { label: 'PAYG announcement', url: 'https://hatchet.run/announcement/pay-as-you-go-pricing' },
      { label: 'CLI MCP', url: 'https://docs.hatchet.run/reference/cli/mcp' },
    ],
    related: ['temporal', 'inngest', 'trigger-dev'],
  },
  {
    slug: 'qstash',
    name: 'Upstash QStash',
    shortName: 'QStash',
    website: 'https://upstash.com/pricing/qstash',
    category: 'managed-platform',
    oneLiner: 'HTTP push queue. PAYG $1 / 100K messages. Not Redis, not BullMQ.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Upstash QStash',
    description:
      'QStash is a serverless HTTP queue at $1 per 100K messages. Durabull is not an HTTP broker. It operates BullMQ on your Redis.',
    keywords: ['QStash alternative', 'QStash vs BullMQ', 'Upstash QStash pricing'],
    intro:
      'QStash pushes messages to your HTTPS endpoints. Upstash Workflow adds durable steps at $1 / 100K steps. Neither product speaks BullMQ.',
    howItConnects: 'HTTP publish to QStash; QStash calls your URL. No Redis queue keys.',
    codeChanges: 'Yes if you leave BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Upstash projects, not Redis connections.',
    alerts: 'Not a BullMQ alerter. Prod Pack ($200/mo) adds Prometheus/Datadog export.',
    mcp: 'No official QStash ops MCP found. Machine-readable pricing markdown exists for agents.',
    pricing:
      'PAYG $1 / 100K messages. Free 1,000 messages/day. Fixed 1M/day $180/mo, 10M/day $420/mo. The reviewed pricing markdown gives conflicting retry-billing descriptions; confirm that term with Upstash before budgeting retry-heavy workloads.',
    license: 'Managed service.',
    whenToChooseThem: 'Serverless/edge HTTP workers, cron, fan-out to URLs, no Redis.',
    whenToChooseDurabull:
      'Your existing BullMQ runtime meets your needs and you want queue inspection, alerts, and MCP without changing the delivery model.',
    rows: [
      { feature: 'Broker', durabull: 'Your Redis + BullMQ', competitor: 'Upstash HTTP push' },
      {
        feature: '1M messages PAYG',
        durabull: '$0 beta + your infrastructure',
        competitor: '$10 (if 1 publish = 1 bill)',
      },
      { feature: '10M messages', durabull: '$0 beta + your infrastructure', competitor: '$100' },
      { feature: '100M messages', durabull: '$0 beta + your infrastructure', competitor: '$1,000' },
    ],
    costs: {
      caption:
        'QStash PAYG at $1 per 100K billable messages, one endpoint and successful first delivery, no fan-out or retries. Bandwidth, handler compute, and add-ons excluded. Durabull’s $0 beta dashboard fee excludes Redis, workers, and operations. Confirm retry billing with Upstash because the reviewed pricing text is inconsistent.',
      rows: [
        {
          volume: '1M messages',
          competitor: '$10',
          durabull: '$0 beta + your infrastructure',
          unit: 'published message',
        },
        {
          volume: '10M messages',
          competitor: '$100',
          durabull: '$0 beta + your infrastructure',
          unit: 'published message',
        },
        {
          volume: '100M messages',
          competitor: '$1,000',
          durabull: '$0 beta + your infrastructure',
          unit: 'published message',
        },
      ],
    },
    faqs: [
      {
        question: 'Are QStash retries free?',
        answer:
          'The official pricing markdown reviewed for this comparison contains conflicting statements about retry charges. Ask Upstash to confirm the applicable billing terms. Our illustration assumes successful first delivery to one endpoint and therefore does not depend on a retry rate.',
      },
    ],
    sources: [
      { label: 'QStash pricing', url: 'https://upstash.com/pricing/qstash' },
      { label: 'QStash pricing markdown', url: 'https://upstash.com/pricing/qstash.md' },
      { label: 'Workflow pricing.md', url: 'https://upstash.com/pricing/workflow.md' },
    ],
    related: ['inngest', 'cloudflare-queues', 'aws-sqs'],
  },
  {
    slug: 'aws-sqs',
    name: 'Amazon SQS + Step Functions',
    shortName: 'SQS',
    website: 'https://aws.amazon.com/sqs/pricing/',
    category: 'managed-platform',
    oneLiner:
      'Managed AWS queue + orchestrator. Cheap per request. Not BullMQ, and empty receives still bill.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Amazon SQS and Step Functions',
    description:
      'SQS is $0.40 per million Standard requests in us-east-1 after 1M free. Step Functions adds $25 per million state transitions. Neither monitors BullMQ.',
    keywords: ['SQS vs BullMQ', 'Step Functions pricing', 'AWS queue vs Durabull'],
    intro:
      'SQS and Step Functions can replace Redis + BullMQ. They do not inspect BullMQ jobs. Estimate SQS using send, receive, and delete requests, including empty receives; add Step Functions only if you use it for orchestration. Batching can reduce request costs.',
    howItConnects: 'AWS APIs. Workers poll SQS or are invoked by Step Functions.',
    codeChanges: 'Yes to leave BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'AWS accounts/regions.',
    alerts: 'CloudWatch, not BullMQ rules.',
    mcp: 'No BullMQ-style ops MCP.',
    pricing:
      'SQS us-east-1 Standard: $0.40/M requests, first 1M free/mo (Price List 2026-09-11). FIFO $0.50/M. Step Functions Standard: $0.000025/transition, 4,000 free/mo. Express: $1/M requests + duration.',
    license: 'AWS commercial.',
    whenToChooseThem:
      'You are already on AWS, you want a managed broker SLA, and you will write AWS-native workers.',
    whenToChooseDurabull:
      'Your Node workers already use BullMQ. Adding SQS is a rewrite. Adding Durabull is a Redis URL.',
    rows: [
      {
        feature: '1M jobs, 3 SQS req each',
        durabull: '$0 beta + Redis / workers',
        competitor: '$0.80 after free tier',
      },
      {
        feature: 'Same + 4 SF transitions',
        durabull: '$0 beta + Redis / workers',
        competitor: '~$100.70 + Lambda',
      },
      { feature: 'Understands BullMQ', durabull: 'Yes', competitor: 'No' },
    ],
    costs: {
      caption:
        'SQS Standard in us-east-1: payload under 64 KB, no batching, three requests per job, no retries or empty receives, and the full 1M monthly free-request allowance available. Excludes compute, data transfer, KMS, and Step Functions. Durabull’s fee excludes Redis, workers, and operations.',
      rows: [
        {
          volume: '1M jobs (SQS only)',
          competitor: '$0.80',
          durabull: '$0 beta + Redis / workers',
          unit: '3 API requests/job',
        },
        {
          volume: '10M jobs (SQS only)',
          competitor: '$11.60',
          durabull: '$0 beta + Redis / workers',
          unit: '3 API requests/job',
        },
        {
          volume: '100M jobs (SQS only)',
          competitor: '$119.60',
          durabull: '$0 beta + Redis / workers',
          unit: '3 API requests/job',
        },
      ],
    },
    faqs: [
      {
        question: 'Is SQS cheaper than BullMQ?',
        answer:
          'It depends on workload and infrastructure. SQS charges for requests; BullMQ uses Redis and workers you provision. Include polling, payload sizes, batching, compute, and operational effort. Step Functions is an optional additional service, not a required SQS charge. Durabull adds a dashboard, free during beta.',
      },
    ],
    sources: [
      { label: 'SQS pricing', url: 'https://aws.amazon.com/sqs/pricing/' },
      { label: 'Step Functions pricing', url: 'https://aws.amazon.com/step-functions/pricing/' },
    ],
    related: ['google-cloud-tasks', 'cloudflare-queues', 'inngest'],
  },
  {
    slug: 'google-cloud-tasks',
    name: 'Google Cloud Tasks',
    shortName: 'Cloud Tasks',
    website: 'https://cloud.google.com/tasks/pricing',
    category: 'managed-platform',
    oneLiner: 'HTTP/App Engine push queue. First 1M billable ops/mo free, then $0.40/million.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs Google Cloud Tasks',
    description:
      'Cloud Tasks is a managed push queue at $0.40 per million billable operations after 1M free. It does not monitor BullMQ.',
    keywords: ['Cloud Tasks vs BullMQ', 'Google Cloud Tasks pricing'],
    intro:
      'Cloud Tasks enqueues HTTP or App Engine tasks. That can replace a DIY queue. It cannot open a BullMQ failed job.',
    howItConnects: 'Cloud Tasks API. Handlers are HTTP endpoints or App Engine.',
    codeChanges: 'Yes to leave BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'GCP projects.',
    alerts: 'Cloud Monitoring.',
    mcp: 'No BullMQ ops MCP.',
    pricing:
      'First 1M billable operations/month free, then $0.40/million. A billable op is an API call or push attempt, chunked at 32 KB. Network extra for HTTP targets.',
    license: 'GCP commercial.',
    whenToChooseThem: 'You are on GCP and want Google to push HTTP tasks.',
    whenToChooseDurabull: 'You already have BullMQ on Redis.',
    rows: [
      {
        feature: '1M tasks, 2 ops each',
        durabull: '$0 beta + Redis / workers',
        competitor: '$0.40 after 1M free',
      },
      { feature: '10M tasks, 2 ops', durabull: '$0 beta + Redis / workers', competitor: '$7.60' },
      { feature: '100M tasks, 2 ops', durabull: '$0 beta + Redis / workers', competitor: '$79.60' },
    ],
    costs: {
      caption:
        'Cloud Tasks at $0.40 per million billable operations after the full 1M free allowance: two operations per task (enqueue and one delivery), payload no larger than 32 KB, no retries or extra API calls. Network and handler compute excluded. Durabull’s fee excludes Redis, workers, and operations.',
      rows: [
        {
          volume: '1M tasks',
          competitor: '$0.40',
          durabull: '$0 beta + Redis / workers',
          unit: '2 ops/task',
        },
        {
          volume: '10M tasks',
          competitor: '$7.60',
          durabull: '$0 beta + Redis / workers',
          unit: '2 ops/task',
        },
        {
          volume: '100M tasks',
          competitor: '$79.60',
          durabull: '$0 beta + Redis / workers',
          unit: '2 ops/task',
        },
      ],
    },
    faqs: [
      {
        question: 'Can Cloud Tasks show my BullMQ queues?',
        answer: 'No. Different API, different storage. Durabull reads BullMQ keys in Redis.',
      },
    ],
    sources: [{ label: 'Cloud Tasks pricing', url: 'https://cloud.google.com/tasks/pricing' }],
    related: ['aws-sqs', 'cloudflare-queues', 'qstash'],
  },
  {
    slug: 'cloudflare-queues',
    name: 'Cloudflare Queues',
    shortName: 'Cloudflare Queues',
    website: 'https://developers.cloudflare.com/queues/platform/pricing/',
    category: 'managed-platform',
    oneLiner:
      'Workers queue. Typically 3 operations per message. $0.40/M after 1M ops on Workers Paid.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs Cloudflare Queues',
    description:
      'Cloudflare Queues bills operations at $0.40/million after 1M included on Workers Paid. Official formula uses about 3 ops per message. Not a BullMQ monitor.',
    keywords: ['Cloudflare Queues pricing', 'Cloudflare Queues vs BullMQ'],
    intro:
      'Cloudflare Queues is the queue for Workers. Messages are not BullMQ jobs. The pricing page’s own formula is `((N × 3) − 1,000,000) / 1,000,000 × $0.40` plus the $5 Workers Paid plan.',
    howItConnects: 'Workers producer/consumer. Cloudflare-hosted.',
    codeChanges: 'Yes to leave BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Cloudflare accounts/namespaces.',
    alerts: 'Cloudflare notifications, not BullMQ.',
    mcp: 'Not a queue-ops MCP in published Queues docs.',
    pricing:
      'Workers Paid $5/mo includes 1M queue operations. Then $0.40/M. Write/read/delete each count; 64 KB chunks. Typically 3 ops/message.',
    license: 'Cloudflare commercial.',
    whenToChooseThem: 'Your runtime is Workers and you want the message to stay on Cloudflare.',
    whenToChooseDurabull: 'Your runtime is Node + Redis + BullMQ.',
    rows: [
      {
        feature: '1M messages (3 ops)',
        durabull: '$0 beta + Redis / workers',
        competitor: '$5.80 ($5 plan + $0.80 ops)',
      },
      { feature: '10M messages', durabull: '$0 beta + Redis / workers', competitor: '$16.60' },
      { feature: '100M messages', durabull: '$0 beta + Redis / workers', competitor: '$124.60' },
    ],
    costs: {
      caption:
        'Cloudflare example: three operations per message, payload no larger than 64 KB, full 1M monthly operation allowance, plus $5 Workers Paid. Excludes retries and additional Worker compute; an existing paid subscription changes the incremental cost. Durabull’s fee excludes Redis, workers, and operations.',
      rows: [
        {
          volume: '1M messages',
          competitor: '$5.80',
          durabull: '$0 beta + Redis / workers',
          unit: '3 ops/message',
        },
        {
          volume: '10M messages',
          competitor: '$16.60',
          durabull: '$0 beta + Redis / workers',
          unit: '3 ops/message',
        },
        {
          volume: '100M messages',
          competitor: '$124.60',
          durabull: '$0 beta + Redis / workers',
          unit: '3 ops/message',
        },
      ],
    },
    faqs: [
      {
        question: 'Why three operations per message?',
        answer:
          'Cloudflare documents write, read, and delete as separate billable operations, each per 64 KB. Their pricing page uses 3× messages in the worked formula.',
      },
    ],
    sources: [
      {
        label: 'Cloudflare Queues pricing',
        url: 'https://developers.cloudflare.com/queues/platform/pricing/',
      },
    ],
    related: ['qstash', 'aws-sqs', 'inngest'],
  },
  {
    slug: 'graphile-worker',
    name: 'Graphile Worker',
    shortName: 'Graphile Worker',
    website: 'https://worker.graphile.org/pricing',
    category: 'managed-platform',
    oneLiner: 'Postgres job queue (MIT). Worker Pro $100/mo. Alternative runtime, not a BullMQ UI.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs Graphile Worker',
    description:
      'Graphile Worker is a PostgreSQL job queue. OSS is free; Worker Pro is $100/mo. Durabull does not replace it. Durabull operates BullMQ on Redis.',
    keywords: ['Graphile Worker vs BullMQ', 'Graphile Worker Pro pricing'],
    intro:
      'If your jobs already live in Postgres, Graphile Worker is in-family. It is not a BullMQ monitor. Pro is a license, not a per-job meter.',
    howItConnects: 'Postgres table + Node worker. Not Redis BullMQ keys.',
    codeChanges: 'Yes to move off BullMQ.',
    autoDiscovery: 'N/A for BullMQ.',
    multiEnv: 'Your Postgres databases.',
    alerts: 'Not a BullMQ alerter.',
    mcp: 'Not documented as a queue-ops MCP.',
    pricing:
      'OSS MIT $0. Worker Pro $100/mo, or $25+/mo via GitHub Sponsors during early-access launch.',
    license: 'MIT OSS. Pro commercial.',
    whenToChooseThem: 'You want jobs in Postgres next to your primary data, not in Redis.',
    whenToChooseDurabull:
      'You already chose Redis + BullMQ and need operations, not a second queue library.',
    rows: [
      { feature: 'Store', durabull: 'Redis (BullMQ)', competitor: 'PostgreSQL' },
      {
        feature: 'Product fee',
        durabull: '$0 beta + your infrastructure',
        competitor: '$0 OSS or $100/mo Pro',
      },
      {
        feature: 'Scales with job count',
        durabull: 'No product meter',
        competitor: 'No — license',
      },
    ],
    faqs: [
      {
        question: 'Can Durabull monitor Graphile Worker?',
        answer: 'No. Durabull reads BullMQ keys in Redis.',
      },
    ],
    sources: [{ label: 'Graphile Worker pricing', url: 'https://worker.graphile.org/pricing' }],
    related: ['pg-boss', 'bull-board', 'inngest'],
  },
  {
    slug: 'pg-boss',
    name: 'pg-boss',
    shortName: 'pg-boss',
    website: 'https://pgboss.io/introduction',
    category: 'managed-platform',
    oneLiner: 'MIT Postgres job queue. No product fee. Not a BullMQ dashboard.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs pg-boss',
    description:
      'pg-boss is a PostgreSQL job queue with no product fee. Durabull is a BullMQ operations dashboard. They solve different problems.',
    keywords: ['pg-boss vs BullMQ', 'pg-boss alternative'],
    intro:
      'pg-boss is a fine Postgres queue. Comparing dashboards only makes sense after you pick a broker.',
    howItConnects: 'Postgres. Node client.',
    codeChanges: 'Yes to move off BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Your databases.',
    alerts: 'Not documented as a BullMQ-style product.',
    mcp: 'Not documented.',
    pricing: 'OSS MIT. No product fee. You pay Postgres.',
    license: 'MIT.',
    whenToChooseThem: 'You want a queue in Postgres and an MIT library with no vendor.',
    whenToChooseDurabull: 'You already run BullMQ.',
    rows: [
      { feature: 'Store', durabull: 'Redis', competitor: 'PostgreSQL' },
      { feature: 'Ops UI', durabull: 'Durabull', competitor: 'Not this product' },
      { feature: 'MCP', durabull: 'Yes', competitor: 'Not documented' },
    ],
    faqs: [
      {
        question: 'Should I replace BullMQ with pg-boss to get a UI?',
        answer:
          'A dashboard alone rarely justifies migrating queue storage and worker APIs. Add a BullMQ dashboard if your current runtime meets your needs. Evaluate pg-boss when PostgreSQL transactions, infrastructure consolidation, or its execution model are the actual requirement.',
      },
    ],
    sources: [{ label: 'pg-boss introduction', url: 'https://pgboss.io/introduction' }],
    related: ['graphile-worker', 'bull-board'],
  },
  {
    slug: 'defer',
    researchStatus: 'limited',
    name: 'Defer',
    shortName: 'Defer',
    website: 'https://www.defer.run',
    category: 'managed-platform',
    oneLiner:
      'Historical TypeScript job platform. Current availability could not be verified from official sources.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs Defer',
    description:
      'Defer’s current service availability could not be verified from official sources. Evaluate active job runtimes separately from the dashboard you use to operate them.',
    keywords: ['Defer alternative', 'defer.run shutdown', 'Defer vs BullMQ'],
    intro:
      'Defer was a managed TypeScript background-job platform. We could not verify a current service or a primary-source shutdown announcement. Customer reports of a 2024 closure are secondary evidence, so this page does not present an exact shutdown date as verified fact.',
    howItConnects: 'Current service availability unverified.',
    codeChanges: 'n/a',
    autoDiscovery: 'n/a',
    multiEnv: 'n/a',
    alerts: 'n/a',
    mcp: 'n/a',
    pricing: 'Current official pricing could not be verified.',
    license: 'n/a',
    whenToChooseThem:
      'Confirm current availability and support directly before considering a new deployment.',
    whenToChooseDurabull:
      'Choose Durabull after selecting Redis-backed BullMQ as your runtime. It adds a self-hostable operations dashboard; it does not migrate Defer jobs or implement Defer’s execution model.',
    rows: [
      {
        feature: 'Status',
        durabull: 'Hosted beta and self-hosting',
        competitor: 'Current service unverified',
      },
      {
        feature: 'Your jobs if the vendor leaves',
        durabull: 'Still in Redis',
        competitor: 'Unverified; depends on the deployment model',
      },
    ],
    faqs: [
      {
        question: 'Is Defer still available?',
        answer:
          'We could not confirm a currently available hosted product from official sources. Historical customer reports describe a shutdown, but we have not independently verified its precise date with a primary announcement.',
      },
    ],
    sources: [
      { label: 'Former product website (availability unverified)', url: 'https://www.defer.run/' },
    ],
    related: ['inngest', 'trigger-dev', 'quirrel'],
  },
  {
    slug: 'quirrel',
    name: 'Quirrel',
    shortName: 'Quirrel',
    website: 'https://docs.quirrel.dev/netlify-acquisition-faq/',
    category: 'managed-platform',
    oneLiner:
      'Hosted Quirrel ended in 2022. Self-hosting and migration require a separate assessment of the open-source project.',
    featured: false,
    alternativesPage: false,
    discontinued: true,
    title: 'Durabull vs Quirrel',
    description:
      'Quirrel’s hosted service ended in 2022. If you migrate to Redis-backed BullMQ, Durabull adds queue inspection, alerts, and MCP without executing the jobs itself.',
    keywords: ['Quirrel alternative', 'Quirrel vs BullMQ', 'quirrel.dev'],
    intro:
      'Quirrel’s official acquisition FAQ says hosted access continued through July 31, 2022 and service terminated August 1. It lists Netlify Scheduled Functions, self-hosted Quirrel, and Zeplo as migration options. Moving to BullMQ is another architecture decision; Durabull only applies after your jobs run on Redis-backed BullMQ.',
    howItConnects: 'OSS still uses Redis if you self-host. Hosted is over.',
    codeChanges: 'n/a for a new hosted project.',
    autoDiscovery: 'n/a',
    multiEnv: 'n/a',
    alerts: 'n/a',
    mcp: 'Not documented.',
    pricing: 'No hosted product to buy. OSS MIT plus your Redis.',
    license: 'MIT for the open-source project; assess current maintenance separately.',
    whenToChooseThem: 'Do not start a new hosted project on Quirrel.',
    whenToChooseDurabull:
      'If you moved those jobs to BullMQ, Durabull is the dashboard and MCP for that Redis.',
    rows: [
      { feature: 'Hosted', durabull: 'Free during beta', competitor: 'Ended 2022' },
      {
        feature: 'Migration path',
        durabull: 'Built for BullMQ',
        competitor: 'FAQ lists Netlify, self-hosting, and Zeplo',
      },
    ],
    faqs: [
      {
        question: 'Can I still use Quirrel Cloud?',
        answer:
          'Official FAQ: hosted quirrel.dev stopped accepting customers after the Netlify acquisition. Billing ended 1 August 2022.',
      },
    ],
    sources: [
      { label: 'Acquisition FAQ', url: 'https://docs.quirrel.dev/netlify-acquisition-faq/' },
      { label: 'Status', url: 'https://status.quirrel.dev/' },
    ],
    related: ['defer', 'inngest', 'bull-board'],
  },
]
