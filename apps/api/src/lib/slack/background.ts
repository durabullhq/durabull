const pending = new Set<Promise<unknown>>()

/**
 * Runs work after the HTTP response is sent. Slack expects an acknowledgement
 * within three seconds, so command, interaction and event handlers reply first
 * and finish (Redis calls, message updates) in the background. The API is a
 * long-running server, so the promise outlives the request.
 */
export function runInBackground(label: string, work: () => Promise<unknown>): void {
  track(label, work)
}

function track(label: string, work: () => Promise<unknown>): Promise<void> {
  const promise: Promise<void> = Promise.resolve()
    .then(work)
    .then(
      () => undefined,
      (error) => {
        console.error(`[slack] ${label} failed:`, error)
      }
    )
    .finally(() => {
      pending.delete(promise)
    })
  pending.add(promise)
  return promise
}

/** Time left for the work itself within Slack's three-second acknowledgement window. */
const INLINE_BUDGET_MS = 2_500

/**
 * Starts the work and waits for it up to the inline budget, so a typical
 * action is applied before Slack receives its acknowledgement. Work that runs
 * longer keeps going in the background instead of making Slack time out.
 */
export async function finishOrContinueInBackground(
  label: string,
  work: () => Promise<unknown>,
  budgetMs = INLINE_BUDGET_MS
): Promise<void> {
  const tracked = track(label, work)
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    tracked,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, budgetMs)
    }),
  ])
  clearTimeout(timer)
}

/** Test helper: waits for background work started so far. */
export async function flushSlackBackgroundWork(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending])
  }
}
