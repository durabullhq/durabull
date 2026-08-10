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

## Editable Job Payload (Data tab + Retry modal)

### Agreed design
- Job payload becomes editable from two places: the job detail Data tab, and a new review step in the retry modal.
- Data tab: "Edit Payload" opens a dialog with `JsonEditor` prefilled with `job.data`. Saving requires typing the job ID, matching `purge-queue-dialog.tsx`.
- Retry modal no longer fires the retry on open. It opens in a review step with the payload editor (collapsed by default, prefilled). Editing it turns the primary button destructive and requires an explicit acknowledgement before the retry runs.
- API updates the payload with `job.updateData()`. Editing an `active` job is rejected: the worker already holds the old payload, so the write would silently do nothing.

### Tasks
- [x] API: `POST /:queueName/jobs/:jobId/data` with `{ data }`, 404 for missing job, 409 for active job
- [x] API: dedicated `POST /:queueName/jobs/:jobId/retry` with optional `{ data }`; `updateData` then `retry()`
- [x] API tests for both paths (13 passing, incl. null payload, missing/non-failed jobs, and failed-rewrite-skips-retry)
- [x] Analytics: `DialogType.EDIT_JOB_DATA`, `AnalyticsEvents.JOB_DATA_UPDATED` *(web agent)*
- [x] Web: `useUpdateJobData` and dedicated `useRetryJob` hooks; bulk `useRetryJobs` remains data-agnostic
- [x] Web: shared `JobPayloadEditor` (editor + danger copy + dirty state) used by both flows *(web agent)*
- [x] Web: `EditJobDataDialog` with typed-job-ID confirm, wired into the Data tab *(web agent)*
- [x] Web: retry modal review step; `use-job-retry-dialog` no longer auto-retries on open
- [x] Update existing retry unit tests for the review step
- [x] Verify: typecheck, web unit tests, api tests, biome
- [x] Verify both flows in a real browser against seeded Redis

### Review
- `RetryJobRequestState` gains `REVIEW`. `openDialog()` opens into it and no longer fires the retry; `runRetry(data?)` uses the dedicated single-job route. `backToReview()` bumps the same `retryRunIdRef` guard `setOpen(false)` uses, so a late-resolving run cannot push the dialog back into `WATCHING`.
- Bulk retry no longer knows about payload replacement. Single-job overwrite-and-retry is a natural `/:jobId/retry` resource, with explicit 404/409 responses.
- `Retry Again` / `Try Again` now return to the review step instead of firing immediately, so a failed attempt can be edited before the next one.
- Verification: web 259/259 unit tests + clean `tsc`; 13/13 focused API mutation tests; full API 280 pass / 3 telemetry-config failures and one MCP test type error, both reproduced before the remediation changes; biome clean; production API/web builds pass.
- Reverted a biome mass-reformat of `apps/web/e2e/pages.spec.ts` (344 lines of quote/semicolon churn). `apps/web` lint/format scripts are scoped to `./src`, so `e2e/` is deliberately outside biome and every sibling spec uses double quotes with semicolons. The spec diff is now 6 lines.
- Browser verification against seeded Redis, both flows. Gating behaved exactly as intended: save stayed disabled while untouched, while dirty-but-unconfirmed, and on a wrong confirmation string, unlocking only on the exact job ID. The retry primary morphed from `Retry Job` to a destructive `Overwrite Payload & Retry`, stayed disabled until acknowledged, and re-locked on invalid JSON. A real submit persisted the edited payload to Redis and left the job `waiting`; Cancel left an untouched job `failed` with its original data.
- Reworded the retry acknowledgement to `I understand, overwrite the stored payload and retry with it.` Seeing it rendered showed "cannot be undone" twice within three lines, once in the callout and again in the checkbox.
- `bunx playwright test -g "failed job retry"` passes. It first failed on `GET /api/connections` 500, which reproduced on an untouched test in the same file: local runs need `DURABULL_REDIS_URL_ENCRYPTION_KEY` from the root `.env` exported, otherwise the playwright config falls back to its built-in E2E key and cannot decrypt seeded connections.
- Thermo-nuclear remediation: `jobs.ts` is 919 lines (down from 962 on main and 1091 in the first implementation) through `getQueueFromContext` plus focused job mutation routes. `RetryJobDialog` is 144 lines, with review and progress isolated into explicit components. The standalone edit form mounts fresh while open, eliminating prop-to-state synchronization effects. Payload comparison moved to `lib/job-payload.ts`, so component files only export components and Fast Refresh stays safe.
- React Doctor has no errors. Two warnings flag intentional initial form snapshots whose owners remount on open or payload-content change; regression tests cover both ownership boundaries. The third warning points at the pre-existing job-view analytics effect in the 1,360-line route file.

### Notes
- Analytics reuses the existing job property shape (`queue_name` / `job_id` / `success`); no new interface.
- `useUpdateJobData` posts via `api.c[':connectionId'].queues[':queueName'].jobs[':jobId'].data.$post`. `@durabull/api-client` derives types live from the API source, so no codegen step was needed.
- `useRetryJobs` is unchanged for bulk callers; `useRetryJob` owns the single-job endpoint.
- `EditJobDataDialog` is mocked in `job-detail-remove.test.tsx` so the page-level remove tests keep using stubbed dialogs.
- Formatting no longer causes a file-size regression: the queue-context helper removes repeated connection plumbing and leaves `jobs.ts` 43 lines smaller than main.

## Queue Failed Count Navigation Badge

- [x] Add compact count formatting for failed queue totals.
- [x] Wire the Platform > Queues nav item to connection-wide failed job totals.
- [x] Verify formatting examples and type safety.

### Review

- Desktop and mobile Platform navigation now show `Queues (n)` when the selected connection has failed jobs, using connection-wide `totalJobCounts.failed`.
- Compact formatting matches the requested examples: `5`, `30`, `350`, `1.5k`, `10k`.
- Verification: focused `utils` unit test passed, web typecheck passed, web lint exited 0 with unrelated existing warnings.
