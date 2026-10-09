# Plugin privacy data inventory

Reviewed October 9, 2026. Public policy: `https://durabull.io/privacy`, authored in
[`apps/docs/app/privacy/page.tsx`](../apps/docs/app/privacy/page.tsx). The plugin manifest already
uses this URL. This inventory records implementation evidence and deployment checks; it is
not a claim that the revised policy is live or that marketplace approval is guaranteed.

OpenAI's [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) require a
published policy describing personal-data categories, purposes, recipients, retention, and user
controls. The [review requirements](https://developers.openai.com/plugins/deploy/app-review)
also identify undisclosed user-related tool outputs as a rejection reason.

## Current inputs and outputs

The canonical tool schemas are in
[`tool-catalog.ts`](../packages/mcp/src/tools/tool-catalog.ts). Resources and prompts use the same
authorized operational data. Recheck these catalogs whenever tools change.

| Tool family | Inputs | Data returned or changed |
| --- | --- | --- |
| `ping`, connection inventory and overview | No arguments, pagination, or connection ID | Service capabilities; authorized connection names, environments, prefixes, organization identity, queue and incident summaries |
| Queue inventory, detail, and metrics | Connection ID, queue name, pagination, time window | Queue names, counts, states, throughput, timing and worker/scheduler counts |
| Job list, search, detail, and failure explanation | Connection ID, queue name, job ID, status/name filters, pagination | IDs, names, states, options, payloads, progress, return values, attempts, timestamps, failure reasons and failure evidence |
| Job logs and stack traces | Connection ID, queue name, job ID, pagination | Worker-provided log lines and stack-trace text |
| Workers | Connection ID, optional queue name, pagination | Worker IDs, names, network addresses, age, idle time and queue association |
| Schedulers | Connection ID, queue name, scheduler ID, pagination | Job names, cron/interval, timezone, bounds, next run, counts, template payload and options |
| Redis health | Connection ID and time window | Memory, CPU, fragmentation, clients, evictions, errors, capacity and historical samples |
| Alert events, rules, and summaries | Connection ID, optional queue/job/status filters, event/rule IDs, pagination | Rule names and configuration, incident context, acknowledgements and timing, delivery status/errors, external issue links; rule outputs include routing targets, webhook URLs and destination/team/project IDs |
| Retry, promote, pause, resume | Connection ID, queue name, job ID where applicable | Update existing Redis records; workers may process the existing job payload; return operation/state results |
| Resolve, acknowledge, unacknowledge, snooze, unsnooze | Connection ID, event/rule ID, snooze minutes where applicable | Update incident/rule state and return operation results; existing integrations may synchronize incident changes |

Results reach the invoking MCP client and its provider, including OpenAI for ChatGPT/Codex.
[`register-tools.ts`](../packages/mcp/src/tools/register-tools.ts) also attaches sanitized arguments
to interactive view metadata. The application does not request full conversation history.
[`sanitize-output.ts`](../packages/mcp/src/safety/sanitize-output.ts) removes known secret keys
and credential patterns and bounds output; it does not guarantee removal of all personal data.
[`mcp-sanitize.ts`](../apps/api/src/mcp/tools/mcp-sanitize.ts) projects alert routing and delivery
data differently: rule routing can contain targets; delivery summaries omit their target.

## Other collected data and recipients

| Processing | Implementation evidence | Disclosure |
| --- | --- | --- |
| Accounts, organizations, credentials, sessions, OAuth clients/consent/tokens | `packages/auth/src/index.ts`; `packages/dal/src/db/schemas/{user,auth,organization,oauth-mcp,mcp-policy,redis-connection}/schema.ts` | Names, emails, profiles, roles, provider accounts, credentials, IP/user agent and permissions; identity and access management; Google/GitHub when chosen |
| MCP authorization audit | `apps/api/src/mcp/audit/mcp-audit.ts`; `apps/api/src/mcp/policy/mcp-policy-middleware.ts` | Timestamp, raw principal/org/connection IDs, correlation ID, operation/scopes, decision and SHA-256 input hash; no durable raw argument/result archive |
| Sanitized product/MCP analytics | `packages/analytics/src/sanitizer.ts`; `packages/analytics/src/server/{capture,identifiers}.ts`; `apps/api/src/mcp/observability/` | Usage/outcomes/times/durations and permitted client metadata; hashed identities and organization groups remain pseudonymous; configured PostHog or signed self-hosted forwarding to Cloud |
| Browser PostHog stream | `packages/analytics/src/client.ts`; `apps/web/src/routes/__root.tsx`; `apps/docs/src/components/posthog-provider.tsx` | Separate from sanitized telemetry: user name/email/ID/profile and organization identity, URLs/interactions, cookies/local storage and exception diagnostics; provider-controlled features may include replay |
| Website Google Analytics | `apps/docs/src/components/google-analytics.tsx`; `apps/docs/app/layout.tsx` | Production only with configured measurement ID; browser analytics sent to Google |
| Notifications and issue integrations | `apps/api/src/lib/alert-notifier.ts`; `apps/api/src/lib/alert-webhook-payload.ts`; `packages/email/` | Configured recipients, Resend, webhook operators and Linear receive email/incident/issue data |
| Infrastructure, support and backups | Deployment/provider configuration and support process | Recipient categories disclosed; provider retention and processing locations require operational verification, not inference from code |

The sanitized stream's exclusions must never be presented as exclusions from browser analytics,
the application database, hosting logs, support communications, or authorized tool results.
Production sanitized telemetry has no product-level opt-out. Self-hosted forwarding requires
the configured signing secret. An optional PostHog project does not disable the sanitized stream.

## Retention evidence

| Data | Current behavior | Evidence |
| --- | --- | --- |
| Account, organization and connection settings | Persist until removed; no age-based expiry | DAL schemas and deletion routes |
| Login sessions | 7-day expiry, renewal with use; 5-minute cookie cache. Expiry is not necessarily physical deletion | `packages/auth/src/index.ts` |
| OAuth tokens and consent | Stored token expiry; consent/client records persist until removed | OAuth schema and auth configuration |
| Original jobs, logs, results and schedules | Customer's Redis/BullMQ retention; MCP reads do not create a separate durable result archive | MCP handlers; customer BullMQ configuration |
| Redis health history | Default 30 days, configurable 1–30; periodic bounded cleanup | `apps/api/src/lib/redis-health-history.ts`; `redis-health-cleanup.ts` |
| Non-firing alert events and deliveries | Eligible after 90 days from `firedAt`; pending Linear sync exceptions up to 365 days; open incidents retained; cleanup periodic | `apps/api/src/lib/alert-monitor.ts`; `packages/dal/src/repositories/alert-event.ts`; alert-delivery cascade schema |
| Completed Linear resolution deduplication | Eligible after 365 days | Alert monitor and Linear issue resolution repository |
| MCP audit | No automatic expiry or account-deletion cascade | `packages/dal/src/db/schemas/mcp-policy/schema.ts`; MCP policy repository |
| Analytics, hosting logs, support, backups | No maximum enforced by application; operator/provider-managed expiry or manual deletion | Provider settings and support process must be confirmed |
| Client/provider copies | Controlled by receiving service; disconnect does not delete history | Recipient settings |

Do not replace these behaviors with invented fixed deletion deadlines. Cleanup windows are
eligibility thresholds, not guaranteed exact erasure times. If Cloud has established provider
retention periods, publish those specific periods after confirming them and their exceptions.

## Local validation

- Production docs static export and the bundled UI catalog build passed, including Next.js
  type validation. The separate docs typecheck also passed.
- Biome and `git diff --check` passed. React Doctor reported 100/100 with no findings for the
  changed docs page.
- The exported HTML contains all nine policy sections, matching contents links, eight retention
  categories, the revision date, and named recipients without executing JavaScript. The
  manifest's privacy URL matches the public policy URL.
- Browser inspection at 390px verified contents navigation and the retention table; the page
  and table fit the viewport without horizontal overflow.
- A live fetch of `https://durabull.io/privacy` on October 9, 2026 still showed the previous beta
  summary. Production publication remains a separate deployment step.

## Resubmission checks

- Confirm the Cloud hosting/storage/support providers, processing locations, analytics and
  replay settings, log and backup retention, and the operational process for verified privacy
  requests. Update the public policy if configured retention is more specific than the
  application behavior above.
- Deploy the docs site containing this change through the normal release process. Check
  `https://durabull.io/privacy` without signing in, including on mobile and with JavaScript
  disabled. Confirm the October 9, 2026 date and all nine policy sections appear.
- Verify the public manifest/submission still uses that exact HTTPS privacy URL, and that the
  consent and setup permissions remain consistent with the disclosed read/write behavior.
- In the submission release notes, describe the expanded policy: data categories and purposes,
  current tool inputs/outputs, OpenAI and other recipients, retention and its exceptions, and
  user controls. Submit only after the public page reflects the reviewed production behavior.

Suggested review note after publication:

> We expanded the privacy policy at https://durabull.io/privacy to disclose account and OAuth
> data, current BullMQ/Redis tool inputs and outputs, job content and alert routing, usage and
> browser analytics, recipients including OpenAI and configured providers, storage-specific
> retention, and access, revocation, correction, export, and deletion controls.
