# MCP v2 migration verification

Verified locally on 2026-10-07. This records development evidence, not platform certification.

## Automated checks

- `bun run mcp:check`: **163 passed, 0 failed** (79 package/plugin tests and 84 API MCP tests). Includes generated bundle freshness, portable plugin schema validation, generated Claude overlays, legacy/automatic/pinned current SDK clients, modern discovery and headers, stateless concurrency, Origin rejection, authentication, scope challenges, tenant policy and the authenticated UI resource.
- `bun run --cwd packages/mcp typecheck`: passed, including UI and preview scripts.
- `bun run --cwd apps/api typecheck`: passed.
- `bun run --cwd apps/api build`: passed with the bundled app asset.
- `claude plugin validate plugins/durabull`: passed.
- `claude plugin validate .claude-plugin/marketplace.json`: passed without warnings.
- `git diff --check`: passed.

The API auth test deliberately exercises an unavailable verification backend; its expected error log does not indicate a failed check.

## Browser evidence

Used the actual bundled app and official MCP Apps `AppBridge`/`PostMessageTransport` against schema-validated fixtures at `http://127.0.0.1:4318/`. The iframe is sandboxed with `allow-scripts` only and a restrictive CSP. No live Redis or customer data was used.

Verified:

- Initial host result renders without a duplicate tool call.
- Connection, queue, failed-job and log navigation; current-page filtering; cursor pagination; refresh.
- Access-denied response shows a recoverable error.
- HTML-like queue names and payloads render as text; no injected image or script executes.
- Light/dark host themes and 390px/320px layouts, with no horizontal page overflow.
- Keyboard activation works, and completed navigation moves focus to the new heading.
- “Ask to retry” emits one host message, disables repeated submissions while pending, and makes no direct `retry_job` call.
- The bridge still initializes and navigates after removing same-origin access from the preview iframe.

Screenshots: [desktop overview](./previews/durabull-mcp-overview.png), [320px dark view](./previews/durabull-mcp-mobile-dark.png).

The preview covers representative flows and deliberately denies alert details. Some secondary tools have no fixture. Re-run it with `bun run --cwd packages/mcp preview:app`.

## External validation still required

No deployment, real Claude/ChatGPT OAuth flow, live tenant recovery operation, directory submission or public publication was performed. Local protocol clients and an SDK bridge cannot prove those account- and host-dependent behaviors. Follow the release steps in [the maintenance guide](../../docs/mcp-apps-and-plugins.md), including fresh authorization, scope elevation, refresh/reconnect, dedicated widget-origin review and exact registered callback URLs.

## Comments

**2026-10-08:** The MCP app UI was rebuilt on OpenAI Apps SDK UI in [#160](https://github.com/durabullhq/durabull/pull/160). The protocol, security and bridge evidence above still applies. The two screenshots show the earlier vanilla TS/CSS UI, so keep them only as a record of what was verified on 2026-10-07. For the current UI, review the **MCP Apps** cards in Storybook (`bun run storybook`); `playwright test --grep MCP` in `apps/storybook` exercises every card plus navigation, job search and the assistant handoff.
