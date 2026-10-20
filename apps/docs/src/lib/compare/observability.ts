import type { Competitor } from './types'

export const observabilityCompetitors: Competitor[] = [
  {
    slug: 'datadog',
    name: 'Datadog',
    shortName: 'Datadog',
    website: 'https://docs.datadoghq.com/integrations/redis/',
    category: 'observability',
    oneLiner:
      'Redis metrics plus first-party BullMQ tracing and Data Streams Monitoring. Pair with a queue console to inspect and retry jobs.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Datadog for BullMQ',
    description:
      'Compare Datadog’s BullMQ tracing and Redis monitoring with Durabull’s job inspection, retries, alerts, and MCP. The two tools can run side by side.',
    keywords: ['Datadog BullMQ', 'Datadog vs Durabull', 'monitor BullMQ Datadog', 'BullMQ APM'],
    alternativesTitle: 'Datadog alternatives for BullMQ',
    alternativesDescription:
      'Compare Datadog alternatives for monitoring BullMQ, including Grafana, New Relic, and Sentry, and see where a BullMQ dashboard fits alongside them.',
    intro:
      'Datadog combines Redis infrastructure metrics with BullMQ application traces and Data Streams Monitoring (DSM). Its Node.js tracer instruments BullMQ 5.66.0 and later, and BullMQ DSM requires `dd-trace` 5.82.0 or later. Durabull complements that telemetry with direct inspection and recovery of jobs retained in Redis.',
    howItConnects:
      'The Agent’s Redis check (`redisdb`) collects INFO metrics. For APM, initialize `dd-trace` before BullMQ is imported (for example, `NODE_OPTIONS=--require dd-trace/init`). For DSM, also set `DD_DATA_STREAMS_ENABLED=true`. The check’s optional `keys` setting accepts patterns and reports lengths of matching keys, but it does not interpret them as queues or jobs.',
    codeChanges:
      'Yes for traces and DSM (`dd-trace` in each process). The Redis check is Agent configuration only.',
    autoDiscovery:
      'No BullMQ queue discovery from Redis. APM and DSM show the queues that instrumented producers and consumers use.',
    multiEnv:
      'Separate environments with `env` tags, services, and Datadog organizations. There is no Redis connection switcher.',
    alerts:
      'Monitors on metrics, logs, and traces, with notification routing and incident workflows. BullMQ-specific alerts depend on the telemetry you collect.',
    mcp: 'Datadog’s remote MCP server (`https://mcp.datadoghq.com/v1/mcp` on US1; other sites use their own hosts) queries logs, metrics, traces, monitors, and other Datadog data. It does not document BullMQ job inspection or retry tools.',
    pricing:
      'List prices billed annually: Infrastructure Pro $15 per host/month; APM $31 per host/month ($36 month-to-month); APM Pro, which adds DSM, $35 ($42 month-to-month). Custom metrics list at $5 per 100 per month. Redis integration metrics are standard integration metrics; BullMQ gauges you emit yourself count as custom metrics.',
    license: 'Commercial SaaS. The `dd-trace` Node.js library is Apache-2.0 or BSD-3-Clause.',
    whenToChooseThem:
      'Choose Datadog when you already use Datadog for infrastructure and APM and need Redis saturation metrics, worker traces, and producer-to-consumer latency.',
    whenToChooseDurabull:
      'Choose Durabull when you need to open a failed job, read its redacted payload, retry it, or pause a queue, or let an agent do those things. Keep Datadog alongside it for traces.',
    rows: [
      {
        feature: 'Redis health',
        durabull: 'INFO-based health history and alerts',
        competitor: 'Redis integration (INFO metrics, slowlog, key lengths)',
      },
      {
        feature: 'BullMQ traces',
        durabull: 'Not an APM',
        competitor: 'First-party `dd-trace` integration',
      },
      { feature: 'List and retry jobs', durabull: 'Yes', competitor: 'Not documented' },
      {
        feature: 'MCP',
        durabull: 'Queue inspection and opt-in queue operations',
        competitor: 'Datadog telemetry; no BullMQ job tools',
      },
    ],
    faqs: [
      {
        question: 'Does Datadog discover BullMQ queues?',
        answer:
          'Datadog’s Redis integration collects server metrics and the lengths of keys you configure. BullMQ APM and DSM observe instrumented producer and consumer activity. Neither enumerates the job records currently stored in Redis, which is the role Durabull fills.',
      },
    ],
    sources: [
      { label: 'Redis integration', url: 'https://docs.datadoghq.com/integrations/redis/' },
      {
        label: 'Redis check configuration (keys)',
        url: 'https://github.com/DataDog/integrations-core/blob/master/redisdb/datadog_checks/redisdb/data/conf.yaml.example',
      },
      {
        label: 'Node.js compatibility',
        url: 'https://docs.datadoghq.com/tracing/trace_collection/compatibility/nodejs.md',
      },
      {
        label: 'DSM for BullMQ',
        url: 'https://docs.datadoghq.com/data_streams/setup/technologies/bullmq.md',
      },
      { label: 'Pricing list', url: 'https://www.datadoghq.com/pricing/list/' },
      { label: 'Datadog MCP server', url: 'https://docs.datadoghq.com/mcp_server/' },
    ],
    related: ['grafana', 'sentry', 'new-relic'],
  },
  {
    slug: 'grafana',
    name: 'Grafana + Prometheus',
    shortName: 'Grafana',
    website: 'https://grafana.com/oss/grafana/',
    category: 'observability',
    oneLiner:
      'Flexible dashboards and alerts from exported BullMQ metrics. Pair with a queue console for payload inspection and recovery.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Grafana and Prometheus for BullMQ',
    description:
      'Compare Grafana and Prometheus with Durabull for BullMQ metrics, queue discovery, alerts, and job operations, and see how the tools run together.',
    keywords: ['BullMQ Prometheus', 'BullMQ Grafana', 'bullmq exporter', 'monitor BullMQ'],
    intro:
      'Grafana and Prometheus provide time-series dashboards, retention, and alerting across services. BullMQ exposes `exportPrometheusMetrics()` for the queues you instantiate, and community exporters offer other collection paths. Durabull adds a queue-oriented workflow for inspecting and retrying jobs.',
    howItConnects:
      'Serve `queue.exportPrometheusMetrics()` from an HTTP metrics endpoint and configure Prometheus to scrape it. Alternatively, evaluate a community exporter for its BullMQ compatibility, discovery method, and maintenance. Redis server metrics alone do not provide job payloads or failure context.',
    codeChanges:
      'Yes for BullMQ’s built-in export (a metrics endpoint in your app). Community sidecar exporters usually need no application change.',
    autoDiscovery:
      'Only if a sidecar exporter scans Redis. The built-in export covers only the queues you instantiate.',
    multiEnv: 'Labels you add, such as `env` or `server`. There is no Redis connection switcher.',
    alerts:
      'Grafana Alerting or Alertmanager on collected signals. Per-job context requires additional instrumentation, logs, or a queue console.',
    mcp: 'Grafana Labs offers an open source MCP server (`mcp-grafana`) and a hosted Grafana Cloud endpoint for dashboards, data sources, alerting, and incidents. Neither includes BullMQ job-control tools.',
    pricing:
      'Grafana OSS has no license fee. Grafana Cloud has a free tier; Pro starts at $19/month plus usage and includes 10k active metric series, with additional series from $6.50 per 1k. Retention and other telemetry products affect cost.',
    license: 'Grafana OSS is AGPLv3. Exporter licenses vary.',
    whenToChooseThem:
      'Choose Grafana when you want SLO charts and threshold alerts in the Grafana stack you already run.',
    whenToChooseDurabull:
      'Choose Durabull when you need to act on individual jobs, not only graph counts: inspect a failure, retry it, or pause a queue. Durabull’s throughput charts still need BullMQ metrics enabled on workers.',
    rows: [
      {
        feature: 'Charts',
        durabull: 'Throughput charts (need worker metrics enabled)',
        competitor: 'PromQL dashboards',
      },
      {
        feature: 'Inspect and retry jobs',
        durabull: 'Yes',
        competitor: 'Not in Grafana; some community exporters bundle a queue UI',
      },
      {
        feature: 'Collection model',
        durabull: 'Reads BullMQ state from Redis',
        competitor: 'Scrapes metrics you expose',
      },
    ],
    faqs: [
      {
        question: 'Is there an official Grafana BullMQ plugin?',
        answer:
          'We found no Grafana Labs BullMQ integration. BullMQ ships its own Prometheus export, and community exporters and dashboards exist. Check an exporter’s supported BullMQ versions and queue discovery before adopting it; a dashboard template is not itself a data collector.',
      },
    ],
    sources: [
      { label: 'BullMQ Prometheus export', url: 'https://docs.bullmq.io/guide/metrics/prometheus' },
      { label: 'Grafana OSS', url: 'https://grafana.com/oss/grafana/' },
      { label: 'Grafana Cloud pricing', url: 'https://grafana.com/pricing/' },
      {
        label: 'Grafana MCP servers',
        url: 'https://grafana.com/docs/grafana/latest/developer-resources/mcp/',
      },
      { label: 'mcp-grafana on GitHub', url: 'https://github.com/grafana/mcp-grafana' },
    ],
    related: ['datadog', 'sentry', 'bull-board'],
  },
  {
    slug: 'new-relic',
    name: 'New Relic',
    shortName: 'New Relic',
    website:
      'https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/redis/redis-integration/',
    category: 'observability',
    oneLiner:
      'Redis monitoring and Node.js APM. BullMQ is not in its instrumented-modules list. Pair with a queue console for job recovery.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs New Relic for BullMQ',
    description:
      'New Relic monitors Redis and Node.js services but does not list BullMQ among instrumented modules. Compare it with Durabull for BullMQ operations.',
    keywords: ['New Relic BullMQ', 'New Relic Redis queue'],
    intro:
      'New Relic’s Redis integration monitors the datastore, and its Node.js agent instruments the `redis` and `ioredis` clients. Its instrumented-modules list does not include `bullmq`, so worker jobs need custom background transactions. Durabull adds direct inspection and recovery of BullMQ jobs.',
    howItConnects:
      'The infrastructure agent’s Redis integration collects INFO metrics and lengths of configured keys. The Node.js APM agent runs in your app and workers.',
    codeChanges:
      'Yes for APM: the agent in each worker or API process, plus custom background transactions around job handlers.',
    autoDiscovery: 'No BullMQ queue discovery.',
    multiEnv: 'Separate environments by New Relic account, app name, or tags.',
    alerts:
      'Alert conditions on NRQL queries over collected telemetry. There is no job-level recovery workflow.',
    mcp: 'New Relic’s MCP server (`https://mcp.newrelic.com/mcp/` in the US; EU and JP endpoints are available) accesses New Relic telemetry and workflows. It does not document BullMQ job operations.',
    pricing:
      'Includes 100 GB of data ingest per month, then $0.40/GB, or $0.60/GB with Data Plus. User-based and compute-based models are available. Pro full-platform users list at $349/user/month with an annual commitment; additional capabilities can add charges.',
    license: 'Commercial SaaS. The Node.js agent is Apache-2.0.',
    whenToChooseThem:
      'Choose New Relic when you have already standardized on New Relic for APM and Redis monitoring.',
    whenToChooseDurabull:
      'Choose Durabull when you need BullMQ-aware views of queues and jobs, plus MCP tools that can retry or promote jobs and pause queues. Keep New Relic for traces if you instrument workers there.',
    rows: [
      {
        feature: 'BullMQ instrumentation',
        durabull: 'Reads BullMQ state from Redis',
        competitor: 'Not in the instrumented-modules list',
      },
      { feature: 'Retry jobs', durabull: 'Yes', competitor: 'Not documented' },
      {
        feature: 'MCP',
        durabull: 'Queue inspection and opt-in queue operations',
        competitor: 'New Relic telemetry; no BullMQ job tools',
      },
    ],
    faqs: [
      {
        question: 'Does New Relic auto-instrument BullMQ?',
        answer:
          'New Relic’s Node.js compatibility table lists `redis` and `ioredis` but not `bullmq`. You can wrap job handlers in background transactions or add custom instrumentation. Check BullMQ support against the agent version you install.',
      },
    ],
    sources: [
      {
        label: 'Redis integration',
        url: 'https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/redis/redis-integration/',
      },
      {
        label: 'Node.js agent compatibility',
        url: 'https://docs.newrelic.com/docs/apm/agents/nodejs-agent/getting-started/compatibility-requirements-nodejs-agent/',
      },
      { label: 'New Relic pricing', url: 'https://newrelic.com/pricing' },
      { label: 'New Relic MCP setup', url: 'https://docs.newrelic.com/docs/agentic-ai/mcp/setup/' },
    ],
    related: ['datadog', 'sentry', 'grafana'],
  },
  {
    slug: 'sentry',
    name: 'Sentry',
    shortName: 'Sentry',
    website: 'https://docs.sentry.io/product/dashboards/sentry-dashboards/backend/queues/',
    category: 'observability',
    oneLiner:
      'Error tracking and queue performance from instrumented spans. Pair with Durabull to inspect and recover retained BullMQ jobs.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Sentry for BullMQ',
    description:
      'Sentry groups worker exceptions and builds a Queues view from spans, but it does not retry BullMQ jobs. Compare it with Durabull for queue operations.',
    keywords: ['Sentry BullMQ', 'Sentry queues', 'Sentry cron monitors'],
    intro:
      'Sentry groups reported worker exceptions and connects producer and consumer spans for queue performance analysis. Its Node.js guide documents manual `queue.publish` and `queue.process` spans with trace propagation. BullMQ records processor errors as failed jobs, so outside framework integrations you may need to capture those errors explicitly to create Sentry issues.',
    howItConnects:
      'The Sentry SDK runs in your Node.js workers. Cron check-ins cover scheduled jobs.',
    codeChanges: 'Yes: SDK initialization, plus optional queue spans and cron check-ins.',
    autoDiscovery: 'Queue destinations appear from spans, not from scanning Redis.',
    multiEnv: 'Sentry projects and environments.',
    alerts:
      'Issue and performance alerts, plus cron monitors for scheduled work. Configure error capture and check-ins in the relevant processes.',
    mcp: 'Sentry’s hosted MCP server (`https://mcp.sentry.dev/mcp`, OAuth) supports issue, performance, and project workflows. It does not retry or promote BullMQ jobs in Redis.',
    pricing:
      'Team is $26/month billed annually ($29 monthly); Business is $80/month ($89 monthly). Paid plans include quotas such as 50k errors, 5M spans, and one cron monitor; additional cron monitors are $0.78 each.',
    license:
      'Commercial SaaS. Self-hosted Sentry is FSL-1.1-Apache-2.0; the JavaScript SDKs are MIT.',
    whenToChooseThem:
      'Choose Sentry when you want stack traces grouped into issues and alerts for missed cron check-ins.',
    whenToChooseDurabull:
      'Choose Durabull when you want to inspect the job that threw, retry it, and let an agent do the same. Use both: Sentry for the exception, Durabull for the queue.',
    rows: [
      {
        feature: 'Errors',
        durabull: 'Per-job `failedReason` and stack traces',
        competitor: 'Issue grouping, alerts, and triage',
      },
      { feature: 'Retry jobs', durabull: 'Yes', competitor: 'Not documented' },
      {
        feature: 'MCP',
        durabull: 'Queue inspection and opt-in queue operations',
        competitor: 'Sentry issues and performance; no BullMQ job tools',
      },
    ],
    faqs: [
      {
        question: 'Does Sentry auto-instrument BullMQ?',
        answer:
          'Not in general. Sentry’s Node.js queue guide documents manual producer and consumer spans. The NestJS SDK (10.44.0 and later) automatically wraps `@nestjs/bullmq` processors to create `queue.process` transactions and capture exceptions. Error capture, queue spans, and direct job operations are separate capabilities.',
      },
    ],
    sources: [
      {
        label: 'Node.js queue instrumentation',
        url: 'https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/queues-module/',
      },
      {
        label: 'Queues dashboard',
        url: 'https://docs.sentry.io/product/dashboards/sentry-dashboards/backend/queues/',
      },
      {
        label: 'NestJS BullMQ instrumentation (10.44.0)',
        url: 'https://github.com/getsentry/sentry-javascript/releases/tag/10.44.0',
      },
      { label: 'Sentry pricing', url: 'https://sentry.io/pricing/' },
      { label: 'Sentry MCP server', url: 'https://mcp.sentry.dev/' },
    ],
    related: ['datadog', 'grafana', 'bull-board'],
  },
]
