# MCP v2 and platform integration research

Verified on **2026-10-07**, against first-party specifications, SDK source, live npm metadata, and platform documentation. This is implementation research, not evidence that Durabull has passed either platform's production review or live OAuth/UI tests.

## Version baseline

The current MCP protocol revision is **2026-07-28**. “v2” refers to the TypeScript SDK major version; it is now a **stable** release line, not an alpha. Merely replacing imports does not enable the new protocol: an ordinary manually connected `McpServer` still uses the legacy protocol era. [SDK overview](https://ts.sdk.modelcontextprotocol.io/v2/), [protocol support migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28).

Live `npm view <package> version dist-tags peerDependencies --json` observations:

| Package | Latest stable | Recommendation |
| --- | --- | --- |
| `@modelcontextprotocol/server` | `2.3.1` | Server and web-standard HTTP entry |
| `@modelcontextprotocol/client` | `2.3.1` | Test client and required MCP Apps peer |
| `@modelcontextprotocol/core` | `2.3.1` | Only import directly for runtime schemas/constants |
| `@modelcontextprotocol/hono` | `2.0.2` | Optional; existing Hono middleware can call the web handler directly |
| `@modelcontextprotocol/ext-apps` | `2.0.3` | Shared cross-host UI bridge and resource registration |
| `@openai/mcp-extensions` | `0.1.0` | **Do not add to this v2 runtime**: published peers require SDK `^1.29.0` and Apps `^1.7.5` |

Registry sources: [server](https://registry.npmjs.org/@modelcontextprotocol/server/latest), [client](https://registry.npmjs.org/@modelcontextprotocol/client/latest), [core](https://registry.npmjs.org/@modelcontextprotocol/core/latest), [Hono](https://registry.npmjs.org/@modelcontextprotocol/hono/latest), [Apps](https://registry.npmjs.org/@modelcontextprotocol/ext-apps/latest), [OpenAI extensions](https://registry.npmjs.org/@openai/mcp-extensions/latest). Versions are a dated observation; lock the resolved dependency graph.

Apps 2.x requires Node 20+, Zod `^4.2.0`, and the split SDK packages. Its iframe `ui/*` wire protocol remains compatible with Apps 1.x hosts. `App`, React hooks, `callServerTool`, `registerAppResource`, and `_meta.ui.resourceUri` remain available. Do not mix v1 SDK classes with v2 objects. [Apps v2 migration](https://apps.extensions.modelcontextprotocol.io/api/documents/migrate-to-v2.html).

## Protocol implementation

Use `createMcpHandler(factory)` from `@modelcontextprotocol/server`; the factory returns a fresh registered server per HTTP request. Its default `legacy: 'stateless'` supports legacy handshakes and current requests on one endpoint. Removing Durabull's session registry is appropriate if no business state depends on the session ID; test existing clients explicitly. Opt test clients into `{ versionNegotiation: { mode: 'auto' } }` or a `2026-07-28` pin. Otherwise tests can accidentally validate only the legacy path. [HTTP serving](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html), [protocol versions](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions).

Existing Hono integration can call:

```ts
const handler = createMcpHandler(() => createMcpServer(options));
// Run in the existing authenticated request context.
return handler.fetch(c.req.raw, { parsedBody: cachedRequestBody });
```

Pass the parsed body when earlier middleware has consumed or cached it. Verified SDK `authInfo`, when used, is passed in the same second argument and appears under `ctx.http.authInfo`. Custom AsyncLocalStorage authorization remains a separate application concern. [Hono recipe](https://ts.sdk.modelcontextprotocol.io/v2/serving/hono.html).

The protocol removed the initialize handshake, sessions, GET notification stream, resumable SSE, and core `ping` RPC in the modern era. It added `server/discover`, per-request capabilities/version, `resultType`, cache hints, and `subscriptions/listen`. Sampling, Roots, Logging, and DCR are deprecated; tasks moved out of core into an extension. These are reasons to use relevant features selectively, not to add every API. A business tool named `ping` is unrelated to the removed core RPC. [Protocol changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog).

Let the SDK encode modern metadata rather than building it manually. Requests carry `io.modelcontextprotocol/protocolVersion` and `io.modelcontextprotocol/clientCapabilities` in `_meta`; client identity is recommended. Modern result encoding supplies `resultType`, server identity, and conservative cache fields. Tool/resource metadata should be deterministic. Cache tenant data privately; keep live queue data uncached. Static versioned UI resources may have a deliberate longer lifetime. [SDK protocol migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28).

### HTTP security and interoperability

Validate a present `Origin` header and reject invalid origins with **403**. CORS response configuration alone does not do this. Keep exact Host validation, request limits, authentication, and tenant policy. Non-browser clients commonly omit Origin and should remain valid. Modern requests require `MCP-Protocol-Version`, `Mcp-Method`, and, for named methods, `Mcp-Name`; expose these through browser CORS. The SDK validates their agreement with the body. `x-mcp-header` input-schema annotations add mandatory matching headers, so do not add them casually. Set `X-Accel-Buffering: no` for SSE where the transport does not already do so. [Streamable HTTP specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).

Do not create a new SDK authorization server. The SDK's old authorization-server helpers are frozen legacy APIs. Keep a dedicated provider. For per-operation scope elevation, SDK registration supports `scopeChallenge` and `requireScopes`, but the current Durabull policy layer can produce the same challenge before invoking any tool. Those callbacks run before input-schema transforms; authorize validated canonical values when permission depends on an argument. [SDK authorization](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html).

## Shared interactive application

Register a versioned `ui://durabull/...` HTML resource with MIME `text/html;profile=mcp-app`, preferably through `registerAppResource`. Attach it to selected tools through `_meta.ui.resourceUri`. Use the standard `App` bridge, register result/input/error/context listeners **before** `await app.connect()`, and call tools using `app.callServerTool`. Render the initial host-delivered result without an immediate duplicate request. Preserve meaningful text plus `structuredContent` for hosts without a renderer. [Apps quickstart](https://apps.extensions.modelcontextprotocol.io/api/documents/quickstart.html), [Claude UI quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart).

The registration helpers do not automatically implement OAuth, domain mapping, or host-specific policy. Current `registerAppResource` defaults the MIME type and delegates to `registerResource`; `registerAppTool` mirrors the standard resource URI to the older `ui/resourceUri` metadata key. [Official helper source](https://github.com/modelcontextprotocol/ext-apps/blob/main/src/server/index.ts).

Recommended Durabull UI: connection picker → queue overview → job/failure inspection, with explicit refresh, pagination, bounded payload details, keyboard access, status text, empty/error/loading states, and server time/last-updated context. Reuse existing scoped diagnostics and mutations; do not add a browser API credential or alternate ungoverned data path. Keep mutations clearly labeled, narrow, and tied to the selected connection/queue/job. Refresh after a successful mutation; prevent duplicate submission while pending. This is a design recommendation derived from Durabull's existing domain and policy model.

Bundle JS/CSS/icons locally into one resource. For a bridge-only app, declare empty `connectDomains` and `resourceDomains`; nested frames are unnecessary. Render untrusted queue names, logs, payloads and errors as text rather than HTML. Host metadata is presentation input, never authorization identity. The Apps specification requires sandboxing and constrains host/app communication. [MCP Apps overview](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html), [Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).

### The `ui.domain` trap

`ui.domain` is optional and **host-dependent**. When omitted, the host chooses its sandbox origin. Claude's dedicated value is `sha256(exactMcpServerUrl).slice(0,32) + '.claudemcpcontent.com'`, without an HTTPS prefix. Do not send a generic app origin in that standard field to every host. [Claude domain requirements](https://claude.com/docs/connectors/building/mcp-apps/getting-started).

For the smallest compatible implementation, omit standard `ui.domain`. Supply configurable OpenAI-only `_meta['openai/widgetDomain']` when preparing public OpenAI submission; its documented compatibility alias accepts the dedicated widget origin. Derive a candidate from the actual configured app origin, never invent a deployed hostname; verify that it is unique to this plugin. OpenAI requires a dedicated unique domain for submitted UI. Standard metadata is preferred for CSP and border preference. [OpenAI resource metadata](https://developers.openai.com/plugins/reference).

Use host-provided themes/style variables and react to context changes. Support 320-point widths, 44-point touch targets, safe areas, visible focus, reduced motion, and light/dark themes. Inline views should be compact; on Claude mobile the conversation owns vertical scrolling, so use fullscreen for a long scrollable inspector. [Claude design guidance](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines).

Treat a UI URI as a cache key and change it for breaking asset changes. Attach the UI only where useful: rendering on every read tool can cause repeated remounts. Keep a selected entry tool and intentional detail/render tools, with data tools reusable by the bridge. [OpenAI UI guidance](https://developers.openai.com/plugins/build/chatgpt-ui).

## Host support and useful extensions

| Surface | Base tools | Standard MCP Apps | Additional integration |
| --- | --- | --- | --- |
| Claude web, Desktop, mobile, Cowork | Remote HTTPS connector | Supported | Claude connector listing; user/admin tool controls |
| Claude Code | Plugin MCP server, OAuth, skills | **Text only**, per current quickstart | `.claude-plugin/plugin.json`, `.mcp.json`, skills and marketplace |
| ChatGPT Work and compatible ChatGPT surfaces | Remote HTTPS MCP plugin | Supported | OpenAI global/thread UI entrypoints; supported surfaces vary |
| Codex | Plugin skills/MCP tools | Depends on surface | Portable Agent Plugins package, local marketplace, per-tool approvals |
| Other MCP clients | Legacy/current protocol depending on client | Only when host advertises support | Keep usable text/structured fallback |

Claude's interactive connectors use the connector's existing permissions and sandboxed iframes. They are available across its listed app surfaces; individual rendering tools can be disabled independently by admins. This does not prove behavior of any particular deployed Durabull integration. [Claude interactive connectors](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude).

OpenAI's useful additions for Durabull are sidebar/global and conversation/thread entrypoints. Add `_meta['openai/ui'].entrypoints = [{type:'global'}, {type:'thread'}]` to an opener that accepts **`{}`**. Give it a descriptive title and monochrome SVG icon. These are additive metadata; other hosts ignore them. The extension support matrix refers to Work web and explicitly excludes classic ChatGPT; several file/composer features are desktop-only. [OpenAI extension specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md).

Declare supported display modes and capability-check UI interactions. The published OpenAI helper package's incompatible SDK peers do not prevent using the documented plain metadata contract with small local types. Standard Apps APIs cover refresh, tool calls, theme and context. [OpenAI TypeScript extension documentation](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md).

Do not add unrelated file viewers, commerce, sampling, or a second settings store merely to advertise features. Structured settings need persisted authenticated user settings. Composer search needs a real search contract. Long-running tasks/subscriptions require durable task/event semantics; short queue reads and one-shot mutations do not benefit automatically. These are implementation recommendations. OpenAI also documents onboarding, context sharing and rich forms, with plan/surface availability constraints. [OpenAI extensions overview](https://developers.openai.com/plugins/build/extensions).

## OAuth and authorization

Keep initial missing/invalid token responses at **401**, with a Bearer challenge pointing at protected-resource metadata. For valid tokens missing permissions, use **403**, `error="insufficient_scope"`, the complete scope set required by the operation, and `resource_metadata`. Include an actionable safe `error_description`. Scope accumulation is the client's job; return all requirements together. Do not advertise scope elevation for tenant/RBAC denial that more OAuth scopes cannot fix. [Current authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

OpenAI requires per-tool `securitySchemes` declarations; `_meta.securitySchemes` is a compatibility mirror. If implementing tool-level account linking, return `_meta['mcp/www_authenticate']` in the tool error as well as the required metadata. OAuth must preserve `resource`, enforce audience/expiry/scope, use PKCE S256, and expose discovery. Advertise issuer-response support only when every auth response actually includes the exact `iss`. OpenAI uses either its stable callback or a connection-specific callback; use the management page's exact value. UserInfo with verified email and enabled `openid`/`email` is needed for workspace domain restrictions. [OpenAI authentication](https://developers.openai.com/plugins/build/auth).

Claude requires 401 to initiate sign-in and uses the first authorization server listed. CIMD requires both `client_id_metadata_document_supported: true` and public-client `none` token authentication. DCR remains a compatible fallback but creates more clients. Hosted Claude uses `https://claude.ai/api/mcp/auth_callback`; Claude Code uses localhost/127.0.0.1 `/callback` with varying ports. Discovery/registration/token endpoints have a 10-second budget; refresh has 30 seconds. [Claude authentication](https://claude.com/docs/connectors/building/authentication).

## Maintainable plugin packages

Author one canonical plugin source with shared provider-neutral skills, then generate or validate platform overlays. Suggested layout:

```text
plugins/durabull/
  plugin.json                  # Portable Agent Plugins identity
  mcp.json                     # Portable MCP connection
  .claude-plugin/plugin.json   # Claude compatibility identity
  .mcp.json                    # Claude connection shape
  skills/setup/SKILL.md
  skills/queue-triage/SKILL.md
  skills/job-recovery/SKILL.md
  assets/
```

Portable `plugin.json` uses `$schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, stable `name`, and optional version/description/author/homepage/repository/license/keywords. Unknown top-level fields are rejected by its schema. Put provider extensions under reverse-domain keys. [Portable manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json).

Portable `mcp.json` uses `$schema: https://agent-plugins.org/schemas/1.0.0/mcp.schema.json` and `mcpServers.durabull = { type: 'streamable-http', url: actualEndpoint }`. Claude's `.mcp.json` uses its own `type: 'http'` connection spelling; do not simply rename the same JSON file. [Portable MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json), [Claude MCP configuration](https://code.claude.com/docs/en/mcp).

Claude loads `.claude-plugin/plugin.json`, root `skills/`, and root `.mcp.json`. Declared component paths must begin `./` and stay in the package. Avoid duplicate skill declarations and do not put the components inside `.claude-plugin/`. Validate with `claude plugin validate` and test with `--plugin-dir`. [Claude manifest reference](https://code.claude.com/docs/en/plugins-reference).

OpenAI-specific `extensions.com.openai` can hold `interface` presentation and `onboardingSkill: './skills/setup/SKILL.md'`. Root identity and components remain canonical. `.codex-plugin/plugin.json` is a compatibility fallback, not required for new portable packages. Local marketplaces can live in `.agents/plugins/marketplace.json`; their source paths resolve from the repository root. Public-directory packages must not depend on lifecycle hooks. [OpenAI packaging](https://developers.openai.com/plugins/build/plugins).

Do not invent a `plugin_asdk_app...` ID or ship a fake `.app.json` mapping. Public MCP submission accepts the actual endpoint and associated skills. OpenAI does not expand Claude `user_config`; generate endpoint configuration for self-hosted installations or use real hosted settings. Claude directory approval does not transfer to OpenAI. [Claude-to-OpenAI submission guide](https://developers.openai.com/plugins/guides/submit-claude-plugin).

Skills should encode discover → inspect → diagnose → authorized mutation → verify, not duplicate backend policy. State required user inputs, disambiguation rules, named tools, output evidence, and failure handling. Keep secrets and volatile connection IDs out of the package. Skill `agents/openai.yaml` can declare the actual MCP dependency; server-side skill import is a submission snapshot, not runtime retrieval. [OpenAI skills guide](https://developers.openai.com/plugins/build/skills).

## Release proof and remaining external steps

Local verification should cover modern pinned and legacy clients, discovery/list/read/call/prompts, header mismatches, Origin rejection, unauthenticated discovery challenges, scope elevation, tenant isolation, sanitized structured output, UI HTML/MIME/CSP metadata, and stateless concurrency. A browser harness should verify actual bridge initialization, first-result rendering, dark/mobile layouts, refresh/pagination, failures, cancellation, and write confirmation/duplicate prevention. Validate manifest schemas and package path containment. This checklist follows identified integration risks, not a claim that those tests already passed.

Real account flows remain necessary: fresh OAuth authorization, scope elevation, refresh/reconnect, expired/revoked token, wrong audience, multiple tenants, and all UI entrypoints in actual Claude and ChatGPT. Host SDK mocks cannot establish product approval or precise production rendering.

OpenAI review needs a public production endpoint, verified publisher/domain, suitable test account, accurate tool annotations and UI CSP, and actual review/publish steps. Its published tool metadata is versioned and rescanned; preserve compatibility while changed definitions are being reviewed. [OpenAI review requirements](https://developers.openai.com/plugins/deploy/app-review).

Claude separately accepts a remote connector and a plugin; submit both when shipping both. Its portal requires HTTPS, working authentication, tool titles/annotations, documentation, support/privacy details and populated reviewer credentials. MCP App listings need 3–5 PNG screenshots at least 1000px wide, with prompts provided separately. A generated local package is not a directory listing. [Claude connector submission](https://claude.com/docs/connectors/building/submission).

## Repository findings at research start

- `packages/mcp/package.json` used SDK `^1.29.0` and `@hono/mcp ^0.3.0`.
- `transport/session-registry.ts` retained up to 256 in-memory server/transport sessions and required `Mcp-Session-Id` after initialization.
- `routes.ts` had CORS and Host validation, but the Host middleware did not validate Origin.
- Existing tools already had typed schemas, structured/text responses, redaction, safety annotations and centralized registration: extend that boundary instead of duplicating it.
- `apps/api/src/mcp/policy/mcp-policy-middleware.ts` emitted generic 403 JSON-RPC policy errors for missing scopes without an OAuth step-up header.
- Policy parsing rejected unknown resource URIs: the new `ui://` resource must be recognized explicitly without bypassing scope/tenant enforcement for other resources.
- Better Auth's provider was configured in `packages/auth/src/index.ts`; do not advertise CIMD, RFC 9207, or UserInfo behaviors until its actual configured implementation is tested.
- `MCP_AUTHORIZE_QUERY_KEYS` omitted `id_token_hint`; preserving it is relevant if the provider supports OpenAI reauthorization login continuity.

These findings describe files inspected before implementation, not a final review of concurrent changes.
