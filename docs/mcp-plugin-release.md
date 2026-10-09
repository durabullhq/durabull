# Durabull plugin 1.1.0 release record

Prepared October 7, 2026. This record describes repository validation, not a production deployment or public marketplace approval.

## Privacy policy remediation — October 9, 2026

The marketplace review rejected the policy for incomplete disclosure of data uses. The
`/privacy` page now covers collection and purposes, current MCP inputs and outputs, client and
service-provider recipients, storage-specific retention, cookies and both analytics streams,
OAuth permissions and revocation, and access/correction/export/deletion requests. It explicitly
distinguishes pseudonymous MCP analytics from identified browser analytics and describes the
current lack of automatic audit expiry and a production telemetry opt-out.

The manifest already points to `https://durabull.io/privacy`; that URL is unchanged. Use
[the privacy data inventory and resubmission checklist](mcp-privacy-data-inventory.md) to review
the implementation evidence, confirm provider-managed retention, and verify the deployed
policy before resubmitting. Local policy changes do not establish production publication or
marketplace approval.

## Customer experience

The portable OpenAI package and generated Claude package use the same nine skills and Cloud endpoint. Listing copy names BullMQ, Redis, queue management, background jobs, workers, failures, cron schedules and monitoring in the context of actual capabilities. The manifest includes privacy/terms links and labeled fixture screenshots. No ranking or customer acquisition outcome is promised.

| Customer task | Skill | MCP capability |
| --- | --- | --- |
| Connect and select an environment | setup | Transport check, visible connections, scopes and capabilities |
| Review environments | fleet-health | Connection overview, paginated queues, workers, metrics and incidents |
| Diagnose a backlog | queue-triage | Queue states, workers, throughput, waiting children and failure evidence |
| Find or inspect a job | inspect-job | Cross-queue exact ID search, filtered lists, payload/result, logs, stacktraces and failure explanation |
| Understand recurring work | schedules | Cron/interval, timezone, next run, bounds, iterations and failures |
| Investigate Redis pressure | redis-health | Memory/capacity, CPU, fragmentation, clients, evictions, rejected connections and history coverage |
| Triage and manage incidents | alert-triage | Events, deliveries, rules, summaries, acknowledgement, resolution, snooze and unsnooze |
| Recover specific work | job-recovery | State-guarded retry or promotion with a read afterward |
| Control processing | queue-control | Pause/resume with observed state and worker availability |

Catalog checks require every MCP tool to appear in a skill and every scenario's expected tools to exist in that skill and the server catalog. The server metadata resource now includes tool, resource and prompt descriptions. Existing MCP prompts were corrected to report partial evidence and avoid treating blocked Redis clients or transient errors as proof of a particular cause or a safe retry.

The MCP App now has dedicated schedule, incident, delivery, alert-rule, job-search and operation-result views. Connection navigation exposes schedules and incidents; job lists filter by state. Redis inspection presents all current metrics and collection coverage alongside the existing memory chart. Table values remain accessible, and untrusted data is rendered as text. Writes go through assistant requests, not direct app tool calls.

## Setup rate-limit repair

A deterministic Hono reproduction showed both `/mcp` and `/mcp/*` registering the same limiter, rejecting request 61 despite a nominal 120-request allowance. Single registration rejected request 121. The fix removes the redundant route and guards against accidental duplicate middleware execution.

