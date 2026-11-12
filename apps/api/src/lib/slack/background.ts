const pending = new Set<Promise<unknown>>()

/**
 * Runs work after the HTTP response is sent. Slack expects an acknowledgement
 * within three seconds, so command, interaction and event handlers reply first
 * and finish (Redis calls, message updates) in the background. The API is a
 * long-running server, so the promise outlives the request.
 */
export function runInBackground(label: string, work: () => Promise<unknown>): void {
  const promise = Promise.resolve()
    .then(work)
    .catch((error) => {
      console.error(`[slack] ${label} failed:`, error)
    })
    .finally(() => {
      pending.delete(promise)
    })
  pending.add(promise)
}

/** Test helper: waits for background work started so far. */
export async function flushSlackBackgroundWork(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending])
  }
}
