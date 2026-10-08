# Durabull — BullMQ & Redis

Manage BullMQ background jobs from your assistant: find a failing job, understand a backlog, inspect recurring schedules, check Redis health, and recover work with a specific request.

## Connect

- **ChatGPT:** add the custom MCP server `https://app.durabull.io/mcp` in plugin settings and complete browser OAuth. Connecting the server supplies tools, but does not install the nine workflow skills. For those, add the portable package at `plugins/durabull` to a local marketplace, install it from the Plugins Directory, and start a new conversation with the plugin enabled. See [OpenAI’s complete-plugin installation guide](https://developers.openai.com/plugins/deploy/connect-chatgpt#test-the-complete-plugin). Supported MCP Apps hosts show the interactive explorer.
- **Claude:** add the same URL as a remote connector and complete OAuth. The connector supplies tools and MCP Apps; the plugin supplies skills on hosts that support plugin installation.
- **Claude Code:** from the repository root, run `claude --plugin-dir ./plugins/durabull`. To install from the repository marketplace, use `/plugin marketplace add durabullhq/durabull` followed by `/plugin install durabull@durabull`. Text tools and skills work without an embedded UI.
- **Self-hosted:** generate an independent package with `bun run mcp:plugin --endpoint https://queues.example.com/mcp --out /tmp/durabull-plugin`. This updates both host configurations and every skill's MCP dependency. Connect to your own origin, not the Cloud URL.

You need a Durabull account with access to a Redis connection and its BullMQ queues. OAuth grants, organization permissions and service-account policy determine which data and operations are available. Never paste Redis credentials or access tokens into chat.

## Start with a real task

| Skill | Example request | Result |
| --- | --- | --- |
| [Setup](skills/setup/SKILL.md) | “Connect Durabull and show my environments.” | Verified access and connection selection |
| [Fleet health](skills/fleet-health/SKILL.md) | “Which production queues need attention?” | Scoped inventory, backlog, workers and incidents |
| [Queue triage](skills/queue-triage/SKILL.md) | “Why is the receipt queue backing up?” | Evidence for the bottleneck and next step |
| [Inspect job](skills/inspect-job/SKILL.md) | “Find job 1042 and explain its failure.” | Exact job identity, redacted evidence and gaps |
| [Schedules](skills/schedules/SKILL.md) | “When does the daily digest run next?” | Cron/interval, timezone, limits and recent failures |
| [Redis health](skills/redis-health/SKILL.md) | “Is Redis memory pressure affecting jobs?” | Capacity, history, thresholds and sample coverage |
| [Alert triage](skills/alert-triage/SKILL.md) | “Why was this incident's notification not delivered?” | Delivery attempts, rule state and incident evidence |
| [Job recovery](skills/job-recovery/SKILL.md) | “Retry this failed receipt job once.” | State-checked retry/promotion and observed result |
| [Queue control](skills/queue-control/SKILL.md) | “Pause receipts during maintenance.” | Verified pause/resume state |

Alert triage also handles requested acknowledgement, unacknowledgement, resolution, snooze and unsnooze. The embedded app supports paginated inventories, exact job-ID search across queues, logs and stacktraces, recurring schedules, incident and rule inspection, Redis history, light/dark themes and host-supported fullscreen. “Ask to…” buttons send explicit requests to your assistant; data calls remain authorized on the server.

## Boundaries

This is a BullMQ operations integration, not an arbitrary Redis command interface. It does not edit job payloads or Redis keys, delete jobs, purge queues, scale workers, create/edit schedules or configure alert rules. A retry being queued does not prove success. A snapshot is not continuous monitoring. Missing or stale samples remain visible as uncertainty.

## Maintainers

`plugin.json` and `mcp.json` are canonical. `bun run mcp:plugin` generates Claude compatibility files and `agents/openai.yaml` for all skills. `bun run mcp:check` checks schemas, coverage, bundle freshness, protocol and policy. Run `claude plugin validate plugins/durabull` from the repository root.

[evals.json](evals.json) contains 20 workflow scenarios and 8 boundary scenarios for real-host testing. Automated catalog checks verify that the scenarios reference real tools; they do not measure model routing or live OAuth behavior. Screenshots under `assets/` use clearly labeled preview fixtures and contain no customer data.

The package is ready for local installation and submission preparation. Public directory availability requires each platform's publisher review; this repository is not evidence of approval. See the repository's `docs/mcp-plugin-release.md` for the submission and validation record.
