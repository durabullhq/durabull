# MCP v2 migration review

Reviewed against `cdc4518` (current `origin/main` at review start). The migration was moved off the unrelated alert-recovery branch and rebased onto main; PR #151's changes are not included. Review scope: `git diff cdc4518...HEAD` plus the subsequent review fixes.

Spec source: the user's request for current MCP v2 support, cross-host app extensions, a polished Claude/ChatGPT UI, maintainable plugin packages and thorough verification. Supporting technical research is in [research.md](./research.md).

## Standards

An independent reviewer checked AGENTS.md, CONTRIBUTING.md, ADR-0001 and the skill's code-smell baseline.

- **P1 — Mutation-result Refresh called the write tool again. Fixed.** The app bridge now rejects every catalog mutation and unknown tool before contacting a host. Refresh maps mutation results to the corresponding entity read. This enforces ADR-0001's separation between UI reads and assistant-requested writes independently of host visibility hints.
- **P2 — Historical snapshots displayed a newer fetch timestamp. Fixed.** Each view retains its own timestamp, which Back navigation restores with that snapshot.
- **P2 — Distribution assets contradicted the generated-file policy. Fixed.** CONTRIBUTING now records a narrow exception for the committed MCP app bundle and generated Claude compatibility manifests. It requires regeneration and freshness checks; preview screenshots and logs remain local.
- **Nonblocking heuristic — Generic renderer data types. Retained.** Renderers defensively consume `Record<string, unknown>` at the host boundary instead of a comprehensive discriminated view union. The reviewer found no concrete schema mismatch. A full renderer type redesign is outside this corrective review; the server still validates tool output against the catalog schemas.

Re-review confirmed all three substantive findings resolved, with no new substantive findings.

## Spec

A separate reviewer checked implementation behavior against the original user request and current primary platform documentation.

- **P1 — Mutation-result Refresh violated the promised read-only UI boundary. Fixed** as described above.
- **P2 — Failed navigation retried the previous successful view. Fixed.** A dedicated Retry request action preserves the failed read's name, arguments and history behavior.
- **P2 — Generic 403 responses incorrectly instructed OAuth reconnection. Fixed.** Structured `insufficient_scope` errors request scope elevation; `policy_denied` and generic forbidden responses direct users to connection or service-account policy administration. Reconnecting cannot repair tenant access.

The reviewer withdrew an initial suspicion about missing OpenAI tool-result authentication metadata. OpenAI's [authentication guide](https://developers.openai.com/plugins/build/auth#echo-the-resource-parameter-throughout-the-oauth-flow) supports `WWW-Authenticate` reauthorization for this authenticated transport. The implementation preserves standard HTTP 403 challenges. Optional tool-result linking is a distinct, unimplemented flow and is documented accordingly.

Re-review confirmed all three findings resolved, with no new actionable defects.

## Additional protocol review

- **P2 — Cached parse failures changed JSON-RPC error semantics. Fixed.** The API middleware uses a null parsed-body cache for malformed JSON. Passing that sentinel to the SDK returned `-32600` instead of parse error `-32700`. The route now lets the SDK parse the untouched request when the cache is null. Regression coverage distinguishes malformed JSON from a valid JSON `null` request.
- **P2 — A trailing slash in APP_BASE_URL rejected the deployment's browser Origin. Fixed.** The mount now derives the CORS/Origin allowlist from the parsed URL origin. A regression covers `http://localhost:3000/` configuration with browser Origin `http://localhost:3000`.

## Verification

- New unit regressions reject every write/unknown browser call, refresh every mutation through a read, preserve read pagination/cancellation and distinguish access errors.
- Real browser checks using the official AppBridge verified mutation-result Refresh only called `get_job`, historical timestamps survived navigation, tenant denials showed administrator guidance, and Retry targeted the failed Alerts request.
- Earlier browser checks covered initial result delivery without duplicate fetch, dark/mobile layouts, keyboard focus, pagination, filtering, hostile HTML-like data and duplicate message prevention.
- Repository lint, formatting, typechecks and full build passed. Both Claude manifests validated. MCP-specific checks cover 171 passing tests (86 package/plugin and 85 API MCP).
- The plain full API run had **353 passes and 3 failures** in existing `app.test.ts` production-mode fixtures, before the final Origin test was added. Those fixtures omit their required authless token and analytics bootstrap. Their code and the failing startup guard are unchanged from main; the fixture corrections already exist in separate PR #151 and are intentionally excluded from this migration. Supplying a global token is insufficient because those fixtures also need analytics bootstrap and other MCP fixtures expect their own default bearer. No production guard was relaxed to satisfy a test.

Live Claude/ChatGPT OAuth, directory review and public deployment remain release validation steps, not locally certified behavior.

Summary: Standards — 3 substantive findings fixed, 1 nonblocking heuristic retained; Spec — 3 findings fixed; additional protocol review — 2 findings fixed. The highest-severity finding in each axis was P1 and is resolved.

## Follow-up review fixes

A fresh two-axis review of `cdc4518...a01fb49` found two additional P2 issues, now corrected:

- **Standards — missing successful app-resource audit events.** The static shell now invokes the same request-context audit hook as other resources, with `resource:queue_explorer`, its exact URI, and success classification. Protocol tests require exactly one event in legacy, auto-negotiated, and pinned-current modes.
- **Spec — unsampled Redis history looked like low memory use.** The chart now respects `sampleCount` and nullable metrics, preserves time gaps, distinguishes a measured zero, reports measured/returned bucket coverage, and independently shows disabled collection. A bounded history model has regression cases for empty buckets, mixed missing/zero/valid data, and older measurements outside the displayed window. Real AppBridge browser checks verify the disabled/no-data state and mixed chart gaps.

Local verification: 177 MCP/package/plugin/API tests pass, plus repository lint, formatting, typecheck, and build. The generated app was rebuilt and passed the freshness check. This does not replace the live staging/Claude/ChatGPT release checks in `docs/mcp-apps-and-plugins.md`.
