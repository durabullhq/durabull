/** Shared marketing copy for /home-2 — keep voice consistent across sections. */

export const home2Copy = {
  hero: {
    bannerTag: 'New',
    bannerText: 'Route failed jobs to Linear — one deduplicated issue per job',
    bannerCta: 'See how it works',
    headline: {
      line1: 'The BullMQ dashboard for teams that ship.',
      line2: 'The only BullMQ dashboard for true production scale.',
    },
    subhead:
      'Connect Redis — workers unchanged. Monitor every queue, inspect failed jobs, manage schedulers, and catch stalls before they become outages.',
    stats: [
      { label: 'Setup', value: 'redis://…', detail: 'Point at prod, staging, or local Redis.' },
      { label: 'Beta price', value: '$0', detail: 'Every feature. No card required.' },
      { label: 'License', value: 'ELv2', detail: 'Open source. Self-host anytime.' },
      { label: 'Metrics', value: 'Native', detail: 'BullMQ APIs only — no extra metrics DB.' },
    ],
  },
  trust: {
    label: 'Trusted by teams running BullMQ in production',
  },
  console: {
    eyebrow: 'Queues dashboard',
    headline: {
      primary: ['Every queue in one view.'],
      dim: ['Drill to the job in seconds.'],
    },
    subhead:
      'Live counts for waiting, active, delayed, failed, and paused jobs. Filter, search, pause, retry, and bulk-operate — the way you already think about incidents, without leaving the UI.',
  },
  pillars: {
    eyebrow: 'Why teams choose Durabull',
    headline: {
      primary: ['One product for'],
      accent: ['visibility, incidents, and alerts.'],
    },
    subhead:
      'Replace the patchwork of Bull Board tabs, redis-cli one-liners, and log grep with a single surface your whole team can use during an outage.',
    cards: [
      {
        eyebrow: 'Fleet Analytics',
        title: 'See pressure across every queue.',
        titleAccent: 'Not queue by queue.',
        body: 'Health scores, throughput trends, backlog spikes, failure rates, worker capacity, and scheduler risk — ranked so you know which queue to open first.',
      },
      {
        eyebrow: 'Job debugging',
        title: 'From failed job to fix',
        titleAccent: 'in one screen.',
        body: 'Payload, attempts, stack trace, and structured logs together. Retry, remove, or invoke delayed jobs — with destructive actions gated by typing the exact queue name.',
      },
      {
        eyebrow: 'Alerts',
        title: 'Alerts that run',
        titleAccent: 'while you sleep.',
        body: 'A background monitor watches Redis even when nobody has the dashboard open. Route to email, signed webhooks, or Linear — one issue per failed job, deduplicated on retry storms.',
      },
    ],
  },
  flow: {
    eyebrow: 'Incident workflow',
    headline: {
      primary: ['Five steps.'],
      accent: ['One tab.'],
    },
    subhead:
      'The path you already take during an incident — find the failure, read the trace, check logs, retry, file a ticket — without switching tools or pasting job IDs into Slack.',
    steps: [
      {
        index: '01 · Alert',
        title: 'Land on the failed job.',
        body: 'Open from an alert link, filter by status, or search by job ID.',
      },
      {
        index: '02 · Trace',
        title: 'Read the stack trace.',
        body: 'Pulled from the job hash in the UI. No manual HGET.',
      },
      {
        index: '03 · Logs',
        title: 'Scan structured logs.',
        body: 'Level badges, context tags, and key=value highlighting when workers use the recommended format.',
      },
      {
        index: '04 · Retry',
        title: 'Retry or bulk-replay.',
        body: 'One job or up to 100 at once. Original payload and options preserved.',
      },
      {
        index: '05 · Track',
        title: 'File in Linear.',
        body: 'One issue per failed job with durable mapping — no duplicate tickets on retries.',
      },
    ],
  },
  integration: {
    eyebrow: 'Zero integration tax',
    headline: {
      primary: ['Point at Redis.'],
      accent: ['Your queues show up.'],
      dim: ['Your workers stay unchanged.'],
    },
    subhead:
      'Durabull reads BullMQ data structures directly. No SDK install, no wrapper library, no deploy of a metrics pipeline. For richer per-queue charts, optionally set metrics.maxDataPoints on workers — that is the only change you might ever make.',
    bullets: [
      'Discovers queues via BullMQ meta keys — connect and see what is already running',
      'Live job counts, pause state, rate limits, and worker registration',
      'Charts from BullMQ getMetrics — not a separate Prometheus stack',
      'BullMQ v4+ on Redis or Redis-compatible stores',
    ],
  },
  deploy: {
    eyebrow: 'Deployment',
    headline: {
      primary: ['Cloud, Docker, desktop,'],
      accent: ['or behind your VPN.'],
    },
    subhead:
      'Same dashboard and APIs everywhere. Start in the cloud in minutes, or run entirely inside your network when data cannot leave the VPC.',
    cards: [
      {
        kx: 'Fastest start',
        title: 'Durabull Cloud',
        body: 'Sign up, add a Redis URL, invite your team.',
        bullets: ['Google or GitHub sign-in', 'Multiple connections per org', 'Free during beta'],
        link: 'Start free',
      },
      {
        kx: 'Your VPC',
        title: 'Docker self-host',
        body: 'One container, full feature set, Postgres for teams.',
        bullets: ['Env-driven connection URLs', 'Reproducible deploys', 'ELv2 — fork and run'],
        link: 'Self-host guide',
      },
      {
        kx: 'Local & offline',
        title: 'Desktop app',
        body: 'macOS, Windows, or Homebrew — great for local Redis and tunneling to prod.',
        bullets: ['Authless by default', 'Encrypted saved URLs', 'Bundled API and UI'],
        link: 'Download',
      },
      {
        kx: 'Trusted network only',
        title: 'Authless mode',
        body: 'Skip sign-in for solo devs or small teams on a private LAN.',
        bullets: ['Postgres or PGlite', 'Auto local org', 'Not for public internet'],
        link: 'Read the guide',
      },
    ],
  },
  pricing: {
    eyebrow: 'Pricing',
    headline: {
      primary: ['Free during beta.'],
      accent: ['Honest pricing after.'],
    },
    subhead:
      'No per-seat games and no “contact sales” gate. When paid tiers arrive, they are meant to cover cloud compute — not margin-maximize your queue bill.',
    card: {
      plan: 'Beta — full product',
      note: 'No credit card. No feature gates.',
      commit: '// future pricing covers infrastructure only',
    },
  },
  faq: {
    eyebrow: 'FAQ',
    headline: 'Questions from teams evaluating Durabull.',
    asideBeforeDocs: 'Specs, env vars, and deployment guides live in the ',
    asideAfterDocs: '. Reach us at ',
    asideAfterEmail: ' for anything else.',
  },
  cta: {
    eyebrow: 'Get started',
    headline: {
      primary: ['Connect Redis today.'],
      dim: ['Ship calmer on-call tomorrow.'],
    },
    subhead:
      'Free during beta. Cloud signup takes minutes, or pull the Docker image into your VPC. Your BullMQ workers do not need a single line changed.',
    quick: [
      { label: '$ open Durabull.app' },
      { label: '$ docker run durabullhq/durabull' },
      { label: '$ brew install --cask durabull' },
      { label: '$ git clone durabullhq/durabull' },
    ],
  },
  footer: {
    tagline: 'The modern dashboard for BullMQ. Open source under ELv2.',
  },
  meta: {
    title: 'Durabull — The BullMQ dashboard for teams that ship at production scale',
    description:
      'The only BullMQ dashboard designed for true production scale. Monitor queues, debug failed jobs, manage schedulers, and route alerts — with zero changes to your workers. Free during beta. ELv2.',
  },
} as const

