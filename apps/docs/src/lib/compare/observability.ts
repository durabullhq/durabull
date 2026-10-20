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
      'Datadog traces BullMQ producers/consumers and monitors Redis. It does not publish queue discovery, payload inspect, or retry. Durabull is the operations console; keep Datadog for APM.',
    keywords: ['Datadog BullMQ', 'Datadog vs Durabull', 'monitor BullMQ Datadog', 'BullMQ APM'],
    alternativesTitle: 'Datadog alternatives for BullMQ',
    alternativesDescription:
      'Datadog is the right APM for many teams. These alternatives cover BullMQ operations Datadog does not publish: list failed jobs, read payloads, retry, and MCP.',
    intro:
      'Datadog’s Redis check watches the server. `dd-trace` instruments `bullmq` ≥ 5.66 and can enable Data Streams Monitoring from tracer 5.82.0. That is traces and topology, not a queue console.',
    howItConnects:
      'Agent `redisdb` integration for INFO metrics. APM: install `dd-trace` before importing BullMQ (`NODE_OPTIONS=--require dd-trace/init`). DSM: `DD_DATA_STREAMS_ENABLED=true`. Optional `keys` list gives named key lengths — not a `bull:*` scan.',
    codeChanges: 'Yes for traces (`dd-trace`). Redis check is Agent config only.',
    autoDiscovery: 'No Redis-key discovery of BullMQ queues. APM sees instrumented library calls.',
    multiEnv: 'Datadog orgs/sites. Not a Durabull-style connection switcher.',
    alerts: 'Datadog monitors on metrics/traces. Not job-failed-payload workflows.',
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
          'No. The Redis check does not scan `bull:*` prefixes. APM/DSM see instrumented produce/consume calls after you add dd-trace.',
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
      'Time series for queues you export. Grafana Labs has no official BullMQ product. No job retry in Grafana.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Grafana and Prometheus for BullMQ',
    description:
      'Prometheus and Grafana graph BullMQ metrics you export. They do not discover queues, open payloads, or retry jobs. Durabull is the operator console; scrape metrics for charts.',
    keywords: ['BullMQ Prometheus', 'BullMQ Grafana', 'bullmq exporter', 'monitor BullMQ'],
    intro:
      'Grafana Labs does not ship a BullMQ integration. You scrape BullMQ’s `exportPrometheusMetrics()`, a sidecar exporter, or Redis exporter, then graph PromQL. That is the right charts stack. It is not on-call job operations.',
    howItConnects:
      'Built-in: add an HTTP `/metrics` route and call `queue.exportPrometheusMetrics()` on each Queue you construct. Sidecars (community): `igrek8/bullmq-prometheus`, `okerx/bullmq-metrics`, `antonmd/bullmq-exporter`, `ron96g/bullmq-exporter`. Some SCAN Redis; some take a name list. `UpHabit/bull_exporter` is Bull, not BullMQ.',
    codeChanges: 'Built-in path: yes. Sidecar path: usually no app change.',
    autoDiscovery: 'Only if the sidecar scans Redis. Built-in export has no discovery.',
    multiEnv: 'Labels you add (`env`, `server`). Not a connection product.',
    alerts: 'Grafana Alerting / Alertmanager on series. Not per-job incidents with payloads.',
    mcp: 'Grafana Cloud/OSS MCP queries Grafana. Not Redis job ops.',
    pricing:
      'Grafana OSS free (AGPLv3). Grafana Cloud Pro from $19/mo + $6.50/1k series after 10k (verify current Cloud page). Exporters are community licenses.',
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
      { feature: 'Official Grafana BullMQ app', durabull: 'n/a', competitor: 'None' },
    ],
    faqs: [
      {
        question: 'Is there an official Grafana BullMQ plugin?',
        answer:
          'Not found. Community dashboards and exporters exist. BullMQ’s own Prometheus export is a library method you mount.',
      },
    ],
    sources: [
      { label: 'BullMQ Prometheus', url: 'https://docs.bullmq.io/guide/metrics/prometheus' },
      { label: 'Grafana OSS', url: 'https://grafana.com/oss/grafana/' },
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
    mcp: 'Yes, `mcp.newrelic.com` — New Relic data, not Redis job mutations.',
    pricing:
      'Usage-based: 100 GB free, then $0.40/GB ($0.60 Data Plus). Full platform Pro $349/user annual on the published page. Not per host.',
    license: 'Commercial.',
    whenToChooseThem: 'You already standardized on New Relic for APM and Redis.',
    whenToChooseDurabull:
      'You need queue semantics and MCP writes. Instrument workers in New Relic as well if you want traces.',
    rows: [
      {
        feature: 'bullmq module',
        durabull: 'First-class',
        competitor: 'Not in instrumented-modules list',
      },
      { feature: 'Retry jobs', durabull: 'Yes', competitor: 'Not published' },
      { feature: 'MCP', durabull: 'Queue ops', competitor: 'Telemetry MCP' },
    ],
    faqs: [
      {
        question: 'Does New Relic auto-instrument BullMQ?',
        answer:
          'The public Node instrumented-modules list reviewed on 2026-10-20 did not include `bullmq`. Treat BullMQ visibility as something you add yourself.',
      },
    ],
    sources: [
      {
        label: 'Redis integration',
        url: 'https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/redis-monitoring-integration/',
      },
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
      'Worker errors and optional Queues spans. Product Queues docs still center Celery. Not a retry console.',
    featured: true,
    alternativesPage: false,
    title: 'Durabull vs Sentry for BullMQ',
    description:
      'Sentry catches worker exceptions and can show a Queues view from spans. It does not retry BullMQ jobs. Durabull is the queue console; Sentry is the error tracker.',
    keywords: ['Sentry BullMQ', 'Sentry queues', 'Sentry cron monitors'],
    intro:
      'Sentry belongs in the worker. Failed jobs become issues. The Queues dashboard is built from custom spans; product docs still describe Celery as the first-class example. NestJS `@nestjs/bullmq` wrapping exists in sentry-javascript — that is SDK work, not a Redis scanner.',
    howItConnects: 'Sentry SDK in the Node worker. Crons check-ins for schedules.',
    codeChanges: 'Yes, SDK init and optional queue spans.',
    autoDiscovery: 'Destinations appear from spans, not Redis SCAN.',
    multiEnv: 'Sentry projects/environments.',
    alerts:
      'Issue alerts. Crons: 1 monitor included on paid plans, extra $0.78/monitor PAYG (2026-10-20).',
    mcp: 'Yes, `mcp.sentry.dev` — issues and Sentry data. Not BullMQ retry/promote.',
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
          'Do not claim global auto-instrumentation. Product Queues docs still say Celery. NestJS BullMQ wrapping exists in the JavaScript SDK. Confirm against your SDK version.',
      },
    ],
    sources: [{ label: 'Sentry Queues', url: 'https://docs.sentry.io/product/insights/queues/' }],
    related: ['datadog', 'grafana', 'bull-board'],
  },
]