Fixed windows were replaced for MCP by continuously refilled token buckets. Setup/discovery, ordinary reads, diagnostics and writes have independent authenticated budgets. Work budgets are keyed by validated user plus OAuth client (or service-account client), persist across token refresh, and remain bounded per process. Rejections report the next-token delay, not a hardcoded minute. See [operating limits](mcp-operations-runbook.md#agent-workflow-rate-limits).

Tests cover a setup/discovery burst, a 50-job log investigation, setup after diagnostic exhaustion, independent users/clients, refreshed tokens, mutation limits, burst refill, duplicate registration, repeated denied requests, clock rollback and bounded storage eviction. These are local reproductions; production logs and the user's actual installed host have not been inspected.

## Validation

- `bun run mcp:check`: catalog, plugin schemas, all-skill tool coverage, generated file freshness, protocol interoperability, tenant authorization, output redaction, preview fixtures and rate-limit tests.
- `bun run --cwd packages/mcp typecheck` and `bun run --cwd apps/api typecheck`: passed.
- `bun run --cwd apps/api build`: passed with the bundled MCP App.
- `bun run --cwd apps/docs typecheck`: passed, including generated documentation/search inputs.
- `claude plugin validate plugins/durabull` and `claude plugin validate .claude-plugin/marketplace.json`: passed.
- Visible Chromium with the real MCP Apps SDK bridge and schema-checked fake data: schedules, incident/rule drill-down, notification failures, job search including Enter, requested acknowledgement/snooze/retry, Redis health, 320/390px widths, dark mode, permission denial and exact-read retry passed. App calls included no direct mutation. Fixture screenshots are included in the package.

`plugins/durabull/evals.json` provides 20 workflow prompts and 8 boundary cases. Catalog validation of those files is automated. Model routing quality and real-host execution of those scenarios remain to be evaluated; a matching tool name is not a behavioral evaluation.

## Distribution and host review

Use the portable package ZIP for all nine skills. OpenAI's documented MCP skill-import path accepts at most five skills, so this server does not advertise the draft skills extension. Skill MCP dependencies are generated for Cloud and self-hosted packages. See [OpenAI skill packaging](https://developers.openai.com/plugins/build/skills) and [MCP skill import limits](https://developers.openai.com/plugins/build/mcp-server#import-skills-from-the-mcp-server).

The package uses the current root manifest and OpenAI presentation extension, with generated Claude compatibility files. The repository marketplace is an installation source, not a public directory listing. See [OpenAI packaging](https://developers.openai.com/plugins/build/plugins) and [Claude plugin manifest reference](https://code.claude.com/docs/en/plugins-reference).

Remaining publisher/deployment work:

The October 7 public-submission audit corrected the OpenAI subtitle to fit 30 characters, reduced starter prompts to three, and added the HTTPS support URL and composer icon. Package/schema validation is not a public-directory approval. The ZIP was rebuilt after these corrections. The current two fixture screenshots are insufficient for Claude's MCP App carousel, which requires 3–5 PNGs at least 1000px wide, cropped to the app response, with prompt text supplied separately. Reviewer credentials, live-host evidence and an accessible demo recording remain to be supplied.

OpenAI submission starts at https://platform.openai.com/plugins with the package ZIP. Claude submissions start at https://claude.ai/directory/manage: submit the Cloud endpoint as an MCP connector and the GitHub repository `durabullhq/durabull`, plugin path `plugins/durabull`, as a Plugin bundle. Commit and push the completed package before repository validation. Both Claude submissions should belong to the same publisher organization. See the current [Claude plugin submission guide](https://claude.com/docs/plugins/submit) and [directory publisher requirements](https://claude.com/docs/directory/publish).

1. Deploy the API changes to the intended environment. A new skill ZIP alone does not change the installed server's rate limiter or app UI.
2. Refresh the MCP connection and verify setup in the actual installed ChatGPT plugin. Complete fresh OAuth, expiry/reconnect, denied access and requested write-scope elevation in ChatGPT and Claude using a disposable test workspace.
3. Run the behavioral scenarios, including partial scans, stale metrics and uncertain write delivery. Verify inline/fullscreen and platform entrypoints on supported host versions.
4. Confirm public publisher identity, support contact, unique widget origin, policies, a review account and any registered OpenAI app mapping. Never invent a `plugin_asdk_app...` identifier. Replace fixture screenshots with approved real-host captures if required by review.
5. Submit through each publisher account. Claude remote connector review and plugin review are distinct, and neither implies OpenAI approval. See [Claude connector submission](https://claude.com/docs/connectors/building/submission) and [OpenAI submission](https://developers.openai.com/plugins/deploy/submission).
