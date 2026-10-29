import type { Article, SourceLink } from './types'

const references = {
  production: {
    label: 'BullMQ: going to production',
    url: 'https://docs.bullmq.io/guide/going-to-production',
  },
  metrics: { label: 'BullMQ: native metrics', url: 'https://docs.bullmq.io/guide/metrics' },
  prometheus: {
    label: 'BullMQ: Prometheus export',
    url: 'https://docs.bullmq.io/guide/metrics/prometheus',
  },
  retry: {
    label: 'BullMQ: retries and backoff',
    url: 'https://docs.bullmq.io/guide/retrying-failing-jobs',
  },
  manualRetry: {
    label: 'BullMQ: retrying a finished job',
    url: 'https://docs.bullmq.io/guide/jobs/retrying-job',
  },
  idempotency: {
    label: 'BullMQ: idempotent jobs',
    url: 'https://docs.bullmq.io/patterns/idempotent-jobs',
  },
  stalled: {
    label: 'BullMQ: stalled jobs',
    url: 'https://docs.bullmq.io/guide/workers/stalled-jobs',
  },
  retention: {
    label: 'BullMQ: automatic job removal',
    url: 'https://docs.bullmq.io/guide/queues/auto-removal-of-jobs',
  },
  postgres: {
    label: 'BullMQ: optional PostgreSQL backend',
    url: 'https://docs.bullmq.io/guide/postgresql',
  },
  board: {
    label: 'Bull Board: official repository and documentation',
    url: 'https://github.com/felixmosh/bull-board',
  },
  taskforce: { label: 'Taskforce.sh: product and features', url: 'https://taskforce.sh/' },
  workbench: { label: 'Workbench: product and features', url: 'https://getworkbench.dev/' },
  insight: {
    label: 'Redis Insight: official documentation',
    url: 'https://redis.io/docs/latest/develop/tools/insight/',
  },
  scan: {
    label: 'Redis: SCAN command semantics',
    url: 'https://redis.io/docs/latest/commands/scan/',
  },
  inngest: {
    label: 'Inngest: pricing and execution definition',
    url: 'https://www.inngest.com/pricing',
  },
  inngestExecution: {
    label: 'Inngest: durable workflow execution',
    url: 'https://www.inngest.com/docs/durable-execution/durable-workflows',
  },
  triggerMachines: {
    label: 'Trigger.dev: machine configuration',
    url: 'https://trigger.dev/docs/machines',
  },
  triggerWait: { label: 'Trigger.dev: durable waits', url: 'https://trigger.dev/docs/wait' },
  trigger: { label: 'Trigger.dev: Cloud pricing', url: 'https://trigger.dev/pricing' },
  temporal: { label: 'Temporal: platform architecture', url: 'https://docs.temporal.io/temporal' },
  mcpSpec: {
    label: 'MCP specification: tool behavior',
    url: 'https://modelcontextprotocol.io/specification/2026-07-28/server/tools',
  },
  connections: {
    label: 'Durabull: connection management',
    url: 'https://durabull.io/documentation/getting-started/connection-management',
  },
  nativeMetrics: {
    label: 'Durabull: BullMQ native metrics',
    url: 'https://durabull.io/documentation/workflows/bullmq-native-metrics',
  },
  health: {
    label: 'Durabull: Redis health and alert coverage',
    url: 'https://durabull.io/documentation/workflows/redis-health-alerts',
  },
  mcp: {
    label: 'Durabull: MCP tools, authorization, and limitations',
    url: 'https://durabull.io/documentation/integrations/mcp-server',
  },
  deployment: {
    label: 'Durabull: Cloud and self-hosted deployments',
    url: 'https://durabull.io/documentation/deployment/cloud-vs-self-hosted',
  },
  pricing: { label: 'Durabull: current pricing', url: 'https://durabull.io/pricing' },
} satisfies Record<string, SourceLink>

type Reference = keyof typeof references
const sources = (...keys: Reference[]): SourceLink[] => keys.map((key) => references[key])
const urls = (...keys: Reference[]): string[] => sources(...keys).map((source) => source.url)

