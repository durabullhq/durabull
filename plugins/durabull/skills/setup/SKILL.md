---
name: setup
description: Connect Durabull to inspect BullMQ queues and Redis. Use for first-time setup, available capabilities, choosing an environment, or reconnecting after an access error.
metadata:
  short-description: Connect BullMQ and Redis to your assistant
---

# Connect Durabull

1. Use the bundled MCP connection and the host's browser OAuth flow. Cloud uses `https://app.durabull.io/mcp`; self-hosted installations use their own public HTTPS origin plus `/mcp`. Keep tokens, Redis URLs, passwords, and client secrets out of chat.
2. Call `ping` to verify transport, then `list_connections`. Follow `nextCursor` to find the requested environment. Preserve returned IDs; a connection name is not an ID. If multiple connections match, ask which environment the user means. An empty list means no visible connections, not an empty Redis database: check organization membership and connection access in Durabull.
3. Read `durabull://server` when resources are supported to inspect granted scopes and the live catalog. Tool availability alone does not grant permission. On `insufficient_scope`, use host OAuth reauthorization; tenant or service-account policy denials need the connection administrator. If the host cannot elevate scopes, explain the required grant and stop the affected operation.
4. On a rate-limit response, honor the returned `retryAfter`/`Retry-After` delay. Keep the same target and pagination cursor; reconnecting does not reset the work budget. Avoid parallel retry loops.
5. Finish with the selected connection and environment, verified access, and a useful next task. `list_connections` opens the visual explorer in MCP Apps hosts; text tools work without it. Never mutate data as a connection test.

## Choose the next workflow

- Fleet health: overall queue, worker, alert and Redis status across selected connections.
- Queue triage: a backlog, stuck jobs, poor throughput, or worker shortage.
- Inspect job: locate an ID, inspect payload/progress/results, or diagnose a failure.
- Schedules: inspect repeatable jobs, cron, intervals, timezones and next runs.
- Redis health: memory, CPU, client pressure, evictions and collection coverage.
- Alert triage: incident evidence, delivery failures, acknowledgements and snoozes.
- Job recovery: retry a failed job or promote a delayed job on request.
- Queue control: pause or resume a named queue on request.

Durabull manages BullMQ background jobs on Redis. This MCP does not run arbitrary Redis commands, edit keys or job payloads, delete jobs, purge queues, scale workers, create schedules, or configure alert rules. For those requests, explain the boundary and point to the relevant Durabull or application controls without claiming to have performed the change.
