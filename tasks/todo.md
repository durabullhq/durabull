# Retry Job Modal: live status + streaming logs

## Agreed design (grill-me session)
- Modal polls job status + logs every 1s until terminal (`completed`/`failed`); `delayed` shows backoff countdown and keeps polling.
- After 60s non-terminal, show a "still running, safe to close" notice but keep polling.
- Logs shown are only lines appended after the retry started (snapshot the BullMQ log count before POSTing the retry).
- Modal closable at any time; job continues server-side.
- Distinct failure states: retry POST failure (error + Try Again) vs job re-failed (logs + failedReason + Retry Again).
- Job detail page kept in sync via shared React Query job/log hooks + invalidation on close/terminal.
- API: add `start` offset mode to `GET .../jobs/:jobId/logs` (BullMQ `getJobLogs(start, end)` native).
- Scope: single-job modal only; bulk retry dialog untouched.

## Tasks
- [x] API: `start` query param on logs endpoint (offset tail mode)
- [x] Web: rework `use-job-retry-dialog.ts` around canonical React Query polling (`useJob` + `useJobLogTail`) instead of custom timers
- [x] Web: remove redundant retry phase enum; derive running/delayed/success/failed from the actual BullMQ job status
- [x] Web: rework `retry-job-dialog.tsx` (log stream pane w/ auto-scroll, delayed countdown via RetryCountdown, closable, status-derived footer)
- [x] Route: render dialog independent of `job.status === 'failed'` so it survives status flips; keep page in sync
- [x] Rewrite unit tests around request state + polled job status, including log-tail replay guard and no destructive retry side effects
- [x] Extend E2E: modal shows live phase + log stream pane, closable mid-run
- [x] Verify: typecheck, unit tests (E2E blocked locally, see review)

## Review

- 46 files touched, all presentation-layer only (classNames, CSS tokens, fonts, manifest).
  No business logic, routing, or data-flow changes.
- New token system in `styles.css`: `--color-status-*` palette (success, active, warning,
  danger, delayed, priority, neutral), chart palette, `--color-signal` accent, `eyebrow`
  utility. Light + dark both rebuilt around graphite/paper neutrals.
- Geist Sans (UI) + Geist Mono (data) self-hosted in `public/fonts`, preloaded in
  `index.html`; mono + `tabular-nums` applied to all counts, IDs, keys, timestamps.
- Unified StatCard treatment everywhere: neutral card, colored hairline top accent,
  eyebrow title, mono semibold value.
- Page headers consolidated to one technical treatment (icon tile + title), rainbow
  gradients removed; nav gained an emerald "signal rail" active indicator.
- Verification: `bun run build` clean; biome format applied to touched files; browser
  screenshots verified in light and dark across dashboard, queue detail, job detail,
  workers, analytics, alerts, scheduled jobs, KV explorer, and settings.
- Pre-existing (not introduced): 4 unit test failures in `settings.test.tsx` and
  `connection-alerts-workspace.test.tsx` from incomplete `use-alerts` mocks — confirmed
  failing on baseline with changes stashed.

## Incidents Table shadcn Redesign

- [x] Rework `AlertEventsTable` rows into compact single-line layout: status badge, rule name, queue link, truncated summary, delivery, relative fired time.
- [x] Replace stacked Details/Acknowledge/Resolve buttons with a `⋯` dropdown row-actions menu (matches `queue-table.tsx` pattern); row click keeps opening details.
- [x] Show absolute fired timestamp via tooltip; relative time in the cell.
- [x] Update `alert-events-table.test.tsx` for the new action menu.
- [x] Verify: focused tests + typecheck.

### Review

- Rows went from ~110px (three stacked buttons) to a single ~40px line; summary truncates with a title tooltip, fired time is relative ("19m ago") with an absolute-timestamp tooltip.
- Row actions consolidated into a hover-revealed `⋯` dropdown (View details / Acknowledge / Resolve), same pattern as `queue-table.tsx`; the trigger swaps to a spinner while a mutation is in flight.
- Verification: 22 tests across the three alert test files pass, `tsc --noEmit` clean, biome clean on changed files; verified live in browser (menu opens, Acknowledge mutation works, ack'd row shows provenance subline).

### Code-review remediation

- [x] Touch reachability: `⋯` trigger stays visible on coarse pointers (`pointer-coarse:opacity-100`); hover-reveal kept for mouse users.
- [x] Keyboard a11y: fired-time tooltip trigger is now a real button, so Tab focus reveals the absolute timestamp.
- [x] Restored the `Resolved {time}` subline on resolved rows (was silently dropped in the redesign).
- [x] Rule column now shows from `md` (was `lg`), so the org feed keeps rule/type info alongside Delivery/Fired.
- [x] Data clump: `AlertEventRow`'s five action props bundled into one `IncidentRowActions` object.
- [x] Primitive obsession/duplication: `getSuppressedCount()` helper in `alert-event-helpers.ts`, used by table + details dialog (kept out of `alert-primitives.tsx` for Fast Refresh).
- [x] Removed all three duplicated `dropdown-menu` test mocks; tests now drive the real Radix menu (jsdom `ResizeObserver`/`scrollIntoView` stubs added to `src/test/setup.ts`), including menu open, item visibility per status, the click-propagation guard, and dialog open from the menu.
- [x] Verify: full web suite 238/238 passing, `tsc --noEmit` clean, biome clean on changed files (14 pre-existing errors elsewhere confirmed on baseline via stash).

## Queue Failed Count Navigation Badge

- [x] Add compact count formatting for failed queue totals.
- [x] Wire the Platform > Queues nav item to connection-wide failed job totals.
- [x] Verify formatting examples and type safety.

### Review

- Desktop and mobile Platform navigation now show `Queues (n)` when the selected connection has failed jobs, using connection-wide `totalJobCounts.failed`.
- Compact formatting matches the requested examples: `5`, `30`, `350`, `1.5k`, `10k`.
- Verification: focused `utils` unit test passed, web typecheck passed, web lint exited 0 with unrelated existing warnings.
