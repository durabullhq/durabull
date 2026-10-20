import { CostCalculator } from './cost-calculator'
import { GuideSteps } from './editorial'

export function ArticleVisual({ slug }: { slug: string }) {
  if (slug === 'trigger-dev-vs-bullmq-cost') return <CostCalculator mode="trigger" />
  if (slug === 'inngest-vs-bullmq-durabull-cost') return <CostCalculator mode="inngest" />
  const visuals: Record<
    string,
    { title: string; steps: { title: string; detail: string }[]; caption: string }
  > = {
    'how-to-monitor-bullmq-in-production': {
      title: 'The production feedback loop',
      steps: [
        {
          title: 'Observe',
          detail: 'Queue age, failures, completion rate, worker availability, and Redis health.',
        },
        {
          title: 'Investigate',
          detail: 'Inspect a representative job, its logs, stack trace, and dependency health.',
        },
        {
          title: 'Recover & verify',
          detail: 'Fix the cause, retry only safe work, then verify completions and side effects.',
        },
      ],
      caption:
        'A count is a signal. A recovery is complete only when the workload is healthy again.',
    },
    'bullmq-mcp-server-for-ai-agents': {
      title: 'From question to controlled action',
      steps: [
        {
          title: 'Authenticate',
          detail: 'The MCP client connects as a user with explicit scopes.',
        },
        {
          title: 'Gather evidence',
          detail: 'Read queue state and redacted job details before proposing a change.',
        },
        {
          title: 'Approve a bounded write',
          detail:
            'Retry, promote, or pause with the required scope and a clear operational reason.',
        },
        {
          title: 'Verify the result',
          detail:
            'Check eventual job state. An accepted retry is not proof that the job completed.',
        },
      ],
      caption:
        'MCP is a tool protocol. Permissions and operational judgment still determine which actions are appropriate.',
    },
    'replace-bull-board': {
      title: 'A reversible dashboard cutover',
      steps: [
        {
          title: 'Record the baseline',
          detail: 'Capture connections, prefixes, counts, permissions, and required workflows.',
        },
        {
          title: 'Run both views',
          detail: 'Connect the replacement and validate it against staging before production.',
        },
        {
          title: 'Retire the old route',
          detail:
            'Remove only dashboard wiring after parity checks. Keep the producer and worker code.',
        },
      ],
      caption:
        'The dashboard changes; the queue data stays in its existing backend. Keep a rollback path.',
    },
    'redis-insight-is-not-a-bullmq-dashboard': {
      title: 'Follow the incident to the right layer',
      steps: [
        {
          title: 'Application',
          detail: 'Use traces and errors to identify the failing dependency or code path.',
        },
        {
          title: 'BullMQ jobs',
          detail: 'Inspect failed work, retry safely, and verify recovery in a queue dashboard.',
        },
        {
          title: 'Redis',
          detail:
            'Use Redis Insight and infrastructure telemetry to examine keys, memory, and latency.',
        },
      ],
      caption:
        'These are complementary views of the same system. Choose the view that answers your next question.',
    },
    'self-hosted-vs-managed-job-queues': {
      title: 'Account for the whole operating model',
      steps: [
        {
          title: 'Execution semantics',
          detail: 'Retries, scheduling, durable waits, signals, concurrency, and idempotency.',
        },
        {
          title: 'Infrastructure ownership',
          detail: 'Who runs the broker, scheduler, worker compute, upgrades, and recovery?',
        },
        {
          title: 'Total operating cost',
          detail: 'Usage charges + compute + storage + networking + support + engineering time.',
        },
      ],
      caption:
        'Compare equivalent workloads and responsibilities. A dashboard fee is only one component.',
    },
    'best-bullmq-dashboards-2026': {
      title: 'A practical evaluation sequence',
      steps: [
        {
          title: 'Compatibility first',
          detail:
            'Verify backend, BullMQ version, connection topology, and private-network access.',
        },
        {
          title: 'Exercise real workflows',
          detail: 'Inspect a failed job, find a new queue, and test a safe recovery in staging.',
        },
        {
          title: 'Check the operating boundary',
          detail:
            'Compare access controls, alert delivery, MCP permissions, and total ownership cost.',
        },
      ],
      caption:
        'Evaluate a deployment mode, not just a product name. Embedded and standalone modes can differ.',
    },
  }
  const visual = visuals[slug]
  return visual ? <GuideSteps {...visual} /> : null
}
