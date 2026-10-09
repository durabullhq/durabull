// Shared by the FAQ page, landing page, and FAQ structured data.
export const faqs = [
  {
    question: 'What is Durabull?',
    answer:
      'Durabull is a dashboard for BullMQ queue operations: inspect jobs, debug failures, manage schedulers, track workers, and configure alerts.',
  },
  {
    question: 'Can AI agents use Durabull?',
    answer:
      'Yes. Durabull MCP connects Claude, ChatGPT, Cowork, Cursor, and any MCP client to your queues using OAuth. Agents get read access by default, and retrying, promoting, pausing, and alert actions are opt-in write scopes. Claude, Cowork, and ChatGPT also show an interactive Queue Explorer app in the conversation.',
  },
  {
    question: 'Do I need to modify my existing BullMQ code?',
    answer:
      'Queue and job inspection connects directly to Redis without a worker SDK. Throughput charts require BullMQ metrics enabled on your workers.',
  },
  {
    question: 'How does Durabull handle my data?',
    answer:
      'The API and browser read job payloads, results, and logs for inspection. Redis transport uses TLS when you configure a rediss:// URL. Self-host if this processing must stay within your deployment. Built-in usage telemetry excludes job data, logs, and Redis URLs; optional PostHog analytics is separate.',
  },
  {
    question: 'Can I use multiple Redis instances?',
    answer:
      'Yes. Each organization can manage multiple Redis connections for production, staging, and development.',
  },
  {
    question: 'How does pricing work?',
    answer: 'The hosted app is free during beta. See the pricing page for current terms.',
  },
  {
    question: 'How can I install Durabull?',
    answer:
      'Use the hosted app, install the desktop app on Apple Silicon macOS or Windows, or self-host with Docker or from source. The desktop guide includes downloads, Homebrew installation, and macOS checksum verification.',
  },
  {
    question: 'Can I run Durabull in authless mode?',
    answer:
      'Yes, on a trusted private network. Authless mode removes web and REST API login checks. Both PostgreSQL and PGlite persist data; PGlite uses local disk and needs a persistent volume in containers. MCP still requires a bearer token.',
  },
  {
    question: 'How do I check BullMQ compatibility?',
    answer:
      "Test with your application's BullMQ version and Redis key prefix before production use. Check queue discovery, jobs, schedulers, and metrics in your deployment.",
  },
  {
    question: 'Where can I get help?',
    answer: 'Start with the documentation and troubleshooting guide, or contact hello@durabull.io.',
  },
]
