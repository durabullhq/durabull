import { MCP_FACTS, MCP_URL } from '@/lib/mcp-facts'

export const DURABULL = {
  name: 'Durabull',
  website: 'https://durabull.io',
  app: 'https://app.durabull.io',
  mcpUrl: MCP_URL,
  pricing: 'Hosted app is free to start. Self-host anytime under ELv2.',
  license: 'Elastic License 2.0 (source-available, not OSI open source). Self-host anytime.',
  discovery:
    'SCAN for `<prefix>:*:meta` (default prefix `bull`). No worker SDK required to list queues or inspect jobs.',
  multiEnv:
    'Multiple Redis connections per organization, tagged development / staging / production.',
  alerts:
    'Failure threshold, failure rate, queue stalled, per-job failed, Redis health. Delivery today: email, HMAC-signed webhooks, Linear. Slack and PagerDuty are coming soon.',
  install:
    'Hosted web app, desktop app on Apple Silicon macOS and Windows, or Docker/source. Homebrew installs the desktop app (cask), not a CLI.',
  mcp: `${MCP_FACTS.tools} MCP tools (${MCP_FACTS.readTools} read, ${MCP_FACTS.writeTools} write), ${MCP_FACTS.scopes} OAuth scopes, ${MCP_FACTS.prompts} operator prompts. Hosted at ${MCP_URL}. Fully supported in Cursor and other MCP clients. Write scopes are opt-in: retry, promote, pause/resume, alert ack/resolve/snooze. Destructive Redis commands and payload edits are not exposed over MCP.`,
  caveats: [
    'Throughput charts need BullMQ metrics enabled on workers (`metrics.maxDataPoints`).',
    'Job logs appear only when workers call `job.log()`.',
  ],
} as const
