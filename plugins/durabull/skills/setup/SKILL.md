---
name: setup
description: Connect Durabull and verify which BullMQ connections and diagnostic permissions are available. Use for initial setup or reconnecting after an access error.
---

Use the Durabull MCP server bundled with this plugin. The default endpoint is Durabull Cloud; a self-hosted installation uses its own public HTTPS origin followed by `/mcp`.

1. Use the host's MCP connection and OAuth flow. Never request pasted access tokens, passwords, Redis URLs or client secrets in chat.
2. Call `list_connections`; if no connection is visible, explain that the user needs organization membership and connection access in Durabull. Do not guess connection IDs.
3. Read `durabull://server` when the host supports resources to inspect granted scopes. Discovery describes available operations; it does not grant them.
4. Summarize the connected environment and what can be read. The initial grant is read-only. For an explicitly requested operation that returns `insufficient_scope`, use the host's reauthorization flow for the required scope. A policy/tenant denial needs an administrator, not repeated OAuth attempts.

In MCP Apps hosts, `list_connections` opens the queue explorer. Claude Code uses text results. The same connection and tools support both. Stop after verifying access; do not mutate queues as a connection test.
