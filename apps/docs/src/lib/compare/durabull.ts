import { MCP_FACTS, MCP_URL } from '@/lib/mcp-facts'

export const DURABULL = {
  name: 'Durabull',
  website: 'https://durabull.io',
  app: 'https://app.durabull.io',
  mcpUrl: MCP_URL,
  pricing:
    'Hosted dashboard is $0/month during beta. Redis, worker compute, and infrastructure operations remain your costs. Beta pricing is not a commitment to future paid-plan terms.',
  license: 'Apache License 2.0 (OSI-approved open source). Self-host on your own infrastructure.',
  discovery:
    'SCAN for `<prefix>:*:meta` (default prefix `bull`). No worker SDK required to list queues or inspect jobs.',
  multiEnv:
    'Multiple Redis connections per organization, tagged development / staging / production.',
  alerts:
    'Failure threshold, failure rate, queue stalled, per-job failed, Redis health. Delivery: email, HMAC-signed webhooks, Linear. A webhook receiver can adapt events for other systems; native Slack and PagerDuty delivery are not included.',
  mcp: `${MCP_FACTS.tools} MCP tools (${MCP_FACTS.readTools} read, ${MCP_FACTS.writeTools} write), ${MCP_FACTS.scopes} OAuth scopes, ${MCP_FACTS.prompts} operator prompts. Hosted at ${MCP_URL}. Write scopes are opt-in: retry, promote, pause/resume, alert ack/resolve/snooze. Destructive Redis commands and payload edits are not exposed over MCP.`,
  caveats: [
    'Connects to Redis-backed BullMQ; BullMQ’s PostgreSQL backend is not currently supported.',
    'Redis must be reachable from the Durabull deployment, with credentials and permissions for the requested operations.',
    'MCP redaction filters sensitive fields and common secret patterns; it is not a guarantee that arbitrary payloads contain no sensitive data.',
    'Throughput charts need BullMQ metrics enabled on workers (`metrics.maxDataPoints`).',
    'Job logs appear only when workers call `job.log()`.',
    'Documented MCP setup covers Claude, ChatGPT, and Codex; other MCP hosts are not documented as tested.',
  ],
} as const
