# MCP v2, Apps and plugin maintenance

Durabull serves MCP revision **2026-07-28** using SDK **2.3.1**, with MCP Apps **2.0.3**. The date identifies the protocol; v2 identifies the SDK. The same `/mcp` endpoint also accepts legacy `initialize` clients without transport sessions. GET/DELETE session operations return 405. Reconnect clients when deploying this upgrade. [Official migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28).

## Architecture

- `packages/mcp/src/tools/tool-catalog.ts` remains the tool/schema/scope source of truth. The registration registry derives listing descriptors from actual registered tools, including OpenAI's top-level OAuth `securitySchemes` extension and `_meta` mirror.
- `packages/mcp/src/routes.ts` uses `createMcpHandler`. Host/Origin validation, 1 MB body limit, authentication, policy, rate limits and AsyncLocalStorage remain outside the SDK entry. No customer state is held in transport sessions.
- `packages/mcp/src/apps/ui` contains the React app, built with OpenAI's [Apps SDK UI](https://github.com/openai/apps-sdk-ui) components and Tailwind tokens so cards look native in ChatGPT and Claude. `scripts/bundle-app.ts` (Vite) inlines it into one HTML document; Apps SDK UI's KaTeX CSS is omitted because its fonts need a remote origin. Only the host theme and `--font-sans`/`--font-mono` are adopted: other MCP host style variables share names with Apps SDK UI tokens but differ in meaning. The official Apps `App` bridge handles communication; it contains no API token, direct network requests, storage or external assets. The generated text asset is imported into the server and embedded by the production Bun build. It is committed so fresh checkouts, source-mode Docker, and tests do not require a separate frontend build.
- `ui://durabull/queue-explorer-v1.html` is a data-free, authenticated discovery resource. Only this exact shell skips service-account tenant bindings. Every data call retains its own permission checks. Change the versioned URI for breaking UI contracts.
- `plugins/durabull` is the portable Agent Plugins package. `.claude-plugin/plugin.json` and `.mcp.json` are generated compatibility files. Nine focused skills cover setup, fleet health, queue triage, job inspection, recurring schedules, Redis health, alert triage, job recovery and queue control. Each skill has a generated MCP dependency for the selected deployment. Repository marketplace manifests support local installation; they do not install or publish anything automatically.

## Host behavior

| Host | Integration | UI |
| --- | --- | --- |
| Claude app/Desktop/Cowork | Remote connector at the deployment `/mcp` URL | Standard MCP Apps |
| Claude Code | `claude --plugin-dir ./plugins/durabull`, or repository marketplace | Text tools and skills |
| ChatGPT Work | Custom MCP server; portable plugin for skills | Standard MCP Apps; global/sidebar and thread/panel entrypoints on supported surfaces |
| Codex | Portable package through `.agents/plugins/marketplace.json` | Host dependent; text fallback always remains |

The app opens on `list_connections` and supports browsing, filtering the current page, explicit refresh, cursor pagination, exact job-ID search across queues, job details/logs, schedules, incidents, alert rules, delivery status and Redis health. “Ask to…” actions send a user message through the host; they do not directly call mutations. The bridge enforces the catalog's read-only allowlist, and refreshing a mutation result reads the affected entity instead of repeating the write. Failed navigation has a Retry action for the exact failed read; history preserves each snapshot's timestamp. Features requiring a host capability are hidden when it is absent. UI visibility hints never replace server authorization.