export const home2FaqItems = [
  {
    question: 'What is Durabull?',
    answer:
      'Durabull is an operations dashboard for BullMQ — the layer between your Redis-backed job queues and the engineers who keep them healthy. You get queue monitoring, job inspection, scheduler management, worker topology, fleet analytics, and alerting in one product.',
  },
  {
    question: 'Do I need to change my BullMQ workers?',
    answer:
      'No. Durabull connects to Redis and reads the BullMQ data structures your workers already write. Optional: set metrics.maxDataPoints on a worker if you want native throughput charts on that queue — nothing else is required.',
  },
  {
    question: 'Where does my job data live?',
    answer:
      'In your Redis, where it always has. Durabull reads queue metadata and job fields to render the UI; it is not a separate datastore for payloads. Destructive actions like purge require confirming the exact queue name, and raw bull: / bullmq: keys cannot be deleted from the key explorer.',
  },
  {
    question: 'Can I manage multiple environments?',
    answer:
      'Yes. Add production, staging, and development Redis connections under one organization — in the UI or via DURABULL_REDIS_URL_* environment variables for reproducible self-hosted deploys.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Free during beta with every feature enabled — unlimited connections and queues. Future hosted pricing is intended to be break-even (cover cloud compute). Self-hosting remains free under ELv2.',
  },
  {
    question: 'How do I install it?',
    answer:
      'Use Durabull Cloud for the fastest path, install the desktop app for local-first work, run the Docker image in your VPC, or build from source. All paths expose the same dashboard and HTTP API.',
  },
  {
    question: 'What is authless mode?',
    answer:
      'A sign-in-free deployment for trusted networks: Durabull creates a local organization automatically and persists settings with Postgres (teams) or PGlite (solo). Use it behind a VPN or on localhost — not on the public internet.',
  },
  {
    question: 'Which BullMQ versions are supported?',
    answer: 'BullMQ v4 and newer.',
  },
] as const
