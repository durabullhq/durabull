import { MCP_FACTS, MCP_URL } from '@/lib/mcp-facts'

export const DURABULL = {
  name: 'Durabull',
  website: 'https://durabull.io',
  app: 'https://app.durabull.io',
  mcpUrl: MCP_URL,
  pricing: 'Hosted app is $0/mo during beta. No published usage meters or connection caps.',
  license: 'Elastic License 2.0 (source-available, not OSI open source). Self-host anytime.',
  discovery:
    'SCAN for `<prefix>:*:meta` (default prefix `bull`). No worker SDK required to list queues or inspect jobs.',
  multiEnv:
    'Multiple Redis connections per organization, tagged development / staging / production.',
  alerts:
    'Failure threshold, failure rate, queue stalled, per-job failed, Redis health. Delivery: email, HMAC-signed webhooks, Linear. Webhooks can feed Slack or PagerDuty; there is no native Slack or PagerDuty integration.',
  mcp: `${MCP_FACTS.tools} MCP tools (${MCP_FACTS.readTools} read, ${MCP_FACTS.writeTools} write), ${MCP_FACTS.scopes} OAuth scopes, ${MCP_FACTS.prompts} operator prompts. Hosted at ${MCP_URL}. Write scopes are opt-in: retry, promote, pause/resume, alert ack/resolve/snooze. Destructive Redis commands and payload edits are not exposed over MCP.`,
  caveats: [
    'Throughput charts need BullMQ metrics enabled on workers (`metrics.maxDataPoints`).',
    'Job logs appear only when workers call `job.log()`.',
    'Cursor and some MCP hosts are listed as not fully tested.',
  ],
} as const