export const articles: Article[] = [
  {
    slug: 'how-to-monitor-bullmq-in-production',
    title: 'How to monitor BullMQ in production',
    description:
      'A practical BullMQ monitoring runbook: queue inventory, native metrics, backlog diagnosis, Redis alerts, and safe recovery, with a working TypeScript example.',
    category: 'Operations',
    takeaway:
      'Monitor customer waiting time, processing progress, failures, and Redis health together. A queue count alone cannot tell you whether work is on time.',
    keywords: [
      'how to monitor BullMQ',
      'BullMQ production monitoring',
      'BullMQ metrics',
      'BullMQ alerts',
    ],
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    intro:
      'A worker can be alive while its queue makes no useful progress. Effective monitoring connects the queue inventory to finished-job trends, failure evidence, Redis capacity, and an action the on-call engineer can take. This guide covers Redis-backed BullMQ queues, which are the queues Durabull currently inspects.',
    sections: [
      {
        heading: '1. Establish what should be running',
        body: [
          'Start with an inventory: environment, Redis endpoint and logical database, queue prefix, queue name, owning service, and expected workload. Include quiet queues and periodic work. An empty overnight queue may be healthy; a daily report queue that never receives its expected job may represent an incident.',
          'Durabull discovers queue metadata in Redis using the configured prefix. Match that prefix to the producer and worker configuration, and check network access before interpreting an empty list. Discovery covers the connected database; it is not proof that every service or environment has been connected.',
          'BullMQ v6 also ships an optional PostgreSQL backend. This runbook covers Redis only, and Durabull does not currently support PostgreSQL-backed queues. Confirm the backend and library version before selecting a dashboard.',
        ],
        sourceUrls: urls('connections', 'postgres'),
      },
      {
        heading: '2. Enable historical metrics deliberately',
        body: [
          'BullMQ native throughput history records completed and failed jobs in minute buckets. Enable `metrics.maxDataPoints` on every worker for a queue, using the same retention setting. The example retains one week. Replace the sample processor with your real handler; creating an extra worker in production changes who consumes jobs.',
          'Live state counts and historical throughput answer different questions. A failed-set count includes retained jobs; it is not the number of failures in the last five minutes. Native `getMetrics()` history also differs from Prometheus state-count export, which can expose current counts without that history. Do not treat missing historical data as zero failures.',
        ],
        code: {
          language: 'typescript',
          caption: 'Add metrics to your existing worker configuration.',
          value: `import { MetricsTime, Worker } from 'bullmq'\n\nconst worker = new Worker('emails', async (job) => {\n  await job.log('Starting email delivery')\n  await deliverEmail(job.data) // Your application handler\n}, {\n  connection: { host: '127.0.0.1', port: 6379 },\n  metrics: { maxDataPoints: MetricsTime.ONE_WEEK },\n})\n\nworker.on('error', (error) => console.error(error))`,
        },
        sourceUrls: urls('metrics', 'prometheus', 'nativeMetrics'),
      },
      {
        heading: '3. Diagnose backlog before adding workers',
        body: [
          'Choose a customer-facing target, such as transactional mail beginning within a minute. Track the age of the oldest waiting job alongside waiting, active, delayed, and completed counts. A large scheduled workload is different from ready work that cannot start. Record the observation window so a brief traffic spike is not confused with persistent overload.',
          'Use a short decision sequence: confirm the queue is not intentionally paused; inspect worker availability; check rate limits and concurrency; inspect representative active and failed jobs; then compare Redis health with application logs. If completions continue but arrivals are faster, capacity may be the issue. If downstream requests time out, adding workers can increase pressure on the dependency.',
          'For repeated stalls, inspect CPU-heavy processing and event-loop blocking. A worker must keep renewing its job lock; a stalled job returns to waiting and is processed again, and moves to failed once it exceeds the stall limit. Close workers with `await worker.close()` on SIGTERM so routine deploys do not create stalls. Increasing a timeout without finding the cause can hide the symptom while extending recovery time.',
        ],
        sourceUrls: urls('nativeMetrics', 'stalled', 'production'),
      },
      {
        heading: '4. Alert on actionable conditions and missing evidence',
        body: [
          'Pair a backlog or failure alert with an owner, a runbook, and a relevant environment. Start with thresholds based on your workload, observe normal peaks, then tune. An example policy is sustained waiting work with no completions during an expected processing window. Durabull’s queue-stalled rule implements that pattern, but the window is yours to choose and validate; there is no universal threshold.',
          'BullMQ requires Redis `maxmemory-policy` set to `noeviction`; evicting BullMQ keys can break queue state, so treat any key eviction as an incident. Durabull Redis health rules evaluate memory, client capacity, eviction rates, and other INFO-derived signals. Missing INFO fields remain unavailable; they do not prove recovery. Percentage memory alerts need an explicit Redis `maxmemory` limit; use an absolute allocation threshold when that denominator is unavailable.',
          'Test the entire notification path with a controlled staging failure. Verify the recipient, delivery result, incident resolution, and what happens when monitoring itself stops. A configured destination is not evidence that somebody receives the alert.',
        ],
        sourceUrls: urls('production', 'health'),
      },
      {
        heading: '5. Close the loop with controlled recovery',
        body: [
          'Before a retry, identify the failed side effect and check whether it may already have succeeded. Payment, email, and provisioning jobs need business-level idempotency. Fix the cause, retry one representative job, and inspect its terminal result before widening recovery.',
          'Retain enough failed-job evidence to investigate, while bounding completed and failed history to your storage budget. Record a recovery note with the original failure, deployed fix, affected job IDs, and observed outcome. A job returning to waiting means it was re-enqueued; only a later result establishes that processing succeeded.',
        ],
        sourceUrls: urls('idempotency', 'manualRetry', 'retention'),
      },
    ],
    faqs: [
      {
        question: 'Do I need to change workers to use Durabull?',
        answer:
          'Queue and job inspection connects to Redis without a worker SDK. Historical completion charts need BullMQ metrics enabled, and job logs require application calls to job.log().',
      },
      {
        question: 'Why are my BullMQ charts empty?',
        answer:
          'Check worker metrics configuration, consistent retention across workers, recent completed or failed work, and the selected Redis connection and prefix. An empty history is not necessarily zero traffic.',
      },
      {
        question: 'Does a larger failed count mean the current failure rate increased?',
        answer:
          'Not necessarily. The failed set retains jobs according to your cleanup policy. Use a defined observation window and failure events or native metric buckets to assess recent failures.',
      },
    ],
    sources: sources(
      'production',
      'metrics',
      'prometheus',
      'nativeMetrics',
      'connections',
      'health',
      'stalled',
      'manualRetry',
      'idempotency',
      'retention',
      'postgres'
    ),
    relatedCompare: ['bull-board', 'taskforce', 'datadog', 'grafana'],
  },
  {
    slug: 'best-bullmq-dashboards-2026',
    title: 'Best BullMQ dashboards in 2026: choose by workflow',
    description:
      'A source-backed shortlist of BullMQ dashboards, with practical evaluation criteria for embedded UIs, team operations, metrics, MCP, and backend compatibility.',
    category: 'Buying guides',
    takeaway:
      'Choose the dashboard that fits your backend, access model, and recovery workflow. Test it on your queues before choosing on appearance or a feature checklist.',
    keywords: [
      'best BullMQ dashboard',
      'BullMQ UI 2026',
      'Bull Board alternative',
      'BullMQ monitoring tools',
    ],
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    intro:
      'Bull Board, Workbench, Taskforce.sh, and Durabull address overlapping needs with different deployment and operational choices. This shortlist uses official product documentation reviewed on 20 October 2026. It is written by Durabull, so we explain where other tools fit and distinguish documented features from our evaluation advice.',
    sections: [
      {
        heading: 'Start with three requirements',
        body: [
          'First, identify your backend and BullMQ version. Redis is not the only backend documented by current BullMQ. A Redis-connected dashboard does not automatically support PostgreSQL-backed queues, and advertised support for Bull does not establish support for every BullMQ or BullMQ Pro feature.',
          'Second, choose where access belongs: in an existing admin application, in a separately deployed service, or on an individual developer’s machine. Third, define the incident workflow: who can see payloads, who can retry, how someone is notified, and how an action is reviewed afterward.',
          'These requirements make the shortlist smaller before any visual preference enters the decision. A polished job table is useful, but a missing production connection or the wrong access boundary matters more during an incident.',
        ],
        sourceUrls: urls('postgres', 'board', 'connections'),
      },
      {
        heading: 'Bull Board: a strong choice for an existing admin application',
        body: [
          'Bull Board offers framework adapters and a CLI path for standalone use. Its current documentation covers queue controls, flow graphs, and an optional historical metrics package, currently in beta. It also documents support for BullMQ v6 queues stored in PostgreSQL. Evaluate the current release rather than assuming the feature set of an older embedded installation.',
          'Choose it when your team already owns authentication, deployment, and the surrounding admin experience. In a trial, check whether the UI can be exposed only to the intended users and whether the configured queue inventory covers all the work they need to operate. Embedding can be an advantage when you want queue inspection alongside your own customer-support tools.',
        ],
        sourceUrls: urls('board'),
      },
      {
        heading: 'Workbench: evaluate the developer investigation experience',
        body: [
          'Workbench presents job inspection, flow graphs, scheduler views, and error grouping in a BullMQ-focused interface. These are useful capabilities to evaluate when developers spend most of their time tracing a failure through related jobs.',
          'Try a real multi-step flow, a failed job with several attempts, and a payload large enough to resemble production. Check whether the installation mode you intend to use provides the same discovery, authentication, and integration features shown in the product overview. Do not assume that desktop, Docker, and embedded deployment modes have identical setup requirements.',
        ],
        sourceUrls: urls('workbench'),
      },
      {
        heading: 'Taskforce.sh: evaluate a dedicated managed dashboard',
        body: [
          'Taskforce.sh is a commercial dashboard from the BullMQ team. Its product documentation includes queue management, monitoring, MCP access, alerts by email, Slack, or PagerDuty, and a connector that reaches Redis without exposing it publicly. It deserves consideration when you want a vendor-supported operational interface without maintaining an embedded dashboard yourself.',
          'Evaluate connectivity from your actual network, plan limits, notification routing, and the workflow for inviting another operator. Include staging and regional databases when estimating your connection requirements. A plan sized for one production Redis may not match the number of environments an on-call rotation needs to inspect.',
        ],
        sourceUrls: urls('taskforce'),
      },
      {
        heading: 'Durabull: evaluate fleet visibility and agent-assisted operations',
        body: [
          'Durabull is Apache-2.0 open source. It connects to Redis-backed BullMQ queues and groups connections by environment. It combines queue inspection, Redis health history, alerts, and scoped MCP tools. Alerts are delivered by email, signed webhooks, or Linear today; Slack and PagerDuty delivery are coming soon. Historical BullMQ throughput still requires worker metrics, and some Redis providers restrict worker or INFO introspection.',
          'Choose it for evaluation when multiple Redis environments and a shared human-and-agent workflow are central requirements. Test missing permissions and incomplete metrics as well as the happy path. The hosted app has a Free plan, with Team at $9/month and Business at $29/month per organization. Self-hosting brings deployment and monitoring responsibilities.',
        ],
        sourceUrls: urls('connections', 'nativeMetrics', 'mcp', 'health', 'pricing', 'deployment'),
      },
      {
        heading: 'Run the same acceptance test on every finalist',
        body: [
          'Use staging with a custom prefix, a scheduled job, a failed job, and a parent-child flow. Ask an engineer who did not install the tool to find the failure, explain its cause, identify the correct environment, and recover it once. Record the steps and any missing evidence; this is a practical comparison, not a synthetic performance benchmark.',
          'Then test the less attractive cases: a restricted Redis account, an unavailable connection, absent historical metrics, and a user who should not make changes. Measure whether the interface makes those limits clear. Redis Insight remains useful for database investigation, but its documented core workflow is broader Redis inspection; it should not be counted as equivalent queue recovery coverage.',
        ],
        sourceUrls: urls('nativeMetrics', 'mcp', 'insight'),
      },
    ],
    faqs: [
      {
        question: 'Which BullMQ dashboard is best for an embedded admin UI?',
        answer:
          'Bull Board is a strong starting point when you already maintain the host application, access controls, and queue registration. Evaluate Workbench if its developer investigation workflow better fits your team.',
      },
      {
        question: 'Which dashboards should I evaluate for team operations?',
        answer:
          'Taskforce.sh and Durabull are useful candidates for a dedicated operations interface. Compare actual network connectivity, access controls, alerts, backend compatibility, and current pricing.',
      },
      {
        question: 'Is this a benchmark or an independent ranking?',
        answer:
          'No. This is a Durabull-authored, documentation-based shortlist with a repeatable evaluation method. It does not claim measured performance or that one tool is best for every team.',
      },
    ],
    sources: sources(
      'board',
      'workbench',
      'taskforce',
      'postgres',
      'connections',
      'nativeMetrics',
      'health',
      'mcp',
      'pricing',
      'deployment',
      'insight'
    ),
    relatedCompare: ['bull-board', 'workbench', 'taskforce', 'queuedash', 'bullpane'],
  },
  {
    slug: 'bullmq-mcp-server-for-ai-agents',
    title: 'BullMQ MCP: give AI agents useful queue evidence',
    description:
      'Connect an AI assistant to BullMQ through Durabull MCP, understand scopes and redaction limits, and follow an evidence-first workflow for safe job recovery.',
    category: 'AI & MCP',
    takeaway:
      'Start with scoped read access. Let the agent gather evidence, then authorize a specific recovery action and verify its result.',
    keywords: [
      'BullMQ MCP',
      'MCP server BullMQ',
      'ChatGPT BullMQ',
      'Claude queue monitoring',
      'Durabull MCP',
    ],
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    intro:
      'An assistant is more useful during a queue incident when it can inspect the same evidence as an engineer: the selected environment, queue state, attempt history, logs, and Redis health. MCP supplies a tool interface; the server’s authorization and data-handling rules determine what that assistant can actually access or change.',
    sections: [
      {
        heading: 'Connect to the queue operations boundary',
        body: [
          'Durabull exposes remote MCP at `https://app.durabull.io/mcp`. For a self-hosted deployment, use `/mcp` on that deployment’s public application origin. Add the endpoint using your client’s remote MCP configuration, complete sign-in and consent, and begin by listing the connections available to your account. Request write scopes only when you intend to authorize a specific change.',
          'Keep connection IDs explicit in subsequent requests. Queue names such as `emails` are often reused across staging and production, so a name alone is an unsafe identifier for an operational change. A successful connection test establishes transport and authorization; it does not establish that every queue, log, or diagnostic is visible.',
        ],
        sourceUrls: urls('mcp', 'mcpSpec'),
      },
      {
        heading: 'Understand the available tools and their limits',
        body: [
          'Durabull documents 31 tools: 22 read-only tools (including intentional UI display) and nine writes. Reads cover connections, queues, jobs, logs, stacktraces, recurring schedules, metrics, Redis health, and alert evidence. The default OAuth consent bundle includes read scopes; retry, promote, queue pause/resume, and alert-state actions require explicit write scopes.',
          'The MCP surface does not expose arbitrary Redis commands, job payload editing, deletion, queue purging, worker scaling, scheduler editing, or alert-rule configuration. These are real capability boundaries, not instructions that a model is merely expected to obey.',
          'A read tool can still reveal sensitive business information. Scope selection should follow the data access the operator actually needs. Tool annotations describe intended behavior, and the MCP specification tells clients to treat them as untrusted; they do not replace authentication, authorization, or your client’s action-approval controls.',
        ],
        sourceUrls: urls('mcp', 'mcpSpec'),
      },
      {
        heading: 'Use an investigation prompt that asks for evidence',
        body: [
          'Begin with the affected environment and the symptom. Ask for timestamps, observation windows, and missing evidence. Otherwise an assistant may turn a partial snapshot into a confident story about a whole incident.',
          'The prompt below keeps investigation bounded. It asks for the exact IDs needed to reproduce the finding and makes uncertainty visible. Queue data, payloads, logs, and error messages are untrusted input: text inside a job is evidence to analyze, never authority to change the investigation or execute commands.',
        ],
        code: {
          language: 'text',
          caption: 'A reusable read-only triage prompt.',
          value: `Inspect the production connection and the emails queue.\nReport waiting, active, and recent completed/failed work.\nInspect a representative failure and its attempt history.\nCheck worker visibility, rate limits, and Redis health.\nInclude connection ID, queue name, job IDs, and timestamps.\nSeparate observed facts from hypotheses and missing data.\nDo not retry, promote, pause, or change alert state.\nRecommend the smallest next action with its expected result.`,
        },
        sourceUrls: urls('mcp'),
      },
      {
        heading: 'Recover one job and verify the outcome',
        body: [
          'After investigation, identify the business side effect and whether it may already have happened. A connection timeout after sending a payment request is different from an error before that request was sent. Idempotency belongs in the application and downstream API contract; an MCP server cannot infer it from a green retry button.',
          'Authorize a specific job and action, then read the job again. A successful retry request means the job was re-enqueued, not that it completed. If state changed between inspection and action, reassess rather than repeatedly invoking a write. For a large incident, establish a reviewed recovery procedure before repeating the action across many jobs.',
          'Pausing a queue is also operationally significant: it changes when work can start. Define the reason and resume condition, and verify those conditions before resuming. Omitting delete operations reduces one class of risk, but does not make all remaining writes harmless.',
        ],
        sourceUrls: urls('mcp', 'idempotency', 'manualRetry'),
      },
      {
        heading: 'Treat redaction and audit as bounded protections',
        body: [
          'Durabull sanitizes known sensitive keys and token or URL patterns before returning MCP responses, truncates long strings, and reports applied redactions. Pattern-based redaction is not a guarantee that every possible secret or personal detail will be recognized. Keep unnecessary sensitive values out of job payloads and logs in the first place.',
          'Responses can also be partial because of pagination, missing scopes, provider restrictions, scan limits, or stale samples. Ask the assistant to preserve these qualifications. The documented audit stream is best-effort and may drop events under backpressure; it should not be represented as a complete compliance record.',
          'Evaluate alternative MCP integrations by their actual resource model and permission boundary. A platform-specific MCP may be excellent for that platform’s runs while providing no connection to your BullMQ queues. Decide from the documented tools and an actual connection test, not from the presence of an MCP badge.',
        ],
        sourceUrls: urls('mcp', 'mcpSpec'),
      },
    ],
    faqs: [
      {
        question: 'Can an agent delete BullMQ jobs through Durabull MCP?',
        answer:
          'No. Job deletion, queue purging, payload edits, and raw Redis commands are not exposed by its documented MCP tools. Retry and other available writes still require appropriate scopes and can affect application behavior.',
      },
      {
        question: 'Does redaction guarantee the model never sees a secret?',
        answer:
          'No. Durabull sanitizes known sensitive fields and patterns, but arbitrary business data can contain information a pattern does not recognize. Minimize sensitive payloads and restrict access.',
      },
      {
        question: 'Does a successful retry tool call prove a job succeeded?',
        answer:
          'No. It establishes that the recovery action was accepted. Inspect the job afterward to confirm its state and application outcome.',
      },
    ],
    sources: sources('mcp', 'mcpSpec', 'idempotency', 'manualRetry'),
    relatedCompare: ['taskforce', 'workbench', 'bullpane', 'inngest'],
  },
  {
    slug: 'inngest-vs-bullmq-durabull-cost',
    title: 'Inngest vs BullMQ + Durabull: model the actual cost',
    description:
      'Translate Inngest runs and steps into executions, compare published plan allowances, and build a fair cost model that includes BullMQ infrastructure.',
    category: 'Cost analysis',
    takeaway:
      'A business job is not an Inngest execution. Count runs and steps first, then compare full operating costs rather than a SaaS invoice against a free dashboard.',
    keywords: ['Inngest pricing', 'Inngest vs BullMQ', 'Inngest cost', 'durable functions cost'],
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    intro:
      'Inngest and BullMQ are runtime choices; Durabull is an operations interface for Redis-backed BullMQ. A useful cost comparison starts with an equivalent workload and makes each billing unit visible. The examples below use public USD prices reviewed on 20 October 2026, exclude taxes and negotiated discounts, and are estimates rather than vendor quotes.',
    sections: [
      {
        heading: 'Translate business work into billed executions',
        body: [
          'Inngest’s published calculator uses `executions = runs × (steps + 1)`. One function run with five `step.run()` calls therefore consumes six executions. One million such runs produces six million executions; it is not covered by an allowance of one million executions.',
          'Make a workload inventory before estimating. Separate simple notifications from multi-step workflows, assign a monthly run count to each class, and count the steps actually reached along each branch. A single global average can hide an expensive minority of long workflows. Keep retry and replay behavior explicit and validate the resulting units against a pilot’s billed usage.',
          'Step boundaries also carry operational value. Inngest persists completed step results so a resumed workflow can avoid repeating completed work. Consolidating every operation into one step solely to reduce the count can reduce the precision of recovery. Price the implementation you would actually trust in production.',
        ],
        code: {
          language: 'typescript',
          caption: 'A baseline execution model, excluding retries and other metered dimensions.',
          value: `const workload = [\n  { name: 'notifications', runs: 800_000, steps: 1 },\n  { name: 'account-onboarding', runs: 200_000, steps: 5 },\n]\n\nconst executions = workload.reduce(\n  (total, item) => total + item.runs * (item.steps + 1),\n  0,\n)\nconsole.log(executions) // 2800000`,
        },
        sourceUrls: urls('inngest', 'inngestExecution'),
      },
      {
        heading: 'Separate known plan prices from unknown overages',
        body: [
          'The published Pro plan starts at $99/month with one million executions. Business starts at $499/month with ten million. Those are plan allowances, not prices per million business jobs. At those exact execution volumes, the base plans cover the execution count, subject to their other limits.',
          'For 100 million executions, this guide does not publish a definitive bill. Inngest describes tiered Pro overage rates that fall from $0.000050 to $0.000015 per execution as volume grows, but the reviewed page does not publish the tier breakpoints needed to reproduce that invoice. Use the current calculator or obtain a quote; do not multiply the lowest advertised marginal rate across every execution.',
          'Keep events, concurrent steps, workers, seats, observability, and any sandbox compute as separate estimate lines. A workload fitting an execution allowance can still exceed another resource limit. Save the dated plan assumptions next to the estimate so a future reader can update them without reconstructing the model.',
        ],
        sourceUrls: urls('inngest'),
      },
      {
        heading: 'Build the BullMQ side from measured resources',
        body: [
          'For Redis-backed BullMQ, estimate Redis capacity and availability, worker compute, network traffic, backups, telemetry, and engineering operations. Durabull’s hosted dashboard has a Free plan and flat per-organization paid plans, but that does not make the underlying workload free. Durabull is Apache-2.0 open source; self-hosting it adds its own deployment costs.',
          'Use the same job mix, payload sizes, retention, peak arrival pattern, and recovery target on both sides. Measure CPU time and memory for your processors; a large idle worker fleet and a highly utilized fleet produce very different costs per completed job. Include retained failed jobs when sizing Redis, especially after a prolonged dependency outage.',
          'Distinguish incremental cost from total cost. An existing BullMQ fleet may have spare capacity, making the next workload inexpensive to add. A greenfield comparison must include provisioning and maintaining that fleet. Both are valid questions, but they cannot share one unlabeled savings percentage.',
        ],
        sourceUrls: urls('production', 'retention', 'pricing', 'deployment'),
      },
      {
        heading: 'Price recovery and maintenance as scenarios',
        body: [
          'Build a normal month, a growth month, and an incident month. For each, record successful work, retries, retained failures, peak concurrency, and operator time. Use your own hourly cost assumptions and label them as assumptions. Avoid claiming an industry-wide operational savings rate from a single team’s experience.',
          'A useful worksheet has one row per cost category and separate columns for measured usage, unit price, fixed allowance, and uncertainty. Mark unknown amounts as unknown. A blank price is more honest and actionable than a fabricated zero: it tells you which trial or vendor conversation is still needed.',
          'Include the effort to implement equivalent semantics. If you require persisted multi-step progress, long waits, or coordinated recovery, estimate that implementation on BullMQ rather than comparing only a simple queue consumer with a durable workflow.',
        ],
        sourceUrls: urls('inngestExecution', 'production'),
      },
      {
        heading: 'Choose based on the work you need to own',
        body: [
          'Keeping BullMQ is attractive when you already have reliable processors and want better operational visibility. Inngest is attractive when its workflow model removes work your team would otherwise build and maintain. The right outcome can be to retain existing queue workloads while evaluating a new orchestration model for a separate feature.',
          'Before a migration decision, implement one representative workflow, cause a controlled failure, recover it, and review the resulting usage and operational effort. A small observed comparison is more decision-useful than projecting a headline unit price across a hundred million hypothetical jobs.',
        ],
        sourceUrls: urls('inngestExecution', 'deployment'),
      },
    ],
    faqs: [
      {
        question: 'How many Inngest executions are one million five-step runs?',
        answer:
          'Using the published runs × (steps + 1) formula, the baseline is six million executions. Validate additional retries, replays, and other usage dimensions against your actual workload and plan.',
      },
      {
        question: 'Does Durabull replace Inngest?',
        answer:
          'No. Durabull observes and operates Redis-backed BullMQ. Inngest provides a different execution and orchestration model. Moving between runtimes requires application work.',
      },
      {
        question: 'Is BullMQ always cheaper?',
        answer:
          'No universal result follows from the public prices. Include Redis, worker compute, availability, observability, and engineering effort, then compare equivalent behavior and workload.',
      },
    ],
    sources: sources(
      'inngest',
      'inngestExecution',
      'production',
      'retention',
      'pricing',
      'deployment'
    ),
    relatedCompare: ['inngest', 'trigger-dev', 'temporal', 'hatchet'],
  },
  {
    slug: 'self-hosted-vs-managed-job-queues',
    title: 'Self-hosted vs managed job queues: what you actually own',
    description:
      'Choose a queue or workflow platform by execution model, failure responsibility, operating cost, portability, and a practical production-readiness exercise.',
    category: 'Architecture',
    takeaway:
      'Decide separately who operates the datastore, who runs processors, and who owns workflow semantics. Managed and self-hosted are not a single binary choice.',
    keywords: [
      'self-hosted vs managed job queue',
      'BullMQ vs Inngest',
      'BullMQ vs Trigger.dev',
      'managed queue tradeoffs',
    ],
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    intro:
      'A team can use managed Redis, run its own BullMQ workers, and buy a hosted dashboard. Another can use a managed workflow service while still operating application workers. These architectures transfer different responsibilities. Compare those responsibilities before comparing a per-job price or a claim of “no infrastructure.”',
    sections: [
      {
        heading: 'Separate the datastore, processor, and workflow layers',
        body: [
          'For a Redis-backed BullMQ deployment, the datastore holds queue state and the application workers perform the work. Redis may be managed by a provider even when the worker fleet belongs to your team. Durabull adds an operations interface; it does not become the processor or remove the need to operate Redis and workers.',
          'Inngest orchestrates durable functions and steps whose code typically runs in your own application, on serverless endpoints or workers. Trigger.dev Cloud runs task code on managed workers. Temporal separates its service from workers that execute workflow and activity code. These distinctions determine where deployment, scaling, and network troubleshooting happen.',
          'Write down the owner of each layer in your proposed architecture. If two teams each believe the other owns worker availability or recovery testing, a platform purchase will not close that gap.',
        ],
        sourceUrls: urls('production', 'deployment', 'inngestExecution', 'trigger', 'temporal'),
      },
      {
        heading: 'Choose semantics before deployment mode',
        body: [
          'Describe the actual work: a short independent job, a fan-out graph, a workflow waiting for a webhook, or a process lasting days. Then define ordering requirements, duplicate tolerance, failure recovery, and the state a human must inspect. The same word, “job,” can conceal very different requirements.',
          'Queue retries are useful for transient failures, but they do not by themselves specify business-level idempotency or how to resume a partially completed operation. Durable workflow systems offer explicit models for persisted progress. Evaluate those models against your application instead of assuming all products provide interchangeable execution units.',
          'BullMQ also documents an optional PostgreSQL backend. That is a datastore decision with its own compatibility checks; it does not mean every Redis-oriented dashboard or operations tool automatically supports the new backend.',
        ],
        sourceUrls: urls('retry', 'idempotency', 'inngestExecution', 'temporal', 'postgres'),
      },
      {
        heading: 'Test the failure responsibility you are accepting',
        body: [
          'Build a staging exercise around four failures: terminate a worker during a side effect, interrupt datastore connectivity, make a downstream API return errors, and deploy a new processor while work remains queued. Record what resumes automatically, what may repeat, what becomes visible, and what a human must repair.',
          'For self-operated components, assign ownership for upgrades, backups, restore tests, capacity, and credentials. For managed components, verify documented limits, support paths, region requirements, and the application’s behavior while the service is unavailable. Both designs have dependencies; owning a Redis instance is not an availability guarantee.',
          'Pay attention to recovery time rather than only steady-state throughput. A queue that processes quickly when healthy can still require hours of manual repair after a bad deployment. Include that operational exercise in acceptance criteria.',
        ],
        sourceUrls: urls('production', 'stalled', 'idempotency'),
      },
      {
        heading: 'Compare costs using the same workload and outcome',
        body: [
          'Model fixed infrastructure, variable execution, telemetry, network transfer, and engineering effort separately. Include peak load and retention, not only average monthly job count. If one option includes managed compute and another requires your workers, leaving the worker bill out creates a misleading comparison.',
          'Keep unit labels on every number: function runs, durable steps, execution seconds, requests, and completed business operations are different quantities. A retry storm can change cost and load differently across systems. Test that scenario explicitly before relying on a normal-month estimate.',
          'Value managed capabilities when you need them. A higher service invoice can still be a reasonable decision if it avoids an operational system your team cannot support. Conversely, replacing a reliable fleet solely to obtain a dashboard may introduce migration effort without addressing a runtime requirement.',
        ],
        sourceUrls: urls('inngest', 'trigger', 'production'),
      },
      {
        heading: 'Make portability a concrete migration exercise',
        body: [
          'Portability is more than whether source code is available. Inventory the job payload contract, identifiers, retry policy, schedules, workflow state, secrets, and operational history. Determine which pieces can move unchanged and which require translation or replay.',
          'Keep business operations behind application functions with explicit inputs and idempotency behavior. This can reduce migration effort without pretending orchestration APIs are portable. For existing jobs, plan how old and new workers coexist, how in-flight work drains, and how a rollback avoids duplicate side effects.',
          'A useful decision record ends with an owner for each component, a measured pilot, known limits, a monthly estimate, and the condition that would cause you to revisit the decision. That is a better basis for choosing than a universal rule that managed is expensive or self-hosted is risky.',
        ],
        sourceUrls: urls('idempotency', 'production', 'temporal'),
      },
    ],
    faqs: [
      {
        question: 'Does using BullMQ mean I must operate Redis myself?',
        answer:
          'No. Redis-backed BullMQ can use a compatible managed Redis service while your team runs the workers. Datastore hosting, worker hosting, and dashboard hosting are separate decisions.',
      },
      {
        question: 'Should I migrate away from BullMQ just to get a dashboard?',
        answer:
          'Usually start by evaluating compatible dashboards. Consider a runtime migration when you also need different execution semantics, deployment responsibility, or workflow capabilities.',
      },
      {
        question: 'Which architecture is cheapest at 100 million jobs?',
        answer:
          'There is no useful answer until “job” is defined. Duration, step count, retries, retained data, peak concurrency, and operational responsibility determine the comparison.',
      },
    ],
    sources: sources(
      'production',
      'deployment',
      'retry',
      'idempotency',
      'stalled',
      'postgres',
      'inngestExecution',
      'inngest',
      'trigger',
      'temporal'
    ),
    relatedCompare: ['inngest', 'trigger-dev', 'temporal', 'qstash', 'aws-sqs'],
  },
  {
    slug: 'replace-bull-board',
    title: 'How to replace Bull Board without migrating your jobs',
    description:
      'A staged checklist for replacing a Redis-backed Bull Board install: inventory queues, validate the replacement, test recovery, and remove the old route.',
    category: 'Migration guides',
    takeaway:
      'For a compatible Redis-backed installation, replace the operational interface in stages. Keep queue identities, producers, workers, and job data unchanged.',
    keywords: ['replace Bull Board', 'Bull Board alternative', 'migrate from bull-board'],
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    intro:
      'Bull Board is an interface to your queues, so replacing it usually does not require moving jobs. The practical work is preserving visibility, access controls, and recovery behavior while switching interfaces. This guide covers Redis-backed BullMQ. Durabull does not currently support BullMQ v6’s PostgreSQL backend, so it is not a replacement for Bull Board on PostgreSQL-backed queues.',
    sections: [
      {
        heading: '1. Identify the problem you are solving',
        body: [
          'Write down the reason for the change: multiple environments, team access, notification workflows, agent access, or an interface that is easier for your operators. Check your installed Bull Board version and current documentation first. A configuration change or upgrade may address the problem without replacing the tool.',
          'Create acceptance criteria that an engineer can demonstrate. For example: an operator can find a failed job in the correct environment, inspect its error, and retry it with the intended access controls. Avoid vague criteria such as “better monitoring” that make a migration impossible to evaluate.',
        ],
        sourceUrls: urls('board'),
      },
      {
        heading: '2. Inventory the configuration you must preserve',
        body: [
          'Record every queue’s Redis endpoint, logical database, prefix, queue name, and BullMQ version. Include TLS settings and network access. Check whether the same queue name appears in more than one environment. Confirm the replacement supports the features you use, including flows and recurring schedulers. Durabull shows job schedulers and waiting-children counts but does not draw flow graphs; if your operators rely on Bull Board’s flow view, treat that as a gap to evaluate.',
          'Inspect how your application creates queue instances. An instance passed to Bull Board may also be exported to producers or used by scheduler initialization. Removing that instance simply because the dashboard no longer needs it can break application behavior. Remove dashboard-only wiring, not shared queue construction.',
          'Keep this inventory free of credentials in tickets and screenshots. Store secrets through your deployment’s normal secret mechanism and give each connection a clear environment label.',
        ],
        sourceUrls: urls('board', 'connections', 'postgres'),
      },
      {
        heading: '3. Connect the replacement in staging',
        body: [
          'For Durabull, configure the Redis connection and matching BullMQ prefix. Environment-managed connections can declare the same information in deployment variables. The example shows the shape of that configuration with a placeholder hostname; inject credentials securely if the instance requires them.',
          'A successful Redis connection is only the first check. Confirm the expected queues are discovered, open a known job ID, and inspect a scheduled job and a parent job waiting on children if your application uses them. When discovery is empty, check database, prefix, and permissions before changing any queue state.',
        ],
        code: {
          language: 'bash',
          caption:
            'Example environment-managed connection; configure application authentication and other deployment requirements separately.',
          value: `DURABULL_ENV_CONNECTIONS=true\nDURABULL_REDIS_URL_STAGING=rediss://redis.example.internal:6379/0\nDURABULL_REDIS_URL_STAGING_ENVIRONMENT=staging\nDURABULL_REDIS_URL_STAGING_PREFIX=bull\nDURABULL_REDIS_URL_DEFAULT=STAGING`,
        },
        sourceUrls: urls('connections', 'deployment'),
      },
      {
        heading: '4. Compare evidence while both interfaces are available',
        body: [
          'Keep Bull Board available during validation. Compare a known set of job IDs and recent states, rather than expecting two live count snapshots taken seconds apart to match exactly. Active workers can change those counts between requests.',
          'Test historical charts separately from current job inspection. If worker metrics were never enabled, a new dashboard cannot reconstruct missing BullMQ minute buckets. Check retention and job-log coverage, and document any capability that relies on a background collector or application instrumentation.',
          'Test the operator account that will actually use the tool, not only the administrator who installed it. Verify that production and staging are distinguishable, sensitive data is appropriately accessible, and unavailable evidence is shown clearly.',
        ],
        sourceUrls: urls('nativeMetrics', 'connections', 'mcp'),
      },
      {
        heading: '5. Rehearse recovery, then remove old wiring',
        body: [
          'Create a controlled staging failure with a harmless side effect. Inspect the error, fix its cause, retry once, and verify completion. If production jobs perform externally visible actions, review their idempotency contract before enabling routine recovery for more operators.',
          'After the acceptance checks pass, remove the old dashboard route and imports. Remove packages only if no other code uses them. Preserve shared queues, producers, workers, and scheduler setup. Update runbooks, bookmarks, reverse-proxy rules, and any alert links that point to the old interface.',
          'Prepare rollback as a UI deployment change: restore the old route and its access controls if necessary. You should not need a job-data migration for this dashboard switch. Keep a record of the verified backend and version so a later runtime upgrade does not silently invalidate compatibility assumptions.',
        ],
        sourceUrls: urls('idempotency', 'manualRetry', 'board', 'postgres'),
      },
    ],
    faqs: [
      {
        question: 'Will replacing Bull Board delete or move my jobs?',
        answer:
          'Connecting a compatible replacement and removing only the dashboard route does not migrate job data. Avoid deleting queue instances used elsewhere, changing queue names or prefixes, or invoking cleanup operations during the switch.',
      },
      {
        question: 'Can I run Bull Board and Durabull together during migration?',
        answer:
          'You can validate both against the same supported Redis-backed queues. Expect live counts to change between reads, account for additional monitoring traffic, and coordinate any write operations.',
      },
      {
        question: 'Do workers need a new SDK when moving to Durabull?',
        answer:
          'No Durabull worker SDK is required for queue inspection. Existing BullMQ metrics and job logging configuration determine what historical charts and logs are available.',
      },
    ],
    sources: sources(
      'board',
      'connections',
      'deployment',
      'nativeMetrics',
      'mcp',
      'idempotency',
      'manualRetry',
      'postgres'
    ),
    relatedCompare: ['bull-board', 'workbench', 'taskforce', 'arena'],
  },
  {
    slug: 'trigger-dev-vs-bullmq-cost',
    title: 'Trigger.dev vs BullMQ: cost at production volume',
    description:
      'Reproduce Trigger.dev invocation and compute costs, account for credits and concurrency, and compare them fairly with the full cost of a BullMQ worker fleet.',
    category: 'Cost analysis',
    takeaway:
      'On small-1x at ten executing seconds per run, Trigger.dev usage is about $363 per million runs, plus concurrency add-ons at high volume. Compare it with BullMQ’s full worker and Redis cost, not a dashboard fee.',
    keywords: ['Trigger.dev pricing', 'Trigger.dev vs BullMQ', 'Trigger.dev cost'],
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    intro:
      'Trigger.dev Cloud includes managed task execution; BullMQ leaves worker deployment with your team. Compare the same workload, including compute on both sides. These examples use public USD prices reviewed on 20 October 2026, a 30-day month, and no retries, taxes, discounts, or optional add-ons unless stated.',
    sections: [
      {
        heading: 'Reproduce the usage calculation',
        body: [
          'The published small-1x rate is $0.0000338 per executing second, plus $0.000025 per run invocation. Ten seconds produces $0.000363 per run. At one million, ten million, and one hundred million runs, the modeled usage is $363, $3,630, and $36,300 respectively.',
          'These are arithmetic examples, not measured throughput benchmarks. They assume every run uses the same machine and execution duration. A valid estimate for your application should group workloads by machine size and observed execution time, then sum the groups.',
        ],
        code: {
          language: 'typescript',
          caption: 'Reproducible usage estimate; excludes plan adjustments and add-ons.',
          value: `const invocationUsd = 0.000025\nconst small1xUsdPerSecond = 0.0000338\nconst executingSecondsPerRun = 10\n\nfor (const runs of [1_000_000, 10_000_000, 100_000_000]) {\n  const usage = runs * (\n    invocationUsd + executingSecondsPerRun * small1xUsdPerSecond\n  )\n  console.log(runs, usage.toFixed(2))\n}\n// 1000000 363.00\n// 10000000 3630.00\n// 100000000 36300.00`,
        },
        sourceUrls: urls('trigger'),
      },
      {
        heading: 'Include credits without counting the plan twice',
        body: [
          'Pro is listed at $50/month with $50 in included credits. A basic estimate is `plan fee + max(0, eligible usage − credits) + add-ons`. Thus $363 of eligible usage on that plan is $363 before add-ons, not $413. Confirm credit eligibility against your actual billing terms.',
          'Keep a pricing worksheet with the review date and explicit exclusions. Separate task usage from additional seats, concurrency, and other purchased capacity. Recheck current prices before making a budget commitment; this article preserves the assumptions behind the calculation rather than promising a future bill.',
        ],
        sourceUrls: urls('trigger'),
      },
      {
        heading: 'Check whether the concurrency can deliver the volume',
        body: [
          'Average concurrency can be estimated from run count and execution time. For one hundred million runs at ten seconds each over 30 days, the calculation is `100,000,000 × 10 / 2,592,000 ≈ 386`. This is an average capacity requirement under smooth arrivals; peak traffic requires more headroom.',
          'Pro lists 200 included concurrent runs, with additional bundles of 50 at $10/month. In that smooth-arrival example, four bundles add 200 slots for $40/month, giving a modeled total of $36,340 before other charges. This does not guarantee the workload meets its latency target.',
          'A nightly batch and a uniformly distributed workload can have the same monthly run count and very different required concurrency. Model the busiest interval and the acceptable queueing delay. A monthly cost projection that cannot physically finish the work on time is incomplete.',
        ],
        sourceUrls: urls('trigger'),
      },
      {
        heading: 'Measure execution time and checkpointed waiting separately',
        body: [
          'Trigger.dev checkpoints a run during durable waits. Waiting on subtasks, and `wait.for` or `wait.until` waits longer than five seconds, do not count toward compute usage. Freed compute is not freed concurrency: a time-based wait keeps its concurrency slot for roughly its first 60 seconds. Do not multiply the entire calendar duration of a multi-day workflow by the machine rate. Conversely, an ordinary awaited network request is not automatically the same thing as a durable wait.',
          'The default small-1x machine has 0.5 vCPU and 0.5 GB RAM. A larger machine can cost more per second and still be cheaper for a CPU-bound operation if it finishes sufficiently faster. Benchmark representative payloads and failures rather than choosing a machine solely from its unit price.',
          'Repeat the estimate for short, typical, and slow runs. Track observed retries and replayed work separately. The ten-second example excludes them; it should not be stretched into a claim about the cost of a long-running AI agent or a memory-heavy media pipeline.',
        ],
        sourceUrls: urls('triggerWait', 'triggerMachines'),
      },
      {
        heading: 'Compare with your full BullMQ operating cost',
        body: [
          'On the BullMQ side, include worker compute, Redis, storage retention, availability, network transfer, observability, and operations. Durabull’s free-to-start hosted dashboard does not offset any of those costs; it is an operations interface, not a runtime. Existing spare worker capacity can reduce incremental cost, but a greenfield fleet needs its full cost included.',
          'For I/O-heavy work, a BullMQ worker can handle multiple concurrent jobs subject to application resources and downstream limits. Do not equate one Trigger.dev machine with one permanently dedicated BullMQ process without measuring the workload. The compute architectures are different.',
          'Choose Trigger.dev when its managed execution and developer workflow justify the cost for your team. Keep BullMQ when its runtime already meets your needs and the gap is operational visibility. Use a representative pilot to compare recovery, deployment effort, and cost together; a dashboard is not a drop-in replacement for a task runtime.',
        ],
        sourceUrls: urls('production', 'pricing', 'deployment', 'triggerMachines'),
      },
    ],
    faqs: [
      {
        question: 'Does one million Trigger.dev runs cost only $25?',
        answer:
          'That is the invocation component at the published $0.000025 rate. Executing compute adds cost. In this ten-second small-1x example, total modeled usage is $363 before plan adjustments and add-ons.',
      },
      {
        question: 'Do I add the $50 Pro plan on top of $363?',
        answer:
          'The listed Pro plan includes $50 of credits. If all $363 is eligible usage, $50 + ($363 − $50) is $363, before optional add-ons and other charges.',
      },
      {
        question: 'Is the $36,300 example a complete 100-million-run bill?',
        answer:
          'No. It is modeled invocation and compute usage. At ten seconds per run over 30 days, even smooth arrivals require about 386 average concurrent runs, above the included Pro concurrency.',
      },
    ],
    sources: sources(
      'trigger',
      'triggerMachines',
      'triggerWait',
      'production',
      'pricing',
      'deployment'
    ),
    relatedCompare: ['trigger-dev', 'inngest', 'hatchet'],
  },
  {
    slug: 'redis-insight-is-not-a-bullmq-dashboard',
    title: 'Redis Insight and BullMQ dashboards: when to use each',
    description:
      'Use Redis Insight for database investigation and a BullMQ-aware dashboard for job recovery: a practical guide to separating datastore and queue symptoms.',
    category: 'Operations',
    takeaway:
      'Inspect Redis when the datastore is the question. Use BullMQ APIs and a compatible dashboard when job state, retries, or schedules are the question.',
    keywords: ['Redis Insight BullMQ', 'Redis GUI queue monitoring', 'monitor BullMQ Redis'],
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    intro:
      'Redis Insight and a BullMQ dashboard can both be useful during the same incident. They expose different levels of the system. Redis Insight helps investigate Redis data and command behavior; a BullMQ-aware interface connects that storage to jobs, workers, failures, and recovery actions. This guide applies to Redis-backed BullMQ.',
    sections: [
      {
        heading: 'Start with the question you need to answer',
        body: [
          '“Which keys consume memory?” is a database question. “Why has this customer’s export not completed?” is a job question. Starting at the right level saves time: the first needs storage evidence, while the second needs queue identity, job state, attempts, and application context.',
          'Redis Insight documents a key browser, database analysis, command tools, a profiler, and Slow Log. Those capabilities are useful even when the database serves several applications. Its documented core feature set does not include a native BullMQ retry or scheduler workflow. Visualization plugins and custom commands should be evaluated separately.',
          'A queue dashboard should be assessed on the corresponding job workflow: locate an ID, inspect failure evidence, identify dependencies or scheduling, and carry out a supported recovery. A graph of Redis memory cannot by itself tell you whether a particular business operation succeeded.',
        ],
        sourceUrls: urls('insight', 'nativeMetrics'),
      },
      {
        heading: 'Treat Redis keys as implementation state',
        body: [
          'A BullMQ job participates in queue state maintained by the library. Editing a hash or removing a key in a general Redis GUI is not equivalent to asking BullMQ to retry, remove, or move that job through its supported API. Keep operational mutations at the queue API layer unless you are deliberately performing an expert repair with a tested procedure.',
          'For diagnosis, narrow your inspection to the relevant connection and prefix. Redis SCAN is incremental and can return duplicate entries; a changing keyspace is not a transactionally consistent inventory. Avoid turning one scan result into a definitive claim about every queue or job.',
          'Preserve the distinction between “not found in this observation” and “does not exist.” Wrong database selection, a custom prefix, restricted access, and concurrent cleanup are different explanations that need different next steps.',
        ],
        sourceUrls: urls('scan', 'connections', 'manualRetry', 'retention'),
      },
      {
        heading: 'Example: retained history is consuming Redis memory',
        body: [
          'Suppose memory grows while completed work continues normally. Use database analysis to identify the large key families (it analyzes up to 10,000 keys and extrapolates beyond that), then inspect the application’s job-retention policy. If the evidence points to retained completed or failed jobs, change retention deliberately rather than deleting matching keys ad hoc.',
          'BullMQ supports bounded retention using age and count. The example is a policy illustration, not a universal recommendation: keep completed jobs for up to one day and 10,000 entries, and failed jobs for up to seven days and 50,000 entries. Choose limits from incident response needs and observed job sizes.',
          'Automatic removal is lazy: it runs only when another job finishes in the same state. Queue `defaultJobOptions` apply to jobs added after the change, while jobs already in Redis keep the options they were added with, so a new policy does not promise immediate cleanup of historical data. Also review job-ID deduplication behavior before shortening retention: removing a prior job changes whether that retained identifier can prevent a future addition.',
        ],
        code: {
          language: 'typescript',
          caption: 'Apply an intentional retention policy when creating your queue.',
          value: `import { Queue } from 'bullmq'\n\nconst queue = new Queue('exports', {\n  connection: { host: '127.0.0.1', port: 6379 },\n  defaultJobOptions: {\n    removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },\n    removeOnFail: { age: 7 * 24 * 60 * 60, count: 50_000 },\n  },\n})`,
        },
        sourceUrls: urls('insight', 'retention'),
      },
      {
        heading: 'Example: the queue grows but Redis looks healthy',
        body: [
          'Normal memory and a quiet Slow Log do not establish healthy processing. The queue may be intentionally paused, limited by policy, missing workers, or waiting on a dependency outside Redis. Shift from the database view to queue state, worker visibility, completion history, and representative job errors.',
          'Check the observation window carefully. A flat completion chart with no configured history is different from a verified interval with zero completions. Durabull’s native metrics documentation explains the worker settings needed for history; its Redis health views separately report freshness and coverage.',
          'Once evidence identifies the cause, make the smallest appropriate change and observe the result. If a downstream API is failing, inspect that service’s telemetry before adding consumers or retrying many jobs. The two interfaces should help narrow the incident, not compete to be the only tool used.',
        ],
        sourceUrls: urls('nativeMetrics', 'health', 'stalled'),
      },
      {
        heading: 'Build a runbook that connects both views',
        body: [
          'Record the environment, database, prefix, queue, job ID, and timestamps in the incident note. Link the queue evidence to database metrics from the same interval. Assign an owner for application recovery and another for datastore changes when those responsibilities differ.',
          'Use Redis Insight when detailed Redis investigation is needed, a BullMQ dashboard when the task is queue operation, and application telemetry for the business side effect. You do not need every tool for every incident. You need a repeatable way to move between layers without losing context or treating one healthy component as proof of end-to-end success.',
        ],
        sourceUrls: urls('insight', 'nativeMetrics', 'health'),
      },
    ],
    faqs: [
      {
        question: 'Can Redis Insight inspect BullMQ keys?',
        answer:
          'Yes, for Redis-backed BullMQ it can inspect the underlying Redis data when permissions allow. Raw key visibility is different from a documented BullMQ job-state and recovery workflow.',
      },
      {
        question: 'Should I edit Redis keys to retry a failed job?',
        answer:
          'Use BullMQ’s supported retry API or a compatible dashboard. Direct key edits can bypass the library’s state transitions and should not be a routine recovery method.',
      },
      {
        question: 'Do I need both Redis Insight and a BullMQ dashboard?',
        answer:
          'Use both if your team investigates datastore behavior and operates application jobs. Choose the tool for the question at hand; many incidents need only one of those views.',
      },
    ],
    sources: sources(
      'insight',
      'scan',
      'connections',
      'nativeMetrics',
      'health',
      'manualRetry',
      'retention',
      'stalled'
    ),
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
