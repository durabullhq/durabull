import type { Competitor } from './types'

export const observabilityCompetitors: Competitor[] = [
  {
    slug: 'datadog',
    name: 'Datadog',
    shortName: 'Datadog',
    website: 'https://docs.datadoghq.com/integrations/redis',
    category: 'observability',
    oneLiner:
      'Redis INFO metrics plus first-party BullMQ tracing. Not a job payload/retry console. Observability MCP only.',
    featured: true,
    alternativesPage: true,
    title: 'Durabull vs Datadog for BullMQ',
    description:
      'Compare Datadog’s BullMQ tracing and Redis monitoring with Durabull’s job inspection, retries, alerts, and MCP. The tools can complement each other.',
    keywords: ['Datadog BullMQ', 'Datadog vs Durabull', 'monitor BullMQ Datadog', 'BullMQ APM'],
    alternativesTitle: 'Datadog alternatives for BullMQ',
    alternativesDescription:
      'Compare tools for operating existing BullMQ jobs alongside Datadog: queue discovery, payload inspection, retries, and MCP access to Redis-backed queues.',
    intro:
      'Datadog combines Redis infrastructure metrics with BullMQ application traces and Data Streams Monitoring. Its BullMQ DSM guide requires dd-trace 5.82.0 or later. Durabull complements that telemetry with direct inspection and recovery of jobs retained in Redis.',
    howItConnects:
      'Agent `redisdb` integration for INFO metrics. APM: install `dd-trace` before importing BullMQ (`NODE_OPTIONS=--require dd-trace/init`). DSM: `DD_DATA_STREAMS_ENABLED=true`. Optional `keys` list gives named key lengths — not a `bull:*` scan.',
    codeChanges: 'Yes for traces (`dd-trace`). Redis check is Agent config only.',
    autoDiscovery: 'No Redis-key discovery of BullMQ queues. APM sees instrumented library calls.',
    multiEnv: 'Datadog orgs/sites. Not a Durabull-style connection switcher.',
    alerts:
      'Monitors on metrics, logs, and traces, with routing and incident workflows. BullMQ-specific signals depend on the telemetry you collect.',
    mcp: 'Official `https://mcp.datadoghq.com/v1/mcp` queries Datadog (logs, metrics, traces). Not retry/inspect Redis jobs.',
    pricing:
      'List 2026-10-20: Infra Pro $15/host/mo annual. APM $31/host/mo annual ($36 m2m). APM Pro+DSM $35 / $42. Custom metrics $5 per 100 / mo. Redis integration metrics are standard, not custom. Homegrown BullMQ gauges are custom metrics.',
    license: 'Commercial SaaS.',
    whenToChooseThem:
      'Use Datadog when you already pay for infra/APM and need Redis saturation, worker traces, and producer→consumer latency.',
    whenToChooseDurabull:
      'Use Durabull when you need to open a failed job, read a redacted payload, retry it, pause a queue, or let an agent do those things. Keep Datadog beside it.',
    rows: [
      {
        feature: 'Redis health',
        durabull: 'INFO-based health alerts',
        competitor: 'Full Redis integration',
      },
      {
        feature: 'BullMQ traces',
        durabull: 'Not an APM',
        competitor: 'First-party dd-trace plugin',
      },
      { feature: 'List / retry jobs', durabull: 'Yes', competitor: 'Not published' },
      { feature: 'MCP', durabull: 'Queue ops', competitor: 'Observability MCP' },
    ],
    faqs: [
      {
        question: 'Does Datadog discover BullMQ queues?',
        answer:
          'Datadog’s Redis integration collects server and configured key metrics. BullMQ APM and DSM observe instrumented producer/consumer activity. Neither is equivalent to enumerating the current job records in Redis, which is the role Durabull fills.',
      },
    ],
    sources: [
      { label: 'Redis integration', url: 'https://docs.datadoghq.com/integrations/redis' },
      {
        label: 'Node compatibility',
        url: 'https://docs.datadoghq.com/tracing/trace_collection/compatibility/nodejs.md',
      },
      {
        label: 'DSM BullMQ',
        url: 'https://docs.datadoghq.com/data_streams/setup/technologies/bullmq.md',
      },
      { label: 'Pricing list', url: 'https://www.datadoghq.com/pricing/list/' },
      { label: 'Datadog MCP', url: 'https://docs.datadoghq.com/mcp_server/' },
    ],
    related: ['grafana', 'sentry', 'new-relic'],
  },
  {
    slug: 'grafana',
    name: 'Grafana + Prometheus',
    shortName: 'Grafana',
    website: 'https://docs.bullmq.io/guide/metrics/prometheus',
    category: 'observability',
    oneLiner:
      'Flexible dashboards and alerts from exported BullMQ metrics. Pair with a queue console for payload inspection and recovery.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Grafana and Prometheus for BullMQ',
    description:
      'Compare Grafana and Prometheus with Durabull for BullMQ metrics, discovery, alerts, and job operations. Exporter discovery varies; the tools can run together.',
    keywords: ['BullMQ Prometheus', 'BullMQ Grafana', 'bullmq exporter', 'monitor BullMQ'],
    intro:
      'Use Grafana and Prometheus for time-series dashboards, retention, and alerts across services. BullMQ exposes exportPrometheusMetrics() for configured queues; community exporters offer other collection paths. Durabull adds a queue-oriented workflow for inspecting and retrying jobs.',
    howItConnects:
      'Expose queue.exportPrometheusMetrics() through an HTTP metrics endpoint and configure Prometheus to scrape it. Alternatively, evaluate a community exporter for its BullMQ compatibility, discovery method, and maintenance. Redis server metrics alone do not provide job payloads or failure context.',
    codeChanges: 'Built-in path: yes. Sidecar path: usually no app change.',
    autoDiscovery: 'Only if the sidecar scans Redis. Built-in export has no discovery.',
    multiEnv: 'Labels you add (`env`, `server`). Not a connection product.',
    alerts:
      'Grafana Alerting or Alertmanager on collected signals. Per-job context requires additional instrumentation, logs, or a queue console.',
    mcp: 'Grafana publishes an MCP server for dashboards, data sources, alerting, and other Grafana operations. It is not a native BullMQ job-control endpoint.',
    pricing:
      'Grafana OSS has no license fee under AGPLv3. Cloud offers a free tier; Pro starts at $19/month plus usage, including 10k active metric series with published rates starting at $6.50 per additional 1k. Retention and other telemetry products affect cost.',
    license: 'Grafana OSS AGPLv3. Exporters vary.',
    whenToChooseThem:
      'You want SLO charts and page-on-threshold alerts you already run in Grafana.',
    whenToChooseDurabull:
      'You need to act on a job, not only graph counts. Throughput charts in Durabull still need BullMQ metrics on workers.',
    rows: [
      {
        feature: 'Charts',
        durabull: 'Fleet analytics (needs worker metrics)',
        competitor: 'PromQL / Grafana',
      },
      {
        feature: 'Retry / inspect',
        durabull: 'Yes',
        competitor: 'Grafana: no. Some exporters bundle a UI.',
      },
      {
        feature: 'Collection model',
        durabull: 'Reads BullMQ Redis state',
        competitor: 'Scrapes metrics you expose',
      },
    ],
    faqs: [
      {
        question: 'Is there an official Grafana BullMQ plugin?',
        answer:
          'Our reviewed sources describe BullMQ’s own Prometheus export and community dashboards/exporters. Verify an exporter’s supported BullMQ versions and queue discovery before adopting it; a dashboard template is not itself a data collector.',
      },
    ],
    sources: [
      { label: 'BullMQ Prometheus', url: 'https://docs.bullmq.io/guide/metrics/prometheus' },
      { label: 'Grafana OSS', url: 'https://grafana.com/oss/grafana/' },
      { label: 'Grafana Cloud pricing', url: 'https://grafana.com/pricing/' },
      { label: 'Official Grafana MCP', url: 'https://github.com/grafana/mcp-grafana' },
    ],
    related: ['datadog', 'sentry', 'bull-board'],
  },
  {
    slug: 'new-relic',
    name: 'New Relic',
    shortName: 'New Relic',
    website:
      'https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/redis-monitoring-integration/',
    category: 'observability',
    oneLiner:
      'Redis + Node APM. bullmq is not in the instrumented-modules list. Observability MCP, not job retry.',
    featured: false,
    alternativesPage: false,
    title: 'Durabull vs New Relic for BullMQ',
    description:
      'New Relic monitors Redis and Node. It does not list bullmq as an instrumented module. Durabull is the BullMQ operations layer.',
    keywords: ['New Relic BullMQ', 'New Relic Redis queue'],
    intro:
      'New Relic’s Redis integration and Node `redis`/`ioredis` instrumentation watch the datastore and generic background transactions. Public instrumented-modules lists did not include `bullmq` on 2026-10-20.',
    howItConnects: 'Infrastructure agent Redis integration. Node APM agent in the app.',
    codeChanges: 'APM agent in the worker/API process.',
    autoDiscovery: 'No BullMQ queue discovery.',
    multiEnv: 'New Relic accounts.',
    alerts: 'NR alerts on metrics. Not job-console workflows.',
    mcp: 'Official MCP at https://mcp.newrelic.com/mcp/ (US; regional endpoints available) accesses New Relic telemetry and workflows, not direct BullMQ job mutations.',
    pricing:
      'The published ingest model includes 100 GB/month, then $0.40/GB or $0.60/GB for Data Plus. User-based and compute-based models are available. Pro full-platform users list at $349/user/month with annual commitment; additional capabilities can add charges.',
    license: 'Commercial.',
    whenToChooseThem: 'You already standardized on New Relic for APM and Redis.',
    whenToChooseDurabull:
      'You need queue semantics and MCP writes. Instrument workers in New Relic as well if you want traces.',
    rows: [
      {
        feature: 'bullmq module',
        durabull: 'Direct BullMQ job operations',
        competitor: 'Not in instrumented-modules list',
      },
      { feature: 'Retry jobs', durabull: 'Yes', competitor: 'Not published' },
      { feature: 'MCP', durabull: 'Queue ops', competitor: 'Telemetry MCP' },
    ],
    faqs: [
      {
        question: 'Does New Relic auto-instrument BullMQ?',
        answer:
          'The reviewed Node agent compatibility table does not list bullmq, but it does list redis and ioredis. You can add background transactions or custom instrumentation; verify automatic BullMQ-specific support against your installed agent version.',
      },
    ],
    sources: [
      {
        label: 'Redis integration',
        url: 'https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/redis-monitoring-integration/',
      },
      {
        label: 'Node agent compatibility',
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
    website: 'https://docs.sentry.io/product/insights/queues/',
    category: 'observability',
    oneLiner:
      'Error tracking and queue performance from instrumented spans. Pair with Durabull to inspect and recover retained BullMQ jobs.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Sentry for BullMQ',
    description:
      'Sentry catches worker exceptions and can show a Queues view from spans. It does not retry BullMQ jobs. Durabull is the queue console; Sentry is the error tracker.',
    keywords: ['Sentry BullMQ', 'Sentry queues', 'Sentry cron monitors'],
    intro:
      'Sentry groups reported worker exceptions and connects producer/consumer spans for queue performance analysis. Its Node guide documents manual queue.publish and queue.process spans with trace propagation. Capture handled job errors explicitly where needed: a BullMQ failed job does not automatically guarantee a Sentry issue.',
    howItConnects: 'Sentry SDK in the Node worker. Crons check-ins for schedules.',
    codeChanges: 'Yes, SDK init and optional queue spans.',
    autoDiscovery: 'Destinations appear from spans, not Redis SCAN.',
    multiEnv: 'Sentry projects/environments.',
    alerts:
      'Issue and performance alerts, plus Crons check-ins for scheduled work. Configure capture and check-ins in the relevant processes.',
    mcp: 'Official OAuth endpoint https://mcp.sentry.dev/mcp supports Sentry issues, performance, and project workflows. It does not directly retry or promote BullMQ jobs in Redis.',
    pricing:
      'Team $26/mo annual ($29 monthly). Business $80 / $89. Quotas for errors/spans/attachments apply. Confirm current pricing page.',
    license: 'Commercial + SDK licenses.',
    whenToChooseThem: 'You want stack traces grouped as issues and missed cron check-ins.',
    whenToChooseDurabull:
      'You want to inspect the job that threw, retry it, and let an agent do the same. Use both: Sentry for the exception, Durabull for the queue.',
    rows: [
      {
        feature: 'Errors',
        durabull: 'Job failedReason + stacktraces',
        competitor: 'Full issue tracker',
      },
      { feature: 'Retry from the product', durabull: 'Yes', competitor: 'Not published' },
      { feature: 'MCP', durabull: 'Queue ops', competitor: 'Sentry MCP' },
    ],
    faqs: [
      {
        question: 'Does Sentry auto-instrument BullMQ?',
        answer:
          'The official Node queue guide documents manual producer and consumer spans, including trace propagation. Framework integrations can add instrumentation, so check your SDK and framework version. Error capture, queue spans, and direct job operations are separate capabilities.',
      },
    ],
    sources: [
      {
        label: 'Node queue instrumentation',
        url: 'https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/queues-module/',
      },
      { label: 'Sentry pricing', url: 'https://sentry.io/pricing/' },
      { label: 'Official Sentry MCP', url: 'https://mcp.sentry.dev/' },
    ],
    related: ['datadog', 'grafana', 'bull-board'],
  },
]
