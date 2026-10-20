import type { Competitor } from './types'

const durabullOps =
  'Stay on Redis + BullMQ. Durabull is the operations layer: queue discovery, alerts, and MCP. It is Apache-2.0 open source for self-hosting, and the hosted dashboard is free during beta. Redis, workers, and their operation remain your responsibility.'

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
      'Inngest replaces Redis + BullMQ and bills each function run and step. Durabull monitors the BullMQ you already run and adds a BullMQ MCP server.',
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
      'You adopt the Inngest SDK. Inngest Cloud invokes your functions over HTTP or through connected workers. To self-host, run `inngest start`; it uses SQLite by default, and Postgres is required to scale beyond one node.',
    codeChanges: 'Yes. This is a new runtime, not a dashboard for current queues.',
    autoDiscovery: 'N/A. There are no BullMQ queues to discover.',
    multiEnv: 'Inngest environments and apps, not Redis connections.',
    alerts: 'Inngest Cloud observability for Inngest runs. Not BullMQ monitors.',
    mcp: 'Official Cloud MCP (`https://api.inngest.com/mcp`) and Dev Server MCP (`http://127.0.0.1:8288/mcp`). Tools list, inspect, invoke, rerun, and cancel Inngest runs. Not a BullMQ operations MCP.',
    pricing:
      'As of 2026-10-20: Free $0 with 50k executions; execution pauses at the quota. Pro from $99/mo includes 1M executions. Business from $499/mo includes 10M. An execution is one function run or one step (`Executions = runs × (steps + 1)`). Pro overage is tiered from $0.000050 down to $0.000015 per execution; tier breakpoints are not published. Sandbox compute is extra.',
    license:
      'Inngest Cloud is commercial. The server and CLI are SSPL, converting to Apache 2.0 three years after each release. The core SDKs are Apache 2.0.',
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
      { feature: 'MCP', durabull: 'BullMQ queue operations', competitor: 'Inngest run operations' },
      {
        feature: 'State and hosting',
        durabull: 'Your Redis',
        competitor: 'Inngest stores workflow state; Cloud or self-hosted server',
      },
    ],
    costs: {
      caption:
        'Inngest executions only, from the pricing page as of 2026-10-20. Sandbox compute, seats, and span overages are excluded. No 100M estimate is given because Inngest does not publish its overage tier breakpoints. This is an orchestration charge, not a dashboard fee; hosting the code that executes is separate.',
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
          'Per Inngest’s pricing FAQ, executions are metered per function run and per step inside that run. A function with five `step.run()` calls uses six executions. The pricing calculator states the formula as runs × (steps + 1).',
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
      'Replaces BullMQ. Trigger.dev Cloud runs your task code and bills compute-seconds plus $0.000025 per run.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Trigger.dev',
    description:
      'Trigger.dev Cloud runs your tasks on its machines and bills compute plus $0.000025 per run. Durabull runs no jobs; it operates your existing BullMQ workers.',
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
      'Trigger.dev Cloud is a different contract from BullMQ: it executes your task code on managed machines, so execution time usually dominates the bill. Its official MCP server triggers and monitors Trigger.dev runs, not BullMQ jobs.',
    howItConnects:
      'You adopt the Trigger.dev SDK and deploy your tasks. On Cloud, Trigger.dev machines run them. Self-hosting (Apache 2.0) is documented for Docker Compose and Kubernetes.',
    codeChanges: 'Yes. New runtime.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Trigger.dev environments (DEV runs are not charged).',
    alerts:
      'Trigger.dev alerts for Trigger.dev runs, with plan-limited destinations (Free 1, Hobby 3, Pro 100+). Not BullMQ monitors.',
    mcp: 'Official MCP server (`npx trigger.dev@latest install-mcp`). Tools trigger and monitor runs, deploy, and query data with TRQL. Not BullMQ.',
    pricing:
      'As of 2026-10-20: Free $0 with $5 usage credit. Hobby $10/mo with $10 credit. Pro $50/mo with $50 credit. Run fee $0.000025. Default small-1x machine $0.0000338/sec. Official 10-second example: $0.000363 per run. Pro concurrency add-on: $10/mo per 50 runs above 200. HIPAA BAA add-on $500/mo on Hobby and Pro.',
    license: 'Apache 2.0 open source. Cloud is commercial.',
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
        durabull: '$0 beta + your infrastructure',
        competitor: '~$363 (Pro’s $50 credit applies)',
      },
      { feature: '10M × 10s', durabull: '$0 beta + your infrastructure', competitor: '~$3,630' },
      { feature: '100M × 10s', durabull: '$0 beta + your infrastructure', competitor: '~$36,300' },
      { feature: 'MCP', durabull: 'BullMQ operations', competitor: 'Trigger.dev runs and deploys' },
    ],
    costs: {
      caption:
        'Illustrative scenario using pricing as of 2026-10-20: 10 executing seconds per run on small-1x at $0.0000338/sec plus $0.000025/run. Excludes add-ons and discounts; plan credits apply. Trigger.dev’s figure includes execution compute. Durabull’s does not: add Redis, worker compute, and operations to its dashboard fee. No throughput benchmark is implied.',
      rows: [
        {
          volume: '1M runs × 10s',
          competitor: '~$363',
          durabull: '$0 beta + your infrastructure',
          unit: 'run + compute',
        },
        {
          volume: '10M runs × 10s',
          competitor: '~$3,630',
          durabull: '$0 beta + your infrastructure',
          unit: 'run + compute',
        },
        {
          volume: '100M runs × 10s',
          competitor: '~$36,300',
          durabull: '$0 beta + your infrastructure',
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
      {
        label: 'Trigger.dev license',
        url: 'https://github.com/triggerdotdev/trigger.dev/blob/main/LICENSE',
      },
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
      'Replaces BullMQ with Workflows and Activities. Actions cost $50 per million on the Developer plan.',
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
      'Temporal alternatives if you need a job queue rather than a workflow engine, or already run BullMQ and want operations tooling instead of a second orchestrator.',
    intro:
      'Temporal is a durable workflow service. You run Workers; Cloud stores Event History. That architecture supports durable workflow state, timers, and recovery across process failures. It is not a BullMQ dashboard, and a “job” is not one Action.',
    howItConnects:
      'You adopt a Temporal SDK. Your Workers poll Task Queues on Temporal Cloud or a self-hosted Temporal Service.',
    codeChanges: 'Yes. Workflows and Activities, not Queue.add.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Namespaces, not Redis environments.',
    alerts: 'Temporal Cloud observability for Workflows. Not BullMQ alerts.',
    mcp: 'Official knowledge-base MCP for Temporal docs (`https://temporal.mcp.kapa.ai`). The workflow-operations MCP server on Temporal’s Code Exchange is community-contributed, and Temporal states it does not formally support or endorse it.',
    pricing:
      'As of 2026-10-20: Actions start at $50 per million. Developer (pay-as-you-go): $50/M at every volume, plus 10% of usage for support, plus storage. Business: greater of $500/mo or 10% of usage, includes 2.5M Actions; volume discounts apply to Actions beyond the allocation. Active and retained storage are billed per GBh. New pay-as-you-go sign-ups get $150 in credits for 90 days.',
    license:
      'Temporal Cloud is commercial. The Temporal server is MIT-licensed open source and can be self-hosted.',
    whenToChooseThem:
      'Choose Temporal when you think in Workflows and Activities, need timers, signals, and queries, and will run Workers against a dedicated orchestration service.',
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
        'Developer-plan illustration using pricing as of 2026-10-20: $50 per million Actions plus 10% support, excluding storage and worker compute. Higher plans have different allowances and discounts. Actions are not jobs: model your workflow operations first. Durabull’s $0 beta dashboard fee excludes Redis, workers, and operations.',
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
          'No. Starting a Workflow, starting or retrying an Activity, Heartbeats that reach the server, Timers, Signals, and Queries each count. Each Schedule execution accrues three Actions. Compare units before comparing dollars.',
      },
    ],
    sources: [
      { label: 'Temporal pricing', url: 'https://temporal.io/pricing' },
      { label: 'Cloud pricing docs', url: 'https://docs.temporal.io/cloud/pricing' },
      { label: 'What is an Action', url: 'https://docs.temporal.io/evaluate/cloud/actions' },
      { label: 'Docs MCP', url: 'https://docs.temporal.io/with-ai' },
      {
        label: 'Temporal server license',
        url: 'https://github.com/temporalio/temporal/blob/main/LICENSE',
      },
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
    oneLiner:
      'Replaces BullMQ. With a card on file, 1M runs and 1M events are free each month, then $30 per million runs.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Hatchet',
    description:
      'Hatchet Cloud bills $30 per million task runs after 1M free each month with a card on file. Durabull monitors BullMQ instead of replacing the broker.',
    keywords: [
      'Hatchet alternative',
      'Hatchet vs BullMQ',
      'Hatchet pricing',
      'Hatchet vs Durabull',
    ],
    alternativesTitle: 'Hatchet alternatives',
    alternativesDescription:
      'Hatchet alternatives if you already run BullMQ on Redis and want a dashboard plus MCP, not a new engine with per-run billing after 1M task runs.',
    intro:
      'Hatchet is closer to Temporal than to Bull Board: you run workers, and Hatchet runs the orchestration engine. It is MIT-licensed and can be self-hosted. On 2026-09-29, Hatchet Cloud moved to pay-as-you-go pricing and retired its Team, Starter, and Growth plans.',
    howItConnects:
      'You adopt the Hatchet SDK. Your workers connect to Hatchet Cloud or a self-hosted engine.',
    codeChanges: 'Yes if you leave BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Tenants on Hatchet Cloud (10 on pay-as-you-go), not Redis environments.',
    alerts: 'Hatchet’s own platform monitoring. Not BullMQ alert rules.',
    mcp: 'Official CLI MCP server (`hatchet mcp install`). Tools trigger, inspect, and replay Hatchet runs. Profile access is deny-by-default until granted.',
    pricing:
      'As of 2026-10-20, with a card on file: 1M task runs and 1M events free every month, then $30 per million runs and $5 per million events. Failed runs count; retries do not. Without a card: 2,000 runs and 2,000 events per day. Custom plans for 100M+ runs offer volume discounts that are not published.',
    license: 'MIT open source. Cloud is commercial.',
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
        competitor: '$270 (9M × $30/M)',
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
        'Hatchet Cloud pay-as-you-go task-run charges with a card on file, as of 2026-10-20; assumes events stay within the 1M free. Storage, logs, worker compute, and volume discounts are excluded. Durabull’s $0 beta dashboard fee also excludes Redis, workers, and operations.',
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
          'Per Hatchet’s pricing FAQ, retries are not billed: a task that fails and is retried counts as one run. Failed runs do count, and a task spawned by another task is a second run.',
      },
    ],
    sources: [
      { label: 'Hatchet pricing', url: 'https://hatchet.run/pricing' },
      {
        label: 'Pay-as-you-go announcement',
        url: 'https://hatchet.run/announcement/pay-as-you-go-pricing',
      },
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
    oneLiner:
      'Serverless HTTP push queue. Pay-as-you-go $1 per 100K messages. Not Redis, not BullMQ.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Upstash QStash',
    description:
      'Upstash QStash is a serverless HTTP push queue at $1 per 100K messages. Durabull is not an HTTP broker; it operates BullMQ on the Redis you already run.',
    keywords: ['QStash alternative', 'QStash vs BullMQ', 'Upstash QStash pricing'],
    intro:
      'QStash pushes messages to your HTTPS endpoints. Upstash Workflow adds durable steps at $1 per 100K steps. Neither product reads BullMQ.',
    howItConnects: 'HTTP publish to QStash; QStash calls your URL. No Redis queue keys.',
    codeChanges: 'Yes if you leave BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Upstash projects, not Redis connections.',
    alerts:
      'Not a BullMQ alerter. The Prod Pack add-on (+$200/mo) adds Prometheus and Datadog integrations.',
    mcp: 'No official QStash operations MCP found. Upstash publishes machine-readable pricing markdown.',
    pricing:
      'As of 2026-10-20: pay-as-you-go $1 per 100K messages. Free: 1,000 messages/day. Fixed plans: 1M messages/day for $180/mo, 10M/day for $420/mo. The pricing FAQ says each delivery attempt, including each retry, is billed as a message; the pricing markdown also says retries are free. Confirm with Upstash before budgeting retry-heavy workloads.',
    license: 'Managed service.',
    whenToChooseThem:
      'Choose QStash for serverless or edge HTTP handlers, scheduled calls, and fan-out to URLs without running Redis.',
    whenToChooseDurabull:
      'Choose Durabull when your existing BullMQ runtime meets your needs and you want queue inspection, alerts, and MCP without changing the delivery model.',
    rows: [
      { feature: 'Broker', durabull: 'Your Redis + BullMQ', competitor: 'Upstash HTTP push' },
      {
        feature: '1M messages, pay-as-you-go',
        durabull: '$0 beta + your infrastructure',
        competitor: '$10 (one delivery each)',
      },
      { feature: '10M messages', durabull: '$0 beta + your infrastructure', competitor: '$100' },
      { feature: '100M messages', durabull: '$0 beta + your infrastructure', competitor: '$1,000' },
    ],
    costs: {
      caption:
        'QStash pay-as-you-go at $1 per 100K billable messages (pricing as of 2026-10-20): one endpoint, successful first delivery, no fan-out or retries. Bandwidth, handler compute, and add-ons excluded. Retries would add billable messages under the pricing FAQ. Durabull’s $0 beta dashboard fee excludes Redis, workers, and operations.',
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
          'Budget for them. The QStash pricing FAQ says each delivery attempt counts as one message, so a retry that succeeds bills two messages. The machine-readable pricing markdown also contains a “retries are free” line, so confirm the terms with Upstash. Our illustration assumes successful first delivery to one endpoint and does not depend on a retry rate.',
      },
    ],
    sources: [
      { label: 'QStash pricing', url: 'https://upstash.com/pricing/qstash' },
      { label: 'QStash pricing markdown', url: 'https://upstash.com/pricing/qstash.md' },
      { label: 'Workflow pricing markdown', url: 'https://upstash.com/pricing/workflow.md' },
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
      'Managed AWS queue plus optional orchestrator. Low per-request prices, but every API call bills, including empty receives. Not BullMQ.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Amazon SQS and Step Functions',
    description:
      'SQS is $0.40 per million Standard requests in us-east-1 after 1M free. Step Functions adds $25 per million state transitions. Neither monitors BullMQ.',
    keywords: ['SQS vs BullMQ', 'Step Functions pricing', 'AWS queue vs Durabull'],
    intro:
      'SQS and Step Functions can replace Redis + BullMQ. They do not inspect BullMQ jobs. Estimate SQS from send, receive, and delete requests, including empty receives; add Step Functions only if you use it for orchestration. Batching can reduce request costs.',
    howItConnects: 'AWS SDKs and APIs. Workers poll SQS or are invoked by Step Functions.',
    codeChanges: 'Yes to leave BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'AWS accounts and regions.',
    alerts: 'CloudWatch alarms. Not BullMQ rules.',
    mcp: 'AWS Labs publishes open-source MCP servers for SNS/SQS (manage queues, send and receive messages) and for running Step Functions state machines. None reads BullMQ.',
    pricing:
      'As of 2026-10-20 (AWS Price List published 2026-09-11): SQS Standard in us-east-1 is $0.40 per million requests after 1M free requests per month; FIFO is $0.50 per million. Step Functions Standard is $0.000025 per state transition after 4,000 free per month. Express is $1 per million requests plus duration.',
    license: 'Proprietary AWS managed services.',
    whenToChooseThem:
      'Choose SQS when you are already on AWS, want a managed broker with an AWS SLA, and will write AWS-native workers.',
    whenToChooseDurabull:
      'Choose Durabull when your Node.js workers already use BullMQ. Moving to SQS means rewriting producers and workers; Durabull connects with a Redis URL.',
    rows: [
      {
        feature: '1M jobs, 3 SQS requests each',
        durabull: '$0 beta + your infrastructure',
        competitor: '$0.80 after free tier',
      },
      {
        feature: 'Same + 4 Step Functions transitions',
        durabull: '$0 beta + your infrastructure',
        competitor: '~$100.70 + Lambda',
      },
      { feature: 'Understands BullMQ', durabull: 'Yes', competitor: 'No' },
    ],
    costs: {
      caption:
        'SQS Standard in us-east-1, pricing as of 2026-10-20: payload under 64 KB, no batching, three requests per job, no retries or empty receives, and the full 1M monthly free-request allowance available. Excludes compute, data transfer, KMS, and Step Functions. Durabull’s $0 beta dashboard fee excludes Redis, workers, and operations.',
      rows: [
        {
          volume: '1M jobs (SQS only)',
          competitor: '$0.80',
          durabull: '$0 beta + your infrastructure',
          unit: '3 API requests/job',
        },
        {
          volume: '10M jobs (SQS only)',
          competitor: '$11.60',
          durabull: '$0 beta + your infrastructure',
          unit: '3 API requests/job',
        },
        {
          volume: '100M jobs (SQS only)',
          competitor: '$119.60',
          durabull: '$0 beta + your infrastructure',
          unit: '3 API requests/job',
        },
      ],
    },
    faqs: [
      {
        question: 'Is SQS cheaper than BullMQ?',
        answer:
          'It depends on workload and infrastructure. SQS charges for requests; BullMQ uses Redis and workers you provision. Include polling, payload sizes, batching, compute, and operational effort. Step Functions is an optional additional service, not a required SQS charge. Durabull adds a dashboard that is free during beta.',
      },
    ],
    sources: [
      { label: 'SQS pricing', url: 'https://aws.amazon.com/sqs/pricing/' },
      { label: 'Step Functions pricing', url: 'https://aws.amazon.com/step-functions/pricing/' },
      { label: 'AWS Labs MCP servers', url: 'https://github.com/awslabs/mcp' },
    ],
    related: ['google-cloud-tasks', 'cloudflare-queues', 'inngest'],
  },
  {
    slug: 'google-cloud-tasks',
    name: 'Google Cloud Tasks',
    shortName: 'Cloud Tasks',
    website: 'https://cloud.google.com/tasks/pricing',
    category: 'managed-platform',
    oneLiner:
      'HTTP and App Engine push queue. First 1M billable operations each month free, then $0.40 per million.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs Google Cloud Tasks',
    description:
      'Google Cloud Tasks is a managed HTTP push queue at $0.40 per million billable operations after 1M free each month. It does not monitor BullMQ.',
    keywords: ['Cloud Tasks vs BullMQ', 'Google Cloud Tasks pricing'],
    intro:
      'Cloud Tasks dispatches HTTP or App Engine tasks to your handlers and manages retries and rate limits. It can replace a self-managed queue, but it cannot read BullMQ jobs.',
    howItConnects: 'Cloud Tasks API. Handlers are HTTP endpoints or App Engine.',
    codeChanges: 'Yes to leave BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Google Cloud projects and locations.',
    alerts: 'Cloud Monitoring. Not BullMQ rules.',
    mcp: 'No official Cloud Tasks MCP server found; community servers exist. None reads BullMQ.',
    pricing:
      'As of 2026-10-20: first 1M billable operations per month free, then $0.40 per million. A billable operation is an API call or push delivery attempt, chunked at 32 KB. Regular network charges apply to HTTP targets.',
    license: 'Proprietary Google Cloud managed service.',
    whenToChooseThem:
      'Choose Cloud Tasks when you are on Google Cloud and want a managed service to push HTTP tasks to your handlers.',
    whenToChooseDurabull:
      'Choose Durabull when you already run BullMQ on Redis and need visibility and alerts, not a new broker.',
    rows: [
      {
        feature: '1M tasks, 2 ops each',
        durabull: '$0 beta + your infrastructure',
        competitor: '$0.40 after 1M free',
      },
      {
        feature: '10M tasks, 2 ops each',
        durabull: '$0 beta + your infrastructure',
        competitor: '$7.60',
      },
      {
        feature: '100M tasks, 2 ops each',
        durabull: '$0 beta + your infrastructure',
        competitor: '$79.60',
      },
    ],
    costs: {
      caption:
        'Cloud Tasks at $0.40 per million billable operations after the full 1M free allowance (pricing as of 2026-10-20): two operations per task (enqueue and one delivery), payload no larger than 32 KB, no retries or extra API calls. Network and handler compute excluded. Durabull’s $0 beta dashboard fee excludes Redis, workers, and operations.',
      rows: [
        {
          volume: '1M tasks',
          competitor: '$0.40',
          durabull: '$0 beta + your infrastructure',
          unit: '2 ops/task',
        },
        {
          volume: '10M tasks',
          competitor: '$7.60',
          durabull: '$0 beta + your infrastructure',
          unit: '2 ops/task',
        },
        {
          volume: '100M tasks',
          competitor: '$79.60',
          durabull: '$0 beta + your infrastructure',
          unit: '2 ops/task',
        },
      ],
    },
    faqs: [
      {
        question: 'Can Cloud Tasks show my BullMQ queues?',
        answer:
          'No. Cloud Tasks uses a different API and storage. Durabull reads BullMQ keys in Redis.',
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
      'Queue for Cloudflare Workers. Typically 3 operations per message; $0.40 per million after 1M included on Workers Paid.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs Cloudflare Queues',
    description:
      'Cloudflare Queues bills $0.40 per million operations after 1M included on Workers Paid, typically 3 operations per message. It is not a BullMQ monitor.',
    keywords: ['Cloudflare Queues pricing', 'Cloudflare Queues vs BullMQ'],
    intro:
      'Cloudflare Queues is the message queue for Workers. Messages are not BullMQ jobs. The pricing page’s own formula is `((N × 3) − 1,000,000) / 1,000,000 × $0.40`, plus the $5/mo Workers Paid minimum.',
    howItConnects:
      'Workers produce and consume messages through queue bindings; HTTP pull consumers are also supported. Cloudflare hosts the queue.',
    codeChanges: 'Yes to leave BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Cloudflare accounts and queues.',
    alerts: 'Cloudflare notifications and metrics. Not BullMQ rules.',
    mcp: 'Cloudflare publishes official MCP servers (for example Workers Bindings and Workers Observability), but we found no dedicated Queues operations server. None reads BullMQ.',
    pricing:
      'As of 2026-10-20: Workers Paid ($5/mo minimum) includes 1M queue operations per month, then $0.40 per million. Each write, read, and delete counts per 64 KB; typically 3 operations per message, and each retry adds a read. Workers Free includes 10,000 operations per day.',
    license: 'Proprietary Cloudflare managed service.',
    whenToChooseThem:
      'Choose Cloudflare Queues when your application runs on Workers and you want messages to stay on Cloudflare.',
    whenToChooseDurabull:
      'Choose Durabull when your runtime is Node.js workers on Redis + BullMQ and you need to operate those queues.',
    rows: [
      {
        feature: '1M messages (3 ops)',
        durabull: '$0 beta + your infrastructure',
        competitor: '$5.80 ($5 plan + $0.80 ops)',
      },
      { feature: '10M messages', durabull: '$0 beta + your infrastructure', competitor: '$16.60' },
      {
        feature: '100M messages',
        durabull: '$0 beta + your infrastructure',
        competitor: '$124.60',
      },
    ],
    costs: {
      caption:
        'Cloudflare example using pricing as of 2026-10-20: three operations per message, payload no larger than 64 KB, full 1M monthly operation allowance, plus $5 Workers Paid. Excludes retries and additional Worker compute; an existing paid subscription changes the incremental cost. Durabull’s $0 beta dashboard fee excludes Redis, workers, and operations.',
      rows: [
        {
          volume: '1M messages',
          competitor: '$5.80',
          durabull: '$0 beta + your infrastructure',
          unit: '3 ops/message',
        },
        {
          volume: '10M messages',
          competitor: '$16.60',
          durabull: '$0 beta + your infrastructure',
          unit: '3 ops/message',
        },
        {
          volume: '100M messages',
          competitor: '$124.60',
          durabull: '$0 beta + your infrastructure',
          unit: '3 ops/message',
        },
      ],
    },
    faqs: [
      {
        question: 'Why three operations per message?',
        answer:
          'Cloudflare documents write, read, and delete as separate billable operations, each per 64 KB, and says most messages take three operations to deliver. Its pricing page uses messages × 3 in the worked formula.',
      },
    ],
    sources: [
      {
        label: 'Cloudflare Queues pricing',
        url: 'https://developers.cloudflare.com/queues/platform/pricing/',
      },
      {
        label: 'Workers pricing',
        url: 'https://developers.cloudflare.com/workers/platform/pricing/',
      },
      {
        label: 'Cloudflare MCP servers',
        url: 'https://github.com/cloudflare/mcp-server-cloudflare',
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
    oneLiner:
      'MIT PostgreSQL job queue for Node.js. Worker Pro is $100/mo. An alternative runtime, not a BullMQ UI.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs Graphile Worker',
    description:
      'Graphile Worker is a PostgreSQL job queue for Node.js. The open-source edition is free; Worker Pro is $100/mo. Durabull operates BullMQ on Redis instead.',
    keywords: ['Graphile Worker vs BullMQ', 'Graphile Worker Pro pricing'],
    intro:
      'If your application already runs on PostgreSQL, Graphile Worker keeps jobs in the same database. It is not a BullMQ monitor. Worker Pro is a license, not a per-job meter.',
    howItConnects:
      'Jobs live in PostgreSQL tables and a Node.js worker processes them. No Redis or BullMQ keys.',
    codeChanges: 'Yes to move off BullMQ.',
    autoDiscovery: 'N/A for BullMQ.',
    multiEnv: 'Your PostgreSQL databases.',
    alerts: 'Not a BullMQ alerter.',
    mcp: 'Not documented.',
    pricing:
      'As of 2026-10-20: open source (MIT), $0. Worker Pro $100/mo, or $25+/mo via GitHub Sponsors during the early-access launch offer.',
    license: 'MIT open source. Worker Pro is proprietary.',
    whenToChooseThem:
      'Choose Graphile Worker when you want jobs in PostgreSQL next to your primary data, not in Redis.',
    whenToChooseDurabull:
      'Choose Durabull when you already run Redis + BullMQ and need operations tooling, not a second queue library.',
    rows: [
      { feature: 'Store', durabull: 'Redis (BullMQ)', competitor: 'PostgreSQL' },
      {
        feature: 'Product fee',
        durabull: '$0 beta + your infrastructure',
        competitor: '$0 open source or $100/mo Pro',
      },
      {
        feature: 'Scales with job count',
        durabull: 'No product meter',
        competitor: 'No (flat license)',
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
    oneLiner:
      'MIT PostgreSQL job queue with its own dashboard. No product fee. Does not read BullMQ.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs pg-boss',
    description:
      'pg-boss is an MIT PostgreSQL job queue for Node.js with an official dashboard and no product fee. Durabull operates BullMQ on Redis instead.',
    keywords: ['pg-boss vs BullMQ', 'pg-boss alternative'],
    intro:
      'pg-boss is a job queue for Node.js built on PostgreSQL, with an official dashboard (`@pg-boss/dashboard`) for its own jobs. It does not read BullMQ. Compare dashboards only after you have chosen a runtime.',
    howItConnects: 'A Node.js library that stores jobs in your PostgreSQL database.',
    codeChanges: 'Yes to move off BullMQ.',
    autoDiscovery: 'N/A.',
    multiEnv: 'Your PostgreSQL databases; one dashboard can monitor several pg-boss instances.',
    alerts: 'No alert delivery documented. The dashboard can show persisted warnings.',
    mcp: 'Not documented.',
    pricing: 'Open source (MIT). No product fee. You pay for PostgreSQL.',
    license: 'MIT open source.',
    whenToChooseThem:
      'Choose pg-boss when you want jobs in PostgreSQL and an MIT library with no vendor service.',
    whenToChooseDurabull:
      'Choose Durabull when you already run BullMQ on Redis and need a dashboard, alerts, and MCP for it.',
    rows: [
      { feature: 'Store', durabull: 'Redis', competitor: 'PostgreSQL' },
      {
        feature: 'Operations UI',
        durabull: 'Durabull (BullMQ)',
        competitor: '`@pg-boss/dashboard` (pg-boss jobs)',
      },
      { feature: 'MCP', durabull: 'Yes', competitor: 'Not documented' },
    ],
    faqs: [
      {
        question: 'Should I replace BullMQ with pg-boss to get a UI?',
        answer:
          'pg-boss does ship an official dashboard, but a dashboard alone rarely justifies migrating queue storage and worker APIs. Add a BullMQ dashboard if your current runtime meets your needs. Evaluate pg-boss when PostgreSQL transactions, infrastructure consolidation, or its execution model are the actual requirement.',
      },
    ],
    sources: [
      { label: 'pg-boss introduction', url: 'https://pgboss.io/introduction' },
      { label: 'pg-boss dashboard', url: 'https://pgboss.io/dashboard' },
    ],
    related: ['graphile-worker', 'bull-board'],
  },
  {
    slug: 'defer',
    researchStatus: 'limited',
    name: 'Defer',
    shortName: 'Defer',
    website: 'https://github.com/defer-run',
    category: 'managed-platform',
    oneLiner:
      'Former TypeScript background-job platform. No current service found; a customer-posted notice dates the shutdown to May 1, 2024.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs Defer',
    description:
      'Defer, a managed TypeScript job platform, appears to have ended service in 2024. Compare active job runtimes separately from the dashboard that operates them.',
    keywords: ['Defer alternative', 'defer.run shutdown', 'Defer vs BullMQ'],
    intro:
      'Defer was a managed TypeScript background-job platform. Its former domain now redirects to an unrelated product, and its GitHub repositories have not been updated since 2024. A customer posted Defer’s end-of-service email on Hacker News, which gives May 1, 2024 as the end date. We found no first-party announcement, so treat that date as secondary evidence.',
    howItConnects: 'No current service found.',
    codeChanges: 'n/a',
    autoDiscovery: 'n/a',
    multiEnv: 'n/a',
    alerts: 'n/a',
    mcp: 'n/a',
    pricing: 'No current official pricing.',
    license: 'n/a',
    whenToChooseThem:
      'Confirm current availability and support directly before considering a new deployment.',
    whenToChooseDurabull:
      'Choose Durabull after selecting Redis-backed BullMQ as your runtime. It adds a self-hostable operations dashboard; it does not migrate Defer jobs or implement Defer’s execution model.',
    rows: [
      {
        feature: 'Status',
        durabull: 'Hosted beta and self-hosting',
        competitor: 'No current service found',
      },
      {
        feature: 'Your jobs if the vendor leaves',
        durabull: 'Still in Redis',
        competitor: 'Not applicable; no current service found',
      },
    ],
    faqs: [
      {
        question: 'Is Defer still available?',
        answer:
          'We found no current Defer service. A customer-posted copy of Defer’s end-of-service email says the service would no longer be available as of May 1, 2024. We found no first-party announcement, so that date is secondary evidence.',
      },
    ],
    sources: [
      { label: 'Defer GitHub organization', url: 'https://github.com/defer-run' },
      {
        label: 'Customer-posted end-of-service email (Hacker News, secondary)',
        url: 'https://news.ycombinator.com/item?id=39817493',
      },
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
      'Quirrel’s hosted service ended in 2022. If you move those jobs to Redis-backed BullMQ, Durabull adds queue inspection, alerts, and MCP without running jobs.',
    keywords: ['Quirrel alternative', 'Quirrel vs BullMQ', 'quirrel.dev'],
    intro:
      'Quirrel’s official acquisition FAQ says existing accounts could log in through July 31, 2022, and the service terminated on August 1. It lists Netlify Scheduled Functions, self-hosted Quirrel, and Zeplo as migration options. Its author has since called the project maintenance mode and suggested libraries such as BullMQ for self-hosting. Moving to BullMQ is a separate architecture decision; Durabull applies only after your jobs run on Redis-backed BullMQ.',
    howItConnects:
      'The open-source server uses Redis when self-hosted. The hosted service has ended.',
    codeChanges: 'n/a for a new hosted project.',
    autoDiscovery: 'n/a',
    multiEnv: 'n/a',
    alerts: 'n/a',
    mcp: 'Not documented.',
    pricing: 'No hosted product to buy. The open-source server is MIT-licensed; you pay for Redis.',
    license:
      'MIT. The author describes the project as maintenance mode; the last commit to the main repository was in June 2023.',
    whenToChooseThem:
      'Hosted Quirrel is no longer available. Self-hosting remains possible, but assess maintenance before starting a new project.',
    whenToChooseDurabull:
      'If you moved those jobs to BullMQ, Durabull provides the dashboard, alerts, and MCP for that Redis.',
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
          'No. The official FAQ says Quirrel stopped accepting new customers after the Netlify acquisition, existing accounts could log in through July 31, 2022, and the service terminated on August 1, 2022, with no charges after the final July bill.',
      },
    ],
    sources: [
      { label: 'Acquisition FAQ', url: 'https://docs.quirrel.dev/netlify-acquisition-faq/' },
      { label: 'Status page (shutdown notice)', url: 'https://status.quirrel.dev/' },
      {
        label: 'Author on maintenance status',
        url: 'https://github.com/quirrel-dev/quirrel/discussions/1169',
      },
    ],
    related: ['defer', 'inngest', 'bull-board'],
  },
]
