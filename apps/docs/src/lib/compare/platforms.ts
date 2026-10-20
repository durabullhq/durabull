import type { Competitor } from './types'

const durabullOps =
  'Stay on Redis + BullMQ. Durabull is the operations layer: discovery, alerts, MCP. Hosted is free to start and does not bill per job.'

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
      'Inngest replaces Redis + BullMQ and bills each function run and step. Durabull monitors the BullMQ you already run. Hosted is free to start and does not bill per job, plus a BullMQ MCP server.',
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
      'Choose Inngest when you do not have BullMQ, you want checkpointed steps, sleeps, and waits, and you accept execution billing plus Cloud (or SSPL self-host) as the orchestrator.',
    whenToChooseDurabull:
      'Choose Durabull when production already runs on Redis + BullMQ. Keep the broker you operate. Add a dashboard and MCP instead of rewriting jobs onto a metered platform.',
    rows: [
      { feature: 'Relationship to BullMQ', durabull: 'Monitors it', competitor: 'Replaces it' },
      {
        feature: 'Billed unit',
        durabull: 'No per-job product fee. Free to start.',
        competitor: 'Execution = run or step',
      },
      {
        feature: '1M billed executions',
        durabull: 'Free to start',
        competitor: '$99 Pro (included 1M)',
      },
      {
        feature: '10M executions',
        durabull: 'Free to start',
        competitor: '$499 Business (included 10M)',
      },
      {
        feature: '100M executions',
        durabull: 'Free to start',
        competitor: 'Not fully published; Pro overage bounds ~$1,584–$5,049 after 1M',
      },
      { feature: 'MCP', durabull: 'BullMQ queue ops', competitor: 'Inngest run ops' },
      {
        feature: 'Lock-in',
        durabull: 'Your Redis',
        competitor: 'Cloud must start/resume runs; self-host is SSPL',
      },
    ],
    costs: {
      caption:
        'Inngest executions only (2026-10-20 pricing page). Sandbox compute, seats, and span overages excluded. 100M uses the published Pro overage range because Business overage rates are not a public table.',
      rows: [
        {
          volume: '1M executions',
          competitor: '$99 (Pro included)',
          durabull: 'Free to start',
          unit: 'execution',
        },
        {
          volume: '10M executions',
          competitor: '$499 (Business included)',
          durabull: 'Free to start',
          unit: 'execution',
        },
        {
          volume: '100M executions',
          competitor: '$1,584–$5,049 on Pro overage bounds',
          durabull: 'Free to start',
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
      { label: 'Steps', url: 'https://www.inngest.com/docs/learn/inngest-steps' },
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
        durabull: 'Free to start + your Redis/compute',
        competitor: '~$363 usage (Pro $50 credit)',
      },
      { feature: '10M × 10s', durabull: 'Free to start + your infra', competitor: '~$3,630' },
      { feature: '100M × 10s', durabull: 'Free to start + your infra', competitor: '~$36,300' },
      { feature: 'MCP', durabull: 'BullMQ ops', competitor: 'Trigger.dev runs and deploy' },
    ],
    costs: {
      caption:
        'Official-shape example from trigger.dev/pricing: 10 seconds on small-1x (default) at $0.0000338/sec + $0.000025/run. Your duration will differ. DEV runs are free.',
      rows: [
        {
          volume: '1M runs × 10s',
          competitor: '~$363',
          durabull: 'Free to start',
          unit: 'run + compute',
        },
        {
          volume: '10M runs × 10s',
          competitor: '~$3,630',
          durabull: 'Free to start',
          unit: 'run + compute',
        },
        {
          volume: '100M runs × 10s',
          competitor: '~$36,300',
          durabull: 'Free to start',
          unit: 'run + compute',
        },
      ],
    },
    faqs: [
      {
        question: 'Is Trigger.dev cheaper than BullMQ + Durabull?',
        answer:
          'Trigger.dev bills compute on their machines. BullMQ bills whatever you already pay for Redis and workers. Durabull hosted is free to start. At 10M ten-second tasks the published Trigger.dev example is about $3,630/mo before Enterprise discounts.',
      },
    ],
    sources: [
      { label: 'Trigger.dev pricing', url: 'https://trigger.dev/pricing' },
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
      'Temporal is a durable workflow service. You run Workers; Cloud stores Event History. That is the right architecture for long-running, strictly consistent workflows. It is not a BullMQ dashboard, and a “job” is not one Action.',
    howItConnects:
      'Temporal SDK. Workers poll Task Queues. Cloud or self-hosted Temporal is the service.',
    codeChanges: 'Yes. Workflows and Activities, not Queue.add.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Namespaces, not Redis environments.',
    alerts: 'Cloud observability. Not BullMQ alerts.',
    mcp: 'Official docs MCP (`https://temporal.mcp.kapa.ai`). Workflow-ops MCP on Code Exchange is community-donated and not Temporal-supported. Do not call it an official Cloud ops MCP.',
    pricing:
      'Actions start at $50/million. Developer: $50/M at every volume + 10% support + storage. Business: greater of $500/mo or 10% of usage, includes 2.5M Actions. Volume discounts on Business excess. Storage GBh extra. New PAYGO: $150 credits for 90 days.',
    license: 'Cloud commercial. Self-host Temporal separately.',
    whenToChooseThem:
      'Choose Temporal when you think in Workflows/Activities, need timers/signals/queries, and will run Workers against a dedicated orchestration cluster.',
    whenToChooseDurabull:
      'Choose Durabull when the work is already BullMQ jobs. Do not pay Action rates to re-platform a queue that Redis already handles.',
    rows: [
      { feature: 'Model', durabull: 'BullMQ jobs on Redis', competitor: 'Workflows + Activities' },
      {
        feature: '1M Actions (Developer)',
        durabull: 'Free to start',
        competitor: '$55 ($50 + 10% support)',
      },
      { feature: '10M Actions (Developer)', durabull: 'Free to start', competitor: '$550' },
      { feature: '100M Actions (Developer)', durabull: 'Free to start', competitor: '$5,500' },
      {
        feature: 'Official ops MCP',
        durabull: 'Yes',
        competitor: 'Docs MCP only; ops MCP is community',
      },
    ],
    costs: {
      caption:
        'Developer plan, Actions only, no storage, no heartbeats (docs.temporal.io/cloud/pricing, 2026-10-20). A start + one Activity is already ~2 Actions.',
      rows: [
        { volume: '1M Actions', competitor: '$55', durabull: 'Free to start', unit: 'Action' },
        { volume: '10M Actions', competitor: '$550', durabull: 'Free to start', unit: 'Action' },
        { volume: '100M Actions', competitor: '$5,500', durabull: 'Free to start', unit: 'Action' },
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
      { label: 'What is an Action', url: 'https://docs.temporal.io/cloud/actions' },
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
      'Choose Hatchet when you want orchestration with a cheaper published per-run list price than Temporal Developer, retries not billed, and you will run workers.',
    whenToChooseDurabull: durabullOps,
    rows: [
      { feature: '1M task runs', durabull: 'Free to start', competitor: '$0 (included)' },
      { feature: '10M task runs', durabull: 'Free to start', competitor: '$270 (9×$30)' },
      { feature: '100M task runs', durabull: 'Free to start', competitor: '$2,970 list' },
      { feature: 'Monitors BullMQ', durabull: 'Yes', competitor: 'No' },
    ],
    costs: {
      caption:
        'Hatchet Cloud PAYG, events inside the 1M free allotment, 2026-10-20. Storage/log overages excluded.',
      rows: [
        { volume: '1M runs', competitor: '$0', durabull: 'Free to start', unit: 'task run' },
        { volume: '10M runs', competitor: '$270', durabull: 'Free to start', unit: 'task run' },
        {
          volume: '100M runs',
          competitor: '$2,970 list',
          durabull: 'Free to start',
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
      'PAYG $1 / 100K messages. Free 1,000 messages/day. Fixed 1M/day $180/mo, 10M/day $420/mo. Official markdown contradicts itself on retries (header “retries are free” vs FAQ “each delivery attempt counts”). Do not claim retries are free.',
    license: 'Managed service.',
    whenToChooseThem: 'Serverless/edge HTTP workers, cron, fan-out to URLs, no Redis.',
    whenToChooseDurabull:
      'You already run BullMQ. Keep Redis. Add operations, do not move traffic onto an HTTP broker.',
    rows: [
      { feature: 'Broker', durabull: 'Your Redis + BullMQ', competitor: 'Upstash HTTP push' },
      {
        feature: '1M messages PAYG',
        durabull: 'Free to start',
        competitor: '$10 (if 1 publish = 1 bill)',
      },
      { feature: '10M messages', durabull: 'Free to start', competitor: '$100' },
      { feature: '100M messages', durabull: 'Free to start', competitor: '$1,000' },
    ],
    costs: {
      caption:
        'QStash PAYG at $1 / 100K published messages. Retry billing is contradictory on the same official markdown — table assumes one bill per publish.',
      rows: [
        {
          volume: '1M messages',
          competitor: '$10',
          durabull: 'Free to start',
          unit: 'published message',
        },
        {
          volume: '10M messages',
          competitor: '$100',
          durabull: 'Free to start',
          unit: 'published message',
        },
        {
          volume: '100M messages',
          competitor: '$1,000',
          durabull: 'Free to start',
          unit: 'published message',
        },
      ],
    },
    faqs: [
      {
        question: 'Are QStash retries free?',
        answer:
          'The official pricing markdown says both “retries are free” and “each delivery attempt counts as one message.” We will not pick one. Read the current page before you model cost.',
      },
    ],
    sources: [
      { label: 'QStash pricing.md', url: 'https://upstash.com/pricing/qstash.md' },
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
      'SQS and Step Functions can replace Redis + BullMQ. They do not inspect BullMQ jobs. SQS looks cheap until you count send/receive/delete, empty long-polls, and state transitions.',
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
        durabull: 'Free to start + Redis',
        competitor: '$0.80 after free tier',
      },
      {
        feature: 'Same + 4 SF transitions',
        durabull: 'Free to start + Redis',
        competitor: '~$100.70 + Lambda',
      },
      { feature: 'Understands BullMQ', durabull: 'Yes', competitor: 'No' },
    ],
    costs: {
      caption:
        'us-east-1, payload < 64 KB, no batching, 3 requests/job, no empty receives (aws.amazon.com/sqs/pricing + Step Functions page). Empty long-polls are extra.',
      rows: [
        {
          volume: '1M jobs (SQS only)',
          competitor: '$0.80',
          durabull: 'Free to start + Redis',
          unit: '3 API requests/job',
        },
        {
          volume: '10M jobs (SQS only)',
          competitor: '$11.60',
          durabull: 'Free to start + Redis',
          unit: '3 API requests/job',
        },
        {
          volume: '100M jobs (SQS only)',
          competitor: '$119.60',
          durabull: 'Free to start + Redis',
          unit: '3 API requests/job',
        },
      ],
    },
    faqs: [
      {
        question: 'Is SQS cheaper than BullMQ?',
        answer:
          'Per published request rates, yes the queue API is cheap. You still pay workers, Lambda, empty receives, and Step Functions if you need orchestration. BullMQ cost is Redis + your compute. Durabull does not add a per-job AWS bill.',
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
        durabull: 'Free to start + Redis',
        competitor: '$0.40 after 1M free',
      },
      { feature: '10M tasks, 2 ops', durabull: 'Free to start + Redis', competitor: '$7.60' },
      { feature: '100M tasks, 2 ops', durabull: 'Free to start + Redis', competitor: '$79.60' },
    ],
    costs: {
      caption:
        'Official $0.40/M after 1M free. Assumption: 2 ops/task (enqueue + one delivery), 32 KB chunks.',
      rows: [
        {
          volume: '1M tasks',
          competitor: '$0.40',
          durabull: 'Free to start + Redis',
          unit: '2 ops/task',
        },
        {
          volume: '10M tasks',
          competitor: '$7.60',
          durabull: 'Free to start + Redis',
          unit: '2 ops/task',
        },
        {
          volume: '100M tasks',
          competitor: '$79.60',
          durabull: 'Free to start + Redis',
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
        durabull: 'Free to start + Redis',
        competitor: '$5.80 ($5 plan + $0.80 ops)',
      },
      { feature: '10M messages', durabull: 'Free to start + Redis', competitor: '$16.60' },
      { feature: '100M messages', durabull: 'Free to start + Redis', competitor: '$124.60' },
    ],
    costs: {
      caption: 'Official Cloudflare formula with 3 ops/message + $5 Workers Paid (2026-10-20).',
      rows: [
        {
          volume: '1M messages',
          competitor: '$5.80',
          durabull: 'Free to start + Redis',
          unit: '3 ops/message',
        },
        {
          volume: '10M messages',
          competitor: '$16.60',
          durabull: 'Free to start + Redis',
          unit: '3 ops/message',
        },
        {
          volume: '100M messages',
          competitor: '$124.60',
          durabull: 'Free to start + Redis',
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
      { feature: 'Product fee', durabull: 'Free to start', competitor: '$0 OSS or $100/mo Pro' },
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
          'No. Changing brokers to get a dashboard is backwards. Add Durabull to Redis, or pick a Postgres-native UI if you already use pg-boss.',
      },
    ],
    sources: [{ label: 'pg-boss introduction', url: 'https://pgboss.io/introduction' }],
    related: ['graphile-worker', 'bull-board'],
  },
  {
    slug: 'defer',
    name: 'Defer',
    shortName: 'Defer',
    website: 'https://www.defer.run',
    category: 'managed-platform',
    oneLiner: 'Shut down 1 May 2024. Domain is no longer the product.',
    featured: false,
    alternativesPage: false,
    discontinued: true,
    title: 'Durabull vs Defer',
    description:
      'Defer shut down on 1 May 2024. If you are searching for a TypeScript background-job platform, BullMQ + Durabull is a self-hosted path that does not depend on a SaaS remaining online.',
    keywords: ['Defer alternative', 'defer.run shutdown', 'Defer vs BullMQ'],
    intro:
      'Defer was a managed TypeScript job platform aimed at Next.js. The company closed. On 2026-10-20, defer.run served an unrelated DNS tool. This page exists because people still search the name.',
    howItConnects: 'Service gone.',
    codeChanges: 'n/a',
    autoDiscovery: 'n/a',
    multiEnv: 'n/a',
    alerts: 'n/a',
    mcp: 'n/a',
    pricing: 'No live official pricing. Do not quote aggregator leftovers.',
    license: 'n/a',
    whenToChooseThem: 'You would not. The product is gone.',
    whenToChooseDurabull:
      'If Defer’s shutdown is why you are here: run jobs on Redis you control, and put Durabull beside them. The dashboard can be self-hosted.',
    rows: [
      { feature: 'Status', durabull: 'Shipped', competitor: 'Shut down 2024-05-01' },
      {
        feature: 'Your jobs if the vendor leaves',
        durabull: 'Still in Redis',
        competitor: 'Platform gone',
      },
    ],
    faqs: [
      {
        question: 'Is Defer still available?',
        answer:
          'No. Customer email reported on Hacker News: unavailable as of 1 May 2024. The old hostname is not the product.',
      },
    ],
    sources: [
      { label: 'HN thread', url: 'https://news.ycombinator.com/item?id=39817493' },
      { label: 'Dealroom', url: 'https://app.dealroom.co/companies/defer' },
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
      'Hosted Quirrel ended in 2022. OSS is in maintenance mode. Author pointed self-hosters at BullMQ.',
    featured: false,
    alternativesPage: false,
    discontinued: true,
    title: 'Durabull vs Quirrel',
    description:
      'Hosted Quirrel stopped accepting customers in 2022. The MIT OSS is maintenance-mode. Durabull is the operations layer if you followed the author’s advice and moved to BullMQ.',
    keywords: ['Quirrel alternative', 'Quirrel vs BullMQ', 'quirrel.dev'],
    intro:
      'Netlify acquired Quirrel. Hosted quirrel.dev stopped new customers; access through 31 July 2022. The author told self-hosters that BullMQ is a better fit. OpenSSF Maintained score 0/10 as of the August 2026 scorecard.',
    howItConnects: 'OSS still uses Redis if you self-host. Hosted is over.',
    codeChanges: 'n/a for a new hosted project.',
    autoDiscovery: 'n/a',
    multiEnv: 'n/a',
    alerts: 'n/a',
    mcp: 'Not documented.',
    pricing: 'No hosted product to buy. OSS MIT plus your Redis.',
    license: 'MIT OSS, maintenance mode.',
    whenToChooseThem: 'Do not start a new hosted project on Quirrel.',
    whenToChooseDurabull:
      'If you moved those jobs to BullMQ, Durabull is the dashboard and MCP for that Redis.',
    rows: [
      { feature: 'Hosted', durabull: 'Free to start', competitor: 'Ended 2022' },
      {
        feature: 'Author guidance',
        durabull: 'Built for BullMQ',
        competitor: 'Author pointed at BullMQ',
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
