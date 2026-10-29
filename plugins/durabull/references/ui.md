# Intentional UI display

Data tools return text and structured evidence. Use them for investigation, intermediate steps, pagination, background checks and post-operation verification. A text answer is the default.

Call `render_ui` when the user asks to open an interactive UI, or when a focused view materially helps present the answer. Prefer one useful view after gathering evidence. Routine tool calls and successful mutations do not require a card.

Pass `toolName` as the read tool for the desired view, and `arguments` exactly as that tool expects. Use discovered IDs and the selected tool's input schema. For example:

```json
{
  "toolName": "get_queue",
  "arguments": { "connectionId": "<discovered-id>", "queueName": "emails" }
}
```

- Connection browser: call `render_ui` with `{}`.
- Throughput chart: select `get_queue_metrics` with `connectionId`, `queueName` and optional `windowMinutes`.
- Job details: select `get_job` with `connectionId`, `queueName` and `jobId`.
- Incidents: select `get_alert_summary` with `connectionId`.

The `toolName` enum lists all supported views. Supply identifiers and filters, not earlier tool results or payloads. `render_ui` returns only a validated view request. The app loads fresh evidence using the selected read tool's scopes and permissions; opening a UI does not grant data access or perform a mutation.

If `render_ui` reports that output safety would redact or truncate an identifier or filter, call the selected read tool directly with the original arguments and summarize its evidence. The launcher rejects these requests rather than loading an altered target.

“Why is this queue backing up?” normally calls for investigation and an explanation. “Open this queue's dashboard” calls for a UI. After retrying a job, verify with `get_job` and report its state; show its view only when useful for the user.

In hosts without MCP Apps, call the read tool directly and summarize its evidence. A successful `render_ui` response does not prove that a host displayed the UI. Once an app is open, its own navigation, pagination and refresh update that view without additional `render_ui` calls.