The standard `ui.domain` is intentionally omitted: Claude and ChatGPT assign different meanings to it. `openai/widgetDomain` is derived from `APP_BASE_URL`; verify it is a unique plugin origin before OpenAI submission. The resource advertises an empty network/frame CSP. Embedded apps only need the host bridge. [MCP Apps migration](https://apps.extensions.modelcontextprotocol.io/api/documents/migrate-to-v2.html), [OpenAI metadata](https://developers.openai.com/plugins/reference).

Do not install `@openai/mcp-extensions@0.1.0` into this SDK v2 package: its published peers still require SDK v1. Global/thread metadata uses the documented JSON extension contract without that dependency. [Extension specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md).

## Edit and verify

```sh
# Regenerate the bundled UI after editing its TS or CSS.
bun run mcp:app

# Regenerate Claude compatibility files after changing portable identity.
bun run mcp:plugin

# Protocol, security, catalog, plugin schema and bundle freshness tests.
bun run mcp:check
bun run --cwd packages/mcp typecheck
bun run --cwd apps/api typecheck
bun run --cwd apps/api build
claude plugin validate plugins/durabull

# Real Apps SDK bridge with schema-validated fake data. Loopback only.
bun run --cwd packages/mcp preview:app
# Open http://127.0.0.1:4318/ or append ?theme=dark
```

The preview explicitly labels fixture data, never connects to Redis, rejects direct UI mutation calls, and validates tool outputs against the production schemas. Each view is also a Storybook card under **MCP Apps** (ChatGPT, Claude, dark and phone variants). Verify keyboard navigation, 320/390px widths, light/dark themes, first-result delivery without a duplicate call, refresh, pagination, denied-scope errors and “Ask to retry” before shipping UI changes. Do not mistake this harness for a live host OAuth test.

Portable manifest and MCP schemas are vendored in `tooling/scripts/schemas/` from `agent-plugins.org/schemas/1.0.0/` and validated with AJV. Update them deliberately alongside a plugin-format migration. Keep versions in portable and Claude manifests synchronized using the generator.

For self-hosting, write an independent package instead of modifying the Cloud source:

```sh
bun run mcp:plugin --endpoint https://queues.example.com/mcp --out /tmp/durabull-plugin
claude plugin validate /tmp/durabull-plugin
```

The generator rejects credentials in endpoints, query/fragment tokens and non-loopback plain HTTP. No bearer token is packaged. OpenAI does not expand Claude-specific `user_config`; generated concrete endpoints work across hosts. [Packaging](https://developers.openai.com/plugins/build/plugins), [Claude plugin reference](https://code.claude.com/docs/en/plugins-reference).

## Authentication and publishing evidence

OAuth discovery, token resource binding, expiry, scope consent and tenant authorization remain owned by Durabull/Better Auth. Operation scope denials return an HTTP 403 `WWW-Authenticate` challenge with the complete transport-plus-operation scope set. OpenAI documents this transport-level reauthorization route in its [authentication guide](https://developers.openai.com/plugins/build/auth#echo-the-resource-parameter-throughout-the-oauth-flow). Reauthorization cannot fix tenant or service-account policy denials; the UI directs those to an administrator. Optional tool-result linking with `mcp/www_authenticate` is a separate flow, not implemented here. Actual host reauthorization still needs live validation; a correct HTTP challenge alone does not prove the product UI flow.

No CIMD, issuer-response support, durable tasks, sampling, file editing or subscriptions are advertised merely to increase the feature count. Those need separate product semantics, provider support or durable infrastructure. Existing bounded queue reads and state-guarded operations use current protocol discovery, per-request capabilities, structured results and Apps instead.

Public platform installation/publishing still requires the actual deployment and publisher account. Before release:

1. Deploy to staging; verify current pinned and legacy clients, valid/expired/wrong-resource tokens and tenant boundaries.
2. In Claude and ChatGPT, complete fresh authorization, read discovery, refresh/reconnect and write-scope elevation. Use the exact callback URL each platform supplies. Do not broaden redirect wildcards for convenience.
3. Confirm inline, sidebar and conversation views, permission denial, mobile rendering and user-requested recovery on a disposable job. A queued retry is not a completed job.
4. Verify OpenAI's unique widget domain, publisher/support/privacy/terms fields, screenshots and review account. Configure a real `plugin_asdk_app...` mapping only after a connection is registered; never ship a fabricated ID.
5. Submit the remote Claude connector and Claude Code plugin separately where desired; submit the OpenAI plugin through its own review. Neither approval transfers to the other platform.

[OpenAI review](https://developers.openai.com/plugins/deploy/app-review), [Claude submission](https://claude.com/docs/connectors/building/submission), [OAuth operations](./mcp-oauth-operator.md).

## Plugin release package

See [plugin release record](./mcp-plugin-release.md) for the capability inventory, host test scenarios, package checks and remaining publisher steps. The full nine-skill set ships in the portable package. MCP skill import is intentionally not advertised: OpenAI currently limits that import route to five skills; upload the plugin package instead.
