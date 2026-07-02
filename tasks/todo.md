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
- Hook is now a thin retry controller: snapshot log count -> POST retry -> enable `useJob` + `useJobLogTail` with React Query `refetchInterval`. The dialog derives terminal/running/delayed state from the actual BullMQ job status.
- Page sync uses the canonical job/log query keys and invalidates job, logs, list, and queue summaries on terminal/close. No `setInterval`, manual polling fetches, or duplicated status phase enum remain.
- Added an offset guard so a replayed log-tail response cannot append duplicate lines; final terminal state triggers one last log-tail refetch to catch logs emitted between ticks.
- Safety review: retry UI/hook diffs add no `remove`, `delete`, `clean`, `drain`, `discard`, `$delete`, `removeJob`, or `clearLogs` calls. The only mutation remains the existing `useRetryJobs` POST, and the backend retry route still only calls `job.retry()` / `job.retry('completed')`.
- Verified: web `tsc` clean; focused retry lint clean; 21 focused retry unit tests pass. API touched file lint clean; api `tsc` is still blocked by pre-existing `src/mcp/tools/shared.test.ts` error.
- E2E: rewrote the retry test but the local env cannot run it — `GET /api/connections` 500s with "Failed to decrypt Redis connection URL" (stale seeded connection encrypted with a different `DURABULL_REDIS_URL_ENCRYPTION_KEY`); fails identically on a clean tree. Baseline "settings page loads" E2E passes. Needs CI (fresh seed) to validate.
